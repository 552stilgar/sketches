// GREEN — the validators are real, not stubbed. This is the one test file that should be fully
// passing today.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { validateRepoGraph, validateCity } from "../src/types.ts";
import type { RepoGraph } from "../src/types.ts";

const MOCK_CITY_PATH = fileURLToPath(new URL("../fixtures/mock-city.json", import.meta.url));

function loadMockCity(): unknown {
  return JSON.parse(readFileSync(MOCK_CITY_PATH, "utf-8"));
}

function smallValidGraph(): RepoGraph {
  return {
    nodes: [
      {
        id: "a.ts",
        type: "file",
        language: "typescript",
        name: "a.ts",
        path: "a.ts",
        loc: 10,
        complexity: 2,
        churn: 0,
        age: 5,
        contributors: ["dev@example.com"],
        imports: ["b.ts"],
        calls: [],
        contains: [],
      },
      {
        id: "b.ts",
        type: "file",
        language: "typescript",
        name: "b.ts",
        path: "b.ts",
        loc: 20,
        complexity: 3,
        churn: 1,
        age: 5,
        contributors: ["dev@example.com"],
        imports: [],
        calls: [],
        contains: [],
      },
    ],
    repoPath: "/fixtures/small",
    headSha: "deadbeef",
    headDate: "2026-06-01T12:00:00.000Z",
  };
}

describe("validateCity", () => {
  it("accepts fixtures/mock-city.json", () => {
    const result = validateCity(loadMockCity());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects a district missing a required field", () => {
    const city = loadMockCity() as Record<string, unknown>;
    const districts = city.districts as Array<Record<string, unknown>>;
    delete districts[0].width;
    const result = validateCity(city);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a duplicate building id", () => {
    const city = loadMockCity() as Record<string, unknown>;
    const buildings = city.buildings as Array<Record<string, unknown>>;
    buildings[1] = { ...buildings[1], id: buildings[0].id };
    const result = validateCity(city);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("duplicate"))).toBe(true);
  });

  it("rejects a dangling road reference", () => {
    const city = loadMockCity() as Record<string, unknown>;
    const roads = city.roads as Array<Record<string, unknown>>;
    const buildings = city.buildings as Array<Record<string, unknown>>;
    roads.push({ from: "does-not-exist", to: buildings[0].id });
    const result = validateCity(city);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("does-not-exist"))).toBe(true);
  });
});

describe("validateRepoGraph", () => {
  it("accepts a small valid RepoGraph literal", () => {
    const result = validateRepoGraph(smallValidGraph());
    expect(result.errors).toEqual([]);
    expect(result.ok).toBe(true);
  });

  it("rejects a node missing a required field", () => {
    const g = smallValidGraph() as unknown as Record<string, unknown>;
    const nodes = g.nodes as Array<Record<string, unknown>>;
    delete nodes[0].loc;
    const result = validateRepoGraph(g);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("rejects a duplicate node id", () => {
    const g = smallValidGraph() as unknown as Record<string, unknown>;
    const nodes = g.nodes as Array<Record<string, unknown>>;
    nodes[1] = { ...nodes[1], id: nodes[0].id };
    const result = validateRepoGraph(g);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes("duplicate"))).toBe(true);
  });
});
