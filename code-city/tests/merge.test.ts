// tests/merge.test.ts — the multi-repo merge stage (src/analyzer/merge.ts).
//
// Covers: determinism, edge remapping (intra-repo survives, unresolved untouched, no invented
// cross-repo edge), one-district-per-repo once compiled, and the degenerate inputs (empty,
// single-repo, name collision).

import { describe, it, expect } from "vitest";
import { mergeRepoGraphs } from "../src/analyzer/merge.ts";
import { compileCity } from "../src/compiler/index.ts";
import type { DatastoreSpec, RepoGraph, RepoNode } from "../src/types.ts";

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

function repoGraph(
  nodes: RepoNode[],
  repoPath: string,
  headSha: string,
  headDate: string,
  datastores?: DatastoreSpec[],
): RepoGraph {
  return { nodes, repoPath, headSha, headDate, ...(datastores !== undefined ? { datastores } : {}) };
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

  it("carries datastores through the merge, namespaced with <name>/<dir> and a recomputed id", () => {
    const repoA = repoGraph(
      [node("src/kernel/migrations/001.sql")],
      "/repos/foo",
      "sha-foo",
      "2026-01-01T00:00:00.000Z",
      [{ id: "datastore:src/kernel", dir: "src/kernel", tableCount: 22, migrationCount: 18 }],
    );
    const merged = mergeRepoGraphs([{ name: "foo", graph: repoA }]);
    expect(merged.datastores).toEqual([
      { id: "datastore:foo/src/kernel", dir: "foo/src/kernel", tableCount: 22, migrationCount: 18 },
    ]);
  });

  it("namespaces a repo-root datastore (dir === \"\") to the bare repo name, no leading slash", () => {
    const repoA = repoGraph([node("schema.sql")], "/repos/foo", "sha-foo", "2026-01-01T00:00:00.000Z", [
      { id: "datastore:.", dir: "", tableCount: 3, migrationCount: 0 },
    ]);
    const merged = mergeRepoGraphs([{ name: "foo", graph: repoA }]);
    expect(merged.datastores).toEqual([{ id: "datastore:foo", dir: "foo", tableCount: 3, migrationCount: 0 }]);
  });

  it("merges datastores across repos, sorted by (namespaced) dir, when some repos have none", () => {
    const repoA = repoGraph([node("a.ts")], "/repos/foo", "sha-foo", "2026-01-01T00:00:00.000Z", [
      { id: "datastore:src/kernel", dir: "src/kernel", tableCount: 22, migrationCount: 18 },
    ]);
    const repoB = repoGraph([node("b.ts")], "/repos/bar", "sha-bar", "2026-01-02T00:00:00.000Z");
    const repoC = repoGraph([node("c.ts")], "/repos/baz", "sha-baz", "2026-01-03T00:00:00.000Z", [
      { id: "datastore:vendor/kernel", dir: "vendor/kernel", tableCount: 22, migrationCount: 18 },
    ]);

    const merged = mergeRepoGraphs([
      { name: "foo", graph: repoA },
      { name: "bar", graph: repoB },
      { name: "baz", graph: repoC },
    ]);

    expect(merged.datastores).toEqual([
      { id: "datastore:baz/vendor/kernel", dir: "baz/vendor/kernel", tableCount: 22, migrationCount: 18 },
      { id: "datastore:foo/src/kernel", dir: "foo/src/kernel", tableCount: 22, migrationCount: 18 },
    ]);
  });

  it("leaves the merged `datastores` field absent when no input repo carried one", () => {
    const repoA = repoGraph([node("a.ts")], "/repos/foo", "sha-foo", "2026-01-01T00:00:00.000Z");
    const repoB = repoGraph([node("b.ts")], "/repos/bar", "sha-bar", "2026-01-02T00:00:00.000Z");
    const merged = mergeRepoGraphs([
      { name: "foo", graph: repoA },
      { name: "bar", graph: repoB },
    ]);
    expect(merged.datastores).toBeUndefined();
  });

  it("stays deterministic with datastores present: same input -> byte-identical output", () => {
    const repoA = repoGraph([node("a.ts")], "/repos/foo", "sha-foo", "2026-01-01T00:00:00.000Z", [
      { id: "datastore:src/kernel", dir: "src/kernel", tableCount: 22, migrationCount: 18 },
    ]);
    const repoB = repoGraph([node("b.ts")], "/repos/bar", "sha-bar", "2026-01-02T00:00:00.000Z", [
      { id: "datastore:src", dir: "src", tableCount: 3, migrationCount: 1 },
    ]);
    const input = [
      { name: "foo", graph: repoA },
      { name: "bar", graph: repoB },
    ];
    const out1 = JSON.stringify(mergeRepoGraphs(input));
    const out2 = JSON.stringify(mergeRepoGraphs(input));
    expect(out1).toBe(out2);
  });

  it("end-to-end: a merged multi-repo graph with datastores compiles to the expected landmark count", () => {
    const repoA = repoGraph([node("src/kernel/db.ts")], "/repos/foo", "sha-foo", "2026-01-01T00:00:00.000Z", [
      { id: "datastore:src/kernel", dir: "src/kernel", tableCount: 22, migrationCount: 18 },
    ]);
    const repoB = repoGraph([node("vendor/kernel/db.ts")], "/repos/bar", "sha-bar", "2026-01-02T00:00:00.000Z", [
      { id: "datastore:vendor/kernel", dir: "vendor/kernel", tableCount: 22, migrationCount: 18 },
    ]);
    const repoC = repoGraph([node("src/schema.ts")], "/repos/baz", "sha-baz", "2026-01-03T00:00:00.000Z", [
      { id: "datastore:src", dir: "src", tableCount: 4, migrationCount: 2 },
    ]);

    const merged = mergeRepoGraphs([
      { name: "foo", graph: repoA },
      { name: "bar", graph: repoB },
      { name: "baz", graph: repoC },
    ]);
    const city = compileCity(merged);

    expect(city.landmarks).toHaveLength(3);
    expect(city.landmarks.map((l) => l.id).sort()).toEqual([
      "datastore:bar/vendor/kernel",
      "datastore:baz/src",
      "datastore:foo/src/kernel",
    ]);
    for (const l of city.landmarks) expect(l.kind).toBe("datastore");
  });
});

