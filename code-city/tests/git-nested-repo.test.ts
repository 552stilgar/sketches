// Regression: analyzing a repoPath that is a SUBDIRECTORY of the actual git root (code-city's
// own dogfood shape, living inside the `sketches` monorepo) must still detect real churn.
// `git log --name-only` prints paths relative to the git root; readFileGitMetrics must resolve
// that against repoPath, not against the root, or every file's churn silently reads 0.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeRepo } from "../src/analyzer/index.ts";
import type { RepoGraph } from "../src/types.ts";

const BUILD_NESTED_FIXTURE = fileURLToPath(new URL("../fixtures/build-nested-fixture.mjs", import.meta.url));

let wrapperDir: string;
let graph: RepoGraph;

beforeAll(async () => {
  wrapperDir = mkdtempSync(join(tmpdir(), "code-city-nested-"));
  const output = execFileSync("node", [BUILD_NESTED_FIXTURE, wrapperDir], { encoding: "utf8" });
  const projectDir = output.trim().split("\n").pop()!;
  graph = await analyzeRepo(projectDir);
});

afterAll(() => {
  if (wrapperDir) rmSync(wrapperDir, { recursive: true, force: true });
});

describe("analyzeRepo — repoPath nested inside a larger git repo", () => {
  it("detects non-zero churn for a file genuinely touched at HEAD", () => {
    const ledger = graph.nodes.find((n) => n.id === "payments/ledger.ts");
    expect(ledger).toBeDefined();
    expect(ledger!.churn).toBeGreaterThan(0);
  });

  it("does not fabricate churn for a file never touched after the initial commit", () => {
    const types = graph.nodes.find((n) => n.id === "payments/types.ts");
    expect(types).toBeDefined();
    // Only the initial commit (2024-01-01) touched it, ~150 days before HEAD (2024-06-01) —
    // well outside the 90-day churn window, so churn must be 0 — but this is "correctly
    // computed 0", not the "always 0 because paths never match" bug this test guards against
    // (proven by ledger.ts being non-zero above, under the exact same code path).
    expect(types!.churn).toBe(0);
  });
});
