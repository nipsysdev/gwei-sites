// Unit tests for encoding helpers (pure functions, no I/O).

import { assertEquals } from "jsr:@std/assert@1";
import { base32, encodeString, hexToBytes, pad32, toHex } from "../encoding.ts";

Deno.test("pad32: pads hex to 64 characters with leading zeros", () => {
  assertEquals(pad32("ff"), "00000000000000000000000000000000000000000000000000000000000000ff");
  assertEquals(pad32("20"), "0000000000000000000000000000000000000000000000000000000000000020");
  assertEquals(pad32("a".repeat(64)), "a".repeat(64)); // already 64 chars
});

Deno.test("toHex: converts Uint8Array to lowercase hex string", () => {
  assertEquals(toHex(new Uint8Array([0, 255, 16])), "00ff10");
  assertEquals(toHex(new Uint8Array([])), "");
  assertEquals(toHex(new Uint8Array([0xab, 0xcd])), "abcd");
});

Deno.test("hexToBytes: converts hex string to Uint8Array", () => {
  assertEquals(hexToBytes("00ff10"), new Uint8Array([0, 255, 16]));
  assertEquals(hexToBytes("abcd"), new Uint8Array([0xab, 0xcd]));
  assertEquals(hexToBytes(""), new Uint8Array([]));
});

Deno.test("hexToBytes: strips 0x prefix if present", () => {
  assertEquals(hexToBytes("0xabcd"), new Uint8Array([0xab, 0xcd]));
});

Deno.test("toHex/hexToBytes: round-trip consistency", () => {
  const original = new Uint8Array([0, 1, 2, 255, 128, 64, 32]);
  const hex = toHex(original);
  const roundTrip = hexToBytes(hex);
  assertEquals(roundTrip, original);
});

Deno.test("encodeString: produces correct ABI encoding for a string argument", () => {
  const result = encodeString("fb021939", "test");
  // selector + offset(0x20) + length(4) + data("test" padded to 32)
  assertEquals(
    result,
    "0xfb021939" +
      "0000000000000000000000000000000000000000000000000000000000000020" +
      "0000000000000000000000000000000000000000000000000000000000000004" +
      "7465737400000000000000000000000000000000000000000000000000000000",
  );
});

Deno.test("encodeString: handles empty string", () => {
  const result = encodeString("abcdef", "");
  assertEquals(
    result,
    "0xabcdef" +
      "0000000000000000000000000000000000000000000000000000000000000020" +
      "0000000000000000000000000000000000000000000000000000000000000000" +
      "",
  );
});

Deno.test("base32: encodes bytes to RFC 4648 lowercase base32", () => {
  // Empty input → empty output
  assertEquals(base32(new Uint8Array([])), "");
  // Known vectors: the multihash for CIDv1 uses base32 without padding
  // 0x1220 (dag-pb + sha256) + 32 zero bytes
  const input = new Uint8Array([0x12, 0x20, ...new Uint8Array(32)]);
  const result = base32(input);
  assertEquals(typeof result, "string");
  assertEquals(result.length > 0, true);
  // All chars should be from the base32 alphabet
  const B32 = "abcdefghijklmnopqrstuvwxyz234567";
  for (const c of result) {
    assertEquals(B32.includes(c), true, `Unexpected char: ${c}`);
  }
});
