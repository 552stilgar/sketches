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
import { readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { readFileGitMetrics, readGitInfo } from "./git.ts";
import { parseTypeScript } from "./parser.ts";
import { scanSourceFiles } from "./scanner.ts";

// Languages the tree-sitter TypeScript grammar can genuinely parse for imports/complexity.
// Plain JavaScript is a syntactic subset TS grammars handle directly — it gets real analysis,
// not the unsupported-language stub below.
const PARSEABLE_LANGUAGES: ReadonlySet<string> = new Set(["typescript", "javascript"]);

export async function analyzeRepo(repoPath: string): Promise<RepoGraph> {
  const absoluteRepoPath = resolve(repoPath);
  const [files, gitInfo] = await Promise.all([scanSourceFiles(absoluteRepoPath), readGitInfo(absoluteRepoPath)]);
  const fileIds = new Set(files.map((file) => file.path));
  const unsupportedLanguages = new Set<string>();

  const nodes = await Promise.all(files.map(async (file): Promise<RepoNode> => {
    const [source, history] = await Promise.all([
      readFile(file.absolutePath, "utf8"),
      readFileGitMetrics(absoluteRepoPath, file.path, gitInfo.headDate),
    ]);
    let parsed: { imports: string[]; complexity: number };
    if (PARSEABLE_LANGUAGES.has(file.language)) {
      parsed = await parseTypeScript(source, file.path, fileIds);
    } else {
      // Disclosed fallback (Failure Discipline LAW): a stub is fine for a language we don't
      // parse, but it must not look identical to a real "no imports, complexity 1" file —
      // surface it so a reader of the logs (not just the JSON) knows it happened.
      unsupportedLanguages.add(file.language);
      parsed = { imports: [], complexity: 1 };
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
      calls: [],
      contains: [],
    };
  }));

  if (unsupportedLanguages.size > 0) {
    const languages = [...unsupportedLanguages].sort().join(", ");
    console.warn(
      `[code-city analyzer] stubbed imports/complexity (imports=[], complexity=1) for unsupported language(s): ${languages} — real static analysis is TypeScript/JavaScript only in V1`,
    );
  }

  return { nodes, repoPath: absoluteRepoPath, headSha: gitInfo.headSha, headDate: gitInfo.headDate };
}
