// renderer: base Three.js scene setup — camera, lights, ground plane, OrbitControls, render loop.
//
// Deliberately dumb: knows nothing about CityModel *rendering* (buildings.ts / roads.ts / ui.ts
// populate the scene this module hands back) — but it DOES read CityModel's raw geometry fields
// (building x/y/width/depth/height, landmark x/y) once, at creation time, purely to fit the
// camera to what this particular city actually contains. See "Camera framing" below.

import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Building, CityModel, Landmark } from "../types.ts";

// ---------------------------------------------------------------------------------------------
// Camera framing — pure, unit-tested directly (tests/camera-framing.test.ts). Three.js code
// below (createScene) is a thin consumer: it calls computeCityBounds/computeCameraFraming and
// applies the result to camera.position / controls.target / the shadow frustum. It must not
// encode any framing decision of its own beyond "apply this Vec3 to that THREE.Vector3", same
// discipline as roads.ts's split between computeRoadTierBoundaries/roadTier and buildRoads.
//
// Why this exists (measured defect, 2026-08-28): scene.ts used to place the camera at a FIXED
// offset off a constant CANVAS_SIZE, regardless of what the city contained. District footprints
// are squarified into a fixed 1000x1000 canvas (src/compiler/index.ts) so X/Z bounds don't vary
// much, but building HEIGHT is unbounded and content-driven -- a city of many short buildings put
// the fixed camera near-overhead and too close (unreadable soup on first frame); a city of fewer,
// taller buildings put the same fixed camera INSIDE a block, at rooftop height, near-clipping
// through geometry. Both are the same bug: the camera never looked at the data.
// ---------------------------------------------------------------------------------------------

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface CityBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/** Half-extent (each axis) used for an empty city -- no buildings, no landmarks. Keeps the camera
 *  and shadow frustum sane rather than framing a zero-size box at the origin. Arbitrary but small,
 *  on the scale of a single building footprint. */
const EMPTY_CITY_HALF_EXTENT = 20;

/**
 * Bounding box over every building (footprint x/y/width/depth, height 0..b.height) and every
 * landmark (a point at x/y, ground level) in the city -- world space, matching the exact
 * coordinate convention buildings.ts uses to place InstancedMesh instances (cx = b.x + b.width/2,
 * cz = b.y + b.depth/2, height 0..b.height) so this never drifts from what actually gets
 * rendered. Landmarks carry no width/depth/height in the V4 type (src/types.ts), so they
 * contribute a single ground-level point -- correct today, and still correct once landmarks.ts
 * gives them physical geometry, since that geometry will itself sit within the building bounds in
 * practice (a datastore landmark widens the box by at most its own footprint, never shrinks it).
 *
 * Pure: no clock, no randomness, no I/O (constraint 1). Deterministic for a given city.
 */
export function computeCityBounds(
  city: Pick<CityModel, "buildings" | "landmarks">,
): CityBounds {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  let any = false;

  for (const b of (city.buildings as Building[]) ?? []) {
    any = true;
    minX = Math.min(minX, b.x);
    maxX = Math.max(maxX, b.x + b.width);
    minZ = Math.min(minZ, b.y);
    maxZ = Math.max(maxZ, b.y + b.depth);
    minY = Math.min(minY, 0);
    maxY = Math.max(maxY, b.height);
  }

  for (const l of (city.landmarks as Landmark[]) ?? []) {
    any = true;
    minX = Math.min(minX, l.x);
    maxX = Math.max(maxX, l.x);
    minZ = Math.min(minZ, l.y);
    maxZ = Math.max(maxZ, l.y);
    minY = Math.min(minY, 0);
    maxY = Math.max(maxY, 0);
  }

  if (!any) {
    return {
      minX: -EMPTY_CITY_HALF_EXTENT,
      maxX: EMPTY_CITY_HALF_EXTENT,
      minY: 0,
      maxY: EMPTY_CITY_HALF_EXTENT,
      minZ: -EMPTY_CITY_HALF_EXTENT,
      maxZ: EMPTY_CITY_HALF_EXTENT,
    };
  }
  return { minX, maxX, minY, maxY, minZ, maxZ };
}

/** Floor on the bounding sphere radius used for framing -- keeps a single building, or a city
 *  whose contents all sit at one point, from collapsing the camera distance to (near) zero. */
const MIN_FIT_RADIUS = 12;

/** Multiplies the tight-fit distance so the city has breathing room instead of touching the
 *  frustum edges -- "small margin", not "as close as physically fits". */
const FIT_MARGIN = 1.25;

/** Fixed oblique viewing direction (unit vector): a 3/4 "skyline" angle, not top-down -- roughly
 *  the same character the old fixed offset (CANVAS_SIZE * 0.65, 0.55, 0.65) aimed for, but now a
 *  direction applied relative to the CITY'S OWN bounds rather than a hardcoded canvas constant. */
const OBLIQUE_DIRECTION: Vec3 = normalizeVec3({ x: 1, y: 0.82, z: 1 });

