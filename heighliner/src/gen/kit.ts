// kit(structure, seedK) -> KitSpec. Session 1: two micro-generator parts,
// turret and thruster-cluster, placed on the structure's sockets. Each part
// draws from derive(seedK, socketId) so parts never share a stream.
// Shapes are part-local plain data: origin at socket anchor, +x outboard,
// +y aftward. Mirroring happens once, in emit, via the shared helper.

import { derive, int, range, stream, type Prng } from "../core/prng";
import { frames, halfWidthAt, yAt, type SegmentFrame } from "./structure";
import type { KitSpec, PartInstance, PartType, Placement, Shape, StructureSpec } from "./types";

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

function turretSmall(rng: Prng, size: number): PartInstance {
  // Compact single-barrel sibling of turret-large: same plate/housing/barrel
  // language, smaller and simpler (one barrel, no barrel-gap logic).
  const baseW = size * range(rng, 0.55, 0.75);
  const baseH = size * range(rng, 0.75, 1.0);
  const housingW = baseW * range(rng, 0.5, 0.7);
  const housingH = baseH * range(rng, 0.55, 0.75);
  const barrelLen = size * range(rng, 0.8, 1.2);
  const barrelW = size * range(rng, 0.09, 0.14);

  const shapes: Shape[] = [
    { kind: "rect", x: -baseW * 0.55, y: -baseH / 2, w: baseW, h: baseH, fill: "trim", stroke: "majorSeam" },
    { kind: "rect", x: -baseW * 0.2, y: -housingH / 2, w: housingW, h: housingH, fill: "dark", stroke: "majorSeam" },
    {
      kind: "rect",
      x: -baseW * 0.2 + housingW * 0.65,
      y: -barrelW / 2,
      w: barrelLen,
      h: barrelW,
      fill: "dark",
      stroke: "minorDetail",
    },
  ];
  return { type: "turret-small", shapes };
}

function pdcMount(rng: Prng, size: number): PartInstance {
  // Small point-defense nub: mounting plate + a stubby barrel with a bright
  // tip band — one of the two places the brief allows an accent role.
  const plateW = size * range(rng, 0.4, 0.55);
  const plateH = size * range(rng, 0.45, 0.6);
  const barrelLen = size * range(rng, 0.35, 0.55);
  const barrelW = size * range(rng, 0.1, 0.15);
  const tipLen = barrelLen * range(rng, 0.15, 0.25);

  const shapes: Shape[] = [
    { kind: "rect", x: -plateW * 0.6, y: -plateH / 2, w: plateW, h: plateH, fill: "trim", stroke: "majorSeam" },
    { kind: "rect", x: -plateW * 0.15, y: -barrelW / 2, w: barrelLen, h: barrelW, fill: "dark", stroke: "minorDetail" },
    {
      kind: "rect",
      x: -plateW * 0.15 + barrelLen - tipLen,
      y: -barrelW / 2,
      w: tipLen,
      h: barrelW,
      fill: "accent",
      stroke: "minorDetail",
    },
  ];
  return { type: "pdc-mount", shapes };
}

function sensorDish(rng: Prng, size: number): PartInstance {
  // Symmetric about x=0 — sits on a centerline socket that does not mirror.
  // Dish + hub centered on the axis; two struts fan from the anchor and, in
  // aggregate, mirror each other around x=0.
  const dishR = size * range(rng, 0.32, 0.45);
  const armLen = size * range(rng, 0.5, 0.8);
  const hubR = dishR * range(rng, 0.28, 0.38);
  const strutSpread = dishR * range(rng, 0.55, 0.75);

  const shapes: Shape[] = [
    { kind: "line", x1: -strutSpread, y1: 0, x2: 0, y2: -armLen, stroke: "minorDetail" },
    { kind: "line", x1: strutSpread, y1: 0, x2: 0, y2: -armLen, stroke: "minorDetail" },
    { kind: "circle", cx: 0, cy: -armLen, r: dishR, fill: "trim", stroke: "majorSeam" },
    { kind: "circle", cx: 0, cy: -armLen, r: hubR, fill: "dark", stroke: "minorDetail" },
  ];
  return { type: "sensor-dish", shapes };
}

