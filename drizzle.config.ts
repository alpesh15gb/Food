import { defineConfig } from "drizzle-kit";

// `db:generate` is offline (diffs schema.ts against the journal snapshot) and
// must work without a database; only live commands fail fast on a missing URL.
const connectionString = process.env.DATABASE_URL;
const needsLiveDb = process.argv.some((a) =>
  ["migrate", "push", "pull", "studio", "check"].includes(a)
);
if (!connectionString && needsLiveDb) {
  throw new Error("DATABASE_URL is required to run drizzle commands against the database");
}

export default defineConfig({
  schema: "./drizzle/schema.ts",
  out: "./drizzle/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: connectionString ?? "postgresql://localhost:5432/offline-generate",
  },
});
