// V5.1 district area-weighting curve (sketches/CAMPAIGN.md district-weighting task, Lane B).
//
// Measured problem: on the merged mgmt trio, `squarify` weights each district by RAW FILE COUNT
// (src/compiler/index.ts), so one oversized repo swamps every other district's visible area.
// `districtWeightMode` (src/compiler/layout.ts districtWeight()) makes the area curve an explicit,
// named CompileCityOptions input instead of a hardcoded linear count -- see that function's doc
// comment for why it must stay caller-chosen rather than auto-detected from how skewed the data is.

import { describe, it, expect } from "vitest";
import { compileCity } from "../src/compiler/index.ts";
import {
  districtWeight,
  districtWeights,
  deriveDistrictWeightExponent,
  DEFAULT_DISTRICT_WEIGHT_MODE,
  MIN_DISTRICT_SHARE_DEFAULT,
  DISTRICT_WEIGHT_EXPONENT_FLOOR,
} from "../src/compiler/layout.ts";
import type { DistrictWeightMode } from "../src/compiler/layout.ts";
import { makeFixedRepoGraph } from "./fixtures/repo-graph-fixture.ts";
import type { RepoGraph, RepoNode } from "../src/types.ts";

function node(id: string, loc: number): RepoNode {
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

// Deliberately skewed: "big" has 90 files, "small" has 3 -- a 30:1 ratio, close to the ~71%-share
// shape measured on the merged mgmt trio, so the compression from sqrt/log is unambiguous.
function makeSkewedRepoGraph(): RepoGraph {
  const nodes: RepoNode[] = [];
  for (let i = 0; i < 90; i++) nodes.push(node(`big/f${i}.ts`, 20));
  for (let i = 0; i < 3; i++) nodes.push(node(`small/f${i}.ts`, 20));
  return {
    nodes,
    repoPath: "/fixtures/skewed-graph",
    headSha: "0000000000000000000000000000000000skew",
    headDate: "2026-06-01T12:00:00.000Z",
  };
}

function districtArea(city: ReturnType<typeof compileCity>, name: string): number {
  const d = city.districts.find((district) => district.name === name);
  if (!d) throw new Error(`no district named ${name}`);
  return d.width * d.depth;
}

describe("districtWeight() pure curve", () => {
  it("linear is the identity function on count", () => {
    expect(districtWeight(0, "linear")).toBe(0);
    expect(districtWeight(1, "linear")).toBe(1);
    expect(districtWeight(90, "linear")).toBe(90);
  });

  it("sqrt and log both compress large counts relative to linear, log more aggressively than sqrt", () => {
    const count = 90;
    const linear = districtWeight(count, "linear");
    const sqrt = districtWeight(count, "sqrt");
    const log = districtWeight(count, "log");
    expect(sqrt).toBeLessThan(linear);
    expect(log).toBeLessThan(sqrt);
  });

  it("log1p keeps a zero-file district finite (never -Infinity)", () => {
    expect(districtWeight(0, "log")).toBe(0);
    expect(Number.isFinite(districtWeight(0, "log"))).toBe(true);
  });

  // Default history: log (2026-08-30) -> derived (2026-08-31) -> log again (2026-09-01, Usul's
  // ruling on the rendered variants; see DEFAULT_DISTRICT_WEIGHT_MODE's doc comment, which keeps
  // BOTH rationales because the engineering argument for `derived` was never refuted — it was
  // overruled on how the result looks). Asserted against the exported constant so a future
  // re-ruling has to change it deliberately rather than silently drifting the omitted-option path.
  it("defaults to DEFAULT_DISTRICT_WEIGHT_MODE, which is log", () => {
    expect(DEFAULT_DISTRICT_WEIGHT_MODE).toBe("log");
  });

  it("throws loudly on 'derived' -- a single count can't be weighted without its siblings", () => {
    expect(() => districtWeight(42, "derived")).toThrow();
  });

  // Companion to the above: with the default back to `log` (a per-count curve), the no-argument
  // call must once again RETURN rather than throw. This pair is what makes the default flip
  // visible here instead of silently changing districtWeight()'s contract -- under the `derived`
  // default this same call was required to throw.
  it("weights a single count with no mode argument, using the log default", () => {
    expect(districtWeight(42)).toBe(districtWeight(42, "log"));
    expect(Number.isFinite(districtWeight(42))).toBe(true);
  });

  it("throws loudly on an unrecognized mode (never silently falls back)", () => {
    expect(() => districtWeight(10, "cube" as unknown as DistrictWeightMode)).toThrow();
  });
});

describe("compileCity({ districtWeightMode }) — V5.1", () => {
  it("(a) omitting the option is identical to naming the default mode explicitly, on both a balanced and a skewed graph", () => {
    for (const g of [makeFixedRepoGraph(), makeSkewedRepoGraph()]) {
      const omitted = JSON.stringify(compileCity(structuredClone(g)));
      const explicitDefault = JSON.stringify(
        compileCity(structuredClone(g), { districtWeightMode: DEFAULT_DISTRICT_WEIGHT_MODE }),
      );
      expect(omitted).toBe(explicitDefault);
    }
  });

  // Every pre-2026-08-31 curve stays reachable byte-for-byte by naming it explicitly -- that's
  // what makes each default change a preference, not a one-way door.
  it("(a2) `log` still reproduces the pre-2026-08-31 default output on a skewed graph", () => {
    const g = makeSkewedRepoGraph();
    const log = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode: "log" }));
    const logAgain = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode: "log" }));
    expect(log).toBe(logAgain);
  });

  // `linear` still reproduces every city compiled before ANY curve existed.
  it("(a2b) `linear` still reproduces the original V4 output", () => {
    const g = makeSkewedRepoGraph();
    const linear = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode: "linear" }));
    const linearAgain = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode: "linear" }));
    expect(linear).toBe(linearAgain);
  });

  // The whole point of "derived": a MILD skew (30:1) that already clears the legibility floor
  // unaided must NOT be distorted just because a curve exists. This is the fix, pinned directly --
  // the old `log` default distorted this fixture unconditionally (see the superseded assertion in
  // git history), which is precisely the "one repo's ruling, wrong on the next" defect this task
  // exists to close.
  // `derived` is NAMED here rather than reached through the omitted-option path. It was written as
  // "the default" on 2026-08-31 when derived held that slot; the 2026-09-01 revert to `log` broke
  // it, correctly — the assertion is about what `derived` does, and coupling it to whichever mode
  // currently happens to be the default made a passing test depend on something it wasn't testing.
  it("(a3) `derived` matches `linear` byte-for-byte on a mild skew that already clears the floor", () => {
    const g = makeSkewedRepoGraph(); // 90:3, smallest share under linear is 3/93 ≈ 3.2% > 0.8% floor
    const derived = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode: "derived" }));
    const linear = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode: "linear" }));
    expect(derived).toBe(linear);
  });

  // The usul-mgmt distribution (the finding that motivated this task) is skewed enough that linear
  // WOULD fail the floor -- derived must actually compress here, unlike the mild-skew case above.
  function makeMgmtLikeRepoGraph(): RepoGraph {
    const counts: Record<string, number> = { modules: 1103, test: 36, src: 23, bin: 4, lib: 1, scripts: 1 };
    const nodes: RepoNode[] = [];
    for (const [dir, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) nodes.push(node(`${dir}/f${i}.ts`, 20));
    }
    return {
      nodes,
      repoPath: "/fixtures/mgmt-like-graph",
      headSha: "0000000000000000000000000000000000mgmt",
      headDate: "2026-06-01T12:00:00.000Z",
    };
  }

  it("(a4) derived (the default) actually compresses on the real usul-mgmt-shaped distribution, unlike linear", () => {
    const g = makeMgmtLikeRepoGraph();
    const derived = JSON.stringify(compileCity(structuredClone(g)));
    const linear = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode: "linear" }));
    expect(derived).not.toBe(linear);

    const derivedCity = compileCity(structuredClone(g));
    const smallestShare = Math.min(...derivedCity.districts.map((d) => (d.width * d.depth) / (1000 * 1000)));
    expect(smallestShare).toBeGreaterThanOrEqual(MIN_DISTRICT_SHARE_DEFAULT - 1e-9);
  });

  it("(b) sqrt and log both compress the largest district's canvas share relative to linear on a skewed fixture", () => {
    const g = makeSkewedRepoGraph();
    const linearCity = compileCity(structuredClone(g), { districtWeightMode: "linear" });
    const sqrtCity = compileCity(structuredClone(g), { districtWeightMode: "sqrt" });
    const logCity = compileCity(structuredClone(g), { districtWeightMode: "log" });

    const totalArea = 1000 * 1000;
    const linearShare = districtArea(linearCity, "big") / totalArea;
    const sqrtShare = districtArea(sqrtCity, "big") / totalArea;
    const logShare = districtArea(logCity, "big") / totalArea;

    // 90 files vs 3 files should swamp the canvas under linear (measured problem).
    expect(linearShare).toBeGreaterThan(0.85);
    // sqrt and log both give "small" more room back, log more than sqrt.
    expect(sqrtShare).toBeLessThan(linearShare);
    expect(logShare).toBeLessThan(sqrtShare);

    // The "small" district's share grows as a mirror of "big" shrinking.
    const linearSmallShare = districtArea(linearCity, "small") / totalArea;
    const sqrtSmallShare = districtArea(sqrtCity, "small") / totalArea;
    const logSmallShare = districtArea(logCity, "small") / totalArea;
    expect(sqrtSmallShare).toBeGreaterThan(linearSmallShare);
    expect(logSmallShare).toBeGreaterThan(sqrtSmallShare);
  });

  it("is still deterministic (byte-identical) under sqrt, log, and derived modes across repeated calls", () => {
    const g = makeSkewedRepoGraph();
    for (const districtWeightMode of ["sqrt", "log", "derived"] as const) {
      const a = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode }));
      const b = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode }));
      expect(a).toBe(b);
    }
  });
});

