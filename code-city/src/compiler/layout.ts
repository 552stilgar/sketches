import { compareCodepoints } from "../util/compare.ts";

export interface Rect {
  x: number;
  y: number;
  width: number;
  depth: number;
}

export interface WeightedPath {
  path: string;
  weight: number;
}

/**
 * District area-weighting curve (V5.1, sketches/CAMPAIGN.md district-weighting task). Raw file
 * COUNT is the input signal; this is the curve applied to it before `squarify` turns weight into
 * area. "linear" is the original V4 behavior (raw count, unmodified) and stays the default so
 * omitting the option reproduces V4 output bit-for-bit -- see compiler/index.ts CompileCityOptions.
 *
 * This is an explicit, caller-chosen mode -- never auto-selected from how skewed a given repo's
 * district sizes happen to be. Auto-detection would make `compileCity`'s output depend on the
 * DATA (how lopsided this particular graph is) in a way the caller can't predict or reproduce from
 * the option alone, which breaks the determinism contract just as surely as a clock read would:
 * the same (graph, options) pair must always compile to the same CityModel, and "same options,
 * different curve because the data looked different" violates that even though no field on the
 * options object changed.
 */
export type DistrictWeightMode = "linear" | "sqrt" | "log" | "derived";

export const DISTRICT_WEIGHT_MODES: readonly DistrictWeightMode[] = ["linear", "sqrt", "log", "derived"];

/**
 * The curve used when a caller names none. **`log` since 2026-09-01 — Usul's ruling on the
 * rendered A/B variants at dist/compare.html, reverting the `derived` default of 2026-08-31.**
 *
 * This is an AESTHETIC ruling and it deliberately overrides the engineering argument below, which
 * still stands on its own terms and is kept in full because it is not wrong: `derived` really does
 * generalize across repo shapes where a fixed curve cannot. What the rendered variants showed is
 * that on the folded usul-mgmt corpus `derived` solves to a curve giving the largest district
 * 81.5% of the canvas — i.e. it satisfies the legibility FLOOR for the small districts while
 * letting the big one dominate the frame, which loses the thing the view exists to show. `log`'s
 * 40.3% was ruled the better picture. The floor-vs-layout tension underneath this (the 0.008
 * legibility floor answers square geometry while districts lay out as full-width strips) is a
 * separate open item and is NOT settled by this ruling.
 *
 * `derived` remains available as an explicit named mode and its solver is unchanged; L5
 * (deferred-lanes doc, 2026-09-01) still applies to it.
 *
 * --- 2026-08-31 rationale for the `derived` default this reverts, kept because it is still the
 * best statement of what `derived` is for ---
 * `derived` was made the default because `log` turned out to be exactly the class of defect
 * `normalizedHeightScale` (src/renderer/massing.ts) was written to fix for building height: a
 * curve ruled on one repo shape is wrong on another. `log`'s 2026-08-30 ruling was made on a
 * 3-district city where all three districts held hundreds of files each; on the folded usul-mgmt
 * repo (`modules 1103 / test 36 / src 23 / bin 4 / lib 1 / scripts 1`) that same fixed curve gives
 * five districts holding 65 files between them 59.6% of the canvas while the 1103-file district
 * gets 40.3% -- worse than the problem `log` was ruled in to fix. `derived` replaces the fixed
 * curve with one SOLVED per-compile from the actual distribution (see
 * `deriveDistrictWeightExponent` below): least distortion that still keeps every district legible,
 * i.e. `p = 1` (exact linear) whenever the smallest district already clears the legibility floor
 * unaided, compressing only as far as that floor demands.
 *
 * `log`, `sqrt`, and `linear` all remain available as explicit, named opt-outs -- a city compiled
 * under any of them (including every city compiled before 2026-08-31) reproduces byte-for-byte by
 * naming that mode. Determinism is unaffected: the default is still a fixed constant, and
 * `derived` itself is a pure function of the graph's district counts (no clock, no randomness) --
 * "same options, different curve because the data looked different" is exactly what `derived`
 * IS, but that's a documented, deterministic function of `(graph, options)`, not a hidden input;
 * see districtWeight()'s own doc comment above for why AUTO-SELECTING a mode from data skew would
 * have violated the determinism contract -- `derived` doesn't select a mode, it solves one curve
 * parameter within one mode, from data that's already part of the compile's own input.
 *
 * --- 2026-08-30 ruling, now reinstated by the 2026-09-01 ruling above ---
 * `log` was chosen against rendered A/B variants of the merged mgmt trio: under `linear` the
 * largest district took 71.3% of the canvas and the two smaller repos collapsed into edge
 * slivers, so the view could not show what it exists to show -- the relative shape of several
 * codebases at once. `log` put that at 40.9% / 32.7% / 26.3%, and the density difference between
 * districts became legible on THAT city. It was never re-validated against a differently-shaped
 * repo before shipping as the default -- `derived` is that missing generalization.
 */
