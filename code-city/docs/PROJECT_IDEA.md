# Code City — PROJECT IDEA

> A codebase-to-urban-model compiler. Turn any code repository into an explorable, deterministic 3D city.

---

## 1. Elevator Pitch

Code City is a **repo → semantic graph → city model → renderer** pipeline that converts arbitrary code repositories into explorable 3D cities. It is **not** a visualization script — it is a compiler. The renderer knows almost nothing about code. It receives an abstract city description generated upstream and renders it.

The city becomes an alternative code navigation interface: zoom out to see districts, zoom in to see files, click buildings to see metrics, and scrub through time to watch the codebase evolve.

---

## 2. Core Philosophy

| Principle | Rationale |
|-----------|-----------|
| **Compiler, not viz** | repo → city.json → renderer. Decoupled, testable, multi-target. |
| **Deterministic geography** | Same code structure → same city layout. Stability turns a toy into a tool. |
| **Semantics determine geography; language determines architecture** | Folders/packages decide *where* things are. Language decides *how* things look. |
| **Metric-driven & temporal** | Buildings encode real metrics (LOC, complexity, churn). Git history provides a 4th dimension. |
| **Exhaustive, not curated** | Every file/class/module is represented. No hand-picked "important" nodes. |

---

## 3. Pipeline Architecture

```
Repository
    ↓
[ ANALYZER ]  →  repo.json  (semantic graph)
    ↓
[ COMPILER ]  →  city.json  (urban model)
    ↓
[ RENDERER ]  →  3D city / 2D map / static image
```

### 3.1 Analyzer: repo → repo.json

Extracts a language-independent semantic graph:

```
Node {
  id
  type: "repo" | "package" | "module" | "file" | "class" | "function"
  language
  name
  path
  loc
  complexity
  churn
  age
  contributors
  imports[]
  calls[]
  contains[]
}
```

**Data sources (progressive enrichment):**
- Filesystem + `.gitignore` respect
- Tree-sitter parsing (imports, classes, functions, AST)
- Git history (age, churn, contributors, commit frequency)
- Optional: test coverage, lint issues, runtime profiling

**Start with:** TypeScript + Python support. Tree-sitter gives multi-language architecture without writing N parsers.

### 3.2 Compiler: repo.json → city.json

Produces an abstract city description:

```json
{
  "districts": [...],
  "buildings": [
    {
      "id": "auth/UserService.ts",
      "x": 145,
      "y": 327,
      "width": 14,
      "depth": 18,
      "height": 72,
      "style": "typescript",
      "metrics": {
        "loc": 483,
        "complexity": 31,
        "churn": 0.72
      }
    }
  ],
  "roads": [...],
  "landmarks": [...]
}
```

**Layout strategy:**
1. **Hierarchical spatial allocation first** — treemap / Voronoi subdivision for districts
2. **Graph forces second** — light connectivity-based adjustment *within* districts
3. **Preserve deterministic positioning** — stable sorting, seeded random, path-based slots

**Critical rule:** If I render a repo today and tomorrow and one function changed, the whole city must not rearrange.

### 3.3 Renderer: city.json → Scene

Multiple renderers possible:
- **WebGL / Three.js** (primary — interactive explorer)
- **2D SVG map** (fast debug / layout iteration view)
- **Static PNG**
- **Godot / Unity**

The renderer is **dumb** — it only understands buildings, roads, districts, and styles.

---

## 4. Urban Grammar

### 4.1 Core Metaphors

| Code Concept | City Metaphor |
|--------------|---------------|
| Repository | Entire city |
| Top-level package/domain | District |
| Module/folder | Block / neighborhood |
| File | Lot / building |
| Class | Building |
| Function/method | Floor / room |
| LOC | Building footprint |
| Complexity | Height |
| Dependency usage | Building importance / centrality |
| Imports | Roads |
| Function calls | Smaller streets / transit |
| External dependency | Port / outside highway |
| Tests | Police / fire / service buildings |
| Database | Industrial / infrastructure complex |
| API endpoint | City gate / station |
| Dead code | Abandoned building |
| High churn | Construction cranes |
| Old untouched code | Weathering / older architecture |

**Why this works:**
- `small footprint + tall` → little code doing too much (danger)
- `large footprint + short` → lots of straightforward code
- `large + tall` → gigantic complex monster

That alone gives the visualization **analytical value**.

### 4.2 Language → Architectural Style

Language should influence **aesthetics**, not geography.

