import type { Track } from '../types';
import * as db from './db';

export type ShareType = 'track' | 'playlist' | 'album' | 'artist' | 'mix';

export interface SharePayload {
  v: 1;
  type: ShareType;
  name?: string;
  tracks: ShareTrack[];
  playlistName?: string;
  albumTitle?: string;
  artistName?: string;
}

export interface ShareTrack {
  id: string;
  title: string;
  artist: string;
  artist2?: string;
  album: string;
  albumArtist?: string;
  genre1?: string;
  genre2?: string;
  year?: number;
  trackNo?: number;
  duration?: number;
  youtubeId?: string;
  artwork?: string;
  fileName?: string;
  audioData?: string;
}

function extractYoutubeId(trackId: string): string | undefined {
  return trackId.startsWith('y-') ? trackId.slice(2) : undefined;
}

function trackToShareTrack(track: Track): ShareTrack {
  return {
    id: track.id,
    title: track.title,
    artist: track.artist,
    artist2: track.artist2,
    album: track.album,
    albumArtist: track.albumArtist,
    genre1: track.genre1,
    genre2: track.genre2,
    year: track.year,
    trackNo: track.trackNo,
    duration: track.duration,
    youtubeId: extractYoutubeId(track.id),
    artwork: track.artwork,
    fileName: track.fileName,
  };
}

export function createSharePayload(
  tracks: Track[],
  type: ShareType = 'track',
  meta?: { name?: string; playlistName?: string; albumTitle?: string; artistName?: string }
): SharePayload {
  return {
    v: 1,
    type,
    name: meta?.name,
    tracks: tracks.map(trackToShareTrack),
    playlistName: meta?.playlistName,
    albumTitle: meta?.albumTitle,
    artistName: meta?.artistName,
  };
}

function getShareTitle(p: SharePayload): string {
  switch (p.type) {
    case 'playlist': return p.playlistName ?? 'Playlist';
    case 'album': return p.albumTitle ?? 'Album';
    case 'artist': return p.artistName ?? 'Artist';
    case 'mix': return p.name ?? 'Mix';
    case 'track': return p.tracks.length === 1 ? p.tracks[0].title : `${p.tracks.length} songs`;
    default: return 'Vispr Share';
  }
}

function getShareText(p: SharePayload): string {
  const n = p.tracks.length;
  switch (p.type) {
    case 'playlist': return `${p.playlistName ?? 'Playlist'} — ${n} songs`;
    case 'album': return `${p.albumTitle ?? 'Album'} — ${n} songs`;
    case 'artist': return `${p.artistName ?? 'Artist'} — ${n} songs`;
    case 'mix': return `${p.name ?? 'Mix'} — ${n} songs`;
    case 'track': return n === 1 ? `${p.tracks[0].title} — ${p.tracks[0].artist}` : `${n} songs from Vispr`;
    default: return 'Vispr Share';
  }
}

function getFileName(p: SharePayload): string {
  const name = getShareTitle(p).replace(/[<>:"/\\|?*]/g, '_');
  return `${name}.json`;
}

async function sharePayload(payload: SharePayload, tracks: Track[]): Promise<void> {
  for (const track of tracks) {
    const blob = await db.loadFileBlob(track.id);
    if (blob) {
      const b64 = await blobToBase64(blob);
      const st = payload.tracks.find((t) => t.id === track.id);
      if (st) st.audioData = b64;
    }
  }

  const jsonBlob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const jsonFile = new File([jsonBlob], getFileName(payload), { type: 'application/json' });

  try {
    if (navigator.share && navigator.canShare?.({ files: [jsonFile] })) {
      await navigator.share({ files: [jsonFile], title: getShareTitle(payload), text: getShareText(payload) });
      return;
    }
  } catch { /* cancelled or unsupported — fall through to download */ }

  const url = URL.createObjectURL(jsonBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = getFileName(payload);
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function shareTracks(tracks: Track[]): Promise<void> {
  await sharePayload(createSharePayload(tracks, 'track'), tracks);
}

export async function sharePlaylist(name: string, tracks: Track[]): Promise<void> {
  await sharePayload(createSharePayload(tracks, 'playlist', { playlistName: name }), tracks);
}

export async function shareAlbum(title: string, tracks: Track[]): Promise<void> {
  await sharePayload(createSharePayload(tracks, 'album', { albumTitle: title }), tracks);
}

export async function shareArtist(name: string, tracks: Track[]): Promise<void> {
  await sharePayload(createSharePayload(tracks, 'artist', { artistName: name }), tracks);
}

export async function shareMix(name: string, tracks: Track[]): Promise<void> {
  await sharePayload(createSharePayload(tracks, 'mix', { name }), tracks);
}

export function parseSharePayload(text: string): SharePayload {
  const data = JSON.parse(text);
  if (data.v !== 1 || !data.tracks || !Array.isArray(data.tracks)) {
    throw new Error('Invalid share file');
  }
  const validTypes = ['track', 'playlist', 'album', 'artist', 'mix'];
  if (data.type && !validTypes.includes(data.type)) data.type = 'track';
  for (const t of data.tracks) {
    if (!t.id || !t.title || !t.artist || !t.album) throw new Error('Malformed track in share file');
  }
  return data as SharePayload;
}

export interface ConflictItem {
  incoming: ShareTrack;
  existing?: Track;
  status: 'new' | 'exact' | 'conflict';
}

export function detectConflicts(incoming: ShareTrack[], existingTracks: Track[]): ConflictItem[] {
  const byId = new Map(existingTracks.map((t) => [t.id, t]));
  const byYtId = new Map(existingTracks.filter((t) => t.id.startsWith('y-')).map((t) => [t.id.slice(2), t]));

  return incoming.map((inc) => {
    const existing = inc.youtubeId
      ? (byId.get(`y-${inc.youtubeId}`) ?? byYtId.get(inc.youtubeId))
      : byId.get(inc.id);

    if (!existing) return { incoming: inc, existing: undefined, status: 'new' as const };

    const same = existing.title === inc.title && existing.artist === inc.artist &&
      existing.album === inc.album && (existing.duration ?? 0) === (inc.duration ?? 0);

    return { incoming: inc, existing, status: same ? 'exact' : 'conflict' };
  });
}
