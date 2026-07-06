// Brief §4.1 stability rule + kickoff item 9: same master seed twice must be
// byte-identical; swapping one layer's sub-seed must leave every other
// layer's output untouched.

import { describe, expect, it } from "vitest";
import { derive, hexToSeed, seedToHex } from "../src/core/prng";
import { shipSpecs, shipSVG } from "../src/gen/ship";

const SEEDS = [0x7a3f09c1 | 0, 0x1f2a0001, 0x00000001, hexToSeed("d44e2b10")];

describe("determinism", () => {
  it("same master seed -> byte-identical SVG", () => {
    for (const seed of SEEDS) {
      expect(shipSVG(seed)).toBe(shipSVG(seed));
    }
  });

  it("different seeds -> different ships", () => {
    expect(shipSVG(SEEDS[0]!)).not.toBe(shipSVG(SEEDS[1]!));
  });

  it("re-rolling paint leaves structure/kit/detail specs unchanged", () => {
    for (const seed of SEEDS) {
      const base = shipSpecs(seed);
      const rerolled = shipSpecs(seed, { paint: derive(seed, "paint", "re-roll", 1) });
      expect(rerolled.structure).toEqual(base.structure);
      expect(rerolled.kit).toEqual(base.kit);
      expect(rerolled.detail).toEqual(base.detail);
      expect(rerolled.paint).not.toEqual(base.paint);
    }
  });

  it("re-rolling kit leaves structure/detail/paint specs unchanged", () => {
    const seed = SEEDS[0]!;
    const base = shipSpecs(seed);
    const rerolled = shipSpecs(seed, { kit: derive(seed, "kit", "re-roll", 1) });
    expect(rerolled.structure).toEqual(base.structure);
    expect(rerolled.detail).toEqual(base.detail);
    expect(rerolled.paint).toEqual(base.paint);
    expect(rerolled.kit).not.toEqual(base.kit);
  });

  it("seed hex round-trips", () => {
    for (const seed of SEEDS) {
      expect(hexToSeed(seedToHex(seed))).toBe(seed);
    }
  });

  it("ships are structurally sane torch stacks", () => {
    for (const seed of SEEDS) {
      const { structure } = shipSpecs(seed);
      const types = structure.segments.map((s) => s.type);
      expect(types[0]).toBe("engine");
      expect(types[1]).toBe("drive");
      expect(types[types.length - 2]).toBe("hull");
      expect(types[types.length - 1]).toBe("nose");
      expect(types.slice(2, -2).every((t) => t === "mid")).toBe(true);
      // frigate: 1-3 mids (spreads widened, session 2)
      expect(types.length).toBeGreaterThanOrEqual(5);
      expect(types.length).toBeLessThanOrEqual(7);
      for (const seg of structure.segments) {
        expect(seg.length).toBeGreaterThan(0);
        expect(seg.halfWidth.aft).toBeGreaterThan(0);
        expect(seg.halfWidth.fore).toBeGreaterThan(0);
      }
    }
  });
});
