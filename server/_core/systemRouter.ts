/** System router — health check and basic server info. */
import { publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure.query(() => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  })),
});
