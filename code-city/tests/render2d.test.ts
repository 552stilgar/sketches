// RED (behavior 4) — render2d throws NotImplemented. Every test below calls render2d as its
// first real step, so every currently-failing test fails for exactly that reason.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { render2d } from "../src/renderer/svg.ts";
import { validateCity } from "../src/types.ts";
import type { CityModel } from "../src/types.ts";

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
