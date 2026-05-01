# NousRecord contracts

Immutable on-chain registry for Nous Mnemos AI conversation records. Deployed
to Base Sepolia for the MVP.

## Layout

    src/NousRecord.sol      # the contract
    test/NousRecord.test.js # Hardhat tests
    scripts/deploy.js       # deploy + writes address/ABI into the web app
    scripts/addAttester.js  # owner-only: register an attester
    scripts/revokeAttester.js

## Install

    cd contracts
    npm install
    cp .env.example .env
    # fill DEPLOYER_PRIVATE_KEY (testnet-only!) and BASESCAN_API_KEY if you want verify

## Test

    npm test

## Deploy to Base Sepolia

    npm run deploy:base-sepolia

The script writes two files:

- `deployments/baseSepolia.json` — canonical deployment record (address, abi, chainId, owner)
- `../ui_kits/web_app/nousRecordDeployment.json` — the web app loads this at runtime

After deploying, put the address into `.env` as `NOUS_RECORD_ADDRESS` so the
attester management scripts can read it.

## Manage attesters

Set `ATTESTER_ADDRESS` in `.env`, then:

    npm run attester:add
    # or
    npm run attester:revoke

## Verify on BaseScan

    npx hardhat verify --network baseSepolia <CONTRACT_ADDRESS>

## Digest used by attesters

The attester signs an EIP-191 `personal_sign` of the keccak256 of:

    abi.encode(
      contract address,
      chain id,
      author address,
      conversationId,
      keccak256(model string),
      promptHash,
      responseHash,
      plaintextHash,
      ciphertextHash,
      keccak256(arweave cid string)
    )

Expose `recordDigest(...)` on-chain to reproduce the hash offline — clients
never need to guess encoding.
