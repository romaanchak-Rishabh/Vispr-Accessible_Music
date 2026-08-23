import type { JSX } from 'react';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import { Artwork } from './Artwork';
import { PlayIcon, PauseIcon, NextIcon } from './Icons';

export function MiniPlayer(): JSX.Element | null {
  const track = usePlayer((s) => s.queue[s.index]);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const currentTime = usePlayer((s) => s.currentTime);
  const duration = usePlayer((s) => s.duration);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const next = usePlayer((s) => s.next);
  const openNowPlaying = useUI((s) => s.openNowPlaying);

  if (!track) return null;
  const pct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div className="mini-player">
      <div className="progress-track-mini">
        <div className="progress-fill-mini" style={{ width: `${pct}%` }} />
      </div>
      <button className="mini-player-main" onClick={openNowPlaying}>
        <Artwork src={track.artwork} className="mini-art" placeholderSize={18} alt="" />
        <span className="mini-texts">
          <span className="mini-title" style={{ display: 'block' }}>
            {track.title}
          </span>
          <span className="mini-artist" style={{ display: 'block' }}>
            {track.artist}
          </span>
        </span>
        <span
          className="mini-controls"
          onClick={(e) => {
            e.stopPropagation();
            togglePlay();
          }}
        >
          {isPlaying ? <PauseIcon size={26} /> : <PlayIcon size={26} />}
        </span>
        <span
          className="mini-controls"
          onClick={(e) => {
            e.stopPropagation();
            next(false);
          }}
        >
          <NextIcon size={24} />
        </span>
      </button>
    </div>
  );
}
