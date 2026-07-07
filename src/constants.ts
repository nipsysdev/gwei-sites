// On-chain contract address for NameNFT (mainnet; same address on Sepolia via CREATE).
export const NAMENFT = "0x9D51D507BC7264d4fE8Ad1cf7Fe191933A0a81d6";

// Public Ethereum RPC endpoints for resolution (tried in order on failure).
export const RPCS = [
  "https://0xrpc.io/eth",
  "https://gateway.tenderly.co/public/mainnet",
  "https://ethereum-rpc.publicnode.com",
];

// IPFS public gateways (raced in parallel for content fetches).
// All gateways verified to support both IPFS and IPNS protocols.
// Source: https://ipfs.github.io/public-gateway-checker/ (July 2026)
export const IPFS_GATEWAYS = [
  "https://ipfs.io",
  "https://dweb.link",
  "https://4everland.io",
  "https://ipfs.filebase.io",
];

// Swarm public gateways (raced in parallel for content fetches).
export const SWARM_GATEWAYS = [
  "https://gateway.ethswarm.org",
  "https://download.gateway.ethswarm.org",
];

// Per-protocol configuration: gateway list, URL path prefix, response header name.
import type { ProtocolConfig } from "./types.ts";

export const PROTOCOLS: Record<string, ProtocolConfig> = {
  ipfs: { gateways: IPFS_GATEWAYS, prefix: "/ipfs/", header: "x-ipfs-cid" },
  ipns: { gateways: IPFS_GATEWAYS, prefix: "/ipns/", header: "x-ipns-name" },
  swarm: { gateways: SWARM_GATEWAYS, prefix: "/bzz/", header: "x-swarm-reference" },
};

// Resolution cache TTLs (milliseconds) — passed directly to memSet().
export const RESOLVE_TTL = 300_000; // positive: name resolved to a content ref
export const RESOLVE_NEG_TTL = 60_000; // negative: no contenthash / unsupported codec
export const RESOLVE_ERR_TTL = 5_000; // transient: all RPCs failed (short, to retry soon)

// Proxied-content cache TTL. NOTE: units are SECONDS — this value is interpolated
// into HTTP Cache-Control / Deno-CDN-Cache-Control directives, never passed to memSet.
export const CONTENT_TTL = 300;

// In-process memory cache default TTL (milliseconds) — shorter than edge cache.
export const MEM_CACHE_TTL = 30_000;

// Per-RPC timeout (milliseconds).
export const RPC_TIMEOUT = 5_000;

// Per-gateway timeout (milliseconds) for IPFS/Swarm fetches, applied to the
// headers phase only — the body streams without a hard cutoff once headers
// arrive. IPFS cold content can take 20+ seconds to fetch from the network.
export const GATEWAY_TIMEOUT = 120_000;

// Function selectors (4-byte hex, no 0x prefix).
export const SEL_COMPUTEID = "fb021939";
export const SEL_CONTENTHASH = "cb323d76";

// Contenthash codec prefixes (hex, no 0x prefix). These are varint-encoded
// multicodec prefixes from EIP-1577.
export const CODEC_IPFS = "e301";
export const CODEC_SWARM = "e40101fa011b20";
export const CODEC_IPNS = "e501";

// RFC 4648 base32 alphabet (lowercase, no padding).
export const B32 = "abcdefghijklmnopqrstuvwxyz234567";

// The apex domain this gateway serves.
export const APEX_DOMAIN = ".gwei.site";

// Per-isolate L1 memory cache size limit (hard bound; LRU-evicted when exceeded).
export const MEM_CACHE_MAX = 500;
