import { useEffect, useMemo, useState } from 'react';
import type { JSX } from 'react';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import type { Album, Artist } from '../types';
import { TrackRow } from './TrackRow';
import { Artwork } from './Artwork';
import { EmptyLibrary, AlbumCard } from './Views';
import { ImportBar } from './ImportBar';
import { ChevronRightIcon, PlusCircleIcon, EllipsisIcon, ShuffleIcon, PlayIcon } from './Icons';

export function PageRouter(): JSX.Element {
  const pageStack = useUI((s) => s.pageStack);
  const page = pageStack[pageStack.length - 1];

  switch (page.type) {
    case 'listen':
      return <ListenNowLazy />;
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
  }
}

// Listen Now lives in Views.tsx (exported as ListenNowView)
import { ListenNowView } from './Views';
function ListenNowLazy(): JSX.Element {
  return <ListenNowView />;
}

const LIB_SECTIONS = [
  { id: 'playlists', label: 'Playlists' },
  { id: 'artists', label: 'Artists' },
  { id: 'albums', label: 'Albums' },
  { id: 'songs', label: 'Songs' },
  { id: 'recent', label: 'Recently Added' }
] as const;

function LibraryView({ section }: { section?: 'playlists' | 'artists' | 'albums' | 'songs' | 'recent' }): JSX.Element {
  const status = useLibrary((s) => s.status);
  const tracks = useLibrary((s) => s.tracks);
  const albums = useLibrary((s) => s.albums);
  const artists = useLibrary((s) => s.artists);
  const navigate = useUI((s) => s.navigate);
  const playTracks = usePlayer((s) => s.playTracks);

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
        <div className="grid-albums">
          {albums.map((a) => (
            <AlbumGridCard key={a.key} album={a} />
          ))}
        </div>
      )}

      {active === 'artists' &&
        artists.map((a) => (
          <ArtistRow key={a.name} artist={a} />
        ))}

      {active === 'recent' && (
        <div className="group">
          {[...tracks]
            .sort((a, b) => b.addedAt - a.addedAt)
            .slice(0, 50)
            .map((t) => (
              <TrackRow key={t.id} track={t} />
            ))}
        </div>
      )}

      {active === 'playlists' && <PlaylistsManager />}
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
  const createPlaylist = useLibrary((s) => s.createPlaylist);
  const navigate = useUI((s) => s.navigate);
  const [name, setName] = useState('');

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
      {playlists.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--label-secondary)', padding: 20 }}>
          No playlists yet. Create one above, then add songs via the ⋯ button on any track.
        </p>
      ) : (
        <div className="group">
          {playlists.map((p) => (
            <button key={p.id} className="row" onClick={() => navigate({ type: 'playlist', id: p.id })}>
              <Artwork className="row-artwork" placeholderSize={20} />
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
      style={{ margin: '0 16px', width: 'auto', background: 'var(--bg-primary)', borderRadius: 8, marginBottom: 2 }}
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
  const genres = useLibrary((s) => s.tracks.reduce<Map<string, number>>((m, t) => {
    const g = t.genre ?? 'Unknown Genre';
    m.set(g, (m.get(g) ?? 0) + 1);
    return m;
  }, new Map()));

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
        <div className="chips">
          {[...genres.entries()]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 12)
            .map(([g]) => (
              <span key={g} className="chip" style={{ cursor: 'default' }}>
                {g}
              </span>
            ))}
        </div>
      )}
      <div className="grid-albums">
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

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return tracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist.toLowerCase().includes(q) ||
        t.album.toLowerCase().includes(q) ||
        (t.genre ?? '').toLowerCase().includes(q)
    );
  }, [query, tracks]);

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

      {!query.trim() ? (
        <div>
          <h2 className="section-header">Your Top Plays</h2>
          <TopPlaysInline />
        </div>
      ) : results.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--label-secondary)', padding: 30 }}>No results for “{query}”</p>
      ) : (
        <div className="group">
          {results.slice(0, 60).map((t) => (
            <TrackRow key={t.id} track={t} />
          ))}
        </div>
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
  children
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  artwork?: string;
  children?: React.ReactNode;
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
      </div>
      <div className="detail-actions">{children}</div>
    </>
  );
}

function AlbumDetailView({ albumKey }: { albumKey: string }): JSX.Element | null {
  const album = useLibrary((s) => s.albums.find((a) => a.key === albumKey));
  const byId = useLibrary((s) => s.byId);
  const playTracks = usePlayer((s) => s.playTracks);
  const toggleShuffle = usePlayer((s) => s.toggleShuffle);
  const shuffle = usePlayer((s) => s.shuffle);

  if (!album) return null;
  const tracks = album.trackIds.map((id) => byId[id]).filter(Boolean);

  return (
    <div className="fade-page">
      <DetailHeader kicker="Album" title={album.title} subtitle={`${album.artist}${album.year ? ` · ${album.year}` : ''}`} artwork={album.artwork}>
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
      </DetailHeader>
      <div className="group">
        {tracks.map((t, i) => (
          <TrackRow key={t.id} track={t} showIndex={i + 1} showArtwork={false} />
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
  const playlist = useLibrary((s) => s.playlists.find((p) => p.id === playlistId));
  const byId = useLibrary((s) => s.byId);
  const deletePlaylist = useLibrary((s) => s.deletePlaylist);
  const removeFromPlaylist = useLibrary((s) => s.removeFromPlaylist);
  const goBack = useUI((s) => s.goBack);
  const playTracks = usePlayer((s) => s.playTracks);

  if (!playlist) return null;
  const tracks = playlist.trackIds.map((id) => byId[id]).filter(Boolean);

  return (
    <div className="fade-page">
      <DetailHeader kicker="Playlist" title={playlist.name} subtitle={`${tracks.length} songs`} artwork={tracks[0]?.artwork}>
        <button className="pill-btn primary" disabled={tracks.length === 0} style={tracks.length === 0 ? { opacity: 0.5 } : undefined} onClick={() => playTracks(tracks, 0, playlist.name)}>
          <PlayIcon size={15} /> Play
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

      {tracks.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--label-secondary)', padding: 30 }}>
          Empty playlist. Add songs using the ⋯ button on any track.
        </p>
      ) : (
        <div className="group">
          {tracks.map((t) => (
            <div key={t.id} className="rowwrap">
              <TrackRow track={t} />
              <button
                className="icon-btn"
                style={{ paddingRight: 14, color: 'var(--label-secondary)' }}
                onClick={() => removeFromPlaylist(playlist.id, t.id)}
                aria-label="Remove from playlist"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