export const DEFAULT_DISTRICT_WEIGHT_MODE: DistrictWeightMode = "log";

/**
 * Minimum canvas share (fraction of the 1000x1000 layout canvas -- compiler/index.ts squarifies
 * districts into that fixed bounds) a district must clear for `deriveDistrictWeightExponent` to
 * accept an exponent, translated from a LEGIBILITY floor rather than chosen by taste: district
 * name labels are fixed-size world-space sprites regardless of district size
 * (`src/renderer/buildings.ts` `makeLabelSprite`, `sprite.scale.set(90, 22.5, 1)`) -- a district
 * whose own footprint is smaller than the label overflows it into a neighboring district and
 * stops reading as that district's name. The binding dimension is the label's WIDTH (90 world
 * units, 4x its height), so the floor is a square of that side: 90 * 90 = 8100 canvas units^2,
 * i.e. 8100 / 1000^2 = 0.0081 of the canvas -- rounded down to 0.008 (0.8%).
 *
 * Treating this as an AREA share (rather than solving for each district's actual
 * `min(width, depth)` directly, which `deriveDistrictWeightExponent` cannot see -- it only sees
 * counts, not the treemap `squarify` will eventually produce from them) is an approximation,
 * justified by `squarify`'s own optimization target: `worst()` minimizes each row's aspect ratio,
 * so squarify already pushes every district toward square-ish, and area share is a reasonable
 * proxy for "smallest side" on a near-square rect. It is not exact for a district squarify is
 * forced to render as a sliver (extreme count skew can still produce one even with a well-chosen
 * exponent), but that residual failure mode belongs to `squarify`'s own row-balancing, not to this
 * constant.
 *
 * A named, trivially-changeable constant, same posture as `TARGET_MEDIAN_ASPECT_DEFAULT`
 * (massing.ts): Usul rules the final number against rendered variants; this is the measurement
 * that motivates the starting value, not the final word.
 */
export const MIN_DISTRICT_SHARE_DEFAULT = 0.008;

/**
 * Lower bound on the exponent `deriveDistrictWeightExponent` will ever return. `count ** p` is
 * monotonically increasing in `count` for any `p > 0` -- size ordering (bigger district, more
 * weight) survives all the way down to `p` approaching 0. At `p = 0` every district gets weight 1
 * regardless of size and the curve carries no size signal at all, which is a worse loss of
 * information than `log` ever produces (`log1p` still strictly increases, however slowly). 0.05
 * keeps a small but real slope: even on a distribution skewed enough to need the floor, count=1000
 * vs count=1 still differs by `1000 ** 0.05 ≈ 1.4x` rather than collapsing to parity. If a real
 * distribution's smallest district still can't clear `MIN_DISTRICT_SHARE_DEFAULT` at this floor,
 * `deriveDistrictWeightExponent` returns `clamped: true` and reports the floor honestly rather
 * than silently searching past it (massing.ts `normalizedHeightScale` clamp precedent) -- FAIL
 * LOUDLY applies to a returned flag here, not a thrown error, because a clamped-but-still-finite
 * result is not a degenerate input; it's supposed to be surfaced to the caller, not to a rejection.
 */
