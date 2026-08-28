// RED — buildLandmarks (src/renderer/landmarks.ts) and buildTethers (src/renderer/tethers.ts)
// both throw NotImplemented today. Turns GREEN once the V4 renderer lane implements both
// (CONTRACTS.md § "V4: datastores + clone identity", D1/D2).
//
// Conventions this RED gate holds the implementation lane to, so a headless check (and this test
// file) can find what got built without depending on exact geometry choices:
//   - buildLandmarks: one Object3D per Landmark, discoverable via `userData.landmarkId ===
//     landmark.id` on some descendant of the returned group -- same discoverability pattern
//     buildDistricts (src/renderer/buildings.ts) already uses via its `name = district:${id}`.
//   - buildTethers: one Object3D per IdentityLink, discoverable via `userData.identityHash ===
//     link.hash` -- and, per D2 ("IDENTITY LINKS ARE NOT ROADS"), its geometry must NOT carry the
//     `aOffset`/`aDashPeriod` per-vertex attributes src/renderer/roads.ts uses exclusively for
//     animated flow. A tether that reused those would be visually indistinguishable from a road
//     mid-animation, which is exactly the confusion D2 exists to prevent.
//
// THREE's core data classes (Group, BufferGeometry, LineSegments) construct fine outside a
// browser -- only WebGLRenderer needs a real canvas, and neither function under test touches one
// (same discipline as tests/road-flow.test.ts and tests/buildings.test.ts).

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import * as THREE from "three";
import { buildLandmarks } from "../src/renderer/landmarks.ts";
import { buildTethers } from "../src/renderer/tethers.ts";
import type { CityModel } from "../src/types.ts";

const MOCK_V4_PATH = fileURLToPath(new URL("../fixtures/mock-city-v4.json", import.meta.url));

function loadMockCityV4(): CityModel {
  return JSON.parse(readFileSync(MOCK_V4_PATH, "utf-8")) as CityModel;
}

function emptyCity(): CityModel {
  return { districts: [], buildings: [], roads: [], landmarks: [], identityLinks: [] };
}

function findByUserData<T extends string>(
  root: THREE.Object3D,
  key: "landmarkId" | "identityHash",
  value: T,
): THREE.Object3D | undefined {
  let found: THREE.Object3D | undefined;
  root.traverse((obj) => {
    if (!found && obj.userData[key] === value) found = obj;
  });
  return found;
}

function collectAttributeNames(root: THREE.Object3D): Set<string> {
  const names = new Set<string>();
  root.traverse((obj) => {
    const geometry = (obj as THREE.Line | THREE.LineSegments).geometry as THREE.BufferGeometry | undefined;
    if (geometry?.attributes) {
      for (const name of Object.keys(geometry.attributes)) names.add(name);
    }
  });
  return names;
}

describe("buildLandmarks (RED until the V4 renderer lane lands)", () => {
  it("returns an empty group for a city with no landmarks", () => {
    const group = buildLandmarks(emptyCity());
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(0);
  });

  it("produces a discoverable object per landmark, tagged with userData.landmarkId", () => {
    const city = loadMockCityV4();
    const group = buildLandmarks(city);
    expect(city.landmarks.length).toBeGreaterThan(0);
    for (const landmark of city.landmarks) {
      const found = findByUserData(group, "landmarkId", landmark.id);
      expect(found, `no object tagged landmarkId="${landmark.id}"`).toBeDefined();
    }
  });

  it("only emits objects for the datastore kind V4 defines -- never fabricates a landmark for an unlisted kind", () => {
    const city: CityModel = {
      ...emptyCity(),
      landmarks: [{ id: "lm-1", x: 10, y: 10, kind: "datastore", label: "test-db", weight: 3 }],
    };
    const group = buildLandmarks(city);
    expect(findByUserData(group, "landmarkId", "lm-1")).toBeDefined();
  });
});

describe("buildTethers (RED until the V4 renderer lane lands)", () => {
  function centerFor(city: CityModel): (id: string) => THREE.Vector3 | null {
    const centers = new Map<string, THREE.Vector3>();
    city.buildings.forEach((b, i) => centers.set(b.id, new THREE.Vector3(i * 10, b.height, 0)));
    return (id) => centers.get(id) ?? null;
  }

  it("returns an empty group for a city with no identityLinks", () => {
    const group = buildTethers(emptyCity(), () => null);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.children.length).toBe(0);
  });

  it("produces a discoverable object per identityLink, tagged with userData.identityHash", () => {
    const city = loadMockCityV4();
    const group = buildTethers(city, centerFor(city));
    expect(city.identityLinks.length).toBeGreaterThan(0);
    for (const link of city.identityLinks) {
      const found = findByUserData(group, "identityHash", link.hash);
      expect(found, `no object tagged identityHash="${link.hash}"`).toBeDefined();
    }
  });

  it("D2: never reuses roads.ts's animated-flow vertex attributes (aOffset/aDashPeriod) -- tethers are static", () => {
    const city = loadMockCityV4();
    const group = buildTethers(city, centerFor(city));
    const attrs = collectAttributeNames(group);
    expect(attrs.has("aOffset")).toBe(false);
    expect(attrs.has("aDashPeriod")).toBe(false);
  });

  it("skips a member whose building center is unresolvable rather than throwing (defensive, mirrors buildRoads)", () => {
    const city: CityModel = {
      ...emptyCity(),
      identityLinks: [{ hash: "b3f18e5c4d81d174d23a50d2b899c018af158709b1303d7613d676fb045c781e", members: ["a", "b"] }],
    };
    expect(() => buildTethers(city, () => null)).not.toThrow();
  });
});
