// detail(structure, seedD) -> DetailSpec (brief §6 layer 3 / §4.5).
// Per segment: a band x col lattice, each cell assigned an enumerated
// treatment under a FOCAL-HIERARCHY density field (dense at joins and near
// module sockets, calm mid-panel) with adjacency weighting (ribs attract
// ribs). Cells cover the +x half only; emit mirrors them via the shared
// helper. Every cell draws from its own derive(seedD, segId, band, col)
// stream so adding cells never shifts another cell's roll.

import { derive, stream } from "../core/prng";
import type { DetailCell, DetailSpec, SegmentDetail, StructureSpec, Treatment } from "./types";

// Lattice sizing: axial bands scale with length, lateral cols with width.
const BAND_PER_UNIT = 1 / 4.5;
const COL_PER_UNIT = 1 / 3.5;

// Focal-density field weights (sum drives the 0..1 density per cell).
const W_JOIN = 0.5; // proximity to a segment end (aft/fore join)
const W_SOCKET = 0.55; // proximity to a module socket's axial position
const W_OUTER = 0.18; // outboard cols carry marginally more greeble
const SOCKET_SIGMA = 0.12; // gaussian falloff of the socket bump (axial fraction)

/** Smooth 0..1 bump, 1 at x=0, ~0 by |x| = 3*sigma. */
function bump(dx: number, sigma: number): number {
  return Math.exp(-(dx * dx) / (2 * sigma * sigma));
}

export function detail(structureSpec: StructureSpec, seedD: number): DetailSpec {
  const perSegment: SegmentDetail[] = structureSpec.segments.map((seg) => {
    const meanHalfWidth = (seg.halfWidth.aft + seg.halfWidth.fore) / 2;
    const bands = Math.max(2, Math.round(seg.length * BAND_PER_UNIT));
    const cols = Math.max(1, Math.round(meanHalfWidth * COL_PER_UNIT));
    const socketAts = seg.sockets.map((s) => s.at);

    const cells: DetailCell[] = [];
    // band-major so a cell's inboard (col-1) and aft (band-1) neighbours are
    // already assigned when adjacency is evaluated.
    const grid: Treatment[][] = [];
    for (let band = 0; band < bands; band++) {
      grid[band] = [];
      const bandT = (band + 0.5) / bands;
      // join proximity: 1 at the segment ends, 0 at mid-length
      const joinProx = 1 - Math.min(bandT, 1 - bandT) * 2;
      // socket proximity: nearest socket's axial bump
      const socketProx = socketAts.reduce((m, at) => Math.max(m, bump(bandT - at, SOCKET_SIGMA)), 0);

      for (let col = 0; col < cols; col++) {
        const colT = (col + 0.5) / cols; // 0 = centerline, 1 = hull edge
        const density = Math.min(
          1,
          W_JOIN * joinProx + W_SOCKET * socketProx + W_OUTER * colT,
        );
        const rng = stream(derive(seedD, seg.id, band, col));
        const aftNeighbour = band > 0 ? grid[band - 1]![col] : undefined;
        const inNeighbour = col > 0 ? grid[band]![col - 1] : undefined;
        const treatment = chooseTreatment(rng, density, aftNeighbour, inNeighbour);
        grid[band]![col] = treatment;
        cells.push({ band, col, treatment, density });
      }
    }

    return { segmentId: seg.id, lattice: { bands, cols }, cells };
  });

  return { perSegment };
}

/**
 * Weighted treatment pick. Low density biases to blank/grid (calm panels);
 * high density (joins, sockets) unlocks ribs, recesses, vents. Ribs attract
 * ribs via an adjacency bonus; a rare stripe-band accents busy bands.
 */
function chooseTreatment(
  rng: () => number,
  density: number,
  aft: Treatment | undefined,
  inboard: Treatment | undefined,
): Treatment {
  const w: Record<Treatment, number> = {
    blank: 1.4 * (1 - density),
    "panel-grid": 0.6 + 1.2 * (1 - Math.abs(density - 0.4) * 2),
    "rib-lines": 0.15 + 1.3 * density,
    "recessed-strip": Math.max(0, 1.1 * (density - 0.45)),
    "vent-row": Math.max(0, 0.9 * (density - 0.5)),
    "stripe-band": Math.max(0, 0.35 * (density - 0.55)),
  };
  // adjacency: ribs attract ribs (brief §4.5)
  if (aft === "rib-lines") w["rib-lines"] += 0.9;
  if (inboard === "rib-lines") w["rib-lines"] += 0.6;
  // avoid two recessed strips stacking (reads as a mistake, not a module)
  if (aft === "recessed-strip") w["recessed-strip"] *= 0.3;

  const total = (Object.values(w) as number[]).reduce((s, v) => s + v, 0);
  let r = rng() * total;
  for (const [treatment, weight] of Object.entries(w) as [Treatment, number][]) {
    r -= weight;
    if (r <= 0) return treatment;
  }
  return "panel-grid";
}

// Tuning surface for the density field / lattice — exported so a future
// inspector or test can reason about the knobs without re-deriving them.
export const DETAIL_TUNING = { BAND_PER_UNIT, COL_PER_UNIT, W_JOIN, W_SOCKET, W_OUTER, SOCKET_SIGMA };
