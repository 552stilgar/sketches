// renderer: two CityModels + a scrub position -> DISPLAY-ONLY interpolated building frames
// (PROJECT_IDEA.md Phase 4/§5.2, "timeline morph"). This is the pure half of Lane F's timeline
// scrub, same split as flow.ts (weight -> motion) and lenses.ts (metrics -> color/height): every
// function here is a pure function of two static CityModels and a number, no clock, no THREE.js,
// no I/O -- so it is testable without a scene and reusable from any renderer that wants a morph.
//
// DISPLAY ONLY (constraint 5, "never persist an interpolated value"): a MorphedBuilding is not a
// Building and is never coerced into one. It exists to be handed to a Three.js instance update
// for one rendered frame and then discarded -- it is never written to disk, never fed back into
// compileCity, and has no CityModel-shaped container it could accidentally be mistaken for
// (deliberately: no `MorphedCity` type wrapping districts/roads/landmarks around this array).
//
// Never-fabricate, extended to time (constraint 6, see also src/compiler/sequence.ts's doc
// comment): this module has NO concept of "gap". It always interpolates between whatever two
// CityModels it is given -- the caller (src/renderer/timeline.ts) is the one that must consult
// TimelineEntry.gapBefore and refuse to call morphBuildings() across a gapped pair. Baking the gap
// check in here would let a caller "accidentally" get an honest interpolation across a span the
// data says has no history -- the check belongs one layer up, where the manifest is in scope.

import type { Building, BuildingMetrics, CityModel } from "../types.ts";
import { compareCodepoints } from "../util/compare.ts";

export interface MorphedBuilding {
  id: string;
  x: number;
  y: number;
  width: number;
  depth: number;
  height: number;
  style: string;
  metrics: BuildingMetrics;
  /**
   * Materialization factor, [0, 1] -- 1 for a building present on both sides of the interpolation
   * (or interpolating between two present states), ramping 0 -> 1 for a building APPEARING
   * between `from` and `to`, and 1 -> 0 for one VANISHING. A renderer maps this to scale/color
   * intensity (PROJECT_IDEA.md Phase 4: "Appear -> fade in", "Disappear -> fade out / collapse")
   * -- it is not itself a visual unit (not an opacity, not a scale), just the [0,1] progress a
   * renderer's own fade mapping consumes.
   */
  presence: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpMetrics(a: BuildingMetrics, b: BuildingMetrics, t: number): BuildingMetrics {
  return {
    loc: lerp(a.loc, b.loc, t),
    complexity: lerp(a.complexity, b.complexity, t),
    churn: lerp(a.churn, b.churn, t),
  };
}

/**
 * Morphs one building's `from` state toward its `to` state at position `t` (clamped to [0,1]).
 * `from`/`to` are matched by BUILDING ID by the caller (morphBuildings, below) -- id stability
 * across snapshots is the layout-stability contract Lane E's path-keyed slots exist to provide
 * (docs/CONTRACT-city-json.md; see also the P3 merge report's caveat that this holds WITHIN a
 * district, not across a whole district reflow -- a morph can still show real district-level
 * motion between two snapshots, which is honest, not a rendering bug).
 *
 * - Present on both sides: every geometry/metric field lerps toward `to`; presence stays 1.
 * - Present only in `to` (appearing): geometry/metrics are `to`'s own, UNCHANGED across t -- there
 *   is no `from` position to grow out of spatially, so this never invents one. Only `presence`
 *   ramps 0 -> 1, for the renderer's fade-in.
 * - Present only in `from` (vanishing): the mirror image -- `from`'s own fixed geometry, presence
 *   ramps 1 -> 0.
 * - Present in neither: null (the caller's union loop never actually reaches this case, but the
 *   signature stays honest about it rather than asserting non-null on the caller's behalf).
 */
export function morphBuilding(from: Building | undefined, to: Building | undefined, t: number): MorphedBuilding | null {
  const ct = Math.min(1, Math.max(0, t));

  if (from && to) {
    return {
      id: to.id,
      x: lerp(from.x, to.x, ct),
      y: lerp(from.y, to.y, ct),
      width: lerp(from.width, to.width, ct),
      depth: lerp(from.depth, to.depth, ct),
      height: lerp(from.height, to.height, ct),
      style: ct < 0.5 ? from.style : to.style,
      metrics: lerpMetrics(from.metrics, to.metrics, ct),
      presence: 1,
    };
  }
  if (!from && to) {
    return {
      id: to.id,
      x: to.x,
      y: to.y,
      width: to.width,
      depth: to.depth,
      height: to.height,
      style: to.style,
      metrics: { ...to.metrics },
      presence: ct,
    };
  }
  if (from && !to) {
    return {
      id: from.id,
      x: from.x,
      y: from.y,
      width: from.width,
      depth: from.depth,
      height: from.height,
      style: from.style,
      metrics: { ...from.metrics },
      presence: 1 - ct,
    };
  }
  return null;
}

/**
 * Morphs a WHOLE city's building set from `fromCity` toward `toCity` at `t`. The result set is
 * the UNION of both sides' building ids (a building present in only one side still gets a frame,
 * fading in/out per morphBuilding's doc) -- sorted by id via compareCodepoints for the same
 * determinism reason every other ordered emission in this codebase sorts explicitly rather than
 * trusting Map/Set insertion order (DESIGN.md's determinism section; see also
 * tests/compiler-determinism.test.ts).
 */
export function morphBuildings(fromCity: CityModel, toCity: CityModel, t: number): MorphedBuilding[] {
  const fromById = new Map(fromCity.buildings.map((b) => [b.id, b] as const));
  const toById = new Map(toCity.buildings.map((b) => [b.id, b] as const));

  const ids = new Set<string>();
  for (const id of fromById.keys()) ids.add(id);
  for (const id of toById.keys()) ids.add(id);
  const sortedIds = [...ids].sort(compareCodepoints);

  const result: MorphedBuilding[] = [];
  for (const id of sortedIds) {
    const frame = morphBuilding(fromById.get(id), toById.get(id), t);
    if (frame) result.push(frame);
  }
  return result;
}
