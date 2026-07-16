import { CACHE_KEYS, SWR_STALE_FACTOR } from "./constants.ts";
import type { CacheEntry } from "./types.ts";

const store = new Map<string, CacheEntry>();

// In-flight promises per key — concurrent callers for the same key share one fetch.
// Also reused by SWR background refreshes to single-flight stale-key revalidation.
const inflight = new Map<string, Promise<unknown>>();

// `undefined` = not yet attempted; `null` = attempted and unavailable; `Deno.Kv` = open.
let kvHandle: Deno.Kv | null | undefined = undefined;

/**
 * Cache-aware single-flight resolution. Fresh L1 → serve directly. Stale L1
 * (SWR) → serve stale immediately + fire ONE background refresh. Otherwise →
 * `resolveShared` (single-flight + L2 read-through + `fn`). SWR applies
 * uniformly to every cached key.
 */
export function dedupe<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const l1 = store.get(key);
  if (l1) {
    const now = Date.now();
    if (isFresh(l1, now)) return Promise.resolve(l1.value as T);
    if (isStale(l1, now)) {
      triggerBackgroundRefresh(key, fn);
      return Promise.resolve(l1.value as T);
    }
    store.delete(key); // past the stale window
  }
  return resolveShared<T>(key, fn);
}

/**
 * Get a value from L1, or undefined on miss/expiry. A stale entry (within the
 * SWR window) is kept and returns undefined, deferring to `dedupe` which serves
 * it stale and triggers a background refresh.
 */
export function cacheGet<T>(key: string): T | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  const now = Date.now();
  if (isFresh(entry, now)) return entry.value as T;
  if (isStale(entry, now)) return undefined; // stale — defer to dedupe (SWR)
  store.delete(key); // past the stale window
  return undefined;
}

/**
 * Store a value with a TTL (ms). Writes to L1 synchronously and to L2 via
 * write-behind (fire-and-forget, non-fatal). Stays `void` so callers are
 * unaffected — true write-through would require making this async.
 */
export function cacheSet<T>(key: string, value: T, ttlMs: number): void {
  const now = Date.now();
  const expires = now + ttlMs;
  const staleUntil = now + ttlMs * SWR_STALE_FACTOR;
  const entry: CacheEntry = { value, expires, staleUntil };
  store.set(key, entry);
  kvSetEntry(key, entry, ttlMs);
}

/** Clear both tiers: L1 synchronously, L2 best-effort (fire-and-forget). Non-fatal. */
export function cacheClear(): void {
  store.clear();
  inflight.clear();
  kvClearAll();
}

/** Within the fresh TTL window — served directly with no refresh. */
function isFresh(entry: CacheEntry, now: number): boolean {
  return now <= entry.expires;
}

/**
 * Past fresh TTL but within the SWR stale window — served stale while a
 * background refresh runs. Backward compat: an entry lacking `staleUntil` (old
 * format) is treated as `staleUntil === expires`, i.e. no stale window.
 */
function isStale(entry: CacheEntry, now: number): boolean {
  return now <= (entry.staleUntil ?? entry.expires);
}

/**
 * Fire-and-forget background refresh for a stale key. Single-flighted via the
 * `inflight` map: concurrent stale-key callers all return stale immediately and
 * exactly ONE refresh runs. The resolver `fn` is expected to call `cacheSet`
 * internally (resolver.ts / proxy.ts both do), which resets both windows.
 *
 * Deno Deploy caveat: background work may not finish if the isolate is recycled
 * — acceptable, the entry stays stale and the next request re-triggers it. We
 * NEVER block the response on this.
 */
function triggerBackgroundRefresh<T>(key: string, fn: () => Promise<T>): void {
  if (inflight.has(key)) return; // a foreground or background resolution is already running

  const refresh = (async (): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      console.warn(
        "cache: background SWR refresh failed:",
        e instanceof Error ? e.message : String(e),
      );
      throw e; // propagate to any caller attached to this inflight promise
    } finally {
      inflight.delete(key); // clear so the next request can retry
    }
  })();

  inflight.set(key, refresh);
  refresh.catch(() => {}); // swallow unhandled rejection if nobody awaits
}

