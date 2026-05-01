// Shared primitives for Nous Mnemos web UI kit.
// Load after React/Babel. Exports to window.

const { useState, useEffect, useRef, useMemo, createContext, useContext, Fragment } = React;

// ---------- App data ----------
// Real data comes from the backend + chain. These arrays stay empty until then.
const MOCK = {
  me: { address: '0x7a23f08e91b2c9f18a6d44e7b01f04e2cc42f91c', ens: 'scribe.eth' },
  attesters: [],
  records: [],
  stats: { total: 0, authors: 0, models: 0, permanence: '∞' },
  // Two fields per model:
  //   - `name`  : pretty label shown in dropdowns (matches Nous Portal's UI)
  //   - `apiId` : the EXACT id Portal's inference API expects as the
  //               `model` parameter, taken verbatim from
  //               GET https://inference-api.nousresearch.com/v1/models.
  //
  // The Portal chat UI shows a wider list (DeepHermes-*, Hermes-4.3-36B)
  // but those are NOT served from the inference endpoint — they live on a
  // separate UI-only backend. The inference catalog only carries the five
  // Nous models below, so that's what we expose here. Trying to seal a
  // Hermes that isn't in the catalog 404s, which is what was happening.
  //
  // To add a model, hit  GET http://localhost:8787/models  with your
  // Portal key and paste any new id verbatim into `apiId`.
  models: [
    { id: 'hermes-4-70b',    name: 'Hermes-4-70B',            apiId: 'nousresearch/hermes-4-70b',            ctx: '128k', desc: 'Balanced, default' },
    { id: 'hermes-4-405b',   name: 'Hermes-4-405B',           apiId: 'nousresearch/hermes-4-405b',           ctx: '128k', desc: 'Largest Hermes-4' },
    { id: 'hermes-3-70b',    name: 'Hermes-3-Llama-3.1-70B',  apiId: 'nousresearch/hermes-3-llama-3.1-70b',  ctx: '128k', desc: 'Hermes-3 staple' },
    { id: 'hermes-3-405b',   name: 'Hermes-3-Llama-3.1-405B', apiId: 'nousresearch/hermes-3-llama-3.1-405b', ctx: '128k', desc: 'Deepest reasoning' },
    { id: 'hermes-2-pro-8b', name: 'Hermes-2-Pro-Llama-3-8B', apiId: 'nousresearch/hermes-2-pro-llama-3-8b', ctx: '8k',   desc: 'Fast, lightweight' },
  ],
};

