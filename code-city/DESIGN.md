# Code City — Architecture

*(One page. For schemas and behavioral rules, see `CONTRACTS.md` and the docs it indexes. This
file says who owns what and why the pipeline is shaped this way — not the shapes themselves.)*

## Three stages, three owners, two files between them

```
Repository            repo.json              city.json              Scene
   |                  (RepoGraph)            (CityModel)
   |   analyzeRepo()       |     compileCity()      |     render2d() / Three.js
   +----------------------->----------------------->---------------------->
      src/analyzer/            src/compiler/            src/renderer/
```

- **Analyzer** (`src/analyzer/`) owns turning an arbitrary git repo into `repo.json`. It is the
  only stage allowed to touch the filesystem or git history. It knows about languages
  (TypeScript/Python via tree-sitter) and knows nothing about cities, districts, or layout.
- **Compiler** (`src/compiler/`) owns turning `repo.json` into `city.json`. It is a **pure
  function of its input** — no I/O, no clock, no randomness — because determinism (same code
  structure → same city, forever) is the entire point of the project
  (`docs/PROJECT_IDEA.md` §2, "Deterministic geography"). It knows the urban grammar
  (footprint/height/LOD/layout) and knows nothing about git or source languages.
- **Renderer(s)** (`src/renderer/`, and eventually a Three.js scene under `src/main.ts`) own
  turning `city.json` into something visible. A renderer is "dumb" by design — it draws
  buildings, roads, districts, and styles, with zero code that reasons about source code.
  `render2d` (this lane's stub) is the 2D SVG debug renderer called out in
  `docs/PROJECT_IDEA.md` §9.7 — iterate the layout algorithm against it before touching
  Three.js.

## Why two file boundaries, not one function

Each arrow above is independently testable and independently swappable: a second analyzer
(Python-only, or a different tree-sitter grammar set) can produce the same `repo.json` shape; a
second renderer (Three.js, PNG, Godot export) can consume the same `city.json` without knowing
`compileCity` exists. The two JSON files are the actual contracts — see `CONTRACTS.md` — not an
implementation convenience.

## CLIs

`bin/analyze.ts <repo-path> <repo.json>`, `bin/merge.ts <name>=<repo.json> [<name>=<repo.json>
...] <out.json>`, `bin/compile.ts <repo.json> <city.json>`, `bin/render2d.ts <city.json>
<city.svg>` are thin wiring: parse argv, call the one stage function, run the output through the
matching `validate*` from `src/types.ts`, write the file. All four fail loudly (non-zero exit,
printed validation errors) rather than writing an invalid or partial file — Failure Discipline
law, real result → disclosed failure → thrown error, never a silent stub written to disk.
`bin/merge.ts` is optional — a single-repo run skips straight from `bin/analyze.ts`'s output to
`bin/compile.ts`; it only sits between them when the goal is one city over N repos (see
`docs/CONTRACT-repo-json.md` § "Multi-repo merge").

## Determinism is load-bearing, not a nice-to-have

`docs/PROJECT_IDEA.md` §3.2 states the constraint directly: *"If I render a repo today and
tomorrow and one function changed, the whole city must not rearrange."* This is why `compileCity`
has no allowed source of entropy, why `age`/`churn` in `repo.json` are anchored to the repo's
HEAD commit date rather than wall-clock time (`docs/CONTRACT-repo-json.md`), and why
`tests/compiler-determinism.test.ts` is the single most load-bearing test in this repo: it's the
only thing that can catch a `Set`/`Map`-iteration-order or insertion-order bug that would pass
every other test yet silently break the project's core promise.
