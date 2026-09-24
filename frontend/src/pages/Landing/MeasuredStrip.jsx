import { useCountUp, useInView } from '../../lib/motion';

// Real catalogue sizes (see PARTS in landingData.js).
const FIGURES = [
  { value: 3632, label: 'coding problems, filterable by company' },
  { value: 33807, label: 'interview questions by role and skill' },
  { value: 5816, label: 'quiz questions on core subjects' },
  { value: 11, label: 'resume checks against your target role' },
];

function Figure({ value, label, active, delay }) {
  const shown = useCountUp(value, { active, duration: 1400 + delay });
  return (
    <div className="relative pl-5">
      {/* Dimension tick */}
      <span className="absolute left-0 top-1 h-9 w-px bg-highlight" aria-hidden="true" />
      <p className="type-title text-[2rem] tabular-nums text-paper sm:text-[2.4rem]">{shown.toLocaleString('en-IN')}</p>
      <p className="mt-1 max-w-[14rem] text-sm leading-snug text-line">{label}</p>
    </div>
  );
}

/** A band of the numbers behind the plan, counting up as it scrolls into view. */
export default function MeasuredStrip() {
  const [ref, inView] = useInView({ threshold: 0.4 });
  return (
    <section ref={ref} aria-label="What is in Blueprint" className="border-y border-border-subtle bg-surface-dim">
      <div className="mx-auto grid max-w-6xl grid-cols-2 gap-x-6 gap-y-9 px-5 py-10 sm:px-8 lg:grid-cols-4 lg:py-12">
        {FIGURES.map((f, i) => (
          <Figure key={f.label} {...f} active={inView} delay={i * 150} />
        ))}
      </div>
    </section>
  );
}
