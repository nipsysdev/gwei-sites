// Unit tests for encoding helpers (pure functions, no I/O).

import { assertEquals } from "jsr:@std/assert@1";
import { base32, base36, encodeString, hexToBytes, pad32, toHex } from "../encoding.ts";

Deno.test("pad32: left-pads hex to one ABI word (64 chars)", () => {
  assertEquals(pad32("ff"), "00000000000000000000000000000000000000000000000000000000000000ff");
  assertEquals(pad32("20"), "0000000000000000000000000000000000000000000000000000000000000020");
  assertEquals(pad32("a".repeat(64)), "a".repeat(64));
});

Deno.test("toHex: converts Uint8Array to lowercase hex", () => {
  assertEquals(toHex(new Uint8Array([0, 255, 16])), "00ff10");
  assertEquals(toHex(new Uint8Array([])), "");
  assertEquals(toHex(new Uint8Array([0xab, 0xcd])), "abcd");
});

Deno.test("hexToBytes: converts hex to Uint8Array and strips optional 0x prefix", () => {
  assertEquals(hexToBytes("00ff10"), new Uint8Array([0, 255, 16]));
  assertEquals(hexToBytes("abcd"), new Uint8Array([0xab, 0xcd]));
  assertEquals(hexToBytes("0xabcd"), new Uint8Array([0xab, 0xcd]));
  assertEquals(hexToBytes(""), new Uint8Array([]));
});

Deno.test("toHex/hexToBytes: round-trip consistency", () => {
  const original = new Uint8Array([0, 1, 2, 255, 128, 64, 32]);
  assertEquals(hexToBytes(toHex(original)), original);
});

Deno.test("encodeString: ABI-encodes a string argument with the given selector", () => {
  assertEquals(
    encodeString("fb021939", "test"),
    "0xfb021939" +
      "0000000000000000000000000000000000000000000000000000000000000020" +
      "0000000000000000000000000000000000000000000000000000000000000004" +
      "7465737400000000000000000000000000000000000000000000000000000000",
  );
});

Deno.test("encodeString: handles empty string", () => {
  assertEquals(
    encodeString("abcdef", ""),
    "0xabcdef" +
      "0000000000000000000000000000000000000000000000000000000000000020" +
      "0000000000000000000000000000000000000000000000000000000000000000",
  );
});

Deno.test("base32: encodes the avatar CIDv1 to the known base32 string", () => {
  // CIDv1 bytes for IPFS CID QmaeMmgMYE5Ro1ojpmNwyLBtBNT86ug52K4LLdoHDEM1XG
  // (version 0x01 + dag-pb 0x70 + sha2-256 multihash 0x12 0x20 + 32-byte digest).
  const cidV1 = hexToBytes(
    "01701220b6d58b9d35febf61cef8db33f793df1c7b5ea5c0164b9a0ba436c381790b7c4b",
  );
  // base32 produces the CID body; the multibase `b` prefix is added by the codec.
  assertEquals("b" + base32(cidV1), "bafybeifw2wfz2np6x5q456g3gp3zhxy4pnpklqawjonaxjbwyoaxsc34jm");
});

Deno.test("base36: encodes known small values", () => {
  assertEquals(base36(new Uint8Array([])), "0");
  assertEquals(base36(new Uint8Array([1])), "1");
  assertEquals(base36(new Uint8Array([36])), "10"); // 36 = 1*36 + 0
  assertEquals(base36(new Uint8Array([255])), "73"); // 255 = 7*36 + 3
});

Deno.test("base36: encodes the IPNS libp2p-key CIDv1 to the known base36 name", () => {
  // libp2p-key CIDv1 bytes for the author's IPNS name.
  const cidV1 = hexToBytes(
    "01721220a1dc5d90d7272c0fd9150414f14c80c71de5d243c2f23165e2ddb495cbbcd05f",
  );
  assertEquals("k" + base36(cidV1), "k2k4r8ng8uzrtqb5ham8kao889m8qezu96z4w3lpinyqghum43veb6n3");
});
