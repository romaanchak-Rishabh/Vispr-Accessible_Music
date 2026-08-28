import { useRef, useState } from 'react';
import type { JSX } from 'react';

const THRESHOLD = 72;
const MAX_PULL = 120;
const RESISTANCE = 0.45;

interface Props {
  onRefresh: () => Promise<void> | void;
  children: React.ReactNode;
  style?: React.CSSProperties;
}

/**
 * iOS-style pull-to-refresh for the mobile layout.
 *
 * The app disables the browser's native overscroll (overscroll-behavior-y: none),
 * so there's no built-in pull-to-refresh. We implement our own: when the scroll
 * container is at the top and the user drags down, a spinner follows the pull.
 * Releasing past the threshold fires onRefresh and shows the spinner until done.
 *
 * This element IS the scroll container (styled .content-scroll by the caller),
 * so we can read its scrollTop directly.
 */
export function PullToRefresh({ onRefresh, children, style }: Props): JSX.Element {
  const rootRef = useRef<HTMLDivElement>(null);
  const startY = useRef<number | null>(null);
  const pulling = useRef(false);
  const refreshing = useRef(false);
  const [dist, setDist] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (refreshing.current) return;
    const el = rootRef.current;
    if (!el || el.scrollTop > 0) return;
    startY.current = e.clientY;
    pulling.current = true;
    setDist(0);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>): void => {
    if (!pulling.current || startY.current == null) return;
    const el = rootRef.current;
    if (!el || el.scrollTop > 0) {
      pulling.current = false;
      setDist(0);
      return;
    }
    const dy = e.clientY - startY.current;
    if (dy <= 0) {
      if (dist !== 0) setDist(0);
      return;
    }
    e.preventDefault();
    setDist(Math.min(dy * RESISTANCE, MAX_PULL));
  };

  const endPull = async (): Promise<void> => {
    if (!pulling.current || refreshing.current) {
      pulling.current = false;
      startY.current = null;
      if (dist !== 0) setDist(0);
      return;
    }
    pulling.current = false;
    startY.current = null;
    const shouldRefresh = dist >= THRESHOLD;
    setDist(0);
    if (!shouldRefresh) return;
    refreshing.current = true;
    setIsRefreshing(true);
    try {
      await onRefresh();
    } finally {
      refreshing.current = false;
      setIsRefreshing(false);
    }
  };

  const opacity = Math.min(1, dist / THRESHOLD);

  return (
    <div
      ref={rootRef}
      className="content-scroll ptr-root"
      style={{ touchAction: 'pan-x pan-y', ...style }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={() => { void endPull(); }}
      onPointerCancel={() => { void endPull(); }}
    >
      <div
        className="ptr-indicator"
        style={{
          height: isRefreshing ? 52 : Math.max(0, dist),
          opacity: isRefreshing ? 1 : opacity
        }}
        aria-hidden="true"
      >
        <div className={`ptr-spinner${isRefreshing ? ' spinning' : ''}`} style={{ transform: `rotate(${dist * 3}deg)` }} />
      </div>
      {children}
    </div>
  );
}
