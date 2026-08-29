import type { JSX } from 'react';
import { useState, useEffect, useCallback } from 'react';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import { Artwork } from './Artwork';
import { ImportBar } from './ImportBar';
import { PostImportSheet } from './PostImportSheet';
import { FolderIcon, SpinnerIcon, ChevronRightIcon, MagnifyingGlassIcon, GearIcon } from './Icons';
import type { Album, Track } from '../types';
import { formatArtist } from '../types';
import { getSmartRecommendations, getRecommendations, type Recommendation } from '../lib/recommender';
import {
  HeartFillIcon,
  RadioIcon,
  MusicMixIcon,
  WaveformIcon,
  MoodIcon,
  StarIcon,
  SparklesIcon,
  PlayIcon,
  ShuffleIcon,
} from './Icons';

export function ListenNowView(): JSX.Element {
  const status = useLibrary((s) => s.status);
  const scanning = useLibrary((s) => s.scanning);
  const scanProgress = useLibrary((s) => s.scanProgress);

  if (status === 'loading') {
    return (
      <div className="empty-state">
        <SpinnerIcon size={32} />
        <p>Loading your library…</p>
      </div>
    );
  }

  if (status === 'empty' || status === 'needs-permission') {
    return (
      <>
        <h1 className="large-title">Listen Now</h1>
        <EmptyLibrary />
      </>
    );
  }

  return (
    <div className="fade-page">
      <HeroSection />
      <MadeForYouSection />
      <EnhancedRecentlyPlayedSection />
      <TopPicksSection />
      <StationsSection />
      <MoodGenreChips />
      <EnhancedJumpBackInSection />
      <EnhancedRecentlyAddedSection />

      {scanning && scanProgress && (
        <p className="scan-progress" style={{ padding: '0 16px 16px' }}>
          Importing music… {scanProgress.found > 0 ? `${scanProgress.scanned}/${scanProgress.found}` : 'scanning folder'}
        </p>
      )}
    </div>
  );
}

export function EmptyLibrary(): JSX.Element {
  const status = useLibrary((s) => s.status);
  const scanning = useLibrary((s) => s.scanning);
  const scanProgress = useLibrary((s) => s.scanProgress);
  const connectFolder = useLibrary((s) => s.connectFolder);
  const addFiles = useLibrary((s) => s.addFiles);
  const [postImportIds, setPostImportIds] = useState<string[] | null>(null);

  const pickFilesAndTag = (): void => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.accept = 'audio/*,.mp3,.m4a,.flac,.wav,.ogg,.opus';
    input.onchange = () => {
      if (input.files) {
        void addFiles(Array.from(input.files)).then((ids) => {
          if (ids.length > 0) setPostImportIds(ids);
        });
      }
    };
    input.click();
  };

  if (scanning) {
    return (
      <div className="empty-state">
        <SpinnerIcon size={36} />
        <h2>Importing your music…</h2>
        <p>Keep this page open while your library is scanned.</p>
        {scanProgress && scanProgress.found > 0 && (
          <p style={{ marginTop: 10, fontSize: 14, color: 'var(--label)' }}>
            {scanProgress.scanned}/{scanProgress.found}
            {scanProgress.label ? ` — ${scanProgress.label}` : ''}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="empty-state">
      <span
        className="art-placeholder"
        style={{ width: 84, height: 84, borderRadius: 22 }}
      >
        <FolderIcon size={40} />
      </span>
      <h2>Your music library is empty</h2>
      <p>
        Connect the Music folder on your phone or computer once — it stays connected across sessions. You can also pick
        individual songs or folders manually.
      </p>
      {status === 'needs-permission' ? (
        <>
          <button className="cta-btn" onClick={() => void useLibrary.getState().reconnectFolder()}>
            Reconnect Folder
          </button>
          <button className="cta-btn secondary" onClick={pickFilesAndTag}>
            Choose Files Instead
          </button>
        </>
      ) : (
        <>
          <button className="cta-btn" onClick={() => void connectFolder()}>
            Connect Music Folder
          </button>
          <button className="cta-btn secondary" onClick={pickFilesAndTag}>
            Choose Files Instead
          </button>
        </>
      )}
      <ImportBar />
      {postImportIds && (
        <PostImportSheet trackIds={postImportIds} onClose={() => setPostImportIds(null)} />
      )}
    </div>
  );
}



export function AlbumCard({ album, size = 150 }: { album: Album; size?: number }): JSX.Element | null {
  const navigate = useUI((s) => s.navigate);
  return (
    <button className="card" style={{ width: size, background: 'none' }} onClick={() => navigate({ type: 'album', key: album.key })}>
      <Artwork src={album.artwork} className="card-artwork" placeholderSize={30} alt={album.title} style={{ width: size, height: size } as React.CSSProperties} />
      <div className="card-title">{album.title}</div>
      <div className="card-subtitle">{album.artist}</div>
    </button>
  );
}

export function SectionRow({ title, onSeeAll }: { title: string; onSeeAll: () => void }): JSX.Element {
  return (
    <button
      className="section-header"
      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: 'calc(100% - 32px)', margin: '18px 16px 0' }}
      onClick={onSeeAll}
    >
      {title}
      <ChevronRightIcon size={18} />
    </button>
  );
}

