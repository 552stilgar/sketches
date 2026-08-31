# Contract: city.json (CityModel)

- Producer: `compileCity(graph: RepoGraph): CityModel` — `src/compiler/index.ts` — **pure,
  deterministic**: same input graph → byte-identical output, always. No `Date.now()`, no
  `Math.random()`, no object-key-order or `Set`/`Map`-iteration dependence.
- Consumer: `render2d(city: CityModel): string` (`src/renderer/svg.ts`) and, eventually, the
  Three.js renderer — which currently builds directly against the handwritten
  `fixtures/mock-city.json` / `public/mock-city.json`, ahead of `compileCity` existing (see
  `docs/PROJECT_IDEA.md` §9.2, "hand-write mock city.json first").
- Validator: `validateCity(x: unknown): { ok: boolean; errors: string[] }` — `src/types.ts`

## Shape

```ts
interface District {
  id: string;       // unique among districts
  name: string;
  x: number; y: number; width: number; depth: number;  // rect, canvas coordinates, top-left origin
  style: string;    // dominant-language style tag, see docs/PROJECT_IDEA.md §4.2
}

interface Building {
  id: string;         // unique among buildings. MUST equal the source RepoGraph node's id it was
                       // compiled from (or, at directory-level LOD, the directory's own id) —
                       // this is what lets a renderer/UI join a building back to its metrics.
  x: number; y: number; width: number; depth: number; height: number;  // canvas coords + height
  style: string;
  metrics: { loc: number; complexity: number; churn: number; age?: number };
}

interface Road {
  from: string; to: string;   // building ids
  weight?: number;            // structural edge multiplicity, integer >= 1 — see "Road weight"
}

interface Landmark {
  id: string; x: number; y: number;
  kind: string;      // open string; V4 emits exactly one: "datastore" (see "Landmarks" below)
  label?: string;     // display label, e.g. a datastore's directory-derived name ("auth-db")
  weight?: number;     // scale signal, meaning defined per `kind` — for "datastore", TABLE COUNT
}                                                        // [] is valid — no landmarks is legal

interface IdentityLink { hash: string; members: string[]; }  // V4 — see "Clone identity" below.
                                                                // [] is valid — no clones found.

interface CityModel {
  districts: District[];
  buildings: Building[];
  roads: Road[];
  landmarks: Landmark[];
  identityLinks: IdentityLink[];
}
```

## Canvas

Fixed `1000 x 1000` coordinate space. `x`/`y` are the **top-left corner** of a rect in that space
(not centers). This is also, by convention (`docs/CONTRACT-render-svg.md`), the SVG `viewBox` —
`render2d` does not re-scale `city.json` coordinates.

## Urban grammar (fixed — do not redesign)

- **Footprint**: `width`/`depth` are proportional to `sqrt(loc)` — a file with 4x the LOC gets
  ~2x the footprint dimension, not 4x (`docs/PROJECT_IDEA.md` §3.2, §4.1). The scale constant is
  the compiler's choice; what's contractual is the `sqrt` relationship, applied identically to
  every building so relative sizes stay meaningful across a whole city.

  **Scale reference is the city's own distribution, not a fixed constant** (ratified 2026-08-28,
  after a dogfood run on `usul-qol` produced a district of near-identical footprints). The
  saturating form `sqrt(loc)/sqrt(loc + 200)` flattens toward `maximum` for every building once
  loc is large relative to the constant — which is the normal case at directory-aggregate LOD.
  Instead:

  ```
  locRef = p95(loc over all building sources in this city, nearest-rank), floored at 1
  side   = clamp(maximum * (0.08 + 0.92 * min(1, sqrt(loc) / sqrt(locRef))), floor, maximum)
  ```

  Below `locRef` this is exactly proportional to `sqrt(loc)` (the contractual relationship, now
  actually observable); the top 5% clamp at `maximum` so a single outlier cannot compress the
  rest of the city into one bucket. `p95` is **nearest-rank on a sorted array** — no
  interpolation, no ties ambiguity — so the function stays a pure, byte-deterministic function
  of the graph. Degenerate cities (one building; every loc equal) are well-defined: every
  building lands at `maximum`.

