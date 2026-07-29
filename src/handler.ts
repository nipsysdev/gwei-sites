import { domainToUnicode } from "node:url";
import { APEX_DOMAIN, PAGE_HEAD, SECURITY_HEADERS } from "./constants.ts";
import { getConfig } from "./config.ts";
import { renderHomepage } from "./homepage.ts";
import { proxyContent } from "./proxy.ts";
import { resolveName } from "./resolver.ts";

const APEX_HOST = APEX_DOMAIN.slice(1); // ".gwei.site" → "gwei.site"
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

// Main request handler — branches on the resolver's status: error → 502,
// ref → proxy (or 504 if all gateways fail), none → 404, unsupported → 415.
// Health probes (`/.well-known/health`) short-circuit before any resolution.
export async function handle(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const host = url.hostname.toLowerCase();

  if (url.pathname === "/.well-known/health") {
    return healthResponse();
  }

  const sub = parseSubdomain(host);
  let name: string;
  if (sub) {
    name = normalizeName(sub);
  } else if (isHomepageHost(host)) {
    return apexRoute(url.pathname);
  } else {
    // Custom-domain alias: host → full `.gwei` name (e.g. xav.dev → xav.gwei).
    const alias = getConfig().customDomains.get(host);
    if (!alias) {
      console.info(`[handler] not a gwei name: ${host}`);
      return page("gwei gateway", "<p>Not a gwei name.</p>", 404);
    }
    name = alias;
  }

  const r = await resolveName(name);

  switch (r.status) {
    case "error":
      console.warn(`[handler] ${name} → RPC error (502)`);
      return page("gwei gateway", "<p>Resolution failed (RPC).</p>", 502, "no-store");
    case "ref": {
      const accept = request.headers.get("accept") || "*/*";
      const resp = await proxyContent(r.kind, r.ref, name, url.pathname, url.search, accept);
      if (!resp) {
        console.warn(`[handler] ${name} → ${r.kind} ${r.ref} all gateways failed (504)`);
        return page(
          name,
          "<p>Content is set but couldn't be fetched right now.</p>",
          504,
          "no-store",
        );
      }
      const gw = resp.headers.get("x-gateway") ?? "unknown";
      console.info(`[handler] ${name} → ${r.kind} ${r.ref} (${resp.status}, via ${gw})`);
      harden(resp.headers); // proxied content gets the same security headers
      return resp;
    }
    case "none":
      console.info(`[handler] ${name} → no contenthash set (404)`);
      return page(
        name,
        "<p><b>" + escapeHtml(name) + "</b> has no website set.</p>",
        404,
      );
    case "unsupported":
      console.info(`[handler] ${name} → unsupported contenthash codec (415)`);
      return page(
        name,
        "<p>This name points to an unsupported contenthash (gwei.site serves IPFS, IPNS, and Swarm).</p>",
        415,
      );
    default:
      throw new Error(`Unreachable: ${JSON.stringify(r)}`);
  }
}

/** Build a styled HTML response. `title` is HTML-escaped before templating. */
export function page(
  title: string,
  body: string,
  status: number,
  cache = "public, max-age=60",
): Response {
  const headers = harden(
    new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": cache }),
  );
  const html = PAGE_HEAD.replace("%TITLE%", escapeHtml(title)) + body;
  return new Response(html, { status, headers });
}

function homepageResponse(): Response {
  const headers = harden(
    new Headers({
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=300",
    }),
  );
  return new Response(renderHomepage(), { status: 200, headers });
}

const ASSETS_DIR = new URL("../assets/", import.meta.url);

async function apexRoute(pathname: string): Promise<Response> {
  switch (pathname) {
    case "/robots.txt":
      return robotsResponse();
    case "/og.png":
      return await assetResponse("og.png", "image/png");
    case "/favicon.svg":
      return await assetResponse("favicon.svg", "image/svg+xml");
    case "/favicon.ico":
      return await assetResponse("favicon.svg", "image/svg+xml");
    default:
      console.info("[handler] homepage");
      return homepageResponse();
  }
}

async function assetResponse(file: string, contentType: string): Promise<Response> {
  try {
    const data = await Deno.readFile(new URL(file, ASSETS_DIR));
    const headers = harden(
      new Headers({
        "content-type": contentType,
        "cache-control": "public, max-age=86400",
      }),
    );
    return new Response(data, { status: 200, headers });
  } catch {
    return page("gwei gateway", "<p>Not found.</p>", 404);
  }
}

function robotsResponse(): Response {
  const body = "User-agent: *\nAllow: /\n";
  const headers = harden(
    new Headers({
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=86400",
    }),
  );
  return new Response(body, { status: 200, headers });
}

/** Liveness probe response (JSON, never cached). */
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

/** Normalize a DNS subdomain into the UTF-8 name registered on-chain. */
export function normalizeName(sub: string): string {
  const ascii = sub.toLowerCase().trim();
  return (domainToUnicode(ascii) || ascii) + ".gwei";
}

/** Extract the subdomain label from a hostname, or null if not a `*.gwei.site` subdomain. */
export function parseSubdomain(host: string): string | null {
  if (!host.endsWith(APEX_DOMAIN)) return null;
  const sub = host.slice(0, -APEX_DOMAIN.length);
  return sub || null;
}

export function isHomepageHost(host: string): boolean {
  return host === APEX_HOST || LOOPBACK_HOSTS.has(host);
}

/**
 * Apply the security header set + wildcard CORS. Mutates and returns `headers`.
 * Centralized here so EVERY response the gateway returns — proxied content and
 * error pages alike — gets the same policy at the response boundary.
 */
export function harden(headers: Headers): Headers {
  for (const k in SECURITY_HEADERS) {
    headers.set(k, SECURITY_HEADERS[k]);
  }
  headers.set("access-control-allow-origin", "*");
  return headers;
}

/** Escape HTML-special characters in untrusted input for safe interpolation. */
export function escapeHtml(s: unknown): string {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c]!,
  );
}
