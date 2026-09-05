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

  // /assets mixes content-hashed bundles (safe to cache long) with unhashed
  // public/ brand files (replaced in place on redeploy) — cache modestly and
  // never immutable here; Nginx mirrors the same policy in front.
  const assetsDir = path.join(distPath, "assets");
  if (fs.existsSync(assetsDir)) {
    app.use("/assets", express.static(assetsDir, { maxAge: "7d", immutable: false, index: false }));
  }
  // Everything else (fonts, manifest, …) short cache; index.html itself is
  // served below with no-cache so clients never pin stale bundle hashes.
  app.use(
    express.static(distPath, {
      maxAge: "1h",
      index: false,
    })
  );

  // SPA fallback — serve index.html for all non-API routes
  const indexPath = path.join(distPath, "index.html");
  app.get("*", (req, res) => {
    if (req.path.startsWith("/api/")) {
      return res.status(404).json({ error: "API route not found" });
    }
    // Missing build assets must 404, not return the SPA shell with a 200
    // (an <img>/<script> would silently swallow HTML as its body).
    if (req.path.startsWith("/assets/")) {
      return res.status(404).send("Not found");
    }
    res.set("Cache-Control", "no-cache");
    res.sendFile(indexPath);
  });
}
