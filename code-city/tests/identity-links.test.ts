// RED — compileCity currently returns `identityLinks: []` unconditionally (src/compiler/index.ts
// placeholder) and selectBuildingSources (src/compiler/grammar.ts) has no clone-awareness at all.
// Turns GREEN once the V4 compiler lane implements both halves of CONTRACTS.md's D2-D4:
//   Part A -- compiler emission: RepoNode.contentHash groups turn into CityModel.identityLinks.
//   Part B -- clone-aware LOD (D4): a directory with any clone-participating file KEEPS FILE
//             GRANULARITY even past the 500-file aggregation threshold; every other directory
//             still collapses as before.

import { describe, expect, it } from "vitest";
import { compileCity } from "../src/compiler/index.ts";
import type { RepoGraph, RepoNode } from "../src/types.ts";
import { validateCity } from "../src/types.ts";

function file(id: string, loc: number, contentHash?: string): RepoNode {
  return {
    id,
    type: "file",
    language: "typescript",
    name: id.split("/").pop() as string,
    path: id,
    loc,
    complexity: 1,
    churn: 0,
    age: 10,
    contributors: ["dev@example.com"],
    imports: [],
    calls: [],
    contains: [],
    ...(contentHash !== undefined ? { contentHash } : {}),
  };
}

function graph(nodes: RepoNode[]): RepoGraph {
  return {
    nodes,
    repoPath: "/fixtures/identity-links",
    headSha: "0000000000000000000000000000000000ilnk",
    headDate: "2026-06-01T12:00:00.000Z",
  };
}

const HASH_KERNEL = "b3f18e5c4d81d174d23a50d2b899c018af158709b1303d7613d676fb045c781e";
const HASH_UTIL = "a73a3aa36909c761976047907e6614490bc6adafeb3e2caec2e7e3d14fbb9e40";

