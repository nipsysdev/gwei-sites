// HTML error/info page generation with consistent dark-themed styling
// and security headers.

import { harden } from "./headers.ts";

const PAGE_STYLES =
  "body{background:#0a0a0a;color:#e8e8e0;font-family:Helvetica,Arial,sans-serif;" +
  "min-height:100vh;display:flex;flex-direction:column;align-items:center;" +
  "justify-content:center;text-align:center;gap:14px;padding:24px;line-height:1.6}" +
  "a{color:#e8e8e0}p{color:#b8b8b0;max-width:380px;margin:0}";

const PAGE_HEAD =
  '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">' +
  `<title>%TITLE%</title><style>${PAGE_STYLES}</style>`;

/**
 * Build a styled HTML response page with security headers.
 *
 * @param title  Page `<title>` text (also used in templated head).
 * @param body   Raw HTML body content.
 * @param status HTTP status code.
 * @param cache  Cache-Control header value (default: `public, max-age=60`).
 */
export function page(
  title: string,
  body: string,
  status: number,
  cache = "public, max-age=60",
): Response {
  const headers = harden(
    new Headers({ "content-type": "text/html; charset=utf-8", "cache-control": cache }),
  );
  const html = PAGE_HEAD.replace("%TITLE%", title) + body;
  return new Response(html, { status, headers });
}
