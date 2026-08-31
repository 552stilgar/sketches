// renderer: CityModel -> Three.js building meshes + district ground rects + labels.
//
// Buildings are grouped by architectural `style profile` (see styleProfile() below) into one
// InstancedMesh per group (cheap for hundreds of buildings, and gives raycasting a fast path via
// instanceId). Per-instance color is derived deterministically from the building id, its language
// hue, its structural occupancy (fan-in), and its liveness -- so re-renders never flicker between
// colors and hubs/leaves/dead buildings stay visually distinguishable on any repo.
//
// STATIC ONLY (Phase 5.5 groundwork): every decision rule below is a pure function of city.json.
// No clocks, no randomness, no animation -- that is a later phase (docs/PROJECT_IDEA.md §5.5).

import * as THREE from "three";
import type { Building, CityModel, District, Road } from "../types.ts";
import {
  computeCityLensRanks,
  DEFAULT_LENS,
  lensColorHSL,
  lensHeightScale,
  rankForLens,
  type LensId,
} from "./lenses.ts";

export interface BuildingsHandle {
  /** One InstancedMesh per distinct architectural style profile. Add these to the scene. */
  meshes: THREE.InstancedMesh[];
  /** Add these group(s) to the scene: district ground rects + (optional) label sprites. */
  districtGroup: THREE.Group;
  /** Raycast target list = meshes. Resolve an intersection back to a building id. */
  resolveBuildingId(mesh: THREE.Object3D, instanceId: number | undefined): string | null;
  /** All buildings keyed by id, for the UI overlay to read metrics from. */
  buildingById: Map<string, Building>;
  /** World-space center (x, y=height/2 top, z) of a building, for camera framing / road endpoints.
   *  Always the ARCHITECTURE-lens (unscaled) center, regardless of the active lens — roads and
   *  camera framing must not re-drape every time a viewer switches lenses (see "Lens scope" note
   *  on setLens() below). */
  buildingCenter(id: string): THREE.Vector3 | null;
  /**
   * Switches the active city lens: recolors and rescales the ALREADY-BUILT instances in place
   * (no geometry rebuild, no re-layout). Only Y (height) scale/position and per-instance color
   * change — X/Z stay exactly what compileCity emitted, which is the property
   * tests/lenses-position-lock.test.ts asserts directly: lens switching must never move a
   * building's footprint (docs/PROJECT_IDEA.md §5.3).
   */
  setLens(lens: LensId): void;
  /** The lens most recently applied via setLens() (DEFAULT_LENS until the first call). */
  currentLens(): LensId;
  /**
   * Toggles the V6 age -> patina/weathering overlay: recolors the ALREADY-BUILT instances in
   * place, same mechanism as setLens() (no geometry rebuild, no footprint change -- weathering is
   * a color-only signal, see applyWeathering()). OFF by default (Usul's ruling: no aesthetic
   * default ships unseen) -- the default render is unchanged from before this overlay existed
   * until a caller turns it on.
   */
  setAgeOverlay(enabled: boolean): void;
  /** Whether the age overlay is currently applied (false until the first setAgeOverlay(true)). */
  ageOverlayEnabled(): boolean;
}

// -------------------------------------------------------------------------------------------
// TASK 1 -- fan-in occupancy (pure, tested)
// -------------------------------------------------------------------------------------------

/**
 * Fan-in per building: sum of weights of roads whose `to` is this building. A missing `weight`
 * counts as 1 -- unweighted, never zero (docs/CONTRACT-city-json.md, "Road weight"; PROJECT_IDEA
 * §5.5: a missing measurement must never render as "quiet"). Buildings with no incoming roads are
 * simply absent from the returned map (treat a missing key as 0).
 */
export function computeFanIn(roads: readonly Road[]): Map<string, number> {
  const fanIn = new Map<string, number>();
  for (const r of roads) {
    const weight = r.weight !== undefined && Number.isFinite(r.weight) && r.weight >= 1 ? r.weight : 1;
    fanIn.set(r.to, (fanIn.get(r.to) ?? 0) + weight);
  }
  return fanIn;
}

/** Set of building ids that are the source (`from`) of at least one road. */
export function computeOutgoing(roads: readonly Road[]): Set<string> {
  const out = new Set<string>();
  for (const r of roads) out.add(r.from);
  return out;
}

/** Nearest-rank 95th percentile, floored at 1 -- mirrors the compiler's own discipline for
 *  scale references (docs/CONTRACT-city-json.md, "Urban grammar"). Does not mutate the input. */
export function p95(values: readonly number[]): number {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.ceil(sorted.length * 0.95);
  return Math.max(1, sorted[rank - 1]);
}

/**
 * Normalizes one building's fan-in against the city's own fan-in reference (its p95, nearest
 * rank) into [0,1]. A degenerate city where every building has equal fan-in puts every building
 * at 1 -- the same "everyone lands at maximum" behavior the compiler's footprint/height
 * normalization uses for its own degenerate case.
 */
