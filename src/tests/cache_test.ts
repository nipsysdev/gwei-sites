// Unit tests for the in-process memory cache: TTL and single-flight stampede protection.

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import { cacheClear, cacheGet, cacheSet, dedupe } from "../cache.ts";

Deno.test("cacheGet/cacheSet: round-trips a value", () => {
  cacheClear();
  cacheSet("key1", { data: "hello" }, 60_000);
  assertEquals(cacheGet<{ data: string }>("key1"), { data: "hello" });
});

Deno.test("cacheGet: returns undefined for a missing key", () => {
  cacheClear();
  assertEquals(cacheGet("nonexistent"), undefined);
});

Deno.test("cacheGet: returns undefined after TTL expiry", async () => {
  cacheClear();
  cacheSet("shortlived", "value", 10);
  assertEquals(cacheGet("shortlived"), "value");
  await new Promise((r) => setTimeout(r, 50));
  assertEquals(cacheGet("shortlived"), undefined);
});

Deno.test("dedupe: runs the function once for concurrent calls on the same key", async () => {
  cacheClear();
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
  cacheClear();
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
  cacheClear();
  assertEquals(
    await Promise.all([
      dedupe("a", () => Promise.resolve("A")),
      dedupe("b", () => Promise.resolve("B")),
    ]),
    ["A", "B"],
  );
});

Deno.test("cacheClear: empties the cache", () => {
  cacheSet("x", 1, 60_000);
  cacheSet("y", 2, 60_000);
  assertEquals(cacheGet("x"), 1);
  cacheClear();
  assertEquals(cacheGet("x"), undefined);
  assertEquals(cacheGet("y"), undefined);
});