/* ============================================================
   Listen Now — Apple Music inspired components
   ============================================================ */

// Time-based greeting
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'Late night';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  if (hour < 22) return 'Good evening';
  return 'Late night';
}

// Hero / Greeting Section
export function HeroSection(): JSX.Element {
  const playTracks = usePlayer((s) => s.playTracks);
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed);
  const tracks = useLibrary((s) => s.tracks);
  const navigate = useUI((s) => s.navigate);

  const greeting = getGreeting();
  const topTrack = recentlyPlayed[0]?.track ?? tracks[0];

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.5, marginBottom: 4 }}>
            {greeting}
          </h2>
          <p style={{ fontSize: 15, color: 'var(--label-secondary)' }}>
            What would you like to hear?
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="icon-btn" style={{ width: 40, height: 40 }} aria-label="Search" onClick={() => navigate({ type: 'search' })}>
            <MagnifyingGlassIcon size={20} />
          </button>
          <button className="icon-btn" style={{ width: 40, height: 40 }} aria-label="Settings" onClick={() => navigate({ type: 'settings' })}>
            <GearIcon size={20} />
          </button>
        </div>
      </div>

      {topTrack && (
        <button
          className="hero-mix-card"
          onClick={() => {
            playTracks([topTrack], 0);
            useUI.getState().openNowPlaying();
          }}
          style={{
            position: 'relative',
            borderRadius: 20,
            overflow: 'hidden',
            background: 'linear-gradient(135deg, var(--accent-gradient), rgba(var(--aurora-accent), 0.6))',
            padding: 20,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            minHeight: 180,
          }}
        >
          <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
            <Artwork
              src={topTrack.artwork}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                opacity: 0.25,
                filter: 'blur(20px)',
              }}
              placeholderSize={80}
              alt=""
            />
          </div>
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="hero-mix-badge">
                <SparklesIcon size={14} /> Made For You
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                Your Favorites Mix
              </span>
            </div>
            <h3 style={{ fontSize: 22, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: -0.3 }}>
              {topTrack.title}
            </h3>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', margin: 0 }}>
              {topTrack.artist} · Updated today · {topTrack.album || 'Mixed'}
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
              <button
                className="pill-btn primary"
                style={{ padding: '10px 20px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}
                onClick={(e) => {
                  e.stopPropagation();
                  playTracks([topTrack], 0);
                  useUI.getState().openNowPlaying();
                }}
              >
                <PlayIcon size={18} /> Play
              </button>
              <button
                className="pill-btn"
                style={{ padding: '10px 20px', fontSize: 15, display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(255,255,255,0.2)', color: '#fff' }}
                onClick={(e) => {
                  e.stopPropagation();
                  playTracks([topTrack], Math.floor(Math.random() * 10), 'Shuffle');
                  useUI.getState().openNowPlaying();
                }}
              >
                <ShuffleIcon size={16} /> Shuffle
              </button>
            </div>
          </div>
        </button>
      )}
    </div>
  );
}

