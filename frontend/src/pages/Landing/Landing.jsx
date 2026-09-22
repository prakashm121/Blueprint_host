import { useEffect, useRef, useState, cloneElement, Children } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ChevronDown } from 'lucide-react';

import { FEATURES, STEPS } from './landingData';
import GraphBackground from './GraphBackground';
import BlueprintScene from './BlueprintScene';

// ─── CountUp ──────────────────────────────────────────────────────────────────
function CountUp({ end, suffix = '', duration = 2000 }) {
  const [val, setVal] = useState(0);
  const ref     = useRef(null);
  const started = useRef(false);
  useEffect(() => {
    const obs = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const t0   = performance.now();
        const tick = (now) => {
          const p = Math.min((now - t0) / duration, 1);
          setVal(Math.floor((1 - Math.pow(1 - p, 3)) * end));
          if (p < 1) requestAnimationFrame(tick); else setVal(end);
        };
        requestAnimationFrame(tick);
      }
    }, { threshold: 0.5 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [end, duration]);
  return <span ref={ref}>{val.toLocaleString()}{suffix}</span>;
}

// ─── Reveal on Scroll ─────────────────────────────────────────────────────────
function Reveal({ children, delay = 0, withScale = false }) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) {
        setIsVisible(true);
        obs.unobserve(el);
      }
    }, { threshold: 0.15 });
    
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const child = Children.only(children);
  const childStyle = child.props.style || {};

  const animatedStyle = {
    ...childStyle,
    opacity: isVisible ? 1 : 0,
    transform: isVisible 
      ? (withScale ? 'translateY(0px) scale(1)' : 'translateY(0px)')
      : (withScale ? 'translateY(26px) scale(0.95)' : 'translateY(26px)'),
    transition: `opacity 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms, transform 0.8s cubic-bezier(0.16,1,0.3,1) ${delay}ms`,
    willChange: 'opacity, transform'
  };

  return cloneElement(child, { ref, style: animatedStyle });
}

