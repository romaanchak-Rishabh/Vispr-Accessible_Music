interface SeekBarProps {
  current: number;
  duration: number;
  onSeek: (time: number) => void;
  light?: boolean;
}

export function SeekBar({ current, duration, onSeek, light = false }: SeekBarProps) {
  const pct = duration > 0 ? Math.min(100, (current / duration) * 100) : 0;
  return (
    <div style={{ width: '100%' }}>
      <input
        type="range"
        className="slider seek-slider"
        min={0}
        max={duration > 0 ? Math.floor(duration) : 1}
        step={1}
        value={Math.floor(Math.min(current, duration || 0))}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="Seek"
        style={
          {
            '--range-pct': `${pct}%`,
            '--range-fill': light ? 'rgba(255,255,255,0.9)' : 'var(--accent)',
            '--range-track': light ? 'rgba(255,255,255,0.28)' : 'var(--fill-1)'
          } as React.CSSProperties
        }
      />
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