export function occupancyIntensity(fanIn: number, fanInRef: number): number {
  const safeFanIn = Math.max(0, fanIn);
  const safeRef = Math.max(1, fanInRef);
  return Math.min(1, safeFanIn / safeRef);
}

// -------------------------------------------------------------------------------------------
// TASK 2 -- dead-code-dark (pure, tested)
// -------------------------------------------------------------------------------------------

/**
 * STRUCTURAL liveness only -- scoped deliberately. `city.roads` is the sole evidence source here:
 * zero fan-in AND zero outgoing roads means nothing structural reaches or leaves this building,
 * which is a real finding ("structurally isolated"), not the same claim as "unmeasured". V2 has
 * no measured-traffic tier at all (PROJECT_IDEA §5.5's "Measured" row is future work), so folding
 * that distinction into this function would be premature -- but do NOT extend this value to mean
 * "no measured traffic either" later. When a measured tier lands, give it its own classification
 * (e.g. a `classifyMeasuredLiveness` returning "unmeasured" | ...) instead of overloading "dead"
 * here to also mean "we never instrumented it" -- those are different claims with different
 * evidence and must stay distinguishable by name, per the no-fabrication rule.
 */
export type StructuralLiveness = "dead" | "active";

export function classifyStructuralLiveness(fanIn: number, hasOutgoing: boolean): StructuralLiveness {
  return fanIn <= 0 && !hasOutgoing ? "dead" : "active";
}

// -------------------------------------------------------------------------------------------
// TASK 3 -- language -> architectural style profile, capped at 4 geometry profiles (pure, tested)
// -------------------------------------------------------------------------------------------

export const PROFILE_NAMES = ["campus", "tower", "industrial", "storefront"] as const;
export type ProfileName = (typeof PROFILE_NAMES)[number];

export type RoofForm = "flat" | "stepped" | "pitched";

export interface StyleProfile {
  name: ProfileName;
  roof: RoofForm;
  /** Fraction (0..0.4) the footprint half-extent is inset by, in local unit space. Reshapes
   *  WITHIN the compiler-given width/depth -- never grows beyond it. */
  footprintInset: number;
  roughness: number;
  metalness: number;
  /** Additive HSL lightness offset applied to the building's base color -- the profile's
   *  "dark and functional" vs. "bright" character. Small by design (-0.12..0.12). */
  lightnessBias: number;
}

const LANGUAGE_PROFILE: Record<string, ProfileName> = {
  python: "campus",
  ruby: "campus",
  typescript: "tower",
  javascript: "tower",
  java: "tower",
  kotlin: "tower",
  "c#": "tower",
  csharp: "tower",
  rust: "industrial",
  c: "industrial",
  cpp: "industrial",
  "c++": "industrial",
  go: "industrial",
  html: "storefront",
  css: "storefront",
  sql: "storefront",
  markdown: "storefront",
  json: "storefront",
};

const PROFILE_DEFS: Record<ProfileName, StyleProfile> = {
  // low-rise, wide, soft -- python/ruby, and the default for unknown languages
  campus: { name: "campus", roof: "pitched", footprintInset: 0.03, roughness: 0.9, metalness: 0.02, lightnessBias: 0.02 },
  // tall, narrow, clean-edged -- typescript/javascript/java/kotlin/c#
  tower: { name: "tower", roof: "flat", footprintInset: 0.16, roughness: 0.32, metalness: 0.28, lightnessBias: 0 },
  // heavy, blocky, dark, functional -- rust/c/cpp/go
  industrial: { name: "industrial", roof: "stepped", footprintInset: 0, roughness: 0.95, metalness: 0.08, lightnessBias: -0.09 },
  // wide, shallow, bright -- html/css/sql/markdown/json
  storefront: { name: "storefront", roof: "flat", footprintInset: 0.02, roughness: 0.3, metalness: 0.1, lightnessBias: 0.08 },
};

/** Maps a language tag to its architectural style profile. Unknown languages default to campus
 *  (docs task spec: "campus ... and the default for unknown languages"). */
export function styleProfile(language: string): StyleProfile {
  const key = (language ?? "").toLowerCase();
  const name = LANGUAGE_PROFILE[key] ?? "campus";
  return PROFILE_DEFS[name];
}

/** Looks up a StyleProfile by its own profile NAME (as opposed to styleProfile()'s
 *  language -> name mapping) -- for a caller that already grouped buildings by ProfileName (e.g.
 *  src/renderer/timeline.ts, which groups a morphed building UNION the same way buildBuildings()
 *  does) and needs the StyleProfile back without re-deriving it from an arbitrary representative
 *  language string. */
export function profileByName(name: ProfileName): StyleProfile {
  return PROFILE_DEFS[name];
}

