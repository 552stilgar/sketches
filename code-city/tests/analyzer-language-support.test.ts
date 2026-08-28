// Regression: analyzeRepo only ran real parsing for file.language === "typescript" — plain
// JavaScript files (and every other language) unconditionally got a stub
// {imports: [], complexity: 1}, indistinguishable from a real file that genuinely has no
// imports. Plain JS should get the same real tree-sitter analysis TS gets (same grammar
// handles both); genuinely unsupported languages should keep the stub, but disclose it.

import { describe, it, expect, beforeEach, afterEach, afterAll } from "vitest";
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

describe("analyzeRepo — plain JavaScript gets real parsing, not a stub", () => {
  it("resolves a relative import edge between two .js files", async () => {
    repoDir = mkdtempSync(join(tmpdir(), "code-city-js-"));
    writeFileSync(join(repoDir, "util.js"), "export function helper() { return 1; }\n");
    writeFileSync(join(repoDir, "main.js"), 'import { helper } from "./util.js";\nexport const x = helper();\n');
    initRepo(repoDir);
    commitAll(repoDir, "add js files");

    const graph = await analyzeRepo(repoDir);
    const main = graph.nodes.find((n) => n.id === "main.js");
    expect(main).toBeDefined();
    expect(main!.imports).toContain("util.js");
  });
});

describe("analyzeRepo — genuinely unsupported languages keep the stub but disclose it", () => {
  const warnSpy: string[] = [];
  let originalWarn: typeof console.warn;

  beforeEach(() => {
    warnSpy.length = 0;
    originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnSpy.push(args.map(String).join(" "));
    };
  });

  afterAll(() => {
    console.warn = originalWarn;
  });

  it("stubs a .py file's imports/complexity AND logs a visible disclosure naming it", async () => {
    repoDir = mkdtempSync(join(tmpdir(), "code-city-py-"));
    writeFileSync(join(repoDir, "script.py"), "def helper():\n    return 1\n");
    initRepo(repoDir);
    commitAll(repoDir, "add python file");

    const graph = await analyzeRepo(repoDir);
    console.warn = originalWarn;

    const node = graph.nodes.find((n) => n.id === "script.py");
    expect(node).toBeDefined();
    expect(node!.imports).toEqual([]);
    expect(node!.complexity).toBe(1);

    const disclosed = warnSpy.some((line) => line.includes("python"));
    expect(disclosed).toBe(true);
  });
});
