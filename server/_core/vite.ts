/** Vite dev server integration for development mode, and static file serving for production. */
import type { Express } from "express";
import type { Server } from "http";
import express from "express";
import path from "path";
import fs from "fs";

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
  const distPath = path.resolve(process.cwd(), "dist", "public");

  if (!fs.existsSync(distPath)) {
    console.warn(`[Static] dist/public not found at ${distPath}`);
    return;
  }

  // Serve static assets with long cache
  app.use(
    express.static(distPath, {
      maxAge: "30d",
      index: false,
    })
  );

  // SPA fallback — serve index.html for all non-API routes
  const indexPath = path.join(distPath, "index.html");
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "API route not found" });
    }
    res.sendFile(indexPath);
  });
}
