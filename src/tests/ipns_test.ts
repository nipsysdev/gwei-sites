// Unit tests for IPNS → CIDv1 resolution (src/ipns.ts) and its integration with
// the content proxy.
//
// Resolution is the public-gateway race: header-only GETs across the public
// IPFS gateways, reading `x-ipfs-roots`. Fetch is stubbed via
// `stub(globalThis, "fetch", …)`. To keep caching assertions deterministic
// across the L1/L2 tiers, tests force the KV tier off and reset all state
// through the `setup()` disposable.

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { stub } from "jsr:@std/testing@1/mock";
import { _setKvForTests, cacheClear, cacheSet } from "../cache.ts";
import { CACHE_KEYS, PUBLIC_IPFS_GATEWAYS } from "../constants.ts";
import { proxyContent, resolveIpnsToCid } from "../proxy.ts";

// A realistic base32-multibase CIDv1 (DAG-PB) used across the happy-path tests.
const CID = "bafybeifw2wfz2np6x5q456g3gp3zhxy4pnpklqawjonaxjbwyoaxsc34jm";

/** Resolve a fetch input (string | URL | Request) to its URL string. */
function urlOf(input: URL | Request | string): string {
  return typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
}

/**
 * Build a public-gateway probe response. When `cid` is non-null it is carried in
 * the `x-ipfs-roots` header (the signal the resolver reads); a null `cid` yields
 * a 200 with no roots (a gateway that resolved but exposed nothing).
 */
function gatewayResponse(cid: string | null, status = 200): Response {
  const headers = new Headers();
  if (cid) headers.set("x-ipfs-roots", cid);
  return new Response(cid ? "<h1>ok</h1>" : "", { status, headers });
}

/** Build a minimal IPNS protobuf record (field 1 = "/ipfs/<cid>") for routing V1 tests. */
function makeIpnsRecord(cid: string): Uint8Array {
  const value = new TextEncoder().encode(`/ipfs/${cid}`);
  return new Uint8Array([0x0a, value.length, ...value]);
}

/** A routing V1 response (raw protobuf IPNS record). */
function routingV1Response(cid: string): Response {
  return new Response(makeIpnsRecord(cid) as BodyInit, {
    status: 200,
    headers: { "content-type": "application/vnd.ipfs.ipns-record" },
  });
}

/**
 * Per-test setup: force KV off (deterministic L1-only caching) and clear all
 * caches. The returned disposable restores KV + clears on test-scope exit.
 */
function setup(): Disposable {
  _setKvForTests(null);
  cacheClear();
  return {
    [Symbol.dispose]() {
      _setKvForTests(undefined);
      cacheClear();
    },
  };
}

// --- core behavior ----------------------------------------------------------

Deno.test("resolveIpnsToCid: returns the CID from x-ipfs-roots", async () => {
  using _s = setup();
  using _f = stub(globalThis, "fetch", () => Promise.resolve(gatewayResponse(CID)));

  assertEquals(await resolveIpnsToCid("k51qziRoots"), CID);
});

Deno.test("resolveIpnsToCid: takes the gateway that yields a CID", async () => {
  using _s = setup();
  // Every gateway returns 200; only ipfs.io carries roots. The race must pick
  // the one that yields a CID rather than collapsing to null.
  using _f = stub(globalThis, "fetch", (input: URL | Request | string) => {
    const url = urlOf(input);
    return Promise.resolve(
      url.startsWith("https://ipfs.io/") ? gatewayResponse(CID) : gatewayResponse(null),
    );
  });

  assertEquals(await resolveIpnsToCid("k51qziPick"), CID);
});

Deno.test("resolveIpnsToCid: returns null when no gateway exposes roots", async () => {
  using _s = setup();
  using _f = stub(globalThis, "fetch", () => Promise.resolve(gatewayResponse(null)));

  assertEquals(await resolveIpnsToCid("k51qziNoRoots"), null);
});

Deno.test("resolveIpnsToCid: returns null when all gateways error", async () => {
  using _s = setup();
  using _f = stub(globalThis, "fetch", () => Promise.resolve(gatewayResponse(null, 503)));

  assertEquals(await resolveIpnsToCid("k51qziAllErr"), null);
});

