// The property the whole lens feature exists for (docs/PROJECT_IDEA.md §5.3): "switching a lens
// changes materials / colour / height scaling ONLY -- never layout." A viewer learns spatial
// landmarks under one lens and must be able to rely on them under every other lens.
//
// This asserts it against the ACTUAL Three.js instance data buildBuildings()/setLens() produce,
// not just against the pure lens-math functions in lenses.ts -- the real risk is a wiring bug in
// buildings.ts (e.g. scaling X/Z along with Y) that the pure math tests in tests/lenses.test.ts
// can't see.

import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { buildBuildings } from "../src/renderer/buildings.ts";
import { LENSES } from "../src/renderer/lenses.ts";
import { validateCity } from "../src/types.ts";
import type { CityModel } from "../src/types.ts";

// buildBuildings() also builds district LABEL SPRITES (buildDistricts -> makeLabelSprite), which
// draws to a real <canvas> -- irrelevant to what this file checks (footprint/height lock) but
// requires *a* DOM in scope. This project's test env is plain node (no jsdom dependency), so this
// is the smallest possible stand-in: just enough of `document.createElement("canvas")` for
// makeLabelSprite's 2D-context calls to no-op successfully. Test-only; never shipped.
function installMinimalCanvasStub(): void {
  if (typeof (globalThis as any).document !== "undefined") return;
  const ctx2d = {
    clearRect() {},
    fillRect() {},
    fillText() {},
    font: "",
    textAlign: "",
    textBaseline: "",
    fillStyle: "",
  };
  const fakeCanvas = {
    width: 0,
    height: 0,
    getContext: () => ctx2d,
  };
  (globalThis as any).document = {
    createElement(tag: string) {
      if (tag === "canvas") return fakeCanvas;
      throw new Error(`installMinimalCanvasStub: unsupported tag "${tag}"`);
    },
  };
}

const MOCK_CITY_PATH = fileURLToPath(new URL("../fixtures/mock-city.json", import.meta.url));

function loadCity(): CityModel {
  const city = JSON.parse(readFileSync(MOCK_CITY_PATH, "utf-8")) as CityModel;
  const check = validateCity(city);
  if (!check.ok) throw new Error(`fixtures/mock-city.json is not a valid CityModel: ${check.errors.join("; ")}`);
  return city;
}

/** Reads back (worldX, worldZ, scaleY) for one instance from its InstancedMesh matrix. */
function readInstance(mesh: THREE.InstancedMesh, index: number): { x: number; z: number; scaleY: number } {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(index, m);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  return { x: pos.x, z: pos.z, scaleY: scale.y };
}

function snapshotFootprints(handle: ReturnType<typeof buildBuildings>, city: CityModel): Map<string, { x: number; z: number }> {
  const byId = new Map<string, { x: number; z: number }>();
  for (const b of city.buildings) {
    const entry = findInstance(handle, b.id);
    if (!entry) throw new Error(`no instance for building ${b.id}`);
    const { x, z } = readInstance(entry.mesh, entry.index);
    byId.set(b.id, { x, z });
  }
  return byId;
}

// buildBuildings() doesn't expose the raw (mesh,index) map, so re-derive it the same way
// resolveBuildingId does (via meshes + buildingById), which is exactly what a real raycast
// consumer relies on too -- proves the lock using the public contract, not an internal.
function findInstance(
  handle: ReturnType<typeof buildBuildings>,
  id: string,
): { mesh: THREE.InstancedMesh; index: number } | null {
  for (const mesh of handle.meshes) {
    const count = mesh.count;
    for (let i = 0; i < count; i++) {
      if (handle.resolveBuildingId(mesh, i) === id) return { mesh, index: i };
    }
  }
  return null;
}

describe("lens position lock", () => {
  beforeAll(() => installMinimalCanvasStub());

  const city = loadCity();

  it("every lens keeps every building's X/Z footprint identical to Architecture's", () => {
    const handle = buildBuildings(city);
    const baseline = snapshotFootprints(handle, city);

    for (const lens of LENSES) {
      handle.setLens(lens.id);
      const snapshot = snapshotFootprints(handle, city);
      for (const b of city.buildings) {
        const base = baseline.get(b.id)!;
        const cur = snapshot.get(b.id)!;
        expect(cur.x).toBeCloseTo(base.x, 9);
        expect(cur.z).toBeCloseTo(base.z, 9);
      }
    }
  });

  it("complexity and activity DO change height scale for at least one building relative to " +
    "architecture -- proves the lens is actually doing something, not just a no-op", () => {
    const handle = buildBuildings(city);
    const archScales = new Map<string, number>();
    for (const b of city.buildings) {
      const entry = findInstance(handle, b.id)!;
      archScales.set(b.id, readInstance(entry.mesh, entry.index).scaleY);
    }

    for (const lensId of ["complexity", "activity"] as const) {
      handle.setLens(lensId);
      let anyChanged = false;
      for (const b of city.buildings) {
        const entry = findInstance(handle, b.id)!;
        const scaleY = readInstance(entry.mesh, entry.index).scaleY;
        if (Math.abs(scaleY - archScales.get(b.id)!) > 1e-6) anyChanged = true;
      }
      expect(anyChanged).toBe(true);
    }
  });

  it("buildingCenter() (used by roads/camera framing) is unaffected by the active lens", () => {
    const handle = buildBuildings(city);
    const before = new Map(city.buildings.map((b) => [b.id, handle.buildingCenter(b.id)!.clone()]));
    handle.setLens("complexity");
    for (const b of city.buildings) {
      const c = handle.buildingCenter(b.id)!;
      const prev = before.get(b.id)!;
      expect(c.x).toBeCloseTo(prev.x, 9);
      expect(c.y).toBeCloseTo(prev.y, 9);
      expect(c.z).toBeCloseTo(prev.z, 9);
    }
  });

  it("currentLens() reflects the most recent setLens() call, defaulting to architecture", () => {
    const handle = buildBuildings(city);
    expect(handle.currentLens()).toBe("architecture");
    handle.setLens("quality");
    expect(handle.currentLens()).toBe("quality");
  });
});
