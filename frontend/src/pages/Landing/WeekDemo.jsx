import { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useCountUp, useInView } from '../../lib/motion';
import Reveal from '../../components/Reveal';

const TASKS = [
  { title: 'Two pointers: solve 3 medium problems', category: 'DSA', minutes: 45 },
  { title: 'Revise normal forms up to BCNF', category: 'DBMS', minutes: 30 },
  { title: 'Mock question: design a URL shortener', category: 'System design', minutes: 40 },
  { title: 'Quiz: process scheduling', category: 'OS', minutes: 15 },
  { title: 'Add numbers to your project bullets', category: 'Resume', minutes: 20 },
];
const START_READINESS = 38;
const STEP = 4;

/**
 * A live preview of a week on the plan: tasks tick off one by one, the readiness figure climbs,
 * and the mentor leaves a note at the end. Plays while on screen, then starts the week again.
 */
export default function WeekDemo() {
  const [ref, inView] = useInView({ threshold: 0.35, once: false });
  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [done, setDone] = useState(reduce ? TASKS.length : 0);

  useEffect(() => {
    if (!inView || reduce) return undefined;
    // Tick one task every 0.9 s; after the note has been read for a while, start the week over.
    const t = setTimeout(
      () => setDone((d) => (d >= TASKS.length ? 0 : d + 1)),
      done === 0 ? 700 : done >= TASKS.length ? 5200 : 900,
    );
    return () => clearTimeout(t);
  }, [inView, done, reduce]);

  const readiness = useCountUp(START_READINESS + done * STEP, { duration: 600 });
  const minutesLeft = TASKS.slice(done).reduce((a, t) => a + t.minutes, 0);

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-16">
        <Reveal>
          <h2 className="type-title text-3xl text-paper sm:text-[2.6rem]">Tick a task, raise a floor.</h2>
          <p className="mt-4 max-w-md leading-relaxed text-line">
            Each day&rsquo;s tasks come from your weakest skills and the time you have. Finish them and your
            readiness climbs; fall behind and next week&rsquo;s plan leans on what you missed.
          </p>
          <ul className="mt-7 space-y-3 text-[0.95rem] text-paper">
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-highlight" aria-hidden="true" />
              Tasks sized to the minutes you say you have today.
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-highlight" aria-hidden="true" />
              Readiness is half problems solved, half this week&rsquo;s plan.
            </li>
            <li className="flex gap-3">
              <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-highlight" aria-hidden="true" />
              The AI mentor sees the same plan, so its advice fits where you are.
            </li>
          </ul>
        </Reveal>

        <Reveal delay={120}>
          <div ref={ref} className="sheet crop-marks shadow-2xl shadow-ink/20" aria-label="Example of a week in progress" role="group">
            <div className="flex items-end justify-between gap-4 border-b border-border-subtle px-5 py-4 sm:px-6">
              <div>
                <p className="text-xs font-medium text-line">Backend engineer</p>
                <p className="type-title mt-0.5 text-lg text-paper">Week 6 of 12</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-medium text-line">Readiness</p>
                <p className="type-title text-2xl tabular-nums text-paper">
                  {readiness}
                  <span className="text-base text-line">%</span>
                </p>
              </div>
            </div>

            <div className="h-[3px] bg-paper/10">
              <div
                className="h-full bg-highlight transition-[width] duration-700 ease-[var(--ease-draft)]"
                style={{ width: `${(done / TASKS.length) * 100}%` }}
              />
            </div>

            <ul>
              {TASKS.map((t, i) => {
                const isDone = i < done;
                return (
                  <li key={t.title} className="flex items-start gap-3 border-b border-border-subtle px-5 py-3.5 sm:px-6">
                    <span
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-all duration-300 ${
                        isDone ? 'scale-100 border-highlight bg-highlight text-ink' : 'border-paper/40'
                      }`}
                      aria-hidden="true"
                    >
                      {isDone && <Check className="h-3.5 w-3.5" strokeWidth={3} style={{ animation: 'node-in 0.3s var(--ease-settle) both' }} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="highlighter text-[0.93rem] font-medium text-paper" data-on={isDone}>
                        {t.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-line">
                        {t.category}, {t.minutes} min
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>

            <div className="flex min-h-[4.5rem] items-center px-5 py-4 sm:px-6">
              {done >= TASKS.length ? (
                <p
                  key={`note-${done}`}
                  className="border-l-2 border-highlight pl-3 text-sm leading-relaxed text-paper"
                  style={{ animation: 'rise-in 0.5s var(--ease-settle) both' }}
                >
                  <span className="font-semibold">Mentor:</span> All five done. Tomorrow, two graph problems, then try the
                  URL-shortener mock again with caching.
                </p>
              ) : (
                <p className="text-sm tabular-nums text-line">{minutesLeft} minutes left today</p>
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
