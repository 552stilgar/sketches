// Monthly repo.json snapshots for git time-travel (PROJECT_IDEA.md Phase 4, analyzer half).
//
// One RepoGraph per monthly snapshot of a repo's history, so a later compiler/renderer lane can
// build a scrubbable timeline. Analyzer-only: this module never touches src/compiler or
// src/renderer.
//
// Determinism (the whole point, CONTRACTS.md's determinism law extended to this lane): each
// snapshot's age/churn must be anchored to THAT SNAPSHOT'S commit date, never wall-clock now().
// analyzeRepo() already anchors every age/churn number to the target repo's HEAD commit date
// (src/analyzer/git.ts) -- so the only new obligation here is making sure HEAD in the analyzed
// checkout really is the historical commit, not the caller's working tree. That's what the
// detached worktree exists for: analyzeRepo(worktreePath) sees a HEAD frozen at the resolved
// historical sha, with no dependency on the wall clock at all. Re-running next month reproduces
// every already-past month byte-identically because the resolved commit for a completed month
// never changes; only the (necessarily unstable) partial current month can differ run to run.
//
// Never-fabricate: a month with no commit at or before its end is SKIPPED, never emitted as an
// empty or interpolated graph.

import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { RepoGraph } from "../types.ts";
import { validateRepoGraph } from "../types.ts";
import { analyzeRepo } from "./index.ts";

const execFileAsync = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim();
}

/** Repo-relative "YYYY-MM" key for each of the last `months` months, ending at `asOf`'s month
 *  (inclusive), oldest first. Pure function of its inputs -- no wall-clock read here; the
 *  caller decides what "now" means. */
export function monthKeysEndingAt(asOf: Date, months: number): string[] {
  if (!Number.isInteger(months) || months < 1) {
    throw new Error(`months must be a positive integer, got ${months}`);
  }
  const endYear = asOf.getUTCFullYear();
  const endMonth = asOf.getUTCMonth(); // 0-indexed
  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const totalMonths = endYear * 12 + endMonth - i;
    const year = Math.floor(totalMonths / 12);
    const month = totalMonths % 12; // 0-indexed
    keys.push(`${year}-${String(month + 1).padStart(2, "0")}`);
  }
  return keys;
}

