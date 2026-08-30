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
export type DistrictWeightMode = "linear" | "sqrt" | "log";

export const DISTRICT_WEIGHT_MODES: readonly DistrictWeightMode[] = ["linear", "sqrt", "log"];

/**
 * Apply the named curve to a district's raw file count. `sqrt` and `log` both compress the gap
 * between a large district and a small one relative to `linear` (log more aggressively than
 * sqrt), which is the whole point: one oversized repo's file count shouldn't be allowed to swamp
 * every other district's visible area in a merged city. `count` can be 0 (a datastore-only
 * district with no analyzed source files) -- `log1p` (`Math.log(1 + count)`) keeps that finite
 * instead of `Math.log(0) === -Infinity`, and `squarify` itself still clamps every weight to a
 * minimum of 1 downstream, so a 0-file district never vanishes from the canvas either way.
 */
export function districtWeight(count: number, mode: DistrictWeightMode = "linear"): number {
  switch (mode) {
    case "linear":
      return count;
    case "sqrt":
      return Math.sqrt(count);
    case "log":
      return Math.log1p(count);
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
