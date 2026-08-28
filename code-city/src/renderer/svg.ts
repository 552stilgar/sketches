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
//
// V4 (CONTRACTS.md § "V4: datastores + clone identity") adds two element kinds, both documented
// in docs/CONTRACT-render-svg.md:
//   - <circle class="landmark"> — a datastore. Deliberately a DIFFERENT TAG (circle, not rect)
//     from <rect class="building">, so "this is not a building" is legible even before any CSS
//     or color is applied — the same tag-shape distinction src/renderer/landmarks.ts makes with
//     a cylinder body vs. buildings.ts's box-derived profiles.
//   - <line class="tether"> + <circle class="tether-node"> — a clone-identity link (D2). A
//     tether is class="tether", never class="road", and — unlike every <line class="road">, which
//     always carries stroke-dasharray + a child <animate> — a tether carries NEITHER. That
//     absence, not a color choice, is the structural signal a static debug view (no CSS, no
//     runtime) still reads correctly: motion-capable markup vs. none, mirroring
//     src/renderer/tethers.ts's "no aOffset/aDashPeriod attribute, ever" rule on the 3D side.

import type { CityModel, IdentityLink, Landmark } from "../types.ts";
import {
  FLOW_PROVENANCE_LABEL,
  flowBoundaries,
  flowParams,
} from "./flow.ts";
import { roadTier, type RoadTier } from "./roads.ts";

/** Stroke width + opacity per tier. Mirrors TIER_STYLE in roads.ts, adapted for SVG stroke
 * rendering (width is a legible signal in 2D, unlike WebGL line width). */
const TIER_STROKE: Record<RoadTier, { width: number; opacity: number }> = {
  footpath: { width: 1, opacity: 0.25 },
  street: { width: 2, opacity: 0.45 },
  arterial: { width: 3.5, opacity: 0.7 },
  highway: { width: 5.5, opacity: 0.95 },
};

// -------------------------------------------------------------------------------------------
// V4: landmarks (datastores)
// -------------------------------------------------------------------------------------------

/** A missing Landmark.weight is UNMEASURED, never zero tables — same "absence != zero" idiom as
 *  Road.weight's UNWEIGHTED_DEFAULT (src/renderer/roads.ts). Used only to size the circle; never
 *  printed as a fabricated `data-weight` (see below — that attribute is omitted, not defaulted,
 *  when the source Landmark has no weight). */
const LANDMARK_WEIGHT_DEFAULT = 1;
const LANDMARK_BASE_RADIUS = 6;
const LANDMARK_RADIUS_SCALE = 4;

/** Same sqrt-of-signal scaling as buildings' sqrt(loc) footprint rule (docs/CONTRACT-city-json.md,
 *  "Urban grammar") and landmarks.ts's tankDimensions — independently computed here (svg.ts stays
 *  framework-independent, no THREE import) but deliberately the same formula shape. */
function landmarkRadius(weight: number | undefined): number {
  const w = weight === undefined || !Number.isFinite(weight) || weight < 0 ? LANDMARK_WEIGHT_DEFAULT : weight;
  return LANDMARK_BASE_RADIUS + LANDMARK_RADIUS_SCALE * Math.sqrt(w);
}

// -------------------------------------------------------------------------------------------
// V4: clone identity (tethers) — D2, "identity links are not roads"
// -------------------------------------------------------------------------------------------

const TETHER_STROKE = { width: 3, opacity: 0.9 };
const TETHER_NODE_RADIUS = 3;

