// Unit tests for the name parsing/normalization utilities.

import { assertEquals } from "jsr:@std/assert@1";
import { normalizeName, parseSubdomain } from "../name.ts";

Deno.test("normalizeName: appends .gwei suffix", () => {
  assertEquals(normalizeName("xav"), "xav.gwei");
  assertEquals(normalizeName("z0r0z"), "z0r0z.gwei");
});

Deno.test("normalizeName: lowercases the label", () => {
  assertEquals(normalizeName("Xav"), "xav.gwei");
  assertEquals(normalizeName("XAV"), "xav.gwei");
  assertEquals(normalizeName("CamelCase"), "camelcase.gwei");
});

Deno.test("normalizeName: trims whitespace", () => {
  assertEquals(normalizeName("  xav  "), "xav.gwei");
  assertEquals(normalizeName("\txav\n"), "xav.gwei");
});

Deno.test("parseSubdomain: extracts label from valid gwei host", () => {
  assertEquals(parseSubdomain("xav.gwei.site"), "xav");
  assertEquals(parseSubdomain("z0r0z.gwei.site"), "z0r0z");
  assertEquals(parseSubdomain("foo.bar.gwei.site"), "foo.bar");
});

Deno.test("parseSubdomain: returns null for non-gwei host", () => {
  assertEquals(parseSubdomain("example.com"), null);
  assertEquals(parseSubdomain("gwei.eth"), null);
  assertEquals(parseSubdomain("google.com"), null);
});

Deno.test("parseSubdomain: returns null for apex domain and empty label", () => {
  assertEquals(parseSubdomain("gwei.site"), null);
  // ".gwei.site" has an empty label — treated as invalid → null
  assertEquals(parseSubdomain(".gwei.site"), null);
});

Deno.test("parseSubdomain: requires lowercased input (caller lowercases first)", () => {
  // parseSubdomain expects lowercased input; uppercase would not match.
  assertEquals(parseSubdomain("XAV.GWEI.SITE"), null);
  assertEquals(parseSubdomain("XAV.GWEI.SITE".toLowerCase()), "xav");
});