export const DISTRICT_WEIGHT_EXPONENT_FLOOR = 0.05;

/**
 * Solve for the largest exponent `p` (least distortion -- `p = 1` is exact linear, area tracks
 * file count exactly) such that the SMALLEST weighted share among `counts` still clears `minShare`
 * (default `MIN_DISTRICT_SHARE_DEFAULT`). Weight for one district is `count ** p`.
 *
 * This targets the SMALLEST district's share, not the largest district's. The rejected
 * alternative was solving for the largest district's share to land near some target (e.g. the
 * ~41% the 2026-08-30 `log` ruling produced on its 3-district city) -- on the real usul-mgmt
 * distribution that target would force heavy compression on a `[1103,36,23,4,1,1]` split, and
 * five districts holding 65 files between them would swell to ~59% of the canvas: the exact
 * defect this function exists to fix, re-derived under a different name. Targeting the smallest
 * share instead means well-balanced cities (see the "near-linear on 3 balanced districts" test)
 * are never touched at all -- distortion is applied only when, and only as much as, legibility
 * actually demands.
 *
 * Well-posed because `minShareAt(p)` (the smallest resulting share, as a function of `p`) is
 * monotonically non-increasing as `p` increases: compressing harder (lower `p`) can only raise or
 * hold the smallest share, never lower it (see tests/compiler-district-weight.test.ts
 * "monotonicity"). That makes a bisection search well-defined and gives it a single answer.
 *
 * PURE + DETERMINISTIC: same `counts` (and `minShare`) always produce the same exponent. The
 * search below runs a FIXED 50 iterations regardless of input -- never a convergence-on-float
 * loop whose step count could vary run to run, which would violate the no-clock/no-randomness
 * determinism contract just as surely as reading `Date.now()` would (see districtWeight()'s own
 * doc comment on why compileCity's output must depend only on its declared inputs). 50 halvings of
 * a `[DISTRICT_WEIGHT_EXPONENT_FLOOR, 1]` interval land the exponent far below float64 precision;
 * this is a precision BUDGET, not a "run until close enough" test.
 *
 * FAILS LOUDLY (throws) on degenerate input, per Failure Discipline LAW -- never fabricate a
 * plausible-looking exponent from bad data: an empty `counts` array, any non-finite or non-positive
 * count (a district with 0 files can never be given non-zero weight by any power curve --
 * `0 ** p === 0` for every `p > 0` -- so it is a caller error to pass one in here rather than this
 * function's problem to paper over; `districtWeight(count, "log")`'s `log1p` zero-handling is a
 * property of that DIFFERENT, single-count curve and does not carry over), or a `minShare` that
 * isn't a finite fraction in `(0, 1)`.
 */
export function deriveDistrictWeightExponent(
  counts: readonly number[],
  minShare: number = MIN_DISTRICT_SHARE_DEFAULT,
): { exponent: number; clamped: boolean; minResultingShare: number } {
  if (counts.length === 0) {
    throw new Error("deriveDistrictWeightExponent: counts must not be empty");
  }
  if (!Number.isFinite(minShare) || minShare <= 0 || minShare >= 1) {
    throw new Error(`deriveDistrictWeightExponent: minShare must be a finite fraction in (0, 1), got ${minShare}`);
  }
  for (const count of counts) {
    if (!Number.isFinite(count) || count <= 0) {
      throw new Error(`deriveDistrictWeightExponent: every count must be a positive, finite number, got ${count}`);
    }
  }

  const minShareAt = (p: number): number => {
    const weights = counts.map((count) => Math.pow(count, p));
    const sum = weights.reduce((a, b) => a + b, 0);
    return Math.min(...weights) / sum;
  };

  // p = 1 is exact linear -- zero distortion. If linear already clears the floor, that IS the
  // answer: least distortion means never compressing further than legibility demands, and no
  // search is needed (also sidesteps ever evaluating minShareAt at a p > 1, which is out of scope
  // -- this function only ever compresses, never exaggerates beyond raw counts).
  const linearShare = minShareAt(1);
  if (linearShare >= minShare) {
    return { exponent: 1, clamped: false, minResultingShare: linearShare };
  }

  // If even the floor exponent can't clear minShare, there is no p in-band that can (monotonicity
  // above) -- report the floor and clamped:true rather than pretending a lower p would help.
  const floorShare = minShareAt(DISTRICT_WEIGHT_EXPONENT_FLOOR);
  if (floorShare < minShare) {
    return { exponent: DISTRICT_WEIGHT_EXPONENT_FLOOR, clamped: true, minResultingShare: floorShare };
  }

  let lo = DISTRICT_WEIGHT_EXPONENT_FLOOR;
  let hi = 1;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (minShareAt(mid) >= minShare) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return { exponent: lo, clamped: false, minResultingShare: minShareAt(lo) };
}

