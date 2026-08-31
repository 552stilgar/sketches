# Code City — Contracts Index

Code City is a `repo → repo.json → city.json → svg/3d` compiler pipeline. Each arrow below is a
contract that lets the analyzer, compiler, and renderer be built — and tested — independently.

| Contract | Producer | Consumer | Spec |
|---|---|---|---|
| `repo.json` (RepoGraph) | `analyzeRepo()` — `src/analyzer/index.ts` | `compileCity()`, `mergeRepoGraphs()` | [docs/CONTRACT-repo-json.md](docs/CONTRACT-repo-json.md) |
| `RepoGraph.ruins` (deleted files) | `readRuins()` — `src/analyzer/ruins.ts` | `mergeRepoGraphs()` (no renderer consumer yet) | [docs/CONTRACT-repo-json.md](docs/CONTRACT-repo-json.md) § "Ruins (V5.3)" |
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

## V5.1: district area-weighting

Motivation: districts are squarified by weight, originally a district's raw file count (linear).
A fixed compression curve (`"log"`, ruled in 2026-08-30 against a 3-district city where every
district had hundreds of files) turned out to be exactly the class of defect
`normalizedHeightScale` (`src/renderer/massing.ts`) exists to fix for building height: a curve
ruled on one repo shape is wrong on another. On the folded usul-mgmt repo
(`modules 1103 / test 36 / src 23 / bin 4 / lib 1 / scripts 1`), `"log"` gave five districts
holding 65 files between them 59.6% of the canvas against the 1103-file district's 40.3%.

