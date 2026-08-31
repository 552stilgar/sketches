// compileCity's age-extremes carry-through (V5.4 + V6, docs/CONTRACT-city-json.md § "Age
// extremes"): `metrics.age` (MAX/oldest wing, weathering), `metrics.newestAge` (MIN/youngest
// wing, scaffolding), and the `metrics.ageMeasured` gate that makes both honest.
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
    // Non-empty by default: contributors.length > 0 is what marks an age as MEASURED
    // (src/compiler/grammar.ts hasMeasuredAge). Tests that want the unmeasured path override it.
    contributors: ["Ada <ada@example.com>"],
    imports: [],
    calls: [],
    contains: [],
    ...overrides,
  };
}

describe("compileCity: age extremes", () => {
  it("at file LOD, carries a file's own age through unchanged as BOTH extremes", () => {
    const graph: RepoGraph = {
      nodes: [node("a.ts", 42), node("b.ts", 7)],
      repoPath: "/repo",
      headSha: "deadbeef",
      headDate: "2026-08-31T00:00:00.000Z",
    };
    const city = compileCity(graph);
    const byId = new Map(city.buildings.map((b) => [b.id, b]));
    // One member => max === min === that file's own age.
    expect(byId.get("a.ts")?.metrics.age).toBe(42);
    expect(byId.get("a.ts")?.metrics.newestAge).toBe(42);
    expect(byId.get("a.ts")?.metrics.ageMeasured).toBe(true);
    expect(byId.get("b.ts")?.metrics.age).toBe(7);
    expect(byId.get("b.ts")?.metrics.newestAge).toBe(7);
  });

  it("at directory LOD, age is the MAX (oldest wing) and newestAge the MIN (youngest wing)", () => {
    // > 500 files forces directory-level LOD aggregation (selectBuildingSources).
    const nodes: RepoNode[] = Array.from({ length: 501 }, (_, i) => node(`dir/f${i}.ts`, 100 + i));
    nodes[3] = node("dir/f3.ts", 2); // the youngest file in the group
    const graph: RepoGraph = {
      nodes,
      repoPath: "/repo",
      headSha: "deadbeef",
      headDate: "2026-08-31T00:00:00.000Z",
    };
    const city = compileCity(graph);
    const aggregated = city.buildings.find((b) => b.id === "directory:dir");
    expect(aggregated).toBeDefined();
    // The two overlays read opposite ends of the same distribution -- this is the whole reason
    // they are two fields (docs/CONTRACT-city-json.md "Age extremes", decision A1).
    expect(aggregated!.metrics.newestAge).toBe(2);
    expect(aggregated!.metrics.age).toBe(600); // 100 + 500, the oldest member
    // Neither is a sum (which would be enormous here) nor an average.
    expect(aggregated!.metrics.newestAge).toBeLessThan(100);
    expect(aggregated!.metrics.ageMeasured).toBe(true);
  });

  it("a node with NO git history is ageMeasured:false -- not a fabricated brand-new zero", () => {
    const graph: RepoGraph = {
      nodes: [node("a.ts", 0, { contributors: [] })],
      repoPath: "/repo",
      headSha: "deadbeef",
      headDate: "2026-08-31T00:00:00.000Z",
    };
    const city = compileCity(graph);
    // The analyzer's no-commits fallback is a real 0 (src/analyzer/git.ts). The numbers are
    // emitted as 0, but ageMeasured:false is what stops a renderer reading that as "brand new".
    expect(city.buildings[0].metrics.age).toBe(0);
    expect(city.buildings[0].metrics.newestAge).toBe(0);
    expect(city.buildings[0].metrics.ageMeasured).toBe(false);
    expect(validateCity(city).ok).toBe(true);
  });

  it("an unmeasured member never drags a measured sibling's extremes", () => {
    const nodes: RepoNode[] = Array.from({ length: 501 }, (_, i) => node(`dir/f${i}.ts`, 100 + i));
    // A never-committed file sitting in an otherwise-measured directory. An UNFILTERED min would
    // report newestAge 0 here and raise scaffolding on an untouched building (318773d's shape).
    nodes[7] = node("dir/f7.ts", 0, { contributors: [] });
    const graph: RepoGraph = {
      nodes,
      repoPath: "/repo",
      headSha: "deadbeef",
      headDate: "2026-08-31T00:00:00.000Z",
    };
    const city = compileCity(graph);
    const aggregated = city.buildings.find((b) => b.id === "directory:dir");
    expect(aggregated!.metrics.newestAge).toBe(100); // f0, the youngest MEASURED member
    expect(aggregated!.metrics.ageMeasured).toBe(true);
  });

  it("compileCity always emits real numeric extremes -- never omits the fields", () => {
    const graph: RepoGraph = {
      nodes: [node("a.ts", 3)],
      repoPath: "/repo",
      headSha: "deadbeef",
      headDate: "2026-08-31T00:00:00.000Z",
    };
    const city = compileCity(graph);
    expect(city.buildings[0].metrics.age).toBe(3);
    expect(city.buildings[0].metrics.newestAge).toBe(3);
    expect(validateCity(city).ok).toBe(true);
  });
});

describe("validateCity: age extremes", () => {
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

  it("applies the same non-negative-number rule to metrics.newestAge", () => {
    for (const bad of [-1, "young", Number.NaN]) {
      const city = baseCity();
      city.buildings[0].metrics.newestAge = bad;
      const result = validateCity(city);
      expect(result.ok).toBe(false);
      expect(result.errors.some((e) => e.includes("metrics.newestAge"))).toBe(true);
    }
    const good = baseCity();
    good.buildings[0].metrics.newestAge = 0;
    expect(validateCity(good).ok).toBe(true);
  });

  it("rejects a non-boolean metrics.ageMeasured but accepts its absence", () => {
    const city = baseCity();
    city.buildings[0].metrics.ageMeasured = "yes";
    const result = validateCity(city);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("metrics.ageMeasured"))).toBe(true);
    expect(validateCity(baseCity()).ok).toBe(true);
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
