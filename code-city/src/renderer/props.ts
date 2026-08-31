// renderer: churn -> construction CRANE props (PROJECT_IDEA.md §5.2 "Temporal overlays": "Recent
// changes -> cranes / scaffolding"). This is the first prop kind; more temporal overlays land as
// siblings in this module later, not as forks of it.
//
// WHY A SEPARATE GEOMETRY CHANNEL (measured this session, not re-derived):
// Cranes CANNOT ride emissive. applyOccupancy (src/renderer/buildings.ts) already spends every
// instance's per-building brightness lerping toward a warm-white "lit window" target to encode
// structural liveness (fan-in), and buildBuildings groups instances into one InstancedMesh PER
// STYLE PROFILE -- one shared material per group -- so emissiveIntensity cannot carry a second,
// independent per-building signal at all even if it were free. Props (separate geometry, drawn
// alongside the instanced buildings rather than folded into them) are the only channel left that
// can encode churn without fighting occupancy for the same visual budget.
//
// WHY PERCENTILE RANK, NOT RAW CHURN:
// Churn on a real analyzed repo is long-tailed the same way complexity is (lenses.ts's own
// rationale) -- median 1, a handful of files far out in the tail. A raw-churn threshold (e.g.
// "churn > 0") would crane nearly every building in a real city (measured: 1015/1108 on
// usul-mgmt), which reads as "the whole city is under construction", i.e. no signal at all.
// Selection keys off CityLensRanks.churnRank (src/renderer/lenses.ts), already computed once per
// city the same way buildings.ts's own lens coloring does, so this module never re-derives a
// ranking buildings.ts and lenses.ts could disagree with.
//
// WHY STATIC (no per-frame update, no clock, no dash attributes):
// Motion in this city already means TRAFFIC (src/renderer/flow.ts's dash-offset animation on
// roads). An animated crane would assert flow where none exists -- the exact collision that
// forced tethers.ts's identity links to be static, solid, and dash-free (frozen decision D2,
// CONTRACTS.md). Cranes follow the same discipline for the same reason: this module builds
// geometry once and hands back a plain THREE.Group with no update/tick hook of any kind.
//
// NEVER-FABRICATE:
// - A flat churn distribution (every building tied) has no "most active" building to single out;
//   percentileRank collapses every tied value to rank 0.5 (lenses.ts), which sits below any
//   sane threshold, so selectCraneSites naturally returns zero sites rather than inventing a
//   ranking that doesn't exist in the data.
// - A building whose id is absent from `ranks.churnRank` (the defensive "ranks computed over a
//   different building set than `buildings`" case -- the same posture buildingCenter() in
//   buildings.ts takes toward a lookup miss) is UNMEASURED for this purpose and never gets a
//   crane, regardless of what its own metrics.churn says. Absence of a rank is not "rank 0".

import * as THREE from "three";
import type { Building } from "../types.ts";
import type { CityLensRanks } from "./lenses.ts";

/**
 * A prop is either a churn-driven CRANE (V5.2, above) or an age-driven SCAFFOLD (V5.4, below --
 * "new-file -> scaffolding" companion overlay). `span` only exists on "scaffold": it is the
 * building-footprint depth the scaffold's bracing needs to visually cover that face (see
 * selectScaffoldSites), and a crane has no equivalent -- its jib length is a fixed constant, not
 * derived from the building it stands beside.
 */
export type PropSpec =
  | {
      buildingId: string;
      kind: "crane";
      x: number;
      y: number;
      z: number;
      height: number;
    }
  | {
      buildingId: string;
      kind: "scaffold";
      x: number;
      y: number;
      z: number;
      height: number;
      span: number;
    };

/** Top decile by churn percentile rank -- the proposed default (PROJECT_IDEA.md §5.2 pairs
 *  "recent changes" with cranes as a SCARCE overlay, sitting alongside landmarks rather than
 *  papering the skyline). Chosen over, say, top-quartile because a real analyzed city's churn
 *  tail is steep enough (measured: usul-mgmt median 1 / max 67) that even the top quartile still
 *  reads as "most of downtown", where top-decile keeps cranes legible as "the hot spots" -- the
 *  same scarcity budget landmarks.ts's one-per-datastore convention spends. Exposed as a named
 *  option, not hardcoded, so a caller (or a future UI knob) can move it without touching this
 *  module's selection logic. */
