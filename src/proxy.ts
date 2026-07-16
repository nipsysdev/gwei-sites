import { getConfig } from "./config.ts";
import {
  CACHE_KEYS,
  CONTENT_BROWSER_MAX_AGE,
  CONTENT_BROWSER_STALE,
  CONTENT_EDGE_MAX_AGE,
  CONTENT_EDGE_STALE,
  PUBLIC_IPFS_GATEWAYS,
  ROUTING_V1_ENDPOINT,
  SWARM_GATEWAYS,
  TIMEOUTS,
  TTL,
} from "./constants.ts";
import { cacheGet, cacheSet, dedupe } from "./cache.ts";
import { pinCid } from "./pinner.ts";
import type { Protocol } from "./types.ts";

function contentGateways(): string[] {
  const gw = getConfig().dedicatedGateway;
  return gw ? [`https://${gw}`, ...PUBLIC_IPFS_GATEWAYS] : [...PUBLIC_IPFS_GATEWAYS];
}

export async function proxyContent(
  kind: Protocol,
  ref: string,
  name: string,
  pathname: string,
  search: string,
  accept: string,
): Promise<Response | null> {
  if (kind === "ipns") {
    const cid = await resolveIpnsToCid(ref);
    if (cid) {
      console.info(`[proxy] ${name}: IPNS ${ref} resolved to CID ${cid}`);
      pinCid(cid, name);
      const gws = contentGateways();
      return fetchViaGateways(gws, "/ipfs/", "x-ipfs-cid", cid, name, pathname, search, accept);
    }
    return fetchViaGateways(
      contentGateways(),
      "/ipns/",
      "x-ipns-name",
      ref,
      name,
      pathname,
      search,
      accept,
    );
  }

  if (kind === "ipfs") {
    return fetchViaGateways(
      contentGateways(),
      "/ipfs/",
      "x-ipfs-cid",
      ref,
      name,
      pathname,
      search,
      accept,
    );
  }

  // swarm
  return fetchViaGateways(
    SWARM_GATEWAYS,
    "/bzz/",
    "x-swarm-reference",
    ref,
    name,
    pathname,
    search,
    accept,
  );
}

async function fetchViaGateways(
  gateways: readonly string[],
  prefix: string,
  header: string,
  ref: string,
  name: string,
  pathname: string,
  search: string,
  accept: string,
): Promise<Response | null> {
  for (const gw of gateways) {
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new Error(`${gw}: headers timeout`)),
      TIMEOUTS.GATEWAY,
    );
    try {
      const upstream = await fetch(`${gw}${prefix}${ref}${pathname}${search}`, {
        headers: { accept },
        redirect: "follow",
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!upstream.ok && upstream.status !== 304) {
        console.warn(`[proxy] ${name}: ${new URL(gw).hostname} → ${upstream.status}`);
        await upstream.body?.cancel();
        continue;
      }

      const headers = new Headers(upstream.headers);
      // fetch has already decoded the body, so the upstream's content-encoding /
      // content-length describe the *compressed* transfer — forwarding them would
      // make the client double-decompress (corruption) or wait for wrong-length
      // bytes. Drop hop-by-hop headers: this proxy is a fresh hop.
      headers.delete("content-encoding");
      headers.delete("content-length");
      headers.delete("transfer-encoding");
      headers.delete("connection");
      headers.delete("content-disposition");
      headers.set(
        "cache-control",
        `public, max-age=${CONTENT_BROWSER_MAX_AGE}, stale-while-revalidate=${CONTENT_BROWSER_STALE}`,
      );
      headers.set(
        "deno-cdn-cache-control",
        `public, s-maxage=${CONTENT_EDGE_MAX_AGE}, stale-while-revalidate=${CONTENT_EDGE_STALE}`,
      );
      headers.set("x-gwei-name", name);
      headers.set(header, ref);
      headers.set("x-gateway", new URL(gw).hostname);

      return new Response(upstream.body, { status: upstream.status, headers });
    } catch (e) {
      clearTimeout(timer);
      console.error(
        `[proxy] ${name}: gateway ${new URL(gw).hostname} failed:`,
        e instanceof Error ? e.message : String(e),
      );
    }
  }

  console.error(`[proxy] ${name}: ${prefix}${ref}${pathname} all gateways failed`);
  return null;
}

export function resolveIpnsToCid(
  peerId: string,
  signal?: AbortSignal,
): Promise<string | null> {
  const key = CACHE_KEYS.IPNS_CID + peerId;
  const cached = cacheGet<string | null>(key);
  if (cached !== undefined) return Promise.resolve(cached);
  return dedupe(key, async () => {
    const cid = await resolveIpns(peerId, signal);
    if (signal?.aborted) return cid;
    cacheSet(key, cid, cid ? TTL.CID_RESOLUTION : TTL.CID_RESOLUTION_ERROR);
    return cid;
  });
}

