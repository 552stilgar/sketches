// src/renderer/timeline.ts's resolveScrubPosition -- the pure index-math this module uses to turn
// a continuous slider value into "which pair of snapshots, and how far between them". Tested in
// isolation (no THREE.js scene needed) because it's the one place an off-by-one would silently
// misreport which snapshot pair is active, which the rest of buildTimeline's logic (gap-freezing,
// date interpolation) all depends on.

import { describe, expect, it } from "vitest";
import { resolveScrubPosition } from "../src/renderer/timeline.ts";

describe("resolveScrubPosition", () => {
  it("a single snapshot always resolves to pairIndex 0, localT 0, never a gap", () => {
    expect(resolveScrubPosition(0, 1)).toEqual({ pairIndex: 0, localT: 0, isGap: false });
    // Even an out-of-range value on a length-1 sequence stays pinned.
    expect(resolveScrubPosition(5, 1)).toEqual({ pairIndex: 0, localT: 0, isGap: false });
  });

  it("resolves the exact start of a pair", () => {
    expect(resolveScrubPosition(0, 4)).toEqual({ pairIndex: 0, localT: 0, isGap: false });
    expect(resolveScrubPosition(2, 4)).toEqual({ pairIndex: 2, localT: 0, isGap: false });
  });

  it("resolves a fractional position within a pair", () => {
    expect(resolveScrubPosition(1.25, 4)).toEqual({ pairIndex: 1, localT: 0.25, isGap: false });
  });

  it("resolves the very end of the sequence to the LAST pair at localT=1, not a nonexistent next pair", () => {
    // count=4 -> valid indices [0,1,2,3]; the last pair is (2,3).
    expect(resolveScrubPosition(3, 4)).toEqual({ pairIndex: 2, localT: 1, isGap: false });
  });

  it("clamps a value below 0", () => {
    expect(resolveScrubPosition(-3, 4)).toEqual({ pairIndex: 0, localT: 0, isGap: false });
  });

  it("clamps a value past the end", () => {
    expect(resolveScrubPosition(99, 4)).toEqual({ pairIndex: 2, localT: 1, isGap: false });
  });

  it("is a pure function -- same inputs always produce the same output", () => {
    expect(resolveScrubPosition(1.7, 5)).toEqual(resolveScrubPosition(1.7, 5));
  });
});
