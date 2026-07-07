// Unit tests for the `eth_call` RPC client: failover, empty-result skipping,
// and the all-fail → null path.

import { assertEquals } from "jsr:@std/assert@1";
import { stub } from "jsr:@std/testing@1/mock";
import { ethCall } from "../rpc.ts";

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

Deno.test("ethCall: returns null when every RPC fails", async () => {
  using _ = stub(
    globalThis,
    "fetch",
    () => Promise.resolve(new Response("err", { status: 500 })),
  );
  assertEquals(await ethCall("0xdata", ["https://rpc.a", "https://rpc.b"]), null);
});
