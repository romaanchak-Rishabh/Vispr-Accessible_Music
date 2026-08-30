// Cloudflare Worker: YouTube InnerTube ANDROID_VR backend for Vispr
// Replaces the yt-dlp Python server. No cookies, no PO tokens, no bot detection.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Auth-Token',
};

const INNERTUBE_CONTEXT = {
  client: {
    clientName: 'ANDROID_VR',
    clientVersion: '1.60.19',
    deviceMake: 'Oculus',
    deviceModel: 'Quest 3',
    androidSdkVersion: 32,
    osName: 'Android',
    osVersion: '12L',
    hl: 'en',
    gl: 'US',
  },
};

const USER_AGENT =
  'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip';

const INNERTUBE_API_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

// Audio itags ordered by preference (best quality first)
const AUDIO_ITAGS = [141, 251, 140, 250, 249, 139];

// ── N-parameter throttling transform ────────────────────────────────────────

interface NCtx {
  playerJs: string;
  fnName: string;
  fnBody: string;
  transform: ((n: string) => string) | null;
}

const nCtxCache = new Map<string, Promise<NCtx | null>>();

async function getPlayerJsUrl(playerResponse: any): Promise<string | null> {
  const assets = playerResponse?.assets;
  if (assets?.js) {
    const js = assets.js.startsWith('/') ? assets.js : `/${assets.js}`;
    return `https://www.youtube.com${js}`;
  }
  return null;
}

function extractNFunctionName(js: string): string | null {
  // Pattern 1: var XX={...}, and function name inside
  const m1 = js.match(
    /\b([a-zA-Z0-9$]{2})\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)/
  );
  if (m1) return m1[1];

  // Pattern 2: function XX(a){a=a.split("")...}
  const m2 = js.match(
    /function\s+([a-zA-Z0-9$]{2})\s*\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\)/
  );
  if (m2) return m2[1];

  // Pattern 3: reversed order — split before function declaration
  const m3 = js.match(
    /([a-zA-Z0-9$]{2})\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\);[\s\S]*?return\s+a\.join\(\s*""\s*\)\s*\}/
  );
  if (m3) return m3[1];

  return null;
}

