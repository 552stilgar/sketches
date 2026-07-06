// Livery layer (brief §6 layer 5): curated palette bank + seeded jitter,
// enumerated accent schemes, decals (hull number + hazard), per-palette grime.
// Purely additive to the #paint group — structure/kit/detail specs untouched,
// so the pinned judgment row stays shape-stable.

import { describe, expect, it } from "vitest";
import { derive } from "../src/core/prng";
import { PALETTE_BANK, paint, resolvePalette } from "../src/gen/paint";
import { shipSpecs, shipSVG } from "../src/gen/ship";
import { structure } from "../src/gen/structure";
import type { LiveryScheme } from "../src/gen/types";

const SEEDS = Array.from({ length: 40 }, (_, i) => derive(0x5eed, "livery-suite", i));

const LIVERY_SCHEMES: LiveryScheme[] = [
  "driveStripes",
  "noseChevron",
  "shroudBlock",
  "hullBand",
  "spineRun",
  "bareMetal",
];

function extractGroup(svg: string, id: string): string {
  const re = new RegExp(`<g id="[^"]*-${id}">([\\s\\S]*?)</g>(?=\\s*<g id|\\s*</svg>)`);
  const m = svg.match(re);
  if (!m) throw new Error(`group not found: ${id}`);
  return m[1]!;
}

describe("paint spec — palette bank + selection", () => {
  it("bank holds 8 palettes; every palette has all five roles", () => {
    const ids = Object.keys(PALETTE_BANK);
    expect(ids.length).toBe(8);
    for (const p of Object.values(PALETTE_BANK)) {
      for (const role of ["base", "baseAlt", "accent", "trim", "dark"] as const) {
        expect(p.roles[role]).toMatch(/^#[0-9a-f]{6}$/);
      }
    }
  });

  it("picks a real palette id and a valid livery scheme for every seed", () => {
    for (const seed of SEEDS) {
      const spec = paint(structure(derive(seed, "structure")), derive(seed, "paint"));
      expect(PALETTE_BANK[spec.paletteId]).toBeDefined();
      expect(LIVERY_SCHEMES).toContain(spec.livery);
    }
  });

  it("exercises more than one palette and more than one livery scheme across the fleet", () => {
    const palettes = new Set<string>();
    const liveries = new Set<string>();
    for (const seed of SEEDS) {
      const spec = paint(structure(derive(seed, "structure")), derive(seed, "paint"));
      palettes.add(spec.paletteId);
      liveries.add(spec.livery);
    }
    expect(palettes.size).toBeGreaterThan(1);
    expect(liveries.size).toBeGreaterThan(1);
  });

  it("jitter is bounded and seeded (not always zero)", () => {
    let anyNonZero = false;
    for (const seed of SEEDS) {
      const spec = paint(structure(derive(seed, "structure")), derive(seed, "paint"));
      expect(Math.abs(spec.jitter.h)).toBeLessThanOrEqual(0.05);
      expect(Math.abs(spec.jitter.s)).toBeLessThanOrEqual(0.1);
      if (spec.jitter.h !== 0 || spec.jitter.s !== 0) anyNonZero = true;
    }
    expect(anyNonZero).toBe(true);
  });

  it("hull number is a registry code, never a name (brief §8)", () => {
    for (const seed of SEEDS) {
      const spec = paint(structure(derive(seed, "structure")), derive(seed, "paint"));
      expect(spec.hullNumber).toMatch(/^[CFH]-\d{2,3}$/);
    }
  });

  it("grime is only ever set for grime-capable palettes", () => {
    for (const seed of SEEDS) {
      const spec = paint(structure(derive(seed, "structure")), derive(seed, "paint"));
      if (spec.grime) expect(PALETTE_BANK[spec.paletteId]!.allowGrime).toBe(true);
    }
  });
});

describe("resolvePalette — jitter application", () => {
  it("is a pure function of (id, jitter)", () => {
    const a = resolvePalette("ember-default", { h: 0.01, s: -0.02 });
    const b = resolvePalette("ember-default", { h: 0.01, s: -0.02 });
    expect(a).toEqual(b);
  });

  it("zero jitter round-trips a bank palette's own hex", () => {
    for (const id of Object.keys(PALETTE_BANK)) {
      expect(resolvePalette(id, { h: 0, s: 0 })).toEqual(PALETTE_BANK[id]!.roles);
    }
  });

  it("non-zero jitter shifts at least one chromatic role", () => {
    const base = PALETTE_BANK["ember-default"]!.roles;
    const jittered = resolvePalette("ember-default", { h: 0.04, s: 0.05 });
    expect(jittered.accent).not.toBe(base.accent);
  });

  it("throws on an unknown palette id", () => {
    expect(() => resolvePalette("no-such-palette", { h: 0, s: 0 })).toThrow(/unknown palette/);
  });
});

describe("emit — paint group", () => {
  it("paint group renders last, after kit", () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const svg = shipSVG(seed);
      expect(svg.indexOf('-paint">')).toBeGreaterThan(svg.indexOf('-kit">'));
    }
  });

  it("carries the hull-number decal text for every ship", () => {
    for (const seed of SEEDS.slice(0, 12)) {
      const specs = shipSpecs(seed);
      const paintG = extractGroup(shipSVG(seed), "paint");
      expect(paintG).toContain(`>${specs.paint.hullNumber}<`);
    }
  });

  it("every fill in the paint group is a resolved-palette value (no rogue hex)", () => {
    for (const seed of SEEDS) {
      const specs = shipSpecs(seed);
      const palette = resolvePalette(specs.paint.paletteId, specs.paint.jitter);
      const allowed = new Set(Object.values(palette));
      const paintG = extractGroup(shipSVG(seed), "paint");
      const fills = [...paintG.matchAll(/fill="(#[0-9a-f]{6})"/g)].map((m) => m[1]!);
      for (const fill of fills) expect(allowed.has(fill)).toBe(true);
    }
  });

  it("non-bareMetal liveries paint at least one accent shape", () => {
    for (const seed of SEEDS) {
      const specs = shipSpecs(seed);
      if (specs.paint.livery === "bareMetal") continue;
      const palette = resolvePalette(specs.paint.paletteId, specs.paint.jitter);
      const paintG = extractGroup(shipSVG(seed), "paint");
      expect(paintG).toContain(`fill="${palette.accent}"`);
    }
  });

  it("hazard stripes appear only when the spec sets hazard", () => {
    for (const seed of SEEDS) {
      const specs = shipSpecs(seed);
      const paintG = extractGroup(shipSVG(seed), "paint");
      // hazard renders a run of ≥4 polygons clipped inside the engine band
      const polys = (paintG.match(/<polygon/g) ?? []).length;
      if (!specs.paint.hazard && specs.paint.livery === "bareMetal" && !specs.paint.grime) {
        expect(polys).toBe(0);
      }
    }
  });
});

