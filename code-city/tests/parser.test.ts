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