// Smart Mix Card for Made For You section
interface MixCardProps {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  gradient: string;
  tracks: Track[];
  onPlay: () => void;
  onShuffle: () => void;
}

function MixCard({ title, subtitle, icon, gradient, tracks, onPlay, onShuffle }: MixCardProps): JSX.Element | null {
  if (tracks.length === 0) return null;

  const primaryTrack = tracks[0];
  const cardWidth = Math.min(180, Math.max(150, (window.innerWidth - 48) / 2 - 8));

  return (
    <button
      className="mix-card"
      onClick={onPlay}
      style={{
        position: 'relative',
        borderRadius: 16,
        overflow: 'hidden',
        background: gradient,
        padding: 16,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        minHeight: 160,
        width: cardWidth,
        flexShrink: 0,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.15 }}>
        {primaryTrack?.artwork && (
          <Artwork
            src={primaryTrack.artwork}
            style={{ width: '100%', height: '100%', objectFit: 'cover', filter: 'blur(16px)' }}
            placeholderSize={80}
            alt=""
          />
        )}
      </div>
      <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              Made For You
            </span>
          </div>
          <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 24 }}>
            {icon}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h4 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>{title}</h4>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0 }}>{subtitle}</p>
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
          <button
            className="pill-btn primary"
            style={{ padding: '8px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center' }}
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
          >
            <PlayIcon size={14} /> Play
          </button>
          <button
            className="pill-btn"
            style={{ padding: '8px 16px', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flex: 1, justifyContent: 'center', background: 'rgba(255,255,255,0.2)', color: '#fff' }}
            onClick={(e) => { e.stopPropagation(); onShuffle(); }}
          >
            <ShuffleIcon size={14} /> Shuffle
          </button>
        </div>
      </div>
      <div style={{ position: 'absolute', bottom: 12, right: 12, zIndex: 1, opacity: 0.3 }}>
        {primaryTrack?.artwork && (
          <Artwork src={primaryTrack.artwork} className="row-artwork" placeholderSize={18} alt="" style={{ width: 48, height: 48, borderRadius: 8 }} />
        )}
      </div>
    </button>
  );
}

// Made For You Section
export function MadeForYouSection(): JSX.Element | null {
  const tracks = useLibrary((s) => s.tracks);
  const playCounts = usePlayer((s) => s.playCounts);
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed);
  const playlists = useLibrary((s) => s.playlists);
  const favourites = useLibrary((s) => s.tracks.filter((t) => !!t.favouritedAt));
  const playTracks = usePlayer((s) => s.playTracks);

  const [recs, setRecs] = useState<Recommendation[]>([]);

  const refresh = useCallback(async () => {
    const recentTracks = recentlyPlayed.map((e) => e.track);
    try {
      const results = await getSmartRecommendations(
        tracks, playCounts, recentTracks, playlists, new Set(favourites.map(t => t.id)), 10
      );
      setRecs(results);
    } catch {
      const results = getRecommendations(tracks, playCounts, recentTracks, playlists, new Set(favourites.map(t => t.id)), 10, Date.now());
      setRecs(results);
    }
  }, [tracks, playCounts, recentlyPlayed, playlists, favourites]);

  useEffect(() => {
    if (tracks.length > 0 && recs.length === 0) {
      refresh();
    }
  }, [tracks.length, refresh]);

  if (tracks.length === 0) return null;

  const smartMixes = [
    { title: 'Favorites Mix', subtitle: 'Your top songs, updated weekly', icon: <HeartFillIcon size={28} />, gradient: 'linear-gradient(135deg, #fa233b, #fb5c74)', tracks: recs.map(r => r.track).slice(0, 25) },
    { title: 'Chill Mix', subtitle: 'Relax and unwind', icon: <MoodIcon size={28} />, gradient: 'linear-gradient(135deg, #30d158, #63e284)', tracks: tracks.filter(t => (t.genre1 ?? '').toLowerCase().includes('chill') || (t.genre2 ?? '').toLowerCase().includes('chill') || (t.genre1 ?? '').toLowerCase().includes('ambient')).slice(0, 25) },
    { title: 'New Music Mix', subtitle: 'Fresh tracks from your library', icon: <SparklesIcon size={28} />, gradient: 'linear-gradient(135deg, #0a84ff, #409cff)', tracks: [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 25) },
    { title: 'Discovery Mix', subtitle: 'Songs you might like', icon: <StarIcon size={28} />, gradient: 'linear-gradient(135deg, #ff9f0a, #ffb84d)', tracks: recs.filter(r => (playCounts[r.track.id] ?? 0) < 3).map(r => r.track).slice(0, 25) },
  ];

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <h2 className="section-header">Made For You</h2>
      <div className="hscroll" style={{ gap: 14 }}>
        {smartMixes.map((mix, _i) => (
          <MixCard
            key={mix.title}
            title={mix.title}
            subtitle={mix.subtitle}
            icon={mix.icon}
            gradient={mix.gradient}
            tracks={mix.tracks}
            onPlay={() => playTracks(mix.tracks, 0, mix.title)}
            onShuffle={() => playTracks(mix.tracks, Math.floor(Math.random() * mix.tracks.length), mix.title + ' — Shuffle')}
          />
        ))}
      </div>
    </div>
  );
}

