import fs from "fs";
import path from "path";

// Resolved from the process working directory, not __dirname — the production
// bundle lives at dist/index.js, where ../../images would escape to /images
// (ephemeral) instead of the /app/images volume. CWD is the repo root in dev
// and /app in the container, both correct.
export const imagesDir = path.resolve(process.cwd(), "images");
fs.mkdirSync(imagesDir, { recursive: true });