| Language | Style |
|----------|-------|
| Python | Soft concrete / campus / low-rise |
| Rust | Brutalist / industrial / steel |
| Java | Dense corporate towers |
| JavaScript | Bright mixed-use blocks |
| TypeScript | Similar to JS but cleaner modern architecture |
| C | Industrial plants / machinery |
| C++ | Heavy industrial megastructures |
| SQL | Warehouses / utility infrastructure |
| HTML/CSS | Commercial storefront districts |

**Rule:** A mixed Python/JS project should not be physically split by language if backend and frontend conceptually belong together.

---

## 5. Key Features

### 5.1 Progressive Semantic Zoom

| Distance | View |
|----------|------|
| Far | "That's the payments district." |
| Medium | `risk-engine` neighborhood |
| Close | `DecisionService.ts` building |
| Click | Full metrics panel + source link |

**Clicking a building shows:**
- File path & name
- LOC, cyclomatic complexity
- Inbound / outbound dependencies
- Churn (commits / 90d)
- Primary owners
- Test coverage
- Highest-complexity functions
- Link to GitHub / VS Code

### 5.2 Git History & Time Travel

Git provides a **4th dimension: time**.

Scrub a timeline slider (`2021 ──────── 2026`) and watch:
- New modules appear as new neighborhoods
- Refactors demolish and replace buildings
- Monoliths gradually split into districts
- Rewrites create new skylines

**Temporal overlays:**
- Recent changes → cranes / scaffolding
- Frequent bugs → warning markers
- Ownership → flags / logos
- Code age → architectural aging
- TODO density → unfinished buildings
- Technical debt → decay
- Test coverage → building condition
- Deprecated code → abandoned structures
- Security hotspots → red-alert areas

### 5.3 City Lenses

Same geography, different visual overlays:

| Lens | What it shows |
|------|---------------|
| **Architecture** | Hierarchy, modules, dependencies (default) |
| **Complexity** | Complexity, LOC, coupling, duplication |
| **Activity** | Commits, authors, churn |
| **Quality** | Coverage, lint issues, TODOs, bugs |
| **Runtime** | Service calls, CPU, latency, traffic |

**Critical:** Building positions do not change when switching lenses. Users learn spatial landmarks, then switch views.

### 5.4 Adaptive Granularity (LOD)

Don't insist `1 file = 1 building` for every repo.

| Repo Size | Building Represents |
|-----------|---------------------|
| < 50 files | Functions → buildings |
| 50–500 files | Files / classes → buildings |
| > 500 files | Modules / packages → buildings |

Otherwise a big monorepo becomes São Paulo rendered one brick at a time.

### 5.5 Liveness & Traffic

A city with no movement is a model of a city. Dependencies and calls are not just topology — they
are **flow**, and rendering them as flow is what separates an explorable city from a bar chart in
3D. Roads should carry visible traffic whose intensity encodes how much actually moves along that
edge; buildings should look occupied in proportion to how much of the system routes through them.

**Three sources of "traffic," deliberately kept distinct:**

| Tier | Source | Available | Means |
|------|--------|-----------|-------|
| **Structural** | `imports[]` / `calls[]` edge multiplicity, fan-in, betweenness | now (imports); `calls[]` unpopulated | "how much of the codebase routes through here" |
| **Historical** | Git co-change coupling, churn | now | "how much *developer* traffic this edge sees" |
| **Measured** | OTel traces, profiler samples, log volume, via an optional `traffic.json` sidecar | future | "what actually executed, how often, how slow" |

**Rendering vocabulary:**
- **Road tiering** — footpath / street / arterial / highway by edge weight. Static, and on its own
  makes the graph legible without a single animated pixel.
- **Animated flow** — particles or an offset dash travelling the edge, rate ∝ weight. Direction
  defaults to **data flow** (`A imports B` ⇒ animate B→A: results flowing up out of the leaves
  toward entry points), not control flow. Cheap to implement as a scrolling texture offset.
- **Occupancy** — building facade emissive density ∝ fan-in. Hubs glow; leaves are dim.
- **Interchanges** — high-betweenness nodes render as stations/gates (§4.1 "API endpoint = city gate").
- **Dead code** — zero fan-in falls straight out of this: unlit, no traffic, abandoned.

**Constraint — determinism is not negotiable (§3.2).** The compiler emits *weights*; the renderer
owns *animation*. `compileCity` stays a pure function with no clock and no randomness — pulse rate,
particle density, and dash offset are all renderer-side functions of a static number. A frame timing
must never appear in `city.json`.