- **Height**: bounded band, normalized the same way — raw complexity is NOT a world-space
  dimension (ratified 2026-08-28: the same dogfood run produced a height of 2961 inside a
  1000-wide canvas, which reads as a spike, not a skyline).

  ```
  cRef   = p95(complexity over all building sources, nearest-rank), floored at 1
  height = HEIGHT_MIN + (HEIGHT_MAX - HEIGHT_MIN) * min(1, sqrt(complexity) / sqrt(cRef))
  HEIGHT_MIN = 4, HEIGHT_MAX = 180
  ```

  Footprint and height are normalized **independently**, which is what preserves the diagnostic
  reading the whole metaphor rests on (`§4.1`): small footprint + tall = little code doing too
  much; large + short = lots of straightforward code; large + tall = the monster.

- **District**: one district per top-level directory (see LOD below).

## Road weight (fixed — do not redesign)

Roads are **not** a deduplicated adjacency set. Each `Road` carries `weight`: the number of
`(source node, resolved target)` pairs that route along that `(from, to)` building pair, counting
`imports[]` and `calls[]` entries alike, one per occurrence.

- At file LOD, `A imports B` once ⇒ `weight: 1`. At directory LOD, a building aggregating seven
  files that each import into the same target building ⇒ `weight: 7`.
- Duplicate entries within one node's `imports[]`/`calls[]` each count. Multiplicity IS the
  signal — that is the whole point of the field (`PROJECT_IDEA.md` §5.5, structural traffic tier).
- Self-edges (`from === to`) are still dropped, as before.
- `weight` is an integer `>= 1`. A road with weight 0 is not a road; it must be absent.
- The compiler **MUST** emit it. It is optional in `types.ts` only so the field could land ahead
  of the compiler that fills it; a renderer reading `city.json` treats a missing weight as `1`
  (an *unweighted* road), never as zero traffic.

The compiler emits weights; the **renderer** owns anything animated from them. `compileCity` stays
a pure function with no clock and no randomness — no frame timing, pulse rate, or dash offset ever
appears in `city.json` (`PROJECT_IDEA.md` §5.5, determinism constraint).

## Building age (`metrics.age`, V5.4)

`metrics.age` is `compileCity`'s carry-through of `RepoNode.age` (`docs/CONTRACT-repo-json.md`
§ "Determinism rule: age") into `city.json`, feeding the scaffolding overlay
(`src/renderer/props.ts` `selectScaffoldSites`, sibling of the V5.2 churn → crane overlay).

- At file LOD, `metrics.age` is that file's own `age` unchanged.
- At directory/clone-group LOD, `metrics.age` is the **minimum** age across the building's member
  files — the youngest member, not a sum or average — because the question this field answers is
  "does this location contain a newly-created file", which a blended average would wash out the
  moment one old sibling file joins the group. Contrast `metrics.churn`, which sums (total
  activity, not recency, is the question there).
- Optional in `types.ts` for the same reason `Road.weight` is: so a `city.json` compiled before
  this field shipped stays valid. `compileCity` **MUST** always emit a real value for every
  building going forward — `RepoNode.age` is a required, always-measured field (git history alone
  determines it; unlike `todoCount` there is no "unsupported language" absence case). A renderer
  reading a missing `metrics.age` (an older `city.json`) **must** treat it as UNMEASURED, never as
  age `0` — a missing signal reading as "brand new" is exactly the fabricated-zero failure
  `PROJECT_IDEA.md` §5.5 constraint 2 already ruled out project-wide.

## Landmarks (V4)

`Landmark.kind` is an open string, but V4's analyzer/compiler pipeline emits exactly one kind:
`"datastore"`, one per `DatastoreSpec` detected by `detectDatastores`
(`docs/CONTRACT-repo-json.md` § "Datastore detection"). `label` is the datastore's directory-
derived display name; `weight` is its `tableCount` — schema-derived, never sized from a live
`.db` file (D1, same rule the analyzer side is built on: a landmark's geometry must not change
just because the app ran for another hour).

## Clone identity (V4)

`identityLinks` groups buildings compiled from byte-identical source files (`RepoNode.contentHash`,
`docs/CONTRACT-repo-json.md` § "Clone identity / content hash"). `compileCity` groups file nodes
by `contentHash`, keeping only groups with 2+ members (a hash held by a single node is not a clone
group and produces no `IdentityLink`); `members` holds the resulting building ids, **sorted by
codepoint** (`compareCodepoints`, `src/util/compare.ts`) for determinism, same discipline as every
other ordering rule on this page. A node with no `contentHash` never contributes to any group.

**D2 — IDENTITY LINKS ARE NOT ROADS.** A `Road` asserts traffic; vendored copies carry ZERO
traffic between them — that is the entire finding an `IdentityLink` exists to show. Nothing in
`compileCity` may turn an `IdentityLink` into a `Road` (or vice versa) — they are disjoint fields
for a reason. The renderer gives clone identity its own visual channel
(`src/renderer/tethers.ts`): elevated above road height, **static** (no dash animation, no
per-frame update, no clock read), no dashes at all — visibly not-a-road, so a viewer who sees
motion on roads and stillness on tethers learns the difference in one glance.

