import { createRequire } from "node:module";
import { dirname, extname, posix } from "node:path";
import Parser from "web-tree-sitter";

export interface ParseMetrics {
  imports: string[];
  calls: string[];
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

interface ImportBindings {
  direct: Map<string, string>;
  namespaces: Map<string, string>;
}

function collectImportBindings(node: Parser.SyntaxNode, resolved: string, bindings: ImportBindings): void {
  const clause = node.namedChildren.find((child) => child.type === "import_clause");
  if (!clause) return;

  // `import type ...` creates no runtime binding that can be called.
  if (node.children.some((child) => child.type === "type")) return;

  for (const child of clause.namedChildren) {
    if (child.type === "identifier") {
      // A direct identifier under import_clause is the default import.
      bindings.direct.set(child.text, resolved);
    } else if (child.type === "namespace_import") {
      const local = child.namedChildren.find((part) => part.type === "identifier");
      if (local) bindings.namespaces.set(local.text, resolved);
    } else if (child.type === "named_imports") {
      for (const specifier of child.namedChildren) {
        if (specifier.type !== "import_specifier") continue;
        // `import { type Foo }` is also type-only, even when the surrounding import is not.
        if (specifier.children.some((part) => part.type === "type")) continue;
        const local = specifier.childForFieldName("alias") ?? specifier.childForFieldName("name");
        if (local) bindings.direct.set(local.text, resolved);
      }
    }
  }
}

function namespaceRoot(node: Parser.SyntaxNode): string | undefined {
  if (node.type === "identifier") return node.text;
  if (node.type !== "member_expression") return undefined;
  const object = node.childForFieldName("object");
  return object ? namespaceRoot(object) : undefined;
}

function resolveCall(node: Parser.SyntaxNode, bindings: ImportBindings): string | undefined {
  const callee = node.childForFieldName("function");
  if (!callee) return undefined;
  if (callee.type === "identifier") return bindings.direct.get(callee.text);
  if (callee.type !== "member_expression") return undefined;
  const root = namespaceRoot(callee);
  return root ? bindings.namespaces.get(root) : undefined;
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
  const calls: string[] = [];
  const bindings: ImportBindings = { direct: new Map(), namespaces: new Map() };
  let complexity = 1;
  const nodes: Parser.SyntaxNode[] = [];
  const stack = [tree.rootNode];
  while (stack.length > 0) {
    const node = stack.pop()!;
    nodes.push(node);
    for (let i = node.childCount - 1; i >= 0; i--) {
      const child = node.child(i);
      if (child) stack.push(child);
    }
  }

  // Resolve every import before inspecting calls. Imports are top-level declarations, but doing
  // this in two passes also makes the result independent of whether an import appears before or
  // after its use in a syntactically recoverable source file.
  for (const node of nodes) {
    if (node.type === "import_statement") {
      const sourceNode = node.childForFieldName("source");
      if (sourceNode) {
        const raw = sourceNode.text;
        const specifier = raw.length >= 2 ? raw.slice(1, -1) : raw;
        const resolved = resolveImport(filePath, specifier, files);
        if (resolved) {
          imports.push(resolved);
          collectImportBindings(node, resolved, bindings);
        }
      }
    }
  }

  for (const node of nodes) {
    if (node.type === "call_expression") {
      const resolved = resolveCall(node, bindings);
      if (resolved) calls.push(resolved);
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
  }
  tree.delete();
  return { imports, calls, complexity };
}
