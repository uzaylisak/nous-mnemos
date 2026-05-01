// Nous Mnemos — client-side record pipeline.
//
// This is the glue between the UI, the wallet, the storage layer, and the
// contract. Each helper is a small, testable unit.
//
// Loaded before Chat.jsx; exposes `window.NousPipeline`.
//
// Attestation model: SELF-ATTESTATION.
//   The user's wallet signs the record digest directly — no external attester
//   service is required for sealing. The attester backend is only used for
//   LLM inference (chat / streaming) and API key testing.
//
// ---------------------------------------------------------------------------
// Hash conventions — MUST match NousRecord.sol
//   promptHash     = keccak256(canonicalMessages(userTurns))
//   responseHash   = keccak256(canonicalMessages(assistantTurns))
//   plaintextHash  = keccak256(abi.encodePacked(promptHash, responseHash))
//   ciphertextHash = keccak256(rawCiphertextBytes)
// ---------------------------------------------------------------------------

// ---- Storage keys for user-configurable endpoints -------------------------
const LS_ATTESTER_URL = 'mnemos_attester_url';
const LS_STORAGE_MODE = 'mnemos_storage_mode';   // kept for legacy reads only
const LS_STORAGE_URL  = 'mnemos_storage_url';
const LS_API_KEY      = 'mnemos_api_key';        // user's Nous API key (BYO-key)

// ---- Local-only per-record metadata (titles, hidden flag) ----------------
// On-chain rows are immutable, so anything mutable lives client-side. Keys
// are namespaced by lowercase wallet address so two users on the same
// browser see independent metadata.
//   mnemos_meta:<addr> = { [recordId]: { title?: string, hidden?: bool } }
//   mnemos_personas:<addr> = [{ id, name, prompt }]
const LS_META_PREFIX     = 'mnemos_meta:';
const LS_PERSONAS_PREFIX = 'mnemos_personas:';

// Optional backend proxy URL — only needed if the user explicitly configures
// one in Settings. Direct Nous API calls are the default; this fallback is
// never used unless a custom URL is saved in localStorage.
const DEFAULT_ATTESTER_URL = '';

const getAttesterUrl = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_ATTESTER_URL) || '""');
    if (typeof raw === 'string' && raw.trim()) return raw.replace(/\/+$/, '');
  } catch {}
  return DEFAULT_ATTESTER_URL;
};

// The user's LLM provider key. Stored in localStorage, sent to the attester
// only as an ephemeral request header — never persisted server-side.
const getApiKey = () => {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_API_KEY) || '""');
    return (typeof raw === 'string' && raw.trim()) ? raw.trim() : null;
  } catch { return null; }
};

// Storage mode is now always 'onchain' — ciphertext is hex-embedded in the
// CID string and lives permanently in the contract event calldata.
// Kept as a function so legacy code that calls getStorageMode() still compiles.
const getStorageMode = () => 'onchain';

// ---------------------------------------------------------------------------
// Hashing helpers (thin wrappers around ethers)
// ---------------------------------------------------------------------------
const utf8Bytes = (s) => window.ethers.toUtf8Bytes(String(s));
const keccak    = (bytesLike) => window.ethers.keccak256(bytesLike);

const promptHash    = (prompt)   => keccak(utf8Bytes(prompt));
const responseHash  = (response) => keccak(utf8Bytes(response));
const plaintextHash = (pHash, rHash) =>
  keccak(window.ethers.solidityPacked(['bytes32', 'bytes32'], [pHash, rHash]));
const bytesHash     = (bytes)    => keccak(bytes);

// ---- Multi-turn transcript helpers (must mirror digest.js byte-for-byte) --
// canonicalMessages() drops empty/whitespace turns and re-emits with stable
// {role, content} key order via JSON.stringify. Hashes done over the UTF-8
// bytes of that string. Identical input on both sides ⇒ identical hash.
const canonicalMessages = (messages) => {
  if (!Array.isArray(messages)) throw new Error('messages must be an array');
  const cleaned = messages
    .filter(m => m && typeof m.content === 'string' && m.content.trim() && typeof m.role === 'string')
    .map(m => ({ role: m.role, content: m.content }));
  return JSON.stringify(cleaned);
};
const transcriptUserHash = (messages) =>
  keccak(utf8Bytes(canonicalMessages((messages || []).filter(m => m && m.role === 'user'))));
