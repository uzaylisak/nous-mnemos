// App shell — nav, footer, page router. Wires theme, command palette,
// global keyboard shortcuts, onboarding, and hash forensic search.
const AppShell = () => {
  const [page, setPage] = useState('landing');
  const [recordId, setRecordId] = useState(142);
  const [userAddress, setUserAddress] = useState(null);     // for /user/:address
  const [continueSeed, setContinueSeed] = useState(null);   // sealed envelope handed to Chat
  const [compareSeed,  setCompareSeed]  = useState(null);   // {prompt, models[]} handed to Compare
  const [replaySeed,   setReplaySeed]   = useState(null);   // {recordId} handed to Replay
  const wallet = useWallet();
  const connected = !!wallet.address;
  const toast = useToast();

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [hashFinderOpen, setHashFinderOpen] = useState(false);
  const [onboardingOpen, setOnboardingOpen] = useState(false);

  // Restore persisted nav state.
  useEffect(() => {
    try {
      const s = JSON.parse(localStorage.getItem('mnemos_state') || '{}');
      if (s.page) setPage(s.page);
      if (s.recordId) setRecordId(s.recordId);
      if (s.userAddress) setUserAddress(s.userAddress);
    } catch {}
    // First-run onboarding
    try {
      const seen = localStorage.getItem('mnemos_onboarded');
      if (!seen) setOnboardingOpen(true);
    } catch {}
  }, []);
  useEffect(() => {
    localStorage.setItem('mnemos_state', JSON.stringify({ page, recordId, userAddress }));
  }, [page, recordId, userAddress]);

  // Generic navigation. Extra arg is repurposed per page:
  //   go('user', address)        → user profile
  //   go('record', id)           → record detail
  //   go('chat', { continue })   → chat with sealed transcript pre-loaded
  //   go('compare', { prompt })  → comparison page seed
  //   go('replay', { recordId }) → replay page seed
  const go = (p, arg) => {
    setPage(p);
    if (p === 'record'  && arg)               setRecordId(arg);
    if (p === 'user')                         setUserAddress(arg || null);
    if (p === 'chat'    && arg && typeof arg === 'object') setContinueSeed(arg);
    if (p === 'compare' && arg && typeof arg === 'object') setCompareSeed(arg);
    if (p === 'replay'  && arg && typeof arg === 'object') setReplaySeed(arg);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const navLinks = [
    ['landing',    'Home'],
    ['chat',       'New Chat'],
    ['my-records', 'My Records'],
    ['explorer',   'Explorer'],
    ['compare',    'Compare'],
    ['attesters',  'Attesters'],
    ['about',      'About'],
  ];

  // Surface wallet errors as toasts
  useEffect(() => { if (wallet.error) toast(wallet.error, 'error'); }, [wallet.error]);

  const handleConnect = async () => {
    if (!wallet.hasProvider) {
      toast('No wallet detected. Install MetaMask or an EIP-1193 wallet.', 'error');
      window.open('https://metamask.io/download/', '_blank', 'noopener');
      return;
    }
    await wallet.connect();
  };

  const shortAddr = wallet.address ? `${wallet.address.slice(0,6)}…${wallet.address.slice(-4)}` : '';

  // ---- Command palette items ------------------------------------------
  const paletteItems = useMemo(() => {
    const base = [
      { label: 'Home',          icon: 'sparkles',     hint: 'g h',     action: () => go('landing') },
      { label: 'New chat',      icon: 'feather',      hint: 'g n',     action: () => go('chat') },
      { label: 'My records',    icon: 'scroll-text',  hint: 'g r',     action: () => go('my-records') },
      { label: 'Explorer',      icon: 'globe',        hint: 'g e',     action: () => go('explorer') },
      { label: 'Compare models',icon: 'git-compare',  hint: 'g c',     action: () => go('compare') },
      { label: 'Attesters',     icon: 'shield',       hint: 'g a',     action: () => go('attesters') },
      { label: 'Settings',      icon: 'settings',     hint: 'g s',     action: () => go('settings') },
      { label: 'About',         icon: 'book-open',    hint: 'g b',     action: () => go('about') },
      { label: 'Find by hash…', icon: 'search',       hint: 'Ctrl+/',  action: () => setHashFinderOpen(true) },
      { label: 'Show onboarding', icon: 'help-circle', hint: '',       action: () => setOnboardingOpen(true) },
    ];
    if (connected) {
      base.unshift({ label: 'My profile', icon: 'user', hint: '', action: () => go('user', wallet.address) });
    }
    return base;
  }, [connected, wallet.address]);

  // ---- Global keyboard shortcuts --------------------------------------
  useEffect(() => {
    const onKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      const isInput = tag === 'input' || tag === 'textarea' || e.target?.isContentEditable;
      const meta = e.ctrlKey || e.metaKey;
      // Ctrl/Cmd+K — palette
      if (meta && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); setPaletteOpen(o => !o); return; }
      // Ctrl/Cmd+/ — hash finder
      if (meta && e.key === '/') { e.preventDefault(); setHashFinderOpen(true); return; }
      // ? — show palette
      if (!isInput && e.key === '?') { e.preventDefault(); setPaletteOpen(true); return; }
      // / — focus the first input on the page
      if (!isInput && e.key === '/') {
        e.preventDefault();
        const el = document.querySelector('main input, main textarea');
        if (el) el.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return <div style={{ minHeight: '100vh', background: 'var(--gradient-page-bg)', position: 'relative' }}>
      {page === 'landing' ? null : <Decor variant="page" />}

      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 12, zIndex: 50, margin: '12px 12px 0', display: 'flex',
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(20px) saturate(1.6)',
        WebkitBackdropFilter: 'blur(20px) saturate(1.6)',
        borderRadius: 20,
        border: '1px solid rgba(255,255,255,0.85)',
        boxShadow: '0 8px 32px rgba(30,90,160,0.12), inset 0 1px 0 rgba(255,255,255,0.9)',
      }}>
        <div style={{
          flex: 1, maxWidth: 1280, margin: '0 auto',
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '10px 16px', background: 'transparent',
        }} className="resp-flex-wrap">
          <button onClick={() => go('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, padding: 0, flexShrink: 0 }}>
            <img src="../../assets/logo-mark.svg" style={{ width: 30, height: 30 }} alt="" />
            <span className="resp-hide" style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 16, color: 'var(--text-primary)', letterSpacing: '-0.005em', whiteSpace: 'nowrap' }}>Nous Mnemos</span>
          </button>
          <div className="nav-links-row" style={{ display: 'flex', gap: 0, marginLeft: 8 }}>
            {navLinks.map(([k, label]) => {
              if (k === 'my-records' && !connected) return null;
              const active = page === k;
              return <button key={k} onClick={() => go(k)} data-active={active ? 'true' : 'false'} style={{
                background: 'none',
                border: 'none', cursor: 'pointer',
                padding: '6px 8px', borderRadius: 0,
                fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 12,
                color: active ? 'var(--sky-700)' : 'var(--text-secondary)',
                transition: 'all 200ms',
                position: 'relative',
                textShadow: '0 1px 2px rgba(255,255,255,0.5)',
                borderBottom: active ? '2px solid var(--sky-500)' : '2px solid transparent',
                whiteSpace: 'nowrap',
              }}>{label}</button>;
            })}
          </div>
          <div style={{ flex: 1 }} />

          {/* Hash forensic search — icon only */}
          <button onClick={() => setHashFinderOpen(true)} title="Find by hash (Ctrl+/)"
            className="resp-hide nav-icon-btn"
            style={{
              background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(14px)',
              border: '1px solid rgba(255,255,255,0.5)', borderRadius: 10,
              width: 32, height: 32, cursor: 'pointer', color: 'var(--sky-600)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <I name="search" size={14} />
          </button>

          {/* Command palette */}
          <button onClick={() => setPaletteOpen(true)} title="Command palette (Ctrl+K)"
            className="resp-hide nav-icon-btn"
            style={{
              background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(14px)',
              border: '1px solid rgba(255,255,255,0.5)', borderRadius: 10,
              width: 32, height: 32, cursor: 'pointer', color: 'var(--sky-600)',
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <I name="command" size={14} />
          </button>

          <ChainBadge />
          <button onClick={() => go('settings')} title="Settings" className="nav-icon-btn" style={{ background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: 10, width: 32, height: 32, cursor: 'pointer', color: 'var(--sky-600)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <I name="settings" size={14} />
          </button>
          {connected ? <button onClick={() => go('user', wallet.address)} title="View your profile" style={{ background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(14px)', border: '1px solid rgba(255,255,255,0.55)', borderRadius: 999, padding: '5px 10px 5px 5px', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', flexShrink: 0 }}>
            <Avatar address={wallet.address} size={24} />
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontWeight: 700, color: 'var(--text-primary)' }}>{shortAddr}</span>
          </button> : <Button variant="primary" size="sm" onClick={handleConnect} disabled={wallet.connecting}>
            <I name="wallet" size={13} /> {wallet.connecting ? 'Connecting…' : 'Connect'}
          </Button>}
        </div>
      </nav>

      {/* Page */}
      <main style={{ position: 'relative', zIndex: 1 }}>
        {page === 'landing'     && <Landing go={go} />}
        {page === 'chat'        && <Chat go={go} continueSeed={continueSeed} clearContinueSeed={() => setContinueSeed(null)} />}
        {page === 'my-records'  && <MyRecords go={go} />}
        {page === 'explorer'    && <Explorer go={go} />}
        {page === 'record'      && <RecordDetail id={recordId} go={go} />}
        {page === 'settings'    && <Settings go={go} />}
        {page === 'attesters'   && <Attesters go={go} />}
        {page === 'about'       && <About go={go} />}
        {page === 'user'        && <UserProfile address={userAddress} go={go} />}
        {page === 'compare'     && <Compare go={go} seed={compareSeed} />}
        {page === 'replay'      && <Replay go={go} seed={replaySeed} />}
      </main>

      {/* Footer */}
      <footer style={{ position: 'relative', zIndex: 1, padding: '48px 32px 36px', maxWidth: 1240, margin: '0 auto', display: 'flex', gap: 20, alignItems: 'center', fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-secondary)' }} className="resp-flex-wrap">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="../../assets/logo-mark.svg" style={{ width: 20, height: 20 }} alt="" />
          Nous Mnemos · Built on Base · Stored on Arweave
        </div>
        <div style={{ flex: 1, display: 'flex', gap: 18, justifyContent: 'center' }} className="resp-flex-wrap">
          <a style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Docs</a>
          <a style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>GitHub</a>
          <a style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Contract</a>
          <a style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}>Terms</a>
        </div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>v0.2.0 · Testnet</div>
      </footer>

      {/* Overlays */}
      <CommandPalette items={paletteItems} open={paletteOpen} onClose={() => setPaletteOpen(false)} />
      <HashFinder open={hashFinderOpen} onClose={() => setHashFinderOpen(false)} go={go} />
      {onboardingOpen && <Onboarding go={go} wallet={wallet} onClose={() => {
        setOnboardingOpen(false);
        try { localStorage.setItem('mnemos_onboarded', '1'); } catch {}
      }} />}
    </div>;
};

// ---------- Hash forensic search ----------
// Scans the chain for any record where one of the eight hash-shaped fields
// equals the input. Useful for "I have a hash, what record is this?"
const HashFinder = ({ open, onClose, go }) => {
  const toast = useToast();
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState([]);
  const [scanned, setScanned] = useState(0);
  const [error, setError] = useState(null);
  const inputRef = useRef(null);

  useEffect(() => { if (open) { setInput(''); setHits([]); setScanned(0); setError(null); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

  const search = async () => {
    const needle = input.trim().toLowerCase();
    if (!needle) return;
    setBusy(true); setError(null); setHits([]); setScanned(0);
    try {
      const c = await window.NousContract.getReadContract();
      if (!c) throw new Error('Contract not configured');
      const total = Number(await c.totalRecords());
      if (total === 0) { setBusy(false); return; }
      const PAGE = 50;
      const found = [];
      let off = total; // walk newest-first
      while (off > 0) {
        const limit = Math.min(PAGE, off);
        off -= limit;
        const raw = await c.recordsPage(off, limit);
        const parsed = raw.map((r, i) => window.NousContract.parseRecord(r, off + i));
        for (const r of parsed) {
          const fields = [
            r.conversationId, r.promptHash, r.responseHash,
            r.plaintextHash, r.ciphertextHash,
            r.arweaveCid, r.attesterSig, r.author, r.attester,
          ].map(x => (x || '').toString().toLowerCase());
          if (fields.some(f => f === needle || f.includes(needle))) {
            found.push(r);
          }
        }
        setScanned(s => s + parsed.length);
        setHits([...found]);
        if (found.length >= 25) break; // cap
      }
    } catch (err) {
      setError(err?.message || 'Search failed');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;
  return <div onClick={onClose} style={{
    position: 'fixed', inset: 0, zIndex: 3000,
    background: 'rgba(11,40,71,0.55)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 90,
    animation: 'fadeIn 200ms var(--ease-out)',
  }}>
    <div onClick={(e) => e.stopPropagation()} className="glass" style={{ width: 680, maxWidth: '94%', padding: 20, background: 'rgba(255,255,255,0.94)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
        <I name="search" size={18} style={{ color: 'var(--sky-600)' }} />
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18 }}>Find by hash</div>
        <span style={{ flex: 1 }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(30,90,160,0.18)' }}>Esc</span>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
        <Input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') search(); else if (e.key === 'Escape') onClose(); }}
          placeholder="0x… (any of: conversationId, promptHash, ciphertextHash, address, sig, CID)"
          style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13 }} />
        <Button variant="primary" size="md" onClick={search} disabled={busy || !input.trim()}>
          {busy ? <><div className="spin" style={{ width: 12, height: 12, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%' }} /> Scanning…</> : <>Search</>}
        </Button>
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)', marginBottom: 10 }}>
        Walks the contract newest-first looking for any record whose hash-shaped field matches your input. Stops at 25 matches.
        {scanned > 0 && <> · scanned <span style={{ fontFamily: 'var(--font-mono)' }}>{scanned}</span></>}
      </div>
      {error && (
        <div style={{ background: 'rgba(255,138,128,0.18)', border: '1px solid rgba(229,57,53,0.4)', borderRadius: 10, padding: '8px 12px', fontSize: 13, marginBottom: 10 }}>
          {error}
        </div>
      )}
      <div style={{ maxHeight: 360, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {hits.length === 0 && !busy && scanned > 0 && (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-poetic)' }}>No record matched that hash.</div>
        )}
        {hits.map(r => (
          <button key={r.id} onClick={() => { onClose(); go('record', r.id); }} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
            background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(255,255,255,0.8)',
            borderRadius: 10, padding: '10px 12px', cursor: 'pointer',
          }}>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>#{r.id}</span>
            <Badge variant="model">{r.model}</Badge>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-secondary)' }}>{r.author.slice(0,8)}…{r.author.slice(-4)}</span>
            <span style={{ flex: 1 }} />
            <I name="arrow-right" size={13} style={{ color: 'var(--sky-600)' }} />
          </button>
        ))}
      </div>
    </div>
  </div>;
};

// Root — provide Wallet + Toast context before rendering the shell.
// (Dark mode was removed; the app is light-only.)
const App = () => (
  <WalletProvider>
    <ToastProvider>
      <AppShell />
    </ToastProvider>
  </WalletProvider>
);

Object.assign(window, { App, AppShell, HashFinder });

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
