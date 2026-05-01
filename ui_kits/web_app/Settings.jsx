// Settings page — API key, RPC, encryption key, defaults, danger zone
const Settings = ({ go }) => {
  const toast = useToast();
  const wallet = useWallet();

  // ---------- local state (persisted to localStorage) ----------
  const load = (k, fb) => { try { return JSON.parse(localStorage.getItem(k)) ?? fb; } catch { return fb; } };
  const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));

  const [apiKey, setApiKey]           = useState(load('mnemos_api_key', ''));
  const [showKey, setShowKey]         = useState(false);
  const [apiTestState, setApiTestState] = useState(null); // null | 'testing' | 'ok' | 'fail'
  const [apiTestMsg, setApiTestMsg]   = useState('');

  const [rpcUrl, setRpcUrl]           = useState(load('mnemos_rpc_url', 'https://sepolia.base.org'));
  const [rpcTestState, setRpcTestState] = useState(null);
  const [rpcTestMsg, setRpcTestMsg]   = useState('');

  const [contractAddr, setContractAddr] = useState(localStorage.getItem('mnemos_contract_addr') || '');
  const [detectedContract, setDetectedContract] = useState(null);
  useEffect(() => {
    window.NousContract?.loadDeployment?.().then(dep => setDetectedContract(dep?.address || null));
  }, []);

  const [defaultModel, setDefaultModel] = useState(load('mnemos_default_model', 'hermes-4-70b'));
  const [defaultTemp, setDefaultTemp]   = useState(load('mnemos_default_temp', 0.7));
  const [sessionKey, setSessionKey]     = useState(load('mnemos_session_key', true));

  // Attester service (new) — the browser never holds the LLM provider key;
  // the attester does. The UI just needs its URL + storage mode.
  const [attesterUrl, setAttesterUrl]       = useState(load('mnemos_attester_url', 'http://localhost:8787'));
  const [attesterTestState, setAttesterTestState] = useState(null); // null | 'testing' | 'ok' | 'error'
  const [attesterTestMsg, setAttesterTestMsg]     = useState('');
  const [attesterInfo, setAttesterInfo]           = useState(null);

  const [encKeyDerived, setEncKeyDerived] = useState(false); // set after signing with wallet
  const [clearConfirmOpen, setClearConfirmOpen] = useState(false);

  // ---------- mock handlers ----------
  const saveApiKey = () => {
    save('mnemos_api_key', apiKey);
    toast('API key saved locally', 'success');
  };
  const clearApiKey = () => {
    setApiKey(''); save('mnemos_api_key', ''); setApiTestState(null);
    toast('API key cleared', 'info');
  };
  const testApiKey = async () => {
    if (!apiKey.trim()) { setApiTestState('fail'); setApiTestMsg('Enter a key first'); return; }
    setApiTestState('testing'); setApiTestMsg('Pinging Nous API…');
    try {
      const res = await window.NousPipeline.testKey({ apiKey: apiKey.trim() });
      setApiTestState('ok');
      setApiTestMsg(`Connected — ${res.model}`);
    } catch (err) {
      setApiTestState('fail');
      setApiTestMsg(err?.message || 'Key rejected');
    }
  };

  const saveRpc = () => { save('mnemos_rpc_url', rpcUrl); toast('RPC URL saved', 'success'); };
  const resetRpc = () => { setRpcUrl('https://sepolia.base.org'); save('mnemos_rpc_url', 'https://sepolia.base.org'); toast('RPC reset to default', 'info'); };

  const saveContract = () => {
    const addr = contractAddr.trim();
    if (addr && !/^0x[0-9a-fA-F]{40}$/.test(addr)) { toast('Invalid contract address', 'error'); return; }
    if (addr) localStorage.setItem('mnemos_contract_addr', addr);
    else      localStorage.removeItem('mnemos_contract_addr');
    toast(addr ? 'Contract address saved' : 'Using detected address', 'success');
  };
  const useDetectedContract = () => {
    setContractAddr('');
    localStorage.removeItem('mnemos_contract_addr');
    toast('Reverted to deployed address', 'info');
  };
  const testRpc = async () => {
    setRpcTestState('testing'); setRpcTestMsg('Pinging RPC…');
    try {
      const provider = new window.ethers.JsonRpcProvider(rpcUrl);
      const block = await provider.getBlockNumber();
      const net   = await provider.getNetwork();
      if (Number(net.chainId) !== 84532) {
        setRpcTestState('error');
        setRpcTestMsg(`Wrong chain (got ${net.chainId}, expected 84532)`);
        return;
      }
      setRpcTestState('ok');
      setRpcTestMsg(`Latest block #${block.toLocaleString()}`);
    } catch (err) {
      setRpcTestState('error');
      setRpcTestMsg(err?.shortMessage || err?.message || 'RPC unreachable');
    }
  };

  const deriveEncKey = async () => {
    if (!wallet.address || !window.ethereum) { toast('Connect a wallet first', 'warning'); return; }
    try {
      const provider = new window.ethers.BrowserProvider(window.ethereum);
      const signer   = await provider.getSigner();
      await window.NousPipeline.deriveKey(signer);   // returns a non-extractable CryptoKey
      setEncKeyDerived(true);
      toast('Encryption key derived', 'success');
    } catch (err) {
      toast(err?.message || 'Key derivation failed', 'error');
    }
  };

  // Attester service config
  const saveAttesterUrl = () => {
    const url = attesterUrl.trim().replace(/\/+$/, '');
    save('mnemos_attester_url', url);
    toast('Attester URL saved', 'success');
  };
  const testAttester = async () => {
    setAttesterTestState('testing'); setAttesterTestMsg('Pinging attester…'); setAttesterInfo(null);
    try {
      // Use the freshly-typed URL even if not saved yet.
      const url = attesterUrl.trim().replace(/\/+$/, '');
      const res = await fetch(`${url}/info`, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = await res.json();
      setAttesterInfo(info);
      if (info.chainId && Number(info.chainId) !== 84532) {
        setAttesterTestState('error');
        setAttesterTestMsg(`Attester is configured for chain ${info.chainId}, not Base Sepolia`);
      } else {
        setAttesterTestState('ok');
        setAttesterTestMsg(`OK — signer ${info.attester.slice(0,10)}…${info.attester.slice(-6)}`);
      }
    } catch (err) {
      setAttesterTestState('error');
      setAttesterTestMsg(err?.message || 'Attester unreachable');
    }
  };

  const clearAll = () => {
    ['mnemos_api_key', 'mnemos_rpc_url', 'mnemos_default_model', 'mnemos_default_temp',
     'mnemos_session_key', 'mnemos_enc_key', 'mnemos_contract_addr',
     'mnemos_attester_url', 'mnemos_storage_mode', 'mnemos_storage_url'].forEach(k => localStorage.removeItem(k));
    setApiKey(''); setRpcUrl('https://sepolia.base.org'); setContractAddr('');
    setAttesterUrl('http://localhost:8787'); setAttesterInfo(null);
    setDefaultModel('hermes-4-70b'); setDefaultTemp(0.7); setSessionKey(true); setEncKeyDerived(false);
    setClearConfirmOpen(false);
    toast('All local data cleared', 'success');
  };

  // Persist small toggles eagerly
  useEffect(() => save('mnemos_default_model', defaultModel), [defaultModel]);
  useEffect(() => save('mnemos_default_temp', defaultTemp), [defaultTemp]);
  useEffect(() => save('mnemos_session_key', sessionKey), [sessionKey]);

  // ---------- UI ----------
  return <div style={{ position: 'relative', zIndex: 1, maxWidth: 820, margin: '0 auto', padding: '48px 32px 120px' }}>
    {/* Header */}
    <div style={{ marginBottom: 40 }}>
      <button onClick={() => go('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sky-600)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: 16 }}>
        <I name="arrow-left" size={14} /> Back
      </button>
      <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 56, margin: 0, letterSpacing: '-0.01em' }}>Settings</h1>
      <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 18, color: 'var(--text-secondary)', margin: '8px 0 0' }}>Your keys, your network, your defaults. All stored locally.</p>
    </div>

    {/* 1. Account */}
    <SectionCard
      title="Account"
      subtitle="Your connected wallet and encryption key.">
      <Row>
        <Label>Connected address</Label>
        {wallet.address ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Avatar address={wallet.address} size={36} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
                {`${wallet.address.slice(0,6)}…${wallet.address.slice(-4)}`}
              </div>
              <Address address={wallet.address} />
            </div>
            <div style={{ flex: 1 }} />
            <Button variant="ghost" size="sm" onClick={() => { wallet.disconnect(); toast('Wallet disconnected', 'info'); }}>Disconnect</Button>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <Status kind="warn">No wallet connected</Status>
            <div style={{ flex: 1 }} />
            <Button variant="primary" size="sm" onClick={async () => {
              if (!wallet.hasProvider) {
                toast('No wallet detected. Install MetaMask or an EIP-1193 wallet.', 'error');
                window.open('https://metamask.io/download/', '_blank', 'noopener');
                return;
              }
              await wallet.connect();
            }} disabled={wallet.connecting}>
              <I name="wallet" size={14} /> {wallet.connecting ? 'Connecting…' : 'Connect wallet'}
            </Button>
          </div>
        )}
        {wallet.address && !wallet.isBaseSepolia && (
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Status kind="warn">Wrong network · expected Base Sepolia</Status>
            <Button variant="secondary" size="sm" onClick={wallet.switchToBaseSepolia}>Switch network</Button>
          </div>
        )}
      </Row>

      <Divider />

      <Row>
        <Label>Encryption key</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1 }}>
            {encKeyDerived
              ? <Status kind="ok">Derived &middot; stored in session</Status>
              : <Status kind="warn">Not yet derived</Status>}
            <Help>Your encryption key is derived deterministically from a wallet signature. You&rsquo;ll sign a message the first time you decrypt a record. No gas required.</Help>
          </div>
          {!encKeyDerived && <Button variant="secondary" size="sm" onClick={deriveEncKey} disabled={!wallet.address}>Derive now</Button>}
        </div>
      </Row>
    </SectionCard>

    {/* 2. Nous API Key */}
    <SectionCard
      title="Nous API key"
      subtitle="Your key stays in this browser. It's forwarded to the inference backend only when you send a message — never stored server-side.">
      <Row>
        <Label>API key</Label>
        <div style={{ position: 'relative' }}>
          <Input
            type={showKey ? 'text' : 'password'}
            placeholder="sk-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', paddingRight: 42, fontFamily: 'var(--font-mono)' }}
          />
          <button onClick={() => setShowKey(s => !s)} title={showKey ? 'Hide' : 'Show'}
            style={{ position: 'absolute', top: '50%', right: 10, transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 4, display: 'inline-flex' }}>
            <I name={showKey ? 'unlock' : 'lock'} size={14} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          <Button variant="primary" size="sm" onClick={saveApiKey} disabled={!apiKey.trim()}>Save</Button>
          <div style={{ width: 1, height: 16, background: 'rgba(30,90,160,0.12)' }} />
          <Button variant="ghost" size="sm" onClick={testApiKey} disabled={!apiKey.trim() || apiTestState === 'testing'}>
            {apiTestState === 'testing' ? 'Testing…' : 'Test connection'}
          </Button>
          <Button variant="ghost" size="sm" onClick={clearApiKey} disabled={!apiKey}>Clear</Button>
          {apiTestState && apiTestState !== 'testing' && (
            <Status kind={apiTestState === 'ok' ? 'ok' : 'error'}>{apiTestMsg}</Status>
          )}
        </div>
        <Help>Don&rsquo;t have one? <a href="https://portal.nousresearch.com" target="_blank" rel="noreferrer" style={{ color: 'var(--sky-600)', fontWeight: 600 }}>Get a Nous API key →</a></Help>
      </Row>
    </SectionCard>

    {/* 3. Network */}
    <SectionCard
      title="Network"
      subtitle="Base Sepolia is fixed for now. You may use your own RPC for better reliability.">
      <Row>
        <Label>Chain</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <ChainBadge />
          <span style={{ color: 'var(--text-muted)', fontSize: 13, fontFamily: 'var(--font-body)' }}>· Chain ID 84532</span>
        </div>
      </Row>

      <Divider />

      <Row>
        <Label>RPC URL</Label>
        <div style={{ display: 'flex', gap: 10 }}>
          <Input
            value={rpcUrl}
            onChange={(e) => setRpcUrl(e.target.value)}
            placeholder="https://..."
            style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13 }}
          />
          <Button variant="primary" size="md" onClick={saveRpc}>Save</Button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <Button variant="ghost" size="sm" onClick={testRpc} disabled={rpcTestState === 'testing'}>
            {rpcTestState === 'testing' ? 'Pinging…' : 'Test RPC'}
          </Button>
          <Button variant="ghost" size="sm" onClick={resetRpc}>Reset to default</Button>
          {rpcTestState && rpcTestState !== 'testing' && (
            <Status kind={rpcTestState === 'ok' ? 'ok' : 'error'}>{rpcTestMsg}</Status>
          )}
        </div>
        <Help>Use Alchemy, Infura, QuickNode, or your own node. Default: <span style={{ fontFamily: 'var(--font-mono)' }}>sepolia.base.org</span></Help>
      </Row>

      <Divider />

      <Row>
        <Label>NousRecord contract address</Label>
        <div style={{ display: 'flex', gap: 10 }}>
          <Input
            value={contractAddr}
            onChange={(e) => setContractAddr(e.target.value)}
            placeholder={detectedContract || '0x… (not deployed yet)'}
            style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13 }}
          />
          <Button variant="primary" size="md" onClick={saveContract}>Save</Button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          {detectedContract
            ? <Status kind="ok">Auto-detected: {detectedContract.slice(0,10)}…{detectedContract.slice(-6)}</Status>
            : <Status kind="warn">No deployment.json found</Status>}
          {contractAddr && detectedContract && (
            <Button variant="ghost" size="sm" onClick={useDetectedContract}>Use detected</Button>
          )}
        </div>
        <Help>
          Leave blank to use the address written into <span style={{ fontFamily: 'var(--font-mono)' }}>nousRecordDeployment.json</span> by the deploy script.
          Override here to point the UI at a different deployment.
        </Help>
      </Row>
    </SectionCard>

    {/* 4. Testnet faucets */}
    <SectionCard
      title="Get testnet ETH"
      subtitle="Base Sepolia gas is free. You need a tiny amount to pay for seal() transactions — a single faucet drip covers hundreds of records.">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 12 }}>
        {[
          {
            name:  'Alchemy Faucet',
            url:   'https://www.alchemy.com/faucets/base-sepolia',
            desc:  'Free · Requires Alchemy account',
            icon:  'zap',
          },
          {
            name:  'QuickNode Faucet',
            url:   'https://faucet.quicknode.com/base/sepolia',
            desc:  'Free · Requires QuickNode account',
            icon:  'zap',
          },
          {
            name:  'Coinbase / Base Faucet',
            url:   'https://faucet.base.org',
            desc:  'Official · Requires Coinbase login',
            icon:  'anchor',
          },
        ].map(f => (
          <a key={f.name} href={f.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px',
              borderRadius: 14, cursor: 'pointer',
              background: 'rgba(255,255,255,0.5)',
              border: '1px solid rgba(30,90,160,0.1)',
              transition: 'box-shadow 150ms, border-color 150ms',
            }}
              onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 4px 16px rgba(30,90,160,0.12)'; e.currentTarget.style.borderColor = 'rgba(30,90,160,0.25)'; }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.borderColor = 'rgba(30,90,160,0.1)'; }}
            >
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)' }}>
                <I name={f.icon} size={16} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 5 }}>
                  {f.name} <I name="external-link" size={11} style={{ color: 'var(--sky-600)', flexShrink: 0 }} />
                </div>
                <div style={{ fontFamily: 'var(--font-body)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{f.desc}</div>
              </div>
            </div>
          </a>
        ))}
      </div>
      <Help style={{ marginTop: 12 }}>
        0.01 test ETH is enough for hundreds of seal transactions on Base Sepolia.
        These are testnet tokens with no real value.
      </Help>
    </SectionCard>

    {/* 5. Inference backend (optional) */}
    <SectionCard
      title="Inference backend (optional)"
      subtitle="Not needed by default — the app calls the Nous API directly from your browser. Only configure this if you want to route requests through a local or deployed proxy.">
      <Row>
        <Label>Backend URL</Label>
        <div style={{ display: 'flex', gap: 10 }}>
          <Input
            value={attesterUrl}
            onChange={(e) => setAttesterUrl(e.target.value)}
            placeholder="http://localhost:8787"
            style={{ flex: 1, fontFamily: 'var(--font-mono)', fontSize: 13 }}
          />
          <Button variant="primary" size="md" onClick={saveAttesterUrl}>Save</Button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
          <Button variant="ghost" size="sm" onClick={testAttester} disabled={attesterTestState === 'testing'}>
            {attesterTestState === 'testing' ? 'Pinging…' : 'Test connection'}
          </Button>
          {attesterTestState && attesterTestState !== 'testing' && (
            <Status kind={attesterTestState === 'ok' ? 'ok' : 'error'}>{attesterTestMsg}</Status>
          )}
        </div>
        {attesterInfo && (
          <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.45)', border: '1px solid rgba(255,255,255,0.7)', borderRadius: 12, padding: 12, fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
            {attesterInfo.contract    && <div>contract: <span style={{ color: 'var(--text-primary)' }}>{attesterInfo.contract}</span></div>}
            {attesterInfo.defaultModel && <div>model:&nbsp;&nbsp;&nbsp;<span style={{ color: 'var(--text-primary)' }}>{attesterInfo.defaultModel}</span></div>}
          </div>
        )}
        <Help>Run the backend locally from <span style={{ fontFamily: 'var(--font-mono)' }}>attester-service/</span> or deploy it anywhere reachable by your browser. Your API key is forwarded at request time only — never stored server-side.</Help>
      </Row>

    </SectionCard>

    {/* 6. Defaults */}
    <SectionCard
      title="Defaults"
      subtitle="Pre-fill these when you open a new inscription.">
      <Row>
        <Label>Default model</Label>
        <select
          className="input"
          value={defaultModel}
          onChange={(e) => setDefaultModel(e.target.value)}
          style={{ fontFamily: 'var(--font-body)', fontSize: 14 }}
        >
          {MOCK.models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
        </select>
      </Row>

      <Divider />

      <Row>
        <Label>Default temperature <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--sky-600)', marginLeft: 8 }}>{defaultTemp.toFixed(2)}</span></Label>
        <input
          type="range" min={0} max={2} step={0.05}
          value={defaultTemp}
          onChange={(e) => setDefaultTemp(parseFloat(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--sky-500)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
          <span>0.00 · Precise</span><span>1.00 · Balanced</span><span>2.00 · Creative</span>
        </div>
      </Row>

      <Divider />

      <Row>
        <Label>Session key persistence</Label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <Toggle checked={sessionKey} onChange={setSessionKey} />
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14 }}>Cache decrypted keys this session</div>
            <Help style={{ marginTop: 2 }}>If on, decrypting one record keeps the key in memory so subsequent reads don&rsquo;t require another signature. Clears on tab close.</Help>
          </div>
        </div>
      </Row>
    </SectionCard>

    {/* 7. Danger zone */}
    <Card style={{ border: '1px solid rgba(255,82,82,0.45)', background: 'rgba(255,240,240,0.75)', padding: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
        <I name="x-circle" size={20} style={{ color: 'var(--error)' }} />
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, margin: 0, color: '#A00000' }}>Danger zone</h3>
      </div>
      <p style={{ margin: '0 0 20px', color: 'var(--text-secondary)', fontSize: 14 }}>
        Clearing removes every key, setting, and cached derivation from this browser. On-chain records and Arweave uploads are unaffected.
      </p>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <Button variant="secondary" size="md" onClick={() => setClearConfirmOpen(true)} style={{ background: 'rgba(255,82,82,0.18)', color: '#A00000', borderColor: 'rgba(255,82,82,0.55)' }}>
          Clear all local data
        </Button>
        <Button variant="ghost" size="md" onClick={() => { wallet.disconnect(); toast('Wallet disconnected', 'info'); }} disabled={!wallet.address}>Disconnect wallet</Button>
      </div>
    </Card>

    {/* Clear confirm modal */}
    <Modal open={clearConfirmOpen} onClose={() => setClearConfirmOpen(false)} width={420}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'linear-gradient(180deg, #FF8A80, #FF5252)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.5), 0 6px 16px rgba(255,82,82,0.3)', marginBottom: 18 }}>
          <I name="x-circle" size={32} />
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: 0 }}>Clear all local data?</h3>
        <p style={{ color: 'var(--text-secondary)', fontSize: 14, margin: '10px 0 24px' }}>
          API key, RPC override, defaults, and cached encryption keys will be removed from this browser. This can&rsquo;t be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', width: '100%' }}>
          <Button variant="ghost" size="md" onClick={() => setClearConfirmOpen(false)}>Cancel</Button>
          <Button variant="primary" size="md" onClick={clearAll} style={{ color: '#A00000' }}>Yes, clear everything</Button>
        </div>
      </div>
    </Modal>
  </div>;
};

