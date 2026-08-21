// RED (behavior 3) — compileCity throws NotImplemented. Every test below calls compileCity as
// its first real step, so every currently-failing test fails for exactly that reason.

import { describe, it, expect } from "vitest";
import { compileCity } from "../src/compiler/index.ts";
import { makeFixedRepoGraph, synthesizeGraph } from "./fixtures/repo-graph-fixture.ts";
import type { Building, District } from "../src/types.ts";

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
});