// ---------- Icon (inline SVG — lucide-style strokes) ----------
const ICON_PATHS = {
  'feather': 'M20.24 12.24a6 6 0 0 0-8.49-8.49L5 10.5V19h8.5z M16 8 2 22 M17.5 15H9',
  'scroll-text': 'M15 12h-5 M15 8h-5 M19 17V5a2 2 0 0 0-2-2H4 M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3',
  'lock': 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 10 0v4',
  'unlock': 'M19 11H5a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7a2 2 0 0 0-2-2z M7 11V7a5 5 0 0 1 9.9-1',
  'shield': 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z',
  'check-circle-2': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M9 12l2 2 4-4',
  'check': 'M20 6 9 17l-5-5',
  'x-circle': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M15 9l-6 6 M9 9l6 6',
  'copy': 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M15 2H9a1 1 0 0 0-1 1v2a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1V3a1 1 0 0 0-1-1z',
  'external-link': 'M15 3h6v6 M10 14 21 3 M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6',
  'download': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5 M12 15V3',
  'settings': 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'wallet': 'M19 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2 M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1h-3a2 2 0 1 1 0-4h3a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1H5a2 2 0 0 0-2 2z',
  'arrow-right': 'M5 12h14 M12 5l7 7-7 7',
  'arrow-left': 'M19 12H5 M12 19l-7-7 7-7',
  'sparkles': 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.582a.5.5 0 0 1 0 .962L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
  'database': 'M12 8c4.97 0 9-1.79 9-4s-4.03-4-9-4-9 1.79-9 4 4.03 4 9 4z M21 12c0 2.21-4 4-9 4s-9-1.79-9-4 M3 5v14c0 2.21 4 4 9 4s9-1.79 9-4V5',
  'anchor': 'M12 22V8 M5 12H2a10 10 0 0 0 20 0h-3 M12 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'chevron-down': 'm6 9 6 6 6-6',
  'chevron-right': 'm9 18 6-6-6-6',
  'sliders-horizontal': 'M21 4H14 M10 4H3 M21 12h-9 M8 12H3 M21 20h-7 M10 20H3 M14 2v4 M8 10v4 M14 18v4',
  'share-2': 'M18 8a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 22a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M8.59 13.51l6.83 3.98 M15.41 6.51l-6.82 3.98',
  'user': 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2 M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  'book-open': 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z',
  'rotate-ccw': 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5',
  'edit-2': 'M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z',
  'eye-off': 'M9.88 9.88a3 3 0 1 0 4.24 4.24 M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68 M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61 M2 2l20 20',
  'eye': 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7z M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  'trash-2': 'M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6 M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2 M10 11v6 M14 11v6',
  'upload': 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M17 8l-5-5-5 5 M12 3v12',
  'globe': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z',
  'sun':   'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z M12 1v2 M12 21v2 M4.22 4.22l1.42 1.42 M18.36 18.36l1.42 1.42 M1 12h2 M21 12h2 M4.22 19.78l1.42-1.42 M18.36 5.64l1.42-1.42',
  'moon':  'M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z',
  'search':'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z M21 21l-4.35-4.35',
  'help-circle': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01',
  'play':  'M5 3l14 9-14 9z',
  'git-compare': 'M6 17a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M18 7a3 3 0 1 0 0-6 3 3 0 0 0 0 6z M6 14V8a4 4 0 0 1 4-4h6 M18 10v6a4 4 0 0 1-4 4H8 M14 7l-3-3 3-3 M10 21l-3-3 3-3',
  'zap':   'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
  'message-square': 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
  'command': 'M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z',
  'plus':  'M12 5v14 M5 12h14',
  'minus': 'M5 12h14',
  'menu':  'M3 12h18 M3 6h18 M3 18h18',
  'alert-triangle': 'M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z M12 9v4 M12 17h.01',
  'info': 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z M12 16v-4 M12 8h.01',
};
const I = ({ name, size = 18, style }) => {
  const d = ICON_PATHS[name] || '';
  const paths = d.split(' M').map((p, i) => (i === 0 ? p : 'M' + p));
  return <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24"
    fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.1))', ...style }} aria-hidden>
    {paths.map((p, i) => <path key={i} d={p} />)}
  </svg>;
};

// ---------- Avatar ----------
const addrHue = (addr) => {
  let h = 0; for (const c of (addr || '').toLowerCase()) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
};
const Avatar = ({ address, size = 32 }) => {
  const h = addrHue(address);
  const palettes = [
    ['#4DD0E1', '#0288D1'], ['#AED581', '#558B2F'], ['#B39DDB', '#673AB7'],
    ['#FFF59D', '#F57C00'], ['#80DEEA', '#0097A7'], ['#FF8A80', '#C2185B'],
  ];
  const [a, b] = palettes[h % palettes.length];
  return <div style={{
    width: size, height: size, borderRadius: '50%',
    background: `radial-gradient(circle at 30% 30%, #fff 0%, ${a} 45%, ${b} 100%)`,
    border: '2px solid #fff',
    boxShadow: 'inset 0 2px 0 rgba(255,255,255,0.6), 0 3px 8px rgba(30,90,160,0.3)',
    position: 'relative', flexShrink: 0,
  }}>
    <div style={{ position: 'absolute', top: size*0.12, left: size*0.2, width: size*0.32, height: size*0.18, background: 'rgba(255,255,255,0.55)', borderRadius: '50%' }} />
  </div>;
};

