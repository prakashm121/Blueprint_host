import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

import { Wordmark } from '../../components/BrandMark';
import ThemeToggle from '../../components/ThemeToggle';
import Reveal from '../../components/Reveal';
import PlanModel from '../../components/model/PlanModel';
import { useInView, usePresence } from '../../lib/motion';
import HeroDrawing from './HeroDrawing';
import MeasuredStrip from './MeasuredStrip';
import WeekDemo from './WeekDemo';
import Faq from './Faq';
import { PARTS, STEPS } from './landingData';

// The example plan on the model: week 6 of 12, pinned to the matching floors.
const HERO_LABELS = [
  { floor: 0, side: 'left', title: 'Arrays & hashing', sub: 'Week 1', mobile: false },
  { floor: 2, side: 'right', title: 'Trees & graphs', sub: 'Week 3', mobile: false },
  { floor: 5, side: 'right', title: 'System design', sub: 'Week 6, this week', current: true, mobile: false },
  { floor: 8, side: 'left', title: 'Mock interviews', sub: 'Week 9', mobile: false },
  { floor: 11, side: 'left', title: 'Offer', sub: 'Week 12', mobile: false },
];

// Exploded view: one slab per part, numbered like the parts list.
const PART_LABELS = PARTS.map((p, i) => ({ floor: i, side: 'right', balloon: p.item }));

const btnPrimary =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-highlight px-6 py-3.5 text-[0.95rem] font-semibold text-ink transition-[background-color,transform,box-shadow] hover:-translate-y-0.5 hover:bg-primary-fixed hover:shadow-lg hover:shadow-highlight/25 active:translate-y-0';
const btnSmall =
  'inline-flex items-center justify-center rounded-lg bg-highlight px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-primary-fixed active:translate-y-px';
const btnSecondary =
  'inline-flex items-center justify-center rounded-lg border border-paper/30 px-6 py-3.5 text-[0.95rem] font-semibold text-paper transition-colors hover:border-paper/60 hover:bg-paper/5 active:translate-y-px';

