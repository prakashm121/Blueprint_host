import { useId, useState } from 'react';
import Reveal from '../../components/Reveal';

const QUESTIONS = [
  {
    q: 'Does it cost anything?',
    a: 'No. Sign in with Google and every tool is available. The AI mentor and the resume analyser have daily limits so the service can stay free for everyone.',
  },
  {
    q: 'How is the readiness score worked out?',
    a: 'Half of it comes from the coding problems you have solved, and half from how much of this week’s plan you have finished. It moves as soon as you tick something off.',
  },
  {
    q: 'What does the AI mentor know about me?',
    a: 'Your target role, your current plan and your progress on problems and quizzes. That is what lets it say what to do next instead of giving generic advice.',
  },
  {
    q: 'What does the resume analyser check?',
    a: 'Upload a PDF and it scores it for applicant tracking systems against your target role, section by section, along with keywords, numbers in your bullets, action verbs and formatting. You can analyse one resume a day; uploading the same file again gives you the earlier result.',
  },
  {
    q: 'Can I change my target role later?',
    a: 'Yes. Your target role is on your profile page, alongside your college, graduation year and target companies.',
  },
];

function Item({ q, a, open, onToggle }) {
  const id = useId();
  return (
    <div className="border-b border-border-subtle">
      <h3>
        <button
          type="button"
          id={`${id}-q`}
          aria-expanded={open}
          aria-controls={`${id}-a`}
          onClick={onToggle}
          className="flex w-full cursor-pointer items-center justify-between gap-6 py-5 text-left text-[1.05rem] font-semibold text-paper transition-colors hover:text-highlight"
        >
          {q}
          <span
            className={`material-symbols-outlined shrink-0 text-[22px] text-line transition-transform duration-300 ${open ? 'rotate-45' : ''}`}
            aria-hidden="true"
          >
            add
          </span>
        </button>
      </h3>
      <div id={`${id}-a`} role="region" aria-labelledby={`${id}-q`} className="accordion-body" data-open={open}>
        <div>
          <p className="max-w-2xl pb-6 leading-relaxed text-line">{a}</p>
        </div>
      </div>
    </div>
  );
}

export default function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section className="border-t border-border-subtle py-14 sm:py-20 lg:py-28">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-16">
        <Reveal>
          <h2 className="type-title text-3xl text-paper sm:text-[2.6rem]">Questions students ask.</h2>
        </Reveal>
        <Reveal delay={100} className="border-t border-border-subtle">
          {QUESTIONS.map((item, i) => (
            <Item key={item.q} {...item} open={open === i} onToggle={() => setOpen(open === i ? -1 : i)} />
          ))}
        </Reveal>
      </div>
    </section>
  );
}
