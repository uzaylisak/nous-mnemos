// Explorer — public, no-auth view of every record on the contract.
//
// This is the "verifiable AI conversation registry" view. Anyone can hit
// the page and:
//   - See every sealed record (paginated, newest first)
//   - Filter by author / model / search the on-chain CID
//   - See attester signature + verify status (does the sig match digest?)
//   - Click through to RecordDetail for a deeper proof view
//
// We never decrypt here — the explorer is for proof-of-record, not content.
// If a viewer is the author they can still seal/decrypt from My Records;
// the explorer just shows what the chain says is true.

const PAGE_SIZE = 20;

// ---------------------------------------------------------------------------
// TxVerifier — paste a Base Sepolia tx hash, get a full public proof check.
//
// Steps:
//   1. Fetch tx receipt from RPC.
//   2. Parse the RecordSealed event from the logs.
//   3. Verify the attester signature against the on-chain digest.
//   4. Check trustedAttesters(attester) on the contract.
//   5. Show all fields + link to RecordDetail.
// ---------------------------------------------------------------------------
const TxVerifier = ({ go }) => {
  const [open,    setOpen]    = useState(false);
  const [txHash,  setTxHash]  = useState('');
  const [loading, setLoading] = useState(false);
  const [result,  setResult]  = useState(null);  // { record, sigState, trustState, cidMeta }
  const [err,     setErr]     = useState(null);

  const run = async () => {
    const hash = txHash.trim();
    if (!hash) return;
    setLoading(true); setErr(null); setResult(null);
    try {
      const c = await window.NousContract.getReadContract();
      if (!c) throw new Error('Contract not configured — set RPC in Settings');

      // ── 1. Get tx receipt ────────────────────────────────────────────────
      const provider = c.runner?.provider || c.runner;
      const receipt  = await provider.getTransactionReceipt(hash);
      if (!receipt) throw new Error('Transaction not found or not yet confirmed');

      // ── 2. Parse RecordSealed event from logs ────────────────────────────
      let sealedArgs = null;
      for (const log of receipt.logs) {
        try {
          const parsed = c.interface.parseLog({ topics: [...log.topics], data: log.data });
          if (parsed && parsed.name === 'RecordSealed') { sealedArgs = parsed.args; break; }
        } catch {}
      }
      if (!sealedArgs) throw new Error('No RecordSealed event found in this transaction. Are you sure this is a Nous Mnemos seal tx?');

      const record = {
        id:             Number(sealedArgs.id),
        author:         sealedArgs.author,
        conversationId: sealedArgs.conversationId,
        model:          sealedArgs.model,
        promptHash:     sealedArgs.promptHash,
        responseHash:   sealedArgs.responseHash,
        plaintextHash:  sealedArgs.plaintextHash,
        ciphertextHash: sealedArgs.ciphertextHash,
        arweaveCid:     sealedArgs.arweaveCid,
        attester:       sealedArgs.attester,
        attesterSig:    sealedArgs.attesterSig,
        sealedAt:       Number(sealedArgs.sealedAt),
      };

      // ── 3. Verify attester signature ─────────────────────────────────────
      let sigState = 'err';
      try {
        const digest    = await window.NousContract.computeRecordDigest(record);
        const recovered = window.ethers.verifyMessage(window.ethers.getBytes(digest), record.attesterSig);
        sigState = recovered.toLowerCase() === record.attester.toLowerCase() ? 'ok' : 'fail';
      } catch {}

      // ── 4. Check attester trust status ───────────────────────────────────
      // If attester === author this is a self-attested record — no external
      // trusted-attester lookup needed; the wallet signed its own record.
      let trustState = 'unknown';
      if (record.attester.toLowerCase() === record.author.toLowerCase()) {
        trustState = 'self';
      } else {
        try {
          const trusted = await c.trustedAttesters(record.attester);
          trustState = trusted ? 'trusted' : 'revoked';
        } catch {}
      }

      // ── 5. CID metadata ──────────────────────────────────────────────────
      let cidMeta = null;
      if (record.arweaveCid.startsWith('onchain:')) {
        try {
          const bytes = window.ethers.getBytes(record.arweaveCid.slice('onchain:'.length));
          cidMeta = { type: 'On-chain', bytes: bytes.byteLength };
        } catch { cidMeta = { type: 'On-chain', bytes: null }; }
      } else if (record.arweaveCid.startsWith('inline:')) {
        cidMeta = { type: 'LocalStorage (legacy)', bytes: null };
      } else {
        cidMeta = { type: 'Arweave', bytes: null };
      }

      setResult({ record, sigState, trustState, cidMeta });
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const stateIcon = (s, okVal, failVal, errVal = 'err') => {
    if (s === okVal)   return <span style={{ color: 'var(--grass-600)', fontWeight: 700 }}>✓</span>;
    if (s === failVal) return <span style={{ color: 'var(--error)', fontWeight: 700 }}>✗</span>;
    if (s === errVal)  return <span style={{ color: 'var(--warning)', fontWeight: 700 }}>?</span>;
    return <span style={{ color: 'var(--text-muted)' }}>—</span>;
  };

  return <Card style={{ marginBottom: 22, padding: 0, overflow: 'hidden' }}>
    {/* Header toggle */}
    <button onClick={() => setOpen(o => !o)} style={{
      width: '100%', background: 'transparent', border: 'none', cursor: 'pointer',
      padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5), 0 3px 8px rgba(2,136,209,0.25)' }}>
        <I name="shield" size={18} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16 }}>Verify by transaction hash</div>
        <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          Paste any Base Sepolia tx hash — we'll pull the sealed record and verify the attester signature publicly.
        </div>
      </div>
      <span style={{ color: 'var(--sky-600)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>
        <I name="chevron-down" size={16} />
      </span>
    </button>

    {open && <div style={{ padding: '0 20px 20px', borderTop: '1px solid rgba(30,90,160,0.08)' }}>
      {/* Input */}
      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        <Input
          placeholder="0x… transaction hash"
          value={txHash}
          onChange={e => setTxHash(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && run()}
          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13 }}
        />
        <Button variant="primary" size="md" onClick={run} disabled={loading || !txHash.trim()}>
          {loading
            ? <><span className="spin" style={{ display: 'inline-block', width: 12, height: 12, border: '2px solid rgba(255,255,255,0.3)', borderTopColor: '#fff', borderRadius: '50%' }} /> Verifying…</>
            : <><I name="shield" size={13} /> Verify</>}
        </Button>
      </div>

      {/* Error */}
      {err && <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 10, background: 'rgba(244,67,54,0.08)', border: '1px solid rgba(244,67,54,0.25)', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--error)' }}>
        <I name="x-circle" size={13} /> {err}
      </div>}

      {/* Result */}
      {result && (() => {
        const { record, sigState, trustState, cidMeta } = result;
        const sigOk   = sigState   === 'ok';
        const trustOk = trustState === 'trusted' || trustState === 'self';
        const allGood = sigOk && trustOk;

        return <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Overall verdict */}
          <div style={{
            padding: '14px 18px', borderRadius: 14, display: 'flex', alignItems: 'center', gap: 14,
            background: allGood ? 'rgba(174,213,129,0.25)' : 'rgba(255,245,157,0.4)',
            border: `1px solid ${allGood ? 'rgba(139,195,74,0.5)' : 'rgba(255,183,77,0.5)'}`,
          }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', background: allGood ? 'rgba(139,195,74,0.3)' : 'rgba(255,183,77,0.35)', flexShrink: 0 }}>
              <I name={allGood ? 'check-circle-2' : 'shield'} size={22} style={{ color: allGood ? 'var(--grass-600)' : '#7A4D00' }} />
            </div>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: allGood ? 'var(--grass-600)' : '#7A4D00' }}>
                {allGood ? 'Record verified — signature and attester are valid.' : 'Partial verification — see details below.'}
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-secondary)', marginTop: 3 }}>
                Record #{record.id} · {record.model} · {relativeTime(record.sealedAt)}
              </div>
            </div>
            <div style={{ marginLeft: 'auto', flexShrink: 0 }}>
              <Button variant="ghost" size="sm" onClick={() => go('record', record.id)}>
                <I name="arrow-right" size={13} /> Details
              </Button>
            </div>
          </div>

          {/* Checks */}
          <Card style={{ padding: 18 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Verification checks</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {[
                {
                  icon: stateIcon(sigState, 'ok', 'fail'),
                  label: 'Attester signature',
                  detail: sigState === 'ok'   ? 'Recovered signer matches the attester field in the event.' :
                          sigState === 'fail' ? 'Signature does not match the event attester — record may be tampered.' :
                                               'Could not verify (RPC error).',
                  ok: sigOk,
                },
                {
                  icon: trustState === 'self'
                    ? <span style={{ color: 'var(--sky-600)', fontWeight: 700 }}>✦</span>
                    : stateIcon(trustState, 'trusted', 'revoked', 'unknown'),
                  label: 'Attester identity',
                  detail: trustState === 'self'    ? 'Self-attested — the author\'s wallet signed its own record. No external attester required.' :
                          trustState === 'trusted' ? 'Attester is registered as trusted in the contract.' :
                          trustState === 'revoked' ? 'Attester has been revoked by the contract owner.' :
                                                    'Could not read trustedAttesters() (RPC error).',
                  ok: trustOk,
                },
              ].map(ch => <div key={ch.label} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, background: ch.ok ? 'rgba(174,213,129,0.15)' : 'rgba(255,183,77,0.12)', border: `1px solid ${ch.ok ? 'rgba(139,195,74,0.3)' : 'rgba(255,183,77,0.35)'}` }}>
                <span style={{ fontSize: 16, lineHeight: 1, flexShrink: 0, marginTop: 1 }}>{ch.icon}</span>
                <div>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13 }}>{ch.label}</div>
                  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{ch.detail}</div>
                </div>
              </div>)}
            </div>
          </Card>

          {/* Record fields */}
          <Card style={{ padding: 18 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>On-chain fields</div>
            <StatList rows={[
              ['Record ID',      `#${record.id}`],
              ['Author',         <Address address={record.author} short={false} copy />],
              ['Model',          record.model],
              ['Sealed at',      new Date(record.sealedAt * 1000).toISOString()],
              ['Attester',       <Address address={record.attester} short={false} copy />],
              ['Prompt hash',    <Hash value={record.promptHash} />],
              ['Response hash',  <Hash value={record.responseHash} />],
              ['Plaintext hash', <Hash value={record.plaintextHash} />],
              ['Storage',        cidMeta
                ? `${cidMeta.type}${cidMeta.bytes ? ` · ${(cidMeta.bytes / 1024).toFixed(1)} KB encrypted` : ''}`
                : record.arweaveCid.slice(0, 30) + '…'],
            ]} />
          </Card>
        </div>;
      })()}
    </div>}
  </Card>;
};

