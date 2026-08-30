// RED (behavior 3) — compileCity throws NotImplemented. Every test below calls compileCity as
// its first real step, so every currently-failing test fails for exactly that reason.

import { describe, it, expect } from "vitest";
import { compileCity } from "../src/compiler/index.ts";
import { shelfSlots } from "../src/compiler/layout.ts";
import { footprintSide, FOOTPRINT_FLOOR_DEFAULT, p95 } from "../src/compiler/grammar.ts";
import { makeFixedRepoGraph, synthesizeGraph } from "./fixtures/repo-graph-fixture.ts";
import type { Building, District, RepoGraph, RepoNode } from "../src/types.ts";

function fullyInside(b: Building, d: District): boolean {
  return b.x >= d.x && b.y >= d.y && b.x + b.width <= d.x + d.width && b.y + b.depth <= d.y + d.depth;
}

function overlaps(a: Building, b: Building): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.depth && b.y < a.y + a.depth;
}

function findOverlaps(buildings: Building[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < buildings.length; i++) {
    for (let j = i + 1; j < buildings.length; j++) {
      if (overlaps(buildings[i], buildings[j])) pairs.push([buildings[i].id, buildings[j].id]);
    }
  }
  return pairs;
}

describe("compiler layout on G (RED — compileCity not implemented yet)", () => {
  it("no pairwise building AABB overlaps (touching edges allowed)", () => {
    const g = makeFixedRepoGraph();
    const city = compileCity(g);
    expect(findOverlaps(city.buildings)).toEqual([]);
  });

  it("every building is fully inside at least one district rect", () => {
    const g = makeFixedRepoGraph();
    const city = compileCity(g);
    expect(city.buildings.length).toBeGreaterThan(0);
    for (const b of city.buildings) {
      const contained = city.districts.some((d) => fullyInside(b, d));
      expect(contained).toBe(true);
    }
  });

  it("every road references an existing building id", () => {
    const g = makeFixedRepoGraph();
    const city = compileCity(g);
    const ids = new Set(city.buildings.map((b) => b.id));
    for (const r of city.roads) {
      expect(ids.has(r.from)).toBe(true);
      expect(ids.has(r.to)).toBe(true);
    }
  });
});

describe("shelfSlots on thin/narrow districts (bug: fixed padding pushes buildings off-canvas)", () => {
  it("keeps every slot coordinate within the district and within the 1000x1000 canvas for a thin district near the canvas edge", () => {
    // District is only 5 units wide (thinner than the default padding=8) and
    // sits flush against the right edge of a 1000x1000 canvas: any padding
    // that isn't clamped to the district's own extent pushes slot.x past
    // both the district boundary AND the canvas edge (995 + 8 = 1003 > 1000).
    const district = { x: 995, y: 0, width: 5, depth: 1000 };
    const paths = ["a.ts", "b.ts", "c.ts"];
    const slots = shelfSlots(paths, district);
    expect(slots.size).toBe(paths.length);
    for (const [, slot] of slots) {
      expect(slot.x).toBeGreaterThanOrEqual(district.x);
      expect(slot.x).toBeGreaterThanOrEqual(0);
      expect(slot.x + slot.width).toBeLessThanOrEqual(district.x + district.width);
      expect(slot.x + slot.width).toBeLessThanOrEqual(1000);
      expect(slot.y).toBeGreaterThanOrEqual(district.y);
      expect(slot.y + slot.depth).toBeLessThanOrEqual(district.y + district.depth);
    }
  });
});

