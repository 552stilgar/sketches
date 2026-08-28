// renderer: CityModel roads -> tiered LineSegments between building centers.
//
// Road.weight is structural edge multiplicity, emitted by the compiler (docs/CONTRACT-city-json.md,
// "Road weight"). The compiler emits weights; this module owns everything derived from them --
// including which visual TIER a road renders as. Tiering is STATIC ONLY (PROJECT_IDEA.md 5.5):
// opacity + colour per tier, no animation, no clock, no per-frame state.

import * as THREE from "three";
import type { CityModel, Road } from "../types.ts";

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
 * Builds one Group containing at most one LineSegments per tier that actually has roads (so a
 * city with, say, no highways adds zero draw calls for that tier rather than an empty one).
 * Each segment runs between the two referenced buildings' world centers, slightly above ground
 * so it doesn't z-fight the district rects. Roads whose endpoints aren't resolvable (shouldn't
 * happen post-validateCity, but defensive) are skipped rather than throwing.
 */
export function buildRoads(
  city: CityModel,
  buildingCenter: (id: string) => THREE.Vector3 | null,
): THREE.Group {
  const ROAD_Y = 0.6;
  const roads = city.roads as Road[];

  const boundaries = computeRoadTierBoundaries(roads.map((r) => r.weight));
  const positionsByTier: Record<RoadTier, number[]> = {
    footpath: [],
    street: [],
    arterial: [],
    highway: [],
  };

  for (const r of roads) {
    const from = buildingCenter(r.from);
    const to = buildingCenter(r.to);
    if (!from || !to) continue;
    const tier = roadTier(r.weight, boundaries);
    positionsByTier[tier].push(from.x, ROAD_Y, from.z, to.x, ROAD_Y, to.z);
  }

  const group = new THREE.Group();
  group.name = "roads";

  for (const tier of ROAD_TIERS) {
    const positions = positionsByTier[tier];
    if (positions.length === 0) continue;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

    const style = TIER_STYLE[tier];
    const material = new THREE.LineBasicMaterial({
      color: style.color,
      transparent: true,
      opacity: style.opacity,
    });

    const lines = new THREE.LineSegments(geometry, material);
    lines.name = `roads-${tier}`;
    group.add(lines);
  }

  return group;
}
