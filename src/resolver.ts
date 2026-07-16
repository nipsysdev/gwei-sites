import {
  CACHE_KEYS,
  CODEC_IPFS,
  CODEC_IPNS,
  CODEC_SWARM,
  SEL_COMPUTEID,
  SEL_CONTENTHASH,
  TTL,
} from "./constants.ts";
import { cacheGet, cacheSet, dedupe } from "./cache.ts";
import { base32, base36, encodeString, hexToBytes } from "./encoding.ts";
import { ethCall, rpcs } from "./rpc.ts";
import { pinCid } from "./pinner.ts";
import type { DecodedContenthash, ResolutionResult } from "./types.ts";

/**
 * Resolve a `.gwei` name to its contenthash and decode the storage reference.
 */
export function resolveName(name: string): Promise<ResolutionResult> {
  const key = CACHE_KEYS.RESOLVE + name;

  const cached = cacheGet<ResolutionResult>(key);
  if (cached) return Promise.resolve(cached);

  return dedupe(key, async (): Promise<ResolutionResult> => {
    const tokenId = await ethCall(encodeString(SEL_COMPUTEID, name), rpcs());
    if (!tokenId) return cacheRpcError(key, name, "computeId");

    const contenthash = await ethCall(callWithTokenArg(SEL_CONTENTHASH, tokenId), rpcs());
    if (!contenthash) return cacheRpcError(key, name, "contenthash");

    const decoded = decodeContenthash(contenthash);
    cacheSet(
      key,
      decoded,
      decoded.status === "ref" ? TTL.CONTENTHASH_RESOLUTION : TTL.CONTENTHASH_RESOLUTION_ERROR,
    );

    if (decoded.status === "ref") {
      console.info(`[resolver] ${name} → ${decoded.kind} ${decoded.ref}`);
      if (decoded.kind === "ipfs") pinCid(decoded.ref, name);
    } else if (decoded.status === "none") {
      console.info(`[resolver] ${name} → no contenthash`);
    } else {
      console.info(`[resolver] ${name} → unsupported codec`);
    }

    return decoded;
  });
}

/** Build calldata for a `method(uint256)` call from a tokenId hex result. */
function callWithTokenArg(selector: string, tokenIdHex: string): string {
  return "0x" + selector + tokenIdHex.replace(/^0x/, "");
}

/** Log and cache an RPC failure at the short error TTL, returning the error result. */
function cacheRpcError(key: string, name: string, step: string): ResolutionResult {
  console.error(`[resolver] ${name}: ${step} RPC failed`);
  const err: ResolutionResult = { status: "error" };
  cacheSet(key, err, TTL.RPC_ERROR);
  return err;
}

// --- EIP-1577 contenthash decoding (inlined: only resolveName uses it) -------
// One ABI word = 32 bytes = 64 hex chars. A contenthash `bytes` response is
// laid out as [offset word][length word][data...], so data begins at word 2.
const HEX_PER_WORD = 64;

/**
 * Decode an ABI-encoded contenthash. Word 1 is the byte length of the payload;
 * the payload's codec prefix selects the backend; the remainder is the ref.
 */
export function decodeContenthash(chRes: string): DecodedContenthash {
  const hex = chRes.replace(/^0x/, "");
  const payloadBytes = parseInt(hex.substr(HEX_PER_WORD, HEX_PER_WORD), 16) || 0;
  if (payloadBytes === 0) return { status: "none" };

  const payload = hex.slice(2 * HEX_PER_WORD, 2 * HEX_PER_WORD + payloadBytes * 2);

  if (payload.startsWith(CODEC_IPFS)) {
    return {
      status: "ref",
      kind: "ipfs",
      ref: "b" + base32(hexToBytes(payload.slice(CODEC_IPFS.length))),
    };
  }
  if (payload.startsWith(CODEC_IPNS)) {
    return {
      status: "ref",
      kind: "ipns",
      ref: "k" + base36(hexToBytes(payload.slice(CODEC_IPNS.length))),
    };
  }
  if (payload.startsWith(CODEC_SWARM)) {
    return { status: "ref", kind: "swarm", ref: payload.slice(CODEC_SWARM.length) };
  }
  return { status: "unsupported" };
}
