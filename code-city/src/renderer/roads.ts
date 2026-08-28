// renderer: CityModel roads -> tiered LineSegments between building centers.
//
// Road.weight is structural edge multiplicity, emitted by the compiler (docs/CONTRACT-city-json.md,
// "Road weight"). The compiler emits weights; this module owns everything derived from them --
// including which visual TIER a road renders as (static: opacity + colour) and, as of V3, its
// animated FLOW (motion: dash speed/density/direction). The weight->motion mapping itself lives
// in ./flow.ts and is NOT reimplemented here -- this module is a consumer, same discipline as the
// tiering boundaries below.
//
// Determinism (PROJECT_IDEA.md 3.2, 5.5): city.json carries no clock. The animation offset is
// computed every frame by the caller (src/main.ts's rAF loop) from its own elapsed-seconds clock
// and flow.ts's dashOffsetAt(), then handed in here via updateFlow() -- this module never reads
// a clock itself.

import * as THREE from "three";
import type { CityModel, Road } from "../types.ts";
import {
  dashOffsetAt,
  flowBoundaries,
  flowParams,
  FLOW_PROVENANCE_LABEL,
  type FlowParams,
} from "./flow.ts";

// ---------------------------------------------------------------------------------------------
// Pure tiering logic -- unit-tested directly (tests/road-tiers.test.ts). Three.js code below is
// a thin consumer of computeRoadTierBoundaries/roadTier and must not encode any decision rule
// of its own beyond "which colour/opacity does this tier get".
// ---------------------------------------------------------------------------------------------

export type RoadTier = "footpath" | "street" | "arterial" | "highway";

/** Tiers in ascending visual weight -- also the fixed draw order (faint first, bright last). */
export const ROAD_TIERS: readonly RoadTier[] = ["footpath", "street", "arterial", "highway"];

export interface RoadTierBoundaries {
  /** Roads with (effective) weight <= q1 are "footpath". */
  q1: number;
  /** Roads with q1 < weight <= q2 are "street". */
  q2: number;
  /** Roads with q2 < weight <= q3 are "arterial"; weight > q3 is "highway". */
  q3: number;
}

/** A missing Road.weight is UNWEIGHTED, never zero traffic (PROJECT_IDEA.md 5.5) -- treat as 1. */
const UNWEIGHTED_DEFAULT = 1;

function effectiveWeight(weight: number | undefined): number {
  return weight === undefined ? UNWEIGHTED_DEFAULT : weight;
}

/**
 * Nearest-rank percentile over an ascending-sorted, non-empty array. `p` in [0, 1].
 * Deterministic: no interpolation, always returns an actual element of the input.
 */
function nearestRank(sorted: readonly number[], p: number): number {
  const rank = Math.min(sorted.length, Math.max(1, Math.ceil(p * sorted.length)));
  return sorted[rank - 1];
}

/**
 * Derives tier boundaries from THIS city's own road-weight distribution (25th/50th/75th
 * percentile, nearest-rank) rather than fixed magic-number thresholds. That's what lets a repo
 * whose heaviest road carries weight 3 still render a visually distinct top tier for its
 * structural hubs, instead of every road being dwarfed by a threshold tuned for a much larger
 * codebase and landing in "footpath" together.
 *
 * Degenerate inputs collapse deliberately, not by accident: zero roads or all-equal weights
 * produce q1 === q2 === q3, so every road lands in the lowest tier ("footpath") -- there is no
 * distribution to derive higher tiers from, and inventing spread would fabricate structure that
 * isn't in the data (the "never fabricate flow" constraint applies to the thresholds too).
 */
export function computeRoadTierBoundaries(weights: ReadonlyArray<number | undefined>): RoadTierBoundaries {
  if (weights.length === 0) {
    return { q1: UNWEIGHTED_DEFAULT, q2: UNWEIGHTED_DEFAULT, q3: UNWEIGHTED_DEFAULT };
  }
  const sorted = weights.map(effectiveWeight).sort((a, b) => a - b);
  return {
    q1: nearestRank(sorted, 0.25),
    q2: nearestRank(sorted, 0.5),
    q3: nearestRank(sorted, 0.75),
  };
}

/**
 * Classifies one road's weight into a tier given boundaries from computeRoadTierBoundaries.
 * `undefined` weight is treated as 1 (unweighted), matching computeRoadTierBoundaries.
 */
export function roadTier(weight: number | undefined, boundaries: RoadTierBoundaries): RoadTier {
  const w = effectiveWeight(weight);
  if (w <= boundaries.q1) return "footpath";
  if (w <= boundaries.q2) return "street";
  if (w <= boundaries.q3) return "arterial";
  return "highway";
}

// ---------------------------------------------------------------------------------------------
// Three.js consumer
// ---------------------------------------------------------------------------------------------

