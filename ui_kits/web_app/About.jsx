// About page — what is Nous Mnemos, how it works, verification guide, FAQ
const About = ({ go }) => {
  // Real contract address (synchronously resolved from deployment file or
  // localStorage override). Falls back to a placeholder before
  // loadDeployment() resolves.
  const [contractAddr, setContractAddr] = useState(
    () => window.NousContract?.contractAddressSync?.() || '0x…',
  );
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const a = await window.NousContract.getContractAddress();
        if (!cancelled && a) setContractAddr(a);
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  // ---------- Live trust signals (owner / attesters / total / network) ----------
  const wallet = (typeof useWallet === 'function') ? useWallet() : { isBaseSepolia: null };
  const [trust, setTrust] = useState({
    loading: true,
    owner: null,
    attesterCount: null,
    activeCount: null,
    totalRecords: null,
    rpcOk: null,
    err: null,
  });
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await window.NousContract.getReadContract();
        if (!c) {
          if (!cancelled) setTrust(t => ({ ...t, loading: false, rpcOk: false, err: 'No read provider' }));
          return;
        }
        const [owner, attesters, total] = await Promise.all([
          window.NousContract.fetchOwner().catch(() => null),
          window.NousContract.fetchAttestersFromEvents().catch(() => []),
          c.totalRecords().then(n => Number(n)).catch(() => null),
        ]);
        if (cancelled) return;
        setTrust({
          loading: false,
          owner,
          attesterCount: attesters.length,
          activeCount: attesters.filter(a => a.status === 'Active').length,
          totalRecords: total,
          rpcOk: true,
          err: null,
        });
      } catch (err) {
        if (!cancelled) setTrust(t => ({ ...t, loading: false, rpcOk: false, err: err?.message || String(err) }));
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return <div style={{ position: 'relative', zIndex: 1 }}>
    {/* Hero */}
    <section style={{
      position: 'relative', overflow: 'hidden',
      background: 'var(--gradient-sky)',
      paddingTop: 140, paddingBottom: 120, marginTop: -90, color: '#fff',
    }}>
      <Decor variant="hero" />
      <div style={{ maxWidth: 980, margin: '0 auto', padding: '0 32px', position: 'relative', zIndex: 2, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.45)', padding: '6px 14px', borderRadius: 999, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 28 }}>
          <I name="book-open" size={14} /> About Nous Mnemos
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 64, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#fff', textShadow: '0 4px 24px rgba(0,0,0,0.18)', margin: 0 }}>
          A memory palace, built of glass and chain.
        </h1>
        <p style={{ fontFamily: 'var(--font-poetic)', fontWeight: 500, fontSize: 20, lineHeight: 1.55, color: 'rgba(255,255,255,0.95)', margin: '24px auto 0', maxWidth: 720 }}>
          Why this exists, how it works, and how anyone can verify every word.
        </p>
      </div>
    </section>

    {/* What is it */}
    <section style={{ maxWidth: 820, margin: '0 auto', padding: '88px 32px 24px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 40, letterSpacing: '-0.01em', margin: '0 0 20px' }}>What is Nous Mnemos?</h2>
      <p style={{ fontSize: 18, lineHeight: 1.65, color: 'var(--text-secondary)', marginBottom: 16 }}>
        Nous Mnemos is a small ritual for permanence. You write a prompt to a Nous AI model, and the conversation — prompt plus response — is cryptographically witnessed, encrypted with your key, uploaded to Arweave, and anchored on Base.
      </p>
      <p style={{ fontSize: 18, lineHeight: 1.65, color: 'var(--text-secondary)', marginBottom: 16 }}>
        The record is public in shape and private in substance. Anyone can prove that <em>this wallet</em>, at <em>this time</em>, queried <em>that model</em>, and received <em>the response with this hash</em>. No one but you can read what was actually said.
      </p>
      <p style={{ fontSize: 18, lineHeight: 1.65, color: 'var(--text-secondary)', margin: 0 }}>
        We built it because AI history vanishes. Models are deprecated, providers pivot, logs are quietly rewritten. A thought worth having is a thought worth keeping.
      </p>
    </section>

    {/* Four pillars */}
    <section style={{ maxWidth: 1240, margin: '0 auto', padding: '56px 32px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, letterSpacing: '-0.01em', margin: '0 0 32px', textAlign: 'center' }}>The four pillars</h2>
      <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
        {[
          { ic: 'anchor',  t: 'Permanence',    d: 'Conversations live on Arweave — stored forever by a protocol that pays for itself. No pinning, no expiry, no silent deletes.' },
          { ic: 'shield',  t: 'Verifiability', d: 'Every record is anchored on Base Sepolia. An attester signs the result server-side; anyone can recover the signer and verify offline.' },
          { ic: 'lock',    t: 'Privacy',       d: 'Content is encrypted with ECIES using an encryption key derived from a signature. Only you hold the private half. The chain sees hashes only.' },
          { ic: 'feather', t: 'Attestation',   d: 'The attester is a thin backend: it calls Nous with your key, signs what it saw, and forgets. You see the signature on-chain forever.' },
        ].map(p => <Card key={p.t} hover>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
            <div style={{ width: 54, height: 54, borderRadius: 18, background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', flexShrink: 0, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 12px rgba(2,136,209,0.3)' }}>
              <I name={p.ic} size={24} />
            </div>
            <div>
              <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, margin: '0 0 6px' }}>{p.t}</h3>
              <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{p.d}</p>
            </div>
          </div>
        </Card>)}
      </div>
    </section>

    {/* Architecture */}
    <section style={{ maxWidth: 980, margin: '0 auto', padding: '56px 32px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, letterSpacing: '-0.01em', margin: '0 0 10px', textAlign: 'center' }}>Architecture</h2>
      <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 17, color: 'var(--text-secondary)', textAlign: 'center', margin: '0 0 36px' }}>Four moving parts, one clear flow.</p>

      <Card style={{ padding: 36 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { n: 1, t: 'Browser',   d: 'You write a prompt. The page has your API key and your wallet. Nothing leaves yet.', ic: 'feather' },
            { n: 2, t: 'Attester',  d: 'Backend calls Nous API with your key, takes the response, hashes it, signs (user, CID, hashes, model) with its attester key, returns signature.', ic: 'shield' },
            { n: 3, t: 'Encrypt',   d: 'Browser encrypts prompt + response with your ECIES public key. Plaintext never touches the attester again.', ic: 'lock' },
            { n: 4, t: 'Arweave',   d: 'Ciphertext is uploaded via Irys. Returns a permanent content ID (CID).', ic: 'database' },
            { n: 5, t: 'Base',      d: 'Your wallet sends the final tx: (user, CID, promptHash, responseHash, plaintextHash, ciphertextHash, modelId, timestamp). Attester address + signature go in the event.', ic: 'anchor' },
          ].map((s, i, arr) => <div key={s.n}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 3px 10px rgba(2,136,209,0.3)' }}>
                  <I name={s.ic} size={20} />
                </div>
                {i < arr.length - 1 && <div style={{ width: 2, flex: 1, background: 'linear-gradient(180deg, rgba(2,136,209,0.35), rgba(2,136,209,0.05))', minHeight: 14 }} />}
              </div>
              <div style={{ paddingBottom: 18, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sky-600)', fontWeight: 600 }}>STEP {s.n}</span>
                  <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 20, margin: 0 }}>{s.t}</h4>
                </div>
                <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', lineHeight: 1.55 }}>{s.d}</p>
              </div>
            </div>
          </div>)}
        </div>
      </Card>
    </section>

    {/* Verify it yourself */}
    <section style={{ maxWidth: 980, margin: '0 auto', padding: '56px 32px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, letterSpacing: '-0.01em', margin: '0 0 10px' }}>Verify it yourself</h2>
      <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 17, color: 'var(--text-secondary)', margin: '0 0 28px' }}>You do not have to trust us. You can check every record from first principles.</p>

      <Card style={{ padding: 32 }}>
        <ol style={{ margin: 0, paddingLeft: 22, fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.75, color: 'var(--text-secondary)' }}>
          <li><strong style={{ color: 'var(--text-primary)' }}>Read the chain.</strong> Query the <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4 }}>Recorded</code> event on Base Sepolia. You get <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4 }}>user, CID, promptHash, responseHash, plaintextHash, ciphertextHash, modelId, timestamp, attester, signature</code>.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Recover the signer.</strong> Compute <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4 }}>keccak256(user, CID, promptHash, responseHash, modelId)</code>. Run <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4 }}>ecrecover</code> on the event&rsquo;s signature. Compare to the attester address.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Check that attester is trusted.</strong> Call <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4 }}>trustedAttesters(address)</code> on the contract. If it returns <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4 }}>true</code>, the attester is registered by the owner.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>Fetch the ciphertext.</strong> <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4 }}>GET https://arweave.net/{'{CID}'}</code>. Compute <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4 }}>keccak256(ciphertext)</code>. Compare to the on-chain <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4 }}>ciphertextHash</code>. If they match, the storage hasn&rsquo;t drifted.</li>
          <li><strong style={{ color: 'var(--text-primary)' }}>(If you own it)</strong> Decrypt with your ECIES private key. Hash the plaintext. Compare to <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4 }}>plaintextHash</code> — and to <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4 }}>promptHash</code> / <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4 }}>responseHash</code> for each half. Now you know the content is exactly what the attester saw.</li>
        </ol>
      </Card>
    </section>

    {/* Contract details */}
    <section style={{ maxWidth: 980, margin: '0 auto', padding: '56px 32px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, letterSpacing: '-0.01em', margin: '0 0 24px' }}>Contract</h2>

      <Card style={{ padding: 28 }}>
        <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 22 }}>
          <InfoField label="Network" value="Base Sepolia · 84532" />
          <InfoField label="Standard" value="Immutable · Event + Storage" />
          <InfoField label="Name" value="NousRecord" />
          <InfoField label="Address" value={`${contractAddr.slice(0,10)}…${contractAddr.slice(-8)}`} mono copyable={contractAddr} />
        </div>

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Button variant="ghost" size="sm"><I name="external-link" size={13} /> View on BaseScan</Button>
          <Button variant="ghost" size="sm"><I name="download" size={13} /> Download ABI</Button>
          <Button variant="ghost" size="sm" onClick={() => go('attesters')}><I name="shield" size={13} /> Attesters registry</Button>
        </div>

        <div style={{ marginTop: 24, paddingTop: 22, borderTop: '1px solid rgba(30,90,160,0.08)' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Event signature</div>
          <pre style={{ margin: 0, padding: '14px 16px', background: 'rgba(255,255,255,0.55)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.7)', fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, color: 'var(--text-primary)', overflowX: 'auto' }}>
{`event Recorded(
  uint256 indexed id,
  address indexed user,
  string  arweaveCID,
  bytes32 promptHash,
  bytes32 responseHash,
  bytes32 plaintextHash,
  bytes32 ciphertextHash,
  string  modelId,
  uint256 conversationId,
  uint256 timestamp,
  address attester,
  bytes   signature
);`}
          </pre>
        </div>
      </Card>
    </section>

    {/* Trust panel — live, on-chain trust signals */}
    <section style={{ maxWidth: 980, margin: '0 auto', padding: '56px 32px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, letterSpacing: '-0.01em', margin: '0 0 10px' }}>Trust panel</h2>
      <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 17, color: 'var(--text-secondary)', margin: '0 0 28px' }}>Live signals straight from the chain — refreshed on every visit.</p>

      <Card style={{ padding: 28 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 18 }} className="resp-flex-wrap">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{
              width: 10, height: 10, borderRadius: 999, flexShrink: 0,
              background: trust.loading ? 'var(--text-muted)'
                        : (trust.rpcOk && wallet.isBaseSepolia !== false) ? 'var(--grass-600)'
                        : 'var(--error)',
              boxShadow: trust.rpcOk ? '0 0 0 4px rgba(76,175,80,0.18)' : '0 0 0 4px rgba(244,67,54,0.18)',
            }} />
            <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>
              {trust.loading ? 'Loading…'
                : trust.rpcOk ? 'Chain reachable' : 'RPC unavailable'}
            </span>
          </div>
          <Badge variant={wallet.isBaseSepolia === false ? 'warning' : 'info'} size="sm">
            <I name="link" size={11} /> Base Sepolia · 84532
          </Badge>
        </div>

        <StatList rows={[
          ['Contract',   <span style={{ fontFamily: 'var(--font-mono)' }}>{contractAddr}</span>],
          ['Owner',      trust.loading ? '…' : (trust.owner ? <Address address={trust.owner} short /> : <span style={{ color: 'var(--text-muted)' }}>unknown</span>)],
          ['Attesters',  trust.loading ? '…'
                          : <span>
                              <strong style={{ color: 'var(--grass-600)' }}>{trust.activeCount ?? 0}</strong>
                              <span style={{ color: 'var(--text-muted)' }}> active </span>
                              <span style={{ color: 'var(--text-muted)' }}>/ {trust.attesterCount ?? 0} ever registered</span>
                            </span>],
          ['Total records', trust.loading ? '…' : (trust.totalRecords ?? 0).toLocaleString()],
          ['Wallet network', wallet.isBaseSepolia == null
                              ? <span style={{ color: 'var(--text-muted)' }}>not connected</span>
                              : wallet.isBaseSepolia
                                ? <span style={{ color: 'var(--grass-600)' }}>Base Sepolia ✓</span>
                                : <span style={{ color: 'var(--error)' }}>wrong network</span>],
        ]} />

        {trust.err && <div style={{
          marginTop: 14, padding: '10px 12px', borderRadius: 10,
          background: 'rgba(244,67,54,0.08)', border: '1px solid rgba(244,67,54,0.25)',
          fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--error)',
        }}>RPC error: {trust.err}</div>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 18 }}>
          <Button variant="ghost" size="sm" onClick={() => go('attesters')}><I name="shield" size={13} /> See registry</Button>
          <Button variant="ghost" size="sm" onClick={() => go('explorer')}><I name="compass" size={13} /> Browse records</Button>
        </div>
      </Card>
    </section>

    {/* Trust model */}
    <section style={{ maxWidth: 980, margin: '0 auto', padding: '56px 32px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, letterSpacing: '-0.01em', margin: '0 0 24px' }}>Trust model</h2>

      <div className="resp-grid-2" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        <Card style={{ padding: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <I name="check-circle-2" size={18} style={{ color: 'var(--grass-600)' }} />
            <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, margin: 0 }}>What you trust the backend for</h4>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <li>Actually calling the Nous API with your key</li>
            <li>Returning the real response to you</li>
            <li>Signing the result with the registered attester key</li>
            <li>Not logging your API key</li>
          </ul>
        </Card>

        <Card style={{ padding: 24 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <I name="x-circle" size={18} style={{ color: 'var(--error)' }} />
            <h4 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, margin: 0 }}>What you do <em>not</em> trust it for</h4>
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.7, color: 'var(--text-secondary)' }}>
            <li>Reading your conversations — encryption happens in your browser</li>
            <li>Storing anything long-term — it forgets each request</li>
            <li>Choosing which records you can access</li>
            <li>Censoring or editing records — they&rsquo;re on Arweave and on-chain</li>
          </ul>
        </Card>
      </div>

      <Card style={{ padding: 22, marginTop: 18, background: 'rgba(255,245,157,0.35)', border: '1px solid rgba(255,183,77,0.5)' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(255,183,77,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#7A4D00', flexShrink: 0 }}>
            <I name="sparkles" size={16} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: '#7A4D00' }}>Self-host the backend</div>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: '#7A4D00', lineHeight: 1.6 }}>
              Don&rsquo;t want to trust our attester? The backend is open-source and stateless. Run your own, register your address as an attester in the contract, and point your client at it. Everything above still works.
            </p>
          </div>
        </div>
      </Card>
    </section>

    {/* FAQ */}
    <section style={{ maxWidth: 820, margin: '0 auto', padding: '56px 32px' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 36, letterSpacing: '-0.01em', margin: '0 0 24px' }}>Frequently asked</h2>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {FAQS.map((f, i) => <Faq key={i} q={f.q} a={f.a} />)}
      </div>
    </section>

    {/* Credits */}
    <section style={{ maxWidth: 980, margin: '0 auto', padding: '56px 32px 120px' }}>
      <Card style={{ padding: 36, textAlign: 'center', background: 'var(--gradient-water)', color: '#fff', border: '1px solid rgba(255,255,255,0.5)' }}>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, margin: 0, color: '#fff', textShadow: '0 2px 12px rgba(0,0,0,0.15)' }}>Built with</h3>
        <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 16, color: 'rgba(255,255,255,0.92)', margin: '10px 0 24px' }}>
          The shoulders we stand on.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          {[
            ['Nous Research', 'Hermes family models'],
            ['Base',          'Ethereum L2 anchor'],
            ['Arweave',       'Permanent storage'],
            ['Irys',          'Arweave upload rail'],
          ].map(([t, s]) => <div key={t} style={{ padding: '12px 20px', background: 'rgba(255,255,255,0.18)', backdropFilter: 'blur(12px)', border: '1px solid rgba(255,255,255,0.45)', borderRadius: 14 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: '#fff' }}>{t}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'rgba(255,255,255,0.85)' }}>{s}</div>
          </div>)}
        </div>
        <div style={{ marginTop: 28 }}>
          <Button variant="primary" size="md" onClick={() => go('chat')} style={{ background: '#fff', color: 'var(--sky-700)' }}>
            Begin an inscription <I name="arrow-right" size={14} />
          </Button>
        </div>
      </Card>
    </section>
  </div>;
};

