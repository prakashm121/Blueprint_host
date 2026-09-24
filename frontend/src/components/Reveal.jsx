import { useInView } from '../lib/motion';

/**
 * Fades its content up into place the first time it scrolls into view.
 * `delay` (ms) staggers siblings. Reduced-motion users get the content immediately (see index.css).
 */
export default function Reveal({ as: Tag = 'div', delay = 0, className = '', children, ...rest }) {
  const [ref, inView] = useInView({ threshold: 0.15 });
  return (
    <Tag
      ref={ref}
      data-revealed={inView}
      className={`reveal ${className}`}
      style={{ transitionDelay: inView ? `${delay}ms` : '0ms' }}
      {...rest}
    >
      {children}
    </Tag>
  );
}
