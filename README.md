# gwei-gateway (Deno Deploy)

A Deno Deploy edge function that turns `<name>.gwei.domains` into the website stored at that name's
on-chain `contenthash`. This is the Deno Deploy port of the [Cloudflare Worker gateway](../gateway/)
in the gwei-names monorepo.

## How it works

```
donnoh.gwei.domains/about
  │
  ├─ Parse Host → subdomain "donnoh"
  ├─ Normalize → name "donnoh.gwei"
  ├─ Resolve (on-chain):
  │    eth_call computeId("donnoh.gwei") → tokenId
  │    eth_call contenthash(tokenId)     → ABI-encoded bytes
  │    Decode codec: e301 (IPFS) | e40101fa011b20 (Swarm)
  │
  ├─ Proxy content (racing gateways in parallel via Promise.any):
  │    IPFS: ipfs.io  ‖  dweb.link
  │    Swarm: gateway.ethswarm.org  ‖  download.gateway.ethswarm.org
  │
  └─ Response: streamed content + security headers + CDN cache directives
```

## Improvements over the Cloudflare Worker

| Feature            | CF Worker                    | This port                                           |
| ------------------ | ---------------------------- | --------------------------------------------------- |
| RPC timeout        | None (can hang 30s+)         | `AbortSignal.timeout(5000)` per RPC                 |
| Name normalization | Raw `sub + '.gwei'`          | `normalizeName()` — lowercases + trims              |
| Gateway fetch      | Sequential failover          | `Promise.any()` — races in parallel                 |
| Cache stampede     | None                         | Single-flight dedup via `dedupe()`                  |
| Error logging      | Silent `catch (_) {}`        | `console.error()` for all failures                  |
| Codec constants    | Magic hex strings            | `CODEC_IPFS`, `CODEC_SWARM` named constants         |
| Health check       | None                         | `/.well-known/gateway-status`                       |
| CDN caching        | Cache API (`caches.default`) | `Deno-CDN-Cache-Control` + `stale-while-revalidate` |
| Type safety        | Plain JS                     | Full TypeScript with strict mode                    |
| Module structure   | Single 224-line file         | Modular TypeScript (13 modules)                     |

## Quick start

### Prerequisites

- [Deno 2.0+](https://deno.com) installed
- A [Deno Deploy](https://deno.com/deploy) account (Pro plan recommended for wildcard domains)

### Local development

```sh
# Install dependencies (cached automatically)
deno task dev

# Server starts at http://localhost:8000
# Test it:
curl -H "Host: donnoh.gwei.domains" http://localhost:8000/
```

### Run tests

```sh
deno test --allow-net --allow-env
```

### Type check, lint, format

```sh
deno check main.ts
deno lint
deno fmt
```

## Deployment to Deno Deploy

### 1. Create a project

In the [Deno Deploy dashboard](https://console.deno.com), create a new project named `gwei-gateway`
(or whatever you prefer). Link it to your GitHub repo, or use the CLI.

### 2. Set environment variables

In the project settings → Environment Variables:

| Variable  | Required    | Description                                                                                                     |
| --------- | ----------- | --------------------------------------------------------------------------------------------------------------- |
| `RPC_URL` | Recommended | Dedicated Ethereum RPC endpoint (Alchemy, Infura, etc.). Prepended to the public RPC pool to avoid rate limits. |

### 3. Deploy

**Via GitHub integration** (recommended):

1. Push this repo to GitHub
2. Connect it in the Deno Deploy dashboard
3. Set the entrypoint to `main.ts`
4. Pushes to `main` auto-deploy to production

**Via CLI**:

```sh
deno install -gArf jsr:@deno/deployctl
deployctl deploy --project=gwei-gateway --entrypoint=main.ts
```

### 4. Configure DNS

For wildcard `*.gwei.domains` routing, add DNS records pointing to Deno Deploy:

```
# ANAME/ALIAS method (preferred for wildcard)
*.gwei.domains           ANAME   ingress.denohost.net
_acme-challenge.gwei.domains  CNAME   _acme-challenge.gwei.domains.deno-challenge.com
```

Deno Deploy auto-provisions Let's Encrypt TLS certificates for wildcard domains (Pro plan required).

Add the custom domain `*.gwei.domains` in the project settings → Domains.

## Architecture

```
main.ts                     Entry point — Deno.serve() + top-level error handler
src/
├── handler.ts              Request routing: host parsing, reserved proxy, resolution dispatch
├── constants.ts            Contract address, RPCs, gateways, selectors, TTLs
├── types.ts                Shared TypeScript interfaces + type guards
├── encoding.ts             ABI encoding + hex/base32 helpers (pure functions)
├── cache.ts                In-process memory cache with TTL + stampede protection
├── rpc.ts                  eth_call with AbortSignal timeout + multi-RPC failover
├── codec.ts                Contenthash codec decoding (IPFS, Swarm)
├── resolver.ts             Name resolution: RPC + cache + decode orchestration
├── proxy.ts                IPFS/Swarm content proxy with Promise.any racing
├── headers.ts              Security headers + HTML escaping
├── pages.ts                HTML error/info page generation
├── name.ts                 Subdomain parsing + name normalization
└── tests/                  Unit + integration tests (45 tests)
```

## Caching strategy

Three caching layers reduce latency and RPC calls:

| Layer                 | Storage           | TTL                | Purpose                               |
| --------------------- | ----------------- | ------------------ | ------------------------------------- |
| **CDN cache**         | Deno Deploy edge  | 300s + SWR         | Full HTTP responses (proxied content) |
| **In-process memory** | Isolate `Map`     | 30s                | Hot resolution keys, stampede dedup   |
| **Resolution cache**  | In-process memory | 300s pos / 60s neg | Name → contenthash mappings           |

The CDN layer (`Deno-CDN-Cache-Control` header with `stale-while-revalidate`) handles the bulk of
content caching at zero code cost. The in-process memory cache absorbs burst traffic and prevents
cache stampedes on cold isolates.

## Environment variables

| Variable          | Default | Description                                          |
| ----------------- | ------- | ---------------------------------------------------- |
| `RPC_URL`         | (none)  | Dedicated RPC endpoint, prepended to the public pool |
| `RESOLVE_TTL`     | `300`   | Override positive resolution cache TTL (seconds)     |
| `RESOLVE_NEG_TTL` | `60`    | Override negative resolution cache TTL (seconds)     |
| `CONTENT_TTL`     | `300`   | Override proxied content cache TTL (seconds)         |

See `.env.example` for local development configuration.

## License

MIT — same as the parent gwei-names project.