/**
 * Apply the named curve to a district's raw file count. `sqrt` and `log` both compress the gap
 * between a large district and a small one relative to `linear` (log more aggressively than
 * sqrt), which is the whole point: one oversized repo's file count shouldn't be allowed to swamp
 * every other district's visible area in a merged city. `count` can be 0 (a datastore-only
 * district with no analyzed source files) -- `log1p` (`Math.log(1 + count)`) keeps that finite
 * instead of `Math.log(0) === -Infinity`, and `squarify` itself still clamps every weight to a
 * minimum of 1 downstream, so a 0-file district never vanishes from the canvas either way.
 */
export function districtWeight(count: number, mode: DistrictWeightMode = DEFAULT_DISTRICT_WEIGHT_MODE): number {
  switch (mode) {
    case "linear":
      return count;
    case "sqrt":
      return Math.sqrt(count);
    case "log":
      return Math.log1p(count);
    case "derived":
      // `derived` solves ONE exponent from the WHOLE distribution's counts (see
      // deriveDistrictWeightExponent above) -- there is no such thing as "the derived weight of a
      // single count" in isolation, so unlike the three curves above this mode cannot be answered
      // here. Fail loudly and point at the function that can, rather than silently falling back to
      // some other curve (which would violate determinism: the SAME count would get a DIFFERENT
      // weight depending on which sibling counts happened to be compiled alongside it, exactly the
      // kind of hidden, uncontrolled input this module's determinism doc comments warn against).
      throw new Error(
        "districtWeight: 'derived' needs the whole distribution, not one count -- call districtWeights() " +
          "or deriveDistrictWeightExponent() instead.",
      );
    default: {
      // Exhaustiveness guard: TypeScript proves `mode` is `never` here as long as
      // DistrictWeightMode's members are all handled above. If a new mode is added to the type
      // without a case here, this becomes a compile error instead of a silent runtime fallback --
      // "fail loudly" applies to the compiler's own contract surface, not just CLI input.
      const exhaustive: never = mode;
      throw new Error(`districtWeight: unhandled mode ${String(exhaustive)}`);
    }
  }
}

/**
 * Weight a whole distribution of district file counts under `mode` (default
 * DEFAULT_DISTRICT_WEIGHT_MODE), in `counts` order. This is the entry point `compiler/index.ts`
 * uses -- it is the only mode-aware caller that has all districts' counts available at once, which
 * `derived` requires and the single-count `districtWeight()` cannot provide.
 *
 * For "linear"/"sqrt"/"log" this is exactly `counts.map((c) => districtWeight(c, mode))` -- same
 * per-count curve, unchanged, so a caller passing one of those three explicit modes gets
 * byte-identical output to calling districtWeight() directly (the opt-out guarantee).
 * `deriveDistrictWeightExponent`'s own PURE/DETERMINISTIC/FAIL-LOUDLY contract passes through
 * unchanged for "derived".
 */
