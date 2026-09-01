// V2 procedural facades — the pure half (src/renderer/facades.ts). The shader half is only
// verifiable in a real GL context and is covered by the in-browser pass, not here.

import { describe, expect, it } from "vitest";
import {
  facadeAttributes,
  facadeSeed,
  floorCount,
  SETBACK_STEP_INSET,
  SETBACK_TIERS,
  setbackStepCount,
  setbackTier,
  WINDOW_DARKEN,
  windowColumns,
} from "../src/renderer/facades.ts";

describe("setbackTier", () => {
  it("assigns every tier across the height range, in order", () => {
    const ref = 100;
    expect(setbackTier(10, ref)).toBe("none");
    expect(setbackTier(50, ref)).toBe("single");
    expect(setbackTier(80, ref)).toBe("double");
    expect(setbackTier(120, ref)).toBe("triple");
  });

  it("is monotonic — a taller building never gets a lower tier", () => {
    const ref = 60;
    const order = new Map(SETBACK_TIERS.map((t, i) => [t, i]));
    let previous = -1;
    for (let h = 0; h <= 200; h += 1) {
      const rank = order.get(setbackTier(h, ref))!;
      expect(rank).toBeGreaterThanOrEqual(previous);
      previous = rank;
    }
  });

  it("returns a legal tier for degenerate heights and references (never NaN, never a lost bucket)", () => {
    for (const [h, ref] of [
      [Number.NaN, 10],
      [10, Number.NaN],
      [-5, 10],
      [10, 0],
      [10, -1],
      [0, 0],
      [Infinity, 10],
    ] as const) {
      expect(SETBACK_TIERS).toContain(setbackTier(h, ref));
    }
  });

  it("is deterministic", () => {
    for (let h = 0; h < 50; h++) expect(setbackTier(h, 33)).toBe(setbackTier(h, 33));
  });
});

describe("setbackStepCount", () => {
  it("rises strictly with the tier and starts at zero", () => {
    const counts = SETBACK_TIERS.map(setbackStepCount);
    expect(counts[0]).toBe(0);
    for (let i = 1; i < counts.length; i++) expect(counts[i]).toBeGreaterThan(counts[i - 1]);
  });

  it("never insets a full ziggurat past the unit half-extent", () => {
    // The guarantee steppedBody() relies on: total inset at the top step must stay well inside 0.5,
    // or a setback could push geometry through the opposite face.
    const maxSteps = Math.max(...SETBACK_TIERS.map(setbackStepCount));
    expect(SETBACK_STEP_INSET * maxSteps).toBeLessThan(0.4);
  });
});

describe("floorCount", () => {
  it("rises with height and stays within its clamps", () => {
    expect(floorCount(0)).toBe(1);
    expect(floorCount(4)).toBeGreaterThanOrEqual(1);
    expect(floorCount(100)).toBeGreaterThan(floorCount(20));
    expect(floorCount(1e9)).toBeLessThanOrEqual(40);
  });

  it("never returns 0, NaN, or a fraction — it indexes a shader grid", () => {
    for (const h of [Number.NaN, -1, 0, 0.001, 3.7, Infinity]) {
      const n = floorCount(h);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(n)).toBe(true);
    }
  });
});

describe("windowColumns", () => {
  it("rises with span and stays within its clamps", () => {
    expect(windowColumns(0)).toBe(1);
    expect(windowColumns(60)).toBeGreaterThan(windowColumns(6));
    expect(windowColumns(1e9)).toBeLessThanOrEqual(12);
  });

  it("never returns 0, NaN, or a fraction", () => {
    for (const s of [Number.NaN, -3, 0, 0.01, Infinity]) {
      const n = windowColumns(s);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(1);
    }
  });
});

describe("facadeSeed", () => {
  it("is deterministic for the same id", () => {
    expect(facadeSeed("src/a.ts")).toBe(facadeSeed("src/a.ts"));
  });

  it("is in [0,1)", () => {
    for (const id of ["a", "b", "src/deep/nested/file.ts", "", "üñí"]) {
      const s = facadeSeed(id);
      expect(s).toBeGreaterThanOrEqual(0);
      expect(s).toBeLessThan(1);
    }
  });

  it("differs across ids often enough to break up repeated facades", () => {
    const seeds = new Set<number>();
    for (let i = 0; i < 200; i++) seeds.add(facadeSeed(`src/file${i}.ts`));
    expect(seeds.size).toBeGreaterThan(150);
  });
});