Deno.test("resolveIpnsToCid: routing V1 resolves without hitting gateways", async () => {
  using _s = setup();
  let gatewayCalls = 0;
  using _f = stub(
    globalThis,
    "fetch",
    (input: URL | Request | string) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("delegated-ipfs.dev")) {
        return Promise.resolve(routingV1Response(CID));
      }
      gatewayCalls++;
      return Promise.resolve(gatewayResponse(null));
    },
  );
  assertEquals(await resolveIpnsToCid("k51qziRouted"), CID);
  assertEquals(gatewayCalls, 0); // routing V1 succeeded — gateway race never ran
});

Deno.test("resolveIpnsToCid: routing V1 failure falls back to gateway race", async () => {
  using _s = setup();
  let routingCalls = 0;
  using _f = stub(
    globalThis,
    "fetch",
    (input: URL | Request | string) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (url.includes("delegated-ipfs.dev")) {
        routingCalls++;
        return Promise.resolve(new Response("", { status: 500 }));
      }
      return Promise.resolve(gatewayResponse(CID));
    },
  );
  assertEquals(await resolveIpnsToCid("k51qziFallback"), CID);
  assertEquals(routingCalls, 1); // routing V1 was tried and failed
});

Deno.test("resolveIpnsToCid: a network failure returns null without throwing", async () => {
  using _s = setup();
  using _f = stub(
    globalThis,
    "fetch",
    () =>
      Promise.reject(
        new DOMException("the fetch operation was timed out", "TimeoutError"),
      ),
  );

  assertEquals(await resolveIpnsToCid("k51qziNetFail"), null);
});

Deno.test("resolveIpnsToCid: etag fallback extracts the CID", async () => {
  using _s = setup();
  // No x-ipfs-roots, but the CID is in etag (as Filebase returns it).
  using _f = stub(
    globalThis,
    "fetch",
    () =>
      Promise.resolve(
        new Response("<h1>ok</h1>", { status: 200, headers: { etag: `"${CID}"` } }),
      ),
  );

  assertEquals(await resolveIpnsToCid("k51qziEtag"), CID);
});

Deno.test("resolveIpnsToCid: a CIDv0 root is rejected (falls back to IPNS)", async () => {
  using _s = setup();
  using _f = stub(
    globalThis,
    "fetch",
    () =>
      Promise.resolve(
        new Response("ok", {
          status: 200,
          headers: { "x-ipfs-roots": "QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG" },
        }),
      ),
  );

  // CIDv0 intentionally does not match — only CIDv1 is acted upon.
  assertEquals(await resolveIpnsToCid("k51qziV0Root"), null);
});

Deno.test("resolveIpnsToCid: a synchronous throw in a probe never hangs the race", async () => {
  using _s = setup();
  // fetch throwing synchronously (before returning a Promise) must not strand
  // `pending` — the race must still settle to null, not hang forever.
  using _f = stub(globalThis, "fetch", () => {
    throw new Error("sync boom");
  });
  const hung = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("race hung — pending never reached 0")), 1000)
  );
  assertEquals(await Promise.race([resolveIpnsToCid("k51qziSyncThrow"), hung]), null);
});

Deno.test("resolveIpnsToCid: an aborted caller does not poison the cache", async () => {
  using _s = setup();
  const peerId = "k51qziAbort";
  let calls = 0;
  // First batch (aborted probe set) yields no CID; the retry batch yields the CID.
  using _f = stub(globalThis, "fetch", () => {
    calls++;
    return Promise.resolve(
      calls <= PUBLIC_IPFS_GATEWAYS.length + 1 ? gatewayResponse(null) : gatewayResponse(CID),
    );
  });
  const ctrl = new AbortController();
  ctrl.abort();
  assertEquals(await resolveIpnsToCid(peerId, ctrl.signal), null);
  const afterAbort = calls;
  // Next (non-aborted) request re-runs the race — the aborted null was NOT cached.
  assertEquals(await resolveIpnsToCid(peerId), CID);
  assert(calls > afterAbort); // new fetches ran → cache was not poisoned
});

// --- caching + single-flight ------------------------------------------------

