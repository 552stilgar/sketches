// RED (behavior 2 — THE load-bearing test) — compileCity throws NotImplemented. Every test
// below calls compileCity as its first real step, so every currently-failing test fails for
// exactly that reason.

import { describe, it, expect } from "vitest";
import { compileCity } from "../src/compiler/index.ts";
import { makeFixedRepoGraph, MUTATE_TARGET_ID } from "./fixtures/repo-graph-fixture.ts";

describe("compiler determinism (RED — compileCity not implemented yet)", () => {
  it("compileCity(G) is byte-identical across repeated calls", () => {
    const g = makeFixedRepoGraph();
    const a = JSON.stringify(compileCity(g));
    const b = JSON.stringify(compileCity(g));
    expect(a).toBe(b);
  });

  it("changing one file's loc only moves that building's footprint — every other building's x,y stays exactly put", () => {
    const g = makeFixedRepoGraph();
    const cityBefore = compileCity(g);

    const g2 = structuredClone(g);
    const target = g2.nodes.find((n) => n.id === MUTATE_TARGET_ID);
    if (!target) throw new Error(`fixture is missing ${MUTATE_TARGET_ID}`);
    expect(target.loc).toBe(80); // sanity: fixture assumption this test depends on
    target.loc = 200;

    const cityAfter = compileCity(g2);

    const buildingBefore = cityBefore.buildings.find((b) => b.id === MUTATE_TARGET_ID);
    const buildingAfter = cityAfter.buildings.find((b) => b.id === MUTATE_TARGET_ID);
    if (!buildingBefore || !buildingAfter) {
      throw new Error("mutated building missing from compiled city");
    }

    // the changed file's own footprint must actually change
    expect(buildingAfter.width !== buildingBefore.width || buildingAfter.depth !== buildingBefore.depth).toBe(
      true,
    );

    // every OTHER building's position must be untouched, exactly
    for (const before of cityBefore.buildings) {
      if (before.id === MUTATE_TARGET_ID) continue;
      const after = cityAfter.buildings.find((b) => b.id === before.id);
      if (!after) throw new Error(`building ${before.id} disappeared after an unrelated loc change`);
      expect(after.x).toBe(before.x);
      expect(after.y).toBe(before.y);
    }
  });
});
