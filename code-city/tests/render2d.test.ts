// RED (behavior 4) — render2d throws NotImplemented. Every test below calls render2d as its
// first real step, so every currently-failing test fails for exactly that reason.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { FLOW_PROVENANCE_LABEL } from "../src/renderer/flow.ts";
import { render2d } from "../src/renderer/svg.ts";
import { validateCity } from "../src/types.ts";
import type { CityModel } from "../src/types.ts";

const MOCK_CITY_V4_PATH = fileURLToPath(new URL("../fixtures/mock-city-v4.json", import.meta.url));

function loadMockCityV4(): CityModel {
  const city = JSON.parse(readFileSync(MOCK_CITY_V4_PATH, "utf-8")) as CityModel;
  const check = validateCity(city);
  if (!check.ok) {
    throw new Error(`fixtures/mock-city-v4.json is not a valid CityModel: ${check.errors.join("; ")}`);
  }
  return city;
}

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
    identityLinks: [],
    ruins: [],
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

describe("render2d structural road flow", () => {
  function parseRoadFlow(svg: string): Array<{
    road: Record<string, string>;
    animation: Record<string, string>;
  }> {
    const elements = svg.match(/<line class="road"[^>]*>[\s\S]*?<\/line>/g) ?? [];
    return elements.map((element) => {
      const roadTag = element.match(/^<line[^>]*>/)?.[0] ?? "";
      const animationTag = element.match(/<animate[^>]*\/>/)?.[0] ?? "";
      return { road: parseAttrs(roadTag), animation: parseAttrs(animationTag) };
    });
  }

  it("emits deterministic declarative animation markup", () => {
    const city = weightedRoadsCity();
    const first = render2d(city);
    const second = render2d(city);
    const firstFlow = parseRoadFlow(first);
    const secondFlow = parseRoadFlow(second);

    expect(firstFlow).toEqual(secondFlow);
    expect(firstFlow).toHaveLength(city.roads.length);
    for (const { animation } of firstFlow) {
      expect(animation.attributeName).toBe("stroke-dashoffset");
      expect(animation.from).toBe("0");
      expect(Number(animation.to)).toBeGreaterThan(0);
      expect(animation.dur).toMatch(/^[0-9.]+s$/);
      expect(animation.repeatCount).toBe("indefinite");
    }
  });

  it("gives a heavier road a denser dash pattern and shorter cycle", () => {
    const flows = parseRoadFlow(render2d(weightedRoadsCity()));
    const byPair = new Map(flows.map((flow) => [
      `${flow.road["data-from"]}->${flow.road["data-to"]}`,
      flow,
    ]));
    const light = byPair.get("b-1->b-2")!; // weight 1
    const heavy = byPair.get("b-4->b-5")!; // weight 4
    const dashPeriod = (flow: typeof light): number => flow.road["stroke-dasharray"]
      .split(" ")
      .map(Number)
      .reduce((sum, part) => sum + part, 0);
    const duration = (flow: typeof light): number => Number.parseFloat(flow.animation.dur);

    expect(dashPeriod(heavy)).toBeLessThan(dashPeriod(light));
    expect(duration(heavy)).toBeLessThan(duration(light));
    expect(Number(heavy.animation.to)).toBe(dashPeriod(heavy));
    expect(Number(light.animation.to)).toBe(dashPeriod(light));
  });

  it("labels the flow as structurally derived", () => {
    expect(render2d(weightedRoadsCity())).toContain(FLOW_PROVENANCE_LABEL.structural);
  });
});

