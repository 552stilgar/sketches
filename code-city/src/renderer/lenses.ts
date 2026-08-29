// renderer: city LENSES — alternate materials/color/height mappings over the SAME CityModel
// (docs/PROJECT_IDEA.md §5.3, Phase 5). Positions are compiler output and never move; a lens is
// purely a rendering-time reinterpretation of data that is already on the floor (Building.metrics
// .complexity / .churn, already compiled by compileCity — see src/types.ts BuildingMetrics).
//
// Everything in this file is a pure function of a static number/array: no clock, no randomness,
// no I/O (same discipline as flow.ts's weight -> motion mapping, and for the same reason — two
// call sites, buildings.ts's build path and its in-place setLens() update path, must never be
// able to disagree about what a lens means).
//
// PROVENANCE (PROJECT_IDEA.md §5.5, never-fabricate): complexity and churn are real analyzer
// output (structural/historical measurements, not guesses), so Complexity and Activity are
// legitimate lenses. Coverage/TODO-density do NOT exist anywhere in this pipeline today — there is
// no honest way to derive them from RepoGraph/CityModel — so Quality is not a measurement lens at
// all. It renders as an explicit UNMEASURED placeholder (flat, rank-independent) rather than a
// plausible-looking invented signal. That is a correct outcome under the hard constraint, not a
// TODO to fill in later without new analyzer data.

export type LensId = "architecture" | "complexity" | "activity" | "quality";

export interface LensDef {
  id: LensId;
  label: string;
  /** Whether this lens is backed by a real measured/structural signal. false only for "quality" —
   *  surfaced so any UI/legend can render an honest "UNMEASURED" badge instead of pretending the
   *  lens means something it doesn't. */
  measured: boolean;
  /** One-line description shown in the UI legend so a viewer never has to guess what a lens means
   *  or where its numbers came from. */
  description: string;
}

// Order is the UI's display order and the default lens is first — "today's look" per the
// acceptance criteria.
export const LENSES: readonly LensDef[] = [
  {
    id: "architecture",
    label: "Architecture",
    measured: true,
    description: "Language-derived style + structural liveness (default).",
  },
  {
    id: "complexity",
    label: "Complexity",
    measured: true,
    description: "Height + heat color by complexity percentile rank (structural, per-file).",
  },
  {
    id: "activity",
    label: "Activity",
    measured: true,
    description: "Height + heat color by churn percentile rank (historical, git commit count).",
  },
  {
    id: "quality",
    label: "Quality",
    measured: false,
    description: "UNMEASURED — no coverage/TODO-density signal exists in this pipeline yet.",
  },
];

export const DEFAULT_LENS: LensId = "architecture";

export function lensById(id: LensId): LensDef {
  const found = LENSES.find((l) => l.id === id);
  if (!found) throw new Error(`unknown lens id: ${id}`);
  return found;
}

// -------------------------------------------------------------------------------------------
// Percentile-rank scaling (pure, tested) — RANK-based, not linear, per the acceptance criteria:
// complexity and churn are long-tailed (a handful of hot files, a long flat tail of quiet ones),
// so a linear min-max map spends almost the whole visual range on a few outliers and leaves
// everything else looking identical. Rank-based scaling spends the range evenly across whatever
// buildings actually exist, regardless of how skewed the underlying values are.
// -------------------------------------------------------------------------------------------

/** Ascending copy of `values` — does not mutate the input (same discipline as buildings.ts's own
 *  p95()). Exported so a caller can compute this once per city and reuse it across every
 *  building, instead of re-sorting per lookup. */
