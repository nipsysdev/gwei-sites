// Unit tests for HTML escaping and response hardening.

import { assertEquals } from "jsr:@std/assert@1";
import { escapeHtml, harden } from "../headers.ts";

Deno.test("escapeHtml: neutralizes all HTML-special characters", () => {
  assertEquals(
    escapeHtml(`<a href="x">a & b</a>`),
    "&lt;a href=&quot;x&quot;&gt;a &amp; b&lt;/a&gt;",
  );
  assertEquals(escapeHtml("it's <ok>"), "it&#39;s &lt;ok&gt;");
});

Deno.test("escapeHtml: stringifies non-string input and passes safe input through", () => {
  assertEquals(escapeHtml(42), "42");
  assertEquals(escapeHtml("plain"), "plain");
  assertEquals(escapeHtml(""), "");
});

Deno.test("harden: applies wildcard CORS onto a Headers object", () => {
  assertEquals(harden(new Headers()).get("access-control-allow-origin"), "*");
});
