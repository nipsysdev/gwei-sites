// Contenthash codec decoding — extracts the storage protocol and reference
// from an ABI-encoded `bytes` contenthash returned by the NameNFT contract.
//
// Supported codecs:
//   - e301 (IPFS CIDv1) → base32-encoded multibase `b` string
//   - e40101fa011b20 (Swarm manifest) → 32-byte hex reference

import { CODEC_IPFS, CODEC_SWARM } from "./constants.ts";
import { base32, hexToBytes } from "./encoding.ts";
import type { Protocol } from "./types.ts";

export interface DecodedContenthash {
  kind: Protocol;
  ref: string;
}

/**
 * Decode an ABI-encoded contenthash response into a protocol + reference.
 *
 * The input `chRes` is the full hex string from `eth_call`, e.g.:
 *   `0x0000...0020 <len> e30101701220abcd...`
 *
 * Returns:
 *   - `{ kind, ref }` for supported codecs (IPFS or Swarm)
 *   - `{ state: "none" }` if the contenthash is empty (zero-length bytes)
 *   - `{ state: "unsupported" }` if the codec prefix is not recognized
 */
export function decodeContenthash(chRes: string):
  | DecodedContenthash
  | { state: "none" }
  | { state: "unsupported" } {
  const b = chRes.slice(2); // strip 0x
  const len = parseInt(b.slice(64, 128), 16) || 0;

  if (len === 0) return { state: "none" };

  const chHex = b.slice(128, 128 + len * 2);

  if (chHex.startsWith(CODEC_IPFS)) {
    // IPFS CIDv1: codec prefix (2 hex chars) + multihash bytes → base32 multibase
    return { kind: "ipfs", ref: "b" + base32(hexToBytes(chHex.slice(4))) };
  }
  if (chHex.startsWith(CODEC_SWARM)) {
    // Swarm: codec prefix (14 hex chars = 7 bytes) + 32-byte keccak256 hash
    return { kind: "swarm", ref: chHex.slice(14) };
  }
  return { state: "unsupported" };
}