// -- geometry construction -------------------------------------------------------------------
// Local unit space matches the original plain box: x/z span [-0.5, 0.5], y spans [-0.5, 0.5].
// After the per-instance transform (position = center, scale = width/height/depth) this maps
// exactly onto the compiler-given footprint and height, so nothing here may ever place a vertex
// outside that unit cube -- that is the invariant tests/buildings.test.ts guards directly by
// computing each profile's real bounding box.

const HALF = 0.5;

function boxGeometry(hw: number, y0: number, y1: number, hd: number): THREE.BufferGeometry {
  const geo = new THREE.BoxGeometry(hw * 2, y1 - y0, hd * 2);
  geo.translate(0, (y0 + y1) / 2, 0);
  return geo;
}

/** A 4-sided pyramid roof cap: base corners at y=baseY, apex at (0, apexY, 0). No bottom face --
 *  it sits flush on the box body's top face, which is never rendered from inside a solid city. */
function pyramidGeometry(hw: number, hd: number, baseY: number, apexY: number): THREE.BufferGeometry {
  const corners: [number, number, number][] = [
    [-hw, baseY, -hd],
    [hw, baseY, -hd],
    [hw, baseY, hd],
    [-hw, baseY, hd],
  ];
  const apex: [number, number, number] = [0, apexY, 0];
  const positions: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    positions.push(a[0], a[1], a[2], b[0], b[1], b[2], apex[0], apex[1], apex[2]);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geo;
}

/** Concatenates position-only (optionally color-tagged) geometries into one non-indexed
 *  BufferGeometry and recomputes normals, so a profile with a roof cap still renders as a single
 *  merged mesh (one InstancedMesh per profile group -- never per-language). Non-indexed geometry
 *  never shares vertices between triangles, so this is inherently facet-flat -- a box built this
 *  way already reads as a sharp-edged cube, no separate flat-shading flag required. When every
 *  input part carries a "color" attribute (see tagColor()), that attribute is merged too, so a
 *  body+crown split survives into one InstancedMesh material via `vertexColors: true`. */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const hasColor = parts.every((g) => g.getAttribute("color") !== undefined);
  for (const g of parts) {
    const flat = g.index ? g.toNonIndexed() : g;
    const pos = flat.getAttribute("position");
    for (let i = 0; i < pos.count; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
    if (hasColor) {
      const col = flat.getAttribute("color");
      for (let i = 0; i < col.count; i++) colors.push(col.getX(i), col.getY(i), col.getZ(i));
    }
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (hasColor) merged.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  merged.computeVertexNormals();
  return merged;
}

/** Tags every vertex of `geo` with a uniform grayscale "color" attribute of `factor` -- multiplies
 *  (via `vertexColors: true`) against the building's own hue/liveness/occupancy color, same as a
 *  real roof material reading darker than the walls beneath it. Never overrides the encoded color,
 *  only shades it -- so this adds massing detail without implying a signal the data doesn't carry. */
function tagColor(geo: THREE.BufferGeometry, factor: number): THREE.BufferGeometry {
  const count = geo.getAttribute("position").count;
  geo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(count * 3).fill(factor), 3));
  return geo;
}

/** Multiplier applied to a building's own color on its roof/crown tier -- reads as a distinct cap
 *  material, breaking the "one flat tone" silhouette without touching the color encoding itself. */
const CROWN_FACTOR = 0.8;

/**
 * Builds a profile's unit-space geometry (roof mass baked in). Exported so
 * tests/buildings.test.ts can assert, for every profile, that the real computed bounding box
 * never exceeds the [-0.5,0.5]^3 unit cube -- i.e. this profile can never scale out past the
 * compiler-given width/depth/height, which is what keeps the no-overlap guarantee intact.
 */
export function buildProfileGeometry(profile: StyleProfile): THREE.BufferGeometry {
  const inset = THREE.MathUtils.clamp(profile.footprintInset, 0, 0.4);
  const hw = HALF - inset;
  const hd = HALF - inset;

  if (profile.roof === "flat") {
    // "large flat-topped cube reading as inert" -- give flat-roof profiles (tower, storefront) a
    // setback crown tier instead of one uninterrupted extrusion. The crown never widens beyond
    // hw/hd (it only insets further), so the profile's own bounding box is unchanged.
    const setback = profile.name === "tower" ? 0.05 : 0.025;
    const fullHeight = HALF - -HALF; // = 1, spelled out so the 0.78 split reads against it
    const crownY = -HALF + fullHeight * 0.78;
    const body = tagColor(boxGeometry(hw, -HALF, crownY, hd), 1);
    const crownHw = Math.max(0.04, hw - setback);
    const crownHd = Math.max(0.04, hd - setback);
    const crown = tagColor(boxGeometry(crownHw, crownY, HALF, crownHd), CROWN_FACTOR);
    return mergeGeometries([body, crown]);
  }
  if (profile.roof === "stepped") {
    const bodyTop = 0.2;
    const body = tagColor(boxGeometry(hw, -HALF, bodyTop, hd), 1);
    const capHw = Math.min(hw, Math.max(0.08, hw * 0.55));
    const capHd = Math.min(hd, Math.max(0.08, hd * 0.55));
    const cap = tagColor(boxGeometry(capHw, bodyTop, HALF, capHd), CROWN_FACTOR);
    return mergeGeometries([body, cap]);
  }
  // pitched
  const bodyTop = 0.05;
  const body = tagColor(boxGeometry(hw, -HALF, bodyTop, hd), 1);
  const roof = tagColor(pyramidGeometry(hw, hd, bodyTop, HALF), CROWN_FACTOR);
  return mergeGeometries([body, roof]);
}

