// Unit tests for contenthash codec decoding.

import { assertEquals } from "jsr:@std/assert@1";
import { decodeContenthash } from "../codec.ts";

/** Build a valid ABI-encoded contenthash response from raw contenthash hex. */
function buildContenthashResponse(contenthexHex: string): string {
  // ABI encoding of `bytes`: offset(0x20) + length + data (padded)
  const len = contenthexHex.length / 2;
  const lenHex = len.toString(16).padStart(64, "0");
  // Pad data to a multiple of 64 hex chars (32 bytes)
  let data = contenthexHex;
  while (data.length % 64) data += "0";
  return "0x" +
    "0000000000000000000000000000000000000000000000000000000000000020" +
    lenHex +
    data;
}

Deno.test("decodeContenthash: empty contenthash returns state 'none'", () => {
  // ABI: offset(0x20) + length(0) + no data
  const res = "0x" +
    "0000000000000000000000000000000000000000000000000000000000000020" +
    "0000000000000000000000000000000000000000000000000000000000000000";
  assertEquals(decodeContenthash(res), { state: "none" });
});

Deno.test("decodeContenthash: IPFS CIDv1 codec (e301) decodes to base32 multibase", () => {
  // e301 + dag-pb(0x70) + sha256(0x12) + len(0x20) + 32-byte hash
  const hash = "a".repeat(64); // 32 bytes of 0xaa
  const contenthexHex = "e30101701220" + hash;
  const res = buildContenthashResponse(contenthexHex);
  const decoded = decodeContenthash(res);
  assertEquals("kind" in decoded, true);
  if ("kind" in decoded) {
    assertEquals(decoded.kind, "ipfs");
    assertEquals(decoded.ref.startsWith("b"), true); // multibase prefix 'b'
    assertEquals(decoded.ref.length > 1, true);
  }
});

Deno.test("decodeContenthash: Swarm codec (e40101fa011b20) decodes to hex reference", () => {
  const hash = "b".repeat(64); // 32 bytes
  const contenthexHex = "e40101fa011b20" + hash;
  const res = buildContenthashResponse(contenthexHex);
  const decoded = decodeContenthash(res);
  assertEquals("kind" in decoded, true);
  if ("kind" in decoded) {
    assertEquals(decoded.kind, "swarm");
    assertEquals(decoded.ref, hash); // the 32-byte hex reference
  }
});

Deno.test("decodeContenthash: unknown codec returns state 'unsupported'", () => {
  // e501 is an unknown/unhandled codec
  const contenthexHex = "e50101701220" + "c".repeat(64);
  const res = buildContenthashResponse(contenthexHex);
  assertEquals(decodeContenthash(res), { state: "unsupported" });
});

Deno.test("decodeContenthash: IPNS codec (e50102) is unsupported", () => {
  const contenthexHex = "e501020000" + "d".repeat(40);
  const res = buildContenthashResponse(contenthexHex);
  assertEquals(decodeContenthash(res), { state: "unsupported" });
});