const transcriptAssistantHash = (messages) =>
  keccak(utf8Bytes(canonicalMessages((messages || []).filter(m => m && m.role === 'assistant'))));

const newConversationId = () => {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return window.ethers.hexlify(buf);
};

// ---------------------------------------------------------------------------
// Wallet-derived encryption key
//
// The key is HKDF'd from a deterministic signature. Signing the same
// canonical message on the same wallet always yields the same 32-byte key,
// so the user can decrypt their records from any browser by re-signing.
// ---------------------------------------------------------------------------
const KEY_MESSAGE = 'Nous Mnemos — encryption key v1';

const deriveKey = async (signer) => {
  // A personal_sign over a fixed string is deterministic for the same key.
  const sig = await signer.signMessage(KEY_MESSAGE);
  const sigBytes = window.ethers.getBytes(sig);

  // HKDF-SHA256 → 32 bytes → AES-GCM key.
  const ikm  = await crypto.subtle.importKey('raw', sigBytes, 'HKDF', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    {
      name: 'HKDF',
      hash: 'SHA-256',
      salt: utf8Bytes('nous-mnemos-v1'),
      info: utf8Bytes('record-encryption'),
    },
    ikm,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
};

// ---------------------------------------------------------------------------
// Record envelope encrypt/decrypt
//
// Canonical plaintext JSON is what we AES-GCM. Storing a small header so
// future decoders know what they're looking at.
// ---------------------------------------------------------------------------
// v1 = single prompt/response, v2 = full message transcript. We always write
// v2 now; v1 stays decryptable for any records sealed before this refactor.
const ENVELOPE_VERSION_V1 = 1;
const ENVELOPE_VERSION_V2 = 2;
const ENVELOPE_VERSION    = ENVELOPE_VERSION_V2;

const encryptRecord = async ({ key, messages, model, conversationId }) => {
  if (!Array.isArray(messages)) throw new Error('encryptRecord: messages must be an array');
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);

  const plaintext = JSON.stringify({
    v: ENVELOPE_VERSION_V2,
    model,
    conversationId,
    messages,                 // [{role, content, ts?}, ...]
    sealedAt: Date.now(),
  });

  const ct = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    utf8Bytes(plaintext),
  ));

  // Final blob = [ 1-byte version | 12-byte IV | ciphertext+tag ]
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = ENVELOPE_VERSION_V2;
  out.set(iv, 1);
  out.set(ct, 13);

  return {
    ciphertext:     out,
    ciphertextHash: bytesHash(out),
  };
};

const decryptRecord = async ({ key, ciphertext }) => {
  const bytes = ciphertext instanceof Uint8Array
    ? ciphertext
    : new Uint8Array(ciphertext);
  const v = bytes[0];
  if (v !== ENVELOPE_VERSION_V1 && v !== ENVELOPE_VERSION_V2) {
    throw new Error(`Unknown envelope version: ${v}`);
  }
  const iv = bytes.slice(1, 13);
  const ct = bytes.slice(13);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  return JSON.parse(new TextDecoder().decode(plain));
};

// ---------------------------------------------------------------------------
// Storage — on-chain mode (no Arweave, no localStorage dependency).
//
// The ciphertext bytes are hex-encoded and embedded directly inside the CID
// string that gets written into the contract event. Format:
//
//   onchain:0x<hexCiphertext>
//
// This means:
//   • The encrypted conversation lives in the Base transaction's calldata
//     and in the Recorded event log — both permanent and retrievable from
//     any archive node, forever, with no external storage provider.
//   • Any device holding the right wallet key can decrypt the record just
//     by fetching the on-chain event — no localStorage, no Arweave gateway.
//   • Gas cost on Base Sepolia: negligible (testnet).
//     On mainnet Base: ~16 gas/byte → a 5KB conversation ≈ 0.001–0.005 ETH.
//
// Legacy 'inline:<hash>' CIDs (localStorage) and 'ar://<id>' CIDs (Arweave)
// remain readable for backward compatibility with old records.
// ---------------------------------------------------------------------------
const LS_INLINE_PREFIX = 'mnemos_inline_blob:';  // kept for legacy read-back

