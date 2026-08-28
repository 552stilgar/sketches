// analyzeRepo — datastore detection wiring (V4 contract D1, lane C).
//
// tests/datastores.test.ts gates the pure detectDatastores() unit; this file gates the wiring
// that gets tracked schema/migration source from the filesystem into it inside analyzeRepo, and
// -- the sharpest edge of D1 -- proves the analyzer never opens/reads/stats a `.db` file to do
// it, using a real repo fixture with a gitignored `.db` file made unreadable (chmod 000): if
// anything in the analyzer ever tried to read it, analyzeRepo would throw EACCES.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeRepo } from "../src/analyzer/index.ts";
import type { RepoGraph } from "../src/types.ts";
import type { DatastoreSpec } from "../src/analyzer/datastores.ts";

type RepoGraphWithDatastores = RepoGraph & { datastores?: DatastoreSpec[] };

function git(cwd: string, ...args: string[]): void {
  execFileSync("git", args, { cwd, stdio: "ignore" });
}

let repoDir: string;
let graph: RepoGraphWithDatastores;

beforeAll(async () => {
  repoDir = mkdtempSync(join(tmpdir(), "code-city-datastore-fixture-"));
  git(repoDir, "init", "-q");
  git(repoDir, "config", "user.email", "dev@example.com");
  git(repoDir, "config", "user.name", "dev");

  mkdirSync(join(repoDir, "src", "kernel", "migrations"), { recursive: true });
  writeFileSync(
    join(repoDir, "src", "kernel", "migrations", "001-init.sql"),
    "CREATE TABLE users (id INTEGER PRIMARY KEY);\n",
  );
  writeFileSync(join(repoDir, "src", "kernel", "index.ts"), "export const kernel = 1;\n");

  mkdirSync(join(repoDir, "services", "payments"), { recursive: true });
  writeFileSync(
    join(repoDir, "services", "payments", "schema.sql"),
    "CREATE TABLE charges (id INTEGER PRIMARY KEY);\nCREATE TABLE refunds (id INTEGER PRIMARY KEY);\n",
  );
  writeFileSync(join(repoDir, "services", "payments", "index.ts"), "export const payments = 1;\n");

  // A gitignored, UNREADABLE .db file living right next to the real schema source. If the
  // analyzer's datastore detection ever opened/stat'd this file, analyzeRepo would throw
  // EACCES and the beforeAll below would fail loudly instead of quietly passing.
  writeFileSync(join(repoDir, "src", "kernel", "runtime.db"), "not real sqlite bytes");
  chmodSync(join(repoDir, "src", "kernel", "runtime.db"), 0o000);
  writeFileSync(join(repoDir, ".gitignore"), "*.db\n");

  git(repoDir, "add", "-A");
  git(repoDir, "commit", "-q", "-m", "fixture");

  graph = (await analyzeRepo(repoDir)) as RepoGraphWithDatastores;
});

afterAll(() => {
  if (repoDir) {
    chmodSync(join(repoDir, "src", "kernel", "runtime.db"), 0o600);
    rmSync(repoDir, { recursive: true, force: true });
  }
});

describe("analyzeRepo — datastore detection wiring", () => {
  it("never touches the unreadable .db file (analyzeRepo does not throw EACCES)", () => {
    // Reaching this line at all is the assertion: beforeAll already ran analyzeRepo against a
    // repo containing a chmod-000 .db file sitting in the very directory a real datastore lives
    // in. If any analyzer code path opened/read/stat'd it, the await above would have thrown.
    expect(graph).toBeDefined();
  });

  it("reaches repo.json: detected specs are attached to the returned graph", () => {
    expect(graph.datastores).toBeDefined();
    expect(graph.datastores).toHaveLength(2);
  });

  it("detects the migrations/*.sql datastore, grouped under its owning directory", () => {
    const spec = graph.datastores?.find((s) => s.dir === "src/kernel");
    expect(spec).toBeDefined();
    expect(spec?.migrationCount).toBe(1);
    expect(spec?.tableCount).toBe(1);
  });

  it("detects the bare schema.sql datastore", () => {
    const spec = graph.datastores?.find((s) => s.dir === "services/payments");
    expect(spec).toBeDefined();
    expect(spec?.migrationCount).toBe(0);
    expect(spec?.tableCount).toBe(2);
  });

  it("is deterministic: analyzing the same repo twice yields byte-identical datastore specs", async () => {
    const again = (await analyzeRepo(repoDir)) as RepoGraphWithDatastores;
    expect(JSON.stringify(again.datastores)).toBe(JSON.stringify(graph.datastores));
  });
});
