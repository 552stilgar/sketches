import { createRequire } from "node:module";
import { dirname, extname, posix } from "node:path";
import Parser from "web-tree-sitter";

export interface ParseMetrics {
  imports: string[];
  complexity: number;
}

let parserPromise: Promise<Parser> | undefined;

async function typescriptParser(): Promise<Parser> {
  if (!parserPromise) {
    parserPromise = (async () => {
      const require = createRequire(import.meta.url);
      await Parser.init();
      const languagePath = require.resolve("tree-sitter-wasms/out/tree-sitter-typescript.wasm");
      const language = await Parser.Language.load(languagePath);
      const parser = new Parser();
      parser.setLanguage(language);
      return parser;
    })();
  }
  return parserPromise;
}

// NodeNext extension remap: the correct way to import a .ts module under
// "moduleResolution": "NodeNext" is to write the specifier with its eventual-output .js
// extension (e.g. `import "./foo.js"` for a source file that is actually `foo.ts`). Map each
// such extension to the real TS source extension it should ALSO be tried against, in addition
// to the literal specifier itself.
const NODENEXT_JS_TO_TS: Readonly<Record<string, string>> = {
  ".js": ".ts",
  ".mjs": ".mts",
  ".cjs": ".cts",
};

function resolveImport(fromPath: string, specifier: string, files: ReadonlySet<string>): string | undefined {
  if (!specifier.startsWith(".")) return undefined;
  const base = posix.normalize(posix.join(posix.dirname(fromPath), specifier));
  const ext = extname(base);
  let candidates: string[];
  if (!ext) {
    candidates = [base, `${base}.ts`, `${base}.tsx`, `${base}.mts`, `${base}.cts`, posix.join(base, "index.ts"), posix.join(base, "index.tsx")];
  } else {
    const tsExt = NODENEXT_JS_TO_TS[ext];
    candidates = tsExt ? [base, `${base.slice(0, -ext.length)}${tsExt}`] : [base];
  }
  return candidates.find((candidate) => files.has(candidate));
}

export async function parseTypeScript(
  source: string,
  filePath: string,
  files: ReadonlySet<string>,
): Promise<ParseMetrics> {
  const parser = await typescriptParser();
  const tree = parser.parse(source);
  if (!tree) throw new Error(`tree-sitter could not parse ${filePath}`);

  const imports: string[] = [];
  let complexity = 1;
  const stack = [tree.rootNode];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.type === "import_statement") {
      const sourceNode = node.childForFieldName("source");
      if (sourceNode) {
        const raw = sourceNode.text;
        const specifier = raw.length >= 2 ? raw.slice(1, -1) : raw;
        const resolved = resolveImport(filePath, specifier, files);
        if (resolved) imports.push(resolved);
      }
    }
    if (
      node.type === "if_statement" ||
      node.type === "for_statement" ||
      node.type === "for_in_statement" ||
      node.type === "while_statement" ||
      node.type === "do_statement" ||
      node.type === "switch_case" ||
      node.type === "ternary_expression"
    ) {
      complexity++;
    } else if (node.type === "binary_expression") {
      const operator = node.childForFieldName("operator")?.text
        ?? node.children.find((child) => child.text === "&&" || child.text === "||")?.text;
      if (operator === "&&" || operator === "||") complexity++;
    }
    for (let i = node.childCount - 1; i >= 0; i--) {
      const child = node.child(i);
      if (child) stack.push(child);
    }
  }
  tree.delete();
  return { imports, complexity };
}
