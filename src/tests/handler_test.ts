// Integration tests for the request handler.
//
// These test the full request flow (host parsing → resolution → proxy → response)
// with stubbed `fetch` to simulate RPC and IPFS/IPNS/Swarm gateway responses.
// IPFS/IPNS contenthashes use real published vectors.

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { stub } from "jsr:@std/testing@1/mock";
import { escapeHtml, handle, harden } from "../handler.ts";
import { cacheClear } from "../cache.ts";
import { ConfigBuilder, resetConfig, setConfig } from "../config.ts";

/** Reset all caches between tests to ensure isolation. */
function resetState() {
  cacheClear();
}

/** A valid ABI-encoded computeId response (uint256 tokenId = 1). */
const TOKEN_ID = "0x" + "0".repeat(63) + "1";

/** Wrap raw contenthash payload hex in an ABI `bytes` response. */
function contenthashResponse(payloadHex: string): string {
  const len = payloadHex.length / 2;
  const lenHex = len.toString(16).padStart(64, "0");
  let data = payloadHex;
  while (data.length % 64) data += "0";
  return "0x" +
    "0000000000000000000000000000000000000000000000000000000000000020" +
    lenHex +
    data;
}

// Real IPFS contenthash — encodes CID QmaeMmgMYE5Ro1ojpmNwyLBtBNT86ug52K4LLdoHDEM1XG.
const IPFS_PAYLOAD = "e30101701220b6d58b9d35febf61cef8db33f793df1c7b5ea5c0164b9a0ba436c381790b7c4b";
const IPFS_REF = "bafybeifw2wfz2np6x5q456g3gp3zhxy4pnpklqawjonaxjbwyoaxsc34jm";
const IPFS_CONTENTHASH = contenthashResponse(IPFS_PAYLOAD);

// Real IPNS contenthash — encodes name k2k4r8ng8uzrtqb5ham8kao889m8qezu96z4w3lpinyqghum43veb6n3.
const IPNS_PAYLOAD = "e50101721220a1dc5d90d7272c0fd9150414f14c80c71de5d243c2f23165e2ddb495cbbcd05f";
const IPNS_REF = "k2k4r8ng8uzrtqb5ham8kao889m8qezu96z4w3lpinyqghum43veb6n3";
const IPNS_CONTENTHASH = contenthashResponse(IPNS_PAYLOAD);

// Swarm contenthash: e40101fa011b20 + 32-byte hash.
const SWARM_HASH = "b".repeat(64);
const SWARM_CONTENTHASH = contenthashResponse("e40101fa011b20" + SWARM_HASH);

// Empty contenthash (zero-length bytes → state none).
const EMPTY_CONTENTHASH = "0x" +
  "0000000000000000000000000000000000000000000000000000000000000020" +
  "0000000000000000000000000000000000000000000000000000000000000000";

// Unsupported codec (e601 = multicodec 0xe6, not IPFS/IPNS/Swarm).
const UNSUPPORTED_CONTENTHASH = contenthashResponse("e60101701220" + "0".repeat(64));

/** Build a mock RPC JSON response. */
function rpcResponse(result: string): Response {
  return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result }), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

/** Build a mock gateway response. */
function gatewayResponse(body = "<h1>Hello from IPFS</h1>"): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

/** Whether a URL targets one of the configured RPC endpoints. */
function isRpcUrl(url: string): boolean {
  return url.includes("0xrpc.io") || url.includes("tenderly") || url.includes("publicnode") ||
    url.includes("4everland.org");
}

/** Resolve a fetch input to its URL string. */
function urlOf(input: URL | Request | string): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

/**
 * Create a fetch stub that routes based on URL:
 *   - RPC endpoints (POST) → return a sequence of RPC results (computeId then contenthash)
 *   - IPFS/Swarm gateways (GET) → return gateway content
 */
