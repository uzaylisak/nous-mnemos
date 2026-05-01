// User profile — real on-chain reads + a tiny customizable "card" the
// owner can edit (display name, tagline, accent color). The card data
// lives in localStorage at  mnemos_profile:<lowercase address>  so each
// device the user signs into can see and edit it. Public visitors see
// whatever the most recent device wrote — nothing is on-chain here, by
// design (the chain is for sealed records, not vanity).
//
// Stats (records count, model breakdown, first/last seal) are derived
// live from contract.fetchRecordsByAuthor(). No ENS, no off-chain identity
// service — just an address and whatever the owner chose to write into
// localStorage.

const PROFILE_LS_PREFIX = 'mnemos_profile:';
const ACCENTS = [
  { id: 'sky',    label: 'Water',  start: '#7EC8E3', end: '#0288D1' },
  { id: 'grass',  label: 'Moss',   start: '#AED581', end: '#558B2F' },
  { id: 'sunset', label: 'Sunset', start: '#FFB74D', end: '#E65100' },
  { id: 'rose',   label: 'Rose',   start: '#FF8A80', end: '#C2185B' },
  { id: 'iris',   label: 'Iris',   start: '#B39DDB', end: '#673AB7' },
];

const loadProfile = (addr) => {
  if (!addr) return {};
  try { return JSON.parse(localStorage.getItem(PROFILE_LS_PREFIX + addr.toLowerCase()) || '{}') || {}; }
  catch { return {}; }
};
const saveProfile = (addr, obj) => {
  if (!addr) return;
  localStorage.setItem(PROFILE_LS_PREFIX + addr.toLowerCase(), JSON.stringify(obj || {}));
};

