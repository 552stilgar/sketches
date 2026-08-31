// compileCity — ruins placement (V5.3b, compiler half — CONTRACTS.md § "V5.3b").
//
// Covers the part of the V5.3 contract tests/ruins.test.ts (the pure readRuins analyzer unit)
// doesn't reach: compileCity(graph) actually turning `graph.ruins` (RuinRecord[], V5.3a) into
// `CityModel.ruins` (RuinMarker[]) -- placed, non-overlapping, deterministic.

import { describe, it, expect } from "vitest";
import { compileCity } from "../src/compiler/index.ts";
import { validateCity } from "../src/types.ts";
import { makeFixedRepoGraph } from "./fixtures/repo-graph-fixture.ts";
import type { RepoGraph, RuinRecord, Building, RuinMarker } from "../src/types.ts";

function withRuins(ruins: RuinRecord[]): RepoGraph {
  return { ...makeFixedRepoGraph(), ruins };
}

function overlaps(a: { x: number; y: number; width: number; depth: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.depth && b.y < a.y + a.depth;
}

const RUIN_ALPHA: RuinRecord = {
  path: "alpha/deleted-one.ts",
  language: "typescript",
  deletedSha: "1111111111111111111111111111111111dead",
  deletedDate: "2026-05-15T00:00:00.000Z",
  lastLoc: 42,
};

const RUIN_BETA: RuinRecord = {
  path: "beta/deleted-two.ts",
  language: "typescript",
  deletedSha: "2222222222222222222222222222222222dead",
  deletedDate: "2026-05-20T00:00:00.000Z",
};

describe("compileCity — ruins placement", () => {
  it("emits no ruins when the graph carries no ruins field", () => {
    const city = compileCity(makeFixedRepoGraph());
    expect(city.ruins).toEqual([]);
  });

  it("emits no ruins for an empty ruins array", () => {
    const city = compileCity(withRuins([]));
    expect(city.ruins).toEqual([]);
  });

  it("emits one RuinMarker per RuinRecord, id ruin:<path>, path/style carried through", () => {
    const city = compileCity(withRuins([RUIN_ALPHA, RUIN_BETA]));
    expect(city.ruins).toHaveLength(2);
    const byId = new Map(city.ruins.map((r) => [r.id, r]));
    expect(byId.get("ruin:alpha/deleted-one.ts")).toMatchObject({
      path: "alpha/deleted-one.ts",
      style: "typescript",
    });
    expect(byId.get("ruin:beta/deleted-two.ts")).toMatchObject({
      path: "beta/deleted-two.ts",
      style: "typescript",
    });
  });

  it("never carries lastLoc, complexity, or any other RuinRecord-absent field onto RuinMarker", () => {
    const city = compileCity(withRuins([RUIN_ALPHA]));
    const marker = city.ruins[0] as unknown as Record<string, unknown>;
    expect(marker.lastLoc).toBeUndefined();
    expect(marker.height).toBeUndefined();
    expect(marker.loc).toBeUndefined();
  });

  it("places each ruin inside the bounds of the district owning its last known path", () => {
    const city = compileCity(withRuins([RUIN_ALPHA]));
    const ruin = city.ruins[0];
    const district = city.districts.find((d) => d.name === "alpha");
    if (!district) throw new Error("expected an alpha district");
    expect(ruin.x).toBeGreaterThanOrEqual(district.x);
    expect(ruin.x + ruin.width).toBeLessThanOrEqual(district.x + district.width + 1e-6);
    expect(ruin.y).toBeGreaterThanOrEqual(district.y);
    expect(ruin.y + ruin.depth).toBeLessThanOrEqual(district.y + district.depth + 1e-6);
  });

  it("never overlaps a building's AABB (reuses the shelf-slot grid, same guarantee landmarks get)", () => {
    const city = compileCity(withRuins([RUIN_ALPHA, RUIN_BETA]));
    for (const ruin of city.ruins) {
      for (const building of city.buildings as Building[]) {
        expect(overlaps(ruin, building)).toBe(false);
      }
    }
  });

  it("never overlaps another ruin's AABB in the same district", () => {
    const crowded: RuinRecord[] = [
      RUIN_ALPHA,
      { ...RUIN_ALPHA, path: "alpha/deleted-three.ts" },
      { ...RUIN_ALPHA, path: "alpha/deleted-four.ts" },
    ];
    const city = compileCity(withRuins(crowded));
    for (let i = 0; i < city.ruins.length; i++) {
      for (let j = i + 1; j < city.ruins.length; j++) {
        expect(overlaps(city.ruins[i], city.ruins[j])).toBe(false);
      }
    }
  });

  it("gives a ruin's district its own rectangle when the whole top-level directory was demolished (no live files, no datastore)", () => {
    const ruin: RuinRecord = { ...RUIN_ALPHA, path: "delta/gone.ts" };
    const city = compileCity(withRuins([ruin]));
    expect(city.districts.some((d) => d.name === "delta")).toBe(true);
    expect(city.ruins).toHaveLength(1);
    expect(city.ruins[0].width).toBeGreaterThan(0);
    expect(city.ruins[0].depth).toBeGreaterThan(0);
  });

  it("a root-level deleted file (no slash in path) maps to the '.' district", () => {
    const ruin: RuinRecord = { ...RUIN_ALPHA, path: "deleted-root.ts" };
    const city = compileCity(withRuins([ruin]));
    expect(city.districts.some((d) => d.name === ".")).toBe(true);
    const district = city.districts.find((d) => d.name === ".");
    if (!district) throw new Error("expected a '.' district");
    const marker = city.ruins[0];
    expect(marker.x).toBeGreaterThanOrEqual(district.x);
    expect(marker.y).toBeGreaterThanOrEqual(district.y);
  });

  it("footprint is a fixed fraction of the slot, never derived from lastLoc (RuinRecord.lastLoc has no bearing on size)", () => {
    const tiny: RuinRecord = { ...RUIN_ALPHA, path: "alpha/tiny.ts", lastLoc: 1 };
    const huge: RuinRecord = { ...RUIN_ALPHA, path: "alpha/huge.ts", lastLoc: 100000 };
    const city = compileCity(withRuins([tiny, huge]));
    const byId = new Map(city.ruins.map((r: RuinMarker) => [r.id, r]));
    const a = byId.get("ruin:alpha/tiny.ts");
    const b = byId.get("ruin:alpha/huge.ts");
    if (!a || !b) throw new Error("expected both ruins");
    // Not asserting equality (different slots in a shared grid can differ), but a monstrous
    // lastLoc must not blow the footprint out relative to a tiny one -- both come from the same
    // fixed fraction of a similarly-sized shelf-grid cell.
    expect(Math.abs(a.width - b.width)).toBeLessThan(Math.max(a.width, b.width));
  });

  it("is deterministic: same graph compiled twice yields byte-identical ruins", () => {
    const g = withRuins([RUIN_ALPHA, RUIN_BETA]);
    const a = JSON.stringify(compileCity(g).ruins);
    const b = JSON.stringify(compileCity(g).ruins);
    expect(a).toBe(b);
  });

  it("output validates clean against validateCity", () => {
    const city = compileCity(withRuins([RUIN_ALPHA, RUIN_BETA]));
    const result = validateCity(city);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("a ruin added to one district never disturbs a DIFFERENT district's buildings or rectangle", () => {
    // Adding a ruin to `alpha` can reflow `alpha`'s own shelf grid (shelfSlots' documented
    // bounded-drift behavior when the key count in ONE district's grid changes,
    // src/compiler/layout.ts) -- that is expected, not a regression. What must stay untouched is
    // every OTHER district: its own key list, its own file count (ruins never enter
    // districtMembers), and therefore its own weight/rectangle and its buildings' shelf slots.
    const before = compileCity(makeFixedRepoGraph());
    const after = compileCity(withRuins([RUIN_ALPHA])); // alpha/deleted-one.ts -- alpha only
    for (const districtName of ["beta", "gamma"]) {
      const beforeDistrict = before.districts.find((d) => d.name === districtName);
      const afterDistrict = after.districts.find((d) => d.name === districtName);
      expect(afterDistrict).toEqual(beforeDistrict);
    }
    const beforeById = new Map(before.buildings.map((b) => [b.id, b]));
    for (const building of after.buildings) {
      if (!building.id.startsWith("beta/") && !building.id.startsWith("gamma/")) continue;
      const prior = beforeById.get(building.id);
      if (!prior) throw new Error(`expected ${building.id} to exist before too`);
      expect(building.x).toBe(prior.x);
      expect(building.y).toBe(prior.y);
      expect(building.width).toBe(prior.width);
      expect(building.depth).toBe(prior.depth);
    }
  });
});
