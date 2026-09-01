import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
export const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The single HEAD-anchored history window every temporal signal in repo.json uses: `churn`
 * (below) and `ruins` (src/analyzer/ruins.ts) both mean "within ANALYSIS_WINDOW_DAYS days BEFORE
 * the repo's HEAD commit date". Exported rather than re-typed per signal so the two windows
 * cannot drift apart — a city that showed 90 days of churn beside 30 days of ruins would be
 * reading two different pasts at once. Never a wall-clock window; see the "Determinism rule"
 * sections in docs/CONTRACT-repo-json.md.
 */
export const ANALYSIS_WINDOW_DAYS = 90;

export interface GitInfo {
  headSha: string;
  headDate: string;
}

export interface FileGitMetrics {
  age: number;
  churn: number;
  contributors: string[];
}

/**
 * Repo-wide history shared by every file in one analyzeRepo run. Git records identity-changing
 * renames in the diff, not in a file object we can query later, so resolving that lineage per
 * file would require another full `git log --follow` traversal for every source file. The caller
 * prepares these two scans once instead and passes the result through the bounded worker pool.
 */
export interface GitMetricsHistory {
  commitsText: string;
  renamePredecessors: ReadonlyMap<string, ReadonlySet<string>>;
}

const RENAME_SIMILARITY_THRESHOLD = 50;

function countRecentTouches(
  logText: string,
  filePaths: ReadonlySet<string>,
  sinceMs: number,
  headMs: number,
): number {
  const hashes = new Set<string>();
  for (const record of logText.split("\x1e")) {
    const lines = record.trim().split("\n");
    if (!lines[0]) continue;
    const [hash, date] = lines[0].split("\t");
    const commitMs = Date.parse(date);
    if (commitMs < sinceMs || commitMs > headMs) continue;
    const changedPaths = lines.slice(1).filter(Boolean);
    if (changedPaths.some((path) => filePaths.has(path))) hashes.add(hash);
  }
  return hashes.size;
}

function parseRenamePredecessors(logText: string): ReadonlyMap<string, ReadonlySet<string>> {
  const predecessors = new Map<string, Set<string>>();
  for (const record of logText.split("\x1e")) {
    const lines = record.trim().split("\n");
    for (const line of lines.slice(1)) {
      const [status, oldPath, newPath] = line.split("\t");
      if (!status?.startsWith("R") || !oldPath || !newPath) continue;
      const normalizedOldPath = oldPath.replaceAll("\\", "/");
      const normalizedNewPath = newPath.replaceAll("\\", "/");
      const existing = predecessors.get(normalizedNewPath) ?? new Set<string>();
      existing.add(normalizedOldPath);
      predecessors.set(normalizedNewPath, existing);
    }
  }
  return predecessors;
}

function resolveHistoricalPaths(
  filePath: string,
  renamePredecessors: ReadonlyMap<string, ReadonlySet<string>>,
): ReadonlySet<string> {
  const paths = new Set([filePath.replaceAll("\\", "/")]);
  const pending = [...paths];
  while (pending.length > 0) {
    const currentPath = pending.pop()!;
    for (const predecessor of renamePredecessors.get(currentPath) ?? []) {
      if (paths.has(predecessor)) continue;
      paths.add(predecessor);
      pending.push(predecessor);
    }
  }
  return paths;
}

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim();
}

/**
 * Read the expensive repo-wide inputs for file metrics exactly once per analyzeRepo run. Rename
 * detection is explicit: inheriting `diff.renames` would make age and churn vary with the
 * operator's gitconfig, violating the repo.json determinism contract. The separate name-only
 * scan preserves churn's one-touch-per-commit semantics while the name-status scan supplies the
 * old/new pairs needed to interpret those touches as one file lineage.
 */
