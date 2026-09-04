/** System router — health check and basic server info. */
import { ENV } from "./env";
import { publicProcedure, router } from "./trpc";

export const systemRouter = router({
  health: publicProcedure.query(() => ({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
  })),
  /** Public platform branding for host-aware clients (no secrets). */
  platformConfig: publicProcedure.query(() => ({
    platformDomain: ENV.platformDomain,
    featuredStorefrontName: ENV.featuredStorefrontName,
    featuredStorefrontUrl: ENV.featuredStorefrontUrl,
  })),
});
