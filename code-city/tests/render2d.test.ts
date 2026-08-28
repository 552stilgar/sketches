// RED (behavior 4) — render2d throws NotImplemented. Every test below calls render2d as its
// first real step, so every currently-failing test fails for exactly that reason.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render2d } from "../src/renderer/svg.ts";
import { validateCity } from "../src/types.ts";
import type { CityModel } from "../src/types.ts";

function buildingAt(id: string, x: number, y: number): CityModel["buildings"][number] {
  return { id, x, y, width: 20, depth: 20, height: 4, style: "typescript", metrics: { loc: 10, complexity: 1, churn: 0 } };
}

/** A tiny valid city whose roads span a spread of weights (1..4), for tier-rendering tests. */
function weightedRoadsCity(): CityModel {
  const city: CityModel = {
    districts: [{ id: "d-1", name: "d1", x: 0, y: 0, width: 200, depth: 200, style: "typescript" }],
    buildings: [
      buildingAt("b-1", 10, 10),
      buildingAt("b-2", 60, 10),
      buildingAt("b-3", 110, 10),
      buildingAt("b-4", 160, 10),
      buildingAt("b-5", 10, 60),
    ],
    roads: [
      { from: "b-1", to: "b-2", weight: 1 },
      { from: "b-2", to: "b-3", weight: 2 },
      { from: "b-3", to: "b-4", weight: 3 },
      { from: "b-4", to: "b-5", weight: 4 },
    ],
    landmarks: [],
  };
  const check = validateCity(city);
  if (!check.ok) throw new Error(`weightedRoadsCity fixture is invalid: ${check.errors.join("; ")}`);
  return city;
}

const MOCK_CITY_PATH = fileURLToPath(new URL("../fixtures/mock-city.json", import.meta.url));

function loadMockCity(): CityModel {
  const city = JSON.parse(readFileSync(MOCK_CITY_PATH, "utf-8")) as CityModel;
  const check = validateCity(city);
  if (!check.ok) {
    throw new Error(`fixtures/mock-city.json is not a valid CityModel: ${check.errors.join("; ")}`);
  }
  return city;
}

function parseAttrs(tag: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const attrRe = /([\w-]+)="([^"]*)"/g;
  let m: RegExpExecArray | null;
  while ((m = attrRe.exec(tag)) !== null) {
    attrs[m[1]] = m[2];
  }
  return attrs;
}

describe("render2d (RED — render2d not implemented yet)", () => {
  it("returns an <svg> string with a viewBox", () => {
    const city = loadMockCity();
    const svg = render2d(city);
    expect(svg).toMatch(/<svg[^>]*viewBox="[^"]+"/);
  });

  it('renders one <g class="district"> per district', () => {
    const city = loadMockCity();
    const svg = render2d(city);
    const matches = svg.match(/<g class="district"[^>]*>/g) ?? [];
    expect(matches.length).toBe(city.districts.length);
  });

  it('renders one <rect class="building"> per building', () => {
    const city = loadMockCity();
    const svg = render2d(city);
    const matches = svg.match(/<rect class="building"[^>]*\/?>/g) ?? [];
    expect(matches.length).toBe(city.buildings.length);
  });

  it("orders rendered building rect areas consistently with model footprint areas", () => {
    const city = loadMockCity();
    const svg = render2d(city);

    const expectedOrder = [...city.buildings].sort((a, b) => a.width * a.depth - b.width * b.depth).map((b) => b.id);

    const tags = svg.match(/<rect class="building"[^>]*\/?>/g) ?? [];
    const rendered = tags.map((tag) => {
      const attrs = parseAttrs(tag);
      return {
        id: attrs["data-id"],
        area: Number(attrs.width) * Number(attrs.height),
      };
    });

    expect(rendered.length).toBe(city.buildings.length);
    for (const r of rendered) {
      expect(r.id).toBeTruthy();
      expect(Number.isFinite(r.area)).toBe(true);
    }

    const renderedOrder = [...rendered].sort((a, b) => a.area - b.area).map((r) => r.id);
    expect(renderedOrder).toEqual(expectedOrder);
  });
});