// -------------------------------------------------------------------------------------------
// Color: base hue-by-language, biased by profile character, then modulated by liveness/occupancy
// -------------------------------------------------------------------------------------------

// Base hue per language tag. Unknown languages fall back to a neutral hash-derived hue.
const STYLE_HUES: Record<string, number> = {
  typescript: 0.55, // cyan-blue
  javascript: 0.13, // amber
  python: 0.33, // soft green
  rust: 0.02, // rust orange/red
  java: 0.62, // corporate blue-violet
  c: 0.08,
  cpp: 0.05,
  sql: 0.75, // violet warehouse
  html: 0.9, // magenta storefront
  css: 0.9,
};

function hashUnit(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return ((h >>> 0) % 10000) / 10000;
}

function styleHue(style: string): number {
  if (style in STYLE_HUES) return STYLE_HUES[style];
  return hashUnit(style);
}

// Widened to `{id, style}` (rather than the full `Building`) so a non-Building caller with the
// same two fields -- src/renderer/timeline.ts's MorphedBuilding, notably -- can reuse the exact
// same base-color derivation without either duplicating this function or being forced to
// construct a fake `Building`. `Building` itself still satisfies this shape unchanged.
export function buildingColor(b: { id: string; style: string }, lightnessBias: number): THREE.Color {
  const baseHue = styleHue(b.style);
  const jitter = (hashUnit(b.id) - 0.5) * 0.06;
  const hue = (baseHue + jitter + 1) % 1;
  const sat = 0.45 + hashUnit(b.id + "s") * 0.25;
  const light = THREE.MathUtils.clamp(0.42 + hashUnit(b.id + "l") * 0.16 + lightnessBias, 0.05, 0.92);
  return new THREE.Color().setHSL(hue, sat, light);
}

// -------------------------------------------------------------------------------------------
// District territory identity (pure, tested)
// -------------------------------------------------------------------------------------------
//
// A real dogfood run (usul-mgmt + usul-mgmt-itba + usul-mgmt-frd-ops merged into one city, three
// districts) found every district colored IDENTICALLY: the old districtColor(style) keyed purely
// off dominant language, and all three districts share dominant language "typescript". Ground
// tint alone also disappears under building density in a dense city, so a second, physically
// standing cue (a boundary wall) is added below -- it still reads even when the ground fill
// underneath is fully occluded.
//
// Every value here is a pure function of the district's OWN id (never array position, an
// insertion-order counter, or the clock) -- so two renders of the same CityModel always agree,
// and re-deriving city.json with the same district set always reproduces the same territory.

const DISTRICT_HUE_STEPS = 16;

export interface DistrictVisual {
  /** Ground-plane tint. */
  fill: THREE.Color;
  /** Boundary-wall tint -- brighter/more saturated than `fill` so the perimeter reads even when
   *  the ground itself is occluded by building density. */
  edge: THREE.Color;
  /** World-space Y the ground plane and its boundary wall sit at. Always a few units at most --
   *  roads run at building-TOP height (see buildingCenter()), never down here, so this can never
   *  collide with road geometry regardless of the district's own footprint. */
  elevation: number;
}

/** Buckets `id` into one of DISTRICT_HUE_STEPS evenly-spread hues, then jitters within that
 *  bucket's own wedge. A raw hash clusters (birthday-paradox collisions read as "same color");
 *  bucketing first spreads the wheel wide while staying a pure function of this one id -- no
 *  reference to any sibling district, no rank, no position. */
function districtHue(id: string): number {
  const bucketWidth = 1 / DISTRICT_HUE_STEPS;
  const bucket = Math.floor(hashUnit(`${id}:district-hue-bucket`) * DISTRICT_HUE_STEPS) % DISTRICT_HUE_STEPS;
  const jitter = (hashUnit(`${id}:district-hue-jitter`) - 0.5) * bucketWidth * 0.6;
  return (((bucket * bucketWidth + jitter) % 1) + 1) % 1;
}

/** Ground fill / boundary-wall tint / elevation for one district -- purely a function of `d.id`.
 *  Two districts that happen to share `style` (the real defect above) still land on different
 *  hue buckets and different saturation/lightness, because none of it is keyed on style alone. */
