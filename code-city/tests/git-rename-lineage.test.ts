import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readFileGitMetrics } from "../src/analyzer/git.ts";

const AUTHOR_NAME = "Rename Fixture Bot";
const AUTHOR_EMAIL = "rename-fixture@example.com";
const FIRST_DATE = "2026-01-01T00:00:00Z";
const MODIFY_DATE = "2026-01-15T00:00:00Z";
const HEAD_DATE = "2026-02-01T00:00:00Z";

function git(dir: string, args: string[], date?: string): void {
  const datedEnv: NodeJS.ProcessEnv = date
    ? {
        GIT_AUTHOR_NAME: AUTHOR_NAME,
        GIT_AUTHOR_EMAIL: AUTHOR_EMAIL,
        GIT_AUTHOR_DATE: date,
        GIT_COMMITTER_NAME: AUTHOR_NAME,
        GIT_COMMITTER_EMAIL: AUTHOR_EMAIL,
        GIT_COMMITTER_DATE: date,
      }
    : {};
  execFileSync("git", args, {
    cwd: dir,
    stdio: "ignore",
    env: { ...process.env, ...datedEnv },
  });
}

function initRepo(): string {
  const dir = mkdtempSync(join(tmpdir(), "code-city-rename-lineage-"));
  git(dir, ["init", "-q"]);
  git(dir, ["config", "user.name", AUTHOR_NAME]);
  git(dir, ["config", "user.email", AUTHOR_EMAIL]);
  git(dir, ["config", "commit.gpgsign", "false"]);
  return dir;
}

function buildRenameFixture(diffRenames = true): string {
  const dir = initRepo();
  if (!diffRenames) git(dir, ["config", "diff.renames", "false"]);

  writeFileSync(join(dir, "a.ts"), "export const value = 1;\n");
  git(dir, ["add", "a.ts"]);
  git(dir, ["commit", "-m", "add a"], FIRST_DATE);

  writeFileSync(join(dir, "a.ts"), "export const value = 2;\n");
  git(dir, ["add", "a.ts"]);
  git(dir, ["commit", "-m", "modify a"], MODIFY_DATE);

  mkdirSync(join(dir, "new"));
  git(dir, ["mv", "a.ts", "new/a.ts"]);
  git(dir, ["commit", "-m", "rename a"], HEAD_DATE);
  return dir;
}

let repoDir = "";

afterEach(() => {
  if (repoDir) rmSync(repoDir, { recursive: true, force: true });
  repoDir = "";
});

describe("readFileGitMetrics — rename lineage", () => {
  it("F-A: measures age from the file's first commit before its rename", async () => {
    repoDir = buildRenameFixture();
    const metrics = await readFileGitMetrics(repoDir, "new/a.ts", HEAD_DATE);
    expect(metrics.age).toBe(31);
  });

  it("F-B: counts churn under every path in the file's rename lineage", async () => {
    repoDir = buildRenameFixture();
    const metrics = await readFileGitMetrics(repoDir, "new/a.ts", HEAD_DATE);
    expect(metrics.churn).toBe(3);
  });

  it("F-C: keeps a genuinely new committed file measured at age zero", async () => {
    repoDir = initRepo();
    writeFileSync(join(repoDir, "b.ts"), "export const b = 1;\n");
    git(repoDir, ["add", "b.ts"]);
    git(repoDir, ["commit", "-m", "add b"], HEAD_DATE);

    const metrics = await readFileGitMetrics(repoDir, "b.ts", HEAD_DATE);
    expect(metrics.age).toBe(0);
    expect(metrics.contributors).not.toHaveLength(0);
  });

  it("F-D: leaves a never-committed file unmeasured", async () => {
    repoDir = initRepo();
    writeFileSync(join(repoDir, "seed.ts"), "export const seed = 1;\n");
    git(repoDir, ["add", "seed.ts"]);
    git(repoDir, ["commit", "-m", "add seed"], HEAD_DATE);
    writeFileSync(join(repoDir, "untracked.ts"), "export const untracked = 1;\n");

    const metrics = await readFileGitMetrics(repoDir, "untracked.ts", HEAD_DATE);
    expect(metrics.age).toBe(0);
    expect(metrics.contributors).toEqual([]);
  });

  it("F-E: resolves lineage with ambient rename detection disabled", async () => {
    repoDir = buildRenameFixture(false);
    const metrics = await readFileGitMetrics(repoDir, "new/a.ts", HEAD_DATE);
    expect(metrics.age).toBe(31);
    expect(metrics.churn).toBe(3);
  });
});
