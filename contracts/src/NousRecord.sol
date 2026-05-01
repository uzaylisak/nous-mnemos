// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title  NousRecord
 * @notice Immutable, permissionless registry for AI conversations recorded through
 *         Nous Mnemos. Each record anchors a ciphertext (stored on Arweave) with
 *         cryptographic hashes of its plaintext parts and a signature from a
 *         trusted attester that vouched the response came from the Nous API.
 *
 *         Design notes (intentionally minimal):
 *         - No upgrades. No pausing. No admin over records themselves.
 *         - Attester signatures travel on the record (on-chain storage + event),
 *           so every record is independently verifiable forever.
 *         - Only the contract owner can add or revoke attesters. That's the
 *           single trusted role; everything else is user-controlled.
 *         - `plaintextHash` and `ciphertextHash` are separate: the first proves
 *           what the user/AI actually said, the second proves what's on Arweave.
 *         - `conversationId` groups related records (multi-turn threads) without
 *           exposing them to each other — it's just an index.
 *
 *         The attester signs an EIP-191 personal_sign digest of the full record
 *         envelope, keyed to this contract + chain so signatures can't be
 *         replayed across deployments or networks.
 */
contract NousRecord {
    // ------------------------------------------------------------------
    // Ownership & attester registry
    // ------------------------------------------------------------------

    address public owner;
    mapping(address => bool) public trustedAttesters;

    event OwnerTransferred(address indexed previousOwner, address indexed newOwner);
    event AttesterAdded(address indexed attester);
    event AttesterRevoked(address indexed attester);

    error NotOwner();
    error ZeroAddress();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor() {
        owner = msg.sender;
        emit OwnerTransferred(address(0), msg.sender);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert ZeroAddress();
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    function addAttester(address a) external onlyOwner {
        if (a == address(0)) revert ZeroAddress();
        trustedAttesters[a] = true;
        emit AttesterAdded(a);
    }

    function revokeAttester(address a) external onlyOwner {
        trustedAttesters[a] = false;
        emit AttesterRevoked(a);
    }

    // ------------------------------------------------------------------
    // Records
    // ------------------------------------------------------------------

    struct Record {
        address author;          // msg.sender of seal()
        bytes32 conversationId;  // groups multi-turn threads
        string  model;           // model id, e.g. "Hermes-3-Llama-3.1-70B"
        bytes32 promptHash;      // keccak256(prompt plaintext)
        bytes32 responseHash;    // keccak256(response plaintext)
        bytes32 plaintextHash;   // keccak256 of canonical (prompt||response)
        bytes32 ciphertextHash;  // keccak256 of the ciphertext uploaded to Arweave
        string  arweaveCid;      // ar://<id> or 43-char Arweave tx id
        address attester;        // recovered signer at seal time
        bytes   attesterSig;     // 65-byte secp256k1 signature over the digest
        uint64  sealedAt;        // block.timestamp
    }

    Record[] private _records;
    mapping(bytes32 => uint256[]) private _byConversation;
    mapping(address => uint256[]) private _byAuthor;

    event RecordSealed(
        uint256 indexed id,
        address indexed author,
        bytes32 indexed conversationId,
        string  model,
        bytes32 promptHash,
        bytes32 responseHash,
        bytes32 plaintextHash,
        bytes32 ciphertextHash,
        string  arweaveCid,
        address attester,
        bytes   attesterSig,
        uint64  sealedAt
    );

    error EmptyCid();
    error InvalidSignature();
    error UntrustedAttester(address recovered);

    /**
     * @notice Publish a new record. Anyone may call; the supplied attester
     *         signature must recover to an address in `trustedAttesters`.
     *
     * @dev    The signed digest binds: contract address, chain id, author,
     *         conversationId, model, all four hashes, and the Arweave CID.
     *         This prevents cross-contract and cross-chain replay.
     */
    function seal(
        bytes32 conversationId,
        string calldata model,
        bytes32 promptHash,
        bytes32 responseHash,
        bytes32 plaintextHash,
        bytes32 ciphertextHash,
        string calldata arweaveCid,
        bytes  calldata attesterSig
    ) external returns (uint256 id) {
        if (bytes(arweaveCid).length == 0) revert EmptyCid();

        bytes32 digest = recordDigest(
            msg.sender,
            conversationId,
            model,
            promptHash,
            responseHash,
            plaintextHash,
            ciphertextHash,
            arweaveCid
        );

        // EIP-191 personal_sign envelope — matches what eth_sign / ethers
        // signMessage() / viem's signMessage() produce by default.
        bytes32 ethSigned = keccak256(
            abi.encodePacked("\x19Ethereum Signed Message:\n32", digest)
        );

        address recovered = _recover(ethSigned, attesterSig);
        if (recovered == address(0)) revert InvalidSignature();
        // Self-attestation: the author may sign their own record without being
        // in the trustedAttesters registry. External attesters still need to
        // be registered via addAttester() by the owner.
        if (recovered != msg.sender && !trustedAttesters[recovered]) revert UntrustedAttester(recovered);

        id = _records.length;
        _records.push(Record({
            author:         msg.sender,
            conversationId: conversationId,
            model:          model,
            promptHash:     promptHash,
            responseHash:   responseHash,
            plaintextHash:  plaintextHash,
            ciphertextHash: ciphertextHash,
            arweaveCid:     arweaveCid,
            attester:       recovered,
            attesterSig:    attesterSig,
            sealedAt:       uint64(block.timestamp)
        }));
        _byConversation[conversationId].push(id);
        _byAuthor[msg.sender].push(id);

        emit RecordSealed(
            id, msg.sender, conversationId, model,
            promptHash, responseHash, plaintextHash, ciphertextHash,
            arweaveCid, recovered, attesterSig, uint64(block.timestamp)
        );
    }

    // ------------------------------------------------------------------
    // Views
    // ------------------------------------------------------------------

    function totalRecords() external view returns (uint256) {
        return _records.length;
    }

    function getRecord(uint256 id) external view returns (Record memory) {
        return _records[id];
    }

    function recordIdsOf(address author) external view returns (uint256[] memory) {
        return _byAuthor[author];
    }

    function recordIdsIn(bytes32 conversationId) external view returns (uint256[] memory) {
        return _byConversation[conversationId];
    }

    /// @notice Slice the global record log — useful for paginated UI feeds.
    function recordsPage(uint256 offset, uint256 limit)
        external
        view
        returns (Record[] memory page)
    {
        uint256 total = _records.length;
        if (offset >= total) return new Record[](0);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new Record[](end - offset);
        for (uint256 i = 0; i < page.length; i++) {
            page[i] = _records[offset + i];
        }
    }

    /**
     * @notice Expose the exact digest the attester must sign. Callers can use
     *         this off-chain to reproduce the hash without guessing encoding.
     */
    function recordDigest(
        address author,
        bytes32 conversationId,
        string calldata model,
        bytes32 promptHash,
        bytes32 responseHash,
        bytes32 plaintextHash,
        bytes32 ciphertextHash,
        string calldata arweaveCid
    ) public view returns (bytes32) {
        return keccak256(abi.encode(
            address(this),
            block.chainid,
            author,
            conversationId,
            keccak256(bytes(model)),
            promptHash,
            responseHash,
            plaintextHash,
            ciphertextHash,
            keccak256(bytes(arweaveCid))
        ));
    }

    // ------------------------------------------------------------------
    // Internal
    // ------------------------------------------------------------------

    /// @dev Recover address from a 65-byte r||s||v signature. Includes the
    ///      EIP-2 upper-s rejection to block malleable signatures.
    function _recover(bytes32 hash, bytes calldata sig) internal pure returns (address) {
        if (sig.length != 65) return address(0);

        bytes32 r;
        bytes32 s;
        uint8   v;
        assembly {
            r := calldataload(sig.offset)
            s := calldataload(add(sig.offset, 32))
            v := byte(0, calldataload(add(sig.offset, 64)))
        }
        if (v < 27) v += 27;
        if (v != 27 && v != 28) return address(0);
        // EIP-2: reject s > secp256k1n / 2 to prevent signature malleability
        if (uint256(s) > 0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0) {
            return address(0);
        }
        return ecrecover(hash, v, r, s);
    }
}
