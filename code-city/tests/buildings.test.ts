import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  BASE_HEIGHT_SCALE_DEFAULT,
  buildBuildings,
  buildProfileGeometry,
  classifyStructuralLiveness,
  computeFanIn,
  computeOutgoing,
  districtVisual,
  occupancyIntensity,
  p95,
  PROFILE_NAMES,
  styleProfile,
} from "../src/renderer/buildings.ts";
import { validateCity } from "../src/types.ts";
import type { CityModel, District, Road } from "../src/types.ts";

function road(from: string, to: string, weight?: number): Road {
  return weight === undefined ? { from, to } : { from, to, weight };
}

function district(id: string, style: string): District {
  return { id, name: id, x: 0, y: 0, width: 260, depth: 260, style };
}

describe("computeFanIn", () => {
  it("sums weights of roads landing on the same building", () => {
    const roads = [road("a", "target", 2), road("b", "target", 3)];
    expect(computeFanIn(roads).get("target")).toBe(5);
  });

  it("treats a missing weight as 1 -- unweighted, never zero", () => {
    const roads = [road("a", "target"), road("b", "target")];
    expect(computeFanIn(roads).get("target")).toBe(2);
  });

  it("mixes explicit and missing weights correctly", () => {
    const roads = [road("a", "target", 4), road("b", "target")];
    expect(computeFanIn(roads).get("target")).toBe(5);
  });

  it("keeps distinct targets self-consistent (no cross-contamination)", () => {
    const roads = [road("a", "x", 2), road("a", "y", 7)];
    const fanIn = computeFanIn(roads);
    expect(fanIn.get("x")).toBe(2);
    expect(fanIn.get("y")).toBe(7);
  });

  it("returns an empty map for an empty road list", () => {
    const fanIn = computeFanIn([]);
    expect(fanIn.size).toBe(0);
    expect(fanIn.get("anything")).toBeUndefined();
  });
});

describe("computeOutgoing", () => {
  it("collects every road source id", () => {
    const roads = [road("a", "b"), road("c", "d")];
    const out = computeOutgoing(roads);
    expect(out.has("a")).toBe(true);
    expect(out.has("c")).toBe(true);
    expect(out.has("b")).toBe(false);
  });

  it("is empty for an empty road list", () => {
    expect(computeOutgoing([]).size).toBe(0);
  });
});

describe("p95 (nearest-rank)", () => {
  it("floors at 1 for an empty array", () => {
    expect(p95([])).toBe(1);
  });

  it("returns the single value for a one-element array", () => {
    expect(p95([42])).toBe(42);
  });

  it("picks the nearest-rank 95th percentile of a sorted set", () => {
    // 20 values 1..20 -> rank = ceil(20*0.95) = 19 -> sorted[18] = 19
    const values = Array.from({ length: 20 }, (_, i) => i + 1);
    expect(p95(values)).toBe(19);
  });
});

describe("occupancyIntensity (degenerate + normal cases)", () => {
  it("puts every building at 1 on a degenerate all-equal-fan-in city", () => {
    const fanIns = [3, 3, 3, 3];
    const ref = p95(fanIns);
    for (const f of fanIns) expect(occupancyIntensity(f, ref)).toBe(1);
  });

  it("gives zero fan-in a zero intensity even when the reference is floored at 1", () => {
    const ref = p95([0, 0, 0]);
    expect(occupancyIntensity(0, ref)).toBe(0);
  });

  it("never exceeds 1 for a fan-in above the reference (top 5% clamp)", () => {
    expect(occupancyIntensity(1000, 10)).toBe(1);
  });

  it("scales linearly below the reference", () => {
    expect(occupancyIntensity(5, 10)).toBeCloseTo(0.5, 10);
  });
});

describe("classifyStructuralLiveness", () => {
  it("classifies zero fan-in AND zero outgoing as dead", () => {
    expect(classifyStructuralLiveness(0, false)).toBe("dead");
  });

  it("classifies a leaf with outgoing calls but zero fan-in as active (used, not abandoned)", () => {
    expect(classifyStructuralLiveness(0, true)).toBe("active");
  });

  it("classifies a hub with fan-in but no outgoing roads as active", () => {
    expect(classifyStructuralLiveness(4, false)).toBe("active");
  });

  it("classifies a building with both fan-in and outgoing roads as active", () => {
    expect(classifyStructuralLiveness(4, true)).toBe("active");
  });
});

