// renderer: CityModel.ruins -> Three.js RUIN markers (V5.3b — renderer placement half,
// docs/CONTRACT-city-json.md § "Ruins placement (V5.3b)" / CONTRACTS.md § "V5.3b").
//
// WHY THIS IS NOT src/renderer/props.ts's PropSpec/buildProps VOCABULARY:
// props.ts's cranes/scaffolds are a RUNTIME OVERLAY computed from `city.buildings` at load time
// (percentile churn rank, `metrics.newestAge`) and are NEVER part of `CityModel` at all (see that
// module's own header). A ruin has the opposite shape: it IS a first-class `CityModel` field,
// compiled once by `compileCity` (src/compiler/index.ts) from `RepoGraph.ruins`, with its own
// `x`/`y`/`width`/`depth` already resolved — the same architectural slot `landmarks.ts` occupies
// for `city.landmarks`, not the one `props.ts` occupies for buildings. A ruin also has no anchor
// building to stand beside (the file it marks no longer exists), so it cannot be expressed as a
// `PropSpec` (every variant of which is keyed by `buildingId`) without inventing an anchor that
// isn't there. `landmarks.ts` is the correct precedent; this module mirrors its shape (one tagged
// Object3D per city.json array entry, static, lit, its own hue) rather than forking props.ts.
//
// A RUIN MUST NEVER READ AS A LIVE BUILDING, AT ANY CAMERA DISTANCE (same discipline
// tethers.ts's header states for "never a road"):
//   - SHORT. Every building in this city stands at least HEIGHT_MIN = 4 world units tall
//     (docs/CONTRACT-city-json.md "Urban grammar"); every rubble stub here is capped at
//     RUIN_MAX_HEIGHT, well under that floor, so a ruin can never even momentarily silhouette as
//     a very small building.
//   - JAGGED, NOT BOXY. buildings.ts's four style profiles are all one uninterrupted (or
//     stepped/pitched-capped) rectangular extrusion. A ruin is a scatter of independently-sized,
//     independently-rotated broken stubs over a sunken foundation slab — a silhouette none of
//     those four profiles can produce, the same "different primitive vocabulary" discipline
//     landmarks.ts's cylinder-plus-dome uses against the same four profiles.
//   - A FOURTH-AND-A-HALF HUE. Ash/charcoal: low saturation, LOW lightness — buildings.ts's
//     `buildingColor` never goes below ~0.42 lightness pre-bias (STYLE_HUES + hashUnit jitter),
//     landmarks.ts's steel-blue tank sits at 0.55, tethers.ts's amber at ~0.5, props.ts's
//     safety-yellow crane at 0.5 and mid-grey scaffold frame at 0.55. This module's charcoal sits
//     at 0.16 — darker than every one of those by a wide, deliberate margin, so a ruin never
//     reads as "a dim building" or "a duller version of X" the way a fifth similarly-lit hue
//     eventually would.
//   - LIT, LIKE A PHYSICAL OBJECT (MeshStandardMaterial, scene lighting) — distinguishing it from
//     tethers.ts's unlit diagram lines the other direction: a ruin sits ON THE GROUND as part of
//     the physical city (like a building or a landmark), it is not an annotation drawn over it.
//
// DETERMINISM: every dimension here is either a fixed constant or a pure hash of the ruin's own
// `id` (FNV-1a-style, same algorithm family `src/compiler/layout.ts`'s `hashFraction` and
// `buildings.ts`'s `hashUnit` already use for this exact purpose — a stable pseudo-random
// fraction from a string, no clock, no `Math.random()`). Static geometry only: no per-frame
// update or tick hook is registered or exported anywhere in this module, same posture
// props.ts's buildProps documents for its own output.

import * as THREE from "three";
import type { CityModel, RuinMarker } from "../types.ts";

function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// Ash/charcoal -- see module header for why this sits well below every other hue's lightness.
const RUIN_FOUNDATION_COLOR = new THREE.Color().setHSL(0.06, 0.1, 0.1);
const RUIN_RUBBLE_COLOR = new THREE.Color().setHSL(0.07, 0.12, 0.16);
const RUIN_MATERIAL_PARAMS = { roughness: 0.95, metalness: 0.05 } as const;

/** How far below the ground plane the foundation slab sinks -- a shallow depression, reading as
 *  "what's left of a footing" rather than a raised platform (which would start to compete with a
 *  building's own base). */
