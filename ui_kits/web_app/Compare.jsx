// Compare — run the same prompt against two Nous models side-by-side, then
// optionally seal each response as its own record so you can later cite
// "Hermes-4-70B said X, Hermes-4-405B said Y, both signed."
//
// This is a single-turn page: pick A and B, type a prompt, hit Run, watch
// both columns stream in, optionally seal whichever (or both) you like.
// Sealing reuses the same NousPipeline.runSealConversation pipeline that
// Chat uses, just with a one-message transcript.
//
// Seed shape (from go('compare', { prompt, modelA, modelB })):
//   { prompt?: string, modelA?: string, modelB?: string }

const Compare = ({ go, seed }) => {
  const wallet = useWallet();
  const toast  = useToast();

  // ---- model selection -------------------------------------------------
  const [modelA, setModelA] = useState(seed?.modelA || MOCK.models[0].id);
  const [modelB, setModelB] = useState(seed?.modelB || (MOCK.models[1]?.id || MOCK.models[0].id));
  const [prompt, setPrompt] = useState(seed?.prompt || '');
  const [temp,   setTemp]   = useState(0.7);
  const [maxTok] = useState(1024);

  // ---- per-side state ---------------------------------------------------
  // Each side keeps its own status/text/usage/sealed result. Linked by index.
  const blank = () => ({ text: '', usage: null, status: 'idle', err: null, sealed: null, sealing: false });
  const [a, setA] = useState(blank());
  const [b, setB] = useState(blank());

  const aborts = useRef({ a: null, b: null });

  const recordA = MOCK.models.find(m => m.id === modelA) || MOCK.models[0];
  const recordB = MOCK.models.find(m => m.id === modelB) || MOCK.models[0];

  const runOne = async (side, modelRecord, setSide) => {
    const apiKey = window.NousPipeline.getApiKey();
    if (!apiKey) { toast('Add your Nous API key in Settings first.', 'warning'); return; }
    setSide(s => ({ ...s, status: 'sending', err: null, text: '', usage: null }));
    const ac = new AbortController();
    aborts.current[side] = ac;
    try {
      const res = await window.NousPipeline.runChat({
        model:       modelRecord.apiId,
        messages:    [{ role: 'user', content: prompt.trim() }],
        temperature: temp,
        maxTokens:   maxTok,
        apiKey,
        signal:      ac.signal,
        onToken:     (_p, full) => setSide(s => ({ ...s, text: full })),
      });
      setSide(s => ({ ...s, status: 'idle', text: res.response, usage: res.usage || s.usage }));
    } catch (err) {
      const msg = err?.message || 'Run failed';
      setSide(s => ({ ...s, status: 'error', err: msg }));
      if (err?.name !== 'AbortError') toast(msg, 'error');
    } finally {
      aborts.current[side] = null;
    }
  };

  const run = async () => {
    if (!wallet.address) { toast('Connect your wallet first.', 'warning'); return; }
    if (!prompt.trim()) return;
    // Run both in parallel — different streams, both update independently.
    runOne('a', recordA, setA);
    if (modelA !== modelB) runOne('b', recordB, setB);
    else                   setB(blank()); // skip duplicate
  };

  const stopAll = () => {
    if (aborts.current.a) { aborts.current.a.abort(); aborts.current.a = null; }
    if (aborts.current.b) { aborts.current.b.abort(); aborts.current.b = null; }
  };

  const sealSide = async (side, modelRecord, sideState, setSide) => {
    if (!wallet.address) { toast('Connect your wallet first.', 'warning'); return; }
    if (!sideState.text) return;
    if (!window.ethereum) { toast('No wallet provider', 'error'); return; }
    setSide(s => ({ ...s, sealing: true, err: null }));
    try {
      const provider = new window.ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      const messages = [
        { role: 'user',      content: prompt.trim(), ts: Date.now() },
        { role: 'assistant', content: sideState.text, ts: Date.now() },
      ];
      const result = await window.NousPipeline.runSealConversation({
        author: wallet.address,
        model:  modelRecord.apiId,
        messages,
        signer,
      });
      setSide(s => ({ ...s, sealing: false, sealed: result }));
      toast(`Side ${side.toUpperCase()} sealed (#${result.id ?? '—'})`, 'success');
    } catch (err) {
      console.error(err);
      const msg = err?.shortMessage || err?.reason || err?.message || 'Seal failed';
      setSide(s => ({ ...s, sealing: false, err: msg }));
      toast(msg, 'error');
    }
  };

  const reset = () => {
    stopAll();
    setA(blank()); setB(blank());
  };

  const Column = ({ side, modelRecord, current, setSide }) => {
    const sealedHref = current.sealed?.id != null ? () => go('record', current.sealed.id) : null;
    const isSame = side === 'b' && modelA === modelB;
    return <Card style={{ display: 'flex', flexDirection: 'column', gap: 10, minHeight: 380 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <I name="sparkles" size={16} style={{ color: 'var(--sky-600)' }} />
        <select className="input" value={side === 'a' ? modelA : modelB}
          onChange={e => side === 'a' ? setModelA(e.target.value) : setModelB(e.target.value)}
          disabled={current.status === 'sending' || current.sealing}
          style={{ flex: 1, fontSize: 13 }}>
          {MOCK.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
        {current.usage && (
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>
            {current.usage.total_tokens || (current.usage.prompt_tokens || 0) + (current.usage.completion_tokens || 0)} tok
          </span>
        )}
      </div>

      <div style={{
        flex: 1, minHeight: 240, padding: 14,
        background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(255,255,255,0.8)',
        borderRadius: 12, overflowY: 'auto', maxHeight: 480,
      }}>
        {isSame ? (
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-poetic)', fontSize: 14, textAlign: 'center', padding: 30 }}>
            Pick a different model on this side to compare.
          </div>
        ) : current.status === 'sending' && !current.text ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)' }}>
            <div className="spin" style={{ width: 14, height: 14, border: '2px solid rgba(2,136,209,0.2)', borderTopColor: 'var(--sky-500)', borderRadius: '50%' }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13 }}>{modelRecord.name} is thinking…</span>
          </div>
        ) : current.text ? (
          <MarkdownContent text={current.text} />
        ) : (
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-poetic)', fontSize: 14, textAlign: 'center', padding: 30 }}>
            Output will appear here.
          </div>
        )}
      </div>

      {current.err && (
        <div style={{ background: 'rgba(255,138,128,0.18)', border: '1px solid rgba(229,57,53,0.4)', borderRadius: 10, padding: '8px 12px', fontSize: 12, wordBreak: 'break-word' }}>
          <I name="x-circle" size={12} style={{ color: '#E53935', marginRight: 6, verticalAlign: 'middle' }} />
          {current.err}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        {current.sealed ? (
          <>
            <Badge variant="verified"><I name="check" size={10} /> Sealed</Badge>
            {current.sealed.id != null && (
              <Button variant="ghost" size="sm" onClick={sealedHref}>
                Record #{current.sealed.id} <I name="arrow-right" size={12} />
              </Button>
            )}
          </>
        ) : (
          <Button variant="ghost" size="sm"
            onClick={() => sealSide(side, modelRecord, current, setSide)}
            disabled={!current.text || current.sealing || current.status === 'sending' || isSame}>
            {current.sealing ? <><div className="spin" style={{ width: 12, height: 12, border: '2px solid rgba(2,136,209,0.3)', borderTopColor: 'var(--sky-500)', borderRadius: '50%' }} /> Sealing…</>
                              : <><I name="lock" size={12} /> Seal this side</>}
          </Button>
        )}
        {current.text && !current.sealed && (
          <Button variant="ghost" size="sm" onClick={() => { navigator.clipboard?.writeText(current.text); toast('Copied', 'info'); }}>
            <I name="copy" size={12} /> Copy
          </Button>
        )}
      </div>
    </Card>;
  };

  return <div style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto', padding: '32px 24px 96px' }}>
    {/* Header */}
    <div style={{ marginBottom: 18 }}>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 44, margin: 0, letterSpacing: '-0.02em' }}>Compare models</h1>
      <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 16, color: 'var(--text-secondary)', margin: '6px 0 0' }}>
        Same prompt, two minds. Seal whichever stands up.
      </p>
    </div>

    {/* Composer */}
    <Card style={{ marginBottom: 16 }}>
      <Textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={e => {
          if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); run(); }
        }}
        placeholder="Ask the same thing of both models…"
        disabled={a.status === 'sending' || b.status === 'sending'}
        style={{ width: '100%', minHeight: 80, marginBottom: 10 }}
      />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-display)', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
          Temp · {temp}
          <input type="range" min="0" max="2" step="0.1" value={temp} onChange={e => setTemp(parseFloat(e.target.value))} style={{ width: 120, accentColor: 'var(--sky-500)' }} />
        </label>
        <span style={{ flex: 1 }} />
        {(a.status === 'sending' || b.status === 'sending')
          ? <Button variant="ghost" size="md" onClick={stopAll}>Stop <I name="x-circle" size={14} /></Button>
          : <Button variant="primary" size="md" onClick={run} disabled={!prompt.trim() || !wallet.address}>
              <I name="git-compare" size={14} /> Run both
            </Button>}
        <Button variant="ghost" size="sm" onClick={reset} disabled={a.status === 'sending' || b.status === 'sending'}>
          <I name="rotate-ccw" size={13} /> Reset
        </Button>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>
        Ctrl/Cmd+Enter to run · Each side seals into its own on-chain record.
      </div>
    </Card>

    {/* Two columns */}
    <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
      <Column side="a" modelRecord={recordA} current={a} setSide={setA} />
      <Column side="b" modelRecord={recordB} current={b} setSide={setB} />
    </div>

    {/* Footer hint */}
    {!wallet.address && (
      <div style={{ textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginTop: 14 }}>
        Connect a wallet to run + seal comparisons.
      </div>
    )}
  </div>;
};

Object.assign(window, { Compare });
