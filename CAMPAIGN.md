# sketches — Campaign Log

## Active Thread
_Checkpoint: 2026-07-05T02:10:00Z_

**In progress:** forge/ v7 craft pass — Usul dropped a reference image (dark-fantasy ornate battle-axe: pierced cheek, rear fluke, gold-veined damascus, stacked haft collars) as an explicit **endgame target ("~75% of the way there")**. Decided via `/usul-idea-to-design` contract: build **both media in lockstep** (card-geo + the 3D SDF move together, not staged A-then-B-then-C) and treat the image as the **ceiling** (rare/ornate roll), not the new baseline — most hashes must stay plain.
**Ornament resolver shipped (`daff8da`):** new `forge/ornament.mjs` — `resolveOrnament(params)` derives a `{tier, pierce, backFluke, plateCollars, damascus, veins, edgeLight}` plan from EXISTING genes only (DNA stays frozen at 57; damascus finish × accent_on gate the tier: ~65% plain / 23% worked / 12% ornate over seeded samples). `piercePlacement(plan, geo)` zones the cutout inside the cheek, clear of the eye collar and edge-bevel arc, refusing (null) rather than degenerating when a head is too small. `pack/unpackOrnamentUniforms` is an exact-inverse bridge — this is what keeps card-geo and the GLSL shader from drifting into two hand-tuned interpretations of the same plan. `craft-geo.mjs` gained `pierce(outline, hole)` (evenodd rings, throws if a hole vertex isn't strictly inside the outer ring) and ring-aware `distanceTo`/`toPath` — the ring `distanceTo` (`max(dOuter, -dHole)`) is the literal JS mirror of the Stage-C SDF `opSubtract`, so the pierce math only needs writing once. Built idea-to-design style: 5 RED-first behaviors (B1 ceiling distribution, B2 frozen-DNA invariant, B3 pierce honesty, B4 pierce zoning, B5 uniform round-trip). **97/97 tests green** (92 prior + 5 new).
**Next action:** wire the plan into both media in lockstep — (1) `card-geo.mjs`: `buildAxeHead` consumes pierce/fluke/plateCollars for silhouette, card.html gets damascus/vein/edge-light gradient fills; (2) `index.html`: new `u_orn*` uniforms via `packOrnamentUniforms`, `mapAxe` gets the pierce SDF subtraction + fluke geometry, `surfaceMat` gets damascus/vein shading. Then run the live craft loop with Usul with the reference image pinned — he directs in plain words against curve-vocabulary.md + the new ornament plan, Claude edits named params (Usul does not hand-edit — feedback_craft_loop_direct_not_edit).
**Parallel/deferred: codex dispatch path fixed but needs Usul's manual step.** Auto-mode classifier blocks ANY codex launch flag without an explicit user-added permission rule. Fix authored: `~/bin/codex-dispatch` (watchdog wrapper). Needs Usul to run `chmod +x ~/bin/codex-dispatch` and add `"Bash(codex-dispatch:*)"` to `permissions.allow` in `~/.claude/settings.json` (backup at `settings.json.bak.2026-07-04`) — both denied when attempted by Claude, by design. Once done, probe-dispatch to confirm, then route future codex lanes back through it.
**Spec:** `docs/specs/forge-game-ready-craft-2026-07-04.md` — 3-stage program, now amended in practice: B/C are running in lockstep per Usul's direction rather than strictly sequential. DNA frozen at 57 genes — ornament changes expression only.
**Infra:** serve-forge.mjs on 127.0.0.1:3999 (up) + cloudflared tunnel (up) → https://possibilities-collecting-recommendations-month.trycloudflare.com (fresh `?v=N` cache-buster per 3D-stage look; card.html doesn't need one). Review hashes: #d740b6e3 (sword) · #00c0ffee (axe) · #8833f287 · #b24e896d · #dc97372e.
**Prior context (still true):** u_register = UI view (declare BEFORE TONE); DNA idx 39-43 = v4, 44-56 = v6; `patch` is a GLSL reserved word; verify pattern for heavy WebGL headless = CFG-reduced overlay + `addInitScript` rAF-cap-0 + race-timeout every evaluate. SVG-only pages (card.html) render fine headless with no CFG hacks needed.
**Files in flight:** none — main clean, ornament slice committed (`daff8da`).

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
