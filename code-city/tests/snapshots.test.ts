// Lane D — snapshot generation (analyzer half of git time-travel, PROJECT_IDEA.md Phase 4).
//
// Fixture: fixtures/build-fixture.mjs, 6 fixed-date commits spread 2024-01-01 .. 2026-06-01 UTC
// noon. That spread is exactly why this fixture (not a fresh single-commit repo) is used here:
// it gives real, distinct months to resolve commits against and real gaps to skip.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generateMonthlySnapshots,
  monthEndCutoff,
  monthKeysEndingAt,
  resolveMonthlyCommits,
} from "../src/analyzer/snapshots.ts";
import { validateRepoGraph } from "../src/types.ts";

const BUILD_FIXTURE = fileURLToPath(new URL("../fixtures/build-fixture.mjs", import.meta.url));
const BUILD_NESTED_FIXTURE = fileURLToPath(new URL("../fixtures/build-nested-fixture.mjs", import.meta.url));

let repoDir: string;

beforeAll(() => {
  repoDir = mkdtempSync(join(tmpdir(), "code-city-snapshots-fixture-"));
  execFileSync("node", [BUILD_FIXTURE, repoDir], { stdio: "ignore" });
});

afterAll(() => {
  if (repoDir) rmSync(repoDir, { recursive: true, force: true });
});

describe("monthKeysEndingAt / monthEndCutoff (pure helpers)", () => {
  it("produces N consecutive month keys ending at asOf's month, oldest first", () => {
    const asOf = new Date("2026-06-15T00:00:00Z");
    const keys = monthKeysEndingAt(asOf, 6);
    expect(keys).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
  });

  it("crosses a year boundary correctly", () => {
    const asOf = new Date("2026-02-01T00:00:00Z");
    const keys = monthKeysEndingAt(asOf, 3);
    expect(keys).toEqual(["2025-12", "2026-01", "2026-02"]);
  });

  it("monthEndCutoff resolves the last instant of the month, UTC", () => {
    expect(monthEndCutoff("2024-02")).toBe("2024-02-29T23:59:59.999Z"); // leap year
    expect(monthEndCutoff("2025-02")).toBe("2025-02-28T23:59:59.999Z");
    expect(monthEndCutoff("2026-01")).toBe("2026-01-31T23:59:59.999Z");
  });
});

