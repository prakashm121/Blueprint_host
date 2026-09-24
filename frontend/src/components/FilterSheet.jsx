import { useEffect, useRef } from 'react';
import { usePresence } from '../lib/motion';

/**
 * Filters in a popup: a bottom sheet on phones, a centred dialog on larger screens.
 * Choices are made on a draft and only take effect when the person presses Apply.
 */
export default function FilterSheet({ open, onClose, onApply, onClear, applyLabel = 'Apply filters', children }) {
  const panelRef = useRef(null);
  const { mounted, closing } = usePresence(open);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    panelRef.current?.querySelector('select, button, input')?.focus();
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="filter-sheet-title">
      <div className={`absolute inset-0 bg-ink/60 backdrop-blur-sm ${closing ? 'backdrop-out' : 'backdrop-in'}`} onClick={onClose} />
      <div
        ref={panelRef}
        className={`as-sheet relative flex max-h-[88dvh] w-full flex-col rounded-t-2xl border border-border-subtle bg-surface-card shadow-2xl sm:max-w-lg sm:rounded-2xl ${
          closing ? 'dialog-out pointer-events-none' : 'dialog-in'
        }`}
      >
        {/* Grab bar: signals the sheet on phones */}
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-paper/20 sm:hidden" aria-hidden="true" />
        <div className="flex items-center justify-between border-b border-border-subtle px-5 py-4">
          <h2 id="filter-sheet-title" className="type-title text-lg text-paper">Filters</h2>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-line transition-colors hover:bg-paper/5 hover:text-paper"
            aria-label="Close filters"
          >
            <span className="material-symbols-outlined text-[20px]" aria-hidden="true">close</span>
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">{children}</div>

        <div className="flex gap-3 border-t border-border-subtle px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={onClear}
            className="min-h-11 flex-1 cursor-pointer rounded-lg border border-border-subtle px-4 text-sm font-semibold text-paper transition-colors hover:border-outline"
          >
            Clear all
          </button>
          <button
            type="button"
            onClick={onApply}
            className="min-h-11 flex-[2] cursor-pointer rounded-lg bg-highlight px-4 text-sm font-semibold text-ink transition-colors hover:bg-primary-fixed"
          >
            {applyLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/** A labelled select for use inside FilterSheet. */
export function FilterSelect({ label, value, onChange, disabled = false, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium text-line">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="min-h-11 w-full cursor-pointer rounded-lg border border-border-subtle bg-surface-container-lowest px-3 text-sm text-paper outline-none transition-colors focus:border-highlight disabled:cursor-not-allowed disabled:opacity-50"
      >
        {children}
      </select>
    </label>
  );
}

/** "Filters" button with a count of active filters, plus removable chips for each one. */
export function FilterBar({ active, onOpen, onRemove }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={onOpen}
        className="inline-flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border border-border-subtle bg-surface-card px-3.5 text-sm font-semibold text-paper transition-colors hover:border-outline"
      >
        <span className="material-symbols-outlined text-[18px]" aria-hidden="true">tune</span>
        Filters
        {active.length > 0 && (
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-highlight px-1.5 text-xs font-bold text-ink">
            {active.length}
          </span>
        )}
      </button>
      {active.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => onRemove(f.key)}
          className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-full border border-border-subtle bg-surface-container px-3 text-xs font-medium text-paper transition-colors hover:border-outline"
          aria-label={`Remove filter: ${f.label}`}
        >
          {f.label}
          <span className="material-symbols-outlined text-[14px] text-line" aria-hidden="true">close</span>
        </button>
      ))}
    </div>
  );
}