function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (!Number.isFinite(len) || len === 0) return { x: 0, y: 1, z: 0 };
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/** World-up reference used to build the camera's right/up basis for OBLIQUE_DIRECTION -- not a
 *  framing decision, just the axis "up" means before the oblique tilt is applied. */
const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };

export interface CameraFraming {
  /** Orbit target -- the bounds' true center (x/y/z), so orbiting pivots around the city, not the
   *  world origin. */
  target: Vec3;
  /** Camera world position: target + OBLIQUE_DIRECTION * fitted distance. */
  position: Vec3;
  /** Bounding-sphere radius actually used (post-floor) -- exposed so the shadow frustum can be
   *  sized from the same number the camera was, instead of recomputing it. */
  radius: number;
}

/**
 * Places a camera so `bounds` is fully framed at `fovDegrees` (vertical) / the derived horizontal
 * FOV (from `aspect`), at a fixed oblique angle (OBLIQUE_DIRECTION). Fits the bounding BOX, not an
 * enclosing sphere: a code-city is a wide, shallow slab (~1000x1000 ground plate, short buildings),
 * so its bounding sphere has a radius on the order of the ground diagonal even though almost none
 * of that sphere's volume is occupied -- sizing distance off the sphere put the city at ~30% of
 * the frame with empty background filling the rest (measured in-browser, 2026-08-30). Projecting
 * the box's own extent onto the camera's view axes instead means distance tracks what the city
 * actually occupies.
 *
 * Method: build an orthonormal camera basis (forward = -OBLIQUE_DIRECTION, right, up) via
 * WORLD_UP; project each of the box's 8 corners (relative to center) onto that basis to get a
 * horizontal offset, vertical offset, and depth-along-forward for each corner; for a corner to
 * land inside the frustum at a given camera distance D, its depth-from-camera (D + itsForwardOffset)
 * must be >= |itsHorizontalOffset| / tan(hFov/2) and >= |itsVerticalOffset| / tan(vFov/2) -- solve
 * each corner/axis pair for the minimum D that satisfies it, take the max over all 8 corners and
 * both axes, then apply FIT_MARGIN for breathing room. This is exact for a box (unlike the sphere
 * approximation) and degrades gracefully to the same "corner at the center" case for a zero-size
 * box.
 *
 * `radius` (half the box diagonal, floored at MIN_FIT_RADIUS) is kept as an output -- callers use
 * it to size the shadow frustum, ground plane, and fog independently of the box-fit distance -- and
 * the same floor doubles as the minimum camera distance, so a zero-size or single-point box still
 * produces a sane, non-zero distance instead of "fit a point" collapsing toward zero.
 *
 * Degenerate-safe by construction: `aspect` <= 0 or non-finite falls back to 1 (square); the
 * MIN_FIT_RADIUS floor on distance means it is always > 0 -- no NaN, no divide-by-zero, for any
 * bounds input including a zero-size box (city.buildings all at one point) or an empty city.
 */
export function computeCameraFraming(
  bounds: CityBounds,
  aspect: number,
  fovDegrees = 55,
): CameraFraming {
  const center: Vec3 = {
    x: (bounds.minX + bounds.maxX) / 2,
    y: (bounds.minY + bounds.maxY) / 2,
    z: (bounds.minZ + bounds.maxZ) / 2,
  };
  const sizeX = bounds.maxX - bounds.minX;
  const sizeY = bounds.maxY - bounds.minY;
  const sizeZ = bounds.maxZ - bounds.minZ;
  const diagonal = Math.sqrt(sizeX * sizeX + sizeY * sizeY + sizeZ * sizeZ);
  const radius = Math.max(MIN_FIT_RADIUS, diagonal / 2);

  const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const vFov = (THREE.MathUtils.clamp(fovDegrees, 1, 179) * Math.PI) / 180;
  const hFov = 2 * Math.atan(Math.tan(vFov / 2) * safeAspect);
  const tanH = Math.max(1e-4, Math.tan(hFov / 2));
  const tanV = Math.max(1e-4, Math.tan(vFov / 2));

  // Camera basis for the fixed oblique direction: forward looks FROM the camera TOWARD the city
  // (opposite OBLIQUE_DIRECTION, since the camera sits at center + OBLIQUE_DIRECTION * distance).
  const forward = normalizeVec3({
    x: -OBLIQUE_DIRECTION.x,
    y: -OBLIQUE_DIRECTION.y,
    z: -OBLIQUE_DIRECTION.z,
  });
  // WORLD_UP is never parallel to `forward` for the fixed OBLIQUE_DIRECTION (it has nonzero X/Z),
  // so `right` never degenerates to zero here -- no fallback basis needed for this fixed direction.
  const right = normalizeVec3(crossVec3(forward, WORLD_UP));
  const up = crossVec3(right, forward); // already unit length: right and forward are orthonormal

  const halfX = sizeX / 2;
  const halfY = sizeY / 2;
  const halfZ = sizeZ / 2;

  let rawDistance = 0;
  for (const sx of [-1, 1]) {
    for (const sy of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const corner: Vec3 = { x: sx * halfX, y: sy * halfY, z: sz * halfZ };
        const horizontalOffset = dotVec3(corner, right);
        const verticalOffset = dotVec3(corner, up);
        const forwardOffset = dotVec3(corner, forward);
        // distance D such that (D + forwardOffset) == |offset| / tan(halfFov) -- the depth at
        // which this corner sits exactly on the frustum edge for that axis.
        const neededByH = Math.abs(horizontalOffset) / tanH - forwardOffset;
        const neededByV = Math.abs(verticalOffset) / tanV - forwardOffset;
        rawDistance = Math.max(rawDistance, neededByH, neededByV);
      }
    }
  }
  const distance = Math.max(MIN_FIT_RADIUS, rawDistance) * FIT_MARGIN;

  const position: Vec3 = {
    x: center.x + OBLIQUE_DIRECTION.x * distance,
    y: center.y + OBLIQUE_DIRECTION.y * distance,
    z: center.z + OBLIQUE_DIRECTION.z * distance,
  };

  return { target: center, position, radius };
}