const Explorer = ({ go }) => {
  const wallet = useWallet();
  const toast  = useToast();

  const [total,   setTotal]   = useState(null);   // total record count from chain
  const [rows,    setRows]    = useState([]);     // currently-loaded records
  const [page,    setPage]    = useState(0);      // 0 = newest page
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState(null);

  // Filters (client-side over the loaded page; full chain scan would be too expensive)
  const [q,           setQ]           = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [authorFilter,setAuthorFilter]= useState('');

  const load = async (p) => {
    setLoading(true); setError(null);
    try {
      const c = await window.NousContract.getReadContract();
      if (!c) throw new Error('Contract not configured');
      const t = Number(await c.totalRecords());
      setTotal(t);
      if (t === 0) { setRows([]); setLoading(false); return; }

      // Pages count from newest. Page 0 = the last `PAGE_SIZE` records.
      const offset = Math.max(0, t - (p + 1) * PAGE_SIZE);
      const limit  = Math.min(PAGE_SIZE, t - offset);
      const raw    = await c.recordsPage(offset, limit);
      const parsed = raw
        .map((r, i) => window.NousContract.parseRecord(r, offset + i))
        .reverse(); // newest in this slice first
      setRows(parsed);
    } catch (err) {
      console.error('Explorer load failed', err);
      setError(err.message || 'Failed to read records');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(page); }, [page]);

  // Stats over all currently visible rows.
  const filtered = rows.filter(r =>
    (!modelFilter  || r.model.toLowerCase().includes(modelFilter.toLowerCase())) &&
    (!authorFilter || r.author.toLowerCase().includes(authorFilter.toLowerCase())) &&
    (!q ||
      r.model.toLowerCase().includes(q.toLowerCase()) ||
      r.arweaveCid.toLowerCase().includes(q.toLowerCase()) ||
      r.author.toLowerCase().includes(q.toLowerCase()) ||
      String(r.id).includes(q))
  );

  const hasNext = total != null && (page + 1) * PAGE_SIZE < total;
  const hasPrev = page > 0;

  const explorerStats = useMemo(() => {
    if (!rows.length) return [];
    const authors = new Set(rows.map(r => r.author.toLowerCase())).size;
    const models  = new Set(rows.map(r => r.model)).size;
    return [
      ['Total on chain', total ?? '—'],
      ['Authors (page)', authors],
      ['Models (page)',  models],
      ['Newest',         rows[0] ? relativeTime(rows[0].sealedAt) : '—'],
    ];
  }, [rows, total]);

  return <div style={{ position: 'relative', zIndex: 1, maxWidth: 1240, margin: '0 auto', padding: '48px 32px 96px' }}>
    <div style={{ marginBottom: 28 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 48, margin: 0, letterSpacing: '-0.01em' }}>Explorer</h1>
      <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 17, color: 'var(--text-secondary)', margin: '6px 0 0', maxWidth: 720 }}>
        Every sealed conversation on the contract. Plaintext stays private — what's public is the proof
        that a wallet, a model, and a moment were committed to chain together.
      </p>
    </div>

    {/* TX Verifier */}
    <TxVerifier go={go} />

    {/* Stats */}
    {explorerStats.length > 0 && (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 22 }}>
        {explorerStats.map(([k, v]) =>
          <Card key={k} style={{ padding: 18 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, letterSpacing: '-0.01em' }}>{v}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4, fontWeight: 600 }}>{k}</div>
          </Card>
        )}
      </div>
    )}

    {/* Filter row */}
    <Card style={{ padding: 14, marginBottom: 18, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
      <I name="globe" size={16} style={{ color: 'var(--sky-600)' }} />
      <Input placeholder="Search id, author, model, CID…" value={q} onChange={e => setQ(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
      <Input placeholder="Model contains…" value={modelFilter} onChange={e => setModelFilter(e.target.value)} style={{ width: 200 }} />
      <Input placeholder="Author 0x…" value={authorFilter} onChange={e => setAuthorFilter(e.target.value)} style={{ width: 200 }} />
      {(q || modelFilter || authorFilter) && (
        <Button variant="ghost" size="sm" onClick={() => { setQ(''); setModelFilter(''); setAuthorFilter(''); }}>
          Clear
        </Button>
      )}
    </Card>

    {/* Body */}
    {loading ? (
      <Card style={{ padding: 48, textAlign: 'center' }}>
        <div className="spin" style={{ width: 28, height: 28, border: '3px solid rgba(41,182,246,0.2)', borderTopColor: 'var(--sky-500)', borderRadius: '50%', margin: '0 auto' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginTop: 14 }}>Reading the chain…</p>
      </Card>
    ) : error ? (
      <Card style={{ padding: 36, textAlign: 'center', background: 'rgba(255,138,128,0.18)', border: '1px solid rgba(229,57,53,0.4)' }}>
        <I name="x-circle" size={28} style={{ color: '#E53935' }} />
        <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)', marginTop: 12 }}>{error}</p>
        <Button variant="ghost" size="sm" onClick={() => load(page)} style={{ marginTop: 10 }}>Retry</Button>
      </Card>
    ) : total === 0 ? (
      <Card style={{ padding: 56, textAlign: 'center' }}>
        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.6), 0 6px 18px rgba(2,136,209,0.25)', margin: '0 auto 20px' }}>
          <I name="globe" size={32} />
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: 0 }}>The registry is empty.</h3>
        <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 16, color: 'var(--text-secondary)', margin: '8px 0 24px' }}>
          No one has sealed a conversation yet. {wallet.address ? 'You could be the first.' : 'Connect a wallet to inscribe one.'}
        </p>
        <Button variant="primary" size="md" onClick={() => go('chat')}>Begin first inscription <I name="arrow-right" size={16} /></Button>
      </Card>
    ) : filtered.length === 0 ? (
      <Card style={{ padding: 36, textAlign: 'center' }}>
        <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 16, color: 'var(--text-secondary)', margin: 0 }}>
          No records match your filter on this page.
        </p>
        <Button variant="ghost" size="sm" onClick={() => { setQ(''); setModelFilter(''); setAuthorFilter(''); }} style={{ marginTop: 10 }}>Clear filters</Button>
      </Card>
    ) : (
      <>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 14 }}>
          {filtered.map(r => <ExplorerRow key={r.id} record={r} go={go} toast={toast} you={wallet.address} />)}
        </div>

        {/* Pagination */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginTop: 24, fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)' }}>
          <Button variant="ghost" size="sm" onClick={() => setPage(p => Math.max(0, p - 1))} disabled={!hasPrev}>
            <I name="arrow-left" size={14} /> Newer
          </Button>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>
            Page {page + 1} {total != null ? `· ${Math.ceil(total / PAGE_SIZE)} total` : ''}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setPage(p => p + 1)} disabled={!hasNext}>
            Older <I name="arrow-right" size={14} />
          </Button>
        </div>
      </>
    )}
  </div>;
};

