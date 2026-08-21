// analyzer: repo (filesystem + git) -> repo.json (RepoGraph)
//
// Contract: docs/CONTRACT-repo-json.md. Implementation lane fills this in.
//
// Scope for V1: recursive directory scan (respect .gitignore), language detection by
// extension, tree-sitter (or equivalent) import extraction, git-derived age/churn/contributors
// anchored to the repo's HEAD commit date (never wall-clock — see the contract doc's
// "Determinism rule" sections). Must emit exactly one "file" node per source file found.

import type { RepoGraph } from "../types.ts";

export async function analyzeRepo(repoPath: string): Promise<RepoGraph> {
  throw new Error("NotImplemented");
}