export function districtWeights(
  counts: readonly number[],
  mode: DistrictWeightMode = DEFAULT_DISTRICT_WEIGHT_MODE,
  minShare?: number,
): number[] {
  if (mode !== "derived") {
    return counts.map((count) => districtWeight(count, mode));
  }
  // `deriveDistrictWeightExponent` fails loudly on a count <= 0 (see its own doc comment: a power
  // curve can never give a 0-file district non-zero weight regardless of exponent, so it's
  // meaningless input to a legibility search). Zero-file districts are a real, valid shape though
  // -- a datastore-only directory with no analyzed source files (docs/CONTRACT-city-json.md V4) --
  // and every curve above ("linear"/"sqrt"/"log") already gives them weight 0 before `squarify`'s
  // own `Math.max(1, weight)` floor takes over downstream. So they're excluded from the exponent
  // SEARCH (a district that's always floored to the same area regardless of exponent contributes
  // nothing to "does the smallest REAL district read") but still get a weight from the resulting
  // exponent like every other count -- `0 ** exponent === 0`, same as the other three curves.
  const positiveCounts = counts.filter((count) => count > 0);
  // All-districts-zero is the degenerate edge of that edge case (a graph with datastores but zero
  // analyzed source files anywhere) -- there is nothing to search over, and every weight is 0
  // regardless of exponent, so `exponent` is a don't-care; 1 keeps the choice inert and documented
  // rather than picking a curve for a distribution that has none.
  const exponent = positiveCounts.length > 0 ? deriveDistrictWeightExponent(positiveCounts, minShare).exponent : 1;
  return counts.map((count) => Math.pow(count, exponent));
}

function worst(row: readonly WeightedPath[], shortSide: number): number {
  if (row.length === 0 || shortSide <= 0) return Number.POSITIVE_INFINITY;
  const weights = row.map((item) => item.weight);
  const sum = weights.reduce((a, b) => a + b, 0);
  return Math.max((shortSide * shortSide * Math.max(...weights)) / (sum * sum), (sum * sum) / (shortSide * shortSide * Math.min(...weights)));
}

function placeRow(row: readonly WeightedPath[], remaining: Rect, totalWeight: number, output: Map<string, Rect>): Rect {
  const rowWeight = row.reduce((sum, item) => sum + item.weight, 0);
  if (remaining.width >= remaining.depth) {
    const width = totalWeight === 0 ? 0 : remaining.width * rowWeight / totalWeight;
    let y = remaining.y;
    for (const item of row) {
      const depth = rowWeight === 0 ? 0 : remaining.depth * item.weight / rowWeight;
      output.set(item.path, { x: remaining.x, y, width, depth });
      y += depth;
    }
    return { x: remaining.x + width, y: remaining.y, width: remaining.width - width, depth: remaining.depth };
  }
  const depth = totalWeight === 0 ? 0 : remaining.depth * rowWeight / totalWeight;
  let x = remaining.x;
  for (const item of row) {
    const width = rowWeight === 0 ? 0 : remaining.width * item.weight / rowWeight;
    output.set(item.path, { x, y: remaining.y, width, depth });
    x += width;
  }
  return { x: remaining.x, y: remaining.y + depth, width: remaining.width, depth: remaining.depth - depth };
}

/** Deterministic squarified treemap. Input order is deliberately ignored. */
export function squarify(items: readonly WeightedPath[], bounds: Rect): Map<string, Rect> {
  const pending = [...items]
    .map((item) => ({ ...item, weight: Math.max(1, item.weight) }))
    .sort((a, b) => b.weight - a.weight || compareCodepoints(a.path, b.path));
  const output = new Map<string, Rect>();
  let remaining = { ...bounds };
  let remainingWeight = pending.reduce((sum, item) => sum + item.weight, 0);
  let row: WeightedPath[] = [];
  while (pending.length > 0) {
    const candidate = pending[0];
    const side = Math.min(remaining.width, remaining.depth);
    if (row.length === 0 || worst([...row, candidate], side) <= worst(row, side)) {
      row.push(candidate);
      pending.shift();
    } else {
      const weight = row.reduce((sum, item) => sum + item.weight, 0);
      remaining = placeRow(row, remaining, remainingWeight, output);
      remainingWeight -= weight;
      row = [];
    }
  }
  if (row.length > 0) placeRow(row, remaining, remainingWeight, output);
  return output;
}