// ---------- Button ----------
const Button = ({ variant = 'primary', size = 'md', children, onClick, disabled, style, type = 'button' }) => {
  const sizes = {
    sm: { padding: '8px 16px', fontSize: 13 },
    md: { padding: '12px 24px', fontSize: 14 },
    lg: { padding: '14px 32px', fontSize: 16 },
  };
  const cls = variant === 'primary' ? 'btn-primary' : variant === 'secondary' ? 'btn-secondary' : 'btn-ghost';
  return <button type={type} className={cls} onClick={onClick} disabled={disabled}
    style={{ ...sizes[size], opacity: disabled ? 0.5 : 1, cursor: disabled ? 'not-allowed' : 'pointer', ...style }}>
    {children}
  </button>;
};

// ---------- Card ----------
const Card = ({ children, style, className = '', onClick, hover = false }) => {
  const [h, setH] = useState(false);
  return <div className={`glass ${className}`} onClick={onClick}
    onMouseEnter={() => hover && setH(true)} onMouseLeave={() => setH(false)}
    style={{
      padding: 24, transition: 'transform 200ms cubic-bezier(.2,.8,.2,1), box-shadow 200ms',
      transform: h ? 'scale(1.015)' : 'none',
      boxShadow: h ? 'var(--shadow-glass-hover), 0 0 24px rgba(41,182,246,0.2)' : 'var(--shadow-glass)',
      cursor: onClick ? 'pointer' : 'default',
      ...style,
    }}>{children}</div>;
};

// ---------- Badge ----------
const Badge = ({ variant = 'info', children, style }) =>
  <span className={`badge badge-${variant}`} style={style}>{children}</span>;

// Small square icon button used across record cards (copy CID, hide,
// open BaseScan, etc). Defined once globally so multiple pages can share.
const iconBtnStyle = {
  background: 'rgba(255,255,255,0.5)',
  border: '1px solid rgba(255,255,255,0.8)',
  borderRadius: 8, width: 30, height: 30,
  cursor: 'pointer', color: 'var(--sky-600)',
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
};

// ---------- Input ----------
const Input = ({ style, ...props }) => <input className="input" style={style} {...props} />;
const Textarea = ({ style, ...props }) => <textarea className="input" style={{ resize: 'none', fontFamily: 'var(--font-body)', minHeight: 88, ...style }} {...props} />;

// ---------- Address ----------
const Address = ({ address, short = true, copy = true }) => {
  const display = short ? `${address.slice(0, 6)}…${address.slice(-4)}` : address;
  const [copied, setCopied] = useState(false);
  const onCopy = (e) => { e.stopPropagation(); navigator.clipboard?.writeText(address); setCopied(true); setTimeout(() => setCopied(false), 1200); };
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-secondary)' }}>
    {display}
    {copy && <button onClick={onCopy} title="Copy"
      style={{ background: 'none', border: 'none', cursor: 'pointer', color: copied ? 'var(--grass-600)' : 'var(--text-muted)', padding: 2, display: 'inline-flex' }}>
      <I name={copied ? 'check' : 'copy'} size={13} />
    </button>}
  </span>;
};

// ---------- Hash ----------
const Hash = ({ value, label }) => {
  const d = value.length > 18 ? `${value.slice(0, 10)}…${value.slice(-6)}` : value;
  return <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: 'rgba(255,255,255,0.45)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.7)' }}>
    {label && <span style={{ fontFamily: 'var(--font-display)', fontWeight: 700, fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', minWidth: 90 }}>{label}</span>}
    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', flex: 1 }}>{d}</span>
    <I name="copy" size={13} style={{ color: 'var(--text-muted)', cursor: 'pointer' }} />
  </div>;
};

// ---------- ChainBadge ----------
// Reads connected chain from wallet context if no `correct` prop is passed.
const BASE_SEPOLIA_HEX = '0x14a34'; // 84532
const ChainBadge = ({ correct }) => {
  const wallet = useContext(WalletContext);
  const computed = correct !== undefined
    ? correct
    : (wallet?.address ? (wallet.chainId?.toLowerCase?.() === BASE_SEPOLIA_HEX) : true);
  const isWrong = wallet?.address && !computed;

  if (isWrong) {
    // Compact warning — just an icon button, no long text
    return <button onClick={() => wallet.switchToBaseSepolia()}
      title="Wrong network — click to switch to Base Sepolia (84532)"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
        background: 'rgba(255,183,77,0.75)', border: '1px solid rgba(255,183,77,0.9)',
        borderRadius: 10, width: 32, height: 32, cursor: 'pointer', flexShrink: 0,
        color: '#7A4500',
      }}>
      <I name="alert-triangle" size={14} />
    </button>;
  }

  return <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 5,
    fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 10,
    color: 'var(--sky-700)',
    background: 'rgba(255,255,255,0.7)',
    padding: '4px 8px', borderRadius: 999,
    border: '1px solid rgba(255,255,255,0.9)', textTransform: 'uppercase', letterSpacing: '0.04em',
    whiteSpace: 'nowrap', flexShrink: 0,
  }}>
    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--grass-500)', boxShadow: '0 0 5px var(--grass-500)' }} />
    Base Sepolia
  </span>;
};

