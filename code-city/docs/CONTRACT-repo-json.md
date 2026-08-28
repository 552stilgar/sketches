# Contract: repo.json (RepoGraph)

- Producer: `analyzeRepo(repoPath: string): Promise<RepoGraph>` — `src/analyzer/index.ts`
- Consumer: `compileCity(graph: RepoGraph): CityModel` — `src/compiler/index.ts`
- Validator: `validateRepoGraph(x: unknown): { ok: boolean; errors: string[] }` — `src/types.ts`

## Shape

```ts
type NodeType = "repo" | "package" | "module" | "file" | "class" | "function";

interface RepoNode {
  id: string;             // see "Node id convention" below — unique across the whole graph
  type: NodeType;
  language: string;       // e.g. "typescript", "python", "unknown"
  name: string;            // basename, e.g. "session.ts"
  path: string;             // == id for file nodes (repo-relative, POSIX slashes)
  loc: number;               // >= 0
  complexity: number;         // >= 0 — see "Complexity" below
  churn: number;                // >= 0 — see "Determinism rule: churn" below
  age: number;                   // >= 0, days — see "Determinism rule: age" below
  contributors: string[];         // commit-author identities touching this node; non-empty
                                    // for any node with at least one commit
  imports: string[];                // ids of other nodes this node imports — see "Import edges"
  calls: string[];                   // ids of other nodes this node calls (function/method call
                                       // graph — [] is fine at file-level granularity, V1 scope)
  contains: string[];                  // ids this node structurally contains (a future "module"
                                         // node would contain its file ids) — [] for file nodes
}

interface RepoGraph {
  nodes: RepoNode[];
  repoPath: string;    // absolute path analyzeRepo was invoked against
  headSha: string;       // `git rev-parse HEAD` of repoPath at analysis time
  headDate: string;       // ISO-8601 — the HEAD commit's date. THIS, not wall-clock
                            // `Date.now()`, is the anchor for every age/churn computation below.
}
```

## V1 (Phase 1) minimum scope

`analyzeRepo` MUST emit exactly one `"file"` node per source file it discovers (respecting
`.gitignore`), with `imports` populated from static import analysis. It MAY additionally emit
`"class"` / `"function"` / `"module"` / `"package"` / `"repo"` nodes for deeper AST/hierarchy
info — that's enrichment, not required by this contract or by `tests/analyzer.test.ts`, which
only asserts against `"file"`-type nodes.

## Node id convention

A node id is the node's path **relative to `repoPath`, using forward slashes, no leading `./`**
— matching the example in `docs/PROJECT_IDEA.md` §3.2 (`"auth/UserService.ts"`). For file nodes,
`id === path`. Import edges (below) reference other nodes **by this same id string** — the
compiler and every test in this repo resolve edges by exact id equality, not by re-normalizing
paths at read time.

## Import edges

`imports[]` holds one entry per relative import statement resolved to another file's id — both
value imports (`import { x } from "./y.ts"`) and type-only imports (`import type { X } from
"./y.ts"`) count as edges; this contract does not require the analyzer to distinguish them (the
fixture's ground truth in `fixtures/MANIFEST.md` counts both — 26 total edges across the 15-file
fixture — and `tests/analyzer.test.ts` asserts exactly that). External/bare-specifier imports
(`import "three"`) are NOT edges into this graph — there is no external-package node type in V1,
leave them out of `imports[]`.

## Call edges

`calls[]` holds one entry per **call site whose callee resolves to a known file in the scan set**,
expressed in the same id space as `imports[]` (a resolved repo-relative file path). It is the
finer-grained sibling of `imports[]`: imports say two files are connected, calls say how much
traffic that connection actually carries (`PROJECT_IDEA.md` §5.5 → `Road.weight`).

Rules, all load-bearing:

- **Duplicates are kept, and they are the signal.** Ten calls into the same target file produce
  ten entries. Do not deduplicate — `compileCity` counts occurrences to weight roads.
- **Order is source order** (first appearance to last, as traversed). Stable for a fixed input,
  which is what `repo.json` byte-determinism requires.
- **Never fabricate an edge.** A call site whose callee cannot be resolved to a file in the scan
  set — dynamic dispatch, a computed member, a bare-specifier/external package, a local or
  built-in — is **dropped**. It is not guessed at by name, not attributed to a plausible target,
  and not inferred from an identifier match. An unresolvable call contributes nothing.

  This is not a style preference. A churn heuristic that invented data from commit-message
  prefixes was written, shipped, and had to be deleted (`318773d`); §5.5 restates the rule for
  traffic specifically. **A module with no resolvable calls must be distinguishable from a module
  nobody analyzed** — dark-because-nobody-looked is not dark-because-nothing-runs.
- Resolution reuses the existing import resolver's semantics (relative specifiers, NodeNext
  `.js`→`.ts` extension remap, `index.ts` directory resolution) so `calls[]` and `imports[]`
  cannot drift into two different notions of "the same file".
- An empty `calls[]` is always valid: it means no call site resolved, never that the file is idle.

## Determinism rule: churn

`churn` = the count of commits touching this file in the **90 days before the repo's HEAD commit
date** (`headDate` above) — **never wall-clock `Date.now()`**. This is what makes `repo.json`
reproducible for a fixed repo state: run the analyzer today or next year against the same commit
and get the same churn numbers, because the window is anchored to history, not the calendar.

## Determinism rule: age

`age` = days from this file's **first commit** touching it to the repo's **HEAD commit date**
(`headDate`) — again anchored to `headDate`, never `Date.now()`.

## Complexity

No exact formula is mandated (cyclomatic complexity via a tree-sitter AST is the intended
eventual source — `docs/PROJECT_IDEA.md` §3.1). Any real, structure-derived, non-negative proxy
is acceptable for V1; `complexity` feeds directly into `compileCity`'s height rule
(`height = max(1, complexity)`), so it must be `>= 0`.

## Validation

`validateRepoGraph` checks: `nodes` is an array; every node has all fields above with the correct
type (`loc`/`complexity`/`churn`/`age` numeric and non-negative; `contributors`/`imports`/
`calls`/`contains` are string arrays; `type` is one of the six enum values); every node `id` is
non-empty and unique across the graph; `repoPath`/`headSha` are non-empty strings and `headDate`
parses as a valid date. It does **not** check referential integrity of `imports`/`calls`/
`contains` against other node ids, or validate the churn/age windowing math — those are
behavioral checks, owned by `tests/analyzer.test.ts` and `tests/compiler-*.test.ts`, not
structural schema checks.