const UserProfile = ({ address, go }) => {
  const wallet = useWallet();
  const toast = useToast();

  const addr = (address || wallet.address || '').toLowerCase();

  const [tab, setTab] = useState('records');
  const [records, setRecords]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [profile, setProfile]   = useState(() => loadProfile(addr));
  const [editing, setEditing]   = useState(false);
  const [draft,   setDraft]     = useState({});

  const isMe = wallet.address && addr && wallet.address.toLowerCase() === addr.toLowerCase();
  const authorShort = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : '—';

  // Reload on address change
  useEffect(() => {
    setProfile(loadProfile(addr));
    setRecords([]);
    if (!addr) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const rows = await window.NousContract.fetchRecordsByAuthor(addr);
        if (!cancelled) setRecords(rows);
      } catch (err) {
        console.warn('UserProfile fetch failed', err);
        if (!cancelled) setRecords([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [addr]);

  const accent = ACCENTS.find(a => a.id === profile.accent) || ACCENTS[0];
  const displayName = (profile.displayName || '').trim() || authorShort;

  // Derived stats
  const modelCounts = records.reduce((m, r) => { m[r.model] = (m[r.model] || 0) + 1; return m; }, {});
  const modelList   = Object.entries(modelCounts).sort((a, b) => b[1] - a[1]);
  const maxCount    = Math.max(1, ...modelList.map(([, c]) => c));
  const firstRecord = records[records.length - 1];
  const lastRecord  = records[0];
  const longestConv = records.length
    ? records.reduce((max, r) => Math.max(max, /* unknown turn count from chain */ 0), 0)
    : 0;

  const startEdit = () => { setDraft({ ...profile }); setEditing(true); };
  const cancelEdit = () => { setEditing(false); setDraft({}); };
  const commitEdit = () => {
    if (!isMe) return;
    const cleaned = {
      displayName: (draft.displayName || '').slice(0, 60),
      bio:         (draft.bio || '').slice(0, 240),
      accent:      ACCENTS.some(a => a.id === draft.accent) ? draft.accent : 'sky',
      links:       Array.isArray(draft.links) ? draft.links.slice(0, 4) : [],
    };
    saveProfile(addr, cleaned);
    setProfile(cleaned);
    setEditing(false);
    setDraft({});
    toast('Profile saved (this browser only)', 'success');
  };
  const clearProfile = () => {
    if (!isMe) return;
    if (!window.confirm('Clear your profile customisations? Your address and on-chain records are unaffected.')) return;
    saveProfile(addr, {});
    setProfile({});
    toast('Profile reset', 'info');
  };

  // Profile share URL (front-end only; relies on hash router or direct addr)
  const shareLink = () => {
    if (!addr) return;
    const url = `${window.location.origin}${window.location.pathname}#user/${addr}`;
    navigator.clipboard?.writeText(url);
    toast('Profile link copied', 'success');
  };

  if (!addr) {
    return <div style={{ position: 'relative', zIndex: 1, maxWidth: 720, margin: '0 auto', padding: '64px 32px 96px' }}>
      <Card style={{ padding: 56, textAlign: 'center' }}>
        <I name="user" size={36} style={{ color: 'var(--sky-600)' }} />
        <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: '12px 0 6px' }}>No address.</h3>
        <p style={{ color: 'var(--text-secondary)', margin: 0 }}>Connect your wallet or open a profile link.</p>
      </Card>
    </div>;
  }

  return <div style={{ position: 'relative', zIndex: 1, maxWidth: 1100, margin: '0 auto', padding: '36px 32px 120px' }}>
    <button onClick={() => go('landing')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--sky-600)', fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 6, padding: 0, marginBottom: 18 }}>
      <I name="arrow-left" size={14} /> Back
    </button>

    {/* Profile header */}
    <Card style={{ padding: 0, marginBottom: 24, overflow: 'hidden' }}>
      {/* Banner */}
      <div style={{
        height: 110,
        background: `linear-gradient(135deg, ${accent.start} 0%, ${accent.end} 100%)`,
        boxShadow: 'inset 0 -1px 0 rgba(255,255,255,0.4)',
      }} />
      <div style={{ padding: '0 32px 28px', marginTop: -56 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ position: 'relative' }}>
            <div style={{ padding: 6, background: 'rgba(255,255,255,0.85)', borderRadius: '50%', backdropFilter: 'blur(14px)', boxShadow: '0 6px 20px rgba(0,0,0,0.15)' }}>
              <Avatar address={addr} size={104} />
            </div>
            {isMe && <Badge variant="verified" style={{ position: 'absolute', bottom: 6, right: 6, boxShadow: '0 2px 8px rgba(139,195,74,0.4)' }}>
              <I name="check-circle-2" size={10} /> You
            </Badge>}
          </div>

          <div style={{ flex: 1, minWidth: 260, paddingTop: 60 }}>
            {!editing ? (
              <>
                <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 30, letterSpacing: '-0.005em', color: 'var(--text-primary)', marginBottom: 4, wordBreak: 'break-word' }}>
                  {displayName}
                </div>
                <div style={{ marginBottom: 10 }}>
                  <Address address={addr} short={false} />
                </div>
                {profile.bio && (
                  <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 15, color: 'var(--text-secondary)', margin: '0 0 12px', maxWidth: 560, lineHeight: 1.55 }}>
                    {profile.bio}
                  </p>
                )}
                {Array.isArray(profile.links) && profile.links.length > 0 && (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {profile.links.filter(Boolean).map((href, i) => {
                      let label = href;
                      try { label = new URL(href).host.replace(/^www\./, ''); } catch {}
                      return <a key={i} href={href} target="_blank" rel="noreferrer" style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--sky-600)', textDecoration: 'none', background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.7)', borderRadius: 999, padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                        <I name="external-link" size={11} /> {label}
                      </a>;
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <Button variant="ghost" size="sm" onClick={shareLink}>
                    <I name="share-2" size={13} /> Share profile
                  </Button>
                  <a target="_blank" rel="noreferrer" href={`https://sepolia.basescan.org/address/${addr}`} style={{ textDecoration: 'none' }}>
                    <Button variant="ghost" size="sm">
                      <I name="external-link" size={13} /> BaseScan
                    </Button>
                  </a>
                  {isMe && (
                    <Button variant="secondary" size="sm" onClick={startEdit}>
                      <I name="edit-2" size={13} /> Customize
                    </Button>
                  )}
                </div>
              </>
            ) : (
              <ProfileEditor draft={draft} setDraft={setDraft} accent={accent} onCancel={cancelEdit} onSave={commitEdit} onClear={clearProfile} />
            )}
          </div>

          {/* Mini stats */}
          <div style={{ minWidth: 200, paddingTop: 60 }}>
            <StatMini label="Records"     value={loading ? '—' : records.length} />
            <StatMini label="Models used" value={loading ? '—' : modelList.length} />
            <StatMini label="First seal"  value={firstRecord ? new Date(firstRecord.sealedAt * 1000).toISOString().slice(0,10) : '—'} small />
            <StatMini label="Last seal"   value={lastRecord  ? relativeTime(lastRecord.sealedAt) : '—'} small noDivider />
          </div>
        </div>
      </div>
    </Card>

    {/* Tabs */}
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, padding: 6, background: 'rgba(255,255,255,0.45)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.6)', backdropFilter: 'blur(10px)', width: 'fit-content' }}>
      {[
        ['records',  'Records',  'scroll-text'],
        ['models',   'Models',   'sparkles'],
        ['timeline', 'Timeline', 'anchor'],
      ].map(([k, label, ic]) => {
        const active = tab === k;
        return <button key={k} onClick={() => setTab(k)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '9px 18px', borderRadius: 10, border: 'none', cursor: 'pointer',
          fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13,
          background: active ? `linear-gradient(180deg, ${accent.start} 0%, ${accent.end} 100%)` : 'transparent',
          color: active ? '#fff' : 'var(--text-secondary)',
          boxShadow: active ? 'inset 0 1px 0 rgba(255,255,255,0.5), 0 3px 10px rgba(2,136,209,0.3)' : 'none',
          transition: 'all 200ms',
        }}>
          <I name={ic} size={14} />
          {label}
        </button>;
      })}
    </div>

    {/* Content */}
    {loading ? (
      <Card style={{ padding: 48, textAlign: 'center' }}>
        <div className="spin" style={{ width: 26, height: 26, border: '3px solid rgba(41,182,246,0.2)', borderTopColor: 'var(--sky-500)', borderRadius: '50%', margin: '0 auto' }} />
        <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 12 }}>Reading records from chain…</p>
      </Card>
    ) : !records.length ? <EmptyProfile isMe={isMe} go={go} /> : (
      <>
        {tab === 'records'  && <RecordsGrid records={records} go={go} />}
        {tab === 'models'   && <ModelsTab list={modelList} max={maxCount} total={records.length} accent={accent} />}
        {tab === 'timeline' && <TimelineTab records={records} go={go} />}
      </>
    )}
  </div>;
};