// ---------- Modal ----------
const Modal = ({ open, onClose, children, width = 480 }) => {
  if (!open) return null;
  return <div style={{
    position: 'fixed', inset: 0, zIndex: 1000,
    background: 'rgba(11, 40, 71, 0.45)', backdropFilter: 'blur(6px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }} onClick={onClose}>
    <div onClick={(e) => e.stopPropagation()} className="glass"
      style={{ width, maxWidth: '100%', padding: 28, background: 'rgba(255,255,255,0.92)' }}>
      {children}
    </div>
  </div>;
};

// ---------- Toast ----------
const ToastContext = createContext(null);
const useToast = () => useContext(ToastContext);
const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const push = (msg, variant = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts(t => [...t, { id, msg, variant }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3400);
  };
  return <ToastContext.Provider value={push}>
    {children}
    <div style={{ position: 'fixed', top: 100, right: 24, zIndex: 2000, display: 'flex', flexDirection: 'column', gap: 10 }}>
      {toasts.map(t => <div key={t.id} className="glass" style={{
        padding: '12px 18px', minWidth: 260,
        background: t.variant === 'success' ? 'linear-gradient(180deg, rgba(174,213,129,0.95), rgba(139,195,74,0.95))' :
                   t.variant === 'error'   ? 'linear-gradient(180deg, rgba(255,138,128,0.95), rgba(255,82,82,0.95))' :
                   t.variant === 'warning' ? 'linear-gradient(180deg, rgba(255,245,157,0.95), rgba(255,183,77,0.95))' :
                   'rgba(255,255,255,0.9)',
        color: t.variant === 'info' ? 'var(--text-primary)' : '#fff',
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14,
      }}>{t.msg}</div>)}
    </div>
  </ToastContext.Provider>;
};

// ---------- Wallet (EIP-1193) ----------
// Real wallet connection via window.ethereum. Works with MetaMask, Rabby, Coinbase Wallet,
// Trust, OKX, etc. No external deps — we'll swap to wagmi/RainbowKit when we move to Vite.

const WalletContext = createContext(null);
const useWallet = () => useContext(WalletContext);

const WalletProvider = ({ children }) => {
  const [address, setAddress] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const eth = typeof window !== 'undefined' ? window.ethereum : null;
  const hasProvider = !!eth;

  // On mount: pick up any already-authorized account silently (no prompt),
  // read current chain, and subscribe to wallet events.
  useEffect(() => {
    if (!eth) return;
    eth.request({ method: 'eth_accounts' })
      .then(accs => { if (accs && accs[0]) setAddress(accs[0].toLowerCase()); })
      .catch(() => {});
    eth.request({ method: 'eth_chainId' })
      .then(cid => setChainId(cid))
      .catch(() => {});

    const onAccounts = (accs) => setAddress(accs && accs[0] ? accs[0].toLowerCase() : null);
    const onChain    = (cid)  => setChainId(cid);
    eth.on?.('accountsChanged', onAccounts);
    eth.on?.('chainChanged',    onChain);
    return () => {
      eth.removeListener?.('accountsChanged', onAccounts);
      eth.removeListener?.('chainChanged',    onChain);
    };
  }, []);

  const connect = async () => {
    if (!eth) {
      setError('No wallet detected. Install MetaMask or another EIP-1193 wallet.');
      return;
    }
    setConnecting(true); setError(null);
    try {
      const accs = await eth.request({ method: 'eth_requestAccounts' });
      if (accs && accs[0]) setAddress(accs[0].toLowerCase());
      const cid = await eth.request({ method: 'eth_chainId' });
      setChainId(cid);
    } catch (e) {
      setError(e?.message || 'Connection rejected');
    } finally {
      setConnecting(false);
    }
  };

  // EIP-1193 has no true disconnect — user revokes via wallet extension.
  // We forget the address locally so UI returns to the connect state.
  const disconnect = () => { setAddress(null); setError(null); };

  const switchToBaseSepolia = async () => {
    if (!eth) return;
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: BASE_SEPOLIA_HEX }],
      });
    } catch (e) {
      // 4902 = chain not added yet
      if (e?.code === 4902) {
        try {
          await eth.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: BASE_SEPOLIA_HEX,
              chainName: 'Base Sepolia',
              nativeCurrency: { name: 'Sepolia Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: ['https://sepolia.base.org'],
              blockExplorerUrls: ['https://sepolia.basescan.org'],
            }],
          });
        } catch (addErr) {
          setError(addErr?.message || 'Could not add Base Sepolia');
        }
      } else {
        setError(e?.message || 'Network switch rejected');
      }
    }
  };

  const value = {
    address, chainId, connecting, error, hasProvider,
    connect, disconnect, switchToBaseSepolia,
    isBaseSepolia: chainId?.toLowerCase?.() === BASE_SEPOLIA_HEX,
  };
  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
};