function createFetchStub(opts: {
  rpcResults?: string[];
  gatewayOk?: boolean;
  gatewayBody?: string;
  rpcFail?: boolean;
}) {
  let rpcCallIndex = 0;
  const rpcResults = opts.rpcResults ?? [TOKEN_ID, IPFS_CONTENTHASH];

  return stub(globalThis, "fetch", (input: URL | Request | string) => {
    const urlStr = urlOf(input);

    if (isRpcUrl(urlStr)) {
      if (opts.rpcFail) return Promise.resolve(new Response("error", { status: 500 }));
      const result = rpcResults[rpcCallIndex] ?? rpcResults[rpcResults.length - 1];
      rpcCallIndex++;
      return Promise.resolve(rpcResponse(result));
    }

    if (opts.gatewayOk === false) {
      return Promise.resolve(new Response("Gateway error", { status: 502 }));
    }
    return Promise.resolve(gatewayResponse(opts.gatewayBody));
  });
}

/**
 * Create a fetch stub that counts RPC calls while serving an IPFS resolution,
 * exposing the count through `state.rpcCalls`.
 */
function ipfsCountingFetchStub(state: { rpcCalls: number }) {
  return stub(globalThis, "fetch", (input: URL | Request | string) => {
    const urlStr = urlOf(input);
    if (isRpcUrl(urlStr)) {
      state.rpcCalls++;
      return Promise.resolve(rpcResponse(state.rpcCalls === 1 ? TOKEN_ID : IPFS_CONTENTHASH));
    }
    return Promise.resolve(gatewayResponse());
  });
}

Deno.test("happy path: resolves an IPFS name and proxies content", async () => {
  resetState();
  using _fetchStub = createFetchStub({});

  const res = await handle(new Request("http://xav.gwei.site/"));

  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "Hello from IPFS");
});

Deno.test("proxied responses carry the security header set", async () => {
  resetState();
  using _fetchStub = createFetchStub({});

  const res = await handle(new Request("http://xav.gwei.site/"));

  assertEquals(res.headers.get("x-content-type-options"), "nosniff");
  assertEquals(res.headers.get("access-control-allow-origin"), "*");
  assertEquals(res.headers.get("strict-transport-security"), "max-age=31536000");
});

Deno.test("proxied responses carry exact tracking headers", async () => {
  resetState();
  using _fetchStub = createFetchStub({});

  const res = await handle(new Request("http://xav.gwei.site/"));

  assertEquals(res.headers.get("x-gwei-name"), "xav.gwei");
  assertEquals(res.headers.get("x-ipfs-cid"), IPFS_REF);
});

Deno.test("proxied responses carry browser + edge cache directives", async () => {
  resetState();
  using _fetchStub = createFetchStub({});

  const res = await handle(new Request("http://xav.gwei.site/"));

  // Browser: short max-age (update freshness) + long SWR (instant reuse).
  const browserCache = res.headers.get("cache-control") ?? "";
  assertStringIncludes(browserCache, "max-age=60");
  assertStringIncludes(browserCache, "stale-while-revalidate=86400");
  // Edge (Deno Deploy CDN): conservative fresh + SWR window.
  const cdnCache = res.headers.get("deno-cdn-cache-control") ?? "";
  assertStringIncludes(cdnCache, "s-maxage=300");
  assertStringIncludes(cdnCache, "stale-while-revalidate");
});

Deno.test("resolution cache: a second request for the same name skips RPC", async () => {
  resetState();
  const state = { rpcCalls: 0 };
  using _fetchStub = ipfsCountingFetchStub(state);

  await handle(new Request("http://xav.gwei.site/"));
  assertEquals(state.rpcCalls, 2);

  // Different path, same name → served from L1, no new RPC calls.
  await handle(new Request("http://xav.gwei.site/about"));
  assertEquals(state.rpcCalls, 2);
});

Deno.test("no contenthash: returns 404 with a helpful message", async () => {
  resetState();
  using _fetchStub = createFetchStub({ rpcResults: [TOKEN_ID, EMPTY_CONTENTHASH] });

  const res = await handle(new Request("http://unset.gwei.site/"));

  assertEquals(res.status, 404);
  assertStringIncludes(await res.text(), "no website set");
});

