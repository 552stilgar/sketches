// props.ts (src/renderer/props.ts) -- age -> scaffolding prop selection + static geometry (V5.4,
// sibling of the V5.2 churn -> crane overlay pinned in tests/props.test.ts). Pins the behaviors
// the C2 task called out explicitly:
//   1. Selection is by `metrics.newestAge` directly against a documented, HEAD-window-anchored
//      default threshold -- not a percentile rank (age is an absolute day count, not a
//      distribution-relative notion the way "unusually high churn" is). `newestAge` (MIN across
//      measured members), never `age` (MAX) -- see docs/CONTRACT-city-json.md "Age extremes".
//   2. A building whose `metrics.newestAge` is absent -- OR whose `metrics.ageMeasured` is not
//      true -- gets NO scaffold, ever: both are UNMEASURED, never "brand new" (never fabricate
//      an unmeasured signal into a plausible-looking zero).
//   3. Deterministic and pure: same buildings -> identical PropSpec[], same order.
//   4. A crane and a scaffold on the SAME building never collide geometrically.
//   5. A crane and a scaffold are visually distinguishable (different color, different silhouette).
//   6. Built geometry is STATIC, same discipline as the crane geometry.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import * as propsModule from "../src/renderer/props.ts";
import {
  selectCraneSites,
  selectScaffoldSites,
  buildProps,
  DEFAULT_MAX_SCAFFOLD_AGE_DAYS,
  type PropSpec,
} from "../src/renderer/props.ts";
import { computeCityLensRanks } from "../src/renderer/lenses.ts";
import { ANALYSIS_WINDOW_DAYS } from "../src/analyzer/git.ts";
import type { Building } from "../src/types.ts";

function makeBuilding(id: string, age: number | undefined, overrides?: Partial<Building>): Building {
  return {
    id,
    x: 0,
    y: 0,
    width: 4,
    depth: 4,
    height: 10,
    style: "flat",
    // A measured building carries newestAge + ageMeasured together; `age` (the MAX/oldest-wing
    // field the weathering overlay reads) is deliberately NOT set here -- scaffolding must never
    // read it.
    metrics: {
      loc: 100,
      complexity: 5,
      churn: 0,
      ...(age === undefined ? {} : { newestAge: age, ageMeasured: true }),
    },
    ...overrides,
  };
}

describe("DEFAULT_MAX_SCAFFOLD_AGE_DAYS", () => {
  it("matches ANALYSIS_WINDOW_DAYS -- every temporal overlay reads the same HEAD-anchored past", () => {
    // props.ts deliberately does NOT import ANALYSIS_WINDOW_DAYS (that would pull
    // node:child_process into the browser bundle -- see props.ts's own doc comment); this pins
    // the two constants to the same VALUE so they cannot silently drift apart instead.
    expect(DEFAULT_MAX_SCAFFOLD_AGE_DAYS).toBe(ANALYSIS_WINDOW_DAYS);
  });
});