`CompileCityOptions.districtWeightMode` gains a `"derived"` mode (`src/compiler/layout.ts`
`deriveDistrictWeightExponent`) that solves the exponent of a `count ** p` curve per compile from
the graph's own district counts — least distortion (largest `p`, `p = 1` is exact linear) that
still keeps the smallest district above a legibility floor (`MIN_DISTRICT_SHARE_DEFAULT`, derived
from the district label sprite's fixed world-space size in `src/renderer/buildings.ts`). `"derived"`
is now the compiler default; `"linear"`, `"sqrt"`, and `"log"` remain explicit, named opt-outs that
reproduce their exact prior output. Full contract: `docs/CONTRACT-city-json.md` §
"District area-weighting (`districtWeightMode`, V5.1)". RED gate:
`tests/compiler-district-weight.test.ts`.

## V5.3: ruins (deleted files)

Motivation: every signal in `repo.json` so far describes files that EXIST at HEAD. A repo's
demolitions are history the city currently cannot show at all — a directory that lost half its
files in the last quarter looks identical to one that was always small. V5.3 adds
`RepoGraph.ruins`: the source files removed from the tracked tree inside the same HEAD-anchored
90-day window `churn` uses, and still absent at HEAD.

New producer/consumer pair:

| Contract | Producer | Consumer |
|---|---|---|
| `RepoGraph.ruins` | `readRuins()` — `src/analyzer/ruins.ts`, assigned by `analyzeRepo()` | `mergeRepoGraphs()` (namespaces `path`, carries through) |

Full field shape, detection rule, and validation: `docs/CONTRACT-repo-json.md` §§ "Ruins (V5.3)"
and "Determinism rule: ruins".

Three frozen decisions:

- **R1 — a ruin is NOT a `RepoNode`.** A deleted file has no current `loc`, `complexity`, `churn`,
  `age`, `contributors`, `imports`/`calls`, `contentHash`, or place in the tree — all UNMEASURED,
  not zero. Modelling one as a node would force seven fabricated zeros, each indistinguishable
  from a real tiny quiet brand-new file (the `318773d` failure mode; §5.5 constraint 2). Ruins get
  their own array and their own type so `nodes` can never yield one by accident.
- **R2 — the contract is narrower than the word "ruins" suggests, on purpose.** Only `path`,
  `language`, `deletedSha`, `deletedDate` and an optional, explicitly HISTORICAL `lastLoc` (the
  blob's line count at `deletedSha^`, counted by the same `countLines` a live `loc` uses, absent
  when the parent/blob is unreadable or binary). No complexity, no edges, no contributors, no
  position — a narrow true signal beats a rich invented one, and each of those would silently be
  compared against HEAD-measured values on live nodes.
- **R3 — renames are excluded, at an explicit `-M50%` threshold.** Git stores a rename as
  delete + add, and the `diff.renames` default has moved across git versions; a signal whose output
  depended on the operator's gitconfig would not be reproducible. `readRuins` requests rename
  detection on every invocation, so a renamed file is not a ruin. A rename SPLIT across two commits
  is still reported as a ruin plus a new file — git genuinely does not know they are the same
  file, and guessing would be the fabrication this contract exists to prevent.

**Shipped as a data-contract slice only** in this lane: `compileCity` did not read `ruins` and no
renderer treatment existed yet. How a ruin is drawn — and whether it can be placed at all, given it
has no location in the tree — was a later slice's decision. See "V5.3b: ruins placement" below for
that slice.

RED-turned-green this lane: `tests/ruins.test.ts` (real git fixtures: a deletion, a rename that
must not appear, a mixed rename+deletion commit, a re-add, the window boundary, and a
HEAD-anchoring determinism check).

## V5.3b: ruins placement (compiler + renderer)

Motivation: V5.3 above shipped `RepoGraph.ruins` as data only — nothing placed it in the city or
drew it. This lane compiles `RuinRecord[]` into `CityModel.ruins` (`RuinMarker[]`) and renders it,
OFF by default (this run's ruling: no new overlay's aesthetic ships before Usul has seen it
rendered, same posture V5.4/V6 already established).

New producer/consumer pair:

| Contract | Producer | Consumer |
|---|---|---|
| `CityModel.ruins` (`RuinMarker[]`) | `compileCity()` — `src/compiler/index.ts` | `buildRuins()` — `src/renderer/ruins.ts` ("Ruins" toggle, OFF by default) |

Full placement rule, footprint derivation, and renderer silhouette rationale:
`docs/CONTRACT-city-json.md` § "Ruins placement (V5.3b)".

Two frozen decisions:

- **P1 — a ruin's district is seeded, never invented.** A ruin's top-level directory
  (`topLevelPathOfFilePath`, `src/compiler/grammar.ts` — the same derivation `topLevelPath` gives
  every live node) gets a district rectangle even when every live file in it is gone and no
  datastore remains — same seeding rule the datastore-only-directory case already uses. This is
  the honest middle ground between silently dropping a demolished directory's ruins and inventing
  a district shape that has no basis in the graph.
- **P2 — footprint is a fixed fraction of the slot, never `RuinRecord.lastLoc`.** `lastLoc` (when
  present) is a real measurement, but of the file at the commit before it was deleted — a
  DIFFERENT instant than every other size in this city (`headDate`). Sizing a marker from it would
  silently present a historical number as a live one. `RUIN_FOOTPRINT_FRACTION = 0.35` of the
  reserved shelf-grid slot's `maxSide` is a rendering choice, not a measurement, and it is the ONLY
  input to a ruin's size.

Not a `props.ts` `PropSpec`: those are a runtime overlay computed from `city.buildings`, never part
of `CityModel`, and keyed to an anchor `buildingId` a ruin doesn't have. `landmarks.ts` — a
first-class `CityModel` array with its own resolved `x`/`y`/footprint — is the correct precedent;
`src/renderer/ruins.ts`'s own header carries the full comparison.

RED-turned-green this lane: `tests/compiler-ruins.test.ts` (placement, non-overlap with buildings
and other ruins, demolished-directory seeding, footprint independence from `lastLoc`, determinism,
cross-district isolation) and `tests/ruins-render.test.ts` (discoverability, grounded positioning,
sub-`HEIGHT_MIN` height cap, determinism, static-module check).

## V5.4 + V6: age extremes -> scaffolding + patina/weathering overlays

Motivation: `RepoNode.age` (V1, `docs/CONTRACT-repo-json.md` "Determinism rule: age") already
carried age structurally, but nothing rendered it — these are renderer slices plus a small
compiler-side wiring slice, not a new analyzer signal. `compileCity` now threads age through to
`Building.metrics.age` / `.newestAge` / `.ageMeasured`
(`docs/CONTRACT-city-json.md` § "Age extremes"), feeding two independent, OFF-by-default overlays
(`src/main.ts` layer controls) so the default city render is byte-for-byte unchanged with both
layers off.

New producer/consumer pairs:

| Contract | Producer | Consumer |
|---|---|---|
| `Building.metrics.age` (MAX) | `compileCity()` — `src/compiler/index.ts`, via `aggregateAge()` (`src/compiler/grammar.ts`) | `applyWeathering()` — `src/renderer/buildings.ts` ("Weathering" toggle) |
| `Building.metrics.newestAge` (MIN) | same | `selectScaffoldSites()` — `src/renderer/props.ts` ("Scaffolding" toggle) |
| `Building.metrics.ageMeasured` | same | both of the above — gates each one |

**A1 — two extremes, two fields.** The weathering overlay asks "how old is the oldest wing"
(MAX) and the scaffolding overlay asks "was something just added here" (MIN). These are opposite
reductions of the same measurement and cannot share one `age` field; the two lanes that built
these overlays each defined `metrics.age` for their own question, and merging them onto a single
field would have silently broken whichever definition lost. They are split at merge (P3) into
`age` and `newestAge`, both emitted by the same `aggregateAge()` so they can never drift apart.

**A2 — `ageMeasured` is the never-fabricate guard, and it is what makes MIN safe.** `age: 0` from
the analyzer's no-commits fallback (`src/analyzer/git.ts`, `firstDate ? ... : 0`) and `age: 0`
from a file created on HEAD day are indistinguishable (both are real `0`s, not absences, so
`todoCount`'s "absent = unmeasured" trick doesn't apply to `age` itself). `aggregateAge()`
therefore reduces over members with `contributors.length > 0` ONLY. An unfiltered MIN would let a
single never-committed file pull `newestAge` to `0` and raise scaffolding on an untouched
building — the `318773d` failure mode (§5.5 constraint 2) reintroduced.

All three fields are optional in the TYPE for the same reason `contentHash`/`todoCount` are:
every `Building` fixture already in this repo, and every already-committed `public/*.json` city,
predates them. Full field shape and both aggregation rules: `docs/CONTRACT-city-json.md` §
"Age extremes".

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
compileCity(graph: RepoGraph, options?: {
  cloneLodScope?: "district" | "directory";
  districtWeightMode?: "linear" | "sqrt" | "log" | "derived";
}): CityModel
                                                     // src/compiler/index.ts — pure, sync. cloneLodScope
                                                     // defaults to "district" (bit-for-bit unchanged if
                                                     // omitted) — see "D4" in docs/CONTRACT-city-json.md.
                                                     // districtWeightMode defaults to "derived" (see
                                                     // "V5.1: district area-weighting" below and
                                                     // docs/CONTRACT-city-json.md § "District area-weighting").
render2d(city: CityModel): string                   // src/renderer/svg.ts — pure, sync

// V4 (see "V4: datastores + clone identity" above)
hashFileContent(bytes: Uint8Array | string): string                       // src/analyzer/content-hash.ts
detectDatastores(files: {path: string, content: string}[]): DatastoreSpec[]  // src/analyzer/datastores.ts

// V5.3 (see "V5.3: ruins (deleted files)" above)
readRuins(repoPath: string, headDate: string): Promise<RuinRecord[]>      // src/analyzer/ruins.ts — HEAD-anchored window, never Date.now()
buildLandmarks(city: CityModel): THREE.Group                              // src/renderer/landmarks.ts
buildTethers(city: CityModel, buildingCenter: (id: string) => THREE.Vector3 | null): THREE.Group  // src/renderer/tethers.ts

// V5.3b (see "V5.3b: ruins placement" above)
buildRuins(city: CityModel): THREE.Group                                  // src/renderer/ruins.ts

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

**V5.3 module** (ruins):
- `readRuins()` — `src/analyzer/ruins.ts` — ✓ Implemented (`tests/ruins.test.ts`: 14 passing)

**V5.3b modules** (ruins placement — compiler + renderer):
- `compileCity()` ruins placement — `src/compiler/index.ts` — ✓ Implemented (`tests/compiler-ruins.test.ts`: 13 passing)
- `buildRuins()` — `src/renderer/ruins.ts` — ✓ Implemented (`tests/ruins-render.test.ts`: 8 passing)

**V5.4 + V6 modules** (age extremes → scaffolding + weathering overlays):
- `aggregateAge()` — `src/compiler/grammar.ts` — ✓ Implemented (`tests/compiler-age.test.ts`: 10 passing)
- `selectScaffoldSites()` / `buildScaffoldMeshes()` — `src/renderer/props.ts` — ✓ Implemented (`tests/props-scaffold.test.ts`: 17 passing)
- `applyWeathering()` / `setAgeOverlay()` — `src/renderer/buildings.ts` — ✓ Implemented (`tests/buildings.test.ts`)

**Overall: 494 tests passing across 43 files**.