// ---------- section primitives ----------
const SectionCard = ({ title, subtitle, children }) => (
  <Card style={{ padding: 32, marginBottom: 24 }}>
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, margin: 0, letterSpacing: '-0.005em' }}>{title}</h3>
      {subtitle && <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>{subtitle}</p>}
    </div>
    {children}
  </Card>
);

const Row = ({ children }) => <div style={{ marginBottom: 4 }}>{children}</div>;

const Label = ({ children }) => (
  <div style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 13, color: 'var(--text-primary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>
    {children}
  </div>
);

const Help = ({ children, style }) => (
  <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)', marginTop: 8, lineHeight: 1.5, ...style }}>
    {children}
  </div>
);

const Divider = () => <div style={{ height: 1, background: 'rgba(30,90,160,0.08)', margin: '24px 0' }} />;

const Status = ({ kind, children }) => {
  const colors = {
    ok:    { bg: 'rgba(174,213,129,0.35)', border: 'rgba(139,195,74,0.55)', color: '#2E5E0C', icon: 'check-circle-2' },
    warn:  { bg: 'rgba(255,245,157,0.45)', border: 'rgba(255,183,77,0.55)', color: '#7A4D00', icon: 'shield' },
    error: { bg: 'rgba(255,138,128,0.3)',  border: 'rgba(255,82,82,0.55)',  color: '#A00000', icon: 'x-circle' },
  }[kind] || {};
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, padding: '4px 10px', borderRadius: 999, background: colors.bg, border: `1px solid ${colors.border}`, color: colors.color }}>
    <I name={colors.icon} size={12} />
    {children}
  </span>;
};

const Toggle = ({ checked, onChange }) => (
  <button onClick={() => onChange(!checked)}
    style={{
      position: 'relative', width: 44, height: 24, borderRadius: 999, border: 'none', cursor: 'pointer', flexShrink: 0,
      background: checked ? 'var(--gradient-water)' : 'rgba(30,90,160,0.25)',
      boxShadow: checked ? 'inset 0 1px 2px rgba(0,0,0,0.2), 0 2px 8px rgba(2,136,209,0.3)' : 'inset 0 1px 2px rgba(0,0,0,0.15)',
      transition: 'all 200ms',
    }}>
    <span style={{
      position: 'absolute', top: 2, left: checked ? 22 : 2, width: 20, height: 20, borderRadius: '50%',
      background: 'radial-gradient(circle at 30% 30%, #fff, #EAF7FF)',
      boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
      transition: 'all 200ms cubic-bezier(.2,.8,.2,1)',
    }} />
  </button>
);

Object.assign(window, { Settings });
