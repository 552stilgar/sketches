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

## V4: datastores + clone identity

Motivation (dogfood run, 2026-08-28): rendering three related repos as one city produced zero
roads between them because a shared kernel is *vendored* (copied into each consumer) rather than
imported — 34 files exist in all three repos, 31 byte-identical. The city had no way to show
that. Separately, a repo whose `data/` directory holds `.db` files rendered nothing for them,
contradicting `docs/PROJECT_IDEA.md` §2's "exhaustive, not curated" promise. V4 adds two things to
close both gaps: **datastore landmarks** and **clone-identity links**, plus a compiler LOD
exemption so clone-bearing directories don't lose the very detail that makes them interesting.

New producer/consumer pairs:

| Contract | Producer | Consumer |
|---|---|---|
| `RepoNode.contentHash` | `hashFileContent()` — `src/analyzer/content-hash.ts` | `compileCity()` (groups into `identityLinks`) |
| `RepoGraph.datastores` | `detectDatastores()` — `src/analyzer/datastores.ts`, assigned by `analyzeRepo()` | `mergeRepoGraphs()` (namespaces and carries through), `compileCity()` (emits into `landmarks`) |
| `CityModel.identityLinks` | `compileCity()` — `src/compiler/index.ts` | `buildTethers()` — `src/renderer/tethers.ts` |
| `CityModel.landmarks` (kind `"datastore"`) | `compileCity()` | `buildLandmarks()` — `src/renderer/landmarks.ts` |

Full field shapes and validation rules: `docs/CONTRACT-repo-json.md` §§ "Clone identity / content
hash", "Datastore detection"; `docs/CONTRACT-city-json.md` §§ "Landmarks (V4)", "Clone identity
(V4)", and the D4 LOD-exemption paragraph under "LOD".

**Fixed 2026-08-28** — `datastores` originally landed as an untyped property attached to the
`RepoGraph` value `analyzeRepo()` returns, read back by `compileCity()` through a local
`RepoGraph & { datastores?: DatastoreSpec[] }` intersection cast, disclosed at the time as a
structural workaround (the frozen `RepoGraph` type had five lanes running against it in
parallel). `mergeRepoGraphs()` was built before this V4 lane existed and constructs a fresh
`RepoGraph` from typed fields only, so the untyped property did not survive a multi-repo merge —
`datastores` silently vanished and every merged city rendered zero datastore landmarks, with all
231 tests staying green throughout. `datastores?: DatastoreSpec[]` is now a real, validated field
on `RepoGraph` (`src/types.ts`); `mergeRepoGraphs()` carries it through, namespaced the same way
node ids are (see `docs/CONTRACT-repo-json.md` § "Multi-repo merge").

Four frozen decisions (not open questions — reopen only with Usul's explicit buy-in):

- **D1 — schema, never the live `.db` file.** A datastore is detected from tracked `*.sql` files
  under a `migrations/` directory, or a bare `schema.sql` — never by opening, statting, or sizing
  a runtime database file. Migrations are stable and git-tracked; a `.db` file grows every hour
  the app runs, and sizing a landmark from it would rearrange the city daily, breaking the
  determinism constraint (`PROJECT_IDEA.md` §3.2) outright.
- **D2 — identity links are not roads.** A road means traffic; vendored copies carry zero traffic
  by construction. Drawing a road between clones would assert flow that doesn't exist (§5.5,
  never-fabricate). Clone identity gets its own visual channel instead: elevated, static, no
  dashes — visibly not-a-road.
- **D3 — exact content hash only.** sha256 over raw bytes, byte-identical or nothing. Near-
  duplicate detection is a judgment call that would smuggle fabrication back in; that's
  CRYSKNIFE's job (a separate VPS tool, an audit), not this project's — code-city renders
  certainty, it does not estimate similarity.
- **D4 — clone-aware LOD.** Past the 500-file threshold, `selectBuildingSources` normally
  aggregates a whole directory into one building, which would leave a clone-bearing directory
  with nothing for an `IdentityLink` to attach to — exactly what hid the vendored kernel in the
  motivating dogfood run. A directory with any clone-participating file keeps file-level
  granularity even past 500 files; every other directory still collapses as before.
  **Reopened as a selectable option (Lane B, 2026-08-29):** the *scope* of that exemption —
  whole top-level DISTRICT vs. just the clone member's immediate aggregation-group DIRECTORY —
  turned out to be an aesthetic call, not a settled one: district scope took a real merged city
  from 21 buildings to 625 because one duplicated file pair dragged its entire district back to
  file LOD. `compileCity(graph, { cloneLodScope: "district" | "directory" })` makes both modes
  selectable; `"district"` stays the default so omitting the option is bit-for-bit unchanged.
  Which mode ships as Usul's pick is still open — see `docs/CONTRACT-city-json.md` § "D4".

Fixture: `fixtures/mock-city-v4.json` — hand-written, `validateCity`-clean, 3 districts, 12
buildings, 2 datastore landmarks, 2 identityLinks (a 3-building cross-district group and a
2-building pair) — build against this ahead of the analyzer/compiler/renderer lanes that produce
the real thing, same pattern `fixtures/mock-city.json` served for V1.