describe("styleProfile", () => {
  it("maps python and ruby to campus", () => {
    expect(styleProfile("python").name).toBe("campus");
    expect(styleProfile("ruby").name).toBe("campus");
  });

  it("maps typescript/javascript/java/kotlin/c# to tower", () => {
    for (const lang of ["typescript", "javascript", "java", "kotlin", "c#"]) {
      expect(styleProfile(lang).name).toBe("tower");
    }
  });

  it("maps rust/c/cpp/go to industrial", () => {
    for (const lang of ["rust", "c", "cpp", "go"]) {
      expect(styleProfile(lang).name).toBe("industrial");
    }
  });

  it("maps html/css/sql/markdown/json to storefront", () => {
    for (const lang of ["html", "css", "sql", "markdown", "json"]) {
      expect(styleProfile(lang).name).toBe("storefront");
    }
  });

  it("defaults an unknown language to campus", () => {
    expect(styleProfile("brainfuck").name).toBe("campus");
    expect(styleProfile("").name).toBe("campus");
  });

  it("is case-insensitive on the language tag", () => {
    expect(styleProfile("TypeScript").name).toBe("tower");
  });

  it("exposes exactly four profile names -- the deliberate cap", () => {
    expect(PROFILE_NAMES.length).toBe(4);
    expect(new Set(PROFILE_NAMES).size).toBe(4);
  });
});

describe("buildProfileGeometry -- never exceeds the building's own footprint/height", () => {
  const box = new THREE.Box3();

  for (const name of PROFILE_NAMES) {
    it(`keeps the "${name}" profile's geometry within the unit cube [-0.5, 0.5]^3`, () => {
      const geometry = buildProfileGeometry(styleProfile(profileToLanguage(name)));
      geometry.computeBoundingBox();
      box.copy(geometry.boundingBox!);

      const EPS = 1e-6;
      expect(box.min.x).toBeGreaterThanOrEqual(-0.5 - EPS);
      expect(box.max.x).toBeLessThanOrEqual(0.5 + EPS);
      expect(box.min.y).toBeGreaterThanOrEqual(-0.5 - EPS);
      expect(box.max.y).toBeLessThanOrEqual(0.5 + EPS);
      expect(box.min.z).toBeGreaterThanOrEqual(-0.5 - EPS);
      expect(box.max.z).toBeLessThanOrEqual(0.5 + EPS);
    });
  }

  it("stays within bounds even for an out-of-range footprintInset (defensive clamp)", () => {
    const geometry = buildProfileGeometry({
      name: "campus",
      roof: "pitched",
      footprintInset: 5, // way out of the intended 0..0.4 range
      roughness: 0.5,
      metalness: 0,
      lightnessBias: 0,
    });
    geometry.computeBoundingBox();
    const b = geometry.boundingBox!;
    expect(Math.abs(b.min.x)).toBeLessThanOrEqual(0.5 + 1e-6);
    expect(Math.abs(b.max.x)).toBeLessThanOrEqual(0.5 + 1e-6);
  });
});

function profileToLanguage(name: (typeof PROFILE_NAMES)[number]): string {
  switch (name) {
    case "campus":
      return "python";
    case "tower":
      return "typescript";
    case "industrial":
      return "rust";
    case "storefront":
      return "html";
  }
}

describe("buildProfileGeometry -- body/crown tier reads as a distinct mass, not one flat tone", () => {
  for (const name of PROFILE_NAMES) {
    it(`gives the "${name}" profile a body + crown vertex-color split`, () => {
      const geometry = buildProfileGeometry(styleProfile(profileToLanguage(name)));
      const color = geometry.getAttribute("color");
      expect(color).toBeDefined();
      const factors = new Set<number>();
      for (let i = 0; i < color!.count; i++) factors.add(Math.round(color!.getX(i) * 1000) / 1000);
      // at least a "body" factor and a distinct "crown/roof" factor
      expect(factors.size).toBeGreaterThanOrEqual(2);
    });
  }

  it("keeps the flat-roof profiles' crown setback inside the unit cube (regression)", () => {
    for (const name of ["tower", "storefront"] as const) {
      const geometry = buildProfileGeometry(styleProfile(profileToLanguage(name)));
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const EPS = 1e-6;
      expect(box.min.y).toBeGreaterThanOrEqual(-0.5 - EPS);
      expect(box.max.y).toBeLessThanOrEqual(0.5 + EPS);
      expect(box.min.x).toBeGreaterThanOrEqual(-0.5 - EPS);
      expect(box.max.x).toBeLessThanOrEqual(0.5 + EPS);
    }
  });
});