function commMast(rng: Prng, size: number): PartInstance {
  // Thin axial mast + two crossbars, symmetric about x=0 (centerline socket,
  // never mirrored).
  const mastLen = size * range(rng, 0.85, 1.25);
  const mastW = size * range(rng, 0.05, 0.08);
  const barW1 = size * range(rng, 0.42, 0.6);
  const barW2 = barW1 * range(rng, 0.55, 0.75);
  const barH = mastW * range(rng, 0.8, 1.1);
  const bar1At = mastLen * range(rng, 0.35, 0.45);
  const bar2At = mastLen * range(rng, 0.65, 0.8);

  const shapes: Shape[] = [
    { kind: "rect", x: -mastW / 2, y: -mastLen, w: mastW, h: mastLen, fill: "trim", stroke: "majorSeam" },
    { kind: "rect", x: -barW1 / 2, y: -bar1At - barH / 2, w: barW1, h: barH, fill: "dark", stroke: "minorDetail" },
    { kind: "rect", x: -barW2 / 2, y: -bar2At - barH / 2, w: barW2, h: barH, fill: "dark", stroke: "minorDetail" },
    { kind: "circle", cx: 0, cy: -mastLen, r: mastW * 1.5, fill: "accent", stroke: "minorDetail" },
  ];
  return { type: "comm-mast", shapes };
}

function radiatorFin(rng: Prng, size: number): PartInstance {
  // Long thin outboard panel with rib lines. Lateral pair, mirrored by emit.
  const finLen = size * range(rng, 1.3, 2.0);
  const finW = size * range(rng, 0.28, 0.4);
  const ribCount = int(rng, 3, 5);
  const darkStripW = finW * range(rng, 0.18, 0.28);

  const shapes: Shape[] = [
    { kind: "rect", x: 0, y: -finW / 2, w: finLen, h: finW, fill: "baseAlt", stroke: "majorSeam" },
    { kind: "rect", x: 0, y: finW / 2 - darkStripW, w: finLen, h: darkStripW, fill: "dark", stroke: "minorDetail" },
  ];
  for (let i = 1; i <= ribCount; i++) {
    const x = (finLen * i) / (ribCount + 1);
    shapes.push({ kind: "line", x1: x, y1: -finW / 2, x2: x, y2: finW / 2, stroke: "minorDetail" });
  }
  return { type: "radiator-fin", shapes };
}

function cargoHatch(rng: Prng, size: number): PartInstance {
  // Recessed hatch set flush into the hull surface; kept entirely inboard
  // (x <= 0) of the anchor since it's a hull-surface feature, not a module
  // that sticks out past the silhouette.
  const hatchW = size * range(rng, 0.9, 1.3);
  const hatchH = size * range(rng, 0.55, 0.85);
  const frameT = hatchW * range(rng, 0.08, 0.12);
  const rivetR = frameT * range(rng, 0.3, 0.42);

  const frameW = hatchW + frameT;
  const frameH = hatchH + frameT * 2;

  const shapes: Shape[] = [
    // outer frame — one of the two brief-sanctioned accent uses
    { kind: "rect", x: -frameW, y: -frameH / 2, w: frameW, h: frameH, fill: "accent", stroke: "majorSeam" },
    // recessed panel
    { kind: "rect", x: -hatchW, y: -hatchH / 2, w: hatchW, h: hatchH, fill: "dark", stroke: "minorDetail" },
    // corner rivets
    { kind: "circle", cx: -frameW + frameT / 2, cy: -frameH / 2 + frameT / 2, r: rivetR, fill: "trim" },
    { kind: "circle", cx: -frameT / 2, cy: frameH / 2 - frameT / 2, r: rivetR, fill: "trim" },
  ];
  return { type: "cargo-hatch", shapes };
}

