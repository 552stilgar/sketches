// The shared weight -> motion mapping (docs/PROJECT_IDEA.md 5.5 "Animated flow"). Both the
// Three.js path and the SVG path consume these decision rules -- see src/renderer/flow.ts.
//
// The load-bearing properties here are: monotonicity (busier road never animates slower),
// degenerate-collapse (no fabricated spread where the data has none), clock-purity (the same
// elapsed time always yields the same offset), and provenance (structural flow can never be
// silently labelled measured).

import { describe, expect, it } from "vitest";
import { computeRoadTierBoundaries } from "../src/renderer/roads.ts";
import {
  dashOffsetAt,
  flowBoundaries,
  flowParams,
  normalizeWeight,
  FLOW_PROVENANCE_LABEL,
} from "../src/renderer/flow.ts";

const spread = computeRoadTierBoundaries([1, 2, 3, 4, 5, 6, 7, 8]);

describe("normalizeWeight", () => {
  it("collapses to 0 when the distribution has no spread", () => {
    // Every road identical: there is no traffic structure to render, and inventing one would
    // fabricate the exact signal 5.5 forbids.
    expect(normalizeWeight(4, computeRoadTierBoundaries([4, 4, 4, 4]))).toBe(0);
    expect(normalizeWeight(undefined, computeRoadTierBoundaries([]))).toBe(0);
  });

  it("treats undefined weight as 1, matching roadTier's unweighted default", () => {
    expect(normalizeWeight(undefined, spread)).toBe(normalizeWeight(1, spread));
  });

  it("stays within [0,1] and saturates above q3", () => {
    expect(normalizeWeight(1, spread)).toBe(0);
    expect(normalizeWeight(999, spread)).toBe(1);
    for (const w of [1, 2, 3, 5, 8, 13]) {
      const n = normalizeWeight(w, spread);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});

describe("flowParams", () => {
  it("animates to->from: data flow, not control flow", () => {
    // "A imports B" is emitted as {from: A, to: B}; results flow B -> A.
    expect(flowParams(3, spread).direction).toBe("to-from");
  });

  it("is monotone in weight: heavier roads never animate slower or sparser", () => {
    let prev = flowParams(1, spread);
    for (const w of [2, 3, 4, 5, 6, 7, 8, 40]) {
      const cur = flowParams(w, spread);
      expect(cur.speed).toBeGreaterThanOrEqual(prev.speed);
      expect(cur.dashPeriod).toBeLessThanOrEqual(prev.dashPeriod);
      prev = cur;
    }
  });

  it("gives every road identical motion when the distribution is degenerate", () => {
    const flat = computeRoadTierBoundaries([4, 4, 4]);
    expect(flowParams(4, flat)).toEqual(flowParams(4, flat));
    expect(flowParams(4, flat).speed).toBe(flowParams(undefined, flat).speed);
  });

  it("never emits a zero or negative speed -- an unweighted road is slow, not stopped", () => {
    // PROJECT_IDEA 5.5: a missing weight is UNWEIGHTED, never zero traffic.
    expect(flowParams(undefined, spread).speed).toBeGreaterThan(0);
    expect(flowParams(1, computeRoadTierBoundaries([1, 1, 1])).speed).toBeGreaterThan(0);
  });

  it("defaults to structural provenance and carries a label for every provenance", () => {
    expect(flowParams(3, spread).provenance).toBe("structural");
    expect(flowParams(3, spread, "measured").provenance).toBe("measured");
    for (const p of ["structural", "historical", "measured"] as const) {
      expect(FLOW_PROVENANCE_LABEL[p]).toBeTruthy();
    }
    // Structural and measured must never share a label -- that distinction is the whole rule.
    expect(FLOW_PROVENANCE_LABEL.structural).not.toBe(FLOW_PROVENANCE_LABEL.measured);
  });

  it("flowBoundaries agrees with the tiering boundaries, byte for byte", () => {
    const weights = [1, undefined, 5, 2, 9];
    expect(flowBoundaries(weights)).toEqual(computeRoadTierBoundaries(weights));
  });
});

describe("dashOffsetAt", () => {
  it("is a pure function of the caller's clock", () => {
    const p = flowParams(5, spread);
    expect(dashOffsetAt(p, 1.25)).toBe(dashOffsetAt(p, 1.25));
  });

  it("advances with time and wraps within one dash period", () => {
    const p = flowParams(5, spread);
    expect(dashOffsetAt(p, 0)).toBe(0);
    expect(dashOffsetAt(p, 0.1)).toBeGreaterThan(dashOffsetAt(p, 0));
    for (const t of [0, 0.5, 3, 60, 3600, 86_400]) {
      const off = dashOffsetAt(p, t);
      expect(off).toBeGreaterThanOrEqual(0);
      expect(off).toBeLessThan(p.dashPeriod);
    }
  });

  it("stays non-negative for a negative clock rather than reversing direction", () => {
    const p = flowParams(5, spread);
    expect(dashOffsetAt(p, -1)).toBeGreaterThanOrEqual(0);
  });
});
