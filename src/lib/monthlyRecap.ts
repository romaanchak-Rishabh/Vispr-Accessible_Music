import type { Track } from '../types';
import { formatArtist } from '../types';
import type { MonthlyBucket } from '../store/player';
import { monthKey } from '../store/player';
import { formatMinutes } from './wrapped';

export interface MonthLabel {
  key: string;
  year: number;
  month: number; // 0-11
  label: string; // "October 2026"
  short: string; // "Oct 2026"
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function monthLabelFor(key: string): MonthLabel {
  const [y, m] = key.split('-').map(Number);
  return {
    key,
    year: y,
    month: m - 1,
    label: `${MONTH_NAMES[m - 1]} ${y}`,
    short: `${MONTH_SHORT[m - 1]} ${y}`,
  };
}

export function availableMonthKeys(monthlyPlays: Record<string, MonthlyBucket>): string[] {
  return Object.keys(monthlyPlays)
    .filter((k) => Object.keys(monthlyPlays[k] ?? {}).length > 0)
    .sort()
    .reverse();
}

export interface MonthlyTopEntry {
  id: string;
  name: string;
  sub: string;
  artwork?: string;
  plays: number;
  minutes: number;
}

export interface MonthlyRecap {
  month: MonthLabel;
  totalMinutes: number;
  totalPlays: number;
  topArtists: MonthlyTopEntry[];
  topSongs: MonthlyTopEntry[];
  topAlbums: MonthlyTopEntry[];
  topGenres: { genre: string; plays: number; minutes: number }[];
  topLanguages: { language: string; plays: number; minutes: number }[];
  eraDistribution: { era: string; plays: number; minutes: number }[];
  uniqueTracks: number;
  uniqueArtists: number;
  uniqueAlbums: number;
  averagePlaysPerTrack: number;
  topMood: string;
  trackIdsByPlays: string[];
}

function eraOf(year?: number): string {
  if (!year || year < 1950) return 'Unknown';
  if (year < 1970) return '60s & Earlier';
  if (year < 1980) return '70s';
  if (year < 1990) return '80s';
  if (year < 2000) return '90s';
  if (year < 2010) return '2000s';
  if (year < 2020) return '2010s';
  return '2020s';
}

export function computeMonthlyRecap(
  tracks: Track[],
  monthlyPlays: Record<string, MonthlyBucket>,
  monthlyListenTime: Record<string, MonthlyBucket>,
  monthKeyStr: string
): MonthlyRecap {
  const label = monthLabelFor(monthKeyStr);
  const playsBucket = monthlyPlays[monthKeyStr] ?? {};
  const timeBucket = monthlyListenTime[monthKeyStr] ?? {};
  const byId = new Map(tracks.map((t) => [t.id, t]));

  let totalPlays = 0;
  let totalMinutes = 0;

  const artistMap = new Map<string, { plays: number; minutes: number; artwork?: string }>();
  const songMap = new Map<string, { track: Track; plays: number; minutes: number }>();
  const albumMap = new Map<string, { name: string; artist: string; artwork?: string; plays: number; minutes: number }>();
  const genreMap = new Map<string, { plays: number; minutes: number }>();
  const langMap = new Map<string, { plays: number; minutes: number }>();
  const eraMap = new Map<string, { plays: number; minutes: number }>();
  const moodMap = new Map<string, number>();
  const uniqueTracks = new Set<string>();
  const uniqueArtists = new Set<string>();
  const uniqueAlbums = new Set<string>();

  for (const [trackId, plays] of Object.entries(playsBucket)) {
    const t = byId.get(trackId);
    if (!t || plays <= 0) continue;
    const secs = timeBucket[trackId] ?? 0;
    const minutes = secs > 0 ? secs / 60 : ((t.duration ?? 0) * plays) / 60;

    totalPlays += plays;
    totalMinutes += minutes;
    uniqueTracks.add(trackId);

    const artist = formatArtist(t);
    uniqueArtists.add(artist);
    const aEntry = artistMap.get(artist) ?? { plays: 0, minutes: 0, artwork: t.artwork };
    aEntry.plays += plays;
    aEntry.minutes += minutes;
    artistMap.set(artist, aEntry);

    uniqueAlbums.add(t.album);
    const alEntry = albumMap.get(t.album) ?? { name: t.album, artist: t.albumArtist || artist, artwork: t.artwork, plays: 0, minutes: 0 };
    alEntry.plays += plays;
    alEntry.minutes += minutes;
    albumMap.set(t.album, alEntry);

    songMap.set(trackId, { track: t, plays, minutes });

    const genre = (t.genre || t.genre1 || 'Unknown').toLowerCase();
    const gEntry = genreMap.get(genre) ?? { plays: 0, minutes: 0 };
    gEntry.plays += plays;
    gEntry.minutes += minutes;
    genreMap.set(genre, gEntry);

    if (t.language) {
      const lEntry = langMap.get(t.language) ?? { plays: 0, minutes: 0 };
      lEntry.plays += plays;
      lEntry.minutes += minutes;
      langMap.set(t.language, lEntry);
    }

    const era = eraOf(t.year);
    const eEntry = eraMap.get(era) ?? { plays: 0, minutes: 0 };
    eEntry.plays += plays;
    eEntry.minutes += minutes;
    eraMap.set(era, eEntry);

    if (t.mood) moodMap.set(t.mood, (moodMap.get(t.mood) ?? 0) + plays);
  }

  const topArtists = [...artistMap.entries()]
    .map(([name, v]) => ({ id: name, name, sub: formatMinutes(Math.round(v.minutes)), artwork: v.artwork, plays: v.plays, minutes: v.minutes }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 10);

  const topSongs = [...songMap.entries()]
    .map(([id, v]) => ({ id, name: v.track.title, sub: formatArtist(v.track), artwork: v.track.artwork, plays: v.plays, minutes: v.minutes }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 25);

  const topAlbums = [...albumMap.values()]
    .map((v) => ({ id: v.name, name: v.name, sub: v.artist, artwork: v.artwork, plays: v.plays, minutes: v.minutes }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 10);

  const topGenres = [...genreMap.entries()]
    .map(([genre, v]) => ({ genre, plays: v.plays, minutes: v.minutes }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 8);

  const topLanguages = [...langMap.entries()]
    .map(([language, v]) => ({ language, plays: v.plays, minutes: v.minutes }))
    .sort((a, b) => b.plays - a.plays)
    .slice(0, 6);

  const eraDistribution = [...eraMap.entries()]
    .map(([era, v]) => ({ era, plays: v.plays, minutes: v.minutes }))
    .sort((a, b) => b.plays - a.plays);

  const topMood = [...moodMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  const trackIdsByPlays = [...songMap.entries()]
    .sort((a, b) => b[1].plays - a[1].plays)
    .map(([id]) => id);

  return {
    month: label,
    totalMinutes,
    totalPlays,
    topArtists,
    topSongs,
    topAlbums,
    topGenres,
    topLanguages,
    eraDistribution,
    uniqueTracks: uniqueTracks.size,
    uniqueArtists: uniqueArtists.size,
    uniqueAlbums: uniqueAlbums.size,
    averagePlaysPerTrack: uniqueTracks.size > 0 ? Number((totalPlays / uniqueTracks.size).toFixed(1)) : 0,
    topMood,
    trackIdsByPlays,
  };
}

export { formatMinutes, monthKey };