export async function prepareGitMetricsHistory(repoPath: string): Promise<GitMetricsHistory> {
  try {
    const [commitsText, renamesText] = await Promise.all([
      git(repoPath, [
        "log",
        "--relative",
        `-M${RENAME_SIMILARITY_THRESHOLD}%`,
        "--format=%x1e%H%x09%cI",
        "--name-only",
        "HEAD",
      ]),
      git(repoPath, [
        "log",
        "--relative",
        `-M${RENAME_SIMILARITY_THRESHOLD}%`,
        "--format=%x1e%H%x09%cI",
        "--name-status",
        "HEAD",
      ]),
    ]);
    return { commitsText, renamePredecessors: parseRenamePredecessors(renamesText) };
  } catch (err) {
    // Failure Discipline LAW: an empty history is a real result; a failed repo-wide traversal is
    // not. Surface the cause rather than letting every file acquire plausible zero metrics.
    console.error(`[code-city analyzer] prepareGitMetricsHistory failed for ${repoPath}: ${(err as Error).message}`);
    throw err;
  }
}

export async function readGitInfo(repoPath: string): Promise<GitInfo> {
  try {
    const [headSha, rawDate] = await Promise.all([
      git(repoPath, ["rev-parse", "HEAD"]),
      git(repoPath, ["log", "-1", "--format=%cI", "HEAD"]),
    ]);
    return { headSha, headDate: new Date(rawDate).toISOString() };
  } catch (err) {
    // Failure Discipline LAW: no swallowed exceptions. Every downstream age/churn number is
    // anchored to headDate (see the contract's "Determinism rule" sections) — a fabricated
    // headSha:"WORKTREE"/headDate:epoch placeholder here used to silently poison every file's
    // metrics with confident-looking zeros instead of surfacing that repoPath isn't a readable
    // git repo at all. Log the real cause, then rethrow.
    console.error(`[code-city analyzer] readGitInfo failed for ${repoPath}: ${(err as Error).message}`);
    throw err;
  }
}

export async function readFileGitMetrics(
  repoPath: string,
  filePath: string,
  headDate: string,
  preparedHistory?: GitMetricsHistory,
): Promise<FileGitMetrics> {
  const headMs = Date.parse(headDate);
  const sinceMs = headMs - ANALYSIS_WINDOW_DAYS * DAY_MS;
  try {
    // Direct callers retain the public one-shot API; analyzeRepo supplies this context so its
    // ~1,000 file calls share the two repo-wide scans instead of repeating them per file.
    const history = preparedHistory ?? (await prepareGitMetricsHistory(repoPath));
    const historicalPaths = resolveHistoricalPaths(filePath, history.renamePredecessors);
    // Query every explicit path in the resolved lineage. Unlike `--follow --reverse`, this does
    // not ask git to rewrite history after ordering it (the combination that stopped at the
    // rename and made a month-old file look brand new). Newest-first is retained, so the final
    // record is the measured first commit. One query supplies both age and contributors.
    const identityText = await git(repoPath, [
      "log",
      "--format=%cI%x00%an <%ae>",
      "HEAD",
      "--",
      ...historicalPaths,
    ]);
    const identityRecords = identityText.split("\n").filter(Boolean);
    const firstRecord = identityRecords.at(-1);
    const firstDate = firstRecord?.slice(0, firstRecord.indexOf("\0"));
    const age = firstDate ? Math.max(0, Math.floor((headMs - Date.parse(firstDate)) / DAY_MS)) : 0;
    const churn = countRecentTouches(history.commitsText, historicalPaths, sinceMs, headMs);
    const contributors = [
      ...new Set(
        identityRecords
          .map((record) => record.slice(record.indexOf("\0") + 1))
          .filter(Boolean),
      ),
    ].sort();
    return { age, churn, contributors };
  } catch (err) {
    // Failure Discipline LAW: no swallowed exceptions. A genuine git failure here (missing
    // git binary, corrupted repo, permission error) used to come back as a confident-looking
    // {age: 0, churn: 0, contributors: []} — indistinguishable from a real file with no
    // history. Log the real cause, then rethrow; a file with genuinely no commits reaches the
    // `firstDate ? ... : 0` fallback above via empty (not failed) git output, which is
    // untouched by this change.
    console.error(`[code-city analyzer] readFileGitMetrics failed for ${filePath} in ${repoPath}: ${(err as Error).message}`);
    throw err;
  }
}
