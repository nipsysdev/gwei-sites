// IPFS/Swarm content proxy: fetches content from storage gateways in parallel
// using Promise.any for the fastest successful response, then applies security
// headers and CDN caching directives.

import { CONTENT_TTL, GATEWAY_TIMEOUT, PROTOCOLS } from "./constants.ts";
import { harden } from "./headers.ts";
import type { Protocol } from "./types.ts";

/**
 * Fetch content from IPFS or Swarm gateways, racing all configured gateways
 * in parallel and returning the first successful response.
 *
 * Each gateway request has an independent timeout so a slow gateway can't
 * block the response. If all gateways fail (network error, non-2xx, timeout),
 * returns `null` and the caller should produce a 504.
 *
 * The response includes:
 *   - Security headers (via `harden()`)
 *   - `Cache-Control` for browser caching (max-age=300)
 *   - `Deno-CDN-Cache-Control` for Deno Deploy edge caching + stale-while-revalidate
 *   - `Deno-Cache-Tag` for targeted cache invalidation by name
 *   - `x-gwei-name` and `x-ipfs-cid` / `x-swarm-reference` tracking headers
 *
 * @param kind      Protocol ("ipfs" or "swarm").
 * @param ref       The storage reference (base32 CID for IPFS, hex hash for Swarm).
 * @param name      The full gwei name (for cache tag + tracking header).
 * @param pathname  URL path to append after the content reference.
 * @param search    URL query string (including leading `?`, or empty).
 * @param accept    Accept header value to forward to the gateway.
 * @returns         A complete Response on success, null if all gateways failed.
 */
export async function proxyContent(
  kind: Protocol,
  ref: string,
  name: string,
  pathname: string,
  search: string,
  accept: string,
): Promise<Response | null> {
  const proto = PROTOCOLS[kind];

  const attempts = proto.gateways.map(async (gw) => {
    const upstream = await fetch(`${gw}${proto.prefix}${ref}${pathname}${search}`, {
      headers: { accept },
      redirect: "follow",
      signal: AbortSignal.timeout(GATEWAY_TIMEOUT),
    });

    // Only accept 2xx and 304 Not Modified as successful.
    if (!upstream.ok && upstream.status !== 304) {
      throw new Error(`${gw}: ${upstream.status}`);
    }

    // Apply security headers, CDN cache directives, and tracking headers.
    const headers = harden(new Headers(upstream.headers));
    headers.set("cache-control", `public, max-age=${CONTENT_TTL}`);
    headers.set(
      "deno-cdn-cache-control",
      `public, s-maxage=${CONTENT_TTL}, stale-while-revalidate=${CONTENT_TTL}`,
    );
    headers.set("deno-cache-tag", `gwei:${name}`);
    headers.set("x-gwei-name", name);
    headers.set(proto.header, ref);

    return new Response(upstream.body, { status: upstream.status, headers });
  });

  try {
    return await Promise.any(attempts);
  } catch {
    // Promise.any throws AggregateError if all promises reject.
    console.error(`proxyContent(${kind}, ${ref}): all gateways failed`);
    return null;
  }
}