Deno.test("resolveIpnsToCid: a second call within TTL is served from cache (no new fetch)", async () => {
  using _s = setup();
  const peerId = "k51qziCache";
  let calls = 0;
  using _f = stub(globalThis, "fetch", () => {
    calls++;
    return Promise.resolve(gatewayResponse(CID));
  });

  assertEquals(await resolveIpnsToCid(peerId), CID);
  const firstCalls = calls;
  // Within TTL: served from L1, no new gateway probes.
  assertEquals(await resolveIpnsToCid(peerId), CID);
  assertEquals(calls, firstCalls);

  // Force L1 expiry (KV is off in tests) and confirm a fresh race runs.
  cacheSet(CACHE_KEYS.IPNS_CID + peerId, CID, -1);
  assertEquals(await resolveIpnsToCid(peerId), CID);
  assert(calls > firstCalls);
});

Deno.test("resolveIpnsToCid: a failed race is cached so a burst doesn't amplify", async () => {
  using _s = setup();
  const peerId = "k51qziNegCache";
  let calls = 0;
  using _f = stub(globalThis, "fetch", () => {
    calls++;
    return Promise.resolve(gatewayResponse(null));
  });

  assertEquals(await resolveIpnsToCid(peerId), null);
  const firstCalls = calls;
  // Negative result cached → no second round of probes within the TTL.
  assertEquals(await resolveIpnsToCid(peerId), null);
  assertEquals(calls, firstCalls);
});

Deno.test("resolveIpnsToCid: concurrent calls for the same peer share one race", async () => {
  using _s = setup();
  const peerId = "k51qziSingle";
  let calls = 0;
  using _f = stub(globalThis, "fetch", () => {
    calls++;
    // Delay so both calls are guaranteed to be in-flight together.
    return new Promise<Response>((resolve) => setTimeout(() => resolve(gatewayResponse(CID)), 10));
  });

  const [a, b] = await Promise.all([
    resolveIpnsToCid(peerId),
    resolveIpnsToCid(peerId),
  ]);

  assertEquals([a, b], [CID, CID]);
  // Single-flight coalesced the two concurrent calls into one race: exactly one
  // fan-out across the gateway list, not two.
  assertEquals(calls, PUBLIC_IPFS_GATEWAYS.length + 1);
});

// --- integration with proxyContent ------------------------------------------

Deno.test("proxyContent(ipns): a resolved CID is fetched via the IPFS path", async () => {
  using _s = setup();
  let gatewayUrl = "";
  using _f = stub(
    globalThis,
    "fetch",
    (input: URL | Request | string) => {
      const url = urlOf(input);
      if (url.includes("/ipns/")) {
        // Resolver probe — return the resolved CID via x-ipfs-roots.
        return Promise.resolve(gatewayResponse(CID));
      }
      // Content fetch lands on the cacheable IPFS path with the resolved CID.
      gatewayUrl = url;
      return Promise.resolve(new Response("<h1>ok</h1>", { status: 200 }));
    },
  );

  const res = await proxyContent("ipns", "k51qziPeer", "name.gwei", "/", "", "*/*");

  assertEquals(res?.status, 200);
  assertStringIncludes(gatewayUrl, "/ipfs/");
  assertStringIncludes(gatewayUrl, CID);
  assertEquals(gatewayUrl.includes("/ipns/"), false);
  assertEquals(res?.headers.get("x-ipfs-cid"), CID);
});

Deno.test("proxyContent(ipns): falls back to the IPNS path when the race yields no CID", async () => {
  using _s = setup();
  const peerId = "k51qziFallback";
  let gatewayUrl = "";
  using _f = stub(
    globalThis,
    "fetch",
    (input: URL | Request | string) => {
      const url = urlOf(input);
      gatewayUrl = url;
      // Every gateway returns 200 with no roots: the race recovers no CID, so
      // proxyContent serves the original IPNS path verbatim.
      return Promise.resolve(new Response("<h1>ok</h1>", { status: 200 }));
    },
  );

  const res = await proxyContent("ipns", peerId, "name.gwei", "/", "", "*/*");

  assertEquals(res?.status, 200);
  assertStringIncludes(gatewayUrl, "/ipns/");
  assertStringIncludes(gatewayUrl, peerId);
  assertEquals(gatewayUrl.includes("/ipfs/"), false);
  assertEquals(res?.headers.get("x-ipns-name"), peerId);
});