export interface Slot extends Rect {
  maxSide: number;
}

// FNV-1a, 32-bit. Pure, seeded only by (salt, key) — no clock, no counter, no
// iteration-order input. Used to derive a stable pseudo-random fraction in
// [0, 1) from a node's full path so slot placement is a function of path
// IDENTITY rather than the node's rank in whatever list happens to be
// passed in this call (see "cross-snapshot stability" below).
function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function hashFraction(key: string, salt: string): number {
  return fnv1a(`${salt}:${key}`) / 0xffffffff;
}

/**
 * Grid-cell shelf placement for buildings/landmarks within one district.
 *
 * CROSS-SNAPSHOT STABILITY (docs/CONTRACT-city-json.md "Layout algorithm":
 * "slot positions derived from path identity — never insertion order"):
 * each key's preferred (column, row) is `round(hash(key) * (columns/rows - 1))` —
 * a function of the key's own path string and the CURRENT grid dimensions
 * only, never of the key's rank among its siblings. The old design used
 * `index % columns` on an alphabetically-sorted list: adding or removing one
 * file ahead of a path in sort order shifted the index, hence the cell, of
 * every path after it. Hashing removes that global shift — a change
 * elsewhere in the district can only perturb the (bounded number of) paths
 * whose preferred cell collides with the changed set.
 *
 * `columns`/`rows` still scale with the current item count (finer grid, more
 * items), so a path's preferred cell index can shift by a column or two
 * between snapshots even with no collision, purely from `columns` changing.
 * That shift is bounded by construction: `round(hash*columns)/columns`
 * approximates the continuous fraction `hash` with quantization error under
 * half a cell width, and each cell is a shrinking fraction of the district as
 * items grow. The grid is also deliberately oversampled (`GRID_OVERSCAN`
 * below) so that collision-resolution displacement — empirically the bigger
 * source of drift, see the constant's own comment — stays local too. See
 * tests/compiler-layout-stability.test.ts for the concrete tolerance this
 * yields and why it's justified.
 *
 * Collisions (two keys landing on the same preferred cell) are resolved by
 * a deterministic outward search from the preferred cell, visiting free
 * cells in a fixed ring order; which key "wins" its preferred cell over
 * another is decided by a second, independent hash used purely as a total,
 * key-intrinsic priority order (never by which key happened to be processed
 * first in the input array) — so, like the preferred cell itself, priority
 * between any two given paths never depends on which other paths are in the
 * set.
 */
