// compileCity — datastore landmark emission (V4 contract D1, lane C).
//
// Covers the part of the V4 contract tests/datastores.test.ts (the pure detectDatastores unit)
// and tests/landmarks-render.test.ts (buildLandmarks consuming an already-built CityModel) don't
// reach: compileCity(graph) actually turning `graph.datastores` (attached by analyzeRepo -- see
// the comment in src/analyzer/index.ts on why RepoGraph's frozen type doesn't carry this field
// directly) into `CityModel.landmarks`, deterministically and without overlapping a building.

import { describe, it, expect } from "vitest";
import { compileCity } from "../src/compiler/index.ts";
import { makeFixedRepoGraph } from "./fixtures/repo-graph-fixture.ts";
import type { RepoGraph, Building } from "../src/types.ts";
import type { DatastoreSpec } from "../src/analyzer/datastores.ts";

type RepoGraphWithDatastores = RepoGraph & { datastores?: DatastoreSpec[] };

function withDatastores(datastores: DatastoreSpec[]): RepoGraphWithDatastores {
  return { ...makeFixedRepoGraph(), datastores };
}

function overlaps(a: { x: number; y: number; width: number; depth: number }, b: typeof a): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.depth && b.y < a.y + a.depth;
}

describe("compileCity — datastore landmark emission", () => {
  it("emits no landmarks when the graph carries no datastores field", () => {
    const city = compileCity(makeFixedRepoGraph());
    expect(city.landmarks).toEqual([]);
  });

  it("emits no landmarks for an empty datastores array", () => {
    const city = compileCity(withDatastores([]));
    expect(city.landmarks).toEqual([]);
  });

  it("emits one Landmark per DatastoreSpec, kind datastore, label + weight from the spec", () => {
    const specs: DatastoreSpec[] = [
      { id: "datastore:alpha", dir: "alpha", tableCount: 3, migrationCount: 2 },
      { id: "datastore:beta", dir: "beta", tableCount: 1, migrationCount: 0 },
    ];
    const city = compileCity(withDatastores(specs));
    expect(city.landmarks).toHaveLength(2);
    const byId = new Map(city.landmarks.map((l) => [l.id, l]));
    expect(byId.get("datastore:alpha")).toMatchObject({ kind: "datastore", label: "alpha", weight: 3 });
    expect(byId.get("datastore:beta")).toMatchObject({ kind: "datastore", label: "beta", weight: 1 });
  });

  it("places each landmark inside the bounds of the district owning its directory", () => {
    const specs: DatastoreSpec[] = [{ id: "datastore:alpha", dir: "alpha", tableCount: 2, migrationCount: 1 }];
    const city = compileCity(withDatastores(specs));
    const landmark = city.landmarks[0];
    const district = city.districts.find((d) => d.name === "alpha");
    if (!district) throw new Error("expected an alpha district");
    expect(landmark.x).toBeGreaterThanOrEqual(district.x);
    expect(landmark.x).toBeLessThanOrEqual(district.x + district.width);
    expect(landmark.y).toBeGreaterThanOrEqual(district.y);
    expect(landmark.y).toBeLessThanOrEqual(district.y + district.depth);
  });

  it("never overlaps a building's AABB (reuses the shelf-slot grid, same guarantee buildings get)", () => {
    const specs: DatastoreSpec[] = [
      { id: "datastore:alpha", dir: "alpha", tableCount: 4, migrationCount: 3 },
      { id: "datastore:beta", dir: "beta", tableCount: 2, migrationCount: 1 },
      { id: "datastore:gamma", dir: "gamma", tableCount: 1, migrationCount: 0 },
    ];
    const city = compileCity(withDatastores(specs));
    // Landmarks are points in city.json (x/y only); give them a token footprint matching the
    // smallest real building so the AABB check below is meaningful rather than trivially true.
    const minSide = Math.min(...city.buildings.map((b: Building) => Math.min(b.width, b.depth)));
    const footprint = Math.max(0.5, minSide / 4);
    for (const landmark of city.landmarks) {
      const box = { x: landmark.x - footprint / 2, y: landmark.y - footprint / 2, width: footprint, depth: footprint };
      for (const building of city.buildings) {
        expect(overlaps(box, building)).toBe(false);
      }
    }
  });

  it("still produces a district + landmark for a directory with no analyzed source files (schema-only dir)", () => {
    const specs: DatastoreSpec[] = [{ id: "datastore:schema-only", dir: "schema-only", tableCount: 5, migrationCount: 4 }];
    const city = compileCity(withDatastores(specs));
    expect(city.landmarks).toHaveLength(1);
    expect(city.districts.some((d) => d.name === "schema-only")).toBe(true);
  });

  it("a bare-root schema.sql (dir '') gets the '.' district and a non-empty label/id", () => {
    const specs: DatastoreSpec[] = [{ id: "datastore:.", dir: "", tableCount: 2, migrationCount: 0 }];
    const city = compileCity(withDatastores(specs));
    expect(city.landmarks).toHaveLength(1);
    expect(city.landmarks[0].label).toBe(".");
    expect(city.landmarks[0].id.length).toBeGreaterThan(0);
    expect(city.districts.some((d) => d.name === ".")).toBe(true);
  });

  it("is deterministic: same graph compiled twice yields byte-identical landmarks", () => {
    const specs: DatastoreSpec[] = [
      { id: "datastore:alpha", dir: "alpha", tableCount: 3, migrationCount: 2 },
      { id: "datastore:beta", dir: "beta", tableCount: 1, migrationCount: 0 },
    ];
    const g = withDatastores(specs);
    const a = JSON.stringify(compileCity(g).landmarks);
    const b = JSON.stringify(compileCity(g).landmarks);
    expect(a).toBe(b);
  });

  it("output validates clean against validateCity", async () => {
    const { validateCity } = await import("../src/types.ts");
    const specs: DatastoreSpec[] = [{ id: "datastore:alpha", dir: "alpha", tableCount: 2, migrationCount: 1 }];
    const city = compileCity(withDatastores(specs));
    const result = validateCity(city);
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });
});
