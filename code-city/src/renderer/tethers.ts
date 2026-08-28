// renderer: CityModel.identityLinks -> Three.js CLONE IDENTITY tethers (V4 contract D2 —
// CONTRACTS.md § "V4: datastores + clone identity").
//
// IDENTITY LINKS ARE NOT ROADS. A road means traffic; vendored copies carry ZERO traffic between
// them -- that is the entire finding an identityLink exists to show. Drawing a road (or a
// "bridge") between clones would assert flow that does not exist, violating the never-fabricate
// constraint (PROJECT_IDEA.md 5.5). So a tether gets its own visual channel, deliberately
// distinct from src/renderer/roads.ts's flow-carrying lines:
//   - elevated above road height (roads sit at ROAD_Y in roads.ts)
//   - STATIC -- no dash animation, no per-frame update, no clock read
//   - no dashes at all -- a solid line, visibly not-a-road
// A viewer who sees motion on roads and stillness on tethers learns the difference in one
// glance -- that reading is the whole point of keeping this a separate module rather than a mode
// flag on roads.ts.
//
// For a group with 3+ members (the vendored-kernel shape), render one tether per adjacent pair
// in `members` order (already sorted by codepoint, src/types.ts) -- implementation lane's exact
// choice to document once made; a star topology from a synthetic hub is an alternative worth
// considering but must not fabricate a "hub" building that isn't one of the members.
//
// Discoverability convention (gated by tests/landmarks-render.test.ts): the Object3D representing
// each IdentityLink must carry `userData.identityHash === link.hash` on itself or a descendant --
// same discoverability pattern as landmarks.ts's `userData.landmarkId`. And structurally, per D2:
// no geometry built here may declare the `aOffset` / `aDashPeriod` per-vertex attributes
// src/renderer/roads.ts uses exclusively for its animated dash shader -- a tether that reused them
// would be visually indistinguishable from a road mid-animation, defeating the entire point of
// giving clone identity its own channel.
//
// Implementation lane fills this in (V4 lane, renderer side). src/main.ts already wires this
// module's output into the scene (guarded by a temporary try/catch until this lands -- see the
// comment there).

import * as THREE from "three";
import type { CityModel } from "../types.ts";

export function buildTethers(
  city: CityModel,
  buildingCenter: (id: string) => THREE.Vector3 | null,
): THREE.Group {
  throw new Error("NotImplemented");
}