export function shelfSlots(paths: readonly string[], district: Rect, padding = 8, gap = 4): Map<string, Slot> {
  const keys = [...paths].sort(compareCodepoints);
  // Clamp padding to a fraction of the district's own extent instead of
  // applying it unconditionally: a fixed padding can exceed a thin/narrow
  // district's width or depth outright, pushing every slot coordinate past
  // the district boundary (and, near the canvas edge, past the canvas too).
  const paddingX = Math.max(0, Math.min(padding, district.width / 4));
  const paddingY = Math.max(0, Math.min(padding, district.depth / 4));
  const innerWidth = Math.max(1e-6, district.width - paddingX * 2);
  const innerDepth = Math.max(1e-6, district.depth - paddingY * 2);
  // A grid sized to EXACTLY fit `keys.length` cells (columns*rows just barely >= n) packs at
  // near-100% occupancy by construction. At that density, hash-preferred cells collide constantly
  // and the deterministic ring search has to walk far to find a free one -- a collision CASCADE
  // whose length depends on the whole occupied set, which is exactly the kind of instability this
  // rewrite exists to remove. Oversampling the grid (`GRID_OVERSCAN` more cells than items) keeps
  // enough headroom that most preferred cells are free on the first try, so displacement stays
  // local to genuine collisions instead of cascading — the tradeoff is a smaller `maxSide` cap per
  // slot (the grid is coarser than the tightest possible fit), which only shrinks the CEILING
  // `footprintSide` scales into, not the relative sizing between buildings in a district.
  const GRID_OVERSCAN = 3;
  const columns = Math.max(1, Math.ceil(Math.sqrt(keys.length * GRID_OVERSCAN * innerWidth / innerDepth)));
  const rows = Math.max(1, Math.ceil((keys.length * GRID_OVERSCAN) / columns));
  const cellWidth = innerWidth / columns;
  const cellDepth = innerDepth / rows;
  const maxSide = Math.max(0.25, Math.min(cellWidth, cellDepth) - gap);
  // Slot width/depth are the gap-trimmed interior of the grid cell, not the
  // raw cell — that keeps `x + width` (and `y + depth`) bounded by the
  // district's own edge regardless of how small padding/gap end up being
  // relative to the district, instead of relying on padding being large
  // enough to silently absorb the gap/2 offset on the far side.
  const cellInnerWidth = Math.max(0, cellWidth - gap);
  const cellInnerDepth = Math.max(0, cellDepth - gap);

  // Total, key-intrinsic priority order: two keys always compare the same
  // way regardless of what else is in `keys` (path-hash first, full path as
  // a deterministic tiebreak for the — astronomically unlikely — hash tie).
  const placementOrder = [...keys].sort(
    (a, b) => hashFraction(a, "priority") - hashFraction(b, "priority") || compareCodepoints(a, b),
  );

  const occupied = new Set<number>(); // row * columns + column
  const cellOf = new Map<string, { column: number; row: number }>();
  for (const key of placementOrder) {
    // Round (nearest cell), not floor, to the preferred continuous fraction: this halves the
    // worst-case quantization error against the continuous position `hash(key)` represents (up to
    // half a cell width instead of up to a full one), which is what bounds cross-snapshot drift
    // when `columns`/`rows` themselves change between two snapshots of the same repo.
    const preferredColumn = Math.min(columns - 1, Math.max(0, Math.round(hashFraction(key, "col") * (columns - 1))));
    const preferredRow = Math.min(rows - 1, Math.max(0, Math.round(hashFraction(key, "row") * (rows - 1))));
    let placed: { column: number; row: number } | undefined;
    // Deterministic outward ring search (Chebyshev rings), fixed scan order
    // within each ring (row-major) so ties never depend on input order.
    for (let ring = 0; ring < columns + rows && !placed; ring++) {
      for (let dRow = -ring; dRow <= ring && !placed; dRow++) {
        for (let dCol = -ring; dCol <= ring && !placed; dCol++) {
          if (Math.max(Math.abs(dRow), Math.abs(dCol)) !== ring) continue;
          const column = preferredColumn + dCol;
          const row = preferredRow + dRow;
          if (column < 0 || column >= columns || row < 0 || row >= rows) continue;
          const index = row * columns + column;
          if (occupied.has(index)) continue;
          occupied.add(index);
          placed = { column, row };
        }
      }
    }
    // Totality fallback: with columns*rows >= keys.length by construction
    // (rows = ceil(n/columns)), the ring search above always finds a free
    // cell before exhausting the grid. This is defensive only.
    if (!placed) {
      for (let index = 0; index < columns * rows; index++) {
        if (!occupied.has(index)) {
          occupied.add(index);
          placed = { column: index % columns, row: Math.floor(index / columns) };
          break;
        }
      }
    }
    if (!placed) throw new Error(`shelfSlots: no free cell for ${key} (${columns}x${rows} grid, ${keys.length} keys)`);
    cellOf.set(key, placed);
  }

  const slots = new Map<string, Slot>();
  for (const key of keys) {
    const cell = cellOf.get(key);
    if (!cell) throw new Error(`shelfSlots: no cell resolved for ${key}`);
    slots.set(key, {
      x: district.x + paddingX + cell.column * cellWidth + gap / 2,
      y: district.y + paddingY + cell.row * cellDepth + gap / 2,
      width: cellInnerWidth,
      depth: cellInnerDepth,
      maxSide,
    });
  }
  return slots;
}