// ---------- Markdown renderer ----------
// Renders untrusted text as HTML via marked + DOMPurify, with hljs syntax
// highlighting where applicable. We keep it inline so callers can style the
// container however they want.
const _markedReady = (() => {
  if (typeof window.marked !== 'undefined') {
    try {
      window.marked.setOptions({
        gfm: true, breaks: true,
        highlight: (code, lang) => {
          if (window.hljs) {
            try {
              if (lang && window.hljs.getLanguage(lang)) {
                return window.hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
              }
              return window.hljs.highlightAuto(code).value;
            } catch { return code; }
          }
          return code;
        },
      });
    } catch {}
  }
  return true;
})();

const renderMarkdown = (text) => {
  const src = String(text || '');
  if (!window.marked || !window.DOMPurify) {
    // graceful fallback — preserve newlines
    return src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>');
  }
  try {
    const raw = window.marked.parse(src);
    return window.DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  } catch {
    return src.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n/g, '<br/>');
  }
};

const MarkdownContent = ({ text, invert = false, style }) => {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className={`md ${invert ? 'md--invert' : ''}`} style={style}
    dangerouslySetInnerHTML={{ __html: html }} />;
};

// ---------- Theme stubs (dark mode removed; kept as no-ops so any old
// imports don't crash). The app is now light-only. ----------
const useTheme = () => ({ theme: 'light', setTheme: () => {}, toggleTheme: () => {} });
const ThemeProvider = ({ children }) => {
  useEffect(() => {
    try { document.documentElement.removeAttribute('data-theme'); } catch {}
    try { localStorage.removeItem('mnemos_theme'); } catch {}
  }, []);
  return <Fragment>{children}</Fragment>;
};
const ThemeToggle = () => null;

// ---------- Command palette / keyboard shortcuts ----------
// Global Ctrl/Cmd+K palette. Items registered via go() callback. Caller
// passes an array of { label, hint, icon, action } items.
const CommandPaletteContext = createContext(null);
const useCommandPalette = () => useContext(CommandPaletteContext);