describe("footprintSide preserves the sqrt(loc) invariant (bug: clamp flattens the relationship)", () => {
  it("uses a nearest-rank p95 without interpolation and floors the result at 1", () => {
    expect(p95([])).toBe(1);
    expect(p95([0, 0])).toBe(1);
    expect(p95(Array.from({ length: 20 }, (_, i) => i + 1))).toBe(19);
  });

  it("produces strictly increasing footprints for 3 files with increasing loc, even when maximum is small", () => {
    // With the old clamp (Math.min(maximum, Math.max(1, sqrt(loc)*2))), any
    // maximum < 1 forced EVERY loc to the same output (maximum itself),
    // since the floor of 1 always won the inner max() and then got clamped
    // down to maximum regardless of loc. maxSide can legitimately be this
    // small (shelfSlots floors it at 0.25 for tightly packed districts).
    const maximum = 0.6;
    const sideSmall = footprintSide(5, maximum);
    const sideMedium = footprintSide(60, maximum);
    const sideLarge = footprintSide(600, maximum);
    expect(sideSmall).toBeLessThan(sideMedium);
    expect(sideMedium).toBeLessThan(sideLarge);
    expect(sideLarge).toBeLessThanOrEqual(maximum);
  });

  it("still respects the maximum ceiling for very large loc", () => {
    expect(footprintSide(10_000_000, 20)).toBeLessThanOrEqual(20);
  });

  it("never returns a non-positive side for loc=0", () => {
    expect(footprintSide(0, 20)).toBeGreaterThan(0);
  });

  it("keeps a visible footprint spread across a realistic wide LOC distribution", () => {
    const graph = synthesizeGraph(20, 1);
    graph.nodes.forEach((node, index) => {
      node.loc = 1_000 * 2 ** index;
    });
    const widths = compileCity(graph).buildings.map((building) => building.width);
    expect(Math.min(...widths) / Math.max(...widths)).toBeLessThan(0.6);
  });
});

describe("footprintSide's footprintFloor parameter (Lane C v5.1 massing knob)", () => {
  it("defaults to FOOTPRINT_FLOOR_DEFAULT — omitting the 4th arg is byte-identical to passing it explicitly", () => {
    for (const [loc, maximum] of [
      [0, 20],
      [5, 0.6],
      [60, 0.6],
      [600, 0.6],
      [10_000_000, 20],
    ] as const) {
      expect(footprintSide(loc, maximum)).toBe(footprintSide(loc, maximum, 200, FOOTPRINT_FLOOR_DEFAULT));
    }
  });

  it("a raised floor widens the smallest (loc=0) building without changing large-loc buildings that already exceed it", () => {
    const maximum = 20;
    const smallAtDefault = footprintSide(0, maximum);
    const smallAtRaisedFloor = footprintSide(0, maximum, 200, 0.5);
    expect(smallAtRaisedFloor).toBeGreaterThan(smallAtDefault);
    expect(smallAtRaisedFloor).toBeCloseTo(maximum * 0.5, 10);

    // A building already scaled well above the raised floor is untouched by it.
    const largeAtDefault = footprintSide(10_000_000, maximum);
    const largeAtRaisedFloor = footprintSide(10_000_000, maximum, 200, 0.5);
    expect(largeAtRaisedFloor).toBe(largeAtDefault);
  });

  it("never exceeds the slot maximum even when floorFactor is pushed past 1 or negative", () => {
    expect(footprintSide(0, 20, 200, 5)).toBeLessThanOrEqual(20);
    expect(footprintSide(0, 20, 200, -5)).toBeGreaterThan(0);
    expect(footprintSide(0, 20, 200, -5)).toBeLessThanOrEqual(20);
  });

  it("stays pure/total on the degenerate inputs (loc=0, negative loc, negative maximum) at any floorFactor", () => {
    for (const floorFactor of [0, FOOTPRINT_FLOOR_DEFAULT, 0.5, 1]) {
      expect(footprintSide(0, 20, 200, floorFactor)).toBeGreaterThan(0);
      expect(Number.isNaN(footprintSide(-100, 20, 200, floorFactor))).toBe(false);
      expect(footprintSide(-100, 20, 200, floorFactor)).toBeGreaterThanOrEqual(0);
      expect(footprintSide(50, -20, 200, floorFactor)).toBe(0);
      expect(Number.isNaN(footprintSide(50, -20, 200, floorFactor))).toBe(false);
    }
  });

  it("compileCity's footprintFloor option reproduces default output byte-for-byte when omitted, and widens the smallest building when raised", () => {
    const graph = synthesizeGraph(20, 1);
    graph.nodes.forEach((node, index) => {
      node.loc = index === 0 ? 0 : 1_000 * 2 ** index;
    });
    const cityDefault = compileCity(graph);
    const cityExplicitDefault = compileCity(graph, { footprintFloor: FOOTPRINT_FLOOR_DEFAULT });
    expect(JSON.stringify(cityExplicitDefault)).toBe(JSON.stringify(cityDefault));

    const cityRaisedFloor = compileCity(graph, { footprintFloor: 0.5 });
    const smallestDefault = Math.min(...cityDefault.buildings.map((b) => b.width));
    const smallestRaised = Math.min(...cityRaisedFloor.buildings.map((b) => b.width));
    expect(smallestRaised).toBeGreaterThan(smallestDefault);

    // No overlap/maximum-exceedance regression at the raised floor: every building still lands
    // fully inside some district and no two overlap (same invariants the unparameterized suite
    // above checks for the default floor).
    expect(findOverlaps(cityRaisedFloor.buildings)).toEqual([]);
    for (const b of cityRaisedFloor.buildings) {
      expect(cityRaisedFloor.districts.some((d) => fullyInside(b, d))).toBe(true);
    }
  });
});

