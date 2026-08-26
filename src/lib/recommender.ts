import type { Track } from '../types';
import { getTrackProfile, type GenreTag, type EraTag } from './classifier';
import {
  embedTracks,
  cosineSimilarity,
  centroid,
  isModelReady,
} from './embeddings';

export interface TasteProfile {
  artistScores: Map<string, number>;
  genreScores: Map<GenreTag, number>;
  eraScores: Map<EraTag, number>;
  playlistCoOccurrences: Map<string, Set<string>>;
  favourites: Set<string>;
  recentlyPlayed: Set<string>;
  playCounts: Record<string, number>;
}

export interface Recommendation {
  track: Track;
  score: number;
  reasons: string[];
}

/* ── build taste profile from library ────────────────────────────────── */

export function buildTasteProfile(
  tracks: Track[],
  playCounts: Record<string, number>,
  recentlyPlayed: Track[],
  playlists: { trackIds: string[] }[],
  favourites: Set<string>
): TasteProfile {
  const artistScores = new Map<string, number>();
  const genreScores = new Map<GenreTag, number>();
  const eraScores = new Map<EraTag, number>();
  let totalPlays = 0;

  for (const t of tracks) {
    const plays = playCounts[t.id] ?? 0;
    totalPlays += plays;
    if (plays === 0) continue;

    const profile = getTrackProfile(t);
    const artistKey = t.artist.toLowerCase();
    artistScores.set(artistKey, (artistScores.get(artistKey) ?? 0) + plays);
    genreScores.set(profile.genre1, (genreScores.get(profile.genre1) ?? 0) + plays);
    if (profile.genre2 !== 'unknown') {
      genreScores.set(profile.genre2, (genreScores.get(profile.genre2) ?? 0) + plays * 0.5);
    }
    eraScores.set(profile.era, (eraScores.get(profile.era) ?? 0) + plays);
  }

  if (totalPlays > 0) {
    for (const [k, v] of artistScores) artistScores.set(k, v / totalPlays);
    for (const [k, v] of genreScores) genreScores.set(k, v / totalPlays);
    for (const [k, v] of eraScores) eraScores.set(k, v / totalPlays);
  }

  const recentlyPlayedArtists = new Map<string, number>();
  recentlyPlayed.forEach((t, i) => {
    const recency = 1 - i / Math.max(recentlyPlayed.length, 1);
    recentlyPlayedArtists.set(t.artist.toLowerCase(), recency * 0.3);
  });
  for (const [artist, boost] of recentlyPlayedArtists) {
    artistScores.set(artist, (artistScores.get(artist) ?? 0) + boost);
  }

  const playlistCoOccurrences = new Map<string, Set<string>>();
  for (const pl of playlists) {
    for (const id of pl.trackIds) {
      if (!playlistCoOccurrences.has(id)) playlistCoOccurrences.set(id, new Set());
      for (const otherId of pl.trackIds) {
        if (otherId !== id) playlistCoOccurrences.get(id)!.add(otherId);
      }
    }
  }

  return {
    artistScores,
    genreScores,
    eraScores,
    playlistCoOccurrences,
    favourites,
    recentlyPlayed: new Set(recentlyPlayed.map((t) => t.id)),
    playCounts
  };
}

/* ── score a single track ────────────────────────────────────────────── */

function scoreTrack(
  track: Track,
  taste: TasteProfile,
  seed: number,
  favCentroid: Float32Array | null,
  embeddings: Map<string, Float32Array> | null,
): { score: number; reasons: string[] } {
  const profile = getTrackProfile(track);
  const reasons: string[] = [];
  let score = 0;

  // 1. Artist affinity (0–35 pts)
  const artistKey = track.artist.toLowerCase();
  const artistScore = taste.artistScores.get(artistKey) ?? 0;
  const artistPts = artistScore * 35;
  score += artistPts;
  if (artistPts > 5) reasons.push(`You listen to ${track.artist}`);

  // 2. Genre match (0–25 pts)
  const genre1Score = taste.genreScores.get(profile.genre1) ?? 0;
  const genre2Score = profile.genre2 !== 'unknown' ? (taste.genreScores.get(profile.genre2) ?? 0) : 0;
  const genrePts = (genre1Score * 25 + genre2Score * 12);
  score += genrePts;
  if (genrePts > 5) {
    const genreLabel = profile.genre1 !== 'unknown' ? profile.genre1 : profile.genre2;
    reasons.push(`Matches your ${genreLabel} mood`);
  }

  // 3. Era match (0–15 pts)
  const eraScore = taste.eraScores.get(profile.era) ?? 0;
  const eraPts = eraScore * 15;
  score += eraPts;
  if (eraPts > 3 && profile.era !== 'unknown') reasons.push(`From the ${profile.era}`);

  // 4. Playlist co-occurrence (0–10 pts)
  const coTracks = taste.playlistCoOccurrences.get(track.id);
  if (coTracks && coTracks.size > 0) {
    let coScore = 0;
    for (const coId of coTracks) {
      const coPlays = taste.playCounts[coId] ?? 0;
      coScore += Math.min(coPlays / 10, 1);
    }
    const coPts = Math.min(coScore / coTracks.size, 1) * 10;
    score += coPts;
    if (coPts > 3) reasons.push('Saved in your playlists');
  }

  // 5. Favourite boost (+12 pts)
  if (taste.favourites.has(track.id)) {
    score += 12;
    reasons.push('Favourited');
  }

  // 6. Semantic similarity (0–20 pts) — cosine similarity to favourite centroid
  if (favCentroid && embeddings) {
    const trackEmb = embeddings.get(track.id);
    if (trackEmb) {
      const sim = cosineSimilarity(trackEmb, favCentroid);
      const simPts = Math.max(0, sim) * 20;
      score += simPts;
      if (simPts > 8) reasons.push('Sounds like your favourites');
      else if (simPts > 5) reasons.push('Similar vibe');
    }
  }

  // 7. Exploration bonus (0–8 pts) — small random noise per seed
  const trackSeed = hashString(track.id + seed);
  const explorationNoise = (trackSeed % 100) / 100 * 8;
  score += explorationNoise;

  // 8. Repetition penalty (−0 to −15 pts) — penalise recently played
  if (taste.recentlyPlayed.has(track.id)) {
    const penalty = 15;
    score -= penalty;
  } else {
    const plays = taste.playCounts[track.id] ?? 0;
    if (plays > 20) score -= 5;
    else if (plays > 10) score -= 3;
  }

  return { score: Math.max(0, score), reasons };
}

