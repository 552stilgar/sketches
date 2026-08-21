// renderer: CityModel roads -> thin translucent lines between building centers.

import * as THREE from "three";
import type { CityModel, Road } from "../types.ts";

/**
 * Builds one LineSegments object for all roads. Each segment runs between the two referenced
 * buildings' world centers, slightly above ground so it doesn't z-fight the district rects.
 * Roads whose endpoints aren't resolvable (shouldn't happen post-validateCity, but defensive)
 * are skipped rather than throwing.
 */
export function buildRoads(
  city: CityModel,
  buildingCenter: (id: string) => THREE.Vector3 | null,
): THREE.LineSegments {
  const positions: number[] = [];
  const ROAD_Y = 0.6;

  for (const r of city.roads as Road[]) {
    const from = buildingCenter(r.from);
    const to = buildingCenter(r.to);
    if (!from || !to) continue;
    positions.push(from.x, ROAD_Y, from.z, to.x, ROAD_Y, to.z);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));

  const material = new THREE.LineBasicMaterial({
    color: 0x8fd0ff,
    transparent: true,
    opacity: 0.35,
  });

  const lines = new THREE.LineSegments(geometry, material);
  lines.name = "roads";
  return lines;
}