describe("compiler height normalization", () => {
  it("bounds extreme complexity in [4, 180] while preserving complexity ordering", () => {
    const graph = synthesizeGraph(20, 1);
    graph.nodes.forEach((node, index) => {
      node.complexity = index === 19 ? 1_000_000_000 : index * index;
    });
    const city = compileCity(graph);
    const byComplexity = [...city.buildings].sort((a, b) => a.metrics.complexity - b.metrics.complexity);
    const heights = byComplexity.map((building) => building.height);
    expect(heights.every((height) => height >= 4 && height <= 180)).toBe(true);
    expect(heights).toEqual([...heights].sort((a, b) => a - b));
    expect(heights[0]).toBe(4);
    expect(heights.at(-1)).toBe(180);
  });

  it("normalizes footprint and height independently", () => {
    const graph = synthesizeGraph(2, 1);
    graph.nodes[0].loc = 1;
    graph.nodes[0].complexity = 10_000;
    graph.nodes[1].loc = 10_000;
    graph.nodes[1].complexity = 1;
    const [smallTall, largeShort] = compileCity(graph).buildings;
    expect(smallTall.width).toBeLessThan(largeShort.width);
    expect(smallTall.height).toBeGreaterThan(largeShort.height);
  });
});

describe("compiler LOD (RED — compileCity not implemented yet)", () => {
  it("<50 files -> buildings = files, 1:1 (30 files -> exactly 30 buildings)", () => {
    const g = synthesizeGraph(30, 4);
    const city = compileCity(g);
    expect(city.buildings.length).toBe(30);
  });

  it("50-500 files -> buildings = files, districts = top-level dirs (200 files, 5 dirs)", () => {
    const g = synthesizeGraph(200, 5);
    const city = compileCity(g);
    expect(city.buildings.length).toBe(200);
    expect(city.districts.length).toBe(5);
  });

  it(">500 files -> buildings = directories, fewer buildings than files (800 files, 6 dirs)", () => {
    const g = synthesizeGraph(800, 6);
    const city = compileCity(g);
    expect(city.buildings.length).toBeGreaterThan(0);
    expect(city.buildings.length).toBeLessThan(800);
  });

  it(">500 files, genuinely flat repo (no subdirectories at all) -> does NOT collapse to 1 building", () => {
    // Every existing >500-files fixture nests each file one directory deep,
    // so it never exercises the flat-repo grouping path. A repo with many
    // top-level files and zero subdirectories has topLevelPath === "." for
    // every file, and the old fallback grouping used "." as the group key
    // for all of them -- collapsing 600 distinct files into exactly one
    // building.
    const nodes: RepoNode[] = [];
    for (let i = 0; i < 600; i++) {
      const id = `file${i}.ts`;
      nodes.push({
        id,
        type: "file",
        language: "typescript",
        name: id,
        path: id,
        loc: 20 + (i % 50),
        complexity: 1 + (i % 10),
        churn: i % 5,
        age: 30 + i,
        contributors: ["dev@example.com"],
        imports: [],
        calls: [],
        contains: [],
      });
    }
    const g: RepoGraph = {
      nodes,
      repoPath: "/fixtures/synth-flat-600",
      headSha: "0000000000000000000000000000000000flat",
      headDate: "2026-06-01T12:00:00.000Z",
    };
    const city = compileCity(g);
    expect(city.buildings.length).toBeGreaterThan(1);
    expect(city.buildings.length).toBeLessThanOrEqual(600);
  });
});