// Legacy helpers — kept so old inline:<hash> records can still be decrypted.
const stashInline = (cid, bytes) => {
  try {
    localStorage.setItem(LS_INLINE_PREFIX + cid, window.ethers.hexlify(bytes));
  } catch (err) {
    console.warn('inline cache write failed:', err);
  }
};
const loadInline = (cid) => {
  const hex = localStorage.getItem(LS_INLINE_PREFIX + cid);
  return hex ? window.ethers.getBytes(hex) : null;
};

// New path: encode ciphertext into the CID itself — no upload needed.
const uploadCiphertext = async (ciphertext) => {
  const hex = window.ethers.hexlify(ciphertext); // '0x...'
  const cid = 'onchain:' + hex;
  return { cid, mode: 'onchain' };
};

// ---------------------------------------------------------------------------
// Reverse path: extract ciphertext bytes from a CID.
//
//   onchain:0x<hex>  → decode hex directly (new default mode)
//   inline:<hash>    → legacy localStorage cache (backward compat)
//   ar://<id>        → Arweave gateway (backward compat for old records)
//   <bare 43-char>   → Arweave gateway (bare tx id, best-guess)
//
// Returns Uint8Array, throws on miss.
// ---------------------------------------------------------------------------
const fetchCiphertext = async (cid) => {
  if (typeof cid !== 'string' || !cid) throw new Error('fetchCiphertext: cid required');

  // ── New on-chain mode: data is embedded in the CID itself ──────────────
  if (cid.startsWith('onchain:')) {
    try {
      return window.ethers.getBytes(cid.slice('onchain:'.length));
    } catch (e) {
      throw new Error('Failed to decode on-chain ciphertext: ' + e.message);
    }
  }

  // ── Legacy inline mode (localStorage) ──────────────────────────────────
  if (cid.startsWith('inline:')) {
    const bytes = loadInline(cid);
    if (!bytes) {
      throw new Error(
        'Inline ciphertext not in this browser. This record was sealed with ' +
        'localStorage-only mode on a different device. The ciphertext cannot ' +
        'be recovered without the original device\'s export.',
      );
    }
    return bytes;
  }

  // ── Legacy Arweave (ar://<id> or bare 43-char tx id) ───────────────────
  const txId = cid.replace(/^ar:\/\//, '');
  if (/^[A-Za-z0-9_-]{43}$/.test(txId)) {
    const res = await fetch(`https://arweave.net/${txId}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`arweave fetch ${res.status}`);
    return new Uint8Array(await res.arrayBuffer());
  }

  throw new Error(`Unrecognised storage CID format: ${cid}`);
};

// ---------------------------------------------------------------------------
// Direct Nous API calls — no backend required.
//
// The inference API is called straight from the browser. The user's API key
// is sent as Authorization: Bearer, which is standard for OpenAI-compatible
// endpoints. No proxy needed.
// ---------------------------------------------------------------------------
const NOUS_API_BASE = 'https://inference-api.nousresearch.com/v1';

const _cleanMsgs = (msgs) =>
  (msgs || [])
    .filter(m => m && typeof m.role === 'string' && typeof m.content === 'string' && m.content.trim())
    .map(m => ({ role: m.role, content: m.content }));

// One-shot chat completion — returns full response JSON.
const callNous = async ({ model, messages, temperature, maxTokens, apiKey }) => {
  const key = apiKey || getApiKey();
  if (!key) throw new Error('No Nous API key — add one in Settings');
  const res = await fetch(`${NOUS_API_BASE}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages:    _cleanMsgs(messages),
      temperature: temperature ?? 0.7,
      max_tokens:  maxTokens   ?? 1024,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Nous API ${res.status}: ${text.slice(0, 400)}`);
  }
  const json = await res.json();
  return {
    response:      json.choices?.[0]?.message?.content || '',
    usage:         json.usage         || null,
    providerModel: json.model         || model,
  };
};

// Streaming chat — calls onToken(piece, fullSoFar) per SSE chunk.
const callNousStream = async ({ model, messages, temperature, maxTokens, apiKey, onToken, signal }) => {
  const key = apiKey || getApiKey();
  if (!key) throw new Error('No Nous API key — add one in Settings');
  const res = await fetch(`${NOUS_API_BASE}/chat/completions`, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({
      model,
      messages:    _cleanMsgs(messages),
      temperature: temperature ?? 0.7,
      max_tokens:  maxTokens   ?? 1024,
      stream:      true,
    }),
    signal,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Nous API ${res.status}: ${text.slice(0, 400)}`);
  }
  if (!res.body) throw new Error('Streaming not supported by this browser');

  const reader  = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '', full = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split('\n\n');
    buffer = frames.pop();
    for (const frame of frames) {
      const line = frame.split('\n').find(l => l.startsWith('data:'));
      if (!line) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') continue;
      try {
        const piece = JSON.parse(payload)?.choices?.[0]?.delta?.content;
        if (typeof piece === 'string' && piece.length) {
          full += piece;
          if (typeof onToken === 'function') onToken(piece, full);
        }
      } catch {}
    }
  }
  return { response: full };
};