RED gates (fail today, turn green as each V4 lane lands): `tests/content-hash.test.ts`,
`tests/datastores.test.ts`, `tests/identity-links.test.ts` (compiler emission + D4 LOD exemption),
`tests/landmarks-render.test.ts` (`buildLandmarks` + `buildTethers`). Each file's header comment
says which lane turns it green.

## V5: TODO density

Motivation: `loc`/`complexity`/`churn`/`age` measure a file's size and volatility, but not its
*declared* open work — a `TODO`/`FIXME` comment is a signal a developer actually left in the
code, distinct from anything inferred structurally. V5 adds `RepoNode.todoCount`: a count of
`TODO`/`FIXME` marker occurrences per file, following the exact same optional-field/never-
fabricate shape `contentHash` (V4) established, so the pipeline's absence-handling convention
stays uniform rather than each new signal inventing its own.

New producer/consumer pair:

| Contract | Producer | Consumer |
|---|---|---|
| `RepoNode.todoCount` | `countTodoMarkers()` — `src/analyzer/todo-density.ts`, assigned by `analyzeRepo()` (only for `PARSEABLE_LANGUAGES` files) | `mergeRepoGraphs()` (carries through unchanged — scalar, no namespacing needed) |

Full field shape and validation rule: `docs/CONTRACT-repo-json.md` § "TODO density (V5)".

**Ships as a data-contract slice only.** No renderer consumer yet — `compileCity` does not read
`todoCount` and no scaffolding prop exists for it. That is a deliberately later slice (a
rendering decision, not a data-availability one); this slice's job is only to make the signal
real, typed, validated, and merge-safe, per the delegation instructions that scoped it.

**The scar this repeats-not:** V4's `datastores` field first landed as an untyped property
attached outside `RepoGraph`'s typed shape (see "Fixed 2026-08-28" below) — `mergeRepoGraphs`
silently dropped it because it only carries typed fields through. `todoCount` is a typed
`RepoNode` field from its first commit, so `mergeRepoGraphs`'s per-node `...node` spread carries
it automatically; `tests/merge.test.ts`'s "V5 scar test" `describe` block asserts this directly
rather than trusting the spread.

## Phase 4: git time-travel (timeline scrub)

Motivation (PROJECT_IDEA.md §5.2/Phase 4): a repo's history is a fourth navigable dimension.
`bin/snapshots.ts` (already merged, P3) resolves the last N months of history into one
`repo-YYYY-MM.json` per month, skipping (never fabricating) a month with no qualifying commit.
This phase compiles that directory into a scrubbable sequence and renders it as a morphing city.

New producer/consumer pairs:

| Contract | Producer | Consumer |
|---|---|---|
| `TimelineManifest` (`timeline.json`) | `buildTimelineManifest()` — `src/compiler/sequence.ts`, written by `bin/sequence.ts` | `src/timeline-main.ts` (fetches it + every `TimelineEntry.cityFile`) |
| `MorphedBuilding` | `morphBuilding()`/`morphBuildings()` — `src/renderer/morph.ts` | `src/renderer/timeline.ts`'s `buildTimeline()` |

Two frozen decisions:

- **Gaps render as gaps, never as smooth interpolation across missing history.** A `TimelineEntry`
  whose month doesn't calendar-follow the previous entry gets `gapBefore: true`
  (`isCalendarConsecutive`, `src/compiler/sequence.ts`). `src/renderer/timeline.ts`'s `setPosition`
  detects a gapped pair and hard-cuts at the midpoint instead of calling `morphBuildings` across
  it — `currentDate()` freezes to whichever boundary snapshot's real date it cut to, rather than
  reporting an interpolated instant nothing in the underlying history actually reaches.
- **Only buildings morph.** Districts/roads/landmarks/identity tethers snap to the scrub pair's
  "to" snapshot and are rebuilt (not interpolated) on every pair change. Two reasons: district-
  level treemap reflow is unstable by contract (`squarify` is pinned "fixed" below), so a smooth
  district morph would assert a stability the layout doesn't have; and roads/landmarks/tethers are
  keyed to a single city's own building ids, with no defined meaning "50% between two repo
  states". `src/renderer/timeline.ts`'s header comment carries the full rationale.

