// src/renderer/morph.ts -- the pure interpolation half of Lane F's timeline scrub (PROJECT_IDEA.md
// Phase 4). Load-bearing properties: interpolation is a pure function of (from, to, t) with no
// hidden state; a building present on only one side fades via `presence` rather than fabricating a
// spatial origin/destination it never had; the union of two building sets is exactly the union
// (nothing dropped, nothing duplicated); and everything is DETERMINISTIC -- same inputs, same
// output, in the same order, regardless of how the two CityModels' own arrays were ordered.

import { describe, expect, it } from "vitest";
import { morphBuilding, morphBuildings, type MorphedBuilding } from "../src/renderer/morph.ts";
import type { Building, CityModel } from "../src/types.ts";

function building(id: string, overrides: Partial<Building> = {}): Building {
  return {
    id,
    x: 10,
    y: 10,
    width: 20,
    depth: 20,
    height: 5,
    style: "typescript",
    metrics: { loc: 100, complexity: 4, churn: 2 },
    ...overrides,
  };
}

function cityOf(buildings: Building[]): CityModel {
  return { districts: [], buildings, roads: [], landmarks: [], identityLinks: [] };
}

describe("morphBuilding", () => {
  it("at t=0, present on both sides, equals the FROM state exactly (position, size, metrics)", () => {
    const from = building("b1", { x: 0, height: 3, metrics: { loc: 10, complexity: 1, churn: 0 } });
    const to = building("b1", { x: 100, height: 30, metrics: { loc: 200, complexity: 9, churn: 9 } });
    const frame = morphBuilding(from, to, 0)!;
    expect(frame.x).toBe(0);
    expect(frame.height).toBe(3);
    expect(frame.metrics).toEqual({ loc: 10, complexity: 1, churn: 0 });
    expect(frame.presence).toBe(1);
  });

  it("at t=1, present on both sides, equals the TO state exactly", () => {
    const from = building("b1", { x: 0, height: 3 });
    const to = building("b1", { x: 100, height: 30 });
    const frame = morphBuilding(from, to, 1)!;
    expect(frame.x).toBe(100);
    expect(frame.height).toBe(30);
    expect(frame.presence).toBe(1);
  });

  it("at t=0.5, present on both sides, is the exact midpoint of every numeric field", () => {
    const from = building("b1", { x: 0, y: 0, width: 10, depth: 10, height: 4, metrics: { loc: 0, complexity: 0, churn: 0 } });
    const to = building("b1", { x: 100, y: 40, width: 30, depth: 30, height: 12, metrics: { loc: 100, complexity: 10, churn: 8 } });
    const frame = morphBuilding(from, to, 0.5)!;
    expect(frame.x).toBe(50);
    expect(frame.y).toBe(20);
    expect(frame.width).toBe(20);
    expect(frame.depth).toBe(20);
    expect(frame.height).toBe(8);
    expect(frame.metrics).toEqual({ loc: 50, complexity: 5, churn: 4 });
  });

  it("clamps t outside [0,1] rather than extrapolating past either endpoint", () => {
    const from = building("b1", { x: 0 });
    const to = building("b1", { x: 100 });
    expect(morphBuilding(from, to, -5)!.x).toBe(0);
    expect(morphBuilding(from, to, 5)!.x).toBe(100);
  });

  it("APPEARING (from undefined): geometry is the TO state's own, fixed across t -- never grown from a fabricated origin", () => {
    const to = building("b1", { x: 42, y: 7, width: 15, depth: 15, height: 6 });
    const early = morphBuilding(undefined, to, 0.1)!;
    const late = morphBuilding(undefined, to, 0.9)!;
    expect(early.x).toBe(42);
    expect(late.x).toBe(42);
    expect(early.height).toBe(6);
    expect(late.height).toBe(6);
  });

  it("APPEARING: presence ramps 0 -> 1 with t, never negative, never exceeding 1", () => {
    const to = building("b1");
    expect(morphBuilding(undefined, to, 0)!.presence).toBe(0);
    expect(morphBuilding(undefined, to, 0.3)!.presence).toBeCloseTo(0.3, 9);
    expect(morphBuilding(undefined, to, 1)!.presence).toBe(1);
  });

  it("VANISHING (to undefined): geometry is the FROM state's own, fixed across t", () => {
    const from = building("b1", { x: 9, height: 3 });
    const early = morphBuilding(from, undefined, 0.1)!;
    const late = morphBuilding(from, undefined, 0.9)!;
    expect(early.x).toBe(9);
    expect(late.x).toBe(9);
  });

  it("VANISHING: presence ramps 1 -> 0 with t", () => {
    const from = building("b1");
    expect(morphBuilding(from, undefined, 0)!.presence).toBe(1);
    expect(morphBuilding(from, undefined, 0.3)!.presence).toBeCloseTo(0.7, 9);
    expect(morphBuilding(from, undefined, 1)!.presence).toBe(0);
  });

  it("returns null when the building exists on neither side", () => {
    expect(morphBuilding(undefined, undefined, 0.5)).toBeNull();
  });
});

describe("morphBuildings", () => {
  it("is the UNION of both cities' building ids -- nothing dropped, nothing duplicated", () => {
    const from = cityOf([building("shared"), building("only-from")]);
    const to = cityOf([building("shared"), building("only-to")]);
    const frames = morphBuildings(from, to, 0.5);
    expect(frames.map((f) => f.id).sort()).toEqual(["only-from", "only-to", "shared"]);
  });

  it("gives an appearing building presence < 1 and a vanishing one presence < 1 at t=0.5, a shared one presence 1", () => {
    const from = cityOf([building("shared"), building("vanishing")]);
    const to = cityOf([building("shared"), building("appearing")]);
    const byId = new Map(morphBuildings(from, to, 0.5).map((f) => [f.id, f]));
    expect(byId.get("shared")!.presence).toBe(1);
    expect(byId.get("appearing")!.presence).toBeCloseTo(0.5, 9);
    expect(byId.get("vanishing")!.presence).toBeCloseTo(0.5, 9);
  });

  it("is DETERMINISTIC: output order depends only on building id, never on either city's own array order", () => {
    const a = cityOf([building("zzz"), building("aaa"), building("mmm")]);
    const b = cityOf([building("mmm"), building("zzz"), building("aaa")]);
    const framesFromA = morphBuildings(a, b, 0.5).map((f) => f.id);
    const framesFromShuffled = morphBuildings(
      cityOf([building("mmm"), building("aaa"), building("zzz")]),
      cityOf([building("aaa"), building("mmm"), building("zzz")]),
      0.5,
    ).map((f) => f.id);
    expect(framesFromA).toEqual(["aaa", "mmm", "zzz"]);
    expect(framesFromShuffled).toEqual(["aaa", "mmm", "zzz"]);
  });

  it("an identical from/to city at any t reproduces that city's buildings unchanged", () => {
    const city = cityOf([building("b1", { x: 5, height: 9 }), building("b2", { x: 55, height: 2 })]);
    const frames = morphBuildings(city, city, 0.37);
    const byId = new Map(frames.map((f: MorphedBuilding) => [f.id, f]));
    expect(byId.get("b1")!.x).toBe(5);
    expect(byId.get("b1")!.height).toBe(9);
    expect(byId.get("b1")!.presence).toBe(1);
  });
});
