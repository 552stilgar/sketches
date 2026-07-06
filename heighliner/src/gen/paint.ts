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