// V5.1 derived district area-weighting (sketches/CAMPAIGN.md district-weighting task, 2026-08-31).
//
// Usul's ruling (the spec this module implements): stay as honest as possible, distort only as
// much as legibility demands. Choose the LARGEST exponent p (p=1 IS linear, zero distortion) such
// that the SMALLEST district still clears a minimum canvas share -- never solve for the LARGEST
// district's share, which is the rejected alternative (re-derives the `log`-default bug: on
// usul-mgmt's [1103,36,23,4,1,1] split, targeting the dominant district's share the way `log` did
// would inflate five 1-to-4-file districts to ~59% of the canvas between them).
describe("deriveDistrictWeightExponent() -- V5.1 derived weighting", () => {
  it("1. returns exact linear (p=1, zero distortion) whenever linear already clears the floor", () => {
    // 7/7/6 files, makeFixedRepoGraph()'s own shape -- linear's smallest share (6/20=30%) is far
    // above MIN_DISTRICT_SHARE_DEFAULT (0.8%), so no compression should be applied at all.
    const result = deriveDistrictWeightExponent([7, 7, 6]);
    expect(result.exponent).toBe(1);
    expect(result.clamped).toBe(false);
  });

  it("2. monotonicity: the smallest district's resulting share is non-increasing as the exponent grows", () => {
    // Skewed enough that the curve actually matters across the sampled exponents.
    const counts = [1103, 36, 23, 4, 1, 1];
    const shareAt = (p: number): number => {
      const weights = counts.map((c) => Math.pow(c, p));
      const sum = weights.reduce((a, b) => a + b, 0);
      return Math.min(...weights) / sum;
    };
    const exponents = [0.05, 0.15, 0.3, 0.45, 0.6, 0.75, 0.9, 1];
    const shares = exponents.map(shareAt);
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i]).toBeLessThanOrEqual(shares[i - 1] + 1e-12);
    }
  });

  it("3. on the real usul-mgmt distribution, the smallest district clears the floor", () => {
    const counts = [1103, 36, 23, 4, 1, 1];
    const result = deriveDistrictWeightExponent(counts);
    expect(result.clamped).toBe(false);
    expect(result.minResultingShare).toBeGreaterThanOrEqual(MIN_DISTRICT_SHARE_DEFAULT - 1e-9);

    const weights = counts.map((c) => Math.pow(c, result.exponent));
    const sum = weights.reduce((a, b) => a + b, 0);
    const shares = weights.map((w) => w / sum);
    // Reported here per the task brief: exponent + all six resulting shares on the real
    // usul-mgmt distribution [modules 1103, test 36, src 23, bin 4, lib 1, scripts 1].
    expect(shares.every((s) => s > 0 && s < 1)).toBe(true);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
  });

  it("4. never distorts a well-balanced city: near-equal counts land at or near linear", () => {
    // Roughly equal, hundreds each -- a trio-like shape.
    const result = deriveDistrictWeightExponent([420, 390, 405]);
    expect(result.exponent).toBe(1);
    expect(result.clamped).toBe(false);
  });

  it("5. pure + deterministic: same counts -> same exponent, repeatably, no clock/randomness", () => {
    const counts = [1103, 36, 23, 4, 1, 1];
    const a = deriveDistrictWeightExponent(counts);
    const b = deriveDistrictWeightExponent([...counts]);
    expect(a).toEqual(b);
  });

  it("6. clamps to DISTRICT_WEIGHT_EXPONENT_FLOOR and reports clamped:true when the floor can't be cleared", () => {
    // A generous minShare (40%) that even DISTRICT_WEIGHT_EXPONENT_FLOOR's near-parity curve can't
    // reach on a 1e6:1 split (that floor still only gets the smallest share to ~33.4% here -- see
    // the "p=0 gives every district equal weight" ceiling in DISTRICT_WEIGHT_EXPONENT_FLOOR's own
    // doc comment: 50% is the theoretical max for two districts, and the floor doesn't reach it).
    const target = 0.4;
    const result = deriveDistrictWeightExponent([1_000_000, 1], target);
    expect(result.clamped).toBe(true);
    expect(result.exponent).toBe(DISTRICT_WEIGHT_EXPONENT_FLOOR);
    expect(result.minResultingShare).toBeLessThan(target);
  });

  it("7. fails loudly on degenerate input: empty counts, zero/negative count, non-finite minShare", () => {
    expect(() => deriveDistrictWeightExponent([])).toThrow();
    expect(() => deriveDistrictWeightExponent([10, 0, 5])).toThrow();
    expect(() => deriveDistrictWeightExponent([10, -5])).toThrow();
    expect(() => deriveDistrictWeightExponent([10, 5], Number.NaN)).toThrow();
    expect(() => deriveDistrictWeightExponent([10, 5], Number.POSITIVE_INFINITY)).toThrow();
    expect(() => deriveDistrictWeightExponent([10, 5], 0)).toThrow();
    expect(() => deriveDistrictWeightExponent([10, 5], 1)).toThrow();
  });

  it("8. `--district-weight=log|sqrt|linear` reproduce today's exact output -- regression on the real repo shape", () => {
    // The real usul-mgmt distribution, compiled under each explicit opt-out mode, must be
    // byte-identical to itself across repeated compiles (the opt-out guarantee this task must not
    // disturb) -- this is the same distribution the "derived" mode above was measured against.
    const counts: Record<string, number> = { modules: 1103, test: 36, src: 23, bin: 4, lib: 1, scripts: 1 };
    const nodes: RepoNode[] = [];
    for (const [dir, count] of Object.entries(counts)) {
      for (let i = 0; i < count; i++) nodes.push(node(`${dir}/f${i}.ts`, 20));
    }
    const g: RepoGraph = {
      nodes,
      repoPath: "/fixtures/mgmt-real-shape",
      headSha: "0000000000000000000000000000000000real",
      headDate: "2026-06-01T12:00:00.000Z",
    };
    for (const districtWeightMode of ["linear", "sqrt", "log"] as const) {
      const a = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode }));
      const b = JSON.stringify(compileCity(structuredClone(g), { districtWeightMode }));
      expect(a).toBe(b);
    }
  });
});

