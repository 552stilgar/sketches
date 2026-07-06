// structure(seedS) -> StructureSpec. Frigate role only in session 1.
// Fixed spine: engine -> drive -> mid* -> hull -> nose. Plain trapezoids.
// Per-segment dimensions come from derive(seedS, segmentId) streams so
// adding draws to one segment never disturbs another.

import { derive, int, range, stream } from "../core/prng";
import type { Segment, SegmentType, Socket, StructureSpec } from "./types";

// Frigate profile as data (brief §4.3); more roles = more rows, later.
const FRIGATE = {
  midRepeats: [1, 2] as const,
  engine: { len: [8, 12], foreShrink: [0.72, 0.9], aftHalfWidth: [6.5, 9] },
  drive: { len: [10, 16], step: [0.85, 1.0], taper: [0.9, 1.05] },
  mid: { len: [10, 16], step: [0.95, 1.12], taper: [0.92, 1.08] },
  hull: { len: [16, 24], step: [1.15, 1.4], taper: [0.85, 1.0] },
  nose: { len: [10, 16], step: [0.88, 1.0], tipFraction: [0.12, 0.28] },
};

function segment(
  seedS: number,
  id: string,
  type: SegmentType,
  prevFore: number,
  build: (rng: () => number, aft: number) => { length: number; fore: number; aft?: number },
): Segment {
  const rng = stream(derive(seedS, id));
  const spec = build(rng, prevFore);
  return {
    id,
    type,
    length: spec.length,
    profile: "taper",
    halfWidth: { aft: spec.aft ?? prevFore, fore: spec.fore },
    edgeFeatures: [],
    sockets: [],
  };
}

export function structure(seedS: number): StructureSpec {
  const rng = stream(seedS);
  const midCount = int(rng, FRIGATE.midRepeats[0], FRIGATE.midRepeats[1]);

  const segments: Segment[] = [];
  const p = FRIGATE;

  const engine = segment(seedS, "engine", "engine", 0, (r) => {
    const aft = range(r, p.engine.aftHalfWidth[0]!, p.engine.aftHalfWidth[1]!);
    return {
      length: range(r, p.engine.len[0]!, p.engine.len[1]!),
      aft,
      fore: aft * range(r, p.engine.foreShrink[0]!, p.engine.foreShrink[1]!),
    };
  });
  segments.push(engine);

  const trapezoid =
    (t: { len: number[]; step: number[]; taper: number[] }) =>
    (r: () => number, prevFore: number) => {
      const aft = prevFore * range(r, t.step[0]!, t.step[1]!);
      return {
        length: range(r, t.len[0]!, t.len[1]!),
        aft,
        fore: aft * range(r, t.taper[0]!, t.taper[1]!),
      };
    };

  const drive = segment(seedS, "drive", "drive", engine.halfWidth.fore, trapezoid(p.drive));
  segments.push(drive);

  let prevFore = drive.halfWidth.fore;
  for (let i = 0; i < midCount; i++) {
    const mid = segment(seedS, `mid-${i}`, "mid", prevFore, trapezoid(p.mid));
    segments.push(mid);
    prevFore = mid.halfWidth.fore;
  }

  const hull = segment(seedS, "hull", "hull", prevFore, trapezoid(p.hull));
  segments.push(hull);

  const nose = segment(seedS, "nose", "nose", hull.halfWidth.fore, (r, pf) => {
    const aft = pf * range(r, p.nose.step[0]!, p.nose.step[1]!);
    return {
      length: range(r, p.nose.len[0]!, p.nose.len[1]!),
      aft,
      fore: aft * range(r, p.nose.tipFraction[0]!, p.nose.tipFraction[1]!),
    };
  });
  segments.push(nose);

  // Sockets (session 1): two mirrored lateral pairs on the hull, one ring
  // band on the drive. Axial positions seeded from the socket layer of the
  // structure seed, per socket id.
  const socketAt = (id: string, lo: number, hi: number): number =>
    range(stream(derive(seedS, "socket", id)), lo, hi);

  const hullSockets: Socket[] = [
    { id: "hull-lat-0", kind: "lateralPair", at: socketAt("hull-lat-0", 0.2, 0.4), accepts: ["turret-large"] },
    { id: "hull-lat-1", kind: "lateralPair", at: socketAt("hull-lat-1", 0.6, 0.8), accepts: ["turret-large"] },
  ];
  hull.sockets = hullSockets;

  drive.sockets = [
    { id: "drive-ring-0", kind: "ringBand", at: socketAt("drive-ring-0", 0.35, 0.65), accepts: ["thruster-cluster"] },
  ];

  return {
    role: "frigate",
    axisLength: segments.reduce((sum, s) => sum + s.length, 0),
    segments,
  };
}

// --- geometry helpers shared by kit/emit (pure, derived from the spec) -------

export interface SegmentFrame {
  segment: Segment;
  /** World y of the aft edge (larger y = aftward; nose tip is y = 0). */
  yAft: number;
  /** World y of the fore edge. */
  yFore: number;
}

/** Lay segments out in world coords: nose tip at y=0, engine aft at y=axisLength. */
export function frames(spec: StructureSpec): SegmentFrame[] {
  const out: SegmentFrame[] = [];
  let sFromAft = 0;
  for (const seg of spec.segments) {
    const yAft = spec.axisLength - sFromAft;
    out.push({ segment: seg, yAft, yFore: yAft - seg.length });
    sFromAft += seg.length;
  }
  return out;
}

/** Half-width of a segment at axial fraction t (0 = aft, 1 = fore). */
export function halfWidthAt(seg: Segment, t: number): number {
  return seg.halfWidth.aft + (seg.halfWidth.fore - seg.halfWidth.aft) * t;
}

/** World y of a segment-relative axial fraction. */
export function yAt(frame: SegmentFrame, t: number): number {
  return frame.yAft - frame.segment.length * t;
}