Deno.test("unknown codec: returns 415", async () => {
  resetState();
  using _fetchStub = createFetchStub({ rpcResults: [TOKEN_ID, UNSUPPORTED_CONTENTHASH] });

  const res = await handle(new Request("http://unknown.gwei.site/"));

  assertEquals(res.status, 415);
  assertStringIncludes(await res.text(), "unsupported contenthash");
});

Deno.test("Swarm contenthash: resolves and proxies", async () => {
  resetState();
  using _fetchStub = createFetchStub({
    rpcResults: [TOKEN_ID, SWARM_CONTENTHASH],
    gatewayBody: "<h1>Hello from Swarm</h1>",
  });

  const res = await handle(new Request("http://swarm.gwei.site/"));

  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "Hello from Swarm");
  assertEquals(res.headers.get("x-swarm-reference"), SWARM_HASH);
});

Deno.test("IPNS contenthash: resolves and proxies", async () => {
  resetState();
  using _fetchStub = createFetchStub({
    rpcResults: [TOKEN_ID, IPNS_CONTENTHASH],
    gatewayBody: "<h1>Hello from IPNS</h1>",
  });

  const res = await handle(new Request("http://mutable.gwei.site/"));

  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "Hello from IPNS");
  assertEquals(res.headers.get("x-ipns-name"), IPNS_REF);
});

Deno.test("RPC failure: returns 502 with no-store", async () => {
  resetState();
  using _fetchStub = createFetchStub({ rpcFail: true });

  const res = await handle(new Request("http://broken.gwei.site/"));

  assertEquals(res.status, 502);
  assertEquals(res.headers.get("cache-control"), "no-store");
});

Deno.test("gateway unreachable: returns 504", async () => {
  resetState();
  using _fetchStub = createFetchStub({ gatewayOk: false });

  const res = await handle(new Request("http://offline.gwei.site/"));

  assertEquals(res.status, 504);
  assertEquals(res.headers.get("cache-control"), "no-store");
});

Deno.test("non-gwei host: returns 404 without calling fetch", async () => {
  resetState();
  let fetchCalled = false;
  using _fetchStub = stub(globalThis, "fetch", () => {
    fetchCalled = true;
    return Promise.resolve(new Response("should not reach", { status: 200 }));
  });

  const res = await handle(new Request("http://example.com/"));

  assertEquals(res.status, 404);
  assertStringIncludes(await res.text(), "Not a gwei name");
  assertEquals(fetchCalled, false);
});

// --- custom-domain aliases -------------------------------------------------

Deno.test("custom domain: resolves the mapped .gwei name and proxies content", async () => {
  resetState();
  setConfig(new ConfigBuilder().customDomains("xav.dev=xav.gwei").build());
  try {
    using _fetchStub = createFetchStub({});

    const res = await handle(new Request("http://xav.dev/"));

    assertEquals(res.status, 200);
    assertStringIncludes(await res.text(), "Hello from IPFS");
    // The mapped name is reported, not the host.
    assertEquals(res.headers.get("x-gwei-name"), "xav.gwei");
  } finally {
    resetConfig();
  }
});

Deno.test("custom domain: shares the resolution cache with the *.gwei.site host", async () => {
  resetState();
  setConfig(new ConfigBuilder().customDomains("xav.dev=xav.gwei").build());
  const state = { rpcCalls: 0 };
  using _fetchStub = ipfsCountingFetchStub(state);
  try {
    // First hit resolves xav.gwei on-chain (computeId + contenthash).
    await handle(new Request("http://xav.gwei.site/"));
    assertEquals(state.rpcCalls, 2);
    // Same name via the alias → served from cache, no new RPC.
    await handle(new Request("http://xav.dev/about"));
    assertEquals(state.rpcCalls, 2);
  } finally {
    resetConfig();
  }
});

