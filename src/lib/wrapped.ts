import type { Track, HistoryEntry } from '../types';

export interface WrappedStats {
  totalMinutes: number;
  totalPlays: number;
  uniqueTracksPlayed: number;
  librarySize: number;
  topArtists: { name: string; minutes: number; plays: number; artwork?: string }[];
  topSongs: { track: Track; plays: number; minutes: number }[];
  topAlbums: { name: string; artist: string; minutes: number; plays: number; artwork?: string }[];
  topGenres: { genre: string; score: number; plays: number }[];
  topLanguages: { language: string; plays: number }[];
  topMoods: { mood: string; plays: number }[];
  listeningAge: number;
  eraDistribution: { era: string; plays: number; minutes: number }[];
  personality: PersonalityClub;
  favouriteArtist: string | null;
  favouriteSong: Track | null;
  uniqueArtistsPlayed: number;
  uniqueAlbumsPlayed: number;
  topDayOfWeek: string;
  averagePlaysPerTrack: number;
}

export interface PersonalityClub {
  id: string;
  name: string;
  emoji: string;
  description: string;
  color: string;
}

const ERA_RANGES: { era: string; start: number; end: number }[] = [
  { era: '2020s', start: 2020, end: 2029 },
  { era: '2010s', start: 2010, end: 2019 },
  { era: '2000s', start: 2000, end: 2009 },
  { era: '1990s', start: 1990, end: 1999 },
  { era: '1980s', start: 1980, end: 1989 },
  { era: '1970s', start: 1970, end: 1979 },
  { era: 'Older', start: 0, end: 1969 },
];

function eraOf(year?: number): string {
  if (!year) return 'Unknown';
  const r = ERA_RANGES.find((e) => year >= e.start && year <= e.end);
  return r?.era ?? 'Unknown';
}

const CLUBS: PersonalityClub[] = [
  { id: 'soft-heart', name: 'Soft Heart', emoji: '💜', description: 'You feel everything deeply. Your playlists are emotional journeys.', color: '#ff6b9d' },
  { id: 'serotonin', name: 'Serotonin', emoji: '☀️', description: 'Pure good vibes. Your music is your sunshine.', color: '#ffd93d' },
  { id: 'cosmic', name: 'Cosmic Stereo', emoji: '🌌', description: 'You live in another dimension. Sound is your universe.', color: '#6c5ce7' },
  { id: 'full-charge', name: 'Full Charge', emoji: '⚡', description: 'High energy, zero chill. Music is your fuel.', color: '#00b894' },
  { id: 'grit', name: 'Grit Collective', emoji: '🔥', description: 'Raw, loud, and unapologetic. Volume up, always.', color: '#e17055' },
  { id: 'cloud', name: 'Cloud State', emoji: '☁️', description: 'Dreamy, calm, and floating. Music is your meditation.', color: '#74b9ff' },
];

function classifyPersonality(
  genrePlays: Record<string, number>,
  moodPlays: Record<string, number>,
  totalPlays: number
): PersonalityClub {
  if (totalPlays === 0) return CLUBS[1];

  const g = (genre: string): number => genrePlays[genre] ?? 0;
  const m = (mood: string): number => moodPlays[mood] ?? 0;

  const scores: Record<string, number> = {
    'soft-heart': g('ghazal') + g('sufi') * 0.5 + m('melancholic') + m('sad') + m('romantic') * 0.7,
    'serotonin': g('pop') + g('bollywood') * 0.3 + m('upbeat') + m('happy') + m('party') * 0.5,
    'cosmic': g('electronic') + g('edm') + g('lo-fi') + g('ambient') + m('dreamy') + m('calm') * 0.5,
    'full-charge': g('rap') + g('hip-hop') + g('r&b') * 0.5 + m('energetic') + m('workout') + m('hype'),
    'grit': g('rock') + g('metal') + g('punk') + m('aggressive') + m('angry'),
    'cloud': g('classical') + g('ambient') + g('acoustic') * 0.5 + m('calm') + m('chill') + m('sleep') + m('focus'),
  };

  const top = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
  return CLUBS.find((c) => c.id === top[0]) ?? CLUBS[1];
}

