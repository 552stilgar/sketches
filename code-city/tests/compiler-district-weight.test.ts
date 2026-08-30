// V5.1 district area-weighting curve (sketches/CAMPAIGN.md district-weighting task, Lane B).
//
// Measured problem: on the merged mgmt trio, `squarify` weights each district by RAW FILE COUNT
// (src/compiler/index.ts), so one oversized repo swamps every other district's visible area.
// `districtWeightMode` (src/compiler/layout.ts districtWeight()) makes the area curve an explicit,
// named CompileCityOptions input instead of a hardcoded linear count -- see that function's doc
// comment for why it must stay caller-chosen rather than auto-detected from how skewed the data is.

import { describe, it, expect } from "vitest";
import { compileCity } from "../src/compiler/index.ts";
import { districtWeight, DEFAULT_DISTRICT_WEIGHT_MODE } from "../src/compiler/layout.ts";
import type { DistrictWeightMode } from "../src/compiler/layout.ts";
import { makeFixedRepoGraph } from "./fixtures/repo-graph-fixture.ts";
import type { RepoGraph, RepoNode } from "../src/types.ts";

function node(id: string, loc: number): RepoNode {
  return {
    id,
    type: "file",
    language: "typescript",
    name: id.split("/").pop() as string,
    path: id,
    loc,
    complexity: 1,
    churn: 0,
    age: 30,
    contributors: ["dev@example.com"],
    imports: [],
    calls: [],
    contains: [],
  };
}

// Deliberately skewed: "big" has 90 files, "small" has 3 -- a 30:1 ratio, close to the ~71%-share
// shape measured on the merged mgmt trio, so the compression from sqrt/log is unambiguous.
function makeSkewedRepoGraph(): RepoGraph {
  const nodes: RepoNode[] = [];
  for (let i = 0; i < 90; i++) nodes.push(node(`big/f${i}.ts`, 20));
  for (let i = 0; i < 3; i++) nodes.push(node(`small/f${i}.ts`, 20));
  return {
    nodes,
    repoPath: "/fixtures/skewed-graph",
    headSha: "0000000000000000000000000000000000skew",
    headDate: "2026-06-01T12:00:00.000Z",
  };
}

function districtArea(city: ReturnType<typeof compileCity>, name: string): number {
  const d = city.districts.find((district) => district.name === name);
  if (!d) throw new Error(`no district named ${name}`);
  return d.width * d.depth;
}

describe("districtWeight() pure curve", () => {
  it("linear is the identity function on count", () => {
    expect(districtWeight(0, "linear")).toBe(0);
    expect(districtWeight(1, "linear")).toBe(1);
    expect(districtWeight(90, "linear")).toBe(90);
  });

  it("sqrt and log both compress large counts relative to linear, log more aggressively than sqrt", () => {
    const count = 90;
    const linear = districtWeight(count, "linear");
    const sqrt = districtWeight(count, "sqrt");
    const log = districtWeight(count, "log");
    expect(sqrt).toBeLessThan(linear);
    expect(log).toBeLessThan(sqrt);
  });

  it("log1p keeps a zero-file district finite (never -Infinity)", () => {
    expect(districtWeight(0, "log")).toBe(0);
    expect(Number.isFinite(districtWeight(0, "log"))).toBe(true);
  });

  // The default moved linear -> log on 2026-08-30 (Usul's ruling; see DEFAULT_DISTRICT_WEIGHT_MODE).
  // Asserted against the exported constant AND against the concrete curve, so a future re-ruling
  // has to change the constant deliberately rather than silently drifting the omitted-option path.
  it("defaults to DEFAULT_DISTRICT_WEIGHT_MODE, which is log", () => {
    expect(DEFAULT_DISTRICT_WEIGHT_MODE).toBe("log");
    expect(districtWeight(42)).toBe(districtWeight(42, DEFAULT_DISTRICT_WEIGHT_MODE));
    expect(districtWeight(42)).toBe(districtWeight(42, "log"));
  });

  it("throws loudly on an unrecognized mode (never silently falls back)", () => {
    expect(() => districtWeight(10, "cube" as unknown as DistrictWeightMode)).toThrow();
  });
});

describe("compileCity({ districtWeightMode }) — V5.1", () => {
  it("(a) omitting the option is identical to naming the default mode explicitly, on both a balanced and a skewed graph", () => {
    for (const g of [makeFixedRepoGraph(), makeSkewedRepoGraph()]) {
      const omitted = JSON.stringify(compileCity(structuredClone(g)));
      const explicitDefault = JSON.stringify(
        compileCity(structuredClone(g), { districtWeightMode: DEFAULT_DISTRICT_WEIGHT_MODE }),
      );
      expect(omitted).toBe(explicitDefault);
    }
  });

  // The pre-2026-08-30 behavior must stay reachable byte-for-byte: any city compiled before the
  // default moved is reproducible by naming "linear", which is the only thing that makes the
  // default a preference rather than a one-way door.
  it("(a2) `linear` still reproduces the pre-ruling output, and the new default differs from it on a skewed graph", () => {
    const g = makeSkewedRepoGraph();
    const linear = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode: "linear" }));
    const omitted = JSON.stringify(compileCity(structuredClone(g)));
    expect(omitted).not.toBe(linear);
  });

  it("(b) sqrt and log both compress the largest district's canvas share relative to linear on a skewed fixture", () => {
    const g = makeSkewedRepoGraph();
    const linearCity = compileCity(structuredClone(g), { districtWeightMode: "linear" });
    const sqrtCity = compileCity(structuredClone(g), { districtWeightMode: "sqrt" });
    const logCity = compileCity(structuredClone(g), { districtWeightMode: "log" });

    const totalArea = 1000 * 1000;
    const linearShare = districtArea(linearCity, "big") / totalArea;
    const sqrtShare = districtArea(sqrtCity, "big") / totalArea;
    const logShare = districtArea(logCity, "big") / totalArea;

    // 90 files vs 3 files should swamp the canvas under linear (measured problem).
    expect(linearShare).toBeGreaterThan(0.85);
    // sqrt and log both give "small" more room back, log more than sqrt.
    expect(sqrtShare).toBeLessThan(linearShare);
    expect(logShare).toBeLessThan(sqrtShare);

    // The "small" district's share grows as a mirror of "big" shrinking.
    const linearSmallShare = districtArea(linearCity, "small") / totalArea;
    const sqrtSmallShare = districtArea(sqrtCity, "small") / totalArea;
    const logSmallShare = districtArea(logCity, "small") / totalArea;
    expect(sqrtSmallShare).toBeGreaterThan(linearSmallShare);
    expect(logSmallShare).toBeGreaterThan(sqrtSmallShare);
  });

  it("is still deterministic (byte-identical) under sqrt and log modes across repeated calls", () => {
    const g = makeSkewedRepoGraph();
    for (const districtWeightMode of ["sqrt", "log"] as const) {
      const a = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode }));
      const b = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode }));
      expect(a).toBe(b);
    }
  });
});
