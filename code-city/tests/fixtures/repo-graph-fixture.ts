// Shared fixed RepoGraph literal ("G") used by tests/compiler-determinism.test.ts and
// tests/compiler-layout.test.ts. 20 file nodes across 3 top-level directories, a handful of
// import edges, no randomness — deterministic by construction.

import type { RepoGraph, RepoNode } from "../../src/types.ts";

// The node whose `loc` the determinism test mutates 80 -> 200.
export const MUTATE_TARGET_ID = "alpha/a1.ts";

function node(
  id: string,
  loc: number,
  complexity: number,
  churn: number,
  age: number,
  imports: string[] = [],
): RepoNode {
  const name = id.split("/").pop() as string;
  return {
    id,
    type: "file",
    language: "typescript",
    name,
    path: id,
    loc,
    complexity,
    churn,
    age,
    contributors: ["dev@example.com"],
    imports,
    calls: [],
    contains: [],
  };
}

export function makeFixedRepoGraph(): RepoGraph {
  const nodes: RepoNode[] = [
    // alpha/ — 7 files
    node("alpha/a1.ts", 80, 6, 2, 400),
    node("alpha/a2.ts", 50, 3, 0, 200, ["alpha/a1.ts"]),
    node("alpha/a3.ts", 60, 4, 1, 300, ["alpha/a1.ts"]),
    node("alpha/a4.ts", 40, 2, 0, 100, ["alpha/a2.ts"]),
    node("alpha/a5.ts", 70, 5, 3, 500),
    node("alpha/a6.ts", 90, 8, 4, 600),
    node("alpha/a7.ts", 30, 1, 0, 50),
    // beta/ — 7 files
    node("beta/b1.ts", 55, 4, 1, 250, ["alpha/a1.ts"]),
    node("beta/b2.ts", 65, 5, 2, 350, ["beta/b1.ts"]),
    node("beta/b3.ts", 45, 3, 0, 150),
    node("beta/b4.ts", 75, 6, 2, 450),
    node("beta/b5.ts", 35, 2, 0, 80),
    node("beta/b6.ts", 85, 7, 5, 700),
    node("beta/b7.ts", 25, 1, 0, 40),
    // gamma/ — 6 files
    node("gamma/c1.ts", 60, 4, 1, 300, ["beta/b1.ts"]),
    node("gamma/c2.ts", 50, 3, 0, 200),
    node("gamma/c3.ts", 70, 5, 2, 400),
    node("gamma/c4.ts", 40, 2, 0, 100),
    node("gamma/c5.ts", 90, 9, 6, 800),
    node("gamma/c6.ts", 30, 1, 0, 60),
  ];

  return {
    nodes,
    repoPath: "/fixtures/fixed-graph",
    headSha: "0000000000000000000000000000000000dead",
    headDate: "2026-06-01T12:00:00.000Z",
  };
}

// Synthesizes an N-file graph spread evenly across `dirCount` top-level directories, for LOD
// band tests. No imports (not needed for LOD assertions).
export function synthesizeGraph(fileCount: number, dirCount: number): RepoGraph {
  const nodes: RepoNode[] = [];
  for (let i = 0; i < fileCount; i++) {
    const dir = `dir${i % dirCount}`;
    const id = `${dir}/file${i}.ts`;
    nodes.push(node(id, 20 + (i % 50), 1 + (i % 10), i % 5, 30 + i));
  }
  return {
    nodes,
    repoPath: `/fixtures/synth-${fileCount}`,
    headSha: "0000000000000000000000000000000000synth",
    headDate: "2026-06-01T12:00:00.000Z",
  };
}
