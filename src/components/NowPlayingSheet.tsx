import { useEffect, useRef, useState } from 'react';
import type { JSX, PointerEvent as ReactPointerEvent } from 'react';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import { Artwork } from './Artwork';
import { SeekBar, TimeRow } from './SeekBar';
import { formatArtist } from '../types';
import { createSharePayload, payloadToBlob } from '../lib/share';
import {
  ChevronLeftIcon,
  EllipsisIcon,
  QueueIcon,
  PlayIcon,
  PauseIcon,
  NextIcon,
  PrevIcon,
  ShuffleIcon,
  RepeatIcon,
  RepeatOneIcon,
  Back5Icon,
  Forward5Icon,
  ShareIcon
} from './Icons';

export function NowPlayingSheet(): JSX.Element | null {
  const track = usePlayer((s) => s.queue[s.index]);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const volume = usePlayer((s) => s.volume);
  const shuffle = usePlayer((s) => s.shuffle);
  const repeat = usePlayer((s) => s.repeat);
  const crossfade = usePlayer((s) => s.crossfade);
  const contextName = usePlayer((s) => s.contextName);
  const queueLen = usePlayer((s) => s.queue.length);
  const index = usePlayer((s) => s.index);

  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const previous = usePlayer((s) => s.previous);
  const seek = usePlayer((s) => s.seek);
  const skipForward = usePlayer((s) => s.skipForward);
  const skipBackward = usePlayer((s) => s.skipBackward);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const cycleRepeat = usePlayer((s) => s.cycleRepeat);
  const toggleCrossfade = usePlayer((s) => s.toggleCrossfade);
  const setVolume = usePlayer((s) => s.setVolume);

  const closeNowPlaying = useUI((s) => s.closeNowPlaying);
  const toggleQueue = useUI((s) => s.toggleQueue);
  const setActionSheet = useUI((s) => s.setActionSheet);
  const showNowPlaying = useUI((s) => s.showNowPlaying);

  if (!track || !showNowPlaying) return null;

  return (
    <div className="nowplaying-overlay">
      <div
        className="nowplaying-bg"
        style={track.artwork ? { backgroundImage: `url(${track.artwork})` } : { background: 'linear-gradient(135deg,#3a2b4d,#1c1c28)' }}
      />
      <div className="nowplaying-content">
        <div className="np-grip-row">
          <button className="icon-btn" style={{ color: '#fff' }} onClick={closeNowPlaying} aria-label="Close">
            <ChevronLeftIcon size={26} />
          </button>
          <div className="np-context">{contextName ?? 'Now Playing'}</div>
          <button
            className="icon-btn"
            style={{ color: '#fff' }}
            onClick={() => {
              const payload = createSharePayload([track]);
              const blob = payloadToBlob(payload);
              const file = new File([blob], `${track.title} — ${track.artist}.vispr.json`, { type: 'application/json' });
              if (navigator.share && navigator.canShare?.({ files: [file] })) {
                navigator.share({ files: [file], title: track.title, text: `${track.title} — ${track.artist}` }).catch(() => {});
              } else {
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `${track.title} — ${track.artist}.vispr.json`;
                a.click();
                URL.revokeObjectURL(url);
              }
            }}
            aria-label="Share"
          >
            <ShareIcon size={22} />
          </button>
          <button
            className="icon-btn"
            style={{ color: '#fff' }}
            onClick={() => setActionSheet(track.id)}
            aria-label="More"
          >
            <EllipsisIcon size={24} />
          </button>
        </div>

        <div className="np-art-wrap" onClick={togglePlay}>
          <Artwork src={track.artwork} className={`np-art ${isPlaying ? '' : 'paused'}`} placeholderSize={64} alt={track.title} />
        </div>

        <div className="np-titles">
          <div className="np-title">{track.title}</div>
          <div className="np-artist">{formatArtist(track)}</div>
        </div>

        <SeekBar current={currentTime} duration={duration} onSeek={seek} light />
        <TimeRow current={currentTime} duration={duration} />

        <div className="np-controls">
          <button className={`icon-btn ${shuffle ? '' : 'disabled'}`} style={{ color: shuffle ? 'var(--accent)' : '#fff' }} onClick={toggleShuffle}>
            <ShuffleIcon size={24} />
          </button>
          <button className="icon-btn" onClick={previous} style={{ color: '#fff' }}>
            <PrevIcon size={34} />
          </button>
          <button className="np-skip-btn" onClick={() => skipBackward(5)} aria-label="Back 5 seconds" style={{ color: '#fff', position: 'relative' }}>
            <Back5Icon size={40} />
          </button>
          <button className="np-playpause" onClick={togglePlay}>
            {isPlaying ? <PauseIcon size={52} /> : <PlayIcon size={52} />}
          </button>
          <button className="np-skip-btn" onClick={() => skipForward(5)} aria-label="Forward 5 seconds" style={{ color: '#fff', position: 'relative' }}>
            <Forward5Icon size={40} />
          </button>
          <button className="icon-btn" onClick={next.bind(null, false)} style={{ color: '#fff' }}>
            <NextIcon size={34} />
          </button>
          <button
            className={`icon-btn ${repeat === 'off' ? 'disabled' : ''}`}
            style={{ color: repeat !== 'off' ? 'var(--accent)' : '#fff' }}
            onClick={cycleRepeat}
          >
            {repeat === 'one' ? <RepeatOneIcon size={24} /> : <RepeatIcon size={24} />}
          </button>
        </div>

        <div className="np-toggle-row">
          <span>Crossfade</span>
          <button
            className={`switch ${crossfade ? 'on' : ''}`}
            onClick={toggleCrossfade}
            role="switch"
            aria-checked={crossfade}
            aria-label="Crossfade"
          />
        </div>

        <div className="volume-row">
          <VolumeSlider volume={volume} setVolume={setVolume} />
        </div>

        <div className="np-secondary">
          <span style={{ fontSize: 12, opacity: 0.7 }}>
            {queueLen > 0 ? `${index + 1} of ${queueLen}` : ''}
          </span>
          <button
            className="icon-btn"
            style={{ color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={toggleQueue}
          >
            <QueueIcon size={20} />
            <span style={{ fontSize: 14 }}>Queue</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function VolumeSlider({ volume, setVolume }: { volume: number; setVolume: (v: number) => void }): JSX.Element {
  const [local, setLocal] = useState(volume);
  useEffect(() => setLocal(volume), [volume]);
  const ref = useRef<HTMLInputElement>(null);

  const handle = (e: ReactPointerEvent<HTMLInputElement>): void => {
    void e;
    const el = ref.current;
    if (!el) return;
    setVolume(parseFloat(el.value));
  };

  return (
    <>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" opacity={0.8}>
        <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
      </svg>
      <input
        ref={ref}
        type="range"
        className="slider seek-slider"
        min={0}
        max={1}
        step={0.01}
        value={local}
        onChange={(e) => {
          setLocal(parseFloat(e.target.value));
          setVolume(parseFloat(e.target.value));
        }}
        onPointerUp={handle}
        aria-label="Volume"
        style={
          {
            '--range-pct': `${local * 100}%`,
            '--range-fill': 'rgba(255,255,255,0.9)',
            '--range-track': 'rgba(255,255,255,0.28)'
          } as React.CSSProperties
        }
      />
      <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" opacity={0.8}>
        <path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z" />
        <path d="M15 9a4.5 4.5 0 0 1 0 6M17.5 6.5a8 8 0 0 1 0 11" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" fill="none" />
      </svg>
    </>
  );
}
