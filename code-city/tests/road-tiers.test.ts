// Pure road-tiering logic (docs/PROJECT_IDEA.md 5.5 "Road tiering"). These are the decision
// rules the Three.js path and the SVG path both consume -- see src/renderer/roads.ts.

import { describe, expect, it } from "vitest";
import {
  computeRoadTierBoundaries,
  roadTier,
  ROAD_TIERS,
  type RoadTierBoundaries,
} from "../src/renderer/roads.ts";

describe("computeRoadTierBoundaries", () => {
  it("returns the unweighted default (1,1,1) for an empty road list", () => {
    expect(computeRoadTierBoundaries([])).toEqual({ q1: 1, q2: 1, q3: 1 });
  });

  it("collapses to a single point when every weight is equal", () => {
    expect(computeRoadTierBoundaries([4, 4, 4, 4])).toEqual({ q1: 4, q2: 4, q3: 4 });
  });

  it("treats undefined weight as 1, matching roadTier's default", () => {
    expect(computeRoadTierBoundaries([undefined, undefined])).toEqual({ q1: 1, q2: 1, q3: 1 });
    // Mixing undefined with explicit 1s must produce the identical boundaries -- undefined IS 1,
    // not a separate unmeasured bucket.
    expect(computeRoadTierBoundaries([undefined, 1, 1])).toEqual(computeRoadTierBoundaries([1, 1, 1]));
  });

  it("computes 25th/50th/75th percentile by nearest-rank, deterministically", () => {
    // sorted: [1,2,3,4,5,6,7,8] (n=8) -> nearest-rank index = ceil(p*n)
    // p=0.25 -> ceil(2)=2 -> value 2 ; p=0.5 -> ceil(4)=4 -> value 4 ; p=0.75 -> ceil(6)=6 -> value 6
    const weights = [8, 1, 6, 3, 2, 5, 7, 4]; // deliberately unsorted input
    expect(computeRoadTierBoundaries(weights)).toEqual({ q1: 2, q2: 4, q3: 6 });
  });

  it("is deterministic across repeated calls and independent of input order", () => {
    const a = computeRoadTierBoundaries([5, 1, 3, 9, 2]);
    const b = computeRoadTierBoundaries([5, 1, 3, 9, 2]);
    const c = computeRoadTierBoundaries([9, 5, 3, 2, 1]);
    expect(a).toEqual(b);
    expect(a).toEqual(c);
  });

  it("does not fabricate spread for a single road", () => {
    expect(computeRoadTierBoundaries([7])).toEqual({ q1: 7, q2: 7, q3: 7 });
  });
});

describe("roadTier", () => {
  const boundaries: RoadTierBoundaries = { q1: 2, q2: 4, q3: 6 };

  it("classifies at and below q1 as footpath", () => {
    expect(roadTier(1, boundaries)).toBe("footpath");
    expect(roadTier(2, boundaries)).toBe("footpath");
  });

  it("classifies between q1 and q2 as street", () => {
    expect(roadTier(3, boundaries)).toBe("street");
    expect(roadTier(4, boundaries)).toBe("street");
  });

  it("classifies between q2 and q3 as arterial", () => {
    expect(roadTier(5, boundaries)).toBe("arterial");
    expect(roadTier(6, boundaries)).toBe("arterial");
  });

  it("classifies above q3 as highway", () => {
    expect(roadTier(7, boundaries)).toBe("highway");
    expect(roadTier(100, boundaries)).toBe("highway");
  });

  it("treats undefined weight the same as weight 1 (unweighted, never zero traffic)", () => {
    expect(roadTier(undefined, boundaries)).toBe(roadTier(1, boundaries));
    expect(roadTier(undefined, boundaries)).toBe("footpath");
  });

  it("puts every road in footpath when boundaries have collapsed (all-equal weights)", () => {
    const flat: RoadTierBoundaries = { q1: 5, q2: 5, q3: 5 };
    expect(roadTier(5, flat)).toBe("footpath");
    expect(roadTier(1, flat)).toBe("footpath");
    // Nothing can exceed a collapsed q3 unless it's genuinely above every observed weight --
    // there's no fabricated tier for a distribution that has no spread.
  });

  it("is monotonic: a higher weight never resolves to a strictly lower tier", () => {
    const rank = new Map(ROAD_TIERS.map((tier, i) => [tier, i]));
    const b: RoadTierBoundaries = { q1: 3, q2: 6, q3: 12 };
    const weights = [1, 2, 3, 4, 6, 7, 12, 13, 50];
    let prevRank = -1;
    for (const w of weights) {
      const r = rank.get(roadTier(w, b))!;
      expect(r).toBeGreaterThanOrEqual(prevRank);
      prevRank = r;
    }
  });
});

describe("small-weight repos still get tier separation, not one magic-threshold bucket", () => {
  it("a repo whose heaviest road carries weight 3 does not dump every road into footpath", () => {
    // Fixed magic-number thresholds (e.g. "highway = weight > 50") would put every one of these
    // in the same bottom tier. Quantile-based boundaries scale to what THIS city actually has.
    const weights = [1, 1, 1, 2, 2, 3];
    const boundaries = computeRoadTierBoundaries(weights);
    const tiers = new Set(weights.map((w) => roadTier(w, boundaries)));
    expect(tiers.size).toBeGreaterThan(1);
    // The heaviest road in the city should read as visibly more significant than the lightest.
    expect(roadTier(3, boundaries)).not.toBe("footpath");
    expect(roadTier(1, boundaries)).toBe("footpath");
  });

  it("a wider small-integer spread reaches all four tiers", () => {
    const weights = [1, 1, 1, 1, 2, 2, 2, 3, 3, 4];
    const boundaries = computeRoadTierBoundaries(weights);
    const tiers = new Set(weights.map((w) => roadTier(w, boundaries)));
    expect(tiers).toEqual(new Set(ROAD_TIERS));
  });
});
