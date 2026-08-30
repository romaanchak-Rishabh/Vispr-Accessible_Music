import type { Track } from '../types';

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

function encodeSharePayload(payload: SharePayload): string {
  const json = JSON.stringify(payload);
  return btoa(unescape(encodeURIComponent(json)));
}

export function decodeSharePayload(encoded: string): SharePayload {
  const json = decodeURIComponent(escape(atob(encoded.trim())));
  return parseSharePayload(json);
}

function isBase64Share(text: string): boolean {
  try {
    const decoded = decodeURIComponent(escape(atob(text.trim())));
    const data = JSON.parse(decoded);
    return data.v === 1 && Array.isArray(data.tracks) && data.tracks.length > 0;
  } catch {
    return false;
  }
}

async function shareAsText(payload: SharePayload): Promise<void> {
  const encoded = encodeSharePayload(payload);

  try {
    if (navigator.share) {
      await navigator.share({ title: getShareTitle(payload), text: encoded });
      return;
    }
  } catch { /* cancelled or unsupported */ }

  try {
    await navigator.clipboard.writeText(encoded);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = encoded;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
  }
}

export async function shareTracks(tracks: Track[]): Promise<void> {
  await shareAsText(createSharePayload(tracks, 'track'));
}

export async function sharePlaylist(name: string, tracks: Track[]): Promise<void> {
  await shareAsText(createSharePayload(tracks, 'playlist', { playlistName: name }));
}

export async function shareAlbum(title: string, tracks: Track[]): Promise<void> {
  await shareAsText(createSharePayload(tracks, 'album', { albumTitle: title }));
}

export async function shareArtist(name: string, tracks: Track[]): Promise<void> {
  await shareAsText(createSharePayload(tracks, 'artist', { artistName: name }));
}

export async function shareMix(name: string, tracks: Track[]): Promise<void> {
  await shareAsText(createSharePayload(tracks, 'mix', { name }));
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

export function tryParseShareText(text: string): SharePayload | null {
  const trimmed = text.trim();

  // Try as raw JSON first
  try {
    const data = JSON.parse(trimmed);
    if (data.v === 1 && Array.isArray(data.tracks) && data.tracks.length > 0) {
      return data as SharePayload;
    }
  } catch { /* not JSON */ }

  // Try as base64-encoded share (full text)
  if (isBase64Share(trimmed)) {
    try {
      return decodeSharePayload(trimmed);
    } catch { /* not valid */ }
  }

  // Try to find base64 within the text (user may have copied extra text)
  const b64Match = trimmed.match(/[A-Za-z0-9+/=]{50,}/);
  if (b64Match && isBase64Share(b64Match[0])) {
    try {
      return decodeSharePayload(b64Match[0]);
    } catch { /* not valid */ }
  }

  return null;
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
