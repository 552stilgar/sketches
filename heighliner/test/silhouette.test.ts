// Silhouette layer (brief §6 layer 1): profile curves, edge features, join
// collars. halfWidthAt is the single source of truth for the visible edge;
// segmentOutline is the closed polygon everything renders from.

import { describe, expect, it } from "vitest";
import { derive } from "../src/core/prng";
import { frames, halfWidthAt, segmentOutline, structure, yAt } from "../src/gen/structure";
import { shipSpecs } from "../src/gen/ship";
import type { ProfileType } from "../src/gen/types";

const SEEDS = Array.from({ length: 40 }, (_, i) => derive(0x5eed, "silhouette-suite", i));

describe("halfWidthAt", () => {
  it("is finite, positive, and matches aft/fore at the segment ends", () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const spec = structure(derive(seed, "structure"));
      for (const seg of spec.segments) {
        // features keep clear of t=0/1, so ends are exact profile values
        expect(halfWidthAt(seg, 0)).toBeCloseTo(seg.halfWidth.aft, 9);
        expect(halfWidthAt(seg, 1)).toBeCloseTo(seg.halfWidth.fore, 9);
        for (let i = 0; i <= 50; i++) {
          const w = halfWidthAt(seg, i / 50);
          expect(Number.isFinite(w)).toBe(true);
          expect(w).toBeGreaterThan(0);
        }
      }
    }
  });

  it("bulge peaks exceed both end widths", () => {
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      for (const seg of spec.segments) {
        if (seg.profile !== "bulge") continue;
        const { aft, fore, peak } = seg.halfWidth;
        expect(peak).toBeDefined();
        expect(peak!).toBeGreaterThan(Math.max(aft, fore));
        // where no edge feature overlaps the apex, the visible edge hits it
        const apexClear = seg.edgeFeatures.every((f) => seg.profileT! <= f.span.from || seg.profileT! >= f.span.to);
        if (apexClear) expect(halfWidthAt(seg, seg.profileT!)).toBeCloseTo(peak!, 9);
      }
    }
  });

  it("edge feature spans stay inside the segment with an end margin", () => {
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      for (const seg of spec.segments) {
        expect(seg.edgeFeatures.length).toBeLessThanOrEqual(2);
        for (const f of seg.edgeFeatures) {
          expect(f.span.from).toBeGreaterThan(0.05);
          expect(f.span.to).toBeLessThan(0.95);
          expect(f.span.from).toBeLessThan(f.span.to);
          // depth signs: sponson/shoulderStep outboard, notch/chamfer inboard
          if (f.type === "sponson" || f.type === "shoulderStep") expect(f.depth).toBeGreaterThan(0);
          else expect(f.depth).toBeLessThan(0);
        }
      }
    }
  });
});

describe("segmentOutline", () => {
  it("is closed, finite, and x-symmetric point-for-point", () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const spec = structure(derive(seed, "structure"));
      for (const frame of frames(spec)) {
        const pts = segmentOutline(frame);
        // plain taper with no features = 4 points; anything else adds vertices
        expect(pts.length).toBeGreaterThanOrEqual(4);
        expect(pts.length % 2).toBe(0);
        const n = pts.length;
        for (const [x, y] of pts) {
          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
        }
        // starboard half then port half reversed: pts[i] mirrors pts[n-1-i]
        for (let i = 0; i < n / 2; i++) {
          const [sx, sy] = pts[i]!;
          const [px, py] = pts[n - 1 - i]!;
          expect(px).toBeCloseTo(-sx, 9);
          expect(py).toBeCloseTo(sy, 9);
        }
        // ring closes across the aft edge: first and last share y = yAft
        expect(pts[0]![1]).toBeCloseTo(frame.yAft, 9);
        expect(pts[n - 1]![1]).toBeCloseTo(frame.yAft, 9);
        // outline spans the segment axially
        const ys = pts.map(([, y]) => y);
        expect(Math.min(...ys)).toBeCloseTo(frame.yFore, 9);
        expect(Math.max(...ys)).toBeCloseTo(frame.yAft, 9);
      }
    }
  });

  it("outline points sit on halfWidthAt (single source of truth)", () => {
    const spec = structure(derive(SEEDS[0]!, "structure"));
    for (const frame of frames(spec)) {
      const pts = segmentOutline(frame);
      for (let i = 0; i < pts.length / 2; i++) {
        const [x, y] = pts[i]!;
        const t = (frame.yAft - y) / frame.segment.length;
        expect(x).toBeCloseTo(halfWidthAt(frame.segment, t), 6);
        expect(y).toBeCloseTo(yAt(frame, t), 6);
      }
    }
  });
});

describe("variety guard", () => {
  it("~40 seeds show >=3 distinct profiles, >=1 edge feature, and some collars", () => {
    const profiles = new Set<ProfileType>();
    let featureCount = 0;
    let collarCount = 0;
    let zeroFeatureSegments = 0;
    let totalSegments = 0;
    for (const seed of SEEDS) {
      const { structure: spec } = shipSpecs(seed);
      for (const seg of spec.segments) {
        profiles.add(seg.profile);
        featureCount += seg.edgeFeatures.length;
        if (seg.edgeFeatures.length === 0) zeroFeatureSegments++;
        if (seg.join) collarCount++;
        totalSegments++;
      }
    }
    expect(profiles.size).toBeGreaterThanOrEqual(3);
    expect(featureCount).toBeGreaterThanOrEqual(1);
    expect(collarCount).toBeGreaterThanOrEqual(1);
    // restraint: a solid share of segments carry no feature at all
    expect(zeroFeatureSegments / totalSegments).toBeGreaterThan(0.3);
  });

  it("re-rolling kit/detail/paint leaves the silhouette spec untouched", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const base = shipSpecs(seed);
      for (const layer of ["kit", "detail", "paint"] as const) {
        const rerolled = shipSpecs(seed, { [layer]: derive(seed, layer, "re-roll", 7) });
        expect(rerolled.structure).toEqual(base.structure);
      }
    }
  });
});
