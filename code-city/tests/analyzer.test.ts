// RED (behavior 1) — analyzeRepo throws NotImplemented. Every assertion below routes through
// requireGraph(), which rethrows the analyzeRepo failure first, so every currently-failing test
// fails for exactly that reason.
//
// Expected numbers are derived from fixtures/MANIFEST.md — do not hand-wave them.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRepo } from "../src/analyzer/index.ts";
import { validateRepoGraph } from "../src/types.ts";
import type { RepoGraph } from "../src/types.ts";

const BUILD_FIXTURE = fileURLToPath(new URL("../fixtures/build-fixture.mjs", import.meta.url));

let repoDir: string;
let graph: RepoGraph | undefined;
let analyzeError: unknown;

beforeAll(async () => {
  repoDir = mkdtempSync(join(tmpdir(), "code-city-fixture-"));
  execFileSync("node", [BUILD_FIXTURE, repoDir], { stdio: "ignore" });
  try {
    graph = await analyzeRepo(repoDir);
  } catch (err) {
    analyzeError = err;
  }
});

afterAll(() => {
  if (repoDir) rmSync(repoDir, { recursive: true, force: true });
});

function requireGraph(): RepoGraph {
  if (analyzeError) throw analyzeError;
  if (!graph) throw new Error("analyzeRepo did not produce a graph");
  return graph;
}

describe("analyzer (RED — analyzeRepo not implemented yet)", () => {
  it("produces a schema-valid RepoGraph", () => {
    const g = requireGraph();
    expect(validateRepoGraph(g).errors).toEqual([]);
    expect(validateRepoGraph(g).ok).toBe(true);
  });

  it("emits exactly 15 file nodes", () => {
    const g = requireGraph();
    const files = g.nodes.filter((n) => n.type === "file");
    expect(files.length).toBe(15);
  });

  it("emits exactly 26 import edges (value and type-only imports both count)", () => {
    const g = requireGraph();
    const total = g.nodes.reduce((sum, n) => sum + n.imports.length, 0);
    expect(total).toBe(26);
  });

  it("includes 3 specific import edges from the manifest", () => {
    const g = requireGraph();
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    expect(byId.get("auth/tokens.ts")?.imports).toContain("utils/logger.ts");
    expect(byId.get("payments/charge.ts")?.imports).toContain("payments/ledger.ts");
    expect(byId.get("ui/dashboard.ts")?.imports).toContain("auth/session.ts");
  });

  it("populates call edges from parsed files", () => {
    const g = requireGraph();
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    expect(byId.get("ui/form.ts")?.calls).toEqual(["utils/validate.ts", "ui/button.ts"]);
  });

  it("loc is within 10% of the manifest value for 3 named files", () => {
    const g = requireGraph();
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    const withinTenPercent = (actual: number, expected: number): boolean =>
      Math.abs(actual - expected) <= expected * 0.1;

    const logger = byId.get("utils/logger.ts");
    const session = byId.get("auth/session.ts");
    const charge = byId.get("payments/charge.ts");
    expect(logger).toBeDefined();
    expect(session).toBeDefined();
    expect(charge).toBeDefined();
    expect(withinTenPercent(logger!.loc, 38)).toBe(true);
    expect(withinTenPercent(session!.loc, 39)).toBe(true);
    expect(withinTenPercent(charge!.loc, 32)).toBe(true);
  });

  it("every file node has numeric age/churn and nonempty contributors", () => {
    const g = requireGraph();
    const files = g.nodes.filter((n) => n.type === "file");
    expect(files.length).toBeGreaterThan(0);
    for (const n of files) {
      expect(Number.isFinite(n.age)).toBe(true);
      expect(Number.isFinite(n.churn)).toBe(true);
      expect(Array.isArray(n.contributors)).toBe(true);
      expect(n.contributors.length).toBeGreaterThan(0);
    }
  });

  it("payments/ churn-hotspot files have churn strictly greater than a never-retouched file", () => {
    const g = requireGraph();
    const byId = new Map(g.nodes.map((n) => [n.id, n]));

    // utils/logger.ts is touched only by commit 1 (2024-01-01), ~880 days before HEAD
    // (2026-06-01) — outside any reasonable 90-day churn window under any boundary convention.
    const neverRetouched = byId.get("utils/logger.ts");
    expect(neverRetouched).toBeDefined();
    expect(neverRetouched!.churn).toBe(0);

    // ledger.ts/charge.ts/refund.ts are all touched by commit 6, which IS the HEAD commit
    // (2026-06-01) — inside the 90-day window under any boundary convention.
    for (const id of ["payments/ledger.ts", "payments/charge.ts", "payments/refund.ts"]) {
      const n = byId.get(id);
      expect(n).toBeDefined();
      expect(n!.churn).toBeGreaterThan(neverRetouched!.churn);
    }
  });
});
