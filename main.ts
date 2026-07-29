import { handle, page } from "./src/handler.ts";

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      return await handle(request);
    } catch (error) {
      console.error("Unhandled handler error:", error);
      return page(
        "gwei gateway",
        "<p>Internal gateway error.</p>",
        500,
        "no-store",
      );
    }
  },
} satisfies Deno.ServeDefaultExport;
