// IPFS/IPNS/Swarm content proxy: fetches content from storage gateways in
// parallel, returns the first successful response, and cancels the remaining
// (losing) fetches so no upstream bandwidth is wasted. Each gateway's timeout
// covers only the headers phase — the body streams without a hard cutoff.

import { CONTENT_TTL, GATEWAY_TIMEOUT, PROTOCOLS } from "./constants.ts";
import { harden } from "./headers.ts";
import type { Protocol } from "./types.ts";

/**
 * Fetch content from storage gateways, racing all configured gateways in
 * parallel and returning the first successful response. Losing fetches are
 * aborted once a winner is chosen.
 *
 * The per-gateway timeout (`GATEWAY_TIMEOUT`) guards only time-to-headers: the
 * abort timer is cleared as soon as headers arrive, so a large or slow-streaming
 * body is not truncated. If every gateway fails (network error, non-2xx/304, or
 * headers-timeout), returns `null` and the caller produces a 504.
 *
 * The response includes:
 *   - Security headers (via `harden()`)
 *   - `Cache-Control` for browser caching (max-age=300)
 *   - `Deno-CDN-Cache-Control` for edge caching + stale-while-revalidate
 *   - `Deno-Cache-Tag` for targeted cache invalidation by name
 *   - `x-gwei-name` and `x-ipfs-cid` / `x-ipns-name` / `x-swarm-reference` headers
 *
 * @param kind      Protocol ("ipfs" | "ipns" | "swarm").
 * @param ref       The storage reference (CID for IPFS/IPNS, hex hash for Swarm).
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
  const controllers = proto.gateways.map(() => new AbortController());
  let won = false;

  const attempts = proto.gateways.map(async (gw, i) => {
    const controller = controllers[i];
    // Time-to-headers guard. Cleared once headers arrive so the body streams freely.
    const timer = setTimeout(
      () => controller.abort(new Error(`${gw}: headers timeout`)),
      GATEWAY_TIMEOUT,
    );
    try {
      const upstream = await fetch(`${gw}${proto.prefix}${ref}${pathname}${search}`, {
        headers: { accept },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Only accept 2xx and 304 Not Modified as successful.
      if (!upstream.ok && upstream.status !== 304) {
        throw new Error(`${gw}: ${upstream.status}`);
      }

      // A later gateway already won the race — discard this one.
      if (won) {
        await upstream.body?.cancel();
        throw new Error(`${gw}: lost race`);
      }

      // We are the winner. Abort the other (still in-flight) gateways so their
      // connections and bodies are released immediately.
      won = true;
      for (let j = 0; j < controllers.length; j++) {
        if (j !== i) controllers[j].abort();
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
    } catch (e) {
      clearTimeout(timer);
      throw e;
    }
  });

  try {
    return await Promise.any(attempts);
  } catch (aggErr) {
    // Promise.any throws AggregateError if all promises reject.
    const errors = aggErr instanceof AggregateError
      ? aggErr.errors.map((e) => e instanceof Error ? e.message : String(e))
      : [String(aggErr)];
    console.error(`proxyContent(${kind}, ${ref}${pathname}): all gateways failed:`, errors);
    return null;
  }
}
