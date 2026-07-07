// Shared type definitions for the gwei gateway.

/** The storage protocol resolved from an on-chain contenthash. */
export type Protocol = "ipfs" | "swarm";

/** A successful resolution pointing to storage content. */
export interface ResolvedRef {
  kind: Protocol;
  ref: string;
}

/** The name has no contenthash set on-chain. */
export interface ResolvedNone {
  state: "none";
}

/** The contenthash codec is not IPFS or Swarm. */
export interface ResolvedUnsupported {
  state: "unsupported";
}

/** All RPC endpoints failed during resolution. */
export interface ResolvedError {
  error: "rpc";
}

/** The discriminated union returned by the resolver. */
export type ResolutionResult =
  | ResolvedRef
  | ResolvedNone
  | ResolvedUnsupported
  | ResolvedError;

/** Per-protocol gateway configuration. */
export interface ProtocolConfig {
  gateways: string[];
  prefix: string;
  header: string;
}

/** A cached resolution entry with expiry timestamp. */
export interface CacheEntry<T> {
  value: T;
  expires: number;
}

/** Type guard: does the resolution point to fetchable content? */
export function isResolvedRef(r: ResolutionResult): r is ResolvedRef {
  return (r as ResolvedRef).kind !== undefined;
}

/** Type guard: did the RPC layer fail? */
export function isResolvedError(r: ResolutionResult): r is ResolvedError {
  return (r as ResolvedError).error !== undefined;
}
