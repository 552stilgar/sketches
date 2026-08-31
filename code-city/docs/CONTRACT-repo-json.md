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
  contentHash?: string;                 // V4 — lowercase hex sha256 of the file's raw bytes, see
                                          // "Clone identity / content hash" below. Optional: lands
                                          // ahead of the analyzer stage that fills it in. Absent
                                          // means NOT HASHED, never "no clones" (§5.5 constraint 2
                                          // applies to absence of a signal as much as a value).
  todoCount?: number;                     // V5 — count of TODO/FIXME markers in this file's
                                            // tracked source, see "TODO density" below. Optional:
                                            // absent means NOT MEASURED (unsupported language),
                                            // never a fabricated 0 (§5.5 constraint 2).
}

interface RepoGraph {
  nodes: RepoNode[];
  repoPath: string;    // absolute path analyzeRepo was invoked against
  headSha: string;       // `git rev-parse HEAD` of repoPath at analysis time
  headDate: string;       // ISO-8601 — the HEAD commit's date. THIS, not wall-clock
                            // `Date.now()`, is the anchor for every age/churn computation below.
  datastores?: DatastoreSpec[];  // V4 — see "Datastore detection" below. Optional: absent means
                                   // NOT DETECTED, never "no datastores exist" (§5.5 constraint 2
                                   // applies to absence of a signal as much as to a value).
                                   // `mergeRepoGraphs` MUST carry this field through, namespaced
                                   // the same way node ids are — see "Multi-repo merge" below.
  ruins?: RuinRecord[];          // V5.3 — source files REMOVED from the tracked tree inside the
                                   // HEAD-anchored window, see "Ruins (V5.3)" below. Optional:
                                   // absent means NOT MEASURED (nobody looked for deletions),
                                   // never "nothing was demolished" — an EMPTY ARRAY is that
                                   // finding (§5.5 constraint 2). Also carried through the merge.
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

## Determinism rule: ruins

`ruins` = the source files **removed** from the tracked tree in the **90 days before the repo's
HEAD commit date** (`headDate` above) and still absent at HEAD — **never wall-clock `Date.now()`**,
and the same 90-day window `churn` uses, from the same constant (`ANALYSIS_WINDOW_DAYS`,
`src/analyzer/git.ts`) rather than a second copy of the number. A city that showed 90 days of churn
beside 30 days of demolition would be reading two different pasts at once. Run the analyzer today
or next year against the same commit and the ruins list is byte-identical, because the window is
anchored to history, not the calendar.

One further determinism obligation this signal has that `churn` and `age` do not: **rename
detection must be requested explicitly, not inherited.** `git log --name-only` only pairs a
delete with an add when rename detection is on, and the `diff.renames` default has changed across
git versions — a signal whose output depended on the operator's gitconfig would not be
reproducible. `readRuins` passes `-M50%` on every invocation.

## Complexity

No exact formula is mandated (cyclomatic complexity via a tree-sitter AST is the intended
eventual source — `docs/PROJECT_IDEA.md` §3.1). Any real, structure-derived, non-negative proxy
is acceptable for V1; `complexity` feeds directly into `compileCity`'s height rule
(`height = max(1, complexity)`), so it must be `>= 0`.

## Clone identity / content hash (V4)

- Producer: `hashFileContent(bytes: Uint8Array | string): string` — `src/analyzer/content-hash.ts`
- Consumer: `compileCity(graph: RepoGraph): CityModel` — groups nodes sharing a `contentHash`
  into `CityModel.identityLinks` (`docs/CONTRACT-city-json.md` § "Clone identity")

**D3 — EXACT CONTENT HASH ONLY.** `contentHash` is sha256 over a file's **raw bytes**, hex-encoded,
lowercase — byte-identical or nothing. No normalization (whitespace, line endings, comments), no
near-duplicate/fuzzy matching, no truncation. Near-duplicate detection is a judgment call and
would smuggle fabrication back in through the side door (`PROJECT_IDEA.md` §5.5, constraint 2,
"never fabricate") — CRYSKNIFE, a separate VPS tool, already does near-duplicate detection as an
audit; code-city RENDERS certainty (an `IdentityLink`), it does not estimate similarity.

A node with no `contentHash` was simply not hashed — it must never be treated as "confirmed no
clone", and must never appear in any `IdentityLink`. Only `"file"`-type nodes are expected to
carry this field.

## Datastore detection (V4)

- Producer: `detectDatastores(files: {path: string, content: string}[]): DatastoreSpec[]` —
  `src/analyzer/datastores.ts`
- Consumer: the analyzer assigns `detectDatastores`'s output to `RepoGraph.datastores` →
  `compileCity` emits one `Landmark` (kind `"datastore"`) per `DatastoreSpec` into
  `CityModel.landmarks` (`docs/CONTRACT-city-json.md` § "Landmarks")

`DatastoreSpec` is defined once, in `src/types.ts` (alongside `RepoGraph`, whose `datastores`
field carries it) — `src/analyzer/datastores.ts` re-exports the same type rather than declaring a
second copy that could drift:

```ts
interface DatastoreSpec {
  id: string;              // stable id derived from `dir`
  dir: string;              // repo-relative directory this datastore's tracked schema lives under
  tableCount: number;        // see "Sizing", below — feeds Landmark.weight
  migrationCount: number;     // count of tracked *.sql files under this datastore's migrations/ dir
}
```

**D1 — DATASTORE GEOMETRY COMES FROM SCHEMA, NEVER FROM THE LIVE DATABASE FILE.** Migrations and
`schema.sql` are tracked in git and stable; a `.db` file grows every hour the app runs, and sizing
a landmark from it would make the city rearrange daily — breaking the determinism constraint
(`PROJECT_IDEA.md` §3.2) outright. Live row counts are the MEASURED tier: allowed later, labelled,
never blended into structural. `detectDatastores` and every caller of it must never open, stat, or
size a `.db` file — its only input is tracked `{path, content}` pairs the analyzer already read
off git, the same source `imports`/`calls` resolution uses.

**Detection rule** — a datastore is detected from TRACKED SOURCE, and nothing else:
- any `*.sql` file under a directory named `migrations`
- any file named `schema.sql`

**Grouping** — one datastore per directory: the directory containing a `migrations/` folder, or
the directory directly containing a bare `schema.sql`. Real examples from a 2026-08-28 dogfood run
(three repos sharing a vendored kernel):
```
usul-mgmt/src/kernel/migrations/*.sql            -> dir: "src/kernel"
usul-heighliner-radio/src/schema.sql             -> dir: "src"
usul-mgmt-itba/vendor/kernel/migrations/*.sql    -> dir: "vendor/kernel"
```
A repo may additionally hold gitignored runtime artifacts for the same store (e.g. four rotating
`backups/*.db` copies) — these are never inspected, so they never produce extra datastores; the
one `migrations/` directory already resolves to exactly one `DatastoreSpec`.

**Sizing**: `tableCount` = the number of `CREATE TABLE` statements (case-insensitive, including
`CREATE TABLE IF NOT EXISTS`) across the datastore's own tracked schema content — never a row
count, never anything read from a `.db` file. `migrationCount` = the number of tracked `*.sql`
files under that datastore's `migrations/` directory (`0` for a bare-`schema.sql` datastore, which
has no migrations directory to count).