// Test a key by making a minimal 4-token call (used by Settings).
const testKey = async ({ apiKey, model }) => {
  await callNous({
    model:       model || 'nousresearch/hermes-3-llama-3.1-70b',
    messages:    [{ role: 'user', content: 'ping' }],
    temperature: 0,
    maxTokens:   4,
    apiKey,
  });
  return { ok: true, provider: NOUS_API_BASE, model: model || 'nousresearch/hermes-3-llama-3.1-70b' };
};

// ---------------------------------------------------------------------------
// Legacy stubs — kept so any old code calling these doesn't hard-crash.
// None of these are used in the main flow anymore.
// ---------------------------------------------------------------------------
const attesterInfo      = async () => ({ attestation: 'self', note: 'No backend configured' });
const attesterGenerate  = async () => { throw new Error('attesterGenerate removed — use runChat'); };
const attesterTestKey   = async ({ apiKey, model }) => testKey({ apiKey, model });
const attesterChat      = async (args) => callNous(args);
const attesterChatStream= async (args) => callNousStream(args);
const attesterFinalize  = async () => { throw new Error('attesterFinalize removed — hashes computed client-side'); };
const attesterAttest    = async () => { throw new Error('attesterAttest removed — wallet signs client-side'); };

// ---------------------------------------------------------------------------
// High-level orchestrators — the Chat page calls these.
//
// runChat()              → one turn. Sends the full running message history,
//                          appends the LLM's reply, returns it. Commits
//                          nothing. Call as many times as the user wants.
// runSealConversation()  → finalize + encrypt + upload + attest + seal().
//                          Called once when the user ends the conversation.
//
// The split mirrors the UX: free-form chat first, single sealing event last.
// ---------------------------------------------------------------------------
const runChat = async ({ model, messages, temperature, maxTokens, apiKey, onToken, signal }) => {
  if (typeof onToken === 'function') {
    const res = await callNousStream({ model, messages, temperature, maxTokens, apiKey, onToken, signal });
    return { response: res.response, providerModel: null, usage: null };
  }
  return callNous({ model, messages, temperature, maxTokens, apiKey });
};