/** Colour + opacity per tier. Line width is unreliable across WebGL platforms, so tier reads
 * through colour/opacity alone: footpaths stay a faint haze, highways read as confident bright
 * trunks. */
const TIER_STYLE: Record<RoadTier, { color: number; opacity: number }> = {
  footpath: { color: 0x8fd0ff, opacity: 0.15 },
  street: { color: 0x8fd0ff, opacity: 0.35 },
  arterial: { color: 0xa9e4ff, opacity: 0.6 },
  highway: { color: 0xffffff, opacity: 0.9 },
};

/**
 * Fraction of each road's dashPeriod rendered "on" (bright) vs. "off" (gap), keyed by tier. This
 * is STATIC per-tier styling layered on top of flow.ts's continuous per-road speed/dashPeriod --
 * same division of ownership as TIER_STYLE's colour/opacity: flow.ts owns the weight->motion
 * numbers, this table owns how a tier reads visually. Chosen so a footpath and a highway are
 * unmistakable in motion even before their speed difference registers: a footpath shows sparse,
 * short ticks (reads as an occasional courier), a highway shows long, near-continuous dashes
 * (reads as constant heavy flow) -- distinct from arterial/street by more than just colour.
 */
const DASH_DUTY_CYCLE: Record<RoadTier, number> = {
  footpath: 0.15,
  street: 0.28,
  arterial: 0.45,
  highway: 0.7,
};

// Custom ShaderMaterial, not LineDashedMaterial: LineDashedMaterial's dashSize/gapSize/dashOffset
// are single scalars per MATERIAL, but flow.ts's speed and dashPeriod vary CONTINUOUSLY per road
// (by exact weight, not just by tier bucket) -- one material per tier can't represent that with a
// built-in dashed material. A per-vertex attribute can: aDistance/aDashPeriod are static (baked at
// build time from each road's own FlowParams), aOffset is the only thing that changes per frame,
// written by updateFlow() from dashOffsetAt(). This keeps the draw-call count identical to V2
// (one LineSegments per non-empty tier) while giving every road its own honest motion.
const FLOW_VERTEX_SHADER = `
  attribute float aDistance;
  attribute float aDashPeriod;
  attribute float aOffset;
  varying float vDistance;
  varying float vDashPeriod;
  varying float vOffset;
  void main() {
    vDistance = aDistance;
    vDashPeriod = aDashPeriod;
    vOffset = aOffset;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// phase = mod(distance + offset, dashPeriod): distance runs from->to (0 at the "from" endpoint),
// and offset grows with elapsed time, so a fragment near "to" (high distance) lights first and
// the lit band sweeps toward "from" (low distance) as offset increases -- the same to->from read
// as an SVG line drawn from->to with a growing stroke-dashoffset (see flow.ts's dashOffsetAt doc).
const FLOW_FRAGMENT_SHADER = `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uOpacity;
  uniform float uDutyCycle;
  varying float vDistance;
  varying float vDashPeriod;
  varying float vOffset;
  void main() {
    float phase = mod(vDistance + vOffset, vDashPeriod) / vDashPeriod;
    if (phase > uDutyCycle) discard;
    gl_FragColor = vec4(uColor, uOpacity);
  }
