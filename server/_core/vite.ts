/** Vite dev server integration for development mode. */
import type { Express } from "express";
import type { Server } from "http";

let vite: any;

export async function setupVite(app: Express, server: Server) {
  if (process.env.NODE_ENV !== "development") return;

  try {
    const { createServer: createViteServer } = await import("vite");
    vite = await createViteServer({
      server: { middlewareMode: true, hmr: { server } },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } catch (error) {
    console.error("[Vite] Failed to setup dev server:", error);
  }
}

export function serveStatic(app: Express) {
  // In production, static files are served by the index.ts entry
}
