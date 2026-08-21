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
  metrics: { loc: number; complexity: number; churn: number };
}

interface Road { from: string; to: string; }  // building ids

interface Landmark { id: string; x: number; y: number; kind: string; }  // [] is valid — Phase 2
                                                                          // does not require any

interface CityModel {
  districts: District[];
  buildings: Building[];
  roads: Road[];
  landmarks: Landmark[];
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
- **Height**: `height = max(1, complexity)`.
- **District**: one district per top-level directory (see LOD below).

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

## Validation

`validateCity` checks: all four top-level arrays are present; every district/building has the
required fields with correct types (`metrics.loc`/`.complexity`/`.churn` included); every
district id is unique among districts and every building id is unique among buildings; every
road's `from`/`to` resolves to a real building id (dangling road refs are a hard validation
failure). It does **not** check the geometric invariants above (no-overlap, containment,
footprint-vs-loc proportionality, byte-identical determinism) — those are compiler *behavior*
checks owned by `tests/compiler-layout.test.ts` and `tests/compiler-determinism.test.ts`, not
schema-shape checks.