describe("render2d road tiering (docs/PROJECT_IDEA.md 5.5 — static-only, mirrors roads.ts)", () => {
  function parseRoadTags(svg: string): Record<string, string>[] {
    const tags = svg.match(/<line class="road"[^>]*\/?>/g) ?? [];
    return tags.map((tag) => {
      const attrs: Record<string, string> = {};
      const attrRe = /([\w-]+)="([^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = attrRe.exec(tag)) !== null) attrs[m[1]] = m[2];
      return attrs;
    });
  }

  it("renders one <line class=\"road\"> per road, carrying from/to ids", () => {
    const city = weightedRoadsCity();
    const svg = render2d(city);
    const roads = parseRoadTags(svg);
    expect(roads.length).toBe(city.roads.length);
    for (const road of roads) {
      expect(road["data-from"]).toBeTruthy();
      expect(road["data-to"]).toBeTruthy();
    }
  });

  it("gives roads of different weight visibly different stroke-width and stroke-opacity", () => {
    const svg = render2d(weightedRoadsCity());
    const roads = parseRoadTags(svg);
    const widths = new Set(roads.map((r) => r["stroke-width"]));
    const opacities = new Set(roads.map((r) => r["stroke-opacity"]));
    // Four distinct weights (1,2,3,4) over a small spread must land in four distinct tiers, not
    // collapse into one line weight -- that's the whole point of quantile-based tiering.
    expect(widths.size).toBe(4);
    expect(opacities.size).toBe(4);
  });

  it("orders stroke-width consistently with the road's underlying weight", () => {
    const city = weightedRoadsCity();
    const svg = render2d(city);
    const roads = parseRoadTags(svg);
    const byPair = new Map(roads.map((r) => [`${r["data-from"]}->${r["data-to"]}`, Number(r["stroke-width"])]));
    const w1 = byPair.get("b-1->b-2")!; // weight 1
    const w2 = byPair.get("b-2->b-3")!; // weight 2
    const w3 = byPair.get("b-3->b-4")!; // weight 3
    const w4 = byPair.get("b-4->b-5")!; // weight 4
    expect(w1).toBeLessThan(w2);
    expect(w2).toBeLessThan(w3);
    expect(w3).toBeLessThan(w4);
  });

  it("treats a road with no weight field the same as weight 1 (unweighted, never zero traffic)", () => {
    const city = weightedRoadsCity();
    // Drop the weight from the lightest road entirely -- it must render identically to weight: 1.
    const withUndefined: CityModel = {
      ...city,
      roads: city.roads.map((r) => (r.from === "b-1" ? { from: r.from, to: r.to } : r)),
    };
    const withExplicitOne = city;
    const a = render2d(withUndefined);
    const b = render2d(withExplicitOne);
    expect(a).toBe(b);
  });

  it("falls back to a single tier (no fabricated spread) when every road has the same weight", () => {
    const city = weightedRoadsCity();
    const uniform: CityModel = { ...city, roads: city.roads.map((r) => ({ from: r.from, to: r.to, weight: 5 })) };
    const svg = render2d(uniform);
    const roads = parseRoadTags(svg);
    const widths = new Set(roads.map((r) => r["stroke-width"]));
    const tiers = new Set(roads.map((r) => r["data-tier"]));
    expect(widths.size).toBe(1);
    expect(tiers).toEqual(new Set(["footpath"]));
  });

  it("produces byte-identical SVG output across repeat renders (determinism)", () => {
    const city = weightedRoadsCity();
    const first = render2d(city);
    const second = render2d(city);
    const third = render2d(loadMockCity()); // different city, just re-confirming no shared mutable state
    expect(first).toBe(second);
    expect(render2d(city)).toBe(first);
    expect(third).toBe(render2d(loadMockCity()));
  });
});
