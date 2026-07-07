// Integration tests for the request handler.
//
// These test the full request flow (host parsing → resolution → proxy → response)
// with stubbed `fetch` to simulate RPC and IPFS/Swarm gateway responses.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { stub } from "jsr:@std/testing@1/mock";
import { handle } from "../handler.ts";
import { memClear } from "../cache.ts";

/** Reset all caches between tests to ensure isolation. */
function resetState() {
  memClear();
}

/** Build a valid ABI-encoded computeId response (uint256 tokenId). */
const TOKEN_ID = "0x" + "0".repeat(63) + "1";
function computeIdResponse(): string {
  return TOKEN_ID;
}

/** Build a valid ABI-encoded contenthash response for IPFS from raw contenthash hex. */
function contenthashResponse(contenthexHex: string): string {
  const len = contenthexHex.length / 2;
  const lenHex = len.toString(16).padStart(64, "0");
  let data = contenthexHex;
  while (data.length % 64) data += "0";
  return "0x" +
    "0000000000000000000000000000000000000000000000000000000000000020" +
    lenHex +
    data;
}

// IPFS contenthash: e301 + dag-pb(0x70) + sha256(0x12) + len(0x20) + 32-byte hash
const IPFS_HASH = "a".repeat(64);
const IPFS_CONTENTHASH = contenthashResponse("e30101701220" + IPFS_HASH);

// Swarm contenthash: e40101fa011b20 + 32-byte hash
const SWARM_HASH = "b".repeat(64);
const SWARM_CONTENTHASH = contenthashResponse("e40101fa011b20" + SWARM_HASH);

// Empty contenthash (state: none)
const EMPTY_CONTENTHASH = "0x" +
  "0000000000000000000000000000000000000000000000000000000000000020" +
  "0000000000000000000000000000000000000000000000000000000000000000";

// Unsupported codec (IPNS: e50102)
const UNSUPPORTED_CONTENTHASH = contenthashResponse("e50102" + "0".repeat(60));

/** Build a mock RPC JSON response. */
function rpcResponse(result: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Build a mock HTML response from an IPFS gateway. */
function gatewayResponse(body = "<h1>Hello from IPFS</h1>"): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/**
 * Create a fetch stub that routes based on URL:
 *   - RPC endpoints (POST) → return sequence of RPC responses
 *   - IPFS/Swarm gateways (GET) → return gateway content
 */
function createFetchStub(opts: {
  rpcResults?: string[]; // sequential results for each RPC call (computeId then contenthash)
  gatewayOk?: boolean;
  gatewayBody?: string;
  rpcFail?: boolean; // all RPCs return error
}) {
  let rpcCallIndex = 0;
  const rpcResults = opts.rpcResults ?? [computeIdResponse(), IPFS_CONTENTHASH];

  return stub(globalThis, "fetch", (_input: URL | Request | string, _init?: RequestInit) => {
    const urlStr = typeof _input === "string"
      ? _input
      : (_input instanceof URL ? _input.href : _input.url);
    const isRpc = urlStr.includes("0xrpc.io") || urlStr.includes("tenderly") ||
      urlStr.includes("publicnode");

    if (isRpc) {
      if (opts.rpcFail) {
        return Promise.resolve(new Response("error", { status: 500 }));
      }
      const result = rpcResults[rpcCallIndex] ?? rpcResults[rpcResults.length - 1];
      rpcCallIndex++;
      return Promise.resolve(rpcResponse(result));
    }

    // Gateway fetch
    if (opts.gatewayOk === false) {
      return Promise.resolve(new Response("Gateway error", { status: 502 }));
    }
    return Promise.resolve(gatewayResponse(opts.gatewayBody));
  });
}

// ============================================================
// Test: Happy path — IPFS resolution + content proxy
// ============================================================
Deno.test("happy path: resolves IPFS name and proxies content", async () => {
  resetState();
  using _fetchStub = createFetchStub({});

  const req = new Request("http://donnoh.gwei.domains/");
  const res = await handle(req);

  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "Hello from IPFS");
});

// ============================================================
// Test: Security headers are applied to proxied responses
// ============================================================
Deno.test("proxied responses have security headers", async () => {
  resetState();
  using _fetchStub = createFetchStub({});

  const req = new Request("http://donnoh.gwei.domains/");
  const res = await handle(req);

  assertEquals(res.headers.get("x-content-type-options"), "nosniff");
  assertEquals(res.headers.get("x-frame-options"), "SAMEORIGIN");
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
  assertEquals(res.headers.get("strict-transport-security"), "max-age=31536000");
});

