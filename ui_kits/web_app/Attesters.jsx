// Attesters page — trusted attester registry (public read, owner-only write)
const Attesters = ({ go }) => {
  const toast = useToast();
  const wallet = useWallet();
  const [infoOpen, setInfoOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newAttester, setNewAttester] = useState('');
  const [busy, setBusy] = useState(false);

  const [owner, setOwner] = useState(null);
  const [contractAddr, setContractAddr] = useState(null);
  const [attesters, setAttesters] = useState([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    setLoading(true);
    try {
      const [addr, ownerAddr, rows] = await Promise.all([
        window.NousContract.getContractAddress(),
        window.NousContract.fetchOwner(),
        window.NousContract.fetchAttestersFromEvents(),
      ]);
      setContractAddr(addr);
      setOwner(ownerAddr);
      setAttesters(rows);
    } catch (err) {
      console.warn('Attesters refresh failed', err);
    } finally { setLoading(false); }
  };

  useEffect(() => { refresh(); }, []);

  const isOwner = wallet.address && owner && wallet.address.toLowerCase() === owner.toLowerCase();
  const totalSigned = attesters.reduce((s, a) => s + (a.signed || 0), 0);
  const activeCount = attesters.filter(a => a.status === 'Active').length;

  const submitAdd = async () => {
    const addr = newAttester.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(addr)) { toast('Invalid address', 'error'); return; }
    setBusy(true);
    try {
      await window.NousContract.addAttester(addr);
      toast('Attester added', 'success');
      setAddOpen(false); setNewAttester('');
      refresh();
    } catch (err) {
      toast(err?.shortMessage || err?.message || 'Failed to add attester', 'error');
    } finally { setBusy(false); }
  };

  const submitRevoke = async (addr) => {
    if (!confirm(`Revoke attester ${addr}?`)) return;
    try {
      await window.NousContract.revokeAttester(addr);
      toast('Attester revoked', 'success');
      refresh();
    } catch (err) {
      toast(err?.shortMessage || err?.message || 'Failed to revoke', 'error');
    }
  };

  return <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '48px 32px 120px' }}>
    {/* Header */}
    <button onClick={() => go('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sky-600)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: 16 }}>
      <I name="arrow-left" size={14} /> Back
    </button>

    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 36, flexWrap: 'wrap', gap: 20 }}>
      <div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 12px rgba(2,136,209,0.3)' }}>
            <I name="shield" size={22} />
          </div>
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 52, margin: 0, letterSpacing: '-0.01em' }}>Trusted attesters</h1>
        <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 18, color: 'var(--text-secondary)', margin: '8px 0 0', maxWidth: 680 }}>
          The addresses authorised to sign Nous API responses. Anyone can verify their signatures on any record.
        </p>
      </div>
      <Button variant="ghost" size="md" onClick={() => setInfoOpen(true)}>
        <I name="book-open" size={14} /> How this works
      </Button>
    </div>

    {/* Stats strip */}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
      <Stat label="Active attesters" value={activeCount} tint="grass" />
      <Stat label="Records signed" value={totalSigned.toLocaleString()} tint="sky" />
      <Stat label="Total registered" value={MOCK.attesters.length} tint="aqua" />
      <Stat label="Revocations" value={MOCK.attesters.filter(a => a.status === 'Revoked').length} tint="coral" />
    </div>

    {/* Owner panel */}
    <Card style={{ padding: 24, marginBottom: 28, background: 'rgba(255,255,255,0.78)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 280 }}>
          {owner ? <>
            <Avatar address={owner} size={44} />
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Contract owner</div>
              <Address address={owner} />
            </div>
          </> : <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>Owner unknown — contract not deployed yet.</div>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, minWidth: 280 }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(255,255,255,0.6)', border: '1px solid rgba(41,182,246,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--sky-600)' }}>
            <I name="anchor" size={18} />
          </div>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>NousRecord contract</div>
            {contractAddr ? <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>{contractAddr.slice(0, 10)}…{contractAddr.slice(-6)}</span>
              <button onClick={() => { navigator.clipboard?.writeText(contractAddr); toast('Contract address copied', 'success'); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2, display: 'inline-flex' }}>
                <I name="copy" size={13} />
              </button>
              <a href={`https://sepolia.basescan.org/address/${contractAddr}`} target="_blank" rel="noreferrer" title="View on BaseScan" style={{ color: 'var(--sky-600)', display: 'inline-flex' }}>
                <I name="external-link" size={13} />
              </a>
            </div> : <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)' }}>Not configured. Set it in Settings → Network.</div>}
          </div>
        </div>
      </div>
    </Card>

    {/* Attester list */}
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 28, margin: 0 }}>Registry</h2>
      {isOwner && <Button variant="primary" size="sm" onClick={() => setAddOpen(true)}>
        <I name="sparkles" size={13} /> Add attester
      </Button>}
    </div>

    <Card style={{ padding: 0, overflow: 'hidden' }}>
      {/* Header row */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 16, padding: '14px 24px', background: 'rgba(255,255,255,0.55)', borderBottom: '1px solid rgba(30,90,160,0.08)', fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        <div>Attester</div>
        <div>Status</div>
        <div>Added</div>
        <div>Records signed</div>
        <div style={{ width: 32 }} />
      </div>

      {/* Rows */}
      {loading ? (
        <div style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div className="spin" style={{ width: 24, height: 24, border: '3px solid rgba(41,182,246,0.2)', borderTopColor: 'var(--sky-500)', borderRadius: '50%', margin: '0 auto' }} />
        </div>
      ) : attesters.length === 0 ? (
        <div style={{ padding: '40px 24px', textAlign: 'center', fontFamily: 'var(--font-body)', fontSize: 14, color: 'var(--text-muted)' }}>
          {contractAddr
            ? 'No attesters registered yet. The owner will add the first signer.'
            : 'Contract not deployed yet. Configure it in Settings → Network.'}
        </div>
      ) : (
        attesters.map((a, i) => (
          <AttesterRow
            key={a.address}
            attester={a}
            isLast={i === attesters.length - 1}
            isOwner={isOwner}
            onRevoke={() => submitRevoke(a.address)}
            go={go}
          />
        ))
      )}
    </Card>

    {/* Add attester modal */}
    <Modal open={addOpen} onClose={() => setAddOpen(false)} width={480}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, margin: 0, marginBottom: 6 }}>Add attester</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '0 0 16px' }}>This address will be authorized to sign records. You can revoke later.</p>
      <Input placeholder="0x…" value={newAttester} onChange={(e) => setNewAttester(e.target.value)} style={{ width: '100%', fontFamily: 'var(--font-mono)' }} />
      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="ghost" size="md" onClick={() => setAddOpen(false)}>Cancel</Button>
        <Button variant="primary" size="md" onClick={submitAdd} disabled={busy}>{busy ? 'Submitting…' : 'Add attester'}</Button>
      </div>
    </Modal>

    {/* Info modal */}
    <Modal open={infoOpen} onClose={() => setInfoOpen(false)} width={560}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
          <I name="shield" size={22} />
        </div>
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: 0 }}>How attestation works</h3>
      </div>
      <div style={{ fontFamily: 'var(--font-body)', fontSize: 14, lineHeight: 1.65, color: 'var(--text-secondary)' }}>
        <p>Each attester is a backend server that holds a private key. When you generate a record, it calls the Nous API on your behalf and signs the result with that key.</p>
        <p>The signature covers your address, the Arweave CID, the prompt and response hashes, and the model ID. Anyone — including you — can recover the signer on any record page and verify the proof offline.</p>
        <p>Only the contract owner may add or revoke attesters. This list is pulled live from the <code className="mono" style={{ background: 'rgba(30,90,160,0.08)', padding: '2px 6px', borderRadius: 4, fontSize: 12 }}>NousRecord</code> contract.</p>
        <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: 12 }}>You trust the backend to make the real call. You do not trust it with your conversation: everything it sees is encrypted and hashed before it hits storage.</p>
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
        <Button variant="primary" size="md" onClick={() => setInfoOpen(false)}>Got it</Button>
      </div>
    </Modal>
  </div>;
};

