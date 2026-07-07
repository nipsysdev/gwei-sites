// Name resolution: on-chain contenthash lookup with in-process memory caching,
// single-flight stampede protection, and negative caching of failures.

import {
  RESOLVE_ERR_TTL,
  RESOLVE_NEG_TTL,
  RESOLVE_TTL,
  SEL_COMPUTEID,
  SEL_CONTENTHASH,
} from "./constants.ts";
import { dedupe, memGet, memSet } from "./cache.ts";
import { decodeContenthash } from "./codec.ts";
import { encodeString } from "./encoding.ts";
import { ethCall } from "./rpc.ts";
import type { ResolutionResult } from "./types.ts";

/** Cache key prefix for resolution entries. */
const CACHE_PREFIX = "resolve:";

/**
 * Resolve a `.gwei` name to its on-chain contenthash and decode the storage
 * protocol + reference.
 *
 * Flow:
 *   1. Check in-process memory cache (L1).
 *   2. If miss, use single-flight dedup to prevent stampede.
 *   3. `eth_call computeId(name)` → tokenId.
 *   4. `eth_call contenthash(tokenId)` → ABI-encoded bytes.
 *   5. Decode codec (IPFS / IPNS / Swarm / none / unsupported).
 *   6. Cache result with a TTL keyed to its outcome.
 *
 * Every outcome is cached so bursts never amplify RPC load:
 *   - ref (resolved)     → RESOLVE_TTL     (300s)
 *   - none/unsupported   → RESOLVE_NEG_TTL (60s)
 *   - RPC error          → RESOLVE_ERR_TTL (5s, short so transient blips retry fast)
 *
 * @param name   Full gwei name, e.g. `"xav.gwei"` (must already be normalized).
 * @param rpcs   Ordered RPC endpoint list.
 * @returns      Resolution result (discriminated union on `status`).
 */
export function resolveName(name: string, rpcs: string[]): Promise<ResolutionResult> {
  const key = CACHE_PREFIX + name;

  // L1: check in-process memory cache.
  const cached = memGet<ResolutionResult>(key);
  if (cached) return Promise.resolve(cached);

  // Single-flight: if concurrent requests are resolving the same name,
  // share the in-flight promise instead of issuing duplicate RPC calls.
  return dedupe(key, async (): Promise<ResolutionResult> => {
    // Re-check cache after acquiring the dedup lock (another request may have
    // populated it while we were waiting).
    const rechecked = memGet<ResolutionResult>(key);
    if (rechecked) return rechecked;

    // Step 1: computeId(string) → uint256 tokenId
    const idRes = await ethCall(encodeString(SEL_COMPUTEID, name), rpcs);
    if (!idRes) {
      console.error(`resolveName(${name}): computeId RPC failed`);
      const err: ResolutionResult = { status: "error" };
      memSet(key, err, RESOLVE_ERR_TTL);
      return err;
    }

    // Step 2: contenthash(uint256) → bytes
    const chRes = await ethCall("0x" + SEL_CONTENTHASH + idRes.slice(2), rpcs);
    if (!chRes) {
      console.error(`resolveName(${name}): contenthash RPC failed`);
      const err: ResolutionResult = { status: "error" };
      memSet(key, err, RESOLVE_ERR_TTL);
      return err;
    }

    // Step 3: decode + cache. Positive results cache longer than negative ones.
    const decoded = decodeContenthash(chRes);
    const ttl = decoded.status === "ref" ? RESOLVE_TTL : RESOLVE_NEG_TTL;
    memSet(key, decoded, ttl);
    return decoded;
  });
}
