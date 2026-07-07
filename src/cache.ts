// In-process memory cache with TTL expiry and single-flight stampede protection.
// This is an L1 cache that lives for the duration of the process (5s-10min on
// Deno Deploy). It absorbs burst traffic for hot keys and deduplicates
// concurrent requests for the same key.

import { MEM_CACHE_MAX, MEM_CACHE_TTL } from "./constants.ts";
import type { CacheEntry } from "./types.ts";

const store = new Map<string, CacheEntry<unknown>>();

// In-flight promises keyed by cache key — prevents cache stampede by ensuring
// only one resolution runs at a time per key; concurrent callers share the result.
const inflight = new Map<string, Promise<unknown>>();

/**
 * Get a value from the memory cache if it exists and hasn't expired.
 * Returns `undefined` on miss or expiry (expired entries are pruned).
 */
export function memGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() > entry.expires) {
    store.delete(key);
    return undefined;
  }
  return entry.value as T;
}

/**
 * Store a value in the memory cache with an optional custom TTL.
 * If the cache exceeds the size limit, expired entries are pruned.
 */
export function memSet<T>(key: string, value: T, ttlMs: number = MEM_CACHE_TTL): void {
  store.set(key, { value, expires: Date.now() + ttlMs });
  if (store.size > MEM_CACHE_MAX) prune();
}

/** Remove all expired entries from the cache. */
function prune(): void {
  const now = Date.now();
  for (const [k, v] of store) {
    if (now > v.expires) store.delete(k);
  }
}

/**
 * Single-flight wrapper: if a promise for `key` is already in-flight, return
 * the existing promise instead of starting a new fetch. This prevents cache
 * stampedes where 100 concurrent requests for a cold key each trigger a full
 * resolution. The in-flight entry is cleared when the promise settles.
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
