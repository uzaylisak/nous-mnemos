// Landing page
const Landing = ({ go }) => {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({ total: 0, authors: 0, models: 0, permanence: '∞' });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [latest, c] = await Promise.all([
          window.NousContract.fetchLatestRecords(12),
          window.NousContract.getReadContract(),
        ]);
        if (cancelled) return;
        setRecords(latest);
        if (c) {
          const total = Number(await c.totalRecords());
          const authors = new Set(latest.map(r => r.author.toLowerCase())).size;
          const models  = new Set(latest.map(r => r.model)).size;
          setStats({ total, authors, models, permanence: '∞' });
        }
      } catch (err) {
        console.warn('Landing fetch failed', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return <div>
    {/* Hero */}
    <section style={{
      position: 'relative', overflow: 'hidden',
      background: 'var(--gradient-sky)',
      paddingTop: 140, paddingBottom: 180, marginTop: -90,
      color: '#fff',
    }}>
      <Decor variant="hero" />
      <div style={{ maxWidth: 1100, margin: '0 auto', padding: '0 32px', position: 'relative', zIndex: 2, textAlign: 'center' }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.22)', backdropFilter: 'blur(10px)', border: '1px solid rgba(255,255,255,0.45)', padding: '6px 14px', borderRadius: 999, fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 12, letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 28 }}>
          <I name="sparkles" size={14} /> Permanent · Verifiable · Yours
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 84, lineHeight: 1, letterSpacing: '-0.02em', color: '#fff', textShadow: '0 4px 24px rgba(0,0,0,0.2)', margin: '0 auto', maxWidth: 880 }}>
          Thought, crystallized.
        </h1>
        <p style={{ fontFamily: 'var(--font-poetic)', fontWeight: 500, fontSize: 22, lineHeight: 1.5, color: 'rgba(255,255,255,0.95)', margin: '28px auto 0', maxWidth: 700 }}>
          Every conversation with Nous AI, cryptographically witnessed.<br />Anchored on Base. Stored forever on Arweave. Readable only by you.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', marginTop: 44, flexWrap: 'wrap' }}>
          <Button variant="primary" size="lg" onClick={() => go('chat')}>Begin an inscription <I name="arrow-right" size={18} /></Button>
          <Button variant="ghost" size="lg" onClick={() => go('about')} style={{ background: 'rgba(255,255,255,0.25)', color: '#fff', borderColor: 'rgba(255,255,255,0.6)' }}>How it works</Button>
          <a href="https://github.com/uzaylisak/nous-mnemos" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" size="lg" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', borderColor: 'rgba(255,255,255,0.45)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
              GitHub
            </Button>
          </a>
        </div>
      </div>
    </section>

    {/* How it works */}
    <section style={{ position: 'relative', zIndex: 1, padding: '96px 32px', maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ textAlign: 'center', marginBottom: 56 }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 48, margin: 0, letterSpacing: '-0.01em' }}>Four steps, forever.</h2>
        <p style={{ fontFamily: 'var(--font-poetic)', fontWeight: 500, fontSize: 18, color: 'var(--text-secondary)', marginTop: 10 }}>A simple ritual for permanent memory.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 20 }}>
        {[
          { ic: 'feather', n: 1, t: 'Prompt',  d: 'You write to Nous AI using your own API key. We never see it.' },
          { ic: 'shield',  n: 2, t: 'Witness', d: 'Our attester cryptographically signs the response. Proof is published on-chain.' },
          { ic: 'lock',    n: 3, t: 'Seal',    d: 'Your conversation is encrypted with your public key — only you can read it.' },
          { ic: 'anchor',  n: 4, t: 'Archive', d: 'The ciphertext is stored permanently on Arweave. The record is anchored on Base.' },
        ].map(s => <Card key={s.n} hover>
          <div style={{ width: 56, height: 56, borderRadius: 20, background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 4px 12px rgba(2,136,209,0.3)', marginBottom: 18 }}>
            <I name={s.ic} size={26} />
          </div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--sky-600)', fontWeight: 500, marginBottom: 6 }}>STEP {s.n}</div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 26, margin: '0 0 10px' }}>{s.t}</h3>
          <p style={{ margin: 0, color: 'var(--text-secondary)', lineHeight: 1.55 }}>{s.d}</p>
        </Card>)}
      </div>
    </section>

    {/* Live feed */}
    <section style={{ position: 'relative', zIndex: 1, padding: '24px 32px 96px', maxWidth: 1240, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 32 }}>
        <div>
          <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 42, margin: 0, letterSpacing: '-0.01em' }}>Latest inscriptions</h2>
          <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 17, color: 'var(--text-secondary)', margin: '6px 0 0' }}>Every record is publicly verifiable. Content stays private.</p>
        </div>
        <Button variant="ghost" size="sm">View all <I name="arrow-right" size={14} /></Button>
      </div>
      {loading ? (
        <Card style={{ padding: 56, textAlign: 'center' }}>
          <div className="spin" style={{ width: 32, height: 32, border: '3px solid rgba(41,182,246,0.2)', borderTopColor: 'var(--sky-500)', borderRadius: '50%', margin: '0 auto' }} />
          <p style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', marginTop: 16 }}>Reading from Base Sepolia…</p>
        </Card>
      ) : records.length === 0 ? (
        <Card style={{ padding: 56, textAlign: 'center' }}>
          <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.6), 0 6px 18px rgba(2,136,209,0.25)', margin: '0 auto 20px' }}>
            <I name="feather" size={32} />
          </div>
          <h3 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 24, margin: 0 }}>No inscriptions yet.</h3>
          <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 16, color: 'var(--text-secondary)', margin: '8px 0 24px' }}>Be the first to carve a thought into permanence.</p>
          <Button variant="primary" size="md" onClick={() => go('chat')}>Begin an inscription <I name="arrow-right" size={16} /></Button>
        </Card>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 20 }}>
          {records.map(r => <Card key={r.id} hover onClick={() => go('record', r.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <Avatar address={r.author} size={30} />
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>{`${r.author.slice(0,6)}…${r.author.slice(-4)}`}</span>
              <span style={{ marginLeft: 'auto', fontFamily: 'var(--font-body)', fontSize: 12, color: 'var(--text-muted)' }}>{relativeTime(r.sealedAt)}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
              <Badge variant="model">{r.model}</Badge>
              <Badge variant="encrypted"><I name="lock" size={10} /> Encrypted</Badge>
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 12, lineHeight: 1.6, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.35)', padding: 12, borderRadius: 10, border: '1px solid rgba(255,255,255,0.6)', wordBreak: 'break-all' }}>
              {r.arweaveCid}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>#{r.id}</span>
              <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 13, color: 'var(--sky-600)' }}>View →</span>
            </div>
          </Card>)}
        </div>
      )}
    </section>

    {/* Stats */}
    <section style={{ position: 'relative', zIndex: 1, padding: '0 32px 96px', maxWidth: 1240, margin: '0 auto' }}>
      <Card style={{ padding: '40px 56px', background: 'rgba(255,255,255,0.85)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 32 }}>
          {[
            { k: 'Total records', v: stats.total.toLocaleString() },
            { k: 'Unique authors', v: stats.authors },
            { k: 'Models used',    v: stats.models },
            { k: 'Permanence',     v: stats.permanence },
          ].map(s => <div key={s.k} style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 56, lineHeight: 1, letterSpacing: '-0.02em', background: 'var(--gradient-water)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>{s.v}</div>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 13, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 10, fontWeight: 600 }}>{s.k}</div>
          </div>)}
        </div>
      </Card>
    </section>

    {/* Why */}
    <section style={{ position: 'relative', zIndex: 1, padding: '0 32px 112px', maxWidth: 820, margin: '0 auto', textAlign: 'center' }}>
      <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 40, letterSpacing: '-0.01em', margin: '0 0 28px' }}>Why this exists</h2>
      <p style={{ fontSize: 18, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 20 }}>AI conversations vanish. Models change, providers disappear, history is rewritten.</p>
      <p style={{ fontSize: 18, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 20 }}>Nous Mnemos makes them permanent. Cryptographically signed. On-chain. Unforgeable.</p>
      <p style={{ fontSize: 18, color: 'var(--text-secondary)', lineHeight: 1.65, marginBottom: 40 }}>But memory without privacy is surveillance. Only you hold the key to your thoughts.</p>
    </section>

    {/* Final CTA */}
    <section style={{ position: 'relative', zIndex: 1, padding: '0 32px 140px', maxWidth: 1240, margin: '0 auto' }}>
      <Card style={{ padding: 72, textAlign: 'center', background: 'var(--gradient-water)', color: '#fff', border: '1px solid rgba(255,255,255,0.5)' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 56, margin: 0, letterSpacing: '-0.02em', color: '#fff', textShadow: '0 2px 16px rgba(0,0,0,0.15)' }}>Record your first conversation</h2>
        <p style={{ fontFamily: 'var(--font-poetic)', fontSize: 20, color: 'rgba(255,255,255,0.92)', margin: '16px 0 36px' }}>Clear. Permanent. Yours.</p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Button variant="primary" size="lg" onClick={() => go('chat')} style={{ background: '#fff', color: 'var(--sky-700)' }}>Begin <I name="arrow-right" size={18} /></Button>
          <a href="https://github.com/uzaylisak/nous-mnemos" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
            <Button variant="ghost" size="lg" style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', borderColor: 'rgba(255,255,255,0.5)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" style={{ flexShrink: 0 }}><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
              Open source
            </Button>
          </a>
        </div>
        <div style={{ marginTop: 20, fontSize: 12, color: 'rgba(255,255,255,0.85)', fontFamily: 'var(--font-body)' }}>Connect wallet · Requires Base Sepolia ETH for gas</div>
      </Card>
    </section>
  </div>;
};

// Turn a unix-seconds timestamp into "3h ago" / "2d ago" / "just now"
function relativeTime(ts) {
  if (!ts) return '';
  const diff = Math.floor(Date.now() / 1000) - ts;
  if (diff < 60)      return 'just now';
  if (diff < 3600)    return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)   return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(ts * 1000).toISOString().slice(0, 10);
}

Object.assign(window, { Landing, relativeTime });
