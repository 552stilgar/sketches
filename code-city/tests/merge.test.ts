// tests/merge.test.ts — the multi-repo merge stage (src/analyzer/merge.ts).
//
// Covers: determinism, edge remapping (intra-repo survives, unresolved untouched, no invented
// cross-repo edge), one-district-per-repo once compiled, and the degenerate inputs (empty,
// single-repo, name collision).

import { describe, it, expect } from "vitest";
import { mergeRepoGraphs } from "../src/analyzer/merge.ts";
import { compileCity } from "../src/compiler/index.ts";
import type { RepoGraph, RepoNode } from "../src/types.ts";

function node(id: string, imports: string[] = [], calls: string[] = []): RepoNode {
  return {
    id,
    type: "file",
    language: "typescript",
    name: id.split("/").pop() as string,
    path: id,
    loc: 10,
    complexity: 1,
    churn: 0,
    age: 0,
    contributors: ["dev@example.com"],
    imports,
    calls,
    contains: [],
  };
}

function repoGraph(nodes: RepoNode[], repoPath: string, headSha: string, headDate: string): RepoGraph {
  return { nodes, repoPath, headSha, headDate };
}

describe("mergeRepoGraphs", () => {
  it("is deterministic: same input -> byte-identical output, twice", () => {
    const repoA = repoGraph(
      [node("src/a.ts", ["src/b.ts"]), node("src/b.ts")],
      "/repos/foo",
      "sha-foo",
      "2026-01-01T00:00:00.000Z",
    );
    const repoB = repoGraph([node("lib/x.ts")], "/repos/bar", "sha-bar", "2026-02-01T00:00:00.000Z");
    const input = [
      { name: "foo", graph: repoA },
      { name: "bar", graph: repoB },
    ];

    const out1 = JSON.stringify(mergeRepoGraphs(input));
    const out2 = JSON.stringify(mergeRepoGraphs(input));
    expect(out1).toBe(out2);
  });

  it("prefixes every node id/path with <name>/", () => {
    const repoA = repoGraph([node("src/a.ts")], "/repos/foo", "sha-foo", "2026-01-01T00:00:00.000Z");
    const merged = mergeRepoGraphs([{ name: "foo", graph: repoA }]);
    expect(merged.nodes).toHaveLength(1);
    expect(merged.nodes[0].id).toBe("foo/src/a.ts");
    expect(merged.nodes[0].path).toBe("foo/src/a.ts");
  });

  it("remaps intra-repo import/call edges so they still resolve after the rename", () => {
    const repoA = repoGraph(
      [node("src/a.ts", ["src/b.ts"], ["src/b.ts"]), node("src/b.ts")],
      "/repos/foo",
      "sha-foo",
      "2026-01-01T00:00:00.000Z",
    );
    const merged = mergeRepoGraphs([{ name: "foo", graph: repoA }]);
    const a = merged.nodes.find((n) => n.id === "foo/src/a.ts");
    expect(a?.imports).toEqual(["foo/src/b.ts"]);
    expect(a?.calls).toEqual(["foo/src/b.ts"]);
  });

  it("leaves an edge untouched when its target does not resolve within its own repo", () => {
    const repoA = repoGraph(
      [node("src/a.ts", ["src/missing.ts"])],
      "/repos/foo",
      "sha-foo",
      "2026-01-01T00:00:00.000Z",
    );
    const merged = mergeRepoGraphs([{ name: "foo", graph: repoA }]);
    const a = merged.nodes.find((n) => n.id === "foo/src/a.ts");
    expect(a?.imports).toEqual(["src/missing.ts"]);
  });

  it("never invents a cross-repo edge, even when a same-named file exists in another repo", () => {
    // repoA imports "src/shared.ts", which does NOT exist in repoA but DOES exist (same path)
    // in repoB. The merge must not rewrite this into a fabricated foo->bar edge.
    const repoA = repoGraph(
      [node("src/a.ts", ["src/shared.ts"])],
      "/repos/foo",
      "sha-foo",
      "2026-01-01T00:00:00.000Z",
    );
    const repoB = repoGraph([node("src/shared.ts")], "/repos/bar", "sha-bar", "2026-01-02T00:00:00.000Z");
    const merged = mergeRepoGraphs([
      { name: "foo", graph: repoA },
      { name: "bar", graph: repoB },
    ]);

    const a = merged.nodes.find((n) => n.id === "foo/src/a.ts");
    // left as-is, not rewritten to "bar/src/shared.ts"
    expect(a?.imports).toEqual(["src/shared.ts"]);

    // and compiling the merged graph must therefore produce zero cross-district roads
    const city = compileCity(merged);
    for (const road of city.roads) {
      const fromDistrict = road.from.split("/")[0];
      const toDistrict = road.to.split("/")[0];
      expect(toDistrict).toBe(fromDistrict);
    }
  });

  it("compiles to exactly one district per input repo, collapsing intra-repo directory structure", () => {
    const repoA = repoGraph(
      [node("alpha/a.ts"), node("beta/b.ts")],
      "/repos/foo",
      "sha-foo",
      "2026-01-01T00:00:00.000Z",
    );
    const repoB = repoGraph(
      [node("x/y.ts"), node("x/z.ts")],
      "/repos/bar",
      "sha-bar",
      "2026-01-02T00:00:00.000Z",
    );
    const repoC = repoGraph([node("only.ts")], "/repos/baz", "sha-baz", "2026-01-03T00:00:00.000Z");

    const merged = mergeRepoGraphs([
      { name: "foo", graph: repoA },
      { name: "bar", graph: repoB },
      { name: "baz", graph: repoC },
    ]);
    const city = compileCity(merged);

    expect(city.districts).toHaveLength(3);
    expect(city.districts.map((d) => d.name).sort()).toEqual(["bar", "baz", "foo"]);
    // foo/alpha/a.ts and foo/beta/b.ts land in the same district ("foo"), even though they were
    // two separate directories pre-merge — this is the documented trade-off, not a bug.
  });

  it("throws on empty input", () => {
    expect(() => mergeRepoGraphs([])).toThrow(/at least one repo/i);
  });

  it("handles a single-element input sanely", () => {
    const repoA = repoGraph([node("a.ts")], "/repos/solo", "sha-solo", "2026-01-01T00:00:00.000Z");
    const merged = mergeRepoGraphs([{ name: "solo", graph: repoA }]);
    expect(merged.nodes).toEqual([
      {
        ...node("a.ts"),
        id: "solo/a.ts",
        path: "solo/a.ts",
      },
    ]);
  });

  it("throws on a repo-name collision", () => {
    const repoA = repoGraph([node("a.ts")], "/repos/foo", "sha-foo", "2026-01-01T00:00:00.000Z");
    const repoB = repoGraph([node("b.ts")], "/repos/foo2", "sha-foo2", "2026-01-02T00:00:00.000Z");
    expect(() =>
      mergeRepoGraphs([
        { name: "dup", graph: repoA },
        { name: "dup", graph: repoB },
      ]),
    ).toThrow(/duplicate repo name/i);
  });

  it("throws when a repo name contains a slash", () => {
    const repoA = repoGraph([node("a.ts")], "/repos/foo", "sha-foo", "2026-01-01T00:00:00.000Z");
    expect(() => mergeRepoGraphs([{ name: "a/b", graph: repoA }])).toThrow(/must not contain/i);
  });
});
