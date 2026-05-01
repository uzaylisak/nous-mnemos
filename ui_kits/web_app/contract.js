// NousRecord contract integration — ABI, ethers helpers, read/write wrappers.
// Loads before Components.jsx so everything downstream can `useNousRecord()`.
//
// Deployment address is picked up in this order:
//   1. localStorage.mnemos_contract_addr   (user override in Settings)
//   2. nousRecordDeployment.json           (written by contracts/scripts/deploy.js)
//   3. null                                (contract not configured → UI shows empty state)

const BASE_SEPOLIA_CHAIN_ID = 84532;
const DEFAULT_RPC = 'https://sepolia.base.org';

// ---------------------------------------------------------------------------
// ABI — kept in sync with src/NousRecord.sol. When you change the contract,
// re-run the deploy script and it will overwrite nousRecordDeployment.json;
// this inline ABI is the fallback for the UI before any deployment exists.
// ---------------------------------------------------------------------------
const NOUS_RECORD_ABI = [
  // ownership
  'function owner() view returns (address)',
  'function transferOwnership(address newOwner)',
  'event OwnerTransferred(address indexed previousOwner, address indexed newOwner)',

  // attesters
  'function trustedAttesters(address) view returns (bool)',
  'function addAttester(address a)',
  'function revokeAttester(address a)',
  'event AttesterAdded(address indexed attester)',
  'event AttesterRevoked(address indexed attester)',

  // records
  'function totalRecords() view returns (uint256)',
  'function getRecord(uint256 id) view returns (tuple(address author, bytes32 conversationId, string model, bytes32 promptHash, bytes32 responseHash, bytes32 plaintextHash, bytes32 ciphertextHash, string arweaveCid, address attester, bytes attesterSig, uint64 sealedAt))',
  'function recordIdsOf(address author) view returns (uint256[])',
  'function recordIdsIn(bytes32 conversationId) view returns (uint256[])',
  'function recordsPage(uint256 offset, uint256 limit) view returns (tuple(address author, bytes32 conversationId, string model, bytes32 promptHash, bytes32 responseHash, bytes32 plaintextHash, bytes32 ciphertextHash, string arweaveCid, address attester, bytes attesterSig, uint64 sealedAt)[])',
  'function recordDigest(address author, bytes32 conversationId, string model, bytes32 promptHash, bytes32 responseHash, bytes32 plaintextHash, bytes32 ciphertextHash, string arweaveCid) view returns (bytes32)',
  'function seal(bytes32 conversationId, string model, bytes32 promptHash, bytes32 responseHash, bytes32 plaintextHash, bytes32 ciphertextHash, string arweaveCid, bytes attesterSig) returns (uint256)',
  'event RecordSealed(uint256 indexed id, address indexed author, bytes32 indexed conversationId, string model, bytes32 promptHash, bytes32 responseHash, bytes32 plaintextHash, bytes32 ciphertextHash, string arweaveCid, address attester, bytes attesterSig, uint64 sealedAt)',
];

// Parse an on-chain Record tuple into a plain object the UI can consume.
const parseRecord = (raw, id) => ({
  id: typeof id === 'bigint' ? Number(id) : id,
  author:         raw.author,
  conversationId: raw.conversationId,
  model:          raw.model,
  promptHash:     raw.promptHash,
  responseHash:   raw.responseHash,
  plaintextHash:  raw.plaintextHash,
  ciphertextHash: raw.ciphertextHash,
  arweaveCid:     raw.arweaveCid,
  attester:       raw.attester,
  attesterSig:    raw.attesterSig,
  sealedAt:       Number(raw.sealedAt),
});

// ---------------------------------------------------------------------------
// Deployment lookup
// ---------------------------------------------------------------------------
let _deployment = null;
let _deploymentPromise = null;

const loadDeployment = async () => {
  if (_deployment) return _deployment;
  if (_deploymentPromise) return _deploymentPromise;
  _deploymentPromise = (async () => {
    try {
      const res = await fetch('nousRecordDeployment.json', { cache: 'no-store' });
      if (!res.ok) return null;
      const json = await res.json();
      _deployment = json;
      return json;
    } catch { return null; }
  })();
  return _deploymentPromise;
};

const getContractAddress = async () => {
  const override = localStorage.getItem('mnemos_contract_addr');
  if (override && /^0x[0-9a-fA-F]{40}$/.test(override)) return override;
  const dep = await loadDeployment();
  return dep?.address || null;
};

const getRpcUrl = () => {
  try {
    const custom = JSON.parse(localStorage.getItem('mnemos_rpc_url') || '""');
    if (typeof custom === 'string' && custom.trim()) return custom;
  } catch {}
  return DEFAULT_RPC;
};

// ---------------------------------------------------------------------------
// Ethers provider/contract factories
// ---------------------------------------------------------------------------
const getReadProvider = () => {
  if (!window.ethers) throw new Error('ethers.js not loaded');
  return new window.ethers.JsonRpcProvider(getRpcUrl(), {
    name: 'base-sepolia', chainId: BASE_SEPOLIA_CHAIN_ID,
  });
};

const getReadContract = async () => {
  const addr = await getContractAddress();
  if (!addr) return null;
  return new window.ethers.Contract(addr, NOUS_RECORD_ABI, getReadProvider());
};