export function districtVisual(d: District): DistrictVisual {
  const hue = districtHue(d.id);
  const sat = 0.38 + hashUnit(`${d.id}:district-sat`) * 0.3;
  const fillLight = 0.12 + hashUnit(`${d.id}:district-light`) * 0.1;
  const fill = new THREE.Color().setHSL(hue, sat, fillLight);
  const edge = new THREE.Color().setHSL(hue, Math.min(1, sat + 0.3), Math.min(0.62, fillLight + 0.36));
  const elevation = 0.15 + hashUnit(`${d.id}:district-elevation`) * 2.6;
  return { fill, edge, elevation };
}

/** A low perimeter wall standing at the district's own boundary -- the fix for "ground buried
 *  under building density": a flat tint disappears once enough buildings sit on top of it, but a
 *  wall raised above street level still peeks between them from any oblique camera angle. Sized
 *  proportionally to the district's own footprint (never a fixed size, so a small district doesn't
 *  get a wall taller than its own buildings) and colored/placed from districtVisual() -- nothing
 *  here depends on how many districts there are or what order they were built in. */
function buildDistrictBoundary(d: District, visual: DistrictVisual): THREE.Mesh {
  const halfW = d.width / 2;
  const halfD = d.depth / 2;
  const minSpan = Math.min(d.width, d.depth);
  const wallHeight = THREE.MathUtils.clamp(minSpan * 0.035, 1.5, 5);
  const halfThick = Math.max(0.05, Math.min(minSpan * 0.0125, halfW * 0.4, halfD * 0.4));

  const north = tagColor(boxGeometry(halfW, 0, wallHeight, halfThick), 1);
  north.translate(0, 0, -(halfD - halfThick));
  const south = tagColor(boxGeometry(halfW, 0, wallHeight, halfThick), 1);
  south.translate(0, 0, halfD - halfThick);
  const east = tagColor(boxGeometry(halfThick, 0, wallHeight, halfD), 1);
  east.translate(halfW - halfThick, 0, 0);
  const west = tagColor(boxGeometry(halfThick, 0, wallHeight, halfD), 1);
  west.translate(-(halfW - halfThick), 0, 0);

  const geometry = mergeGeometries([north, south, east, west]);
  const material = new THREE.MeshStandardMaterial({
    color: visual.edge,
    roughness: 0.55,
    metalness: 0.05,
    emissive: visual.edge,
    emissiveIntensity: 0.22,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.set(d.x + d.width / 2, visual.elevation, d.y + d.depth / 2);
  mesh.name = `district-boundary:${d.id}`;
  return mesh;
}

/**
 * Base height multiplier applied to every building's compiler-given `height`, BEFORE the
 * per-lens multiplier from lensHeightScale() (see lenses.ts). This is the renderer-side massing
 * knob: it does not touch city.json (buildBuildings/setLens still consume the same CityModel
 * unchanged), so it can be tuned per-viewer without recompiling. Trade-off: raising it makes
 * every building read as a taller, denser skyline (helping the pin-vs-block silhouette at high
 * building counts), at the cost of buildings clipping camera near-planes sooner and district
 * ground/road geometry (which does NOT scale with this knob) looking comparatively squat.
 *
 * THIS CONSTANT IS THE OPT-OUT PATH, not the default in effect. As of the massing.ts module
 * (normalizedHeightScale / medianAspect), the viewer (src/main.ts, via
 * src/massing-resolution.ts) normalizes to TARGET_MEDIAN_ASPECT_DEFAULT by default and only
 * falls back to a fixed scale when a viewer passes an explicit `?heightScale=` override --
 * BASE_HEIGHT_SCALE_DEFAULT itself is consumed only when buildBuildings is called with no
 * `opts.heightScale` at all (i.e. by a caller that bypasses main.ts's resolution, such as a test
 * or a future consumer), so it stays live as the reversibility lever, not because it is what a
 * normal viewer session sees.
 *
 * A FIXED constant cannot hold a fixed aspect ratio across city sizes: height is absolute
 * (LOC-derived) while footprint is a share of a fixed 1000x1000 canvas, so footprint shrinks as
 * building count grows and the same heightScale gets WORSE (taller-relative) on a bigger city.
 * Measured on two real cities:
 *   merged-trio (631 buildings):  median footprint 8.08, median height 52.4, median aspect  6.5
 *   usul-mgmt   (1108 buildings): median footprint 3.69, median height 52.4, median aspect 14.2
 * Median height is identical; median footprint halved. At this constant's own value (0.5),
 * usul-mgmt's median silhouette comes out to 8.8:1 -- worse than the 7.4:1 that triggered the
 * 2026-08-30 ruling below in the first place. That ruling is preserved (TARGET_MEDIAN_ASPECT_DEFAULT
 * in massing.ts is the 3.7:1 ratio 0.5 actually produced on the 631-building city), normalization
 * only makes it hold on cities of a different size than the one it was tuned on.
 *
 * 0.5 since 2026-08-30 (Usul's ruling, made against rendered variants at 1 / 0.5 / 0.25 / 0.12).
 * At 1 the median building on the merged mgmt trio stood 7.4x taller than its footprint was wide
 * -- measured, p25 4.6 / p75 11.2 / max 33.3 -- and the city read as a field of pins rather than a
 * skyline. Footprint width cannot fix that ratio: the footprint floor only widens the smallest
 * buildings, so 0.05/0.20/0.50 floors were visually indistinguishable. Halving height is what
 * moves it. Below ~0.25 the massing flattens past the point of reading as buildings at all, so
 * this knob has a usable floor as well as a ceiling -- the same [0.25, 2.0] band
 * normalizedHeightScale() clamps to.
 */
export const BASE_HEIGHT_SCALE_DEFAULT = 0.5;

export interface BuildBuildingsOptions {
  /** See BASE_HEIGHT_SCALE_DEFAULT's doc comment above. */
  heightScale?: number;
}

// Warm-white "lit window" target that occupancy brightening mixes toward. Per-instance color is
// the only lever available for this -- InstancedMesh shares one material per group, so
// material.emissiveIntensity can't vary per building (PROJECT_IDEA §5.5 "Occupancy").
const OCCUPANCY_MIX_TARGET = new THREE.Color(1, 1, 0.92);
const OCCUPANCY_MIX_MAX = 0.55;

function applyOccupancy(base: THREE.Color, intensity: number): THREE.Color {
  const c = base.clone();
  c.lerp(OCCUPANCY_MIX_TARGET, THREE.MathUtils.clamp(intensity, 0, 1) * OCCUPANCY_MIX_MAX);
  return c;
}

// Dead/abandoned: desaturate and darken the building's own hue rather than replacing it outright,
// so the district still reads as "this building's language" while looking unlit.
function applyDeadTint(base: THREE.Color): THREE.Color {
  const hsl = { h: 0, s: 0, l: 0 };
  base.getHSL(hsl);
  return new THREE.Color().setHSL(hsl.h, hsl.s * 0.25, Math.min(hsl.l, 0.12));
}

// -------------------------------------------------------------------------------------------
// V6 -- age -> patina/weathering overlay (pure, tested)
// -------------------------------------------------------------------------------------------
//
// docs/CONTRACT-city-json.md "Age weathering (V6)": age IS measured (unlike, say, the structural
// liveness above), so a MEASURED building may render its age as a real spread of weathering --
// but a building with no measured age (ageMeasured === false, or the field simply absent on a
// pre-V6 city.json) must render as visibly UNMEASURED, never as "brand new". Age 0 (a file
// created on HEAD day, genuinely measured) and age-absent (no git history at all) are two
// different claims and must never collapse into the same clean/new look.

/** Mossy grey-green patina an old, measured building mixes toward as age climbs -- deliberately
 *  desaturated/dark so it reads as "worn", not as a hue swap that could be mistaken for a
 *  different language's style color. */
const PATINA_TARGET = new THREE.Color().setHSL(0.28, 0.22, 0.24);
const PATINA_MIX_MAX = 0.62;

/** A caution-amber tint for UNMEASURED buildings -- deliberately far from both a clean building's
 *  own hue and PATINA_TARGET's mossy green, so "we don't know this building's age" never reads as
 *  "old" or blends in as "new" on any city's own language palette. Mixed at a FIXED amount
 *  (never scaled by `age`, since an unmeasured age number carries no real signal to scale by). */
const UNMEASURED_TINT = new THREE.Color().setHSL(0.13, 0.6, 0.55);
const UNMEASURED_MIX = 0.4;

/**
 * Normalizes one building's measured age against the city's own age reference (its p95, nearest
 * rank -- same discipline p95() elsewhere on this page uses for loc/complexity/fan-in). A
 * degenerate city where every measured building has equal age puts every one of them at the same
 * intensity, matching how occupancyIntensity()/normalizeWeight() already treat a flat
 * distribution -- never fabricating a spread the data doesn't contain.
 */
export function normalizeAge(age: number, ageRef: number): number {
  const safeAge = Math.max(0, age);
  const safeRef = Math.max(1, ageRef);
  return Math.min(1, safeAge / safeRef);
}

/**
 * The one age -> weathering color mapping. `measured` gates which visual channel applies:
 * unmeasured buildings get the fixed UNMEASURED_TINT regardless of `age`'s numeric value (which
 * may be the analyzer's meaningless no-commits 0), measured buildings get patina proportional to
 * their normalized age. Never both -- an unmeasured building is not "age 0", it is "no reading".
 */
export function applyWeathering(base: THREE.Color, age: number, ageRef: number, measured: boolean): THREE.Color {
  const c = base.clone();
  if (!measured) return c.lerp(UNMEASURED_TINT, UNMEASURED_MIX);
  return c.lerp(PATINA_TARGET, normalizeAge(age, ageRef) * PATINA_MIX_MAX);
}

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = "bold 64px system-ui, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, 20, canvas.width, 88);
  ctx.fillStyle = "#e8ecff";
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(90, 22.5, 1);
  return sprite;
}

/** Builds district ground rects + fade-by-distance name labels. */
export function buildDistricts(city: CityModel): THREE.Group {
  const group = new THREE.Group();
  group.name = "districts";

  for (const d of city.districts as District[]) {
    const visual = districtVisual(d);

    const geo = new THREE.PlaneGeometry(d.width, d.depth);
    const mat = new THREE.MeshStandardMaterial({
      color: visual.fill,
      roughness: 1,
      transparent: true,
      opacity: 0.92,
    });
    const rect = new THREE.Mesh(geo, mat);
    rect.rotation.x = -Math.PI / 2;
    rect.position.set(d.x + d.width / 2, visual.elevation, d.y + d.depth / 2);
    rect.receiveShadow = true;
    rect.name = `district:${d.id}`;
    group.add(rect);

    group.add(buildDistrictBoundary(d, visual));

    const label = makeLabelSprite(d.name);
    label.position.set(d.x + d.width / 2, 40, d.y + d.depth / 2);
    label.userData.isDistrictLabel = true;
    group.add(label);
  }

  return group;
}

/** Fades district labels out with camera distance so close-up building exploration isn't cluttered. */
export function updateDistrictLabelFade(group: THREE.Group, camera: THREE.Camera): void {
  const camPos = camera.position;
  for (const child of group.children) {
    if (!(child instanceof THREE.Sprite) || !child.userData.isDistrictLabel) continue;
    const dist = camPos.distanceTo(child.position);
    const mat = child.material as THREE.SpriteMaterial;
    // Fully visible far away (orientation), fades out as the camera gets close to street level.
    mat.opacity = THREE.MathUtils.clamp((dist - 120) / 260, 0.05, 1);
  }
}

/**
 * Sets one instance's transform + color for the given lens, in place. `dummy` is a caller-owned
 * scratch Object3D (reused across every instance -- allocating a fresh one per building per lens
 * switch would be wasteful on a large city). Only Y (height scale + center) and color depend on
 * the lens; X/Z footprint is always the compiler-given b.x/b.y/b.width/b.depth, unscaled -- this
 * is the actual mechanism behind the position-lock guarantee (docs/PROJECT_IDEA.md §5.3).
 */
function applyInstance(
  dummy: THREE.Object3D,
  mesh: THREE.InstancedMesh,
  index: number,
  b: Building,
  lens: LensId,
  rank: number,
  lightnessBias: number,
  fanIn: number,
  hasOutgoing: boolean,
  fanInRef: number,
  baseHeightScale: number,
  ageOverlayEnabled: boolean,
  ageRef: number,
): void {
  const cx = b.x + b.width / 2;
  const cz = b.y + b.depth / 2;
  const lensScale = lensHeightScale(lens, rank);
  const scaledHeight = Math.max(0.1, b.height * baseHeightScale * lensScale);
  const cy = scaledHeight / 2;
  dummy.position.set(cx, cy, cz);
  dummy.scale.set(Math.max(0.1, b.width), scaledHeight, Math.max(0.1, b.depth));
  dummy.rotation.set(0, 0, 0);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);

  const hsl = lensColorHSL(lens, rank);
  const base = hsl
    ? new THREE.Color().setHSL(hsl.hue, hsl.sat, THREE.MathUtils.clamp(hsl.light + lightnessBias, 0.05, 0.92))
    : buildingColor(b, lightnessBias);
  let color =
    classifyStructuralLiveness(fanIn, hasOutgoing) === "dead"
      ? applyDeadTint(base)
      : applyOccupancy(base, occupancyIntensity(fanIn, fanInRef));
  if (ageOverlayEnabled) {
    color = applyWeathering(color, b.metrics.age ?? 0, ageRef, b.metrics.ageMeasured === true);
  }
  mesh.setColorAt(index, color);
}

