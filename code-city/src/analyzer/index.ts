// analyzer: repo (filesystem + git) -> repo.json (RepoGraph)
//
// Contract: docs/CONTRACT-repo-json.md. Implementation lane fills this in.
//
// Scope for V1: recursive directory scan (respect .gitignore), language detection by
// extension, tree-sitter (or equivalent) import extraction, git-derived age/churn/contributors
// anchored to the repo's HEAD commit date (never wall-clock — see the contract doc's
// "Determinism rule" sections). Must emit exactly one "file" node per source file found.

import type { RepoGraph } from "../types.ts";
import type { RepoNode } from "../types.ts";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { hashFileContent } from "./content-hash.ts";
import type { DatastoreSpec } from "./datastores.ts";
import { detectDatastores } from "./datastores.ts";
import { readFileGitMetrics, readGitInfo } from "./git.ts";
import { parseTypeScript } from "./parser.ts";
import { scanSourceFiles } from "./scanner.ts";

const execFileAsync = promisify(execFile);

// V4 (CONTRACTS.md § "V4: datastores + clone identity", contract note added to types.ts
// pending a full RepoGraph field -- see the `datastores` intersection type below): RepoGraph's
// TS interface (src/types.ts) is frozen for this lane (five lanes run in parallel against it
// right now), and it does not carry a `datastores` field. `detectDatastores` is pure over
// `{path, content}[]`; to get its output from analyzeRepo to compileCity without touching
// types.ts, analyzeRepo attaches an additional `datastores` property to the RepoGraph value it
// returns (still valid, byte-identical JSON on disk -- repo.json is untyped once serialized),
// and compileCity's landmark-emission section reads it back via the same intersection type.
// This is disclosed here and in the compiler, not silent -- flagged in the lane report as a gap
// in the frozen contract worth folding into src/types.ts properly once the V4 lanes converge.
export type RepoGraphWithDatastores = RepoGraph & { datastores?: DatastoreSpec[] };

// Finds every tracked datastore-schema candidate (`*.sql` under a `migrations/` directory, or a
// bare `schema.sql`) WITHOUT ever touching a `.db` file -- D1's core guarantee. This walks
// `git ls-files` (or, if the repo isn't a git work tree, a raw directory walk) for ALL tracked
// paths, not just the source-language extensions `scanSourceFiles` restricts itself to (`.sql`
// is deliberately absent from that map -- SQL isn't a language code-city renders buildings for),
// then narrows to the two literal patterns D1 defines before reading any file content. A `.db`
// path never matches either pattern, so its content is never read -- the analyzer doesn't need
// to special-case excluding it, there is no code path that would ever open one.
async function listDatastoreCandidatePaths(repoPath: string): Promise<string[]> {
  let allPaths: string[];
  try {
    await execFileAsync("git", ["rev-parse", "--is-inside-work-tree"], { cwd: repoPath });
    const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
      cwd: repoPath,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
    allPaths = stdout.split("\0").filter(Boolean);
  } catch {
    // Disclosed fallback (Failure Discipline LAW), mirroring scanner.ts's own git-unavailable
    // path: walk the filesystem directly. No .gitignore filtering in this mode, but it is a
    // real, workable result rather than a silent empty list.
    allPaths = [];
    const { readdir } = await import("node:fs/promises");
    const walk = async (dir: string): Promise<void> => {
      const entries = await readdir(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        const abs = `${dir}/${entry.name}`;
        if (entry.isDirectory()) await walk(abs);
        else if (entry.isFile()) allPaths.push(abs.slice(repoPath.length + 1));
      }
    };
    await walk(repoPath);
  }
  return allPaths
    .map((p) => p.replaceAll("\\", "/"))
    .filter((p) => {
      const segments = p.split("/");
      const basenameOf = segments[segments.length - 1];
      if (basenameOf === "schema.sql") return true;
      return p.toLowerCase().endsWith(".sql") && segments.includes("migrations");
    });
}

async function detectRepoDatastores(repoPath: string): Promise<DatastoreSpec[]> {
  const candidatePaths = await listDatastoreCandidatePaths(repoPath);
  const files = await Promise.all(
    candidatePaths.map(async (path) => ({ path, content: await readFile(`${repoPath}/${path}`, "utf8") })),
  );
  return detectDatastores(files);
}

// Languages the tree-sitter TypeScript grammar can genuinely parse for imports/complexity.
// Plain JavaScript is a syntactic subset TS grammars handle directly — it gets real analysis,
// not the unsupported-language stub below.
const PARSEABLE_LANGUAGES: ReadonlySet<string> = new Set(["typescript", "javascript"]);

// Every file spawns 3 git subprocesses (readFileGitMetrics) plus one for the source read.
// Firing all of them at once for a large repo is unbounded process fan-out; cap how many
// files are in flight at a time with a plain worker-pool (no new dependency).
const GIT_FANOUT_CONCURRENCY = 8;

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const i = nextIndex++;
      results[i] = await fn(items[i]);
    }
  }
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

export async function analyzeRepo(repoPath: string): Promise<RepoGraph> {
  const absoluteRepoPath = resolve(repoPath);
  const [files, gitInfo, datastores] = await Promise.all([
    scanSourceFiles(absoluteRepoPath),
    readGitInfo(absoluteRepoPath),
    detectRepoDatastores(absoluteRepoPath),
  ]);
  const fileIds = new Set(files.map((file) => file.path));
  const unsupportedLanguages = new Set<string>();

  const nodes = await mapWithConcurrency(files, GIT_FANOUT_CONCURRENCY, async (file): Promise<RepoNode> => {
    const [source, history] = await Promise.all([
      readFile(file.absolutePath, "utf8"),
      readFileGitMetrics(absoluteRepoPath, file.path, gitInfo.headDate),
    ]);
    let parsed: { imports: string[]; calls: string[]; complexity: number };
    if (PARSEABLE_LANGUAGES.has(file.language)) {
      parsed = await parseTypeScript(source, file.path, fileIds);
    } else {
      // Disclosed fallback (Failure Discipline LAW): a stub is fine for a language we don't
      // parse, but it must not look identical to a real "no imports, complexity 1" file —
      // surface it so a reader of the logs (not just the JSON) knows it happened.
      unsupportedLanguages.add(file.language);
      parsed = { imports: [], calls: [], complexity: 1 };
    }
    const loc = source.length === 0 ? 0 : source.split("\n").length - (source.endsWith("\n") ? 1 : 0);

    return {
      id: file.path,
      type: "file",
      language: file.language,
      name: basename(file.path),
      path: file.path,
      loc,
      complexity: parsed.complexity,
      churn: history.churn,
      age: history.age,
      contributors: history.contributors,
      imports: parsed.imports,
      calls: parsed.calls,
      contains: [],
      contentHash: hashFileContent(source),
    };
  });

  if (unsupportedLanguages.size > 0) {
    const languages = [...unsupportedLanguages].sort().join(", ");
    console.warn(
      `[code-city analyzer] stubbed imports/calls/complexity (imports=[], calls=[], complexity=1) for unsupported language(s): ${languages} — real static analysis is TypeScript/JavaScript only in V1`,
    );
  }

  const graph: RepoGraphWithDatastores = {
    nodes,
    repoPath: absoluteRepoPath,
    headSha: gitInfo.headSha,
    headDate: gitInfo.headDate,
    datastores,
  };
  return graph;
}
