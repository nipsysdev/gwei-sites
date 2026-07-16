// Tests for stale-while-revalidate (SWR): fresh/stale/past-stale windows,
// single-flight of background refreshes, error swallowing, backward compat with
// old-format entries, and staleUntil computation.
//
// Time-dependent tests use SHORT real TTLs (50ms fresh → 100ms stale at factor
// 2.0) with await sleeps — simpler than a fake-clock seam. Margins are wide
// enough to absorb timer jitter. L1 is made deterministic via
// `_setKvForTests(null)` so no cross-isolate KV interferes.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { CACHE_KEYS, SWR_STALE_FACTOR, TTL } from "../constants.ts";
import { _inflightSizeForTests, _setKvForTests, cacheClear, cacheSet, dedupe } from "../cache.ts";
import type { CacheEntry } from "../types.ts";

const hasKv = typeof Deno.openKv === "function";
const testKv: Deno.Kv | null = hasKv ? await Deno.openKv() : null;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function flushKv(): Promise<void> {
  if (!testKv) return;
  const entries = testKv.list({ prefix: [CACHE_KEYS.KV] });
  for await (const entry of entries) {
    await testKv.delete(entry.key);
  }
}

// TTL used across the SWR time-dependent tests: 50ms fresh, 100ms stale (×2.0).
const FRESH_MS = 50;

/** Reset hooks + clear cache before each L1-only test. */
function setupL1(): void {
  _setKvForTests(null);
  cacheClear();
}

// ---------------------------------------------------------------------------

Deno.test("SWR: fresh window returns fresh value, no background refresh", async () => {
  setupL1();
  try {
    cacheSet("swr:fresh", "fresh-val", FRESH_MS);

    let fnCalls = 0;
    const result = await dedupe("swr:fresh", () => {
      fnCalls++;
      return Promise.resolve("should-not-call");
    });

    assertEquals(result, "fresh-val");
    assertEquals(fnCalls, 0); // no refresh — entry is still fresh
  } finally {
    _setKvForTests(undefined);
  }
});

Deno.test("SWR: stale window serves stale immediately + triggers ONE background refresh", async () => {
  setupL1();
  try {
    cacheSet("swr:stale-single", "old", FRESH_MS);
    await sleep(75); // stale: 50 < 75 < 100

    let fnCalls = 0;
    let resolveBg!: () => void;
    const bgStarted = new Promise<void>((r) => {
      resolveBg = r;
    });
    const fn = (): Promise<string> => {
      fnCalls++;
      resolveBg();
      cacheSet("swr:stale-single", "new", FRESH_MS); // mirror resolver.ts
      return Promise.resolve("new");
    };

    const result = await dedupe("swr:stale-single", fn);
    assertEquals(result, "old"); // stale served immediately, NOT "new"

    await bgStarted; // background refresh called fn
    assertEquals(fnCalls, 1); // exactly ONE refresh

    // Let the background refresh settle; entry should now be fresh "new".
    await sleep(5);
    let fnCalls2 = 0;
    const result2 = await dedupe("swr:stale-single", () => {
      fnCalls2++;
      return Promise.resolve("unexpected");
    });
    assertEquals(result2, "new"); // refresh updated the entry
    assertEquals(fnCalls2, 0);
  } finally {
    _setKvForTests(undefined);
  }
});

Deno.test("SWR: N concurrent stale callers → all get stale, exactly ONE refresh", async () => {
  setupL1();
  try {
    cacheSet("swr:concurrent", "old", FRESH_MS);
    await sleep(75); // stale

    let fnCalls = 0;
    const fn = async (): Promise<string> => {
      fnCalls++;
      // Defer cacheSet so the entry isn't overwritten before all concurrent
      // callers have read the stale value (mirrors real async RPC latency).
      await sleep(5);
      cacheSet("swr:concurrent", "new", FRESH_MS);
      return "new";
    };

    const results = await Promise.all([
      dedupe("swr:concurrent", fn),
      dedupe("swr:concurrent", fn),
      dedupe("swr:concurrent", fn),
      dedupe("swr:concurrent", fn),
      dedupe("swr:concurrent", fn),
    ]);

    assertEquals(results, ["old", "old", "old", "old", "old"]);
    assertEquals(fnCalls, 1); // exactly ONE background refresh despite 5 callers
  } finally {
    _setKvForTests(undefined);
  }
});

Deno.test("SWR: past stale window → blocking resolution (fn called, caller blocks)", async () => {
  setupL1();
  try {
    cacheSet("swr:past", "old", FRESH_MS);
    await sleep(130); // past staleUntil (100ms)

    let fnCalls = 0;
    const result = await dedupe("swr:past", () => {
      fnCalls++;
      return Promise.resolve("fresh");
    });

    assertEquals(result, "fresh"); // blocking resolution, NOT stale "old"
    assertEquals(fnCalls, 1);
  } finally {
    _setKvForTests(undefined);
  }
});

