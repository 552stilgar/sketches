# sketches — Campaign Log

## Active Thread
_Checkpoint: 2026-07-04T21:10:00Z_

**In progress:** forge/ v7 "game-ready craft pass" — **Stage A (bugs + presentation) SHIPPED**; Stage B (curve language + material ramps, proven on SVG cards first) NOT STARTED.
**Why v7 exists:** Usul's real-browser test of v6 hit two live bugs (3-4 min page freeze/context-loss on open; wood hafts rendering as blotchy steel/boxy silhouette) AND a craft verdict — "not impressed, expected more game-ready." Root causes + fix: (1) TDR/context-loss — v6's heavier SDF pushed a single full-res PT draw past the GPU watchdog budget; fixed by tiling PT draws into ≤90k-pixel scissor bands (`b81efcd`) + compiling the PT program in a background driver thread via `KHR_parallel_shader_compile` so the page boots on preview alone (`705307d`). (2) Material bleed — `langet`/`haft_butt` used unbounded `smin(feature, dHaft, k)` unioned as steel; since `smin(x,dHaft,k) <= dHaft` everywhere, the steel branch silently claimed the WHOLE haft. Fixed by clamping each blend to its feature's own reach (`max(smin(...), feature - r)`); `forge/test-zoning.mjs` (4 tests) mirrors the exact union math as a permanent regression gate. Also fixed: PT per-pixel RNG seed decorrelation (sequential seeds through the one-step PCG produced dashed bokeh rings of the env light-strips at low sample counts).
**Spec:** `docs/specs/forge-game-ready-craft-2026-07-04.md` — 3-stage program (A: 3D bugs+presentation · B: curve/material craft proven on SVG cards, Usul-ratified · C: port winners back to 3D SDF). DNA frozen at 57 genes — this changes expression, not gene count. Design direction (via `frontend-design` skill): named material ramps (wood/steel/bronze/oxblood hex ramps), enforceable shape rules (no straight silhouette run >15% of length, no square cross-sections, junctions always resolved), signature element = continuous edge-light tracing the business edge in both media.
**Stage A shipped (`814c054`):** zoning fix + regression test, PT tiling + async compile (perf fixes), presentation layer (per-class hero pose — axes pitch 0.30/0.14 vs sword 0.55/0.08 so the bit-arc faces camera instead of collapsing into a "T" — floor pool + contact shadow in `bgColor`, cool museum rim strip, caption plate strip). **87/87 tests** (78 v6 + 4 zoning + fixed 1 brittle axe regex + editor). Headless-verified (pixel checks both hashes, zero errors). Live on tunnel, awaiting Usul's re-look.
**Stage B not started:** first step is a `craft-geo.mjs` contract (idea-to-design Phase 1 — interface + behavior list for `sweep()/taper()/collar()/bend()` curve primitives with closed-form distance tests) shared between `card-geo.mjs` and future JS math-mirrors, THEN the SVG craft loop with Usul directing the look in plain words before anything ports back to the 3D shader.
**Infra:** serve-forge.mjs on 127.0.0.1:3999 (up) + cloudflared tunnel (up) → https://possibilities-collecting-recommendations-month.trycloudflare.com (use a fresh `?v=N` cache-buster on each look — fragment-only nav doesn't reload the shader). Review hashes: #d740b6e3 · #8833f287 · #b24e896d · #dc97372e · #00c0ffee; SVG medium at `/card.html#hash`.
**Prior context (still true):** u_register = UI view (declare BEFORE TONE); DNA idx 39-43 = v4, 44-56 = v6; `patch` is a GLSL reserved word; verify pattern for heavy WebGL headless = CFG-reduced overlay + `addInitScript` rAF-cap-0 + race-timeout every evaluate (scratchpad/verify-v6-final.mjs, scratchpad/verify-stageA.mjs).
**Files in flight:** none — main clean, all Stage A work committed.

## Status
Active. Creative coding sandbox — generative art experiments in self-contained HTML/JS files.

## What exists
- `particle-horizon.html` — warm amber particle field, interactive horizon drag, repel/attract/sculpt modes
- `entropic-collapse.html` — Kuramoto phase coupling, cos(Δφ) force dynamics, many/few + cyclic/attractor modes
- `chromatic-order.html` — generative art sketch
- `void-filament.html` — generative art sketch
- `voronoi-dominion.html` — live Voronoi tessellation; noise-field seed drift, soft wall, 4 mouse modes (passive/attractor/repulsor/vortex), identity hue + area-based saturation pressure, configurable slider panel (P), +/- seeds, h/e toggles
- `forge/` — procedural sword & axe generator (prism-style: hex hash = the weapon). Seeded DNA table (36 params, sword: blade/guard/grip/pommel · axe: haft/head/poll) → GLSL SDF raymarcher, brushed-metal shading, 12-specimen grid w/ hash captions, All/Swords/Axes filter, orbit stage, share token in URL hash (supports param overrides, no editor UI yet), PNG export. Only sketch with tests: `node --test forge/test.mjs` (5 behaviors: determinism, validity, archetype coverage, assembly invariants, token round-trip) — pure core in `params.mjs`, view in `index.html`. Serve over http (ES module import); headless-verified 2026-07-03, visual craft pass pending Usul

