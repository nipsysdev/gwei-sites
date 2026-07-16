import { getConfig } from "./config.ts";
import { PIN_API, TIMEOUTS } from "./constants.ts";

const pinned = new Set<string>();

export async function pinCid(cid: string, name?: string): Promise<void> {
  try {
    const token = getConfig().pinToken;
    if (!token) return;
    if (pinned.has(cid)) return;
    pinned.add(cid);
    const label = name ? `${name} (${cid})` : cid;

    const exists = await existsOnPinService(cid, token);
    if (exists) {
      console.info(`[pin] ${label} already pinned on 4EVERLAND, skipping`);
      return;
    }
    if (exists === null) {
      pinned.delete(cid);
      console.warn(
        `[pin] ${label} existence check failed; not pinning to avoid a duplicate`,
      );
      return;
    }

    console.info(`[pin] pinning ${label}`);
    const res = await fetch(`${PIN_API}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({ cid, ...(name && { name }) }),
      signal: AbortSignal.timeout(TIMEOUTS.PIN_API),
    });
    if (res.ok) {
      console.info(`[pin] ${label} → pinned (${res.status})`);
    } else {
      console.error(`[pin] ${label} → failed (${res.status} ${res.statusText})`);
    }
  } catch (e) {
    console.error(`[pin] ${cid} failed:`, e instanceof Error ? e.message : String(e));
  }
}

async function existsOnPinService(cid: string, token: string): Promise<boolean | null> {
  try {
    const url = `${PIN_API}?cid=${encodeURIComponent(cid)}&status=queued,pinning,pinned&limit=1`;
    const r = await fetch(url, {
      headers: { "authorization": `Bearer ${token}` },
      signal: AbortSignal.timeout(TIMEOUTS.PIN_API),
    });
    if (!r.ok) return null;
    const jsonResp = await r.json() as { count: number; results: [] };
    return jsonResp.count > 0;
  } catch (e) {
    console.error(
      `[pin] ${cid}: existence check failed:`,
      e instanceof Error ? e.message : String(e),
    );
    return null;
  }
}
