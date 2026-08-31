import { describe, expect, it } from "vitest";
import { medianAspect, normalizedHeightScale, TARGET_MEDIAN_ASPECT_DEFAULT } from "../src/renderer/massing.ts";
import type { Building } from "../src/types.ts";

/**
 * SPEC for src/renderer/massing.ts (RED gate authored by Claude Sonnet 5 -- Codex implements
 * against this file, no changes to the assertions below).
 *
 * Interface under test:
 *   export const TARGET_MEDIAN_ASPECT_DEFAULT = 3.7;
 *   export function medianAspect(buildings: readonly Building[], heightScale: number): number;
 *   export function normalizedHeightScale(
 *     buildings: readonly Building[],
 *     target?: number,
 *   ): { scale: number; clamped: boolean; medianAspect: number };
 *
 * Aspect for one building is `height / Math.min(width, depth)` (heightScale multiplies height
 * before the ratio, since heightScale is the renderer-side knob being normalized).
 *
 * RATIONALE (measured this session -- the finding this module closes):
 * BASE_HEIGHT_SCALE_DEFAULT (src/renderer/buildings.ts) is a FIXED CONSTANT, but the
 * relationship it controls is SIZE-DEPENDENT. Measured on two real cities:
 *   merged-trio (631 buildings):  median footprint 8.08, median height 52.4, median aspect  6.5
 *   usul-mgmt   (1108 buildings): median footprint 3.69, median height 52.4, median aspect 14.2
 * Median HEIGHT is identical; the median FOOTPRINT halved. Height is absolute (LOC-derived);
 * footprint is a share of a fixed 1000x1000 canvas. So aspect ratio scales with building count,
 * and at the ruled heightScale=0.5 the new city's median silhouette is 8.8:1 -- WORSE than the
 * 7.4:1 that triggered the ruling in the first place. A constant cannot hold this invariant.
 * TARGET_MEDIAN_ASPECT_DEFAULT = 3.7 is the ratio that same 2026-08-30 ruling actually produced
 * on the 631-building city -- the ruling is preserved, normalization only makes it portable.
 *
 * The six behaviors this file pins, one per describe block below:
 *   1. normalizedHeightScale's result, fed back into medianAspect, lands on the target.
 *   2. PURE + DETERMINISTIC -- same input, same output, repeatedly.
 *   3. SIZE INVARIANCE -- same height distribution, footprints scaled by a constant factor,
 *      normalize to the SAME median aspect via DIFFERENT scales.
 *   4. CLAMPING to the documented usable band [0.25, 2.0] -- clamped=true + scale=bound when the
 *      ideal scale falls outside it, never silent.
 *   5. FAILS LOUDLY on degenerate input (zero buildings; non-positive min(width,depth)) --
 *      throws, never returns 1 / NaN / Infinity.
 *   6. medianAspect uses a real median (even-length -> average of the two middle values) and is
 *      monotonic in heightScale.
 */

function mkBuilding(id: string, width: number, depth: number, height: number): Building {
  return {
    id,
    x: 0,
    y: 0,
    width,
    depth,
    height,
    style: "test-style",
    metrics: { loc: 0, complexity: 0, churn: 0 },
  };
}

describe("normalizedHeightScale — solves for the target aspect", () => {
  it("feeding the returned scale back into medianAspect lands within a small tolerance of the target", () => {
    // footprints all 10, heights 10/20/30/40/50 -> median height 30, aspect@scale1 = 3.0.
    // ideal scale = target * 10 / 30, well inside [0.25, 2.0] -- unclamped.
    const buildings = [
      mkBuilding("a", 10, 10, 10),
      mkBuilding("b", 10, 10, 20),
      mkBuilding("c", 10, 10, 30),
      mkBuilding("d", 10, 10, 40),
      mkBuilding("e", 10, 10, 50),
    ];

    const result = normalizedHeightScale(buildings);

    expect(result.clamped).toBe(false);
    expect(Math.abs(result.medianAspect - TARGET_MEDIAN_ASPECT_DEFAULT)).toBeLessThan(1e-6);
    expect(Math.abs(medianAspect(buildings, result.scale) - TARGET_MEDIAN_ASPECT_DEFAULT)).toBeLessThan(1e-6);
  });

  it("honors an explicit target instead of TARGET_MEDIAN_ASPECT_DEFAULT", () => {
    const buildings = [
      mkBuilding("a", 20, 20, 40),
      mkBuilding("b", 20, 20, 60),
      mkBuilding("c", 20, 20, 80),
    ];

    const result = normalizedHeightScale(buildings, 2.5);

    expect(result.clamped).toBe(false);
    expect(Math.abs(result.medianAspect - 2.5)).toBeLessThan(1e-6);
    expect(Math.abs(medianAspect(buildings, result.scale) - 2.5)).toBeLessThan(1e-6);
  });
});

describe("normalizedHeightScale — pure and deterministic", () => {
  it("returns byte-identical results across repeated calls on the same input, no clock, no random", () => {
    const buildings = [
      mkBuilding("a", 6, 9, 12),
      mkBuilding("b", 15, 4, 88),
      mkBuilding("c", 3, 3, 3),
      mkBuilding("d", 40, 12, 200),
    ];

    const first = normalizedHeightScale(buildings);
    const second = normalizedHeightScale(buildings);
    const third = normalizedHeightScale([...buildings]); // fresh array, same content

    expect(second).toEqual(first);
    expect(third).toEqual(first);

    const aspectFirst = medianAspect(buildings, 0.77);
    const aspectSecond = medianAspect(buildings, 0.77);
    expect(aspectSecond).toBe(aspectFirst);
  });
});

