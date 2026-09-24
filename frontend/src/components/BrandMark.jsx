/** Blueprint mark: a planned route that ends at a highlighted goal. */
export function BrandMark({ className = 'h-7 w-7' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <rect width="32" height="32" rx="7" fill="#0E3358" stroke="rgb(234 241 248 / 0.18)" />
      <path
        d="M8 24V16H16V9H24"
        stroke="#EAF1F8"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="8" cy="24" r="2.6" fill="#EAF1F8" />
      <circle cx="16" cy="16" r="2.6" fill="#EAF1F8" />
      <circle cx="24" cy="9" r="3.4" fill="#FFD166" />
    </svg>
  );
}

export function Wordmark({ className = '' }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <BrandMark />
      <span className="text-[1.05rem] font-bold tracking-tight text-paper [font-stretch:112%]">
        Blueprint
      </span>
    </span>
  );
}