// Enhanced Recently Played Card
interface EnhancedRecentCardProps {
  track: Track;
  playedAt: number;
}

function EnhancedRecentCard({ track, playedAt }: EnhancedRecentCardProps): JSX.Element | null {
  if (!track) return null;

  const playTracks = usePlayer((s) => s.playTracks);
  const openNowPlaying = useUI((s) => s.openNowPlaying);

  const timeAgo = formatTimeAgo(playedAt);
  const cardWidth = Math.min(180, Math.max(150, (window.innerWidth - 48) / 2 - 8));

  return (
    <button
      className="enhanced-recent-card"
      onClick={() => {
        playTracks([track], 0);
        openNowPlaying();
      }}
      style={{ width: cardWidth, background: 'none', flexShrink: 0 }}
    >
      <Artwork src={track.artwork} className="enhanced-card-artwork" placeholderSize={30} alt="" style={{ width: cardWidth, height: cardWidth } as React.CSSProperties} />
      <div className="card-title" style={{ marginTop: 10 }}>{track.title}</div>
      <div className="card-subtitle">{formatArtist(track)}</div>
      <div className="card-timestamp">{timeAgo}</div>
    </button>
  );
}

function formatTimeAgo(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

// Enhanced Recently Played Section
export function EnhancedRecentlyPlayedSection(): JSX.Element | null {
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed);

  if (recentlyPlayed.length === 0) return null;

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <SectionRow
        title="Recently Played"
        onSeeAll={() => useUI.getState().navigate({ type: 'library', section: 'recent' })}
      />
      <div className="hscroll" style={{ gap: 14 }}>
        {recentlyPlayed.slice(0, 20).map(({ track, playedAt }, _i) => (
          <EnhancedRecentCard key={track.id} track={track} playedAt={playedAt} />
        ))}
      </div>
    </div>
  );
}

