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

import type { RepoGraph, CityModel, IdentityLink, RepoNode, Road, Landmark, DatastoreSpec } from "../types.ts";
import { dominantLanguage, footprintSide, normalizePath, p95, selectBuildingSources, topLevelPath } from "./grammar.ts";
import type { CloneLodScope } from "./grammar.ts";
import { districtWeights, shelfSlots, squarify } from "./layout.ts";
import type { DistrictWeightMode } from "./layout.ts";
import { compareCodepoints, comparePathThenId } from "../util/compare.ts";

// A bare directory string (no filename component) has different "first segment" semantics than
// `topLevelPath(node)`, which is built for a full file path and treats a no-slash path as a
// ROOT-LEVEL FILE (mapping to the "." district). For a directory string, a no-slash value like
// "src" already *is* the top-level segment -- it must map to the "src" district, not ".". Only
// the true repo-root case (`dir === ""`, a bare schema.sql with no directory at all) maps to ".".
function topLevelPathOfDir(dir: string): string {
  const normalized = normalizePath(dir);
  if (normalized === "") return ".";
  const slash = normalized.indexOf("/");
  return slash < 0 ? normalized : normalized.slice(0, slash);
}

export interface CompileCityOptions {
  /** D4 clone-aware LOD scope (CONTRACTS.md V4, docs/CONTRACT-city-json.md "D4"). Defaults to
   *  "district" (the original V4 behavior) so omitting this option is bit-for-bit unchanged. */
  cloneLodScope?: CloneLodScope;
  /** V5.1 district area-weighting curve (src/compiler/layout.ts DistrictWeightMode). Defaults to
   *  DEFAULT_DISTRICT_WEIGHT_MODE, which is "derived" as of 2026-08-31: the exponent of a
   *  count**p curve is SOLVED per-compile from the actual district counts (see
   *  deriveDistrictWeightExponent), least distortion that still keeps every district legible,
   *  rather than a fixed curve ruled on one repo's shape and silently wrong on the next one's --
   *  see DEFAULT_DISTRICT_WEIGHT_MODE's doc comment for the usul-mgmt distribution that motivated
   *  retiring the fixed "log" default. Pass "linear", "sqrt", or "log" to reproduce any city
   *  compiled before that date byte-for-byte -- all three remain explicit, named opt-outs. See
   *  layout.ts's districtWeight() doc comment for why the curve must stay a named, caller-chosen
   *  (or, for "derived", caller-chosen-and-then-data-solved) input rather than a hidden
   *  auto-selected mode. */
  districtWeightMode?: DistrictWeightMode;
  /** Building-footprint floor as a fraction of the slot maximum (see FOOTPRINT_FLOOR_DEFAULT's
   *  doc comment in grammar.ts for the trade-off and the current-curve caveat). Defaults to
   *  FOOTPRINT_FLOOR_DEFAULT so omitting this option is bit-for-bit unchanged. */
  footprintFloor?: number;
}