**D3 — exact hash only.** See `docs/CONTRACT-repo-json.md` § "Clone identity / content hash" for
the full rule; it applies identically here — `compileCity` must never widen exact-hash grouping
into any form of near-duplicate clustering.

## Layout algorithm (fixed — do not redesign)

1. Hierarchical spatial allocation first — treemap/Voronoi subdivision for districts.
2. Graph-force adjustment second, and only **within** a district — never across district
   boundaries, never before step 1.
3. Deterministic throughout: stable sort by node id, no unseeded randomness, slot positions
   derived from path identity — never insertion order or `Set`/`Map` iteration order.

**Non-negotiable invariant** — this is what `tests/compiler-determinism.test.ts` gates: if one
file's metrics change, ONLY that file's building may move or resize. Every other building's
`x`/`y` must be byte-identical to the previous compile. A single edited function must never
rearrange the skyline (`docs/PROJECT_IDEA.md` §3.2: *"If I render a repo today and tomorrow and
one function changed, the whole city must not rearrange."*).

**Structural invariants** — gated by `tests/compiler-layout.test.ts`:
- No two buildings' axis-aligned bounding boxes overlap (touching edges are fine).
- Every building is fully contained within at least one district's rect.
- Every `Road.from`/`Road.to` references an id present in `buildings`.

## LOD (Level of Detail) — fixed table, do not redesign

| Repo size (file-node count) | Buildings represent | Districts |
|---|---|---|
| < 50 files | files (1 building per file) | one per top-level directory |
| 50–500 files | files (1 building per file) | one per top-level directory |
| > 500 files | directories | one per top-level directory (buildings are the level below it) |

The only thing that changes across the three bands is what a *building* is. Districts are
**always** one per top-level directory of the input `RepoGraph`, at every band — this is the
ratified reading (contract lane, 2026-08-21) of `docs/PROJECT_IDEA.md`'s Phase-2 LOD bullets,
which call out the district-grouping detail explicitly only for the 50–500 band; it applies
uniformly. `tests/compiler-layout.test.ts` asserts this at the 200-file band directly.

**D4 — clone-aware LOD exemption (V4).** At >500 files, `selectBuildingSources`
(`src/compiler/grammar.ts`) normally aggregates a whole directory into one building — which means
a clone-bearing directory would have nothing for an `IdentityLink` to attach to, exactly the gap
a 2026-08-28 dogfood run hit (a merged 618-node city with three vendored kernel copies couldn't
show any of them once directory-level LOD kicked in). The rule: **a directory containing any file
that participates in an `IdentityLink` KEEPS FILE GRANULARITY**, even past the 500-file threshold
— every other directory still collapses exactly as before. The threshold itself stays 500; only
clone-bearing directories are exempted from the aggregation step. `tests/identity-links.test.ts`
("clone-aware LOD" describe block) is the RED gate for this exemption; `tests/compiler-layout.test.ts`
remains the gate for the ordinary (non-clone) aggregation behavior, unchanged.

**`cloneLodScope` option (Lane B, 2026-08-29).** "A directory containing any file" above was
ambiguous between two readings, and the one that shipped in V4 (whole top-level district) turned
out to have a real cost: one duplicated file pair anywhere in a district drags that district's
*entire* contents back to file LOD, regardless of size. On a real merged city this took building
count from 21 to 625. Both readings now exist as an explicit, selectable option on `compileCity`:

```ts
compileCity(graph: RepoGraph, options?: { cloneLodScope?: "district" | "directory" }): CityModel
```

- `"district"` (default — omitting the option is bit-for-bit identical to pre-Lane-B output): a
  clone-participating file exempts its whole top-level district from aggregation, as originally
  specified above.
- `"directory"`: exemption is scoped to just the aggregation GROUP the clone file itself falls
  into — the same key `selectBuildingSources`'s internal `groups` map partitions on (a file's
  immediate top-level directory, or its second-level directory when nested deeper than that).
  Non-clone-bearing sibling directories inside the same district still collapse to directory LOD
  exactly as they would with zero clones anywhere in the repo.

