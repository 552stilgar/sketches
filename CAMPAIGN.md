# sketches — Campaign Log

> **History-only (M2, 2026-08-06).** Current state lives in `STATE.md` at the project root (authored at this project's next session close if absent). Append dated history entries here — no current-status / next-actions maintenance. Spec: ~/docs/specs/fenrir-landing-page-2026-08-05.md §8.

## Active Thread
_Checkpoint: 2026-07-06T19:58:00Z_

### ⇢ forge: freeze-fix shipped, awaiting Usul's real-browser verification

(heighliner's session-4 thread — roles/legibility, inspector+export, metallic brushed-steel finish — is fully resolved and pushed through `5984d34`; see `## What exists` below and `memory/project_usul_heighliner.md` for detail. Nothing left open there but #4 below.)

**In progress:** forge/ v7 endgame-parity push. Slices 6-8 (composition/value, depth pass, render-to-card D2 pipeline) shipped earlier through `0c1a08b`, 110/110 tests — see git log for detail.

**The freeze-fix arc, this whole window — full story for tomorrow:**
1. **Headless D3D probe said "shader too complex, crashes ANGLE-d3d11 outright."** Turned out to be a headless-Chrome-only artifact — a purpose-built minimal test page (a single solid-color triangle, zero loops) crashed identically, ruling out shader complexity entirely. Root cause never fully pinned (likely something about running under SSH/non-interactive session on Windows), and it doesn't matter: **Usul confirmed ordinary WebGL2 (get.webgl.org) works fine in his real, everyday Chrome.** The headless probe methodology (`forge-compile-ab*.ps1`) was a red herring for this bug — keep it filed away for future driver-level questions, but don't trust it over Usul's own browser.
2. **Real test in his real browser:** freeze for 10-60s, then it worked but stayed laggy/stuttery while dragging. Two real bugs, both fixed (`23f66d4`): the preview shader was compiling *synchronously* (blocked the tab for however long that took); `pointermove` fired a full render per raw event with no coalescing.
3. **Got stuck showing "compiling shader..." forever.** `KHR_parallel_shader_compile`'s completion signal turned out to be unreliable on his driver — never reported done. Fixed (`b9380e5`) with a bounded async wait + forced fallback check.
4. **Usul, correctly, asked "isn't there a better approach, off-browser?"** He was right: bug #3's fix only capped the wait before the SAME synchronous check fired — it still blocked the tab for however long the *real* compile took once that cap hit (matches "seemed to work, then froze"). No amount of JS-side polling escapes a driver call that's genuinely synchronous. **The real fix (`db99369`): moved the entire render engine (all shaders, `createRenderer`, `setScene`) into `forge-render-worker.mjs`, a dedicated Web Worker driving OffscreenCanvas via `transferControlToOffscreen()`.** No matter how slow a real compile or draw is on any GPU/driver, that work now happens off the main UI thread — the tab itself can never freeze again, full stop.
5. **Two more bugs found during headless verification of the worker rewrite** (both fixed in the same commit): `begin-result` and `pt-progress` share a request id, and the dispatcher was deleting the pending entry the instant `begin-result` arrived — no progress tick (or final sample) could ever reach its callback, so PT silently never finished. And: the stage and the 12-thumbnail grid shared ONE worker — a worker is single-threaded, so a slow class's compile could stall every other pending render behind it (confirmed: thumbnails stuck head-of-line behind one slow axe cell). Fixed by giving the stage and thumbnails **separate workers**, plus fixing the thumbnail pacer to requeue a still-compiling cell instead of retrying it in place forever.

**Verified so far (headless, SwiftShader — not real hardware):** 110/110 tests green. Both weapon classes render correctly in preview mode. Sword's full real-PT pipeline completes end-to-end (`still:pt:6` in ~15s) through the new worker, progress ticks arrive correctly, no page errors. Drag interaction (dispatched PointerEvents) doesn't break anything. **Axe's real PT is still very slow under headless SwiftShader specifically** (100s+, consistent with earlier-established slowness for this exact hash under software rendering) — this is a known test-environment characteristic, not a new regression, and should be far faster on Usul's actual GPU.

**NEXT ACTION FOR TOMORROW (Usul):** reload the forge page fresh (force-refresh, Ctrl+Shift+R) and test the actual freeze/lag scenario one more time. Same URLs as before:
- `https://knife-kenny-refugees-notices.trycloudflare.com/index.html#ccdfc795` (ornate greataxe — heaviest case)
- `https://knife-kenny-refugees-notices.trycloudflare.com/index.html#ffeeddcc` (plain sword — lighter case)
**⚠ 2026-07-06: the knife-kenny tunnel above was killed** to free a quick-tunnel slot (Cloudflare caps ~2 concurrent per IP; heighliner eyeball pass needed one). serve-forge.mjs still runs on 127.0.0.1:3999 — ask Claude for a fresh tunnel and swap the URL.
**Note: the cloudflared tunnel is ephemeral and dies when the VPS session/tunnel process ends** — if it's not responding, tell Claude "the tunnel's down" and a fresh one takes seconds to stand up (serve-forge.mjs itself should still be running on 127.0.0.1:3999). What to report back: does the tab ever fully freeze (should be impossible now, structurally) — and separately, does it just feel *slow* (which is a real, different, lower-priority question about actual GPU compile/draw time on his hardware, not a bug in the fix itself). If the ornate axe's thumbnail-grid images take a while to appear, that's expected/lower-priority per the SwiftShader-vs-axe pattern above — not the same thing as a freeze.
**Interim workaround (still valid if anything looks wrong):** a Chrome shortcut/launch with `--use-angle=gl`.

**Spec:** `docs/specs/forge-game-ready-craft-2026-07-04.md` (original 3-stage program) + `docs/reference-endgame-axe.md` (endgame decomposition, slice queue, honest-pass scorecard, slice 6/7/8 logs, D3D verdict + pivot — the live steering doc). DNA frozen at 57 genes throughout — every slice added expression, zero new genes.
**Infra:** serve-forge.mjs on 127.0.0.1:3999 (no-store) + cloudflared tunnel → https://knife-kenny-refugees-notices.trycloudflare.com (ephemeral — regenerate if dead). Showcase hash: `#ccdfc795` (ornate greataxe); confirmed sword hash: `#ffeeddcc`. Card render is opt-in (`✦ render` button, or `?auto=1` for the harness).
**PC-probe harness (filed away, not the active debugging tool anymore):** `/tmp/.../scratchpad/forge-compile-ab*.ps1` variants (pushed to PC home) — `-Angle <d3d11|gl>` + `-VT <ms>` or `-TimeoutMs`; reads the `<title>` DOM marker. Gotcha found this session: the profile-dir name is keyed only by `-Angle`, not by script/page — running two probes with the same Angle back-to-back before the first's Chrome process fully exits collides on the lock file. `forge-probe-cleanup.ps1` (also on PC home) kills stray `*forge-ab*` chrome.exe processes + clears profile dirs by CommandLine match (surgical — never touches Usul's real browser tabs).
**Prior context (still true):** u_register = UI view (declare BEFORE TONE); DNA idx 39-43 = v4, 44-56 = v6; `patch` is a GLSL reserved word; SVG-only pages (card.html) render fine headless with no CFG hacks; PC access is `ssh pc` (tailnet).
**Parallel/deferred (#4): codex dispatch path — `chmod +x ~/bin/codex-dispatch` DONE 2026-07-06.** Only remaining step: add `"Bash(codex-dispatch:*)"` to `permissions.allow` in `~/.claude/settings.json` (backup at `settings.json.bak.2026-07-04`) — blocked by the auto-mode self-modification guard, Usul's to add manually. Not blocking anything.
**Files in flight:** none — forge itself unchanged since `db99369`; main HEAD now `5984d34` (heighliner session-4 work layered on top, unrelated to forge).

## Status
Active. Creative coding sandbox — generative art experiments in self-contained HTML/JS files.

## What exists
- `particle-horizon.html` — warm amber particle field, interactive horizon drag, repel/attract/sculpt modes
- `entropic-collapse.html` — Kuramoto phase coupling, cos(Δφ) force dynamics, many/few + cyclic/attractor modes
- `chromatic-order.html` — generative art sketch
- `void-filament.html` — generative art sketch
- `voronoi-dominion.html` — live Voronoi tessellation; noise-field seed drift, soft wall, 4 mouse modes (passive/attractor/repulsor/vortex), identity hue + area-based saturation pressure, configurable slider panel (P), +/- seeds, h/e toggles
- `heighliner/` — seeded procedural 2D spaceship generator (vertical-stack torch ships, vector-flat SVG, gallery grid + pinned judgment row). TS+Vite+vitest — the only sketch with a build step. Brief at `heighliner/HEIGHLINER-CONCEPT-BRIEF.md` (authoritative, honor anti-goals + build order); pipeline seed → derive(seed, layer) sub-seeds → structure/kit/detail/paint plain-data specs → emit (only SVG-touching module). **State 2026-07-06: brief §6 layers 1 (silhouette), 2 (shading), 4 (kit), 3 (detail) all shipped** — profile curves (taper/flare/bulge/chamferStep) + edge features + join collars + widened frigate spreads (session-1 "too similar" fix); lit/shade/AO/specular shading stack, tones HSL-derived from palette (shading painted *under* kit per Usul's A/B verdict — §4.7 intent over literal §4.8 order); all 11 kit parts + budgeted socket placement + engine-bell; detail lattice with the full enumerated treatment set under a focal-density field (dense at joins/sockets, calm mid-panel). Built via `/usul-orchestrate-task` HYBRID: T0 type contract (main thread) → W1 par{silhouette · kit-parts} → merge → W2 par{shading · sockets} → merge → integration, then detail layer authored directly. **Layer 5 LIVERY (half) shipped + APPROVED 2026-07-06, pushed `d918133`:** livery-first, structure untouched (roles deferred) so the pinned judgment row stayed shape-stable. 8-palette curated bank (Expanse muted-industrial register, `PALETTE_BANK` in `src/gen/paint.ts`) + seeded HSL jitter (`resolvePalette`), 6 role-weighted accent schemes (driveStripes/noseChevron/shroudBlock/hullBand/spineRun/bareMetal, all centered/symmetric), decals (2-digit painted stencil hull-number via a 3×5 vector glyph set — no font, export-safe — + aft hazard stripes), per-palette-gated grime. Review polish: spineRun contained to hull+mid body (was a full-length seam); hull number stencil'd + shortened to 2 digits for uniform size. 69/69 vitest, `npm run smoke` (vite-node, 20-ship gallery gate) green, browser-verified twice, palette bank graded/approved by Usul. Run: `npm --prefix ~/sketches/heighliner run dev`; tests `npm --prefix heighliner test`; smoke `npm --prefix heighliner run smoke`. **Layers 5b (corvette/hauler role profiles + legibility pass), 6 (inspector + SVG/PNG export), and the metallic brushed-steel finish (gradient glaze + thin edge + brushed grain) all shipped + Usul-approved + pushed 2026-07-06 (HEAD `b694330`; see Active Thread).** Judgment row (8 pinned seeds in `src/app/main.ts`) is frozen — do not change without a fresh regression pass.
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
1. ✓ DONE 2026-07-06 — `nebula-biome.html` browser-verified PASS (biome alignment, edge glow, P/I panels all good); `stained-glass.html` built + approved + pushed (`b569752`)
2. #3 heighliner metallic / 3D-finish shading craft loop (see Active Thread) — interactive, next up
3. Add `generative-art` to newsletters topics-registry.json
4. Fix reddit-session.mjs OAuth (552stilgar app — check Preferences→Apps) to resume sourcing ideas

## 2026-08-21 — code-city V1 kickoff: contract shipped, orchestrated build started + cleanly stopped at P2
Picked up PROJECT_IDEA.md from the PC (Code City: repo→repo.json→city.json→renderer compiler).
/usul-idea-to-design contract ratified: Phases 0-3, three-stage CLI pipeline (analyze/compile/render:2d/dev),
5-behavior spec with byte-determinism as the load-bearing gate; home = sketches/code-city (Usul: lighter
ceremony, no registry entry). /usul-orchestrate-task emitted a 9-leaf Workflow (2 codex gpt-5.6-sol lanes,
sampler-seated). P1 landed: scaffold 0dfbc73, contract+RED gates 5b2d0d5 (RED colors verified NotImplemented).
Usul stopped the run mid-P2 (dropping for the night): cc/cc-compiler @ 6dcfa75 (full first-pass compiler+SVG,
gates NOT run), cc/cc-analyzer @ e11e9f1 (WIP checkpoint), worktrees preserved under .worktrees/; renderer
lane never started. Resume plan in memory/project_code_city.md — continuation script from BASE 5b2d0d5,
fix master→main wording, launch from tmux for drop-tolerance.

## 2026-08-21 (s2) — code-city V1 SHIPPED: continuation workflow, merge, verify, review
Resumed same day from the memory resume card. Both preserved codex worktrees (cc-analyzer,
cc-compiler) turned out already gate-green (14/14, 19/19, no tests/ edits) — no re-dispatch
needed; wrote their codex dispatch-ledger entries post-hoc. Ran a continuation Workflow
(wf_338fd2d8-606) from BASE 5b2d0d5: renderer lane (fresh cc-renderer worktree, Three.js
explorer + window.__test bridge, 9426f77) -> merged all three lanes into main conflict-free
(0b16228/4c758a1/3ffc2ca + 6de9a5e cruft removal) -> integration (4fac7e2, finalized smoke.mjs
into a real gate) -> verify. Final: 26/26 tests green, build clean, smoke exit 0, browser-verify
PASS all 7 checks (15 buildings, no MOCK badge, overlay works -- screenshots sent to Usul),
spec-checker 6/6. Worktrees removed, branches deleted, main ~8 ahead of origin, unpushed.
/code-review high on 5b2d0d5..HEAD found 10 verified defects the fixture's own gates never
catch: churn silently 0 when the analyzed path is a subdir of its own repo (bites the project's
own dogfood target), NodeNext ./x.js import specifiers drop every edge, a churn heuristic
fabricates data from commit-message prefixes (papering over the fixture's --allow-empty
commits), thin districts place buildings off the 1000x1000 canvas, bare localeCompare breaks
byte-determinism across locales, unbounded git fan-out with swallowed catches zeroes out
metrics under load, the footprint-vs-loc invariant is destroyed by a clamp, and the >500-file
LOD band is broken two separate ways. Full list + repro notes in memory/project_code_city.md.
Next: Usul disposes the findings (fix wave), then push.

## 2026-08-28 — code-city: all 13 review findings fixed + merged via orchestrated fix wave
Ran /usul-orchestrate-task on the queued findings: 7-leaf tree (P1 shared codepoint comparator ->
par{A analyzer/git correctness, B compiler/layout/grammar correctness, D renderer dead-code
cleanup, E package.json engines field, F vite dev 404 fix} -> merge+verify) via native Workflow
(wf_7d53f0a0-fb2). Seat sampler showed codex filtered out of Band-1 right now (executor-reach) --
routed to Sonnet 5 @ high/low + Haiku 4.5 per the live seat table instead of the doctrine default.
All 5 lanes shipped tested fixes; one lane (B) was auto-flagged as a false failure by the merge
step's non-report heuristic (tripped on the harmless word "waiting" in its own prose) but its
tests were verified green in isolation and merged by hand once confirmed legitimate. Final: 57/57
tests green (was 26), build clean, smoke green with real (non---allow-empty) fixture diffs. All
worktrees/branches cleaned up. ROI: 20.5min wall vs ~195min estimated serial, ~$14.30 lane cost.
Then browser-verified before pushing (Usul picked that gate off a /usul-next-steps board): dogfooded
the fixed pipeline on code-city itself -- which, being a subdir of the sketches repo, IS finding #1's
scenario -- 49 buildings/6 districts, 49/49 non-zero churn (was 0/49 pre-fix), 46 distinct footprint
sides (sqrt(loc) invariant alive), 0 off-canvas, /nope.json now 404 where it was 200. browser-verify
PASS on all 7 checks (no MOCK badge, real WebGL geometry, 0 overlaps, click overlay correct, zero
uncaught exceptions; only console error was a benign /favicon.ico 404). Pushed to origin after that.
Also fixed the orchestrate-task skill's assertLaneReport heuristic that nearly discarded lane B --
structural report evidence (commit SHAs, test counts) now outranks keyword matching; lesson logged.

## 2026-08-28 — (save stub; full narrative at close) code-city dogfood run on usul-qol surfaced footprint-saturation + unscaled-height bugs at real scale; vite.config.ts allowedHosts fix for tailnet dev access

## 2026-08-28 — (save stub; full narrative at close) code-city vision pass: liveness/traffic added as PROJECT_IDEA §5.5 (3 tiers + determinism/no-fabrication constraints); V2 legibility / V3 lenses / V4 time roadmap proposed; two localeCompare byte-determinism survivors queued

## 2026-08-28 — code-city V2 shipped (contracts frozen + 6-leaf build), then V3 (animated flow) and V4 (datastores + clone-identity tethers) in the same day

Continuation of the V2 close (contracts frozen — distribution-normalized geometry, Road.weight,
calls[] rule — + 6-leaf orchestrated build: compiler weights, analyzer calls[], road tiering,
building occupancy/dead-dark/4 style profiles; dogfood on usul-qol HONEST on all 6 checks;
browser-verify PASS 7/7; pushed).

**V3 — animated flow.** A `/usul-next-steps` board picked "consume the weights V2 shipped but
never animated" over lenses/git-history/dogfood-more. Built `src/renderer/flow.ts` as a single
shared weight-to-motion contract (direction fixed to data-flow `to-from`, monotone speed/dashPeriod
anchored to the same q3 boundary road-tiering uses, provenance-tagged so structural traffic can
never read as measured — PROJECT_IDEA §5.5's no-fabrication rule extended to motion). Two build
lanes ran in parallel against it — 3D dash-shader (sonnet) and SVG dash animation (codex
gpt-5.6-sol, gates-first-try) — merged with the actual judgment call being cross-renderer
coherence: both realize `to→from`, both read speed from `flowParams`, neither re-hardcodes the
provenance string. browser-verify PASS 7/7 (offsets wrap within `dashPeriod`, weight-proportional
rate confirmed at two different roads, legend visible on screen). ROI: 15.3min wall vs ~130min
estimated inline.

**Dogfood + multi-repo merge stage.** Ran usul-heighliner-radio (336 buildings, all 6 checks
HONEST, `.mjs` import resolution at parity with `.ts`) in parallel with building `bin/merge.ts` — a
pure `RepoGraph`-level transform that namespaces every repo's paths so `topLevelPath()` turns each
repo into its own district with zero compiler changes. Rendered usul-mgmt + usul-mgmt-itba +
usul-mgmt-frd-ops as one city: 0 of 18 roads crossed a district boundary, confirming (graph AND
sha256 file comparison agreed) that the shared kernel is vendored into each consumer rather than
imported — 31/34 kernel files byte-identical across all three repos, 3 drifted together (itba and
frd-ops pinned to the same stale revision). That finding was handed directly to the concurrent
usul-mgmt session via SendMessage rather than tracked here. Screenshots of both cities (2D SVG +
3D Three.js) were also captured; the 3D pass surfaced that the camera never fits itself to the
city's bounds — a 336-building city spawns as unreadable soup, a 21-building city spawns inside a
block with labels clipped — so neither "wide" shot actually was one.

**V4 — datastores as landmarks + clone-identity tethers.** A board scoped the fix (camera
fit-to-bounds) alongside a bigger wave: `landmarks[]` was declared in `types.ts` since Phase 2 but
the compiler had always hardcoded it to `[]`, and Plate I (heighliner) proved the gap was real —
`data/` held three `.db` files and rendered nothing. Design decisions frozen before the build (P1,
single-writer contract lane): datastore geometry comes from tracked `migrations/*.sql` and
`schema.sql`, NEVER from the live `.db` (which grows hourly and would break the determinism
contract, and there are 4 gitignored backup copies per repo which file-driven detection would have
mis-rendered as 4 reservoirs); identity links are a separate, static, non-animated, elevated visual
channel from roads — a road means traffic, vendored clones carry none, and drawing one would
fabricate flow that doesn't exist; clone detection is exact sha256 content-hash only, no
near-duplicate scoring; a directory containing any detected clone keeps file-level LOD past the
500-file threshold so tethers have something to attach to (this landed at *district* granularity
rather than *directory*, a disclosed trade-off, not yet reconciled).

A 5-lane par fanned out against the frozen contract: camera fit-to-bounds + shadow frustum
(sonnet), district-as-territory + building massing (sonnet), datastore detection → landmark
emission (codex gpt-5.6-sol), content-hash clone detection + identity links + clone-aware LOD
(codex gpt-5.6-sol), landmark/tether renderer for both 3D and SVG (sonnet). Both codex lanes
shipped gates-first-try and committed their own work. The merge step's actual job was judgment,
not mechanics: lanes C and D each hardcoded a placeholder for the OTHER's field
(`identityLinks: []` / `landmarks: []`) in their shared `compiler/index.ts` edit — taking either
side verbatim would have silently zeroed a whole feature under a fully green suite, since each
lane's own tests only assert its own field. Resolved to both-computed. The merge also independently
verified the D2 no-fabrication rule by reading actual output, not lane prose: SVG roads emit
`<animate>`+dasharray, tethers are bare `<line class="tether">` with neither; 3D roads use a
per-frame `ShaderMaterial`, tethers set only `position` once and are never touched in the
animation loop.

**A real bug the green suite didn't catch.** Ran the fixed pipeline against the actual usul-mgmt
trio post-merge and got 0 landmarks despite all three repos having migrations — traced to
`datastores` having been attached to `RepoGraph` as an untyped property (a disclosed structural
workaround from the V4 build lane) that `mergeRepoGraphs` silently dropped since it only carries
typed fields. 231 tests stayed green throughout; only real-repo verification surfaced it. Fixed:
`RepoGraph.datastores` is now a proper typed, validated field, carried through the merge with the
same namespacing convention as node ids, plus an end-to-end merge→compile landmark-count test that
closes the exact gap that let it ship (237 tests, 6 new). Re-rendered the real trio: 5 landmarks,
including the vendored-kernel reservoir in all three repos (weights 24/22/22 — the vendored copies
are 2 tables behind the source, corroborating the earlier file-drift finding independently).
Removed the V4 contract lane's temporary `try/catch` scaffolding around `buildLandmarks`/
`buildTethers` in `main.ts` now that both are real, so a render failure fails loudly again per this
repo's Failure Discipline convention.

Final: 237/237 tests, build clean, smoke green. Two live tailnet views stood up for direct
inspection — a static gallery (2D SVG plates + 3D screenshots) and a live orbit-able 3D viewer
serving the real merged mgmt city. 13 commits local, not pushed pending Usul's push confirm at
close. LOD district-vs-directory trade-off and the two tailnet serve teardowns are open.

## 2026-08-29 — code-city V5: directory-LOD mode, git time-travel (snapshots + layout stability + timeline scrub), lens layer

`/usul-orchestrate-task` ran a 6-leaf tree (2-wide par, matching this box's real concurrency cap
of 2 — nproc=4) against the board's #2/#3/#4 picks: directory-granularity LOD as a selectable
second mode, a lens layer over already-compiled complexity/churn data, and the git-time-travel
spine (snapshot generation, cross-snapshot layout stability, timeline scrub). Cost ~$35 / 58.7 min
wall against a 365-min inline estimate (11 lanes: 5 sonnet subagents + 3 opus merge/integration
steps + 2 haiku gates + 1 opus integration).

**LOD**: `compileCity(graph, { cloneLodScope: 'district' | 'directory' })`, defaulting to
'district' — verified byte-identical to omitting the flag. Real numbers on the merged usul-mgmt
trio (631 files, 31 clone groups): district mode 631 buildings (unchanged, the 21→625 blowup
reproduces as 21→631), directory mode 262. All 81 clone-identity-link members resolve to a real
building in both modes — directory mode loses no clone information, it only collapses the 382
non-clone files sharing a directory with a clone. Comparison SVGs/JSON at
`code-city/out/lod-compare/` for Usul's aesthetic call — no winner declared by the run.

**Layout stability** (the highest-risk lane, authorized to report BLOCKED rather than weaken the
invariant): path-keyed slot reservation in `compiler/layout.ts`, tolerance 0.3 (30% of a
building's own district, not absolute canvas position — squarify district reflow stays unstable
by contract). Measured independently at each checkpoint, not trusted from lane prose: max
within-district drift on the real 631-file trio dropped from 0.81 to 0.19, 97%→11% of buildings
moving >10%. Holds for incremental month-to-month change (0/621 over tolerance on real graphs);
degrades in the high-growth regime — the actual 07→08 snapshot pair (repo triples, gains a
district) hit max drift 0.47 with 4/40 buildings over tolerance. No test covers that regime yet.

**Snapshots + scrub**: `bin/snapshots.ts` emits monthly repo.json anchored to each snapshot's own
commit date (never wall-clock), via a temporary detached worktree per month, removed after. A
scrubbable timeline (`dist/timeline.html`) interpolates buildings for display only — positions are
never written back into a persisted CityModel. Driven end-to-end headlessly against 6 real months
of this repo's own history (0→0→0→0→40→124 buildings); the DOM/WebGL half is not yet
browser-verified.

**Lenses**: Architecture (default) / Complexity / Activity / Quality, positions locked (proven by
test), percentile-based color/height scales so long-tailed complexity/churn don't collapse to one
color. Quality lens is deliberately rendered UNMEASURED — no coverage/TODO data exists yet, and the
lane refused to fabricate a plausible-looking signal. An Age lens is blocked on a compiler change:
`age` exists on RepoNode but `compileCity` never copies it into BuildingMetrics.

**Real defects found and left open, not smoothed over**: `bin/snapshots.ts` throws a misleading
`spawn git ENOENT` (not "git missing" — a per-month worktree subdirectory that postdates the
window) instead of a clear error; `gapBefore` is unreachable from real generated data because git
history is monotonic (only the handwritten fixture exercises the hard-cut gap path);
`CONTRACTS.md`'s "Status" table is now actively wrong (still describes three modules as
NotImplemented stubs); a 0-building snapshot month renders as an empty plain with no UNMEASURED
disclosure. `selectBuildingSources`'s "directory" is the second path segment, not the immediate
parent, on deep trees (reused the existing aggregation key rather than invent a second notion).

Net: 237→330 tests (31 files, +93), build/smoke clean throughout, 12 commits, all local — pushed
at this session's close per Usul's confirm. Two stale tailnet serve entries (:7500, :7600) from
the prior session are still unaddressed; 11 stale lane worktrees remain registered under
`.claude/worktrees/` from this run and the prior V4 run.