Deno.test("SWR: background refresh fn throws → swallowed, stale served, inflight cleared", async () => {
  setupL1();
  try {
    cacheSet("swr:throw", "old", FRESH_MS);
    await sleep(75); // stale

    let fnCalls = 0;
    const failFn = (): Promise<string> => {
      fnCalls++;
      return Promise.reject(new Error("boom"));
    };

    // Stale value returned immediately; background refresh starts.
    const result = await dedupe("swr:throw", failFn);
    assertEquals(result, "old");

    await sleep(10); // let background refresh fail + clear inflight (75+10=85 < 100)
    assertEquals(fnCalls, 1);

    // DIRECT invariant guard: a thrown background refresh MUST clear its inflight
    // slot, or the key becomes unresolvable for the isolate's lifetime. This is
    // the load-bearing line that any dedupe refactor must preserve.
    assertEquals(_inflightSizeForTests(), 0);

    // inflight was cleared by .finally → next request triggers a new refresh.
    // Entry is still stale (fn failed, no cacheSet).
    let fnCalls2 = 0;
    const result2 = await dedupe("swr:throw", () => {
      fnCalls2++;
      cacheSet("swr:throw", "recovered", FRESH_MS);
      return Promise.resolve("recovered");
    });
    assertEquals(result2, "old"); // still stale (new refresh is background)
    await sleep(10);
    assertEquals(fnCalls2, 1); // new refresh ran — inflight was cleared
  } finally {
    _setKvForTests(undefined);
  }
});

Deno.test("SWR: cacheSet writes staleUntil = now + ttlMs * SWR_STALE_FACTOR (behavioral)", async () => {
  setupL1();
  try {
    // 50ms fresh × 2.0 = 100ms stale. Verify the stale window spans [50, 100]ms.
    cacheSet("swr:factor-low", "v", FRESH_MS);
    await sleep(75); // within stale window
    let fnCalls = 0;
    assertEquals(
      await dedupe("swr:factor-low", () => {
        fnCalls++;
        return Promise.resolve("new");
      }),
      "v",
    ); // stale served → staleUntil > 75ms
    await sleep(10);
    assertEquals(fnCalls, 1);

    cacheSet("swr:factor-high", "v", FRESH_MS);
    await sleep(130); // past stale window
    let fnCalls2 = 0;
    assertEquals(
      await dedupe("swr:factor-high", () => {
        fnCalls2++;
        return Promise.resolve("new");
      }),
      "new",
    ); // blocking → staleUntil ≤ 130ms
    assertEquals(fnCalls2, 1);
  } finally {
    _setKvForTests(undefined);
  }
});

Deno.test("SWR: fresh TTLs are unchanged (SWR only extends stale window)", () => {
  assertEquals(TTL.CONTENTHASH_RESOLUTION, 300_000); // 300s — untouched
  assertEquals(SWR_STALE_FACTOR, 2.0); // stale window multiplier
  // SWR adds a stale window AFTER the fresh TTL; it does not change fresh TTLs.
});

// --- KV-gated tests (require --unstable-kv) ---

Deno.test({
  name: "SWR: cacheSet writes staleUntil field to L2 (value > expires)",
  ignore: !hasKv,
  async fn() {
    _setKvForTests(undefined);
    cacheClear();
    await flushKv();
    try {
      const before = Date.now();
      cacheSet("swr:l2-staleuntil", "val", 1000); // 1s fresh, 2s stale
      await sleep(50); // let fire-and-forget KV write settle

      const res = await testKv!.get<CacheEntry>([CACHE_KEYS.KV, "swr:l2-staleuntil"]);
      assert(res.value !== null, "KV entry should exist");
      const e = res.value!;
      assert(typeof e.staleUntil === "number", "staleUntil must be a number");
      assert(e.staleUntil > e.expires, "staleUntil must extend past fresh expires");
      // stale window ≈ 1000ms (ttlMs × factor). Allow ±200ms for timing.
      const staleWindow = e.staleUntil - e.expires;
      assert(staleWindow >= 800 && staleWindow <= 1200, `staleWindow ~1000ms, got ${staleWindow}`);
      // expires ≈ before + 1000.
      assert(e.expires >= before + 900 && e.expires <= before + 1100);
    } finally {
      cacheClear();
      await flushKv();
    }
  },
});

Deno.test({
  name: "SWR: old-format entry (no staleUntil) → no stale window after L1 backfill",
  ignore: !hasKv,
  async fn() {
    _setKvForTests(undefined);
    cacheClear();
    await flushKv();
    try {
      // Seed L2 with an OLD-format entry (no staleUntil), fresh for 80ms.
      await testKv!.set(
        [CACHE_KEYS.KV, "swr:oldfmt"],
        { value: "legacy", expires: Date.now() + 80 },
        { expireIn: 80 },
      );

      // Backfill L1 via dedupe's L2 read-through (entry is fresh → no fn call).
      let fnCalls = 0;
      assertEquals(
        await dedupe("swr:oldfmt", () => {
          fnCalls++;
          return Promise.resolve("x");
        }),
        "legacy",
      );
      assertEquals(fnCalls, 0);

      // Wait past fresh TTL. Old-format entry has no staleUntil → treated as
      // staleUntil === expires → no stale window → blocking resolution.
      await sleep(110);

      let fnCalls2 = 0;
      const result = await dedupe("swr:oldfmt", () => {
        fnCalls2++;
        return Promise.resolve("refreshed");
      });
      assertEquals(result, "refreshed");
      assertEquals(fnCalls2, 1);
    } finally {
      cacheClear();
      await flushKv();
    }
  },
});