// ---------- row ----------
const AttesterRow = ({ attester, isLast, isOwner, go, onRevoke }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const active = attester.status === 'Active';

  return <div style={{
    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 16,
    padding: '16px 24px',
    borderBottom: isLast ? 'none' : '1px solid rgba(30,90,160,0.06)',
    alignItems: 'center',
    fontFamily: 'var(--font-body)',
    fontSize: 13,
  }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <Avatar address={attester.address} size={30} />
      <Address address={attester.address} />
    </div>
    <div>
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11,
        padding: '4px 10px', borderRadius: 999,
        background: active ? 'rgba(174,213,129,0.35)' : 'rgba(255,138,128,0.22)',
        border: `1px solid ${active ? 'rgba(139,195,74,0.55)' : 'rgba(255,82,82,0.45)'}`,
        color: active ? '#2E5E0C' : '#A00000',
        textTransform: 'uppercase', letterSpacing: '0.04em',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: active ? 'var(--grass-500)' : 'var(--error)', boxShadow: `0 0 6px ${active ? 'var(--grass-500)' : 'var(--error)'}` }} />
        {attester.status}
      </span>
    </div>
    <div style={{ color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>block #{attester.addedBlock ?? '—'}</div>
    <div style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>{(attester.signed || 0).toLocaleString()}</div>
    <div style={{ position: 'relative' }}>
      <button onClick={() => setMenuOpen(o => !o)} title="Actions"
        style={{ width: 32, height: 32, borderRadius: 10, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(41,182,246,0.2)', cursor: 'pointer', color: 'var(--text-secondary)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <I name="chevron-down" size={14} />
      </button>
      {menuOpen && <div className="glass" style={{ position: 'absolute', top: 38, right: 0, zIndex: 20, padding: 6, width: 220, background: 'rgba(255,255,255,0.95)' }}>
        <MenuItem icon="external-link" onClick={() => { window.open(`https://sepolia.basescan.org/address/${attester.address}`, '_blank', 'noopener'); setMenuOpen(false); }}>View on BaseScan</MenuItem>
        <MenuItem icon="copy" onClick={() => { navigator.clipboard?.writeText(attester.address); setMenuOpen(false); }}>Copy address</MenuItem>
        {isOwner && active && <MenuItem icon="x-circle" danger onClick={() => { setMenuOpen(false); onRevoke && onRevoke(); }}>Revoke attester</MenuItem>}
      </div>}
    </div>
  </div>;
};

const MenuItem = ({ icon, onClick, children, danger }) => (
  <button onClick={onClick} style={{
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '8px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
    background: 'transparent', textAlign: 'left',
    fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13,
    color: danger ? '#A00000' : 'var(--text-primary)',
  }} onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(41,182,246,0.12)'}
     onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}>
    <I name={icon} size={14} />
    {children}
  </button>
);

const Stat = ({ label, value, tint }) => {
  const tints = {
    sky:   'var(--gradient-water)',
    grass: 'linear-gradient(180deg, #AED581 0%, #558B2F 100%)',
    aqua:  'linear-gradient(180deg, #80DEEA 0%, #00838F 100%)',
    coral: 'linear-gradient(180deg, #FF8A80 0%, #C2185B 100%)',
  };
  return <Card style={{ padding: 22, textAlign: 'center' }}>
    <div style={{
      fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 40, lineHeight: 1, letterSpacing: '-0.02em',
      background: tints[tint], WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text',
    }}>{value}</div>
    <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700, marginTop: 8 }}>{label}</div>
  </Card>;
};

Object.assign(window, { Attesters });
