// renderer: city.json (CityModel) -> SVG string (2D debug/iteration view)
//
// Contract: docs/CONTRACT-render-svg.md. Implementation lane fills this in.
//
// city.json coordinates ARE the SVG coordinate space (viewBox "0 0 1000 1000") — no additional
// scaling. See tests/render2d.test.ts for the exact gated output shape: one <g class="district">
// per district, one <rect class="building" data-id=... x=... y=... width=... height=...> per
// building, a viewBox on the root <svg>.
//
// Road tiering mirrors src/renderer/roads.ts (Three.js path): stroke-width + stroke-opacity per
// tier, derived from the same pure computeRoadTierBoundaries/roadTier helpers so both renderers
// agree on what counts as a footpath vs. a highway for a given city.

import type { CityModel } from "../types.ts";
import { computeRoadTierBoundaries, roadTier, type RoadTier } from "./roads.ts";

/** Stroke width + opacity per tier. Mirrors TIER_STYLE in roads.ts, adapted for SVG stroke
 * rendering (width is a legible signal in 2D, unlike WebGL line width). */
const TIER_STROKE: Record<RoadTier, { width: number; opacity: number }> = {
  footpath: { width: 1, opacity: 0.25 },
  street: { width: 2, opacity: 0.45 },
  arterial: { width: 3.5, opacity: 0.7 },
  highway: { width: 5.5, opacity: 0.95 },
};

export function render2d(city: CityModel): string {
  const escape = (value: string): string => value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const lines = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000">'];
  for (const district of city.districts) {
    lines.push(`  <g class="district" data-id="${escape(district.id)}">`);
    lines.push(`    <rect class="district-ground" x="${district.x}" y="${district.y}" width="${district.width}" height="${district.depth}" data-style="${escape(district.style)}" />`);
    lines.push("  </g>");
  }
  for (const building of city.buildings) {
    lines.push(`  <rect class="building" data-id="${escape(building.id)}" x="${building.x}" y="${building.y}" width="${building.width}" height="${building.depth}" data-height="${building.height}" data-style="${escape(building.style)}" />`);
  }
  const centers = new Map(city.buildings.map((building) => [building.id, { x: building.x + building.width / 2, y: building.y + building.depth / 2 }]));
  const boundaries = computeRoadTierBoundaries(city.roads.map((road) => road.weight));
  for (const road of city.roads) {
    const from = centers.get(road.from);
    const to = centers.get(road.to);
    if (!from || !to) continue;
    const tier = roadTier(road.weight, boundaries);
    const stroke = TIER_STROKE[tier];
    lines.push(`  <line class="road" data-from="${escape(road.from)}" data-to="${escape(road.to)}" data-tier="${tier}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke-width="${stroke.width}" stroke-opacity="${stroke.opacity}" />`);
  }
  lines.push("</svg>");
  return `${lines.join("\n")}\n`;
}
