// compileCity's `metrics.age` carry-through (V5.4, docs/CONTRACT-city-json.md § "Building age").
// age already existed as a required field on every RepoNode; this pins the NEW compiler-level
// behavior: file-LOD passthrough, directory-LOD MIN aggregation (not sum, unlike churn), and the
// validator's optional-but-non-negative-when-present treatment (mirrors Road.weight).

import { describe, it, expect } from "vitest";
import { compileCity } from "../src/compiler/index.ts";
import { validateCity } from "../src/types.ts";
import type { RepoGraph, RepoNode } from "../src/types.ts";

function node(id: string, age: number, overrides?: Partial<RepoNode>): RepoNode {
  const name = id.split("/").pop() as string;
  return {
    id,
    type: "file",
    language: "typescript",
    name,
    path: id,
    loc: 10,
    complexity: 1,
    churn: 0,
    age,
    contributors: [],
    imports: [],
    calls: [],
    contains: [],
    ...overrides,
  };
}

describe("compileCity: metrics.age", () => {
  it("at file LOD, carries a file's own age through unchanged", () => {
    const graph: RepoGraph = {
      nodes: [node("a.ts", 42), node("b.ts", 7)],
      repoPath: "/repo",
      headSha: "deadbeef",
      headDate: "2026-08-31T00:00:00.000Z",
    };
    const city = compileCity(graph);
    const byId = new Map(city.buildings.map((b) => [b.id, b]));
    expect(byId.get("a.ts")?.metrics.age).toBe(42);
    expect(byId.get("b.ts")?.metrics.age).toBe(7);
  });

  it("at directory LOD, aggregates to the MINIMUM age across members -- youngest wins, not a sum", () => {
    // > 500 files forces directory-level LOD aggregation (selectBuildingSources).
    const nodes: RepoNode[] = Array.from({ length: 501 }, (_, i) => node(`dir/f${i}.ts`, 100 + i));
    // The youngest file in the group -- min age wins.
    nodes[3] = node("dir/f3.ts", 2);
    const graph: RepoGraph = {
      nodes,
      repoPath: "/repo",
      headSha: "deadbeef",
      headDate: "2026-08-31T00:00:00.000Z",
    };
    const city = compileCity(graph);
    const aggregated = city.buildings.find((b) => b.id === "directory:dir");
    expect(aggregated).toBeDefined();
    expect(aggregated!.metrics.age).toBe(2);
    // Definitely not a sum (which would be enormous here) and not an average either.
    expect(aggregated!.metrics.age).toBeLessThan(100);
  });

  it("compileCity always emits a real numeric age -- never omits the field for a real node", () => {
    const graph: RepoGraph = {
      nodes: [node("a.ts", 0)],
      repoPath: "/repo",
      headSha: "deadbeef",
      headDate: "2026-08-31T00:00:00.000Z",
    };
    const city = compileCity(graph);
    expect(city.buildings[0].metrics.age).toBe(0);
    expect(validateCity(city).ok).toBe(true);
  });
});

describe("validateCity: metrics.age", () => {
  function baseCity() {
    return {
      districts: [{ id: "district:.", name: ".", x: 0, y: 0, width: 10, depth: 10, style: "typescript" }],
      buildings: [
        {
          id: "a.ts",
          x: 0,
          y: 0,
          width: 1,
          depth: 1,
          height: 1,
          style: "typescript",
          metrics: { loc: 1, complexity: 1, churn: 0 } as Record<string, unknown>,
        },
      ],
      roads: [],
      landmarks: [],
    };
  }

  it("accepts a city.json with metrics.age entirely absent (pre-migration compatibility)", () => {
    const city = baseCity();
    expect(validateCity(city).ok).toBe(true);
  });

  it("accepts a present, non-negative metrics.age", () => {
    const city = baseCity();
    city.buildings[0].metrics.age = 5;
    expect(validateCity(city).ok).toBe(true);
  });

  it("rejects a present but negative metrics.age", () => {
    const city = baseCity();
    city.buildings[0].metrics.age = -1;
    const result = validateCity(city);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("metrics.age"))).toBe(true);
  });

  it("rejects a present but non-numeric metrics.age", () => {
    const city = baseCity();
    city.buildings[0].metrics.age = "young";
    const result = validateCity(city);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("metrics.age"))).toBe(true);
  });
});