export function render2d(city: CityModel): string {
  const escape = (value: string): string => value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  const lines = [`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000" data-flow-provenance="${escape(FLOW_PROVENANCE_LABEL.structural)}">`];
  for (const district of city.districts) {
    lines.push(`  <g class="district" data-id="${escape(district.id)}">`);
    lines.push(`    <rect class="district-ground" x="${district.x}" y="${district.y}" width="${district.width}" height="${district.depth}" data-style="${escape(district.style)}" />`);
    lines.push("  </g>");
  }
  for (const building of city.buildings) {
    lines.push(`  <rect class="building" data-id="${escape(building.id)}" x="${building.x}" y="${building.y}" width="${building.width}" height="${building.depth}" data-height="${building.height}" data-style="${escape(building.style)}" />`);
  }
  const centers = new Map(city.buildings.map((building) => [building.id, { x: building.x + building.width / 2, y: building.y + building.depth / 2 }]));

  for (const landmark of city.landmarks as Landmark[]) {
    if (landmark.kind !== "datastore") continue;
    const r = landmarkRadius(landmark.weight);
    const label = landmark.label ?? landmark.id;
    const weightAttr = landmark.weight !== undefined ? ` data-weight="${landmark.weight}"` : "";
    lines.push(`  <circle class="landmark" data-id="${escape(landmark.id)}" data-kind="${escape(landmark.kind)}" data-label="${escape(label)}"${weightAttr} cx="${landmark.x}" cy="${landmark.y}" r="${r}" />`);
  }

  const boundaries = flowBoundaries(city.roads.map((road) => road.weight));
  for (const road of city.roads) {
    const from = centers.get(road.from);
    const to = centers.get(road.to);
    if (!from || !to) continue;
    const tier = roadTier(road.weight, boundaries);
    const stroke = TIER_STROKE[tier];
    const flow = flowParams(road.weight, boundaries);
    const dashLength = flow.dashPeriod / 2;
    const duration = flow.dashPeriod / flow.speed;
    lines.push(`  <line class="road" data-from="${escape(road.from)}" data-to="${escape(road.to)}" data-tier="${tier}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke-width="${stroke.width}" stroke-opacity="${stroke.opacity}" stroke-dasharray="${dashLength} ${dashLength}">`);
    lines.push(`    <animate attributeName="stroke-dashoffset" from="0" to="${flow.dashPeriod}" dur="${duration}s" repeatCount="indefinite" />`);
    lines.push("  </line>");
  }

  // V4 (D2, "identity links are not roads"): one <line class="tether"> per adjacent pair in
  // `members` order (chain topology, mirrors src/renderer/tethers.ts) -- NEVER stroke-dasharray,
  // NEVER a child <animate>. Both are exactly the markup a road always carries, so their absence
  // here is the whole visual contract: a tether cannot be a road that merely forgot to move.
  // identityLinks is legal-absent on a pre-V4 city.json (src/types.ts's CityModel doc comment,
  // same "optional in the TYPE, mandatory from a V4+ producer" idiom as Road.weight) -- treat a
  // missing key as "no clone groups", never throw.
  for (const link of (city.identityLinks ?? []) as IdentityLink[]) {
    const resolvedIds = new Set<string>();
    for (let i = 0; i < link.members.length - 1; i++) {
      const fromId = link.members[i];
      const toId = link.members[i + 1];
      const from = centers.get(fromId);
      const to = centers.get(toId);
      if (!from || !to) continue;
      resolvedIds.add(fromId);
      resolvedIds.add(toId);
      lines.push(`  <line class="tether" data-hash="${escape(link.hash)}" data-from="${escape(fromId)}" data-to="${escape(toId)}" x1="${from.x}" y1="${from.y}" x2="${to.x}" y2="${to.y}" stroke-width="${TETHER_STROKE.width}" stroke-opacity="${TETHER_STROKE.opacity}" />`);
    }
    for (const memberId of link.members) {
      if (!resolvedIds.has(memberId)) continue;
      const center = centers.get(memberId)!;
      lines.push(`  <circle class="tether-node" data-hash="${escape(link.hash)}" data-id="${escape(memberId)}" cx="${center.x}" cy="${center.y}" r="${TETHER_NODE_RADIUS}" />`);
    }
  }

  lines.push("</svg>");
  return `${lines.join("\n")}\n`;
}
