// Regression: NodeNext-style relative imports that already carry an extension (e.g.
// `import "./foo.js"` resolving to a `foo.ts` source file — the correct way to import a
// TypeScript module under `"moduleResolution": "NodeNext"`) must still resolve to a real
// import edge. resolveImport previously only tried the literal specifier when it already had
// an extension, so `.ts` sources were never checked and the edge was silently dropped.

import { describe, it, expect } from "vitest";
import { parseTypeScript } from "../src/analyzer/parser.ts";

describe("parseTypeScript — NodeNext '.js' specifier resolution", () => {
  it("resolves a './x.js' import to the sibling 'x.ts' source file", async () => {
    const files = new Set(["src/foo.ts", "src/bar.ts"]);
    const source = `import { thing } from "./foo.js";\nexport const bar = thing;\n`;
    const result = await parseTypeScript(source, "src/bar.ts", files);
    expect(result.imports).toContain("src/foo.ts");
  });

  it("still resolves a literal '.ts' specifier unchanged", async () => {
    const files = new Set(["src/foo.ts", "src/bar.ts"]);
    const source = `import { thing } from "./foo.ts";\nexport const bar = thing;\n`;
    const result = await parseTypeScript(source, "src/bar.ts", files);
    expect(result.imports).toContain("src/foo.ts");
  });

  it("does not fabricate an edge when neither the .js specifier nor a .ts sibling exists", async () => {
    const files = new Set(["src/bar.ts"]);
    const source = `import { thing } from "./missing.js";\nexport const bar = thing;\n`;
    const result = await parseTypeScript(source, "src/bar.ts", files);
    expect(result.imports).toEqual([]);
  });
});

describe("parseTypeScript — call edges", () => {
  it("resolves a call to a named imported function", async () => {
    const files = new Set(["src/caller.ts", "src/target.ts"]);
    const result = await parseTypeScript(
      `import { run } from "./target.js";\nrun();\n`,
      "src/caller.ts",
      files,
    );
    expect(result.calls).toEqual(["src/target.ts"]);
  });

  it("keeps one entry for every call to the same import", async () => {
    const files = new Set(["src/caller.ts", "src/target.ts"]);
    const result = await parseTypeScript(
      `import { run } from "./target";\nrun();\nrun();\nrun();\n`,
      "src/caller.ts",
      files,
    );
    expect(result.calls).toEqual(["src/target.ts", "src/target.ts", "src/target.ts"]);
  });

  it("resolves member calls rooted at a namespace import", async () => {
    const files = new Set(["src/caller.ts", "src/target/index.ts"]);
    const result = await parseTypeScript(
      `import * as target from "./target";\ntarget.run();\ntarget["computed"]();\n`,
      "src/caller.ts",
      files,
    );
    expect(result.calls).toEqual(["src/target/index.ts"]);
  });

  it("drops calls to external imports and locally-defined functions", async () => {
    const files = new Set(["src/caller.ts"]);
    const result = await parseTypeScript(
      `import { external } from "external-package";\nfunction local() {}\nexternal();\nlocal();\n`,
      "src/caller.ts",
      files,
    );
    expect(result.calls).toEqual([]);
  });

  it("preserves call-site source order across target files", async () => {
    const files = new Set(["src/caller.ts", "src/a.ts", "src/b.ts"]);
    const result = await parseTypeScript(
      `import { a } from "./a";\nimport { b } from "./b";\nb();\na();\nb();\n`,
      "src/caller.ts",
      files,
    );
    expect(result.calls).toEqual(["src/b.ts", "src/a.ts", "src/b.ts"]);
  });

  it("returns byte-identical calls for the same input", async () => {
    const files = new Set(["src/caller.ts", "src/target.ts"]);
    const source = `import thing, * as target from "./target";\nthing();\ntarget.run();\n`;
    const first = await parseTypeScript(source, "src/caller.ts", files);
    const second = await parseTypeScript(source, "src/caller.ts", files);
    expect(first.calls).toEqual(["src/target.ts", "src/target.ts"]);
    expect(JSON.stringify(first.calls)).toBe(JSON.stringify(second.calls));
  });
});
