// Security headers applied to all proxied responses and error pages.

/** Fixed set of security headers layered onto every response we generate. */
export const SECURITY_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "SAMEORIGIN",
  "content-security-policy": "frame-ancestors 'self';",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "geolocation=(), microphone=(), camera=(), payment=(), usb=(), battery=()",
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