function extractNFunctionBody(js: string, name: string): string | null {
  // Try to find the function body
  const patterns = [
    new RegExp(
      `(?:var\\s+)?${escapeRegex(name)}\\s*=\\s*function\\s*\\(\\s*a\\s*\\)\\s*\\{`
    ),
    new RegExp(`function\\s+${escapeRegex(name)}\\s*\\(\\s*a\\s*\\)\\s*\\{`),
  ];

  for (const pat of patterns) {
    const match = js.match(pat);
    if (!match) continue;

    const startIdx = js.indexOf(match[0]) + match[0].length;
    let depth = 1;
    let i = startIdx;
    while (i < js.length && depth > 0) {
      if (js[i] === '{') depth++;
      else if (js[i] === '}') depth--;
      i++;
    }
    return js.substring(js.indexOf(match[0]), i);
  }

  // Fallback: scan for split/join pattern
  const splitJoinRe = /([a-zA-Z0-9$]{2})\s*=\s*function\(\s*a\s*\)\s*\{\s*a\s*=\s*a\.split\(\s*""\s*\);[\s\S]*?return\s+a\.join\(\s*""\s*\)\s*\}/;
  const m = js.match(splitJoinRe);
  if (m) return m[0];

  return null;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildNTransform(playerJs: string): ((n: string) => string) | null {
  try {
    const name = extractNFunctionName(playerJs);
    if (!name) return null;

    const body = extractNFunctionBody(playerJs, name);
    if (!body) return null;

    // Extract helper objects referenced by the function
    const helpers: string[] = [];
    const helperNames = new Set<string>();
    const helperRe = /([\w$]+)\.[\w$]+\(/g;
    let hm: RegExpExecArray | null;
    while ((hm = helperRe.exec(body))) {
      const hName = hm[1];
      if (hName !== name && !helperNames.has(hName)) {
        helperNames.add(hName);
        // Find the var declaration for this helper
        const varRe = new RegExp(
          `(?:var\\s+)?${escapeRegex(hName)}\\s*=\\s*\\{[^}]*\\}\\s*;`
        );
        const varMatch = playerJs.match(varRe);
        if (varMatch) helpers.push(varMatch[0]);
      }
    }

    const fullFn = `function ${name}(a) { ${body.replace(/^function\s*\(\s*a\s*\)\s*\{/, '').replace(/\}$/, '')} }`;
    const code = helpers.join('\n') + '\n' + fullFn;

    // eslint-disable-next-line no-new-func
    const fn = new Function('return ' + code)() as (a: string) => string;
    if (typeof fn !== 'function') return null;

    // Validate: transform should produce a different string
    const test = fn('test123');
    if (typeof test !== 'string' || test === 'test123') return null;

    return fn;
  } catch {
    return null;
  }
}

async function getNTransform(
  env: Env,
  playerResponse: any
): Promise<((n: string) => string) | null> {
  const jsUrl = await getPlayerJsUrl(playerResponse);
  if (!jsUrl) return null;

  const cached = nCtxCache.get(jsUrl);
  if (cached) {
    const ctx = await cached;
    return ctx?.transform ?? null;
  }

  const promise = (async (): Promise<NCtx | null> => {
    try {
      const resp = await fetch(jsUrl, {
        headers: { 'User-Agent': USER_AGENT },
      });
      if (!resp.ok) return null;
      const playerJs = await resp.text();

      const fnName = extractNFunctionName(playerJs);
      if (!fnName) return null;

      const fnBody = extractNFunctionBody(playerJs, fnName);
      if (!fnBody) return null;

      const transform = buildNTransform(playerJs);
      return { playerJs, fnName, fnBody, transform };
    } catch {
      return null;
    }
  })();

  nCtxCache.set(jsUrl, promise);
  const ctx = await promise;
  return ctx?.transform ?? null;
}

function applyNTransform(
  url: string,
  transform: ((n: string) => string) | null
): string {
  if (!transform) return url;
  try {
    const u = new URL(url);
    const n = u.searchParams.get('n');
    if (n) {
      const transformed = transform(n);
      u.searchParams.set('n', transformed);
      return u.toString();
    }
  } catch { /* ignore */ }
  return url;
}

// ── InnerTube helpers ───────────────────────────────────────────────────────

async function innertubePost(
  endpoint: string,
  body: Record<string, unknown>,
  context?: Record<string, unknown>
): Promise<any> {
  const url = `https://www.youtube.com/youtubei/v1/${endpoint}?key=${INNERTUBE_API_KEY}`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
      'X-Goog-Api-Key': INNERTUBE_API_KEY,
      Origin: 'https://www.youtube.com',
      Referer: 'https://www.youtube.com/',
    },
    body: JSON.stringify({
      context: context ?? INNERTUBE_CONTEXT,
      ...body,
    }),
  });
  if (!resp.ok) throw new Error(`InnerTube ${endpoint} failed: ${resp.status}`);
  return resp.json();
}


function extractVideoId(urlOrId: string): string | null {
  // Already a video ID
  if (/^[a-zA-Z0-9_-]{11}$/.test(urlOrId)) return urlOrId;

  try {
    const u = new URL(urlOrId);
    // youtube.com/watch?v=...
    if (u.searchParams.has('v')) return u.searchParams.get('v');
    // youtu.be/...
    if (u.hostname === 'youtu.be') return u.pathname.slice(1).split('/')[0];
    // youtube.com/shorts/...
    if (u.pathname.startsWith('/shorts/'))
      return u.pathname.split('/')[2]?.split('?')[0] ?? null;
    // youtube.com/embed/...
    if (u.pathname.startsWith('/embed/'))
      return u.pathname.split('/')[2]?.split('?')[0] ?? null;
    // youtube.com/v/...
    if (u.pathname.startsWith('/v/'))
      return u.pathname.split('/')[2]?.split('?')[0] ?? null;
  } catch { /* ignore */ }
  return null;
}

function extractPlaylistId(url: string): string | null {
  try {
    const u = new URL(url);
    return u.searchParams.get('list') ?? null;
  } catch { /* ignore */ }
  return null;
}

function isPlaylistUrl(url: string): boolean {
  return /[?&]list=/.test(url);
}

function thumbUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

interface YtItem {
  id: string;
  title?: string;
  webpage_url?: string;
  uploader?: string;
  duration?: number;
  thumbnail?: string;
  playlist_title?: string | null;
}

// ── /api/resolve ────────────────────────────────────────────────────────────