/** ISO instant for the last moment (UTC) of the given "YYYY-MM" month. */
export function monthEndCutoff(monthKey: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(monthKey);
  if (!match) throw new Error(`invalid month key: ${monthKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]); // 1-indexed
  // Day 0 of next month == last day of this month; UTC end-of-day.
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  return end.toISOString();
}

export interface MonthlyCommit {
  month: string;
  sha: string;
  date: string;
}

export interface SkippedMonth {
  month: string;
  reason: string;
}

async function findCommitAtOrBefore(repoPath: string, cutoffISO: string): Promise<{ sha: string; date: string } | null> {
  const out = await git(repoPath, ["log", "-1", `--before=${cutoffISO}`, "--format=%H%x09%cI", "HEAD"]);
  if (!out) return null;
  const [sha, date] = out.split("\t");
  return { sha, date };
}

/** Resolves each of the last `months` months (ending at `asOf`) to the last commit on or before
 *  that month's end. Months with no qualifying commit are reported in `skipped`, never emitted. */
export async function resolveMonthlyCommits(
  repoPath: string,
  months: number,
  asOf: Date,
): Promise<{ resolved: MonthlyCommit[]; skipped: SkippedMonth[] }> {
  const resolved: MonthlyCommit[] = [];
  const skipped: SkippedMonth[] = [];
  for (const month of monthKeysEndingAt(asOf, months)) {
    const cutoff = monthEndCutoff(month);
    const found = await findCommitAtOrBefore(repoPath, cutoff);
    if (found) {
      resolved.push({ month, sha: found.sha, date: found.date });
    } else {
      skipped.push({ month, reason: "no commit on or before this month's end" });
    }
  }
  return { resolved, skipped };
}

/** Runs `fn` against a temporary detached worktree checked out at `sha`, then always removes it
 *  -- including when `fn` throws. Never mutates the caller's actual working tree: `git worktree
 *  add --detach` creates an independent checkout sharing the same object store, it does not
 *  touch HEAD/index of `repoPath`. */
async function withDetachedWorktree<T>(repoPath: string, sha: string, fn: (worktreePath: string) => Promise<T>): Promise<T> {
  const gitRoot = await git(repoPath, ["rev-parse", "--show-toplevel"]);
  const worktreeParent = await mkdtemp(join(tmpdir(), "code-city-snapshot-"));
  const worktreePath = join(worktreeParent, "wt");
  try {
    await execFileAsync("git", ["worktree", "add", "--detach", "--force", worktreePath, sha], {
      cwd: gitRoot,
      encoding: "utf8",
    });
    try {
      const subdir = relative(gitRoot, resolve(repoPath));
      const analyzeTarget = subdir === "" ? worktreePath : join(worktreePath, subdir);
      return await fn(analyzeTarget);
    } finally {
      // --force: the worktree is disposable and may still have the analyzer's own read handles
      // open under load; this is a controlled removal of a dir we own, not a caller path.
      await execFileAsync("git", ["worktree", "remove", "--force", worktreePath], { cwd: gitRoot, encoding: "utf8" }).catch(
        async () => {
          // Worktree metadata can go stale if `add` partially failed; prune + best-effort rm so
          // we never leak a registered worktree even when `remove` itself fails.
          await execFileAsync("git", ["worktree", "prune"], { cwd: gitRoot, encoding: "utf8" }).catch(() => {});
        },
      );
    }
  } finally {
    await rm(worktreeParent, { recursive: true, force: true });
  }
}

export interface SnapshotProgress {
  month: string;
  sha: string;
  date: string;
  fileCount: number;
}

export type ProgressCallback = (progress: SnapshotProgress) => void;

export interface MonthlySnapshot {
  month: string;
  sha: string;
  date: string;
  graph: RepoGraph;
}

export interface GenerateSnapshotsOptions {
  months?: number;
  asOf?: Date;
  onProgress?: ProgressCallback;
}

/** Generates one validated RepoGraph per monthly snapshot. Every resolved month is analyzed in
 *  its own detached worktree and validated with validateRepoGraph before being added to the
 *  result -- one invalid snapshot throws immediately (Failure Discipline LAW: never silently
 *  degrade), well before anything is written to disk by a caller. */
export async function generateMonthlySnapshots(
  repoPath: string,
  options: GenerateSnapshotsOptions = {},
): Promise<{ snapshots: MonthlySnapshot[]; skipped: SkippedMonth[] }> {
  const months = options.months ?? 24;
  const asOf = options.asOf ?? new Date();
  const absoluteRepoPath = resolve(repoPath);

  const { resolved, skipped } = await resolveMonthlyCommits(absoluteRepoPath, months, asOf);

  const snapshots: MonthlySnapshot[] = [];
  for (const commit of resolved) {
    const graph = await withDetachedWorktree(absoluteRepoPath, commit.sha, (worktreePath) => analyzeRepo(worktreePath));
    // analyzeRepo faithfully reports repoPath as "what it was invoked against" (the ephemeral
    // worktree, per docs/CONTRACT-repo-json.md), but that directory is deleted the moment this
    // loop iteration ends -- keeping it would (a) make repoPath meaningless to any later reader
    // of the written snapshot and (b) break byte-identical determinism across two runs of this
    // tool, since mkdtemp's random suffix differs every time even for the identical commit. The
    // snapshot's repoPath is corrected to the real, stable repo location it actually represents.
    graph.repoPath = absoluteRepoPath;
    const result = validateRepoGraph(graph);
    if (!result.ok) {
      throw new Error(
        `snapshot for ${commit.month} (commit ${commit.sha}) produced an invalid RepoGraph:\n` +
          result.errors.map((e) => `  - ${e}`).join("\n"),
      );
    }
    snapshots.push({ month: commit.month, sha: commit.sha, date: commit.date, graph });
    options.onProgress?.({ month: commit.month, sha: commit.sha, date: commit.date, fileCount: graph.nodes.length });
  }

  return { snapshots, skipped };
}
