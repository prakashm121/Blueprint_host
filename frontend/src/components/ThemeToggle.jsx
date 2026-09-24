import { setTheme, useTheme } from '../lib/theme';

/**
 * Sun / moon switch. `withLabel` renders it as a full-width sidebar row instead of an icon button.
 */
export default function ThemeToggle({ withLabel = false, className = '' }) {
  const theme = useTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  const label = next === 'light' ? 'Switch to light theme' : 'Switch to dark theme';

  return (
    <button
      type="button"
      onClick={(e) => setTheme(next, e.currentTarget)}
      aria-label={withLabel ? undefined : label}
      data-tip={withLabel ? undefined : label}
      data-tip-side="bottom"
      className={
        withLabel
          ? `flex w-full cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[0.92rem] font-medium text-line transition-colors hover:bg-paper/[0.04] hover:text-paper ${className}`
          : `inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg text-line transition-colors hover:bg-paper/[0.06] hover:text-paper ${className}`
      }
    >
      <span
        key={theme}
        className="material-symbols-outlined text-[20px]"
        style={{ animation: 'theme-icon-in 0.4s var(--ease-settle) both' }}
        aria-hidden="true"
      >
        {theme === 'dark' ? 'light_mode' : 'dark_mode'}
      </span>
      {withLabel && (next === 'light' ? 'Light theme' : 'Dark theme')}
    </button>
  );
}
