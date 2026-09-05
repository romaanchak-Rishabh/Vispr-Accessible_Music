import { mapGenre } from './metadataLookup';

const MODEL = 'gemini-3.5-flash-lite';
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

declare const __GEMINI_API_KEY__: string;

/** Get Gemini API key from env (injected at build time via vite.config.ts) */
export function getGeminiApiKey(): string {
  return __GEMINI_API_KEY__ || '';
}

export interface GeminiMetadata {
  title: string;
  artists: string[];
  album: string | null;
  year: number | null;
  genres: string[];
  language: string | null;
  mood: string | null;
  tags: string[];
  isMashup: boolean;
  isRemix: boolean;
  remixer: string | null;
}

const SYSTEM_PROMPT = `You are a music metadata expert. Given a song title and any available context (artist, description, YouTube tags, etc.), return a JSON object with:

{
  "title": "corrected/clean song title",
  "artists": ["primary artist", "featured artist 1", "featured artist 2", ...],
  "album": "album name. If the song is from a movie/film, use the movie name as the album. If unknown, null",
  "year": 2024 or null,
  "genres": ["primary genre", "secondary genre", "more if needed"],
  "language": "primary language",
  "mood": "e.g. upbeat, melancholic, romantic, energetic, calm, sad, party, devotional",
  "tags": ["tag1", "tag2", ...],
  "isMashup": true/false,
  "isRemix": true/false,
  "remixer": "remixer/DJ name if remix, else null"
}

Rules:
- List ALL artists you can identify - primary, featured, duet partners, remixers, mashup creators. Be exhaustive.
- For mashups: list ALL artists from ALL songs in the mashup. Set isMashup: true. The mashup creator/editor goes in "remixer".
- For remixes: original artist first in artists array, remixer name in "remixer" field. Set isRemix: true.
- For live versions: keep original artist, note "live" in tags.
- For Bollywood/Indian: if the song is from a movie, the movie name IS the album.
- Genres: provide as many as accurately describe the song (at least 1, up to 4-5 if needed).
- Mood: identify the emotional tone of the song.
- Tags: freeform labels like "party", "road trip", "heartbreak", "wedding", "dance", "acoustic", etc.
- If unsure about a field, use null. Return ONLY the JSON, no explanation.`;

function parseResponse(text: string): GeminiMetadata | null {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const raw = JSON.parse(jsonMatch[0]);
    return {
      title: typeof raw.title === 'string' ? raw.title : '',
      artists: Array.isArray(raw.artists) ? raw.artists.filter((a: unknown) => typeof a === 'string') : [],
      album: typeof raw.album === 'string' ? raw.album : null,
      year: typeof raw.year === 'number' ? raw.year : null,
      genres: Array.isArray(raw.genres) ? raw.genres.filter((g: unknown) => typeof g === 'string') : [],
      language: typeof raw.language === 'string' ? raw.language : null,
      mood: typeof raw.mood === 'string' ? raw.mood : null,
      tags: Array.isArray(raw.tags) ? raw.tags.filter((t: unknown) => typeof t === 'string') : [],
      isMashup: raw.isMashup === true,
      isRemix: raw.isRemix === true,
      remixer: typeof raw.remixer === 'string' ? raw.remixer : null,
    };
  } catch {
    return null;
  }
}

export async function fetchGeminiMetadata(
  apiKey: string,
  title: string,
  uploader?: string,
  description?: string,
  tags?: string[],
  signal?: AbortSignal
): Promise<GeminiMetadata | null> {
  if (!apiKey || !title) { console.warn('[gemini] no apiKey or title', { apiKey: !!apiKey, title }); return null; }

  const userMsg = [
    `Title: ${title}`,
    uploader ? `Channel/Artist: ${uploader}` : null,
    description ? `Description: ${description}` : null,
    tags?.length ? `Tags: ${tags.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const body = {
    contents: [{ parts: [{ text: `${SYSTEM_PROMPT}\n\n${userMsg}` }] }],
    generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
  };

  try {
    const resp = await fetch(`${ENDPOINT}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal,
    });

    if (!resp.ok) { console.warn('[gemini] API error', resp.status, await resp.text().catch(() => '')); return null; }

    const data = await resp.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    return parseResponse(text);
  } catch (e) {
    console.warn('[gemini] fetch failed', e);
    return null;
  }
}

/** Map Gemini genres to our genre system */
export function mapGeminiGenres(genres: string[]): { genre1?: string; genre2?: string } {
  const mapped = genres.map(mapGenre).filter(Boolean);
  const unique = [...new Set(mapped)];
  return {
    genre1: unique[0] || undefined,
    genre2: unique[1] || undefined,
  };
}