const CommandPalette = ({ items, open, onClose }) => {
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => { if (open) { setQ(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return items;
    return items.filter(it =>
      (it.label || '').toLowerCase().includes(s) ||
      (it.hint  || '').toLowerCase().includes(s)
    );
  }, [items, q]);

  if (!open) return null;

  const onKey = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(filtered.length - 1, i + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = filtered[idx]; if (it) { it.action(); onClose(); } }
    else if (e.key === 'Escape') { onClose(); }
  };

  return <div onClick={onClose} style={{
    position: 'fixed', inset: 0, zIndex: 3000,
    background: 'rgba(11,40,71,0.55)', backdropFilter: 'blur(8px)',
    display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: 90,
    animation: 'fadeIn 200ms var(--ease-out)',
  }}>
    <div onClick={(e) => e.stopPropagation()} className="glass" style={{ width: 560, maxWidth: '92%', padding: 12, background: 'rgba(255,255,255,0.92)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', borderBottom: '1px solid rgba(30,90,160,0.10)' }}>
        <I name="command" size={16} style={{ color: 'var(--sky-600)' }} />
        <input ref={inputRef} value={q} onChange={e => { setQ(e.target.value); setIdx(0); }} onKeyDown={onKey}
          placeholder="Search commands or jump to…"
          style={{ flex: 1, border: 'none', outline: 'none', background: 'transparent', fontFamily: 'var(--font-display)', fontSize: 16, color: 'var(--text-primary)', padding: '8px 0' }} />
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', padding: '2px 6px', borderRadius: 4, border: '1px solid rgba(30,90,160,0.18)' }}>Esc</span>
      </div>
      <div style={{ maxHeight: 360, overflowY: 'auto', padding: 6 }}>
        {filtered.length === 0 ? (
          <div style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--font-poetic)' }}>No matches.</div>
        ) : filtered.map((it, i) => (
          <button key={i} onMouseEnter={() => setIdx(i)} onClick={() => { it.action(); onClose(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
              background: i === idx ? 'rgba(2,136,209,0.12)' : 'transparent',
              border: 'none', borderRadius: 8, padding: '10px 12px',
              cursor: 'pointer', color: 'var(--text-primary)',
              fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: 14,
            }}>
            <I name={it.icon || 'arrow-right'} size={14} style={{ color: 'var(--sky-600)' }} />
            <span style={{ flex: 1 }}>{it.label}</span>
            {it.hint && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)' }}>{it.hint}</span>}
          </button>
        ))}
      </div>
    </div>
  </div>;
};

// ---------- Onboarding walkthrough ----------
// 3-step intro shown on first load. Stores completion in localStorage. Uses
// page navigation via go() so users can connect, set key, and start chat.
const Onboarding = ({ go, wallet, onClose }) => {
  const [step, setStep] = useState(0);
  const hasKey = (() => { try { return !!JSON.parse(localStorage.getItem('mnemos_api_key') || '""'); } catch { return false; } })();

  const steps = [
    { title: 'Welcome to Nous Mnemos', body: 'A small ritual for permanence. Talk to a Nous AI; seal the conversation forever on Base. Anyone can verify it. Only you can read it.', icon: 'sparkles' },
    { title: 'Connect your wallet',    body: 'You\'ll need an EIP-1193 wallet (MetaMask, Rabby, etc) on Base Sepolia. Your address signs the seal and derives your encryption key.', icon: 'wallet',
      action: wallet?.address ? null : { label: wallet?.connecting ? 'Connecting…' : 'Connect now', run: () => wallet?.connect?.() } },
    { title: 'Add your Nous API key',  body: 'Your key stays in this browser and is forwarded to the attester only at the moment of generation. Get one at portal.nousresearch.com.', icon: 'lock',
      action: hasKey ? null : { label: 'Open Settings', run: () => { go('settings'); onClose(); } } },
    { title: 'Begin an inscription',   body: 'Open New Chat, type freely, then End & seal when you\'re done. Tip: Ctrl/Cmd+K opens the command palette.', icon: 'feather',
      action: { label: 'Start chatting', run: () => { go('chat'); onClose(); } } },
  ];

  const dot = (active, done) => ({
    width: 8, height: 8, borderRadius: '50%',
    background: done ? 'var(--grass-500)' : active ? 'var(--sky-500)' : 'rgba(30,90,160,0.2)',
    transition: 'all 200ms',
  });

  const cur = steps[step];
  const last = step === steps.length - 1;

  return <div style={{
    position: 'fixed', inset: 0, zIndex: 2500,
    background: 'rgba(11,40,71,0.55)', backdropFilter: 'blur(10px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
    animation: 'fadeIn 240ms var(--ease-out)',
  }}>
    <div className="glass" style={{ width: 520, maxWidth: '100%', padding: 32, background: 'rgba(255,255,255,0.95)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <div style={{ width: 56, height: 56, borderRadius: 16, background: 'var(--gradient-water)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.7), 0 6px 16px rgba(2,136,209,0.3)' }}>
          <I name={cur.icon} size={26} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 22, color: 'var(--text-primary)' }}>{cur.title}</div>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Step {step + 1} of {steps.length}</div>
        </div>
        <button onClick={onClose} title="Skip" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 6 }}>
          <I name="x-circle" size={18} />
        </button>
      </div>

      <p style={{ fontFamily: 'var(--font-body)', fontSize: 15, lineHeight: 1.65, color: 'var(--text-secondary)', margin: '0 0 22px' }}>
        {cur.body}
      </p>

      {cur.action && (
        <div style={{ marginBottom: 18 }}>
          <Button variant="secondary" size="sm" onClick={cur.action.run}>{cur.action.label}</Button>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ display: 'flex', gap: 6, flex: 1 }}>
          {steps.map((_, i) => <div key={i} style={dot(i === step, i < step)} />)}
        </div>
        {step > 0 && <Button variant="ghost" size="sm" onClick={() => setStep(s => s - 1)}><I name="arrow-left" size={13} /> Back</Button>}
        {!last
          ? <Button variant="primary" size="sm" onClick={() => setStep(s => s + 1)}>Next <I name="arrow-right" size={13} /></Button>
          : <Button variant="primary" size="sm" onClick={onClose}>Got it <I name="check" size={13} /></Button>}
      </div>
    </div>
  </div>;
};

