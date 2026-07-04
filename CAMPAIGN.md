# sketches — Campaign Log

## Active Thread
_Checkpoint: 2026-07-04T19:55:00Z_

**In progress:** forge/ v6 "geometry depth + editor + SVG" — **BUILD + MERGE + HEADLESS VERIFY COMPLETE**. Sole remaining gate: Usul's craft verdict in a real browser.
**Done (main @ `b445527`):** all 5 lanes merged (svg→editor→axe→hilt→blade, real merge commits, lane history preserved). Chain: `20285ee` research → `30e2ebf` codex DNA contract (13 append-only genes idx 44-56) → 2 SVG commits → 5 merge commits. **78/78 tests** across 6 suites (core 14, blade 15, hilt 10, axe 14, editor 19, card 6). Anti-gaming review of both codex steps: PASS (no test tampering, all lane lines survive except intentional duplicate-`smin()` dedup). Worktrees removed, branches kept. Codex sessions logged (contract + merge).
**Headless verify (standalone playwright script, NOT the browser-verify agent — 3 MCP attempts hung, see caveat):** sword #d740b6e3: stage luma 14.7 / 354 edges (v5 same-view baseline: 12.6/399), thumbs lit, caption ok; axe #00c0ffee: luma 20.3 / 323 edges; editor panel opens w/ 43 controls (23 range + 20 select), token round-trip works (`#hash~override` appended), lock+reroll present; SVG cards render (sword 17 paths, axe 7); **zero shader/page errors** — SCENE compiles ES 1.00 + 3.00 (programs link eagerly at init).
**⚠ Open perf caveat (real-GPU check needed):** v6 preview shader = 1.3× v5 (fine), but the ES 3.00 **path-trace program is ≥100× slower under SwiftShader** (one pt frame blocks the main thread for minutes — that's what hung the MCP verify agents). Likely a software-JIT blowup on the larger SCENE, not a real-GPU issue — but **Usul must confirm the loot/museum registers still accumulate smoothly on his GPU**; if his machine also grinds, bisect the v6 SDF branches.
**Verify pattern for reuse (heavy WebGL headless):** CFG-reduced overlay copy (gridCount 2, stage 300px, thumbs 120px; copy ALL module files — a missing editor-logic.mjs silently killed the page) + `addInitScript` rAF cap 0 (init renders synchronously, path tracer never starts, readbacks deterministic) + race-timeout on every evaluate. Script: scratchpad/verify-v6-final.mjs.
**Infra:** serve-forge.mjs on 127.0.0.1:3999 (up). Cloudflare tunnel DOWN (auto-mode denied restart) — approve tunnel or VS Code port-forward 3999. Review hashes: #d740b6e3 · #8833f287 · #b24e896d · #dc97372e · #00c0ffee; SVG medium at /card.html#hash.
**Prior context (still true):** u_register = UI view (declare BEFORE TONE); DNA idx 39-43 = v4, 44-56 = v6; `patch` is a GLSL reserved word.
**Files in flight:** none — main clean.

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
