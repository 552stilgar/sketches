// analyzer: tracked-source datastore detection (V4 contract D1 — CONTRACTS.md § "V4: datastores
// + clone identity").
//
// DATASTORE GEOMETRY COMES FROM SCHEMA, NEVER FROM THE LIVE DATABASE FILE. Migrations and
// schema.sql are tracked in git and stable; a `.db` file grows every hour the app runs, and
// sizing a landmark from it would make the city rearrange daily -- breaking the determinism
// constraint (PROJECT_IDEA.md 3.2) outright. Live row counts are the MEASURED tier: allowed
// later, labelled, never blended into structural. This module -- and every caller of it -- must
// never open, stat, or size a `.db` file.
//
// A datastore is detected from TRACKED SOURCE only:
//   - any `*.sql` file under a directory named "migrations"
//   - any file named `schema.sql`
// One datastore per detected directory. `tableCount` and `migrationCount` are both derived from
// the tracked files themselves (schema-driven), never from a runtime artifact -- see
// docs/CONTRACT-repo-json.md § "Datastore detection" for the exact counting rules and
// tests/datastores.test.ts for the RED gate this satisfies.

import { compareCodepoints } from "../util/compare.ts";
import type { DatastoreSpec } from "../types.ts";

// DatastoreSpec's single definition lives in src/types.ts (RepoGraph's `datastores` field carries
// it) -- re-exported here so existing importers of this module keep working unchanged.
export type { DatastoreSpec };

/** True when `path` is a `*.sql` file with a path segment literally named "migrations"
 *  somewhere above it (handles both `dir/migrations/x.sql` and nested `dir/migrations/y/x.sql` --
 *  "under a directory named migrations", not just "directly inside" it). Returns the owning
 *  directory (the path up to, not including, the "migrations" segment) alongside the match. */
function migrationsOwner(path: string): string | undefined {
  if (!path.toLowerCase().endsWith(".sql")) return undefined;
  const segments = path.split("/");
  const index = segments.indexOf("migrations");
  if (index < 0 || index >= segments.length - 1) return undefined;
  return segments.slice(0, index).join("/");
}

/** True when `path` is a bare `schema.sql` file (basename match, case-sensitive per the
 *  contract's literal filename rule). Returns the owning directory (everything before the
 *  filename; "" at repo root). */
function schemaOwner(path: string): string | undefined {
  const segments = path.split("/");
  const basename = segments[segments.length - 1];
  if (basename !== "schema.sql") return undefined;
  return segments.slice(0, -1).join("/");
}

// Counts `CREATE TABLE` statements (case-insensitive keyword, optional `IF NOT EXISTS`) across
// SQL source text. Deliberately does not parse or care about the table identifier itself
// (quoted, unquoted, schema-qualified) -- only the statement count matters for `tableCount`, so
// there is nothing about identifier quoting style that changes the result.
const CREATE_TABLE_RE = /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?/gi;

function countCreateTableStatements(sql: string): number {
  return [...sql.matchAll(CREATE_TABLE_RE)].length;
}

interface Group {
  dir: string;
  migrationSql: string[];
  schemaSql: string[];
  migrationCount: number;
}

export function detectDatastores(files: { path: string; content: string }[]): DatastoreSpec[] {
  const groups = new Map<string, Group>();

  for (const file of files) {
    const migrationDir = migrationsOwner(file.path);
    if (migrationDir !== undefined) {
      const group = groups.get(migrationDir) ?? { dir: migrationDir, migrationSql: [], schemaSql: [], migrationCount: 0 };
      group.migrationSql.push(file.content);
      group.migrationCount += 1;
      groups.set(migrationDir, group);
      continue;
    }
    const schemaDir = schemaOwner(file.path);
    if (schemaDir !== undefined) {
      const group = groups.get(schemaDir) ?? { dir: schemaDir, migrationSql: [], schemaSql: [], migrationCount: 0 };
      group.schemaSql.push(file.content);
      groups.set(schemaDir, group);
    }
  }

  return [...groups.values()]
    .map((group) => {
      const tableCount = countCreateTableStatements([...group.migrationSql, ...group.schemaSql].join("\n"));
      return {
        id: `datastore:${group.dir === "" ? "." : group.dir}`,
        dir: group.dir,
        tableCount,
        migrationCount: group.migrationCount,
      };
    })
    .sort((a, b) => compareCodepoints(a.dir, b.dir));
}