// Top Picks Section
export function TopPicksSection(): JSX.Element | null {
  const tracks = useLibrary((s) => s.tracks);
  const playCounts = usePlayer((s) => s.playCounts);
  const playTracks = usePlayer((s) => s.playTracks);

  if (tracks.length === 0) return null;

  // Get top artists from play counts
  const artistCounts = new Map<string, number>();
  tracks.forEach((t) => {
    const count = playCounts[t.id] ?? 0;
    if (count > 0) {
      artistCounts.set(t.artist, (artistCounts.get(t.artist) ?? 0) + count);
    }
  });

  const topArtists = [...artistCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([artist]) => artist);

  if (topArtists.length === 0) return null;

  const cardWidth = Math.min(180, Math.max(150, (window.innerWidth - 48) / 2 - 8));

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <h2 className="section-header">Top Picks for You</h2>
      <p style={{ padding: '0 16px 12px', fontSize: 13, color: 'var(--label-secondary)' }}>
        Based on what you've been listening to
      </p>
      <div className="hscroll" style={{ gap: 14 }}>
        {topArtists.map((artist, _i) => {
          const artistTracks = tracks.filter((t) => t.artist === artist).slice(0, 5);
          if (artistTracks.length === 0) return null;
return (
    <button
      key={artist}
      className="top-pick-card"
      style={{ width: cardWidth, background: 'none', flexShrink: 0 }}
      onClick={() => playTracks(artistTracks, 0, artist)}
    >
      <Artwork src={artistTracks[0]?.artwork} className="top-pick-artwork" placeholderSize={30} alt="" style={{ width: cardWidth, height: cardWidth } as React.CSSProperties} />
      <div className="card-title" style={{ marginTop: 10 }}>{artist}</div>
      <div className="card-subtitle">Artist · {artistTracks.length} songs</div>
      <div className="top-pick-badge">
        <StarIcon size={14} /> Top Pick
      </div>
    </button>
  );
        })}
      </div>
    </div>
  );
}

