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

import type { RepoGraph, CityModel, IdentityLink, RepoNode, Road } from "../types.ts";
import { dominantLanguage, footprintSide, p95, selectBuildingSources, topLevelPath } from "./grammar.ts";
import { shelfSlots, squarify } from "./layout.ts";
import { compareCodepoints, comparePathThenId } from "../util/compare.ts";

export function compileCity(graph: RepoGraph): CityModel {
  const files = graph.nodes.filter((node) => node.type === "file");
  const districtMembers = new Map<string, RepoNode[]>();
  for (const file of files) {
    const path = topLevelPath(file);
    const members = districtMembers.get(path) ?? [];
    members.push(file);
    districtMembers.set(path, members);
  }
  const districtPaths = [...districtMembers.keys()].sort(compareCodepoints);
  const rectangles = squarify(
    districtPaths.map((path) => ({ path, weight: districtMembers.get(path)?.length ?? 1 })),
    { x: 0, y: 0, width: 1000, depth: 1000 },
  );
  const districts = districtPaths.map((path) => {
    const rect = rectangles.get(path) ?? { x: 0, y: 0, width: 1000, depth: 1000 };
    return { id: `district:${path}`, name: path, ...rect, style: dominantLanguage(districtMembers.get(path) ?? []) };
  });

  const sources = selectBuildingSources(graph.nodes).sort(comparePathThenId);
  const locRef = p95(sources.map((source) => source.loc));
  const complexityRef = p95(sources.map((source) => source.complexity));
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
    const side = footprintSide(source.loc, slot.maxSide, locRef);
    return {
      id: source.id,
      x: slot.x,
      y: slot.y,
      width: side,
      depth: side,
      height: 4 + (180 - 4) * Math.min(1, Math.sqrt(Math.max(0, source.complexity)) / Math.sqrt(complexityRef)),
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
  const roadsByKey = new Map<string, Road & { weight: number }>();
  for (const node of [...files].sort(comparePathThenId)) {
    const from = buildingForNode.get(node.id) ?? buildingForNode.get(node.path);
    if (!from) continue;
    for (const target of [...node.imports, ...node.calls].sort(compareCodepoints)) {
      const to = buildingForNode.get(target);
      if (!to || from === to) continue;
      const key = JSON.stringify([from, to]);
      const road = roadsByKey.get(key);
      if (road) road.weight += 1;
      else roadsByKey.set(key, { from, to, weight: 1 });
    }
  }
  const roads: Road[] = [...roadsByKey.values()];
  roads.sort((a, b) => compareCodepoints(a.from, b.from) || compareCodepoints(a.to, b.to));
  const filesByHash = new Map<string, RepoNode[]>();
  for (const file of files) {
    if (file.contentHash === undefined) continue;
    const matches = filesByHash.get(file.contentHash) ?? [];
    matches.push(file);
    filesByHash.set(file.contentHash, matches);
  }
  const identityLinks: IdentityLink[] = [...filesByHash]
    .filter(([, matches]) => matches.length >= 2)
    .sort(([a], [b]) => compareCodepoints(a, b))
    .map(([hash, matches]) => ({
      hash,
      members: matches
        .map((file) => {
          const buildingId = buildingForNode.get(file.id) ?? buildingForNode.get(file.path);
          // Every file belongs to a selected source. Failing here prevents emitting a dangling
          // identity member if that compiler invariant is ever broken by a future LOD rule.
          if (!buildingId) throw new Error(`No building for clone member ${file.id}`);
          return buildingId;
        })
        .sort(compareCodepoints),
    }));
  return { districts, buildings, roads, landmarks: [], identityLinks };
}
