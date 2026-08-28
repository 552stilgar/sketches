// renderer: CityModel.landmarks -> Three.js landmark meshes (V4 contract, CONTRACTS.md § "V4:
// datastores + clone identity").
//
// V4 emits exactly one Landmark.kind: "datastore" (src/types.ts). A datastore's geometry reads
// from Landmark.weight (schema-derived TABLE COUNT -- never a live .db file's size, V4 contract
// D1) and its label from Landmark.label. Static only, same discipline as buildings.ts: every
// decision rule here is a pure function of city.json, no clocks, no randomness.
//
// Discoverability convention (gated by tests/landmarks-render.test.ts): the Object3D representing
// each Landmark must carry `userData.landmarkId === landmark.id` on itself or a descendant --
// mirrors buildDistricts's `name = district:${id}` convention (src/renderer/buildings.ts) so a
// headless check can find a specific landmark without knowing this module's internal geometry.
//
// Implementation lane fills this in (V4 lane, renderer side). src/main.ts already wires this
// module's output into the scene (guarded by a temporary try/catch until this lands -- see the
// comment there).

import * as THREE from "three";
import type { CityModel } from "../types.ts";

export function buildLandmarks(city: CityModel): THREE.Group {
  throw new Error("NotImplemented");
}