const getWriteContract = async () => {
  if (!window.ethereum) throw new Error('No wallet provider');
  const addr = await getContractAddress();
  if (!addr) throw new Error('Contract address not configured');
  const provider = new window.ethers.BrowserProvider(window.ethereum);
  const signer   = await provider.getSigner();
  return new window.ethers.Contract(addr, NOUS_RECORD_ABI, signer);
};

// ---------------------------------------------------------------------------
// High-level helpers used by pages
// ---------------------------------------------------------------------------
const fetchLatestRecords = async (limit = 12) => {
  const c = await getReadContract();
  if (!c) return [];
  const total = Number(await c.totalRecords());
  if (total === 0) return [];
  const offset = Math.max(0, total - limit);
  const rawPage = await c.recordsPage(offset, limit);
  // Return newest first, tag with real ids
  return rawPage.map((raw, i) => parseRecord(raw, offset + i)).reverse();
};

const fetchRecordsByAuthor = async (author) => {
  const c = await getReadContract();
  if (!c) return [];
  const ids = await c.recordIdsOf(author);
  const records = await Promise.all(
    ids.map(async (id) => parseRecord(await c.getRecord(id), id))
  );
  return records.sort((a, b) => b.sealedAt - a.sealedAt);
};

const fetchRecord = async (id) => {
  const c = await getReadContract();
  if (!c) return null;
  try {
    const raw = await c.getRecord(id);
    return parseRecord(raw, id);
  } catch { return null; }
};

const fetchOwner = async () => {
  const c = await getReadContract();
  if (!c) return null;
  try { return (await c.owner()).toLowerCase(); } catch { return null; }
};

const fetchAttestersFromEvents = async () => {
  // Reconstruct the active attester set by scanning Added/Revoked events.
  const c = await getReadContract();
  if (!c) return [];
  try {
    const addedFilter   = c.filters.AttesterAdded();
    const revokedFilter = c.filters.AttesterRevoked();
    const [added, revoked] = await Promise.all([
      c.queryFilter(addedFilter, 0, 'latest'),
      c.queryFilter(revokedFilter, 0, 'latest'),
    ]);
    const state = new Map(); // addr -> { status, addedBlock }
    for (const e of added) {
      state.set(e.args.attester.toLowerCase(), {
        address: e.args.attester,
        status:  'Active',
        addedBlock: e.blockNumber,
      });
    }
    for (const e of revoked) {
      const addr = e.args.attester.toLowerCase();
      if (state.has(addr)) state.get(addr).status = 'Revoked';
    }
    // Enrich: get signed-count via logs (how many RecordSealed events attested by each)
    const sealed = await c.queryFilter(c.filters.RecordSealed(), 0, 'latest');
    const signedBy = new Map();
    for (const e of sealed) {
      const a = e.args.attester.toLowerCase();
      signedBy.set(a, (signedBy.get(a) || 0) + 1);
    }
    return [...state.values()].map(a => ({
      ...a,
      signed: signedBy.get(a.address.toLowerCase()) || 0,
    }));
  } catch (err) {
    console.warn('fetchAttestersFromEvents failed', err);
    return [];
  }
};

const computeRecordDigest = async (params) => {
  const c = await getReadContract();
  if (!c) throw new Error('Contract not configured');
  return c.recordDigest(
    params.author, params.conversationId, params.model,
    params.promptHash, params.responseHash, params.plaintextHash, params.ciphertextHash,
    params.arweaveCid
  );
};

// Write helpers — each returns a tx receipt on success.
const addAttester = async (address) => {
  const c = await getWriteContract();
  const tx = await c.addAttester(address);
  return tx.wait();
};
const revokeAttester = async (address) => {
  const c = await getWriteContract();
  const tx = await c.revokeAttester(address);
  return tx.wait();
};
const sealRecord = async (params) => {
  const c = await getWriteContract();
  const tx = await c.seal(
    params.conversationId, params.model,
    params.promptHash, params.responseHash, params.plaintextHash, params.ciphertextHash,
    params.arweaveCid, params.attesterSig
  );
  const rc = await tx.wait();
  // Decode RecordSealed to return the new record id
  const iface = new window.ethers.Interface(NOUS_RECORD_ABI);
  for (const log of rc.logs) {
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === 'RecordSealed') return { txHash: rc.hash, id: Number(parsed.args.id) };
    } catch {}
  }
  return { txHash: rc.hash, id: null };
};

// ---------------------------------------------------------------------------
// Export to window
// ---------------------------------------------------------------------------
// Synchronous accessor that returns whatever address has already been
// resolved (deployment file or localStorage override). Returns null if
// loadDeployment() hasn't run yet — callers using this must tolerate null
// (e.g. for cosmetic links). Async getContractAddress() is the source of
// truth for code that actually needs the address.
const contractAddressSync = () => {
  const override = localStorage.getItem('mnemos_contract_addr');
  if (override && /^0x[0-9a-fA-F]{40}$/.test(override)) return override;
  return _deployment?.address || null;
};

window.NousContract = {
  BASE_SEPOLIA_CHAIN_ID,
  DEFAULT_RPC,
  NOUS_RECORD_ABI,
  parseRecord,
  loadDeployment,
  getContractAddress,
  contractAddressSync,
  getRpcUrl,
  getReadProvider,
  getReadContract,
  getWriteContract,
  fetchLatestRecords,
  fetchRecordsByAuthor,
  fetchRecord,
  fetchOwner,
  fetchAttestersFromEvents,
  computeRecordDigest,
  addAttester,
  revokeAttester,
  sealRecord,
};