describe("normalizedHeightScale — size invariance", () => {
  it("two cities with the same height distribution but footprints differing by a constant factor normalize to the same median aspect via different scales", () => {
    const heights = [10, 20, 30, 40, 50];

    // City A: footprint 8 (matches the measured merged-trio-scale case).
    const cityA: Building[] = heights.map((h, i) => mkBuilding(`a${i}`, 8, 8, h));
    // City B: same heights, footprint halved (matches the measured usul-mgmt-scale case).
    const cityB: Building[] = heights.map((h, i) => mkBuilding(`b${i}`, 4, 4, h));

    const resultA = normalizedHeightScale(cityA);
    const resultB = normalizedHeightScale(cityB);

    expect(resultA.clamped).toBe(false);
    expect(resultB.clamped).toBe(false);

    // Same target reached on both...
    expect(Math.abs(resultA.medianAspect - resultB.medianAspect)).toBeLessThan(1e-6);
    expect(Math.abs(resultA.medianAspect - TARGET_MEDIAN_ASPECT_DEFAULT)).toBeLessThan(1e-6);

    // ...via DIFFERENT scales -- a halved footprint needs half the heightScale to reach the
    // same aspect, this is the whole point of the module (a fixed constant cannot do this).
    expect(resultA.scale).not.toBeCloseTo(resultB.scale, 3);
    expect(Math.abs(resultB.scale - resultA.scale / 2)).toBeLessThan(1e-6);
  });
});

describe("normalizedHeightScale — clamping to the usable band [0.25, 2.0]", () => {
  it("clamps to the 2.0 ceiling and reports clamped:true when the ideal scale would exceed it", () => {
    // Huge footprint, tiny height -> ideal scale = target * 100 / 10 = 37, way above 2.0.
    const buildings = [
      mkBuilding("a", 100, 100, 8),
      mkBuilding("b", 100, 100, 10),
      mkBuilding("c", 100, 100, 12),
    ];

    const result = normalizedHeightScale(buildings);

    expect(result.clamped).toBe(true);
    expect(result.scale).toBe(2.0);
  });

  it("clamps to the 0.25 floor and reports clamped:true when the ideal scale would fall below it", () => {
    // Tiny footprint, huge height -> ideal scale = target * 1 / 1000, way below 0.25.
    const buildings = [
      mkBuilding("a", 1, 1, 800),
      mkBuilding("b", 1, 1, 1000),
      mkBuilding("c", 1, 1, 1200),
    ];

    const result = normalizedHeightScale(buildings);

    expect(result.clamped).toBe(true);
    expect(result.scale).toBe(0.25);
  });
});

describe("normalizedHeightScale / medianAspect — fail loudly on degenerate input", () => {
  it("throws on an empty building list instead of returning a fabricated 1/NaN/Infinity", () => {
    expect(() => normalizedHeightScale([])).toThrow(Error);
    expect(() => medianAspect([], 1)).toThrow(Error);
  });

  it("throws on a building with zero min(width, depth) instead of dividing by zero", () => {
    const buildings = [mkBuilding("a", 0, 10, 20), mkBuilding("b", 10, 10, 20)];
    expect(() => normalizedHeightScale(buildings)).toThrow(Error);
    expect(() => medianAspect(buildings, 1)).toThrow(Error);
  });

  it("throws on a building with negative min(width, depth) instead of returning a nonsensical ratio", () => {
    const buildings = [mkBuilding("a", -5, 10, 20), mkBuilding("b", 10, 10, 20)];
    expect(() => normalizedHeightScale(buildings)).toThrow(Error);
    expect(() => medianAspect(buildings, 1)).toThrow(Error);
  });

  it("never returns NaN or Infinity for any input it doesn't throw on", () => {
    const buildings = [mkBuilding("a", 5, 5, 50), mkBuilding("b", 7, 3, 20)];
    const result = normalizedHeightScale(buildings);
    expect(Number.isFinite(result.scale)).toBe(true);
    expect(Number.isFinite(result.medianAspect)).toBe(true);
    expect(Number.isFinite(medianAspect(buildings, 1))).toBe(true);
  });
});

describe("medianAspect — real median and monotonicity", () => {
  it("takes the standard even-length median (average of the two middle sorted values)", () => {
    // footprints all 10, heights 10/20/30/40 -> aspects@scale1 = 1,2,3,4 -> median = (2+3)/2 = 2.5
    const buildings = [
      mkBuilding("a", 10, 10, 10),
      mkBuilding("b", 10, 10, 20),
      mkBuilding("c", 10, 10, 30),
      mkBuilding("d", 10, 10, 40),
    ];

    expect(medianAspect(buildings, 1)).toBeCloseTo(2.5, 10);
  });

  it("is monotonic in heightScale", () => {
    const buildings = [
      mkBuilding("a", 6, 9, 12),
      mkBuilding("b", 15, 4, 88),
      mkBuilding("c", 3, 3, 3),
      mkBuilding("d", 40, 12, 200),
      mkBuilding("e", 8, 8, 30),
    ];

    const scales = [0.1, 0.5, 1, 1.5, 2, 3];
    const aspects = scales.map((s) => medianAspect(buildings, s));

    for (let i = 1; i < aspects.length; i++) {
      expect(aspects[i]).toBeGreaterThan(aspects[i - 1]);
    }
  });
});
