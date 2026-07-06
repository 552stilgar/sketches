// Inspector export-path pure helpers (brief §5 / §5 layer 6): PNG export
// must rasterize at a 2048px target edge while preserving the ship's
// portrait aspect ratio, derived from the emitted SVG's viewBox.

import { describe, expect, it } from "vitest";
import { derive, hexToSeed } from "../src/core/prng";
import { shipSVG } from "../src/gen/ship";
import { parseViewBox, pngCanvasSize } from "../src/app/svg-utils";

describe("parseViewBox", () => {
  it("reads width/height off a real emitted ship SVG", () => {
    const svg = shipSVG(hexToSeed("7a3f09c1"));
    const size = parseViewBox(svg);
    expect(size.w).toBeGreaterThan(0);
    expect(size.h).toBeGreaterThan(0);
  });

  it("throws on a string with no viewBox", () => {
    expect(() => parseViewBox("<svg></svg>")).toThrow();
  });
});

describe("pngCanvasSize", () => {
  it("scales the longer edge to the target and preserves aspect ratio", () => {
    const size = pngCanvasSize({ w: 100, h: 400 }, 2048);
    expect(size.height).toBe(2048);
    expect(size.width).toBe(Math.round((100 / 400) * 2048));
  });

  it("handles a landscape viewBox the same way, generically", () => {
    const size = pngCanvasSize({ w: 400, h: 100 }, 2048);
    expect(size.width).toBe(2048);
    expect(size.height).toBe(Math.round((100 / 400) * 2048));
  });

  it("defaults to a 2048px target", () => {
    const size = pngCanvasSize({ w: 200, h: 200 });
    expect(size.width).toBe(2048);
    expect(size.height).toBe(2048);
  });
});

describe("inspector re-roll derivation", () => {
  it("re-rolling one layer's sub-seed twice never repeats the first value", () => {
    const seed = hexToSeed("d44e2b10");
    const first = derive(seed, "structure", "reroll", 1);
    const second = derive(seed, "structure", "reroll", 2);
    expect(first).not.toBe(second);
  });

  it("is deterministic for the same (seed, layer, n)", () => {
    const seed = hexToSeed("d44e2b10");
    expect(derive(seed, "paint", "reroll", 3)).toBe(derive(seed, "paint", "reroll", 3));
  });
});
