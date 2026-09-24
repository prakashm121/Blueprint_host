import { useSyncExternalStore } from 'react';

/*
 * Light / dark theme.
 * The attribute is set before first paint by the inline script in index.html; this module keeps it
 * in sync afterwards. An explicit choice is saved; with no saved choice the OS preference is followed.
 */

const STORAGE_KEY = 'blueprint-theme';
const THEME_COLORS = { dark: '#0a2a4a', light: '#f4f7fb' };
const media = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: light)') : null;
const listeners = new Set();

function readSaved() {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : null;
  } catch {
    return null;
  }
}

export function getTheme() {
  return document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
}

function apply(theme) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme]);
  listeners.forEach((l) => l());
}

media?.addEventListener('change', (e) => {
  if (!readSaved()) apply(e.matches ? 'light' : 'dark');
});

/**
 * Switch theme. When the browser supports view transitions the new theme is revealed as a circle
 * growing from `origin` (the button that was pressed).
 */
export function setTheme(theme, origin) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private mode: the choice lasts for this page only */
  }

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!document.startViewTransition || reduce || !origin) {
    apply(theme);
    return;
  }

  const rect = origin.getBoundingClientRect();
  const x = rect.left + rect.width / 2;
  const y = rect.top + rect.height / 2;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));

  document.startViewTransition(() => apply(theme)).ready.then(() => {
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
      { duration: 520, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
    );
  });
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useTheme() {
  return useSyncExternalStore(subscribe, getTheme, () => 'dark');
}