## TODO density (V5)

- Producer: `countTodoMarkers(source: string): number` — `src/analyzer/todo-density.ts`, called
  by `analyzeRepo()` and assigned to `RepoNode.todoCount`
- Consumer: none yet in `compileCity`/renderer — this contract ships the DATA field only (a later
  slice renders it as a scaffolding prop; see `CONTRACTS.md` § "V5: TODO density")

`todoCount` = the count of whole-word `TODO`/`FIXME` marker occurrences in a file's tracked
source text. Both markers count; a file with two `TODO`s and one `FIXME` reports `3`. Matching is
whole-word (`TODOItem` or `FIXMEHandler` as an identifier does not count) and does not
distinguish comment context from string-literal context — the marker convention is the signal,
not its syntactic position.

**Never-fabricate rule, restated for this field specifically:** `todoCount` is only ever computed
for a file in a language `analyzeRepo` actually parses (the same `PARSEABLE_LANGUAGES` gate that
governs real `imports`/`calls`/`complexity` extraction, `src/analyzer/index.ts` — currently
TypeScript and plain JavaScript, the tree-sitter TypeScript grammar's syntactic superset). A file
in a language the analyzer does not statically support gets `todoCount === undefined` — NOT
MEASURED — never `0`. A `0` for a file nobody scanned would read as "this file has no open work",
a fabricated measurement exactly like the "no clones" reading `contentHash`'s own absence-case
guards against above (§5.5 constraint 2: absence of a signal must never render as a plausible
default). A supported-language file that genuinely contains no markers reports a real `0` — that
is a measurement, not an absence, and is not conflated with the unsupported-language case.

`mergeRepoGraphs()` carries `todoCount` through unchanged: it is a scalar count, not an id or
path, so it needs no namespacing — it survives via the same per-node spread that carries every
other typed `RepoNode` field across the merge (see "Multi-repo merge" below; `tests/merge.test.ts`
pins this specifically, mirroring the V4 `datastores` scar this field was built to avoid
repeating — CONTRACTS.md § "Fixed 2026-08-28").

## Ruins (V5.3)

- Producer: `readRuins(repoPath: string, headDate: string): Promise<RuinRecord[]>` —
  `src/analyzer/ruins.ts`, called by `analyzeRepo()` and assigned to `RepoGraph.ruins`
- Consumer: none yet in `compileCity`/renderer — this contract ships the DATA field only (see
  `CONTRACTS.md` § "V5.3: ruins")

```ts
interface RuinRecord {
  path: string;         // LAST KNOWN repo-relative POSIX path, same id space live node ids use
  language: string;     // languageForPath(path) — the same pure extension map live nodes get
  deletedSha: string;   // full sha of the commit that removed it
  deletedDate: string;  // ISO-8601 committer date of deletedSha, inside the window
  lastLoc?: number;     // HISTORICAL line count at deletedSha's first parent — see below
}
```

**A ruin is NOT a `RepoNode`, and that is the whole design.** A deleted file has no current `loc`,
no `complexity`, no `churn`, no `age`, no `contributors`, no `imports`/`calls`, no `contentHash`,
and no place in the tree — every one of those is UNMEASURED, not zero. Modelling a ruin as a node
would force seven fabricated zeros, each individually indistinguishable from a real, tiny, quiet,
brand-new file: exactly the failure the commit-message-prefix churn heuristic had before it was
deleted (`318773d`), and exactly what §5.5 constraint 2 forbids. Ruins therefore live in their own
array with their own type, so no consumer can iterate `nodes` and pick one up by accident, and the
fields git genuinely knows are the only fields that exist.

**What is honestly measurable, and what is refused:**

| Field | Measurable? | Why |
|---|---|---|
| `path` | **yes** | Git records the exact path the file occupied when removed. A real measurement, in the live id space. |
| `language` | **yes** | Pure function of the path's extension — the identical derivation a live node gets. Nothing historical inferred. |
| `deletedSha` / `deletedDate` | **yes** | Read straight out of history. |
| `lastLoc` | **sometimes** | Read from the file's blob at `deletedSha^` and counted with the same `countLines` (`src/analyzer/loc.ts`) a live node's `loc` uses. That makes it TRUE — but true *of a different instant than `headDate`*, which is why it is named `lastLoc` and not `loc`, and why a consumer must never place it on the same axis as a live building's size without saying which commit it came from. |
| `complexity`, `churn`, `age`, `contributors`, `imports`, `calls`, `contentHash` | **no** | Each would mean parsing or re-walking history for a file that no longer exists, then silently comparing the result against HEAD-measured values on live nodes. The fields simply do not exist on `RuinRecord`. A narrow true signal beats a rich invented one. |
| position / footprint | **no** | A ruin has no location in the tree; its former directory may itself be gone. Where (or whether) the compiler places one is a later slice's decision, not a datum the analyzer can measure. |

`lastLoc` is **absent, never `0`, whenever it cannot be read honestly**: the deleting commit is a
root commit with no parent, the blob is unreadable, or the blob contains a NUL byte (binary —
splitting it on `"\n"` would produce a number that looks like LOC and isn't). Each of those cases
warns on stderr rather than degrading silently (Failure Discipline). A file that genuinely was
empty when it died reports a real `0`.

**Detection rule**, in full:
- `git log --no-merges -M50% --diff-filter=D --relative --name-only HEAD`, windowed in JS against
  `headDate` using the same predicate `churn` uses (not `git log --since`, whose date parsing is
  fuzzier than an exact anchored comparison).
- `--relative` for the same reason `readFileGitMetrics` needs it: `--name-only` prints paths
  relative to the git ROOT, which never matches the repo-relative id space when `repoPath` is a
  subdirectory of a larger repo (`tests/git-nested-repo.test.ts`). It also usefully drops
  deletions that happened outside the analyzed subtree.
- **Renames are excluded.** Git stores a rename as delete + add; `-M50%` makes git pair them and
  report `R`, which `--diff-filter=D` then filters out. **50%** is the threshold: at least half the
  content must survive the move. A renamed file is not a ruin.
- **Re-added paths are excluded.** A path tracked at HEAD is a live file, whatever happened to it
  mid-window. Deleted-then-restored produces no ruin.
- **Deleted twice, one ruin.** `git log` is newest-first, so the most recent deletion of a path is
  the one recorded — the demolition that stuck.
- **Non-source paths are excluded** by the same `isSourceFile` gate live files pass
  (`src/analyzer/scanner.ts`). A ruin for a `README.md` would put something in the city that could
  never have been a building while it was alive.
- Output is sorted by `path` in codepoint order (`compareCodepoints`).

**Known limitations, stated rather than hidden:**
- A deletion that exists ONLY as a merge commit's conflict resolution (an "evil merge") is not
  reported — `git log` gives merge commits no `--name-only` output, and `--no-merges` says so
  explicitly rather than leaving it to a default.
- A rename split across two commits (delete in one, add in another) is reported as a ruin plus a
  new file. Git genuinely does not know those are the same file; guessing that they are would be
  the fabrication this contract exists to prevent.

## Multi-repo merge

- Producer: `mergeRepoGraphs(graphs: {name: string, graph: RepoGraph}[]): RepoGraph` —
  `src/analyzer/merge.ts`
- Consumer: `compileCity(graph: RepoGraph): CityModel` — same consumer as a single-repo
  `repo.json`, unchanged
- CLI: `bin/merge.ts <name>=<repo.json> [<name>=<repo.json> ...] <out.json>`

`mergeRepoGraphs` takes N already-produced `RepoGraph`s, each tagged with a short repo `name`,
and returns one `RepoGraph` that stands in for all of them — a **pure repo.json-to-repo.json
transform**, same purity contract as `compileCity` (no I/O, no clock, no randomness; same input
graphs in the same order → byte-identical output).

**Namespacing rule — this is the entire mechanism:** every node's `id` and `path` gets prefixed
with `<name>/`. Because `compileCity` derives each district from `topLevelPath()` — the first
path segment, nothing more (`src/compiler/grammar.ts`) — prefixing every node in a repo with
that repo's name makes the repo name itself the first segment for all of its nodes. **One repo
in the input list becomes exactly one district in the compiled city, with no changes anywhere in
`src/compiler/` or `src/analyzer/index.ts`.**

**Edge remapping:** every entry in `imports[]`, `calls[]`, and `contains[]` is rewritten the same
way an node's own id is, but only when it resolves to a node id that existed in **that same
repo's own pre-merge graph** — per the "Node id convention" above, an edge is always authored in
its own repo's id space, never another repo's. An entry that does not resolve within its own
repo is left byte-for-byte untouched. This is deliberate, not a shortcut: resolving against the
union of every input repo's ids would risk fabricating a cross-repo edge purely because two
unrelated repos happen to share a filename (e.g. both vendor a `src/db.ts`) — exactly the kind of
invented edge the "Call edges" rule above forbids for the single-repo case. An edge left
unresolved post-merge doesn't match any id in the merged graph, so it produces no road, via the
exact same "unresolved target → no road" path `compileCity` already has for the single-repo case
(`src/compiler/index.ts`) — no special-casing needed downstream.

**Degenerate inputs**, all handled explicitly rather than left to fall out of the shape of the
code:
- **Empty input** (`[]`) throws — there is no repo to name the merged graph's `repoPath` after.
- **A single-element input** is a legal (if trivial) merge: every node gets the one repo's name
  prefixed on, one district results.
- **A repo-name collision** (two entries with the same `name`) throws before any prefixing
  happens.
- **A repo name containing `"/"`** throws — it would split across the first path segment
  `topLevelPath()` keys districts on, silently breaking the one-district-per-repo guarantee.

`repoPath` and `headSha` on the merged graph are informational concatenations
(`"<name>=<value>;<name>=<value>;..."`) — no single filesystem path or commit identifies a
multi-repo view. `headDate` is the latest (`Date.parse`-max) `headDate` across the input repos —
well-defined for any non-empty input, independent of argument order.

**Known limitation, not a bug:** repo-name prefixing means every node's district is its repo
name, full stop — a repo's own internal directory structure (e.g. `src/`, `lib/`) no longer forms
separate districts once merged; it all collapses into that one repo's district. This is the
accepted shape of the first merged view, not a claim that intra-repo structure doesn't matter.

**Datastores (V4)** are carried through the merge with the same namespacing mechanism, not a
special case bolted on beside it: each `DatastoreSpec`'s `dir` gets the same `<name>/` prefix a
node's `id`/`path` gets (a repo-root datastore, `dir === ""`, namespaces to the bare repo name —
there is no `/` to insert into an empty string), and `id` is recomputed from the new `dir` using
the same `datastore:<dir>` convention `detectDatastores` uses, so the datastore keeps landing in
the district its namespaced `dir` now maps to. The merged `RepoGraph.datastores` field is present
whenever **any** input repo carried one (even if another input had none, or an empty list) —
absent only when none of the inputs did. Example, the three-repo dogfood case that motivated V4:

```
usul-mgmt/src/kernel            -> usul-mgmt/src/kernel
usul-mgmt-itba/vendor/kernel    -> usul-mgmt-itba/vendor/kernel
usul-heighliner-radio/src       -> usul-heighliner-radio/src   (schema.sql at repo-relative "src")
```

**Ruins (V5.3)** ride the same mechanism and the same present-if-any-input-had-it rule: each
`RuinRecord.path` gets the `<name>/` prefix that repo's live node ids get, so a ruin lands in the
same district its repo does; every other field is a scalar with no cross-repo meaning and rides
through untouched. The merged `ruins` field is present whenever **any** input repo carried one
(even an empty one) — absent only when none did, so a repo that never looked for deletions cannot
erase another's real finding.

## Validation

`validateRepoGraph` checks: `nodes` is an array; every node has all fields above with the correct
type (`loc`/`complexity`/`churn`/`age` numeric and non-negative; `contributors`/`imports`/
`calls`/`contains` are string arrays; `type` is one of the six enum values); every node `id` is
non-empty and unique across the graph; `repoPath`/`headSha` are non-empty strings and `headDate`
parses as a valid date; when present, `contentHash` is a lowercase hex sha256 string (64 hex
characters) — absent is always legal, a malformed non-hash string is a hard validation error. When
present, `datastores` is checked the same way: an array of objects each with a non-empty `id`, a
`dir` string (empty string legal — the repo-root case), and non-negative integer `tableCount` /
`migrationCount` — absent is always legal (V4 contract D1: absent means not detected). When
present, `todoCount` must be a non-negative integer (V5: absent means not measured, never `0`).
When present, `ruins` is an array of objects each with a non-empty `path` (unique across the
array), a non-empty `language`, a non-empty `deletedSha`, a parseable ISO-8601 `deletedDate`, and a
non-negative integer `lastLoc` if the field is there at all — absent is always legal (V5.3: absent
means not measured). One cross-field check is made deliberately: **a `ruins[].path` that is also a
live node id is a hard error** — a file cannot be both demolished and standing, and that
contradiction is exactly what a broken rename-detection or re-add filter would produce. That is not
the referential-integrity checking below; it is a contradiction inside one document. It does
**not** check referential integrity of `imports`/`calls`/`contains` against other node ids, or
validate the churn/age windowing math — those are behavioral checks, owned by
`tests/analyzer.test.ts` and `tests/compiler-*.test.ts`, not structural schema checks.
