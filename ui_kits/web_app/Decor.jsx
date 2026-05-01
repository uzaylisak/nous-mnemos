// Decorative atmosphere layer — mouse-reactive radial pattern, clouds, meadow.
// Variants: 'page' (subtle ambient), 'hero' (richer with flare + meadow)

const useMousePos = () => {
  const [pos, setPos] = React.useState({ x: 0.5, y: 0.4 });
  React.useEffect(() => {
    let raf = 0;
    const onMove = (e) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        setPos({ x: e.clientX / window.innerWidth, y: e.clientY / window.innerHeight });
      });
    };
    window.addEventListener('pointermove', onMove);
    return () => { window.removeEventListener('pointermove', onMove); cancelAnimationFrame(raf); };
  }, []);
  return pos;
};

const RadialField = ({ intensity = 1 }) => {
  const { x, y } = useMousePos();
  const cx = (x * 100).toFixed(2);
  const cy = (y * 100).toFixed(2);

  const dotSize = 1.6;
  const dotGap = 12;
  const dotPattern = `radial-gradient(circle at center, rgba(255,255,255,${0.95 * intensity}) ${dotSize}px, transparent ${dotSize + 0.5}px)`;

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      {/* Dot grid, revealed under cursor — mouse as a lantern over the radial pattern */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: dotPattern,
        backgroundSize: `${dotGap}px ${dotGap}px`,
        maskImage:        `radial-gradient(circle at ${cx}% ${cy}%, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 18%, rgba(0,0,0,0.85) 34%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.28) 78%, rgba(0,0,0,0.1) 100%, rgba(0,0,0,0) 120%)`,
        WebkitMaskImage:  `radial-gradient(circle at ${cx}% ${cy}%, rgba(0,0,0,1) 0%, rgba(0,0,0,1) 18%, rgba(0,0,0,0.85) 34%, rgba(0,0,0,0.55) 55%, rgba(0,0,0,0.28) 78%, rgba(0,0,0,0.1) 100%, rgba(0,0,0,0) 120%)`,
        transition: 'mask-image 100ms linear, -webkit-mask-image 100ms linear',
      }} />

      {/* Soft ambient light — tighter halo that travels with the cursor */}
      <div style={{
        position: 'absolute', inset: 0,
        background: `radial-gradient(circle at ${cx}% ${cy}%, rgba(255,255,255,${0.30 * intensity}) 0%, rgba(255,255,255,${0.18 * intensity}) 10%, rgba(186,230,253,${0.10 * intensity}) 22%, rgba(255,255,255,0) 38%)`,
        transition: 'background 120ms linear',
        mixBlendMode: 'screen',
      }} />
    </div>
  );
};

const Decor = ({ variant = 'page' }) => {
  if (variant === 'hero') {
    return (
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        {/* lens flare top right */}
        <div style={{ position: 'absolute', top: -120, right: -120, width: 480, height: 480,
          background: 'radial-gradient(circle, rgba(255,245,157,0.5) 0%, rgba(255,245,157,0) 60%)' }} />
        {/* clouds */}
        <img src="../../assets/cloud.svg" style={{ position: 'absolute', top: 60, left: '-5%', width: 520, opacity: 0.55, filter: 'blur(2px)' }} alt="" />
        <img src="../../assets/cloud.svg" style={{ position: 'absolute', top: 200, right: '-5%', width: 640, opacity: 0.45, filter: 'blur(3px)' }} alt="" />

        {/* Mouse-reactive radial pattern */}
        <RadialField intensity={1} />
      </div>
    );
  }
  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', pointerEvents: 'none', zIndex: 0 }}>
      <img src="../../assets/cloud.svg" style={{ position: 'absolute', top: 80, left: '-10%', width: 480, opacity: 0.35 }} alt="" />
      <img src="../../assets/cloud.svg" style={{ position: 'absolute', top: '40%', right: '-10%', width: 560, opacity: 0.30 }} alt="" />

      {/* Mouse-reactive radial pattern, softer for ambient pages */}
      <RadialField intensity={0.7} />
    </div>
  );
};

Object.assign(window, { Decor, RadialField });
