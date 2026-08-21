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
  for (const road of city.roads) {
    const from = centers.get(road.from);
    const to = centers.get(road.to);
    if (!from || !to) continue;
    lines.push(`  <line class="road" data-from="${escape(road.from)}" data-to="${escape(road.to)}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" />`);
  }
  lines.push("</svg>");
  return `${lines.join("\n")}\n`;
}
