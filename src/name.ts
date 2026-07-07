// Name parsing and normalization utilities.

import { APEX_DOMAIN } from "./constants.ts";

/**
 * Get the apex domain to match against, configurable via the `APEX_DOMAIN`
 * env var. Defaults to `.gwei.domains` (production). Set to e.g. `.gwei.site`
 * for testing on a custom domain.
 */
function getApexDomain(): string {
  return Deno.env.get("APEX_DOMAIN") || APEX_DOMAIN;
}

/**
 * Normalize a subdomain label into a full `.gwei` name.
 *
 * Lowercases and trims the label, then appends the `.gwei` suffix.
 * This prevents case-sensitivity issues where `Donnoh.gwei.domains` would
 * resolve differently than `donnoh.gwei.domains`.
 *
 * @param sub  The subdomain label extracted from the Host header.
 * @returns    Normalized full name, e.g. `"donnoh.gwei"`.
 */
export function normalizeName(sub: string): string {
  return sub.toLowerCase().trim() + ".gwei";
}

/**
 * Extract the subdomain label from a hostname, returning `null` if the host
 * is not a recognized subdomain or is the apex domain.
 *
 * The apex domain is configurable via the `APEX_DOMAIN` env var (defaults to
 * `.gwei.domains`).
 *
 * @param host  Lowercased hostname from the Host header.
 * @returns     The subdomain label, or `null` if not a valid subdomain.
 */
export function parseSubdomain(host: string): string | null {
  const apex = getApexDomain();
  if (!host.endsWith(apex)) return null;
  const sub = host.slice(0, -apex.length);
  return sub || null;
}
