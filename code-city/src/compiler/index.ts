// compiler: repo.json (RepoGraph) -> city.json (CityModel)
//
// Contract: docs/CONTRACT-city-json.md. Implementation lane fills this in.
//
// MUST be a pure function of `graph` — no Date.now(), no Math.random(), no dependence on
// object-key insertion order or Set/Map iteration order. See
// tests/compiler-determinism.test.ts and tests/compiler-layout.test.ts for the exact
// behavioral gates this has to satisfy: byte-identical repeat output, unrelated buildings never
// move when one file's metrics change, no AABB overlaps, every building inside a district, every
// road resolves to a real building id, and the LOD table (fixed, see the contract doc).

import type { RepoGraph, CityModel, RepoNode, Road } from "../types.ts";
import { dominantLanguage, footprintSide, selectBuildingSources, topLevelPath } from "./grammar.ts";
import { shelfSlots, squarify } from "./layout.ts";
import { comparePathThenId } from "../util/compare.ts";

export function compileCity(graph: RepoGraph): CityModel {
  const files = graph.nodes.filter((node) => node.type === "file");
  const districtMembers = new Map<string, RepoNode[]>();
  for (const file of files) {
    const path = topLevelPath(file);
    const members = districtMembers.get(path) ?? [];
    members.push(file);
    districtMembers.set(path, members);
  }
  const districtPaths = [...districtMembers.keys()].sort((a, b) => a.localeCompare(b));
  const rectangles = squarify(
    districtPaths.map((path) => ({ path, weight: districtMembers.get(path)?.length ?? 1 })),
    { x: 0, y: 0, width: 1000, depth: 1000 },
  );
  const districts = districtPaths.map((path) => {
    const rect = rectangles.get(path) ?? { x: 0, y: 0, width: 1000, depth: 1000 };
    return { id: `district:${path}`, name: path, ...rect, style: dominantLanguage(districtMembers.get(path) ?? []) };
  });

  const sources = selectBuildingSources(graph.nodes).sort(comparePathThenId);
  const sourcesByDistrict = new Map<string, typeof sources>();
  for (const source of sources) {
    const group = sourcesByDistrict.get(source.districtPath) ?? [];
    group.push(source);
    sourcesByDistrict.set(source.districtPath, group);
  }
  const slots = new Map<string, ReturnType<typeof shelfSlots> extends Map<string, infer S> ? S : never>();
  for (const district of districts) {
    const group = sourcesByDistrict.get(district.name) ?? [];
    for (const [path, slot] of shelfSlots(group.map((source) => source.path), district)) slots.set(path, slot);
  }
  const buildings = sources.map((source) => {
    const slot = slots.get(source.path);
    if (!slot) throw new Error(`No layout slot for ${source.path}`);
    const side = footprintSide(source.loc, slot.maxSide);
    return {
      id: source.id,
      x: slot.x,
      y: slot.y,
      width: side,
      depth: side,
      height: Math.max(1, source.complexity),
      style: source.language,
      metrics: { loc: source.loc, complexity: source.complexity, churn: source.churn },
    };
  });

  const buildingForNode = new Map<string, string>();
  for (const source of sources) {
    for (const member of source.members) {
      buildingForNode.set(member.id, source.id);
      buildingForNode.set(member.path, source.id);
    }
  }
  const roadKeys = new Set<string>();
  const roads: Road[] = [];
  for (const node of [...files].sort(comparePathThenId)) {
    const from = buildingForNode.get(node.id) ?? buildingForNode.get(node.path);
    if (!from) continue;
    for (const target of [...node.imports].sort((a, b) => a.localeCompare(b))) {
      const to = buildingForNode.get(target);
      if (!to || from === to) continue;
      const key = `${from}\0${to}`;
      if (!roadKeys.has(key)) {
        roadKeys.add(key);
        roads.push({ from, to });
      }
    }
  }
  roads.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
  return { districts, buildings, roads, landmarks: [] };
}