async function handleResolve(url: string): Promise<{ items: YtItem[] }> {
  // Playlist
  if (isPlaylistUrl(url)) {
    const listId = extractPlaylistId(url);
    if (!listId) throw new YTError('Could not extract playlist ID', 400);

    // Radio/auto-mix → single video
    if (listId.startsWith('RD')) {
      const videoId = extractVideoId(url);
      if (videoId) {
        return {
          items: [
            {
              id: videoId,
              title: undefined,
              webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
              uploader: undefined,
              duration: undefined,
              thumbnail: thumbUrl(videoId),
              playlist_title: null,
            },
          ],
        };
      }
    }

    // Browse playlist via InnerTube (use WEB context — ANDROID_VR may not support playlist browsing)
    const data = await innertubePost('browse', {
      browseId: `VL${listId}`,
    });

    // Try multiple response paths for playlist contents
    const contents = data?.contents;

    // ANDROID_VR returns singleColumnBrowseResultsRenderer
    const singleCol = contents?.singleColumnBrowseResultsRenderer;
    // WEB returns twoColumnBrowseResultsRenderer
    const twoCol = contents?.twoColumnBrowseResultsRenderer;

    const tabs = singleCol?.tabs ?? twoCol?.tabs ?? [];
    const tabContent = tabs?.[0]?.tabRenderer?.content;
    const sectionContents =
      tabContent?.sectionListRenderer?.contents ?? [];

    let videos: any[] = [];
    let playlistTitle: string | null = null;

    // Search through all section contents for playlist items
    for (const section of sectionContents) {
      // Path 1: playlistVideoListRenderer directly (ANDROID_VR format)
      if (section?.playlistVideoListRenderer?.contents) {
        videos = section.playlistVideoListRenderer.contents;
      }
      // Path 2: itemSectionRenderer → playlistVideoListRenderer (WEB format)
      const isec = section?.itemSectionRenderer?.contents;
      if (!videos.length && isec) {
        for (const c of isec) {
          const pvlr = c?.playlistVideoListRenderer;
          if (pvlr?.contents) {
            videos = pvlr.contents;
            break;
          }
        }
      }
      if (videos.length) break;
    }

    // Also check for continuation tokens (playlists > 100 items)
    // For now we handle the first batch

    playlistTitle =
      data?.header?.playlistHeaderRenderer?.title?.simpleText ??
      null;

    const MAX = 300;
    const items: YtItem[] = [];
    for (const item of videos) {
      if (items.length >= MAX) break;
      const v = item.playlistVideoRenderer;
      if (!v) continue;
      const vid = v.videoId;
      if (!vid) continue;
      items.push({
        id: vid,
        title: v.title?.runs?.map((r: any) => r.text).join('') ?? undefined,
        webpage_url: `https://www.youtube.com/watch?v=${vid}`,
        uploader:
          v.shortBylineText?.runs?.[0]?.text ??
          v.longBylineText?.runs?.[0]?.text ??
          undefined,
        duration: v.lengthSeconds ? Number(v.lengthSeconds) : undefined,
        thumbnail: thumbUrl(vid),
        playlist_title: playlistTitle,
      });
    }
    return { items };
  }

  // Single video
  const videoId = extractVideoId(url);
  if (!videoId) throw new YTError('Could not extract video ID', 400);

  const player = await innertubePost('player', { videoId });
  const vid = player?.videoDetails;

  return {
    items: [
      {
        id: videoId,
        title: vid?.title ?? undefined,
        webpage_url: `https://www.youtube.com/watch?v=${videoId}`,
        uploader:
          vid?.author ?? vid?.channelId ?? undefined,
        duration: vid?.lengthSeconds ? Number(vid.lengthSeconds) : undefined,
        thumbnail: vid?.thumbnail?.thumbnails?.slice(-1)?.[0]?.url ?? thumbUrl(videoId),
        playlist_title: null,
      },
    ],
  };
}

// ── /api/info ───────────────────────────────────────────────────────────────

async function handleInfo(url: string) {
  const videoId = extractVideoId(url);
  if (!videoId) throw new YTError('Could not extract video ID', 400);

  const player = await innertubePost('player', { videoId });
  const vid = player?.videoDetails;

  // Try microformat for richer metadata
  const mf = player?.microformat?.playerMicroformatRenderer;

  const year = mf?.publishDate
    ? Number(mf.publishDate.slice(0, 4))
    : mf?.uploadDate
      ? Number(mf.uploadDate.slice(0, 4))
      : null;

  const artist =
    vid?.author ??
    mf?.ownerChannelName ??
    null;

  return {
    description: vid?.shortDescription ?? mf?.description?.simpleText ?? '',
    tags: mf?.tags ?? [],
    year: year || null,
    artist,
    title: vid?.title ?? null,
  };
}

// ── /api/download ───────────────────────────────────────────────────────────

const MIME_MAP: Record<string, string> = {
  mp4: 'audio/mp4',
  m4a: 'audio/mp4',
  webm: 'audio/webm',
  opus: 'audio/webm',
  mp3: 'audio/mpeg',
};