describe("districtWeights() -- aggregate entry point compiler/index.ts uses", () => {
  it("for linear/sqrt/log is exactly the per-count districtWeight() map (byte-identical)", () => {
    const counts = [90, 3, 0];
    for (const mode of ["linear", "sqrt", "log"] as const) {
      expect(districtWeights(counts, mode)).toEqual(counts.map((c) => districtWeight(c, mode)));
    }
  });

  it("a zero-file district (datastore-only, V4) never breaks derived mode's exponent search", () => {
    // Real shape: a datastore-only district (0 files) alongside real districts. The 0 must not be
    // fed into deriveDistrictWeightExponent (it fails loudly on <=0 counts by design -- see that
    // function's doc comment) but must still get SOME weight so squarify's own floor can act on it.
    const weights = districtWeights([1103, 36, 23, 0], "derived");
    expect(weights[3]).toBe(0); // 0 ** anything is 0 -- squarify's Math.max(1, weight) floors this
    expect(Number.isFinite(weights[0])).toBe(true);
  });

  it("all-zero counts (every district datastore-only) is inert, not a throw", () => {
    expect(() => districtWeights([0, 0, 0], "derived")).not.toThrow();
    expect(districtWeights([0, 0, 0], "derived")).toEqual([0, 0, 0]);
  });
});
