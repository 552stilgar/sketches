// City lenses (docs/PROJECT_IDEA.md §5.3, Phase 5): src/renderer/lenses.ts. Load-bearing
// properties tested here: rank-based (not linear) scaling actually spends the palette/height
// range on a long-tailed distribution, the mapping is pure/deterministic, and Quality stays an
// honest UNMEASURED placeholder rather than a fabricated signal.

import { describe, expect, it } from "vitest";
import {
  computeCityLensRanks,
  DEFAULT_LENS,
  LENSES,
  lensById,
  lensColorHSL,
  lensHeightScale,
  percentileRank,
  rankForLens,
  sortedValues,
  type RankableBuilding,
} from "../src/renderer/lenses.ts";

// The real mock-city.json fixture's metrics (fixtures/mock-city.json) -- long-tailed on purpose:
// churn is 1 for 8 of 12 buildings, with a few outliers up to 9. A linear min-max map would crush
// that majority into a near-identical band; percentile rank must not.
const FIXTURE_COMPLEXITY = [5, 3, 4, 2, 2, 6, 9, 7, 3, 10, 14, 12];
const FIXTURE_CHURN = [1, 1, 1, 1, 1, 2, 2, 1, 1, 8, 9, 7];

function buildingsFrom(complexity: number[], churn: number[]): RankableBuilding[] {
  return complexity.map((c, i) => ({ id: `b${i}`, metrics: { complexity: c, churn: churn[i] } }));
}

describe("sortedValues", () => {
  it("does not mutate the input", () => {
    const values = [3, 1, 2];
    const sorted = sortedValues(values);
    expect(sorted).toEqual([1, 2, 3]);
    expect(values).toEqual([3, 1, 2]);
  });
});

describe("percentileRank", () => {
  it("returns 0 for an empty distribution and 0.5 for a singleton", () => {
    expect(percentileRank(5, [])).toBe(0);
    expect(percentileRank(5, [5])).toBe(0.5);
  });

  it("is monotone: a strictly greater value never gets a lower rank", () => {
    const sorted = sortedValues(FIXTURE_CHURN);
    let prevRank = -1;
    for (const v of sorted) {
      const rank = percentileRank(v, sorted);
      expect(rank).toBeGreaterThanOrEqual(prevRank - 1e-9);
      prevRank = rank;
    }
  });

  it("puts a uniquely-lowest value at 0 and a uniquely-highest value at 1 (no clamping loss)", () => {
    // A distribution with no ties at the extremes -- FIXTURE_COMPLEXITY's minimum (2) is tied
    // twice, which correctly does NOT land exactly at 0 (see the tie-midpoint test below), so this
    // uses an untied distribution to isolate the "no fixture even the true edges" property.
    const sorted = sortedValues([2, 5, 9, 14, 30]);
    expect(percentileRank(2, sorted)).toBeCloseTo(0, 9);
    expect(percentileRank(30, sorted)).toBeCloseTo(1, 9);
    // FIXTURE_COMPLEXITY's own unique max (14) still lands at 1.
    const complexitySorted = sortedValues(FIXTURE_COMPLEXITY);
    expect(percentileRank(Math.max(...complexitySorted), complexitySorted)).toBeCloseTo(1, 9);
  });

  it("gives tied values the shared midpoint rank of their block, not insertion order", () => {
    const sorted = sortedValues([1, 1, 1, 1, 5]);
    // Four tied 1s occupy ranks 0..3 of 5 values (0-indexed) -> midpoint (0+3)/2 = 1.5, /4 = 0.375.
    expect(percentileRank(1, sorted)).toBeCloseTo(1.5 / 4, 9);
    // Calling it twice with the same inputs must agree -- determinism, no hidden state.
    expect(percentileRank(1, sorted)).toBe(percentileRank(1, sorted));
  });

  it("stays within [0,1] for every value in a real fixture-shaped distribution", () => {
    const sorted = sortedValues(FIXTURE_CHURN);
    for (const v of FIXTURE_CHURN) {
      const rank = percentileRank(v, sorted);
      expect(rank).toBeGreaterThanOrEqual(0);
      expect(rank).toBeLessThanOrEqual(1);
    }
  });
});

describe("computeCityLensRanks — proves the spread over the long-tailed fixture", () => {
  const buildings = buildingsFrom(FIXTURE_COMPLEXITY, FIXTURE_CHURN);
  const ranks = computeCityLensRanks(buildings);

  it("returns a rank for every building, for both metrics", () => {
    for (const b of buildings) {
      expect(ranks.complexityRank.has(b.id)).toBe(true);
      expect(ranks.churnRank.has(b.id)).toBe(true);
    }
  });

  it("spreads churn ranks across most of [0,1] despite 8/12 buildings sharing churn=1 -- a naive " +
    "linear map over this distribution would instead crush those 8 into a sliver near 0", () => {
    const values = [...ranks.churnRank.values()];
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread).toBeGreaterThan(0.7);
    // The tied majority (churn=1) must not all collapse to exactly the same rank as the true
    // minimum in a way that reads as "everyone is equally lowest" -- they share a rank, but that
    // rank must sit at a real fraction of the range (not always 0), proving rank, not raw value,
    // drives the mapping.
    const b0Rank = ranks.churnRank.get("b0")!; // churn=1, tied with 7 others
    expect(b0Rank).toBeGreaterThan(0);
    expect(b0Rank).toBeLessThan(1);
  });

  it("spreads complexity ranks across most of the [0,1] palette", () => {
    const values = [...ranks.complexityRank.values()];
    const spread = Math.max(...values) - Math.min(...values);
    expect(spread).toBeGreaterThan(0.9);
    // At least a handful of buildings should land in each third of the range -- "most of the
    // palette" means the whole range is used, not just the two extremes.
    const low = values.filter((v) => v < 1 / 3).length;
    const mid = values.filter((v) => v >= 1 / 3 && v < 2 / 3).length;
    const high = values.filter((v) => v >= 2 / 3).length;
    expect(low).toBeGreaterThan(0);
    expect(mid).toBeGreaterThan(0);
    expect(high).toBeGreaterThan(0);
  });

  it("is a pure function: recomputing from the same input yields identical ranks", () => {
    const again = computeCityLensRanks(buildings);
    for (const b of buildings) {
      expect(again.complexityRank.get(b.id)).toBe(ranks.complexityRank.get(b.id));
      expect(again.churnRank.get(b.id)).toBe(ranks.churnRank.get(b.id));
    }
  });
});

