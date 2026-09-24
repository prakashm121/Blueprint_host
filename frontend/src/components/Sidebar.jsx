import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import Notifications from '../pages/Notifications/Notifications';
import { Wordmark } from './BrandMark';
import ThemeToggle from './ThemeToggle';

const NAV_GROUPS = [
  {
    label: 'Plan',
    items: [
      { to: '/dashboard', icon: 'space_dashboard', label: 'Dashboard' },
      { to: '/planner', icon: 'calendar_today', label: 'Weekly planner' },
      { to: '/roadmap', icon: 'route', label: 'Roadmap' },
    ],
  },
  {
    label: 'Practise',
    items: [
      { to: '/interview-hub/dsa', icon: 'terminal', label: 'Coding problems' },
      { to: '/interview-hub/qa', icon: 'forum', label: 'Interview Q&A' },
      { to: '/interview-hub/quiz', icon: 'quiz', label: 'Quiz' },
    ],
  },
  {
    label: 'Tools',
    items: [
      { to: '/mentor', icon: 'smart_toy', label: 'AI mentor' },
      { to: '/resume-analyser', icon: 'description', label: 'Resume analyser' },
      { to: '/vault', icon: 'inventory_2', label: 'Knowledge vault' },
    ],
  },
];

const itemCls = (isActive, sliding = false) =>
  `relative flex items-center gap-3 rounded-md px-3 py-2 text-[0.92rem] font-medium transition-colors duration-200 ${
    isActive
      ? `text-paper ${sliding ? '' : 'bg-paper/[0.07]'}`
      : 'text-line hover:bg-paper/[0.04] hover:text-paper'
  }`;

/**
 * `sliding`: the item sits in the main nav, where one shared highlight slides to whichever
 * item is active (see NavContent), so the item itself draws no background or marker.
 */
function NavItem({ to, icon, label, onNavigate, sliding = false }) {
  return (
    <NavLink to={to} end={to === '/dashboard'} className={({ isActive }) => itemCls(isActive, sliding)} onClick={onNavigate}>
      {({ isActive }) => (
        <>
          {isActive && !sliding && (
            <span
              className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-highlight"
              style={{ transformOrigin: 'center', animation: 'marker-in 0.25s var(--ease-settle) both' }}
              aria-hidden="true"
            />
          )}
          <span
            className="material-symbols-outlined text-[20px] transition-[font-variation-settings] duration-200"
            style={{ fontVariationSettings: `'FILL' ${isActive ? 1 : 0}, 'wght' 400, 'GRAD' 0, 'opsz' 20` }}
            aria-hidden="true"
          >
            {icon}
          </span>
          {label}
        </>
      )}
    </NavLink>
  );
}

/** Measures the active link so the shared highlight can slide to it. */
function useActiveIndicator(navRef) {
  const { pathname } = useLocation();
  const [box, setBox] = useState({ top: 0, height: 0, visible: false, animate: false });

  useLayoutEffect(() => {
    const nav = navRef.current;
    if (!nav) return undefined;
    const measure = (animate) => {
      const el = nav.querySelector('a[aria-current="page"]');
      setBox((prev) =>
        el
          ? { top: el.offsetTop, height: el.offsetHeight, visible: true, animate: animate && prev.visible }
          : { ...prev, visible: false, animate: true },
      );
    };
    measure(true);
    // Fonts loading or the window resizing can move items; follow without animating.
    // (The observer fires once on start; skip that, or it would cancel the slide.)
    let first = true;
    const ro = new ResizeObserver(() => {
      if (first) {
        first = false;
        return;
      }
      measure(false);
    });
    ro.observe(nav);
    return () => ro.disconnect();
  }, [pathname, navRef]);

  return box;
}

