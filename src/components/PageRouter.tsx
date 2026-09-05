import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import type { JSX } from 'react';
import { useLibrary, getFavourites, getMostListened, isAutoPlaylist, AUTO_FAVOURITES_ID, AUTO_MOST_LISTENED_ID, SMART_PLAYLISTS, isSmartPlaylist, getSmartPlaylistTracks } from '../store/library';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import { useSettings } from '../store/settings';
import type { Album, Artist, Track } from '../types';
import { formatArtist } from '../types';
import { TrackRow } from './TrackRow';
import { Artwork } from './Artwork';
import { PlaylistArtwork } from './PlaylistArtwork';
import { EmptyLibrary, AlbumCard } from './Views';
import { ImportBar } from './ImportBar';
import { ChevronRightIcon, PlusCircleIcon, EllipsisIcon, ShuffleIcon, PlayIcon, SparklesIcon, ShareIcon, SpinnerIcon } from './Icons';
import { getRecommendations, getSmartRecommendations, type Recommendation } from '../lib/recommender';
import { getTrackProfile } from '../lib/classifier';
import { formatGenre } from '../lib/tags';
import { ReceiveTextSheet } from './ReceiveTextSheet';
import { PasteShareSheet } from './PasteShareSheet';
import { shareAlbum, shareArtist, sharePlaylist, shareMix } from '../lib/share';
import { searchYouTube, type YtSearchResult } from '../lib/ytdlp';
import type { YtItem } from '../lib/ytdlp';
import { ImportConfirmSheet, type ImportOverrides } from './ImportConfirmSheet';

async function isServerReachable(server: string): Promise<boolean> {
  const base = server?.trim().replace(/\/+$/, '') || '';
  const url = base ? `${base}/api/ping` : '/api/ping';
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 3000);
    const r = await fetch(url, { signal: ctrl.signal, cache: 'no-store' });
    clearTimeout(t);
    return r.ok;
  } catch {
    return false;
  }
}

export function PageRouter(): JSX.Element {
  const pageStack = useUI((s) => s.pageStack);
  const page = pageStack[pageStack.length - 1];

  if (!page) return <div style={{ padding: 16 }}>Loading...</div>;

  switch (page.type) {
    case 'listen':
      return <ListenNowLazy />;
    case 'forYou':
      return <ForYouPage />;
    case 'browse':
      return <BrowseView />;
    case 'library':
      return <LibraryView section={page.section} />;
    case 'search':
      return <SearchView />;
    case 'album':
      return <AlbumDetailView albumKey={page.key} />;
    case 'artist':
      return <ArtistDetailView name={page.name} />;
    case 'playlist':
      return <PlaylistDetailView playlistId={page.id} />;
    case 'mix-detail':
      return <MixDetailView mix={page} />;
    case 'settings':
      return <SettingsPage />;
  }
}

// Listen Now lives in Views.tsx (exported as ListenNowView)
import { ListenNowView } from './Views';
import { SettingsPage } from './SettingsPage';
function ListenNowLazy(): JSX.Element {
  return <ListenNowView />;
}