**Constraint — never fabricate flow.** Structurally-derived traffic and measured runtime traffic
must be distinguishable (by lens name at minimum). A module with no runtime data renders as
**unmeasured**, not as **quiet** — dark-because-nobody-looked is not dark-because-nothing-runs.
Prior art for why this rule exists: a churn heuristic that invented data from commit-message
prefixes was written, shipped, and had to be deleted (`318773d`).

**Known gaps blocking this:** `calls[]` is declared and validated in `types.ts` but the analyzer
never populates it. `Road` is `{from, to}` with no weight, and `compiler/index.ts` dedupes edges
through a `Set`, discarding multiplicity at compile time — both are `city.json` contract changes.

---

## 6. Differentiation: Code City vs. CodeTerrain

| | CodeTerrain | Code City |
|--|-------------|-----------|
| **Fundamental object** | System architecture | Entire codebase |
| **Building represents** | Runtime role / component | File / class / module (adaptive LOD) |
| **Geography** | Architectural relationships | Actual structural topology |
| **Scale** | Curated 8–18 nodes | Potentially hundreds / thousands |
| **Edges** | Control / data / event flows | Imports / dependencies / calls |
| **Main goal** | Understand how system works | See what the codebase is |
| **Generation** | AI + curated semantic abstraction | Deterministic structural compiler |
| **Time dimension** | Not central | Git evolution is central |
| **Metrics** | Explanations + evidence | LOC, complexity, churn, coupling, coverage |

**CodeTerrain** = interactive architecture diagram as a miniature city.
**Code City** = Google Earth for a repository.

**Don't compete on "explain the architecture."** Compete on:

> **Structural · Metric-driven · Temporal**

Questions Code City answers that CodeTerrain doesn't:
- Where are the giant files?
- Where is complexity concentrated?
- Which district has the most coupling?
- Why is this tiny building connected to half the city?
- Which neighborhood has been under constant construction?
- Where is dead / abandoned code?
- What did this city look like two years ago?
- What changed between v2.4 and v3.0?
- Which engineer / team owns each neighborhood?

---

## 7. Implementation Plan

### Tech Stack
- **Vite** — fast HMR, simple config
- **Vanilla TypeScript** — fewer abstractions, easier Claude reasoning with Three.js
- **Three.js** — direct WebGL control
- **Tree-sitter** (`web-tree-sitter` or Node bindings) — multi-language parsing
- **simple-git** or raw `git log` — history extraction

### Project Structure

```
code-city/
├── src/
│   ├── analyzer/        # repo → repo.json
│   │   ├── scanner.ts
│   │   ├── parser.ts
│   │   ├── git.ts
│   │   └── index.ts
│   ├── compiler/        # repo.json → city.json
│   │   ├── layout.ts
│   │   ├── grammar.ts
│   │   └── index.ts
│   ├── renderer/        # city.json → Three.js scene
│   │   ├── scene.ts
│   │   ├── buildings.ts
│   │   ├── roads.ts
│   │   └── ui.ts
│   ├── types.ts         # shared schemas
│   └── main.ts
├── fixtures/            # small test repos
│   └── sample-project/
├── public/              # generated outputs
├── DESIGN.md            # architecture & schemas
└── index.html
```

---

### Phase 0: Foundation & Fixture
**Goal:** Working dev loop with immediate visual feedback.

- Scaffold Vite + TypeScript project
- Create analyzer / compiler / renderer modules (empty)
- Set up fixture repo (~15 files, 2–3 languages)
- Write `DESIGN.md` with `repo.json` and `city.json` schemas
- Install three.js + @types/three
- Basic Three.js scene: green ground plane + single box

**Test:** `npm run dev` shows a box.

---

### Phase 1: The Analyzer
**Goal:** Convert any repo into `repo.json`.

- Recursive directory scan (respect `.gitignore`)
- Language detection by extension
- Tree-sitter parsing: imports, top-level classes/functions, LOC
- Dependency graph (file → file imports)
- Git extraction: age, churn (90d), primary contributors
- Output `repo.json` per `DESIGN.md` schema
- CLI: `npm run analyze -- <repo-path> <output.json>`

**Constraint:** Pure data extraction. No visual decisions.
**Start with:** TypeScript + Python only.

---

### Phase 2: The City Compiler
**Goal:** Deterministic `repo.json` → `city.json`.

