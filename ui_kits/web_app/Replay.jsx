// Replay — client-side reproduction check.
//
// Given a sealed record, this page:
//   1. Fetches the on-chain row (model + hashes).
//   2. If the viewer can decrypt, pulls the original transcript so they
//      can see what the user prompts were.
//   3. Re-runs the user-side messages through the same model via the same
//      attester /chat endpoint (no sealing).
//   4. Hashes the canonical replay transcript and compares each hash to
//      what's on-chain.
//
// The match-or-not is best-effort: LLM calls are non-deterministic in
// general, so we only flag the user-side prompt hash as the strict check.
// The assistant-side hash is shown for reference; matches happen for
// deterministic models / cached responses but otherwise won't.
//
// Seed shape (from go('replay', { recordId })):
//   { recordId: number }

const Replay = ({ go, seed }) => {
  const wallet = useWallet();
  const toast  = useToast();

  const [recordId, setRecordId] = useState(seed?.recordId ?? '');
  const [record,   setRecord]   = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [envelope, setEnvelope] = useState(null);
  const [decrypting, setDecrypting] = useState(false);
  const [decryptErr, setDecryptErr] = useState(null);

  // Live replay state
  // turns: [{ user, original?, replay?, status, replayHash? }]
  const [turns, setTurns]   = useState([]);
  const [running, setRunning] = useState(false);
  const [cursor, setCursor] = useState(-1);

  // Final hash comparison
  const [hashCmp, setHashCmp] = useState(null);

  // Auto-load when seed/recordId is set
  useEffect(() => {
    if (seed?.recordId != null && seed.recordId !== recordId) {
      setRecordId(seed.recordId);
    }
  }, [seed]);

  const loadRecord = async () => {
    const idNum = Number(recordId);
    if (!Number.isFinite(idNum) || idNum < 0) { toast('Enter a valid record id', 'warning'); return; }
    setLoading(true);
    setRecord(null); setEnvelope(null); setTurns([]); setHashCmp(null); setDecryptErr(null);
    try {
      const r = await window.NousContract.fetchRecord(idNum);
      if (!r) { toast(`Record #${idNum} not found`, 'error'); return; }
      setRecord(r);
    } catch (err) {
      toast(err?.message || 'Load failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (seed?.recordId != null) loadRecord(); /* once */ }, [seed?.recordId]);

  const isOwner = wallet.address && record && record.author.toLowerCase() === wallet.address.toLowerCase();

  const decryptForReplay = async () => {
    if (!record) return;
    setDecrypting(true); setDecryptErr(null);
    try {
      if (!window.ethereum) throw new Error('No wallet provider');
      const provider = new window.ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const env = await window.NousPipeline.decryptByCid({
        signer,
        cid: record.arweaveCid,
        expectedCiphertextHash: record.ciphertextHash,
      });
      setEnvelope(env);
      // Pre-populate turns from the original transcript.
      const msgs = (env.v === 2 && Array.isArray(env.messages)) ? env.messages : [];
      const userTurns = msgs
        .filter(m => m.role === 'user')
        .map((u, i) => {
          // Try to pair with the i-th assistant turn.
          const assistantTurns = msgs.filter(m => m.role === 'assistant');
          return {
            user: u.content,
            original: assistantTurns[i]?.content || null,
            replay: null,
            status: 'pending',
          };
        });
      setTurns(userTurns);
    } catch (err) {
      console.error(err);
      const msg = err?.message || 'Decrypt failed';
      setDecryptErr(msg);
      toast(msg, 'error');
    } finally {
      setDecrypting(false);
    }
  };

  // Re-run the conversation turn by turn through the same model. We append
  // each replayed assistant reply into the running message history so each
  // subsequent user turn sees a transcript shaped like the original.
  const runReplay = async () => {
    if (!record || !envelope || !turns.length) return;
    const apiKey = window.NousPipeline.getApiKey();
    if (!apiKey) { toast('Add your Nous API key in Settings first.', 'warning'); return; }
    const original = (envelope.v === 2 && Array.isArray(envelope.messages)) ? envelope.messages : [];
    const sysRows  = original.filter(m => m.role === 'system');

    setRunning(true);
    setHashCmp(null);
    // Re-init turn rows
    setTurns(t => t.map(tt => ({ ...tt, replay: null, status: 'pending' })));

    const replayedMessages = [...sysRows]; // start with persona rows, if any
    try {
      for (let i = 0; i < turns.length; i++) {
        setCursor(i);
        setTurns(t => t.map((tt, idx) => idx === i ? { ...tt, status: 'running' } : tt));
        replayedMessages.push({ role: 'user', content: turns[i].user });
        const res = await window.NousPipeline.attesterChat({
          model:    record.model,
          messages: replayedMessages.map(m => ({ role: m.role, content: m.content })),
          temperature: 0.7,
          maxTokens:   1024,
          apiKey,
        });
        const assistantText = res.response || '';
        replayedMessages.push({ role: 'assistant', content: assistantText });
        setTurns(t => t.map((tt, idx) => idx === i ? { ...tt, replay: assistantText, status: 'done' } : tt));
      }
      setCursor(-1);

      // Compare hashes against on-chain record. We compute the same canonical
      // transcript hashes the attester computes server-side.
      try {
        const userHashRecomputed = window.NousPipeline.transcriptUserHash(replayedMessages);
        const asstHashRecomputed = window.NousPipeline.transcriptAssistantHash(replayedMessages);
        setHashCmp({
          userHashOk:    userHashRecomputed.toLowerCase() === record.promptHash.toLowerCase(),
          asstHashOk:    asstHashRecomputed.toLowerCase() === record.responseHash.toLowerCase(),
          userHashGot:   userHashRecomputed,
          asstHashGot:   asstHashRecomputed,
        });
      } catch {}
      toast('Replay complete', 'success');
    } catch (err) {
      console.error(err);
      const msg = err?.message || 'Replay failed';
      setTurns(t => t.map((tt, idx) => idx === cursor ? { ...tt, status: 'error' } : tt));
      toast(msg, 'error');
    } finally {
      setRunning(false);
    }
  };

  return <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '32px 24px 96px' }}>
    <button onClick={() => go(record ? 'record' : 'landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--sky-600)', fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20, padding: 0 }}>
      <I name="arrow-left" size={14} /> Back
    </button>

    <div style={{ marginBottom: 18 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 44, margin: 0, letterSpacing: '-0.02em' }}>Replay verification</h1>
      <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 16, color: 'var(--text-secondary)', margin: '6px 0 0' }}>
        Re-run a sealed conversation through the same model. The user-side hash should match exactly; assistant-side may differ unless the model is deterministic.
      </p>
    </div>

    {/* Record loader */}
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label style={{ fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Record #</label>
        <Input value={recordId} onChange={e => setRecordId(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') loadRecord(); }}
          placeholder="142" style={{ width: 120, fontFamily: 'var(--font-mono)' }} />
        <Button variant="primary" size="sm" onClick={loadRecord} disabled={loading}>
          {loading ? <><div className="spin" style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%' }} /> Loading…</> : <>Load</>}
        </Button>
        {record && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
          {record.model} · {record.author.slice(0,6)}…{record.author.slice(-4)}
        </span>}
      </div>
    </Card>

    {/* Decrypt step (owner only) */}
    {record && !envelope && (
      isOwner ? (
        <Card style={{ marginBottom: 14, textAlign: 'center', padding: 28 }}>
          <I name="lock" size={40} style={{ color: 'var(--sky-600)', marginBottom: 12 }} />
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
            Sign once to decrypt the original transcript so we can re-issue the same prompts.
          </p>
          {decryptErr && (
            <div style={{ background: 'rgba(255,138,128,0.18)', border: '1px solid rgba(229,57,53,0.4)', borderRadius: 10, padding: '8px 12px', fontSize: 12, marginBottom: 10, wordBreak: 'break-word' }}>
              <I name="x-circle" size={12} style={{ color: '#E53935', marginRight: 6, verticalAlign: 'middle' }} />
              {decryptErr}
            </div>
          )}
          <Button variant="primary" size="sm" onClick={decryptForReplay} disabled={decrypting}>
            {decrypting ? <><div className="spin" style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%' }} /> Decrypting…</> : <><I name="unlock" size={13} /> Sign to decrypt</>}
          </Button>
        </Card>
      ) : (
        <Card style={{ marginBottom: 14, padding: 24, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-body)' }}>
          Only <span style={{ fontFamily: 'var(--font-mono)' }}>{record.author.slice(0,6)}…{record.author.slice(-4)}</span> can decrypt the original transcript needed to seed the replay.
        </Card>
      )
    )}

    {/* Run + comparison */}
    {record && envelope && (
      <>
        <Card style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Badge variant="model">{record.model}</Badge>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)' }}>
              {turns.length} user turn{turns.length === 1 ? '' : 's'} to replay
            </span>
            <span style={{ flex: 1 }} />
            <Button variant="primary" size="sm" onClick={runReplay} disabled={running || !turns.length}>
              {running ? <><div className="spin" style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%' }} /> Replaying…</> : <><I name="play" size={13} /> Run replay</>}
            </Button>
          </div>
        </Card>

        {hashCmp && (
          <Card style={{ marginBottom: 14, background: hashCmp.userHashOk ? 'linear-gradient(180deg, rgba(174,213,129,0.4), rgba(139,195,74,0.2))' : 'rgba(255,138,128,0.18)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
              <I name={hashCmp.userHashOk ? 'check-circle-2' : 'x-circle'} size={18} style={{ color: hashCmp.userHashOk ? 'var(--grass-600)' : '#E53935' }} />
              <strong style={{ fontFamily: 'var(--font-display)', fontSize: 15 }}>
                User-side hash {hashCmp.userHashOk ? 'matches' : 'MISMATCH'}
              </strong>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, wordBreak: 'break-all', marginBottom: 8 }}>
              expected: {record.promptHash}<br />
              got:      {hashCmp.userHashGot}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10 }}>
              <I name={hashCmp.asstHashOk ? 'check-circle-2' : 'help-circle'} size={16} style={{ color: hashCmp.asstHashOk ? 'var(--grass-600)' : 'var(--text-muted)' }} />
              <span style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>
                Assistant-side: {hashCmp.asstHashOk ? 'exact match (deterministic)' : 'differs (expected — sampled outputs)'}
              </span>
            </div>
          </Card>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {turns.map((t, i) => (
            <Card key={i}>
              <div style={{ marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>Turn {i+1}</span>
                {t.status === 'running' && <Badge variant="info"><div className="spin" style={{ width: 10, height: 10, border: '2px solid rgba(2,136,209,0.3)', borderTopColor: 'var(--sky-500)', borderRadius: '50%', display: 'inline-block', verticalAlign: 'middle' }} /> Running</Badge>}
                {t.status === 'done'    && <Badge variant="verified"><I name="check" size={10} /> Done</Badge>}
                {t.status === 'error'   && <Badge variant="encrypted"><I name="x-circle" size={10} /> Error</Badge>}
              </div>
              <div style={{ background: 'linear-gradient(180deg, rgba(234,247,255,0.7), rgba(201,234,251,0.5))', border: '1px solid rgba(126,200,227,0.4)', borderRadius: 10, padding: 12, marginBottom: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--sky-700)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>You</div>
                <MarkdownContent text={t.user} />
              </div>
              <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Original</div>
                  {t.original ? <MarkdownContent text={t.original} /> : <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>—</div>}
                </div>
                <div style={{ background: 'rgba(174,213,129,0.18)', border: '1px solid rgba(139,195,74,0.4)', borderRadius: 10, padding: 12 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--grass-600)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>Replay</div>
                  {t.replay ? <MarkdownContent text={t.replay} /> : <div style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>{t.status === 'running' ? 'Running…' : '—'}</div>}
                </div>
              </div>
            </Card>
          ))}
        </div>
      </>
    )}
  </div>;
};

Object.assign(window, { Replay });
