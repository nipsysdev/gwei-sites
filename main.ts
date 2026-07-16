import { handle, page } from "./src/handler.ts";

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