export const DEFAULT_MIN_CRANE_RANK = 0.9;

/** How far a crane's jib rises above the RENDERED height of the building it stands beside, as a
 *  FRACTION of that height -- so a crane always reads as "taller than what it's building" at any
 *  building size and any massing scale, which is what makes it read as a machine working on that
 *  building rather than a mast that happens to be nearby.
 *
 *  Proportional, not absolute, and both halves of that were learned by measurement:
 *
 *  1. It must key off the SCALED height. buildBuildings() renders every building at
 *     `b.height * heightScale` (buildings.ts), so sizing from raw `b.height` floats a crane free
 *     of the skyline it belongs to -- on the real usul-mgmt city at the normalized scale 0.25,
 *     that put 95 safety-yellow masts at 4.27x the median rendered building (min 4.18, max 5.14),
 *     spending back exactly the scarcity the top-decile threshold buys.
 *  2. It must be a fraction, not world units. A fixed absolute clearance is a rounding error on a
 *     tall building and a tower on a short one: at 8 world units over a building rendered 2.5
 *     tall, the crane stands 4.2x its subject -- the same defect as (1), reached from the other
 *     direction, and NOT fixed by scaling alone. This is the quantity "derived from the building
 *     it attaches to, never a guessed absolute height" that this comment always claimed.
 *
 *  CRANE_STANDOFF below is deliberately NOT proportional -- see its own note. */
const CRANE_ROOFTOP_CLEARANCE_FRACTION = 0.25;

/** How far outside the building's own footprint the crane's mast stands -- a crane building INTO
 *  a structure would read as decoration growing out of the building, not a machine working beside
 *  it. Fixed standoff (not proportional to footprint) matches landmarks.ts's fixed TANK_BASE_*
 *  constants: a prop's own scale is derived from its subject's *signal* (here: nothing -- a crane
 *  doesn't scale with churn magnitude, only its PRESENCE does), not from unrelated geometry. */
const CRANE_STANDOFF = 4;

/**
 * Selects which buildings get a crane, keyed by churn percentile rank (never raw churn -- see
 * module header). Pure and order-preserving: iterates `buildings` in the order given and never
 * sorts or reorders, so two calls with the same `buildings` array and the same `ranks` produce
 * byte-identical PropSpec[] in the same order, satisfying DETERMINISM (CONTRACTS.md constraint 1)
 * without this module needing its own tie-break rule.
 *
 * A building is selected only if `ranks.churnRank` has an entry for its id AND that rank is >=
 * `opts.minRank` (default DEFAULT_MIN_CRANE_RANK). A missing rank entry is UNMEASURED, not
 * rank 0 -- it is skipped rather than defaulted, per NEVER-FABRICATE above.
 */
export function selectCraneSites(
  buildings: readonly Building[],
  ranks: CityLensRanks,
  opts?: { minRank?: number; heightScale?: number },
): PropSpec[] {
  const minRank = opts?.minRank ?? DEFAULT_MIN_CRANE_RANK;
  // Must match the scale buildBuildings() actually renders at (see
  // CRANE_ROOFTOP_CLEARANCE_FRACTION). Defaulting to 1 keeps an unscaled call honest rather than
  // guessing the viewer's resolved scale here.
  const heightScale = opts?.heightScale ?? 1;
  if (!Number.isFinite(heightScale) || heightScale <= 0) {
    throw new Error(`selectCraneSites: heightScale must be a finite positive number, got ${heightScale}`);
  }
  const specs: PropSpec[] = [];

  for (const b of buildings) {
    const rank = ranks.churnRank.get(b.id);
    if (rank === undefined) continue; // unmeasured for this ranking -- never fabricate a rank
    if (rank < minRank) continue;

    // Standing beside the footprint's +x edge, vertically centered on its depth -- a fixed,
    // deterministic corner choice (not "nearest empty space", which would need scene-wide
    // knowledge this pure function deliberately doesn't have).
    const x = b.x + b.width + CRANE_STANDOFF;
    const z = b.y + b.depth / 2;
    const height = b.height * heightScale * (1 + CRANE_ROOFTOP_CLEARANCE_FRACTION);

    specs.push({ buildingId: b.id, kind: "crane", x, y: 0, z, height });
  }

  return specs;
}

