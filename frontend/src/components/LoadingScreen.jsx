/** Full-screen loading state: the brand route traces itself while we wait. */
export default function LoadingScreen({ label = 'Loading…' }) {
  return (
    <div
      className="blueprint-grid flex min-h-screen flex-col items-center justify-center gap-5 bg-background-deep text-paper"
      role="status"
      aria-live="polite"
      style={{ animation: 'fade-in 0.4s ease 0.2s both' }}
    >
      <svg viewBox="0 0 32 32" className="h-12 w-12" fill="none" aria-hidden="true">
        <rect x="0.5" y="0.5" width="31" height="31" rx="7" className="stroke-paper/25" />
        <path
          d="M8 24V16H16V9H24"
          className="stroke-paper"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength="1"
          style={{ strokeDasharray: 1, animation: 'route-trace 1.6s var(--ease-draft) infinite' }}
        />
        <circle cx="24" cy="9" r="3.4" className="fill-highlight" />
      </svg>
      <p className="text-sm font-medium text-line">{label}</p>
    </div>
  );
}
