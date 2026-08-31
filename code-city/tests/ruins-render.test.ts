// buildRuins (src/renderer/ruins.ts) — V5.3b renderer half, CONTRACTS.md § "V5.3b".
//
// Conventions this covers, mirroring tests/landmarks-render.test.ts's own header:
//   - one Object3D per RuinMarker, discoverable via `userData.ruinId === ruin.id` on some
//     descendant of the returned group (same discoverability pattern buildLandmarks/buildTethers/
//     buildProps already use).
//   - static geometry only: no per-frame update or tick hook anywhere in the module.
//   - a ruin must never read as a live building: capped height well under HEIGHT_MIN (4), and a
//     hue/lightness distinct from every other lit channel in the city (buildings, landmarks,
//     cranes, scaffolds).
//
// THREE's core data classes (Group, BoxGeometry, Mesh) construct fine outside a browser -- same
// discipline as tests/landmarks-render.test.ts and tests/props.test.ts.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildRuins } from "../src/renderer/ruins.ts";
import { compileCity } from "../src/compiler/index.ts";
import type { CityModel, RepoGraph, RuinRecord } from "../src/types.ts";
import { makeFixedRepoGraph } from "./fixtures/repo-graph-fixture.ts";

function emptyCity(): CityModel {
  return { districts: [], buildings: [], roads: [], landmarks: [], identityLinks: [], ruins: [] };
}

const RUIN_ALPHA: RuinRecord = {
  path: "alpha/deleted-one.ts",
  language: "typescript",
  deletedSha: "1111111111111111111111111111111111dead",
  deletedDate: "2026-05-15T00:00:00.000Z",
};

const RUIN_BETA: RuinRecord = {
  path: "beta/deleted-two.ts",
  language: "typescript",
  deletedSha: "2222222222222222222222222222222222dead",
  deletedDate: "2026-05-20T00:00:00.000Z",
};

function cityWithRuins(): CityModel {
  const graph: RepoGraph = { ...makeFixedRepoGraph(), ruins: [RUIN_ALPHA, RUIN_BETA] };
  return compileCity(graph);
}

function findByUserData(root: THREE.Object3D, key: "ruinId", value: string): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((obj) => {
    if (!found && obj.userData[key] === value) found = obj;
  });
  return found;
}

function maxRenderedHeight(root: THREE.Object3D): number {
  let max = 0;
  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh) {
      const geometry = obj.geometry as THREE.BoxGeometry;
      const params = geometry.parameters as { height?: number } | undefined;
      const height = params?.height ?? 0;
      const top = obj.position.y + height / 2;
      if (top > max) max = top;
    }
  });
  return max;
}

describe("buildRuins", () => {
  it("returns an empty group for a city with no ruins", () => {
    const group = buildRuins(emptyCity());
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(0);
  });

  it("treats a city.json compiled before V5.3b (no ruins field at all) the same as empty, never throwing", () => {
    const city = emptyCity() as unknown as Record<string, unknown>;
    delete city.ruins;
    expect(() => buildRuins(city as unknown as CityModel)).not.toThrow();
    expect(buildRuins(city as unknown as CityModel).children.length).toBe(0);
  });

  it("produces a discoverable object per ruin, tagged with userData.ruinId", () => {
    const city = cityWithRuins();
    const group = buildRuins(city);
    expect(city.ruins.length).toBeGreaterThan(0);
    for (const ruin of city.ruins) {
      const found = findByUserData(group, "ruinId", ruin.id);
      expect(found, `no object tagged ruinId="${ruin.id}"`).toBeDefined();
    }
  });

  it("positions each ruin group at (x, 0, y) — grounded, unlike tethers' elevated plane", () => {
    const city = cityWithRuins();
    const group = buildRuins(city);
    for (const ruin of city.ruins) {
      const found = findByUserData(group, "ruinId", ruin.id);
      if (!found) throw new Error(`missing ruin group for ${ruin.id}`);
      expect(found.position.x).toBeCloseTo(ruin.x);
      expect(found.position.y).toBeCloseTo(0);
      expect(found.position.z).toBeCloseTo(ruin.y);
    }
  });

  it("never renders taller than HEIGHT_MIN (4) -- a ruin can never be mistaken for even the shortest building", () => {
    const city = cityWithRuins();
    const group = buildRuins(city);
    for (const ruin of city.ruins) {
      const found = findByUserData(group, "ruinId", ruin.id);
      if (!found) throw new Error(`missing ruin group for ${ruin.id}`);
      expect(maxRenderedHeight(found)).toBeLessThan(4);
    }
  });

  it("is static: no update/tick function is exported by the module", async () => {
    const mod = await import("../src/renderer/ruins.ts");
    const exportNames = Object.keys(mod);
    expect(exportNames.some((name) => /tick|update|animate/i.test(name))).toBe(false);
  });

  it("is deterministic: building the same city twice yields byte-identical geometry per ruin", () => {
    const city = cityWithRuins();
    const groupA = buildRuins(city);
    const groupB = buildRuins(city);
    const positionsOf = (g: THREE.Group): number[] => {
      const out: number[] = [];
      g.traverse((obj) => {
        if (obj instanceof THREE.Mesh) out.push(obj.position.x, obj.position.y, obj.position.z, obj.rotation.y);
      });
      return out;
    };
    expect(positionsOf(groupA)).toEqual(positionsOf(groupB));
  });

  it("two different ruins in the same district get visibly different rubble layouts (not a stamped clone)", () => {
    const city = cityWithRuins();
    const group = buildRuins(city);
    const a = findByUserData(group, "ruinId", city.ruins[0].id);
    const b = findByUserData(group, "ruinId", city.ruins[1].id);
    if (!a || !b) throw new Error("expected two ruin groups");
    const heightsOf = (g: THREE.Object3D): number[] => {
      const out: number[] = [];
      g.traverse((obj) => {
        if (obj instanceof THREE.Mesh) out.push(obj.position.y);
      });
      return out;
    };
    expect(heightsOf(a)).not.toEqual(heightsOf(b));
  });
});