async function resolveIpns(peerId: string, signal?: AbortSignal): Promise<string | null> {
  const cid = await resolveViaRoutingV1(peerId);
  if (cid) {
    console.info(`[ipns] ${peerId} resolved to ${cid} via routing V1`);
    return cid;
  }
  return resolveViaGatewayRace(peerId, signal);
}

async function resolveViaRoutingV1(peerId: string): Promise<string | null> {
  try {
    const r = await fetch(`${ROUTING_V1_ENDPOINT}/${peerId}`, {
      headers: { "Accept": "application/vnd.ipfs.ipns-record" },
      signal: AbortSignal.timeout(TIMEOUTS.IPNS_RESOLVE),
    });
    if (!r.ok) return null;
    return extractCidFromIpnsRecord(new Uint8Array(await r.arrayBuffer()));
  } catch {
    return null;
  }
}

function extractCidFromIpnsRecord(record: Uint8Array): string | null {
  if (record.length < 2 || record[0] !== 0x0a) return null;
  const [len, start] = readVarint(record, 1);
  const value = new TextDecoder().decode(record.slice(start, start + len));
  if (value.startsWith("/ipfs/")) {
    const cid = value.slice(6);
    if (CIDV1_RE.test(cid)) return cid;
  }
  return null;
}

/** Read a protobuf varint at `offset`; returns [value, nextOffset]. */
function readVarint(data: Uint8Array, offset: number): [number, number] {
  let result = 0;
  let shift = 0;
  let i = offset;
  while (i < data.length) {
    const byte = data[i];
    result |= (byte & 0x7f) << shift;
    i++;
    if ((byte & 0x80) === 0) break;
    shift += 7;
  }
  return [result, i];
}

const CIDV1_RE = /^baf[a-z2-7]+$/i;

/** Extract a CIDv1 from a gateway response (x-ipfs-roots → etag → final URL). */
function extractCid(r: Response): string | null {
  const roots = r.headers.get("x-ipfs-roots");
  if (roots) {
    for (const part of roots.split(",")) {
      const c = part.trim();
      if (CIDV1_RE.test(c)) return c;
    }
  }
  const etag = r.headers.get("etag");
  if (etag) {
    const m = etag.match(/"(baf[a-z2-7]+)"/i);
    if (m && CIDV1_RE.test(m[1])) return m[1];
  }
  try {
    const u = new URL(r.url);
    const sub = u.hostname.match(/^(baf[a-z2-7]+)\.ipfs\./i);
    if (sub && CIDV1_RE.test(sub[1])) return sub[1];
    const p = u.pathname.match(/\/ipfs\/(baf[a-z2-7]+)/i);
    if (p && CIDV1_RE.test(p[1])) return p[1];
  } catch {
    // r.url not parseable — ignore
  }
  return null;
}

/**
 * Fallback: race HEAD requests across the public IPFS gateways; the first to
 * expose `x-ipfs-roots` wins and the rest are aborted.
 */
function resolveViaGatewayRace(
  peerId: string,
  callerSignal?: AbortSignal,
): Promise<string | null> {
  if (PUBLIC_IPFS_GATEWAYS.length === 0) return Promise.resolve(null);
  const controllers = PUBLIC_IPFS_GATEWAYS.map(() => new AbortController());

  return new Promise<string | null>((resolve) => {
    let settled = false;
    let pending = PUBLIC_IPFS_GATEWAYS.length;

    const finish = (cid: string | null) => {
      if (settled) return;
      settled = true;
      for (const c of controllers) c.abort();
      resolve(cid);
    };

    PUBLIC_IPFS_GATEWAYS.forEach(async (gw, i) => {
      try {
        const sigs: AbortSignal[] = [
          controllers[i].signal,
          AbortSignal.timeout(TIMEOUTS.IPNS_RESOLVE),
        ];
        if (callerSignal) sigs.push(callerSignal);
        const r = await fetch(`${gw}/ipns/${peerId}/`, {
          method: "HEAD",
          redirect: "follow",
          signal: AbortSignal.any(sigs),
        });
        if (r.ok) {
          const cid = extractCid(r);
          if (cid) {
            console.info(
              `[ipns] ${peerId} resolved to ${cid} via ${new URL(gw).hostname}`,
            );
            finish(cid);
            return;
          }
        }
      } catch {
        // abort, timeout, or network error
      }
      if (--pending === 0) finish(null);
    });
  });
}
