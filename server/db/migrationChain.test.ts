import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";

/**
 * Migration-chain regression.
 *
 * This chain previously contained ZERO `CREATE TABLE` statements: the 34-table
 * bootstrap lived at drizzle/0000_soft_colonel_america.sql, outside the folder
 * drizzle.config.ts points at, and its first journalled entry indexed a table
 * nothing created — so `drizzle-kit migrate` aborted on a fresh database and
 * production silently deployed an empty schema.
 *
 * These checks are static (no Postgres in CI), so they assert the properties that
 * caused the outage: every table is created, every statement is idempotent, no
 * migration indexes a table before it exists, and nothing is doubled into invalid
 * SQL.
 */
const root = process.cwd();
const migrationsDir = path.join(root, "drizzle", "migrations");
const journalPath = path.join(migrationsDir, "meta", "_journal.json");

type Journal = {
  version: string;
  dialect: string;
  entries: Array<{ idx: number; tag: string; when: number }>;
};

function readJournal(): Journal {
  return JSON.parse(fs.readFileSync(journalPath, "utf8")) as Journal;
}

/** Strip `--` comment lines so commented-out SQL never counts as executed SQL. */
function sqlOnly(text: string): string {
  return text
    .split("\n")
    .filter((line) => line.trim().startsWith("--") === false)
    .join("\n");
}

/**
 * Drop the bodies of `DO $$ ... END $$` blocks: everything inside a DO block is
 * already conditional by construction, so scanning it for unguarded DDL produces
 * false positives.
 */
function topLevelOnly(text: string): string {
  return text.replace(/DO\s+\$\$[\s\S]*?END\s+\$\$/gi, "");
}

/** Regex scan that works under an ES5 target (no downlevelIteration). */
function findAll(text: string, source: string): RegExpExecArray[] {
  const re = new RegExp(source, "g");
  const out: RegExpExecArray[] = [];
  let match = re.exec(text);
  while (match !== null) {
    out.push(match);
    if (match.index === re.lastIndex) re.lastIndex++;
    match = re.exec(text);
  }
  return out;
}

const journal = readJournal();
const files = journal.entries.map((entry) => ({
  entry,
  raw: fs.readFileSync(path.join(migrationsDir, entry.tag + ".sql"), "utf8"),
}));

const CREATE_TABLE = 'CREATE TABLE (?:IF NOT EXISTS )?"([^"]+)"';
const CREATE_INDEX_ON = 'CREATE (?:UNIQUE )?INDEX (?:IF NOT EXISTS )?\\S+ ON "([^"]+)"';

describe("migration chain", () => {
  it("targets the folder drizzle.config.ts actually reads", () => {
    const config = fs.readFileSync(path.join(root, "drizzle.config.ts"), "utf8");
    expect(config).toMatch(/out:\s*"\.\/drizzle\/migrations"/);
  });

  it("has a journal where every entry resolves to a file on disk", () => {
    expect(journal.entries.length).toBeGreaterThan(0);
    for (const entry of journal.entries) {
      expect(fs.existsSync(path.join(migrationsDir, entry.tag + ".sql"))).toBe(true);
    }
  });

  it("applies migrations in strictly increasing journal order", () => {
    journal.entries.forEach((entry, i) => {
      expect(entry.idx).toBe(i);
      const previous = journal.entries[i - 1];
      if (previous) expect(entry.when).toBeGreaterThan(previous.when);
    });
  });

  it("creates the whole schema, not just deltas", () => {
    const tables = new Set<string>();
    for (const file of files) {
      for (const m of findAll(sqlOnly(file.raw), CREATE_TABLE)) tables.add(m[1]);
    }
    // 34 tables in the bootstrap plus the 14 multi-tenant/procurement/loyalty tables.
    expect(tables.size).toBeGreaterThanOrEqual(45);

    // The multi-tenant tables that were previously never created at all.
    for (const required of ["restaurants", "orders", "menu_items", "restaurant_members", "custom_domains"]) {
      expect(tables.has(required)).toBe(true);
    }
  });

  it("creates every table before any migration indexes it", () => {
    const introducedAt = new Map<string, number>();
    files.forEach((file, idx) => {
      for (const m of findAll(sqlOnly(file.raw), CREATE_TABLE)) {
        if (!introducedAt.has(m[1])) introducedAt.set(m[1], idx);
      }
    });

    files.forEach((file, idx) => {
      for (const m of findAll(sqlOnly(file.raw), CREATE_INDEX_ON)) {
        const table = m[1];
        const at = introducedAt.get(table);
        // An index on a table no migration creates is the exact original failure:
        // `relation "custom_domains" does not exist`.
        expect(introducedAt.has(table)).toBe(true);
        if (at != null) expect(at).toBeLessThanOrEqual(idx);
      }
    });
  });

  it("never doubles a guard into invalid SQL", () => {
    const bad: string[] = [];
    for (const file of files) {
      const hits = sqlOnly(file.raw).match(/(IF NOT EXISTS IF NOT EXISTS|EXISTS IF EXISTS)/g);
      if (hits) bad.push(file.entry.tag + ": " + hits[0]);
    }
    expect(bad).toEqual([]);
  });

  it("is fully idempotent so it can replay against a db:push database", () => {
    // Production was created with `pnpm db:push`, leaving __drizzle_migrations empty.
    // Drizzle therefore replays this entire chain against a database that already has
    // every table, so no statement may fail on an object that is already there.
    const problems: string[] = [];
    const checks: Array<[string, string]> = [
      ["CREATE TABLE", '^\\s*CREATE TABLE "([^"]+)"'],
      ["CREATE INDEX", "^\\s*CREATE (UNIQUE )?INDEX (?!IF NOT EXISTS)"],
      ["ADD COLUMN", "^\\s*ALTER TABLE \\S+ ADD COLUMN (?!IF NOT EXISTS)"],
      ["DROP CONSTRAINT", "^\\s*ALTER TABLE \\S+ DROP CONSTRAINT (?!IF EXISTS)"],
      ["ADD CONSTRAINT", "^\\s*ALTER TABLE \\S+ ADD CONSTRAINT "],
    ];
    for (const file of files) {
      const sql = topLevelOnly(sqlOnly(file.raw));
      for (const [label, pattern] of checks) {
        for (const m of findAll(sql, pattern)) {
          problems.push(file.entry.tag + ": " + label + " " + m[0].trim());
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it("guards enum and constraint creation against existing objects", () => {
    const bootstrap = files.find((f) => f.entry.tag === "0000_bootstrap");
    expect(bootstrap).toBeDefined();
    const sql = sqlOnly(bootstrap!.raw);
    const createTypes = findAll(sql, "stmt := 'CREATE TYPE ").length;
    expect(createTypes).toBeGreaterThan(0);
    expect(findAll(sql, "typname = substring").length).toBe(createTypes);
    expect(findAll(sql, "conname = substring").length).toBeGreaterThan(0);
  });

  it("leaves no migration file outside the configured folder unreferenced", () => {
    const onDisk = fs
      .readdirSync(migrationsDir)
      .filter((f) => f.endsWith(".sql"))
      .map((f) => f.replace(/\.sql$/, ""))
      .sort();
    expect(onDisk).toEqual(journal.entries.map((e) => e.tag).sort());
  });
});