// Unit tests for contenthash codec decoding, using real published vectors.

import { assertEquals } from "jsr:@std/assert@1";
import { decodeContenthash } from "../codec.ts";

/** Wrap raw contenthash payload hex in an ABI `bytes` response: offset + length + data. */
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

Deno.test("decodeContenthash: empty bytes → { status: 'none' }", () => {
  const res = "0x" +
    "0000000000000000000000000000000000000000000000000000000000000020" +
    "0000000000000000000000000000000000000000000000000000000000000000";
  assertEquals(decodeContenthash(res), { status: "none" });
});

Deno.test("decodeContenthash: real IPFS contenthash → CIDv1 base32", () => {
  // Encodes IPFS CID QmaeMmgMYE5Ro1ojpmNwyLBtBNT86ug52K4LLdoHDEM1XG
  // as an EIP-1577 contenthash (e301 + CIDv1 bytes).
  const res = abiBytes(
    "e30101701220b6d58b9d35febf61cef8db33f793df1c7b5ea5c0164b9a0ba436c381790b7c4b",
  );
  assertEquals(decodeContenthash(res), {
    status: "ref",
    kind: "ipfs",
    ref: "bafybeifw2wfz2np6x5q456g3gp3zhxy4pnpklqawjonaxjbwyoaxsc34jm",
  });
});

Deno.test("decodeContenthash: real IPNS contenthash → libp2p-key base36", () => {
  // Encodes the author's IPNS name as an EIP-1577 contenthash
  // (e501 + libp2p-key CIDv1 bytes).
  const res = abiBytes(
    "e50101721220a1dc5d90d7272c0fd9150414f14c80c71de5d243c2f23165e2ddb495cbbcd05f",
  );
  assertEquals(decodeContenthash(res), {
    status: "ref",
    kind: "ipns",
    ref: "k2k4r8ng8uzrtqb5ham8kao889m8qezu96z4w3lpinyqghum43veb6n3",
  });
});

Deno.test("decodeContenthash: Swarm contenthash → 32-byte hex reference", () => {
  const hash = "b".repeat(64); // 32 bytes
  const res = abiBytes("e40101fa011b20" + hash);
  assertEquals(decodeContenthash(res), { status: "ref", kind: "swarm", ref: hash });
});

Deno.test("decodeContenthash: unknown codec → { status: 'unsupported' }", () => {
  // e601 is multicodec 0xe6 (streamid) — not IPFS/IPNS/Swarm.
  const res = abiBytes("e60101701220" + "c".repeat(64));
  assertEquals(decodeContenthash(res), { status: "unsupported" });
});