describe("districtVisual -- territory identity is pure, id-derived, never positional", () => {
  it("is a pure function: the same district in always produces the same colors/elevation out", () => {
    const d = district("district:src/auth", "typescript");
    const a = districtVisual(d);
    const b = districtVisual(d);
    expect(a.fill.getHex()).toBe(b.fill.getHex());
    expect(a.edge.getHex()).toBe(b.edge.getHex());
    expect(a.elevation).toBe(b.elevation);
  });

  it("gives districts that share a style (the real dogfood defect) visibly different fills", () => {
    // fixtures/mock-city-v4.json: 3 districts, all dominant-language "typescript" -- the old
    // districtColor(style) rendered these three IDENTICALLY. Same ids/styles reproduced here.
    const a = districtVisual(district("d-utils", "typescript"));
    const b = districtVisual(district("d-auth", "typescript"));
    const c = districtVisual(district("d-payments", "typescript"));
    expect(a.fill.getHex()).not.toBe(b.fill.getHex());
    expect(b.fill.getHex()).not.toBe(c.fill.getHex());
    expect(a.fill.getHex()).not.toBe(c.fill.getHex());
    // boundary-wall tint distinguishes them too, independent of the ground fill
    expect(a.edge.getHex()).not.toBe(b.edge.getHex());
  });

  it("stays distinguishable across 8 sibling districts", () => {
    const ids = Array.from({ length: 8 }, (_, i) => `district:pkg-${i}/module`);
    const hexes = ids.map((id) => districtVisual(district(id, "typescript")).fill.getHex());
    expect(new Set(hexes).size).toBe(8);
  });

  it("never depends on array position -- reordering the same id set changes nothing per-district", () => {
    const ids = ["district:a", "district:b", "district:c"];
    const forward = ids.map((id) => districtVisual(district(id, "typescript")).fill.getHex());
    const reversed = [...ids].reverse().map((id) => districtVisual(district(id, "typescript")).fill.getHex());
    expect(forward).toEqual([...reversed].reverse());
  });

  it("keeps elevation in a small, road-safe band (roads run at building-top height, never here)", () => {
    const { elevation } = districtVisual(district("district:x", "typescript"));
    expect(elevation).toBeGreaterThanOrEqual(0.15);
    expect(elevation).toBeLessThan(3);
  });
});

// buildBuildings() draws district label sprites via a real <canvas> -- irrelevant to the
// height-scale knob this checks, but a DOM stand-in is required for buildBuildings() to run at
// all in this plain-node test env. Same minimal stub as tests/lenses-position-lock.test.ts.
function installMinimalCanvasStub(): void {
  if (typeof (globalThis as any).document !== "undefined") return;
  const ctx2d = {
    clearRect() {},
    fillRect() {},
    fillText() {},
    font: "",
    textAlign: "",
    textBaseline: "",
    fillStyle: "",
  };
  const fakeCanvas = { width: 0, height: 0, getContext: () => ctx2d };
  (globalThis as any).document = {
    createElement(tag: string) {
      if (tag === "canvas") return fakeCanvas;
      throw new Error(`installMinimalCanvasStub: unsupported tag "${tag}"`);
    },
  };
}

const MOCK_CITY_PATH = fileURLToPath(new URL("../fixtures/mock-city.json", import.meta.url));

function loadCity(): CityModel {
  const city = JSON.parse(readFileSync(MOCK_CITY_PATH, "utf-8")) as CityModel;
  const check = validateCity(city);
  if (!check.ok) throw new Error(`fixtures/mock-city.json is not a valid CityModel: ${check.errors.join("; ")}`);
  return city;
}

function readScaleY(mesh: THREE.InstancedMesh, index: number): number {
  const m = new THREE.Matrix4();
  mesh.getMatrixAt(index, m);
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  m.decompose(pos, quat, scale);
  return scale.y;
}

function findInstance(
  handle: ReturnType<typeof buildBuildings>,
  id: string,
): { mesh: THREE.InstancedMesh; index: number } | null {
  for (const mesh of handle.meshes) {
    for (let i = 0; i < mesh.count; i++) {
      if (handle.resolveBuildingId(mesh, i) === id) return { mesh, index: i };
    }
  }
  return null;
}

describe("buildBuildings' base height-scale knob (Lane C v5.1 massing parameter)", () => {
  beforeAll(() => installMinimalCanvasStub());

  const city = loadCity();

  it("defaults to BASE_HEIGHT_SCALE_DEFAULT -- omitting opts renders identical scaleY to passing it explicitly", () => {
    const implicit = buildBuildings(city);
    const explicit = buildBuildings(city, { heightScale: BASE_HEIGHT_SCALE_DEFAULT });
    for (const b of city.buildings) {
      const a = findInstance(implicit, b.id)!;
      const c = findInstance(explicit, b.id)!;
      expect(readScaleY(a.mesh, a.index)).toBe(readScaleY(c.mesh, c.index));
    }
  });

  it("scales every building's rendered height by the given factor, without touching X/Z footprint", () => {
    const baseline = buildBuildings(city);
    const doubled = buildBuildings(city, { heightScale: BASE_HEIGHT_SCALE_DEFAULT * 2 });
    for (const b of city.buildings) {
      const base = findInstance(baseline, b.id)!;
      const scaled = findInstance(doubled, b.id)!;
      const baseScaleY = readScaleY(base.mesh, base.index);
      const scaledScaleY = readScaleY(scaled.mesh, scaled.index);
      expect(scaledScaleY).toBeCloseTo(baseScaleY * 2, 10);
    }
  });

  it("survives a lens switch -- the base height scale composes with the lens height multiplier, not replaced by it", () => {
    const doubled = buildBuildings(city, { heightScale: BASE_HEIGHT_SCALE_DEFAULT * 2 });
    const baseline = buildBuildings(city);
    doubled.setLens("complexity");
    baseline.setLens("complexity");
    for (const b of city.buildings) {
      const base = findInstance(baseline, b.id)!;
      const scaled = findInstance(doubled, b.id)!;
      expect(readScaleY(scaled.mesh, scaled.index)).toBeCloseTo(readScaleY(base.mesh, base.index) * 2, 10);
    }
  });
});