- **LOD selection:**
  - < 50 files → buildings = files
  - 50–500 → buildings = files, grouped by top-level directory
  - > 500 → buildings = directories (recursive)
- **Layout:**
  - Recursive treemap for districts (fixed canvas, e.g. 1000×1000)
  - Grid / packed layout within districts
  - Deterministic: stable sort, seeded random, path-based identity
- **Urban grammar:**
  - Footprint = sqrt(LOC) × scale
  - Height = cyclomatic complexity (or 1)
  - District style = dominant language
  - Roads = import edges (routed along boundaries or straight)
- CLI: `npm run compile -- <repo.json> <city.json>`

**Redirect if Claude suggests force-directed graphs:** Hierarchical first, forces second (and only within districts).

---

### Phase 3: The Renderer
**Goal:** Render `city.json` as an explorable city.

- Load `city.json` from `/city.json`
- Districts: flat colored ground regions per language style
- Buildings: boxes with `x, z, width, depth, height`
- Materials: `MeshStandardMaterial`, slight per-language color variation
- Roads: thin elevated lines or translucent tubes
- `OrbitControls` (rotate, pan, zoom)
- Raycasting: click building → HTML overlay with metrics
- Progressive zoom: distance-based label opacity
- Performance: `InstancedMesh` or merged geometries per district

**Tip:** Hand-write a mock `city.json` first. Build renderer against it before the compiler exists.

---

### Phase 4: Git History & Time Travel
**Goal:** Make it temporal.

- Analyzer: generate `repo-{date}.json` snapshots (monthly, last 2 years)
- Compiler: generate `city-{date}.json`. **Layout stability across time** — reserve building slots by full-history path
- Renderer: timeline slider. Scrubbing morphs city:
  - Buildings grow/shrink
  - Appear → fade in
  - Disappear → fade out / collapse
  - High churn → animated construction cranes

**Constraint:** A building that exists in multiple snapshots must have approximately the same position.

---

### Phase 5: Lenses & Polish
**Goal:** Multiple views, same geography.

- **Architecture lens:** default
- **Complexity lens:** color/height by complexity. Tall red = danger
- **Activity lens:** color by churn. Bright / pulsing = high activity
- **Quality lens:** coverage = building condition (pristine vs decayed). TODO density = scaffolding
- Dropdown switch. Positions locked — only materials/colors/height scaling change.

---

## 8. LLM Integration Strategy

**V1 does NOT need an LLM.**

Filesystem + Tree-sitter + import analysis + Git + deterministic layout can generate the base city reproducibly.

**LLM becomes an enrichment layer:**
- Naming districts semantically
- Identifying architectural domains
- Explaining unusual structures
- Suggesting meaningful landmarks

**Separation makes the project robust.** The compiler is deterministic; the LLM is optional spice.

---

## 9. Claude Code Workflow Tips

1. **Write `DESIGN.md` first.** It acts as persistent memory across Claude sessions. Include schemas, grammar table, and architectural decisions.

2. **Use mock data.** Hand-write `repo.json` and `city.json` for your fixture. Build the renderer against that, then build the analyzer/compiler to *produce* that shape. Parallel iteration.

3. **Keep phases testable.** After each phase:
   ```bash
   npm run analyze -- ./fixtures/sample-project ./public/repo.json
   npm run compile -- ./public/repo.json ./public/city.json
   npm run dev   # see a city
   ```

4. **Start with ONE language.** Tree-sitter grammar loading is finicky. Get TypeScript end-to-end, then "add Python support following the same pattern."

5. **Don't let Claude over-engineer layout.** Redirect to: treemap → grid → light forces. No graphviz. No complex constraint solvers.

6. **Use Claude for boilerplate, you for the metaphor.** Claude excels at Three.js, Tree-sitter, JSON pipelines. You own the urban grammar decisions — they're product, not implementation.

7. **Add a 2D SVG debug view.** `npm run render:2d` — iterate layout algorithms in 2D before orbiting a 3D camera.

---

## 10. Future Directions

- **Journeys overlay:** Steal CodeTerrain's best concept — trace a request/data path through the city as a highlighted route.
- **LLM district naming:** Feed the dependency graph to an LLM, get semantic district names before layout.
- **Multi-repo metropolis:** Render an organization's repos as a metropolitan area.
- **VR / AR explorer:** Walk through the codebase in VR.
- **Alternative metaphors:** Same pipeline, but render as space station, island chain, factory, or ant colony instead of city.

---

*Last updated: 2026-08-20*
