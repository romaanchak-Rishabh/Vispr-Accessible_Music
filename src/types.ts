export interface Track {
  id: string;
  title: string;
  artist: string;
  artist2?: string;
  artists?: string[];
  album: string;
  albumArtist?: string;
  genre?: string;
  genre1?: string;
  genre2?: string;
  year?: number;
  trackNo?: number;
  fileName: string;
  path: string;
  source: 'dir' | 'file';
  size: number;
  addedAt: number;
  favouritedAt?: number;
  duration?: number;
  artwork?: string;
  mood?: string;
  language?: string;
  tags?: string[];
  songType?: string;
}

export type SongType = '' | 'mashup' | 'remix' | 'lofi' | 'live' | 'acoustic' | 'unplugged' | 'cover' | 'original';

export const SONG_TYPE_OPTIONS: { value: SongType; label: string }[] = [
  { value: '', label: 'Original' },
  { value: 'mashup', label: 'Mashup' },
  { value: 'remix', label: 'Remix' },
  { value: 'lofi', label: 'Lofi' },
  { value: 'live', label: 'Live' },
  { value: 'acoustic', label: 'Acoustic' },
  { value: 'unplugged', label: 'Unplugged' },
  { value: 'cover', label: 'Cover' },
];

export interface Album {
  key: string;
  title: string;
  artist: string;
  year?: number;
  artwork?: string;
  trackIds: string[];
}

export interface Artist {
  name: string;
  artwork?: string;
  albumKeys: string[];
  trackIds: string[];
}

export interface Playlist {
  id: string;
  name: string;
  createdAt: number;
  trackIds: string[];
}

export interface HistoryEntry {
  track: Track;
  playedAt: number;
}

export const AUDIO_EXTENSIONS = ['.mp3', '.m4a', '.mp4', '.aac', '.flac', '.wav', '.ogg', '.oga', '.opus', '.webm'];

export function isAudioFile(name: string): boolean {
  const lower = name.toLowerCase();
  return AUDIO_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

export function formatArtist(track: Pick<Track, 'artist' | 'artist2' | 'artists'>): string {
  if (track.artists && track.artists.length > 0) return track.artists.join(' × ');
  const a = track.artist;
  const b = track.artist2?.trim();
  if (!b) return a;
  if (a.toLowerCase().includes(b.toLowerCase())) return a;
  return `${a} × ${b}`;
}
