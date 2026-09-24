import { useEffect, useRef, useState } from 'react';

let webglSupport;
function hasWebGL() {
  if (webglSupport === undefined) {
    try {
      const c = document.createElement('canvas');
      webglSupport = !!(c.getContext('webgl2') || c.getContext('webgl'));
    } catch {
      webglSupport = false;
    }
  }
  return webglSupport;
}

/**
 * The 3D plan tower (see towerScene.js). three.js is fetched on first use, so pages without a
 * model never download it. Without WebGL the `fallback` is shown instead.
 *
 * labels: [{ floor, side: 'left' | 'right', title, sub, current, balloon }] pinned to floors (0 = week 1).
 *   A `balloon` label is a numbered circle, like the item callouts on a drawing.
 * highlight: floor index to pull out and light up (exploded variant).
 */
export default function PlanModel({
  progress = 0.5,
  variant = 'hero',
  labels = [],
  interactive = true,
  highlight = -1,
  label,
  fallback = null,
  className = '',
}) {
  const containerRef = useRef(null);
  const labelRefs = useRef([]);
  const sceneRef = useRef(null);
  const [status, setStatus] = useState(() => (hasWebGL() ? 'loading' : 'unsupported'));

  useEffect(() => {
    if (status === 'unsupported') return undefined;
    let cancelled = false;
    import('./towerScene')
      .then(({ createTowerScene }) => {
        if (cancelled || !containerRef.current) return;
        sceneRef.current = createTowerScene(containerRef.current, {
          progress,
          variant,
          interactive,
          highlight,
          labels: labels.map((l, i) => ({ ...l, el: labelRefs.current[i] })),
        });
        setStatus('ready');
      })
      .catch(() => !cancelled && setStatus('unsupported'));
    return () => {
      cancelled = true;
      sceneRef.current?.dispose();
      sceneRef.current = null;
    };
    // The scene is created once per variant; progress changes go through update() below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variant]);

  useEffect(() => {
    sceneRef.current?.update({ progress });
  }, [progress]);

  useEffect(() => {
    sceneRef.current?.update({ highlight });
  }, [highlight]);

  if (status === 'unsupported') return fallback;

  return (
    <div
      ref={containerRef}
      role="img"
      aria-label={label}
      className={`relative transition-[opacity,transform] duration-700 ease-[var(--ease-settle)] ${
        status === 'ready' ? 'scale-100 opacity-100' : 'scale-[0.97] opacity-0'
      } ${className}`}
    >
      {labels.map((l, i) => (
        <div
          key={`${l.floor}-${l.title ?? l.balloon}`}
          ref={(el) => (labelRefs.current[i] = el)}
          className={`model-label ${l.mobile === false ? 'max-sm:hidden' : ''}`}
          aria-hidden="true"
        >
          <div className={`flex items-center gap-2 ${l.side === 'left' ? 'flex-row-reverse text-right' : ''}`}>
            <span className={`h-px w-5 sm:w-8 ${l.current || l.floor === highlight ? 'bg-highlight' : 'bg-paper/50'}`} />
            {l.balloon ? (
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-full border text-[0.8rem] font-bold tabular-nums transition-colors duration-300 ${
                  l.floor === highlight ? 'border-highlight bg-highlight text-ink' : 'border-paper/70 bg-background-deep text-paper'
                }`}
              >
                {l.balloon}
              </span>
            ) : (
              <span className="leading-tight">
                <span className="block text-[0.8rem] font-semibold text-paper sm:text-[0.9rem]">{l.title}</span>
                <span className={`block text-[0.72rem] sm:text-[0.78rem] ${l.current ? 'font-semibold text-highlight' : 'text-line'}`}>
                  {l.sub}
                </span>
              </span>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
