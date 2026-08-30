// src/renderer/timeline.ts's resolveScrubPosition -- the pure index-math this module uses to turn
// a continuous slider value into "which pair of snapshots, and how far between them". Tested in
// isolation (no THREE.js scene needed) because it's the one place an off-by-one would silently
// misreport which snapshot pair is active, which the rest of buildTimeline's logic (gap-freezing,
// date interpolation) all depends on.

import { describe, expect, it } from "vitest";
import { buildTimeline, resolveScrubPosition, type TimelineSnapshot } from "../src/renderer/timeline.ts";
import type { Building, CityModel } from "../src/types.ts";

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

function building(id: string): Building {
  return { id, x: 0, y: 0, width: 1, depth: 1, height: 1, style: "ts", metrics: { loc: 10, complexity: 1, churn: 1 } };
}

function city(buildings: Building[]): CityModel {
  return { districts: [], buildings, roads: [], landmarks: [], identityLinks: [] };
}

function snapshot(month: string, date: string, buildings: Building[], gapBefore = false): TimelineSnapshot {
  return { month, date, city: city(buildings), gapBefore };
}

describe("Lane E defect 2 -- buildTimeline.isEmptySnapshot() (never-fabricate a 0-building month as quiet)", () => {
  it("is false for a snapshot sequence where every month has buildings", () => {
    const handle = buildTimeline([
      snapshot("2026-01", "2026-01-15T00:00:00Z", [building("a")]),
      snapshot("2026-02", "2026-02-15T00:00:00Z", [building("a"), building("b")]),
    ]);
    handle.setPosition(0);
    expect(handle.isEmptySnapshot()).toBe(false);
    handle.setPosition(1);
    expect(handle.isEmptySnapshot()).toBe(false);
  });

  it("is true when scrubbed onto a resolved month whose snapshot has zero buildings", () => {
    // A real qualifying commit was found for 2026-03 (gapBefore stays false -- this is NOT a
    // history gap), but that month's RepoGraph had no tracked source files, so its CityModel
    // legitimately has zero buildings. The empty ground plane must be disclosed, not silent.
    const handle = buildTimeline([
      snapshot("2026-01", "2026-01-15T00:00:00Z", [building("a")]),
      snapshot("2026-02", "2026-02-15T00:00:00Z", []),
      snapshot("2026-03", "2026-03-15T00:00:00Z", [building("a")]),
    ]);
    // pairIndex 0 (2026-01 -> 2026-02), localT=1 lands exactly on the empty 2026-02 snapshot.
    handle.setPosition(1);
    expect(handle.isEmptySnapshot()).toBe(true);

    // pairIndex 1 (2026-02 -> 2026-03), localT=0 is still the same empty 2026-02 snapshot.
    handle.setPosition(1.001);
    expect(handle.isEmptySnapshot()).toBe(true);

    // Moving well into the 2026-02 -> 2026-03 pair leaves the empty month behind.
    handle.setPosition(1.9);
    expect(handle.isEmptySnapshot()).toBe(false);
  });

  it("a single-snapshot sequence with zero buildings is disclosed from the start", () => {
    const handle = buildTimeline([snapshot("2026-01", "2026-01-15T00:00:00Z", [])]);
    expect(handle.isEmptySnapshot()).toBe(true);
  });
});