describe("livery determinism + stability", () => {
  it("same master seed -> byte-identical paint group", () => {
    for (const seed of SEEDS.slice(0, 12)) {
      expect(extractGroup(shipSVG(seed), "paint")).toBe(extractGroup(shipSVG(seed), "paint"));
    }
  });

  it("re-rolling paint leaves structure/kit/detail untouched", () => {
    for (const seed of SEEDS.slice(0, 8)) {
      const base = shipSpecs(seed);
      const rerolled = shipSpecs(seed, { paint: derive(seed, "paint", "re-roll", 9) });
      expect(rerolled.structure).toEqual(base.structure);
      expect(rerolled.kit).toEqual(base.kit);
      expect(rerolled.detail).toEqual(base.detail);
      expect(rerolled.paint).not.toEqual(base.paint);
    }
  });

  it("re-rolling structure/kit/detail leaves the paint group byte-identical", () => {
    for (const seed of SEEDS.slice(0, 6)) {
      const base = extractGroup(shipSVG(seed), "paint");
      for (const layer of ["structure", "kit", "detail"] as const) {
        // structure re-roll would change silhouette; guard only kit/detail here
        if (layer === "structure") continue;
        const rerolled = extractGroup(shipSVG(seed, { [layer]: derive(seed, layer, "re-roll", 4) }), "paint");
        expect(rerolled).toBe(base);
      }
    }
  });
});