// ---------- ExplorerRow ----------
// One record card. Verifies the attester signature over the on-chain digest
// asynchronously and renders a "Verified" / "Bad sig" badge. This is purely
// a read — no wallet signature, no decryption, no key access.
const ExplorerRow = ({ record, go, toast, you }) => {
  const [verifyState, setVerifyState] = useState('pending'); // 'pending'|'ok'|'fail'|'err'

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const digest = await window.NousContract.computeRecordDigest({
          author:         record.author,
          conversationId: record.conversationId,
          model:          record.model,
          promptHash:     record.promptHash,
          responseHash:   record.responseHash,
          plaintextHash:  record.plaintextHash,
          ciphertextHash: record.ciphertextHash,
          arweaveCid:     record.arweaveCid,
        });
        const recovered = window.ethers.verifyMessage(window.ethers.getBytes(digest), record.attesterSig);
        if (cancelled) return;
        setVerifyState(recovered.toLowerCase() === record.attester.toLowerCase() ? 'ok' : 'fail');
      } catch (err) {
        if (!cancelled) setVerifyState('err');
      }
    })();
    return () => { cancelled = true; };
  }, [record.id]);

  const isYou = you && record.author.toLowerCase() === you.toLowerCase();
  const shortAuthor = `${record.author.slice(0, 6)}…${record.author.slice(-4)}`;

  return <Card hover>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>#{record.id}</span>
      <Badge variant="model">{record.model}</Badge>
      {verifyState === 'ok'   && <Badge variant="verified"><I name="check" size={10} /> Verified</Badge>}
      {verifyState === 'fail' && <Badge variant="encrypted"><I name="x-circle" size={10} /> Bad signature</Badge>}
      {verifyState === 'err'  && <Badge variant="info">verify…</Badge>}
      {verifyState === 'pending' && <Badge variant="info">verifying…</Badge>}
      {isYou && <Badge variant="info">You</Badge>}
      <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)' }} title={new Date(record.sealedAt * 1000).toISOString()}>
        {relativeTime(record.sealedAt)}
      </span>
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
      <Avatar address={record.author} size={32} />
      <button onClick={() => go('user', record.author)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--sky-700)', fontWeight: 600 }}>
        {shortAuthor}
      </button>
    </div>

    <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, background: 'rgba(255,255,255,0.35)', padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.6)', color: 'var(--text-muted)', marginBottom: 10, wordBreak: 'break-all' }}>
      cid: {record.arweaveCid}
    </div>

    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <Button variant="ghost" size="sm" onClick={() => go('record', record.id)}>
        Details →
      </Button>
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
        <button title="Copy CID" onClick={() => { navigator.clipboard?.writeText(record.arweaveCid); toast('CID copied', 'info'); }}
          style={iconBtnStyle}><I name="database" size={13} /></button>
        <a title="View author on BaseScan" href={`https://sepolia.basescan.org/address/${record.author}`} target="_blank" rel="noreferrer"
          style={{ ...iconBtnStyle, textDecoration: 'none' }}><I name="external-link" size={13} /></a>
      </div>
    </div>
  </Card>;
};

Object.assign(window, { Explorer });