// Stations Section
export function StationsSection(): JSX.Element | null {
  const tracks = useLibrary((s) => s.tracks);
  const playTracks = usePlayer((s) => s.playTracks);

  if (tracks.length === 0) return null;

  // Your Station - endless personalized
  const yourStationTracks = [...tracks].sort(() => Math.random() - 0.5).slice(0, 50);

  // Genre stations
  const genreStations = [
    { name: 'Bollywood Radio', icon: <MusicMixIcon size={28} />, gradient: 'linear-gradient(135deg, #fa233b, #fb5c74)' },
    { name: 'Rock Radio', icon: <WaveformIcon size={28} />, gradient: 'linear-gradient(135deg, #0a84ff, #409cff)' },
    { name: 'Chill Radio', icon: <MoodIcon size={28} />, gradient: 'linear-gradient(135deg, #30d158, #63e284)' },
    { name: 'Party Radio', icon: <SparklesIcon size={28} />, gradient: 'linear-gradient(135deg, #ff9f0a, #ffb84d)' },
  ];

  const cardWidth = Math.min(180, Math.max(150, (window.innerWidth - 48) / 2 - 8));

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <h2 className="section-header">Stations for You</h2>
      <div className="hscroll" style={{ gap: 14 }}>
        <button
          className="station-card"
          style={{ width: cardWidth, background: 'linear-gradient(135deg, #fa233b, #fb5c74)', borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 160, overflow: 'hidden', position: 'relative', flexShrink: 0 }}
          onClick={() => playTracks(yourStationTracks, 0, 'Your Station')}
        >
          <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.15, background: 'linear-gradient(135deg, #fa233b, #fb5c74)' }} />
          <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Your Station</span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}><RadioIcon size={28} /></span>
            </div>
            <h4 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>Your Station</h4>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Endless mix of your favorites</p>
            <button className="pill-btn primary" style={{ alignSelf: 'flex-start', padding: '8px 16px', fontSize: 13 }} onClick={(e) => { e.stopPropagation(); playTracks(yourStationTracks, 0, 'Your Station'); }}>
              <PlayIcon size={14} /> Play
            </button>
          </div>
        </button>
        {genreStations.map((station) => (
          <button
            key={station.name}
            className="station-card"
            style={{ width: cardWidth, background: station.gradient, borderRadius: 16, padding: 16, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 160, overflow: 'hidden', position: 'relative', flexShrink: 0 }}
            onClick={() => {
              const genreTracks = tracks.filter((t) => t.genre1?.toLowerCase().includes(station.name.toLowerCase().split(' ')[0]) || t.genre2?.toLowerCase().includes(station.name.toLowerCase().split(' ')[0])).slice(0, 50);
              if (genreTracks.length === 0) {
                playTracks(tracks.slice(0, 50), 0, station.name);
              } else {
                playTracks(genreTracks, 0, station.name);
              }
            }}
          >
            <div style={{ position: 'absolute', inset: 0, zIndex: 0, opacity: 0.15, background: station.gradient }} />
            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', textTransform: 'uppercase', letterSpacing: 0.5 }}>Station</span>
                {station.icon}
              </div>
              <h4 style={{ fontSize: 16, fontWeight: 700, color: '#fff', margin: 0 }}>{station.name}</h4>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0 }}>Non-stop music</p>
              <button className="pill-btn primary" style={{ alignSelf: 'flex-start', padding: '8px 16px', fontSize: 13 }} onClick={(e) => {
                e.stopPropagation();
                const genreTracks = tracks.filter((t) => t.genre1?.toLowerCase().includes(station.name.toLowerCase().split(' ')[0]) || t.genre2?.toLowerCase().includes(station.name.toLowerCase().split(' ')[0])).slice(0, 50);
                if (genreTracks.length === 0) {
                  playTracks(tracks.slice(0, 50), 0, station.name);
                } else {
                  playTracks(genreTracks, 0, station.name);
                }
              }}>
                <PlayIcon size={14} /> Play
              </button>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// Mood / Genre Chips
export function MoodGenreChips(): JSX.Element | null {
  const tracks = useLibrary((s) => s.tracks);
  const playTracks = usePlayer((s) => s.playTracks);

  if (tracks.length === 0) return null;

  const moods = [
    { name: 'Chill', icon: <MoodIcon size={16} />, gradient: 'linear-gradient(135deg, #30d158, #63e284)' },
    { name: 'Focus', icon: <StarIcon size={16} />, gradient: 'linear-gradient(135deg, #0a84ff, #409cff)' },
    { name: 'Workout', icon: <WaveformIcon size={16} />, gradient: 'linear-gradient(135deg, #ff9f0a, #ffb84d)' },
    { name: 'Party', icon: <SparklesIcon size={16} />, gradient: 'linear-gradient(135deg, #fa233b, #fb5c74)' },
    { name: 'Commute', icon: <RadioIcon size={16} />, gradient: 'linear-gradient(135deg, #bf5af2, #d18cf5)' },
    { name: 'Sleep', icon: <MoodIcon size={16} />, gradient: 'linear-gradient(135deg, #5856d6, #7a77e8)' },
  ];

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <h2 className="section-header">By Mood</h2>
      <div className="hscroll" style={{ gap: 10 }}>
        {moods.map((mood) => (
          <button
            key={mood.name}
            className="mood-chip"
            style={{
              padding: '14px 22px',
              background: mood.gradient,
              borderRadius: '999px',
              fontSize: 15,
              fontWeight: 600,
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: '0 4px 16px rgba(0,0,0,0.15)',
              border: 'none',
              whiteSpace: 'nowrap',
            }}
            onClick={() => {
              const moodTracks = tracks.filter((t) => {
                const genre = (t.genre1 ?? t.genre2 ?? '').toLowerCase();
                return genre.includes(mood.name.toLowerCase()) || genre === '';
              }).slice(0, 50);
              if (moodTracks.length > 0) {
                playTracks(moodTracks, 0, mood.name);
              } else {
                playTracks(tracks.slice(0, 50), 0, mood.name);
              }
            }}
          >
            {mood.icon}
            {mood.name}
          </button>
        ))}
      </div>
    </div>
  );
}