export function compileCity(graph: RepoGraph, options?: CompileCityOptions): CityModel {
  const datastores = graph.datastores ?? [];
  const files = graph.nodes.filter((node) => node.type === "file");
  const districtMembers = new Map<string, RepoNode[]>();
  for (const file of files) {
    const path = topLevelPath(file);
    const members = districtMembers.get(path) ?? [];
    members.push(file);
    districtMembers.set(path, members);
  }
  // A datastore can live in a directory that holds no analyzed source files at all (e.g. a
  // migrations-only directory) -- never let that silently drop its landmark for lack of a
  // district to place it in. Ensure every datastore's district key exists (possibly with zero
  // file members) before districts are laid out, so `squarify`/`shelfSlots` always have
  // somewhere deterministic to put it.
  for (const spec of datastores) {
    const path = topLevelPathOfDir(spec.dir);
    if (!districtMembers.has(path)) districtMembers.set(path, []);
  }
  const districtPaths = [...districtMembers.keys()].sort(compareCodepoints);
  // districtWeights() computes the whole distribution's weights in one call rather than per-path
  // districtWeight(count) calls: "derived" mode (the default) needs every district's count at once
  // to solve one shared exponent (layout.ts deriveDistrictWeightExponent) -- a per-count call has
  // no way to see its siblings. "linear"/"sqrt"/"log" are unaffected: districtWeights() for those
  // three modes is exactly a per-count map, so this is not a behavior change for explicit opt-outs.
  const districtCounts = districtPaths.map((path) => districtMembers.get(path)?.length ?? 1);
  const districtWeightValues = districtWeights(districtCounts, options?.districtWeightMode);
  const rectangles = squarify(
    districtPaths.map((path, i) => ({ path, weight: districtWeightValues[i] })),
    { x: 0, y: 0, width: 1000, depth: 1000 },
  );
  const districts = districtPaths.map((path) => {
    const rect = rectangles.get(path) ?? { x: 0, y: 0, width: 1000, depth: 1000 };
    return { id: `district:${path}`, name: path, ...rect, style: dominantLanguage(districtMembers.get(path) ?? []) };
  });

  const sources = selectBuildingSources(graph.nodes, { cloneLodScope: options?.cloneLodScope }).sort(
    comparePathThenId,
  );
  const locRef = p95(sources.map((source) => source.loc));
  const complexityRef = p95(sources.map((source) => source.complexity));
  const sourcesByDistrict = new Map<string, typeof sources>();
  for (const source of sources) {
    const group = sourcesByDistrict.get(source.districtPath) ?? [];
    group.push(source);
    sourcesByDistrict.set(source.districtPath, group);
  }
  const datastoresByDistrict = new Map<string, DatastoreSpec[]>();
  for (const spec of datastores) {
    const path = topLevelPathOfDir(spec.dir);
    const group = datastoresByDistrict.get(path) ?? [];
    group.push(spec);
    datastoresByDistrict.set(path, group);
  }
  const slots = new Map<string, ReturnType<typeof shelfSlots> extends Map<string, infer S> ? S : never>();
  for (const district of districts) {
    const group = sourcesByDistrict.get(district.name) ?? [];
    // Landmarks share the same shelf-grid pass as this district's buildings (rather than a
    // separate placement step) specifically so they land in a distinct, non-overlapping cell by
    // the same construction that already guarantees no two buildings overlap -- `spec.id`
    // (always prefixed "datastore:") is added to the same key list `shelfSlots` partitions, and
    // never collides with a real building path.
    const landmarkKeys = (datastoresByDistrict.get(district.name) ?? []).map((spec) => spec.id);
    const keys = [...group.map((source) => source.path), ...landmarkKeys];
    for (const [path, slot] of shelfSlots(keys, district)) slots.set(path, slot);
  }
  const buildings = sources.map((source) => {
    const slot = slots.get(source.path);
    if (!slot) throw new Error(`No layout slot for ${source.path}`);
    const side = footprintSide(source.loc, slot.maxSide, locRef, options?.footprintFloor);
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

  // Landmarks (V4 contract, "Landmarks" section of docs/CONTRACT-city-json.md): one per
  // DatastoreSpec, positioned at the center of the shelf-grid cell reserved for it above (never
  // overlapping a building -- same non-overlap guarantee `shelfSlots` already gives buildings,
  // reused rather than re-derived). `weight` is `tableCount` (schema-derived, D1); `label` is
  // the full datastore directory so two same-named "migrations" dirs in different districts of a
  // merged/multi-repo city stay distinguishable (bare basenames would collide).
  const landmarks: Landmark[] = datastores.map((spec) => {
    const slot = slots.get(spec.id);
    const district = districts.find((d) => d.name === topLevelPathOfDir(spec.dir));
    // Defensive fallback only -- every datastore's district key was seeded into districtMembers
    // above, so `slot` is always present in practice; this keeps compileCity total rather than
    // throwing if that invariant is ever broken by a future edit, while still placing the
    // landmark inside a real district rectangle rather than off-canvas.
    const x = slot ? slot.x + slot.width / 2 : (district?.x ?? 0) + (district?.width ?? 0) / 2;
    const y = slot ? slot.y + slot.depth / 2 : (district?.y ?? 0) + (district?.depth ?? 0) / 2;
    return { id: spec.id, x, y, kind: "datastore", label: spec.dir === "" ? "." : spec.dir, weight: spec.tableCount };
  });
  landmarks.sort((a, b) => compareCodepoints(a.id, b.id));

  // identityLinks: V4 clone-identity detection (CONTRACTS.md, D2/D3). Byte-identical files are
  // grouped by contentHash and resolved to the buildings that carry them; groups of one are not
  // clones and are dropped.
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
  return { districts, buildings, roads, landmarks, identityLinks };
}
