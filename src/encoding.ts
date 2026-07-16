// Hex, base32, base36, and ABI encoding helpers — pure functions, no I/O.
// Used by resolver.ts (ABI calldata for eth_call + contenthash decoding).

import { B32, B36 } from "./constants.ts";

/** ABI-encode a `string` arg with a 4-byte selector → full calldata (0x-prefixed). */
export function encodeString(selector: string, str: string): string {
  const bytes = new TextEncoder().encode(str);
  let data = toHex(bytes);
  while (data.length % 64) data += "0";
  return "0x" + selector + pad32("20") + pad32(bytes.length.toString(16)) + data;
}

/** RFC 4648 lowercase base32 (no padding). Encodes IPFS CIDv1 bytes for multibase `b`. */
export function base32(bytes: Uint8Array): string {
  let bits = 0;
  let val = 0;
  let out = "";
  for (const b of bytes) {
    val = (val << 8) | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[(val >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
}

/**
 * Lowercase base36 (used for IPNS libp2p-key CIDv1 → multibase `k`). Needs BigInt
 * since 36 isn't a power of 2: bytes → big-endian BigInt → repeated divmod by 36.
 */
export function base36(bytes: Uint8Array): string {
  let num = 0n;
  for (const b of bytes) {
    num = (num << 8n) | BigInt(b);
  }
  if (num === 0n) return "0";
  let out = "";
  while (num > 0n) {
    out = B36[Number(num % 36n)] + out;
    num /= 36n;
  }
  return out;
}

/** Hex string (optional 0x prefix) → Uint8Array. */
export function hexToBytes(h: string): Uint8Array {
  const clean = h.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

/** Uint8Array → lowercase hex (no 0x prefix). */
export function toHex(b: Uint8Array): string {
  let out = "";
  for (const x of b) {
    out += x.toString(16).padStart(2, "0");
  }
  return out;
}

/** Left-pad hex to one ABI word (64 chars / 32 bytes). */
export function pad32(h: string): string {
  return h.padStart(64, "0");
}
