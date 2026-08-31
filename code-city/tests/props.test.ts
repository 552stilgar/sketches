// props.ts (src/renderer/props.ts) -- churn -> crane prop selection + static geometry
// (PROJECT_IDEA.md §5.2 "Temporal overlays", first prop kind). Pins the behaviors the P1 crane
// task called out explicitly:
//   1. Selection is by churn PERCENTILE RANK against a documented default threshold.
//   2. A flat churn distribution (every building tied) yields ZERO cranes -- there is no "most
//      active" building to single out, and marking all of them would fabricate a ranking that
//      doesn't exist.
//   3. A building whose churn rank is absent from the ranks map gets NO crane, ever (never
//      fabricate an unmeasured signal into a plausible-looking selection).
//   4. Deterministic and pure: same buildings + ranks -> identical PropSpec[], same order.
//   5. Built geometry is STATIC -- no clock read, no per-frame update, no dash material -- and
//      that is asserted structurally (module export shape), not merely by comment.
//
// THREE's core data classes (Group, Mesh, BoxGeometry) construct fine outside a browser -- only
// WebGLRenderer needs a real canvas (same discipline as tests/landmarks-render.test.ts).

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import * as propsModule from "../src/renderer/props.ts";
import { selectCraneSites, buildProps, DEFAULT_MIN_CRANE_RANK, type PropSpec } from "../src/renderer/props.ts";
import { computeCityLensRanks, type CityLensRanks } from "../src/renderer/lenses.ts";
import type { Building } from "../src/types.ts";

function makeBuilding(id: string, churn: number, overrides?: Partial<Building>): Building {
  return {
    id,
    x: 0,
    y: 0,
    width: 4,
    depth: 4,
    height: 10,
    style: "flat",
    metrics: { loc: 100, complexity: 5, churn },
    ...overrides,
  };
}

/** Ten buildings, churn 0..9 -- a clean, evenly-spread distribution so percentile rank lands at
 *  predictable deciles (rank = index / 9) without any ties to reason about. */
function tenBuildingsSpread(): Building[] {
  return Array.from({ length: 10 }, (_, i) => makeBuilding(`b${i}`, i, { x: i * 10 }));
}

describe("selectCraneSites", () => {
  it("selects only buildings at/above the default top-decile churn rank", () => {
    const buildings = tenBuildingsSpread();
    const ranks = computeCityLensRanks(buildings);
    const sites = selectCraneSites(buildings, ranks);

    // rank(b9) = 9/9 = 1.0 -- the only building at/above DEFAULT_MIN_CRANE_RANK (0.9) in a
    // 10-item evenly spread distribution (rank(b8) = 8/9 ≈ 0.889 < 0.9).
    expect(DEFAULT_MIN_CRANE_RANK).toBe(0.9);
    expect(sites.map((s) => s.buildingId)).toEqual(["b9"]);
  });

  it("a documented, named threshold moves selection without touching the selection logic", () => {
    const buildings = tenBuildingsSpread();
    const ranks = computeCityLensRanks(buildings);
    const sites = selectCraneSites(buildings, ranks, { minRank: 0.5 });
    // rank >= 0.5 -> indices 4..9 (rank 4/9 ≈ 0.444 is just below; 5/9 ≈ 0.556 is the first hit)
    expect(sites.map((s) => s.buildingId)).toEqual(["b5", "b6", "b7", "b8", "b9"]);
  });

  it("a FLAT churn distribution yields zero cranes -- no fabricated 'most active' building", () => {
    const buildings = [
      makeBuilding("a", 7, { x: 0 }),
      makeBuilding("b", 7, { x: 10 }),
      makeBuilding("c", 7, { x: 20 }),
      makeBuilding("d", 7, { x: 30 }),
    ];
    const ranks = computeCityLensRanks(buildings);
    // Every building ties, so percentileRank collapses every one of them to 0.5 (lenses.ts) --
    // below any sane threshold, including the permissive 0.5 boundary itself (rank must be >=,
    // and 0.5 only clears >= 0.5, so pin the default explicitly here too).
    expect(selectCraneSites(buildings, ranks)).toEqual([]);
  });

  it("a building absent from ranks.churnRank gets no crane, regardless of its own churn value", () => {
    const buildings = [
      makeBuilding("hot", 999, { x: 0 }), // would dominate any ranking if it were included
      makeBuilding("cold", 1, { x: 10 }),
    ];
    // Simulates a caller passing ranks computed over a DIFFERENT building set than `buildings` --
    // "hot" has no entry at all, i.e. UNMEASURED for this ranking, not "rank 0".
    const ranks: CityLensRanks = {
      complexityRank: new Map([
        ["hot", 0.5],
        ["cold", 0.5],
      ]),
      churnRank: new Map([["cold", 0.1]]), // "hot" deliberately missing
    };
    const sites = selectCraneSites(buildings, ranks, { minRank: 0 });
    expect(sites.map((s) => s.buildingId)).toEqual(["cold"]);
  });

  it("is deterministic and pure: identical inputs produce byte-identical output, same order", () => {
    const buildings = tenBuildingsSpread();
    const ranks = computeCityLensRanks(buildings);
    const first = selectCraneSites(buildings, ranks, { minRank: 0.3 });
    const second = selectCraneSites(buildings, ranks, { minRank: 0.3 });
    expect(second).toEqual(first);
    expect(second.map((s) => s.buildingId)).toEqual(first.map((s) => s.buildingId));
  });

  it("preserves the caller's building order rather than sorting by rank", () => {
    // Deliberately NOT in ascending-churn order -- selection must key off each building's own
    // rank lookup, not assume/impose a sort.
    const buildings = [makeBuilding("z", 9, { x: 0 }), makeBuilding("a", 9, { x: 10 }), makeBuilding("m", 0, { x: 20 })];
    const ranks = computeCityLensRanks(buildings);
    const sites = selectCraneSites(buildings, ranks, { minRank: 0.5 });
    expect(sites.map((s) => s.buildingId)).toEqual(["z", "a"]);
  });

  it("places a crane beside (not inside) its building's footprint, above its raw height", () => {
    const buildings = [makeBuilding("only", 5, { x: 100, y: 200, width: 6, depth: 8, height: 30 })];
    const ranks: CityLensRanks = {
      complexityRank: new Map([["only", 0.5]]),
      churnRank: new Map([["only", 1]]),
    };
    const [site] = selectCraneSites(buildings, ranks, { minRank: 0 });
    expect(site).toBeDefined();
    // Outside the footprint on the +x edge, not overlapping it.
    expect(site.x).toBeGreaterThan(100 + 6);
    // Vertically centered on the footprint's depth.
    expect(site.z).toBe(200 + 8 / 2);
    // Ground-anchored, towering above the building's own raw height.
    expect(site.y).toBe(0);
    expect(site.height).toBeGreaterThan(30);
  });
});

