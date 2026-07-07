// Request handler logic — separated from the Deno.serve() bootstrap so it
// can be unit-tested directly by calling `handle(request)` with mock Requests.

import { RESERVED, RPCS } from "./constants.ts";
import { escapeHtml } from "./headers.ts";
import { normalizeName, parseSubdomain } from "./name.ts";
import { page } from "./pages.ts";
import { proxyContent } from "./proxy.ts";
import { resolveName } from "./resolver.ts";
import { isResolvedError, isResolvedRef } from "./types.ts";

/**
 * Build the RPC endpoint list, optionally prepending a dedicated RPC from the
 * `RPC_URL` environment variable (set via Deno Deploy dashboard or `.env`).
 */
function getRpcs(): string[] {
  const rpcUrl = Deno.env.get("RPC_URL");
  return rpcUrl ? [rpcUrl, ...RPCS] : RPCS;
}

/**
 * Proxy a reserved subdomain to its configured upstream service.
 * No caching or security hardening — transparent pass-through.
 */
async function proxyReserved(
  upstream: string,
  request: Request,
  pathname: string,
  search: string,
): Promise<Response> {
  const resp = await fetch(upstream + pathname + search, {
    method: request.method,
    headers: request.headers,
    body: request.body,
    redirect: "follow",
  });
  return new Response(resp.body, { status: resp.status, headers: resp.headers });
}

/** Build a JSON health-check response with cache-busting headers. */
function healthResponse(): Response {
  return new Response(
    JSON.stringify({
      status: "ok",
      service: "gwei-gateway",
      timestamp: new Date().toISOString(),
    }),
    {
      status: 200,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "no-store",
      },
    },
  );
}

/**
 * Main request handler. Invoked by `Deno.serve()` for every incoming request.
 */
export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();

  // Health check endpoint (before any host validation).
  if (url.pathname === "/.well-known/gateway-status") {
    return healthResponse();
  }

  // Validate this is a *.gwei.domains request.
  const sub = parseSubdomain(host);
  if (!sub) {
    return page("gwei gateway", "<p>Not a gwei name.</p>", 404);
  }

  // Reserved subdomains: transparent reverse-proxy (no caching/hardening).
  const reserved = RESERVED[sub];
  if (reserved) {
    return proxyReserved(reserved, request, url.pathname, url.search);
  }

  // Normalize the subdomain into a full gwei name.
  const name = normalizeName(sub);
  const rpcs = getRpcs();

  // Resolve the name on-chain (with L1 memory caching + stampede protection).
  const r = await resolveName(name, rpcs);

  // Handle resolution failures.
  if (isResolvedError(r)) {
    return page(
      "gwei gateway",
      "<p>Resolution failed (RPC).</p>",
      502,
      "no-store",
    );
  }

  // Successful resolution → fetch and proxy the content.
  if (isResolvedRef(r)) {
    const accept = request.headers.get("accept") || "*/*";
    const resp = await proxyContent(r.kind, r.ref, name, url.pathname, url.search, accept);
    if (!resp) {
      return page(
        name,
        "<p>Content is set but couldn't be fetched right now.</p>",
        504,
        "no-store",
      );
    }
    return resp;
  }

  // Remaining cases: state-based (none / unsupported).
  if (r.state === "none") {
    return page(
      name,
      `<p><b>${escapeHtml(name)}</b> has no website set.</p>` +
        `<p><a href="https://gwei.domains">set one →</a></p>`,
      404,
    );
  }
  // r.state === "unsupported"
  return page(
    name,
    "<p>This name points to an unsupported contenthash (gwei.domains serves IPFS and Swarm).</p>",
    415,
  );
}
