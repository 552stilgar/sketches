// Pure camera-framing logic (src/renderer/scene.ts). computeCityBounds and computeCameraFraming
// are the decision rules that let the viewer's first frame actually look at the city's own
// content instead of a fixed offset -- see scene.ts's doc comment for the measured defect this
// replaces (2026-08-28: fixed camera spawned near-overhead-and-too-close for a dense city, or
// inside a block for a sparse tall one).

import { describe, expect, it } from "vitest";
import {
  computeCityBounds,
  computeCameraFraming,
  type CityBounds,
} from "../src/renderer/scene.ts";
import type { Building, Landmark } from "../src/types.ts";

function building(overrides: Partial<Building> = {}): Building {
  return {
    id: "b",
    x: 0,
    y: 0,
    width: 10,
    depth: 10,
    height: 5,
    style: "typescript",
    metrics: { loc: 10, complexity: 1, churn: 0 },
    ...overrides,
  };
}

function landmark(overrides: Partial<Landmark> = {}): Landmark {
  return { id: "l", x: 0, y: 0, kind: "datastore", ...overrides };
}

describe("computeCityBounds", () => {
  it("is a single small default box for a city with zero buildings and zero landmarks", () => {
    const bounds = computeCityBounds({ buildings: [], landmarks: [] });
    expect(bounds.maxX - bounds.minX).toBeGreaterThan(0);
    expect(bounds.maxZ - bounds.minZ).toBeGreaterThan(0);
    expect(Number.isFinite(bounds.minX)).toBe(true);
    expect(Number.isFinite(bounds.maxX)).toBe(true);
    expect(Number.isFinite(bounds.minY)).toBe(true);
    expect(Number.isFinite(bounds.maxY)).toBe(true);
    expect(Number.isFinite(bounds.minZ)).toBe(true);
    expect(Number.isFinite(bounds.maxZ)).toBe(true);
  });

  it("frames exactly one building's footprint and height, from (0,0) origin", () => {
    const b = building({ x: 100, y: 200, width: 40, depth: 20, height: 30 });
    const bounds = computeCityBounds({ buildings: [b], landmarks: [] });
    expect(bounds).toEqual<CityBounds>({
      minX: 100,
      maxX: 140,
      minY: 0,
      maxY: 30,
      minZ: 200,
      maxZ: 220,
    });
  });

  it("unions multiple buildings' footprints and takes the tallest height", () => {
    const a = building({ x: 0, y: 0, width: 10, depth: 10, height: 5 });
    const b = building({ id: "b2", x: 500, y: 500, width: 10, depth: 10, height: 80 });
    const bounds = computeCityBounds({ buildings: [a, b], landmarks: [] });
    expect(bounds.minX).toBe(0);
    expect(bounds.maxX).toBe(510);
    expect(bounds.minZ).toBe(0);
    expect(bounds.maxZ).toBe(510);
    expect(bounds.maxY).toBe(80);
  });

  it("widens the bounds to include a landmark's point that sits outside every building", () => {
    const b = building({ x: 0, y: 0, width: 10, depth: 10, height: 5 });
    const l = landmark({ x: 900, y: 900 });
    const bounds = computeCityBounds({ buildings: [b], landmarks: [l] });
    expect(bounds.maxX).toBe(900);
    expect(bounds.maxZ).toBe(900);
  });

  it("does not divide by zero or produce NaN when every building is at one point (zero-size footprints)", () => {
    const a = building({ id: "a", x: 50, y: 50, width: 0, depth: 0, height: 0 });
    const b = building({ id: "b", x: 50, y: 50, width: 0, depth: 0, height: 0 });
    const bounds = computeCityBounds({ buildings: [a, b], landmarks: [] });
    expect(bounds).toEqual<CityBounds>({ minX: 50, maxX: 50, minY: 0, maxY: 0, minZ: 50, maxZ: 50 });
    for (const v of Object.values(bounds)) expect(Number.isNaN(v)).toBe(false);
  });

  it("handles a city far wider than deep without distorting either axis", () => {
    const b = building({ x: 0, y: 0, width: 1000, depth: 10, height: 5 });
    const bounds = computeCityBounds({ buildings: [b], landmarks: [] });
    expect(bounds.maxX - bounds.minX).toBe(1000);
    expect(bounds.maxZ - bounds.minZ).toBe(10);
  });
});

