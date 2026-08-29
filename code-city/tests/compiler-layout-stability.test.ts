// Lane E — cross-snapshot layout stability.
//
// tests/compiler-determinism.test.ts gates determinism WITHIN one compileCity call (same graph
// in, same city out, byte-identical). It cannot catch drift ACROSS two different graphs of the
// same repo -- which is exactly what the timeline-scrub feature needs: a file present in several
// monthly repo-YYYY-MM.json snapshots must land in approximately the same place in each, or
// scrubbing reshuffles the whole city and destroys the spatial-memory property the feature exists
// to exploit (docs/PROJECT_IDEA.md, timeline scrub).
//
// SCOPE: districts are laid out by `squarify`, a squarified treemap -- and
// docs/CONTRACT-city-json.md "Layout algorithm (fixed — do not redesign)" pins that algorithm
// class. A treemap is inherently global: changing ANY district's weight (file count) can move
// every district's rect, by design, and that is not this lane's fix. What IS this lane's fix is
// `shelfSlots` -- the placement of buildings/landmarks WITHIN a district -- per
// docs/CONTRACT-city-json.md step 3: "slot positions derived from path identity — never insertion
// order." So this file asserts stability of a building's position RELATIVE TO ITS OWN DISTRICT
// (normalized fraction of the district's width/depth), which isolates the shelfSlots fix from
// district-level treemap reflow that is explicitly out of scope. See SURFACED in the lane report
// for the resulting statement about whole-city (absolute-canvas) stability.
//
// TOLERANCE: 0.3 (30%) of the district's width/depth. `shelfSlots` (src/compiler/layout.ts)
// derives each path's preferred grid cell from a stable hash of the path, rounded to the nearest
// cell of the CURRENT grid -- so the raw quantization error against the continuous fraction
// `hash(path)` is already sub-cell. The dominant source of drift instead turned out to be
// collision-resolution displacement: a grid sized to just barely fit N items packs at near-100%
// occupancy, and at that density hash-preferred cells collide constantly, forcing long
// deterministic search walks whose length depends on the whole occupied set -- exactly the kind
// of non-local instability this rewrite exists to remove (this was measured directly: on the
// scenario below, a tightly-fit grid put max drift over 0.6). `shelfSlots` oversamples its
// placement grid (`GRID_OVERSCAN`, currently 3x more cells than items) so most preferred cells are
// free on the first try and displacement stays local to genuine collisions; measured empirically
// on the scenario below, worst-case drift lands under 0.2. 0.3 keeps margin above that measured
// worst case while staying an order of magnitude tighter than "anywhere in the district" (1.0).

import { describe, it, expect } from "vitest";
import { compileCity } from "../src/compiler/index.ts";
import { squarify, shelfSlots, type WeightedPath } from "../src/compiler/layout.ts";
import { synthesizeGraph } from "./fixtures/repo-graph-fixture.ts";
import type { RepoGraph, RepoNode, CityModel, Building, District } from "../src/types.ts";

const POSITION_TOLERANCE = 0.3;

function districtOf(city: CityModel, building: Building): District | undefined {
  return city.districts.find(
    (d) => building.x >= d.x && building.y >= d.y && building.x + building.width <= d.x + d.width && building.y + building.depth <= d.y + d.depth,
  );
}

/** Building position normalized to a [0,1) fraction of its own district's extent. */
function normalizedPosition(city: CityModel, building: Building): { fx: number; fy: number } | undefined {
  const district = districtOf(city, building);
  if (!district) return undefined;
  return {
    fx: district.width === 0 ? 0 : (building.x - district.x) / district.width,
    fy: district.depth === 0 ? 0 : (building.y - district.y) / district.depth,
  };
}

function cloneGraph(graph: RepoGraph, transform: (nodes: RepoNode[]) => RepoNode[]): RepoGraph {
  return { ...graph, nodes: transform(graph.nodes.map((n) => ({ ...n }))) };
}

