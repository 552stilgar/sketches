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
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import type { RepoGraph } from "../types.ts";
import { validateRepoGraph } from "../types.ts";
import { analyzeRepo } from "./index.ts";

const execFileAsync = promisify(execFile);

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

// Failure Discipline LAW: node's ENOENT from a failed spawn is IDENTICAL (same code, same
// `path`/`syscall` shape) whether the "git" binary itself is missing or `cwd` just doesn't exist
// on disk -- Node cannot tell the two apart and neither can a caller reading the raw error. Left
// unwrapped, that ambiguity surfaces as a misattributed "spawn git ENOENT", which reads as "git
// isn't installed" even when the real condition is "this path was not present in the repo at
// this point in history" (e.g. a project folded into a monorepo later, or a month before the
// repo's first commit). Every git spawn in this module goes through this wrapper so the two
// cases are told apart and each fails loudly with its own real cause -- never a silent skip.
async function runGit(cwd: string, args: string[], maxBuffer = 64 * 1024 * 1024): Promise<string> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, encoding: "utf8", maxBuffer });
    return stdout.trim();
  } catch (err) {
    if (err && typeof err === "object" && (err as NodeJS.ErrnoException).code === "ENOENT") {
      if (!(await isDirectory(cwd))) {
        throw new Error(
          `cannot run "git ${args.join(" ")}": working directory "${cwd}" does not exist. ` +
            `This is not a missing git installation -- this path was not present at this point ` +
            `in the repo's history.`,
        );
      }
      throw new Error(
        `cannot run "git ${args.join(" ")}": the "git" executable was not found on PATH. ` +
          `Install git or fix PATH -- "${cwd}" exists, so this is a genuinely missing binary, ` +
          `not a history-window issue.`,
      );
    }
    throw err;
  }
}

async function git(cwd: string, args: string[]): Promise<string> {
  return runGit(cwd, args);
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

/** Thrown by withDetachedWorktree when `sha` resolves fine but the analyzed subdirectory has no
 *  entry in that commit's tree -- e.g. a project folded into a monorepo later, being asked for a
 *  month before the fold. Distinguished from a generic Error so generateMonthlySnapshots can
 *  convert it to an accurately-worded skip instead of letting it read as an analyzer crash. */
export class SubdirNotPresentAtCommitError extends Error {
  subdir: string;
  sha: string;

  constructor(subdir: string, sha: string) {
    super(
      `"${subdir}" does not exist at commit ${sha} -- this path was not present in the repo at ` +
        `this point in its history (predates its own creation/fold, not a git installation issue).`,
    );
    this.name = "SubdirNotPresentAtCommitError";
    this.subdir = subdir;
    this.sha = sha;
  }
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
    await runGit(gitRoot, ["worktree", "add", "--detach", "--force", worktreePath, sha]);
    try {
      const subdir = relative(gitRoot, resolve(repoPath));
      const analyzeTarget = subdir === "" ? worktreePath : join(worktreePath, subdir);
      // Never-fabricate, applied to this analyzer boundary too: `sha` resolving successfully
      // only proves the REPO had a commit by this cutoff, not that THIS subdirectory existed in
      // it. Without this check, analyzeRepo's own git calls against a nonexistent cwd fail with
      // node's raw, misattributed ENOENT (Defect 1) -- catch the real condition here instead,
      // before it ever reaches analyzeRepo.
      if (!(await isDirectory(analyzeTarget))) {
        throw new SubdirNotPresentAtCommitError(subdir, sha);
      }
      return await fn(analyzeTarget);
    } finally {
      // --force: the worktree is disposable and may still have the analyzer's own read handles
      // open under load; this is a controlled removal of a dir we own, not a caller path.
      await runGit(gitRoot, ["worktree", "remove", "--force", worktreePath]).catch(async () => {
        // Worktree metadata can go stale if `add` partially failed; prune + best-effort rm so
        // we never leak a registered worktree even when `remove` itself fails.
        await runGit(gitRoot, ["worktree", "prune"]).catch(() => {});
      });
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
    let graph: RepoGraph;
    try {
      graph = await withDetachedWorktree(absoluteRepoPath, commit.sha, (worktreePath) => analyzeRepo(worktreePath));
    } catch (err) {
      if (err instanceof SubdirNotPresentAtCommitError) {
        // The repo had a qualifying commit for this month, but this subdirectory had no entry
        // in it -- same never-fabricate discipline as "no commit on or before this month's end"
        // above: disclose it as a skip with its own accurate reason, don't fabricate a graph for
        // a path that had no content yet, and don't let it abort the whole run.
        skipped.push({ month: commit.month, reason: `path not present at this commit: ${err.message}` });
        continue;
      }
      throw err;
    }
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