In both modes every `IdentityLink.members` entry MUST resolve to a real building id — a tether
pointing at a collapsed/aggregated node is a hard failure (`compileCity` throws), never a
silently-dropped or warned-about link; see the "no building for clone member" throw in
`src/compiler/index.ts`. `bin/compile.ts` exposes the option as `--clone-lod-scope=<value>`,
failing loudly (non-zero exit, listing the valid set) on anything else. Which mode ships as the
long-term default is Usul's aesthetic call, made by eye against a real repo — this option makes
that call deferrable rather than baked in.

## District area-weighting (`districtWeightMode`, V5.1)

Districts are squarified into the fixed 1000x1000 layout canvas by WEIGHT
(`src/compiler/layout.ts` `squarify`); the weight fed in for one district was originally its raw
file count (a straight linear map). `CompileCityOptions.districtWeightMode` makes the curve
applied to that count an explicit, named option:

```ts
compileCity(graph: RepoGraph, options?: { districtWeightMode?: "linear" | "sqrt" | "log" | "derived" }): CityModel
```

- `"linear"`: raw count, unmodified — the original behavior, still reachable byte-for-byte.
- `"sqrt"` / `"log"`: fixed compression curves (`Math.sqrt`, `Math.log1p`) that dampen the gap
  between a large district and a small one. `"log"` was the default from 2026-08-30–2026-08-31.
- `"derived"` (default since 2026-08-31): the exponent `p` of a `count ** p` curve is SOLVED per
  compile from the actual district counts (`deriveDistrictWeightExponent`), not fixed. It picks the
  LARGEST `p` (least distortion — `p = 1` is exact linear) such that the smallest district's canvas
  share still clears `MIN_DISTRICT_SHARE_DEFAULT` (a legibility floor derived from the district
  label sprite's fixed world-space size, `src/renderer/buildings.ts`). A well-balanced repo is left
  at `p = 1`, untouched; only a genuinely lopsided one gets compressed, and only as far as
  legibility demands.

Why: a FIXED curve (`"log"`) was ruled in on one repo's shape (a 3-district city, hundreds of
files per district) and turned out to be wrong on another (the folded usul-mgmt repo,
`modules 1103 / test 36 / src 23 / bin 4 / lib 1 / scripts 1`) — under `"log"`, five districts
holding 65 files between them took 59.6% of the canvas while the 1103-file district got 40.3%,
worse than the imbalance `"log"` was chosen to fix. `"derived"` generalizes across repo shapes
instead of re-litigating the ruling per repo.

This does **not** violate the determinism contract above: `"derived"` is a pure function of the
graph's own district counts (no clock, no randomness, fixed-iteration bisection — see
`deriveDistrictWeightExponent`'s doc comment) — the same `(graph, options)` pair always compiles to
the same `CityModel`. `"linear"`, `"sqrt"`, and `"log"` all remain explicit, named opt-outs: any
city compiled under any of the three curves (including every city compiled before 2026-08-31)
reproduces byte-for-byte by naming that mode on `bin/compile.ts` (`--district-weight=<value>`),
which fails loudly (non-zero exit, listing the valid set) on anything else — same posture as
`--clone-lod-scope` above.

## Validation

`validateCity` checks: `districts`/`buildings`/`roads`/`landmarks` are present; every
district/building has the required fields with correct types (`metrics.loc`/`.complexity`/
`.churn` included; `metrics.age`, when present, must be a non-negative number — it is legally
absent altogether, see "Building age" above); every district id is unique among districts and every building id is unique
among buildings; every road's `from`/`to` resolves to a real building id (dangling road refs are a
hard validation failure); a landmark's `label`/`weight`, when present, are a non-empty string /
non-negative number respectively. It does **not** check the geometric invariants above (no-overlap,
containment, footprint-vs-loc proportionality, byte-identical determinism) — those are compiler
*behavior* checks owned by `tests/compiler-layout.test.ts` and `tests/compiler-determinism.test.ts`,
not schema-shape checks.

**`identityLinks` (V4)**: unlike the four fields above, a **missing** `identityLinks` key is
legal — every `city.json` written before V4 lacks it entirely, and `validateCity` must keep
accepting those files unchanged (reader-side leniency; `compileCity` is still obligated to always
*emit* the array, per its own contract above — this asymmetry is deliberate, same shape as
`Road.weight`'s "optional in the type, mandatory from the producer" idiom). When `identityLinks`
**is** present: it must be an array, and each entry is validated as a hard error if — its `hash`
is not a lowercase hex sha256 string (64 hex characters); its `members` is not a string array;
`members` has fewer than 2 entries; or any `members` entry does not resolve to a real building id
(the same "dangling reference is a hard failure" discipline `roads[].from`/`.to` already gets).
