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
    .sort((a, b) => b.weight - a.weight || a.path.localeCompare(b.path));
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

export function shelfSlots(paths: readonly string[], district: Rect, padding = 8, gap = 4): Map<string, Slot> {
  const sorted = [...paths].sort((a, b) => a.localeCompare(b));
  // Clamp padding to a fraction of the district's own extent instead of
  // applying it unconditionally: a fixed padding can exceed a thin/narrow
  // district's width or depth outright, pushing every slot coordinate past
  // the district boundary (and, near the canvas edge, past the canvas too).
  const paddingX = Math.max(0, Math.min(padding, district.width / 4));
  const paddingY = Math.max(0, Math.min(padding, district.depth / 4));
  const innerWidth = Math.max(1e-6, district.width - paddingX * 2);
  const innerDepth = Math.max(1e-6, district.depth - paddingY * 2);
  const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length * innerWidth / innerDepth)));
  const rows = Math.max(1, Math.ceil(sorted.length / columns));
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
  const slots = new Map<string, Slot>();
  sorted.forEach((path, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    slots.set(path, {
      x: district.x + paddingX + column * cellWidth + gap / 2,
      y: district.y + paddingY + row * cellDepth + gap / 2,
      width: cellInnerWidth,
      depth: cellInnerDepth,
      maxSide,
    });
  });
  return slots;
}