// ---------- FAQ ----------
const FAQS = [
  { q: 'Does this work on mainnet?', a: 'Not yet — the current contract is on Base Sepolia. A mainnet version will ship after the attester key rotation cadence and gas profile settle.' },
  { q: 'Who pays for Arweave storage?', a: 'You do — indirectly. Uploads under 100 KB are inside the Irys free tier, which is how we cover this MVP. Conversations average 2–10 KB encrypted, so you are well below the ceiling.' },
  { q: 'What happens if the attester key is compromised?', a: 'The owner revokes that attester in the registry. New records signed by the compromised key fail the trust check. Existing records remain readable but their attester is marked Revoked on the record page.' },
  { q: 'Can I delete a record?', a: 'No. The contract is immutable and Arweave is permanent by design. This is a feature, not a bug — if you would not want a thought preserved, do not seal it.' },
  { q: 'Why not zkTLS (Reclaim, Opacity, TLSNotary)?', a: 'Backend attestation is simpler to ship and easier to audit. The record format has room for a zkTLS proof field — the API could be swapped without a schema change.' },
  { q: 'What does the attester actually see?', a: 'Your API key (in transit, unlogged), the prompt, the response, and the model. It hashes and signs; it never writes your content to disk and never talks to Arweave or Base on your behalf.' },
  { q: 'Is Nous Mnemos affiliated with Nous Research?', a: 'Built on top of the Nous API, not operated by Nous. Attribution without affiliation.' },
];

