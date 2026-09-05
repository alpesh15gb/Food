import "dotenv/config";
import express from "express";
import { createServer } from "http";
import fs from "fs";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import { serveStatic, setupVite } from "./vite";

// NOTE: resolved from the process working directory, not __dirname — the
// production bundle lives at dist/index.js, where ../../images would escape
// to /images (ephemeral) instead of the /app/images volume. CWD is the repo
// root in dev and /app in the container, both correct.
const imagesDir = path.resolve(process.cwd(), "images");
fs.mkdirSync(imagesDir, { recursive: true });

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.set("trust proxy", ENV.trustedProxy);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  app.use("/images", express.static(imagesDir));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // Loopback health probe for Docker HEALTHCHECK + Nginx + deploy scripts.
  // Plain GET (no tRPC batch params): system.health needs ?batch=1&input=…
  app.get("/api/healthz", (_req, res) => {
    res.status(200).json({ ok: true });
  });
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      // Permanent server-side error log: names the failing procedure and the
      // root cause (SQL column, FORBIDDEN, validation). Invaluable on VPS
      // where the browser only shows a generic retry banner.
      onError({ error, path }) {
        console.error(`[tRPC] ${path || "<no-path>"} failed: ${error.message}`);
      },
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const port = ENV.port;

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
