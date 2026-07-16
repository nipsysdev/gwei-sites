// Tests for the L2 (Deno KV) cache tier: read-through, write-behind, TTL
// semantics, and graceful degradation when KV is unavailable.
//
// How KV-down is simulated for tests:
//   The cache module's kv.ts exports `_setKvForTests(handle)` — a clearly
//   underscore-prefixed, documented test-only hook that force-disables the KV
//   tier and resets the lazy handle. This avoids leaking a real test hook into
//   the stable public API (cacheGet/cacheSet/cacheClear/dedupe). The naturally-KV-down
//   case (running without --unstable-kv) is also covered: `hasKv` is false, so
//   L2-specific tests are `ignore`d and the always-run degradation test still
//   passes.
//
// All tests pass under `deno test -A --unstable-kv`. Under `deno test -A`
// (no KV flag) the L2-specific tests are skipped via `ignore: !hasKv`; the
// graceful-degradation tests always run, proving L1-only operation.

import { assert, assertEquals, assertNotEquals } from "jsr:@std/assert@1";
import { stub } from "jsr:@std/testing@1/mock";
import { CACHE_KEYS } from "../constants.ts";
import { _setKvForTests, cacheClear, cacheGet, cacheSet, dedupe } from "../cache.ts";

// Whether the runtime actually exposes Deno.openKv (i.e. --unstable-kv was passed).
const hasKv = typeof Deno.openKv === "function";

// A dedicated KV handle for deterministic test setup/teardown (directly reading
// and writing L2, bypassing the cache module's fire-and-forget paths).
const testKv: Deno.Kv | null = hasKv ? await Deno.openKv() : null;

/** Deterministically flush all cache-prefixed entries from KV (awaitable). */
async function flushKv(): Promise<void> {
  if (!testKv) return;
  const entries = testKv.list({ prefix: [CACHE_KEYS.KV] });
  for await (const entry of entries) {
    await testKv.delete(entry.key);
  }
}

/** Let fire-and-forget KV writes/clears settle (best-effort). */
function tick(ms = 50): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------

Deno.test({
  name: "L1 hit short-circuits — cacheGet never consults KV",
  async fn() {
    cacheClear();
    if (testKv) await flushKv();

    cacheSet("l2:l1hit", "from-l1", 60_000);
    if (testKv) {
      await tick();
      // Tamper with the L2 value directly — cacheGet must still return the L1 value.
      await testKv!.set(
        [CACHE_KEYS.KV, "l2:l1hit"],
        { value: "tampered", expires: Date.now() + 60_000 },
      );
    }

    assertEquals(cacheGet<string>("l2:l1hit"), "from-l1");

    cacheClear();
    if (testKv) await flushKv();
  },
});

Deno.test({
  name: "L1 miss + L2 hit → populates L1 and returns the L2 value",
  ignore: !hasKv,
  async fn() {
    cacheClear();
    await flushKv();

    // Seed L2 directly (bypassing the cache module so L1 stays empty).
    await testKv!.set(
      [CACHE_KEYS.KV, "l2:l2hit"],
      { value: "from-kv", expires: Date.now() + 60_000 },
      { expireIn: 60_000 },
    );

    // Sanity: L1 misses.
    assertEquals(cacheGet("l2:l2hit"), undefined);

    // dedupe should find the L2 hit, NOT call fn, and backfill L1.
    let fnCalls = 0;
    const result = await dedupe("l2:l2hit", () => {
      fnCalls++;
      return Promise.resolve("from-fn");
    });
    assertEquals(result, "from-kv");
    assertEquals(fnCalls, 0);

    // L1 is now populated from the L2 read-through.
    assertEquals(cacheGet<string>("l2:l2hit"), "from-kv");

    cacheClear();
    await flushKv();
  },
});

Deno.test({
  name: "Both L1 and L2 miss → fn runs and its result is returned",
  async fn() {
    cacheClear();
    if (testKv) await flushKv();

    let fnCalls = 0;
    const result = await dedupe("l2:bothmiss", () => {
      fnCalls++;
      return Promise.resolve("from-fn");
    });
    assertEquals(result, "from-fn");
    assertEquals(fnCalls, 1);

    cacheClear();
    if (testKv) await flushKv();
  },
});

Deno.test({
  name: "cacheSet writes to both L1 and L2",
  ignore: !hasKv,
  async fn() {
    cacheClear();
    await flushKv();

    const value = { status: "ref", kind: "ipfs", ref: "bafytest" } as const;
    cacheSet("l2:write", value, 60_000);

    // L1 check (synchronous, always available).
    assertEquals(cacheGet("l2:write"), value);

    // L2 check — wait for the fire-and-forget write to settle.
    await tick();
    const kvEntry = await testKv!.get<{ value: unknown; expires: number }>([
      CACHE_KEYS.KV,
      "l2:write",
    ]);
    assertNotEquals(kvEntry.value, null);
    assertEquals(kvEntry.value!.value, value);

    cacheClear();
    await flushKv();
  },
});

Deno.test({
  name: "TTL semantics: L1 entry expires after the injected short TTL",
  async fn() {
    cacheClear();
    if (testKv) await flushKv();

    cacheSet("l2:ttl", "temp", 20);
    assertEquals(cacheGet("l2:ttl"), "temp");
    await tick(40);
    assertEquals(cacheGet("l2:ttl"), undefined);

    cacheClear();
    if (testKv) await flushKv();
  },
});