export function sortedValues(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/**
 * Percentile rank of `value` within `sortedAscending` in [0, 1], using the mid-rank-of-ties
 * method: values tied with `value` share the midpoint of their combined rank span, so a city
 * where most files tie at the same value (e.g. churn=1) doesn't have that huge tied block
 * arbitrarily broken by insertion order (which would violate determinism) or all pinned to the
 * same edge of the range (which would waste the palette on the untied minority).
 *
 * A single-element or empty distribution has no meaningful "rank" — both return 0.5 (or 0 for
 * empty), the same "no spread to derive from" collapse flow.ts's normalizeWeight uses for a
 * degenerate distribution.
 */
export function percentileRank(value: number, sortedAscending: readonly number[]): number {
  const n = sortedAscending.length;
  if (n === 0) return 0;
  if (n === 1) return 0.5;
  let below = 0;
  let tied = 0;
  for (const v of sortedAscending) {
    if (v < value) below++;
    else if (v === value) tied++;
  }
  const midRank = below + (tied - 1) / 2;
  return midRank / (n - 1);
}

export interface CityLensRanks {
  /** Building id -> percentile rank [0,1] of BuildingMetrics.complexity within this city. */
  complexityRank: Map<string, number>;
  /** Building id -> percentile rank [0,1] of BuildingMetrics.churn within this city. */
  churnRank: Map<string, number>;
}

/** Building shape this module needs — kept minimal (not importing the full `Building` type) so
 *  this stays a leaf module callable from a plain metrics array in tests without constructing a
 *  full CityModel building. */
export interface RankableBuilding {
  id: string;
  metrics: { complexity: number; churn: number };
}

/**
 * Computes every building's percentile rank for complexity and churn, ONE PASS over the whole
 * city (each metric sorted once, not per building) — the reference distribution IS the city, same
 * pattern buildings.ts's p95()/fanInRef already establishes for occupancy.
 */
export function computeCityLensRanks(buildings: readonly RankableBuilding[]): CityLensRanks {
  const complexitySorted = sortedValues(buildings.map((b) => b.metrics.complexity));
  const churnSorted = sortedValues(buildings.map((b) => b.metrics.churn));
  const complexityRank = new Map<string, number>();
  const churnRank = new Map<string, number>();
  for (const b of buildings) {
    complexityRank.set(b.id, percentileRank(b.metrics.complexity, complexitySorted));
    churnRank.set(b.id, percentileRank(b.metrics.churn, churnSorted));
  }
  return { complexityRank, churnRank };
}

// -------------------------------------------------------------------------------------------
// Lens -> height scale (pure, tested)
// -------------------------------------------------------------------------------------------

// Floor keeps a rank-0 building from vanishing to a sliver; ceiling keeps a rank-1 building from
// dwarfing the district out of proportion. Neither bound depends on how many buildings exist.
const HEIGHT_SCALE_MIN = 0.35;
const HEIGHT_SCALE_MAX = 1.6;

/**
 * Height MULTIPLIER applied on top of the compiler-given building height — never a replacement
 * height, and never anything that touches x/y footprint (docs task: "Switching a lens changes
 * materials / colour / height scaling ONLY — never layout"). "architecture" and "quality" both
 * return 1 (unchanged) — quality has no signal to scale by, and inventing a height distortion for
 * an UNMEASURED lens would itself be a fabrication.
 */
export function lensHeightScale(lens: LensId, rank: number): number {
  if (lens !== "complexity" && lens !== "activity") return 1;
  const safeRank = Math.min(1, Math.max(0, rank));
  return HEIGHT_SCALE_MIN + safeRank * (HEIGHT_SCALE_MAX - HEIGHT_SCALE_MIN);
}

// -------------------------------------------------------------------------------------------
// Lens -> base color (pure, tested)
// -------------------------------------------------------------------------------------------

export interface LensHSL {
  hue: number;
  sat: number;
  light: number;
}

// Complexity: cool green (quiet/simple) -> hot red (complex) — a conventional "heat" ramp, chosen
// to read as intensity rather than as a second language-hue encoding (which would collide with
// Architecture's own hue channel and make the two lenses look like variations of one idea).
const COMPLEXITY_HUE_LOW = 0.33; // green
const COMPLEXITY_HUE_HIGH = 0.0; // red

// Activity: cold blue (quiet history) -> warm amber (heavily churned) — a distinct ramp from
// Complexity's so the two structural lenses never look interchangeable at a glance.
const ACTIVITY_HUE_LOW = 0.58; // cold blue
const ACTIVITY_HUE_HIGH = 0.08; // warm amber

// Quality/UNMEASURED: flat, desaturated, rank-independent — deliberately inert. A viewer must
// never be able to read this as "everything is low quality" (that would fabricate a measurement);
// it reads as "no instrument", the same way an unmeasured value elsewhere in this codebase (e.g.
// `datastores` absence, `Road.weight` absence) never renders as a plausible-looking default.
const UNMEASURED_HSL: LensHSL = { hue: 0, sat: 0, light: 0.32 };

/**
 * Base HSL for a lens at a given percentile rank. Returns `null` for "architecture" — the caller
 * (buildings.ts) already owns a richer language/hue-jitter base color for that lens and must keep
 * using it unchanged; `null` is the explicit "defer to the existing base color" signal, not an
 * error case.
 */
export function lensColorHSL(lens: LensId, rank: number): LensHSL | null {
  if (lens === "architecture") return null;
  if (lens === "quality") return UNMEASURED_HSL;
  const safeRank = Math.min(1, Math.max(0, rank));
  if (lens === "complexity") {
    return {
      hue: COMPLEXITY_HUE_LOW + safeRank * (COMPLEXITY_HUE_HIGH - COMPLEXITY_HUE_LOW),
      sat: 0.6,
      light: 0.3 + safeRank * 0.2,
    };
  }
  // activity
  return {
    hue: ACTIVITY_HUE_LOW + safeRank * (ACTIVITY_HUE_HIGH - ACTIVITY_HUE_LOW),
    sat: 0.58,
    light: 0.3 + safeRank * 0.2,
  };
}

/** The rank a given lens actually keys off, for a single building's precomputed ranks. Returns 0
 *  for lenses that don't consume a rank (architecture, quality) — lensHeightScale/lensColorHSL
 *  both ignore that value for those lenses, so 0 is a safe, inert default rather than a real
 *  reading. */
export function rankForLens(lens: LensId, ranks: { complexityRank: number; churnRank: number }): number {
  if (lens === "complexity") return ranks.complexityRank;
  if (lens === "activity") return ranks.churnRank;
  return 0;
}