// ---------- Profile editor ----------
const ProfileEditor = ({ draft, setDraft, accent, onCancel, onSave, onClear }) => {
  const setLink = (i, val) => {
    const links = Array.isArray(draft.links) ? [...draft.links] : [];
    links[i] = val;
    setDraft({ ...draft, links });
  };
  const linksDraft = (Array.isArray(draft.links) ? draft.links : []).slice(0, 4);
  while (linksDraft.length < 2) linksDraft.push('');

  return <div>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
      <Input value={draft.displayName || ''} onChange={e => setDraft({ ...draft, displayName: e.target.value })}
        placeholder="Display name (e.g. Scribe of Glass)" maxLength={60} />
      <select className="input" value={draft.accent || 'sky'} onChange={e => setDraft({ ...draft, accent: e.target.value })}
        style={{ cursor: 'pointer' }}>
        {ACCENTS.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
      </select>
    </div>
    <Textarea value={draft.bio || ''} onChange={e => setDraft({ ...draft, bio: e.target.value })}
      placeholder="A short tagline (visible to anyone who lands on this profile, max 240 chars)"
      maxLength={240}
      style={{ width: '100%', minHeight: 60, marginBottom: 10 }} />
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12 }}>
      {linksDraft.map((v, i) => (
        <Input key={i} value={v} onChange={e => setLink(i, e.target.value)}
          placeholder={`Link #${i+1} (e.g. https://…)`} />
      ))}
    </div>
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <Button variant="primary" size="sm" onClick={onSave}><I name="check" size={13} /> Save</Button>
      <Button variant="ghost"   size="sm" onClick={onCancel}>Cancel</Button>
      <span style={{ flex: 1 }} />
      <Button variant="ghost"   size="sm" onClick={onClear}><I name="trash-2" size={13} /> Reset</Button>
    </div>
    <div style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'var(--font-body)', marginTop: 8 }}>
      Profile customisations live only in this browser. They never touch the chain. Your records and address are global; this is just decoration.
    </div>
  </div>;
};

// ---------- Sub components ----------
const StatMini = ({ label, value, small, noDivider }) => (
  <div style={{ padding: '10px 0', borderBottom: noDivider ? 'none' : '1px solid rgba(30,90,160,0.08)' }}>
    <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{label}</div>
    <div style={{ fontFamily: small ? 'var(--font-mono)' : 'var(--font-display)', fontWeight: small ? 500 : 800, fontSize: small ? 13 : 22, color: 'var(--text-primary)', letterSpacing: small ? 0 : '-0.01em' }}>{value}</div>
  </div>
);

