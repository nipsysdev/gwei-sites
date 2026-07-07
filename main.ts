// gwei.site gateway — Deno Deploy entry point.
//
// The request handling logic lives in `src/handler.ts` so it can be tested
// in isolation. This file just wires it up to Deno.serve() with a top-level
// error handler.

import { handle } from "./src/handler.ts";
import { page } from "./src/pages.ts";

Deno.serve({
  onError(error) {
    console.error("Unhandled handler error:", error);
    return page(
      "gwei gateway",
      "<p>Internal gateway error.</p>",
      500,
      "no-store",
    );
  },
}, handle);
