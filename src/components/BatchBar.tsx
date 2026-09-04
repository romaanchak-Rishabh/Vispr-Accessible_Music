import { useState } from 'react';
import type { JSX } from 'react';
import { useUI } from '../store/ui';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { SpinnerIcon } from './Icons';

export function BatchBar(): JSX.Element | null {
  const isMultiSelect = useUI((s) => s.isMultiSelect);
  const multiSelectIds = useUI((s) => s.multiSelectIds);
  const clearMultiSelect = useUI((s) => s.clearMultiSelect);
  const showToast = useUI((s) => s.showToast);
  const playlists = useLibrary((s) => s.playlists);
  const addToPlaylist = useLibrary((s) => s.addToPlaylist);
  const removeTrackFromLibrary = useLibrary((s) => s.removeTrackFromLibrary);
  const toggleFavourite = useLibrary((s) => s.toggleFavourite);
  const playTracks = usePlayer((s) => s.playTracks);
  const byId = useLibrary((s) => s.byId);
  const [showPlaylists, setShowPlaylists] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (!isMultiSelect) return null;

  const count = multiSelectIds.length;

  const handleAddToPlaylist = (playlistId: string): void => {
    addToPlaylist(playlistId, multiSelectIds);
    const pl = playlists.find((p) => p.id === playlistId);
    showToast(`Added ${count} song${count > 1 ? 's' : ''} to ${pl?.name ?? 'playlist'}`);
    clearMultiSelect();
  };

  const handleFavourite = (): void => {
    for (const id of multiSelectIds) {
      void toggleFavourite(id);
    }
    showToast(`Favourited ${count} song${count > 1 ? 's' : ''}`);
    clearMultiSelect();
  };

  const handleDelete = async (): Promise<void> => {
    setDeleting(true);
    for (const id of multiSelectIds) {
      await removeTrackFromLibrary(id);
    }
    showToast(`Deleted ${count} song${count > 1 ? 's' : ''}`);
    clearMultiSelect();
    setDeleting(false);
  };

  const handlePlay = (): void => {
    const tracks = multiSelectIds.map((id) => byId[id]).filter(Boolean);
    if (tracks.length > 0) {
      playTracks(tracks, 0);
    }
    clearMultiSelect();
  };

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 120,
        background: 'var(--sheet-bg)',
        backdropFilter: 'blur(24px) saturate(180%)',
        borderTop: '0.5px solid var(--separator)',
        padding: '10px 16px',
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 10px)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <span style={{ fontSize: 14, fontWeight: 600 }}>{count} selected</span>
        <button
          onClick={clearMultiSelect}
          style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: 14, cursor: 'pointer' }}
        >
          Cancel
        </button>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button className="pill-btn" style={{ fontSize: 12 }} onClick={handlePlay}>
          Play
        </button>
        <button className="pill-btn" style={{ fontSize: 12 }} onClick={handleFavourite}>
          Favourite
        </button>
        <button className="pill-btn" style={{ fontSize: 12 }} onClick={() => setShowPlaylists(!showPlaylists)}>
          Add to Playlist
        </button>
        <button
          className="pill-btn"
          style={{ fontSize: 12, color: 'var(--accent)' }}
          onClick={() => void handleDelete()}
          disabled={deleting}
        >
          {deleting ? <SpinnerIcon size={12} /> : 'Delete'}
        </button>
      </div>
      {showPlaylists && (
        <div style={{ marginTop: 8, maxHeight: 120, overflowY: 'auto' }}>
          {playlists.map((p) => (
            <button
              key={p.id}
              className="row"
              style={{ padding: '6px 8px', fontSize: 13 }}
              onClick={() => handleAddToPlaylist(p.id)}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
