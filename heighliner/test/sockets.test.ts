// K2 socket-generation + placement wiring (brief §4.3/§4.4/§6): hull weapon
// fill, mid/drive utility fill, budget clamps, axial spacing, and the kit
// layer's mirrored/centerline anchoring + engine-bell special case.

import { describe, expect, it } from "vitest";
import { derive } from "../src/core/prng";
import { kit } from "../src/gen/kit";
import { MIN_SOCKET_SPACING, frames, halfWidthAt, structure } from "../src/gen/structure";
import type { PartType, Socket, StructureSpec } from "../src/gen/types";

const BASE_SEED = 0x6e1cafe0 | 0;
const SEEDS: number[] = Array.from({ length: 60 }, (_, i) => derive(BASE_SEED, "sockets-test-seed", i));

const ALL_PART_TYPES: PartType[] = [
  "turret-large",
  "turret-small",
  "pdc-mount",
  "sensor-dish",
  "comm-mast",
  "thruster-cluster",
  "radiator-fin",
  "cargo-hatch",
  "docking-collar",
  "vent-strip",
  "engine-bell",
];

function allSockets(spec: StructureSpec): Socket[] {
  return spec.segments.flatMap((s) => s.sockets);
}

// Budget categories key off (segment type, socket kind), not accepts-list
// membership — docking-collar is intentionally accepted by both mid utility
// lateral sockets *and* nose's centerline socket (brief item 1), so accepts
// overlap alone can't distinguish the two budgets.
function weaponSocketCount(spec: StructureSpec): number {
  return spec.segments
    .filter((s) => s.type === "hull")
    .flatMap((s) => s.sockets)
    .filter((s) => s.kind === "lateralPair").length;
}

function utilitySocketCount(spec: StructureSpec): number {
  return spec.segments
    .filter((s) => s.type === "mid" || s.type === "drive")
    .flatMap((s) => s.sockets)
    .filter((s) => s.kind === "lateralPair").length;
}

describe("socket budgets (brief §4.3, frigate weapon fill MID)", () => {
  it("total weapon sockets stay within the 2-3 budget across 60 seeds", () => {
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      const n = weaponSocketCount(spec);
      expect(n, `seed=${seed}`).toBeGreaterThanOrEqual(2);
      expect(n, `seed=${seed}`).toBeLessThanOrEqual(3);
    }
  });

  it("total utility sockets (mids + drive) stay within the 2-5 budget across 60 seeds", () => {
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      const n = utilitySocketCount(spec);
      expect(n, `seed=${seed}`).toBeGreaterThanOrEqual(2);
      expect(n, `seed=${seed}`).toBeLessThanOrEqual(5);
    }
  });

  it("only the hull carries lateralPair sockets accepting weapon parts", () => {
    const weaponAccepts: PartType[] = ["turret-large", "turret-small", "pdc-mount"];
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      for (const seg of spec.segments) {
        const weaponSockets = seg.sockets.filter(
          (s) => s.kind === "lateralPair" && s.accepts.some((p) => weaponAccepts.includes(p)),
        );
        if (weaponSockets.length > 0) expect(seg.type, `seed=${seed}`).toBe("hull");
      }
    }
  });

  it("only mid/drive segments carry lateralPair utility sockets", () => {
    const utilityAccepts: PartType[] = ["radiator-fin", "cargo-hatch", "vent-strip", "docking-collar"];
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      for (const seg of spec.segments) {
        const utilitySockets = seg.sockets.filter(
          (s) => s.kind === "lateralPair" && s.accepts.every((p) => utilityAccepts.includes(p)),
        );
        if (utilitySockets.length > 0) expect(["mid", "drive"], `seed=${seed}`).toContain(seg.type);
      }
    }
  });

  it("engine segment never carries sockets (engine-bell is special-cased, not socket-placed)", () => {
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      const engine = spec.segments.find((s) => s.type === "engine")!;
      expect(engine.sockets, `seed=${seed}`).toHaveLength(0);
    }
  });

  it("drive always has exactly one ringBand thruster-cluster socket", () => {
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      const drive = spec.segments.find((s) => s.type === "drive")!;
      const rings = drive.sockets.filter((s) => s.kind === "ringBand");
      expect(rings, `seed=${seed}`).toHaveLength(1);
      expect(rings[0]!.accepts, `seed=${seed}`).toEqual(["thruster-cluster"]);
    }
  });
});

