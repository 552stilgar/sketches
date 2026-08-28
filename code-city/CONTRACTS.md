# Code City — Contracts Index

Code City is a `repo → repo.json → city.json → svg/3d` compiler pipeline. Each arrow below is a
contract that lets the analyzer, compiler, and renderer be built — and tested — independently.

| Contract | Producer | Consumer | Spec |
|---|---|---|---|
| `repo.json` (RepoGraph) | `analyzeRepo()` — `src/analyzer/index.ts` | `compileCity()`, `mergeRepoGraphs()` | [docs/CONTRACT-repo-json.md](docs/CONTRACT-repo-json.md) |
| merged `repo.json` (RepoGraph) | `mergeRepoGraphs()` — `src/analyzer/merge.ts` | `compileCity()` | [docs/CONTRACT-repo-json.md](docs/CONTRACT-repo-json.md) § "Multi-repo merge" |
| `city.json` (CityModel) | `compileCity()` — `src/compiler/index.ts` | `render2d()`, future 3D renderer | [docs/CONTRACT-city-json.md](docs/CONTRACT-city-json.md) |
| `city.svg` output | `render2d()` — `src/renderer/svg.ts` | browser / debug view | [docs/CONTRACT-render-svg.md](docs/CONTRACT-render-svg.md) |

Runtime validators for the first two contracts live in `src/types.ts`:
`validateRepoGraph(x): {ok, errors}` and `validateCity(x): {ok, errors}`. Every CLI in `bin/`
runs its output through the matching validator before writing a file — an invalid output is a
hard failure (project's Failure Discipline law: never silently degrade), not a warning.

Architecture overview (who owns what, why the pipeline is three stages, not one function):
[DESIGN.md](DESIGN.md).

Determinism and LOD are contractual, not implementation details — a violation of either is a
contract break, gated directly by `tests/compiler-determinism.test.ts` and
`tests/compiler-layout.test.ts`, not a style nit to fix later.

## Fixtures

- `fixtures/sample-project-src/` + `fixtures/build-fixture.mjs` — the 15-file, 4-directory,
  6-commit deterministic git fixture used by `tests/analyzer.test.ts`.
  `fixtures/MANIFEST.md` is the ground truth for every exact number (LOC, import edges, churn)
  asserted against it — derive new assertions from that file, don't re-derive by hand.
- `fixtures/mock-city.json` (byte-identical copy at `public/mock-city.json`, which the 3D
  renderer lane builds against ahead of `compileCity` existing — see
  `docs/PROJECT_IDEA.md` §9.2) — a handwritten, `validateCity`-clean `CityModel`: 3 districts,
  12 buildings, 8 roads.

## Signatures (fixed — do not change without updating all three contract docs + the RED gates together)

```ts
analyzeRepo(repoPath: string): Promise<RepoGraph>   // src/analyzer/index.ts
mergeRepoGraphs(graphs: {name: string, graph: RepoGraph}[]): RepoGraph  // src/analyzer/merge.ts — pure, sync
compileCity(graph: RepoGraph): CityModel            // src/compiler/index.ts — pure, sync
render2d(city: CityModel): string                   // src/renderer/svg.ts — pure, sync
```

## Status (contract lane)

- `src/analyzer/index.ts`, `src/compiler/index.ts`, `src/renderer/svg.ts` are stubs — each
  throws `new Error("NotImplemented")`. Three implementation lanes fill these in against the
  contracts above.
- RED gates (fail today, on `NotImplemented`, until implemented): `tests/analyzer.test.ts`,
  `tests/compiler-determinism.test.ts`, `tests/compiler-layout.test.ts`, `tests/render2d.test.ts`.
- GREEN today: `tests/types.test.ts` (the validators are real, not stubbed).