// Jump Back In - Enhanced with Playlists and Artists
export function EnhancedJumpBackInSection(): JSX.Element | null {
  const albums = useLibrary((s) => s.albums);
  const playlists = useLibrary((s) => s.playlists);
  const artists = useLibrary((s) => s.artists);

  if (albums.length === 0 && playlists.length === 0 && artists.length === 0) return null;

  const cardWidth = Math.min(180, Math.max(150, (window.innerWidth - 48) / 2 - 8));

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <SectionRow
        title="Jump Back In"
        onSeeAll={() => useUI.getState().navigate({ type: 'library', section: 'albums' })}
      />
      <div className="hscroll" style={{ gap: 14 }}>
        {albums.slice(0, 12).map((a) => (
          <EnhancedAlbumCard key={a.key} album={a} size={cardWidth} type="album" />
        ))}
        {playlists.slice(0, 6).map((p) => (
          <EnhancedAlbumCard key={p.id} album={{ ...p, key: p.id, title: p.name, artist: '', artwork: p.trackIds[0] ? undefined : undefined }} size={cardWidth} type="playlist" trackIds={p.trackIds} />
        ))}
        {artists.slice(0, 6).map((a) => (
          <EnhancedAlbumCard key={a.name} album={{ key: a.name, title: a.name, artist: '', artwork: a.artwork }} size={cardWidth} type="artist" />
        ))}
      </div>
    </div>
  );
}

interface EnhancedAlbumCardProps {
  album: { key: string; title: string; artist?: string; artwork?: string; trackIds?: string[] };
  size?: number;
  type: 'album' | 'playlist' | 'artist';
  trackIds?: string[];
}

function EnhancedAlbumCard({ album, size = 180, type, trackIds }: EnhancedAlbumCardProps): JSX.Element {
  const navigate = useUI((s) => s.navigate);
  const playTracks = usePlayer((s) => s.playTracks);
  const tracks = useLibrary((s) => s.tracks);

  const handlePlay = () => {
    if (type === 'album' && trackIds) {
      const albumTracks = trackIds.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as Track[];
      if (albumTracks.length > 0) playTracks(albumTracks, 0, album.title);
    } else if (type === 'playlist' && trackIds) {
      const playlistTracks = trackIds.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as Track[];
      if (playlistTracks.length > 0) playTracks(playlistTracks, 0, album.title);
    } else {
      navigate({ type: type === 'artist' ? 'artist' : 'album', key: album.key, name: album.title });
    }
  };

  return (
    <button className="enhanced-album-card" style={{ width: size, background: 'none' }} onClick={() => handlePlay()}>
      <Artwork src={album.artwork} className="enhanced-album-art" placeholderSize={30} alt={album.title} style={{ width: size, height: size, borderRadius: 12 } as React.CSSProperties} />
      <div className="card-title" style={{ marginTop: 10 }}>{album.title}</div>
      <div className="card-subtitle">
        {type === 'album' ? 'Album' : type === 'playlist' ? 'Playlist' : 'Artist'}
        {album.artist && ` · ${album.artist}`}
      </div>
      <button
        className="play-overlay-btn"
        onClick={(e) => { e.stopPropagation(); handlePlay(); }}
style={{
              position: 'absolute',
              bottom: 8,
              right: 8,
              width: 40,
              height: 40,
              borderRadius: '50%',
              background: 'var(--accent-gradient)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 16px rgba(250, 35, 59, 0.4)',
              opacity: 0,
              transform: 'translateY(8px)',
              transition: 'opacity 0.2s ease, transform 0.2s ease',
            }}
      >
        <PlayIcon size={18} />
      </button>
    </button>
  );
}

// Recently Added Enhanced
export function EnhancedRecentlyAddedSection(): JSX.Element | null {
  const recentlyAdded = useLibrary((s) => s.tracks.slice().sort((a, b) => b.addedAt - a.addedAt).slice(0, 20));

  if (recentlyAdded.length === 0) return null;

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <SectionRow
        title="Recently Added"
        onSeeAll={() => useUI.getState().navigate({ type: 'library', section: 'recent' })}
      />
      <div className="hscroll" style={{ gap: 14 }}>
        {recentlyAdded.map((t) => (
          <EnhancedRecentCard key={t.id} track={t} playedAt={t.addedAt} />
        ))}
      </div>
    </div>
  );
}