function dockingCollar(rng: Prng, size: number): PartInstance {
  // Ring: concentric circles + four clamp lugs, symmetric about x=0. The
  // east/west lugs mirror each other; north/south sit on the axis.
  const outerR = size * range(rng, 0.5, 0.7);
  const innerR = outerR * range(rng, 0.65, 0.8);
  const lugW = outerR * range(rng, 0.14, 0.2);
  const lugLen = outerR * range(rng, 0.22, 0.3);

  const shapes: Shape[] = [
    { kind: "circle", cx: 0, cy: 0, r: outerR, fill: "trim", stroke: "majorSeam" },
    { kind: "circle", cx: 0, cy: 0, r: innerR, fill: "dark", stroke: "minorDetail" },
    { kind: "rect", x: -lugW / 2, y: -outerR - lugLen, w: lugW, h: lugLen, fill: "trim", stroke: "minorDetail" },
    { kind: "rect", x: -lugW / 2, y: outerR, w: lugW, h: lugLen, fill: "trim", stroke: "minorDetail" },
    { kind: "rect", x: outerR, y: -lugW / 2, w: lugLen, h: lugW, fill: "trim", stroke: "minorDetail" },
    { kind: "rect", x: -outerR - lugLen, y: -lugW / 2, w: lugLen, h: lugW, fill: "trim", stroke: "minorDetail" },
  ];
  return { type: "docking-collar", shapes };
}

function ventStrip(rng: Prng, size: number): PartInstance {
  // Row of small dark slats along the hull edge, backed by a trim strip.
  const stripLen = size * range(rng, 0.9, 1.3);
  const stripW = size * range(rng, 0.22, 0.32);
  const slatCount = int(rng, 4, 6);
  const slatGapFrac = range(rng, 0.25, 0.4);

  const slatLen = stripLen / (slatCount + (slatCount - 1) * slatGapFrac);
  const gap = slatLen * slatGapFrac;

  const shapes: Shape[] = [
    { kind: "rect", x: -stripW * 0.3, y: 0, w: stripW, h: stripLen, fill: "trim", stroke: "majorSeam" },
  ];
  for (let i = 0; i < slatCount; i++) {
    const y = i * (slatLen + gap);
    shapes.push({ kind: "rect", x: -stripW * 0.15, y, w: stripW * 0.7, h: slatLen, fill: "dark", stroke: "minorDetail" });
  }
  return { type: "vent-strip", shapes };
}

function engineBell(rng: Prng, size: number): PartInstance {
  // Nozzle bell extending aftward (+y) from the anchor, symmetric about
  // x=0 — special-cased at the engine's aft centerline by the wiring lane.
  const throatR = size * range(rng, 0.3, 0.42);
  const mouthR = throatR * range(rng, 1.5, 1.9);
  const bellLen = size * range(rng, 0.9, 1.3);
  const rimT = bellLen * range(rng, 0.06, 0.1);

  const shapes: Shape[] = [
    // flared bell wall
    {
      kind: "poly",
      points: [
        [-throatR, 0],
        [throatR, 0],
        [mouthR, bellLen],
        [-mouthR, bellLen],
      ],
      fill: "dark",
      stroke: "majorSeam",
    },
    // inner throat
    { kind: "circle", cx: 0, cy: 0, r: throatR * 0.7, fill: "dark", stroke: "minorDetail" },
    // rim band at the mouth
    {
      kind: "poly",
      points: [
        [-mouthR, bellLen - rimT],
        [mouthR, bellLen - rimT],
        [mouthR, bellLen],
        [-mouthR, bellLen],
      ],
      fill: "trim",
      stroke: "minorDetail",
    },
  ];
  return { type: "engine-bell", shapes };
}

// Exported for the part-builder test suite (test/kit-parts.test.ts) — lets it
// iterate every PartType's builder directly without duplicating the map.
export const PART_BUILDERS: Record<PartType, (rng: Prng, size: number) => PartInstance> = {
  "turret-large": turret,
  "turret-small": turretSmall,
  "pdc-mount": pdcMount,
  "sensor-dish": sensorDish,
  "comm-mast": commMast,
  "thruster-cluster": thrusterCluster,
  "radiator-fin": radiatorFin,
  "cargo-hatch": cargoHatch,
  "docking-collar": dockingCollar,
  "vent-strip": ventStrip,
  "engine-bell": engineBell,
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
