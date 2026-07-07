// Shared type definitions for the gwei gateway.

/** The storage protocol resolved from an on-chain contenthash. */
export type Protocol = "ipfs" | "ipns" | "swarm";

/**
 * Resolution outcomes, discriminated by a single `status` field so handlers
 * can branch exhaustively with one check (no probing for `kind`/`state`).
 */
export interface ResolvedRef {
  status: "ref";
  kind: Protocol;
  ref: string;
}

/** The name has no contenthash set on-chain. */
export interface ResolvedNone {
  status: "none";
}

/** The contenthash codec is not IPFS, IPNS, or Swarm. */
export interface ResolvedUnsupported {
  status: "unsupported";
}

/** All RPC endpoints failed during resolution. */
export interface ResolvedError {
  status: "error";
}

/** The discriminated union returned by the resolver. */
export type ResolutionResult =
  | ResolvedRef
  | ResolvedNone
  | ResolvedUnsupported
  | ResolvedError;

/** Codec decode result — resolution minus the RPC-error variant. */
export type DecodedContenthash =
  | ResolvedRef
  | ResolvedNone
  | ResolvedUnsupported;

/** Per-protocol gateway configuration. */
export interface ProtocolConfig {
  gateways: string[];
  prefix: string;
  header: string;
}

/** A cached resolution entry with expiry timestamp (epoch ms). */
export interface CacheEntry<T> {
  value: T;
  expires: number;
}