// V5 scar test — the datastores field (V4) once landed as an untyped property attached outside
// RepoGraph's typed fields, and mergeRepoGraphs (built against typed fields only) silently
// dropped it on every merge with all tests staying green (CONTRACTS.md § "Fixed 2026-08-28").
// todoCount is a real, typed RepoNode field from the start, and this pins that the merge's
// `...node` spread actually carries it -- not by trusting the spread, but by asserting the
// value survives end to end.
describe("mergeRepoGraphs — todoCount survives the merge (V5 scar test)", () => {
  it("carries a node's todoCount through unchanged, including the real 0 case", () => {
    const repoA = repoGraph(
      [{ ...node("a.ts"), todoCount: 3 }, { ...node("b.ts"), todoCount: 0 }],
      "/repos/foo",
      "sha-foo",
      "2026-01-01T00:00:00.000Z",
    );
    const merged = mergeRepoGraphs([{ name: "foo", graph: repoA }]);

    const a = merged.nodes.find((n) => n.id === "foo/a.ts");
    const b = merged.nodes.find((n) => n.id === "foo/b.ts");
    expect(a).toBeDefined();
    expect(b).toBeDefined();
    expect(a!.todoCount).toBe(3);
    expect(b!.todoCount).toBe(0);
  });

  it("leaves todoCount undefined on a node that never had it measured", () => {
    const repoA = repoGraph([node("a.ts")], "/repos/foo", "sha-foo", "2026-01-01T00:00:00.000Z");
    const merged = mergeRepoGraphs([{ name: "foo", graph: repoA }]);
    const a = merged.nodes.find((n) => n.id === "foo/a.ts");
    expect(a).toBeDefined();
    expect(a!.todoCount).toBeUndefined();
  });
});