// -------------------------------------------------------------------------------------------
// new-file -> SCAFFOLDING props (V5.4, sibling overlay to the churn -> crane props above).
// Cranes mean churn (ongoing change); scaffolds mean youth (recent creation). A building can
// legitimately have both -- an actively-churning file that was also only just added -- so
// selection and geometry both have to keep the two readable and non-colliding at once (see
// CRANE_STANDOFF's +x placement above vs. SCAFFOLD_STANDOFF's -x placement below).
// -------------------------------------------------------------------------------------------

/**
 * How recent counts as "recently added", in days before `RepoGraph.headDate`. Deliberately equal
 * to `ANALYSIS_WINDOW_DAYS` (src/analyzer/git.ts) rather than an independently-chosen number: that
 * constant's own doc comment already states the reason this module inherits verbatim -- "a city
 * that showed 90 days of churn beside 30 days of ruins would be reading two different pasts at
 * once". Scaffolding is a third temporal overlay in the same city; picking any other window here
 * would make it the one signal disagreeing with churn and ruins about what "recent" means.
 *
 * NOT imported from src/analyzer/git.ts directly: that module's top-level `import
 * "node:child_process"` is fine in the analyzer/CLI runtime but is never meant to reach the
 * browser bundle this renderer module ships in. Restated as a literal instead, with this comment
 * as the drift guard -- tests/props-scaffold.test.ts pins the value equal to
 * `ANALYSIS_WINDOW_DAYS` directly so the two cannot silently diverge.
 */
export const DEFAULT_MAX_SCAFFOLD_AGE_DAYS = 90;

/** How far outside the building's own footprint the scaffold's frame stands -- deliberately
 *  smaller than CRANE_STANDOFF: real scaffolding hugs the facade it wraps, while a crane works
 *  from a standoff distance. A crane (when present) attaches at the footprint's +x edge (see
 *  above); a scaffold attaches at the -x edge -- opposite sides by construction, so the two props
 *  can never occupy the same space on a building that has both. */
const SCAFFOLD_STANDOFF = 1.5;

/**
 * Selects which buildings get scaffolding, keyed by `metrics.age` directly (not a percentile
 * rank, unlike churn -- "recently added" is a plain HEAD-anchored day count, not a
 * distribution-relative notion the way "unusually high churn" is). A building is selected only if
 * `metrics.age` is present AND at/below `opts.maxAgeDays` (default DEFAULT_MAX_SCAFFOLD_AGE_DAYS).
 *
 * A missing `metrics.age` (a city.json compiled before this field shipped, see
 * BuildingMetrics.age's doc comment in src/types.ts) is UNMEASURED, not age 0 -- it is skipped
 * rather than defaulted, per NEVER-FABRICATE (same discipline selectCraneSites gives a missing
 * churn rank).
 *
 * Pure and order-preserving, same determinism posture as selectCraneSites: iterates `buildings`
 * in the order given, never sorts or reorders.
 */
export function selectScaffoldSites(
  buildings: readonly Building[],
  opts?: { maxAgeDays?: number; heightScale?: number },
): PropSpec[] {
  const maxAgeDays = opts?.maxAgeDays ?? DEFAULT_MAX_SCAFFOLD_AGE_DAYS;
  // Same "must match the scale buildBuildings() actually renders at" reasoning as
  // selectCraneSites's heightScale -- see that function's comment.
  const heightScale = opts?.heightScale ?? 1;
  if (!Number.isFinite(heightScale) || heightScale <= 0) {
    throw new Error(`selectScaffoldSites: heightScale must be a finite positive number, got ${heightScale}`);
  }
  const specs: PropSpec[] = [];

  for (const b of buildings) {
    const age = b.metrics.age;
    if (age === undefined) continue; // unmeasured -- never fabricate an age
    if (age > maxAgeDays) continue;

    // Standing beside the footprint's -x edge, vertically centered on its depth -- the mirror
    // image of selectCraneSites's +x placement, so a crane and a scaffold on the same building
    // never occupy the same ground.
    const x = b.x - SCAFFOLD_STANDOFF;
    const z = b.y + b.depth / 2;
    // Unlike a crane (which must tower ABOVE its subject to read as "working on" it), scaffolding
    // wraps the structure being built and so is sized to match it, never exceed it.
    const height = b.height * heightScale;

    specs.push({ buildingId: b.id, kind: "scaffold", x, y: 0, z, height, span: b.depth });
  }

  return specs;
}

