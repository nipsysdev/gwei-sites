// Security headers applied to all proxied responses and error pages.

/**
 * Fixed set of security headers layered onto every response we generate.
 *
 * Note on HSTS: `strict-transport-security` deliberately omits
 * `includeSubDomains`. Each `*.gwei.site` subdomain is an independent site, so
 * pinning the apex policy onto every subdomain would force HSTS onto names
 * whose owners did not opt in, and would also pin the bare apex `gwei.site`,
 * which is outside this wildcard gateway's scope. Each subdomain establishes
 * its own HSTS via this header on first response.
 */
export const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "content-security-policy": "frame-ancestors 'self';",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=()",
  "strict-transport-security": "max-age=31536000",
  "cross-origin-resource-policy": "cross-origin",
};

/**
 * Apply the security header set + permissive CORS to a Headers object.
 * Returns the same object for chaining.
 */
export function harden(headers: Headers): Headers {
  for (const k in SECURITY_HEADERS) {
    headers.set(k, SECURITY_HEADERS[k]);
  }
  headers.set("access-control-allow-origin", "*");
  return headers;
}

/** Escape HTML special characters to prevent XSS in dynamically generated pages. */
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