const Faq = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return <Card style={{ padding: 0, overflow: 'hidden' }}>
    <button onClick={() => setOpen(o => !o)} style={{
      width: '100%', textAlign: 'left', background: 'transparent', border: 'none', cursor: 'pointer',
      padding: '18px 22px', display: 'flex', alignItems: 'center', gap: 14,
      fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 16, color: 'var(--text-primary)',
    }}>
      <span style={{ flex: 1 }}>{q}</span>
      <span style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(255,255,255,0.55)', border: '1px solid rgba(41,182,246,0.3)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sky-600)', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 200ms' }}>
        <I name="chevron-down" size={14} />
      </span>
    </button>
    {open && <div style={{ padding: '0 22px 20px', fontSize: 14, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
      {a}
    </div>}
  </Card>;
};

const InfoField = ({ label, value, mono, copyable }) => {
  const [copied, setCopied] = useState(false);
  const doCopy = () => { if (copyable) { navigator.clipboard?.writeText(copyable); setCopied(true); setTimeout(() => setCopied(false), 1200); } };
  return <div>
    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: mono ? 'var(--font-mono)' : 'var(--font-body)', fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
      {value}
      {copyable && <button onClick={doCopy} style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--grass-600)' : 'var(--text-muted)', padding: 2, display: 'inline-flex' }}>
        <I name={copied ? 'check' : 'copy'} size={12} />
      </button>}
    </div>
  </div>;
};

Object.assign(window, { About });
