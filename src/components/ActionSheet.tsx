import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import { useUI, type Page } from '../store/ui';
import { Artwork } from './Artwork';
import { blobToDataUrl } from '../lib/metadata';

export function ActionSheet(): JSX.Element | null {
  const trackId = useUI((s) => s.actionSheetTrackId);
  const setActionSheet = useUI((s) => s.setActionSheet);
  const track = useLibrary((s) => (trackId ? s.byId[trackId] : undefined));
  const playlists = useLibrary((s) => s.playlists);

  const [submenu, setSubmenu] = useState<'main' | 'playlist' | 'new-playlist' | 'edit'>('main');
  const [newName, setNewName] = useState('');
  const [title, setTitle] = useState('');
  const [artist, setArtist] = useState('');
  const [album, setAlbum] = useState('');
  const [artwork, setArtwork] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!trackId || !track) return null;

  const close = (): void => {
    setSubmenu('main');
    setNewName('');
    setActionSheet(null);
  };

  const openEdit = (): void => {
    setTitle(track.title);
    setArtist(track.artist);
    setAlbum(track.album);
    setArtwork(track.artwork);
    setSubmenu('edit');
  };

  const pickArtwork = async (file: File): Promise<void> => {
    const dataUrl = await blobToDataUrl(file, 640);
    if (dataUrl) setArtwork(dataUrl);
  };

  const saveEdit = async (): Promise<void> => {
    await useLibrary.getState().updateTrackMeta(track.id, { title, artist, album, artwork });
    close();
  };

  const player = usePlayer.getState();
  const lib = useLibrary.getState();

  // Apple Music behaviour: the now-playing sheet slides down to the mini pill,
  // then the target page opens.
  const goToPage = (page: Page): void => {
    useUI.setState({ showNowPlaying: false, showQueue: false });
    close();
    useUI.getState().navigate(page);
  };

  const albumKey = `${track.album}|||${track.albumArtist ?? track.artist}`.toLowerCase();

  const actions: { label: string; sub?: string; fn: () => void }[] =
    submenu === 'playlist'
      ? [
          {
            label: 'New Playlist…',
            fn: () => setSubmenu('new-playlist')
          },
          ...playlists.map((p) => ({
            label: `Add to “${p.name}”`,
            fn: () => {
              lib.addToPlaylist(p.id, [track.id]);
              close();
            }
          }))
        ]
      : submenu === 'edit'
        ? []
        : [
            {
              label: 'Go to Album',
              sub: track.album,
              fn: () => goToPage({ type: 'album', key: albumKey })
            },
            {
              label: 'Go to Artist',
              sub: track.artist,
              fn: () => goToPage({ type: 'artist', name: track.artist })
            },
            {
              label: 'Play Next',
              fn: () => {
                player.playTrackNext(track);
                close();
              }
            },
            {
              label: 'Play Last',
              fn: () => {
                player.playTrackLater(track);
                close();
              }
            },
            {
              label: 'Add to a Playlist…',
              fn: () => setSubmenu('playlist')
            },
            {
              label: 'More…',
              fn: openEdit
            },
            {
              label: 'Delete from Library',
              fn: () => {
                if (!window.confirm(`Delete “${track.title}” and its downloaded audio?\nThis cannot be undone.`)) return;
                const p = usePlayer.getState();
                const wasCurrent = p.queue[p.index]?.id === track.id;
                if (wasCurrent) p.pause();
                usePlayer.setState((s) => {
                  const before = s.queue.filter((q, i) => q.id === track.id && i < s.index).length;
                  return {
                    queue: s.queue.filter((q) => q.id !== track.id),
                    originalQueue: s.originalQueue.filter((q) => q.id !== track.id),
                    index: Math.max(0, s.index - before),
                    isPlaying: false
                  };
                });
                void lib.removeTrackFromLibrary(track.id);
                close();
              }
            }
          ];

  if (submenu === 'edit') {
    return (
      <div className="sheet-overlay" style={{ alignItems: 'flex-end', justifyContent: 'center' }} onClick={close}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }} onClick={(e) => e.stopPropagation()}>
          <div className="action-sheet" style={{ width: 'min(420px, 100%)' }}>
            <div className="action-sheet-head">
              <span style={{ fontSize: 17, fontWeight: 600 }}>Edit Song Info</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '4px 14px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', borderRadius: 12 }}
                  aria-label="Change cover art"
                >
                  <Artwork src={artwork} className="row-artwork" style={{ width: 88, height: 88, borderRadius: 12 } as React.CSSProperties} placeholderSize={40} alt="Cover art" />
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void pickArtwork(f);
                    e.target.value = '';
                  }}
                />
              </div>
              <button
                className="pill-btn"
                style={{ alignSelf: 'center', padding: '5px 14px', fontSize: 13 }}
                onClick={() => fileInputRef.current?.click()}
              >
                Change Cover…
              </button>
              <input className="search-input" style={{ paddingLeft: 12 }} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
              <input className="search-input" style={{ paddingLeft: 12 }} placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
              <input className="search-input" style={{ paddingLeft: 12 }} placeholder="Album" value={album} onChange={(e) => setAlbum(e.target.value)} />
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="pill-btn primary"
                  style={{ flex: 1 }}
                  onClick={() => void saveEdit()}
                  disabled={!title.trim() || !artist.trim()}
                >
                  Save
                </button>
                <button className="pill-btn" onClick={() => setSubmenu('main')}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="sheet-overlay" style={{ alignItems: 'flex-end', justifyContent: 'center' }} onClick={close}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }} onClick={(e) => e.stopPropagation()}>
        <div className="action-sheet">
          {submenu === 'new-playlist' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newName.trim()) return;
                const id = lib.createPlaylist(newName.trim());
                lib.addToPlaylist(id, [track.id]);
                close();
              }}
            >
              <div className="action-sheet-head">
                <span style={{ fontSize: 17, fontWeight: 600 }}>New Playlist</span>
              </div>
              <input
                autoFocus
                className="search-input"
                style={{ margin: 14, width: 'calc(100% - 28px)', padding: '9px 12px' }}
                placeholder="Playlist name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <button type="submit" className="action-item">
                Create & Add Song
              </button>
            </form>
          ) : (
            <>
              <div className="action-sheet-head">
                <Artwork src={track.artwork} className="row-artwork" placeholderSize={18} alt="" />
                <div style={{ minWidth: 0 }}>
                  <div className="row-title">{track.title}</div>
                  <div className="row-subtitle">{track.artist}</div>
                </div>
              </div>
              {actions.map((a) => (
                <button
                  key={a.label}
                  className="action-item"
                  style={a.sub ? { flexDirection: 'column', alignItems: 'flex-start', gap: 1 } : undefined}
                  onClick={() => {
                    a.fn();
                  }}
                >
                  <span>{a.label}</span>
                  {a.sub && (
                    <span style={{ fontSize: 12, color: 'var(--label-secondary)', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {a.sub}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}
        </div>
        <button className="action-cancel" onClick={close}>
          Cancel
        </button>
      </div>
    </div>
  );
}
