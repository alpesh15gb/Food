import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { ENV } from "./env";
import { serveStatic, setupVite } from "./vite";
import { imagesDir } from "./paths";

async function startServer() {
  const app = express();
  const server = createServer(app);
  app.set("trust proxy", ENV.trustedProxy);
  // P0 MP-001: raw-body webhook routes FIRST — express.json() would destroy
  // the exact bytes providers signed. These verify HMAC over Buffer.
  const { registerWebhookRoutes } = await import("../integrations/webhookRoutes");
  registerWebhookRoutes(app);
  // MP-014: real robots.txt + sitemap.xml BEFORE SPA fallback + body parsers.
  const { registerSeoRoutes } = await import("../seo");
  registerSeoRoutes(app);
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
  // Public Maps key for the browser (referrer-restricted public key — safe
  // to expose; Google enforces the domain allowlist). Served at RUNTIME so
  // key rotation never needs a frontend rebuild (Vite build-args proved
  // unreliable through the compose/bake cache path).
  app.get("/api/maps-config", (_req, res) => {
    const key = process.env.GOOGLE_MAPS_API_KEY ?? "";
    res.set("Cache-Control", "no-store");
    res.status(200).json({ keySet: key.trim().length > 0, key });
  });
  // MP-008: lightweight client-error beacon (ErrorBoundary). No PII accepted.
  // Simple per-IP throttle (30/min) to prevent log spam.
  // NOTE: sendBeacon posts text/plain (it can't set content-type), so these
  // two routes parse text bodies tolerant of both plain and JSON.
  const readBeaconBody = (req: { body?: unknown }): Record<string, unknown> => {
    const b = req.body as unknown;
    if (typeof b === "string") {
      try {
        const parsed: unknown = JSON.parse(b);
        if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
      } catch { /* fall through */ }
      return {};
    }
    if (b && typeof b === "object") return b as Record<string, unknown>;
    return {};
  };
  const clientErrorHits = new Map<string, { count: number; resetAt: number }>();
  app.post("/api/client-errors", express.text({ type: "*/*", limit: "64kb" }), (req, res) => {
    try {
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "unknown";
      const now = Date.now();
      const slot = clientErrorHits.get(ip);
      if (slot && now < slot.resetAt) {
        if (slot.count >= 30) { res.status(429).json({ ok: false }); return; }
        slot.count += 1;
      } else clientErrorHits.set(ip, { count: 1, resetAt: now + 60_000 });
      const body = readBeaconBody(req);
      const message = String(body.message ?? "client error").slice(0, 500);
      const route = String(body.route ?? "").slice(0, 200);
      console.error(`[ClientError] route=${route || "-"} msg=${message}`);
      res.status(200).json({ ok: true });
    } catch {
      res.status(200).json({ ok: true });
    }
  });
  // MP-009: privacy-safe funnel beacon. Whitelisted events only, no PII/phone/
  // address accepted — failures carry a reason code, never free text.
  const FUNNEL_EVENTS = new Set([
    "restaurant_viewed", "item_viewed", "add_to_cart", "view_cart",
    "checkout_started", "address_selected", "payment_started",
    "payment_successful", "order_created",
    "payment_failed", "coupon_failed", "restaurant_unavailable",
    "item_unavailable", "address_not_serviceable", "login_failed",
  ]);
  app.post("/api/funnel", express.text({ type: "*/*", limit: "64kb" }), (req, res) => {
    try {
      const body = readBeaconBody(req);
      const event = String(body.event ?? "");
      if (!FUNNEL_EVENTS.has(event)) { res.status(400).json({ ok: false }); return; }
      const slug = typeof body.slug === "string" ? body.slug.slice(0, 96) : undefined;
      const reason = typeof body.reason === "string" ? body.reason.slice(0, 64) : undefined;
      console.log(`[Funnel] event=${event}${slug ? ` slug=${slug}` : ""}${reason ? ` reason=${reason}` : ""}`);
      res.status(200).json({ ok: true });
    } catch {
      res.status(200).json({ ok: true });
    }
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