// ---------------------------------------------------------------------------------------------
// Three.js consumer
// ---------------------------------------------------------------------------------------------

export interface SceneHandle {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  /** The framing computed for this city at creation time -- exposed so main.ts can put it on the
   *  window.__test bridge without recomputing it (and without this module reaching back into
   *  main.ts). Not recomputed on resize (see handleResize doc). */
  framing: CameraFraming;
  bounds: CityBounds;
  /** Call once per frame from an external loop. */
  render(): void;
  /** Keeps camera aspect / renderer size in sync with the container element. Does NOT recompute
   *  framing or move the camera -- a resize mid-session must not fight whatever orbit position the
   *  user has already navigated to. */
  handleResize(): void;
}

const GROUND_MARGIN_FACTOR = 3; // ground plane spans this many bounds-radii beyond the fit, so
                                  // the city never floats visibly at its own edge.

export function createScene(container: HTMLElement, city: CityModel): SceneHandle {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b1020);

  const bounds = computeCityBounds(city);
  const aspect = container.clientWidth / Math.max(1, container.clientHeight);
  const framing = computeCameraFraming(bounds, aspect);

  // Fog reaches proportionally further than the fit distance so the far side of a large city
  // doesn't dissolve before the camera has finished framing it.
  scene.fog = new THREE.Fog(0x0b1020, framing.radius * 6, framing.radius * 18);

  const camera = new THREE.PerspectiveCamera(55, aspect, 0.1, Math.max(5000, framing.radius * 20));
  camera.position.set(framing.position.x, framing.position.y, framing.position.z);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth, container.clientHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);

  // Ground plane, centered on the bounds' own X/Z center (not a hardcoded canvas half-point) and
  // sized off the fitted radius so it always reaches well beyond the city regardless of scale.
  const groundHalf = framing.radius * GROUND_MARGIN_FACTOR;
  const groundGeo = new THREE.PlaneGeometry(groundHalf * 2, groundHalf * 2);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x141a2e, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(framing.target.x, 0, framing.target.z);
  ground.receiveShadow = true;
  ground.name = "ground";
  scene.add(ground);

  const hemi = new THREE.HemisphereLight(0x8fb0ff, 0x1a1420, 0.65);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff2e0, 1.1);
  // Positioned relative to the bounds center at a scale proportional to the fitted radius --
  // same directional character as the old CANVAS_SIZE-scaled offset, now content-sized.
  sun.position.set(
    framing.target.x + framing.radius * 0.8,
    framing.target.y + framing.radius * 1.8,
    framing.target.z + framing.radius * 0.4,
  );
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  // Shadow frustum sized off the fitted bounds radius, not a fixed CANVAS_SIZE multiple -- a
  // shadow camera built for a 1000-unit canvas was wasting most of its 2048x2048 resolution on a
  // small city (task 3). Centered on the bounds' own X/Z center; margin keeps buildings near the
  // fit's edge from losing their shadow.
  const shadowHalf = framing.radius * 2;
  sun.shadow.camera.left = -shadowHalf;
  sun.shadow.camera.right = shadowHalf;
  sun.shadow.camera.top = shadowHalf;
  sun.shadow.camera.bottom = -shadowHalf;
  sun.shadow.camera.near = 0.1;
  sun.shadow.camera.far = framing.radius * 6;
  scene.add(sun);

  const ambient = new THREE.AmbientLight(0x404060, 0.4);
  scene.add(ambient);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(framing.target.x, framing.target.y, framing.target.z);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = Math.min(20, Math.max(1, framing.radius * 0.1));
  controls.maxDistance = Math.max(2200, framing.radius * 12);
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  controls.update();

  function render(): void {
    renderer.render(scene, camera);
  }

  function handleResize(): void {
    const w = container.clientWidth;
    const h = Math.max(1, container.clientHeight);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
  }

  return { scene, camera, renderer, controls, framing, bounds, render, handleResize };
}