export function buildBuildings(city: CityModel, opts?: BuildBuildingsOptions): BuildingsHandle {
  const baseHeightScale = opts?.heightScale ?? BASE_HEIGHT_SCALE_DEFAULT;
  const buildingById = new Map<string, Building>();
  const byProfile = new Map<ProfileName, Building[]>();

  for (const b of city.buildings as Building[]) {
    buildingById.set(b.id, b);
    const profileName = styleProfile(b.style).name;
    const list = byProfile.get(profileName) ?? [];
    list.push(b);
    byProfile.set(profileName, list);
  }

  const roads = city.roads as Road[];
  const fanInById = computeFanIn(roads);
  const outgoing = computeOutgoing(roads);
  const fanInRef = p95(city.buildings.map((b) => fanInById.get(b.id) ?? 0));
  const lensRanks = computeCityLensRanks(city.buildings as Building[]);
  // V6: reference for normalizeAge()/applyWeathering() -- restricted to genuinely MEASURED
  // buildings (docs/CONTRACT-city-json.md "Age weathering (V6)"), so a city where every file is
  // unmeasured doesn't collapse the reference to 0 (p95([]) already floors at 1) and an unmeasured
  // building's meaningless age:0 fallback never pollutes the scale real ages are judged against.
  const ageRef = p95(
    (city.buildings as Building[]).filter((b) => b.metrics.ageMeasured === true).map((b) => b.metrics.age ?? 0),
  );
  let ageOverlayEnabled = false;

  const meshes: THREE.InstancedMesh[] = [];
  const meshOrder = new Map<THREE.InstancedMesh, Building[]>();
  const centers = new Map<string, THREE.Vector3>();
  // (mesh, index, lightnessBias) per building id -- lets setLens() update every existing
  // instance without rebuilding byProfile grouping or re-walking city.buildings each call.
  const instanceIndex = new Map<string, { mesh: THREE.InstancedMesh; index: number; lightnessBias: number }>();
  let activeLens: LensId = DEFAULT_LENS;

  const dummy = new THREE.Object3D();

  for (const [profileName, list] of byProfile) {
    const profile = PROFILE_DEFS[profileName];
    const geometry = buildProfileGeometry(profile);
    const material = new THREE.MeshStandardMaterial({
      roughness: profile.roughness,
      metalness: profile.metalness,
      // buildProfileGeometry() tags body vs. crown/roof vertices with a "color" attribute
      // (tagColor/CROWN_FACTOR) -- this makes InstancedMesh multiply it against instanceColor,
      // so the crown reads as a visibly distinct material tier on every instance for free.
      vertexColors: true,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `buildings:${profileName}`;

    list.forEach((b, i) => {
      const fanIn = fanInById.get(b.id) ?? 0;
      const hasOutgoing = outgoing.has(b.id);
      applyInstance(
        dummy,
        mesh,
        i,
        b,
        activeLens,
        0,
        profile.lightnessBias,
        fanIn,
        hasOutgoing,
        fanInRef,
        baseHeightScale,
        ageOverlayEnabled,
        ageRef,
      );

      // buildingCenter() is always the unscaled (architecture-lens) top-of-building, on purpose
      // (see BuildingsHandle.buildingCenter doc) -- computed once here from the RAW height, never
      // recomputed by setLens().
      const cx = b.x + b.width / 2;
      const cz = b.y + b.depth / 2;
      centers.set(b.id, new THREE.Vector3(cx, b.height, cz));
      instanceIndex.set(b.id, { mesh, index: i, lightnessBias: profile.lightnessBias });
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;

    meshes.push(mesh);
    meshOrder.set(mesh, list);
  }

  function resolveBuildingId(mesh: THREE.Object3D, instanceId: number | undefined): string | null {
    if (instanceId === undefined) return null;
    const list = meshOrder.get(mesh as THREE.InstancedMesh);
    if (!list) return null;
    return list[instanceId]?.id ?? null;
  }

  function buildingCenter(id: string): THREE.Vector3 | null {
    return centers.get(id) ?? null;
  }

  /** Re-applies every already-built instance's transform/color for the CURRENT `activeLens` and
   *  `ageOverlayEnabled` state -- the shared refresh both setLens() and setAgeOverlay() drive, so
   *  switching either one never leaves the other stale on screen. */
  function refreshAllInstances(): void {
    const touched = new Set<THREE.InstancedMesh>();
    for (const b of city.buildings as Building[]) {
      const entry = instanceIndex.get(b.id);
      if (!entry) continue;
      const fanIn = fanInById.get(b.id) ?? 0;
      const hasOutgoing = outgoing.has(b.id);
      const rank = rankForLens(activeLens, {
        complexityRank: lensRanks.complexityRank.get(b.id) ?? 0,
        churnRank: lensRanks.churnRank.get(b.id) ?? 0,
      });
      applyInstance(
        dummy,
        entry.mesh,
        entry.index,
        b,
        activeLens,
        rank,
        entry.lightnessBias,
        fanIn,
        hasOutgoing,
        fanInRef,
        baseHeightScale,
        ageOverlayEnabled,
        ageRef,
      );
      touched.add(entry.mesh);
    }
    for (const mesh of touched) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  function setLens(lens: LensId): void {
    activeLens = lens;
    refreshAllInstances();
  }

  function currentLens(): LensId {
    return activeLens;
  }

  function setAgeOverlay(enabled: boolean): void {
    ageOverlayEnabled = enabled;
    refreshAllInstances();
  }

  function ageOverlayEnabledFn(): boolean {
    return ageOverlayEnabled;
  }

  return {
    meshes,
    districtGroup: buildDistricts(city),
    resolveBuildingId,
    buildingById,
    buildingCenter,
    setLens,
    currentLens,
    setAgeOverlay,
    ageOverlayEnabled: ageOverlayEnabledFn,
  };
}
