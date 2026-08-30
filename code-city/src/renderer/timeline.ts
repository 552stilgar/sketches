// renderer: TIMELINE SCRUB -- the Three.js half of git time-travel (PROJECT_IDEA.md Phase 4/§5.2).
// Owns a Group whose contents morph as the scrub position moves across a sequence of already-
// compiled CityModels. Building geometry/color comes from src/renderer/morph.ts's pure
// interpolation (never derived here); this module's only job is turning a MorphedBuilding[] into
// InstancedMesh instances, the same building-block src/renderer/buildings.ts already uses for the
// static (non-timeline) explorer -- buildProfileGeometry/styleProfile/buildingColor are reused
// directly rather than re-implemented, so a building looks the same whichever renderer draws it.
//
// KNOWN, DISCLOSED SCOPE LIMIT (not a bug): only BUILDINGS morph continuously. Districts, roads,
// landmarks, and identity tethers snap to whichever snapshot the current scrub PAIR's "to" side
// is -- they are rebuilt (not interpolated) each time the pair changes. Two reasons, both from the
// P3 merge report: (1) district-level treemap reflow is unstable by contract (squarify is pinned
// "fixed" in docs/CONTRACT-city-json.md) so a smooth district morph would imply a stability the
// layout doesn't have; (2) roads/landmarks/tethers are keyed off a SINGLE city's own building ids
// and have no defined meaning "50% between two different repo states". Buildings are the one thing
// PROJECT_IDEA.md Phase 4 actually asks to morph ("Buildings grow/shrink... Appear -> fade in...
// Disappear -> fade out / collapse") -- this module delivers exactly that, honestly scoped.
//
// Determinism/display-only (constraints 1 and 5): setPosition()/setLens() are pure functions of
// their arguments over already-loaded, already-validated CityModels -- no clock is read in this
// module. Every MorphedBuilding used here is discarded after being applied to a mesh instance;
// nothing computed in a frame is ever written back to a CityModel.

import * as THREE from "three";
import type { Building, CityModel } from "../types.ts";
import {
  buildDistricts,
  buildProfileGeometry,
  buildingColor,
  profileByName,
  styleProfile,
  type ProfileName,
} from "./buildings.ts";
import { buildRoads } from "./roads.ts";
import { buildLandmarks } from "./landmarks.ts";
import { buildTethers } from "./tethers.ts";
import { morphBuilding, type MorphedBuilding } from "./morph.ts";
import {
  computeCityLensRanks,
  DEFAULT_LENS,
  lensColorHSL,
  lensHeightScale,
  rankForLens,
  type LensId,
} from "./lenses.ts";
import { compareCodepoints } from "../util/compare.ts";

export interface TimelineSnapshot {
  month: string;
  date: string;
  city: CityModel;
  /** See src/types.ts TimelineEntry.gapBefore -- carried through unchanged. */
  gapBefore: boolean;
}

