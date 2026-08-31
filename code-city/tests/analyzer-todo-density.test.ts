// tests/analyzer-todo-density.test.ts — RepoNode.todoCount as produced by analyzeRepo()
// (V5 — CONTRACTS.md § "V5: TODO density" / docs/CONTRACT-repo-json.md § "TODO density").
//
// Pins the never-fabricate behavior specifically: a language the analyzer does not statically
// support must report todoCount === undefined, never 0 -- a 0 for a file nobody scanned would
// read as "this file is clean", exactly the fabricated-measurement failure mode
// tests/analyzer-language-support.test.ts already pins for imports/complexity. This file is the
// todoCount-specific sibling of that test, same fixture pattern.

import { afterEach, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { analyzeRepo } from "../src/analyzer/index.ts";

const AUTHOR_ENV = {
  GIT_AUTHOR_NAME: "Fixture Bot",
  GIT_AUTHOR_EMAIL: "fixture@example.com",
  GIT_AUTHOR_DATE: "2024-01-01T12:00:00+00:00",
  GIT_COMMITTER_NAME: "Fixture Bot",
  GIT_COMMITTER_EMAIL: "fixture@example.com",
  GIT_COMMITTER_DATE: "2024-01-01T12:00:00+00:00",
};

function initRepo(dir: string): void {
  execFileSync("git", ["init", "-q"], { cwd: dir });
  execFileSync("git", ["config", "user.name", "Fixture Bot"], { cwd: dir });
  execFileSync("git", ["config", "user.email", "fixture@example.com"], { cwd: dir });
  execFileSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir });
}

function commitAll(dir: string, message: string): void {
  execFileSync("git", ["add", "-A"], { cwd: dir });
  execFileSync("git", ["commit", "-q", "-m", message], { cwd: dir, env: { ...process.env, ...AUTHOR_ENV } });
}

let repoDir: string;

afterEach(() => {
  if (repoDir) rmSync(repoDir, { recursive: true, force: true });
});

describe("analyzeRepo — todoCount, never-fabricate rule", () => {
  it("a supported-language file with a known count of markers reports exactly that count", async () => {
    repoDir = mkdtempSync(join(tmpdir(), "code-city-todo-ts-"));
    writeFileSync(
      join(repoDir, "worker.ts"),
      "// TODO: retry on failure\nexport function run() {\n  // FIXME this leaks a handle\n  return 1; // TODO cleanup\n}\n",
    );
    initRepo(repoDir);
    commitAll(repoDir, "add ts file with markers");

    const graph = await analyzeRepo(repoDir);
    const node = graph.nodes.find((n) => n.id === "worker.ts");
    expect(node).toBeDefined();
    expect(node!.todoCount).toBe(3);
  });

  it("a supported-language file with no markers reports a real 0, not undefined", async () => {
    repoDir = mkdtempSync(join(tmpdir(), "code-city-todo-clean-"));
    writeFileSync(join(repoDir, "clean.ts"), "export function helper() {\n  return 1;\n}\n");
    initRepo(repoDir);
    commitAll(repoDir, "add clean ts file");

    const graph = await analyzeRepo(repoDir);
    const node = graph.nodes.find((n) => n.id === "clean.ts");
    expect(node).toBeDefined();
    expect(node!.todoCount).toBe(0);
  });

  it("a file in an unsupported language reports todoCount undefined, NEVER 0 (never-fabricate)", async () => {
    repoDir = mkdtempSync(join(tmpdir(), "code-city-todo-py-"));
    // Python has a TODO marker in it -- if the analyzer fabricated a 0 for unsupported
    // languages instead of leaving the field absent, this test would pass with the wrong count
    // AND the never-fabricate violation would be invisible. Asserting undefined catches both.
    writeFileSync(join(repoDir, "script.py"), "# TODO: port this to TypeScript\ndef helper():\n    return 1\n");
    initRepo(repoDir);
    commitAll(repoDir, "add python file with a marker");

    const graph = await analyzeRepo(repoDir);
    const node = graph.nodes.find((n) => n.id === "script.py");
    expect(node).toBeDefined();
    expect(node!.todoCount).toBeUndefined();
  });

  it("is deterministic: re-analyzing the same repo state yields the same todoCount", async () => {
    repoDir = mkdtempSync(join(tmpdir(), "code-city-todo-det-"));
    writeFileSync(join(repoDir, "a.ts"), "// TODO one\n// TODO two\nexport const x = 1;\n");
    initRepo(repoDir);
    commitAll(repoDir, "add a.ts");

    const first = await analyzeRepo(repoDir);
    const second = await analyzeRepo(repoDir);
    const a1 = first.nodes.find((n) => n.id === "a.ts");
    const a2 = second.nodes.find((n) => n.id === "a.ts");
    expect(a1!.todoCount).toBe(2);
    expect(a2!.todoCount).toBe(a1!.todoCount);
  });
});