describe("selectScaffoldSites", () => {
  it("selects buildings at/below the default max age, by raw age -- not a percentile rank", () => {
    const buildings = [
      makeBuilding("new", 5, { x: 0 }),
      makeBuilding("mid", 89, { x: 10 }),
      makeBuilding("boundary", 90, { x: 20 }),
      makeBuilding("old", 91, { x: 30 }),
      makeBuilding("ancient", 900, { x: 40 }),
    ];
    const sites = selectScaffoldSites(buildings);
    expect(sites.map((s) => s.buildingId)).toEqual(["new", "mid", "boundary"]);
  });

  it("a named, documented threshold moves selection without touching the selection logic", () => {
    const buildings = [makeBuilding("a", 10, { x: 0 }), makeBuilding("b", 20, { x: 10 })];
    expect(selectScaffoldSites(buildings, { maxAgeDays: 15 }).map((s) => s.buildingId)).toEqual(["a"]);
    expect(selectScaffoldSites(buildings, { maxAgeDays: 25 }).map((s) => s.buildingId)).toEqual(["a", "b"]);
  });

  it("reads newestAge (youngest wing), never age (oldest wing)", () => {
    // The merge-point ruling (P3): `age` is MAX-across-members and belongs to the weathering
    // overlay; scaffolding reads `newestAge`. A building that is ancient overall but contains a
    // brand-new file MUST get a scaffold, and a building whose only young number is in `age`
    // must NOT -- otherwise the two overlays are silently reading each other's signal.
    const sites = selectScaffoldSites([
      makeBuilding("old-dir-with-new-file", undefined, {
        x: 0,
        metrics: { loc: 100, complexity: 5, churn: 0, age: 4000, newestAge: 3, ageMeasured: true },
      }),
      makeBuilding("young-max-only", undefined, {
        x: 50,
        metrics: { loc: 100, complexity: 5, churn: 0, age: 3, ageMeasured: true },
      }),
    ]);
    expect(sites.map((s) => s.buildingId)).toEqual(["old-dir-with-new-file"]);
  });

  it("a building with ageMeasured false gets no scaffold even though newestAge is 0", () => {
    // src/analyzer/git.ts emits age 0 BOTH for a file committed today and for a file with no
    // commits at all. ageMeasured is the only thing separating them, so an unmeasured building
    // whose newestAge is a real, threshold-passing 0 must still be skipped -- this is exactly
    // the fabricated-zero failure of 318773d.
    const sites = selectScaffoldSites([
      makeBuilding("no-git-history", undefined, {
        metrics: { loc: 100, complexity: 5, churn: 0, newestAge: 0, ageMeasured: false },
      }),
      makeBuilding("no-flag-at-all", undefined, {
        x: 50,
        metrics: { loc: 100, complexity: 5, churn: 0, newestAge: 0 },
      }),
    ]);
    expect(sites).toEqual([]);
  });

  it("a building with metrics.newestAge absent gets no scaffold, regardless of how young it might be", () => {
    const buildings = [
      makeBuilding("unmeasured", undefined, { x: 0 }), // no metrics.newestAge at all
      makeBuilding("measured-old", 5000, { x: 10 }),
    ];
    // Even with an enormous maxAgeDays, the unmeasured building is never selected -- absence is
    // never treated as age 0 / "brand new".
    const sites = selectScaffoldSites(buildings, { maxAgeDays: Number.MAX_SAFE_INTEGER });
    expect(sites.map((s) => s.buildingId)).toEqual(["measured-old"]);
  });

  it("is deterministic and pure: identical inputs produce byte-identical output, same order", () => {
    const buildings = [makeBuilding("a", 1), makeBuilding("b", 200), makeBuilding("c", 30)];
    const first = selectScaffoldSites(buildings, { maxAgeDays: 50 });
    const second = selectScaffoldSites(buildings, { maxAgeDays: 50 });
    expect(second).toEqual(first);
  });

  it("preserves the caller's building order rather than sorting by age", () => {
    const buildings = [makeBuilding("z", 1, { x: 0 }), makeBuilding("a", 1, { x: 10 }), makeBuilding("m", 500, { x: 20 })];
    const sites = selectScaffoldSites(buildings);
    expect(sites.map((s) => s.buildingId)).toEqual(["z", "a"]);
  });

  it("places a scaffold flush against the -x edge, sized to (not exceeding) rendered height", () => {
    const buildings = [makeBuilding("only", 1, { x: 100, y: 200, width: 6, depth: 8, height: 30 })];
    const [site] = selectScaffoldSites(buildings, { heightScale: 0.5 });
    expect(site).toBeDefined();
    expect(site!.kind).toBe("scaffold");
    // Outside the footprint on the -x edge -- the opposite side from a crane's +x placement.
    expect(site!.x).toBeLessThan(100);
    // Vertically centered on the footprint's depth, same convention as a crane.
    expect(site!.z).toBe(200 + 8 / 2);
    expect(site!.y).toBe(0);
    // Sized from the RENDERED height (scaled), never the raw height, and never exceeding it --
    // scaffolding wraps what's being built, it doesn't tower over it like a crane does.
    expect(site!.height).toBe(30 * 0.5);
    if (site!.kind === "scaffold") expect(site!.span).toBe(8);
  });

  it("defaults heightScale to 1 rather than guessing the viewer's resolved scale", () => {
    const buildings = [makeBuilding("a", 1)];
    expect(selectScaffoldSites(buildings)).toEqual(selectScaffoldSites(buildings, { heightScale: 1 }));
  });

  it("fails loudly on a non-positive or non-finite heightScale", () => {
    const buildings = [makeBuilding("a", 1)];
    for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => selectScaffoldSites(buildings, { heightScale: bad })).toThrow(/heightScale/);
    }
  });
});