function Balloon({ n, active = false }) {
  return (
    <span
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[0.8rem] font-bold tabular-nums transition-colors duration-300 ${
        active ? 'border-highlight bg-highlight text-ink' : 'border-paper/70 text-paper'
      }`}
      aria-hidden="true"
    >
      {n}
    </span>
  );
}

/** Parts list beside an exploded model. Hovering a row pulls its slab out; otherwise they take turns. */
function PartsSection({ sectionRef }) {
  const [hovered, setHovered] = useState(null);
  const [cycled, setCycled] = useState(0);
  const [viewRef, inView] = useInView({ threshold: 0.2, once: false });
  const active = hovered ?? cycled;

  useEffect(() => {
    if (!inView || hovered !== null) return undefined;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const t = setInterval(() => setCycled((i) => (i + 1) % PARTS.length), 2600);
    return () => clearInterval(t);
  }, [inView, hovered]);

  return (
    <section ref={sectionRef} className="scroll-mt-16 bg-surface-dim py-14 sm:py-20 lg:py-28">
      <div ref={viewRef} className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] lg:gap-14">
        <div className="lg:sticky lg:top-24 lg:self-start">
          <Reveal>
            <h2 className="type-title text-3xl text-paper sm:text-[2.6rem]">Everything the plan draws on.</h2>
            <p className="mt-4 max-w-sm leading-relaxed text-line">
              Eight parts that feed one plan. Each one takes its turn in the model; point at a row to pull that part out.
            </p>
          </Reveal>
          <PlanModel
            variant="exploded"
            labels={PART_LABELS}
            highlight={active}
            label={`Exploded 3D model of Blueprint's eight parts. Part ${PARTS[active].item}, ${PARTS[active].name}, is pulled out.`}
            className="mx-auto mt-4 aspect-[5/4] w-full max-w-md lg:mt-2 lg:aspect-square"
          />
        </div>

        <table className="w-full border-collapse text-left" onMouseLeave={() => setHovered(null)}>
          <caption className="sr-only">Parts of Blueprint</caption>
          <thead className="sr-only sm:not-sr-only">
            <tr className="border-y border-paper/40 text-[0.8rem] text-line">
              <th scope="col" className="w-14 py-2.5 font-medium">Item</th>
              <th scope="col" className="w-44 py-2.5 pr-6 font-medium">Part</th>
              <th scope="col" className="py-2.5 pr-6 font-medium">What it does</th>
              <th scope="col" className="py-2.5 text-right font-medium">Quantity</th>
            </tr>
          </thead>
          <tbody>
            {PARTS.map((p, i) => (
              <tr
                key={p.item}
                onMouseEnter={() => setHovered(i)}
                className={`grid grid-cols-[2.25rem_minmax(0,1fr)] gap-x-3 border-b border-border-subtle py-5 transition-colors duration-300 first:border-t sm:table-row sm:py-0 sm:first:border-t-0 ${
                  active === i ? 'bg-paper/[0.05]' : ''
                }`}
              >
                <td className="row-span-3 sm:table-cell sm:py-5 sm:pl-2 sm:align-top">
                  <Balloon n={p.item} active={active === i} />
                </td>
                <th scope="row" className="text-base font-semibold text-paper sm:table-cell sm:py-5 sm:pr-6 sm:pt-[1.45rem] sm:align-top">
                  {p.name}
                </th>
                <td className="mt-1 text-[0.95rem] leading-relaxed text-line sm:mt-0 sm:table-cell sm:py-5 sm:pr-6 sm:pt-[1.45rem] sm:align-top">
                  {p.body}
                </td>
                <td className="mt-2 text-sm font-semibold tabular-nums text-paper sm:mt-0 sm:table-cell sm:whitespace-nowrap sm:py-5 sm:pr-2 sm:pt-[1.5rem] sm:text-right sm:align-top">
                  {p.qty}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function Landing() {
  const partsRef = useRef(null);
  const stepsRef = useRef(null);
  const faqRef = useRef(null);
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menu = usePresence(menuOpen, 140);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (ref) => {
    setMenuOpen(false);
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const navLinks = [
    { label: 'Features', ref: partsRef },
    { label: 'How it works', ref: stepsRef },
    { label: 'Questions', ref: faqRef },
  ];

  return (
    <div className="min-h-screen bg-background-deep text-paper" style={{ animation: 'fade-in 0.5s ease both' }}>
      {/* ── Navigation ─────────────────────────────────────────────── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-colors duration-300 ${
          scrolled || menuOpen
            ? 'border-b border-border-subtle bg-background-deep max-md:shadow-lg md:bg-background-deep/95 md:backdrop-blur-md'
            : 'border-b border-transparent max-md:bg-background-deep'
        }`}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <Link to="/" aria-label="Blueprint home">
            <Wordmark />
          </Link>

          <nav className="hidden items-center gap-8 md:flex" aria-label="Main">
            {navLinks.map((l) => (
              <button
                key={l.label}
                onClick={() => scrollTo(l.ref)}
                className="cursor-pointer text-sm font-medium text-line transition-colors hover:text-paper"
              >
                {l.label}
              </button>
            ))}
            <Link to="/login" className="text-sm font-medium text-line transition-colors hover:text-paper">
              Log in
            </Link>
            <div className="flex items-center gap-3">
              <ThemeToggle />
              <Link to="/login" className={btnSmall}>
                Start your plan
              </Link>
            </div>
          </nav>

          <div className="-mr-2 flex items-center gap-1 md:hidden">
            <ThemeToggle />
            <button
              className="rounded-lg p-2 text-paper"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-controls="landing-menu"
              aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            >
              <span className="material-symbols-outlined text-[26px]">{menuOpen ? 'close' : 'menu'}</span>
            </button>
          </div>
        </div>

        {menu.mounted && (
          <div
            id="landing-menu"
            className={`border-t border-border-subtle px-5 pb-6 pt-2 md:hidden ${menu.closing ? 'menu-out' : 'menu-in'}`}
          >
            {navLinks.map((l) => (
              <button key={l.label} onClick={() => scrollTo(l.ref)} className="block w-full py-3 text-left text-base font-medium text-paper">
                {l.label}
              </button>
            ))}
            <Link to="/login" className="block py-3 text-base font-medium text-paper">
              Log in
            </Link>
            <Link to="/login" className={`${btnPrimary} mt-3 w-full`}>
              Start your plan
            </Link>
          </div>
        )}
      </header>

      <main>
        {/* ── Hero ──────────────────────────────────────────────────── */}
        <section className="blueprint-grid relative overflow-hidden pb-8 pt-24 sm:pb-12 sm:pt-32 lg:pb-16 lg:pt-32">
          <div className="mx-auto grid max-w-6xl items-center gap-6 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-6">
            {/* One orchestrated entrance: headline, copy and actions rise in turn. */}
            <div className="stagger-in max-w-xl">
              <h1 className="type-display text-balance text-[2.15rem] text-paper sm:text-[3.4rem] lg:text-[3.2rem] lg:[font-stretch:110%] xl:text-[3.45rem]">
                Your placement plan, drawn to scale.
              </h1>
              <p className="mt-4 max-w-[34rem] text-base leading-relaxed text-line sm:mt-6 sm:text-lg">
                Blueprint turns your target role and weakest skills into a weekly plan, then tracks your
                coding practice, quizzes and resume against it. You always know what to do next.
              </p>
              <div className="mt-7 flex flex-wrap gap-3 sm:mt-9">
                <Link to="/login" className={btnPrimary}>
                  Start your plan
                </Link>
                <button onClick={() => scrollTo(stepsRef)} className={`${btnSecondary} cursor-pointer`}>
                  See how it works
                </button>
              </div>
              <p className="mt-5 text-sm text-line">Free to use. You sign in with your Google account.</p>
            </div>

            <div className="-mx-5 w-[calc(100%+2.5rem)] sm:mx-auto sm:w-full sm:max-w-[640px]">
              <PlanModel
                progress={5 / 12}
                labels={HERO_LABELS}
                label="3D model of an example 12-week plan built as a tower, one floor per week. Weeks 1 to 5 are built, week 6, system design, is lit up as this week while a crane lifts the next floor, and the offer flag sits at the top."
                className="aspect-[10/9] w-full sm:aspect-[6/5] lg:aspect-square"
                fallback={
                  <div className="crop-marks">
                    <HeroDrawing />
                  </div>
                }
              />
              <p className="mt-1 px-5 text-center text-xs leading-relaxed text-line sm:-mt-3 sm:px-0" style={{ animation: 'fade-in 0.6s ease 2.4s both' }}>
                <span className="sm:hidden">
                  One floor per week: weeks 1 to 5 built, <span className="font-semibold text-highlight">week 6 (system design)</span> lit up, the offer flag at week 12.{' '}
                </span>
                Drag the model to turn it.
              </p>
            </div>
          </div>
        </section>

        <MeasuredStrip />

        <PartsSection sectionRef={partsRef} />

        <WeekDemo />

        {/* ── How it works ──────────────────────────────────────────── */}
        <section ref={stepsRef} className="scroll-mt-16 border-t border-border-subtle bg-surface-dim py-14 sm:py-20 lg:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <Reveal>
              <h2 className="type-title max-w-2xl text-3xl text-paper sm:text-[2.6rem]">From sign-in to a plan in four steps.</h2>
            </Reveal>

            <ol className="relative mt-14 grid gap-10 border-l border-paper/40 pl-7 lg:grid-cols-4 lg:gap-8 lg:border-l-0 lg:border-t lg:pl-0 lg:pt-9">
              {STEPS.map((s, i) => (
                <Reveal as="li" key={s.title} delay={i * 110} className="relative">
                  {/* Tick on the dimension line */}
                  <span
                    className="absolute -left-7 top-1.5 h-px w-4 bg-paper/70 lg:-top-9 lg:left-0 lg:h-4 lg:w-px"
                    aria-hidden="true"
                  />
                  <span className="text-sm font-semibold tabular-nums text-highlight">Step {i + 1}</span>
                  <h3 className="type-title mt-2 text-xl text-paper">{s.title}</h3>
                  <p className="mt-2 max-w-xs leading-relaxed text-line">{s.body}</p>
                </Reveal>
              ))}
            </ol>
          </div>
        </section>

        <div ref={faqRef} className="scroll-mt-16">
          <Faq />
        </div>

        {/* ── Closing ───────────────────────────────────────────────── */}
        <section className="blueprint-grid border-t border-border-subtle py-14 sm:py-20 lg:py-28">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <Reveal className="crop-marks mx-auto max-w-2xl border border-paper/40 bg-background-deep/80 px-6 py-12 text-center sm:px-12">
              <h2 className="type-display text-4xl text-paper sm:text-5xl">Start drawing your plan.</h2>
              <p className="mx-auto mt-5 max-w-md leading-relaxed text-line">
                Setting your target and rating your skills takes a few minutes. Your first roadmap is drafted right after.
              </p>
              <Link to="/login" className={`${btnPrimary} mt-8`}>
                Start your plan
              </Link>
            </Reveal>
          </div>
        </section>
      </main>

      <footer className="border-t border-border-subtle py-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-5 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Wordmark />
          <p className="text-sm text-line">Placement prep for engineering students. © 2026 Blueprint</p>
        </div>
      </footer>
    </div>
  );
}
