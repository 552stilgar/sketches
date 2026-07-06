// kit(structure, seedK) -> KitSpec. Session 1: two micro-generator parts,
// turret and thruster-cluster, placed on the structure's sockets. Each part
// draws from derive(seedK, socketId) so parts never share a stream.
// Shapes are part-local plain data: origin at socket anchor, +x outboard,
// +y aftward. Mirroring happens once, in emit, via the shared helper.

import { derive, int, range, stream, type Prng } from "../core/prng";
import { frames, halfWidthAt, yAt, type SegmentFrame } from "./structure";
import type { KitSpec, PartInstance, Placement, Shape, StructureSpec } from "./types";

function turret(rng: Prng, size: number): PartInstance {
  // Seeded internal proportions — no two turrets identical.
  const baseW = size * range(rng, 0.85, 1.15);
  const baseH = size * range(rng, 1.1, 1.5);
  const housingW = baseW * range(rng, 0.55, 0.75);
  const housingH = baseH * range(rng, 0.5, 0.7);
  const barrelLen = size * range(rng, 1.1, 1.8);
  const barrelW = size * range(rng, 0.1, 0.16);
  const barrelGap = housingH * range(rng, 0.3, 0.45);

  const shapes: Shape[] = [
    // base plate, seated across the hull edge (inboard half overlaps hull)
    { kind: "rect", x: -baseW * 0.6, y: -baseH / 2, w: baseW, h: baseH, fill: "trim", stroke: "majorSeam" },
    // housing
    { kind: "rect", x: -baseW * 0.25, y: -housingH / 2, w: housingW, h: housingH, fill: "dark", stroke: "majorSeam" },
    // two barrels, pointing outboard
    { kind: "rect", x: -baseW * 0.25 + housingW * 0.6, y: -barrelGap / 2 - barrelW / 2, w: barrelLen, h: barrelW, fill: "dark", stroke: "minorDetail" },
    { kind: "rect", x: -baseW * 0.25 + housingW * 0.6, y: barrelGap / 2 - barrelW / 2, w: barrelLen, h: barrelW, fill: "dark", stroke: "minorDetail" },
  ];
  return { type: "turret-large", shapes };
}

function thrusterCluster(rng: Prng, size: number): PartInstance {
  const nozzles = int(rng, 3, 4);
  const nozzleW = size * range(rng, 0.32, 0.42);
  const nozzleLen = size * range(rng, 0.55, 0.85);
  const gap = nozzleW * range(rng, 0.25, 0.45);
  const rowH = nozzles * nozzleW + (nozzles - 1) * gap;

  const shapes: Shape[] = [
    // pod mount plate against the hull edge
    { kind: "rect", x: -size * 0.25, y: -rowH / 2 - gap, w: size * 0.35, h: rowH + gap * 2, fill: "trim", stroke: "majorSeam" },
  ];
  for (let i = 0; i < nozzles; i++) {
    const y = -rowH / 2 + i * (nozzleW + gap);
    // nozzle: outboard-flaring trapezoid
    shapes.push({
      kind: "poly",
      points: [
        [size * 0.1, y + nozzleW * 0.18],
        [size * 0.1, y + nozzleW * 0.82],
        [size * 0.1 + nozzleLen, y + nozzleW],
        [size * 0.1 + nozzleLen, y],
      ],
      fill: "dark",
      stroke: "minorDetail",
    });
  }
  return { type: "thruster-cluster", shapes };
}

const PART_BUILDERS: Record<string, (rng: Prng, size: number) => PartInstance> = {
  "turret-large": turret,
  "thruster-cluster": thrusterCluster,
};

export function kit(structureSpec: StructureSpec, seedK: number): KitSpec {
  const placements: Placement[] = [];

  for (const frame of frames(structureSpec)) {
    for (const socket of frame.segment.sockets) {
      const partType = socket.accepts[0];
      if (partType === undefined) continue;
      const build = PART_BUILDERS[partType];
      if (!build) throw new Error(`no builder for part type: ${partType}`);

      const rng = stream(derive(seedK, socket.id));
      const size = partSize(frame, socket.at, partType);
      placements.push({
        socketId: socket.id,
        part: build(rng, size),
        anchor: { x: halfWidthAt(frame.segment, socket.at), y: yAt(frame, socket.at) },
        // lateralPair and ringBand both render as a mirrored pair in the
        // 2D top-down elevation
        mirrored: socket.kind === "lateralPair" || socket.kind === "ringBand",
      });
    }
  }

  return { placements };
}

function partSize(frame: SegmentFrame, at: number, partType: string): number {
  const hw = halfWidthAt(frame.segment, at);
  return partType === "turret-large" ? hw * 0.42 : hw * 0.5;
}