describe("facadeAttributes", () => {
  it("gives a wide, shallow building different column counts per axis", () => {
    // The reason the two counts are separate attributes: a storefront's long face must not get the
    // same window count as its short one.
    const f = facadeAttributes({ id: "x", width: 40, depth: 5, height: 10 }, 1);
    expect(f.columnsAlongX).toBeGreaterThan(f.columnsAlongZ);
  });

  // Regression, 2026-09-01. The first version named these "columnsX"/"columnsZ" meaning "for the
  // X-facing faces", and the shader then paired the X-facing faces with the width-derived count.
  // But an X-facing face SPANS DEPTH — the axis a face spans is perpendicular to the axis it
  // faces. Result: on any non-square building the window density landed on the wrong pair of
  // walls, which is precisely the case the per-axis split exists to handle.
  //
  // Asserted as an exact identity against windowColumns() rather than as an inequality, because
  // an inequality between the two fields passes just as happily when they are swapped.
  it("derives each column count from the span its face actually covers", () => {
    const f = facadeAttributes({ id: "x", width: 40, depth: 5, height: 10 }, 1);
    expect(f.columnsAlongX).toBe(windowColumns(40)); // faces spanning X are sized by width
    expect(f.columnsAlongZ).toBe(windowColumns(5)); // faces spanning Z are sized by depth
  });

  it("is a pure function of the building's own id and geometry", () => {
    const b = { id: "src/a.ts", width: 12, depth: 9, height: 30 };
    expect(facadeAttributes(b, 1)).toEqual(facadeAttributes({ ...b }, 1));
  });

  it("never reads a metric — identical geometry and id give identical facades", () => {
    // Guards the module header's constraint: facades restate geometry, they do not encode
    // loc/complexity/churn/age. If someone repoints these at metrics, two buildings with the same
    // shape but different metrics would diverge here and this fails.
    const a = facadeAttributes({ id: "same", width: 10, depth: 10, height: 20 }, 1);
    const b = facadeAttributes({ id: "same", width: 10, depth: 10, height: 20 }, 1);
    expect(a).toEqual(b);
  });

  // Regression, 2026-09-01: floors were first derived from the RAW b.height, but buildings.ts
  // renders at `b.height * baseHeightScale` and that scale is solved per city by
  // massing-resolution.ts — so a floor was a different world size in every city, and a building
  // rendered at half height got a full-height floor count squeezed into it (reads as stripes).
  it("scales floor count with the render-time height scale, not the raw height", () => {
    const b = { id: "t", width: 10, depth: 10, height: 100 };
    expect(facadeAttributes(b, 0.5).floors).toBeLessThan(facadeAttributes(b, 1).floors);
    // A building rendered at scale s has the same floor count as one of s*height at scale 1 --
    // i.e. a floor is a fixed WORLD size, which is the whole point.
    expect(facadeAttributes(b, 0.5).floors).toBe(
      facadeAttributes({ ...b, height: 50 }, 1).floors,
    );
  });

  it("falls back to an unscaled derivation for a degenerate height scale", () => {
    const b = { id: "t", width: 10, depth: 10, height: 40 };
    for (const bad of [0, -1, Number.NaN, Infinity]) {
      expect(facadeAttributes(b, bad).floors).toBe(facadeAttributes(b, 1).floors);
    }
  });
});

describe("WINDOW_DARKEN", () => {
  it("can only darken, and not far enough to reach the ruin rung", () => {
    // Companion to tests/tone-mapping.test.ts: windows must not push a building's lit faces onto
    // another object type's rung of the never-confusable lightness ladder. Strictly-darkening and
    // bounded means a ~0.42 building wall bottoms out well above ruin charcoal at 0.16.
    expect(WINDOW_DARKEN).toBeGreaterThan(0);
    expect(WINDOW_DARKEN).toBeLessThan(1);
    expect(0.42 * (1 - WINDOW_DARKEN)).toBeGreaterThan(0.16);
  });
});