// ─── Landing Page ─────────────────────────────────────────────────────────────
export default function Landing() {
  const canvasRef    = useRef(null);
  const featuresRef  = useRef(null);
  const [active, setActive]           = useState(0);
  const [scrolled, setScrolled]       = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setActive(a => (a + 1) % FEATURES.length), 4200);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 48);
    window.addEventListener('scroll', fn);
    return () => window.removeEventListener('scroll', fn);
  }, []);

  const f = FEATURES[active];

  return (
    <div className="min-h-screen bg-[#0c1324] text-[#dce1fb] overflow-x-hidden">

      {/* ── Global Styles ─────────────────────────────────────────────────── */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@500;600;800&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0');

        html { scroll-behavior: smooth; }
        *, *::before, *::after { font-family: 'Inter', sans-serif; box-sizing: border-box; }
        .font-mono { font-family: 'JetBrains Mono', monospace !important; }
        .material-symbols-outlined {
          font-family: 'Material Symbols Outlined' !important;
          font-style: normal; font-weight: normal; line-height: 1;
          letter-spacing: normal; text-transform: none;
          display: inline-block; white-space: nowrap; direction: ltr;
        }

        @keyframes _fadeInUp {
          from { opacity: 0; transform: translateY(22px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes _slideRight {
          from { opacity: 0; transform: translateX(-32px); }
          to   { opacity: 1; transform: translateX(0); }
        }
        @keyframes _glow {
          0%   { opacity: .6; transform: scale(1);    box-shadow: 0 0 4px #89ceff; }
          100% { opacity: 1;  transform: scale(1.18); box-shadow: 0 0 14px #89ceff; }
        }
        @keyframes _scan {
          0%   { top: 0%;   opacity: .4; }
          50%  { opacity: 1; }
          100% { top: 100%; opacity: .4; }
        }
        @keyframes _pingSlow {
          0%, 100% { transform: scale(1);   opacity: .6; }
          50%      { transform: scale(1.9); opacity: 0; }
        }
        @keyframes _textShine {
          0%   { background-position: 0%   50%; }
          100% { background-position: 200% 50%; }
        }
        @keyframes _pulseRing {
          0%   { transform: scale(0.95); opacity: 0.7; }
          100% { transform: scale(1.05); opacity: 1; }
        }

        .hero-badge { animation: _fadeInUp  0.7s ease 0.05s both; }
        .hero-h1    { animation: _slideRight 1.0s cubic-bezier(.16,1,.3,1) 0.1s both; }
        .hero-sub   { animation: _fadeInUp  0.9s ease 0.28s both; }
        .hero-cta   { animation: _fadeInUp  0.9s ease 0.44s both; }

        .scan-line {
          position:absolute; left:0; right:0; height:1px;
          background:linear-gradient(90deg,transparent,rgba(137,206,255,.4),transparent);
          animation:_scan 4s ease-in-out infinite; pointer-events:none;
        }

        .fc-cta { opacity:0; transform:translateX(-10px); transition:opacity .25s,transform .25s; }
        .fc:hover .fc-cta { opacity:1; transform:translateX(0); }

        .fc::after {
          content:''; position:absolute; top:-100%; left:-100%; width:50%; height:300%;
          background:linear-gradient(to right,transparent,rgba(137,206,255,0.15),transparent);
          transform:rotate(45deg); pointer-events:none; z-index:10;
        }
        .fc:hover::after { animation:scan-card 1.5s ease-in-out infinite; }
        @keyframes scan-card { 0%{top:-100%;left:-100%;} 100%{top:100%;left:100%;} }

        .step-box { background:#0f172a; border:1px solid rgba(51,65,85,.6); }
        .dot-grid {
          background-image:radial-gradient(circle,rgba(137,206,255,.055) 1px,transparent 1px);
          background-size:38px 38px;
        }
      `}</style>

      {/* ── Nav ───────────────────────────────────────────────────────────── */}
      <header className={`fixed top-0 w-full z-50 transition-all duration-500 ${scrolled
        ? 'bg-[#0c1324]/90 backdrop-blur-xl border-b border-[#1e293b]/40 shadow-[0_1px_8px_rgba(0,0,0,0.2)]'
        : 'bg-transparent'}`}>
        <div className="h-20 max-w-[1280px] mx-auto px-6 lg:px-8 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <span className="material-symbols-outlined text-[#89ceff] text-3xl">award_star</span>
              <span className="absolute inset-0 rounded-full bg-[#89ceff]/15" style={{ animation: '_pingSlow 3s ease infinite' }} />
            </div>
            <span className="font-mono text-lg font-bold tracking-tighter text-white uppercase">Blueprint</span>
          </div>

          <nav className="hidden lg:flex items-center gap-10">
            {['Features', 'How it Works'].map(l => (
              <button key={l} onClick={() => featuresRef.current?.scrollIntoView({ behavior: 'smooth' })}
                className="font-mono text-xs font-semibold tracking-[.1em] text-[#bec8d2] hover:text-[#89ceff] transition-colors uppercase">
                {l}
              </button>
            ))}
            <Link to="/login" className="font-mono text-xs font-semibold tracking-[.1em] text-[#bec8d2] hover:text-[#89ceff] transition-colors uppercase">Login</Link>
            <Link to="/register" className="px-6 py-2.5 bg-[#89ceff] text-[#00344d] font-mono text-xs font-bold tracking-[.1em] uppercase rounded-full hover:shadow-[0_0_24px_rgba(137,206,255,.4)] hover:scale-105 active:scale-95 transition-all">
              Get Started
            </Link>
          </nav>

          <button className="lg:hidden text-[#dce1fb] p-2 -mr-2" onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
            <span className="material-symbols-outlined">{mobileMenuOpen ? 'close' : 'menu'}</span>
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden absolute top-20 left-0 w-full bg-[#0c1324]/95 backdrop-blur-xl border-b border-[#1e293b]/40 shadow-xl px-6 py-6 flex flex-col gap-6">
            <div className="flex flex-col gap-4">
              {['Features', 'How it Works'].map(l => (
                <button key={l} onClick={() => { setMobileMenuOpen(false); featuresRef.current?.scrollIntoView({ behavior: 'smooth' }); }}
                  className="text-left font-mono text-sm font-semibold tracking-[.1em] text-[#bec8d2] hover:text-[#89ceff] transition-colors uppercase">{l}</button>
              ))}
            </div>
            <div className="flex flex-col gap-4 pt-4 border-t border-[#1e293b]/40">
              <Link to="/login" className="font-mono text-sm font-semibold tracking-[.1em] text-[#bec8d2] hover:text-[#89ceff] transition-colors uppercase">Login</Link>
              <Link to="/register" className="text-center py-3 bg-[#89ceff] text-[#00344d] font-mono text-xs font-bold tracking-[.1em] uppercase rounded-full hover:shadow-[0_0_24px_rgba(137,206,255,.35)] transition-all">Get Started</Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <section className="relative w-full min-h-screen flex items-center overflow-hidden">
        <GraphBackground />

        <div className="absolute inset-0 z-[1] pointer-events-none" style={{ background: `radial-gradient(ellipse 75% 65% at 50% 50%, rgba(12,19,36,0) 0%, rgba(12,19,36,0.55) 70%, rgba(12,19,36,0.9) 100%), linear-gradient(to bottom, rgba(12,19,36,0.2) 0%, rgba(12,19,36,0.5) 55%, rgba(12,19,36,0.98) 90%, #0c1324 100%)` }} />
        <div className="absolute inset-0 z-[1] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 20% 80%, rgba(137,206,255,0.07) 0%, transparent 50%)' }}>
          <div className="scan-line" />
        </div>
        <div className="absolute top-1/4 -left-24 w-[520px] h-[520px] bg-[#89ceff]/6 rounded-full blur-[130px] pointer-events-none" style={{ animation: '_pulseRing 5s ease-in-out infinite alternate' }} />
        <div className="absolute bottom-1/4 -right-24 w-[420px] h-[420px] bg-[#bdc2ff]/6 rounded-full blur-[110px] pointer-events-none" style={{ animation: '_pulseRing 6s ease-in-out infinite alternate-reverse' }} />

        <div className="relative z-[2] max-w-[1280px] mx-auto px-6 lg:px-8 w-full pt-24 pb-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">

          {/* Left copy */}
          <div className="lg:col-span-6 space-y-7">
            <div className="hero-badge inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-[#89ceff]/10 border border-[#89ceff]/25 w-fit">
              <span className="w-2 h-2 rounded-full bg-[#89ceff] block" style={{ animation: '_glow 1.5s ease-in-out infinite alternate' }} />
              <span className="font-mono text-[11px] font-semibold tracking-[.15em] text-[#89ceff] uppercase">System Ready · V.04</span>
            </div>

            <h1 className="hero-h1 text-5xl sm:text-6xl lg:text-[70px] font-extrabold text-white leading-[1.08] tracking-tight max-w-2xl">
              Build your engineering career with a{' '}
              <span className="italic pr-1" style={{ backgroundImage: 'linear-gradient(90deg,#89ceff,#ffffff,#89ceff)', backgroundSize: '200% auto', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', animation: '_textShine 4s linear infinite', display: 'inline-block' }}>
                plan
              </span>
              {', '}not luck.
            </h1>

            <p className="hero-sub text-lg text-[#bec8d2] leading-relaxed max-w-lg">
              Blueprint gives you a role-specific weekly roadmap, 33,000+ curated interview questions,
              an AI mentor that tracks your progress, and a resume analyser — everything to land your first engineering role.
            </p>

            <div className="hero-cta flex flex-wrap gap-4">
              <Link to="/register" className="group flex items-center gap-2 px-8 py-4 bg-[#89ceff] text-[#00344d] font-mono text-xs font-bold tracking-[.12em] uppercase rounded-full hover:shadow-[0_0_32px_rgba(137,206,255,.45)] hover:scale-105 active:scale-95 transition-all">
                START FOR FREE <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
              </Link>
              <Link to="/login" className="flex items-center px-8 py-4 border border-[#3e4850] text-white font-mono text-xs font-bold tracking-[.12em] uppercase rounded-full hover:bg-[#191f31] hover:border-[#89ceff]/40 transition-all">
                LOGIN TO PORTAL
              </Link>
            </div>
          </div>

          {/* Right — 3D Scene */}
          <div className="lg:col-span-6 relative min-h-[400px] lg:min-h-[500px] w-full flex flex-col items-center justify-center">
            <div ref={canvasRef} className="absolute inset-0 w-full h-full z-0 pointer-events-none" style={{ mixBlendMode: 'screen' }}>
              <BlueprintScene containerRef={canvasRef} />
            </div>

            {/* Data Card */}
            <div className="absolute top-4 right-0 w-full max-w-[310px] p-5 bg-[#0d1628]/60 backdrop-blur-md rounded-xl border border-[#1e293b]/50 hidden lg:block z-20 shadow-2xl">
              <div className="mb-4">
                <span className="font-mono text-[10px] font-semibold tracking-[.15em] text-[#89ceff] uppercase">Current Trajectory</span>
                <div className="text-lg font-mono font-bold text-white mt-1">SR. BACKEND ENGINEER</div>
                <div className="w-full bg-[#2e3447] h-1.5 mt-3 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-[#89ceff] to-[#bdc2ff] h-full w-[65%] rounded-full" />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="font-mono text-[10px] text-[#88929b]">READINESS</span>
                  <span className="font-mono text-[10px] text-[#89ceff]">65%</span>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3 py-3 border-t border-b border-[#1e293b]/50 mb-3">
                {[{ label: 'DSA', value: '142', sub: 'solved' }, { label: 'STREAK', value: '12', sub: 'days' }, { label: 'SCORE', value: '74', sub: 'ATS' }].map(s => (
                  <div key={s.label} className="text-center">
                    <div className="font-mono text-lg font-bold text-white">{s.value}</div>
                    <div className="font-mono text-[9px] text-[#89ceff] uppercase">{s.label}</div>
                    <div className="font-mono text-[9px] text-[#88929b]">{s.sub}</div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                {[
                  { t: 'Review Binary Trees', done: true, tag: 'DSA' },
                  { t: 'System Design: URL Shortener', done: false, tag: 'DESIGN' },
                  { t: 'Mock Interview — Amazon LP', done: false, tag: 'INTERVIEW' },
                ].map((task, i) => (
                  <div key={i} className="flex items-center gap-2.5">
                    <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 ${task.done ? 'bg-[#89ceff]/20 border-[#89ceff]/50' : 'border-[#3e4850]'}`}>
                      {task.done && <span className="material-symbols-outlined text-[#89ceff] text-[10px]">check</span>}
                    </div>
                    <span className={`text-[11px] flex-1 ${task.done ? 'line-through text-[#88929b]' : 'text-[#bec8d2]'}`}>{task.t}</span>
                    <span className="font-mono text-[9px] text-[#88929b] border border-[#3e4850] rounded px-1.5 py-0.5">{task.tag}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[2]">
          <button onClick={() => featuresRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="flex flex-col items-center gap-1.5 text-[#88929b] hover:text-[#89ceff] transition-colors" aria-label="Scroll down">
            <span className="font-mono text-[9px] tracking-[.2em] uppercase">Explore</span>
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      </section>

      {/* ── Stats strip ───────────────────────────────────────────────────── */}
      <section className="w-full bg-[#070d1f] border-y border-[#1e293b]/30">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8 py-12">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 md:divide-x md:divide-[#1e293b]/30">
            {[
              { id: 'qs',  end: 33807, suffix: '+', label: 'Curated Questions', color: '#89ceff' },
              { id: 'dsa', end: 3632,  suffix: '',  label: 'DSA Problems',      color: '#7bd0ff' },
              { id: 'mcq', end: 5816,  suffix: '',  label: 'Engineering MCQs',  color: '#bdc2ff' },
            ].map(s => (
              <Reveal key={s.id}>
                <div className="flex flex-col items-center md:items-start px-8 py-4">
                  <span className="font-mono text-4xl font-extrabold" style={{ color: s.color }}>
                    <CountUp end={s.end} suffix={s.suffix} />
                  </span>
                  <span className="font-mono text-[11px] font-semibold tracking-[.15em] text-[#88929b] uppercase mt-2 block">{s.label}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── Features ──────────────────────────────────────────────────────── */}
      <section ref={featuresRef} className="w-full py-24 bg-[#0c1324]">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
          <Reveal>
            <div>
              <span className="font-mono text-[10px] font-bold tracking-[.3em] text-[#89ceff] uppercase">Module Overview</span>
              <h2 className="text-4xl md:text-5xl font-extrabold text-white mt-3 mb-16 max-w-xl leading-tight">Precision engineered features.</h2>
            </div>
          </Reveal>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-start">
            {/* Feature cards */}
            <div className="lg:col-span-7 grid grid-cols-1 md:grid-cols-2 gap-5">
              {FEATURES.map((feat, i) => (
                <Reveal key={i} delay={i * 60} withScale={true}>
                  <button onClick={() => setActive(i)}
                    className={`fc group w-full text-left relative p-7 rounded-2xl border transition-all duration-300 hover:-translate-y-1 overflow-hidden ${active === i ? 'border-[#89ceff]/30 bg-[#191f31]' : 'border-[#1e293b]/50 bg-[#191f31]/40 hover:bg-[#191f31]/80'}`}
                    style={{ boxShadow: active === i ? `0 20px 40px -15px ${feat.shadow}` : 'none' }}>
                    {active === i && <div className="absolute top-0 left-0 right-0 h-0.5 rounded-t-2xl" style={{ background: `linear-gradient(90deg,transparent,${feat.color},transparent)` }} />}
                    <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 rounded-2xl" style={{ background: `radial-gradient(ellipse at top left,${feat.color}08,transparent 70%)` }} />
                    <span className="material-symbols-outlined text-4xl mb-5 block relative z-10" style={{ color: feat.color }}>{feat.icon}</span>
                    <h3 className="font-bold text-white text-base mb-2 relative z-10 group-hover:text-[#89ceff] transition-colors">{feat.tag}</h3>
                    <p className="text-sm text-[#bec8d2] leading-relaxed relative z-10">{feat.body.slice(0, 90)}…</p>
                    <div className="fc-cta mt-5 flex items-center gap-1.5 relative z-10 font-mono text-[11px] font-bold tracking-[.12em]" style={{ color: feat.color }}>
                      {feat.cta} <span className="material-symbols-outlined text-sm">north_east</span>
                    </div>
                  </button>
                </Reveal>
              ))}
            </div>

            {/* Sticky detail panel */}
            <div className="lg:col-span-5 lg:sticky lg:top-24">
              <Reveal delay={80}>
                <div key={active} className="relative rounded-2xl border border-[#1e293b]/80 bg-[#191f31]/60 backdrop-blur overflow-hidden"
                  style={{ animation: '_fadeInUp .35s ease both', boxShadow: `0 0 60px -10px ${f.shadow}` }}>
                  <div className="h-0.5" style={{ background: `linear-gradient(90deg,transparent,${f.color},transparent)` }} />
                  <div className="flex items-center gap-2 px-5 py-3 border-b border-[#1e293b]/50">
                    <span className="w-2.5 h-2.5 rounded-full bg-rose-500/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-500/60" />
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/60" />
                    <span className="font-mono text-[11px] text-[#88929b] ml-3">blueprint / {f.tag.toLowerCase().replace(/ /g, '-')}</span>
                  </div>
                  <div className="p-7 space-y-5">
                    <div>
                      <span className="font-mono text-[10px] font-bold tracking-[.2em] uppercase block mb-2" style={{ color: f.color }}>{f.tag}</span>
                      <h3 className="text-2xl font-bold text-white leading-snug">{f.headline}</h3>
                    </div>
                    <p className="text-sm text-[#bec8d2] leading-relaxed">{f.body}</p>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border font-mono text-xs font-medium"
                      style={{ borderColor: `${f.color}30`, color: f.color, background: `${f.color}0a` }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: f.color, animation: '_pulseRing 1.5s ease-in-out infinite alternate' }} />
                      {f.stat}
                    </div>
                    <div className="flex items-center gap-2 pt-1">
                      {FEATURES.map((_, i) => (
                        <button key={i} onClick={() => setActive(i)} className="rounded-full transition-all duration-300"
                          style={{ width: active === i ? '22px' : '6px', height: '6px', backgroundColor: active === i ? f.color : '#3e4850' }} />
                      ))}
                    </div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>
      </section>

      {/* ── How it Works ──────────────────────────────────────────────────── */}
      <section className="w-full py-24 bg-[#070d1f] dot-grid relative overflow-hidden">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8 relative z-10">
          <Reveal>
            <div className="text-center mb-20">
              <span className="font-mono text-[10px] font-bold tracking-[.3em] text-[#89ceff] uppercase">The Process</span>
              <h2 className="text-3xl md:text-4xl font-extrabold text-white mt-3">From onboarding to offer letter.</h2>
            </div>
          </Reveal>
          <div className="hidden lg:block absolute top-[calc(50%-10px)] left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#1e293b]/60 to-transparent z-0" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 relative z-10">
            {STEPS.map((step, i) => (
              <Reveal key={i} delay={i * 90}>
                <div className="flex flex-col items-center lg:items-start text-center lg:text-left gap-4">
                  <div className="step-box relative w-[88px] h-[88px] rounded-2xl flex items-center justify-center shadow-xl shrink-0">
                    <span className="font-mono text-3xl font-extrabold absolute -top-4 -right-3 opacity-[.12]" style={{ color: step.color }}>{step.n}</span>
                    <span className="material-symbols-outlined text-[40px]" style={{ color: step.color }}>{step.icon}</span>
                  </div>
                  <h4 className="font-bold text-white text-base">{step.title}</h4>
                  <p className="text-sm text-[#88929b] leading-relaxed">{step.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ───────────────────────────────────────────────────────────── */}
      <section className="w-full py-24 bg-[#89ceff] relative overflow-hidden">
        <div className="absolute inset-0 opacity-[.06]" style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/carbon-fibre.png')" }} />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[1px] bg-gradient-to-r from-transparent via-white/40 to-transparent" />
        <Reveal>
          <div className="relative max-w-[1280px] mx-auto px-6 lg:px-8 text-center z-10">
            <h2 className="text-[42px] lg:text-[56px] font-extrabold text-[#00344d] leading-[1.1] mb-6 max-w-4xl mx-auto">
              Stop leaving your future to chance.{' '}
              <span className="opacity-60">Start your blueprint today.</span>
            </h2>
            <div className="flex flex-col md:flex-row gap-5 justify-center items-center">
              <Link to="/register" className="px-12 py-4 bg-[#00344d] text-[#89ceff] font-mono text-sm font-bold tracking-[.12em] uppercase rounded-full hover:scale-105 active:scale-95 transition-all duration-300 shadow-xl hover:shadow-[0_0_35px_rgba(137,206,255,0.45)] hover:-translate-y-1">
                CREATE FREE ACCOUNT
              </Link>
              <span className="font-mono text-[11px] text-[#00344d]/50 uppercase tracking-widest">No credit card required</span>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <footer className="w-full bg-[#070d1f] border-t border-[#1e293b]/30 pt-16 pb-8">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-10 mb-12">
            <div className="col-span-1 md:col-span-2">
              <div className="flex items-center gap-2 mb-4">
                <span className="material-symbols-outlined text-[#89ceff]">award_star</span>
                <span className="font-mono font-bold text-white uppercase tracking-tight">Blueprint</span>
              </div>
              <p className="text-sm text-[#88929b] max-w-xs leading-relaxed">Architecting the next generation of software engineers through precision-engineered education.</p>
            </div>
            <div className="flex flex-col gap-3">
              <h4 className="font-mono text-xs font-bold tracking-[.15em] text-white uppercase mb-1">Platform</h4>
              {['Interview Hub', 'Weekly Planner', 'AI Mentor', 'Resume Analyser'].map(l => (
                <span key={l} className="text-sm text-[#88929b] hover:text-[#89ceff] transition-colors cursor-pointer">{l}</span>
              ))}
            </div>
            <div className="flex flex-col gap-3">
              <h4 className="font-mono text-xs font-bold tracking-[.15em] text-white uppercase mb-1">Support</h4>
              {['Help Center', 'Contact', 'Privacy Policy'].map(l => (
                <span key={l} className="text-sm text-[#88929b] hover:text-[#89ceff] transition-colors cursor-pointer">{l}</span>
              ))}
            </div>
          </div>
          <div className="pt-6 border-t border-[#1e293b]/40 flex flex-col md:flex-row justify-between items-center gap-4">
            <span className="font-mono text-[10px] text-[#88929b] uppercase tracking-[.1em]">© 2026 Blueprint Education. All rights reserved.</span>
            <div className="flex gap-8 font-mono text-[10px] text-[#88929b] uppercase tracking-[.1em]">
              <span>STATED: STABLE_V.04</span>
              <span>LATENCY: 12MS</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}