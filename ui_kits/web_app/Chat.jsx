// Chat page — multi-turn pipeline with streaming, persona, reset, history.
//
//   Free-form chat: every "Send" calls NousPipeline.runChat which forwards
//   the full running message history (incl. an optional system persona) to
//   the attester. With streaming on, tokens arrive live and we update the
//   in-flight assistant bubble as they come in.
//
//   On seal: NousPipeline.runSealConversation finalises the transcript,
//   encrypts the full message array (system row included so the persona is
//   provable), uploads ciphertext, asks the attester to sign, calls
//   NousRecord.seal(). After sealing we kick off a tiny title summarisation
//   call and stash the result locally as the conversation's title.
//
//   Sidebar: when a wallet is connected, we read the user's records from
//   chain and show them as past conversations with their local titles.
//   Clicking one navigates to /record so they can decrypt + read it.

const Chat = ({ go, continueSeed, clearContinueSeed }) => {
  const wallet = useWallet();
  const toast  = useToast();

  // ---- model + tuning loaded from Settings ------------------------------
  const loadDefault = (k, fb) => {
    try { const v = JSON.parse(localStorage.getItem(k)); return v == null ? fb : v; }
    catch { return fb; }
  };
  const savedModelId   = loadDefault('mnemos_default_model', MOCK.models[0].id);
  const initialModelId = MOCK.models.some(m => m.id === savedModelId) ? savedModelId : MOCK.models[0].id;

  const [model,   setModel]   = useState(initialModelId);
  const [temp,    setTemp]    = useState(loadDefault('mnemos_default_temp', 0.7));
  const [maxTok,  setMaxTok]  = useState(1024);
  const [showAdv, setShowAdv] = useState(false);
  const [stream,  setStream]  = useState(loadDefault('mnemos_stream', true));

  // ---- persona ---------------------------------------------------------
  const personas = useMemo(
    () => window.NousPipeline.loadPersonas(wallet.address),
    [wallet.address],
  );
  const [personaId,     setPersonaId]     = useState('none');
  const [personaPrompt, setPersonaPrompt] = useState('');
  const [showPersona,   setShowPersona]   = useState(false);
  useEffect(() => {
    const p = personas.find(x => x.id === personaId);
    setPersonaPrompt(p ? p.prompt : '');
  }, [personaId, personas]);

  // ---- conversation state ----------------------------------------------
  // messages: [{ role, content, ts, usage? }]. The system row (if any) is
  // prepended at send-time so toggling persona during the chat doesn't
  // retroactively rewrite history — but once the user hits Send it's locked in.
  const [messages, setMessages] = useState([]);
  const [input,    setInput]    = useState('');
  const [convId,   setConvId]   = useState(() => window.NousPipeline.newConversationId());

  // ---- continue-from-record seed ---------------------------------------
  // App passes a sealed envelope; we hydrate `messages` once and clear the
  // seed so a subsequent navigation back to /chat starts fresh.
  useEffect(() => {
    if (!continueSeed) return;
    const env = continueSeed.envelope || continueSeed;
    if (!env) return;
    let preload = [];
    if (env.v === 2 && Array.isArray(env.messages)) {
      preload = env.messages
        .filter(m => m && m.role !== 'system' && typeof m.content === 'string')
        .map(m => ({ role: m.role, content: m.content, ts: Date.now() }));
    } else if (env.prompt && env.response) {
      preload = [
        { role: 'user',      content: env.prompt,   ts: Date.now() },
        { role: 'assistant', content: env.response, ts: Date.now() },
      ];
    }
    if (preload.length) {
      setMessages(preload);
      // Try to align the model selector with the source record's model.
      if (env.model) {
        const match = MOCK.models.find(m => m.apiId === env.model || m.name === env.model || m.id === env.model);
        if (match) setModel(match.id);
      }
      // Try to lift system persona if any
      const sys = (env.v === 2 && Array.isArray(env.messages)) ? env.messages.find(m => m.role === 'system') : null;
      if (sys?.content) {
        setPersonaPrompt(sys.content);
        setPersonaId('custom');
      }
      toast(`Continuing from sealed conversation (${preload.length} message${preload.length === 1 ? '' : 's'})`, 'info');
    }
    if (typeof clearContinueSeed === 'function') clearContinueSeed();
  }, [continueSeed]);

  // status: 'idle' | 'sending' | 'sealing' | 'success' | 'error'
  const [status, setStatus] = useState('idle');
  const [step,   setStep]   = useState(0);
  const [err,    setErr]    = useState(null);
  const [sealed, setSealed] = useState(null);

  // The streaming assistant bubble — separate from `messages` so we can
  // update it character-by-character without re-keying the whole list.
  const [streamingText, setStreamingText] = useState('');
  const streamAbortRef = useRef(null);

  // Sidebar — past sealed records by this wallet.
  const [history,        setHistory]        = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const sealStepLabels = [
    'Computing conversation hashes',
    'Deriving your encryption key',
    'Encrypting the conversation',
    'Embedding ciphertext on-chain',
    'Sign with your wallet to self-attest',
    'Anchoring on Base',
  ];

  const modelRecord = MOCK.models.find(m => m.id === model) || MOCK.models[0];
  const modelName   = modelRecord.name;
  const modelApiId  = modelRecord.apiId || modelRecord.name;

  const messageListRef = useRef(null);
  useEffect(() => {
    if (messageListRef.current) {
      messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
    }
  }, [messages, status, streamingText]);

  // System row included in the canonical transcript when persona has text.
  // We always prepend it freshly from `personaPrompt` because we want every
  // turn the LLM sees to start with the same system message.
  const buildSendMessages = (extra) => {
    const base = personaPrompt.trim()
      ? [{ role: 'system', content: personaPrompt.trim() }]
      : [];
    return [...base, ...extra.map(({ role, content }) => ({ role, content }))];
  };

  const userTurnCount = messages.filter(m => m.role === 'user').length;
  const asstTurnCount = messages.filter(m => m.role === 'assistant').length;
  const canSeal       = userTurnCount > 0 && asstTurnCount > 0 && status === 'idle';

  // Session token totals — sums all assistant.usage entries we've collected.
  // Streaming responses don't carry usage (the SSE endpoint doesn't surface
  // it), so totals are most accurate when streaming is off.
  const sessionUsage = useMemo(() => {
    let p = 0, c = 0, t = 0, hits = 0;
    for (const m of messages) {
      if (m.usage) {
        p += m.usage.prompt_tokens || 0;
        c += m.usage.completion_tokens || 0;
        t += m.usage.total_tokens || ((m.usage.prompt_tokens || 0) + (m.usage.completion_tokens || 0));
        hits++;
      }
    }
    return { promptTokens: p, completionTokens: c, totalTokens: t, hits };
  }, [messages]);

  // ---- load history when wallet (re)connects ----------------------------
  useEffect(() => {
    let cancelled = false;
    if (!wallet.address) { setHistory([]); return; }
    setHistoryLoading(true);
    (async () => {
      try {
        const rows = await window.NousContract.fetchRecordsByAuthor(wallet.address);
        if (cancelled) return;
        const meta = window.NousPipeline.loadMeta(wallet.address);
        const enriched = rows
          .filter(r => !meta[r.id]?.hidden)
          .map(r => ({ ...r, title: meta[r.id]?.title || null }));
        setHistory(enriched);
      } catch (err) {
        console.warn('history fetch failed', err);
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [wallet.address]);

  // ---- send a turn ------------------------------------------------------
  const send = async () => {
    if (!wallet.address) { toast('Connect your wallet first.', 'warning'); return; }
    const text = input.trim();
    if (!text) return;
    const apiKey = window.NousPipeline.getApiKey();
    if (!apiKey) { toast('Add your Nous API key in Settings first.', 'warning'); return; }

    const next = [...messages, { role: 'user', content: text, ts: Date.now() }];
    setMessages(next);
    setInput('');
    setStatus('sending');
    setErr(null);
    setStreamingText('');

    try {
      if (stream) {
        const ac = new AbortController();
        streamAbortRef.current = ac;
        const result = await window.NousPipeline.runChat({
          model:       modelApiId,
          messages:    buildSendMessages(next),
          temperature: temp,
          maxTokens:   maxTok,
          apiKey,
          signal:      ac.signal,
          onToken:     (_piece, full) => setStreamingText(full),
        });
        streamAbortRef.current = null;
        setMessages([...next, { role: 'assistant', content: result.response, ts: Date.now() }]);
      } else {
        const result = await window.NousPipeline.runChat({
          model:       modelApiId,
          messages:    buildSendMessages(next),
          temperature: temp,
          maxTokens:   maxTok,
          apiKey,
        });
        setMessages([...next, { role: 'assistant', content: result.response, ts: Date.now(), usage: result.usage }]);
      }
      setStreamingText('');
      setStatus('idle');
    } catch (e) {
      console.error(e);
      const msg = e?.message || 'Send failed';
      setErr(msg);
      setStatus('error');
      // roll back the optimistic user turn so they can edit/retry
      setMessages(messages);
      setInput(text);
      setStreamingText('');
      streamAbortRef.current = null;
      toast(msg, 'error');
    }
  };

  const stopStream = () => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
    }
  };

  // ---- end & seal -------------------------------------------------------
  const endAndSeal = async () => {
    if (!canSeal) return;
    if (!window.ethereum) { toast('No wallet provider detected.', 'error'); return; }

    setStatus('sealing'); setStep(1); setErr(null);

    try {
      const provider = new window.ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      // Persona is sealed too — it's part of the canonical transcript so
      // anyone re-running the messages must include it to reproduce hashes.
      const fullMsgs = buildSendMessages(messages);

      const result = await window.NousPipeline.runSealConversation({
        author:         wallet.address,
        model:          modelApiId,
        conversationId: convId,
        messages:       fullMsgs,
        signer,
        onStep: (name) => {
          if      (name === 'hash')      setStep(1);
          else if (name === 'deriveKey') setStep(2);
          else if (name === 'encrypt')   setStep(3);
          else if (name === 'embed')     setStep(4);
          else if (name === 'attest')    setStep(5);
          else if (name === 'seal')      setStep(6);
        },
      });

      setSealed(result);
      setStatus('success');
      toast('Sealed forever', 'success');

      // Auto-title in the background — best-effort, doesn't block UI. Use
      // the smallest model in the catalog; if it fails we fall back to the
      // first user line inside generateTitle().
      if (result.id != null) {
        (async () => {
          try {
            const apiKey = window.NousPipeline.getApiKey();
            const titleModel = (MOCK.models.find(m => m.id === 'hermes-2-pro-8b') || modelRecord).apiId;
            const title = await window.NousPipeline.generateTitle({
              model: titleModel,
              messages,
              apiKey,
            });
            if (title) {
              window.NousPipeline.setRecordTitle(wallet.address, result.id, title);
              // refresh sidebar so the new entry shows up titled
              setHistory(h => [{
                id: result.id, model: modelApiId, sealedAt: Math.floor(Date.now()/1000),
                arweaveCid: result.arweaveCid, title,
              }, ...h]);
            }
          } catch (err) { console.warn('auto-title failed:', err.message); }
        })();
      }
    } catch (e) {
      console.error(e);
      const msg = e?.shortMessage || e?.reason || e?.message || 'Seal failed';
      setErr(msg);
      setStatus('error');
      toast(msg, 'error');
    }
  };

  // Reset chat without reloading the page — gives a fresh conversation id.
  const startOver = (silent) => {
    if (!silent && messages.length > 0 && !sealed) {
      const ok = window.confirm('Discard this conversation? It hasn\'t been sealed yet, so it will be lost.');
      if (!ok) return;
    }
    stopStream();
    setMessages([]); setInput(''); setStep(0); setErr(null);
    setSealed(null); setStatus('idle');
    setStreamingText('');
    setConvId(window.NousPipeline.newConversationId());
  };

  // ---- explorer URLs ----------------------------------------------------
  const baseScanTx = sealed?.txHash
    ? `https://sepolia.basescan.org/tx/${sealed.txHash}`
    : null;
  // Only show Arweave link for genuine ar:// CIDs — not for onchain: or inline: blobs.
  const arweaveUrl = sealed?.arweaveCid
    && !sealed.arweaveCid.startsWith('onchain:')
    && !sealed.arweaveCid.startsWith('inline:')
    ? `https://arweave.net/${sealed.arweaveCid.replace(/^ar:\/\//, '')}`
    : null;

  // ---- success / sealing screens -- displayed in place of the chat ------
  if (status === 'sealing') {
    return <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '48px 32px 96px' }}>
      <Card>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: '0 0 24px' }}>Sealing your conversation…</h3>
        <ol style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {sealStepLabels.map((label, i) => {
            const done = i + 1 < step, active = i + 1 === step;
            return <li key={i} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0', borderBottom: i < sealStepLabels.length - 1 ? '1px solid rgba(255,255,255,0.6)' : 'none' }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%',
                background: done ? 'linear-gradient(180deg,#AED581,#689F38)' : active ? 'var(--gradient-water)' : 'rgba(255,255,255,0.6)',
                border: '1px solid rgba(255,255,255,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: done || active ? '#fff' : 'var(--text-muted)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)', flexShrink: 0 }}>
                {done ? <I name="check" size={16} /> : active ? <div className="spin" style={{ width: 14, height: 14, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%' }} /> : <span style={{ fontSize: 13, fontFamily: 'var(--font-mono)' }}>{i+1}</span>}
              </div>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 15, color: done ? 'var(--grass-600)' : active ? 'var(--text-primary)' : 'var(--text-muted)' }}>{label}</span>
            </li>;
          })}
        </ol>
      </Card>
    </div>;
  }

  if (status === 'success' && sealed) {
    return <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '48px 32px 96px' }}>
      <Card style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'linear-gradient(180deg,#AED581,#689F38)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.6), 0 8px 24px rgba(104,159,56,0.4)', margin: '0 auto 24px' }}>
          <I name="check" size={52} />
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, margin: 0, letterSpacing: '-0.01em' }}>Sealed forever.</h3>
        <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 18, color: 'var(--text-secondary)', margin: '10px 0 24px' }}>
          {sealed.turnCount} message{sealed.turnCount === 1 ? '' : 's'} preserved. Clear. Permanent. Yours.
        </p>
        {sealed.id != null && (
          <div style={{ display: 'inline-block', fontFamily: 'var(--font-mono)', fontSize: 13, padding: '8px 14px', background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.8)', borderRadius: 10 }}>
            Record #{sealed.id}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '28px auto 0', maxWidth: 360 }}>
          {baseScanTx && <a href={baseScanTx} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--sky-600)', textDecoration: 'none', padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.5)' }}>View on BaseScan <I name="external-link" size={14} /></a>}
          {arweaveUrl && <a href={arweaveUrl} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: 'var(--font-display)', fontWeight: 600, color: 'var(--sky-600)', textDecoration: 'none', padding: '8px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.5)' }}>View on Arweave <I name="external-link" size={14} /></a>}
          {sealed.storageMode === 'inline' && (
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)', padding: '6px 12px' }}>
              Storage mode: <span style={{ fontFamily: 'var(--font-mono)' }}>inline</span> — ciphertext lives in the on-chain hash only. Switch to Irys/ar.io in Settings for permanent hosting.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 24 }}>
          <Button variant="ghost" size="sm" onClick={() => startOver(true)}>New conversation</Button>
          <Button variant="secondary" size="sm" onClick={() => go('my-records')}>Go to My Records</Button>
        </div>
      </Card>
    </div>;
  }

  // ---- main chat layout -------------------------------------------------
  // Two-column: history sidebar (240px) + chat column (flex). Sidebar only
  // appears when wallet is connected; otherwise we centre the chat column.
  return <div style={{ position: 'relative', zIndex: 1, maxWidth: 1280, margin: '0 auto', padding: '32px 24px 64px' }}>
    <div style={{ display: 'grid', gridTemplateColumns: wallet.address ? '260px 1fr' : '1fr', gap: 18, alignItems: 'start' }}>

      {/* ---- Sidebar: past sealed conversations -------------------- */}
      {wallet.address && (
        <Card style={{ padding: 0, position: 'sticky', top: 80, maxHeight: 'calc(100vh - 100px)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <I name="scroll-text" size={14} style={{ color: 'var(--sky-600)' }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)' }}>Past records</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{history.length}</span>
          </div>
          <div style={{ overflowY: 'auto', padding: 8, flex: 1, minHeight: 60 }}>
            {historyLoading ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                <div className="spin" style={{ width: 16, height: 16, border: '2px solid rgba(41,182,246,0.2)', borderTopColor: 'var(--sky-500)', borderRadius: '50%', margin: '0 auto 6px' }} />
                Reading chain…
              </div>
            ) : history.length === 0 ? (
              <div style={{ padding: '20px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12, fontFamily: 'var(--font-poetic)' }}>
                Sealed conversations will appear here.
              </div>
            ) : history.map(r => (
              <button key={r.id}
                onClick={() => go('record', r.id)}
                style={{
                  display: 'block', width: '100%', textAlign: 'left',
                  background: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.6)',
                  borderRadius: 10, padding: '10px 12px', marginBottom: 6, cursor: 'pointer',
                }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {r.title || `Record #${r.id}`}
                </div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-muted)', marginTop: 2, display: 'flex', justifyContent: 'space-between' }}>
                  <span>#{r.id}</span><span>{relativeTime(r.sealedAt)}</span>
                </div>
              </button>
            ))}
          </div>
        </Card>
      )}

      {/* ---- Chat column ------------------------------------------- */}
      <div>
        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 38, margin: 0, letterSpacing: '-0.01em' }}>New inscription</h1>
          <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 16, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
            Talk freely. When you're done, seal the whole conversation as one permanent record.
          </p>
        </div>

        {/* Top bar: model + reset + persona toggle + tuning + seal */}
        <Card style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', marginBottom: 12, flexWrap: 'wrap' }}>
          <I name="sparkles" size={18} style={{ color: 'var(--sky-600)' }} />
          <select className="input" value={model} onChange={e => setModel(e.target.value)}
            disabled={messages.length > 0}
            style={{ flex: 1, minWidth: 200, maxWidth: 280, appearance: 'none', cursor: messages.length > 0 ? 'not-allowed' : 'pointer', opacity: messages.length > 0 ? 0.7 : 1 }}>
            {MOCK.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>

          <button onClick={() => setShowPersona(!showPersona)} title="System persona"
            style={{
              background: showPersona || personaPrompt.trim() ? 'rgba(2,136,209,0.12)' : 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(255,255,255,0.7)', borderRadius: 8, padding: '6px 10px', cursor: messages.length > 0 ? 'not-allowed' : 'pointer',
              color: 'var(--sky-600)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12,
              display: 'inline-flex', alignItems: 'center', gap: 6, opacity: messages.length > 0 ? 0.6 : 1,
            }}
            disabled={messages.length > 0}>
            <I name="user" size={13} /> {personas.find(p => p.id === personaId)?.name || 'Persona'}
          </button>

          <button onClick={() => setShowAdv(!showAdv)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sky-600)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12, display: 'flex', alignItems: 'center', gap: 4 }}>
            <I name="sliders-horizontal" size={13} /> Tuning
          </button>

          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginLeft: 'auto' }}>
            {userTurnCount} turn{userTurnCount === 1 ? '' : 's'}
          </span>

          <Button variant="ghost" size="sm" onClick={() => startOver(false)} title="Reset chat">
            <I name="rotate-ccw" size={14} /> Reset
          </Button>
          <Button variant="primary" size="sm" onClick={endAndSeal} disabled={!canSeal}>
            End & seal <I name="lock" size={14} />
          </Button>
        </Card>

        {showPersona && messages.length === 0 && (
          <Card style={{ padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
              <span style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Preset</span>
              {personas.map(p => (
                <button key={p.id} onClick={() => setPersonaId(p.id)}
                  style={{
                    background: personaId === p.id ? 'var(--gradient-water)' : 'rgba(255,255,255,0.5)',
                    color: personaId === p.id ? '#fff' : 'var(--text-primary)',
                    border: '1px solid rgba(255,255,255,0.7)',
                    borderRadius: 999, padding: '4px 12px', fontSize: 12, fontFamily: 'var(--font-display)', fontWeight: 600, cursor: 'pointer',
                  }}>{p.name}</button>
              ))}
            </div>
            <Textarea
              value={personaPrompt}
              onChange={e => { setPersonaPrompt(e.target.value); setPersonaId('custom'); }}
              placeholder="Optional system prompt — set the assistant's role, tone, constraints. Leave empty for none."
              style={{ width: '100%', minHeight: 60, resize: 'vertical', fontSize: 13 }}
            />
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6, fontFamily: 'var(--font-body)' }}>
              The persona is part of the sealed transcript — it's hashed on-chain so anyone re-running the conversation must include it.
            </div>
          </Card>
        )}

        {showAdv && <Card style={{ padding: 14, marginBottom: 12 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
            {/* Temperature — takes remaining space */}
            <div style={{ flex: '2 1 160px', minWidth: 0 }}>
              <label style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Temperature · {temp}</label>
              <input type="range" min="0" max="2" step="0.1" value={temp} onChange={e => setTemp(parseFloat(e.target.value))} style={{ width: '100%', accentColor: 'var(--sky-500)', display: 'block' }} />
            </div>
            {/* Max tokens — fixed narrow */}
            <div style={{ flex: '0 0 100px' }}>
              <label style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>Max tokens</label>
              <Input type="number" value={maxTok} onChange={e => setMaxTok(parseInt(e.target.value) || 0)} style={{ width: '100%' }} />
            </div>
            {/* Streaming toggle — shrink-proof */}
            <div style={{ flex: '0 0 auto' }}>
              <label style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 6 }}>Streaming</label>
              <button onClick={() => { const v = !stream; setStream(v); localStorage.setItem('mnemos_stream', JSON.stringify(v)); }}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: stream ? 'var(--gradient-water)' : 'rgba(30,90,160,0.08)',
                  color: stream ? '#fff' : 'var(--text-secondary)',
                  border: stream ? '1px solid rgba(2,136,209,0.4)' : '1px solid rgba(30,90,160,0.15)',
                  borderRadius: 999, padding: '5px 12px',
                  fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11,
                  cursor: 'pointer', whiteSpace: 'nowrap', letterSpacing: '0.04em',
                }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: stream ? 'rgba(255,255,255,0.9)' : 'rgba(30,90,160,0.3)', flexShrink: 0 }} />
                {stream ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </Card>}

        {/* Message list */}
        <Card style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          <div ref={messageListRef} style={{ minHeight: 360, maxHeight: 560, overflowY: 'auto', padding: '20px 22px' }}>
            {messages.length === 0 && status !== 'sending' && (
              <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
                <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.6), 0 6px 18px rgba(2,136,209,0.25)', margin: '0 auto 16px' }}>
                  <I name="feather" size={32} />
                </div>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 18, color: 'var(--text-primary)' }}>Start typing below.</div>
                <div style={{ fontFamily: 'var(--font-poetic)', fontSize: 15, marginTop: 6, maxWidth: 380, marginLeft: 'auto', marginRight: 'auto' }}>
                  Every turn stays in this browser. Sealing publishes the encrypted transcript permanently.
                </div>
                {personaPrompt.trim() && (
                  <div style={{ marginTop: 14, display: 'inline-block', background: 'rgba(2,136,209,0.08)', border: '1px solid rgba(2,136,209,0.25)', borderRadius: 10, padding: '8px 14px', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--sky-700)', maxWidth: 480, textAlign: 'left' }}>
                    <strong style={{ fontFamily: 'var(--font-display)' }}>Persona active:</strong> {personaPrompt.slice(0, 140)}{personaPrompt.length > 140 ? '…' : ''}
                  </div>
                )}
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 14 }}>
                <div style={{
                  maxWidth: '78%',
                  background: m.role === 'user' ? 'var(--gradient-water)' : 'rgba(255,255,255,0.65)',
                  color:      m.role === 'user' ? '#fff' : 'var(--text-primary)',
                  border:     m.role === 'user' ? '1px solid rgba(255,255,255,0.6)' : '1px solid rgba(255,255,255,0.85)',
                  borderRadius: 14,
                  padding: '12px 16px',
                  fontFamily: 'var(--font-body)',
                  fontSize: 15,
                  lineHeight: 1.6,
                  wordWrap: 'break-word',
                  boxShadow: m.role === 'user' ? '0 4px 14px rgba(2,136,209,0.25)' : 'inset 0 1px 0 rgba(255,255,255,0.7)',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>{m.role === 'user' ? 'You' : modelName}</span>
                    {m.usage && (
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 500, opacity: 0.7, fontSize: 10 }}>
                        · {(m.usage.prompt_tokens || 0)}+{(m.usage.completion_tokens || 0)}={(m.usage.total_tokens || ((m.usage.prompt_tokens||0)+(m.usage.completion_tokens||0)))} tok
                      </span>
                    )}
                  </div>
                  {m.role === 'assistant'
                    ? <MarkdownContent text={m.content} />
                    : <div style={{ whiteSpace: 'pre-wrap' }}>{m.content}</div>}
                </div>
              </div>
            ))}
            {status === 'sending' && (streamingText ? (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 14 }}>
                <div style={{
                  maxWidth: '78%', background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.85)',
                  borderRadius: 14, padding: '12px 16px', fontFamily: 'var(--font-body)', fontSize: 15,
                  lineHeight: 1.6, wordWrap: 'break-word', color: 'var(--text-primary)',
                  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7)',
                }}>
                  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {modelName}
                    <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: '50%', background: 'var(--sky-500)', animation: 'pulse 1.4s ease-in-out infinite' }} />
                  </div>
                  <MarkdownContent text={streamingText} />
                </div>
              </div>
            ) : (
              <div style={{ display: 'flex', justifyContent: 'flex-start', marginBottom: 14 }}>
                <div style={{ background: 'rgba(255,255,255,0.65)', border: '1px solid rgba(255,255,255,0.85)', borderRadius: 14, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', fontSize: 14 }}>
                  <div className="spin" style={{ width: 14, height: 14, border: '2px solid rgba(2,136,209,0.2)', borderTopColor: 'var(--sky-500)', borderRadius: '50%' }} />
                  {modelName} is thinking…
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Composer */}
        <Card style={{ padding: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
            <Textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  if (status === 'idle' || status === 'error') send();
                }
              }}
              placeholder={messages.length === 0 ? 'Ask Nous anything…' : 'Continue the conversation…'}
              disabled={status === 'sending'}
              style={{ flex: 1, minHeight: 56, maxHeight: 200, resize: 'vertical' }}
            />
            {status === 'sending' && stream ? (
              <Button variant="ghost" size="lg" onClick={stopStream} style={{ minWidth: 110, justifyContent: 'center' }}>
                Stop <I name="x-circle" size={16} />
              </Button>
            ) : (
              <Button variant="primary" size="lg" onClick={send}
                disabled={status === 'sending' || !input.trim() || !wallet.address}
                style={{ minWidth: 110, justifyContent: 'center' }}>
                {status === 'sending' ? <div className="spin" style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%' }} /> : <>Send <I name="arrow-right" size={16} /></>}
              </Button>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', marginTop: 6 }}>
            {sessionUsage.totalTokens > 0 && (
              <span title={`${sessionUsage.hits} usage frame${sessionUsage.hits === 1 ? '' : 's'} (streaming responses don't carry token counts)`}>
                {sessionUsage.totalTokens.toLocaleString()} tok session · {sessionUsage.promptTokens}→in {sessionUsage.completionTokens}→out
              </span>
            )}
            <span style={{ marginLeft: 'auto' }}>Enter to send · Shift+Enter for newline · {input.length} chars</span>
          </div>
        </Card>

        {/* Inline error */}
        {status === 'error' && err && (
          <Card style={{ padding: 12, marginTop: 10, background: 'rgba(255,138,128,0.18)', border: '1px solid rgba(229,57,53,0.4)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)' }}>
              <I name="x-circle" size={18} style={{ color: '#E53935', flexShrink: 0 }} />
              <span style={{ flex: 1, wordBreak: 'break-word' }}>{err}</span>
              {messages.length > 0 && <Button variant="ghost" size="sm" onClick={endAndSeal} disabled={!canSeal}>Retry seal</Button>}
              <Button variant="ghost" size="sm" onClick={() => { setErr(null); setStatus('idle'); }}>Dismiss</Button>
            </div>
          </Card>
        )}

        {/* Footer hints */}
        <div style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', marginTop: 14 }}>
          {!wallet.address
            ? 'Connect your wallet to begin.'
            : !window.NousPipeline.getApiKey()
              ? <>Add your Nous API key in <a onClick={() => go('settings')} style={{ color: 'var(--sky-600)', cursor: 'pointer', fontWeight: 600 }}>Settings</a>.</>
              : 'Your key is sent per-request to the attester and never stored server-side.'}
        </div>
      </div>
    </div>
  </div>;
};

Object.assign(window, { Chat });
