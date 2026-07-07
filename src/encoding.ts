// Hex, base32, and ABI encoding helpers — all pure functions with no I/O.

import { B32 } from "./constants.ts";

/** Left-pad a hex string to 64 characters (32 bytes / one ABI word). */
export function pad32(h: string): string {
  return h.padStart(64, "0");
}

/** Convert a Uint8Array to a lowercase hex string (no 0x prefix). */
export function toHex(b: Uint8Array): string {
  let out = "";
  for (const x of b) {
    out += x.toString(16).padStart(2, "0");
  }
  return out;
}

/** Convert a hex string (no 0x prefix required) to a Uint8Array. */
export function hexToBytes(h: string): Uint8Array {
  const clean = h.replace(/^0x/, "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(clean.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * ABI-encode a single dynamic `string` argument, prefixed with a 4-byte selector.
 * Returns a full calldata hex string including the `0x` prefix.
 *
 * Layout: 0x + selector(4) + offset(32=0x20) + length(32) + data(padded to 32)
 */
export function encodeString(selector: string, str: string): string {
  const bytes = new TextEncoder().encode(str);
  let data = toHex(bytes);
  while (data.length % 64) data += "0";
  return "0x" + selector + pad32("20") + pad32(bytes.length.toString(16)) + data;
}

/**
 * Base32-encode a Uint8Array using the RFC 4648 lowercase alphabet (no padding).
 * Used to convert IPFS CIDv1 multihash bytes to the multibase `b` string.
 */
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
