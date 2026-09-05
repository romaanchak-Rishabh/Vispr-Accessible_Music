import { useRef, useState } from 'react';
import type { JSX } from 'react';
import { usePlayer } from '../store/player';
import { useLibrary } from '../store/library';
import { useUI, type Page } from '../store/ui';
import { Artwork } from './Artwork';
import { SpinnerIcon } from './Icons';
import { TagInput } from './TagInput';
import { blobToDataUrl } from '../lib/metadata';
import { formatArtist, SONG_TYPE_OPTIONS, type SongType } from '../types';
import { GENRE_OPTIONS, YEAR_OPTIONS, yearToEraValue, eraToDisplayValue, eraToYear } from '../lib/tags';
import { shareTracks } from '../lib/share';
import { getGeminiApiKey } from '../lib/geminiMetadata';
import { fetchGeminiMetadata, mapGeminiGenres } from '../lib/geminiMetadata';

export function ActionSheet(): JSX.Element | null {
  const trackId = useUI((s) => s.actionSheetTrackId);
  const setActionSheet = useUI((s) => s.setActionSheet);
  const track = useLibrary((s) => (trackId ? s.byId[trackId] : undefined));
  const playlists = useLibrary((s) => s.playlists);
  const allAlbums = useLibrary((s) => s.albums);
  const albumOptions = [...new Set(allAlbums.map((a) => a.title))].sort();

  const [submenu, setSubmenu] = useState<'main' | 'playlist' | 'new-playlist' | 'edit'>('main');
  const [newName, setNewName] = useState('');
  const [title, setTitle] = useState('');
  const [artists, setArtists] = useState<string[]>(['']);
  const [album, setAlbum] = useState('');
  const [genre1, setGenre1] = useState('');
  const [genre2, setGenre2] = useState('');
  const [year, setYear] = useState('');
  const [artwork, setArtwork] = useState<string | undefined>(undefined);
  const [ytUrl, setYtUrl] = useState('');
  const [artworkLoading, setArtworkLoading] = useState(false);
  const [mood, setMood] = useState('');
  const [language, setLanguage] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [songType, setSongType] = useState<SongType>('');
  const [rescanning, setRescanning] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!trackId || !track) return null;

  const close = (): void => {
    setSubmenu('main');
    setNewName('');
    setActionSheet(null);
  };

  const openEdit = (): void => {
    setTitle(track.title);
    // Populate artists list from track.artists or fallback to artist/artist2
    if (track.artists && track.artists.length > 0) {
      setArtists([...track.artists]);
    } else {
      const list = [track.artist];
      if (track.artist2) list.push(track.artist2);
      setArtists(list);
    }
    setAlbum(track.album);
    setGenre1(track.genre1 ?? '');
    setGenre2(track.genre2 ?? '');
    setYear(track.year ? eraToDisplayValue(
      track.year >= 2020 ? '2020s' :
      track.year >= 2010 ? '2010s' :
      track.year >= 2000 ? '2000s' :
      track.year >= 1990 ? '1990s' :
      track.year >= 1980 ? '1980s' :
      '1970s'
    ) : '');
    setArtwork(track.artwork);
    setMood(track.mood ?? '');
    setLanguage(track.language ?? '');
    setTags(track.tags ? [...track.tags] : []);
    setSongType((track.songType as SongType) ?? '');
    setSubmenu('edit');
  };

  const pickArtwork = async (file: File): Promise<void> => {
    const dataUrl = await blobToDataUrl(file, 640);
    if (dataUrl) setArtwork(dataUrl);
  };

  const fetchArtworkFromUrl = async (): Promise<void> => {
    const trimmed = ytUrl.trim();
    if (!trimmed) return;
    const match = trimmed.match(/(?:v=|youtu\.be\/|embed\/|shorts\/)([a-zA-Z0-9_-]{11})/);
    const videoId = match?.[1];
    if (!videoId) return;
    setArtworkLoading(true);
    try {
      const thumbUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 10000);
      const resp = await fetch(thumbUrl, { mode: 'cors', signal: ctrl.signal });
      clearTimeout(t);
      if (resp.ok) {
        const blob = await resp.blob();
        const dataUrl = await blobToDataUrl(blob, 640);
        if (dataUrl) setArtwork(dataUrl);
      }
    } catch { /* ignore */ }
    setArtworkLoading(false);
  };

  const saveEdit = async (): Promise<void> => {
    const y = year.trim();
    const yearNum = eraToYear(y);
    const cleanedArtists = artists.filter((a) => a.trim());
    await useLibrary.getState().updateTrackMeta(track.id, {
      title,
      artist: cleanedArtists[0] || '',
      artist2: cleanedArtists[1] || '',
      artists: cleanedArtists.length > 1 ? cleanedArtists : undefined,
      album,
      artwork,
      genre1,
      genre2,
      year: yearNum,
      songType,
      mood,
      language,
      tags,
    });
    close();
  };

  const rescanMetadata = async (): Promise<void> => {
    const apiKey = getGeminiApiKey();
    if (!apiKey) {
      useUI.getState().showToast('AI API key not configured');
      return;
    }
    setRescanning(true);
    try {
      const meta = await fetchGeminiMetadata(apiKey, track.title, track.artist, undefined, undefined);
      if (!meta) {
        useUI.getState().showToast('No metadata found');
        return;
      }
      const genreMapped = mapGeminiGenres(meta.genres);
      const updatedArtists = meta.artists.length > 0 ? meta.artists : [track.artist];
      await useLibrary.getState().updateTrackMeta(track.id, {
        artist: updatedArtists[0] || track.artist,
        artist2: updatedArtists[1] || '',
        artists: updatedArtists.length > 1 ? updatedArtists : undefined,
        album: meta.album || track.album,
        genre1: genreMapped.genre1 ?? track.genre1,
        genre2: genreMapped.genre2 ?? track.genre2,
        year: meta.year ?? track.year,
        mood: meta.mood ?? track.mood,
        language: meta.language ?? track.language,
        tags: meta.tags.length > 0 ? meta.tags : track.tags,
      });
      useUI.getState().showToast('Metadata updated via AI');
    } catch {
      useUI.getState().showToast('Rescan failed');
    }
    setRescanning(false);
  };

  const player = usePlayer.getState();
  const lib = useLibrary.getState();

  const goToPage = (page: Page): void => {
    useUI.setState({ showNowPlaying: false, showQueue: false });
    close();
    useUI.getState().navigate(page);
  };

  const albumKey = track.album.toLowerCase();

  const actions: { label: string; sub?: string; fn: () => void }[] =
    submenu === 'playlist'
      ? [
          {
            label: 'New Playlist…',
            fn: () => setSubmenu('new-playlist')
          },
          ...playlists.map((p) => ({
            label: `Add to "${p.name}"`,
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
              label: track.favouritedAt ? '♥ Favourited — tap to remove' : '♡ Add to Favourites',
              fn: () => {
                void lib.toggleFavourite(track.id);
                close();
              }
            },
            {
              label: 'Share Song',
              fn: () => {
                void shareTracks([track]);
                close();
              }
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
              label: 'Rescan Metadata',
              sub: 'Re-fetch via AI',
              fn: () => void rescanMetadata()
            },
            {
              label: 'Edit Song Info',
              fn: openEdit
            },
            {
              label: 'Select',
              fn: () => {
                useUI.getState().toggleMultiSelect(track.id);
                close();
              }
            },
            {
              label: 'Delete from Library',
              fn: () => {
                if (!window.confirm(`Delete "${track.title}" and its downloaded audio?\nThis cannot be undone.`)) return;
                const p = usePlayer.getState();
                const wasCurrent = p.queue[p.index]?.id === track.id;
                if (wasCurrent) p.pause();
                usePlayer.setState((s) => {
                  const idx = s.queue.findIndex((q) => q.id === track.id);
                  const newQueue = s.queue.filter((q) => q.id !== track.id);
                  const newOrig = s.originalQueue.filter((q) => q.id !== track.id);
                  let newIndex = s.index;
                  if (idx >= 0 && idx < s.index) newIndex = Math.max(0, s.index - 1);
                  else if (idx >= 0 && idx === s.index) newIndex = Math.min(newIndex, newQueue.length - 1);
                  return {
                    queue: newQueue,
                    originalQueue: newOrig,
                    index: Math.max(0, newIndex),
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
          <div className="action-sheet" style={{ width: 'min(420px, 100%)', maxHeight: '85vh', overflowY: 'auto' }}>
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
                Choose from Photos…
              </button>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  className="search-input"
                  style={{ flex: 1, paddingLeft: 12, fontSize: 13 }}
                  placeholder="YouTube URL for artwork"
                  value={ytUrl}
                  onChange={(e) => setYtUrl(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void fetchArtworkFromUrl(); }}
                />
                <button
                  className="pill-btn"
                  style={{ padding: '5px 10px', fontSize: 12, flexShrink: 0 }}
                  onClick={() => void fetchArtworkFromUrl()}
                  disabled={artworkLoading || !ytUrl.trim()}
                >
                  {artworkLoading ? <SpinnerIcon size={14} /> : 'Fetch'}
                </button>
              </div>
              <input className="search-input" style={{ paddingLeft: 12 }} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} />

              {/* Dynamic Artists List */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {artists.map((a, i) => (
                  <div key={i} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                    <input
                      className="search-input"
                      style={{ flex: 1, paddingLeft: 12, fontSize: 13 }}
                      placeholder={i === 0 ? 'Primary Artist' : `Featured Artist ${i}`}
                      value={a}
                      onChange={(e) => {
                        const next = [...artists];
                        next[i] = e.target.value;
                        setArtists(next);
                      }}
                    />
                    {artists.length > 1 && (
                      <button
                        className="icon-btn"
                        style={{ fontSize: 16, color: 'var(--accent)', flexShrink: 0, padding: '4px 6px' }}
                        onClick={() => setArtists(artists.filter((_, j) => j !== i))}
                        aria-label="Remove artist"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="pill-btn"
                  style={{ alignSelf: 'flex-start', padding: '4px 10px', fontSize: 12 }}
                  onClick={() => setArtists([...artists, ''])}
                >
                  + Add Artist
                </button>
              </div>

              <TagInput
                label="Album"
                placeholder="Search or type album…"
                value={album}
                onChange={setAlbum}
                options={albumOptions}
              />
              <select
                className="search-input"
                style={{ paddingLeft: 10, fontSize: 13 }}
                value={year ? eraToDisplayValue(year) : ''}
                onChange={(e) => setYear(yearToEraValue(e.target.value))}
              >
                <option value="">Year / Era</option>
                {YEAR_OPTIONS.map((g) => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  className="search-input"
                  style={{ flex: 1, paddingLeft: 10, fontSize: 13 }}
                  value={genre1}
                  onChange={(e) => setGenre1(e.target.value)}
                >
                  <option value="">Category 1</option>
                  {GENRE_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                  ))}
                </select>
                <select
                  className="search-input"
                  style={{ flex: 1, paddingLeft: 10, fontSize: 13 }}
                  value={genre2}
                  onChange={(e) => setGenre2(e.target.value)}
                >
                  <option value="">Category 2</option>
                  {GENRE_OPTIONS.map((g) => (
                    <option key={g} value={g}>{g.charAt(0).toUpperCase() + g.slice(1)}</option>
                  ))}
                </select>
              </div>
              <select
                className="search-input"
                style={{ paddingLeft: 10, fontSize: 13 }}
                value={songType}
                onChange={(e) => setSongType(e.target.value as SongType)}
              >
                {SONG_TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <input className="search-input" style={{ paddingLeft: 12, fontSize: 13 }} placeholder="Mood (e.g. upbeat, romantic)" value={mood} onChange={(e) => setMood(e.target.value)} />
              <input className="search-input" style={{ paddingLeft: 12, fontSize: 13 }} placeholder="Language" value={language} onChange={(e) => setLanguage(e.target.value)} />

              {/* Tags */}
              <TagInput
                label="Tags"
                placeholder="Add tag…"
                value={tags.join(', ')}
                onChange={(v) => setTags(v.split(',').map((t) => t.trim()).filter(Boolean))}
                options={[]}
              />

              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="pill-btn primary"
                  style={{ flex: 1 }}
                  onClick={() => void saveEdit()}
                  disabled={!title.trim() || !artists[0]?.trim()}
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
                  <div className="row-subtitle">{formatArtist(track)}</div>
                </div>
                {rescanning && <SpinnerIcon size={16} />}
              </div>
              {actions.map((a) => (
                <button
                  key={a.label}
                  className="action-item"
                  style={a.sub ? { flexDirection: 'column', alignItems: 'flex-start', gap: 1 } : undefined}
                  onClick={() => {
                    a.fn();
                  }}
                  disabled={rescanning}
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
