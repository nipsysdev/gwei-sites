// Static configuration: protocol addresses, timeouts, TTLs, gateway lists,
// encoding tables, and presentation templates. These NEVER vary between
// environments. Env-derived values (keys, tokens) live in src/config.ts.

// NameNFT contract address (same on Mainnet & Sepolia)
export const NAMENFT = "0x9D51D507BC7264d4fE8Ad1cf7Fe191933A0a81d6";

// 4EVERLAND Pinning Services API endpoint
export const PIN_API = "https://api.4everland.dev/pins";

// 4EVERLAND Ethereum RPC base URL
export const RPC_ENDPOINT = "https://eth-mainnet.4everland.org/v1";

// Public Ethereum RPCs (used as fallback)
export const PUBLIC_RPCS = [
  "https://0xrpc.io/eth",
  "https://gateway.tenderly.co/public/mainnet",
  "https://ethereum-rpc.publicnode.com",
];

// Network timeouts (ms)
export const TIMEOUTS = {
  RPC: 5_000, // per eth_call to an Ethereum RPC
  GATEWAY: 60_000, // per-gateway headers-phase fetch (cleared once headers arrive)
  IPNS_RESOLVE: 12_000, // per-gateway probe in the IPNS→CID race
  PIN_API: 10_000, // pin existence check + POST (fire-and-forget)
} as const;

// Internal caching TTLs (ms)
export const TTL = {
  CONTENTHASH_RESOLUTION: 300_000, // positive contenthash resolution
  CONTENTHASH_RESOLUTION_ERROR: 60_000, // negative contenthash resolution (none, unsupported codec)
  RPC_ERROR: 5_000, // transient RPC error
  CID_RESOLUTION: 30 * 60_000, // positive IPNS→CID (30 min)
  CID_RESOLUTION_ERROR: 60_000, // no CID recovered (transient gateway blip)
} as const;

// Public IPFS gateways
export const PUBLIC_IPFS_GATEWAYS = [
  "https://ipfs.nipsys.dev",
  "https://ipfs.io",
  "https://dweb.link",
  "https://4everland.io",
  "https://ipfs.filebase.io",
];

// IPFS Routing V1 endpoint (delegated routing for IPNS resolution)
export const ROUTING_V1_ENDPOINT = "https://delegated-ipfs.dev/routing/v1/ipns";

// Public Swarm gateways
export const SWARM_GATEWAYS = [
  "https://download.gateway.ethswarm.org",
];

// Stale-while-revalidate (SWR) factor
// Used to calculate the time window during which the stale value will
// still be served while a fire-and-forget background refresh is triggered.
// The stale window is `fresh TTL × SWR_STALE_FACTOR`. E.g. factor 2.0 with a
// 300s fresh TTL → 300s fresh + 300s stale (600s total before we have to wait
// for a refresh before serving the value)
export const SWR_STALE_FACTOR = 2.0;

// Browser freshness window (used in header as max-age)
export const CONTENT_BROWSER_MAX_AGE = 60; // seconds
// Browser SWR window (used in header as stale-while-revalidate)
export const CONTENT_BROWSER_STALE = 86_400; // seconds (1 day)
// Deno Deploy edge CDN (shared cache) freshness window
export const CONTENT_EDGE_MAX_AGE = 300; // seconds
// Deno Deploy edge CDN SWR window
export const CONTENT_EDGE_STALE = 300; // seconds

// EVM Function selectors (4-byte hex, no 0x prefix) ---
export const SEL_COMPUTEID = "fb021939"; // computeid(string): name → tokenId
export const SEL_CONTENTHASH = "cb323d76"; // contenthash(uint256): tokenId → contenthash

// Encoding alphabets. B32 for IPFS CIDs, B36 for IPNS names
export const B32 = "abcdefghijklmnopqrstuvwxyz234567"; // RFC 4648 lowercase
export const B36 = "0123456789abcdefghijklmnopqrstuvwxyz";

// EIP-1577 contenthash codec (hex multicodec prefixes, no 0x) ---
export const CODEC_IPFS = "e301"; // CIDv1 → base32 multibase `b`
export const CODEC_IPNS = "e501"; // libp2p-key CIDv1 → base36 multibase `k`
export const CODEC_SWARM = "e40101fa011b20"; // 32-byte Swarm reference

// The L1/L2 cache is keyed by string; each cached concern gets its own prefix so
// entries never collide.
export const CACHE_KEYS = {
  KV: "cache:", // L2 (Deno KV) only. Namespaces every key under a cache bucket
  RESOLVE: "resolve:", // name → contenthash resolution
  IPNS_CID: "ipns2cid:", // IPNS peer-id → current CIDv1
} as const;

// --- Domain ---
export const APEX_DOMAIN = ".gwei.site";

// Security headers pinned to every subdomain
export const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "content-security-policy": "frame-ancestors 'self';",
  "referrer-policy": "strict-origin-when-cross-origin",
  "strict-transport-security": "max-age=31536000",
  "cross-origin-resource-policy": "cross-origin",
};

// --- Presentation (error/info page template) ---
export const PAGE_STYLES =
  "body{background:#0a0a0a;color:#e8e8e0;font-family:Helvetica,Arial,sans-serif;" +
  "min-height:100vh;display:flex;flex-direction:column;align-items:center;" +
  "justify-content:center;text-align:center;gap:14px;padding:24px;line-height:1.6}" +
  "a{color:#e8e8e0}p{color:#b8b8b0;max-width:380px;margin:0}";
export const PAGE_HEAD =
  '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">' +
  "<title>%TITLE%</title><style>" + PAGE_STYLES + "</style>";
