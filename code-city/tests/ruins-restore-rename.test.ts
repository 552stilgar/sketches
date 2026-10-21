// L2 / H2 — a deletion that a later restoration invalidated, and a restored file that was then
// renamed, must not be reported as a ruin. Real git fixtures (pinned dates), same pattern as
// tests/ruins.test.ts. Deletions use `git rm` and moves use `git mv` (no rm -rf).

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readRuins } from "../src/analyzer/ruins.ts";

const NAME = "Fixture Bot";
const EMAIL = "fixture@example.com";
const BODY = "export const a = 1;\nexport const b = 2;\nexport const c = 3;\n";

const repoDirs: string[] = [];
afterEach(() => {
  while (repoDirs.length > 0) rmSync(repoDirs.pop()!, { recursive: true, force: true });
});

function g(dir: string, args: string[], env: NodeJS.ProcessEnv = process.env): void {
  execFileSync("git", args, { cwd: dir, stdio: "ignore", env });
}

function newRepo(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `code-city-${label}-`));
  repoDirs.push(dir);
  g(dir, ["init", "-q"]);
  for (const [k, v] of [
    ["user.name", NAME],
    ["user.email", EMAIL],
    ["commit.gpgsign", "false"],
    ["diff.renames", "false"],
  ]) g(dir, ["config", k, v]);
  return dir;
}

function commit(dir: string, message: string, date: string): void {
  g(dir, ["add", "-A"]);
  g(dir, ["commit", "-m", message], {
    ...process.env,
    GIT_AUTHOR_NAME: NAME,
    GIT_AUTHOR_EMAIL: EMAIL,
    GIT_AUTHOR_DATE: date,
    GIT_COMMITTER_NAME: NAME,
    GIT_COMMITTER_EMAIL: EMAIL,
    GIT_COMMITTER_DATE: date,
  });
}

function headDateOf(dir: string): string {
  const raw = execFileSync("git", ["log", "-1", "--format=%cI", "HEAD"], { cwd: dir, encoding: "utf8" }).trim();
  return new Date(raw).toISOString();
}

describe("readRuins — restore-then-rename (H2)", () => {
  it("reports no ruin for a file deleted, restored, then git-mv'd to a new path", async () => {
    const dir = newRepo("ruin-h2");
    writeFileSync(join(dir, "a.ts"), BODY);
    writeFileSync(join(dir, "keep.ts"), "export const keep = 1;\n");
    commit(dir, "initial", "2024-01-01T12:00:00+00:00");

    g(dir, ["rm", "-q", "a.ts"]);
    commit(dir, "drop a", "2024-01-15T12:00:00+00:00");

    writeFileSync(join(dir, "a.ts"), BODY);
    commit(dir, "restore a", "2024-02-01T12:00:00+00:00");

    mkdirSync(join(dir, "new"));
    g(dir, ["mv", "a.ts", "new/a.ts"]);
    commit(dir, "move a", "2024-02-15T12:00:00+00:00");

    const ruins = await readRuins(dir, headDateOf(dir));
    expect(ruins.map((r) => r.path)).toEqual([]);
  });

  it("reports no ruin for a file deleted and later restored at the same path (control for the restoration rule)", async () => {
    const dir = newRepo("ruin-h2-same");
    writeFileSync(join(dir, "a.ts"), BODY);
    commit(dir, "initial", "2024-01-01T12:00:00+00:00");
    g(dir, ["rm", "-q", "a.ts"]);
    commit(dir, "drop a", "2024-01-15T12:00:00+00:00");
    writeFileSync(join(dir, "a.ts"), BODY);
    commit(dir, "restore a", "2024-02-01T12:00:00+00:00");

    expect(await readRuins(dir, headDateOf(dir))).toEqual([]);
  });

  it("still reports exactly one ruin for a genuine deletion with no restoration", async () => {
    const dir = newRepo("ruin-h2-control");
    writeFileSync(join(dir, "a.ts"), BODY);
    writeFileSync(join(dir, "keep.ts"), "export const keep = 1;\n");
    commit(dir, "initial", "2024-01-01T12:00:00+00:00");

    g(dir, ["rm", "-q", "a.ts"]);
    commit(dir, "drop a", "2024-01-15T12:00:00+00:00");

    const ruins = await readRuins(dir, headDateOf(dir));
    expect(ruins).toHaveLength(1);
    expect(ruins[0].path).toBe("a.ts");
    expect(ruins[0].deletedDate).toBe("2024-01-15T12:00:00.000Z");
    expect(ruins[0].lastLoc).toBe(3);
  });
});
