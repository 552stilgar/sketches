// renderer: CityModel.identityLinks -> Three.js CLONE IDENTITY tethers (V4 contract D2 —
// CONTRACTS.md § "V4: datastores + clone identity").
//
// IDENTITY LINKS ARE NOT ROADS. A road means traffic; vendored copies carry ZERO traffic between
// them -- that is the entire finding an identityLink exists to show. Drawing a road (or a
// "bridge") between clones would assert flow that does not exist, violating the never-fabricate
// constraint (PROJECT_IDEA.md 5.5). So a tether gets its own visual channel, deliberately
// distinct from src/renderer/roads.ts's flow-carrying lines:
//   - elevated above road height (roads sit at ROAD_Y = 0.6 in roads.ts)
//   - STATIC -- no dash animation, no per-frame update, no clock read
//   - no dashes at all -- a solid line, visibly not-a-road
//   - an unlit material (MeshBasicMaterial/LineBasicMaterial, no MeshStandardMaterial) -- a
//     tether is a diagram annotation drawn OVER the city, not a physical structure IN it, unlike
//     landmarks.ts's datastore tanks which deliberately DO take scene lighting because they are
//     part of the physical city. That's a second, independent channel (lit vs. unlit) on top of
//     motion and color, so the read holds even in a screenshot with roads paused mid-frame.
// A viewer who sees motion on roads and stillness on tethers learns the difference in one
// glance -- that reading is the whole point of keeping this a separate module rather than a mode
// flag on roads.ts.
//
// For a group with 3+ members (the vendored-kernel shape), this renders one tether SEGMENT per
// adjacent pair in `members` order (already sorted by codepoint, src/types.ts) -- a chain, not a
// synthetic hub-and-spoke, so nothing is drawn that isn't a real (member, member) relationship
// backed by the shared hash.
//
// Discoverability convention (gated by tests/landmarks-render.test.ts): the Object3D representing
// each IdentityLink must carry `userData.identityHash === link.hash` on itself or a descendant --
// same discoverability pattern as landmarks.ts's `userData.landmarkId`. And structurally, per D2:
// no geometry built here may declare the `aOffset` / `aDashPeriod` per-vertex attributes
// src/renderer/roads.ts uses exclusively for its animated dash shader -- a tether that reused them
// would be visually indistinguishable from a road mid-animation, defeating the entire point of
// giving clone identity its own channel.

import * as THREE from "three";
import type { CityModel, IdentityLink } from "../types.ts";

/** Floor for a tether's flat-run height -- comfortably above roads.ts's ROAD_Y (0.6) so the two
 *  channels never visually merge even in a city with no buildings tall enough to force it higher. */
const TETHER_MIN_ELEVATION = 4.5;

/** Extra clearance added above this city's own TALLEST building (see computeTetherElevation) so a
 *  tether's flat run also reads as "above the skyline", not just "above the road plane" -- derived
 *  from city.buildings itself (a real, structural quantity), never a guessed constant, so it stays
 *  correct for any city regardless of how tall its tallest building happens to be. */
const TETHER_ROOFTOP_CLEARANCE = 6;

/** Deterministic, pure function of `city.buildings` -- the elevation every tether in this city
 *  renders its flat run at. Every risers rises TO this height and every horizontal span runs AT
 *  it, so all tethers in one city sit on one flat plane regardless of which two buildings they
 *  connect. */
function computeTetherElevation(city: CityModel): number {
  const tallest = city.buildings.reduce((max, b) => Math.max(max, b.height), 0);
  return Math.max(TETHER_MIN_ELEVATION, tallest + TETHER_ROOFTOP_CLEARANCE);
}

/** Deliberately outside roads.ts's TIER_STYLE palette (cyan 0x8fd0ff .. white 0xffffff) and
 *  landmarks.ts's steel-blue tanks -- a third, unambiguous hue so a tether is never a "duller
 *  road" or a "stray datastore cable", it's its own thing. */
const TETHER_COLOR = 0xffb84d;
const TETHER_OPACITY = 0.85;
const TETHER_NODE_RADIUS = 1.4;

interface ResolvedTetherSegments {
  /** Flat [x,y,z, x,y,z, ...] pairs -- risers (building center -> elevation) and horizontal spans
   *  between adjacent resolvable members. Position-only: no aOffset/aDashPeriod attribute, ever. */
  positions: number[];
  /** One marker per building whose center resolved, at the elevated tether height -- a small,
   *  static anchor ball so the tether visibly terminates ON a specific building rather than
   *  floating unattached. */
  nodes: THREE.Vector3[];
}

/**
 * Builds the static line geometry for one IdentityLink. Walks `members` in order and emits one
 * horizontal span per ADJACENT pair, mirroring buildRoads' per-edge discipline: a pair with either
 * endpoint unresolvable is skipped rather than thrown on (defensive; shouldn't happen post-
 * validateCity, since `members` entries are validated building ids, but `buildingCenter` is a
 * caller-supplied function this module does not control).
 */
function resolveTetherSegments(
  link: IdentityLink,
  buildingCenter: (id: string) => THREE.Vector3 | null,
  elevation: number,
): ResolvedTetherSegments {
  const positions: number[] = [];
  const nodes: THREE.Vector3[] = [];
  const riserDrawn = new Set<string>();

  function ensureRiser(id: string, base: THREE.Vector3): void {
    if (riserDrawn.has(id)) return;
    riserDrawn.add(id);
    positions.push(base.x, base.y, base.z, base.x, elevation, base.z);
    nodes.push(new THREE.Vector3(base.x, elevation, base.z));
  }

  for (let i = 0; i < link.members.length - 1; i++) {
    const fromId = link.members[i];
    const toId = link.members[i + 1];
    const from = buildingCenter(fromId);
    const to = buildingCenter(toId);
    if (!from || !to) continue;

    ensureRiser(fromId, from);
    ensureRiser(toId, to);
    positions.push(from.x, elevation, from.z, to.x, elevation, to.z);
  }

  return { positions, nodes };
}

/**
 * Builds one tagged Object3D per IdentityLink -- present even when none of its members' centers
 * resolve (defensive callers may pass a lookup that returns null for everything; the group still
 * exists and is still discoverable, it just has no geometry inside it).
 */
export function buildTethers(
  city: CityModel,
  buildingCenter: (id: string) => THREE.Vector3 | null,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "tethers";

  const elevation = computeTetherElevation(city);

  const material = new THREE.LineBasicMaterial({
    color: TETHER_COLOR,
    transparent: true,
    opacity: TETHER_OPACITY,
  });
  const nodeMaterial = new THREE.MeshBasicMaterial({ color: TETHER_COLOR });
  const nodeGeometry = new THREE.SphereGeometry(TETHER_NODE_RADIUS, 12, 8);

  for (const link of city.identityLinks as IdentityLink[]) {
    const linkGroup = new THREE.Group();
    linkGroup.name = `tether:${link.hash}`;
    linkGroup.userData.identityHash = link.hash;

    const { positions, nodes } = resolveTetherSegments(link, buildingCenter, elevation);

    if (positions.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
      const line = new THREE.LineSegments(geometry, material);
      linkGroup.add(line);
    }

    for (const node of nodes) {
      const marker = new THREE.Mesh(nodeGeometry, nodeMaterial);
      marker.position.copy(node);
      linkGroup.add(marker);
    }

    group.add(linkGroup);
  }

  return group;
}
