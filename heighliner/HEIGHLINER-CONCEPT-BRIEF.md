# Heighliner — Procedural 2D Spaceship Generator

**Concept brief · v1.0 · 2026-07-05**
Working name: `usul-heighliner` (rename freely). Sibling project to the prism pipe generator — same seeded-generation philosophy, different substrate.

---

## 1. One-liner

A seeded generator that renders fleets of vertical-stack torch ships as polished, high-detail, 2D vector-flat SVG illustrations, displayed in a gallery grid — twelve ships, one universe, every seed a plausible design.

## 2. Quality bar (the whole point)

- **Plausible structure** — ships read as engineered objects with design logic, not shape noise.
- **High detail level** — dense surface treatment: panels, ribs, seams, modules, stripes.
- **Polished and tidy painting** — clean line work, coherent palettes, deliberate rhythm.

Reference: Rocinante-style top-down elevation (Expanse aesthetic). Format reference: the prism generator's gallery grid.

## 3. Locked decisions (grill session summary)

| # | Decision | Choice |
|---|----------|--------|
| 1 | Rendering paradigm | 2D-native, single canonical top-down orthographic view |
| 2 | Aesthetic | Vector-flat: hard-edged shapes, 2–3 discrete shading tones per part, AO pass |
| 3 | Destination | Standalone gallery generator; asset export kept cheap for possible future consumers; game use firewalled |
| 4 | Substrate | SVG, generated as a structured document (groups, clip paths, symbols) |
| 5 | Design space | One body plan: vertical torch-ship stack, bilateral symmetry. Grammar behind an archetype interface for future body plans |
| 6 | Variance | Three role profiles at launch — corvette / frigate / hauler — narrow ranges within each; frigate tuned first, others derived |
| 7 | Segment grammar | Fixed spine: `engine → drive → mid* → hull → nose`. Variability in counts, lengths, widths — never ordering |
| 8 | Silhouette | Enumerated profile curves (taper, flare, bulge, chamfered step) + enumerated edge features (shoulder-step, notch, sponson, chamfer) + explicit join collars. Always mirrored across centerline |
| 9 | Kit | ~10 pure micro-generator parts on typed sockets with role budgets. No asset files |
| 10 | Surface detail | Band/column lattice per segment; enumerated cell treatments; focal-hierarchy density (dense at joins/modules, calm mid-panel); global three-weight stroke system |
| 11 | Shading | Fixed upper-left light. Per shape: base tone + lit strip + shade strip (inset/offset paths). Soft AO under modules and at joins. One axial specular strip per major segment. Tones derived from palette, never independent |
| 12 | Palette & livery | Curated palette bank (8–12) + seeded jitter. Enumerated livery schemes dictating accent placement. Decals: hull numbers + hazard stripes (no names). Optional per-palette grime flag |
| 13 | Randomness | Hierarchical derived seeds: `hash(seed, layer)` → `hash(seed, layer, entityId)`. Plain-data IR between all layers; SVG emitted only at the final stage |
| 14 | Gallery | Grid + inspector: large view, per-layer re-roll buttons, copy seed, export SVG/PNG. Pinned judgment row of 8 fixed seeds at top |
| 15 | Stack | TypeScript + Vite, no UI framework, no rendering library. Port the pipe generator's hash/PRNG core. Static deploy on fenrir |
| 16 | Build order | Ugly end-to-end slice first; deepen silhouette → shading → detail → kit → livery → inspector |
| 17 | Done / anti-goals | Grid test, sibling test, stable judgment row, one-click export. Firewall: no animation, no scenes, no second body plan until criteria pass, no sliders, no names/lore, no game |

## 4. Architecture

### 4.1 Pipeline (pure functions, data in / data out)

```
seed
 └─> structure(seedS)   → StructureSpec   (role, segments, silhouette, sockets)
 └─> kit(seedK)         → KitSpec         (parts placed on sockets)
 └─> detail(seedD)      → DetailSpec      (lattice cells + treatments per segment)
 └─> paint(seedP)       → PaintSpec       (palette, livery scheme, decals, tone map)
 └─> emit(all specs)    → SVG string      (the ONLY stage that touches SVG)
```

Sub-seeds: `seedS = hash(seed, "structure")`, etc. Within layers, derive per entity: `hash(seed, "kit", socketId)`, `hash(seed, "detail", segmentId, cellId)`. **Stability rule**: adding a random draw in one layer must never change another layer's output for the same master seed.

### 4.2 Data IR sketches

```ts
type Role = "corvette" | "frigate" | "hauler";

interface StructureSpec {
  role: Role;
  axisLength: number;                 // canonical units
  segments: Segment[];                // ordered aft→fore
}

interface Segment {
  id: string;
  type: "engine" | "drive" | "mid" | "hull" | "nose";
  length: number;
  profile: ProfileType;               // taper | flare | bulge | chamferStep
  halfWidth: { aft: number; fore: number; peak?: number };
  edgeFeatures: EdgeFeature[];        // 0–2 from enumerated set
  join?: JoinCollar;                  // explicit collar at fore boundary
  sockets: Socket[];
}

interface Socket {
  id: string;
  kind: "lateralPair" | "centerline" | "ringBand" | "area";
  pos: LocalPlacement;                // segment-relative
  accepts: PartType[];
}

interface KitSpec { placements: { socketId: string; part: PartInstance }[]; }

interface DetailSpec {
  perSegment: {
    segmentId: string;
    lattice: { bands: number; cols: number };
    cells: { treatment: Treatment; density: number }[]; // mirrored across axis
  }[];
}

interface PaintSpec {
  paletteId: string;
  jitter: { h: number; s: number };
  livery: LiveryScheme;               // enumerated: driveStripes | noseChevron | shroudBlock | ...
  hullNumber: string;
  grime: boolean;
}
```

