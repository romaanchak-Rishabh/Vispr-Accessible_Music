import { useCallback, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

interface SeekBarProps {
  current: number;
  duration: number;
  onSeek: (time: number) => void;
  light?: boolean;
}

/**
 * Custom pointer-driven seek bar. Supports both tap-to-jump and drag-to-scrub
 * reliably on iOS / Android / desktop (the native <input type=range> thumb was
 * hidden until hover, which made scrubbing with touch effectively impossible).
 */
export function SeekBar({ current, duration, onSeek, light = false }: SeekBarProps) {
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const [dragPct, setDragPct] = useState<number | null>(null);

  const floorDur = duration > 0 ? Math.floor(duration) : 0;
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  const shownPct = dragPct != null ? dragPct : pct;

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const el = ref.current;
      if (!el || !floorDur) return 0;
      const rect = el.getBoundingClientRect();
      const w = rect.width || 1;
      const rel = Math.min(1, Math.max(0, (clientX - rect.left) / w));
      return rel * floorDur;
    },
    [floorDur]
  );

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>): void => {
    // left button only (or touch / pen)
    if (e.button !== undefined && e.button !== 0) return;
    dragging.current = true;
    try {
      (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const t = valueFromClientX(e.clientX);
    setDragPct(floorDur ? (t / floorDur) * 100 : 0);
    onSeek(t);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging.current) return;
    const t = valueFromClientX(e.clientX);
    setDragPct(floorDur ? (t / floorDur) * 100 : 0);
    onSeek(t);
  };

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>): void => {
    if (!dragging.current) return;
    dragging.current = false;
    const t = valueFromClientX(e.clientX);
    setDragPct(null);
    onSeek(t);
    try {
      (e.currentTarget as HTMLDivElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  return (
    <div style={{ width: '100%' }}>
      <div
        ref={ref}
        role="slider"
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={floorDur}
        aria-valuenow={Math.floor(Math.min(current, floorDur || current))}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        style={{
          position: 'relative',
          height: 28,
          display: 'flex',
          alignItems: 'center',
          cursor: 'pointer',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none'
        }}
      >
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            height: 7,
            borderRadius: 4,
            background: light ? 'rgba(255,255,255,0.28)' : 'var(--fill-1)',
            boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
          }}
        >
          <div
            style={{
              width: `${shownPct}%`,
              height: '100%',
              borderRadius: 4,
              background: light ? 'rgba(255,255,255,0.9)' : 'var(--accent)'
            }}
          />
        </div>
        <div
          style={{
            position: 'absolute',
            left: `calc(${shownPct}% - 7.5px)`,
            width: 15,
            height: 15,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 1px 6px rgba(0,0,0,0.45)',
            opacity: shownPct > 0 || dragPct != null ? 1 : 0,
            transition: dragPct == null && dragging.current ? undefined : 'opacity 0.2s'
          }}
        />
      </div>
    </div>
  );
}

export function TimeRow({ current, duration }: { current: number; duration: number }) {
  return (
    <div className="seek-row">
      <span>{formatSecs(current)}</span>
      <span style={{ flex: 1, textAlign: 'center' }}>
        <span style={{ opacity: 0.6 }}>{duration > 0 ? `-${formatSecs(duration - current)}` : '--:--'}</span>
      </span>
      <span>{formatSecs(duration)}</span>
    </div>
  );
}

function formatSecs(s: number): string {
  if (!isFinite(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