// ============================================================
// Test: x-gwei-name and x-ipfs-cid tracking headers
// ============================================================
Deno.test("proxied responses have x-gwei-name and x-ipfs-cid headers", async () => {
  resetState();
  using _fetchStub = createFetchStub({});

  const res = await handle(new Request("http://donnoh.gwei.domains/"));

  assertEquals(res.headers.get("x-gwei-name"), "donnoh.gwei");
  assertEquals(res.headers.get("x-ipfs-cid") !== null, true);
});

// ============================================================
// Test: CDN cache headers are set
// ============================================================
Deno.test("proxied responses have Deno CDN cache headers", async () => {
  resetState();
  using _fetchStub = createFetchStub({});

  const res = await handle(new Request("http://donnoh.gwei.domains/"));

  const cdnCache = res.headers.get("deno-cdn-cache-control");
  assert(cdnCache !== null);
  assertStringIncludes(cdnCache, "s-maxage=300");
  assertStringIncludes(cdnCache, "stale-while-revalidate");
  assertEquals(res.headers.get("deno-cache-tag"), "gwei:donnoh.gwei");
});

// ============================================================
// Test: Resolution cache — second request for same name skips RPC
// ============================================================
Deno.test("resolution cache: second request skips RPC calls", async () => {
  resetState();
  let rpcCallCount = 0;
  using _fetchStub = stub(
    globalThis,
    "fetch",
    (_input: URL | Request | string, _init?: RequestInit) => {
      const urlStr = typeof _input === "string"
        ? _input
        : (_input instanceof URL ? _input.href : _input.url);
      const isRpc = urlStr.includes("0xrpc.io") || urlStr.includes("tenderly") ||
        urlStr.includes("publicnode");

      if (isRpc) {
        rpcCallCount++;
        // computeId → tokenId; contenthash → IPFS
        const result = rpcCallCount === 1 ? computeIdResponse() : IPFS_CONTENTHASH;
        return Promise.resolve(rpcResponse(result));
      }
      return Promise.resolve(gatewayResponse());
    },
  );

  // First request: full resolution (2 RPC calls)
  await handle(new Request("http://donnoh.gwei.domains/"));
  const firstCallCount = rpcCallCount;
  assertEquals(firstCallCount, 2);

  // Second request: should use L1 memory cache (0 additional RPC calls)
  await handle(new Request("http://donnoh.gwei.domains/about"));
  assertEquals(rpcCallCount, 2); // no new RPC calls
});

// ============================================================
// Test: No contenthash set → 404
// ============================================================
Deno.test("no contenthash: returns 404 with helpful message", async () => {
  resetState();
  using _fetchStub = createFetchStub({
    rpcResults: [computeIdResponse(), EMPTY_CONTENTHASH],
  });

  const res = await handle(new Request("http://unset.gwei.domains/"));

  assertEquals(res.status, 404);
  assertStringIncludes(await res.text(), "no website set");
});

// ============================================================
// Test: Unsupported codec → 415
// ============================================================
Deno.test("unsupported codec: returns 415", async () => {
  resetState();
  using _fetchStub = createFetchStub({
    rpcResults: [computeIdResponse(), UNSUPPORTED_CONTENTHASH],
  });

  const res = await handle(new Request("http://ipns.gwei.domains/"));

  assertEquals(res.status, 415);
  assertStringIncludes(await res.text(), "unsupported contenthash");
});

// ============================================================
// Test: Swarm contenthash resolution + proxy
// ============================================================
Deno.test("Swarm contenthash: resolves and proxies", async () => {
  resetState();
  using _fetchStub = createFetchStub({
    rpcResults: [computeIdResponse(), SWARM_CONTENTHASH],
    gatewayBody: "<h1>Hello from Swarm</h1>",
  });

  const res = await handle(new Request("http://swarm.gwei.domains/"));

  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "Hello from Swarm");
  assertEquals(res.headers.get("x-swarm-reference"), SWARM_HASH);
});

// ============================================================
// Test: RPC failure → 502
// ============================================================
Deno.test("RPC failure: returns 502 with no-store", async () => {
  resetState();
  using _fetchStub = createFetchStub({ rpcFail: true });

  const res = await handle(new Request("http://broken.gwei.domains/"));

  assertEquals(res.status, 502);
  assertEquals(res.headers.get("cache-control"), "no-store");
});

// ============================================================
// Test: IPFS gateway unreachable → 504
// ============================================================
Deno.test("gateway unreachable: returns 504", async () => {
  resetState();
  using _fetchStub = createFetchStub({ gatewayOk: false });

  const res = await handle(new Request("http://offline.gwei.domains/"));

  assertEquals(res.status, 504);
  assertEquals(res.headers.get("cache-control"), "no-store");
});

// ============================================================
// Test: Reserved subdomain proxy
// ============================================================
Deno.test("reserved subdomain: transparent proxy passthrough", async () => {
  resetState();
  using _fetchStub = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response("diff page", { status: 200 })),
  );

  const res = await handle(new Request("http://diff.gwei.domains/"));

  assertEquals(res.status, 200);
  assertEquals(await res.text(), "diff page");
});

