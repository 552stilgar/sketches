// renderer: city.json (CityModel) -> SVG string (2D debug/iteration view)
//
// Contract: docs/CONTRACT-render-svg.md. Implementation lane fills this in.
//
// city.json coordinates ARE the SVG coordinate space (viewBox "0 0 1000 1000") — no additional
// scaling. See tests/render2d.test.ts for the exact gated output shape: one <g class="district">
// per district, one <rect class="building" data-id=... x=... y=... width=... height=...> per
// building, a viewBox on the root <svg>.

import type { CityModel } from "../types.ts";

export function render2d(city: CityModel): string {
  throw new Error("NotImplemented");
}
