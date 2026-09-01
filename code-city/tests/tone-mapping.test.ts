// Guards the V1 tone curve against silently collapsing the never-confusable lightness ladder that
// ruins.ts's header documents and four renderer modules depend on.
//
// WHAT THIS TEST DOES AND DOES NOT PROVE. Tone mapping is applied in the fragment shader to the
// LIT color, not to the albedo constants below, so this is a necessary condition, not a sufficient
// one: if the curve reorders or crushes the ladder on the albedos themselves, it certainly breaks
// under lighting too. It cannot prove the converse — a light rig that blows two anchors into the
// shoulder together would defeat the separation without this test noticing. The in-browser check
// (browser-verify against compare.html) is what covers that half; this covers the half that can
// regress from a one-character edit to TONE_MAPPING_EXPOSURE.

import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  TONE_MAPPING_EXPOSURE,
  buildSkyTextureData,
  relativeLuminance,
  skyGradientColor,
  toneMapACES,
} from "../src/renderer/scene.ts";

/** The documented ladder, dimmest first. Values are read off the modules that own them — if one of
 *  those constants moves, this array must move with it (that is the point of restating them here
 *  rather than importing: an unreviewed hue change should fail a test, not be silently absorbed). */
const LADDER: Array<{ name: string; color: THREE.Color }> = [
  { name: "ruin foundation (ruins.ts)", color: new THREE.Color().setHSL(0.06, 0.1, 0.1) },
  { name: "ruin rubble (ruins.ts)", color: new THREE.Color().setHSL(0.07, 0.12, 0.16) },
  { name: "landmark tank band (landmarks.ts)", color: new THREE.Color().setHSL(0.56, 0.12, 0.32) },
  { name: "building floor (buildings.ts, ~0.42 pre-bias)", color: new THREE.Color().setHSL(0.6, 0.3, 0.42) },
  { name: "landmark tank body (landmarks.ts)", color: new THREE.Color().setHSL(0.56, 0.28, 0.55) },
];

/** Minimum post-curve luminance gap each adjacent pair must retain. Not a perceptual threshold —
 *  a floor well above float noise, chosen so that "the curve compressed two anchors into each
 *  other" fails loudly while ordinary retuning inside the authored palette does not. */
const MIN_SURVIVING_GAP = 0.01;

describe("toneMapACES", () => {
  it("is monotonic across the full input range", () => {
    let previous = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const y = toneMapACES(i / 100);
      expect(y).toBeGreaterThanOrEqual(previous);
      previous = y;
    }
  });

  it("stays inside 0..1 for degenerate and out-of-range inputs", () => {
    for (const x of [-1, 0, 1e-9, 1, 4, 1000]) {
      const y = toneMapACES(x);
      expect(Number.isFinite(y)).toBe(true);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
    }
  });

  it("preserves the ordering of the never-confusable lightness ladder", () => {
    const mapped = LADDER.map((entry) => ({
      name: entry.name,
      value: toneMapACES(relativeLuminance(entry.color)),
    }));
    for (let i = 1; i < mapped.length; i++) {
      expect(
        mapped[i].value,
        `${mapped[i].name} must tone-map brighter than ${mapped[i - 1].name}`,
      ).toBeGreaterThan(mapped[i - 1].value);
    }
  });

  it("keeps every adjacent pair of the ladder separated at the shipped exposure", () => {
    const mapped = LADDER.map((entry) => ({
      name: entry.name,
      value: toneMapACES(relativeLuminance(entry.color), TONE_MAPPING_EXPOSURE),
    }));
    for (let i = 1; i < mapped.length; i++) {
      const gap = mapped[i].value - mapped[i - 1].value;
      expect(
        gap,
        `${mapped[i - 1].name} -> ${mapped[i].name} collapsed to ${gap.toFixed(4)} at exposure ${TONE_MAPPING_EXPOSURE}`,
      ).toBeGreaterThan(MIN_SURVIVING_GAP);
    }
  });
});

describe("skyGradientColor", () => {
  it("clamps out-of-range and non-finite t into the authored palette", () => {
    expect(skyGradientColor(-5).getHex()).toBe(skyGradientColor(0).getHex());
    expect(skyGradientColor(5).getHex()).toBe(skyGradientColor(1).getHex());
    expect(skyGradientColor(Number.NaN).getHex()).toBe(skyGradientColor(0).getHex());
  });

  it("puts the brightest band at the horizon, not the zenith", () => {
    const horizon = relativeLuminance(skyGradientColor(0.5));
    expect(horizon).toBeGreaterThan(relativeLuminance(skyGradientColor(1)));
    expect(horizon).toBeGreaterThan(relativeLuminance(skyGradientColor(0)));
  });

  it("stays dim enough not to flatten the city palette against it", () => {
    // The dimmest ladder anchor is the ruin foundation; a sky brighter than the BRIGHTEST city
    // anchor would make every building read as a silhouette against it.
    const brightestCityAnchor = Math.max(...LADDER.map((e) => relativeLuminance(e.color)));
    for (let i = 0; i <= 20; i++) {
      expect(relativeLuminance(skyGradientColor(i / 20))).toBeLessThan(brightestCityAnchor);
    }
  });
});

describe("buildSkyTextureData", () => {
  it("is deterministic — same dimensions produce byte-identical output", () => {
    expect(Array.from(buildSkyTextureData(8, 16))).toEqual(Array.from(buildSkyTextureData(8, 16)));
  });

  it("writes row 0 as the zenith and the last row as the nadir", () => {
    const width = 4;
    const height = 16;
    const data = buildSkyTextureData(width, height);
    const zenith = skyGradientColor(1);
    const nadir = skyGradientColor(0);
    expect(data[0]).toBe(Math.round(zenith.r * 255));
    expect(data[1]).toBe(Math.round(zenith.g * 255));
    expect(data[2]).toBe(Math.round(zenith.b * 255));
    const last = (height - 1) * width * 4;
    expect(data[last]).toBe(Math.round(nadir.r * 255));
    expect(data[last + 1]).toBe(Math.round(nadir.g * 255));
    expect(data[last + 2]).toBe(Math.round(nadir.b * 255));
  });

  it("is fully opaque and constant along each row", () => {
    const width = 4;
    const height = 8;
    const data = buildSkyTextureData(width, height);
    for (let y = 0; y < height; y++) {
      const base = y * width * 4;
      for (let x = 1; x < width; x++) {
        const i = base + x * 4;
        expect(data[i]).toBe(data[base]);
        expect(data[i + 1]).toBe(data[base + 1]);
        expect(data[i + 2]).toBe(data[base + 2]);
      }
      for (let x = 0; x < width; x++) expect(data[base + x * 4 + 3]).toBe(255);
    }
  });

  it("handles a single-row texture without dividing by zero", () => {
    const data = buildSkyTextureData(2, 1);
    expect(data.length).toBe(8);
    expect(data.every((v) => Number.isFinite(v))).toBe(true);
  });
});
