/** OAuth callback routes: exchange authorization code for session. */
import type { Express } from "express";
import { COOKIE_NAME, decodeOAuthState } from "../../shared/const";
import { sdk } from "./sdk";
import { getSessionCookieOptions } from "./cookies";
import { upsertUser } from "../db";

export function registerOAuthRoutes(app: Express) {
  app.get("/api/auth/callback", async (req, res) => {
    try {
      const code = req.query.code as string;
      const state = req.query.state as string;
      if (!code || !state) {
        res.status(400).json({ error: "Missing authorization code" });
        return;
      }

      const token = await sdk.exchangeCodeForToken(code, state);
      const userInfo = await sdk.getUserInfo(token.accessToken);

      await upsertUser({
        openId: userInfo.openId,
        name: userInfo.name || null,
        email: userInfo.email ?? null,
        loginMethod: userInfo.loginMethod ?? userInfo.platform ?? null,
        lastSignedIn: new Date(),
      });

      const sessionToken = await sdk.signSession({
        openId: userInfo.openId,
        appId: "supperclub-direct",
        name: userInfo.name || "",
      });

      const decoded = decodeOAuthState(state);
      const redirectUri = decoded.redirectUri || "/";

      res.cookie(COOKIE_NAME, sessionToken, getSessionCookieOptions(req));
      res.redirect(redirectUri);
    } catch (error) {
      console.error("[OAuth] Callback error:", error);
      res.status(500).json({ error: "Authentication failed" });
    }
  });

  app.get("/api/auth/login", (req, res) => {
    const redirectUri = (req.query.redirect as string) || "/";
    res.redirect(`/api/auth/start?redirect=${encodeURIComponent(redirectUri)}`);
  });
}