export interface TimelineHandle {
  /** Add this once to the scene -- its children are replaced in place as the pair changes. */
  group: THREE.Group;
  /**
   * Sets the scrub position, in snapshot-INDEX units: 0 is `snapshots[0]`, `snapshots.length - 1`
   * is the last entry, and any value between two adjacent indices morphs between them. Values
   * outside [0, length-1] are clamped -- a slider bound to that same range can never send an
   * out-of-range position.
   */
  setPosition(globalT: number): void;
  /** Independent of setPosition (acceptance criterion 4): switching the lens re-applies to
   *  whatever pair/t is already active without touching either. */
  setLens(lens: LensId): void;
  currentLens(): LensId;
  /** True when the CURRENT scrub position sits strictly between two snapshots whose months are
   *  not calendar-consecutive -- i.e. inside a real gap in the underlying history. The renderer
   *  hard-cuts (never interpolates) across a gap; see setPosition's implementation doc. */
  isInGap(): boolean;
  /**
   * NEVER-FABRICATE (defect 2, Lane E): true when the snapshot nearest the current scrub
   * position -- the same "from" / "to" side currentDate() reads off for its own halfway split --
   * has zero buildings. An empty ground plane at that position is indistinguishable from "this
   * repo genuinely had no tracked source yet" and "this snapshot failed to load / was never
   * measured" unless the viewer is told explicitly; this is that disclosure's source of truth, so
   * the UI can never render silence as a plausible-looking quiet city.
   */
  isEmptySnapshot(): boolean;
  /** The date a viewer should read as "what moment is this" (acceptance criterion 3) -- a smooth
   *  interpolated instant while morphing between two known snapshots, or the frozen boundary date
   *  while isInGap() is true (see implementation doc: gap dates never lie about precision). */
  currentDate(): string;
  buildingCenter(id: string): THREE.Vector3 | null;
  resolveBuildingId(mesh: THREE.Object3D, instanceId: number | undefined): string | null;
  dispose(): void;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Resolved (pairIndex, localT, isGap) for a clamped global scrub position. Pure, tested directly
 *  (tests/timeline.test.ts) so the index-math/gap-freeze logic doesn't need a THREE.js scene to
 *  verify. */
export function resolveScrubPosition(
  globalT: number,
  count: number,
): { pairIndex: number; localT: number; isGap: boolean } {
  if (count <= 1) return { pairIndex: 0, localT: 0, isGap: false };
  const clamped = Math.min(count - 1, Math.max(0, globalT));
  let pairIndex = Math.floor(clamped);
  let localT = clamped - pairIndex;
  if (pairIndex >= count - 1) {
    pairIndex = count - 2;
    localT = 1;
  }
  return { pairIndex, localT, isGap: false };
}

function staticBuildingCenter(city: CityModel): (id: string) => THREE.Vector3 | null {
  const centers = new Map<string, THREE.Vector3>();
  for (const b of city.buildings as Building[]) {
    centers.set(b.id, new THREE.Vector3(b.x + b.width / 2, b.height, b.y + b.depth / 2));
  }
  return (id: string) => centers.get(id) ?? null;
}

interface PairState {
  fromCity: CityModel;
  toCity: CityModel;
  fromById: Map<string, Building>;
  toById: Map<string, Building>;
  sortedIds: string[];
  meshes: THREE.InstancedMesh[];
  meshesGroup: THREE.Group;
  staticGroup: THREE.Group;
  instanceIndex: Map<string, { mesh: THREE.InstancedMesh; index: number; lightnessBias: number }>;
  meshOrder: Map<THREE.InstancedMesh, string[]>;
  buildingCenter: (id: string) => THREE.Vector3 | null;
}

function representativeStyle(fromB: Building | undefined, toB: Building | undefined): string {
  return (toB ?? fromB)!.style;
}

function buildPairState(fromCity: CityModel, toCity: CityModel): PairState {
  const fromById = new Map((fromCity.buildings as Building[]).map((b) => [b.id, b] as const));
  const toById = new Map((toCity.buildings as Building[]).map((b) => [b.id, b] as const));

  const ids = new Set<string>();
  for (const id of fromById.keys()) ids.add(id);
  for (const id of toById.keys()) ids.add(id);
  const sortedIds = [...ids].sort(compareCodepoints);

  const byProfile = new Map<ProfileName, string[]>();
  for (const id of sortedIds) {
    const style = representativeStyle(fromById.get(id), toById.get(id));
    const profileName = styleProfile(style).name;
    const list = byProfile.get(profileName) ?? [];
    list.push(id);
    byProfile.set(profileName, list);
  }

  const meshes: THREE.InstancedMesh[] = [];
  const meshOrder = new Map<THREE.InstancedMesh, string[]>();
  const instanceIndex = new Map<string, { mesh: THREE.InstancedMesh; index: number; lightnessBias: number }>();
  const meshesGroup = new THREE.Group();
  meshesGroup.name = "timeline-buildings";

  for (const [profileName, list] of byProfile) {
    const profile = profileByName(profileName);
    const geometry = buildProfileGeometry(profile);
    const material = new THREE.MeshStandardMaterial({
      roughness: profile.roughness,
      metalness: profile.metalness,
      vertexColors: true,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, list.length);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.name = `timeline-buildings:${profileName}`;

    list.forEach((id, i) => {
      instanceIndex.set(id, { mesh, index: i, lightnessBias: profile.lightnessBias });
    });
    meshOrder.set(mesh, list);
    meshes.push(mesh);
    meshesGroup.add(mesh);
  }

  // Static layers (districts/roads/landmarks/tethers) snap to the "to" snapshot -- see this
  // module's header doc for why they don't morph.
  const staticGroup = new THREE.Group();
  staticGroup.name = "timeline-static";
  const toBuildingCenter = staticBuildingCenter(toCity);
  staticGroup.add(buildDistricts(toCity));
  staticGroup.add(buildRoads(toCity, toBuildingCenter).group);
  staticGroup.add(buildLandmarks(toCity));
  staticGroup.add(buildTethers(toCity, toBuildingCenter));

  return {
    fromCity,
    toCity,
    fromById,
    toById,
    sortedIds,
    meshes,
    meshesGroup,
    staticGroup,
    instanceIndex,
    meshOrder,
    buildingCenter: toBuildingCenter,
  };
}

function disposePairState(pair: PairState | null): void {
  if (!pair) return;
  for (const mesh of pair.meshes) {
    mesh.geometry.dispose();
    (mesh.material as THREE.Material).dispose();
  }
  pair.meshesGroup.clear();
  pair.staticGroup.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry?.dispose?.();
      const mat = obj.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    }
  });
}

