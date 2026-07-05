# sketches — Campaign Log

## Active Thread
_Checkpoint: 2026-07-05T06:55:00Z_

**In progress:** forge/ v7 endgame-parity push, continued. Slices 6-8 shipped this window (main through `0c1a08b`, 110/110 tests): **slice 6 composition+value/color** (`1cf9f61` — head-presence ratio scale (`u_hdScale`), fused ring-into-plate, head-anchored near-straight haft, two-regime steel (dark cheek/blazing bevel), real gold h46/s70/l55 replacing the rolled accent hue), **slice 7 depth pass** (`64bc177` — AO contact-shadow pools at every joint, form shading, whole-weapon SVG fx chain (wobble+grain+drop-shadow), interleaved fine damascus octave, vein bloom), **slice 8 render-to-card pipeline** (`0642410` — the D2 move: `index.html?still=WxH&spp=N` renders a real path-traced still of the hash, `card.html` composites it under the SVG chrome with a paint-over post (exposure/S-curve/posterize/saturation) — the "photoreal ceiling lives in the PT, not the SVG" architecture Usul asked for).
**Then a real bug hunt, not craft:** Usul reported the 3D page freezing his whole Chrome (unresponsive, can't switch tabs) and the card render stalling/timing out. Root-caused via 5 rounds of fix→retry→still-broken, ending in a PC-headless A/B probe (`forge-compile-ab.ps1` over ssh) that isolated the REAL cause: **ANGLE d3d11 (Chrome's Windows default) crashes the GPU process outright (exit_code=34) compiling the forge raymarch shader.** ANGLE gl survives the same page. Everything before that diagnosis was real-but-secondary hardening (kept, not reverted): a genuine `mix(1e9,...)` NaN-poisoned distance field bug (`0642410`), untiled preview draws blowing the GPU watchdog (`1df43dd`), an offscreen-iframe rAF-throttle starving the card's still render (`05a851c`), unfenced GPU submission blocking the main thread hard enough to look like dead buttons (`89c42c5`), and a 12-thumbnail synchronous boot burst (`3c61b4e`). Full verdict + probe methodology: `docs/reference-endgame-axe.md` § "Windows/D3D verdict".
**Honest state:** the 3D path tracer may never have rendered successfully on Usul's actual Windows Chrome — every prior "headless verified" claim ran on the VPS's SwiftShader software path, which never touched the D3D compiler. The vector card (SVG, no WebGL) is unaffected and looks good per Usul ("looks awesome," "very well finished" on slice 6-7 screenshots). The render-to-card composite is UNVERIFIED on Usul's real hardware — architecture is sound and headless-tested, but no converged real render has been seen by human eyes yet.
**Next action:** shader restructure for D3D's compiler — split per-weapon-class SCENE programs (half the `map()` inlining), replace full `map()` calls inside the shadow-ray/AO loops with a cheap proxy SDF, generally cut inline pressure on the raymarch. Iterate ENTIRELY via the PC-headless probe harness (`forge-compile-ab.ps1`, DOM `<title>` status markers already wired into `index.html`'s still mode) — no more freeze roulette on Usul's desktop. Bring Usul back in only once d3d11 survives the probe, for the real converged-render verdict (card exposure/contrast, still pose/zoom, paint-over strength — all still open craft calls).
**Interim workaround (if Usul wants to see the render before the D3D fix lands):** a Chrome shortcut/launch with `--use-angle=gl` survives on his machine (verified same-page via the probe).
**Spec:** `docs/specs/forge-game-ready-craft-2026-07-04.md` (original 3-stage program) + `docs/reference-endgame-axe.md` (endgame decomposition, slice queue, honest-pass scorecard, slice 6/7/8 logs, D3D verdict — the live steering doc). DNA frozen at 57 genes throughout — every slice added expression, zero new genes.
**Infra:** serve-forge.mjs on 127.0.0.1:3999 (up, now sends `cache-control: no-store` — dev surface must never let a browser cache a stale build) + cloudflared tunnel (up) → https://possibilities-collecting-recommendations-month.trycloudflare.com. Showcase hash: `#ccdfc795` (ornate greataxe). Card render is opt-in (`✦ render` button, or `?auto=1` for the harness) — never fires unprompted after the boot-burst finding. PC probe harness: `/tmp/.../scratchpad/forge-compile-ab.ps1` (pushed to PC home as `forge-compile-ab.ps1`) — `-Angle <d3d11|gl>` + `-VT <ms>` (virtual-time-budget) or `-TimeoutMs`; reads the `<title>` DOM marker index.html's still mode now writes (`still:pt:<spp>:<elapsedMs>` / `still:progress:<n>:<ms>` / `still:preview:0:<ms>`).
**Prior context (still true):** u_register = UI view (declare BEFORE TONE); DNA idx 39-43 = v4, 44-56 = v6; `patch` is a GLSL reserved word; SVG-only pages (card.html) render fine headless with no CFG hacks; PC access is `ssh pc` (tailnet), Chrome/Edge headless capture works via a `.ps1` file (PowerShell `-ExecutionPolicy Bypass` needs Usul's explicit naming to clear the auto-classifier — plain `-File` without bypass is fine and was used throughout this hunt).
**Parallel/deferred: codex dispatch path fixed but needs Usul's manual step.** `~/bin/codex-dispatch` still not executable. Needs Usul to run `chmod +x ~/bin/codex-dispatch` + add `"Bash(codex-dispatch:*)"` to `permissions.allow` in `~/.claude/settings.json` (backup at `settings.json.bak.2026-07-04`). Not blocking — this whole endgame push + bug hunt ran main-loop.
**Files in flight:** none — main clean through `0c1a08b`.

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