Deno.test({
  name: "TTL semantics: L2 read-through treats an expired entry as a miss",
  ignore: !hasKv,
  async fn() {
    cacheClear();
    await flushKv();

    // Seed KV with an already-expired CacheEntry (expires 1s in the past).
    // NOTE: local Deno KV (SQLite) does not proactively expire entries via
    // `expireIn` — only Deno Deploy's cloud KV does. So we test the
    // application-level expiry check (`Date.now() <= l2.expires` in dedupe),
    // which is the logic our code actually owns.
    await testKv!.set(
      [CACHE_KEYS.KV, "l2:expired"],
      { value: "stale", expires: Date.now() - 1_000 },
    );

    // dedupe must NOT return the stale value — it should fall through to fn.
    let fnCalls = 0;
    const result = await dedupe("l2:expired", () => {
      fnCalls++;
      return Promise.resolve("fresh");
    });
    assertEquals(result, "fresh");
    assertEquals(fnCalls, 1);

    cacheClear();
    await flushKv();
  },
});

Deno.test({
  name: "dedupe: concurrent callers share one L2 lookup (single-flight preserved)",
  ignore: !hasKv,
  async fn() {
    cacheClear();
    await flushKv();

    // Pre-seed KV so the first dedupe call hits L2 and never invokes fn.
    await testKv!.set(
      [CACHE_KEYS.KV, "l2:dedupe"],
      { value: "shared-kv", expires: Date.now() + 60_000 },
      { expireIn: 60_000 },
    );

    let fnCalls = 0;
    const expensive = async (): Promise<string> => {
      fnCalls++;
      await tick(10);
      return "from-fn";
    };

    const results = await Promise.all([
      dedupe("l2:dedupe", expensive),
      dedupe("l2:dedupe", expensive),
      dedupe("l2:dedupe", expensive),
    ]);

    assertEquals(results, ["shared-kv", "shared-kv", "shared-kv"]);
    assertEquals(fnCalls, 0);

    cacheClear();
    await flushKv();
  },
});

Deno.test({
  name: "KV-down: all operations work L1-only when KV is force-disabled",
  async fn() {
    _setKvForTests(null);
    try {
      cacheClear();

      // cacheSet → L1 only (KV tier is off).
      cacheSet("l2:down", "v", 60_000);
      assertEquals(cacheGet("l2:down"), "v");

      // dedupe on an L1-miss key → KV unavailable → fn runs.
      let fnCalls = 0;
      const result = await dedupe("l2:down:miss", () => {
        fnCalls++;
        return Promise.resolve("from-fn");
      });
      assertEquals(result, "from-fn");
      assertEquals(fnCalls, 1);

      // cacheClear → L1 cleared (KV no-op).
      cacheClear();
      assertEquals(cacheGet("l2:down"), undefined);

      // Verify KV was never written to while disabled.
      if (testKv) {
        const kvEntry = await testKv!.get([CACHE_KEYS.KV, "l2:down"]);
        assertEquals(kvEntry.value, null);
      }
    } finally {
      _setKvForTests(undefined);
    }

    cacheClear();
    if (testKv) await flushKv();
  },
});

Deno.test({
  name: "cacheClear clears both L1 and L2",
  ignore: !hasKv,
  async fn() {
    cacheClear();
    await flushKv();

    cacheSet("l2:clear1", "v1", 60_000);
    cacheSet("l2:clear2", "v2", 60_000);
    await tick();

    // Sanity: both tiers populated.
    assertEquals(cacheGet("l2:clear1"), "v1");
    assertNotEquals(
      (await testKv!.get([CACHE_KEYS.KV, "l2:clear1"])).value,
      null,
    );

    cacheClear();
    await tick(); // let the fire-and-forget KV clear settle

    // L1 cleared.
    assertEquals(cacheGet("l2:clear1"), undefined);
    assertEquals(cacheGet("l2:clear2"), undefined);

    // L2 cleared.
    assertEquals(
      (await testKv!.get([CACHE_KEYS.KV, "l2:clear1"])).value,
      null,
    );
    assertEquals(
      (await testKv!.get([CACHE_KEYS.KV, "l2:clear2"])).value,
      null,
    );
  },
});

// --- KV write-behind failure (G-8) ---
// A KV handle that OPENED fine but whose .set throws (quota exhausted, region
// partition). cacheSet must stay non-fatal: L1 serves, the failure only warns.

Deno.test({
  name: "KV write-behind failure is non-fatal — L1 serves, failure only warns",
  async fn() {
    const throwingKv = {
      get: () => Promise.resolve({ value: null, versionstamp: null }),
      set: () => Promise.reject(new Error("kv quota exhausted")),
      delete: () => Promise.resolve(),
      list: () => ({
        [Symbol.asyncIterator]: () => ({
          next: () => Promise.resolve({ done: true, value: undefined }),
        }),
      }),
    } as unknown as Deno.Kv;

    _setKvForTests(throwingKv);
    cacheClear();
    const warnCalls: string[] = [];
    using _w = stub(console, "warn", (...a: unknown[]) => void warnCalls.push(String(a[0])));
    try {
      // cacheSet writes L1 synchronously and L2 fire-and-forget — must not throw.
      cacheSet("kvfail:k", "v1", 60_000);
      assertEquals(cacheGet("kvfail:k"), "v1"); // L1 still serves
      await tick(20); // let the fire-and-forget KV set reject + warn

      assert(
        warnCalls.some((m) => m.includes("KV set failed")),
        `expected a "KV set failed" warn, got: ${JSON.stringify(warnCalls)}`,
      );
    } finally {
      _setKvForTests(undefined);
      _setKvForTests(null);
      cacheClear();
      _setKvForTests(undefined);
    }
  },
});