// Auto-title — calls runChat once with a tiny prompt to summarise the
// conversation in 4-7 words. Used by the chat page right after sealing,
// stored locally (mnemos_meta) so My Records / sidebar can show it.
const generateTitle = async ({ model, messages, apiKey }) => {
  const sample = messages
    .slice(0, 6)
    .map(m => `${m.role === 'user' ? 'U' : 'A'}: ${m.content.slice(0, 240)}`)
    .join('\n');
  const titleMsgs = [
    { role: 'system', content: 'You write short, specific conversation titles. 4-7 words. No quotes, no trailing punctuation, no emoji. Title-case is fine.' },
    { role: 'user',   content: `Title this conversation:\n\n${sample}` },
  ];
  try {
    const res = await callNous({ model, messages: titleMsgs, temperature: 0.3, maxTokens: 24, apiKey });
    return (res.response || '').replace(/^["'\s]+|["'\s.!?]+$/g, '').slice(0, 80);
  } catch {
    // Best-effort: fall back to first user line if title model 404s etc.
    const firstUser = messages.find(m => m.role === 'user')?.content || 'Untitled';
    return firstUser.split(/\s+/).slice(0, 8).join(' ').slice(0, 80);
  }
};

const runSealConversation = async ({
  author, model, messages, conversationId, signer, onStep,
}) => {
  const step = (name, extra) => { if (typeof onStep === 'function') onStep(name, extra); };
  const convId = conversationId || newConversationId();

  // ── 1. Compute hashes locally ────────────────────────────────────────────
  // No round-trip to the attester service needed — all hash functions are
  // already available client-side and mirror what the backend digest.js does.
  step('hash');
  const pHash  = transcriptUserHash(messages);      // keccak256(canonical user turns)
  const rHash  = transcriptAssistantHash(messages); // keccak256(canonical assistant turns)
  const ptHash = plaintextHash(pHash, rHash);       // keccak256(abi.encodePacked(pHash, rHash))

  // ── 2. Derive encryption key (first wallet signature) ───────────────────
  step('deriveKey');
  const key = await deriveKey(signer);

  // ── 3. Encrypt the full transcript ──────────────────────────────────────
  step('encrypt');
  const { ciphertext, ciphertextHash } = await encryptRecord({
    key,
    messages,
    model,
    conversationId: convId,
  });

  // ── 4. Embed ciphertext hex inside the CID string ───────────────────────
  step('embed', { bytes: ciphertext.byteLength });
  const { cid: arweaveCid } = await uploadCiphertext(ciphertext);

  // ── 5. Self-attest: user wallet signs the record digest ─────────────────
  // The attester IS the author — no external service required.
  // Any verifier can call ecrecover(digest, attesterSig) and confirm it
  // matches the author field in the RecordSealed event.
  step('attest');
  const digest = await window.NousContract.computeRecordDigest({
    author,
    conversationId: convId,
    model,
    promptHash:     pHash,
    responseHash:   rHash,
    plaintextHash:  ptHash,
    ciphertextHash,
    arweaveCid,
  });
  const attesterSig = await signer.signMessage(window.ethers.getBytes(digest));
  const attester    = author; // self-attestation: wallet signs its own record

  // ── 6. Seal on-chain ─────────────────────────────────────────────────────
  step('seal');
  const sealRes = await window.NousContract.sealRecord({
    conversationId: convId,
    model,
    promptHash:     pHash,
    responseHash:   rHash,
    plaintextHash:  ptHash,
    ciphertextHash,
    arweaveCid,
    attesterSig,
  });

  step('done', sealRes);
  return {
    ...sealRes,
    conversationId: convId,
    arweaveCid,
    ciphertextHash,
    attester,
    attesterSig,
    storageMode: 'onchain',
    turnCount:   messages.length,
  };
};

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// One-shot decrypt for My Records / Record Detail. Asks the wallet to sign,
// derives the key, fetches ciphertext (inline cache or arweave), decrypts.
// Returns the parsed envelope ({ v, model, conversationId, messages|prompt|response }).
// ---------------------------------------------------------------------------
const decryptByCid = async ({ signer, cid, expectedCiphertextHash }) => {
  const ciphertext = await fetchCiphertext(cid);
  if (expectedCiphertextHash) {
    const got = bytesHash(ciphertext);
    if (got.toLowerCase() !== expectedCiphertextHash.toLowerCase()) {
      throw new Error('Ciphertext hash mismatch — file at CID does not match the on-chain record');
    }
  }
  const key = await deriveKey(signer);
  return decryptRecord({ key, ciphertext });
};

// ---------------------------------------------------------------------------
// Local-only per-record metadata (titles, hidden flag).
// ---------------------------------------------------------------------------
const _metaKey = (addr) => LS_META_PREFIX + (addr || '').toLowerCase();
const loadMeta = (addr) => {
  if (!addr) return {};
  try { return JSON.parse(localStorage.getItem(_metaKey(addr)) || '{}') || {}; }
  catch { return {}; }
};
const saveMeta = (addr, obj) => {
  if (!addr) return;
  localStorage.setItem(_metaKey(addr), JSON.stringify(obj));
};
const setRecordMeta = (addr, recordId, patch) => {
  const all = loadMeta(addr);
  const cur = all[recordId] || {};
  all[recordId] = { ...cur, ...patch };
  // Clean up empty entries
  if (!all[recordId].title && !all[recordId].hidden) delete all[recordId];
  saveMeta(addr, all);
};
const getRecordMeta = (addr, recordId) => loadMeta(addr)[recordId] || {};
const setRecordTitle  = (addr, id, title) => setRecordMeta(addr, id, { title: title || undefined });
const hideRecord      = (addr, id)        => setRecordMeta(addr, id, { hidden: true });
const unhideRecord    = (addr, id)        => setRecordMeta(addr, id, { hidden: false });

// ---------------------------------------------------------------------------
// Personas (local, per-wallet). Each persona is { id, name, prompt }.
// Used as the leading system message on a chat session.
// ---------------------------------------------------------------------------
const _personasKey = (addr) => LS_PERSONAS_PREFIX + (addr || 'default').toLowerCase();
const DEFAULT_PERSONAS = [
  { id: 'none',       name: 'None',          prompt: '' },
  { id: 'researcher', name: 'Researcher',    prompt: 'You are a careful research assistant. Cite reasoning, flag uncertainty, prefer concise factual answers over speculation.' },
  { id: 'writer',     name: 'Writer',        prompt: 'You are a thoughtful writing collaborator. Match the user\'s voice, suggest concrete improvements, never inflate prose.' },
  { id: 'critic',     name: 'Critic',        prompt: 'You are a sharp, kind critic. Find the strongest version of the user\'s argument, then surface its weakest assumption.' },
  { id: 'coder',      name: 'Coder',         prompt: 'You are a senior software engineer. Read code carefully, prefer minimal diffs, explain trade-offs, never leave TODO stubs.' },
];
const loadPersonas = (addr) => {
  try {
    const raw = localStorage.getItem(_personasKey(addr));
    if (!raw) return DEFAULT_PERSONAS.slice();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) && arr.length ? arr : DEFAULT_PERSONAS.slice();
  } catch { return DEFAULT_PERSONAS.slice(); }
};
const savePersonas = (addr, list) => {
  localStorage.setItem(_personasKey(addr), JSON.stringify(list || []));
};

// ---------------------------------------------------------------------------
// Bulk export / import. The user gets a single JSON file containing all of
// their decrypted records + local metadata + personas, suitable for moving
// to another device or keeping a personal backup.
//
// IMPORTANT: this writes plaintext — the whole point is that the user has
// already authorised decryption and wants a portable copy. The file is NOT
// re-uploaded anywhere; it's a local download.
// ---------------------------------------------------------------------------
const exportAll = ({ address, records, decrypted }) => {
  const meta = loadMeta(address);
  const personas = loadPersonas(address);
  return {
    v: 1,
    exportedAt: new Date().toISOString(),
    address,
    contract: window.NousContract && window.NousContract.contractAddressSync ? window.NousContract.contractAddressSync() : null,
    chainId:  window.NousContract && window.NousContract.BASE_SEPOLIA_CHAIN_ID,
    records: records.map(r => ({
      id:             r.id,
      conversationId: r.conversationId,
      model:          r.model,
      promptHash:     r.promptHash,
      responseHash:   r.responseHash,
      plaintextHash:  r.plaintextHash,
      ciphertextHash: r.ciphertextHash,
      arweaveCid:     r.arweaveCid,
      attester:       r.attester,
      attesterSig:    r.attesterSig,
      sealedAt:       r.sealedAt,
      decrypted:      decrypted[r.id] || null,
    })),
    meta,
    personas,
  };
};

// Import only restores local-only state (titles, personas, inline ciphertext
// blobs). It does NOT touch the chain — that data is already on-chain and
// will be re-fetched on next load.
const importBackup = (json, address) => {
  if (!json || typeof json !== 'object' || json.v !== 1) {
    throw new Error('Unrecognised backup format');
  }
  const targetAddr = (address || json.address || '').toLowerCase();
  if (!targetAddr) throw new Error('No wallet address available for import');
  if (json.meta && typeof json.meta === 'object') {
    saveMeta(targetAddr, json.meta);
  }
  if (Array.isArray(json.personas) && json.personas.length) {
    savePersonas(targetAddr, json.personas);
  }
  // Restore inline blobs from any decrypted records the export contains —
  // this lets the user actually read records on the new device, since the
  // browser-only inline cache won't carry over otherwise.
  let restoredBlobs = 0;
  for (const r of (json.records || [])) {
    if (!r || !r.arweaveCid || !r.decrypted) continue;
    if (!r.arweaveCid.startsWith('inline:')) continue;
    if (loadInline(r.arweaveCid)) continue;
    try {
      // Re-encrypt locally would change the ciphertext; instead we only
      // restore if the backup also carried `cipherHex` (legacy / future).
      if (r.cipherHex) {
        const bytes = window.ethers.getBytes(r.cipherHex);
        stashInline(r.arweaveCid, bytes);
        restoredBlobs++;
      }
    } catch {}
  }
  return {
    metaEntries:    Object.keys(json.meta || {}).length,
    personaEntries: (json.personas || []).length,
    restoredBlobs,
  };
};

// Same as exportAll but also serialises inline ciphertext blobs as hex so
// the receiving device can actually decrypt records sealed in inline mode.
const exportAllPortable = ({ address, records, decrypted }) => {
  const base = exportAll({ address, records, decrypted });
  for (const r of base.records) {
    if (r.arweaveCid && r.arweaveCid.startsWith('inline:')) {
      const bytes = loadInline(r.arweaveCid);
      if (bytes) r.cipherHex = window.ethers.hexlify(bytes);
    }
  }
  return base;
};

window.NousPipeline = {
  // storage keys
  LS_ATTESTER_URL, LS_STORAGE_MODE, LS_STORAGE_URL, LS_API_KEY, LS_INLINE_PREFIX,
  LS_META_PREFIX, LS_PERSONAS_PREFIX,
  getAttesterUrl, getStorageMode, getApiKey,
  // hashing
  promptHash, responseHash, plaintextHash, bytesHash, newConversationId,
  canonicalMessages, transcriptUserHash, transcriptAssistantHash,
  // crypto
  deriveKey, encryptRecord, decryptRecord,
  // storage
  uploadCiphertext, fetchCiphertext, stashInline, loadInline,
  // direct API
  NOUS_API_BASE, callNous, callNousStream, testKey,
  // legacy proxy stubs (kept for backward compat)
  attesterInfo, attesterGenerate, attesterAttest, attesterTestKey,
  attesterChat, attesterChatStream, attesterFinalize,
  // orchestration
  runChat, runSealConversation, decryptByCid, generateTitle,
  // local metadata
  loadMeta, saveMeta, getRecordMeta, setRecordMeta,
  setRecordTitle, hideRecord, unhideRecord,
  // personas
  DEFAULT_PERSONAS, loadPersonas, savePersonas,
  // backup
  exportAll, exportAllPortable, importBackup,
  // legacy single-turn (still wired in case anything calls it)
  runGenerate: async () => { throw new Error('runGenerate is removed — use runChat + runSealConversation'); },
  runSeal:     async () => { throw new Error('runSeal is removed — use runSealConversation'); },
};
