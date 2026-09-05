/**
 * Download queue — stores pending YouTube imports in IndexedDB,
 * auto-processes them when the server becomes available.
 */

import { get, set } from 'idb-keyval';

const QUEUE_KEY = 'yt:download-queue';
const CACHE_KEY = 'yt:search-cache';

// ── Queue types ────────────────────────────────────────────────

export interface QueuedImport {
  id: string;            // video ID
  url: string;           // YouTube URL
  title: string;
  artist: string;
  artists?: string[];
  album?: string;
  genre1?: string;
  genre2?: string;
  year?: number;
  mood?: string;
  language?: string;
  tags?: string[];
  songType?: string;
  thumbnail: string;
  duration: number;
  queuedAt: number;      // timestamp
  status: 'pending' | 'downloading' | 'done' | 'failed';
  error?: string;
}

// ── Queue CRUD ─────────────────────────────────────────────────

export async function loadQueue(): Promise<QueuedImport[]> {
  return (await get<QueuedImport[]>(QUEUE_KEY)) ?? [];
}

async function saveQueue(queue: QueuedImport[]): Promise<void> {
  await set(QUEUE_KEY, queue);
}

export async function addToQueue(item: Omit<QueuedImport, 'queuedAt' | 'status'>): Promise<QueuedImport[]> {
  const queue = await loadQueue();
  // Dedup by video ID
  if (queue.some((q) => q.id === item.id)) return queue;
  const entry: QueuedImport = { ...item, queuedAt: Date.now(), status: 'pending' };
  queue.push(entry);
  await saveQueue(queue);
  return queue;
}

export async function removeFromQueue(id: string): Promise<QueuedImport[]> {
  const queue = await loadQueue();
  const filtered = queue.filter((q) => q.id !== id);
  await saveQueue(filtered);
  return filtered;
}

export async function updateQueueItem(id: string, patch: Partial<QueuedImport>): Promise<QueuedImport[]> {
  const queue = await loadQueue();
  const idx = queue.findIndex((q) => q.id === id);
  if (idx >= 0) {
    queue[idx] = { ...queue[idx], ...patch };
    await saveQueue(queue);
  }
  return queue;
}

export async function clearCompletedQueue(): Promise<QueuedImport[]> {
  const queue = await loadQueue();
  const pending = queue.filter((q) => q.status !== 'done');
  await saveQueue(pending);
  return pending;
}

export async function clearPendingQueue(): Promise<QueuedImport[]> {
  const queue = await loadQueue();
  const remaining = queue.filter((q) => q.status === 'downloading' || q.status === 'done');
  await saveQueue(remaining);
  return remaining;
}

// ── Search cache (in-memory + IndexedDB) ──────────────────────

interface CacheEntry {
  query: string;
  results: unknown[];
  timestamp: number;
}

const SEARCH_TTL = 1000 * 60 * 30; // 30 minutes
let memCache: CacheEntry[] = [];

export async function loadSearchCache(): Promise<CacheEntry[]> {
  if (memCache.length > 0) return memCache;
  memCache = (await get<CacheEntry[]>(CACHE_KEY)) ?? [];
  return memCache;
}

export async function getCachedSearch(query: string): Promise<unknown[] | null> {
  const cache = await loadSearchCache();
  const q = query.toLowerCase().trim();
  const entry = cache.find((c) => c.query.toLowerCase() === q);
  if (entry && Date.now() - entry.timestamp < SEARCH_TTL) {
    return entry.results;
  }
  return null;
}

export async function cacheSearchResults(query: string, results: unknown[]): Promise<void> {
  const cache = await loadSearchCache();
  const q = query.toLowerCase().trim();
  const idx = cache.findIndex((c) => c.query.toLowerCase() === q);
  const entry: CacheEntry = { query: q, results, timestamp: Date.now() };
  if (idx >= 0) cache[idx] = entry;
  else cache.push(entry);
  // Prune old entries
  const now = Date.now();
  const fresh = cache.filter((c) => now - c.timestamp < SEARCH_TTL);
  memCache = fresh;
  await set(CACHE_KEY, fresh);
}
