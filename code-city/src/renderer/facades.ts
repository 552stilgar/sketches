// renderer: procedural building facades — V2 of the visual phase.
//
// Splits into the two halves the InstancedMesh architecture forces (Usul's ruling, 2026-09-01,
// "hybrid: buckets + shader"), because buildings.ts renders ONE InstancedMesh per style profile
// with shared geometry and per-instance COLOR ONLY — there is no per-building geometry to carve:
//
//   SILHOUETTE  -> geometry buckets. A building's setback tier becomes part of its grouping key,
//                  so `${profile}:${tier}` gets its own geometry and its own InstancedMesh.
//                  Quantized on purpose: a continuous per-building silhouette would mean a
//                  geometry per building (~1108 draw calls on the real corpus) and would throw
//                  away the instanceId raycast fast path buildings.ts's resolveBuildingId depends
//                  on.
//   SURFACE     -> a shader injected into the shared MeshStandardMaterial, reading per-INSTANCE
//                  attributes (floors, window columns, seed). Surface detail varies per building
//                  without any geometry cost at all.
//
// ---------------------------------------------------------------------------------------------
// WHAT THESE FACADES ARE ALLOWED TO ENCODE, AND WHY IT IS DELIBERATELY NOT "the metrics"
// ---------------------------------------------------------------------------------------------
// Every facade quantity here derives from GEOMETRY THE VIEWER CAN ALREADY SEE — the building's
// compiled height and footprint — plus a hash of its id for non-signalling variation. None of it
// reads `metrics.loc`, `metrics.complexity`, `metrics.churn`, or `metrics.age`.
//
// That is a constraint, not an oversight, and it has two independent reasons:
//
//  1. NEVER-FABRICATE (PROJECT_IDEA §5.5 constraint 2). `age`/`newestAge` are optional and gated
//     behind `ageMeasured`; a facade drawn from them would have to invent something for every
//     unmeasured building. `loc`/`complexity`/`churn` are always present, but see (2).
//  2. NO SECOND, UNLABELLED ENCODING. `loc` and `complexity` ALREADY drive footprint and height
//     through the compiler, and the lens system re-encodes complexity/churn as color and height on
//     demand (lenses.ts). Adding "window density = complexity" would mean the same measurement
//     spoke twice in two visual languages, one of which has no legend anywhere — and worse, it
//     would silently CONTRADICT the active lens whenever a viewer switched away from architecture.
//
// So: floors restate height, window columns restate footprint width, setback tier restates height
// against the city's own scale. A facade adds resolution to what massing already says; it never
// claims a new measurement. If a future phase wants facades to carry their own signal, that signal
// needs a legend and a `*Measured` gate first — do not quietly repoint these functions at metrics.
//
// DETERMINISM (constraint 1): every function here is pure — no clock, no Math.random(). The only
// pseudo-randomness is `hashUnit`, the same FNV-1a-family string hash ruins.ts, props.ts and
// compiler/layout.ts already use for exactly this purpose.

import * as THREE from "three";