describe("render2d V4 — landmarks + clone identity (CONTRACTS.md § V4)", () => {
  function parseTags(svg: string, pattern: RegExp): Record<string, string>[] {
    const tags = svg.match(pattern) ?? [];
    return tags.map((tag) => {
      const attrs: Record<string, string> = {};
      const attrRe = /([\w-]+)="([^"]*)"/g;
      let m: RegExpExecArray | null;
      while ((m = attrRe.exec(tag)) !== null) attrs[m[1]] = m[2];
      return attrs;
    });
  }

  it('renders one <circle class="landmark"> per datastore landmark, carrying id/kind/label', () => {
    const city = loadMockCityV4();
    const svg = render2d(city);
    const circles = parseTags(svg, /<circle class="landmark"[^>]*\/?>/g);
    expect(circles.length).toBe(city.landmarks.length);
    for (const landmark of city.landmarks) {
      const rendered = circles.find((c) => c["data-id"] === landmark.id);
      expect(rendered, `no <circle class="landmark"> for ${landmark.id}`).toBeDefined();
      expect(rendered!["data-kind"]).toBe("datastore");
      expect(rendered!["data-label"]).toBe(landmark.label);
      expect(Number(rendered!.cx)).toBe(landmark.x);
      expect(Number(rendered!.cy)).toBe(landmark.y);
      expect(Number.isFinite(Number(rendered!.r))).toBe(true);
    }
  });

  it("a <circle class=\"landmark\"> is never a <rect class=\"building\"> — distinct tag, not just a distinct class", () => {
    const svg = render2d(loadMockCityV4());
    expect(svg).toMatch(/<circle class="landmark"/);
    // No building rect ever carries a landmark's id.
    const buildingIds = new Set(loadMockCityV4().buildings.map((b) => b.id));
    const landmarkIds = loadMockCityV4().landmarks.map((l) => l.id);
    for (const id of landmarkIds) expect(buildingIds.has(id)).toBe(false);
  });

  it("gives a bigger datastore (higher weight) a bigger radius than a smaller one", () => {
    const svg = render2d(loadMockCityV4());
    const circles = parseTags(svg, /<circle class="landmark"[^>]*\/?>/g);
    const small = circles.find((c) => c["data-id"] === "landmark:auth-db")!; // weight 4
    const big = circles.find((c) => c["data-id"] === "landmark:payments-db")!; // weight 9
    expect(Number(big.r)).toBeGreaterThan(Number(small.r));
  });

  it('renders one <line class="tether"> per resolvable adjacent pair in an identityLink\'s members', () => {
    const city = loadMockCityV4();
    const svg = render2d(city);
    const tethers = parseTags(svg, /<line class="tether"[^>]*\/?>/g);
    // fixture: one 3-member group (2 adjacent pairs) + one 2-member group (1 pair) = 3 tethers.
    expect(tethers.length).toBe(3);
    for (const link of city.identityLinks) {
      const forLink = tethers.filter((t) => t["data-hash"] === link.hash);
      expect(forLink.length).toBe(link.members.length - 1);
    }
  });

  it("a tether carries NEITHER stroke-dasharray NOR a child <animate> — the structural not-a-road signal", () => {
    const svg = render2d(loadMockCityV4());
    const tetherElements = svg.match(/<line class="tether"[^>]*\/>/g) ?? [];
    expect(tetherElements.length).toBeGreaterThan(0);
    for (const el of tetherElements) {
      expect(el).not.toMatch(/stroke-dasharray/);
      expect(el).not.toMatch(/<animate/);
    }
    // And no <animate> immediately follows a tether line the way it does for every road.
    expect(svg).not.toMatch(/<line class="tether"[^>]*>\s*<animate/);
  });

  it('renders one <circle class="tether-node"> per distinct resolvable member, tagged with the link hash', () => {
    const city = loadMockCityV4();
    const svg = render2d(city);
    const nodes = parseTags(svg, /<circle class="tether-node"[^>]*\/?>/g);
    for (const link of city.identityLinks) {
      const forLink = nodes.filter((n) => n["data-hash"] === link.hash);
      expect(forLink.length).toBe(link.members.length);
      const ids = new Set(forLink.map((n) => n["data-id"]));
      expect(ids).toEqual(new Set(link.members));
    }
  });

  it("omits identityLinks entirely on a pre-V4 city.json without throwing (legal-absent key)", () => {
    const preV4 = loadMockCityV4();
    // @ts-expect-error -- simulating a pre-V4 city.json that lacks the key entirely.
    delete preV4.identityLinks;
    expect(() => render2d(preV4)).not.toThrow();
    expect(render2d(preV4)).not.toMatch(/<line class="tether"/);
  });

  it("produces byte-identical SVG output across repeat renders of a V4 city (determinism)", () => {
    const city = loadMockCityV4();
    const first = render2d(city);
    const second = render2d(city);
    expect(first).toBe(second);
  });
});