// ============================================================
// Test: Non-gwei host → 404
// ============================================================
Deno.test("non-gwei host: returns 404", async () => {
  resetState();
  let fetchCalled = false;
  using _fetchStub = stub(globalThis, "fetch", () => {
    fetchCalled = true;
    return Promise.resolve(new Response("should not reach", { status: 200 }));
  });

  const res = await handle(new Request("http://example.com/"));

  assertEquals(res.status, 404);
  assertStringIncludes(await res.text(), "Not a gwei name");
  assertEquals(fetchCalled, false); // no RPC or gateway calls
});

// ============================================================
// Test: Apex gwei.domains → 404
// ============================================================
Deno.test("apex domain: returns 404", async () => {
  resetState();
  const res = await handle(new Request("http://gwei.domains/"));

  assertEquals(res.status, 404);
});

// ============================================================
// Test: Name normalization — uppercase subdomain works
// ============================================================
Deno.test("name normalization: uppercase subdomain resolves correctly", async () => {
  resetState();
  let rpcCallCount = 0;
  using _fetchStub = stub(globalThis, "fetch", (_input: URL | Request | string) => {
    const urlStr = typeof _input === "string"
      ? _input
      : (_input instanceof URL ? _input.href : _input.url);
    if (
      urlStr.includes("0xrpc.io") || urlStr.includes("tenderly") || urlStr.includes("publicnode")
    ) {
      rpcCallCount++;
      return Promise.resolve(
        rpcResponse(rpcCallCount === 1 ? computeIdResponse() : IPFS_CONTENTHASH),
      );
    }
    return Promise.resolve(gatewayResponse());
  });

  const res = await handle(new Request("http://DONNOH.gwei.domains/"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("x-gwei-name"), "donnoh.gwei"); // lowercased
});

// ============================================================
// Test: Health check endpoint
// ============================================================
Deno.test("health check: /.well-known/gateway-status returns JSON", async () => {
  resetState();
  const res = await handle(new Request("http://anything.gwei.domains/.well-known/gateway-status"));

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "application/json; charset=utf-8");
  assertEquals(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assertEquals(body.status, "ok");
  assertEquals(body.service, "gwei-gateway");
});

// ============================================================
// Test: Cache stampede protection — concurrent requests dedup RPC calls
// ============================================================
Deno.test("stampede protection: concurrent requests for same name share one resolution", async () => {
  resetState();
  let rpcCallCount = 0;
  using _fetchStub = stub(globalThis, "fetch", (_input: URL | Request | string) => {
    const urlStr = typeof _input === "string"
      ? _input
      : (_input instanceof URL ? _input.href : _input.url);
    if (
      urlStr.includes("0xrpc.io") || urlStr.includes("tenderly") || urlStr.includes("publicnode")
    ) {
      rpcCallCount++;
      return Promise.resolve(
        rpcResponse(rpcCallCount === 1 ? computeIdResponse() : IPFS_CONTENTHASH),
      );
    }
    return Promise.resolve(gatewayResponse());
  });

  // Fire 5 concurrent requests for the same name
  const results = await Promise.all([
    handle(new Request("http://burst.gwei.domains/")),
    handle(new Request("http://burst.gwei.domains/a")),
    handle(new Request("http://burst.gwei.domains/b")),
    handle(new Request("http://burst.gwei.domains/c")),
    handle(new Request("http://burst.gwei.domains/d")),
  ]);

  // All should succeed
  for (const r of results) {
    assertEquals(r.status, 200);
  }
  // Should have only 2 RPC calls total (1 computeId + 1 contenthash), not 10
  assertEquals(rpcCallCount, 2);
});

// ============================================================
// Test: Different paths share the same resolution cache
// ============================================================
Deno.test("resolution cache: shared across different paths for same name", async () => {
  resetState();
  let rpcCallCount = 0;
  using _fetchStub = stub(globalThis, "fetch", (_input: URL | Request | string) => {
    const urlStr = typeof _input === "string"
      ? _input
      : (_input instanceof URL ? _input.href : _input.url);
    if (
      urlStr.includes("0xrpc.io") || urlStr.includes("tenderly") || urlStr.includes("publicnode")
    ) {
      rpcCallCount++;
      return Promise.resolve(
        rpcResponse(rpcCallCount === 1 ? computeIdResponse() : IPFS_CONTENTHASH),
      );
    }
    return Promise.resolve(gatewayResponse());
  });

  await handle(new Request("http://shared.gwei.domains/"));
  await handle(new Request("http://shared.gwei.domains/about"));
  await handle(new Request("http://shared.gwei.domains/contact"));

  // Only 2 RPC calls (resolution cached across all paths)
  assertEquals(rpcCallCount, 2);
});
