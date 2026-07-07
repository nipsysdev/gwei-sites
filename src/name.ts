// Name parsing and normalization utilities.

import { APEX_DOMAIN } from "./constants.ts";

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
 * is not a `*.gwei.domains` subdomain or is the apex domain.
 *
 * @param host  Lowercased hostname from the Host header.
 * @returns     The subdomain label, or `null` if not a valid gwei subdomain.
 */
export function parseSubdomain(host: string): string | null {
  if (!host.endsWith(APEX_DOMAIN)) return null;
  const sub = host.slice(0, -APEX_DOMAIN.length);
  return sub || null;
}