const LIB_SECTIONS = [
  { id: 'playlists', label: 'Playlists' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
  { id: 'songs', label: 'Songs' },
  { id: 'recent', label: 'Recently Added' },
  { id: 'downloads', label: 'Downloads' }
] as const;

function DownloadsView(): JSX.Element {
  const queue = useLibrary((s) => s.downloadQueue);
  const processQueue = useLibrary((s) => s.processDownloadQueue);

  const pending = queue.filter((q) => q.status === 'pending');
  const downloading = queue.filter((q) => q.status === 'downloading');
  const failed = queue.filter((q) => q.status === 'failed');
  const done = queue.filter((q) => q.status === 'done');

  const statusColor = (s: string) => {
    if (s === 'downloading') return 'var(--accent)';
    if (s === 'pending') return 'var(--label-secondary)';
    if (s === 'failed') return '#ff3b30';
    if (s === 'done') return '#34c759';
    return 'var(--label-secondary)';
  };

  const statusLabel = (s: string) => {
    if (s === 'downloading') return 'Downloading…';
    if (s === 'pending') return 'Pending';
    if (s === 'failed') return 'Failed';
    if (s === 'done') return 'Done';
    return s;
  };

  return (
    <>
      <h2 className="section-header" style={{ paddingTop: 4 }}>
        Downloads
        {queue.length > 0 && <span style={{ fontWeight: 400, fontSize: 13, marginLeft: 6 }}>({queue.length})</span>}
      </h2>

      {queue.length === 0 ? (
        <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--label-secondary)', fontSize: 14 }}>
          No downloads yet
        </div>
      ) : (
        <>
          {downloading.length > 0 && (
            <div className="group" style={{ marginTop: 0 }}>
              {downloading.map((q) => (
                <div key={q.id} className="row" style={{ margin: '0 16px', width: 'auto' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
                    <div style={{ fontSize: 12, color: statusColor(q.status) }}>{statusLabel(q.status)}</div>
                  </div>
                  <SpinnerIcon size={16} />
                </div>
              ))}
            </div>
          )}

          {pending.length > 0 && (
            <div className="group" style={{ marginTop: downloading.length > 0 ? 12 : 0 }}>
              <div style={{ padding: '0 16px 6px', fontSize: 12, fontWeight: 600, color: 'var(--label-secondary)', textTransform: 'uppercase' }}>
                Queued ({pending.length})
              </div>
              {pending.map((q) => (
                <div key={q.id} className="row" style={{ margin: '0 16px', width: 'auto' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
                    <div style={{ fontSize: 12, color: 'var(--label-secondary)' }}>{q.artist}</div>
                  </div>
                  <span style={{ fontSize: 12, color: statusColor(q.status) }}>{statusLabel(q.status)}</span>
                </div>
              ))}
            </div>
          )}

          {failed.length > 0 && (
            <div className="group" style={{ marginTop: 12 }}>
              <div style={{ padding: '0 16px 6px', fontSize: 12, fontWeight: 600, color: '#ff3b30', textTransform: 'uppercase' }}>
                Failed ({failed.length})
              </div>
              {failed.map((q) => (
                <div key={q.id} className="row" style={{ margin: '0 16px', width: 'auto' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
                    <div style={{ fontSize: 12, color: '#ff3b30' }}>{q.error || 'Download failed'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {done.length > 0 && (
            <div className="group" style={{ marginTop: 12 }}>
              <div style={{ padding: '0 16px 6px', fontSize: 12, fontWeight: 600, color: '#34c759', textTransform: 'uppercase' }}>
                Completed ({done.length})
              </div>
              {done.map((q) => (
                <div key={q.id} className="row" style={{ margin: '0 16px', width: 'auto', opacity: 0.6 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title}</div>
                    <div style={{ fontSize: 12, color: '#34c759' }}>Added to library</div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {pending.length > 0 && (
            <div style={{ padding: '12px 16px' }}>
              <button className="pill-btn primary" style={{ width: '100%' }} onClick={() => void processQueue()}>
                Start Downloads
              </button>
            </div>
          )}
        </>
      )}
    </>
  );
}

function LibraryView({ section }: { section?: 'playlists' | 'artists' | 'albums' | 'songs' | 'recent' | 'downloads' }): JSX.Element {
  const status = useLibrary((s) => s.status);
  const tracks = useLibrary((s) => s.tracks);
  const albums = useLibrary((s) => s.albums);
  const artists = useLibrary((s) => s.artists);
  const navigate = useUI((s) => s.navigate);
  const playTracks = usePlayer((s) => s.playTracks);
  const [pastedPayload, setPastedPayload] = useState<import('../lib/share').SharePayload | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);

  if (status === 'loading') {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--label-secondary)' }}>Loading…</div>;
  }
  if (status !== 'ready') {
    return (
      <div>
        <h1 className="large-title">Library</h1>
        <EmptyLibrary />
      </div>
    );
  }

  const active = section ?? 'songs';

  return (
    <div className="fade-page">
      <h1 className="large-title">Library</h1>
      <LibraryStats />
      <div className="chips" style={{ paddingBottom: 14 }}>
        {LIB_SECTIONS.map((s) => (
          <button
            key={s.id}
            className={`chip ${active === s.id ? '' : ''}`}
            style={active === s.id ? { background: 'var(--accent)', color: '#fff' } : undefined}
            onClick={() => navigate({ type: 'library', section: s.id })}
          >
            {s.label}
          </button>
        ))}
      </div>

      {active === 'songs' && (
        <>
          <ImportBar />
          <div className="detail-actions">
            <button className="pill-btn primary" onClick={() => playTracks(tracks, Math.floor(Math.random() * tracks.length), 'Shuffle All')}>
              <ShuffleIcon size={16} /> Shuffle
            </button>
            <button
              className="pill-btn"
              onClick={() => setPasteOpen(true)}
            >
              Paste Share
            </button>
            <button
              className="pill-btn"
              onClick={() => {
                const input = document.createElement('input');
                input.type = 'file';
                input.multiple = true;
                input.accept = '.json,.vispr.json,.vpr,.m4a,.mp3,.mp4,.aac,.ogg,.opus,.flac';
                input.onchange = () => {
                  if (input.files && input.files.length > 0) {
                    useUI.getState().setReceiveFiles(Array.from(input.files));
                  }
                };
                input.click();
              }}
            >
              Receive Share
            </button>
            <span style={{ fontSize: 13, color: 'var(--label-secondary)' }}>{tracks.length} songs</span>
          </div>
          <div className="group">
            {tracks.map((t) => (
              <TrackRow key={t.id} track={t} />
            ))}
          </div>
        </>
      )}

      {active === 'albums' && (
        <>
          <h2 className="section-header" style={{ paddingTop: 4 }}>{albums.length} Albums</h2>
          <div className="grid-albums" style={{ paddingTop: 0 }}>
            {albums.map((a) => (
              <AlbumGridCard key={a.key} album={a} />
            ))}
          </div>
        </>
      )}

      {active === 'artists' && (
        <>
          <h2 className="section-header" style={{ paddingTop: 4 }}>{artists.length} Artists</h2>
          <div style={{ paddingTop: 0 }}>
            {artists.map((a) => (
              <ArtistRow key={a.name} artist={a} />
            ))}
          </div>
        </>
      )}

      {active === 'recent' && (
        <>
          <h2 className="section-header" style={{ paddingTop: 4 }}>Recently Added</h2>
          <div className="group" style={{ marginTop: 0 }}>
            {[...tracks]
              .sort((a, b) => b.addedAt - a.addedAt)
              .slice(0, 50)
              .map((t) => (
                <TrackRow key={t.id} track={t} />
              ))}
          </div>
        </>
      )}

      {active === 'downloads' && <DownloadsView />}

      {active === 'playlists' && <PlaylistsManager />}

      {pastedPayload && <ReceiveTextSheet payload={pastedPayload} onClose={() => setPastedPayload(null)} />}

      {pasteOpen && (
        <PasteShareSheet
          onParse={(payload) => { setPasteOpen(false); setPastedPayload(payload); }}
          onClose={() => setPasteOpen(false)}
        />
      )}
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (!isFinite(bytes) || bytes <= 0) return '0 MB';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let v = bytes;
  let u = 0;
  while (v >= 1024 && u < units.length - 1) {
    v /= 1024;
    u++;
  }
  return `${v >= 100 ? Math.round(v) : v.toFixed(1)} ${units[u]}`;
}

function LibraryStats(): JSX.Element {
  const tracks = useLibrary((s) => s.tracks);
  const albums = useLibrary((s) => s.albums);
  const artists = useLibrary((s) => s.artists);
  const playlists = useLibrary((s) => s.playlists);
  const [estimate, setEstimate] = useState<{ usage: number | null; quota: number | null }>({
    usage: null,
    quota: null
  });

  useEffect(() => {
    let alive = true;
    try {
      navigator.storage?.estimate?.().then((est) => {
        if (alive) setEstimate({ usage: est.usage ?? null, quota: est.quota ?? null });
      });
    } catch {
      /* estimate unsupported */
    }
    return () => {
      alive = false;
    };
  }, [tracks.length]);

  const trackBytes = tracks.reduce((n, t) => n + (t.size ?? 0), 0);
  const usedBytes = estimate.usage ?? trackBytes;
  const stats: [string, number][] = [
    ['Songs', tracks.length],
    ['Artists', artists.length],
    ['Albums', albums.length],
    ['Playlists', playlists.length]
  ];

  return (
    <div className="group" style={{ padding: '16px 8px 12px', marginBottom: 6 }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 4,
          textAlign: 'center'
        }}
      >
        {stats.map(([label, count]) => (
          <div key={label}>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.3px' }}>{count}</div>
            <div style={{ fontSize: 11, color: 'var(--label-secondary)', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
              {label}
            </div>
          </div>
        ))}
      </div>
      <div
        style={{
          marginTop: 12,
          paddingTop: 10,
          borderTop: '0.5px solid var(--separator)',
          textAlign: 'center',
          fontSize: 13,
          color: 'var(--label-secondary)'
        }}
      >
        <span style={{ color: 'var(--label)', fontWeight: 600 }}>{formatBytes(usedBytes)}</span> stored for offline play
        {estimate.quota != null && (
          <>
            {' · '}
            {formatBytes(estimate.quota)} available on this device
          </>
        )}
      </div>
    </div>
  );
}

function PlaylistsManager(): JSX.Element {
  const playlists = useLibrary((s) => s.playlists);
  const tracks = useLibrary((s) => s.tracks);
  const playCounts = usePlayer((s) => s.playCounts);
  const topExcluded = useLibrary((s) => s.topExcluded);
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const navigate = useUI((s) => s.navigate);
  const [name, setName] = useState('');

  const autoCounts: [string, string, number][] = [
    [AUTO_FAVOURITES_ID, 'Favourites', getFavourites(tracks).length],
    [AUTO_MOST_LISTENED_ID, 'Most Listened', getMostListened(tracks, playCounts, topExcluded).length]
  ];

  const smartCounts: [string, string, string, number][] = SMART_PLAYLISTS.map((sp) => [
    sp.id,
    sp.name,
    sp.icon,
    getSmartPlaylistTracks(sp.id, tracks, playCounts, topExcluded).length
  ]);

  return (
    <div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createPlaylist(name.trim());
          setName('');
        }}
        style={{ display: 'flex', gap: 10, padding: '4px 16px 18px' }}
      >
        <input
          className="search-input"
          style={{ padding: '9px 12px' }}
          placeholder="New playlist name"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button type="submit" className="pill-btn primary" aria-label="Create playlist">
          <PlusCircleIcon size={18} /> Create
        </button>
      </form>

      <div className="group">
        {autoCounts.map(([id, label, count]) => (
          <button key={id} className="row" onClick={() => navigate({ type: 'playlist', id })}>
            <Artwork className="row-artwork" placeholderSize={20} />
            <span className="row-texts">
              <span className="row-title" style={{ display: 'block' }}>
                {label}
              </span>
              <span className="row-subtitle" style={{ display: 'block' }}>
                {count} {count === 1 ? 'song' : 'songs'} · auto
              </span>
            </span>
            <ChevronRightIcon size={16} />
          </button>
        ))}
        {smartCounts.map(([id, label, icon, count]) => (
          <button key={id} className="row" onClick={() => navigate({ type: 'playlist', id })}>
            <span style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>
              {icon}
            </span>
            <span className="row-texts">
              <span className="row-title" style={{ display: 'block' }}>
                {label}
              </span>
              <span className="row-subtitle" style={{ display: 'block' }}>
                {count} {count === 1 ? 'song' : 'songs'}
              </span>
            </span>
            <ChevronRightIcon size={16} />
          </button>
        ))}
      </div>

      {playlists.length > 0 && (
        <div className="group">
          {playlists.map((p) => (
            <button key={p.id} className="row" onClick={() => navigate({ type: 'playlist', id: p.id })}>
              <PlaylistArtwork trackIds={p.trackIds} size={40} />
              <span className="row-texts">
                <span className="row-title" style={{ display: 'block' }}>
                  {p.name}
                </span>
                <span className="row-subtitle" style={{ display: 'block' }}>
                  {p.trackIds.length} songs
                </span>
              </span>
              <ChevronRightIcon size={16} />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function ArtistRow({ artist }: { artist: Artist }): JSX.Element | null {
  const navigate = useUI((s) => s.navigate);
  return (
    <button
      className="row"
      style={{ margin: '0 16px', width: 'auto', background: 'var(--bg-primary)', borderRadius: 8, marginBottom: 6 }}
      onClick={() => navigate({ type: 'artist', name: artist.name })}
    >
      <Artwork src={artist.artwork} className="row-artwork row-art-circle" placeholderSize={18} alt="" />
      <span className="row-texts">
        <span className="row-title" style={{ display: 'block' }}>
          {artist.name}
        </span>
        <span className="row-subtitle" style={{ display: 'block' }}>
          {artist.albumKeys.length} albums · {artist.trackIds.length} songs
        </span>
      </span>
      <ChevronRightIcon size={16} />
    </button>
  );
}

function AlbumGridCard({ album }: { album: Album }): JSX.Element {
  const navigate = useUI((s) => s.navigate);
  return (
    <button className="album-grid-card" style={{ background: 'none' }} onClick={() => navigate({ type: 'album', key: album.key })}>
      <Artwork src={album.artwork} className="album-grid-art" placeholderSize={30} alt={album.title} />
      <div className="card-title">{album.title}</div>
      <div className="card-subtitle">{album.artist}</div>
    </button>
  );
}

function BrowseView(): JSX.Element {
  const status = useLibrary((s) => s.status);
  const albums = useLibrary((s) => s.albums);
  const tracks = useLibrary((s) => s.tracks);
  const genres = useMemo(() => tracks.reduce<Map<string, number>>((m, t) => {
    const g = (t.genre1 ?? t.genre2 ?? t.genre ?? '').trim();
    if (!g) return m;
    m.set(g, (m.get(g) ?? 0) + 1);
    return m;
  }, new Map()), [tracks]);

  if (status === 'loading') return <div style={{ padding: 40 }}>Loading…</div>;
  if (status !== 'ready') {
    return (
      <div>
        <h1 className="large-title">Browse</h1>
        <EmptyLibrary />
      </div>
    );
  }

  return (
    <div className="fade-page">
      <h1 className="large-title">Browse</h1>
      {genres.size > 0 && (
        <>
          <h2 className="section-header" style={{ paddingTop: 4 }}>Genres</h2>
          <div className="chips" style={{ paddingTop: 0 }}>
            {[...genres.entries()]
              .sort((a, b) => b[1] - a[1])
              .slice(0, 8)
              .map(([g]) => (
                <span key={g} className="chip" style={{ cursor: 'default' }}>
                  {formatGenre(g)}
                </span>
              ))}
          </div>
        </>
      )}
      <h2 className="section-header">Albums</h2>
      <div className="grid-albums" style={{ paddingTop: 0 }}>
        {albums.map((a) => (
          <AlbumGridCard key={a.key} album={a} />
        ))}
      </div>
    </div>
  );
}

function SearchView(): JSX.Element {
  const status = useLibrary((s) => s.status);
  const tracks = useLibrary((s) => s.tracks);
  const [query, setQuery] = useState('');
  const [ytResults, setYtResults] = useState<YtSearchResult[]>([]);
  const [ytLoading, setYtLoading] = useState(false);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [pendingYtItem, setPendingYtItem] = useState<YtItem | null>(null);
  const [filterGenre, setFilterGenre] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [sortBy, setSortBy] = useState<'relevance' | 'title' | 'artist' | 'date'>('relevance');
  const ytdlpServer = useSettings((s) => s.ytdlpServer);
  const ytdlpToken = useSettings((s) => s.ytdlpToken);
  const importYouTube = useLibrary((s) => s.importYouTube);
  const queueYouTubeImport = useLibrary((s) => s.queueYouTubeImport);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const genres = useMemo(() => {
    const set = new Set<string>();
    for (const t of tracks) {
      const g = (t.genre1 ?? t.genre2 ?? '').trim();
      if (g) set.add(g);
    }
    return [...set].sort();
  }, [tracks]);

  const years = useMemo(() => {
    const set = new Set<string>();
    for (const t of tracks) {
      if (t.year) {
        const decade = `${Math.floor(t.year / 10) * 10}s`;
        set.add(decade);
      }
    }
    return [...set].sort().reverse();
  }, [tracks]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    let filtered = tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        (t.artist2 ?? '').toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        (t.genre1 ?? t.genre2 ?? '').toLowerCase().includes(q)
    );

    // Genre filter
    if (filterGenre) {
      const g = filterGenre.toLowerCase();
      filtered = filtered.filter((t) => (t.genre1 ?? t.genre2 ?? '').toLowerCase().includes(g));
    }

    // Year filter
    if (filterYear) {
      const decadeStart = parseInt(filterYear);
      filtered = filtered.filter((t) => t.year && t.year >= decadeStart && t.year < decadeStart + 10);
    }

    // Sort
    if (sortBy === 'title') filtered.sort((a, b) => a.title.localeCompare(b.title));
    else if (sortBy === 'artist') filtered.sort((a, b) => a.artist.localeCompare(b.artist));
    else if (sortBy === 'date') filtered.sort((a, b) => (b.addedAt ?? 0) - (a.addedAt ?? 0));

    return filtered;
  }, [query, tracks, filterGenre, filterYear, sortBy]);

  // Debounced YouTube search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const q = query.trim();
    if (!q || q.length < 2) {
      setYtResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setYtLoading(true);
      try {
        const res = await searchYouTube(ytdlpServer, ytdlpToken, q, 8);
        setYtResults(res);
      } catch {
        setYtResults([]);
      } finally {
        setYtLoading(false);
      }
    }, 600);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query, ytdlpServer, ytdlpToken]);

  // Auto-process download queue when server comes online
  const processQueue = useLibrary((s) => s.processDownloadQueue);
  const downloadQueue = useLibrary((s) => s.downloadQueue);
  const queueProcessing = useLibrary((s) => s.queueProcessing);
  const queueCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Check server every 10s and process queue if server is up
    queueCheckRef.current = setInterval(async () => {
      if (queueProcessing) return;
      const pending = downloadQueue.filter((q) => q.status === 'pending' || q.status === 'failed');
      if (pending.length === 0) return;
      const up = ytdlpServer ? await isServerReachable(ytdlpServer) : false;
      if (up) {
        useUI.getState().showToast('Server is up — starting downloads');
        processQueue();
      }
    }, 10_000);
    return () => { if (queueCheckRef.current) clearInterval(queueCheckRef.current); };
  }, [ytdlpServer, downloadQueue, queueProcessing, processQueue]);

  const handleImportYt = async (item: YtSearchResult): Promise<void> => {
    // Convert to YtItem and show metadata form
    setPendingYtItem({
      id: item.id,
      title: item.title,
      webpage_url: item.url || `https://www.youtube.com/watch?v=${item.id}`,
      uploader: item.uploader,
      duration: item.duration,
      thumbnail: item.thumbnail,
    });
  };

  const handleConfirmYtImport = async (overrides: Record<string, ImportOverrides>): Promise<void> => {
    if (!pendingYtItem) return;
    const item = pendingYtItem;
    setPendingYtItem(null);
    setImportingId(item.id);
    try {
      const videoUrl = item.webpage_url || `https://www.youtube.com/watch?v=${item.id}`;
      const serverUp = ytdlpServer ? await isServerReachable(ytdlpServer) : false;
      if (serverUp) {
        await importYouTube(videoUrl, undefined, overrides);
      } else {
        const ov = overrides[item.id];
        await queueYouTubeImport({
          id: item.id,
          url: videoUrl,
          title: ov?.title || item.title || '',
          artist: ov?.artist || item.uploader || '',
          artists: ov?.artists,
          album: ov?.album,
          genre1: ov?.genre1,
          genre2: ov?.genre2,
          year: ov?.year ? parseInt(ov.year) || undefined : undefined,
          mood: ov?.mood,
          language: ov?.language,
          tags: ov?.tags,
          songType: ov?.songType,
          thumbnail: item.thumbnail || '',
          duration: item.duration || 0,
        });
      }
    } catch {
      // silent
    } finally {
      setImportingId(null);
    }
  };

  const formatDuration = (secs: number): string => {
    if (!secs) return '';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  if (status === 'loading') return <div style={{ padding: 40 }}>Loading…</div>;
  if (status !== 'ready') {
    return (
      <div>
        <h1 className="large-title">Search</h1>
        <EmptyLibrary />
      </div>
    );
  }

  return (
    <div className="fade-page">
      <h1 className="large-title">Search</h1>
      <div className="search-box-wrap search-wrap-rel">
        <svg className="search-icon-abs" width="17" height="17" viewBox="0 0 24 24" fill="none">
          <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="2" />
          <path d="m15.5 15.5 5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        <input
          className="search-input"
          placeholder="Artists, Songs, Albums…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoCorrect="off"
          autoCapitalize="off"
        />
      </div>

      {/* Compact filters — single row, horizontally scrollable */}
      <div style={{ display: 'flex', gap: 6, padding: '6px 16px', overflowX: 'auto', flexShrink: 0 }}>
        {genres.slice(0, 8).map((g) => (
          <button
            key={g}
            className="chip"
            style={{ flexShrink: 0, fontSize: 11, padding: '3px 8px', ...(filterGenre === g ? { background: 'var(--accent)', color: '#fff' } : {}) }}
            onClick={() => setFilterGenre(filterGenre === g ? '' : g)}
          >
            {g}
          </button>
        ))}
        {years.slice(0, 4).map((y) => (
          <button
            key={y}
            className="chip"
            style={{ flexShrink: 0, fontSize: 11, padding: '3px 8px', ...(filterYear === y ? { background: 'var(--accent)', color: '#fff' } : {}) }}
            onClick={() => setFilterYear(filterYear === y ? '' : y)}
          >
            {y}
          </button>
        ))}
        <select
          style={{
            flexShrink: 0,
            fontSize: 11,
            padding: '3px 6px',
            borderRadius: 12,
            border: '1px solid var(--separator)',
            background: 'var(--bg-secondary)',
            color: 'var(--label)',
            appearance: 'none' as const
          }}
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
        >
          <option value="relevance">Relevance</option>
          <option value="title">Title</option>
          <option value="artist">Artist</option>
          <option value="date">Date Added</option>
        </select>
        {(filterGenre || filterYear || sortBy !== 'relevance') && (
          <button
            className="chip"
            style={{ flexShrink: 0, fontSize: 11, padding: '3px 8px', color: 'var(--accent)' }}
            onClick={() => { setFilterGenre(''); setFilterYear(''); setSortBy('relevance'); }}
          >
            Clear
          </button>
        )}
      </div>

      {!query.trim() ? (
        <div>
          <h2 className="section-header">Your Top Plays</h2>
          <TopPlaysInline />
        </div>
      ) : (
        <>
          {results.length > 0 && (
            <>
              <h2 className="section-header">Your Library</h2>
              <div className="group">
                {results.slice(0, 60).map((t) => (
                  <TrackRow key={t.id} track={t} />
                ))}
              </div>
            </>
          )}

          <h2 className="section-header" style={{ marginTop: 16 }}>
            YouTube{ytLoading ? ' — Searching…' : ytResults.length > 0 ? ` — ${ytResults.length} results` : ''}
          </h2>
          {ytLoading && ytResults.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--label-secondary)', padding: 20 }}>Searching YouTube…</p>
          ) : ytResults.length === 0 && !ytLoading ? (
            <p style={{ textAlign: 'center', color: 'var(--label-secondary)', padding: 20 }}>
              {results.length === 0 ? `No results for "${query}"` : 'No YouTube results found'}
            </p>
          ) : (
            <div className="group">
              {ytResults.filter(r => r && r.id).map((r) => (
                <button
                  key={String(r.id)}
                  className="row"
                  style={{ textAlign: 'left' }}
                  onClick={() => void handleImportYt(r)}
                  disabled={importingId === r.id}
                >
                  <div style={{ position: 'relative', width: 48, height: 48, borderRadius: 6, overflow: 'hidden', flexShrink: 0, background: 'var(--fill-secondary)' }}>
                    {r.thumbnail ? (
                      <img
                        src={r.thumbnail}
                        alt=""
                        style={{ width: 48, height: 48, objectFit: 'cover' }}
                        onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                      />
                    ) : (
                      <div style={{ width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--label-tertiary)' }}>
                        <PlayIcon size={20} />
                      </div>
                    )}
                    {r.duration > 0 && (
                      <span style={{
                        position: 'absolute', bottom: 2, right: 2,
                        background: 'rgba(0,0,0,0.75)', color: '#fff',
                        fontSize: 10, padding: '1px 4px', borderRadius: 3,
                      }}>
                        {formatDuration(r.duration)}
                      </span>
                    )}
                  </div>
                  <span className="row-texts" style={{ minWidth: 0 }}>
                    <span className="row-title" style={{ display: 'block' }}>{r.title}</span>
                    <span className="row-subtitle" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.uploader || 'YouTube'}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0, marginLeft: 8 }}>
                    {importingId === r.id ? (
                      <span style={{ fontSize: 12, color: 'var(--accent)' }}>Adding…</span>
                    ) : (
                      <span className="icon-btn" style={{ color: 'var(--accent)' }}>
                        <PlusCircleIcon size={22} />
                      </span>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {pendingYtItem && (
        <ImportConfirmSheet
          items={[pendingYtItem]}
          onConfirm={(overrides) => void handleConfirmYtImport(overrides)}
          onCancel={() => setPendingYtItem(null)}
        />
      )}
    </div>
  );
}

function TopPlaysInline(): JSX.Element | null {
  const playCounts = usePlayer((s) => s.playCounts);
  const byId = useLibrary((s) => s.byId);
  const top = [...Object.entries(playCounts)].sort((a, b) => b[1] - a[1]).slice(0, 10);
  if (top.length === 0) return null;
  return (
    <div className="group">
      {top.map(([id]) => {
        const t = byId[id];
        if (!t) return null;
        return <TrackRow key={id} track={t} />;
      })}
    </div>
  );
}

function DetailHeader({
  kicker,
  title,
  subtitle,
  artwork,
  children,
  topRight
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  artwork?: string;
  children?: React.ReactNode;
  topRight?: React.ReactNode;
}): JSX.Element {
  return (
    <>
      <div className="detail-hero">
        <Artwork src={artwork} className="detail-hero-art" placeholderSize={36} alt={title} />
        <div className="detail-hero-texts">
          <div className="detail-kicker">{kicker}</div>
          <h1 className="detail-title">{title}</h1>
          {subtitle && <div className="detail-sub">{subtitle}</div>}
        </div>
        {topRight}
      </div>
      {children && <div className="detail-actions">{children}</div>}
    </>
  );
}

const ROW_H = 56;

function DragRow({ track, index, totalCount, showIndex, onMove, trailing }: {
  track: Track;
  index: number;
  totalCount: number;
  showIndex?: boolean;
  onMove: (from: number, to: number) => void;
  trailing?: React.ReactNode;
}): JSX.Element {
  const dragRef = useRef<{ startY: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);
  const [dragging, setDragging] = useState(false);

  return (
    <div
      className="rowwrap"
      style={dragging ? { transform: `translateY(${dragOffset}px)`, background: 'var(--bg-elevated)', borderRadius: 8, zIndex: 2, position: 'relative' as const } : undefined}
    >
      <span
        onPointerDown={(e) => {
          (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
          dragRef.current = { startY: e.clientY };
          setDragging(true);
        }}
        onPointerMove={(e) => {
          if (!dragRef.current) return;
          setDragOffset(e.clientY - dragRef.current.startY);
        }}
        onPointerUp={(e) => {
          (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
          if (dragRef.current) {
            const delta = Math.round((e.clientY - dragRef.current.startY) / ROW_H);
            if (delta !== 0) {
              const to = Math.max(0, Math.min(totalCount - 1, index + delta));
              if (to !== index) onMove(index, to);
            }
          }
          dragRef.current = null;
          setDragging(false);
          setDragOffset(0);
        }}
        style={{
          touchAction: 'none',
          cursor: 'grab',
          fontSize: 18,
          color: 'var(--label-tertiary)',
          padding: '4px 0 4px 4px',
          userSelect: 'none',
          display: 'flex',
          alignItems: 'center'
        }}
      >
        ≡
      </span>
      <TrackRow track={track} showIndex={showIndex ? index + 1 : undefined} showArtwork={!showIndex} />
      {trailing}
    </div>
  );
}

function AlbumDetailView({ albumKey }: { albumKey: string }): JSX.Element | null {
  const album = useLibrary((s) => s.albums.find((a) => a.key === albumKey));
  const byId = useLibrary((s) => s.byId);
  const renameAlbum = useLibrary((s) => s.renameAlbum);
  const reorderAlbum = useLibrary((s) => s.reorderAlbum);
  const playTracks = usePlayer((s) => s.playTracks);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const shuffle = usePlayer((s) => s.shuffle);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [tracks, setTracks] = useState<Track[]>([]);

  if (!album) return null;
  const albumTracks = album.trackIds.map((id) => byId[id]).filter(Boolean);

  // sort tracks based on selected option
  const sortTracks = (option: string) => {
    let sorted = [...albumTracks];
    switch (option) {
      case 'az':
        sorted.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'za':
        sorted.sort((a, b) => b.title.localeCompare(a.title));
        break;
      case 'date':
        sorted.sort((a, b) => b.addedAt - a.addedAt);
        break;
      default:
        break;
    }
    setTracks(sorted);
    setSortMenuOpen(false);
  };

  // Initialize tracks if empty
  if (tracks.length === 0 && albumTracks.length > 0) {
    setTracks(albumTracks);
  }

  if (editing) {
    return (
      <div className="fade-page">
        <DetailHeader kicker="Album" title="Rename Album" subtitle={`${album.artist}${album.year ? ` · ${album.year}` : ''}`} artwork={album.artwork}>
          <></>
        </DetailHeader>
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            className="search-input"
            style={{ paddingLeft: 12, fontSize: 15 }}
            placeholder="Album name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && editName.trim()) {
                renameAlbum(album.title, editName.trim());
                setEditing(false);
              } else if (e.key === 'Escape') {
                setEditing(false);
              }
            }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="pill-btn primary"
              style={{ flex: 1 }}
              disabled={!editName.trim()}
              onClick={() => {
                if (editName.trim()) {
                  renameAlbum(album.title, editName.trim());
                  setEditing(false);
                }
              }}
            >
              Save
            </button>
            <button className="pill-btn" style={{ flex: 1 }} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-page">
      <DetailHeader
        kicker="Album"
        title={album.title}
        subtitle={`${album.artist}${album.year ? ` · ${album.year}` : ''}`}
        artwork={album.artwork}
        topRight={
          <button
            className="icon-btn"
            style={{ position: 'absolute', top: 16, right: 16, zIndex: 1 }}
            onClick={() => {
              setEditName(album.title);
              setEditing(true);
            }}
          >
            Edit
          </button>
        }
      >
        <button className="pill-btn primary" onClick={() => playTracks(tracks, 0, album.title)}>
          <PlayIcon size={15} /> Play
        </button>
        <button className={`pill-btn ${shuffle ? 'primary' : ''}`} onClick={() => {
          if (!shuffle) {
            playTracks(tracks, Math.floor(Math.random() * tracks.length), album.title);
            if (!usePlayer.getState().shuffle) toggleShuffle();
          }
        }}>
          <ShuffleIcon size={15} /> Shuffle
        </button>
        <button className="pill-btn" onClick={() => void shareAlbum(album.title, tracks)}>
          <ShareIcon size={15} /> Share
        </button>
      </DetailHeader>
      <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px', position: 'relative' }}>
        <button className="pill-btn" style={{ fontSize: 12 }} onClick={() => setSortMenuOpen(!sortMenuOpen)}>
          Sort
        </button>
        {sortMenuOpen && (
          <div className="sort-menu" style={{
            position: 'absolute',
            top: '100%',
            left: 16,
            background: 'var(--surface)',
            borderRadius: 12,
            padding: '6px 0',
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            zIndex: 10,
            minWidth: 140,
          }}>
            <button className="sort-menu-item" onClick={() => sortTracks('az')}>A → Z</button>
            <button className="sort-menu-item" onClick={() => sortTracks('za')}>Z → A</button>
            <button className="sort-menu-item" onClick={() => sortTracks('date')}>Date Added</button>
          </div>
        )}
      </div>
      <div className="group">
        {tracks.map((t, i) => (
          <DragRow
            key={t.id}
            track={t}
            index={i}
            totalCount={tracks.length}
            showIndex
            onMove={(from, to) => {
              const newTracks = [...tracks];
              const [moved] = newTracks.splice(from, 1);
              newTracks.splice(to, 0, moved);
              setTracks(newTracks);
              reorderAlbum(album.title, from, to);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function ArtistDetailView({ name }: { name: string }): JSX.Element | null {
  const artist = useLibrary((s) => s.artists.find((a) => a.name === name));
  const albums = useLibrary((s) => s.albums);
  const byId = useLibrary((s) => s.byId);
  const playTracks = usePlayer((s) => s.playTracks);

  if (!artist) return null;
  const artistAlbums = artist.albumKeys.map((k) => albums.find((a) => a.key === k)).filter((a): a is Album => Boolean(a));
  const tracks = artistAlbums.flatMap((a) => a.trackIds.map((id) => byId[id])).filter(Boolean);

  return (
    <div className="fade-page">
      <DetailHeader kicker="Artist" title={artist.name} subtitle={`${artist.trackIds.length} songs`} artwork={artist.artwork}>
        <button className="pill-btn primary" onClick={() => playTracks(tracks, 0, artist.name)}>
          <PlayIcon size={15} /> Play
        </button>
        <button className="pill-btn" onClick={() => void shareArtist(artist.name, tracks)}>
          <ShareIcon size={15} /> Share
        </button>
      </DetailHeader>

      <h2 className="section-header">Albums</h2>
      <div className="hscroll">
        {artistAlbums.map((a) => (
          <AlbumCard key={a.key} album={a} />
        ))}
      </div>

      <h2 className="section-header">Songs</h2>
      <div className="group">
        {tracks.map((t) => (
          <ArtistSongRow key={t.id} trackId={t.id} />
        ))}
      </div>
    </div>
  );
}

function ArtistSongRow({ trackId }: { trackId: string }): JSX.Element | null {
  const track = useLibrary((s) => s.byId[trackId]);
  const setActionSheet = useUI((s) => s.setActionSheet);
  const playTracks = usePlayer((s) => s.playTracks);
  const currentId = usePlayer((s) => s.queue[s.index]?.id);
  const isPlaying = usePlayer((s) => s.isPlaying);
  if (!track) return null;
  const current = currentId === track.id;
  return (
    <button className="row" onClick={() => (current ? usePlayer.getState().togglePlay() : playTracks([track], 0))}>
      <Artwork src={track.artwork} className="row-artwork row-art-circle" placeholderSize={16} alt="" />
      <span className="row-texts">
        <span className="row-title" style={{ display: 'block', color: current ? 'var(--accent)' : undefined }}>
          {isPlaying && current ? '▶ ' : ''}
          {track.title}
        </span>
      </span>
      <span
        className="icon-btn row-btn-dots"
        onClick={(e) => {
          e.stopPropagation();
          setActionSheet(track.id);
        }}
      >
        <EllipsisIcon size={18} />
      </span>
    </button>
  );
}

function PlaylistDetailView({ playlistId }: { playlistId: string }): JSX.Element | null {
  const realPlaylist = useLibrary((s) => s.playlists.find((p) => p.id === playlistId));
  const tracks = useLibrary((s) => s.tracks);
  const byId = useLibrary((s) => s.byId);
  const topExcluded = useLibrary((s) => s.topExcluded);
  const playCounts = usePlayer((s) => s.playCounts);
  const deletePlaylist = useLibrary((s) => s.deletePlaylist);
  const renamePlaylist = useLibrary((s) => s.renamePlaylist);
  const removeFromPlaylist = useLibrary((s) => s.removeFromPlaylist);
  const reorderPlaylist = useLibrary((s) => s.reorderPlaylist);
  const sortPlaylistByDate = useLibrary((s) => s.sortPlaylistByDate);
  const toggleFavourite = useLibrary((s) => s.toggleFavourite);
  const removeFromMostListened = useLibrary((s) => s.removeFromMostListened);
  const goBack = useUI((s) => s.goBack);
  const playTracks = usePlayer((s) => s.playTracks);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState('');

  if (isAutoPlaylist(playlistId) || isSmartPlaylist(playlistId)) {
    const isFav = playlistId === AUTO_FAVOURITES_ID;
    const smartMeta = !isAutoPlaylist(playlistId) ? SMART_PLAYLISTS.find((sp) => sp.id === playlistId) : null;
    const list = getSmartPlaylistTracks(playlistId, tracks, playCounts, topExcluded);
    const title = isFav ? 'Favourites' : playlistId === AUTO_MOST_LISTENED_ID ? 'Most Listened' : smartMeta?.name ?? 'Playlist';
    return (
      <div className="fade-page">
        <DetailHeader
          kicker={smartMeta ? 'Smart Playlist' : 'Playlist'}
          title={smartMeta ? `${smartMeta.icon} ${title}` : title}
          subtitle={`${list.length} songs${isAutoPlaylist(playlistId) ? ' · auto' : ''}`}
          artwork={list[0]?.artwork}
        >
          <button
            className="pill-btn primary"
            disabled={list.length === 0}
            style={list.length === 0 ? { opacity: 0.5 } : undefined}
            onClick={() => playTracks(list, 0, title)}
          >
            <PlayIcon size={15} /> Play
          </button>
          <button className="pill-btn" disabled={list.length === 0} style={list.length === 0 ? { opacity: 0.5 } : undefined} onClick={() => void sharePlaylist(title, list)}>
            <ShareIcon size={15} /> Share
          </button>
        </DetailHeader>

        {list.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--label-secondary)', padding: 30 }}>
            {isFav
              ? 'Nothing here yet. Use the ⋯ menu on any song and choose "Add to Favourites".'
              : smartMeta?.id === 'smart-never-played'
                ? 'All songs have been played at least once.'
                : 'No songs match this playlist yet.'}
          </p>
        ) : (
          <div className="group">
            {list.map((t) => (
              <div key={t.id} className="rowwrap">
                <TrackRow track={t} />
                {isAutoPlaylist(playlistId) && (
                  <button
                    className="icon-btn"
                    style={{ paddingRight: 14, color: 'var(--label-secondary)' }}
                    onClick={() => (isFav ? void toggleFavourite(t.id) : void removeFromMostListened(t.id))}
                    aria-label="Remove from list"
                  >
                    A-
                  </button>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
  }

  if (!realPlaylist) return null;
  const playlist = realPlaylist;
  const plTracks = playlist.trackIds.map((id) => byId[id]).filter(Boolean);

  if (editing) {
    return (
      <div className="fade-page">
        <DetailHeader kicker="Playlist" title="Rename Playlist" subtitle={`${plTracks.length} songs`} artwork={plTracks[0]?.artwork}>
          <></>
        </DetailHeader>
        <div style={{ padding: '0 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            className="search-input"
            style={{ paddingLeft: 12, fontSize: 15 }}
            placeholder="Playlist name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && editName.trim()) {
                renamePlaylist(playlist.id, editName.trim());
                setEditing(false);
              } else if (e.key === 'Escape') {
                setEditing(false);
              }
            }}
            autoFocus
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              className="pill-btn primary"
              style={{ flex: 1 }}
              disabled={!editName.trim()}
              onClick={() => {
                if (editName.trim()) {
                  renamePlaylist(playlist.id, editName.trim());
                  setEditing(false);
                }
              }}
            >
              Save
            </button>
            <button className="pill-btn" style={{ flex: 1 }} onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fade-page">
      <DetailHeader kicker="Playlist" title={playlist.name} subtitle={`${plTracks.length} songs`} artwork={plTracks[0]?.artwork}>
        <button className="pill-btn primary" disabled={plTracks.length === 0} style={plTracks.length === 0 ? { opacity: 0.5 } : undefined} onClick={() => playTracks(plTracks, 0, playlist.name)}>
          <PlayIcon size={15} /> Play
        </button>
        <button className="pill-btn" disabled={plTracks.length === 0} style={plTracks.length === 0 ? { opacity: 0.5 } : undefined} onClick={() => void sharePlaylist(playlist.name, plTracks)}>
          <ShareIcon size={15} /> Share
        </button>
        <button
          className="pill-btn"
          onClick={() => {
            setEditName(playlist.name);
            setEditing(true);
          }}
        >
          Edit
        </button>
        <button
          className="pill-btn"
          onClick={() => {
            deletePlaylist(playlist.id);
            goBack();
          }}
        >
          Delete Playlist
        </button>
      </DetailHeader>

      {plTracks.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--label-secondary)', padding: 30 }}>
          Empty playlist. Add songs using the ⋯ button on any track.
        </p>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 8, padding: '0 16px 12px' }}>
            <button className="pill-btn" style={{ fontSize: 12 }} onClick={() => sortPlaylistByDate(playlist.id)}>
              Sort by Date
            </button>
          </div>
          <div className="group">
            {plTracks.map((t, i) => (
              <DragRow
                key={t.id}
                track={t}
                index={i}
                totalCount={plTracks.length}
                onMove={(from, to) => reorderPlaylist(playlist.id, from, to)}
                trailing={
                  <button
                    className="icon-btn"
                    style={{ paddingRight: 14, color: 'var(--label-secondary)' }}
                    onClick={() => removeFromPlaylist(playlist.id, t.id)}
                    aria-label="Remove from playlist"
                  >
                    A-
                  </button>
                }
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}


/* ── Mix Detail View ────────────────────────────────────────────────── */

function MixDetailView({ mix }: { mix: { id: string; title: string; subtitle: string; icon: React.ReactNode; gradient: string; tracks: Track[] } }): JSX.Element | null {
  const playTracks = usePlayer((s) => s.playTracks);

  if (!mix || mix.tracks.length === 0) {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--label-secondary)' }}>Mix not found</div>;
  }

  return (
    <div className="fade-page">
      <DetailHeader
        kicker="Mix"
        title={mix.title}
        subtitle={mix.subtitle}
        artwork={mix.tracks[0]?.artwork}
      >
        <button
          className="pill-btn primary"
          disabled={mix.tracks.length === 0}
          style={mix.tracks.length === 0 ? { opacity: 0.5 } : undefined}
          onClick={() => playTracks(mix.tracks, 0, mix.title)}
        >
          <PlayIcon size={15} /> Play
        </button>
        <button
          className="pill-btn"
          onClick={() => {
            const shuffled = [...mix.tracks].sort(() => Math.random() - 0.5);
            playTracks(shuffled, 0, mix.title + ' — Shuffle');
          }}
        >
          <ShuffleIcon size={15} /> Shuffle
        </button>
        <button className="pill-btn" onClick={() => void shareMix(mix.title, mix.tracks)}>
          <ShareIcon size={15} /> Share
        </button>
      </DetailHeader>
      <div className="group">
        {mix.tracks.map((t) => (
          <TrackRow key={t.id} track={t} />
        ))}
      </div>
    </div>
  );
}

/* ── For You — NLP recommendations ──────────────────────────────────── */

function ForYouPage(): JSX.Element {
  const status = useLibrary((s) => s.status);
  const tracks = useLibrary((s) => s.tracks);
  const playCounts = usePlayer((s) => s.playCounts);
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed);
  const playlists = useLibrary((s) => s.playlists);
  const favouriteIds = useMemo(() => new Set(tracks.filter((t) => !!t.favouritedAt).map((t) => t.id)), [tracks]);
  const playTracks = usePlayer((s) => s.playTracks);

  const [, setSeed] = useState(() => Date.now());
  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState<{ done: number; total: number } | null>(null);
  const [showSweep, setShowSweep] = useState(false);

  const refresh = useCallback(async () => {
    const newSeed = Date.now();
    setSeed(newSeed);
    setLoading(true);
    setEmbeddingProgress(null);
    setShowSweep(true);
    try {
      const recentTracks = recentlyPlayed.map((e) => e.track);
      const results = await getSmartRecommendations(
        tracks, playCounts, recentTracks, playlists, favouriteIds, 10, newSeed,
        (done, total) => setEmbeddingProgress({ done, total }),
      );
      const shuffled = [...results].sort(() => Math.random() - 0.5);
      setRecs(shuffled);
    } catch {
      const recentTracks = recentlyPlayed.map((e) => e.track);
      const results = getRecommendations(tracks, playCounts, recentTracks, playlists, favouriteIds, 10, Date.now());
      const shuffled = [...results].sort(() => Math.random() - 0.5);
      setRecs(shuffled);
    } finally {
      setLoading(false);
      setEmbeddingProgress(null);
      setTimeout(() => setShowSweep(false), 1500);
    }
  }, [tracks, playCounts, recentlyPlayed, playlists, favouriteIds]);

  useEffect(() => {
    if (status === 'ready' && tracks.length > 0 && recs.length === 0) {
      refresh();
    }
  }, [status, tracks.length, refresh]);

  if (status === 'loading') {
    return <div style={{ padding: 40, textAlign: 'center', color: 'var(--label-secondary)' }}>Loading…</div>;
  }

  if (status !== 'ready' || tracks.length === 0) {
    return (
      <div>
        <h1 className="large-title">For You</h1>
        <EmptyLibrary />
      </div>
    );
  }

  return (
    <div className="fade-page" style={{ position: 'relative' }}>
      {(loading || showSweep) && <div className="magic-sweep" aria-hidden="true" />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px 0' }}>
        <h1 className="large-title" style={{ margin: 0 }}>For You</h1>
        <button
          className="pill-btn"
          onClick={refresh}
          disabled={loading}
          style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, opacity: loading ? 0.5 : 1 }}
        >
          <SparklesIcon size={14} /> {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <p style={{ padding: '4px 16px 14px', fontSize: 13, color: 'var(--label-secondary)' }}>
        {loading && embeddingProgress
          ? `Embedding library… ${embeddingProgress.done}/${embeddingProgress.total}`
          : 'Picked from your library based on what you listen to most'}
      </p>

      {loading && recs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 14, color: 'var(--label-secondary)', marginBottom: 8 }}>
            Analysing your music taste…
          </div>
          {embeddingProgress && (
            <div style={{ width: 120, height: 3, background: 'var(--fill-secondary)', borderRadius: 2, margin: '0 auto' }}>
              <div style={{
                width: `${(embeddingProgress.done / embeddingProgress.total) * 100}%`,
                height: '100%',
                background: 'var(--accent)',
                borderRadius: 2,
                transition: 'width 0.3s ease',
              }} />
            </div>
          )}
        </div>
      ) : recs.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--label-secondary)', padding: 30 }}>
          Play some songs first — recommendations improve as you listen.
        </p>
      ) : (
        <>
          <div className="detail-actions">
            <button
              className="pill-btn primary"
              onClick={() => playTracks(recs.map((r) => r.track), 0, 'For You')}
            >
              <PlayIcon size={15} /> Play All
            </button>
            <button
              className="pill-btn"
              onClick={() => {
                const shuffled = [...recs].sort(() => Math.random() - 0.5);
                playTracks(shuffled.map((r) => r.track), 0, 'For You — Shuffle');
              }}
            >
              <ShuffleIcon size={15} /> Shuffle
            </button>
          </div>

          <div className="group">
            {recs.map((rec, i) => (
              <ForYouCard key={rec.track.id} rec={rec} index={i + 1} onPlay={() => playTracks(recs.map((r) => r.track), i, 'For You')} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function ForYouCard({ rec, index, onPlay }: { rec: Recommendation; index: number; onPlay: () => void }): JSX.Element {
  const profile = getTrackProfile(rec.track);
  const setActionSheet = useUI((s) => s.setActionSheet);
  const currentId = usePlayer((s) => s.queue[s.index]?.id);
  const isPlaying = usePlayer((s) => s.isPlaying);
  const current = currentId === rec.track.id;

  const genreLabel = (g: string): string => {
    if (!g || g === 'unknown') return '';
    return g.charAt(0).toUpperCase() + g.slice(1);
  };

  return (
    <button
      className="row"
      style={{ margin: '0 16px', width: 'auto', background: current ? 'var(--accent-bg)' : 'var(--bg-primary)', borderRadius: 10, marginBottom: 2 }}
      onClick={onPlay}
    >
      <div style={{ position: 'relative', width: 48, height: 48, borderRadius: 8, overflow: 'hidden', flexShrink: 0, background: 'var(--fill-secondary)' }}>
        <Artwork src={rec.track.artwork} className="row-artwork" style={{ width: 48, height: 48, borderRadius: 8, position: 'absolute', top: 0, left: 0 } as React.CSSProperties} placeholderSize={18} alt="" />
        <div style={{ position: 'absolute', top: 3, left: 3, background: 'rgba(0,0,0,0.55)', color: '#fff', fontSize: 10, fontWeight: 700, padding: '1px 5px', borderRadius: 4 }}>
          {index}
        </div>
      </div>
      <span className="row-texts" style={{ minWidth: 0 }}>
        <span className="row-title" style={{ display: 'block', color: current ? 'var(--accent)' : undefined }}>
          {isPlaying && current ? '▶ ' : ''}{rec.track.title}
        </span>
        <span className="row-subtitle" style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {formatArtist(rec.track)}
        </span>
        {rec.reasons.length > 0 && (
          <span style={{ display: 'block', fontSize: 11, color: 'var(--accent)', opacity: 0.8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 1 }}>
            {rec.reasons[0]}
          </span>
        )}
      </span>
      <span style={{ display: 'flex', gap: 4, alignItems: 'center', flexShrink: 0, maxWidth: '30vw', overflow: 'hidden' }}>
        {profile.genre1 !== 'unknown' && (
          <span style={{ fontSize: 10, background: 'var(--accent-bg)', color: 'var(--accent)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
            {genreLabel(profile.genre1)}
          </span>
        )}
        {profile.era !== 'unknown' && (
          <span style={{ fontSize: 10, background: 'var(--fill-secondary)', color: 'var(--label-secondary)', padding: '2px 6px', borderRadius: 4, whiteSpace: 'nowrap' }}>
            {profile.era}
          </span>
        )}
      </span>
      <span
        className="icon-btn row-btn-dots"
        onClick={(e) => {
          e.stopPropagation();
          setActionSheet(rec.track.id);
        }}
      >
        <EllipsisIcon size={18} />
      </span>
    </button>
  );
}