describe("lensHeightScale", () => {
  it("architecture and quality are always unscaled (1) regardless of rank", () => {
    for (const rank of [0, 0.3, 0.7, 1]) {
      expect(lensHeightScale("architecture", rank)).toBe(1);
      expect(lensHeightScale("quality", rank)).toBe(1);
    }
  });

  it("complexity/activity are monotone non-decreasing in rank", () => {
    for (const lens of ["complexity", "activity"] as const) {
      let prev = lensHeightScale(lens, 0);
      for (const rank of [0.1, 0.25, 0.5, 0.75, 1]) {
        const cur = lensHeightScale(lens, rank);
        expect(cur).toBeGreaterThanOrEqual(prev);
        prev = cur;
      }
    }
  });

  it("never returns a non-positive scale (a lens must never collapse a building to nothing)", () => {
    for (const lens of ["architecture", "complexity", "activity", "quality"] as const) {
      expect(lensHeightScale(lens, 0)).toBeGreaterThan(0);
      expect(lensHeightScale(lens, 1)).toBeGreaterThan(0);
    }
  });

  it("clamps out-of-range ranks instead of extrapolating", () => {
    expect(lensHeightScale("complexity", -5)).toBe(lensHeightScale("complexity", 0));
    expect(lensHeightScale("complexity", 5)).toBe(lensHeightScale("complexity", 1));
  });
});

describe("lensColorHSL", () => {
  it("architecture defers to the caller's own base color (null = 'use existing logic')", () => {
    expect(lensColorHSL("architecture", 0.5)).toBeNull();
  });

  it("quality is rank-independent -- an UNMEASURED lens must never vary with data it doesn't have", () => {
    const a = lensColorHSL("quality", 0);
    const b = lensColorHSL("quality", 1);
    expect(a).toEqual(b);
    expect(a!.sat).toBe(0); // flat/desaturated -- never reads as a real heat signal
  });

  it("complexity and activity vary with rank (real signal, not a flat placeholder)", () => {
    const low = lensColorHSL("complexity", 0)!;
    const high = lensColorHSL("complexity", 1)!;
    expect(low.hue).not.toBe(high.hue);
    const lowA = lensColorHSL("activity", 0)!;
    const highA = lensColorHSL("activity", 1)!;
    expect(lowA.hue).not.toBe(highA.hue);
  });

  it("complexity and activity use distinct hue ramps from each other", () => {
    // At the same rank, the two structural lenses must not be visually interchangeable.
    expect(lensColorHSL("complexity", 0.5)!.hue).not.toBe(lensColorHSL("activity", 0.5)!.hue);
  });
});

describe("rankForLens", () => {
  const ranks = { complexityRank: 0.2, churnRank: 0.9 };
  it("selects the matching rank per lens, and 0 for lenses with no rank input", () => {
    expect(rankForLens("complexity", ranks)).toBe(0.2);
    expect(rankForLens("activity", ranks)).toBe(0.9);
    expect(rankForLens("architecture", ranks)).toBe(0);
    expect(rankForLens("quality", ranks)).toBe(0);
  });
});

describe("LENSES catalog", () => {
  it("includes Architecture (default, first), Complexity, and Activity at minimum", () => {
    const ids = LENSES.map((l) => l.id);
    expect(ids).toContain("architecture");
    expect(ids).toContain("complexity");
    expect(ids).toContain("activity");
    expect(ids[0]).toBe("architecture");
    expect(DEFAULT_LENS).toBe("architecture");
  });

  it("marks Quality as NOT measured, and every measured lens as measured", () => {
    const quality = LENSES.find((l) => l.id === "quality")!;
    expect(quality.measured).toBe(false);
    expect(quality.description.toUpperCase()).toContain("UNMEASURED");
    for (const lens of LENSES.filter((l) => l.id !== "quality")) {
      expect(lens.measured).toBe(true);
    }
  });

  it("lensById resolves every catalog entry and throws on an unknown id", () => {
    for (const lens of LENSES) {
      expect(lensById(lens.id)).toBe(lens);
    }
    // @ts-expect-error -- deliberately invalid id to prove this throws rather than fabricating one
    expect(() => lensById("not-a-real-lens")).toThrow();
  });
});