describe("compileCity — identityLinks emission (Part A, D2/D3)", () => {
  it("groups 3 byte-identical files across 3 districts into one identityLink, members sorted by codepoint", () => {
    const g = graph([
      file("alpha/logger.ts", 40, HASH_KERNEL),
      file("beta/logger.ts", 40, HASH_KERNEL),
      file("gamma/logger.ts", 40, HASH_KERNEL),
      file("alpha/unique.ts", 20),
    ]);
    const city = compileCity(g);
    expect(city.identityLinks).toHaveLength(1);
    const link = city.identityLinks[0];
    expect(link.hash).toBe(HASH_KERNEL);
    expect(link.members).toEqual(["alpha/logger.ts", "beta/logger.ts", "gamma/logger.ts"]);
    // Sorted by codepoint, not e.g. discovery order -- reorder the input and confirm the output
    // member order is unchanged.
    expect([...link.members]).toEqual([...link.members].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  });

  it("a hash shared by only one file produces NO identityLink (2+ members required)", () => {
    const g = graph([file("alpha/solo.ts", 30, HASH_KERNEL), file("alpha/other.ts", 20)]);
    const city = compileCity(g);
    expect(city.identityLinks).toEqual([]);
  });

  it("files with no contentHash at all never appear in any identityLink (absence is NOT a clone group)", () => {
    const g = graph([file("alpha/a.ts", 20), file("beta/b.ts", 20), file("gamma/c.ts", 20)]);
    const city = compileCity(g);
    expect(city.identityLinks).toEqual([]);
  });

  it("keeps two distinct hash groups as two distinct identityLinks", () => {
    const g = graph([
      file("alpha/logger.ts", 40, HASH_KERNEL),
      file("beta/logger.ts", 40, HASH_KERNEL),
      file("alpha/util.ts", 15, HASH_UTIL),
      file("gamma/util.ts", 15, HASH_UTIL),
    ]);
    const city = compileCity(g);
    expect(city.identityLinks).toHaveLength(2);
    const byHash = new Map(city.identityLinks.map((l) => [l.hash, l.members]));
    expect(byHash.get(HASH_KERNEL)).toEqual(["alpha/logger.ts", "beta/logger.ts"]);
    expect(byHash.get(HASH_UTIL)).toEqual(["alpha/util.ts", "gamma/util.ts"]);
  });

  it("emitted identityLinks pass validateCity (every member id resolves to a real building)", () => {
    const g = graph([
      file("alpha/logger.ts", 40, HASH_KERNEL),
      file("beta/logger.ts", 40, HASH_KERNEL),
    ]);
    const city = compileCity(g);
    const result = validateCity(city);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("is deterministic: compiling the same graph twice yields byte-identical identityLinks", () => {
    const g = graph([
      file("alpha/logger.ts", 40, HASH_KERNEL),
      file("beta/logger.ts", 40, HASH_KERNEL),
      file("gamma/logger.ts", 40, HASH_KERNEL),
    ]);
    expect(compileCity(g).identityLinks).toEqual(compileCity(structuredClone(g)).identityLinks);
  });
});

describe("compileCity — clone-aware LOD (Part B, D4)", () => {
  // 6 top-level directories, ~90 filler files each (540 total, over the 500-file aggregation
  // threshold from src/compiler/grammar.ts's selectBuildingSources). d0 and d1 each additionally
  // carry one "kernel/logger.ts" file sharing HASH_KERNEL -- the vendored-kernel shape from
  // CONTRACTS.md's motivating dogfood run. d2..d5 have no clone participants at all.
  function buildLargeCloneGraph(): RepoGraph {
    const nodes: RepoNode[] = [];
    const dirs = ["d0", "d1", "d2", "d3", "d4", "d5"];
    for (const dir of dirs) {
      for (let i = 0; i < 90; i++) {
        nodes.push(file(`${dir}/filler${i}.ts`, 20 + (i % 10)));
      }
    }
    nodes.push(file("d0/kernel/logger.ts", 35, HASH_KERNEL));
    nodes.push(file("d1/kernel/logger.ts", 35, HASH_KERNEL));
    return graph(nodes);
  }

  it("total file count is over the 500-file LOD threshold (sanity check on the fixture)", () => {
    expect(buildLargeCloneGraph().nodes.length).toBeGreaterThan(500);
  });

  it("a clone-bearing directory keeps file-level granularity: its files are NOT rolled into one directory building", () => {
    const city = compileCity(buildLargeCloneGraph());
    const buildingIds = new Set(city.buildings.map((b) => b.id));
    // Every one of d0's 91 files (90 filler + logger.ts) still has its own building id --
    // aggregation would instead produce a single "directory:d0" (or "directory:d0/kernel")
    // building and none of these individual ids would be present.
    for (let i = 0; i < 90; i++) {
      expect(buildingIds.has(`d0/filler${i}.ts`)).toBe(true);
    }
    expect(buildingIds.has("d0/kernel/logger.ts")).toBe(true);
    expect(buildingIds.has("d1/kernel/logger.ts")).toBe(true);
  });

  it("a non-clone-bearing directory still collapses to directory-level LOD past the threshold", () => {
    const city = compileCity(buildLargeCloneGraph());
    const buildingIds = new Set(city.buildings.map((b) => b.id));
    // d2 has 90 plain filler files and zero clone participants -- none of its individual file
    // ids should survive as buildings; it must aggregate the same way it would have with no
    // clones anywhere in the repo.
    for (let i = 0; i < 90; i++) {
      expect(buildingIds.has(`d2/filler${i}.ts`)).toBe(false);
    }
    const d2Aggregate = city.buildings.filter((b) => b.id.startsWith("directory:d2"));
    expect(d2Aggregate.length).toBeGreaterThan(0);
  });

  it("the identityLink itself still resolves to the (now file-level) building ids", () => {
    const city = compileCity(buildLargeCloneGraph());
    expect(city.identityLinks).toHaveLength(1);
    expect(city.identityLinks[0].members).toEqual(["d0/kernel/logger.ts", "d1/kernel/logger.ts"]);
    const result = validateCity(city);
    expect(result.ok).toBe(true);
  });

  it("clone-aware LOD does not regress the overall building-count invariant (still far fewer buildings than 540 files)", () => {
    const city = compileCity(buildLargeCloneGraph());
    expect(city.buildings.length).toBeLessThan(540);
    expect(city.buildings.length).toBeGreaterThan(0);
  });
});

describe("compileCity — cloneLodScope option (Lane B)", () => {
  // 6 top-level directories, ~90 filler files each (540 total). d0 additionally has a
  // second-level "sub/" dir with 30 more filler files and one clone file nested three deep
  // (d0/sub/kernel/logger.ts). This shape lets "district" vs "directory" scope diverge visibly:
  // district scope keeps ALL of d0 (including d0/sub) at file LOD; directory scope only keeps
  // the clone file's own aggregation group (d0/sub, per selectBuildingSources's grouping key)
  // at file LOD and still collapses d0's top-level filler files.
  function buildScopeGraph(): RepoGraph {
    const nodes: RepoNode[] = [];
    const dirs = ["d0", "d1", "d2", "d3", "d4", "d5"];
    for (const dir of dirs) {
      for (let i = 0; i < 90; i++) {
        nodes.push(file(`${dir}/filler${i}.ts`, 20 + (i % 10)));
      }
    }
    for (let i = 0; i < 30; i++) {
      nodes.push(file(`d0/sub/filler${i}.ts`, 15));
    }
    nodes.push(file("d0/sub/kernel/logger.ts", 35, HASH_KERNEL));
    nodes.push(file("d1/kernel/logger.ts", 35, HASH_KERNEL));
    return graph(nodes);
  }

  it("defaults to 'district' scope: omitting the option is bit-for-bit identical to passing it explicitly", () => {
    const g = buildScopeGraph();
    const implicit = compileCity(g);
    const explicit = compileCity(structuredClone(g), { cloneLodScope: "district" });
    expect(JSON.stringify(implicit)).toBe(JSON.stringify(explicit));
  });

  it("'district' scope keeps ALL of a clone-bearing district at file LOD, including non-clone siblings", () => {
    const city = compileCity(buildScopeGraph(), { cloneLodScope: "district" });
    const buildingIds = new Set(city.buildings.map((b) => b.id));
    // d0's plain top-level filler files are NOT clone participants, but district scope keeps
    // them at file level anyway because they share a district with a clone member.
    for (let i = 0; i < 90; i++) {
      expect(buildingIds.has(`d0/filler${i}.ts`)).toBe(true);
    }
  });

  it("'directory' scope collapses a non-clone-bearing sibling directory that 'district' scope would keep", () => {
    const cityDistrict = compileCity(buildScopeGraph(), { cloneLodScope: "district" });
    const cityDirectory = compileCity(buildScopeGraph(), { cloneLodScope: "directory" });
    const districtIds = new Set(cityDistrict.buildings.map((b) => b.id));
    const directoryIds = new Set(cityDirectory.buildings.map((b) => b.id));

    // Sanity: district scope keeps d0's top-level filler files at file LOD (asserted above too).
    expect(districtIds.has("d0/filler0.ts")).toBe(true);

    // Directory scope only exempts the clone member's own aggregation group (d0/sub) -- d0's
    // top-level filler files, which share a DISTRICT but not a group with the clone, collapse.
    for (let i = 0; i < 90; i++) {
      expect(directoryIds.has(`d0/filler${i}.ts`)).toBe(false);
    }
    const d0Aggregate = cityDirectory.buildings.filter((b) => b.id === "directory:d0");
    expect(d0Aggregate.length).toBe(1);

    // The clone file's own aggregation group (d0/sub, holding the nested kernel/ clone) still
    // keeps file granularity under directory scope.
    expect(directoryIds.has("d0/sub/kernel/logger.ts")).toBe(true);
    for (let i = 0; i < 30; i++) {
      expect(directoryIds.has(`d0/sub/filler${i}.ts`)).toBe(true);
    }

    // directory scope must therefore produce fewer buildings than district scope on this fixture.
    expect(cityDirectory.buildings.length).toBeLessThan(cityDistrict.buildings.length);
  });

  it("every identityLink member resolves to a real building id in BOTH scopes (validateCity clean, no dangling tether)", () => {
    for (const cloneLodScope of ["district", "directory"] as const) {
      const city = compileCity(buildScopeGraph(), { cloneLodScope });
      expect(city.identityLinks).toHaveLength(1);
      const buildingIds = new Set(city.buildings.map((b) => b.id));
      for (const memberId of city.identityLinks[0].members) {
        expect(buildingIds.has(memberId)).toBe(true);
      }
      const result = validateCity(city);
      expect(result.ok).toBe(true);
      expect(result.errors).toEqual([]);
    }
  });

  it("'directory' scope is itself deterministic across repeat calls", () => {
    const g = buildScopeGraph();
    const a = JSON.stringify(compileCity(g, { cloneLodScope: "directory" }));
    const b = JSON.stringify(compileCity(structuredClone(g), { cloneLodScope: "directory" }));
    expect(a).toBe(b);
  });
});
