import { useEffect, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';

/**
 * Thin highlighter bar across the top of the page while any query is loading.
 * It waits 150 ms before appearing so fast responses don't flicker it, and fades out when done.
 */
export default function FetchBar() {
  const fetching = useIsFetching() > 0;
  const [shown, setShown] = useState(false);

  useEffect(() => {
    if (!fetching) {
      setShown(false);
      return undefined;
    }
    const t = setTimeout(() => setShown(true), 150);
    return () => clearTimeout(t);
  }, [fetching]);

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 top-0 z-[70] h-0.5 overflow-hidden transition-opacity duration-300 md:left-64 ${
        shown ? 'opacity-100' : 'opacity-0'
      }`}
      aria-hidden="true"
    >
      <div className="h-full w-1/3 bg-highlight" style={{ animation: 'fetch-sweep 1.1s var(--ease-draft) infinite' }} />
    </div>
  );
}
