/**
 * Free external metadata providers, usable even without the yt-dlp bridge.
 * Chain: YouTube oEmbed (no key) -> noembed.com (no key) -> official Data API v3 (optional key).
 * Handy fallback if a future download source can't supply song info itself.
 */

export interface ExternalMeta {
  title?: string;
  artist?: string;
  thumbnail?: string;
  duration?: number;
}

const UA_HEADERS = { 'Content-Type': 'application/json' };

function extractVideoId(urlOrId: string): string | null {
  const s = urlOrId.trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:[?&]v=|youtu\.be\/|\/embed\/|\/shorts\/)([\w-]{11})/);
  return m ? m[1] : null;
}

async function fetchJson(url: string, timeoutMs = 8000): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const resp = await fetch(url, { ...UA_HEADERS, signal: ctrl.signal });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

async function fromOEmbed(videoId: string): Promise<ExternalMeta | null> {
  const data = (await fetchJson(
    `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}&format=json`
  )) as { title?: string; author_name?: string; thumbnail_url?: string } | null;
  if (!data?.title) return null;
  return {
    title: data.title,
    artist: data.author_name || undefined,
    thumbnail: data.thumbnail_url || undefined
  };
}

async function fromNoEmbed(videoId: string): Promise<ExternalMeta | null> {
  const data = (await fetchJson(`https://noembed.com/embed?url=${encodeURIComponent(`https://www.youtube.com/watch?v=${videoId}`)}`)) as {
    title?: string;
    author_name?: string;
    thumbnail_url?: string;
    error?: string;
  } | null;
  if (!data?.title || data.error) return null;
  return {
    title: data.title,
    artist: data.author_name || undefined,
    thumbnail: data.thumbnail_url || undefined
  };
}

async function fromDataApi(videoId: string, apiKey: string): Promise<ExternalMeta | null> {
  const data = (await fetchJson(
    `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${encodeURIComponent(apiKey)}`
  )) as {
    items?: {
      snippet?: { title?: string; channelTitle?: string; thumbnails?: Record<string, { url?: string }> };
      contentDetails?: { duration?: string };
    }[];
  } | null;
  const item = data?.items?.[0];
  if (!item?.snippet) return null;
  let duration: number | undefined;
  const iso = item.contentDetails?.duration;
  if (iso) {
    const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
    if (m) duration = Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
  }
  const thumbs = item.snippet.thumbnails ?? {};
  const thumb = thumbs.maxres?.url ?? thumbs.high?.url ?? thumbs.medium?.url ?? thumbs.default?.url;
  return {
    title: item.snippet.title || undefined,
    artist: item.snippet.channelTitle || undefined,
    thumbnail: thumb,
    duration
  };
}

/** Fetch metadata for a video id/URL trying all providers in order. Returns null if everything fails. */
export async function fetchExternalMetadata(videoIdOrUrl: string, apiKey = ''): Promise<ExternalMeta | null> {
  const id = extractVideoId(videoIdOrUrl);
  if (!id) return null;

  const providers: (() => Promise<ExternalMeta | null>)[] = [
    () => fromOEmbed(id),
    () => fromNoEmbed(id),
    ...(apiKey.trim() ? [() => fromDataApi(id, apiKey.trim())] : [])
  ];

  let firstError: ExternalMeta | null = null;
  for (const provider of providers) {
    try {
      const meta = await provider();
      if (meta) return meta;
    } catch {
      /* try next */
    }
  }
  void firstError;
  return null;
}

/** Fill in any missing fields on `target` using external metadata. Returns true if anything changed. */
export async function enrichWithExternalMeta(target: ExternalMeta, videoIdOrUrl: string, apiKey = ''): Promise<boolean> {
  const meta = await fetchExternalMetadata(videoIdOrUrl, apiKey);
  if (!meta) return false;
  let changed = false;
  if (!target.title && meta.title) {
    target.title = meta.title;
    changed = true;
  }
  if (!target.artist && meta.artist) {
    target.artist = meta.artist;
    changed = true;
  }
  if (!target.thumbnail && meta.thumbnail) {
    target.thumbnail = meta.thumbnail;
    changed = true;
  }
  if (!target.duration && meta.duration) {
    target.duration = meta.duration;
    changed = true;
  }
  return changed;
}