`;

interface TierBatch {
  /** One LineSegments per non-empty tier, sharing the tier's ShaderMaterial. */
  mesh: THREE.LineSegments;
  /** Per-vertex offset attribute this batch's shader reads; rewritten every updateFlow() call. */
  offsetAttribute: THREE.BufferAttribute;
  /** FlowParams for segment i in this batch, in append order -- segment i owns vertices 2i/2i+1
   * of offsetAttribute. */
  roadParams: FlowParams[];
}

export interface RoadsHandle {
  /** Add this to the scene -- one child LineSegments per tier that has roads. */
  group: THREE.Group;
  /** Roads with resolvable endpoints, i.e. the ones actually receiving animated flow. Exposed as
   * a concrete number (not "trust it's every road") for window.__test / browser-verify. */
  animatedRoadCount: number;
  /** Advances every road's dash offset to `elapsedSeconds` via flow.ts's dashOffsetAt() -- the
   * only place per-frame time enters this module. Call once per animation-loop tick. */
  updateFlow(elapsedSeconds: number): void;
  /** Current dash offset (scene units, wrapped to that road's own dashPeriod) of the road at flat
   * index `index` -- 0-based, in city.roads order filtered to resolvable endpoints. Null if out
   * of range. Exists so a headless check can assert flow is actually live without a screenshot. */
  dashOffsetOf(index: number): number | null;
  /** FLOW_PROVENANCE_LABEL for this wave's traffic. Always "structural" today -- V3 flow is
   * derived from imports[]/calls[] multiplicity, never measured runtime data (PROJECT_IDEA.md
   * 5.5, "never fabricate flow"). A UI legend and window.__test both read this one value so
   * neither can drift from the other. */
  provenanceLabel: string;
}

/**
 * Builds one Group containing at most one LineSegments per tier that actually has roads (so a
 * city with, say, no highways adds zero draw calls for that tier rather than an empty one), each
 * carrying its own live per-road flow animation. Each segment runs between the two referenced
 * buildings' world centers, slightly above ground so it doesn't z-fight the district rects. Roads
 * whose endpoints aren't resolvable (shouldn't happen post-validateCity, but defensive) are
 * skipped rather than throwing, and are not counted in animatedRoadCount.
 */
export function buildRoads(
  city: CityModel,
  buildingCenter: (id: string) => THREE.Vector3 | null,
): RoadsHandle {
  const ROAD_Y = 0.6;
  const roads = city.roads as Road[];

  const tierBoundaries = computeRoadTierBoundaries(roads.map((r) => r.weight));
  const flowBounds = flowBoundaries(roads.map((r) => r.weight));

  const positionsByTier: Record<RoadTier, number[]> = { footpath: [], street: [], arterial: [], highway: [] };
  const distancesByTier: Record<RoadTier, number[]> = { footpath: [], street: [], arterial: [], highway: [] };
  const dashPeriodByTier: Record<RoadTier, number[]> = { footpath: [], street: [], arterial: [], highway: [] };
  const paramsByTier: Record<RoadTier, FlowParams[]> = { footpath: [], street: [], arterial: [], highway: [] };

  // Flat, resolvable-only order (city.roads order, unresolvable roads skipped) -> which tier
  // batch and which segment within it holds this road. dashOffsetOf() walks this to answer "what
  // is road N doing right now" without the caller needing to know tiers exist.
  const flatOrder: { tier: RoadTier; segmentIndex: number }[] = [];

  for (const r of roads) {
    const from = buildingCenter(r.from);
    const to = buildingCenter(r.to);
    if (!from || !to) continue;

    const tier = roadTier(r.weight, tierBoundaries);
    const params = flowParams(r.weight, flowBounds);
    const dist = from.distanceTo(to);

    positionsByTier[tier].push(from.x, ROAD_Y, from.z, to.x, ROAD_Y, to.z);
    distancesByTier[tier].push(0, dist);
    dashPeriodByTier[tier].push(params.dashPeriod, params.dashPeriod);

    flatOrder.push({ tier, segmentIndex: paramsByTier[tier].length });
    paramsByTier[tier].push(params);
  }

  const group = new THREE.Group();
  group.name = "roads";
  const batches: TierBatch[] = [];

  for (const tier of ROAD_TIERS) {
    const positions = positionsByTier[tier];
    if (positions.length === 0) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute("aDistance", new THREE.Float32BufferAttribute(distancesByTier[tier], 1));
    geometry.setAttribute("aDashPeriod", new THREE.Float32BufferAttribute(dashPeriodByTier[tier], 1));
    const offsetAttribute = new THREE.Float32BufferAttribute(new Float32Array(positions.length / 3), 1);
    geometry.setAttribute("aOffset", offsetAttribute);

    const style = TIER_STYLE[tier];
    const material = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(style.color) },
        uOpacity: { value: style.opacity },
        uDutyCycle: { value: DASH_DUTY_CYCLE[tier] },
      },
      vertexShader: FLOW_VERTEX_SHADER,
      fragmentShader: FLOW_FRAGMENT_SHADER,
      transparent: true,
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.name = `roads-${tier}`;
    group.add(lines);

    batches.push({ mesh: lines, offsetAttribute, roadParams: paramsByTier[tier] });
  }

  function batchForTier(tier: RoadTier): TierBatch | undefined {
    return batches.find((b) => b.mesh.name === `roads-${tier}`);
  }

  function updateFlow(elapsedSeconds: number): void {
    for (const batch of batches) {
      const arr = batch.offsetAttribute.array as Float32Array;
      for (let i = 0; i < batch.roadParams.length; i++) {
        const offset = dashOffsetAt(batch.roadParams[i], elapsedSeconds);
        arr[i * 2] = offset;
        arr[i * 2 + 1] = offset;
      }
      batch.offsetAttribute.needsUpdate = true;
    }
  }

  function dashOffsetOf(index: number): number | null {
    const entry = flatOrder[index];
    if (!entry) return null;
    const batch = batchForTier(entry.tier);
    if (!batch) return null;
    const arr = batch.offsetAttribute.array as Float32Array;
    return arr[entry.segmentIndex * 2] ?? null;
  }

  return {
    group,
    animatedRoadCount: flatOrder.length,
    updateFlow,
    dashOffsetOf,
    provenanceLabel: FLOW_PROVENANCE_LABEL.structural,
  };
}
