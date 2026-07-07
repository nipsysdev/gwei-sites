// In-process memory cache with TTL expiry, single-flight stampede protection,
// and a hard LRU size bound. This is an L1 cache that lives for the duration
// of the process (5s-10min on Deno Deploy). It absorbs burst traffic for hot
// keys and deduplicates concurrent requests for the same key.

import { MEM_CACHE_MAX, MEM_CACHE_TTL } from "./constants.ts";
import type { CacheEntry } from "./types.ts";

// LRU-ordered cache entries. Map iteration order goes least→most recently used;
// reads refresh recency by re-inserting the entry (see memGet).
const store = new Map<string, CacheEntry<unknown>>();

// In-flight promises keyed by cache key — prevents cache stampede by ensuring
// only one resolution runs at a time per key; concurrent callers share the result.
const inflight = new Map<string, Promise<unknown>>();

/**
 * Get a value from the memory cache if it exists and hasn't expired.
 * Returns `undefined` on miss or expiry (expired entries are pruned). A hit
 * refreshes the entry's recency so it survives LRU eviction.
 */
export function memGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return undefined;
  }
  // Refresh recency: re-insert to move to the end of iteration order.
  store.delete(key);
  store.set(key, entry);
  return entry.value as T;
}

/**
 * Store a value in the memory cache with an optional custom TTL (milliseconds).
 * If the cache exceeds the size limit, expired entries are pruned first, then
 * least-recently-used entries are evicted until back under the hard cap.
 */
export function memSet<T>(key: string, value: T, ttlMs: number = MEM_CACHE_TTL): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
  if (store.size > MEM_CACHE_MAX) prune();
}

/** Prune expired entries, then evict least-recently-used entries back to the cap. */
function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now > v.expires) store.delete(k);
  }
  while (store.size > MEM_CACHE_MAX) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/**
 * Single-flight wrapper: if a promise for `key` is already in-flight, return
 * the existing promise instead of starting a new fetch. This prevents cache
 * stampedes where 100 concurrent requests for a cold key each trigger a full
 * resolution. The in-flight entry is cleared when the promise settles
 * (on both fulfillment and rejection, so a failure allows immediate retry).
 */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;
  const promise = fn().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/** Clear the entire memory cache (useful for testing). */
export function memClear(): void {
  store.clear();
  inflight.clear();
}