/** Same FNV-1a-derived stable fraction the rest of the renderer uses (ruins.ts, buildings.ts). */
function hashUnit(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

// ---------------------------------------------------------------------------------------------
// Silhouette half — setback tiers (the geometry bucket key)
// ---------------------------------------------------------------------------------------------

export const SETBACK_TIERS = ["none", "single", "double", "triple"] as const;
export type SetbackTier = (typeof SETBACK_TIERS)[number];

/** Fraction-of-reference boundaries between tiers. A building at or above the city's own height
 *  reference (p95, floored at 1 — the same reference discipline buildings.ts's `fanInRef`/`ageRef`
 *  use) gets the full three-step ziggurat. */
const TIER_BOUNDARIES: readonly number[] = [0.35, 0.7, 1.0];

/**
 * Which setback tier a building of `height` falls into, judged against the city's own height
 * reference. Quantized to `SETBACK_TIERS` — this value is a GROUPING KEY (one InstancedMesh per
 * profile × tier), so it must be a small closed set, not a continuum.
 *
 * Degenerate-safe: a non-finite or non-positive `heightRef` falls back to 1, and a non-finite
 * `height` reads as 0 (tier "none") rather than producing NaN and a missing bucket.
 */
export function setbackTier(height: number, heightRef: number): SetbackTier {
  const safeRef = Number.isFinite(heightRef) && heightRef > 0 ? heightRef : 1;
  const safeHeight = Number.isFinite(height) && height > 0 ? height : 0;
  const ratio = safeHeight / safeRef;
  if (ratio < TIER_BOUNDARIES[0]) return "none";
  if (ratio < TIER_BOUNDARIES[1]) return "single";
  if (ratio < TIER_BOUNDARIES[2]) return "double";
  return "triple";
}

/** How many stacked setback steps each tier carves into the building BODY. */
export function setbackStepCount(tier: SetbackTier): number {
  switch (tier) {
    case "none":
      return 0;
    case "single":
      return 1;
    case "double":
      return 2;
    case "triple":
      return 3;
  }
}

/** How far (in unit-space half-extent) each successive step insets. Small: three steps at 0.045
 *  still leave a 0.365 half-extent at the top of a 0.5 unit cube, so a ziggurat never pinches into
 *  a spike, and — critically — every step only ever SHRINKS, which is what keeps the
 *  [-0.5,0.5]^3 unit-cube invariant (buildings.ts "geometry construction") intact. */
export const SETBACK_STEP_INSET = 0.045;

// ---------------------------------------------------------------------------------------------
// Surface half — per-instance facade attributes
// ---------------------------------------------------------------------------------------------

/** World height of one nominal floor. Buildings are compiled into a 1000x1000 canvas with
 *  HEIGHT_MIN = 4 (docs/CONTRACT-city-json.md "Urban grammar"), so this is sized so the shortest
 *  legal building still reads as ~2 floors rather than a windowless slab. */
const FLOOR_WORLD_HEIGHT = 2.2;

/** Clamps on the derived counts. The ceilings exist because window rows/columns are drawn as a
 *  procedural grid in the fragment shader: past roughly these densities the grid aliases into
 *  moire at any reasonable camera distance, which reads as noise, not as a facade. */
const MIN_FLOORS = 1;
const MAX_FLOORS = 40;
const MIN_WINDOW_COLS = 1;
const MAX_WINDOW_COLS = 12;

/** World width covered by one window column. */
const WINDOW_WORLD_SPACING = 3.2;

/**
 * Floor count for a building of world `height`. A pure restatement of height at a coarser
 * resolution (see the module header on why this is not a metric read).
 */
export function floorCount(height: number): number {
  const safe = Number.isFinite(height) && height > 0 ? height : 0;
  return THREE.MathUtils.clamp(Math.round(safe / FLOOR_WORLD_HEIGHT), MIN_FLOORS, MAX_FLOORS);
}

/**
 * Window columns across a face of world extent `span` (a building's `width` for its X-facing
 * faces, `depth` for its Z-facing ones — they are separate attributes precisely because a wide,
 * shallow storefront must not get square windows stretched across its long face).
 */
export function windowColumns(span: number): number {
  const safe = Number.isFinite(span) && span > 0 ? span : 0;
  return THREE.MathUtils.clamp(Math.round(safe / WINDOW_WORLD_SPACING), MIN_WINDOW_COLS, MAX_WINDOW_COLS);
}

/** Per-building facade phase in [0,1) — shifts the window grid's origin so neighbouring buildings
 *  of identical size don't line their windows up into an obviously repeated texture. Carries NO
 *  signal by construction (it is a hash of the id, nothing else) and is documented as such so a
 *  later reader can't mistake the variation for data. */
export function facadeSeed(buildingId: string): number {
  return hashUnit(`facade:${buildingId}`);
}

export interface FacadeAttributes {
  floors: number;
  /**
   * Columns for a face whose horizontal axis RUNS ALONG X — i.e. the two Z-FACING faces, whose
   * width is the building's `width`. Named for the axis it spans, not the axis it faces, because
   * the two are perpendicular and naming it "columnsX" for "the X-facing faces" is exactly the
   * confusion that produced a real bug here on 2026-09-01: an X-facing face spans DEPTH, so
   * feeding it a width-derived column count stretched or crowded the windows on precisely the
   * non-square buildings the split exists to serve.
   *
   * THAT BUG WAS LATENT, AND THIS SPLIT IS CURRENTLY DEGENERATE. `src/compiler/index.ts` emits
   * `width: side, depth: side` from a single `footprintSide` value, so EVERY building the compiler
   * can produce today is square — measured 2026-09-01 across all three committed cities:
   * 1108/1108, 55/55, 12/12 square, max width:depth ratio exactly 1.000. `columnsAlongX` therefore
   * always equals `columnsAlongZ` in practice, the old swapped pairing was unobservable on any
   * real city, and the fix is currently guarded only by tests/facades.test.ts, not by anything
   * visible on screen.
   *
   * The split is kept rather than collapsed to one value because it costs one float per instance
   * and is the correct semantics the moment footprints stop being square — but do not mistake it
   * for behavior anyone has SEEN work. If non-square footprints ever land, that is the point to
   * verify this in a browser, and a non-square fixture city is what it would take.
   */
  columnsAlongX: number;
  /** Columns for a face whose horizontal axis RUNS ALONG Z — the two X-FACING faces, whose width
   *  is the building's `depth`. See columnsAlongX on the naming. */
  columnsAlongZ: number;
  seed: number;
}

/**
 * Everything the shader needs for one building, in one pure call.
 *
 * `heightScale` MUST be the same base height scale buildings.ts applies to the instance transform
 * (`applyInstance`: `b.height * baseHeightScale * lensScale`). Deriving floors from the RAW
 * `b.height` instead would make a floor a different world size in every city, because that scale
 * is not a constant — `src/massing-resolution.ts` solves it per city to hit a target median aspect
 * ratio, and `BASE_HEIGHT_SCALE_DEFAULT` is only the fallback for callers that bypass main.ts.
 * A 40-storey grid on a building rendered at half height is a 40-storey grid squeezed into half
 * the space, which reads as stripes, not floors.
 *
 * The LENS scale is deliberately NOT folded in. It varies per building per lens and would have to
 * be recomputed on every setLens() call, and stretching a building's floors along with the
 * building it belongs to is the honest result: the lens exaggerates the whole mass, facade
 * included. Only the per-city base scale needs to be correct here.
 */
export function facadeAttributes(
  b: {
    id: string;
    width: number;
    depth: number;
    height: number;
  },
  heightScale: number,
): FacadeAttributes {
  const safeScale = Number.isFinite(heightScale) && heightScale > 0 ? heightScale : 1;
  return {
    floors: floorCount(b.height * safeScale),
    columnsAlongX: windowColumns(b.width),
    columnsAlongZ: windowColumns(b.depth),
    seed: facadeSeed(b.id),
  };
}

// ---------------------------------------------------------------------------------------------
// Shader injection
// ---------------------------------------------------------------------------------------------

/** How far a window darkens the wall beneath it, at most. Deliberately modest and STRICTLY
 *  DARKENING: scene.ts's tone-mapping header documents a lightness ladder (ruin 0.16 < tank band
 *  0.32 < building ~0.42 < tank body 0.55) that keeps object types from reading as one another,
 *  and tests/tone-mapping.test.ts guards it. A facade that BRIGHTENED could push a building's lit
 *  faces up toward the landmark rung; darkening can only ever move a building down toward the
 *  ruin rung, and at 0.30 it cannot travel far enough to arrive (a 0.42-lightness wall bottoms out
 *  around 0.29, still well clear of ruin charcoal at 0.16). Raising this is a gated change for the
 *  same reason TONE_MAPPING_EXPOSURE is. */
export const WINDOW_DARKEN = 0.3;

/** Width of a window within its grid cell, and of a floor band within its row (0..1). */
const WINDOW_FILL_X = 0.55;
const WINDOW_FILL_Y = 0.5;

/**
 * Installs the facade shader on a MeshStandardMaterial via `onBeforeCompile`.
 *
 * Reads three per-INSTANCE attributes (`aFloors`, `aColumnsX`/`aColumnsZ`, `aFacadeSeed`) that
 * `buildings.ts` sets as InstancedBufferAttributes on the group's geometry, plus the geometry's
 * own `color` attribute — which `buildProfileGeometry` already uses to tag body (1.0) vs crown/roof
 * (CROWN_FACTOR) vertices.
 *
 * WHY `color` IS READ THROUGH ITS OWN VARYING AND NOT THREE'S `vColor`: with both `vertexColors`
 * and InstancedMesh's `instanceColor` enabled, three's `color_vertex` chunk multiplies the two
 * together into `vColor`, so by the fragment stage the crown tag is inseparable from the
 * building's own hue. Windows would then appear or vanish based on how dark a building happens to
 * be. `vFacadeCrown` carries the raw geometry tag, untouched.
 *
 * Windows are drawn only where BOTH: the vertex is body-tagged (not crown/roof), and the surface
 * is near-vertical (|normal.y| small) — so no window is ever painted onto a roof, a pyramid slope,
 * or a setback shelf's top face.
 */
export function installFacadeShader(material: THREE.MeshStandardMaterial): void {
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float aFloors;
attribute float aColumnsAlongX;
attribute float aColumnsAlongZ;
attribute float aFacadeSeed;
varying vec3 vFacadeLocalPos;
varying vec3 vFacadeLocalNormal;
varying float vFacadeFloors;
varying float vFacadeColumnsAlongX;
varying float vFacadeColumnsAlongZ;
varying float vFacadeSeed;
varying float vFacadeCrown;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vFacadeLocalPos = position;
vFacadeLocalNormal = normal;
vFacadeFloors = aFloors;
vFacadeColumnsAlongX = aColumnsAlongX;
vFacadeColumnsAlongZ = aColumnsAlongZ;
vFacadeSeed = aFacadeSeed;
#ifdef USE_COLOR
vFacadeCrown = color.r;
#else
vFacadeCrown = 1.0;
#endif`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
varying vec3 vFacadeLocalPos;
varying vec3 vFacadeLocalNormal;
varying float vFacadeFloors;
varying float vFacadeColumnsAlongX;
varying float vFacadeColumnsAlongZ;
varying float vFacadeSeed;
varying float vFacadeCrown;`,
      )
      // Injected AFTER three's own color_fragment so this multiplies the fully-resolved diffuse
      // (geometry tag * instanceColor * material color), rather than racing it.
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
{
  // Body-tagged only: vFacadeCrown is 1.0 on the body, CROWN_FACTOR (< 1) on crowns and roofs.
  float isBody = step(0.95, vFacadeCrown);
  // Near-vertical only: excludes flat roofs, setback shelf tops, and pyramid slopes.
  float isWall = 1.0 - step(0.5, abs(vFacadeLocalNormal.y));
  // Local space is the [-0.5,0.5] unit cube, so this maps 0..1 over the building's full height.
  float v = vFacadeLocalPos.y + 0.5;
  // Pick the horizontal axis (and column count) belonging to the face we are actually on.
  float facingX = step(0.5, abs(vFacadeLocalNormal.x));
  float u = mix(vFacadeLocalPos.x, vFacadeLocalPos.z, facingX) + 0.5;
  // An X-FACING face spans Z, so it takes the ALONG-Z count. This mix and the u mix above must
  // select on the same side of facingX, or the window density lands on the wrong pair of faces --
  // the 2026-09-01 bug this naming scheme exists to prevent.
  float columns = mix(vFacadeColumnsAlongX, vFacadeColumnsAlongZ, facingX);

  float colCell = fract(u * columns + vFacadeSeed);
  float rowCell = fract(v * vFacadeFloors);
  float inWindow =
    step(0.5 - ${WINDOW_FILL_X.toFixed(3)} * 0.5, colCell) *
    step(colCell, 0.5 + ${WINDOW_FILL_X.toFixed(3)} * 0.5) *
    step(0.5 - ${WINDOW_FILL_Y.toFixed(3)} * 0.5, rowCell) *
    step(rowCell, 0.5 + ${WINDOW_FILL_Y.toFixed(3)} * 0.5);

  diffuseColor.rgb *= 1.0 - ${WINDOW_DARKEN.toFixed(3)} * inWindow * isBody * isWall;
}`,
      );
  };
  // Forces a shader recompile if this material was already compiled once.
  material.needsUpdate = true;
}