const RUIN_FOUNDATION_DEPTH = 0.3;

/** Hard cap on any rubble stub's height -- see module header's "SHORT" bullet: well under
 *  `HEIGHT_MIN = 4` (docs/CONTRACT-city-json.md "Urban grammar"), the shortest any real building
 *  ever renders, so a ruin can never be mistaken for one even at its tallest. */
const RUIN_MAX_HEIGHT = 2.2;
const RUIN_MIN_HEIGHT = 0.4;

/** Fixed count of rubble stubs per ruin -- not derived from any measurement (there is none to
 *  derive it from; see RuinMarker's doc comment on why `lastLoc` never feeds geometry), just
 *  enough to read as "broken debris" rather than a single block. */
const RUBBLE_STUB_COUNT = 5;

/**
 * One ruin's static geometry: a sunken foundation slab spanning its full footprint, plus
 * `RUBBLE_STUB_COUNT` independently-sized, independently-rotated broken stubs scattered inside
 * it. Every stub's position/size/rotation is a pure hash of `ruin.id` and its own index -- same
 * ruin, same city, same geometry, always (DETERMINISM, module header).
 */
function buildRuinMeshes(ruin: RuinMarker): THREE.Object3D[] {
  const meshes: THREE.Object3D[] = [];
  const foundationMaterial = new THREE.MeshStandardMaterial({
    color: RUIN_FOUNDATION_COLOR,
    ...RUIN_MATERIAL_PARAMS,
  });

  const foundation = new THREE.Mesh(
    new THREE.BoxGeometry(ruin.width, RUIN_FOUNDATION_DEPTH, ruin.depth),
    foundationMaterial,
  );
  foundation.position.set(ruin.width / 2, -RUIN_FOUNDATION_DEPTH / 2, ruin.depth / 2);
  foundation.receiveShadow = true;
  meshes.push(foundation);

  const rubbleMaterial = new THREE.MeshStandardMaterial({ color: RUIN_RUBBLE_COLOR, ...RUIN_MATERIAL_PARAMS });
  for (let i = 0; i < RUBBLE_STUB_COUNT; i++) {
    const seed = `${ruin.id}#${i}`;
    // Positions kept inset from the footprint's own edge (10%-90% of each span) so no stub ever
    // pokes past the foundation it's sitting on.
    const px = ruin.width * (0.1 + 0.8 * hashUnit(`${seed}:x`));
    const pz = ruin.depth * (0.1 + 0.8 * hashUnit(`${seed}:z`));
    const height = RUIN_MIN_HEIGHT + (RUIN_MAX_HEIGHT - RUIN_MIN_HEIGHT) * hashUnit(`${seed}:h`);
    const stubWidth = Math.max(0.3, Math.min(ruin.width, ruin.depth) * (0.12 + 0.1 * hashUnit(`${seed}:w`)));
    const tilt = (hashUnit(`${seed}:tilt`) - 0.5) * 0.5; // radians, a broken-not-plumb lean
    const rotationY = hashUnit(`${seed}:rot`) * Math.PI * 2;

    const stub = new THREE.Mesh(new THREE.BoxGeometry(stubWidth, height, stubWidth), rubbleMaterial);
    stub.position.set(px, height / 2, pz);
    stub.rotation.y = rotationY;
    stub.rotation.x = tilt;
    stub.castShadow = true;
    meshes.push(stub);
  }

  return meshes;
}

/**
 * Builds one tagged, STATIC Object3D per RuinMarker. No clock is read, no per-frame update is
 * registered or exported (mirrors props.ts's buildProps discipline, module header).
 *
 * Discoverability convention (same as landmarks.ts's `userData.landmarkId` / tethers.ts's
 * `userData.identityHash` / props.ts's `userData.buildingId`): the Object3D for each ruin carries
 * `userData.ruinId` on itself.
 */
export function buildRuins(city: CityModel): THREE.Group {
  const group = new THREE.Group();
  group.name = "ruins";

  for (const ruin of (city.ruins ?? []) as RuinMarker[]) {
    const ruinGroup = new THREE.Group();
    ruinGroup.name = `ruin:${ruin.id}`;
    ruinGroup.userData.ruinId = ruin.id;
    ruinGroup.position.set(ruin.x, 0, ruin.y);

    for (const mesh of buildRuinMeshes(ruin)) ruinGroup.add(mesh);

    group.add(ruinGroup);
  }

  return group;
}
