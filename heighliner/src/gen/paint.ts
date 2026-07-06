// paint(structure, seedP) -> PaintSpec. Layer 5 (livery, brief §6): a curated
// palette bank (Expanse / Rocinante muted-industrial register) + seeded HSL
// jitter, an enumerated livery scheme (accent placement), decals (hull number
// + hazard stripe), and a per-palette-gated grime flag. Silhouette/structure
// are untouched — this layer only paints, so the pinned judgment row stays
// shape-stable (a pure color/livery diff). Colours are authored data, graded by
// eye; the machinery below is deterministic off seedP.

import { derive, int, pick, range, stream, type Prng } from "../core/prng";
import type { LiveryScheme, PaintSpec, PaletteRole, Role, StructureSpec } from "./types";

/** A curated palette + its capabilities. */
export interface Palette {
  roles: Record<PaletteRole, string>;
  /** Whether this palette is allowed to carry the grime overlay. */
  allowGrime: boolean;
}

// The bank. One universe: cold greys / gunmetal / olive hulls, low-saturation
// neutrals, a single restrained accent hue per palette. First draft — Usul
// grades and redirects; tune hex here, never in emit.
export const PALETTE_BANK: Record<string, Palette> = {
  "ember-default": {
    roles: { base: "#33373f", baseAlt: "#3c414b", accent: "#e07a1f", trim: "#8d939e", dark: "#22252b" },
    allowGrime: true,
  },
  "gunmetal-ice": {
    roles: { base: "#383e46", baseAlt: "#424a54", accent: "#6fb4c9", trim: "#97a0ab", dark: "#23272d" },
    allowGrime: false,
  },
  "void-charcoal": {
    roles: { base: "#2b2d33", baseAlt: "#34373f", accent: "#d69a3c", trim: "#7d818b", dark: "#1a1b20" },
    allowGrime: true,
  },
  "ash-olive": {
    roles: { base: "#3a3c33", baseAlt: "#45473c", accent: "#c8a24b", trim: "#8f9080", dark: "#24251f" },
    allowGrime: true,
  },
  "steel-crimson": {
    roles: { base: "#3d3f45", baseAlt: "#474a52", accent: "#b8483f", trim: "#949aa4", dark: "#26282d" },
    allowGrime: false,
  },
  "slate-teal": {
    roles: { base: "#333a41", baseAlt: "#3d454e", accent: "#4fa39a", trim: "#869099", dark: "#20262b" },
    allowGrime: false,
  },
  "bone-rust": {
    roles: { base: "#4a4741", baseAlt: "#55524b", accent: "#a8603a", trim: "#9b968c", dark: "#302e29" },
    allowGrime: true,
  },
  "graphite-sulfur": {
    roles: { base: "#2f3136", baseAlt: "#383b41", accent: "#cdbf4a", trim: "#82868e", dark: "#1c1d21" },
    allowGrime: true,
  },
};

// --- seeded selection tuning (edit here, not in emit) ------------------------
const HUE_JITTER = 0.02; // ± fraction of the hue wheel (~7°)
const SAT_JITTER = 0.05; // ± absolute saturation delta
const HAZARD_P = 0.35; // probability a ship carries the hazard-stripe decal
const GRIME_P = 0.5; // probability grime shows, given a grime-capable palette

// Livery weighting is role-dependent (brief §4.3: corvette aggressive /
// frigate balanced / hauler utilitarian). All three roles are defined so the
// forthcoming role layer slots in with zero paint changes; only frigate is
// reachable today.
const LIVERY_WEIGHTS: Record<Role, Record<LiveryScheme, number>> = {
  corvette: { driveStripes: 3, noseChevron: 4, shroudBlock: 2, hullBand: 1, spineRun: 2, bareMetal: 1 },
  frigate: { driveStripes: 2, noseChevron: 2, shroudBlock: 2, hullBand: 2, spineRun: 2, bareMetal: 2 },
  hauler: { driveStripes: 1, noseChevron: 1, shroudBlock: 2, hullBand: 3, spineRun: 1, bareMetal: 4 },
};

