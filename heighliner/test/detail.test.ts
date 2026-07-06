// Detail layer (brief §6 layer 3 / §4.5): band x col lattice, per-cell
// enumerated treatments under a focal-hierarchy density field with adjacency
// weighting. Cells cover the +x half; emit mirrors them.

import { describe, expect, it } from "vitest";
import { derive } from "../src/core/prng";
import { detail } from "../src/gen/detail";
import { structure } from "../src/gen/structure";
import { shipSpecs, shipSVG } from "../src/gen/ship";
import type { Treatment } from "../src/gen/types";

const SEEDS = Array.from({ length: 40 }, (_, i) => derive(0x5eed, "detail-suite", i));
const ALL_TREATMENTS: Treatment[] = ["panel-grid", "rib-lines", "recessed-strip", "vent-row", "stripe-band", "blank"];

describe("detail lattice", () => {
  it("holds exactly bands*cols cells, all in-range, band-major", () => {
    for (const seed of SEEDS.slice(0, 15)) {
      const spec = structure(derive(seed, "structure"));
      const d = detail(spec, derive(seed, "detail"));
      for (const sd of d.perSegment) {
        const { bands, cols } = sd.lattice;
        expect(sd.cells.length).toBe(bands * cols);
        for (const c of sd.cells) {
          expect(c.band).toBeGreaterThanOrEqual(0);
          expect(c.band).toBeLessThan(bands);
          expect(c.col).toBeGreaterThanOrEqual(0);
          expect(c.col).toBeLessThan(cols);
          expect(c.density).toBeGreaterThanOrEqual(0);
          expect(c.density).toBeLessThanOrEqual(1);
          expect(ALL_TREATMENTS).toContain(c.treatment);
        }
      }
    }
  });
});

describe("focal hierarchy (the defining property)", () => {
  it("edge bands are denser than mid-length bands on average", () => {
    let edgeSum = 0, edgeN = 0, midSum = 0, midN = 0;
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      const d = detail(spec, derive(seed, "detail"));
      for (const sd of d.perSegment) {
        const { bands } = sd.lattice;
        if (bands < 3) continue;
        for (const c of sd.cells) {
          const bandT = (c.band + 0.5) / bands;
          const edgeDist = Math.min(bandT, 1 - bandT);
          if (edgeDist < 0.25) { edgeSum += c.density; edgeN++; }
          else if (edgeDist > 0.4) { midSum += c.density; midN++; }
        }
      }
    }
    const edgeMean = edgeSum / edgeN;
    const midMean = midSum / midN;
    // joins should carry meaningfully more density than calm mid-panel
    expect(edgeMean).toBeGreaterThan(midMean * 1.3);
  });
});

describe("treatment variety", () => {
  it("every enumerated treatment appears somewhere across the fleet", () => {
    const seen = new Set<Treatment>();
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      const d = detail(spec, derive(seed, "detail"));
      for (const sd of d.perSegment) for (const c of sd.cells) seen.add(c.treatment);
    }
    for (const t of ALL_TREATMENTS) expect(seen.has(t)).toBe(true);
  });

  it("busy zones actually vary — a single ship shows >=3 distinct treatments", () => {
    const counts = SEEDS.slice(0, 20).map((seed) => {
      const spec = structure(derive(seed, "structure"));
      const d = detail(spec, derive(seed, "detail"));
      const s = new Set<Treatment>();
      for (const sd of d.perSegment) for (const c of sd.cells) s.add(c.treatment);
      return s.size;
    });
    // most ships should be visibly varied
    expect(counts.filter((n) => n >= 3).length).toBeGreaterThanOrEqual(15);
  });
});

describe("determinism + cross-layer stability", () => {
  it("same seed -> deep-equal detail spec", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const spec = structure(derive(seed, "structure"));
      expect(detail(spec, derive(seed, "detail"))).toEqual(detail(spec, derive(seed, "detail")));
    }
  });

  it("re-rolling kit or paint leaves the detail spec untouched", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const base = shipSpecs(seed);
      for (const layer of ["kit", "paint", "structure"] as const) {
        const rerolled = shipSpecs(seed, { [layer]: derive(seed, "reroll", layer) });
        if (layer === "structure") continue; // structure drives detail — change expected
        expect(rerolled.detail).toEqual(base.detail);
      }
    }
  });

  it("same master seed -> byte-identical detail group", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      expect(shipSVG(seed)).toBe(shipSVG(seed));
    }
  });
});