describe("buildProps", () => {
  function findByBuildingId(root: THREE.Object3D, buildingId: string): THREE.Object3D | undefined {
    let found: THREE.Object3D | undefined;
    root.traverse((obj) => {
      if (!found && obj.userData.buildingId === buildingId) found = obj;
    });
    return found;
  }

  it("builds one discoverable, tagged Object3D per PropSpec", () => {
    const specs: PropSpec[] = [
      { buildingId: "a", kind: "crane", x: 0, y: 0, z: 0, height: 20 },
      { buildingId: "b", kind: "crane", x: 10, y: 0, z: 0, height: 25 },
    ];
    const { group, count } = buildProps(specs);
    expect(count).toBe(2);
    expect(findByBuildingId(group, "a")).toBeDefined();
    expect(findByBuildingId(group, "b")).toBeDefined();
    expect(findByBuildingId(group, "nonexistent")).toBeUndefined();
  });

  it("returns an empty, still-valid group for an empty spec list", () => {
    const { group, count } = buildProps([]);
    expect(count).toBe(0);
    expect(group.children.length).toBe(0);
  });

  it("is deterministic: identical specs produce the same instance count and positions", () => {
    const specs: PropSpec[] = [{ buildingId: "a", kind: "crane", x: 3, y: 0, z: 5, height: 18 }];
    const first = buildProps(specs);
    const second = buildProps(specs);
    expect(second.count).toBe(first.count);
    const p1 = findByBuildingId(first.group, "a")!.position;
    const p2 = findByBuildingId(second.group, "a")!.position;
    expect([p2.x, p2.y, p2.z]).toEqual([p1.x, p1.y, p1.z]);
  });

  it("builds STATIC geometry only -- no dash attributes anywhere in the tree", () => {
    const { group } = buildProps([{ buildingId: "a", kind: "crane", x: 0, y: 0, z: 0, height: 20 }]);
    const attributeNames = new Set<string>();
    group.traverse((obj) => {
      const geometry = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (geometry?.attributes) {
        for (const name of Object.keys(geometry.attributes)) attributeNames.add(name);
      }
    });
    // aOffset/aDashPeriod are roads.ts's exclusive animated-flow attributes (CONTRACTS.md D2) --
    // a crane carrying either would be indistinguishable from a road mid-animation.
    expect(attributeNames.has("aOffset")).toBe(false);
    expect(attributeNames.has("aDashPeriod")).toBe(false);
  });

  it("module exposes no update/tick hook -- structurally asserts staticness, not by comment", () => {
    const exportNames = Object.keys(propsModule);
    for (const name of exportNames) {
      expect(name.toLowerCase()).not.toMatch(/update|tick|animate|frame/);
    }
    // And the built result itself carries no update/tick method either.
    const { group } = buildProps([{ buildingId: "a", kind: "crane", x: 0, y: 0, z: 0, height: 20 }]);
    expect((group as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((group as unknown as Record<string, unknown>).tick).toBeUndefined();
  });
});