/** Weighted pick over an enumerated weight table. */
function pickWeighted<K extends string>(rng: Prng, weights: Record<K, number>): K {
  const entries = Object.entries(weights) as [K, number][];
  const total = entries.reduce((s, [, w]) => s + w, 0);
  let r = rng() * total;
  for (const [k, w] of entries) {
    r -= w;
    if (r < 0) return k;
  }
  return entries[entries.length - 1]![0];
}

/** Short bold hull number, e.g. "47" — a painted pennant, not a name (§8).
 *  Kept to two digits so the stencil paints at a consistent large size across
 *  the fleet rather than shrinking to fit narrow hulls. */
function hullNumber(rng: Prng): string {
  return String(int(rng, 0, 99)).padStart(2, "0");
}

export function paint(structureSpec: StructureSpec, seedP: number): PaintSpec {
  const paletteId = pick(stream(derive(seedP, "palette")), Object.keys(PALETTE_BANK));
  const palette = PALETTE_BANK[paletteId]!;

  const jrng = stream(derive(seedP, "jitter"));
  const jitter = { h: range(jrng, -HUE_JITTER, HUE_JITTER), s: range(jrng, -SAT_JITTER, SAT_JITTER) };

  const toneBySegment: PaintSpec["toneBySegment"] = {};
  for (const seg of structureSpec.segments) {
    const rng = stream(derive(seedP, "tone", seg.id));
    // engine block always reads dark-mass via baseAlt; others coin-flip
    toneBySegment[seg.id] = seg.type === "engine" ? "baseAlt" : rng() < 0.5 ? "base" : "baseAlt";
  }

  const livery = pickWeighted(stream(derive(seedP, "livery")), LIVERY_WEIGHTS[structureSpec.role]);
  const number = hullNumber(stream(derive(seedP, "hull")));
  const hazard = stream(derive(seedP, "hazard"))() < HAZARD_P;
  const grime = palette.allowGrime && stream(derive(seedP, "grime"))() < GRIME_P;

  return { paletteId, jitter, toneBySegment, livery, hullNumber: number, hazard, grime };
}

// --- palette resolution (jitter) --------------------------------------------
// The palette bank holds authored hex; emit paints with the *resolved* palette
// (bank + jitter). Jitter shifts hue/saturation uniformly across every role so
// the palette stays internally coherent — never an independent per-role choice.

export type ResolvedPalette = Record<PaletteRole, string>;

export function resolvePalette(paletteId: string, jitter: { h: number; s: number }): ResolvedPalette {
  const palette = PALETTE_BANK[paletteId];
  if (!palette) throw new Error(`unknown palette: ${paletteId}`);
  const out = {} as ResolvedPalette;
  for (const role of Object.keys(palette.roles) as PaletteRole[]) {
    out[role] = withHueSat(palette.roles[role], jitter.h, jitter.s);
  }
  return out;
}

// --- shading tones (brief §3 row 11 / §4.7: "tones derived from palette,
// never independent"). Pure HSL lighten/darken off the palette's own tones —
// no seed involved, no independent hex literals. Same palette -> same
// shading tones, forever; emit.ts must never introduce a hex outside this
// derivation (or the resolved palette) for the shading layer.

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

/** Shift hue (wrap) and saturation (clamp) while holding lightness — the
 *  jitter operation. Lightness is preserved so shading contrast is stable. */
function withHueSat(hex: string, dh: number, ds: number): string {
  if (dh === 0 && ds === 0) return hex; // exact round-trip, no HSL rounding drift
  const hsl = hexToHsl(hex);
  const h = ((hsl.h + dh) % 1 + 1) % 1;
  const s = Math.min(1, Math.max(0, hsl.s + ds));
  return hslToHex({ h, s, l: hsl.l });
}

export interface ShadingTones {
  lit: string;
  shade: string;
  ao: string;
  spec: string;
}

/**
 * Pure derivation off the palette's own base/dark tones. No seed draws — the
 * shading layer is a function of the (resolved) palette, never an independent
 * color choice.
 */
export function shadingTones(palette: Record<PaletteRole, string>): ShadingTones {
  return {
    lit: withLightness(palette.base, LIT_L_DELTA),
    shade: withLightness(palette.base, SHADE_L_DELTA),
    ao: withLightness(palette.dark, AO_L_DELTA),
    spec: withLightness(palette.base, SPEC_L_DELTA),
  };
}