Morphing is DISPLAY ONLY (constraint 5, extended by this phase): `MorphedBuilding` is never a
`Building` and is never written into a `CityModel` or handed to `compileCity` — it exists to be
applied to one rendered Three.js frame and discarded (see `src/renderer/morph.ts`'s header doc).

RED-turned-green this lane: `tests/sequence.test.ts`, `tests/morph.test.ts`, `tests/timeline.test.ts`.

Fixtures: `fixtures/mock-timeline.json` + `fixtures/mock-city-2026-{01,02,03,06}.json` (byte-
identical copies in `public/`, same "build the renderer against a handwritten mock first"
convention `fixtures/mock-city.json` established for V1) — four months exercising a building
appearing (`b-notifications`, added in `-02`), a building vanishing (`b-format`, dropped in `-03`;
`b-notifications` again in `-06`), metric/height growth, and a real gap (`-03` -> `-06` skips
April/May, `gapBefore: true` on the `-06` entry).

## Fixtures

- `fixtures/sample-project-src/` + `fixtures/build-fixture.mjs` — the 15-file, 4-directory,
  6-commit deterministic git fixture used by `tests/analyzer.test.ts`.
  `fixtures/MANIFEST.md` is the ground truth for every exact number (LOC, import edges, churn)
  asserted against it — derive new assertions from that file, don't re-derive by hand.
- `fixtures/mock-city.json` (byte-identical copy at `public/mock-city.json`, which the 3D
  renderer lane builds against ahead of `compileCity` existing — see
  `docs/PROJECT_IDEA.md` §9.2) — a handwritten, `validateCity`-clean `CityModel`: 3 districts,
  12 buildings, 8 roads.
- `fixtures/mock-city-v4.json` — V4's equivalent: same 3 districts / 12 buildings, plus 2
  datastore landmarks and 2 identityLinks (a 3-building cross-district group, a 2-building pair).
  See "V4: datastores + clone identity" below.

## Signatures (fixed — do not change without updating all three contract docs + the RED gates together)

```ts
analyzeRepo(repoPath: string): Promise<RepoGraph>   // src/analyzer/index.ts
mergeRepoGraphs(graphs: {name: string, graph: RepoGraph}[]): RepoGraph  // src/analyzer/merge.ts — pure, sync
compileCity(graph: RepoGraph, options?: { cloneLodScope?: "district" | "directory" }): CityModel
                                                     // src/compiler/index.ts — pure, sync. cloneLodScope
                                                     // defaults to "district" (bit-for-bit unchanged if
                                                     // omitted) — see "D4" in docs/CONTRACT-city-json.md.
render2d(city: CityModel): string                   // src/renderer/svg.ts — pure, sync

// V4 (see "V4: datastores + clone identity" above)
hashFileContent(bytes: Uint8Array | string): string                       // src/analyzer/content-hash.ts
detectDatastores(files: {path: string, content: string}[]): DatastoreSpec[]  // src/analyzer/datastores.ts
buildLandmarks(city: CityModel): THREE.Group                              // src/renderer/landmarks.ts
buildTethers(city: CityModel, buildingCenter: (id: string) => THREE.Vector3 | null): THREE.Group  // src/renderer/tethers.ts

// Phase 4 (see "Phase 4: git time-travel (timeline scrub)" above)
buildTimelineManifest(entries: TimelineManifestInput[]): TimelineManifest  // src/compiler/sequence.ts — pure, sync
morphBuilding(from: Building | undefined, to: Building | undefined, t: number): MorphedBuilding | null  // src/renderer/morph.ts — pure
morphBuildings(fromCity: CityModel, toCity: CityModel, t: number): MorphedBuilding[]                    // src/renderer/morph.ts — pure
buildTimeline(snapshots: TimelineSnapshot[], initialLens?: LensId): TimelineHandle  // src/renderer/timeline.ts
```

## Status (contract lane)

All core modules are **fully implemented**:

| Module | Location | Status | Test File | Result |
|---|---|---|---|---|
| `analyzeRepo()` | `src/analyzer/index.ts` | ✓ Implemented | `tests/analyzer.test.ts` | ✓ 8 passing |
| `mergeRepoGraphs()` | `src/analyzer/merge.ts` | ✓ Implemented | `tests/merge.test.ts` | ✓ 16 passing |
| `compileCity()` | `src/compiler/index.ts` | ✓ Implemented | `tests/compiler-determinism.test.ts` | ✓ 5 passing |
| | | | `tests/compiler-layout.test.ts` | ✓ 15 passing |
| `render2d()` | `src/renderer/svg.ts` | ✓ Implemented | `tests/render2d.test.ts` | ✓ 21 passing |
| Type validators | `src/types.ts` | ✓ Implemented | `tests/types.test.ts` | ✓ 7 passing |

**V4 modules** (datastore + clone identity):
- `hashFileContent()` — `src/analyzer/content-hash.ts` — ✓ Implemented (`tests/content-hash.test.ts`: 6 passing)
- `detectDatastores()` — `src/analyzer/datastores.ts` — ✓ Implemented (`tests/datastores.test.ts`: 7 passing)
- `buildLandmarks()` — `src/renderer/landmarks.ts` — ✓ Implemented (`tests/landmarks-render.test.ts`: 7 passing)
- `buildTethers()` — `src/renderer/tethers.ts` — ✓ Implemented (`tests/identity-links.test.ts`: 16 passing)

**Phase 4 modules** (timeline scrub):
- `buildTimelineManifest()` — `src/compiler/sequence.ts` — ✓ Implemented (`tests/sequence.test.ts`: 20 passing)
- `morphBuilding()` / `morphBuildings()` — `src/renderer/morph.ts` — ✓ Implemented (`tests/morph.test.ts`: 13 passing)
- `buildTimeline()` — `src/renderer/timeline.ts` — ✓ Implemented (`tests/timeline.test.ts`: 7 passing)

**Overall: 330 tests passing across 31 files**.