### 4.3 Role profiles (data, not code branches)

| Parameter | Corvette | Frigate | Hauler |
|---|---|---|---|
| Segments | 3–4 | 4–5 | 5–6 |
| `mid` repeats | 0–1 | 1–2 | 2–3 |
| Elongation | low | mid | high |
| Weapon socket fill | high | mid | low |
| Area detail density | mid | mid | high |
| Livery weighting | aggressive | balanced | utilitarian |

Everything a profile controls is a distribution table. Adding a role later = adding a row.

### 4.4 Kit part list (all micro-generators)

turret-large · turret-small · pdc-mount · sensor-dish · comm-mast · thruster-cluster · radiator-fin · cargo-hatch · docking-collar · vent-strip · engine-bell (special-cased into the engine segment).

Each part: `(prng, size, palette roles) → shapes[]`, with seeded internal proportions so no two turrets are identical.

### 4.5 Detail treatments (enumerated)

panel-grid · rib-lines · recessed-strip · vent-row · stripe-band · blank. Adjacency weighting (ribs attract ribs). Density gradient: peak at joins and near module sockets, trough mid-panel.

### 4.6 Stroke system (non-negotiable)

Exactly three weights, global constants: `SILHOUETTE` > `MAJOR_SEAM` > `MINOR_DETAIL`. No shape anywhere uses another weight.

### 4.7 Shading stack (fixed order, per emitted shape group)

1. Base fill (palette role → base tone)
2. Lit strip, light side (inset path, +L offset)
3. Shade strip, far side (inset path, −L offset)
4. AO blobs under modules / at joins (blurred dark shapes, low opacity)
5. Axial specular strip per major segment (clipped light band)

Light: fixed upper-left, identical for every ship, forever.

### 4.8 SVG document shape

```
<svg>
  <defs>            clip paths per segment silhouette, part symbols
  <g id="hull">     silhouette + joins
  <g id="detail">   lattice treatments, clipped to segments
  <g id="kit">      part instances (mirrored via transform)
  <g id="shading">  lit/shade/AO/specular
  <g id="livery">   accent shapes, decals, hull number
</svg>
```

Inspectable tree = debuggable grammar: a bad shape traces to its emitting rule in devtools.

## 5. Gallery app

- **Grid**: 12 seeded ships + seed labels, dark ground, click → inspector.
- **Judgment row**: 8 hardcoded seeds rendered at top, always. Aesthetic regression suite — eyeball before/after every grammar change.
- **Inspector**: large render; buttons **Re-roll structure / kit / detail / paint** (swap one sub-seed, keep the rest); copy seed; export SVG + 2048px PNG (canvas rasterization).
- No sliders. Constants tune in code, versioned.

## 6. Build order

**Session 1 — the ugly slice (must complete end-to-end):**
seed → frigate only → fixed spine, plain trapezoids, no edge features → 2 parts (turret, thruster-cluster) on mirrored sockets → 1 treatment (uniform panel-grid) → 1 hardcoded palette, base tones only → grid of 12 + labels. Ship it ugly.

**Then deepen, strictly in order:**
1. Silhouette: profile curves, edge features, join collars
2. Shading stack: tones, AO, specular
3. Detail: lattice, treatments, focal hierarchy, stroke system
4. Kit: full 10 parts, socket budgets
5. Livery: palette bank, schemes, decals; corvette + hauler profiles
6. Inspector + judgment row + export

Rationale: silhouette and shading are the highest-leverage quality layers and everything else composes against them. Do not tune detail density against unshaded trapezoids.

## 7. Success criteria

1. **Grid test**: ≥10 of 12 ships in a fresh grid pass as hand-designed, same-universe ships to a naive viewer.
2. **Sibling test**: any two ships distinguishable at thumbnail size.
3. **Judgment row stable**: the 8 pinned seeds never regressed during tuning.
4. **Export**: any ship → clean SVG and 2048px PNG in one click.

Timebox: slice in one session; criteria targeted in ~4–6 focused sessions. If session 6 fails the grid test, diagnose the failing *layer* via inspector re-rolls — do not add layers.

## 8. Anti-goals (firewall)

- No animation, thruster effects, starfields, planets, or scene composition.
- No second body plan until §7 passes for the vertical stack.
- No workbench sliders, no ship names, no lore.
- No game. Game ideas go to a notes file, not this repo.
- No WebGL/shaders. The substrate is SVG on purpose.

## 9. Known risks

- **Detail-grammar rabbit hole**: richest layer, easiest to over-invest pre-slice. Mitigation: build order + judgment row.
- **Palette curation skipped**: procedural palettes will tempt; resist. Twelve authored palettes beat any constraint system at this scale.
- **Symmetry drift**: every emitter must mirror through one shared transform helper; ad-hoc mirroring is how asymmetric bugs creep in.
- **Seed instability**: enforce the hierarchical derivation rule in code review; one careless `prng.next()` in a shared path breaks fleet stability.
