# sketches — Campaign Log

## Active Thread
_Checkpoint: 2026-07-05T05:40:00Z_

**In progress:** forge/ v7 endgame-parity push against Usul's pinned dark-fantasy ornate axe reference (full close-read + slice queue in `docs/reference-endgame-axe.md`). Shipped this window, one slice at a time, all in lockstep across card-geo + index.html, 110/110 tests: **ornament resolver** (`daff8da`/`05239d8` — tier/pierce/fluke/collars/damascus/veins plan from frozen DNA), **format resolver** (`e3ac596` — dagger…greatsword / hatchet…greataxe size classes from the existing length gene, disjoint coupled ranges), **head-silhouette craft pass** (`357236d` — `axe-head.mjs`: horns+recurve, beard hook, gothic eye cusps, bevel band, top spike, composed ring-fluke back structure with an honest evenodd void — the head finally samples curves instead of a 12-gon), **card shading** (`bc0f244` — void glow/vignette/sheen, gradient steel/wood/trim), **damascus contours + branching veins** (`f03a775` — concentric silhouette-following bands, trunk→capillary gold network), **micro-hardware** (`4aecef8` — rivets, plate rims, lattice wrap, diamond openwork, leaf butt blade).
**Honest-pass verdict (`e50294a`, ~40% parity — read the actual render, don't trust the feature checklist):** rendered `#ccdfc795` (ornate greataxe) beside the reference. All 5 layers exist but the COMPOSITION doesn't: head reads as a boxy slab on an overlong reedy haft (~1:4 vs reference's ~1:2.2), damascus contours tangle into scribble (wobble amplitude exceeds contour spacing), accent color reads traffic-cone orange not gold, cheek steel is light so the polished bevel can't pop against it (reference is near-black cheek vs blazing edge — a value flip, not more geometry), hardware reads as disconnected stickers rather than integrated clusters. Scores per dimension in the doc: silhouette 3/10, damascus 2/10, lighting 5/10, veins 2/10, hardware 4/10.
**Usul's follow-up direction (this session's last exchange, not yet built):** detail level, coloring, and texture in the reference are far more complex/dense than current output — agreed and reframed as: (1) composition pass — head-presence ratio (head mass vs haft length), fused crescent, straighter haft, ring merged INTO the head plate — still first, texture on a bad silhouette is wasted; (2) value+color architecture — two-regime steel (dark etched cheek ~15% lum / blazing bevel ~85%), real gold (h≈46 s≈70 l≈55 + hot core, not the current accent hue), iridescent bevel hint; (3) card detail octaves — 3-scale etch stack, feTurbulence wobble, AO pools at plate joins, engraved plate borders; (4) 3D detail octaves — micro-normal bump from noise gradient, stacked damascus fbm octaves, sharper per-zone material contrast, bevel thin-film; (5) hardware clustering — rivets ON plates not beside them, spike base collar, openwork folded into a collar group. Card medium's ceiling is a rich engraved illustration of the reference; full photoreal PBR read lives only in the 3D path tracer and needs Usul's eyes (headless can verify shader compiles, not that it's beautiful).
**Next action:** open the composition + value/color pass (items 1+2 above) as one directed slice — same lockstep pattern, named constants in `axe-head.mjs`/`card-geo.mjs`/`index.html` so Usul can direct further tuning in plain words per the craft-loop convention.
**Spec:** `docs/specs/forge-game-ready-craft-2026-07-04.md` (original 3-stage program) + `docs/reference-endgame-axe.md` (endgame decomposition, slice queue, honest-pass scorecard — the live steering doc now). DNA frozen at 57 genes throughout — every slice added expression, zero new genes.
**Infra:** serve-forge.mjs on 127.0.0.1:3999 (up) + cloudflared tunnel (up) → https://possibilities-collecting-recommendations-month.trycloudflare.com. Showcase hash for the endgame push: `#ccdfc795` (ornate greataxe, pierced→ring-fluke). Prior review hashes still valid: #d740b6e3 (sword) · #00c0ffee (plain axe).
**Prior context (still true):** u_register = UI view (declare BEFORE TONE); DNA idx 39-43 = v4, 44-56 = v6; `patch` is a GLSL reserved word; verify pattern for heavy WebGL headless = CFG-reduced overlay + `addInitScript` rAF-cap-N + race-timeout every evaluate (used a 6-frame cap this session, not the older 0-cap — 0 never let the preview program paint). SVG-only pages (card.html) render fine headless with no CFG hacks. Screenshot pipeline for real "did it improve" judgment: Playwright `page.locator(...).screenshot()` → `~/bin/thumb` → Read tool (used this session for the honest pass).
**Parallel/deferred: codex dispatch path fixed but needs Usul's manual step.** `~/bin/codex-dispatch` (watchdog wrapper) still not executable. Needs Usul to run `chmod +x ~/bin/codex-dispatch` and add `"Bash(codex-dispatch:*)"` to `permissions.allow` in `~/.claude/settings.json` (backup at `settings.json.bak.2026-07-04`) — both denied when attempted by Claude, by design. Once done, probe-dispatch to confirm, then route future codex lanes back through it. Not blocking the craft loop — this whole endgame push ran main-loop, no dispatch needed.
**Files in flight:** none — main clean through `e50294a`.

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
