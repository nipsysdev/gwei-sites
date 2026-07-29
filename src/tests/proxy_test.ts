// Unit tests for the content proxy: sequential failover, 304 acceptance, and the
// all-fail → null path.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { stub } from "jsr:@std/testing@1/mock";
import { proxyContent } from "../proxy.ts";

Deno.test("proxyContent: returns the first successful gateway response", async () => {
  using _ = stub(
    globalThis,
    "fetch",
    () =>
      Promise.resolve(
        new Response("<h1>ok</h1>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
      ),
  );
  const res = await proxyContent("ipfs", "bafyfake", "xav.gwei", "/", "", "*/*");
  assertEquals(res?.status, 200);
  assertEquals(await res?.text(), "<h1>ok</h1>");
  assertEquals(res?.headers.get("x-gwei-name"), "xav.gwei");
  assertEquals(res?.headers.get("x-ipfs-cid"), "bafyfake");
});

Deno.test("proxyContent: percent-encodes non-ASCII names in response headers", async () => {
  using _ = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response("<h1>ok</h1>", { status: 200 })),
  );
  const res = await proxyContent("ipfs", "bafyfake", "🐳.gwei", "/", "", "*/*");
  assertEquals(decodeURIComponent(res?.headers.get("x-gwei-name") ?? ""), "🐳.gwei");
});

Deno.test("proxyContent: accepts 304 Not Modified as a successful response", async () => {
  using _ = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response(null, { status: 304 })),
  );
  const res = await proxyContent("ipfs", "bafyfake", "xav.gwei", "/", "", "*/*");
  assertEquals(res?.status, 304);
});

Deno.test("proxyContent: returns null when all gateways fail", async () => {
  using _ = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response("Gateway error", { status: 502 })),
  );
  assertEquals(await proxyContent("ipfs", "bafyfake", "xav.gwei", "/", "", "*/*"), null);
});

Deno.test("proxyContent: logs each gateway's status on the all-fail path", async () => {
  const warnCalls: string[] = [];
  using _w = stub(console, "warn", (...args: unknown[]) => void warnCalls.push(String(args[0])));
  using _f = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response("not found", { status: 404 })),
  );
  assertEquals(await proxyContent("ipfs", "bafyfake", "xav.gwei", "/", "", "*/*"), null);
  // A definitive 404 across gateways must be traceable, not silently turned into a 504.
  assert(warnCalls.length > 0);
  assert(warnCalls.every((m) => m.includes("[proxy]") && m.includes("404")));
});

Deno.test("proxyContent: only hits the first gateway when it succeeds", async () => {
  let calls = 0;
  using _ = stub(globalThis, "fetch", () => {
    calls++;
    return Promise.resolve(new Response("ok", { status: 200 }));
  });
  await proxyContent("ipfs", "bafyfake", "xav.gwei", "/", "", "*/*");
  assertEquals(calls, 1);
});

Deno.test("proxyContent: falls back to the next gateway when earlier ones fail", async () => {
  let calls = 0;
  using _ = stub(
    globalThis,
    "fetch",
    () => {
      calls++;
      return Promise.resolve(
        calls < 2 ? new Response("err", { status: 502 }) : new Response("ok", { status: 200 }),
      );
    },
  );
  const res = await proxyContent("ipfs", "bafyfake", "xav.gwei", "/", "", "*/*");
  assertEquals(res?.status, 200);
  assertEquals(await res?.text(), "ok");
});

Deno.test("proxyContent: does not pass through hop-by-hop content-encoding", async () => {
  // If an upstream gateway sends `content-encoding: gzip` and Deno's fetch has
  // already decompressed the body, forwarding the header would make the client
  // attempt double-decompression. Assert the proxied response carries no
  // content-encoding / content-length from the upstream.
  using _ = stub(
    globalThis,
    "fetch",
    () =>
      Promise.resolve(
        new Response("<h1>ok</h1>", {
          status: 200,
          headers: {
            "content-type": "text/html",
            "content-encoding": "gzip",
            "content-length": "999",
          },
        }),
      ),
  );
  const res = await proxyContent("ipfs", "bafyfake", "xav.gwei", "/", "", "*/*");
  assertEquals(res?.status, 200);
  assertEquals(res?.headers.get("content-encoding"), null);
  assertEquals(res?.headers.get("content-length"), null);
});

Deno.test("proxyContent: strips Content-Disposition so websites render inline", async () => {
  using _ = stub(
    globalThis,
    "fetch",
    () =>
      Promise.resolve(
        new Response("<h1>ok</h1>", {
          status: 200,
          headers: {
            "content-type": "text/html",
            "content-disposition": "attachment",
          },
        }),
      ),
  );
  const res = await proxyContent("ipfs", "bafyfake", "xav.gwei", "/", "", "*/*");
  assertEquals(res?.status, 200);
  assertEquals(res?.headers.get("content-disposition"), null);
});
