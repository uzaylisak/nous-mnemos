// My Records — real on-chain reads + real wallet-signed decryption.
//
// fetchRecordsByAuthor() returns the on-chain rows. Plaintext lives off-chain
// (inline localStorage cache or arweave). The user clicks "Decrypt & read"
// which:
//   1. Pulls the ciphertext bytes
//   2. Verifies bytes match the on-chain ciphertextHash
//   3. Has the wallet sign the canonical key-derivation message → AES-GCM key
//   4. Decrypts → renders the multi-turn transcript (or v1 prompt/response).
//
// Local-only state (titles, hidden flag) lives in mnemos_meta:<addr>. The
// chain is immutable — "delete" only hides a record from the user's view;
// "rename" only attaches a local title. Anyone who knows your address can
// still see the on-chain record.

const MyRecords = ({ go }) => {
  const wallet = useWallet();
  const toast  = useToast();

  const [all, setAll]           = useState([]);
  const [loading, setLoading]   = useState(true);
  const [q, setQ]               = useState('');
  const [decrypting, setDecrypting] = useState(null);   // record id currently being decrypted
  const [decrypted, setDecrypted]   = useState({});     // id -> envelope object
  const [errors, setErrors]         = useState({});     // id -> error string
  const [meta, setMeta]             = useState({});     // local meta from pipeline
  const [showHidden, setShowHidden] = useState(false);
  const [editingId, setEditingId]   = useState(null);
  const [editingValue, setEditingValue] = useState('');

  // In-memory derived key cache. Cleared on reload by design.
  const keyRef = useRef(null);

  // hidden file input for Import JSON button
  const importInputRef = useRef(null);

  const reloadMeta = () => {
    if (!wallet.address) { setMeta({}); return; }
    setMeta(window.NousPipeline.loadMeta(wallet.address));
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      if (!wallet.address) { setAll([]); setLoading(false); return; }
      try {
        const rows = await window.NousContract.fetchRecordsByAuthor(wallet.address);
        if (!cancelled) {
          setAll(rows);
          reloadMeta();
        }
      } catch (err) {
        console.warn('MyRecords fetch failed', err);
        if (!cancelled) setAll([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet.address]);

  // When the wallet changes, drop the cached key — it's no longer valid.
  useEffect(() => { keyRef.current = null; setDecrypted({}); }, [wallet.address]);

  // Filter pipeline: search query + hidden toggle. The query also looks
  // inside any *already decrypted* envelopes so users can search by the
  // text of their own conversations. Sealed/encrypted records can only
  // match by model/CID/title (we have no plaintext for them).
  const visible = all
    .map(r => ({ ...r, title: meta[r.id]?.title, hidden: !!meta[r.id]?.hidden }))
    .filter(r => showHidden || !r.hidden)
    .filter(r => {
      if (!q) return true;
      const needle = q.toLowerCase();
      if (r.model.toLowerCase().includes(needle))      return true;
      if (r.arweaveCid.toLowerCase().includes(needle)) return true;
      if ((r.title || '').toLowerCase().includes(needle)) return true;
      // Search inside decrypted plaintext, when available
      const env = decrypted[r.id];
      if (env) {
        if (env.v === 2 && Array.isArray(env.messages)) {
          if (env.messages.some(m => (m.content || '').toLowerCase().includes(needle))) return true;
        } else {
          if ((env.prompt || '').toLowerCase().includes(needle))   return true;
          if ((env.response || '').toLowerCase().includes(needle)) return true;
        }
      }
      return false;
    });

  const ensureKey = async () => {
    if (keyRef.current) return keyRef.current;
    if (!window.ethereum) throw new Error('No wallet provider detected');
    const provider = new window.ethers.BrowserProvider(window.ethereum);
    const signer   = await provider.getSigner();
    const k = await window.NousPipeline.deriveKey(signer);
    keyRef.current = k;
    return k;
  };

  const decrypt = async (record) => {
    setDecrypting(record.id);
    setErrors(e => ({ ...e, [record.id]: null }));
    try {
      const ciphertext = await window.NousPipeline.fetchCiphertext(record.arweaveCid);
      const got = window.NousPipeline.bytesHash(ciphertext);
      if (got.toLowerCase() !== record.ciphertextHash.toLowerCase()) {
        throw new Error('Ciphertext hash mismatch — stored bytes do not match the on-chain hash');
      }
      const key = await ensureKey();
      const envelope = await window.NousPipeline.decryptRecord({ key, ciphertext });
      setDecrypted(d => ({ ...d, [record.id]: envelope }));
      toast('Decrypted', 'success');
    } catch (err) {
      console.error('decrypt failed', err);
      const msg = err?.message || 'Decryption failed';
      setErrors(e => ({ ...e, [record.id]: msg }));
      toast(msg, 'error');
    } finally {
      setDecrypting(null);
    }
  };

  const decryptAll = async () => {
    if (!wallet.address) return;
    const todo = visible.filter(r => !decrypted[r.id]);
    if (!todo.length) { toast('Everything visible is already decrypted', 'info'); return; }
    try {
      await ensureKey(); // single signature for the whole batch
    } catch (err) {
      toast(err.message || 'Wallet signature required', 'error');
      return;
    }
    let ok = 0, fail = 0;
    for (const r of todo) {
      try {
        const ciphertext = await window.NousPipeline.fetchCiphertext(r.arweaveCid);
        const got = window.NousPipeline.bytesHash(ciphertext);
        if (got.toLowerCase() !== r.ciphertextHash.toLowerCase()) throw new Error('hash mismatch');
        const env = await window.NousPipeline.decryptRecord({ key: keyRef.current, ciphertext });
        setDecrypted(d => ({ ...d, [r.id]: env }));
        ok++;
      } catch {
        fail++;
      }
    }
    toast(`Decrypted ${ok}, failed ${fail}`, fail ? 'warning' : 'success');
  };

  const renameRecord = (id, title) => {
    if (!wallet.address) return;
    window.NousPipeline.setRecordTitle(wallet.address, id, title);
    reloadMeta();
    setEditingId(null);
    toast(title ? 'Title updated' : 'Title cleared', 'info');
  };

  const toggleHidden = (id, hidden) => {
    if (!wallet.address) return;
    if (hidden) window.NousPipeline.unhideRecord(wallet.address, id);
    else        window.NousPipeline.hideRecord(wallet.address, id);
    reloadMeta();
    toast(hidden ? 'Restored' : 'Hidden from your view', 'info');
  };

  const exportPortable = () => {
    if (!wallet.address) return;
    const json = window.NousPipeline.exportAllPortable({
      address: wallet.address,
      records: all,
      decrypted,
    });
    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `nous-mnemos-backup-${wallet.address.slice(0,8)}-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    toast(`Exported ${all.length} record${all.length === 1 ? '' : 's'} + local data`, 'success');
  };

  const triggerImport = () => importInputRef.current?.click();

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    if (!wallet.address) { toast('Connect wallet first', 'warning'); return; }
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      const stats = window.NousPipeline.importBackup(json, wallet.address);
      reloadMeta();
      toast(
        `Imported: ${stats.metaEntries} titles, ${stats.personaEntries} personas, ${stats.restoredBlobs} ciphertext blobs`,
        'success',
      );
    } catch (err) {
      console.error('import failed', err);
      toast(`Import failed: ${err.message}`, 'error');
    }
  };

  // Render the body of a decrypted record. v2 = multi-turn transcript with
  // optional system row, v1 = single prompt/response (legacy). Assistant
  // bodies render as markdown so code blocks/lists/etc display correctly.
  const RecordBody = ({ envelope }) => {
    if (envelope.v === 2 && Array.isArray(envelope.messages)) {
      return <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {envelope.messages.map((m, i) => (
          <div key={i} style={{
            background: m.role === 'user'
              ? 'linear-gradient(180deg, rgba(234,247,255,0.7), rgba(201,234,251,0.5))'
              : m.role === 'system'
                ? 'rgba(255,243,224,0.55)'
                : 'rgba(255,255,255,0.6)',
            border: '1px solid ' + (m.role === 'user' ? 'rgba(126,200,227,0.4)' : m.role === 'system' ? 'rgba(255,167,38,0.35)' : 'rgba(255,255,255,0.8)'),
            borderRadius: 12,
            padding: 12,
          }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: m.role === 'user' ? 'var(--sky-700)' : m.role === 'system' ? '#E65100' : 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
              {m.role === 'user' ? 'You' : m.role === 'system' ? 'Persona' : (envelope.model || 'Assistant')}
            </div>
            {m.role === 'assistant'
              ? <MarkdownContent text={m.content} style={{ fontSize: 14 }} />
              : <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>{m.content}</div>}
          </div>
        ))}
      </div>;
    }
    return <>
      <div style={{ background: 'linear-gradient(180deg, rgba(234,247,255,0.7), rgba(201,234,251,0.5))', border: '1px solid rgba(126,200,227,0.4)', borderRadius: 12, padding: 12, marginBottom: 8 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sky-700)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Prompt</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)', whiteSpace: 'pre-wrap' }}>{envelope.prompt}</div>
      </div>
      <div style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)', borderRadius: 12, padding: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Response</div>
        <MarkdownContent text={envelope.response} style={{ fontSize: 14 }} />
      </div>
    </>;
  };

  const hiddenCount = all.filter(r => meta[r.id]?.hidden).length;

  return <div style={{ position: 'relative', zIndex: 1, maxWidth: 1240, margin: '0 auto', padding: '48px 32px 96px' }}>
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 28, gap: 16, flexWrap: 'wrap' }}>
      <div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 48, margin: 0, letterSpacing: '-0.01em' }}>My records</h1>
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, color: 'var(--text-secondary)', margin: '6px 0 0' }}>
          {wallet.address
            ? <>{visible.length} inscription{visible.length === 1 ? '' : 's'} by <span style={{ fontFamily: 'var(--font-mono)' }}>{wallet.address.slice(0,6)}…{wallet.address.slice(-4)}</span></>
            : 'Connect a wallet to see your records.'}
        </p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <Input placeholder="Search title, model, hash…" value={q} onChange={e => setQ(e.target.value)} style={{ width: 240 }} />
        {hiddenCount > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setShowHidden(!showHidden)}>
            <I name={showHidden ? 'eye-off' : 'eye'} size={13} /> {showHidden ? 'Hide hidden' : `Show hidden (${hiddenCount})`}
          </Button>
        )}
        <Button variant="ghost" size="sm" onClick={decryptAll} disabled={!wallet.address || !visible.length}>
          <I name="unlock" size={13} /> Decrypt all
        </Button>
        <Button variant="ghost" size="sm" onClick={exportPortable} disabled={!wallet.address || !all.length}>
          <I name="download" size={13} /> Export
        </Button>
        <Button variant="ghost" size="sm" onClick={triggerImport} disabled={!wallet.address}>
          <I name="upload" size={13} /> Import
        </Button>
        <input ref={importInputRef} type="file" accept="application/json,.json" onChange={handleImport} style={{ display: 'none' }} />
      </div>
    </div>

    {/* Stats */}
    <div className="resp-grid-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
      {[
        ['Total records', all.length],
        ['Models used',   new Set(all.map(r => r.model)).size],
        ['First record',  all.length ? relativeTime(all[all.length - 1].sealedAt) : '—'],
        ['Last record',   all.length ? relativeTime(all[0].sealedAt) : '—'],
      ].map(([k, v]) =>
        <Card key={k} style={{ padding: 18 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.01em' }}>{v}</div>
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4, fontWeight: 600 }}>{k}</div>
        </Card>
      )}
    </div>

    {/* Records */}
    {loading ? (
      <Card style={{ padding: 48, textAlign: 'center' }}>
        <div className="spin" style={{ width: 28, height: 28, border: '3px solid rgba(41,182,246,0.2)', borderTopColor: 'var(--sky-500)', borderRadius: '50%', margin: '0 auto' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginTop: 14 }}>Reading your records from chain…</p>
      </Card>
    ) : !wallet.address ? (
      <Card style={{ padding: 56, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.6), 0 6px 18px rgba(2,136,209,0.25)', margin: '0 auto 20px' }}>
          <I name="wallet" size={32} />
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: 0 }}>Connect your wallet.</h3>
        <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 16, color: 'var(--text-secondary)', margin: '8px 0 24px' }}>Your records are indexed by the address that sealed them.</p>
      </Card>
    ) : all.length === 0 ? (
      <Card style={{ padding: 56, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.6), 0 6px 18px rgba(2,136,209,0.25)', margin: '0 auto 20px' }}>
          <I name="scroll-text" size={32} />
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: 0 }}>You haven't sealed anything yet.</h3>
        <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 16, color: 'var(--text-secondary)', margin: '8px 0 24px' }}>Your first inscription will appear here, permanent and private.</p>
        <Button variant="primary" size="md" onClick={() => go('chat')}>Begin your first <I name="arrow-right" size={16} /></Button>
      </Card>
    ) : visible.length === 0 ? (
      <Card style={{ padding: 40, textAlign: 'center' }}>
        <div style={{ fontFamily: 'var(--font-poetic)', fontSize: 16, color: 'var(--text-secondary)' }}>
          No records match your filter.
        </div>
        <Button variant="ghost" size="sm" onClick={() => { setQ(''); setShowHidden(true); }} style={{ marginTop: 14 }}>Clear filters</Button>
      </Card>
    ) : (
    <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 18 }}>
      {visible.map(r => {
        const env = decrypted[r.id];
        const errMsg = errors[r.id];
        const isDecryptingThis = decrypting === r.id;
        const turnCount = env?.v === 2 && Array.isArray(env.messages)
          ? env.messages.filter(m => m.role !== 'system').length
          : null;
        const isEditing = editingId === r.id;
        return <Card key={r.id} hover style={r.hidden ? { opacity: 0.55, borderStyle: 'dashed' } : {}}>
          {/* Title row */}
          {isEditing ? (
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <Input
                value={editingValue}
                onChange={e => setEditingValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') renameRecord(r.id, editingValue.trim());
                  if (e.key === 'Escape') setEditingId(null);
                }}
                placeholder="Title (or empty to clear)"
                autoFocus
                style={{ flex: 1, fontSize: 14 }}
              />
              <Button variant="primary" size="sm" onClick={() => renameRecord(r.id, editingValue.trim())}>Save</Button>
              <Button variant="ghost" size="sm" onClick={() => setEditingId(null)}>Cancel</Button>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, margin: 0, color: 'var(--text-primary)', flex: 1, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.title || `Record #${r.id}`}>
                {r.title || <span style={{ color: 'var(--text-muted)', fontWeight: 600 }}>Record #{r.id}</span>}
              </h3>
              <button title="Rename" onClick={() => { setEditingId(r.id); setEditingValue(r.title || ''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4 }}>
                <I name="edit-2" size={13} />
              </button>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>#{r.id}</span>
            <Badge variant="model">{r.model}</Badge>
            {env ? <Badge variant="verified"><I name="unlock" size={10} /> Open</Badge> : <Badge variant="encrypted"><I name="lock" size={10} /> Sealed</Badge>}
            {turnCount != null && <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{turnCount} msg</span>}
            {r.hidden && <Badge variant="info">Hidden</Badge>}
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }} title={new Date(r.sealedAt * 1000).toISOString()}>{relativeTime(r.sealedAt)}</span>
          </div>

          {env ? <RecordBody envelope={env} /> : (
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'rgba(255,255,255,0.35)', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.6)', color: 'var(--text-muted)', marginBottom: 12, wordBreak: 'break-all' }}>
              {r.arweaveCid}
            </div>
          )}

          {errMsg && (
            <div style={{ background: 'rgba(255,138,128,0.18)', border: '1px solid rgba(229,57,53,0.4)', borderRadius: 10, padding: '8px 12px', fontSize: 12, color: 'var(--text-primary)', marginBottom: 10, wordBreak: 'break-word' }}>
              <I name="x-circle" size={12} style={{ color: '#E53935', marginRight: 6, verticalAlign: 'middle' }} />
              {errMsg}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {env
              ? <Button variant="ghost" size="sm" onClick={() => go('record', r.id)}>Read full →</Button>
              : <Button variant="secondary" size="sm" onClick={() => decrypt(r)} disabled={isDecryptingThis}>
                  {isDecryptingThis
                    ? <><div className="spin" style={{ width: 12, height: 12, border: '2px solid rgba(2,136,209,0.3)', borderTopColor: 'var(--sky-500)', borderRadius: '50%' }} /> Decrypting…</>
                    : <><I name="unlock" size={14} /> Decrypt & read</>}
                </Button>}
            {env && (
              <Button variant="ghost" size="sm" onClick={() => go('chat', { envelope: env, sourceId: r.id })} title="Open this transcript in a fresh chat">
                <I name="message-square" size={13} /> Continue
              </Button>
            )}
            <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
              <button title="Copy CID" onClick={() => { navigator.clipboard?.writeText(r.arweaveCid); toast('CID copied', 'info'); }}
                style={iconBtnStyle}><I name="database" size={13} /></button>
              <a title="Open BaseScan" href={`https://sepolia.basescan.org/address/${window.NousContract.contractAddressSync() || ''}#events`} target="_blank" rel="noreferrer"
                style={{ ...iconBtnStyle, textDecoration: 'none' }}><I name="external-link" size={13} /></a>
              <button title={r.hidden ? 'Restore' : 'Hide from your view'} onClick={() => toggleHidden(r.id, r.hidden)}
                style={iconBtnStyle}><I name={r.hidden ? 'eye' : 'eye-off'} size={13} /></button>
              <button title="Export this record (decrypted)" disabled={!env}
                onClick={() => {
                  if (!env) return;
                  const blob = new Blob([JSON.stringify({ record: r, envelope: env }, null, 2)], { type: 'application/json' });
                  const a = document.createElement('a');
                  a.href = URL.createObjectURL(blob);
                  a.download = `mnemos-record-${r.id}.json`;
                  a.click();
                }}
                style={{ ...iconBtnStyle, cursor: env ? 'pointer' : 'not-allowed', color: env ? 'var(--sky-600)' : 'var(--text-muted)', opacity: env ? 1 : 0.5 }}>
                <I name="download" size={13} /></button>
            </div>
          </div>
        </Card>;
      })}
    </div>
    )}
  </div>;
};

Object.assign(window, { MyRecords });