describe("cross-snapshot layout stability (Lane E)", () => {
  it("a shared file's position within its district stays within tolerance when OTHER files are added and removed", () => {
    const base = synthesizeGraph(120, 4); // dir0..dir3, file0..file119

    // Snapshot A: files 0..109 (drop the last 10).
    const snapshotA = cloneGraph(base, (nodes) => nodes.filter((n) => !/file(11[0-9])\.ts$/.test(n.id)));
    // Snapshot B: files 0..99, plus 20 new files 120..139 (drop 10 different files, add 20 new).
    const snapshotB = cloneGraph(base, (nodes) => {
      const kept = nodes.filter((n) => !/file(10[0-9])\.ts$/.test(n.id));
      const added: RepoNode[] = [];
      for (let i = 120; i < 140; i++) {
        const dir = `dir${i % 4}`;
        added.push({
          id: `${dir}/file${i}.ts`,
          type: "file",
          language: "typescript",
          name: `file${i}.ts`,
          path: `${dir}/file${i}.ts`,
          loc: 20 + (i % 50),
          complexity: 1 + (i % 10),
          churn: i % 5,
          age: 30 + i,
          contributors: ["dev@example.com"],
          imports: [],
          calls: [],
          contains: [],
        });
      }
      return [...kept, ...added];
    });

    const cityA = compileCity(snapshotA);
    const cityB = compileCity(snapshotB);

    const buildingsA = new Map(cityA.buildings.map((b) => [b.id, b]));
    const buildingsB = new Map(cityB.buildings.map((b) => [b.id, b]));

    // Shared paths: present (as their own building -- both snapshots are well under the 500-file
    // LOD threshold so buildings = files) in both A and B.
    const sharedIds = [...buildingsA.keys()].filter((id) => buildingsB.has(id));
    expect(sharedIds.length).toBeGreaterThan(50); // sanity: the scenario actually shares plenty

    let checked = 0;
    for (const id of sharedIds) {
      const a = normalizedPosition(cityA, buildingsA.get(id)!);
      const b = normalizedPosition(cityB, buildingsB.get(id)!);
      expect(a, `building ${id} not contained in any district in snapshot A`).toBeDefined();
      expect(b, `building ${id} not contained in any district in snapshot B`).toBeDefined();
      expect(Math.abs(a!.fx - b!.fx), `${id}: normalized x drifted`).toBeLessThanOrEqual(POSITION_TOLERANCE);
      expect(Math.abs(a!.fy - b!.fy), `${id}: normalized y drifted`).toBeLessThanOrEqual(POSITION_TOLERANCE);
      checked++;
    }
    expect(checked).toBe(sharedIds.length);
  });

  it("shelfSlots alone: a path's slot survives many unrelated insertions/removals within one fixed district rect", () => {
    // Isolates shelfSlots from squarify/compileCity entirely -- fixed district rect, only the
    // key SET changes between calls. This is the most direct test of "keyed by full path."
    const district = { x: 0, y: 0, width: 400, depth: 400 };
    const stablePath = "src/core/engine.ts";
    const others = (n: number, offset = 0) =>
      Array.from({ length: n }, (_, i) => `src/module/m${i + offset}.ts`);

    const slotsSmall = shelfSlots([stablePath, ...others(20)], district);
    const slotsGrown = shelfSlots([stablePath, ...others(20), ...others(15, 1000)], district);
    const slotsShrunk = shelfSlots([stablePath, ...others(8)], district);

    const small = slotsSmall.get(stablePath)!;
    const grown = slotsGrown.get(stablePath)!;
    const shrunk = slotsShrunk.get(stablePath)!;
    expect(small).toBeDefined();
    expect(grown).toBeDefined();
    expect(shrunk).toBeDefined();

    for (const other of [grown, shrunk]) {
      expect(Math.abs(small.x - other.x)).toBeLessThanOrEqual(POSITION_TOLERANCE * district.width);
      expect(Math.abs(small.y - other.y)).toBeLessThanOrEqual(POSITION_TOLERANCE * district.depth);
    }
  });

  it("input order independence: shuffling node array order never changes compileCity's output", () => {
    const graph = synthesizeGraph(80, 3);
    const shuffled = cloneGraph(graph, (nodes) => {
      // Deterministic shuffle (not Math.random) -- reverse, then rotate by a fixed offset, so the
      // permutation itself is reproducible across CI runs while still being a real reordering.
      const reversed = [...nodes].reverse();
      const offset = 13;
      return [...reversed.slice(offset), ...reversed.slice(0, offset)];
    });

    const cityOriginal = compileCity(graph);
    const cityShuffled = compileCity(shuffled);
    expect(cityShuffled).toEqual(cityOriginal);
  });

  it("shelfSlots directly: shuffled path array order produces an identical slot map", () => {
    const district = { x: 0, y: 0, width: 300, depth: 200 };
    const paths = Array.from({ length: 37 }, (_, i) => `pkg/mod${i}.ts`);
    const shuffled = [...paths].reverse();
    const a = shelfSlots(paths, district);
    const b = shelfSlots(shuffled, district);
    expect([...b]).toEqual([...a]);
  });

  it("squarify directly: shuffled item array order produces an identical rect map (district layer stays untouched/order-independent)", () => {
    const items: WeightedPath[] = Array.from({ length: 9 }, (_, i) => ({ path: `dir${i}`, weight: (i % 4) + 1 }));
    const shuffled = [...items].reverse();
    const bounds = { x: 0, y: 0, width: 1000, depth: 1000 };
    expect([...squarify(shuffled, bounds)]).toEqual([...squarify(items, bounds)]);
  });

  it("cloneLodScope: stability holds WITHIN the same mode (district and directory each self-consistent)", () => {
    // >500 files so LOD aggregation is active; a small clone pair keeps one directory at file
    // granularity under both scopes so there's a real shared building id to compare.
    const graph = synthesizeGraph(520, 4);
    graph.nodes[0].contentHash = "shared-hash";
    graph.nodes[1].contentHash = "shared-hash";

    const addTen = cloneGraph(graph, (nodes) => [
      ...nodes,
      ...Array.from({ length: 10 }, (_, i) => ({ ...nodes[nodes.length - 1], id: `extra${i}.ts`, path: `dir0/extra${i}.ts` })),
    ]);

    for (const cloneLodScope of ["district", "directory"] as const) {
      const cityA = compileCity(graph, { cloneLodScope });
      const cityB = compileCity(addTen, { cloneLodScope });
      const a = cityA.buildings.find((b) => b.id === graph.nodes[0].id);
      const b = cityB.buildings.find((bld) => bld.id === graph.nodes[0].id);
      expect(a, `clone-exempt file has no building under cloneLodScope=${cloneLodScope} (A)`).toBeDefined();
      expect(b, `clone-exempt file has no building under cloneLodScope=${cloneLodScope} (B)`).toBeDefined();
      const na = normalizedPosition(cityA, a!)!;
      const nb = normalizedPosition(cityB, b!)!;
      expect(Math.abs(na.fx - nb.fx), `cloneLodScope=${cloneLodScope} x drifted`).toBeLessThanOrEqual(POSITION_TOLERANCE);
      expect(Math.abs(na.fy - nb.fy), `cloneLodScope=${cloneLodScope} y drifted`).toBeLessThanOrEqual(POSITION_TOLERANCE);
    }

    // ACROSS modes: explicitly NOT asserted as stable, and does not hold in general. The two
    // scopes select a different set of aggregation keys past the LOD threshold (district scope
    // exempts a whole top-level district; directory scope exempts only the clone's own
    // aggregation group -- CONTRACTS.md D4/"cloneLodScope"), so a given path is not even
    // guaranteed to key the same *kind* of building (file vs. directory-aggregate) across scopes.
    // Comparing positions across scopes would be comparing different identities, not drift.
  });
});
