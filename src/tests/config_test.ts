// Unit tests for config parsing (custom-domain alias map).

import { assertEquals } from "jsr:@std/assert@1";
import { parseCustomDomains } from "../config.ts";

Deno.test("parseCustomDomains: parses a single host=name pair", () => {
  const m = parseCustomDomains("xav.dev=xav.gwei");
  assertEquals(m.get("xav.dev"), "xav.gwei");
  assertEquals(m.size, 1);
});

Deno.test("parseCustomDomains: parses multiple comma-separated pairs", () => {
  const m = parseCustomDomains("xav.dev=xav.gwei,blog.example.com=blog.gwei,foo.bar=foo.gwei");
  assertEquals(m.get("xav.dev"), "xav.gwei");
  assertEquals(m.get("blog.example.com"), "blog.gwei");
  assertEquals(m.get("foo.bar"), "foo.gwei");
  assertEquals(m.size, 3);
});

Deno.test("parseCustomDomains: lowercases host and name", () => {
  const m = parseCustomDomains("XAV.Dev=XAV.GWEI");
  assertEquals(m.get("xav.dev"), "xav.gwei");
});

Deno.test("parseCustomDomains: trims whitespace around pairs and sides", () => {
  const m = parseCustomDomains(" xav.dev = xav.gwei , foo.dev = foo.gwei ");
  assertEquals(m.get("xav.dev"), "xav.gwei");
  assertEquals(m.get("foo.dev"), "foo.gwei");
});

Deno.test("parseCustomDomains: skips malformed entries (no =, empty sides)", () => {
  const m = parseCustomDomains(
    "xav.dev=xav.gwei,badpair,=noname,nohost=,  ,x.dev=x.gwei",
  );
  assertEquals(m.get("xav.dev"), "xav.gwei");
  assertEquals(m.get("x.dev"), "x.gwei");
  assertEquals(m.size, 2);
});

Deno.test("parseCustomDomains: empty/blank input yields an empty map", () => {
  assertEquals(parseCustomDomains("").size, 0);
  assertEquals(parseCustomDomains("   ").size, 0);
});

Deno.test("parseCustomDomains: later pairs override earlier ones for the same host", () => {
  const m = parseCustomDomains("xav.dev=first.gwei,xav.dev=second.gwei");
  assertEquals(m.get("xav.dev"), "second.gwei");
  assertEquals(m.size, 1);
});