Deno.test("custom domain: an unmapped host still returns 404 without fetch", async () => {
  resetState();
  setConfig(new ConfigBuilder().customDomains("xav.dev=xav.gwei").build());
  let fetchCalled = false;
  using _fetchStub = stub(globalThis, "fetch", () => {
    fetchCalled = true;
    return Promise.resolve(new Response("should not reach", { status: 200 }));
  });
  try {
    const res = await handle(new Request("http://other.dev/"));

    assertEquals(res.status, 404);
    assertStringIncludes(await res.text(), "Not a gwei name");
    assertEquals(fetchCalled, false);
  } finally {
    resetConfig();
  }
});

Deno.test("apex domain: serves the homepage", async () => {
  resetState();
  const res = await handle(new Request("http://gwei.site/"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/html; charset=utf-8");
  assertStringIncludes(await res.text(), "the decentralized world");
});

Deno.test("loopback host serves the homepage (local preview)", async () => {
  resetState();
  const res = await handle(new Request("http://localhost:8000/"));
  assertEquals(res.status, 200);
  assertStringIncludes(await res.text(), "the decentralized world");
});

Deno.test("apex homepage: carries SEO + social metadata", async () => {
  const res = await handle(new Request("http://gwei.site/"));
  const body = await res.text();
  assertStringIncludes(body, 'rel="canonical"');
  assertStringIncludes(body, "summary_large_image");
  assertStringIncludes(body, "https://gwei.site/og.png");
  assertStringIncludes(body, "application/ld+json");
});

Deno.test("apex /robots.txt: served as text/plain", async () => {
  const res = await handle(new Request("http://gwei.site/robots.txt"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "text/plain; charset=utf-8");
  assertStringIncludes(await res.text(), "User-agent: *");
});

Deno.test("apex /og.png: served as image/png", async () => {
  const res = await handle(new Request("http://gwei.site/og.png"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/png");
});

Deno.test("apex /favicon.ico: served as the SVG glyph", async () => {
  const res = await handle(new Request("http://gwei.site/favicon.ico"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "image/svg+xml");
});

Deno.test("name normalization: uppercase subdomain resolves lowercased", async () => {
  resetState();
  using _fetchStub = createFetchStub({});

  const res = await handle(new Request("http://XAV.gwei.site/"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("x-gwei-name"), "xav.gwei");
});

Deno.test("health check: /.well-known/health returns JSON", async () => {
  resetState();
  const res = await handle(new Request("http://anything.gwei.site/.well-known/health"));

  assertEquals(res.status, 200);
  assertEquals(res.headers.get("content-type"), "application/json; charset=utf-8");
  assertEquals(res.headers.get("cache-control"), "no-store");
  const body = await res.json();
  assertEquals(body.status, "ok");
  assertEquals(body.service, "gwei-gateway");
});

Deno.test("stampede protection: concurrent requests share one resolution", async () => {
  resetState();
  const state = { rpcCalls: 0 };
  using _fetchStub = ipfsCountingFetchStub(state);

  const results = await Promise.all([
    handle(new Request("http://burst.gwei.site/")),
    handle(new Request("http://burst.gwei.site/a")),
    handle(new Request("http://burst.gwei.site/b")),
    handle(new Request("http://burst.gwei.site/c")),
    handle(new Request("http://burst.gwei.site/d")),
  ]);

  for (const r of results) assertEquals(r.status, 200);
  // Only 2 RPC calls (1 computeId + 1 contenthash), not 10.
  assertEquals(state.rpcCalls, 2);
});

// --- harden / escapeHtml (moved from headers.ts) ----------------------------

Deno.test("escapeHtml: neutralizes all HTML-special characters", () => {
  assertEquals(
    escapeHtml(`<a href="x">a & b</a>`),
    "&lt;a href=&quot;x&quot;&gt;a &amp; b&lt;/a&gt;",
  );
  assertEquals(escapeHtml("it's <ok>"), "it&#39;s &lt;ok&gt;");
});

Deno.test("escapeHtml: stringifies non-string input and passes safe input through", () => {
  assertEquals(escapeHtml(42), "42");
  assertEquals(escapeHtml("plain"), "plain");
  assertEquals(escapeHtml(""), "");
});

Deno.test("harden: applies wildcard CORS onto a Headers object", () => {
  assertEquals(harden(new Headers()).get("access-control-allow-origin"), "*");
});