// -------------------------------------------------------------------------------------------
// Geometry -- unlit-free (MeshStandardMaterial), same lighting family as landmarks.ts's tanks:
// a crane is a physical object standing IN the city, not a diagram overlay like tethers.ts's
// links, so it takes scene lighting like any other structure.
// -------------------------------------------------------------------------------------------

// Safety-yellow -- deliberately outside buildings.ts's STYLE_HUES language palette, landmarks.ts's
// steel-blue tanks, and tethers.ts's amber (0xffb84d): a fourth, unambiguous hue so a crane is
// never mistaken for a datastore, a tether, or "just another building".
const CRANE_COLOR = new THREE.Color().setHSL(0.14, 0.9, 0.5);
const CRANE_MATERIAL_PARAMS = { roughness: 0.55, metalness: 0.4 } as const;

const MAST_WIDTH = 1.2;
const JIB_LENGTH = 14;
const COUNTER_JIB_LENGTH = 5;
const BEAM_THICKNESS = 0.9;

/** One crane's static lattice: a vertical mast from the ground to `height`, plus a horizontal jib
 *  and shorter counter-jib at the top -- the silhouette that reads as "tower crane" at city scale
 *  without needing a rigged/animated model. Every dimension here is either a fixed constant or a
 *  function of the single `height` this crane was given; nothing here reads a clock or a random
 *  source (DETERMINISM). */
function buildCraneMeshes(height: number): THREE.Object3D[] {
  const material = new THREE.MeshStandardMaterial({ color: CRANE_COLOR, ...CRANE_MATERIAL_PARAMS });

  const mast = new THREE.Mesh(new THREE.BoxGeometry(MAST_WIDTH, height, MAST_WIDTH), material);
  mast.position.y = height / 2;
  mast.castShadow = true;

  const jib = new THREE.Mesh(new THREE.BoxGeometry(JIB_LENGTH, BEAM_THICKNESS, BEAM_THICKNESS), material);
  jib.position.set(JIB_LENGTH / 2, height, 0);
  jib.castShadow = true;

  const counterJib = new THREE.Mesh(
    new THREE.BoxGeometry(COUNTER_JIB_LENGTH, BEAM_THICKNESS, BEAM_THICKNESS),
    material,
  );
  counterJib.position.set(-COUNTER_JIB_LENGTH / 2, height, 0);
  counterJib.castShadow = true;

  return [mast, jib, counterJib];
}

// Muted galvanized-steel grey for the frame, with a translucent safety-orange net panel -- both
// deliberately outside every hue already spoken for in this city (CRANE_COLOR's safety-yellow,
// buildings.ts's language palette, landmarks.ts's steel-blue, tethers.ts's amber 0xffb84d), and
// far enough from CRANE_COLOR specifically that a crane and a scaffold read as two different
// machines at normal camera distance, not two shades of the same "under construction" marker. The
// frame's boxy, evenly-stacked lattice (no jib, no counter-jib) is the other half of that
// distinction -- silhouette, not just hue, separates the two prop kinds.
const SCAFFOLD_FRAME_COLOR = new THREE.Color().setHSL(0, 0, 0.55);
const SCAFFOLD_FRAME_MATERIAL_PARAMS = { roughness: 0.7, metalness: 0.5 } as const;
const SCAFFOLD_NET_COLOR = new THREE.Color().setHSL(0.06, 0.85, 0.5);

const SCAFFOLD_POLE_WIDTH = 0.6;
const SCAFFOLD_BRACE_THICKNESS = 0.4;
/** Vertical spacing between horizontal braces -- a real scaffold's lift height. Fixed, not a
 *  fraction of `height`, so the lattice always reads as the same physical structure regardless of
 *  the building it's wrapping (same reasoning CRANE_STANDOFF's own doc gives for staying an
 *  absolute, not proportional). */
