import type { Track } from '../types';
import { getTrackProfile } from './classifier';

/* ── types ───────────────────────────────────────────────────────────── */

export interface EmbeddingResult {
  id: string;
  vector: Float32Array;
}

/* ── model singleton ─────────────────────────────────────────────────── */

let modelPromise: Promise<any> | null = null;
let modelReady = false;

export async function loadModel(): Promise<void> {
  if (modelReady) return;
  if (!modelPromise) {
    modelPromise = (async () => {
      const tf = await import('@tensorflow/tfjs');
      await tf.setBackend('wasm');
      await tf.ready();
      const use = await import('@tensorflow-models/universal-sentence-encoder');
      const m = await use.load();
      modelReady = true;
      return m;
    })();
  }
  await modelPromise;
}

export function isModelReady(): boolean {
  return modelReady;
}

/* ── text preparation ────────────────────────────────────────────────── */

function buildEmbeddingText(track: Track): string {
  const profile = getTrackProfile(track);
  const parts = [
    track.title,
    'by',
    track.artist,
  ];
  if (track.album) parts.push('album', track.album);
  if (profile.genre1 !== 'unknown') parts.push('genre', profile.genre1);
  if (profile.genre2 !== 'unknown') parts.push('style', profile.genre2);
  if (profile.era !== 'unknown') parts.push('era', profile.era);
  return parts.join(' ');
}

/* ── idb cache ───────────────────────────────────────────────────────── */

const DB_NAME = 'vispr-embeddings';
const STORE_NAME = 'vectors';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function getCached(id: string): Promise<Float32Array | null> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(id);
      req.onsuccess = () => {
        const raw = req.result;
        if (raw) {
          resolve(new Float32Array(raw));
        } else {
          resolve(null);
        }
      };
      req.onerror = () => resolve(null);
      tx.oncomplete = () => db.close();
    });
  } catch {
    return null;
  }
}

async function setCached(id: string, vector: Float32Array): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(vector.buffer, id);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    });
  } catch {
    // silent fail — cache is optional
  }
}

async function getAllCached(): Promise<Map<string, Float32Array>> {
  const map = new Map<string, Float32Array>();
  try {
    const db = await openDb();
    return new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          map.set(cursor.key as string, new Float32Array(cursor.value));
          cursor.continue();
        }
      };
      tx.oncomplete = () => { db.close(); resolve(map); };
      tx.onerror = () => { db.close(); resolve(map); };
    });
  } catch {
    return map;
  }
}

/* ── embedding generation ────────────────────────────────────────────── */

export async function embedTrack(track: Track): Promise<Float32Array> {
  const cached = await getCached(track.id);
  if (cached) return cached;

  await loadModel();
  const model = await modelPromise!;
  const text = buildEmbeddingText(track);
  const embeddings = await model.embed([text]);
  const vec = (await embeddings.data()) as Float32Array;
  embeddings.dispose();

  await setCached(track.id, vec);
  return vec;
}

export async function embedTracks(
  tracks: Track[],
  onProgress?: (done: number, total: number) => void
): Promise<Map<string, Float32Array>> {
  const result = new Map<string, Float32Array>();

  // Load cached vectors first
  const cached = await getAllCached();
  const toEmbed: Track[] = [];

  for (const t of tracks) {
    const c = cached.get(t.id);
    if (c) {
      result.set(t.id, c);
    } else {
      toEmbed.push(t);
    }
  }

  if (toEmbed.length === 0) {
    onProgress?.(tracks.length, tracks.length);
    return result;
  }

  await loadModel();
  const model = await modelPromise!;

  const BATCH = 32;
  let done = result.size;

  for (let i = 0; i < toEmbed.length; i += BATCH) {
    const batch = toEmbed.slice(i, i + BATCH);
    const texts = batch.map(buildEmbeddingText);
    const embeddings = await model.embed(texts);
    const data = await embeddings.data();
    const dim = data.length / batch.length;

    for (let j = 0; j < batch.length; j++) {
      const vec = data.slice(j * dim, (j + 1) * dim) as unknown as Float32Array;
      result.set(batch[j].id, vec);
      await setCached(batch[j].id, vec);
    }

    embeddings.dispose();
    done += batch.length;
    onProgress?.(done, tracks.length);
  }

  return result;
}

/* ── cosine similarity ───────────────────────────────────────────────── */

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/* ── centroid of embeddings ──────────────────────────────────────────── */

export function centroid(vectors: Float32Array[]): Float32Array | null {
  if (vectors.length === 0) return null;
  const dim = vectors[0].length;
  const avg = new Float32Array(dim);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) avg[i] += v[i];
  }
  const n = vectors.length;
  for (let i = 0; i < dim; i++) avg[i] /= n;
  return avg;
}
