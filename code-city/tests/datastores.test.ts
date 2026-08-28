// RED — detectDatastores (src/analyzer/datastores.ts) throws NotImplemented today. Turns GREEN
// once the V4 analyzer lane implements it (CONTRACTS.md § "V4: datastores + clone identity", D1:
// DATASTORE GEOMETRY COMES FROM SCHEMA, NEVER FROM THE LIVE DATABASE FILE).
//
// Concrete rules these assertions gate (docs/CONTRACT-repo-json.md § "Datastore detection"):
//   - a datastore is detected from *.sql files under a directory named "migrations", OR a file
//     named schema.sql -- nothing else
//   - one datastore per directory (the directory containing "migrations/", or containing a bare
//     schema.sql)
//   - migrationCount = count of tracked *.sql files under that datastore's "migrations" dir (0
//     for a bare-schema.sql datastore)
//   - tableCount = count of `CREATE TABLE` statements (case-insensitive) across the datastore's
//     tracked schema content -- never row counts, never anything read from a .db file
//   - a repo with four gitignored `backups/*.db` copies of the same store still yields ONE
//     datastore, because file-driven detection never enters the picture at all -- the function
//     only ever sees {path, content} the caller chose to hand it, and the caller (analyzer) never
//     hands it .db content in the first place (real examples: usul-mgmt/src/kernel/migrations/,
//     usul-heighliner-radio/src/schema.sql, both cited in CONTRACTS.md)

import { describe, expect, it } from "vitest";
import { detectDatastores } from "../src/analyzer/datastores.ts";

function file(path: string, content: string): { path: string; content: string } {
  return { path, content };
}

const MIGRATION_1 = "CREATE TABLE users (id INTEGER PRIMARY KEY, email TEXT NOT NULL);\n";
const MIGRATION_2 = "CREATE TABLE sessions (id INTEGER PRIMARY KEY, user_id INTEGER);\n" +
  "CREATE TABLE IF NOT EXISTS tokens (id INTEGER PRIMARY KEY);\n";
const SCHEMA_SQL = "CREATE TABLE segments (id INTEGER PRIMARY KEY);\nCREATE TABLE episodes (id INTEGER PRIMARY KEY);\n";

describe("detectDatastores (RED until the V4 analyzer lane lands)", () => {
  it("detects one datastore from a migrations/*.sql directory, sized from schema not runtime data", () => {
    const specs = detectDatastores([
      file("src/kernel/migrations/001-init.sql", MIGRATION_1),
      file("src/kernel/migrations/002-sessions.sql", MIGRATION_2),
    ]);
    expect(specs).toHaveLength(1);
    expect(specs[0].dir).toBe("src/kernel");
    expect(specs[0].migrationCount).toBe(2);
    // users + sessions + tokens = 3 CREATE TABLE statements across both migration files.
    expect(specs[0].tableCount).toBe(3);
  });

  it("detects one datastore from a bare schema.sql file, migrationCount 0", () => {
    const specs = detectDatastores([file("src/schema.sql", SCHEMA_SQL)]);
    expect(specs).toHaveLength(1);
    expect(specs[0].dir).toBe("src");
    expect(specs[0].migrationCount).toBe(0);
    expect(specs[0].tableCount).toBe(2);
  });

  it("ignores everything that is not migrations/*.sql or schema.sql -- including .db paths", () => {
    // A .db path would only ever reach this function if a caller violated D1 and handed it one;
    // detectDatastores must still refuse to treat it as schema source (defense in depth, on top
    // of the analyzer never opening/statting/sizing a .db file in the first place).
    const specs = detectDatastores([
      file("data/station.db", "not real sql, this is opaque binary-ish content"),
      file("backups/wk-2026-08-28.db", "another opaque backup"),
      file("src/index.ts", "export const x = 1;\n"),
      file("src/migrations-notes.md", "CREATE TABLE not_a_real_table (id INTEGER);\n"),
    ]);
    expect(specs).toEqual([]);
  });

  it("does not fabricate a datastore where there is no tracked schema at all", () => {
    expect(detectDatastores([])).toEqual([]);
    expect(detectDatastores([file("README.md", "# hello\n")])).toEqual([]);
  });

  it("keeps multiple datastores in different directories distinct", () => {
    const specs = detectDatastores([
      file("services/auth/migrations/001.sql", MIGRATION_1),
      file("services/payments/schema.sql", SCHEMA_SQL),
    ]);
    expect(specs).toHaveLength(2);
    const dirs = specs.map((s) => s.dir).sort();
    expect(dirs).toEqual(["services/auth", "services/payments"]);
  });

  it("four gitignored backup copies of the same store still resolve to ONE datastore", () => {
    // Simulates the real finding from CONTRACTS.md: file-driven (.db) detection would see 4
    // reservoirs where there is 1 store. Since detectDatastores only ever sees tracked
    // {path, content} -- never .db files -- there is nothing here to collapse; the single
    // migrations/ directory already produces exactly one spec.
    const specs = detectDatastores([
      file("app/migrations/001-init.sql", MIGRATION_1),
      file("app/migrations/002-sessions.sql", MIGRATION_2),
    ]);
    expect(specs).toHaveLength(1);
  });

  it("every returned spec has a non-empty id and non-negative counts", () => {
    const specs = detectDatastores([
      file("src/kernel/migrations/001-init.sql", MIGRATION_1),
      file("src/schema.sql", SCHEMA_SQL),
    ]);
    for (const spec of specs) {
      expect(spec.id.length).toBeGreaterThan(0);
      expect(spec.tableCount).toBeGreaterThanOrEqual(0);
      expect(spec.migrationCount).toBeGreaterThanOrEqual(0);
    }
  });
});
