// Brief §4.4 / §6 kit layer: every PartType needs a registered micro-generator
// that (a) is deterministic per stream seed, (b) varies its proportions across
// seeds, (c) only ever emits finite coordinates and legal palette roles /
// stroke weights, and (d) — for the four parts that sit on non-mirrored
// centerline sockets — is symmetric about x=0 in aggregate.

import { describe, expect, it } from "vitest";
import { derive, stream } from "../src/core/prng";
import { PART_BUILDERS } from "../src/gen/kit";
import type { PaletteRole, PartType, Shape, StrokeWeight } from "../src/gen/types";

const ALL_PART_TYPES: PartType[] = [
  "turret-large",
  "turret-small",
  "pdc-mount",
  "sensor-dish",
  "comm-mast",
  "thruster-cluster",
  "radiator-fin",
  "cargo-hatch",
  "docking-collar",
  "vent-strip",
  "engine-bell",
];

const SYMMETRIC_ABOUT_X0: PartType[] = ["sensor-dish", "comm-mast", "docking-collar", "engine-bell"];

const PALETTE_ROLES: PaletteRole[] = ["base", "baseAlt", "accent", "trim", "dark"];
const STROKE_WEIGHTS: StrokeWeight[] = ["silhouette", "majorSeam", "minorDetail"];

const SEED_A = 0x51de5901 | 0;
const SEED_B = 0x2be9410f | 0;
const SIZE = 12;

/** Every finite numeric field touched by a Shape, for the finiteness check. */
function shapeNumbers(s: Shape): number[] {
  switch (s.kind) {
    case "rect":
      return [s.x, s.y, s.w, s.h];
    case "poly":
      return s.points.flat();
    case "circle":
      return [s.cx, s.cy, s.r];
    case "line":
      return [s.x1, s.y1, s.x2, s.y2];
  }
}

/** Local x-range [min, max] a shape occupies, for the symmetry check. */
function shapeXRange(s: Shape): [number, number] {
  switch (s.kind) {
    case "rect":
      return [s.x, s.x + s.w];
    case "poly": {
      const xs = s.points.map((p) => p[0]);
      return [Math.min(...xs), Math.max(...xs)];
    }
    case "circle":
      return [s.cx - s.r, s.cx + s.r];
    case "line":
      return [Math.min(s.x1, s.x2), Math.max(s.x1, s.x2)];
  }
}

describe("kit part builders", () => {
  it("every PartType has a registered builder", () => {
    for (const pt of ALL_PART_TYPES) {
      expect(PART_BUILDERS[pt], `missing builder for ${pt}`).toBeTypeOf("function");
    }
  });

  it("same stream seed -> deep-equal PartInstance twice", () => {
    for (const pt of ALL_PART_TYPES) {
      const build = PART_BUILDERS[pt];
      const seed = derive(SEED_A, "kit-parts-test", pt);
      const a = build(stream(seed), SIZE);
      const b = build(stream(seed), SIZE);
      expect(a, pt).toEqual(b);
    }
  });

  it("different seeds -> differing proportions", () => {
    for (const pt of ALL_PART_TYPES) {
      const build = PART_BUILDERS[pt];
      const seedA = derive(SEED_A, "kit-parts-test", pt);
      const seedB = derive(SEED_B, "kit-parts-test", pt);
      const a = build(stream(seedA), SIZE);
      const b = build(stream(seedB), SIZE);
      expect(a, pt).not.toEqual(b);
    }
  });

  it("all coordinates are finite", () => {
    for (const pt of ALL_PART_TYPES) {
      const build = PART_BUILDERS[pt];
      const seed = derive(SEED_A, "kit-parts-test", pt);
      const instance = build(stream(seed), SIZE);
      for (const shape of instance.shapes) {
        for (const n of shapeNumbers(shape)) {
          expect(Number.isFinite(n), `${pt} shape ${shape.kind} has non-finite coordinate`).toBe(true);
        }
      }
    }
  });

  it("part identifies as its own PartType", () => {
    for (const pt of ALL_PART_TYPES) {
      const build = PART_BUILDERS[pt];
      const seed = derive(SEED_A, "kit-parts-test", pt);
      const instance = build(stream(seed), SIZE);
      expect(instance.type).toBe(pt);
    }
  });

  it("only legal palette roles and stroke weights are used", () => {
    for (const pt of ALL_PART_TYPES) {
      const build = PART_BUILDERS[pt];
      const seed = derive(SEED_A, "kit-parts-test", pt);
      const instance = build(stream(seed), SIZE);
      for (const shape of instance.shapes) {
        if ("fill" in shape && shape.fill !== undefined) {
          expect(PALETTE_ROLES, `${pt} shape ${shape.kind} fill`).toContain(shape.fill);
        }
        if ("stroke" in shape && shape.stroke !== undefined) {
          expect(STROKE_WEIGHTS, `${pt} shape ${shape.kind} stroke`).toContain(shape.stroke);
        }
        // line shapes require a stroke by contract (types.ts) — guard it explicitly too.
        if (shape.kind === "line") {
          expect(STROKE_WEIGHTS, `${pt} line shape must have a legal stroke`).toContain(shape.stroke);
        }
      }
    }
  });

  it("part shape counts stay within the 3-8 greeble budget", () => {
    for (const pt of ALL_PART_TYPES) {
      const build = PART_BUILDERS[pt];
      const seed = derive(SEED_A, "kit-parts-test", pt);
      const instance = build(stream(seed), SIZE);
      expect(instance.shapes.length, pt).toBeGreaterThanOrEqual(3);
      expect(instance.shapes.length, pt).toBeLessThanOrEqual(8);
    }
  });

  it("symmetric-about-x0 parts have balanced aggregate x-extent", () => {
    for (const pt of SYMMETRIC_ABOUT_X0) {
      const build = PART_BUILDERS[pt];
      const seed = derive(SEED_A, "kit-parts-test", pt);
      const instance = build(stream(seed), SIZE);
      let minX = Infinity;
      let maxX = -Infinity;
      for (const shape of instance.shapes) {
        const [lo, hi] = shapeXRange(shape);
        minX = Math.min(minX, lo);
        maxX = Math.max(maxX, hi);
      }
      const span = Math.max(Math.abs(minX), Math.abs(maxX));
      expect(span, `${pt} has degenerate x-extent`).toBeGreaterThan(0);
      const imbalance = Math.abs(Math.abs(minX) - Math.abs(maxX)) / span;
      expect(imbalance, `${pt} minX=${minX} maxX=${maxX}`).toBeLessThanOrEqual(0.15);
    }
  });
});
