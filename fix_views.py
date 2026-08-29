import re

with open('C:/Users/user/Desktop/opencode/apple-music-clone/src/components/Views.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Update imports
old_imports = """import type { JSX } from 'react';
import { useState } from 'react';
import { useLibrary } from '../store/library';
import { usePlayer } from '../store/player';
import { useUI } from '../store/ui';
import { Artwork } from './Artwork';
import { ImportBar } from './ImportBar';
import { PostImportSheet } from './PostImportSheet';
import { FolderIcon, SpinnerIcon, ChevronRightIcon, MagnifyingGlassIcon, GearIcon } from './Icons';
import type { Album, Track } from '../types';
import { formatArtist } from '../types';
import {
  HeartFillIcon,
  RadioIcon,
  ClockIcon,
  MusicMixIcon,
  WaveformIcon,
  MoodIcon,
  StarIcon,
  SparklesIcon,
  PlayIcon,
  ShuffleIcon,
  PlusCircleIcon,
} from './Icons';"""

new_imports = """import type { JSX } from 'react';
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
} from './Icons';"""

content = content.replace(old_imports, new_imports)

# Replace MadeForYouSection
old_made_for_you = """// Made For You Section
export function MadeForYouSection(): JSX.Element | null {
  const tracks = useLibrary((s) => s.tracks);
  const playCounts = usePlayer((s) => s.playCounts);
  const playTracks = usePlayer((s) => s.playTracks);

  if (tracks.length === 0) return null;

  // Favorites Mix - top played
  const favIds = [...Object.entries(playCounts)]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([id]) => id);
  const favoritesMix = favIds.map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as Track[];

  // Chill Mix - low energy (placeholder - use recently played low energy)
  const chillMix = tracks.slice(0, 25);

  // New Music Mix - recently added
  const newMusicMix = [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 25);

  // Replay Mix - top of year
  const replayMix = favIds.slice(0, 25).map((id) => tracks.find((t) => t.id === id)).filter(Boolean) as Track[];

  // Discovery Mix - less played tracks
  const discoveryMix = tracks
    .filter((t) => (playCounts[t.id] ?? 0) < 3)
    .slice(0, 25);

  const mixes = [
    { title: 'Favorites Mix', subtitle: 'Your top songs, updated weekly', icon: <HeartFillIcon size={28} />, gradient: 'linear-gradient(135deg, #fa233b, #fb5c74)', tracks: favoritesMix },
    { title: 'Chill Mix', subtitle: 'Relax and unwind', icon: <MoodIcon size={28} />, gradient: 'linear-gradient(135deg, #30d158, #63e284)', tracks: chillMix },
    { title: 'New Music Mix', subtitle: 'Fresh tracks from your library', icon: <SparklesIcon size={28} />, gradient: 'linear-gradient(135deg, #0a84ff, #409cff)', tracks: newMusicMix },
    { title: 'Replay Mix', subtitle: 'Your top songs this year', icon: <ClockIcon size={28} />, gradient: 'linear-gradient(135deg, #bf5af2, #d18cf5)', tracks: replayMix },
    { title: 'Discovery Mix', subtitle: 'Songs you might like', icon: <StarIcon size={28} />, gradient: 'linear-gradient(135deg, #ff9f0a, #ffb84d)', tracks: discoveryMix },
  ];

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <h2 className="section-header">Made For You</h2>
      <div className="hscroll" style={{ gap: 14 }}>
        {mixes.map((mix, _i) => (
          <MixCard
            key={mix.title}
            title={mix.title}
            subtitle={mix.subtitle}
            icon={mix.icon}
            gradient={mix.gradient}
            tracks={mix.tracks}
            onPlay={() => playTracks(mix.tracks, 0, mix.title)}
            onShuffle={() => playTracks(mix.tracks, Math.floor(Math.random() * mix.tracks.length), mix.title + ' \u2014 Shuffle')}
          />
        ))}
      </div>
    </div>
  );
}"""

new_made_for_you = """// Made For You Section
export function MadeForYouSection(): JSX.Element | null {
  const tracks = useLibrary((s) => s.tracks);
  const playCounts = usePlayer((s) => s.playCounts);
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed);
  const playlists = useLibrary((s) => s.playlists);
  const favourites = useLibrary((s) => s.tracks.filter((t) => !!t.favouritedAt));
  const playTracks = usePlayer((s) => s.playTracks);

  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);
  const [embeddingProgress, setEmbeddingProgress] = useState<{ done: number; total: number } | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setEmbeddingProgress(null);
    try {
      const favIds = new Set(favourites.map((t) => t.id));
      const recentTracks = recentlyPlayed.map((e) => e.track);
      const results = await getSmartRecommendations(
        tracks, playCounts, recentlyPlayed, playlists, new Set(favourites.map(t => t.id)), 10,
        (done, total) => setEmbeddingProgress({ done, total })
      );
      setRecs(results);
    } catch {
      // Fallback to sync recommendations
      const favIds = new Set(favourites.map((t) => t.id));
      const recentTracks = recentlyPlayed.map((e) => e.track);
      const results = getRecommendations(tracks, playCounts, recentlyPlayed.map(e => e.track), playlists, new Set(favourites.map(t => t.id)), 10, Date.now());
      setRecs(results);
    } finally {
      setLoading(false);
      setEmbeddingProgress(null);
    }
  }, [tracks, playCounts, recentlyPlayed, playlists, favourites]);

  useEffect(() => {
    if (tracks.length > 0 && recs.length === 0) {
      refresh();
    }
  }, [tracks.length, refresh]);

  if (tracks.length === 0) return null;

  const smartMixes = [
    { title: 'Favorites Mix', subtitle: 'Your top songs, updated weekly', icon: '<HeartFillIcon size={28} />', gradient: 'linear-gradient(135deg, #fa233b, #fb5c74)', tracks: recs.map(r => r.track).slice(0, 25) },
    { title: 'Chill Mix', subtitle: 'Relax and unwind', icon: '<MoodIcon size={28} />', gradient: 'linear-gradient(135deg, #30d158, #63e284)', tracks: tracks.filter(t => (t.genre1 ?? '').toLowerCase().includes('chill') || (t.genre2 ?? '').toLowerCase().includes('chill') || (t.genre1 ?? '').toLowerCase().includes('ambient')).slice(0, 25) },
    { title: 'New Music Mix', subtitle: 'Fresh tracks from your library', icon: '<SparklesIcon size={28} />', gradient: 'linear-gradient(135deg, #0a84ff, #409cff)', tracks: [...tracks].sort((a, b) => b.addedAt - a.addedAt).slice(0, 25) },
    { title: 'Discovery Mix', subtitle: 'Songs you might like', icon: '<StarIcon size={28} />', gradient: 'linear-gradient(135deg, #ff9f0a, #ffb84d)', tracks: recs.filter(r => (playCounts[r.track.id] ?? 0) < 3).map(r => r.track).slice(0, 25) },
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
            onShuffle={() => playTracks(mix.tracks, Math.floor(Math.random() * mix.tracks.length), mix.title + ' \u2014 Shuffle')}
          />
        ))}
      </div>
    </div>
  );
}"""

content = content.replace(old_made_for_you, new_made_for_you)

# Replace TopPicksSection
old_top_picks = """// Top Picks Section
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
              <div className="card-subtitle">Artist \u00b7 {artistTracks.length} songs</div>
              <div className="top-pick-badge">
                <StarIcon size={14} /> Top Pick
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}"""

new_top_picks = """// Top Picks Section
export function TopPicksSection(): JSX.Element {
  const tracks = useLibrary((s) => s.tracks);
  const playCounts = usePlayer((s) => s.playCounts);
  const recentlyPlayed = usePlayer((s) => s.recentlyPlayed);
  const playlists = useLibrary((s) => s.playlists);
  const favourites = useLibrary((s) => s.tracks.filter((t) => !!t.favouritedAt));
  const playTracks = usePlayer((s) => s.playTracks);

  const [recs, setRecs] = useState<Recommendation[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const favIds = new Set(favourites.map((t) => t.id));
      const recentTracks = recentlyPlayed.map((e) => e.track);
      const results = await getSmartRecommendations(
        tracks, playCounts, recentlyPlayed, playlists, new Set(favourites.map(t => t.id)), 10
      );
      setRecs(results);
    } catch {
      const favIds = new Set(favourites.map((t) => t.id));
      const recentTracks = recentlyPlayed.map((e) => e.track);
      const results = getRecommendations(tracks, playCounts, recentlyPlayed.map(e => e.track), playlists, favIds, 10, Date.now());
      setRecs(results);
    } finally {
      setLoading(false);
    }
  }, [tracks, playCounts, recentlyPlayed, playlists]);

  useEffect(() => {
    if (tracks.length > 0 && recs.length === 0) {
      refresh();
    }
  }, [tracks.length, refresh]);

  if (tracks.length === 0) return null;

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px' }}>
        <h2 className="section-header">Top Picks for You</h2>
        <button
          className="pill-btn"
          onClick={refresh}
          disabled={loading}
          style={{ fontSize: 13, display: 'flex', alignItems: 'center', gap: 5, opacity: loading ? 0.5 : 1 }}
        >
          <SparklesIcon size={14} /> {loading ? 'Loading\u2026' : 'Refresh'}
        </button>
      </div>

      <p style={{ padding: '0 16px 12px', fontSize: 13, color: 'var(--label-secondary)' }}>
        Based on your listening history
      </p>

      {loading && recs.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <div style={{ fontSize: 14, color: 'var(--label-secondary)', marginBottom: 8 }}>
            Analysing your music taste\u2026
          </div>
        </div>
      ) : recs.length === 0 ? (
        <p style={{ textAlign: 'center', color: 'var(--label-secondary)', padding: 30 }}>
          Play some songs first \u2014 recommendations improve as you listen.
        </p>
      ) : (
        <div className="hscroll" style={{ gap: 14 }}>
          {recs.map((rec, _i) => (
            <button
              key={rec.track.id}
              className="top-pick-card"
              style={{ width: 180, background: 'none', flexShrink: 0 }}
              onClick={() => playTracks([rec.track], 0)}
            >
              <Artwork src={rec.track.artwork} className="top-pick-artwork" placeholderSize={30} alt="" style={{ width: 180, height: 180 } as React.CSSProperties} />
              <div className="card-title" style={{ marginTop: 10 }}>{rec.track.title}</div>
              <div className="card-subtitle">{rec.track.artist}</div>
              <div className="top-pick-badge">
                <StarIcon size={14} /> {rec.reasons[0] || 'Top Pick'}
              </div>
            </button>
          ))}
        </div>
      );
}
"""

content = content.replace(old_imports, new_imports)
content = content.replace(old_made_for_you, new_made_for_you)
content = content.replace(old_top_picks, new_top_picks)

with open('C:/Users/user/Desktop/opencode/apple-music-clone/src/components/Views.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print("Done!")