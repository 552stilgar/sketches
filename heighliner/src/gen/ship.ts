// Pipeline assembly: master seed -> hierarchical sub-seeds -> specs -> SVG.
// Sub-seed overrides are the future inspector's per-layer re-roll hook and
// what the stability test exercises.

import { derive } from "../core/prng";
import { detail } from "./detail";
import { emit } from "./emit";
import { kit } from "./kit";
import { paint } from "./paint";
import { structure } from "./structure";
import type { ShipSpecs } from "./types";

export interface SubSeedOverrides {
  structure?: number;
  kit?: number;
  detail?: number;
  paint?: number;
}

export function shipSpecs(seed: number, overrides: SubSeedOverrides = {}): ShipSpecs {
  const seedS = overrides.structure ?? derive(seed, "structure");
  const seedK = overrides.kit ?? derive(seed, "kit");
  const seedD = overrides.detail ?? derive(seed, "detail");
  const seedP = overrides.paint ?? derive(seed, "paint");

  const structureSpec = structure(seedS);
  return {
    seed,
    structure: structureSpec,
    kit: kit(structureSpec, seedK),
    detail: detail(structureSpec, seedD),
    paint: paint(structureSpec, seedP),
  };
}

export function shipSVG(seed: number, overrides: SubSeedOverrides = {}, idPrefix?: string): string {
  return emit(shipSpecs(seed, overrides), idPrefix);
}
