// Ethereum JSON-RPC `eth_call` with per-endpoint timeout and multi-RPC failover.

import { NAMENFT, RPC_TIMEOUT } from "./constants.ts";

/**
 * Make an `eth_call` to the NameNFT contract, trying each RPC endpoint in
 * order until one returns a non-empty result. Each individual request has a
 * timeout (default 5s) so a hung endpoint can't block the gateway indefinitely.
 *
 * Returns the hex result string, or `null` if all endpoints fail or return
 * empty (`0x`) results.
 *
 * @param data   Full calldata hex string (including 0x prefix and selector).
 * @param rpcs   Ordered list of RPC endpoint URLs.
 * @param timeoutMs Per-request abort timeout in milliseconds.
 */
export async function ethCall(
  data: string,
  rpcs: string[],
  timeoutMs: number = RPC_TIMEOUT,
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
      if (j && j.result && j.result !== "0x") return j.result;
    } catch (e) {
      // Network error, timeout, JSON parse failure, or RPC error field —
      // log and try the next endpoint.
      console.error(`rpc ${rpc} failed:`, e instanceof Error ? e.message : String(e));
    }
  }
  return null;
}