const EmptyProfile = ({ isMe, go }) => (
  <Card style={{ padding: 56, textAlign: 'center' }}>
    <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', margin: '0 auto 16px', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.6), 0 6px 16px rgba(2,136,209,0.25)' }}>
      <I name="scroll-text" size={32} />
    </div>
    <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: 0 }}>No inscriptions yet.</h3>
    <p style={{ color: 'var(--text-secondary)', margin: '6px 0 16px' }}>
      {isMe ? 'Your first sealed conversation will appear here.' : 'This address hasn\u2019t sealed any conversations.'}
    </p>
    {isMe && <Button variant="primary" size="md" onClick={() => go('chat')}>Start chatting <I name="arrow-right" size={14} /></Button>}
  </Card>
);

const RecordsGrid = ({ records, go }) => (
  <div className="resp-grid-3" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 18 }}>
    {records.map(r => <Card key={r.id} hover onClick={() => go('record', r.id)}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>#{r.id}</span>
        <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>{relativeTime(r.sealedAt)}</span>
      </div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
        <Badge variant="model">{r.model}</Badge>
        <Badge variant="encrypted"><I name="lock" size={10} /> Encrypted</Badge>
      </div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, lineHeight: 1.55, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.35)', padding: 10, borderRadius: 10, border: '1px solid rgba(255,255,255,0.6)', wordBreak: 'break-all', minHeight: 58 }}>
        {r.arweaveCid}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
        <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--sky-600)' }}>View →</span>
      </div>
    </Card>)}
  </div>
);

const ModelsTab = ({ list, max, total, accent }) => (
  <Card style={{ padding: 32 }}>
    <div style={{ marginBottom: 20 }}>
      <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, margin: 0 }}>Model distribution</h3>
      <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>How this author&rsquo;s records are split across Nous models.</p>
    </div>

    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {list.map(([model, count]) => {
        const pct = (count / max) * 100;
        const share = ((count / total) * 100).toFixed(1);
        return <div key={model}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>{model}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-muted)' }}>{share}%</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--sky-700)' }}>{count}</span>
            </div>
          </div>
          <div style={{ height: 10, background: 'rgba(30,90,160,0.08)', borderRadius: 999, overflow: 'hidden', position: 'relative' }}>
            <div style={{
              width: `${pct}%`, height: '100%',
              background: `linear-gradient(180deg, ${accent.start} 0%, ${accent.end} 100%)`,
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.5)',
              borderRadius: 999, transition: 'width 400ms',
            }} />
          </div>
        </div>;
      })}
    </div>
  </Card>
);

const TimelineTab = ({ records, go }) => {
  const groups = {};
  for (const r of records) {
    const key = new Date((r.sealedAt || 0) * 1000).toISOString().slice(0, 7);
    (groups[key] = groups[key] || []).push(r);
  }
  const sortedKeys = Object.keys(groups).sort().reverse();
  const formatMonth = (ym) => {
    const [y, m] = ym.split('-');
    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    return `${months[parseInt(m, 10) - 1] || ''} ${y}`.trim();
  };

  return <Card style={{ padding: 36 }}>
    <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, margin: '0 0 20px' }}>Activity timeline</h3>
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {sortedKeys.map((key, gi) => <div key={key} style={{ display: 'flex', gap: 20, marginBottom: 24 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
          <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--gradient-water)', border: '2px solid #fff', boxShadow: '0 2px 6px rgba(2,136,209,0.3)' }} />
          {gi < sortedKeys.length - 1 && <div style={{ width: 2, flex: 1, background: 'linear-gradient(180deg, rgba(2,136,209,0.35), rgba(2,136,209,0.1))', marginTop: 4, minHeight: 40 }} />}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, color: 'var(--text-primary)', marginBottom: 10 }}>{formatMonth(key)}</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {groups[key].map(r => <div key={r.id} onClick={() => go('record', r.id)} style={{
              display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
              background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.7)',
              borderRadius: 12, cursor: 'pointer', transition: 'all 200ms', backdropFilter: 'blur(10px)',
            }} onMouseEnter={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.7)'; e.currentTarget.style.transform = 'translateX(4px)'; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(255,255,255,0.5)'; e.currentTarget.style.transform = 'none'; }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>#{r.id}</span>
              <Badge variant="model">{r.model}</Badge>
              <span style={{ flex: 1 }} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--text-secondary)' }}>{new Date(r.sealedAt * 1000).toISOString().slice(11, 16)}</span>
              <I name="chevron-right" size={14} style={{ color: 'var(--sky-600)' }} />
            </div>)}
          </div>
        </div>
      </div>)}
    </div>
  </Card>;
};

Object.assign(window, { UserProfile, loadProfile, saveProfile });