/**
 * Cache-miss path shared by `dedupe`: single-flight + L2 read-through + `fn`.
 * Concurrent callers for the same key attach to one in-flight promise; the first
 * miss does an L2 read-through (backfilling L1 on a fresh hit) before invoking
 * `fn`. The promise is cleared on settle (fulfill OR reject) so a failure allows
 * an immediate retry.
 */
function resolveShared<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const existing = inflight.get(key) as Promise<T> | undefined;
  if (existing) return existing;

  const promise = (async (): Promise<T> => {
    const l2 = await kvGetEntry(key);
    if (l2 && Date.now() <= l2.expires) {
      store.set(key, l2); // backfill L1 with the original wall-clock expiry
      return l2.value as T;
    }
    return fn();
  })().finally(() => inflight.delete(key));
  inflight.set(key, promise);
  return promise;
}

/** Open the KV handle once and reuse it. null = operate without KV (non-fatal). */
async function getKv(): Promise<Deno.Kv | null> {
  if (kvHandle !== undefined) return kvHandle;
  if (typeof Deno.openKv !== "function") {
    kvHandle = null;
    return null;
  }
  try {
    kvHandle = await Deno.openKv();
  } catch (e) {
    console.warn(
      "kv: Deno.openKv failed — running without KV:",
      e instanceof Error ? e.message : String(e),
    );
    kvHandle = null;
  }
  return kvHandle;
}

/** Build a KV key pair `[prefix, key]` from a cache key string. */
function kvKey(key: string): Deno.KvKey {
  return [CACHE_KEYS.KV, key];
}

/** L2 read: returns the stored CacheEntry, or undefined on miss/unavailable. Non-fatal. */
async function kvGetEntry(key: string): Promise<CacheEntry | undefined> {
  const kv = await getKv();
  if (!kv) return undefined;
  try {
    const res = await kv.get<CacheEntry>(kvKey(key));
    return res.value ?? undefined;
  } catch (e) {
    console.warn("cache: KV get failed:", e instanceof Error ? e.message : String(e));
    return undefined;
  }
}

/** L2 write (fire-and-forget): stores a CacheEntry with the matching TTL. Non-fatal. */
function kvSetEntry(key: string, entry: CacheEntry, ttlMs: number): void {
  (async () => {
    const kv = await getKv();
    if (!kv) return;
    try {
      await kv.set(kvKey(key), entry, { expireIn: ttlMs });
    } catch (e) {
      console.warn("cache: KV set failed:", e instanceof Error ? e.message : String(e));
    }
  })();
}

/** L2 clear-all under the cache prefix. Non-fatal. */
function kvClearAll(): void {
  (async () => {
    const kv = await getKv();
    if (!kv) return;
    try {
      const entries = kv.list({ prefix: [CACHE_KEYS.KV] });
      for await (const entry of entries) {
        await kv.delete(entry.key);
      }
    } catch (e) {
      console.warn("cache: KV clear failed:", e instanceof Error ? e.message : String(e));
    }
  })();
}

/**
 * TEST-ONLY: the current number of in-flight resolutions (single-flight map
 * size). Lets tests assert directly that a thrown background refresh clears its
 * inflight slot — the load-bearing invariant that keeps a key retryable after a
 * failed SWR refresh. Not for production use.
 */
export function _inflightSizeForTests(): number {
  return inflight.size;
}

/**
 * TEST-ONLY: inject a KV handle directly (`Deno.Kv` = use it, `null` = force KV
 * unavailable, `undefined` = restore normal lazy-open behavior). Lets tests
 * exercise both the "KV unavailable" and "KV opens fine but operations throw"
 * degradation paths. Not for production use.
 */
export function _setKvForTests(handle: Deno.Kv | null | undefined): void {
  kvHandle = handle;
}
