import { getConfig } from "./config.ts";
import { NAMENFT, PUBLIC_RPCS, RPC_ENDPOINT, TIMEOUTS } from "./constants.ts";

/**
 * eth_call the NameNFT contract, trying each RPC in order until one returns a
 * non-empty result. Each request times out after `timeoutMs`. Returns the hex
 * result, or null if all endpoints fail or return empty (`0x`).
 *
 * The hostname of the RPC that serves a call (and any that fail or return a
 * JSON-RPC error) is logged — so you can see which RPCs carry traffic at runtime.
 */
export async function ethCall(
  data: string,
  rpcs: string[],
  timeoutMs: number = TIMEOUTS.RPC,
): Promise<string | null> {
  for (const rpc of rpcs) {
    try {
      const r = await fetch(rpc, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_call",
          params: [{ to: NAMENFT, data }, "latest"],
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const j = await r.json();
      if (j && j.result && j.result !== "0x") {
        console.info(`[rpc] ${rpcHost(rpc)} ok`);
        return j.result;
      }
      if (j && j.error) {
        console.warn(`[rpc] ${rpcHost(rpc)} JSON-RPC error:`, JSON.stringify(j.error));
      }
    } catch (e) {
      console.error(`[rpc] ${rpcHost(rpc)} failed:`, e instanceof Error ? e.message : String(e));
    }
  }
  return null;
}

/** Hostname of an RPC URL, for logs (contains no API key — the key is in the path). */
function rpcHost(url: string): string {
  return new URL(url).hostname;
}

/**
 * Build the ordered RPC list: configured 4EVERLAND keys (primary then fallback)
 * first, public RPCs last.
 */
export function buildRpcs(primary: string, fallback: string): string[] {
  const fourEver: string[] = [];
  if (primary) fourEver.push(`${RPC_ENDPOINT}/${primary}`);
  if (fallback) fourEver.push(`${RPC_ENDPOINT}/${fallback}`);
  return [...fourEver, ...PUBLIC_RPCS];
}

/** The resolved RPC list (computed from config, tried in order on failure). */
export function rpcs(): string[] {
  return buildRpcs(getConfig().rpcKey, getConfig().rpcKeyFallback);
}
