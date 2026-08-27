import { useState } from 'react';
import type { JSX } from 'react';
import { useLibrary } from '../store/library';
import { useUI } from '../store/ui';
import type { Track } from '../types';
import { TagInput } from './TagInput';
import { Artwork } from './Artwork';
import { GENRE_OPTIONS, YEAR_OPTIONS, yearToEraValue, eraToDisplayValue } from '../lib/tags';

interface TrackEdits {
  artist: string;
  artist2: string;
  genre1: string;
  genre2: string;
  year: string;
  album: string;
}

interface Props {
  trackIds: string[];
  onClose: () => void;
}

export function PostImportSheet({ trackIds, onClose }: Props): JSX.Element | null {
  const byId = useLibrary((s) => s.byId);
  const allAlbums = useLibrary((s) => s.albums);
  const updateTrackMeta = useLibrary((s) => s.updateTrackMeta);
  const showToast = useUI((s) => s.showToast);

  const [edits, setEdits] = useState<Record<string, TrackEdits>>({});
  const [activeTrack, setActiveTrack] = useState(0);

  const tracks = trackIds.map((id) => byId[id]).filter(Boolean) as Track[];
  if (tracks.length === 0) return null;

  const albumOptions = [...new Set(allAlbums.map((a) => a.title))].sort();
  const artistOptions = [...new Set(tracks.map((t) => t.artist).concat(tracks.map((t) => t.artist2 ?? '')))]
    .filter(Boolean)
    .sort();

  const getEdit = (id: string): TrackEdits =>
    edits[id] ?? (() => {
      const t = byId[id];
      return {
        artist: t?.artist ?? '',
        artist2: t?.artist2 ?? '',
        genre1: t?.genre1 ?? '',
        genre2: t?.genre2 ?? '',
        year: t?.year ? String(t.year) : '',
        album: (t?.album && t.album !== 'YouTube') ? t.album : ''
      };
    })();

  const setEdit = (id: string, patch: Partial<TrackEdits>): void => {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  };

  const currentTrack = tracks[activeTrack];
  const currentEdit = getEdit(currentTrack.id);

  const saveAll = async (): Promise<void> => {
    for (const track of tracks) {
      const e = edits[track.id];
      if (!e) continue;
      const patch: { genre1?: string; genre2?: string; year?: number; album?: string; artist?: string; artist2?: string } = {};
      if (track.artist !== e.artist && e.artist) patch.artist = e.artist;
      if (track.artist2 !== e.artist2) patch.artist2 = e.artist2 || undefined;
      if (e.genre1) patch.genre1 = e.genre1;
      if (e.genre2) patch.genre2 = e.genre2;
      if (e.year) {
        const y = parseInt(e.year, 10);
        if (isFinite(y) && y > 1950) patch.year = y;
      }
      if (e.album) patch.album = e.album;
      if (Object.keys(patch).length > 0) {
        await updateTrackMeta(track.id, patch);
      }
    }
    showToast(`Tagged ${tracks.length} song${tracks.length > 1 ? 's' : ''}`);
    onClose();
  };

  const skip = (): void => {
    onClose();
  };

  return (
    <div className="sheet-overlay" style={{ alignItems: 'stretch', justifyContent: 'stretch' }} onClick={skip}>
      <div
        style={{ display: 'flex', flexDirection: 'column', height: '100%', width: '100%' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', borderRadius: '16px 16px 0 0', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 10px', borderBottom: '0.5px solid var(--separator)' }}>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>Tag Your Music</div>
              <div style={{ fontSize: 12, color: 'var(--label-secondary)', marginTop: 2 }}>
                {activeTrack + 1} of {tracks.length} songs
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button className="pill-btn" onClick={skip} style={{ fontSize: 13 }}>
                Skip All
              </button>
              <button className="pill-btn primary" onClick={() => void saveAll()} style={{ fontSize: 13 }}>
                Save All
              </button>
            </div>
          </div>

          {/* Track navigation pills */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 16px', overflowX: 'auto', flexShrink: 0 }}>
            {tracks.map((t, i) => {
              const hasEdits = !!edits[t.id];
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTrack(i)}
                  style={{
                    flexShrink: 0,
                    padding: '5px 10px',
                    borderRadius: 14,
                    fontSize: 12,
                    fontWeight: i === activeTrack ? 600 : 400,
                    background: i === activeTrack ? 'var(--accent)' : hasEdits ? 'var(--accent-bg)' : 'var(--fill-secondary)',
                    color: i === activeTrack ? '#fff' : hasEdits ? 'var(--accent)' : 'var(--label-secondary)',
                    border: 'none',
                    cursor: 'pointer',
                    whiteSpace: 'nowrap'
                  }}
                >
                  {t.title.length > 18 ? t.title.slice(0, 18) + '…' : t.title}
                </button>
              );
            })}
          </div>

          {/* Edit form */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {/* Artwork + basic info */}
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <Artwork src={currentTrack.artwork} className="row-artwork" style={{ width: 64, height: 64, borderRadius: 10 } as React.CSSProperties} placeholderSize={24} alt="" />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 15, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTrack.title}</div>
                <div style={{ fontSize: 13, color: 'var(--label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTrack.artist}</div>
                {currentTrack.album && currentTrack.album !== 'YouTube' && currentTrack.album !== 'Unknown Album' && (
                  <div style={{ fontSize: 12, color: 'var(--label-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{currentTrack.album}</div>
                )}
              </div>
            </div>

            {/* Artist 1 */}
            <TagInput
              label="Artist 1"
              placeholder="Search or type artist…"
              value={currentEdit.artist}
              onChange={(v) => setEdit(currentTrack.id, { artist: v })}
              options={artistOptions}
            />

            {/* Artist 2 */}
            <TagInput
              label="Artist 2"
              placeholder="Featuring / second artist…"
              value={currentEdit.artist2}
              onChange={(v) => setEdit(currentTrack.id, { artist2: v })}
              options={artistOptions}
            />

            {/* Tag 1 */}
            <TagInput
              label="Category 1"
              placeholder="e.g. Bollywood, Rock, Pop…"
              value={currentEdit.genre1}
              onChange={(v) => setEdit(currentTrack.id, { genre1: v })}
              options={GENRE_OPTIONS}
            />

            {/* Tag 2 */}
            <TagInput
              label="Category 2"
              placeholder="e.g. Hindi, Rock, Electronic…"
              value={currentEdit.genre2}
              onChange={(v) => setEdit(currentTrack.id, { genre2: v })}
              options={GENRE_OPTIONS}
            />

            {/* Year */}
            <TagInput
              label="Year / Era"
              placeholder="e.g. 2024, New, Classic…"
              value={eraToDisplayValue(currentEdit.year)}
              onChange={(v) => setEdit(currentTrack.id, { year: yearToEraValue(v) })}
              options={YEAR_OPTIONS}
            />

            {/* Album / Movie */}
            <TagInput
              label="Movie / Album"
              placeholder="e.g. Aashiqui 2, Dil Bechara…"
              value={currentEdit.album}
              onChange={(v) => setEdit(currentTrack.id, { album: v })}
              options={albumOptions}
            />
          </div>

          {/* Bottom navigation */}
          <div style={{ display: 'flex', gap: 8, padding: '10px 16px 14px', borderTop: '0.5px solid var(--separator)' }}>
            <button
              className="pill-btn"
              disabled={activeTrack === 0}
              style={{ flex: 1, opacity: activeTrack === 0 ? 0.4 : 1 }}
              onClick={() => setActiveTrack((i) => Math.max(0, i - 1))}
            >
              ← Previous
            </button>
            {activeTrack < tracks.length - 1 ? (
              <button
                className="pill-btn primary"
                style={{ flex: 1 }}
                onClick={() => setActiveTrack((i) => Math.min(tracks.length - 1, i + 1))}
              >
                Next →
              </button>
            ) : (
              <button
                className="pill-btn primary"
                style={{ flex: 1 }}
                onClick={() => void saveAll()}
              >
                Done ✓
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