describe("computeCameraFraming", () => {
  const wideBounds: CityBounds = { minX: 0, maxX: 1000, minY: 0, maxY: 40, minZ: 0, maxZ: 1000 };

  it("targets the exact center of the bounds", () => {
    const framing = computeCameraFraming(wideBounds, 16 / 9);
    expect(framing.target).toEqual({ x: 500, y: 20, z: 500 });
  });

  it("positions the camera along a fixed oblique (non top-down, non-zero) direction from center", () => {
    const framing = computeCameraFraming(wideBounds, 16 / 9);
    const dx = framing.position.x - framing.target.x;
    const dy = framing.position.y - framing.target.y;
    const dz = framing.position.z - framing.target.z;
    // Oblique, not top-down: meaningful horizontal offset alongside the vertical one.
    expect(dx).toBeGreaterThan(0);
    expect(dy).toBeGreaterThan(0);
    expect(dz).toBeGreaterThan(0);
    // Not top-down: horizontal displacement is not dwarfed by vertical.
    expect(Math.min(dx, dz) / dy).toBeGreaterThan(0.5);
  });

  it("produces no NaN or infinite values for a zero-size bounds box (single point city)", () => {
    const point: CityBounds = { minX: 5, maxX: 5, minY: 0, maxY: 0, minZ: 5, maxZ: 5 };
    const framing = computeCameraFraming(point, 1);
    for (const v of [framing.position.x, framing.position.y, framing.position.z, framing.radius]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    // Camera must not collapse onto the target -- some minimum distance away.
    const dist = Math.hypot(
      framing.position.x - framing.target.x,
      framing.position.y - framing.target.y,
      framing.position.z - framing.target.z,
    );
    expect(dist).toBeGreaterThan(0);
  });

  it("produces no NaN for a degenerate (zero or negative) aspect ratio -- falls back to square", () => {
    for (const aspect of [0, -1, NaN, Infinity]) {
      const framing = computeCameraFraming(wideBounds, aspect);
      expect(Number.isFinite(framing.position.x)).toBe(true);
      expect(Number.isFinite(framing.position.y)).toBe(true);
      expect(Number.isFinite(framing.position.z)).toBe(true);
    }
  });

  it("moves the camera further away as the bounds grow, all else equal", () => {
    const small: CityBounds = { minX: 0, maxX: 50, minY: 0, maxY: 10, minZ: 0, maxZ: 50 };
    const large: CityBounds = { minX: 0, maxX: 2000, minY: 0, maxY: 10, minZ: 0, maxZ: 2000 };
    const smallFraming = computeCameraFraming(small, 1);
    const largeFraming = computeCameraFraming(large, 1);
    const distOf = (f: typeof smallFraming) =>
      Math.hypot(f.position.x - f.target.x, f.position.y - f.target.y, f.position.z - f.target.z);
    expect(distOf(largeFraming)).toBeGreaterThan(distOf(smallFraming));
  });

  it("is deterministic: identical inputs produce byte-identical output", () => {
    const a = computeCameraFraming(wideBounds, 1.7777);
    const b = computeCameraFraming(wideBounds, 1.7777);
    expect(a).toEqual(b);
  });

  it("fits a wide-flat city (large footprint, short buildings) materially tighter than the old bounding-sphere fit would", () => {
    // Regression for the measured defect (2026-08-30): sizing distance off the bounding SPHERE of
    // a wide/shallow slab put the city at ~30% of the frame, since the sphere's radius (half the
    // 3D diagonal) is dominated by the huge flat footprint even though the sphere's volume is
    // mostly empty air above/below the slab. Box-fit should size off what the city actually
    // occupies from this oblique angle instead.
    const wideFlat: CityBounds = { minX: 0, maxX: 1000, minY: 0, maxY: 20, minZ: 0, maxZ: 1000 };
    const aspect = 16 / 9;
    const fovDegrees = 55;
    const framing = computeCameraFraming(wideFlat, aspect, fovDegrees);
    const boxFitDistance = Math.hypot(
      framing.position.x - framing.target.x,
      framing.position.y - framing.target.y,
      framing.position.z - framing.target.z,
    );

    // Independently reproduce the OLD sphere-fit distance formula (radius / sin(fov/2) * margin)
    // this lane replaces, so the assertion checks the actual relationship rather than a magic
    // number that could drift with unrelated constant tuning.
    const vFov = (fovDegrees * Math.PI) / 180;
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * aspect);
    const sizeX = wideFlat.maxX - wideFlat.minX;
    const sizeY = wideFlat.maxY - wideFlat.minY;
    const sizeZ = wideFlat.maxZ - wideFlat.minZ;
    const diagonal = Math.sqrt(sizeX * sizeX + sizeY * sizeY + sizeZ * sizeZ);
    const sphereRadius = Math.max(12, diagonal / 2);
    const distanceForFov = (fovRad: number) => sphereRadius / Math.max(0.01, Math.sin(fovRad / 2));
    const sphereFitDistance = Math.max(distanceForFov(vFov), distanceForFov(hFov)) * 1.25;

    expect(boxFitDistance).toBeLessThan(sphereFitDistance);
    // "Materially" smaller, not a rounding difference -- even fixed to this oblique angle (where
    // a wide box's horizontal spread still costs some vertical frustum room), the exact box fit
    // measurably undercuts the sphere fit (~0.85x for these dimensions).
    expect(boxFitDistance).toBeLessThan(sphereFitDistance * 0.9);
  });

  it("a tall, narrow city (many stacked stories, tiny footprint) still frames without collapsing", () => {
    const tall: CityBounds = { minX: 0, maxX: 5, minY: 0, maxY: 500, minZ: 0, maxZ: 5 };
    const framing = computeCameraFraming(tall, 16 / 9);
    for (const v of [framing.position.x, framing.position.y, framing.position.z]) {
      expect(Number.isFinite(v)).toBe(true);
    }
    expect(framing.radius).toBeGreaterThan(200);
  });
});
