import { describe, expect, it } from "vitest";
import { compileCity } from "../src/compiler/index.ts";
import type { RepoGraph, RepoNode } from "../src/types.ts";

function file(id: string, imports: string[] = [], calls: string[] = []): RepoNode {
  return {
    id,
    type: "file",
    language: "typescript",
    name: id.split("/").at(-1) as string,
    path: id,
    loc: 10,
    complexity: 1,
    churn: 0,
    age: 1,
    contributors: [],
    imports,
    calls,
    contains: [],
  };
}

function graph(nodes: RepoNode[]): RepoGraph {
  return { nodes, repoPath: "/fixture", headSha: "fixture", headDate: "2026-01-01T00:00:00.000Z" };
}

describe("compiler road weights", () => {
  it("accumulates two file imports onto one directory-LOD road", () => {
    const nodes = [
      file("src/pkg/a.ts", ["lib/core/target.ts"]),
      file("src/pkg/b.ts", ["lib/core/target.ts"]),
      file("lib/core/target.ts"),
    ];
    for (let i = 0; i < 498; i++) nodes.push(file(`src/pkg/filler-${i}.ts`));

    expect(compileCity(graph(nodes)).roads).toEqual([
      { from: "directory:src/pkg", to: "directory:lib/core", weight: 2 },
    ]);
  });

  it("counts calls and duplicate entries as separate occurrences", () => {
    const city = compileCity(
      graph([file("src/a.ts", ["lib/b.ts"], ["lib/b.ts", "lib/b.ts"]), file("lib/b.ts")]),
    );
    expect(city.roads).toEqual([{ from: "src/a.ts", to: "lib/b.ts", weight: 3 }]);
  });
});
