// Unit tests for the `eth_call` RPC client: failover, empty-result skipping,
// and the all-fail → null path. Also covers `buildRpcs` ordering.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { stub } from "jsr:@std/testing@1/mock";
import { buildRpcs, ethCall } from "../rpc.ts";

function jsonResult(result: string | undefined): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

Deno.test("ethCall: returns the result from the first responding RPC", async () => {
  using _ = stub(globalThis, "fetch", () => Promise.resolve(jsonResult("0xabc")));
  assertEquals(await ethCall("0xdata", ["https://rpc.a"]), "0xabc");
});

Deno.test("ethCall: logs the hostname of the serving RPC (no API key leak)", async () => {
  const infoCalls: string[] = [];
  using _w = stub(console, "info", (...args: unknown[]) => void infoCalls.push(String(args[0])));
  using _f = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(jsonResult("0xabc")),
  );
  assertEquals(
    await ethCall("0xdata", ["https://eth-mainnet.4everland.org/v1/SECRET-KEY"]),
    "0xabc",
  );
  // The serving RPC's hostname is logged…
  assert(
    infoCalls.some((m) =>
      m.includes("[rpc]") && m.includes("eth-mainnet.4everland.org") && m.includes("ok")
    ),
  );
  // …and the API key (which lives in the URL path) must NOT leak into the log.
  assert(!infoCalls.some((m) => m.includes("SECRET-KEY")));
});

Deno.test("ethCall: fails over to the next RPC on HTTP error", async () => {
  let i = 0;
  using _ = stub(globalThis, "fetch", () => {
    i++;
    return Promise.resolve(
      i === 1 ? new Response("err", { status: 500 }) : jsonResult("0xwin"),
    );
  });
  assertEquals(await ethCall("0xdata", ["https://rpc.a", "https://rpc.b"]), "0xwin");
});

Deno.test("ethCall: skips empty 0x results and continues to the next RPC", async () => {
  let i = 0;
  using _ = stub(globalThis, "fetch", () => {
    i++;
    return Promise.resolve(jsonResult(i === 1 ? "0x" : "0xreal"));
  });
  assertEquals(await ethCall("0xdata", ["https://rpc.a", "https://rpc.b"]), "0xreal");
});

Deno.test("ethCall: logs and fails over on a JSON-RPC error response", async () => {
  let i = 0;
  const warnCalls: string[] = [];
  using _w = stub(console, "warn", (...args: unknown[]) => void warnCalls.push(String(args[0])));
  using _f = stub(
    globalThis,
    "fetch",
    () => {
      i++;
      return Promise.resolve(
        i === 1
          ? new Response(
            JSON.stringify({
              jsonrpc: "2.0",
              id: 1,
              error: { code: -32005, message: "rate limited" },
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          )
          : jsonResult("0xok"),
      );
    },
  );
  // Fails over to the second RPC despite the first returning HTTP 200.
  assertEquals(await ethCall("0xdata", ["https://rpc.a", "https://rpc.b"]), "0xok");
  // And the JSON-RPC error was logged (not silently swallowed).
  assert(warnCalls.some((m) => m.includes("[rpc]") && m.includes("JSON-RPC error")));
});

Deno.test("ethCall: returns null when every RPC fails", async () => {
  using _ = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response("err", { status: 500 })),
  );
  assertEquals(await ethCall("0xdata", ["https://rpc.a", "https://rpc.b"]), null);
});

// --- buildRpcs: ordered RPC list construction -------------------------------
// The critical property is ORDER: the free key is always tried before the paid
// fallback, and public RPCs are always last. Public RPCs are fixed upstream.

const PRIMARY = "https://eth-mainnet.4everland.org/v1/free-key";
const FALLBACK = "https://eth-mainnet.4everland.org/v1/paid-key";
const FIRST_PUBLIC = "https://0xrpc.io/eth";

Deno.test("buildRpcs: both keys → primary then fallback then public RPCs", () => {
  const rpcs = buildRpcs("free-key", "paid-key");
  assertEquals(rpcs[0], PRIMARY);
  assertEquals(rpcs[1], FALLBACK);
  assertEquals(rpcs[2], FIRST_PUBLIC);
  assertEquals(rpcs.length, 5); // 2 × 4everland + 3 public
});

Deno.test("buildRpcs: only primary key set → primary then public", () => {
  const rpcs = buildRpcs("free-key", "");
  assertEquals(rpcs[0], PRIMARY);
  assertEquals(rpcs[1], FIRST_PUBLIC);
  assertEquals(rpcs.length, 4);
});

Deno.test("buildRpcs: only fallback key set → fallback then public", () => {
  const rpcs = buildRpcs("", "paid-key");
  assertEquals(rpcs[0], FALLBACK);
  assertEquals(rpcs[1], FIRST_PUBLIC);
  assertEquals(rpcs.length, 4);
});

Deno.test("buildRpcs: no keys set → public RPCs only, no 4everland entry", () => {
  const rpcs = buildRpcs("", "");
  assertEquals(rpcs[0], FIRST_PUBLIC);
  assertEquals(rpcs.length, 3);
  assertEquals(rpcs.some((r) => r.includes("4everland")), false);
});
