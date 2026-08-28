import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const DAY_MS = 24 * 60 * 60 * 1000;

export interface GitInfo {
  headSha: string;
  headDate: string;
}

export interface FileGitMetrics {
  age: number;
  churn: number;
  contributors: string[];
}

function countRecentTouches(logText: string, filePath: string, sinceMs: number, headMs: number): number {
  const hashes = new Set<string>();
  for (const record of logText.split("\x1e")) {
    const lines = record.trim().split("\n");
    if (!lines[0]) continue;
    const [hash, date] = lines[0].split("\t");
    const commitMs = Date.parse(date);
    if (commitMs < sinceMs || commitMs > headMs) continue;
    const changedPaths = lines.slice(1).filter(Boolean);
    if (changedPaths.includes(filePath)) hashes.add(hash);
  }
  return hashes.size;
}

async function git(repoPath: string, args: string[]): Promise<string> {
  const { stdout } = await execFileAsync("git", args, {
    cwd: repoPath,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return stdout.trim();
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
): Promise<FileGitMetrics> {
  const headMs = Date.parse(headDate);
  const sinceMs = headMs - 90 * DAY_MS;
  try {
    const [datesText, commitsText, authorsText] = await Promise.all([
      git(repoPath, ["log", "--follow", "--reverse", "--format=%cI", "--", filePath]),
      // --relative: `--name-only` normally prints paths relative to the git ROOT, never to
      // cwd. When repoPath is a subdirectory of a larger repo (code-city analyzing itself from
      // inside the `sketches` monorepo, for instance), those root-relative paths never match
      // `filePath` below (repoPath-relative, from scanSourceFiles) and churn silently reads 0
      // for every file. `--relative` (no argument) rewrites shown paths relative to cwd, which
      // is already repoPath here — see fixtures/build-nested-fixture.mjs / tests/git-nested-repo.test.ts.
      git(repoPath, ["log", "--relative", "--format=%x1e%H%x09%cI", "--name-only", "HEAD"]),
      git(repoPath, ["log", "--follow", "--format=%an <%ae>", "--", filePath]),
    ]);
    const firstDate = datesText.split("\n").find(Boolean);
    const age = firstDate ? Math.max(0, Math.floor((headMs - Date.parse(firstDate)) / DAY_MS)) : 0;
    const churn = countRecentTouches(commitsText, filePath, sinceMs, headMs);
    const contributors = [...new Set(authorsText.split("\n").filter(Boolean))].sort();
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
