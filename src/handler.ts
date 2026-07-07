// Request handler logic — separated from the Deno.serve() bootstrap so it
// can be unit-tested directly by calling `handle(request)` with mock Requests.

import { RPCS } from "./constants.ts";
import { escapeHtml } from "./headers.ts";
import { normalizeName, parseSubdomain } from "./name.ts";
import { page } from "./pages.ts";
import { proxyContent } from "./proxy.ts";
import { resolveName } from "./resolver.ts";

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
 *
 * Branches exhaustively on the resolver's `status` discriminant: error → 502,
 * ref → proxy content (or 504 if all gateways fail), none → 404, unsupported → 415.
 */
export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();

  // Health check endpoint (before any host validation).
  if (url.pathname === "/.well-known/gateway-status") {
    return healthResponse();
  }

  // Validate this is a *.gwei.site request.
  const sub = parseSubdomain(host);
  if (!sub) {
    return page("gwei gateway", "<p>Not a gwei name.</p>", 404);
  }

  // Normalize the subdomain into a full gwei name, then resolve on-chain
  // (with L1 memory caching + stampede protection).
  const name = normalizeName(sub);
  const r = await resolveName(name, RPCS);

  if (r.status === "error") {
    return page("gwei gateway", "<p>Resolution failed (RPC).</p>", 502, "no-store");
  }

  if (r.status === "ref") {
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

  if (r.status === "none") {
    return page(
      name,
      `<p><b>${escapeHtml(name)}</b> has no website set.</p>` +
        `<p><a href="https://gwei.site">set one →</a></p>`,
      404,
    );
  }

  // r.status === "unsupported"
  return page(
    name,
    "<p>This name points to an unsupported contenthash (gwei.site serves IPFS, IPNS, and Swarm).</p>",
    415,
  );
}
