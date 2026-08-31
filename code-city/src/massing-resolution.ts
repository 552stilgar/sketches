// Viewer-side resolution of the massing scale actually handed to buildBuildings — split out from
// main.ts (which runs `main()` at import time and touches `document`) so this precedence logic is
// importable and unit-testable without a DOM environment.

import type { CityModel } from "./types.ts";
import { normalizedHeightScale } from "./renderer/massing.ts";

/**
 * Resolves the massing scale actually handed to buildBuildings, and whether it came from an
 * explicit `?heightScale=` override or from normalizedHeightScale() (src/renderer/massing.ts).
 * An explicit override always WINS -- a viewer who typed a number gets exactly that number, never
 * a value silently re-solved out from under them. Only when no override is present does the city
 * get normalized to TARGET_MEDIAN_ASPECT_DEFAULT: a fixed BASE_HEIGHT_SCALE_DEFAULT constant
 * cannot hold a fixed silhouette across city sizes (massing.ts's doc comment has the measured
 * 631-vs-1108-building numbers), so normalization is now the default path and the constant is the
 * opt-out (see buildings.ts BASE_HEIGHT_SCALE_DEFAULT).
 */
export function resolveMassingScale(
  city: CityModel,
  override: number | undefined,
): { scale: number; source: "explicit" | "normalized" } {
  if (override !== undefined) return { scale: override, source: "explicit" };
  const result = normalizedHeightScale(city.buildings);
  return { scale: result.scale, source: "normalized" };
}
