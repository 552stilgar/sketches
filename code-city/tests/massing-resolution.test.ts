import { describe, expect, it } from "vitest";
import { resolveMassingScale } from "../src/massing-resolution.ts";
import { normalizedHeightScale } from "../src/renderer/massing.ts";
import type { Building, CityModel } from "../src/types.ts";

// Precedence gate for the viewer's massing knob: an explicit ?heightScale= override must always
// win over the normalizedHeightScale() solve, and the caller must always be able to tell which
// path produced the number (showSourceBadge in main.ts relies on the `source` field to disclose
// this rather than leaving a viewer to guess).

function mkBuilding(id: string, width: number, depth: number, height: number): Building {
  return {
    id,
    x: 0,
    y: 0,
    width,
    depth,
    height,
    style: "test-style",
    metrics: { loc: 0, complexity: 0, churn: 0 },
  };
}

function mkCity(buildings: Building[]): CityModel {
  return { districts: [], buildings, roads: [], landmarks: [], identityLinks: [] };
}

describe("resolveMassingScale — explicit override vs normalized default", () => {
  const buildings = [
    mkBuilding("a", 10, 10, 10),
    mkBuilding("b", 10, 10, 20),
    mkBuilding("c", 10, 10, 30),
    mkBuilding("d", 10, 10, 40),
    mkBuilding("e", 10, 10, 50),
  ];
  const city = mkCity(buildings);

  it("an explicit override wins, unchanged, and is labeled 'explicit'", () => {
    const result = resolveMassingScale(city, 1.25);
    expect(result).toEqual({ scale: 1.25, source: "explicit" });
  });

  it("with no override, resolves to normalizedHeightScale()'s scale and is labeled 'normalized'", () => {
    const expected = normalizedHeightScale(buildings);
    const result = resolveMassingScale(city, undefined);
    expect(result.source).toBe("normalized");
    expect(result.scale).toBe(expected.scale);
  });

  it("an override of a value normalization would also have produced is still labeled 'explicit'", () => {
    // Same numeric scale reachable via either path -- the label must reflect WHICH path ran, not
    // just what number came out, since a viewer reading the badge needs to know whether a number
    // was chosen or computed.
    const normalized = normalizedHeightScale(buildings);
    const result = resolveMassingScale(city, normalized.scale);
    expect(result).toEqual({ scale: normalized.scale, source: "explicit" });
  });
});
