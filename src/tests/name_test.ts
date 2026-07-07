// Unit tests for the name parsing/normalization utilities.

import { assertEquals } from "jsr:@std/assert@1";
import { normalizeName, parseSubdomain } from "../name.ts";

Deno.test("normalizeName: appends .gwei suffix", () => {
  assertEquals(normalizeName("donnoh"), "donnoh.gwei");
  assertEquals(normalizeName("z0r0z"), "z0r0z.gwei");
});

Deno.test("normalizeName: lowercases the label", () => {
  assertEquals(normalizeName("Donnoh"), "donnoh.gwei");
  assertEquals(normalizeName("DONNOH"), "donnoh.gwei");
  assertEquals(normalizeName("CamelCase"), "camelcase.gwei");
});

Deno.test("normalizeName: trims whitespace", () => {
  assertEquals(normalizeName("  donnoh  "), "donnoh.gwei");
  assertEquals(normalizeName("\tdonnoh\n"), "donnoh.gwei");
});

Deno.test("parseSubdomain: extracts label from valid gwei host", () => {
  assertEquals(parseSubdomain("donnoh.gwei.domains"), "donnoh");
  assertEquals(parseSubdomain("z0r0z.gwei.domains"), "z0r0z");
  assertEquals(parseSubdomain("foo.bar.gwei.domains"), "foo.bar");
});

Deno.test("parseSubdomain: returns null for non-gwei host", () => {
  assertEquals(parseSubdomain("example.com"), null);
  assertEquals(parseSubdomain("gwei.eth"), null);
  assertEquals(parseSubdomain("google.com"), null);
});

Deno.test("parseSubdomain: returns null for apex domain", () => {
  assertEquals(parseSubdomain("gwei.domains"), null);
  // ".gwei.domains" has an empty label — treated as invalid → null
  assertEquals(parseSubdomain(".gwei.domains"), null);
});

Deno.test("parseSubdomain: handles uppercase host (caller lowercases first)", () => {
  // parseSubdomain expects lowercased input; "DONNOH" would not match
  assertEquals(parseSubdomain("DONNOH.GWEI.DOMAINS"), null);
  // Correct usage: lowercase first
  assertEquals(parseSubdomain("donnoh.gwei.domains".toLowerCase()), "donnoh");
});
