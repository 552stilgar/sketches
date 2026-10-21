// L5 / H3 (code-city 2026-09-01 audit): the `derived` exponent solver must (1) count zero-file
// districts at their effective weight 1 -- squarify floors them to 1 regardless -- and (2) disclose
// `clamped` instead of discarding it: in city.json under layout.districtWeight, on stderr from
// bin/compile.ts, and from normalizedHeightScale through the SAME shared disclosure shape.
// log/linear output stays pinned to tests/fixtures/district-weight-log-linear.json (see
// tests/compiler-district-weight.test.ts).

import { describe, it, expect } from "vitest";
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { compileCity } from "../src/compiler/index.ts";
import {
  deriveDistrictWeightExponent,
  districtWeights,
  formatClampDisclosure,
  MIN_DISTRICT_SHARE_DEFAULT,
} from "../src/compiler/layout.ts";
import { normalizedHeightScale } from "../src/renderer/massing.ts";
import type { Building, RepoGraph, RepoNode, RuinRecord } from "../src/types.ts";

function node(id: string, loc = 20): RepoNode {
  return {
    id,
    type: "file",
    language: "typescript",
    name: id.split("/").pop() as string,
    path: id,
    loc,
    complexity: 1,
    churn: 0,
    age: 30,
    contributors: ["dev@example.com"],
    imports: [],
    calls: [],
    contains: [],
  };
}

function graphOf(counts: Record<string, number>, extra: Partial<RepoGraph> = {}): RepoGraph {
  const nodes: RepoNode[] = [];
  for (const [dir, count] of Object.entries(counts)) {
    for (let i = 0; i < count; i++) nodes.push(node(`${dir}/f${i}.ts`));
  }
  return {
    nodes,
    repoPath: "/fixtures/derived-solver",
    headSha: "0000000000000000000000000000000000solv",
    headDate: "2026-06-01T12:00:00.000Z",
    ...extra,
  };
}

const MGMT = { modules: 1103, test: 36, src: 23, bin: 4, lib: 1, scripts: 1 };

// 126 one-file districts: every curve gives each 1/126 = 0.007937 < the 0.008 floor, so the solver
// cannot clear it and must report clamped (the H3 repro).
function manyEqualDistricts(n = 126): RepoGraph {
  const counts: Record<string, number> = {};
  for (let i = 0; i < n; i++) counts[`d${String(i).padStart(3, "0")}`] = 1;
  return graphOf(counts);
}

describe("deriveDistrictWeightExponent() counts zero-file districts", () => {
  it("a zero count is accepted and equals an explicit count of 1 (squarify's effective weight)", () => {
    const withZero = deriveDistrictWeightExponent([1103, 36, 23, 0]);
    const withOne = deriveDistrictWeightExponent([1103, 36, 23, 1]);
    expect(withZero).toEqual(withOne);
  });

  it("including a zero-file district changes the derived exponent versus excluding it", () => {
    const excluded = deriveDistrictWeightExponent([1103, 36, 23]); // smallest 23 -> linear clears the floor
    const included = deriveDistrictWeightExponent([1103, 36, 23, 0]);
    expect(excluded.exponent).toBe(1);
    expect(included.exponent).toBeLessThan(1);
    expect(included.minResultingShare).toBeGreaterThanOrEqual(MIN_DISTRICT_SHARE_DEFAULT - 1e-9);
  });

  it("districtWeights() feeds the zero-file district into the search (other districts compress harder)", () => {
    const without = districtWeights([1103, 36, 23], "derived");
    const withZero = districtWeights([1103, 36, 23, 0], "derived");
    expect(without[0]).toBe(1103); // exponent 1
    expect(withZero[0]).toBeLessThan(1103);
    expect(withZero[3]).toBe(0); // returned weight stays 0**p; squarify floors it to 1
  });

  it("still throws on negative and non-finite counts", () => {
    expect(() => deriveDistrictWeightExponent([10, -5])).toThrow();
    expect(() => deriveDistrictWeightExponent([10, Number.NaN])).toThrow();
  });

  it("through compileCity: a ruins-only (zero-file) district shifts the derived exponent", () => {
    const ruin: RuinRecord = {
      path: "gone/deleted.ts",
      language: "typescript",
      deletedSha: "1111111111111111111111111111111111dead",
      deletedDate: "2026-05-15T00:00:00.000Z",
    };
    const base = compileCity(graphOf(MGMT), { districtWeightMode: "derived" });
    const withGone = compileCity(graphOf(MGMT, { ruins: [ruin] }), { districtWeightMode: "derived" });
    const a = base.layout?.districtWeight?.exponent;
    const b = withGone.layout?.districtWeight?.exponent;
    expect(typeof a).toBe("number");
    expect(typeof b).toBe("number");
    expect(b as number).toBeLessThan(a as number);
  });
});

