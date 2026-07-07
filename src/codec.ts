// Contenthash codec decoding — extracts the storage protocol and reference
// from an ABI-encoded `bytes` contenthash returned by the NameNFT contract.
//
// Supported codecs (EIP-1577):
//   - e301 (IPFS, CIDv1)               → base32 multibase `b` string (CIDv1)
//   - e501 (IPNS, libp2p-key CIDv1)    → base36 multibase `k` string
//   - e40101fa011b20 (Swarm manifest)  → 32-byte hex reference

import { CODEC_IPFS, CODEC_IPNS, CODEC_SWARM } from "./constants.ts";
import { base32, base36, hexToBytes } from "./encoding.ts";
import type { DecodedContenthash } from "./types.ts";

/**
 * Decode an ABI-encoded contenthash response into a protocol + reference.
 *
 * The input `chRes` is the full hex string from `eth_call`, e.g.:
 *   `0x0000...0020 <len> e30101701220abcd...`
 *
 * Returns:
 *   - `{ status: "ref", kind, ref }` for supported codecs (IPFS, IPNS, Swarm)
 *   - `{ status: "none" }` if the contenthash is empty (zero-length bytes)
 *   - `{ status: "unsupported" }` if the codec prefix is not recognized
 */
export function decodeContenthash(chRes: string): DecodedContenthash {
  const b = chRes.slice(2); // strip 0x
  const len = parseInt(b.slice(64, 128), 16) || 0;

  if (len === 0) return { status: "none" };

  const chHex = b.slice(128, 128 + len * 2);

  if (chHex.startsWith(CODEC_IPFS)) {
    // IPFS CIDv1: multicodec prefix (4 hex chars) + CIDv1 bytes → base32 multibase
    return { status: "ref", kind: "ipfs", ref: "b" + base32(hexToBytes(chHex.slice(4))) };
  }
  if (chHex.startsWith(CODEC_IPNS)) {
    // IPNS: multicodec prefix (4 hex chars) + CIDv1 with libp2p-key codec
    // → base36 multibase with `k` prefix (standard IPNS name representation)
    return { status: "ref", kind: "ipns", ref: "k" + base36(hexToBytes(chHex.slice(4))) };
  }
  if (chHex.startsWith(CODEC_SWARM)) {
    // Swarm: codec prefix (14 hex chars = 7 bytes) + 32-byte keccak256 hash
    return { status: "ref", kind: "swarm", ref: chHex.slice(14) };
  }
  return { status: "unsupported" };
}
