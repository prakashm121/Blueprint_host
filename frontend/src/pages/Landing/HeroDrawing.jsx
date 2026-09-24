/**
 * An example placement plan, drawn as a technical drawing.
 * Finished stretches are solid, future ones dashed (the drafting convention for
 * hidden lines), the current week is highlighted, and a title block sits in the
 * corner. It draws itself once on load; reduced-motion users see the final sheet.
 */

// Theme tokens, so the drawing follows light / dark.
const PAPER = 'var(--color-paper)';
const LINE = 'var(--color-line)';
const HIGHLIGHT = 'var(--color-highlight)';
const FAINT = 'color-mix(in srgb, var(--color-paper) 32%, transparent)';
const SHEET = 'var(--color-surface)';

const draw = (delay, duration = 0.4) => ({
  strokeDasharray: 1,
  strokeDashoffset: 1,
  animation: `draw ${duration}s var(--ease-draft) ${delay}s both`,
});

const fade = (delay, duration = 0.4) => ({
  animation: `fade-in ${duration}s ease ${delay}s both`,
});

const pop = (delay) => ({
  transformBox: 'fill-box',
  transformOrigin: 'center',
  animation: `node-in 0.35s var(--ease-settle) ${delay}s both`,
});

/* Route: done (solid) then future (dashed). */
const DONE_SEGMENTS = [
  { d: 'M70 340H190', delay: 0.6, duration: 0.35 },
  { d: 'M190 340V250', delay: 0.95, duration: 0.3 },
  { d: 'M190 250H310', delay: 1.25, duration: 0.35 },
  { d: 'M310 250V170', delay: 1.6, duration: 0.3 },
];
const FUTURE_SEGMENTS = [
  { d: 'M310 170H430', delay: 2.0 },
  { d: 'M430 170V90', delay: 2.15 },
  { d: 'M430 90H500', delay: 2.3 },
];

function Label({ x, y, anchor = 'start', title, week, weekColor = LINE, delay }) {
  return (
    <g style={fade(delay)}>
      <text x={x} y={y} textAnchor={anchor} fill={PAPER} fontSize="16" fontWeight="600">
        {title}
      </text>
      <text x={x} y={y + 18} textAnchor={anchor} fill={weekColor} fontSize="13.5">
        {week}
      </text>
    </g>
  );
}

function Callout({ from, to, item, text, delay }) {
  const [x1, y1] = from;
  const [bx, by] = to;
  return (
    <g>
      <path d={`M${x1} ${y1}L${bx - 9} ${by - 5}`} stroke={FAINT} strokeWidth="1" pathLength="1" style={draw(delay, 0.3)} />
      <g style={fade(delay + 0.2)}>
        <circle cx={bx} cy={by} r="11" fill={SHEET} stroke={PAPER} strokeWidth="1.2" />
        <text x={bx} y={by + 4} textAnchor="middle" fill={PAPER} fontSize="12" fontWeight="700">
          {item}
        </text>
        <text x={bx + 18} y={by + 5} fill={PAPER} fontSize="14.5">
          {text}
        </text>
      </g>
    </g>
  );
}

