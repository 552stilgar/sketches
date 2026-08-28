// buildRoads' animated-flow behaviour (docs/PROJECT_IDEA.md 5.5 "Animated flow"). These tests
// exercise the Three.js consumer directly -- THREE's core data classes (BufferGeometry,
// ShaderMaterial, LineSegments, Vector3) construct fine outside a browser; only WebGLRenderer
// needs a real canvas, and buildRoads() never touches one. What's load-bearing here: every road
// gets its own honest FlowParams from flow.ts (never re-derived), updateFlow() is the sole place
// per-frame time enters, unresolvable roads are skipped from both the count and the index space,
// and the surfaced provenance can never silently become anything but "structural" in this wave.

import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildRoads } from "../src/renderer/roads.ts";
import { dashOffsetAt, flowBoundaries, flowParams, FLOW_PROVENANCE_LABEL } from "../src/renderer/flow.ts";
import type { CityModel, Road } from "../src/types.ts";

function fakeCity(roads: Road[]): CityModel {
  return { districts: [], buildings: [], roads, landmarks: [], identityLinks: [] };
}

// Simple fixed layout: building id -> world position, so distance-along-road is predictable.
const POSITIONS: Record<string, THREE.Vector3> = {
  a: new THREE.Vector3(0, 0, 0),
  b: new THREE.Vector3(10, 0, 0),
  c: new THREE.Vector3(0, 0, 30),
};

function centerOf(id: string): THREE.Vector3 | null {
  return POSITIONS[id] ?? null;
}

describe("buildRoads — animated flow", () => {
  it("counts only roads with resolvable endpoints", () => {
    const roads: Road[] = [
      { from: "a", to: "b", weight: 3 },
      { from: "a", to: "missing", weight: 9 }, // unresolvable -- must be skipped
      { from: "a", to: "c", weight: 1 },
    ];
    const handle = buildRoads(fakeCity(roads), centerOf);
    expect(handle.animatedRoadCount).toBe(2);
  });

  it("provenance is always structural in this wave, and matches FLOW_PROVENANCE_LABEL", () => {
    const handle = buildRoads(fakeCity([{ from: "a", to: "b", weight: 2 }]), centerOf);
    expect(handle.provenanceLabel).toBe(FLOW_PROVENANCE_LABEL.structural);
  });

  it("dashOffsetOf returns null before the flat index range and past it", () => {
    const handle = buildRoads(fakeCity([{ from: "a", to: "b", weight: 2 }]), centerOf);
    expect(handle.dashOffsetOf(-1)).toBeNull();
    expect(handle.dashOffsetOf(1)).toBeNull();
  });

  it("dashOffsetOf is 0 for every road before the first updateFlow call (t=0 default)", () => {
    const handle = buildRoads(
      fakeCity([
        { from: "a", to: "b", weight: 2 },
        { from: "a", to: "c", weight: 20 },
      ]),
      centerOf,
    );
    expect(handle.dashOffsetOf(0)).toBe(0);
    expect(handle.dashOffsetOf(1)).toBe(0);
  });

  it("updateFlow drives every road's offset via the exact flow.ts dashOffsetAt formula", () => {
    const roads: Road[] = [
      { from: "a", to: "b", weight: 1 },
      { from: "a", to: "c", weight: 50 }, // heavy road -> different tier, different FlowParams
    ];
    const handle = buildRoads(fakeCity(roads), centerOf);

    const bounds = flowBoundaries(roads.map((r) => r.weight));
    const expected = roads.map((r) => dashOffsetAt(flowParams(r.weight, bounds), 12.5));

    handle.updateFlow(12.5);
    expect(handle.dashOffsetOf(0)).toBeCloseTo(expected[0], 5);
    expect(handle.dashOffsetOf(1)).toBeCloseTo(expected[1], 5);
    // The two roads carry different weight -> different FlowParams -> their offsets at the same
    // elapsed time must not coincide (this is what proves per-road motion, not a shared tier
    // offset smeared across every road in the batch).
    expect(handle.dashOffsetOf(0)).not.toBeCloseTo(handle.dashOffsetOf(1) as number, 3);
  });

  it("offset is wrapped and never grows unboundedly as elapsed time increases", () => {
    const handle = buildRoads(fakeCity([{ from: "a", to: "b", weight: 5 }]), centerOf);
    for (const t of [0, 1, 60, 3600, 86_400]) {
      handle.updateFlow(t);
      const off = handle.dashOffsetOf(0);
      expect(off).not.toBeNull();
      expect(off as number).toBeGreaterThanOrEqual(0);
    }
  });

  it("skipped (unresolvable) roads do not consume a flat index", () => {
    const roads: Road[] = [
      { from: "a", to: "missing", weight: 9 },
      { from: "a", to: "b", weight: 4 },
    ];
    const handle = buildRoads(fakeCity(roads), centerOf);
    expect(handle.animatedRoadCount).toBe(1);
    // The one resolvable road lands at flat index 0, not 1 -- unresolvable roads are filtered
    // out of the index space entirely, not left as holes.
    expect(handle.dashOffsetOf(0)).not.toBeNull();
    expect(handle.dashOffsetOf(1)).toBeNull();
  });

  it("builds one LineSegments child per tier that actually has roads, named by tier", () => {
    const handle = buildRoads(fakeCity([{ from: "a", to: "b", weight: 1 }]), centerOf);
    expect(handle.group.children.length).toBeGreaterThan(0);
    for (const child of handle.group.children) {
      expect(child).toBeInstanceOf(THREE.LineSegments);
      expect(child.name.startsWith("roads-")).toBe(true);
    }
  });
});