/* ── hash helper ─────────────────────────────────────────────────────── */

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/* ── main recommendation entry point (sync, no embeddings) ──────────── */

export function getRecommendations(
  tracks: Track[],
  playCounts: Record<string, number>,
  recentlyPlayed: Track[],
  playlists: { trackIds: string[] }[],
  favourites: Set<string>,
  count = 10,
  seed = Date.now()
): Recommendation[] {
  if (tracks.length === 0) return [];

  const taste = buildTasteProfile(tracks, playCounts, recentlyPlayed, playlists, favourites);

  const hasData = Object.keys(playCounts).length > 0;
  if (!hasData) {
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map((t) => ({
      track: t,
      score: 0,
      reasons: ['Good starting point']
    }));
  }

  const scored = tracks.map((t) => {
    const { score, reasons } = scoreTrack(t, taste, seed, null, null);
    return { track: t, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);

  const result: Recommendation[] = [];
  const used = new Set<string>();
  const topPool = scored.slice(0, Math.min(count * 3, scored.length));

  for (let i = 0; i < count && i < topPool.length; i++) {
    let pick: (typeof topPool)[number];
    if (i > 0 && i % 3 === 0 && topPool.length > count) {
      const midStart = Math.floor(count * 1.5);
      const midEnd = Math.min(topPool.length, count * 3);
      const midRange = topPool.slice(midStart, midEnd).filter((c) => !used.has(c.track.id));
      if (midRange.length > 0) {
        pick = midRange[Math.floor(Math.random() * midRange.length)];
      } else {
        pick = topPool[i];
      }
    } else {
      pick = topPool[i];
    }

    if (!used.has(pick.track.id)) {
      used.add(pick.track.id);
      result.push(pick);
    }
  }

  return result.slice(0, count);
}

/* ── async recommendation with embeddings ────────────────────────────── */

export async function getSmartRecommendations(
  tracks: Track[],
  playCounts: Record<string, number>,
  recentlyPlayed: Track[],
  playlists: { trackIds: string[] }[],
  favourites: Set<string>,
  count = 10,
  seed = Date.now(),
  onEmbeddingProgress?: (done: number, total: number) => void,
): Promise<Recommendation[]> {
  if (tracks.length === 0) return [];

  const hasData = Object.keys(playCounts).length > 0;
  if (!hasData) {
    const shuffled = [...tracks].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count).map((t) => ({
      track: t,
      score: 0,
      reasons: ['Good starting point']
    }));
  }

  // Compute favourite centroid for semantic similarity
  const favIds = [...favourites];
  let favCentroid: Float32Array | null = null;
  let embeddings: Map<string, Float32Array> | null = null;

    try {
      // Embed all tracks (cached after first run)
      embeddings = await embedTracks(tracks, onEmbeddingProgress);

      // Build centroid from favourites
      if (favIds.length > 0) {
        const favVecs = favIds
          .map((id) => embeddings!.get(id))
          .filter((v): v is Float32Array => !!v);
        if (favVecs.length > 0) {
          favCentroid = centroid(favVecs);
        }
      }
  } catch {
    // Embeddings failed — fall back to heuristic-only scoring
  }

  const taste = buildTasteProfile(tracks, playCounts, recentlyPlayed, playlists, favourites);

  const scored = tracks.map((t) => {
    const { score, reasons } = scoreTrack(t, taste, seed, favCentroid, embeddings);
    return { track: t, score, reasons };
  });

  scored.sort((a, b) => b.score - a.score);

  const result: Recommendation[] = [];
  const used = new Set<string>();
  const topPool = scored.slice(0, Math.min(count * 3, scored.length));

  for (let i = 0; i < count && i < topPool.length; i++) {
    let pick: (typeof topPool)[number];
    if (i > 0 && i % 3 === 0 && topPool.length > count) {
      const midStart = Math.floor(count * 1.5);
      const midEnd = Math.min(topPool.length, count * 3);
      const midRange = topPool.slice(midStart, midEnd).filter((c) => !used.has(c.track.id));
      if (midRange.length > 0) {
        pick = midRange[Math.floor(Math.random() * midRange.length)];
      } else {
        pick = topPool[i];
      }
    } else {
      pick = topPool[i];
    }

    if (!used.has(pick.track.id)) {
      used.add(pick.track.id);
      result.push(pick);
    }
  }

  return result.slice(0, count);
}

/* ── embedding status for UI ─────────────────────────────────────────── */

export function getEmbeddingStatus(): 'ready' | 'loading' | 'unavailable' {
  if (isModelReady()) return 'ready';
  return 'unavailable';
}