async function handleDownload(
  url: string,
  env: Env
): Promise<Response> {
  const videoId = extractVideoId(url);
  if (!videoId) throw new YTError('Could not extract video ID', 400);

  const player = await innertubePost('player', { videoId });
  const status = player?.playabilityStatus?.status;
  if (status !== 'OK') {
    const reason =
      player?.playabilityStatus?.reason ?? 'Video unavailable';
    throw new YTError(reason, 502);
  }

  const formats = player?.streamingData?.adaptiveFormats ?? [];
  if (!formats.length) throw new YTError('No formats available', 502);

  // Get n-transform
  const nTransform = await getNTransform(env, player);

  // Find best audio format
  let bestAudio: any = null;
  for (const itag of AUDIO_ITAGS) {
    bestAudio = formats.find((f: any) => f.itag === itag);
    if (bestAudio) break;
  }
  if (!bestAudio) {
    // Fallback: any audio-only format
    bestAudio = formats.find(
      (f: any) => f.mimeType?.startsWith('audio/') && f.url
    );
  }
  if (!bestAudio) throw new YTError('No audio format found', 502);

  let streamUrl: string | null = bestAudio.url ?? null;

  // Handle signatureCipher if present
  if (!streamUrl && bestAudio.signatureCipher) {
    const params = new URLSearchParams(bestAudio.signatureCipher);
    const sigUrl = params.get('url');
    const sigS = params.get('s');
    const sigSp = params.get('sp') ?? 'signature';
    if (sigUrl && sigS) {
      // For ANDROID_VR, signatureCipher shouldn't appear, but handle gracefully
      streamUrl = sigUrl;
    }
  }

  if (!streamUrl) throw new YTError('Could not resolve stream URL', 502);

  // Apply n-transform to avoid throttling
  streamUrl = applyNTransform(streamUrl, nTransform);

  // Fetch audio from YouTube CDN
  const audioResp = await fetch(streamUrl, {
    headers: {
      'User-Agent': USER_AGENT,
      Range: 'bytes=0-',
    },
  });

  if (!audioResp.ok) {
    throw new YTError(`CDN fetch failed: ${audioResp.status}`, 502);
  }

  const ext = bestAudio.mimeType?.includes('webm') ? 'webm' : 'm4a';
  const contentType = MIME_MAP[ext] ?? 'audio/mp4';
  const title = player?.videoDetails?.title ?? 'song';
  const safeTitle = title.replace(/[^a-zA-Z0-9 ._-]/g, '').slice(0, 80);

  // Stream audio back to client
  const headers = new Headers(CORS_HEADERS);
  headers.set('Content-Type', contentType);
  headers.set(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(safeTitle)}.${ext}`
  );
  if (audioResp.headers.get('Content-Length')) {
    headers.set('Content-Length', audioResp.headers.get('Content-Length')!);
  }

  return new Response(audioResp.body, { status: 200, headers });
}

// ── Error handling ──────────────────────────────────────────────────────────

class YTError extends Error {
  status: number;
  constructor(msg: string, status = 500) {
    super(msg);
    this.status = status;
  }
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function errorResponse(msg: string, status = 500): Response {
  return jsonResponse({ error: msg }, status);
}

// ── Main handler ────────────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Auth check
    const secret = (env as any).YTDLP_SECRET;
    if (secret && request.method === 'POST') {
      const token = request.headers.get('X-Auth-Token');
      if (token !== secret) return errorResponse('unauthorized', 401);
    }

    try {
      // Route
      if (url.pathname === '/api/ping' && request.method === 'GET') {
        return jsonResponse({ ok: true });
      }

      if (url.pathname === '/api/resolve' && request.method === 'POST') {
        const body = (await request.json()) as { url?: string };
        if (!body.url) return errorResponse('missing url', 400);
        const result = await handleResolve(body.url);
        return jsonResponse(result);
      }

      if (url.pathname === '/api/info' && request.method === 'POST') {
        const body = (await request.json()) as { url?: string };
        if (!body.url) return errorResponse('missing url', 400);
        const result = await handleInfo(body.url);
        return jsonResponse(result);
      }

      if (url.pathname === '/api/download' && request.method === 'POST') {
        const body = (await request.json()) as { url?: string };
        if (!body.url) return errorResponse('missing url', 400);
        return await handleDownload(body.url, env);
      }

      return errorResponse('not found', 404);
    } catch (e: any) {
      const status = e instanceof YTError ? e.status : 500;
      const msg = e?.message ?? 'internal error';
      return errorResponse(msg, status);
    }
  },
};
