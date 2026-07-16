// Unit tests for the resolver: positive resolution, cache reuse, and negative
// caching of "none" and RPC-error outcomes.

import { assertEquals } from "jsr:@std/assert@1";
import { stub } from "jsr:@std/testing@1/mock";
import { cacheClear, cacheGet } from "../cache.ts";
import { resolveName } from "../resolver.ts";

const COMPUTE_ID = "0x" + "0".repeat(63) + "1";
const IPFS_PAYLOAD = "e30101701220b6d58b9d35febf61cef8db33f793df1c7b5ea5c0164b9a0ba436c381790b7c4b";
const IPFS_REF = "bafybeifw2wfz2np6x5q456g3gp3zhxy4pnpklqawjonaxjbwyoaxsc34jm";

/** Wrap raw contenthash payload hex in an ABI `bytes` response. */
function abiBytes(payloadHex: string): string {
  const len = payloadHex.length / 2;
  const lenHex = len.toString(16).padStart(64, "0");
  let data = payloadHex;
  while (data.length % 64) data += "0";
  return "0x" +
    "0000000000000000000000000000000000000000000000000000000000000020" +
    lenHex +
    data;
}

/** Stub fetch to return the given sequence of RPC results (one per eth_call). */
function rpcSequenceStub(sequence: string[]) {
  let i = 0;
  return stub(globalThis, "fetch", () => {
    const result = sequence[Math.min(i++, sequence.length - 1)];
    return Promise.resolve(
      new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });
}

Deno.test("resolveName: resolves an IPFS contenthash and returns the decoded ref", async () => {
  cacheClear();
  using _ = rpcSequenceStub([COMPUTE_ID, abiBytes(IPFS_PAYLOAD)]);
  assertEquals(await resolveName("xav.gwei"), {
    status: "ref",
    kind: "ipfs",
    ref: IPFS_REF,
  });
});

Deno.test("resolveName: serves the second call from cache (no new RPC)", async () => {
  cacheClear();
  let calls = 0;
  using _ = stub(globalThis, "fetch", () => {
    calls++;
    return Promise.resolve(
      new Response(
        JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          result: calls === 1 ? COMPUTE_ID : abiBytes(IPFS_PAYLOAD),
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
  });
  await resolveName("cache.gwei");
  const afterFirst = calls;
  await resolveName("cache.gwei");
  assertEquals(calls, afterFirst);
});

Deno.test("resolveName: caches a 'none' result as negative", async () => {
  cacheClear();
  const empty = "0x" + "0".repeat(64) + "0".repeat(64);
  using _ = rpcSequenceStub([COMPUTE_ID, empty]);
  assertEquals(await resolveName("empty.gwei"), { status: "none" });
  assertEquals(cacheGet("resolve:empty.gwei"), { status: "none" });
});

Deno.test("resolveName: caches an RPC failure with a short negative TTL", async () => {
  cacheClear();
  using _ = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response("err", { status: 500 })),
  );
  assertEquals(await resolveName("broken.gwei"), { status: "error" });
  // The error is cached so a burst does not hammer the RPC.
  assertEquals(cacheGet("resolve:broken.gwei"), { status: "error" });
});
