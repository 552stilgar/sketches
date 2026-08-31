import type { Building } from "../types.ts";

/**
 * Target median aspect ratio (height / min(width, depth)) that `normalizedHeightScale` solves
 * for. 3.7 is not an arbitrary constant -- it is the ratio Usul's 2026-08-30 heightScale=0.5
 * ruling actually produced on the 631-building merged-trio city (see BASE_HEIGHT_SCALE_DEFAULT
 * in buildings.ts for the full rendered-variant history behind that ruling). This module does
 * not revisit that ruling; it makes it portable. A FIXED heightScale constant cannot hold a
 * fixed aspect ratio across city sizes: height is absolute (LOC-derived) while footprint is a
 * share of a fixed 1000x1000 canvas, so footprint shrinks as building count grows and the same
 * heightScale produces a WORSE (taller-relative) silhouette on a bigger city. Measured on two
 * real cities:
 *   merged-trio (631 buildings):  median footprint 8.08, median height 52.4, median aspect  6.5
 *   usul-mgmt   (1108 buildings): median footprint 3.69, median height 52.4, median aspect 14.2
 * Median height is identical; median footprint halved. At the ruled heightScale=0.5, usul-mgmt's
 * median silhouette comes out to 8.8:1 -- worse than the 7.4:1 that triggered the ruling.
 */
export const TARGET_MEDIAN_ASPECT_DEFAULT = 3.7;

/**
 * Median aspect ratio (height / min(width, depth)) across `buildings` at a given `heightScale`.
 * Aspect for one building is `(building.height * heightScale) / Math.min(building.width, building.depth)`.
 * Pure function of its inputs -- no clock, no randomness.
 */
export function medianAspect(buildings: readonly Building[], heightScale: number): number {
  if (buildings.length === 0) {
    throw new Error("Cannot calculate median aspect for an empty building list");
  }
  if (!Number.isFinite(heightScale)) {
    throw new Error("heightScale must be finite");
  }

  const aspects = buildings.map((building) => {
    const footprint = Math.min(building.width, building.depth);
    if (!Number.isFinite(footprint) || footprint <= 0) {
      throw new Error(`Building ${building.id} must have a positive, finite footprint`);
    }
    if (!Number.isFinite(building.height)) {
      throw new Error(`Building ${building.id} must have a finite height`);
    }

    const aspect = (building.height * heightScale) / footprint;
    if (!Number.isFinite(aspect)) {
      throw new Error(`Building ${building.id} produced a non-finite aspect ratio`);
    }
    return aspect;
  });

  aspects.sort((a, b) => a - b);
  const middle = Math.floor(aspects.length / 2);
  if (aspects.length % 2 === 1) {
    return aspects[middle];
  }
  return aspects[middle - 1] / 2 + aspects[middle] / 2;
}

/**
 * Solves for the heightScale that puts `buildings`' median aspect ratio on `target` (default
 * TARGET_MEDIAN_ASPECT_DEFAULT), clamped to the usable band [0.25, 2.0] documented on
 * BASE_HEIGHT_SCALE_DEFAULT in buildings.ts (below ~0.25 massing stops reading as buildings at
 * all). Pure function of its inputs -- no clock, no randomness.
 *
 * Returns the resolved `scale`, whether it had to be `clamped` to stay in-band, and the
 * `medianAspect` that scale actually produces on `buildings` (equal to `target` when unclamped,
 * within a small tolerance).
 *
 * Throws on degenerate input (empty `buildings`, or any building with
 * `Math.min(width, depth) <= 0`) rather than returning a fabricated 1 / NaN / Infinity --
 * Failure Discipline LAW: never silently degrade.
 */
export function normalizedHeightScale(
  buildings: readonly Building[],
  target?: number,
): { scale: number; clamped: boolean; medianAspect: number } {
  const resolvedTarget = target ?? TARGET_MEDIAN_ASPECT_DEFAULT;
  if (!Number.isFinite(resolvedTarget)) {
    throw new Error("target must be finite");
  }

  const aspectPerUnitScale = medianAspect(buildings, 1);
  const idealScale = resolvedTarget / aspectPerUnitScale;
  if (Number.isNaN(idealScale)) {
    throw new Error("Cannot normalize an indeterminate aspect ratio");
  }

  const scale = Math.min(2, Math.max(0.25, idealScale));
  return {
    scale,
    clamped: idealScale < 0.25 || idealScale > 2,
    medianAspect: medianAspect(buildings, scale),
  };
}
