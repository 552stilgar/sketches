// renderer: Road.weight -> animated-flow parameters, shared by the Three.js and SVG paths.
//
// This is the V3 sibling of the tiering logic in roads.ts, and it exists for the same reason:
// two renderers must not each invent their own weight-to-visual mapping, or a road that reads
// as a highway in 3D reads as a footpath in 2D. roads.ts owns STATIC appearance (colour,
// opacity, stroke width); this module owns MOTION (direction, speed, dash density).
//
// Determinism (PROJECT_IDEA.md 3.2, 5.5): the compiler emits weights, the renderer owns
// animation. Every function here is a pure function of a static number. The clock enters at
// exactly one place -- `dashOffsetAt(params, elapsedSeconds)` -- and it is the caller's clock,
// never one read in here. No frame timing may ever appear in city.json.

import { computeRoadTierBoundaries, type RoadTierBoundaries } from "./roads.ts";

/**
 * Where a road's traffic number came from. PROJECT_IDEA.md 5.5, "never fabricate flow":
 * structurally-derived and measured runtime traffic must stay distinguishable, because
 * dark-because-nobody-measured is not dark-because-nothing-runs.
 *
 * Only "structural" is derivable today. "historical" (git co-change) and "measured"
 * (traffic.json sidecar) are declared here so the distinction is in the type system before the
 * data exists -- a renderer must never label imports-derived flow as measured.
 */
export type FlowProvenance = "structural" | "historical" | "measured";

/** UI label per provenance. Any surface that renders flow MUST show one of these, so the viewer
 * can never mistake structural traffic for observed runtime traffic. */
export const FLOW_PROVENANCE_LABEL: Record<FlowProvenance, string> = {
  structural: "structural (imports + calls)",
  historical: "historical (git co-change)",
  measured: "measured (runtime traces)",
};

export interface FlowParams {
  /**
   * Direction of motion, expressed against the Road's own endpoints. Roads are emitted as
   * `{from: importer, to: imported}` (docs/CONTRACT-city-json.md, "Road weight"), and 5.5 fixes
   * the default to DATA flow, not control flow: `A imports B` animates B -> A, results flowing
   * up out of the leaves toward the entry points. So motion always runs `to` -> `from`, and this
   * field says so explicitly rather than leaving each renderer to re-derive the sign.
   */
  direction: "to-from";
  /** Scene units per second the dash pattern travels. Monotone non-decreasing in weight. */
  speed: number;
  /** Dash period in scene units: shorter period = denser traffic. Monotone non-INcreasing in weight. */
  dashPeriod: number;
  /** Where this number came from. Renderers must surface it -- see FLOW_PROVENANCE_LABEL. */
  provenance: FlowProvenance;
}

// Bounds picked for legibility, not realism: below SPEED_MIN motion reads as a rendering
// artifact, above SPEED_MAX it reads as strobing. Both renderers work in city.json's 1000x1000
// coordinate space, so these are directly comparable across the 3D and SVG paths.
const SPEED_MIN = 6;
const SPEED_MAX = 42;
const DASH_PERIOD_MAX = 48;
const DASH_PERIOD_MIN = 14;

const UNWEIGHTED_DEFAULT = 1;

/**
 * Normalizes one weight to [0, 1] against THIS city's own distribution, anchored on the SAME q3
 * boundary the tiering uses -- so speed and thickness can never disagree about which roads are
 * the busy ones.
 *
 * Degenerate distributions collapse to 0, matching roadTier's behaviour of putting every road in
 * the lowest tier when there is no spread to derive tiers from. A city where every road carries
 * identical weight has no traffic structure, and rendering it as uniformly maximal flow would
 * fabricate exactly the signal 5.5 forbids inventing.
 */
export function normalizeWeight(
  weight: number | undefined,
  boundaries: RoadTierBoundaries,
): number {
  if (boundaries.q1 === boundaries.q3) return 0;
  const w = weight === undefined ? UNWEIGHTED_DEFAULT : weight;
  const span = boundaries.q3 - UNWEIGHTED_DEFAULT;
  if (span <= 0) return 0;
  return Math.min(1, Math.max(0, (w - UNWEIGHTED_DEFAULT) / span));
}

/**
 * The one weight -> motion mapping. Both renderers call this; neither may derive speed or
 * density any other way.
 */
export function flowParams(
  weight: number | undefined,
  boundaries: RoadTierBoundaries,
  provenance: FlowProvenance = "structural",
): FlowParams {
  const norm = normalizeWeight(weight, boundaries);
  return {
    direction: "to-from",
    speed: SPEED_MIN + norm * (SPEED_MAX - SPEED_MIN),
    dashPeriod: DASH_PERIOD_MAX - norm * (DASH_PERIOD_MAX - DASH_PERIOD_MIN),
    provenance,
  };
}

/** Convenience: derive boundaries for a whole city's roads, same call both renderers already
 * make for tiering. Re-exported here so a flow consumer needs one import, not two. */
export function flowBoundaries(weights: ReadonlyArray<number | undefined>): RoadTierBoundaries {
  return computeRoadTierBoundaries(weights);
}

/**
 * Dash offset at `elapsedSeconds`, monotonically increasing. Renderers map this to the visual
 * direction such that motion runs `to` -> `from` (see FlowParams.direction); an SVG <line> drawn
 * x1=from -> x2=to travels to->from when stroke-dashoffset increases, a Three.js line whose UVs
 * run from->to travels the same way when its offset uniform increases.
 *
 * Pure in `elapsedSeconds`: the clock belongs to the caller's animation loop. Wrapped to one
 * dash period so the value stays small over a long-running session instead of drifting into
 * float-precision mush.
 */
export function dashOffsetAt(params: FlowParams, elapsedSeconds: number): number {
  const travelled = params.speed * elapsedSeconds;
  const wrapped = travelled % params.dashPeriod;
  return wrapped < 0 ? wrapped + params.dashPeriod : wrapped;
}