export default function HeroDrawing({ className = '' }) {
  return (
    <svg
      viewBox="0 0 560 480"
      className={`hero-drawing w-full h-auto ${className}`}
      role="img"
      aria-label="Example plan drawn as a blueprint: a 12-week route from arrays and hashing to an offer, currently at week 6, system design."
      style={{ fontFamily: 'var(--font-sans)' }}
    >
      <style>{`
        @media (max-width: 640px) { .hero-drawing .hd-minor { display: none; } }
      `}</style>

      {/* Sheet frame */}
      <rect x="12" y="12" width="536" height="456" rx="2" fill="none" stroke={FAINT} strokeWidth="1" style={fade(0, 0.5)} />

      {/* Overall dimension: 12 weeks */}
      <g stroke={LINE} strokeWidth="1" fill="none">
        <path d="M70 28V56" pathLength="1" style={draw(0.2, 0.25)} />
        <path d="M500 28V78" pathLength="1" style={draw(0.2, 0.25)} />
        <path d="M70 40H244" pathLength="1" style={draw(0.35, 0.35)} />
        <path d="M326 40H500" pathLength="1" style={draw(0.35, 0.35)} />
      </g>
      <g fill={LINE} style={fade(0.6)}>
        <path d="M70 40l9-4v8z" />
        <path d="M500 40l-9-4v8z" />
      </g>
      <text x="285" y="45" textAnchor="middle" fill={PAPER} fontSize="14" fontWeight="600" style={fade(0.65)}>
        12 weeks
      </text>

      {/* Route */}
      {DONE_SEGMENTS.map((s) => (
        <path
          key={s.d}
          d={s.d}
          stroke={PAPER}
          strokeWidth="2.5"
          strokeLinecap="round"
          fill="none"
          pathLength="1"
          style={draw(s.delay, s.duration)}
        />
      ))}
      {FUTURE_SEGMENTS.map((s) => (
        <path
          key={s.d}
          d={s.d}
          stroke={LINE}
          strokeWidth="2"
          strokeDasharray="7 7"
          fill="none"
          style={fade(s.delay, 0.5)}
        />
      ))}

      {/* Milestones */}
      <circle cx="70" cy="340" r="7" fill={PAPER} style={pop(0.55)} />
      <circle cx="190" cy="250" r="7" fill={PAPER} style={pop(1.2)} />
      <circle
        cx="310"
        cy="170"
        r="16"
        fill="none"
        stroke={HIGHLIGHT}
        strokeWidth="1.5"
        style={pop(1.95)}
      />
      <circle cx="310" cy="170" r="8.5" fill={HIGHLIGHT} style={pop(1.85)} />
      <circle cx="430" cy="90" r="7" fill={SHEET} stroke={LINE} strokeWidth="2" style={pop(2.25)} />
      <g style={pop(2.45)}>
        <rect x="490" y="80" width="20" height="20" rx="3" fill={SHEET} stroke={PAPER} strokeWidth="2" />
        <path d="M495 90.5l3.5 3.5 6.5-7" stroke={HIGHLIGHT} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </g>

      <Label x={58} y={372} title="Arrays & hashing" week="Week 1" delay={0.7} />
      <Label x={176} y={246} anchor="end" title="Trees & graphs" week="Week 3" delay={1.3} />
      <Label x={290} y={166} anchor="end" title="System design" week="Week 6, this week" weekColor={HIGHLIGHT} delay={1.95} />
      <Label x={416} y={86} anchor="end" title="Mock interviews" week="Week 9" delay={2.35} />
      <Label x={500} y={124} anchor="middle" title="Offer" week="Week 12" delay={2.55} />

      {/* Callouts reference items in the parts list below */}
      <Callout from={[190, 300]} to={[262, 318]} item="3" text="142 of 3,632 solved" delay={2.55} />
      <Callout from={[318, 178]} to={[372, 222]} item="7" text="Resume score 78" delay={2.75} />

      {/* Title block */}
      <g>
        <rect x="318" y="388" width="230" height="80" fill={SHEET} fillOpacity="0.85" style={fade(2.95, 0.3)} />
        <path d="M318 388H548V468H318Z" stroke={PAPER} strokeWidth="1.2" fill="none" pathLength="1" style={draw(2.7, 0.5)} />
        <path d="M318 424H548M418 424V468M488 424V468" stroke={FAINT} strokeWidth="1" fill="none" pathLength="1" style={draw(3.0, 0.35)} />
        <g style={fade(3.15)}>
          <text className="hd-minor" x="328" y="402" fill={LINE} fontSize="10.5">Target role</text>
          <text x="328" y="418" fill={PAPER} fontSize="14" fontWeight="700">Backend engineer</text>
          <text className="hd-minor" x="328" y="438" fill={LINE} fontSize="10.5">Drawn for</text>
          <text x="328" y="457" fill={PAPER} fontSize="13.5" fontWeight="600">You</text>
          <text className="hd-minor" x="428" y="438" fill={LINE} fontSize="10.5">Sheet</text>
          <text x="428" y="457" fill={PAPER} fontSize="13.5" fontWeight="600">6 of 12</text>
          <text className="hd-minor" x="498" y="438" fill={LINE} fontSize="10.5">Scale</text>
          <text x="498" y="457" fill={PAPER} fontSize="13.5" fontWeight="600">1 : 1</text>
        </g>
      </g>
    </svg>
  );
}
