export type Protocol = "ipfs" | "ipns" | "swarm";

export interface ResolvedRef {
  status: "ref";
  kind: Protocol;
  ref: string;
}

export type ResolutionResult =
  | ResolvedRef // resolved content to proxy
  | { status: "none" } // no contenthash set
  | { status: "unsupported" } // unknown codec
  | { status: "error" }; // RPC failure

export type DecodedContenthash =
  | ResolvedRef
  | { status: "none" }
  | { status: "unsupported" };

export interface CacheEntry {
  value: unknown;
  expires: number; // epoch ms — fresh-window boundary (served directly by cacheGet)
  staleUntil: number; // epoch ms — stale-window boundary (served stale by dedupe SWR)
}
