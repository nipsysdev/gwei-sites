// Unit tests for the in-process memory cache: TTL, LRU hard bound, and
// single-flight stampede protection.

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { MEM_CACHE_MAX } from "../constants.ts";
import { dedupe, memClear, memGet, memSet } from "../cache.ts";

Deno.test("memGet/memSet: round-trips a value", () => {
  memClear();
  memSet("key1", { data: "hello" });
  assertEquals(memGet<{ data: string }>("key1"), { data: "hello" });
});

Deno.test("memGet: returns undefined for a missing key", () => {
  memClear();
  assertEquals(memGet("nonexistent"), undefined);
});

Deno.test("memGet: returns undefined after TTL expiry", async () => {
  memClear();
  memSet("shortlived", "value", 10);
  assertEquals(memGet("shortlived"), "value");
  await new Promise((r) => setTimeout(r, 50));
  assertEquals(memGet("shortlived"), undefined);
});

Deno.test("memSet: uses the default TTL when none is given", () => {
  memClear();
  memSet("default", "val");
  assertEquals(memGet("default"), "val");
});

Deno.test("memSet: evicts least-recently-used entries past the hard cap", () => {
  memClear();
  // Fill exactly to the cap with fresh entries.
  for (let i = 0; i < MEM_CACHE_MAX; i++) memSet(`k${i}`, i, 60_000);
  // Touch k0 so it is most-recently-used and survives eviction.
  assertEquals(memGet("k0"), 0);
  // One more insert pushes past the cap → k1 (the LRU) is evicted.
  memSet("kExtra", 999, 60_000);
  assertEquals(memGet("k0"), 0); // recently used → kept
  assertEquals(memGet("k1"), undefined); // LRU → evicted
  assertEquals(memGet("kExtra"), 999);
});

Deno.test("dedupe: runs the function once for concurrent calls on the same key", async () => {
  memClear();
  let callCount = 0;
  const expensive = async (): Promise<string> => {
    callCount++;
    await new Promise((r) => setTimeout(r, 20));
    return "computed";
  };

  const results = await Promise.all([
    dedupe("shared", expensive),
    dedupe("shared", expensive),
    dedupe("shared", expensive),
    dedupe("shared", expensive),
    dedupe("shared", expensive),
  ]);

  assertEquals(results, ["computed", "computed", "computed", "computed", "computed"]);
  assertEquals(callCount, 1);
});

Deno.test("dedupe: a rejecting function clears inflight and allows retry", async () => {
  memClear();
  let calls = 0;
  const fail = (): Promise<string> => {
    calls++;
    return Promise.reject(new Error("boom"));
  };

  await assertRejects(() => dedupe("flaky", fail), Error, "boom");
  assertEquals(calls, 1);
  // inflight was cleared by `.finally`, so a second call runs again.
  const ok = (): Promise<string> => {
    calls++;
    return Promise.resolve("ok");
  };
  assertEquals(await dedupe("flaky", ok), "ok");
  assertEquals(calls, 2);
});

Deno.test("dedupe: separate keys run independently", async () => {
  memClear();
  assertEquals(
    await Promise.all([
      dedupe("a", () => Promise.resolve("A")),
      dedupe("b", () => Promise.resolve("B")),
    ]),
    ["A", "B"],
  );
});

Deno.test("memClear: empties the cache", () => {
  memSet("x", 1);
  memSet("y", 2);
  assertEquals(memGet("x"), 1);
  memClear();
  assertEquals(memGet("x"), undefined);
  assertEquals(memGet("y"), undefined);
});