describe("crane + scaffold on the same building", () => {
  it("never collide geometrically -- opposite edges of the footprint", () => {
    const building = makeBuilding("dual", 1, { x: 100, y: 200, width: 6, depth: 8, height: 30, metrics: { loc: 100, complexity: 5, churn: 999, newestAge: 1, ageMeasured: true } });
    const buildings = [building];
    const ranks = computeCityLensRanks(buildings);
    const [crane] = selectCraneSites(buildings, ranks, { minRank: 0 });
    const [scaffold] = selectScaffoldSites(buildings);

    expect(crane).toBeDefined();
    expect(scaffold).toBeDefined();
    // Crane stands on the +x side of the footprint, scaffold on the -x side -- their x positions
    // straddle the footprint from opposite directions and can never overlap.
    expect(crane!.x).toBeGreaterThan(building.x + building.width);
    expect(scaffold!.x).toBeLessThan(building.x);
  });

  it("read as visually distinct prop kinds -- different colors, different silhouettes", () => {
    const craneSpec: PropSpec = { buildingId: "a", kind: "crane", x: 0, y: 0, z: 0, height: 20 };
    const scaffoldSpec: PropSpec = { buildingId: "a", kind: "scaffold", x: -10, y: 0, z: 0, height: 20, span: 8 };
    const { group } = buildProps([craneSpec, scaffoldSpec]);

    const colorsByKind = new Map<string, Set<string>>();
    let craneMeshCount = 0;
    let scaffoldMeshCount = 0;
    group.traverse((obj) => {
      const propGroup = obj.parent === group ? obj : undefined;
      void propGroup;
    });
    for (const propGroup of group.children) {
      const kind = propGroup.name.startsWith("crane:") ? "crane" : "scaffold";
      propGroup.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        const material = mesh.material as THREE.MeshStandardMaterial | undefined;
        if (material?.color) {
          const set = colorsByKind.get(kind) ?? new Set<string>();
          set.add(material.color.getHexString());
          colorsByKind.set(kind, set);
        }
        if (mesh.geometry) {
          if (kind === "crane") craneMeshCount += 1;
          else scaffoldMeshCount += 1;
        }
      });
    }

    // No shared color between the two prop kinds.
    const craneColors = colorsByKind.get("crane") ?? new Set();
    const scaffoldColors = colorsByKind.get("scaffold") ?? new Set();
    for (const c of craneColors) expect(scaffoldColors.has(c)).toBe(false);
    expect(craneColors.size).toBeGreaterThan(0);
    expect(scaffoldColors.size).toBeGreaterThan(0);
    // Different silhouettes: a crane is always exactly 3 primitives (mast/jib/counter-jib); a
    // scaffold's mesh count varies with height (poles + braces + net) and is never 3-shaped the
    // same way for this fixture's height.
    expect(craneMeshCount).toBe(3);
    expect(scaffoldMeshCount).not.toBe(3);
  });
});

describe("buildProps -- scaffold geometry", () => {
  function findByBuildingId(root: THREE.Object3D, buildingId: string): THREE.Object3D | undefined {
    let found: THREE.Object3D | undefined;
    root.traverse((obj) => {
      if (!found && obj.userData.buildingId === buildingId) found = obj;
    });
    return found;
  }

  it("builds one discoverable, tagged Object3D per scaffold PropSpec", () => {
    const specs: PropSpec[] = [{ buildingId: "a", kind: "scaffold", x: 0, y: 0, z: 0, height: 20, span: 8 }];
    const { group, count } = buildProps(specs);
    expect(count).toBe(1);
    expect(findByBuildingId(group, "a")).toBeDefined();
  });

  it("is deterministic: identical specs produce the same instance count and positions", () => {
    const specs: PropSpec[] = [{ buildingId: "a", kind: "scaffold", x: 3, y: 0, z: 5, height: 18, span: 6 }];
    const first = buildProps(specs);
    const second = buildProps(specs);
    const p1 = findByBuildingId(first.group, "a")!.position;
    const p2 = findByBuildingId(second.group, "a")!.position;
    expect([p2.x, p2.y, p2.z]).toEqual([p1.x, p1.y, p1.z]);
  });

  it("builds STATIC geometry only -- no dash attributes anywhere in the tree", () => {
    const { group } = buildProps([{ buildingId: "a", kind: "scaffold", x: 0, y: 0, z: 0, height: 20, span: 8 }]);
    const attributeNames = new Set<string>();
    group.traverse((obj) => {
      const geometry = (obj as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
      if (geometry?.attributes) {
        for (const name of Object.keys(geometry.attributes)) attributeNames.add(name);
      }
    });
    expect(attributeNames.has("aOffset")).toBe(false);
    expect(attributeNames.has("aDashPeriod")).toBe(false);
  });

  it("module exposes no update/tick hook for the scaffold path either", () => {
    const exportNames = Object.keys(propsModule);
    for (const name of exportNames) {
      expect(name.toLowerCase()).not.toMatch(/update|tick|animate|frame/);
    }
    const { group } = buildProps([{ buildingId: "a", kind: "scaffold", x: 0, y: 0, z: 0, height: 20, span: 8 }]);
    expect((group as unknown as Record<string, unknown>).update).toBeUndefined();
    expect((group as unknown as Record<string, unknown>).tick).toBeUndefined();
  });
});