## Conventions
- Single self-contained HTML files — no build step, no framework
- Open directly in browser
- Each sketch is independent; no shared state or imports
- p5.js + d3-delaunay via CDN; dark canvas (#060608); monospace HUD overlay; CFG object at top

## Roadmap

### Nebula as Biome Map (`nebula-biome.html`) — BUILT ✓
v3: biome-aligned nebula hue, 3-pass edge rendering (dark groove + wide glow + bright center), star coronas in nebula layer, I-key info overlay, 4 mouse modes (Observe/Attractor/Repulsor/Vortex), CFG panel (P key), seeded determinism.
A seeded cosmos where every layer of generation maps to a visible system. A slow-moving fBm field (Simplex octaves) forms the nebula — dense glowing clouds in deep violet, teal, and amber that shift with time. Poisson disk sampling places stars across the canvas with minimum separation, each rendered as a Worley-noise cluster of dots (dense core, sparse halo). Voronoi cells partition the sky into stellar territories — each cell a distinct biome (habitable, gas giant belt, dead zone, active, binary) with its own hue and particle behavior. Biome assignment is driven by a secondary noise field sampled at the Voronoi seed. Particle streams trace along Voronoi boundaries like solar wind or aurora — thin filaments of light that follow the cell edges, accelerating at contested vertices. Mouse seeds a new star on click, fracturing the nearest Voronoi territories. A seed input at top-right regenerates the entire cosmos deterministically.

**Techniques:** Simplex fBm (nebula), Worley noise (star clusters), Poisson disk sampling (star placement), Voronoi tessellation (stellar territories), secondary noise biome assignment, particle system along boundary edges, seeded determinism

---

### Stained Glass Engine (`stained-glass.html`)
A gothic window that procedurally builds itself on load and responds to light. An L-system grammar generates the architectural skeleton — nave columns, pointed arches, rose window radial arms, flying buttresses — rendered as thin dark lead lines. Each enclosed region produced by the L-system structure is subdivided by a local Voronoi diagram, filling the window with irregular glass cells. Each cell's interior carries a Worley noise texture (subtle veining, like real leaded glass variation) tinted by its structural zone (rose window = reds/golds, nave = blues/greens, clerestory = cool whites). A slow fBm field modulates overall luminance per cell as if clouds are passing outside. Mouse position acts as the sun: cells closest to the cursor brighten sharply, far cells dim, creating a raking-light effect that makes the architecture legible in a new way on every mouse position.

**Techniques:** L-systems (architectural grammar), Voronoi (glass cell subdivision), Worley noise (pane veining), fBm (cloud luminance modulation), distance-based mouse luminance, zone-based color palette

---

### River Delta Portrait (`river-delta.html`)
A pure topographic art piece — the terrain is never shown, only what water does to it. A Diamond-Square heightmap is generated silently; the Hessian matrix (second-order finite differences) is computed per cell and its eigenvalues used to detect ridgelines and valley candidates — the exact technique from the Godot terrain Reddit article. Hydraulic erosion (particle droplet model) carves river channels from those candidates downslope to the sea boundary. The output is drawn as an ink painting: river channels as dark tapered strokes (wider downstream, narrower at headwaters), Poisson disk sediment deposits as stippled dots at delta fans, Voronoi biome zones at the river mouth (marsh, estuary, open water) as washes of color. Animated particles follow the flow direction of each carved channel — slow near headwaters, fast near delta. The result looks like a hand-drafted hydrological survey or an aerial photograph of a river delta at dusk.

**Techniques:** Diamond-Square heightmap, Hessian eigenvalue ridge/valley detection, hydraulic erosion (droplet model), Poisson disk sediment placement, Voronoi biome zones, particle flow animation, ink/stipple render aesthetic

---

### Recursive Forest (`recursive-forest.html`)
A forest that reveals its own anatomy at every scale. L-system rewriting rules grow a branching tree structure with configurable recursion depth — each branch forks according to the grammar, angles jittered by a per-seed noise offset so no two trees are identical. At every branch junction and terminal node, the cross-section view from the Tree Slice Generator technique is rendered inline: concentric growth rings expanding radially from the junction center, each ring slightly irregular via smoothed point displacement, with a skewness bias matching the branch lean angle. Poisson disk sampling distributes leaves around terminal nodes with density proportional to available light (approximated by depth in the tree). A slow Simplex noise field drives wind: branches sway, leaves flutter, the whole structure breathes. A second slow Simplex field across the canvas encodes the season — progressing from pale spring green through deep summer, orange autumn, to bare winter — shifting leaf color and density continuously.

**Techniques:** L-systems (branching grammar), radial ring geometry (Tree Slice cross-sections), Poisson disk (leaf scatter), fBm wind animation, Simplex noise seasonal gradient, per-seed jitter, depth-based light approximation

---

## Next actions
1. Test `nebula-biome.html` in browser — check cellFillAlpha, edgeGlowAlpha, nebula-biome alignment visibility
2. Build `stained-glass.html` — L-system architecture + Voronoi glass cells + Worley veining + fBm luminance + mouse sun
3. Add `generative-art` to newsletters topics-registry.json
4. Fix reddit-session.mjs OAuth (552stilgar app — check Preferences→Apps) to resume sourcing ideas