describe("resolveMonthlyCommits", () => {
  it("resolves each month to the last commit on or before that month's end", async () => {
    // Fixture commits: 2024-01-01 (utils), 2024-06-15 (auth), 2024-12-01 (ui),
    // 2025-04-10 (payments c1), 2025-10-20 (payments c2), 2026-06-01 (payments c3, HEAD).
    const asOf = new Date("2026-06-01T12:00:00Z");
    const { resolved, skipped } = await resolveMonthlyCommits(repoDir, 6, asOf);
    // last 6 months ending 2026-06: 2026-01 .. 2026-06
    expect(resolved.map((r) => r.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
    // none of 2026-01..05 has a commit of its own -- all resolve to the 2025-10-20 commit
    // (the last commit before that month), and none are skipped because a commit exists.
    const shas = new Set(resolved.map((r) => r.sha));
    expect(shas.size).toBe(2); // the 2025-10-20 commit (months 01-05) + the 2026-06-01 HEAD commit
    expect(resolved[5].date.startsWith("2026-06-01")).toBe(true);
  });

  it("skips months entirely before the repo's first commit -- never fabricates a graph for them", async () => {
    const asOf = new Date("2024-03-01T00:00:00Z");
    const { resolved, skipped } = await resolveMonthlyCommits(repoDir, 3, asOf);
    // 2024-01 has the first commit (2024-01-01); 2023-12 and earlier would be skipped.
    const asOfEarly = new Date("2023-12-15T00:00:00Z");
    const early = await resolveMonthlyCommits(repoDir, 2, asOfEarly);
    expect(early.resolved).toEqual([]);
    expect(early.skipped.map((s) => s.month)).toEqual(["2023-11", "2023-12"]);
    expect(early.skipped[0].reason).toMatch(/no commit/);
  });

  it("does not mutate the caller's working tree (HEAD unchanged after resolving)", async () => {
    const before = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
    await resolveMonthlyCommits(repoDir, 12, new Date("2025-01-01T00:00:00Z"));
    const after = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
    expect(after).toBe(before);
  });
});

describe("generateMonthlySnapshots", () => {
  it("emits one validated RepoGraph per resolved month, each anchored to that month's commit date", async () => {
    const { snapshots, skipped } = await generateMonthlySnapshots(repoDir, {
      months: 6,
      asOf: new Date("2026-06-01T12:00:00Z"),
    });
    expect(snapshots.map((s) => s.month)).toEqual(["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]);
    for (const s of snapshots) {
      expect(validateRepoGraph(s.graph).ok).toBe(true);
      // headDate is re-normalized by readGitInfo (new Date(...).toISOString()), so compare by
      // instant, not by raw string -- s.date carries git's own %cI offset form.
      expect(new Date(s.graph.headDate).getTime()).toBe(new Date(s.date).getTime());
      expect(s.graph.headSha).toBe(s.sha);
    }
    // 2026-06 snapshot is analyzed at the HEAD commit (payments rework) -- 15 files, matching
    // the full fixture (fixtures/MANIFEST.md).
    const june = snapshots.find((s) => s.month === "2026-06");
    expect(june?.graph.nodes.length).toBe(15);
    // 2026-01 snapshot resolves to the 2025-10-20 commit, well before payments/refund.ts's
    // final rework commit existed as HEAD -- still 15 files (refund.ts landed 2025-10-20), but
    // a DIFFERENT headSha/headDate than June's, proving each month is genuinely distinct.
    const january = snapshots.find((s) => s.month === "2026-01");
    expect(january?.graph.headSha).not.toBe(june?.graph.headSha);
    expect(skipped).toEqual([]);
  });

  it("does not mutate the caller's working tree and leaves no worktree behind", async () => {
    const before = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
    await generateMonthlySnapshots(repoDir, { months: 3, asOf: new Date("2026-06-01T12:00:00Z") });
    const after = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoDir, encoding: "utf8" }).trim();
    expect(after).toBe(before);
    const worktreeList = execFileSync("git", ["worktree", "list"], { cwd: repoDir, encoding: "utf8" });
    // Only the main worktree (repoDir itself) should remain registered.
    expect(worktreeList.trim().split("\n").length).toBe(1);
  });

  it("a failed run never leaves the caller's repo in a bad state (no dangling worktree registration)", async () => {
    // A nonexistent repo path fails before any worktree is even created. This is a coarse
    // regression guard: whatever stage fails, git worktree list against the real repo must
    // stay clean -- the finally/try discipline in withDetachedWorktree is exercised directly by
    // the "no worktree behind" happy-path test above; this just confirms failure doesn't
    // corrupt the caller's actual repo state.
    const bogusRepoDir = join(repoDir, "does-not-exist");
    await expect(generateMonthlySnapshots(bogusRepoDir, { months: 1, asOf: new Date("2026-06-01T12:00:00Z") })).rejects.toThrow();
    const worktreeList = execFileSync("git", ["worktree", "list"], { cwd: repoDir, encoding: "utf8" });
    expect(worktreeList.trim().split("\n").length).toBe(1);
  });

  it("DETERMINISM: re-running with a different simulated 'now' reproduces an already-past month byte-identically", async () => {
    // Two different simulated clocks, both after the 2025-10-20 commit, resolving the SAME
    // already-past month (2025-10) via different --months windows. Nothing here reads real
    // wall-clock time -- asOf is fully injected -- so this proves age/churn/headDate never
    // depend on when the tool actually runs.
    const clockA = new Date("2025-11-15T00:00:00Z");
    const clockB = new Date("2025-12-20T00:00:00Z");
    const runA = await generateMonthlySnapshots(repoDir, { months: 2, asOf: clockA }); // 2025-10, 2025-11
    const runB = await generateMonthlySnapshots(repoDir, { months: 3, asOf: clockB }); // 2025-10, 11, 12
    const octA = runA.snapshots.find((s) => s.month === "2025-10");
    const octB = runB.snapshots.find((s) => s.month === "2025-10");
    expect(octA).toBeDefined();
    expect(octB).toBeDefined();
    expect(JSON.stringify(octA?.graph)).toBe(JSON.stringify(octB?.graph));
  }, 20000);

  it("progress callback fires once per resolved month with commit/date/file-count", async () => {
    const progress: { month: string; sha: string; date: string; fileCount: number }[] = [];
    const { snapshots } = await generateMonthlySnapshots(repoDir, {
      months: 3,
      asOf: new Date("2026-06-01T12:00:00Z"),
      onProgress: (p) => progress.push(p),
    });
    expect(progress.length).toBe(snapshots.length);
    expect(progress.every((p) => p.fileCount > 0 && p.sha.length === 40)).toBe(true);
  });

  it("nested repo (repoPath is a subdirectory of the git root) resolves and analyzes correctly", async () => {
    const nestedRoot = mkdtempSync(join(tmpdir(), "code-city-snapshots-nested-"));
    try {
      const projectDir = execFileSync("node", [BUILD_NESTED_FIXTURE, nestedRoot], { encoding: "utf8" }).trim();
      // build-nested-fixture.mjs commits on 2024-01-01 (initial) and 2024-06-01 (ledger
      // rework) -- every month 2024-01..2024-06 has a qualifying commit, so nothing is skipped.
      const { snapshots, skipped } = await generateMonthlySnapshots(projectDir, {
        months: 6,
        asOf: new Date("2024-06-01T12:00:00Z"),
      });
      expect(skipped).toEqual([]);
      expect(snapshots.map((s) => s.month)).toEqual([
        "2024-01",
        "2024-02",
        "2024-03",
        "2024-04",
        "2024-05",
        "2024-06",
      ]);
      for (const s of snapshots) {
        expect(validateRepoGraph(s.graph).ok).toBe(true);
        expect(s.graph.nodes.length).toBe(15);
      }
      // The June snapshot must see the ledger churn recorded against the nested repoPath, not
      // silently read 0 because paths were git-root-relative instead of repoPath-relative.
      const june = snapshots.find((s) => s.month === "2024-06");
      const ledger = june?.graph.nodes.find((n) => n.path === "payments/ledger.ts");
      expect(ledger?.churn).toBeGreaterThan(0);
    } finally {
      rmSync(nestedRoot, { recursive: true, force: true });
    }
  });
});

describe("bin/snapshots.ts CLI", () => {
  it("writes one repo-YYYY-MM.json per resolved month, all validated, using the real wall-clock default", () => {
    const outDir = mkdtempSync(join(tmpdir(), "code-city-snapshots-out-"));
    try {
      const script = fileURLToPath(new URL("../bin/snapshots.ts", import.meta.url));
      // No --asOf on the CLI by design (it's not a param a human should be poking at) -- so this
      // anchors to real "now" and just checks the last 3 months resolve (the fixture's HEAD
      // commit, 2026-06-01, is safely in the past for any real run of this suite) and validate.
      // Exact month-resolution/skip logic is covered exhaustively above against injected clocks.
      const result = execFileSync(
        "node",
        ["--experimental-strip-types", script, repoDir, outDir, "--months", "3"],
        { encoding: "utf8" },
      );
      const files = readdirSync(outDir).sort();
      expect(files.length).toBe(3);
      expect(files.every((f) => /^repo-\d{4}-\d{2}\.json$/.test(f))).toBe(true);
      for (const f of files) {
        const graph = JSON.parse(readFileSync(join(outDir, f), "utf8"));
        expect(validateRepoGraph(graph).ok).toBe(true);
      }
      expect(result).toMatch(/wrote 3 snapshot/);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });

  it("exits non-zero and writes nothing when repo-path does not exist", () => {
    const outDir = mkdtempSync(join(tmpdir(), "code-city-snapshots-out-fail-"));
    try {
      const script = fileURLToPath(new URL("../bin/snapshots.ts", import.meta.url));
      expect(() =>
        execFileSync("node", ["--experimental-strip-types", script, join(repoDir, "nope"), outDir], {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "pipe"],
        }),
      ).toThrow();
      expect(existsSync(outDir) ? readdirSync(outDir) : []).toEqual([]);
    } finally {
      rmSync(outDir, { recursive: true, force: true });
    }
  });
});
