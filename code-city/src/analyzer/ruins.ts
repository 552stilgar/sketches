// analyzer: RUINS — source files REMOVED from the tracked tree inside the HEAD-anchored analysis
// window (V5.3 — CONTRACTS.md § "V5.3: ruins" / docs/CONTRACT-repo-json.md § "Ruins (V5.3)").
//
// ---------------------------------------------------------------------------------------------
// The design call, and why the contract is narrower than the word "ruins" suggests
// ---------------------------------------------------------------------------------------------
//
// A deleted file has no current LOC, no complexity, no import/call edges, no contributors-as-of-
// HEAD, no content hash, and — critically — NO PLACE IN THE TREE. Every one of those is
// UNMEASURED, not zero. So a ruin is deliberately NOT a `RepoNode`:
//
//   * If a ruin were a node, the shape would force `loc: 0, complexity: 0, churn: 0, age: 0,
//     imports: [], calls: [], contributors: []` — seven fabricated measurements, each one
//     individually indistinguishable from a real, tiny, quiet, brand-new file. That is precisely
//     the failure mode the deleted commit-message-prefix churn heuristic had (`318773d`), and
//     PROJECT_IDEA.md §5.5 constraint 2 restates it: absence of a signal must never render as a
//     plausible default. `RepoGraph.ruins` is therefore a SEPARATE array with a SEPARATE type, so
//     no consumer can iterate `nodes` and pick up a ruin by accident.
//
// What this module can honestly measure, and what it refuses to:
//
//   * `path`             — YES. Git records the exact path a file occupied when it was removed.
//                          A real measurement, in the same repo-relative id space live nodes use.
//   * `language`         — YES. Pure function of the path's extension (`languageForPath`), the
//                          identical derivation a live node gets. Nothing historical is inferred.
//   * `deletedSha`/Date  — YES. The commit that removed it, and that commit's committer date.
//                          Both read straight out of history.
//   * `lastLoc`          — SOMETIMES, and only as an explicitly HISTORICAL number. It is measured
//                          by reading the file's blob at the deleting commit's first parent and
//                          counting its lines with the same `countLines` a live node's `loc` uses
//                          (src/analyzer/loc.ts). That makes it a true measurement — of the file
//                          at that commit, which is a different instant from `headDate`. It is
//                          left `undefined` (NOT MEASURED) whenever it cannot be read honestly:
//                          the deleting commit is a root commit with no parent, the blob is
//                          unreadable, or the blob contains a NUL byte (binary — splitting it on
//                          "\n" would produce a number that looks like LOC and isn't).
//   * complexity, churn, age, imports, calls, contributors, contentHash — NO. Every one of these
//                          would require parsing or re-walking history for a file that no longer
//                          exists, and would then be silently compared against HEAD-measured
//                          values on live nodes. A narrow true signal beats a rich invented one;
//                          these fields simply do not exist on `RuinRecord`.
//   * x/y/footprint      — NO, and not this stage's business anyway. A ruin has no location in
//                          the tree: its former directory may itself be gone. Where (or whether)
//                          the compiler places one is a later slice's decision, not a datum the
//                          analyzer can measure.
//
// ---------------------------------------------------------------------------------------------
// Renames are the trap
// ---------------------------------------------------------------------------------------------
//
// Git stores a rename as a delete plus an add; a naive `--diff-filter=D` scan would report every
// refactor that moved a file as a demolition. Rename detection is therefore turned ON EXPLICITLY
// here (`-M<RENAME_SIMILARITY_THRESHOLD>%`) rather than left to the `diff.renames` config, whose
// default has changed across git versions — a signal whose output depended on the operator's
// gitconfig would not be reproducible. At the chosen threshold git pairs the delete with the add
// and reports `R`, which `--diff-filter=D` then filters out, so a renamed file is not a ruin.
//
// PURITY / DETERMINISM: this reads git, not the clock. The window is anchored to `headDate` (the
// HEAD commit's own date), never `Date.now()`, exactly like `churn` — the same repo state
// analyzed today and next year yields byte-identical ruins.

import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RuinRecord } from "../types.ts";
import { compareCodepoints } from "../util/compare.ts";
import { ANALYSIS_WINDOW_DAYS, DAY_MS } from "./git.ts";
import { countLines } from "./loc.ts";
import { isSourceFile, languageForPath } from "./scanner.ts";

const execFileAsync = promisify(execFile);

/**
 * Rename-detection similarity threshold, as a percentage, passed to git as `-M<N>%`. 50 is git's
 * own historical default for `-M` with no argument: a delete/add pair in one commit is treated as
 * a rename when at least half the content survives. Stated explicitly (never inherited from the
 * ambient `diff.renames` config) so this signal is reproducible on any machine — see the "Renames
 * are the trap" note above and docs/CONTRACT-repo-json.md § "Determinism rule: ruins".
 */
export const RENAME_SIMILARITY_THRESHOLD = 50;

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout;
}

/**
 * Line count of `path`'s content at the commit immediately BEFORE `sha` removed it, or
 * `undefined` when that cannot be measured honestly. Never a fallback 0 — see the header note.
 */