describe("city.json discloses the district-weight solve", () => {
  it("derived mode carries layout.districtWeight { mode, exponent, clamped, minResultingShare }", () => {
    const city = compileCity(graphOf(MGMT), { districtWeightMode: "derived" });
    const dw = city.layout?.districtWeight;
    expect(dw).toBeDefined();
    expect(dw?.mode).toBe("derived");
    expect(typeof dw?.exponent).toBe("number");
    expect(typeof dw?.clamped).toBe("boolean");
    expect(dw?.clamped).toBe(false);
    expect(typeof dw?.minResultingShare).toBe("number");
    expect(dw?.minResultingShare as number).toBeGreaterThanOrEqual(MIN_DISTRICT_SHARE_DEFAULT - 1e-9);
    // survives serialization
    const round = JSON.parse(JSON.stringify(city));
    expect(round.layout.districtWeight.mode).toBe("derived");
  });

  it("a clamped solve sets clamped: true", () => {
    const city = compileCity(manyEqualDistricts(), { districtWeightMode: "derived" });
    const dw = city.layout?.districtWeight;
    expect(dw?.mode).toBe("derived");
    expect(dw?.clamped).toBe(true);
    expect(dw?.minResultingShare as number).toBeLessThan(MIN_DISTRICT_SHARE_DEFAULT);
  });

  it("other modes name their mode and report clamped: false", () => {
    for (const mode of ["log", "linear", "sqrt"] as const) {
      const dw = compileCity(graphOf(MGMT), { districtWeightMode: mode }).layout?.districtWeight;
      expect(dw?.mode).toBe(mode);
      expect(dw?.clamped).toBe(false);
    }
  });
});

describe("shared clamp disclosure (district weight and height scale)", () => {
  const tall = (height: number): Building => ({
    id: "b",
    x: 0,
    y: 0,
    width: 1,
    depth: 1,
    height,
    style: "typescript",
    metrics: {} as Building["metrics"],
  });

  it("normalizedHeightScale's clamped flag reaches a disclosure object", () => {
    const clamped = normalizedHeightScale([tall(1000)]); // ideal scale 0.0037 < 0.25
    expect(clamped.clamped).toBe(true);
    expect(clamped.disclosure).toMatchObject({ kind: "height-scale", clamped: true });
    const line = formatClampDisclosure(clamped.disclosure);
    expect(typeof line).toBe("string");
    expect(line).toContain("height-scale");
    expect(line).toContain("clamped");

    const fine = normalizedHeightScale([tall(3.7)]); // ideal scale 1
    expect(fine.clamped).toBe(false);
    expect(fine.disclosure).toMatchObject({ kind: "height-scale", clamped: false });
    expect(formatClampDisclosure(fine.disclosure)).toBeNull();
  });

  it("the district-weight disclosure uses the same helper and shape", () => {
    const city = compileCity(manyEqualDistricts(), { districtWeightMode: "derived" });
    const dw = city.layout?.districtWeight as unknown as { clamped: boolean };
    const line = formatClampDisclosure({ kind: "district-weight", ...dw });
    expect(line).toContain("district-weight");
    expect(line).toContain("clamped");
    expect(formatClampDisclosure({ kind: "district-weight", clamped: false })).toBeNull();
  });
});

describe("bin/compile.ts surfaces clamping on stderr", () => {
  function runCompile(graph: RepoGraph, extraArgs: string[]) {
    const dir = mkdtempSync(join(tmpdir(), "cc-l5-"));
    try {
      const inPath = join(dir, "repo.json");
      const outPath = join(dir, "city.json");
      writeFileSync(inPath, JSON.stringify(graph));
      const r = spawnSync(
        process.execPath,
        ["--experimental-strip-types", join(__dirname, "..", "bin", "compile.ts"), inPath, outPath, ...extraArgs],
        { encoding: "utf-8" },
      );
      const city = r.status === 0 ? JSON.parse(readFileSync(outPath, "utf-8")) : null;
      return { status: r.status, stderr: r.stderr, stdout: r.stdout, city };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }

  it("emits exactly one clamp line and writes layout.districtWeight when the derived solve is clamped", () => {
    const r = runCompile(manyEqualDistricts(), ["--district-weight=derived"]);
    expect(r.status).toBe(0);
    const lines = r.stderr.split("\n").filter((l) => /clamped/.test(l));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("district-weight");
    expect(r.city.layout.districtWeight.clamped).toBe(true);
    expect(r.stdout).toContain("wrote");
  });

  it("prints no clamp line when the solve is not clamped", () => {
    const r = runCompile(graphOf(MGMT), ["--district-weight=derived"]);
    expect(r.status).toBe(0);
    expect(r.stderr).not.toMatch(/clamped/);
    expect(r.city.layout.districtWeight.clamped).toBe(false);
  });
});

describe("log and linear outputs stay byte-identical to the L4 fixture", () => {
  it("districts, buildings and districtWeights() match tests/fixtures/district-weight-log-linear.json", () => {
    const fixture = JSON.parse(
      readFileSync(join(__dirname, "fixtures", "district-weight-log-linear.json"), "utf-8"),
    ) as Record<"log" | "linear", { weights: number[]; districts: unknown[]; buildings: unknown[] }>;
    const g = graphOf({ big: 90, small: 3 }, {
      repoPath: "/fixtures/skewed-graph",
      headSha: "0000000000000000000000000000000000skew",
    });
    for (const mode of ["log", "linear"] as const) {
      const city = compileCity(structuredClone(g), { districtWeightMode: mode });
      const got = JSON.parse(
        JSON.stringify({ weights: districtWeights([90, 3, 0], mode), districts: city.districts, buildings: city.buildings }),
      );
      expect(got).toEqual(fixture[mode]);
    }
  });
});
