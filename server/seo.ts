/**
 * SEO routes (MP-014/MP-016): real robots.txt + sitemap.xml.
 * Must be registered BEFORE the SPA fallback or they return index.html (200).
 */
import type { Express, Request, Response } from "express";
import { ENV } from "./_core/env";

function baseUrl(req: Request): string {
  const proto = (req.headers["x-forwarded-proto"] as string)?.split(",")[0]?.trim() || req.protocol || "https";
  const host = (req.headers.host as string)?.split(":")[0] || ENV.platformDomain || "munchpro.in";
  return `${proto}://${req.headers.host ?? host}`;
}

export function registerSeoRoutes(app: Express) {
  app.get("/robots.txt", (_req: Request, res: Response) => {
    const lines = [
      "User-agent: *",
      "Allow: /",
      "Disallow: /admin",
      "Disallow: /admin/",
      "Disallow: /api/",
      "Disallow: /order/",
      `Sitemap: https://${ENV.platformDomain || "munchpro.in"}/sitemap.xml`,
      "",
    ];
    res.type("text/plain").send(lines.join("\n"));
  });

  app.get("/sitemap.xml", async (req: Request, res: Response) => {
    try {
      const { getDb } = await import("./db");
      const db = await getDb();
      const origin = baseUrl(req).replace(/\/$/, "");
      const urls: Array<{ loc: string; changefreq: string; priority: string }> = [
        { loc: `${origin}/`, changefreq: "daily", priority: "0.8" },
        { loc: `${origin}/terms`, changefreq: "yearly", priority: "0.3" },
        { loc: `${origin}/privacy`, changefreq: "yearly", priority: "0.3" },
        { loc: `${origin}/refund`, changefreq: "yearly", priority: "0.3" },
        { loc: `${origin}/contact`, changefreq: "yearly", priority: "0.3" },
        { loc: `${origin}/signup`, changefreq: "monthly", priority: "0.5" },
      ];
      if (db) {
        try {
          const { restaurants } = await import("../drizzle/schema");
          const { eq } = await import("drizzle-orm");
          const rows = await db.select({ slug: restaurants.slug }).from(restaurants).where(eq(restaurants.isOpen, true)).limit(500);
          for (const r of rows) {
            if (r.slug) urls.push({ loc: `${origin}/${encodeURIComponent(r.slug)}`, changefreq: "daily", priority: "0.9" });
          }
        } catch {
          // sitemap degrades to static URLs when DB is unavailable
        }
      }
      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls.map(u => `  <url><loc>${u.loc.replace(/&/g, "&amp;")}</loc><changefreq>${u.changefreq}</changefreq><priority>${u.priority}</priority></url>`),
        "</urlset>",
      ].join("\n");
      res.type("application/xml").send(xml);
    } catch {
      res.status(500).type("application/xml").send('<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
    }
  });
}