describe("axial spacing (min Delta t ~0.18 between sockets on one segment)", () => {
  it("no two sockets on the same segment sit closer than MIN_SOCKET_SPACING", () => {
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      for (const seg of spec.segments) {
        const positions = seg.sockets.map((s) => s.at).sort((a, b) => a - b);
        for (let i = 1; i < positions.length; i++) {
          const gap = positions[i]! - positions[i - 1]!;
          expect(gap, `seed=${seed} seg=${seg.id} positions=${positions}`).toBeGreaterThanOrEqual(
            MIN_SOCKET_SPACING - 1e-9,
          );
        }
      }
    }
  });

  it("all socket axial fractions stay within [0, 1]", () => {
    for (const seed of SEEDS) {
      const spec = structure(derive(seed, "structure"));
      for (const socket of allSockets(spec)) {
        expect(socket.at, socket.id).toBeGreaterThanOrEqual(0);
        expect(socket.at, socket.id).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("variety: every PartType appears at least once across the sample", () => {
  it("60 seeds collectively exercise every kit PartType", () => {
    const seen = new Set<PartType>();
    for (const seed of SEEDS) {
      const structureSpec = structure(derive(seed, "structure"));
      const kitSpec = kit(structureSpec, derive(seed, "kit"));
      for (const placement of kitSpec.placements) seen.add(placement.part.type);
    }
    for (const pt of ALL_PART_TYPES) {
      expect(seen.has(pt), `${pt} never appeared across ${SEEDS.length} seeds`).toBe(true);
    }
  });
});

describe("kit placement wiring", () => {
  it("lateralPair / ringBand placements anchor exactly on halfWidthAt(seg, at)", () => {
    for (const seed of SEEDS) {
      const structureSpec = structure(derive(seed, "structure"));
      const kitSpec = kit(structureSpec, derive(seed, "kit"));
      const byId = new Map(structureSpec.segments.flatMap((seg) => seg.sockets.map((s) => [s.id, { seg, s }])));
      for (const placement of kitSpec.placements) {
        const found = byId.get(placement.socketId);
        if (!found) continue; // engine-bell: not socket-backed
        const { seg, s } = found;
        if (s.kind === "lateralPair" || s.kind === "ringBand") {
          expect(placement.mirrored, placement.socketId).toBe(true);
          expect(placement.anchor.x, placement.socketId).toBeCloseTo(halfWidthAt(seg, s.at), 9);
        }
      }
    }
  });

  it("centerline placements anchor at x=0 and are never mirrored", () => {
    for (const seed of SEEDS) {
      const structureSpec = structure(derive(seed, "structure"));
      const kitSpec = kit(structureSpec, derive(seed, "kit"));
      const byId = new Map(structureSpec.segments.flatMap((seg) => seg.sockets.map((s) => [s.id, s])));
      for (const placement of kitSpec.placements) {
        const s = byId.get(placement.socketId);
        if (!s) continue; // engine-bell: not socket-backed
        if (s.kind === "centerline" || s.kind === "area") {
          expect(placement.anchor.x, placement.socketId).toBe(0);
          expect(placement.mirrored, placement.socketId).toBe(false);
        }
      }
    }
  });

  it("engine-bell is present exactly once per ship, unmirrored, anchored on the axis at the engine's aft edge", () => {
    for (const seed of SEEDS) {
      const structureSpec = structure(derive(seed, "structure"));
      const kitSpec = kit(structureSpec, derive(seed, "kit"));
      const bells = kitSpec.placements.filter((p) => p.part.type === "engine-bell");
      expect(bells, `seed=${seed}`).toHaveLength(1);
      const bell = bells[0]!;
      expect(bell.mirrored, `seed=${seed}`).toBe(false);
      expect(bell.anchor.x, `seed=${seed}`).toBe(0);
      const engineFrame = frames(structureSpec).find((f) => f.segment.type === "engine")!;
      expect(bell.anchor.y, `seed=${seed}`).toBeCloseTo(engineFrame.yAft, 9);
    }
  });

  it("every placement's part shapes are all finite (no NaN/Infinity from budget edge cases)", () => {
    for (const seed of SEEDS) {
      const structureSpec = structure(derive(seed, "structure"));
      const kitSpec = kit(structureSpec, derive(seed, "kit"));
      for (const placement of kitSpec.placements) {
        for (const shape of placement.part.shapes) {
          const nums =
            shape.kind === "rect"
              ? [shape.x, shape.y, shape.w, shape.h]
              : shape.kind === "circle"
                ? [shape.cx, shape.cy, shape.r]
                : shape.kind === "line"
                  ? [shape.x1, shape.y1, shape.x2, shape.y2]
                  : shape.points.flat();
          for (const n of nums) expect(Number.isFinite(n), `${placement.socketId} ${shape.kind}`).toBe(true);
        }
      }
    }
  });
});

describe("determinism (sockets layer)", () => {
  it("same structure seed twice -> byte-identical socket layout", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const a = structure(derive(seed, "structure"));
      const b = structure(derive(seed, "structure"));
      expect(a).toEqual(b);
    }
  });

  it("same kit seed twice -> byte-identical placements", () => {
    for (const seed of SEEDS.slice(0, 10)) {
      const structureSpec = structure(derive(seed, "structure"));
      const a = kit(structureSpec, derive(seed, "kit"));
      const b = kit(structureSpec, derive(seed, "kit"));
      expect(a).toEqual(b);
    }
  });
});
