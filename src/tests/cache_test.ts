// Unit tests for the in-process memory cache with TTL and stampede protection.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { dedupe, memClear, memGet, memSet } from "../cache.ts";

Deno.test("memGet/memSet: basic store and retrieve", () => {
  memClear();
  memSet("key1", { data: "hello" });
  const val = memGet<{ data: string }>("key1");
  assertEquals(val, { data: "hello" });
});

Deno.test("memGet: returns undefined for missing key", () => {
  memClear();
  assertEquals(memGet("nonexistent"), undefined);
});

Deno.test("memGet: returns undefined after TTL expiry", async () => {
  memClear();
  // Set with 10ms TTL
  memSet("shortlived", "value", 10);
  assertEquals(memGet("shortlived"), "value");
  // Wait for expiry
  await new Promise((r) => setTimeout(r, 50));
  assertEquals(memGet("shortlived"), undefined);
});

Deno.test("memSet: uses default TTL when not specified", () => {
  memClear();
  memSet("default", "val");
  // Should still be present (default TTL is 30s)
  assertEquals(memGet("default"), "val");
});

Deno.test("dedupe: runs function once for concurrent calls with same key", async () => {
  memClear();
  let callCount = 0;
  const expensive = async (): Promise<string> => {
    callCount++;
    await new Promise((r) => setTimeout(r, 20));
    return "computed";
  };

  // Fire 5 concurrent dedupe calls for the same key
  const results = await Promise.all([
    dedupe("shared", expensive),
    dedupe("shared", expensive),
    dedupe("shared", expensive),
    dedupe("shared", expensive),
    dedupe("shared", expensive),
  ]);

  // All get the same result
  assertEquals(results, ["computed", "computed", "computed", "computed", "computed"]);
  // The underlying function was only called once
  assertEquals(callCount, 1);
});

Deno.test("dedupe: allows new call after previous completes", async () => {
  memClear();
  let callCount = 0;
  const fn = (): Promise<number> => {
    callCount++;
    return Promise.resolve(callCount);
  };

  const r1 = await dedupe("key", fn);
  assertEquals(r1, 1);
  // After completion, the inflight entry is cleared
  const r2 = await dedupe("key", fn);
  assertEquals(r2, 2);
});

Deno.test("dedupe: separate keys run independently", async () => {
  memClear();
  const results = await Promise.all([
    dedupe("a", () => Promise.resolve("A")),
    dedupe("b", () => Promise.resolve("B")),
  ]);
  assertEquals(results, ["A", "B"]);
});

Deno.test("memClear: empties the cache", () => {
  memSet("x", 1);
  memSet("y", 2);
  assert(memGet("x") !== undefined);
  memClear();
  assertEquals(memGet("x"), undefined);
  assertEquals(memGet("y"), undefined);
});