async function readLastLoc(repoPath: string, sha: string, path: string): Promise<number | undefined> {
  let blob: string;
  try {
    // `<rev>:./<path>` resolves the path relative to cwd (already repoPath), not to the git ROOT
    // — the same repoPath-vs-root path-space trap `--relative` fixes for the log below, and the
    // one that silently zeroed churn for every file of a nested repo (tests/git-nested-repo.test.ts).
    // Deliberately NOT routed through a trimming helper: countLines' answer depends on the exact
    // trailing newline, so the blob must arrive untouched.
    blob = await git(repoPath, ["show", `${sha}^:./${path}`]);
  } catch (err) {
    // Disclosed fallback (Failure Discipline LAW): a root commit has no `^` to read, and a blob
    // can be unreadable. Both are real "not measurable" answers, and they must SAY SO rather than
    // come back as a confident 0 that reads as "this file was empty when it died".
    console.warn(
      `[code-city analyzer] ruin ${path}: lastLoc UNMEASURED — could not read its blob at ${sha}^ (${(err as Error).message.split("\n")[0]})`,
    );
    return undefined;
  }
  if (blob.includes("\0")) {
    console.warn(`[code-city analyzer] ruin ${path}: lastLoc UNMEASURED — blob at ${sha}^ is binary`);
    return undefined;
  }
  return countLines(blob);
}

/**
 * Every source file removed from `repoPath`'s tracked tree within ANALYSIS_WINDOW_DAYS days
 * before `headDate`, and still absent at HEAD. Sorted by path (codepoint order) for determinism.
 */
export async function readRuins(repoPath: string, headDate: string): Promise<RuinRecord[]> {
  const headMs = Date.parse(headDate);
  const sinceMs = headMs - ANALYSIS_WINDOW_DAYS * DAY_MS;

  let logText: string;
  let trackedText: string;
  try {
    [logText, trackedText] = await Promise.all([
      git(repoPath, [
        "log",
        // A merge commit produces no --name-only output by default anyway; saying so explicitly
        // documents the known limitation rather than leaving it to a git default (a deletion that
        // exists ONLY as an evil-merge resolution is not reported — see the contract doc).
        "--no-merges",
        `-M${RENAME_SIMILARITY_THRESHOLD}%`,
        "--diff-filter=D",
        // Same scar as readFileGitMetrics: --name-only prints paths relative to the git ROOT, so
        // for a repoPath that is a SUBDIRECTORY of a larger repo the paths would never line up
        // with the repo-relative id space. --relative rewrites them relative to cwd (== repoPath)
        // and, usefully here, drops deletions that happened outside the analyzed subtree.
        "--relative",
        "--name-only",
        "--format=%x1e%H%x09%cI",
        "HEAD",
      ]),
      git(repoPath, ["ls-files", "-z"]),
    ]);
  } catch (err) {
    // Failure Discipline LAW: an empty ruins list and a failed git call must never look the same.
    // "No files were demolished" is a finding; "git could not tell us" is not.
    console.error(`[code-city analyzer] readRuins failed for ${repoPath}: ${(err as Error).message}`);
    throw err;
  }

  const aliveAtHead = new Set(
    trackedText
      .split("\0")
      .filter(Boolean)
      .map((p) => p.replaceAll("\\", "/")),
  );

  // git log is newest-first, so the FIRST deletion seen for a path is its most recent one — which
  // is the one that left it absent at HEAD. A path deleted, restored, and deleted again inside the
  // window is one ruin, dated to the demolition that stuck.
  const deletions = new Map<string, { sha: string; date: string }>();
  for (const record of logText.split("\x1e")) {
    const lines = record.trim().split("\n");
    if (!lines[0]) continue;
    const [sha, date] = lines[0].split("\t");
    const commitMs = Date.parse(date);
    // Identical window predicate to countRecentTouches (src/analyzer/git.ts): filtered here in JS
    // rather than handed to `git log --since`, whose date parsing is fuzzier than an exact
    // headDate-anchored comparison.
    if (commitMs < sinceMs || commitMs > headMs) continue;
    for (const raw of lines.slice(1)) {
      const path = raw.trim().replaceAll("\\", "/");
      if (!path) continue;
      // Same source-language gate live files pass, and the re-added case: a path that is tracked
      // at HEAD is a live file, whatever happened to it mid-window. It is not a ruin.
      if (!isSourceFile(path)) continue;
      if (aliveAtHead.has(path)) continue;
      if (deletions.has(path)) continue;
      deletions.set(path, { sha, date: new Date(date).toISOString() });
    }
  }

  const ordered = [...deletions.entries()].sort((a, b) => compareCodepoints(a[0], b[0]));
  const ruins: RuinRecord[] = [];
  for (const [path, { sha, date }] of ordered) {
    // Sequential on purpose: this fans out one `git show` per ruin, and the ordered loop keeps
    // both the output order and the warning order above deterministic.
    const lastLoc = await readLastLoc(repoPath, sha, path);
    ruins.push({
      path,
      language: languageForPath(path),
      deletedSha: sha,
      deletedDate: date,
      ...(lastLoc === undefined ? {} : { lastLoc }),
    });
  }
  return ruins;
}