function listeningAgeOf(years: { year?: number; plays: number }[]): number {
  const totalPlays = years.reduce((s, y) => s + y.plays, 0);
  if (totalPlays === 0) return 22;
  // Only average over tracks that actually have a year — otherwise missing
  // metadata drags the average toward the default and skews the result.
  const withYear = years.filter((y) => y.year && y.year >= 1950);
  if (withYear.length === 0) return 22;
  const yearTotal = withYear.reduce((s, y) => s + y.plays, 0);
  if (yearTotal === 0) return 22;
  const weightedSum = withYear.reduce((s, y) => s + (y.year ?? 2015) * y.plays, 0);
  const avgYear = weightedSum / yearTotal;
  // Newer music → younger listening personality, older music → mature.
  // Reference: currentYear (2026) ≈ age 16; each decade back adds ~9 years.
  const currentYear = new Date().getFullYear();
  const age = Math.round(16 + (currentYear - avgYear) * 0.9);
  return Math.max(14, Math.min(78, age));
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function computeWrappedStats(
  tracks: Track[],
  playCounts: Record<string, number>,
  listenTime: Record<string, number>,
  recentlyPlayed: HistoryEntry[],
  _firstPlayedAt: Record<string, number>
): WrappedStats {
  const byId = new Map(tracks.map((t) => [t.id, t]));

  // --- Minutes & plays ---
  const totalPlays = Object.values(playCounts).reduce((s, v) => s + v, 0);
  const playedIds = Object.keys(playCounts).filter((id) => (playCounts[id] ?? 0) > 0);
  const uniqueTracksPlayed = playedIds.length;

  // --- Per-track aggregation ---
  const trackMinutes = (id: string): number => {
    const secs = listenTime[id] ?? 0;
    const t = byId.get(id);
    // If no listenTime tracked yet, estimate from duration × plays
    if (secs === 0 && t?.duration) return (t.duration * (playCounts[id] ?? 0)) / 60;
    return secs / 60;
  };

  // Sum per-track minutes (uses duration×plays fallback when listenTime is empty)
  const totalMinutes = Math.round(playedIds.reduce((s, id) => s + trackMinutes(id), 0));

  // --- Top artists by minutes ---
  const artistAgg = new Map<string, { minutes: number; plays: number; artwork?: string }>();
  for (const id of playedIds) {
    const t = byId.get(id);
    if (!t) continue;
    const name = t.artist;
    const prev = artistAgg.get(name) ?? { minutes: 0, plays: 0, artwork: t.artwork };
    prev.minutes += trackMinutes(id);
    prev.plays += playCounts[id] ?? 0;
    if (!prev.artwork && t.artwork) prev.artwork = t.artwork;
    artistAgg.set(name, prev);
  }
  const topArtists = [...artistAgg.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 10);

  // --- Top songs ---
  const topSongs = playedIds
    .map((id) => {
      const t = byId.get(id);
      if (!t) return null;
      return { track: t, plays: playCounts[id] ?? 0, minutes: trackMinutes(id) };
    })
    .filter(Boolean)
    .sort((a, b) => (b!.plays - a!.plays) || (b!.minutes - a!.minutes))
    .slice(0, 100) as { track: Track; plays: number; minutes: number }[];

  // --- Top albums ---
  const albumAgg = new Map<string, { name: string; artist: string; minutes: number; plays: number; artwork?: string }>();
  for (const id of playedIds) {
    const t = byId.get(id);
    if (!t) continue;
    const key = t.album.toLowerCase();
    const prev = albumAgg.get(key) ?? { name: t.album, artist: t.albumArtist ?? t.artist, minutes: 0, plays: 0, artwork: t.artwork };
    prev.minutes += trackMinutes(id);
    prev.plays += playCounts[id] ?? 0;
    if (!prev.artwork && t.artwork) prev.artwork = t.artwork;
    albumAgg.set(key, prev);
  }
  const topAlbums = [...albumAgg.values()].sort((a, b) => b.minutes - a.minutes).slice(0, 10);

  // --- Genres ---
  const genrePlays: Record<string, number> = {};
  const genreMinutes: Record<string, number> = {};
  for (const id of playedIds) {
    const t = byId.get(id);
    if (!t) continue;
    const plays = playCounts[id] ?? 0;
    const mins = trackMinutes(id);
    const genres = [t.genre1, t.genre2, t.genre].filter(Boolean) as string[];
    for (const g of genres) {
      const key = g.toLowerCase();
      genrePlays[key] = (genrePlays[key] ?? 0) + plays;
      genreMinutes[key] = (genreMinutes[key] ?? 0) + mins;
    }
  }
  const topGenres = Object.entries(genrePlays)
    .filter(([g]) => g !== 'unknown' && g !== '')
    .map(([genre, plays]) => ({ genre, score: genreMinutes[genre] ?? 0, plays }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 10);

  // --- Languages ---
  const langPlays: Record<string, number> = {};
  for (const id of playedIds) {
    const t = byId.get(id);
    if (!t?.language) continue;
    langPlays[t.language] = (langPlays[t.language] ?? 0) + (playCounts[id] ?? 0);
  }
  const topLanguages = Object.entries(langPlays)
    .map(([language, plays]) => ({ language, plays }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 5);

  // --- Moods ---
  const moodPlays: Record<string, number> = {};
  for (const id of playedIds) {
    const t = byId.get(id);
    if (!t?.mood) continue;
    moodPlays[t.mood] = (moodPlays[t.mood] ?? 0) + (playCounts[id] ?? 0);
  }
  const topMoods = Object.entries(moodPlays)
    .map(([mood, plays]) => ({ mood, plays }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 5);

  // --- Era distribution ---
  const eraAgg = new Map<string, { plays: number; minutes: number }>();
  for (const id of playedIds) {
    const t = byId.get(id);
    if (!t) continue;
    const era = eraOf(t.year);
    const prev = eraAgg.get(era) ?? { plays: 0, minutes: 0 };
    prev.plays += playCounts[id] ?? 0;
    prev.minutes += trackMinutes(id);
    eraAgg.set(era, prev);
  }
  const eraDistribution = ERA_RANGES
    .map((r) => ({ era: r.era, plays: eraAgg.get(r.era)?.plays ?? 0, minutes: eraAgg.get(r.era)?.minutes ?? 0 }))
    .filter((e) => e.plays > 0);

  // --- Listening age ---
  const listeningAge = listeningAgeOf(
    playedIds.map((id) => {
      const t = byId.get(id);
      return { year: t?.year, plays: playCounts[id] ?? 0 };
    })
  );

  // --- Personality ---
  const personality = classifyPersonality(genrePlays, moodPlays, totalPlays);

  // --- Day of week (from recentlyPlayed) ---
  const dayCounts = [0, 0, 0, 0, 0, 0, 0];
  for (const entry of recentlyPlayed) {
    dayCounts[new Date(entry.playedAt).getDay()]++;
  }
  const maxDayIdx = dayCounts.indexOf(Math.max(...dayCounts));
  const topDayOfWeek = recentlyPlayed.length > 0 ? DAY_NAMES[maxDayIdx] : 'Unknown';

  // --- Unique artists/albums ---
  const uniqueArtistsPlayed = artistAgg.size;
  const uniqueAlbumsPlayed = albumAgg.size;

  return {
    totalMinutes,
    totalPlays,
    uniqueTracksPlayed,
    librarySize: tracks.length,
    topArtists,
    topSongs: topSongs.slice(0, 5),
    topAlbums,
    topGenres,
    topLanguages,
    topMoods,
    listeningAge,
    eraDistribution,
    personality,
    favouriteArtist: topArtists[0]?.name ?? null,
    favouriteSong: topSongs[0]?.track ?? null,
    uniqueArtistsPlayed,
    uniqueAlbumsPlayed,
    topDayOfWeek,
    averagePlaysPerTrack: uniqueTracksPlayed > 0 ? Math.round((totalPlays / uniqueTracksPlayed) * 10) / 10 : 0,
  };
}

export function formatMinutes(mins: number): string {
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatMinutesLong(mins: number): string {
  if (mins < 60) return `${mins} minutes`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 1) return m > 0 ? `1 hour ${m} minutes` : `1 hour`;
  return m > 0 ? `${h} hours ${m} minutes` : `${h} hours`;
}
