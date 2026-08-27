import type { JSX } from 'react';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import { Artwork } from './Artwork';
import { SeekBar } from './SeekBar';
import { formatArtist } from '../types';
import {
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOneIcon,
  Back5Icon,
  Forward5Icon,
  QueueIcon,
  VolumeHighIcon,
  VolumeLowIcon
} from './Icons';

export function DesktopPlayerBar(): JSX.Element | null {
  const track = usePlayer((s) => s.queue[s.index]);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const volume = usePlayer((s) => s.volume);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const previous = usePlayer((s) => s.previous);
  const seek = usePlayer((s) => s.seek);
  const skipForward = usePlayer((s) => s.skipForward);
  const skipBackward = usePlayer((s) => s.skipBackward);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const setVolume = usePlayer((s) => s.setVolume);
  const toggleQueue = useUI((s) => s.toggleQueue);

  if (!track) return null;

  return (
    <div className="desktop-playerbar">
      <div className="playerbar-left">
        <Artwork src={track.artwork} className="mini-art" placeholderSize={18} alt="" />
        <div style={{ minWidth: 0 }}>
          <div className="mini-title">{track.title}</div>
          <div className="mini-artist">{formatArtist(track)}</div>
        </div>
      </div>

      <div className="playerbar-center">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            className={`icon-btn ${shuffle ? '' : 'disabled'}`}
            style={shuffle ? { color: 'var(--accent)' } : undefined}
            onClick={toggleShuffle}
            aria-label="Shuffle"
          >
            <ShuffleIcon size={19} />
          </button>
          <button className="icon-btn" onClick={previous} aria-label="Previous">
            <PrevIcon size={24} />
          </button>
          <button className="icon-btn" onClick={() => skipBackward(5)} aria-label="Back 5 seconds">
            <Back5Icon size={26} />
          </button>
          <button className="icon-btn" onClick={togglePlay} aria-label="Play/Pause">
            {isPlaying ? <PauseIcon size={30} /> : <PlayIcon size={30} />}
          </button>
          <button className="icon-btn" onClick={() => skipForward(5)} aria-label="Forward 5 seconds">
            <Forward5Icon size={26} />
          </button>
          <button className="icon-btn" onClick={() => next(false)} aria-label="Next">
            <NextIcon size={24} />
          </button>
          <button
            className={`icon-btn ${repeat === 'off' ? 'disabled' : ''}`}
            style={repeat !== 'off' ? { color: 'var(--accent)' } : undefined}
            onClick={cycleRepeat}
            aria-label="Repeat"
          >
            {repeat === 'one' ? <RepeatOneIcon size={19} /> : <RepeatIcon size={19} />}
          </button>
        </div>
        <div className="pb-seek-row">
          <span>{fmt(currentTime)}</span>
          <SeekBar current={currentTime} duration={duration} onSeek={seek} />
          <span>{duration > 0 ? `-${fmt(duration - currentTime)}` : '--:--'}</span>
        </div>
      </div>

      <div className="playerbar-right">
        <button className="icon-btn" onClick={() => setVolume(volume > 0.5 ? 0 : Math.min(1, volume + 0.25))} aria-label="Volume">
          {volume > 0.5 ? <VolumeHighIcon size={18} /> : <VolumeLowIcon size={18} />}
        </button>
        <input
          type="range"
          className="slider"
          min={0}
          max={1}
          step={0.01}
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
          style={{ width: 80, '--range-pct': `${volume * 100}%`, '--range-fill': 'var(--label-secondary)', '--range-track': 'var(--fill-1)' } as React.CSSProperties}
          aria-label="Volume slider"
        />
        <button className="icon-btn" onClick={toggleQueue} aria-label="Queue">
          <QueueIcon size={20} />
        </button>
      </div>
    </div>
  );
}

function fmt(s: number): string {
  if (!isFinite(s) || s <= 0) return '0:00';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
