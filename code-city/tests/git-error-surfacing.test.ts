// Regression: readGitInfo/readFileGitMetrics caught EVERY git failure and returned a
// fabricated placeholder (headSha: "WORKTREE", headDate: new Date(0)) or zeroed metrics,
// instead of surfacing the failure. Per the Failure Discipline LAW (no swallowed exceptions —
// real result -> disclosed fallback (logged+visible) -> thrown error, never silent
// fabrication), a genuinely broken git call must throw, not silently zero.

import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readGitInfo, readFileGitMetrics } from "../src/analyzer/git.ts";

let dir: string;

afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

describe("readGitInfo — a directory that is not a git repo at all", () => {
  it("throws instead of returning a fabricated WORKTREE/epoch placeholder", async () => {
    dir = mkdtempSync(join(tmpdir(), "code-city-not-a-repo-"));
    await expect(readGitInfo(dir)).rejects.toThrow();
  });
});

describe("readFileGitMetrics — a broken git invocation", () => {
  it("throws instead of returning fabricated zeroed metrics", async () => {
    dir = mkdtempSync(join(tmpdir(), "code-city-not-a-repo-2-"));
    // headDate deliberately not the epoch sentinel, so this exercises the real git-call
    // failure path (not-a-git-repo), not any early-return short-circuit.
    await expect(readFileGitMetrics(dir, "some/file.ts", "2024-01-01T00:00:00.000Z")).rejects.toThrow();
  });
});