function NavContent({ onNavigate, onOpenNotifications }) {
  const navRef = useRef(null);
  const indicator = useActiveIndicator(navRef);

  return (
    <>
      <nav ref={navRef} className="relative flex-1 overflow-y-auto px-3 pb-4" aria-label="App">
        {/* Shared active highlight: slides between items instead of jumping. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute left-3 right-3 top-0 rounded-md bg-paper/[0.07]"
          style={{
            height: indicator.height,
            transform: `translateY(${indicator.top}px)`,
            opacity: indicator.visible ? 1 : 0,
            transition: indicator.animate
              ? 'transform 320ms var(--ease-settle), height 320ms var(--ease-settle), opacity 180ms ease'
              : 'opacity 180ms ease',
          }}
        >
          <span className="absolute -left-3 top-1.5 bottom-1.5 w-[3px] rounded-r bg-highlight" />
        </span>
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-3 pb-1.5 pt-5 text-xs font-semibold text-line">{group.label}</p>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavItem key={item.to} {...item} onNavigate={onNavigate} sliding />
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="shrink-0 space-y-0.5 border-t border-border-subtle px-3 py-3">
        <button
          type="button"
          onClick={() => {
            onOpenNotifications();
            onNavigate?.();
          }}
          className={`${itemCls(false)} w-full cursor-pointer`}
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">notifications</span>
          Notifications
        </button>
        <NavItem to="/profile" icon="account_circle" label="Profile" onNavigate={onNavigate} />
        <ThemeToggle withLabel />
      </div>
    </>
  );
}

export default function Sidebar() {
  const location = useLocation();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const drawerRef = useRef(null);
  const backdropRef = useRef(null);
  const openRef = useRef(false);
  openRef.current = mobileOpen;

  // Close the drawer on navigation, lock page scroll and support Escape while it is open.
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e) => e.key === 'Escape' && setMobileOpen(false);
    document.addEventListener('keydown', onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [mobileOpen]);

  /*
   * Phones: swipe right from the left edge to pull the menu out, swipe left to push it back.
   * The drawer follows the finger; on release it settles open or shut depending on how far
   * and how fast it was moved. Vertical swipes are left alone so the page still scrolls.
   */
  useEffect(() => {
    const phone = window.matchMedia('(max-width: 767px)');
    const EDGE = 24;
    let g = null;

    const paint = (p) => {
      const d = drawerRef.current;
      const b = backdropRef.current;
      if (!d || !b) return;
      d.style.transition = 'none';
      b.style.transition = 'none';
      d.style.translate = `${(p - 1) * d.offsetWidth}px 0`;
      b.style.opacity = String(p);
    };
    const release = () => {
      for (const el of [drawerRef.current, backdropRef.current]) {
        if (!el) continue;
        el.style.transition = '';
        el.style.translate = '';
        el.style.opacity = '';
      }
    };

    const onStart = (e) => {
      if (!phone.matches || e.touches.length !== 1) return;
      const t = e.touches[0];
      const open = openRef.current;
      if (!open && t.clientX > EDGE) return;
      g = { mode: open ? 'close' : 'open', x0: t.clientX, y0: t.clientY, t0: performance.now(), locked: false, p: open ? 1 : 0 };
    };
    const onMove = (e) => {
      if (!g) return;
      const t = e.touches[0];
      const dx = t.clientX - g.x0;
      const dy = t.clientY - g.y0;
      if (!g.locked) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          g = null; // a scroll, not a swipe
          return;
        }
        g.locked = true;
      }
      e.preventDefault();
      const w = drawerRef.current?.offsetWidth || 288;
      g.p = Math.min(1, Math.max(0, g.mode === 'open' ? dx / w : 1 + dx / w));
      g.vx = dx / Math.max(1, performance.now() - g.t0); // px per ms
      paint(g.p);
    };
    const onEnd = () => {
      if (!g) return;
      const { locked, p, vx = 0, mode } = g;
      g = null;
      if (!locked) return;
      const open = mode === 'open' ? p > 0.35 || vx > 0.5 : !(p < 0.65 || vx < -0.5);
      release();
      setMobileOpen(open);
    };

    document.addEventListener('touchstart', onStart, { passive: true });
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
    document.addEventListener('touchcancel', onEnd);
    return () => {
      document.removeEventListener('touchstart', onStart);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
      document.removeEventListener('touchcancel', onEnd);
    };
  }, []);

  const openNotifications = () => setNotificationsOpen(true);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="z-20 hidden h-dvh w-64 shrink-0 flex-col border-r border-border-subtle bg-surface-dim md:flex">
        <div className="flex h-16 shrink-0 items-center border-b border-border-subtle px-6">
          <Wordmark />
        </div>
        <NavContent onOpenNotifications={openNotifications} />
      </aside>

      {/* Phones: no top bar, just a pull handle on the left edge */}
      <button
        type="button"
        onClick={() => setMobileOpen(true)}
        className={`fixed left-0 top-1/2 z-40 flex h-24 w-5 -translate-y-1/2 cursor-pointer items-center justify-start transition-opacity duration-300 md:hidden ${
          mobileOpen ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        aria-label="Open menu"
        aria-expanded={mobileOpen}
        aria-controls="app-drawer"
      >
        <span
          className="block h-14 w-1.5 rounded-r-full bg-paper/40 shadow-[0_0_0_1px_var(--color-background-deep)]"
          style={{ animation: 'handle-nudge 0.9s var(--ease-settle) 1s 2' }}
          aria-hidden="true"
        />
      </button>

      {/* Phone drawer: always mounted so it can follow a swipe */}
      <div className="md:hidden">
        <div
          ref={backdropRef}
          className={`fixed inset-0 z-[60] bg-ink/70 transition-opacity duration-300 ${
            mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
          }`}
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
        <div
          ref={drawerRef}
          id="app-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
          inert={!mobileOpen}
          className={`fixed inset-y-0 left-0 z-[61] flex w-[18rem] max-w-[85vw] flex-col border-r border-border-subtle bg-surface-dim shadow-2xl transition-[translate] duration-300 ease-[var(--ease-settle)] ${
            mobileOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-4">
            <Wordmark />
            <button
              onClick={() => setMobileOpen(false)}
              className="-mr-1 rounded-md p-2 text-line transition-colors hover:bg-paper/5 hover:text-paper"
              aria-label="Close menu"
            >
              <span className="material-symbols-outlined text-[22px]" aria-hidden="true">close</span>
            </button>
          </div>
          <NavContent onNavigate={() => setMobileOpen(false)} onOpenNotifications={openNotifications} />
        </div>
      </div>

      <Notifications isOpen={notificationsOpen} onClose={() => setNotificationsOpen(false)} />
    </>
  );
}
