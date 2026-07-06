// detail(structure, seedD) -> DetailSpec. Session 1: one treatment,
// uniform panel-grid per segment. Counts drawn per segment from
// derive(seedD, segmentId); emit turns counts into mirrored line geometry
// clipped to the segment silhouette.

import { derive, int, stream } from "../core/prng";
import type { DetailSpec, SegmentDetail, StructureSpec } from "./types";

export function detail(structureSpec: StructureSpec, seedD: number): DetailSpec {
  const perSegment: SegmentDetail[] = structureSpec.segments.map((seg) => {
    const rng = stream(derive(seedD, seg.id));
    const meanHalfWidth = (seg.halfWidth.aft + seg.halfWidth.fore) / 2;
    return {
      segmentId: seg.id,
      treatment: "panel-grid",
      lattice: {
        bands: Math.max(2, int(rng, 0, 1) + Math.round(seg.length / 4.5)),
        // columns per half — emit mirrors them across the centerline
        cols: Math.max(1, int(rng, 0, 1) + Math.round(meanHalfWidth / 3.5)),
      },
    };
  });
  return { perSegment };
}
