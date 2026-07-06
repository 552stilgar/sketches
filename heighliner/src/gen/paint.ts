// paint(structure, seedP) -> PaintSpec. Session 1: one hardcoded palette
// (dark base, orange accent, neutral trim), base tones only — no shading
// stack, no livery. The seed picks per-segment base/baseAlt tones so the
// paint layer is genuinely seed-sensitive (exercised by the stability test).

import { derive, stream } from "../core/prng";
import type { PaintSpec, PaletteRole, StructureSpec } from "./types";

export const PALETTES: Record<string, Record<PaletteRole, string>> = {
  "ember-default": {
    base: "#33373f",
    baseAlt: "#3c414b",
    accent: "#e07a1f",
    trim: "#8d939e",
    dark: "#22252b",
  },
};

export function paint(structureSpec: StructureSpec, seedP: number): PaintSpec {
  const toneBySegment: PaintSpec["toneBySegment"] = {};
  for (const seg of structureSpec.segments) {
    const rng = stream(derive(seedP, "tone", seg.id));
    // engine block always reads dark-mass via baseAlt; others coin-flip
    toneBySegment[seg.id] = seg.type === "engine" ? "baseAlt" : rng() < 0.5 ? "base" : "baseAlt";
  }
  return { paletteId: "ember-default", toneBySegment };
}

// --- shading tones (brief §3 row 11 / §4.7: "tones derived from palette,
// never independent"). Pure HSL lighten/darken off the palette's own tones —
// no seed involved, no independent hex literals. Same palette -> same
// shading tones, forever; emit.ts must never introduce a hex outside this
// derivation (or the raw palette) for the shading layer.

// Lightness deltas — Usul tunes shading contrast by editing these, not by
// hand-picking new hex values.
const LIT_L_DELTA = 0.16; // lit strip: lightened off the base tone
const SHADE_L_DELTA = -0.14; // shade strip: darkened off the base tone
const AO_L_DELTA = -0.12; // AO blobs: darkened further off the palette's dark tone
const SPEC_L_DELTA = 0.34; // specular strip: lightened well past the lit strip

interface Hsl {
  h: number;
  s: number;
  l: number;
}

function hexToHsl(hex: string): Hsl {
  const n = Number.parseInt(hex.slice(1), 16);
  const r = ((n >> 16) & 0xff) / 255;
  const g = ((n >> 8) & 0xff) / 255;
  const b = (n & 0xff) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h / 6, s, l };
}

function hue2rgb(p: number, q: number, t: number): number {
  let tt = t;
  if (tt < 0) tt += 1;
  if (tt > 1) tt -= 1;
  if (tt < 1 / 6) return p + (q - p) * 6 * tt;
  if (tt < 1 / 2) return q;
  if (tt < 2 / 3) return p + (q - p) * (2 / 3 - tt) * 6;
  return p;
}

function hslToHex({ h, s, l }: Hsl): string {
  const toByte = (v: number): string => Math.round(v * 255).toString(16).padStart(2, "0");
  if (s === 0) {
    const v = toByte(l);
    return `#${v}${v}${v}`;
  }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const r = hue2rgb(p, q, h + 1 / 3);
  const g = hue2rgb(p, q, h);
  const b = hue2rgb(p, q, h - 1 / 3);
  return `#${toByte(r)}${toByte(g)}${toByte(b)}`;
}

function withLightness(hex: string, delta: number): string {
  const hsl = hexToHsl(hex);
  const l = Math.min(1, Math.max(0, hsl.l + delta));
  return hslToHex({ ...hsl, l });
}

export interface ShadingTones {
  lit: string;
  shade: string;
  ao: string;
  spec: string;
}

/**
 * Pure derivation off the palette's own base/dark tones. No seed draws — the
 * shading layer is a function of the existing paint spec's palette, never an
 * independent color choice.
 */
export function shadingTones(palette: Record<PaletteRole, string>): ShadingTones {
  return {
    lit: withLightness(palette.base, LIT_L_DELTA),
    shade: withLightness(palette.base, SHADE_L_DELTA),
    ao: withLightness(palette.dark, AO_L_DELTA),
    spec: withLightness(palette.base, SPEC_L_DELTA),
  };
}
