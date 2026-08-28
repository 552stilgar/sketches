// merge: N repo.json (RepoGraph) -> one repo.json (RepoGraph), namespaced by repo name.
//
// Lives in src/analyzer/ rather than src/ because, from the compiler's point of view, this is
// exactly the same kind of thing analyzeRepo is: a producer of the repo.json contract
// (docs/CONTRACT-repo-json.md). It just has N graphs as its input instead of a filesystem scan.
// compileCity and everything downstream is completely untouched by this stage — see
// "Why this needs no compiler changes" below.
//
// Why this needs no compiler changes:
// compileCity derives every district from topLevelPath(), which is just the first path segment
// (src/compiler/grammar.ts). Prefixing every node's id and path with "<repo-name>/" makes the
// repo name itself that first segment for every node in that repo — so each input repo becomes
// exactly one district for free, with zero changes to src/compiler/ or src/analyzer/index.ts.
//
// PURE, same contract as compileCity: no I/O, no clock, no randomness, no dependence on Set/Map
// iteration order. Same input graphs in the same order -> byte-identical output, always.

import type { RepoGraph, RepoNode } from "../types.ts";
import { validateRepoGraph } from "../types.ts";

export interface NamedRepoGraph {
  name: string;
  graph: RepoGraph;
}

function prefixId(name: string, id: string): string {
  return `${name}/${id}`;
}

// Rewrites one node's imports/calls/contains list: an entry that resolves to a node id that
// existed in THIS SAME repo's original (pre-merge) graph gets the same "<name>/" prefix its
// target node just received, so the edge still points at the right node post-merge. An entry
// that does not resolve within this repo's own id space is left byte-for-byte as it was.
//
// This is deliberately NOT checked against every other input repo's node ids. Import/call edges
// in repo.json are authored in a single repo-relative id space (docs/CONTRACT-repo-json.md,
// "Node id convention") — an edge from repo A never legitimately targets a node id that only
// exists in repo B. Resolving against the union of all repos would risk inventing a cross-repo
// edge purely because two unrelated repos happen to have a same-named file (e.g. both vendor
// "src/db.ts") — exactly the fabrication the CONTRACT-repo-json.md "Call edges" rule forbids for
// the single-repo case, and the merge stage must not reintroduce it. Leaving an unresolved entry
// untouched reproduces the single-repo behavior exactly: post-merge it still doesn't match any
// node id in the merged graph, so compileCity's existing "no road for an unresolved target" path
// (src/compiler/index.ts) handles it with no special-casing here.
function remapEdges(name: string, ownIds: ReadonlySet<string>, edges: readonly string[]): string[] {
  return edges.map((target) => (ownIds.has(target) ? prefixId(name, target) : target));
}

export function mergeRepoGraphs(graphs: readonly NamedRepoGraph[]): RepoGraph {
  if (graphs.length === 0) {
    throw new Error("mergeRepoGraphs: at least one repo is required (got an empty list)");
  }

  const seenNames = new Set<string>();
  for (const { name } of graphs) {
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("mergeRepoGraphs: repo name must be a non-empty string");
    }
    if (name.includes("/")) {
      // A "/" in the name would split across the first path segment compileCity keys districts
      // on, silently breaking the one-district-per-repo guarantee this whole stage relies on.
      throw new Error(`mergeRepoGraphs: repo name "${name}" must not contain "/"`);
    }
    if (seenNames.has(name)) {
      throw new Error(`mergeRepoGraphs: duplicate repo name "${name}"`);
    }
    seenNames.add(name);
  }

  const nodes: RepoNode[] = [];
  for (const { name, graph } of graphs) {
    const ownIds = new Set(graph.nodes.map((node) => node.id));
    for (const node of graph.nodes) {
      nodes.push({
        ...node,
        id: prefixId(name, node.id),
        path: prefixId(name, node.path),
        imports: remapEdges(name, ownIds, node.imports),
        calls: remapEdges(name, ownIds, node.calls),
        contains: remapEdges(name, ownIds, node.contains),
      });
    }
  }

  // repoPath/headSha are informational once merged (no single filesystem path or commit
  // identifies a multi-repo view) — record all of them, deterministically, rather than picking
  // one and losing the rest.
  const repoPath = graphs.map(({ name, graph }) => `${name}=${graph.repoPath}`).join(";");
  const headSha = graphs.map(({ name, graph }) => `${name}=${graph.headSha}`).join(";");
  // headDate anchors churn/age determinism (CONTRACT-repo-json.md) and validateRepoGraph
  // requires exactly one parseable date, so take the latest HEAD across the input repos —
  // well-defined for any non-empty input, independent of argument order.
  const headDate = graphs.reduce(
    (latest, { graph }) => (Date.parse(graph.headDate) > Date.parse(latest) ? graph.headDate : latest),
    graphs[0].graph.headDate,
  );

  const merged: RepoGraph = { nodes, repoPath, headSha, headDate };

  const check = validateRepoGraph(merged);
  if (!check.ok) {
    throw new Error(
      `mergeRepoGraphs produced an invalid RepoGraph:\n${check.errors.map((e) => `  - ${e}`).join("\n")}`,
    );
  }

  return merged;
}