function applyMorphInstance(
  dummy: THREE.Object3D,
  mesh: THREE.InstancedMesh,
  index: number,
  frame: MorphedBuilding,
  lens: LensId,
  rank: number,
  lightnessBias: number,
): void {
  const heightScale = lensHeightScale(lens, rank);
  // Presence floors at a small-but-nonzero factor -- InstancedMesh requires a nonzero scale, and
  // a floor near-invisible-but-not-literally-zero avoids a degenerate/NaN transform while still
  // reading as "basically gone" at the fade's tail end.
  const presenceScale = Math.max(0.02, frame.presence);
  const scaledHeight = Math.max(0.05, frame.height * heightScale * presenceScale);
  const scaledWidth = Math.max(0.05, frame.width * presenceScale);
  const scaledDepth = Math.max(0.05, frame.depth * presenceScale);

  // Center stays fixed at the frame's own footprint center regardless of presenceScale, so an
  // appearing/vanishing building grows from / shrinks to its own center point, not a corner.
  const cx = frame.x + frame.width / 2;
  const cz = frame.y + frame.depth / 2;
  const cy = scaledHeight / 2;
  dummy.position.set(cx, cy, cz);
  dummy.scale.set(scaledWidth, scaledHeight, scaledDepth);
  dummy.rotation.set(0, 0, 0);
  dummy.updateMatrix();
  mesh.setMatrixAt(index, dummy.matrix);

  const hsl = lensColorHSL(lens, rank);
  const base = hsl
    ? new THREE.Color().setHSL(hsl.hue, hsl.sat, THREE.MathUtils.clamp(hsl.light + lightnessBias, 0.05, 0.92))
    : buildingColor(frame, lightnessBias);
  // A second, color-channel fade cue on top of the geometric shrink (InstancedMesh shares one
  // material per group, so true per-instance alpha isn't available here -- same limitation
  // buildings.ts's occupancy-brightening comment documents for emissiveIntensity).
  base.multiplyScalar(THREE.MathUtils.clamp(frame.presence, 0.12, 1));
  mesh.setColorAt(index, base);
}

