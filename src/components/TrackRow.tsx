import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import { formatTime } from '../store/library';
import type { Track } from '../types';
import { formatArtist } from '../types';
import { Artwork } from './Artwork';
import { EllipsisIcon, PauseIcon } from './Icons';

export function TrackRow({
  track,
  showArtwork = true,
  showIndex,
  trailingDuration = true,
  onPlay
}: {
  track: Track;
  showArtwork?: boolean;
  showIndex?: number;
  trailingDuration?: boolean;
  onPlay?: () => void;
}) {
  const currentTrack = usePlayer((s) => s.queue[s.index]);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const playTracks = usePlayer((s) => s.playTracks);
  const togglePlay = usePlayer((s) => s.togglePlay);
  const navigate = useUI((s) => s.navigate);
  const setActionSheet = useUI((s) => s.setActionSheet);

  const isCurrent = currentTrack?.id === track.id;

  const handleRowClick = (): void => {
    if (onPlay) {
      onPlay();
      return;
    }
    if (isCurrent) {
      togglePlay();
      return;
    }
    playTracks([track], 0);
    navigate({ type: 'listen' });
  };

  return (
    <div className={`row ${isCurrent && isPlaying ? 'row-playing' : ''}`}>
      <button className="row" style={{ flex: 1, minWidth: 0 }} onClick={handleRowClick}>
        {showIndex !== undefined ? (
          <span style={{ width: 24, textAlign: 'center', color: 'var(--label-tertiary)', fontSize: 15, flexShrink: 0 }}>
            {isCurrent && isPlaying ? <PauseIcon size={14} /> : showIndex}
          </span>
        ) : null}
        {showArtwork && <Artwork src={track.artwork} className="row-artwork" placeholderSize={20} />}
        <span className="row-texts">
          <span className="row-title" style={{ display: 'block' }}>
            {track.title}
          </span>
          <span className="row-subtitle" style={{ display: 'block' }}>
            {formatArtist(track)}
          </span>
        </span>
        {trailingDuration && (
          <span className="row-trailing">{formatTime(track.duration ?? 0)}</span>
        )}
      </button>
      <button className="icon-btn row-btn-dots" aria-label="More options" onClick={() => setActionSheet(track.id)}>
        <EllipsisIcon size={20} />
      </button>
    </div>
  );
}
