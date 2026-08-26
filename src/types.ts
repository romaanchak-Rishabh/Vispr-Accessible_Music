export interface Track {
  id: string;
  title: string;
  artist: string;
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
}

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