export function buildTimeline(snapshots: readonly TimelineSnapshot[], initialLens: LensId = DEFAULT_LENS): TimelineHandle {
  if (snapshots.length === 0) {
    throw new Error("buildTimeline requires at least one snapshot");
  }

  const group = new THREE.Group();
  group.name = "timeline";
  const dummy = new THREE.Object3D();

  let activeLens: LensId = initialLens;
  let pair: PairState | null = null;
  let pairIndex = -1;
  let localT = 0;
  let inGap = false;

  function rebuildPair(idx: number): void {
    disposePairState(pair);
    if (pair) group.remove(pair.meshesGroup, pair.staticGroup);
    const from = snapshots[idx];
    const to = snapshots[idx + 1] ?? snapshots[idx];
    pair = buildPairState(from.city, to.city);
    group.add(pair.meshesGroup);
    group.add(pair.staticGroup);
  }

  function applyFrame(): void {
    if (!pair) return;
    const effectiveT = inGap ? (localT < 0.5 ? 0 : 1) : localT;
    const frames: MorphedBuilding[] = [];
    for (const id of pair.sortedIds) {
      const frame = morphBuilding(pair.fromById.get(id), pair.toById.get(id), effectiveT);
      if (frame) frames.push(frame);
    }
    const ranks = computeCityLensRanks(frames);
    const touched = new Set<THREE.InstancedMesh>();
    for (const frame of frames) {
      const entry = pair.instanceIndex.get(frame.id);
      if (!entry) continue;
      const rank = rankForLens(activeLens, {
        complexityRank: ranks.complexityRank.get(frame.id) ?? 0,
        churnRank: ranks.churnRank.get(frame.id) ?? 0,
      });
      applyMorphInstance(dummy, entry.mesh, entry.index, frame, activeLens, rank, entry.lightnessBias);
      touched.add(entry.mesh);
    }
    for (const mesh of touched) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }

  // Force the first setPosition call to rebuild (pairIndex starts at an impossible -1).
  rebuildPair(0);
  pairIndex = 0;

  function setPosition(globalT: number): void {
    const resolved = resolveScrubPosition(globalT, snapshots.length);
    const toEntry = snapshots[resolved.pairIndex + 1] ?? snapshots[resolved.pairIndex];
    const gap = snapshots.length > 1 && toEntry.gapBefore && resolved.pairIndex + 1 < snapshots.length;

    if (resolved.pairIndex !== pairIndex) {
      rebuildPair(resolved.pairIndex);
      pairIndex = resolved.pairIndex;
    }
    localT = resolved.localT;
    inGap = gap && localT > 0 && localT < 1;
    applyFrame();
  }

  function setLens(lens: LensId): void {
    activeLens = lens;
    applyFrame();
  }

  function currentLens(): LensId {
    return activeLens;
  }

  function isInGap(): boolean {
    return inGap;
  }

  function currentDate(): string {
    const from = snapshots[pairIndex];
    const to = snapshots[pairIndex + 1] ?? snapshots[pairIndex];
    if (inGap) {
      // A gap has no real instant inside it -- reading the interpolated date as precise would
      // fabricate a moment nothing in the underlying history actually reaches. Freeze to whichever
      // boundary the hard-cut in applyFrame() landed on, so the HUD's date always matches what's
      // actually rendered.
      return localT < 0.5 ? from.date : to.date;
    }
    const fromMs = Date.parse(from.date);
    const toMs = Date.parse(to.date);
    if (Number.isNaN(fromMs) || Number.isNaN(toMs)) return to.date;
    return new Date(lerp(fromMs, toMs, localT)).toISOString();
  }

  function isEmptySnapshot(): boolean {
    // Same halfway split currentDate() uses to pick which side's date is "closest" -- keeps the
    // disclosure in sync with whatever date/month the HUD is already showing, rather than a
    // second, independently-computed notion of "which snapshot is this".
    const from = snapshots[pairIndex];
    const to = snapshots[pairIndex + 1] ?? snapshots[pairIndex];
    const nearest = localT < 0.5 ? from : to;
    return nearest.city.buildings.length === 0;
  }

  function buildingCenter(id: string): THREE.Vector3 | null {
    return pair ? pair.buildingCenter(id) : null;
  }

  function resolveBuildingId(mesh: THREE.Object3D, instanceId: number | undefined): string | null {
    if (!pair || instanceId === undefined) return null;
    const list = pair.meshOrder.get(mesh as THREE.InstancedMesh);
    return list?.[instanceId] ?? null;
  }

  function dispose(): void {
    disposePairState(pair);
    group.clear();
  }

  // Initial application at t=0.
  applyFrame();

  return {
    group,
    setPosition,
    setLens,
    currentLens,
    isInGap,
    isEmptySnapshot,
    currentDate,
    buildingCenter,
    resolveBuildingId,
    dispose,
  };
}
