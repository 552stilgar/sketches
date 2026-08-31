// tests/todo-density.test.ts — countTodoMarkers (src/analyzer/todo-density.ts).
//
// Covers the counting rule in isolation: both marker words, whole-word matching (no substring
// false-positives), a real zero for clean source, and determinism. The "unsupported language ->
// undefined" never-fabricate rule is a caller decision (src/analyzer/index.ts), not something
// this pure function can express by itself -- that behavior is pinned in
// tests/analyzer-todo-density.test.ts instead.

import { describe, expect, it } from "vitest";
import { countTodoMarkers } from "../src/analyzer/todo-density.ts";

describe("countTodoMarkers", () => {
  it("counts both TODO and FIXME occurrences", () => {
    const source = "// TODO: fix this\nfunction f() {}\n// FIXME later\nconst x = 1; // TODO\n";
    expect(countTodoMarkers(source)).toBe(3);
  });

  it("returns a real 0 for source with no markers", () => {
    expect(countTodoMarkers("export function helper() {\n  return 1;\n}\n")).toBe(0);
  });

  it("returns 0 for empty source", () => {
    expect(countTodoMarkers("")).toBe(0);
  });

  it("does not count TODO/FIXME as a substring of another identifier", () => {
    const source = "const TODOItem = 1;\nclass FIXMEHandler {}\n";
    expect(countTodoMarkers(source)).toBe(0);
  });

  it("is deterministic: same source, same count, every time", () => {
    const source = "// TODO one\n// TODO two\n// FIXME three\n";
    expect(countTodoMarkers(source)).toBe(countTodoMarkers(source));
    expect(countTodoMarkers(source)).toBe(3);
  });
});
