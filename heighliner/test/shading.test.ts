// Shading stack (brief §4.7, layer 2 / §6 lane H): lit/shade strips, AO,
// axial specular. Pure function of the existing structure/kit/paint specs —
// no new PRNG draws, no independent hex literals outside shadingTones().

import { describe, expect, it } from "vitest";
import { derive } from "../src/core/prng";
import { PALETTES, shadingTones } from "../src/gen/paint";
import { shipSpecs, shipSVG } from "../src/gen/ship";

const SEEDS = Array.from({ length: 12 }, (_, i) => derive(0x5eed, "shading-suite", i));

function extractGroup(svg: string, id: string): string {
  const re = new RegExp(`<g id="[^"]*-${id}">([\\s\\S]*?)</g>(?=\\s*<g id|\\s*</svg>)`);
  const m = svg.match(re);
  if (!m) throw new Error(`group not found: ${id}`);
  return m[1]!;
}

describe("shading group presence + document order", () => {
  it("shading group exists and is ordered after kit, before paint", () => {
    for (const seed of SEEDS) {
      const svg = shipSVG(seed);
      const kitIdx = svg.indexOf('-kit">');
      const shadingIdx = svg.indexOf('-shading">');
      const paintIdx = svg.indexOf('-paint">');
      expect(kitIdx).toBeGreaterThan(-1);
      expect(shadingIdx).toBeGreaterThan(kitIdx);
      expect(paintIdx).toBeGreaterThan(shadingIdx);
    }
  });

  it("shading carries a lit + shade strip pair for every segment", () => {
    for (const seed of SEEDS) {
      const { structure } = shipSpecs(seed);
      const svg = shipSVG(seed);
      const shading = extractGroup(svg, "shading");
      const polys = (shading.match(/<polygon/g) ?? []).length;
      // 2 strips (lit, shade) per segment + 1 specular strip per major
      // segment (drive, hull, longest mid).
      const majorCount = structure.segments.filter((s) => s.type === "drive" || s.type === "hull").length +
        (structure.segments.some((s) => s.type === "mid") ? 1 : 0);
      expect(polys).toBe(structure.segments.length * 2 + majorCount);
    }
  });
});

describe("shading determinism", () => {
  it("same master seed -> byte-identical shading group", () => {
    for (const seed of SEEDS) {
      const a = extractGroup(shipSVG(seed), "shading");
      const b = extractGroup(shipSVG(seed), "shading");
      expect(a).toBe(b);
    }
  });

  it("re-rolling detail leaves the shading group byte-identical", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const base = extractGroup(shipSVG(seed), "shading");
      const rerolled = extractGroup(
        shipSVG(seed, { detail: derive(seed, "detail", "re-roll", 3) }),
        "shading",
      );
      expect(rerolled).toBe(base);
    }
  });

  it("structure/kit/detail re-roll stability still holds with the shading layer present", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const base = shipSpecs(seed);
      for (const layer of ["kit", "detail", "paint"] as const) {
        const rerolled = shipSpecs(seed, { [layer]: derive(seed, layer, "re-roll", 5) });
        expect(rerolled.structure).toEqual(base.structure);
      }
    }
  });
});

describe("shading tones derive from the palette", () => {
  it("every fill in the shading group is a shadingTones() value or a raw palette value", () => {
    for (const seed of SEEDS) {
      const specs = shipSpecs(seed);
      const palette = PALETTES[specs.paint.paletteId]!;
      const tones = shadingTones(palette);
      const allowed = new Set([...Object.values(tones), ...Object.values(palette)]);
      const svg = shipSVG(seed);
      const shading = extractGroup(svg, "shading");
      const fills = [...shading.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]!);
      expect(fills.length).toBeGreaterThan(0);
      for (const fill of fills) expect(allowed.has(fill)).toBe(true);
    }
  });

  it("shadingTones is a pure function of the palette (no seed sensitivity)", () => {
    const palette = PALETTES["ember-default"]!;
    const a = shadingTones(palette);
    const b = shadingTones(palette);
    expect(a).toEqual(b);
    expect(a.lit).not.toBe(palette.base);
    expect(a.shade).not.toBe(palette.base);
  });
});

describe("AO coverage", () => {
  it("AO ellipse count is at least the kit placement count (joins add more)", () => {
    for (const seed of SEEDS) {
      const specs = shipSpecs(seed);
      const svg = shipSVG(seed);
      const shading = extractGroup(svg, "shading");
      const ellipseCount = (shading.match(/<ellipse/g) ?? []).length;
      expect(ellipseCount).toBeGreaterThanOrEqual(specs.kit.placements.length);
    }
  });
});
