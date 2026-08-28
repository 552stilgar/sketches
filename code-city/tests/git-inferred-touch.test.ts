// Regression: countRecentTouches used to infer a "touch" from the commit SUBJECT'S scope
// prefix (e.g. "payments: ...") whenever the commit changed no files under that name — a
// workaround for --allow-empty fixture commits that don't actually mutate content. That
// fabricates churn data instead of reflecting real git history (a --allow-empty commit that
// changes nothing must not count as a touch for any file, no matter what its subject claims).

import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readFileGitMetrics } from "../src/analyzer/git.ts";

const AUTHOR_NAME = "Fixture Bot";
const AUTHOR_EMAIL = "fixture@example.com";

function git(dir: string, args: string[], env?: NodeJS.ProcessEnv): void {
  execFileSync("git", args, { cwd: dir, stdio: "ignore", env: { ...process.env, ...env } });
}

let repoDir: string;

afterEach(() => {
  if (repoDir) rmSync(repoDir, { recursive: true, force: true });
});

describe("readFileGitMetrics — an --allow-empty commit is never a fabricated touch", () => {
  it("does not count a no-op commit whose subject just happens to name the file's directory", async () => {
    repoDir = mkdtempSync(join(tmpdir(), "code-city-inferred-touch-"));
    mkdirSync(join(repoDir, "payments"));
    writeFileSync(join(repoDir, "payments", "foo.ts"), "export const a = 1;\n");

    git(repoDir, ["init", "-q"]);
    git(repoDir, ["config", "user.name", AUTHOR_NAME]);
    git(repoDir, ["config", "user.email", AUTHOR_EMAIL]);
    git(repoDir, ["config", "commit.gpgsign", "false"]);

    const dateEnv = (date: string): NodeJS.ProcessEnv => ({
      GIT_AUTHOR_NAME: AUTHOR_NAME,
      GIT_AUTHOR_EMAIL: AUTHOR_EMAIL,
      GIT_AUTHOR_DATE: date,
      GIT_COMMITTER_NAME: AUTHOR_NAME,
      GIT_COMMITTER_EMAIL: AUTHOR_EMAIL,
      GIT_COMMITTER_DATE: date,
    });

    const commit1Date = "2024-01-01T12:00:00+00:00";
    git(repoDir, ["add", "payments/foo.ts"]);
    git(repoDir, ["commit", "-m", "payments: add foo"], dateEnv(commit1Date));

    // A no-op --allow-empty commit, real-world shaped: its subject names "payments" but it
    // changes NOTHING on disk. Must not be counted as a touch for payments/foo.ts.
    const commit2Date = "2024-01-02T12:00:00+00:00";
    git(repoDir, ["commit", "--allow-empty", "-m", "payments: unrelated empty note"], dateEnv(commit2Date));

    const metrics = await readFileGitMetrics(repoDir, "payments/foo.ts", commit2Date);
    expect(metrics.churn).toBe(1);
  });
});