const SCAFFOLD_LIFT_HEIGHT = 6;
/** Net panel opacity -- translucent so it never fully occludes the building wall behind it,
 *  reading as safety netting rather than a solid second facade. */
const SCAFFOLD_NET_OPACITY = 0.35;

/**
 * One scaffold's static lattice: two vertical corner poles spanning `height`, evenly-spaced
 * horizontal braces between them every SCAFFOLD_LIFT_HEIGHT, and a translucent net panel behind
 * the poles -- the silhouette that reads as "wrapped in scaffolding" without a jib or any part of
 * buildCraneMeshes' vocabulary. `span` is the footprint depth this scaffold's frame covers (see
 * selectScaffoldSites). Every dimension is a fixed constant or a function of `height`/`span`;
 * nothing here reads a clock or a random source (DETERMINISM), matching buildCraneMeshes.
 */
function buildScaffoldMeshes(height: number, span: number): THREE.Object3D[] {
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: SCAFFOLD_FRAME_COLOR,
    ...SCAFFOLD_FRAME_MATERIAL_PARAMS,
  });
  const meshes: THREE.Object3D[] = [];

  const halfSpan = span / 2;
  for (const zOffset of [-halfSpan, halfSpan]) {
    const pole = new THREE.Mesh(
      new THREE.BoxGeometry(SCAFFOLD_POLE_WIDTH, height, SCAFFOLD_POLE_WIDTH),
      frameMaterial,
    );
    pole.position.set(0, height / 2, zOffset);
    pole.castShadow = true;
    meshes.push(pole);
  }

  // Horizontal braces at each lift, starting at the first full lift height above ground and never
  // above `height` itself -- a partial top lift is simply omitted rather than poking through the
  // roofline it's supposed to be scaffolding.
  for (let y = SCAFFOLD_LIFT_HEIGHT; y <= height; y += SCAFFOLD_LIFT_HEIGHT) {
    const brace = new THREE.Mesh(
      new THREE.BoxGeometry(SCAFFOLD_BRACE_THICKNESS, SCAFFOLD_BRACE_THICKNESS, span),
      frameMaterial,
    );
    brace.position.set(0, y, 0);
    brace.castShadow = true;
    meshes.push(brace);
  }

  const net = new THREE.Mesh(
    new THREE.PlaneGeometry(span, height),
    new THREE.MeshStandardMaterial({
      color: SCAFFOLD_NET_COLOR,
      transparent: true,
      opacity: SCAFFOLD_NET_OPACITY,
      side: THREE.DoubleSide,
    }),
  );
  net.rotation.y = Math.PI / 2;
  net.position.set(0, height / 2, 0);
  meshes.push(net);

  return meshes;
}

export interface BuiltProps {
  /** One tagged child Group per PropSpec -- add this to the scene, not the individual meshes. */
  group: THREE.Group;
  /** specs.length, echoed back so a caller doesn't need to keep the input array around just to
   *  know how many props got built (same convenience buildLandmarks' caller-side counting via
   *  city.landmarks.length doesn't need, since props aren't stored on CityModel at all). */
  count: number;
}

/**
 * Builds one tagged, STATIC Object3D per PropSpec. No clock is read, no per-frame update is
 * registered, and no update/tick function is exposed anywhere in this module's exports -- a
 * headless check can assert that structurally by inspecting this module's own export list, not
 * just by reading this comment.
 *
 * Discoverability convention (mirrors landmarks.ts's userData.landmarkId / tethers.ts's
 * userData.identityHash): the Object3D for each prop carries `userData.buildingId` on itself.
 */
export function buildProps(specs: readonly PropSpec[]): BuiltProps {
  const group = new THREE.Group();
  group.name = "props";

  for (const spec of specs) {
    const propGroup = new THREE.Group();
    propGroup.name = `${spec.kind}:${spec.buildingId}`;
    propGroup.userData.buildingId = spec.buildingId;
    propGroup.position.set(spec.x, spec.y, spec.z);

    const meshes = spec.kind === "crane" ? buildCraneMeshes(spec.height) : buildScaffoldMeshes(spec.height, spec.span);
    for (const mesh of meshes) propGroup.add(mesh);

    group.add(propGroup);
  }

  return { group, count: specs.length };
}
