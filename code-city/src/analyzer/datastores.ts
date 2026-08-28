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
// docs/CONTRACT-repo-json.md § "Datastore detection" for the exact counting rules the
// implementation lane must satisfy, and tests/datastores.test.ts for the RED gate.
//
// Implementation lane fills this in (V4 lane, analyzer side).

export interface DatastoreSpec {
  /** Stable id for this datastore, derived from `dir` -- see the contract doc for the exact
   *  convention (implementation lane's call, documented there once made). */
  id: string;
  /** Repo-relative directory this datastore's tracked schema/migrations live under. */
  dir: string;
  /** Table count, derived from tracked schema source (never a live .db file) -- feeds
   *  Landmark.weight for kind "datastore" (docs/CONTRACT-city-json.md). */
  tableCount: number;
  /** Count of tracked `*.sql` files under a "migrations" directory for this datastore (0 if this
   *  datastore was detected from a bare `schema.sql` instead). */
  migrationCount: number;
}

export function detectDatastores(files: { path: string; content: string }[]): DatastoreSpec[] {
  throw new Error("NotImplemented");
}
