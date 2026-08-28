import { describe, it, expect } from "vitest";
import { compareCodepoints, comparePathThenId } from "../src/util/compare.ts";

describe("compareCodepoints", () => {
  it("returns 0 for equal strings", () => {
    expect(compareCodepoints("a", "a")).toBe(0);
    expect(compareCodepoints("", "")).toBe(0);
    expect(compareCodepoints("same string", "same string")).toBe(0);
  });

  it("returns -1 / 1 for simple ascii ordering", () => {
    expect(compareCodepoints("a", "b")).toBe(-1);
    expect(compareCodepoints("b", "a")).toBe(1);
    expect(compareCodepoints("apple", "banana")).toBe(-1);
    expect(compareCodepoints("banana", "apple")).toBe(1);
  });

  it("orders a prefix before its extension", () => {
    expect(compareCodepoints("a", "ab")).toBe(-1);
    expect(compareCodepoints("ab", "a")).toBe(1);
  });

  it("is antisymmetric: sign flips when arguments swap", () => {
    const pairs: Array<[string, string]> = [
      ["a", "b"],
      ["file.ts", "file2.ts"],
      ["Z", "a"],
      ["é", "e"],
      ["1", "2"],
    ];
    for (const [a, b] of pairs) {
      const forward = compareCodepoints(a, b);
      const backward = compareCodepoints(b, a);
      expect(Math.sign(forward)).toBe(-Math.sign(backward));
    }
  });

  it("is transitive across a representative sample", () => {
    const sample = ["a", "b", "Z", "1", "é", "e", "ab", "abc", "", "z"];
    for (const a of sample) {
      for (const b of sample) {
        for (const c of sample) {
          if (compareCodepoints(a, b) <= 0 && compareCodepoints(b, c) <= 0) {
            expect(compareCodepoints(a, c)).toBeLessThanOrEqual(0);
          }
        }
      }
    }
  });

  it("never calls localeCompare or Intl.Collator", () => {
    const source = compareCodepoints.toString();
    expect(source).not.toContain("localeCompare");
    expect(source).not.toContain("Collator");
  });

  it("does not construct an Intl.Collator as a side effect of calling it", () => {
    let constructed = false;
    const OriginalCollator = Intl.Collator;
    // @ts-expect-error -- intentional monkeypatch for the duration of this test
    Intl.Collator = function (...args: unknown[]) {
      constructed = true;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return new (OriginalCollator as any)(...args);
    };
    try {
      compareCodepoints("é", "e");
      compareCodepoints("a", "b");
    } finally {
      Intl.Collator = OriginalCollator;
    }
    expect(constructed).toBe(false);
  });

  it("fixes the classic locale-flip case: codepoint order for accents is stable", () => {
    // Under locale collation, whether "e" sorts before or after "é" is a
    // locale decision and famously flips between locales (e.g. Swedish vs.
    // German-ish default collations disagree). Codepoint order is immune:
    // "e" (U+0065) is always less than "é" (U+00E9) because 0x65 < 0xE9.
    expect("e".codePointAt(0)).toBeLessThan("é".codePointAt(0)!);
    expect(compareCodepoints("e", "é")).toBe(-1);
    expect(compareCodepoints("é", "e")).toBe(1);
  });

  it("orders uppercase before lowercase (plain UTF-16 order, not locale case-folding)", () => {
    // 'Z' (U+005A) < 'a' (U+0061) in code unit order, unlike a
    // locale-aware/case-insensitive collation which would put "a" first.
    expect(compareCodepoints("Z", "a")).toBe(-1);
  });

  it("produces the same ordering across repeated calls (determinism)", () => {
    const inputs: Array<[string, string]> = [
      ["banana", "apple"],
      ["é", "e"],
      ["Z", "a"],
      ["file10.ts", "file2.ts"],
      ["", "x"],
    ];
    for (const [a, b] of inputs) {
      const results = Array.from({ length: 20 }, () => compareCodepoints(a, b));
      expect(new Set(results).size).toBe(1);
    }
  });

  it("sorts an array into pure code-unit order, independent of process locale", () => {
    const input = ["banana", "Apple", "é-file", "e-file", "10", "2", "Zebra", "apple"];
    const sorted = [...input].sort(compareCodepoints);
    // Compute expected order by direct code-unit comparison, not by any
    // collation-aware method, so the assertion doesn't itself depend on
    // locale.
    const expected = [...input].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    expect(sorted).toEqual(expected);
  });

  it("string-literal < / > agree with the comparator sign (definitional check)", () => {
    const sample = ["a", "b", "ab", "abc", "Z", "z", "1", "é", "e", ""];
    for (const a of sample) {
      for (const b of sample) {
        const cmp = compareCodepoints(a, b);
        if (a < b) expect(cmp).toBeLessThan(0);
        else if (a > b) expect(cmp).toBeGreaterThan(0);
        else expect(cmp).toBe(0);
      }
    }
  });
});

describe("comparePathThenId", () => {
  it("orders by path first", () => {
    expect(comparePathThenId({ path: "a.ts", id: "z" }, { path: "b.ts", id: "a" })).toBeLessThan(0);
  });

  it("breaks ties on path by id", () => {
    expect(comparePathThenId({ path: "same.ts", id: "a" }, { path: "same.ts", id: "b" })).toBeLessThan(0);
    expect(comparePathThenId({ path: "same.ts", id: "b" }, { path: "same.ts", id: "a" })).toBeGreaterThan(0);
  });

  it("returns 0 for identical path+id", () => {
    expect(comparePathThenId({ path: "same.ts", id: "a" }, { path: "same.ts", id: "a" })).toBe(0);
  });

  it("never calls localeCompare (codepoint order, not locale-dependent)", () => {
    const source = comparePathThenId.toString();
    expect(source).not.toContain("localeCompare");
  });
});
