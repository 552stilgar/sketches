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
  const innerWidth = Math.max(1, district.width - padding * 2);
  const innerDepth = Math.max(1, district.depth - padding * 2);
  const columns = Math.max(1, Math.ceil(Math.sqrt(sorted.length * innerWidth / innerDepth)));
  const rows = Math.max(1, Math.ceil(sorted.length / columns));
  const cellWidth = innerWidth / columns;
  const cellDepth = innerDepth / rows;
  const maxSide = Math.max(0.25, Math.min(cellWidth, cellDepth) - gap);
  const slots = new Map<string, Slot>();
  sorted.forEach((path, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    slots.set(path, {
      x: district.x + padding + column * cellWidth + gap / 2,
      y: district.y + padding + row * cellDepth + gap / 2,
      width: cellWidth,
      depth: cellDepth,
      maxSide,
    });
  });
  return slots;
}