// ---------- Empty / informational helpers ----------
// Small "key→value" list used by the Trust Panel and a few stats cards.
const StatList = ({ rows }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
    {rows.map(([label, value], i) => (
      <div key={label + i} style={{ display: 'flex', alignItems: 'baseline', gap: 12, padding: '8px 0', borderBottom: i < rows.length - 1 ? '1px solid rgba(30,90,160,0.08)' : 'none' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', minWidth: 130 }}>{label}</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 13, color: 'var(--text-primary)', wordBreak: 'break-all', flex: 1 }}>{value}</div>
      </div>
    ))}
  </div>
);

// ---------- relativeTime helper (used by many pages, was implicit) ----------
// Placed here so every page that imports from window has it; safe no-op if
// a page already shipped its own.
const relativeTime = (sec) => {
  if (!sec && sec !== 0) return '—';
  const ts  = typeof sec === 'number' ? sec * 1000 : Date.parse(sec);
  if (!ts) return '—';
  const diff = Math.max(0, (Date.now() - ts) / 1000);
  if (diff < 45)        return 'just now';
  if (diff < 90)        return '1 min ago';
  if (diff < 60 * 45)   return `${Math.round(diff / 60)} min ago`;
  if (diff < 60 * 90)   return '1 hr ago';
  if (diff < 60 * 60 * 22) return `${Math.round(diff / 3600)} hr ago`;
  if (diff < 60 * 60 * 36) return 'yesterday';
  if (diff < 60 * 60 * 24 * 14) return `${Math.round(diff / 86400)} d ago`;
  if (diff < 60 * 60 * 24 * 60) return `${Math.round(diff / 86400 / 7)} w ago`;
  return new Date(ts).toISOString().slice(0, 10);
};
if (typeof window.relativeTime !== 'function') window.relativeTime = relativeTime;

Object.assign(window, {
  MOCK, I, Avatar, Button, Card, Badge, Input, Textarea, Address, Hash, ChainBadge,
  Modal, ToastProvider, useToast,
  WalletProvider, useWallet, BASE_SEPOLIA_HEX,
  // new primitives
  MarkdownContent, renderMarkdown,
  ThemeProvider, useTheme, ThemeToggle,
  CommandPalette, useCommandPalette, CommandPaletteContext,
  Onboarding, StatList, iconBtnStyle,
});
