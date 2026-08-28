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

export interface BuildingsHandle {
  /** One InstancedMesh per distinct architectural style profile. Add these to the scene. */
  meshes: THREE.InstancedMesh[];
  /** Add these group(s) to the scene: district ground rects + (optional) label sprites. */
  districtGroup: THREE.Group;
  /** Raycast target list = meshes. Resolve an intersection back to a building id. */
  resolveBuildingId(mesh: THREE.Object3D, instanceId: number | undefined): string | null;
  /** All buildings keyed by id, for the UI overlay to read metrics from. */
  buildingById: Map<string, Building>;
  /** World-space center (x, y=height/2 top, z) of a building, for camera framing / road endpoints. */
  buildingCenter(id: string): THREE.Vector3 | null;
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

/** Concatenates position-only geometries into one non-indexed BufferGeometry and recomputes
 *  normals, so a profile with a roof cap still renders as a single merged mesh (one InstancedMesh
 *  per profile group -- never per-language). */
function mergeGeometries(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const positions: number[] = [];
  for (const g of parts) {
    const flat = g.index ? g.toNonIndexed() : g;
    const pos = flat.getAttribute("position");
    for (let i = 0; i < pos.count; i++) positions.push(pos.getX(i), pos.getY(i), pos.getZ(i));
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  merged.computeVertexNormals();
  return merged;
}

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
    return boxGeometry(hw, -HALF, HALF, hd);
  }
  if (profile.roof === "stepped") {
    const bodyTop = 0.2;
    const body = boxGeometry(hw, -HALF, bodyTop, hd);
    const capHw = Math.min(hw, Math.max(0.08, hw * 0.55));
    const capHd = Math.min(hd, Math.max(0.08, hd * 0.55));
    const cap = boxGeometry(capHw, bodyTop, HALF, capHd);
    return mergeGeometries([body, cap]);
  }
  // pitched
  const bodyTop = 0.05;
  const body = boxGeometry(hw, -HALF, bodyTop, hd);
  const roof = pyramidGeometry(hw, hd, bodyTop, HALF);
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

function buildingColor(b: Building, lightnessBias: number): THREE.Color {
  const baseHue = styleHue(b.style);
  const jitter = (hashUnit(b.id) - 0.5) * 0.06;
  const hue = (baseHue + jitter + 1) % 1;
  const sat = 0.45 + hashUnit(b.id + "s") * 0.25;
  const light = THREE.MathUtils.clamp(0.42 + hashUnit(b.id + "l") * 0.16 + lightnessBias, 0.05, 0.92);
  return new THREE.Color().setHSL(hue, sat, light);
}

function districtColor(style: string): THREE.Color {
  const hue = styleHue(style);
  return new THREE.Color().setHSL(hue, 0.35, 0.16);
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
    const geo = new THREE.PlaneGeometry(d.width, d.depth);
    const mat = new THREE.MeshStandardMaterial({
      color: districtColor(d.style),
      roughness: 1,
      transparent: true,
      opacity: 0.9,
    });
    const rect = new THREE.Mesh(geo, mat);
    rect.rotation.x = -Math.PI / 2;
    rect.position.set(d.x + d.width / 2, 0.15, d.y + d.depth / 2);
    rect.receiveShadow = true;
    rect.name = `district:${d.id}`;
    group.add(rect);

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

export function buildBuildings(city: CityModel): BuildingsHandle {
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

  const meshes: THREE.InstancedMesh[] = [];
  const meshOrder = new Map<THREE.InstancedMesh, Building[]>();
  const centers = new Map<string, THREE.Vector3>();

  for (const [profileName, list] of byProfile) {
    const profile = PROFILE_DEFS[profileName];
    const geometry = buildProfileGeometry(profile);
    const material = new THREE.MeshStandardMaterial({ roughness: profile.roughness, metalness: profile.metalness });
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `buildings:${profileName}`;

    const dummy = new THREE.Object3D();
    list.forEach((b, i) => {
      const cx = b.x + b.width / 2;
      const cz = b.y + b.depth / 2;
      const cy = b.height / 2;
      dummy.position.set(cx, cy, cz);
      dummy.scale.set(Math.max(0.1, b.width), Math.max(0.1, b.height), Math.max(0.1, b.depth));
      dummy.rotation.set(0, 0, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);

      const fanIn = fanInById.get(b.id) ?? 0;
      const hasOutgoing = outgoing.has(b.id);
      const base = buildingColor(b, profile.lightnessBias);
      const color =
        classifyStructuralLiveness(fanIn, hasOutgoing) === "dead"
          ? applyDeadTint(base)
          : applyOccupancy(base, occupancyIntensity(fanIn, fanInRef));
      mesh.setColorAt(i, color);
      centers.set(b.id, new THREE.Vector3(cx, b.height, cz));
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

  return {
    meshes,
    districtGroup: buildDistricts(city),
    resolveBuildingId,
    buildingById,
    buildingCenter,
  };
}
