# gwei.site gateway

An edge gateway that serves websites from on-chain contenthashes. Given `<name>.gwei.site`, it
resolves the name on Ethereum and proxies its IPFS, IPNS, or Swarm content from dedicated and public
gateways.

Built for [Deno Deploy](https://deno.com/deploy). Zero runtime dependencies. Strict TypeScript. 104
tests.

A Deno Deploy rewrite of the [gwei.domains](https://gwei.domains) gateway (originally a Cloudflare
Worker in the [gwei-names](https://github.com/lucadonnoh/gwei-names) monorepo).

## Infrastructure

The gateway is built on [4EVERLAND](https://4everland.org) for three services:

- **RPC** — Ethereum JSON-RPC for on-chain name resolution. A free key is primary; a paid key
  absorbs rate-limit overflow. Public RPCs are last-resort fallback.
- **Dedicated gateway** — an IPFS content gateway with no rate limits, used as the primary source
  for proxied content. Public IPFS gateways serve as fallback.
- **Pinning** — resolved CIDs are proactively pinned to 4EVERLAND's nodes, so content is cached
  close to the dedicated gateway for faster retrieval.

All three are optional — without configuration the gateway degrades gracefully to public endpoints.

## Quick start

```sh
deno task dev
deno test
```

```sh
curl -H "Host: xav.gwei.site" http://localhost:8000/
```

## How it works

```
xav.gwei.site/en/whoami
  │
  ├─ Resolve on-chain: eth_call → contenthash → IPFS / IPNS / Swarm ref
  ├─ For IPNS: resolve to current CID via routing V1 (gateway race fallback)
  ├─ Proxy content: dedicated gateway → public gateways (first 2xx wins)
  └─ Stream + security headers + browser/edge cache directives
```

Three storage backends are supported — IPFS (CIDv1), IPNS (libp2p-key), and Swarm (bzz).

## Configuration

Four optional environment variables for 4EVERLAND infrastructure. Without them, the gateway uses
public endpoints only.

| Variable            | Purpose                                                          |
| ------------------- | ---------------------------------------------------------------- |
| `RPC_KEY`           | 4EVERLAND RPC key (free tier, primary)                           |
| `RPC_KEY_FALLBACK`  | Paid 4EVERLAND RPC key (used when the free tier is rate-limited) |
| `DEDICATED_GATEWAY` | 4EVERLAND dedicated gateway hostname (primary for content)       |
| `PIN_TOKEN`         | 4EVERLAND pin API token (proactive IPFS pinning)                 |

Set these in Deno Deploy → Settings → Environment Variables.

## Architecture

```
main.ts            Deno.serve entry point
src/
  config.ts        Environment-derived config
  constants.ts     Static data (addresses, timeouts, TTLs, gateways)
  handler.ts       Request routing, response hardening, error pages
  resolver.ts      On-chain resolution + contenthash decode
  proxy.ts         Content proxy + IPNS→CID resolution
  rpc.ts           eth_call client with sequential failover
  cache.ts         Two-tier cache (L1 Map + L2 KV) with SWR + single-flight
  pinner.ts        Fire-and-forget IPFS pinning with cross-isolate dedup
  encoding.ts      ABI / hex / base32 / base36 helpers
  types.ts         Shared types
```

## Caching

Three layers, each independently tunable in `src/constants.ts`:

- **Resolution** (name → contenthash) — 5 min positive / 1 min negative, with single-flight stampede
  protection and stale-while-revalidate. Cross-isolate persistence via Deno KV.
- **IPNS → CID** — 30 min positive / 1 min negative. Resolved via the IPFS Routing V1 API, with a
  HEAD-based gateway race as fallback.
- **Content** (HTTP responses) — browser: 60 s freshness + 1-day SWR; Deno Deploy edge: 300 s + SWR.

## Deployment

This project deploys to [Deno Deploy](https://deno.com/deploy). See their
[getting started guide](https://docs.deno.com/deploy/getting_started/) — the entry point and runtime
config are declared in [`deno.json`](./deno.json).

For a custom apex domain, update `APEX_DOMAIN` in [`src/constants.ts`](./src/constants.ts) and
configure wildcard DNS per the
[Deno Deploy custom domains docs](https://docs.deno.com/deploy/classic/custom-domains/).

## License

MIT — see [LICENSE](./LICENSE).
