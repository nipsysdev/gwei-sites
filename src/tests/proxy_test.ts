// Unit tests for the content proxy: first-success racing, 304 acceptance,
// and the all-fail → null path.

import { assertEquals } from "jsr:@std/assert@1";
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
