/** Storage proxy: serves uploaded files via /manus-storage/ path. */
import type { Express } from "express";
import { storageGetSignedUrl } from "../storage";

export function registerStorageProxy(app: Express) {
  app.get("/manus-storage/:key", async (req, res) => {
    try {
      const key = req.params.key;
      const signedUrl = await storageGetSignedUrl(key);
      res.redirect(signedUrl);
    } catch (error) {
      console.error("[StorageProxy] Error:", error);
      res.status(404).json({ error: "File not found" });
    }
  });
}
