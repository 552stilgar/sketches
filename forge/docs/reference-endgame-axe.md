# Endgame reference — dark-fantasy ornate battle axe
_Pinned 2026-07-05 (image re-dropped by Usul post-compaction; this doc is the
durable decomposition — the pixels live in the conversation only)._

Target: ~75% parity as the CEILING (rare ornate roll), never the baseline.

## What the image actually shows (fresh close-read)

**Composition / presentation**
- Near-black charcoal-blue void, studio rim light, faint floor glow.
- Cool monochrome steel + ONE warm accent (gold veins) + faint purple-blue
  iridescence on the polished bevel. Nothing else carries color.

**Head (single-bit bearded crescent + composed back structure)**
- Main blade: huge crescent, top horn sweeping high, bottom horn hooking down
  (beard). The cutting edge carries a **wide polished bevel band** (~10-14% of
  blade depth) separated from the cheek by a crisp ridge line — the band
  catches bright bluish light; the cheek stays dark. This band is a GEOMETRY
  feature (a real plate zone), not just a bright stroke.
- Cheek: fully covered in **fine concentric damascus swirls** (fingerprint
  grain, not linear bands) + a **branching gold kintsugi vein network** —
  trunk veins radiate from the eye area and branch into fine capillaries;
  brightest near the center, fading toward the edge band.
- Blade root: **gothic cusped bracket** framing the eye — scalloped concave
  cutouts (trefoil-ish negative curves) where blade meets the eye plate.
- **Back structure: fluke + pierce are ONE composition** — a C-shaped crescent
  arm curves down and around enclosing a large circular void, ending in TWO
  sharp points (upper long, lower short). The big "hole" of the reference sits
  between the eye and this back-blade, not mid-cheek.
- **Top spike**: tall etched spike rising above the head with a slight forward
  lean, its own collar/bracket at the base.
- **Plate rims**: every component wears a raised lighter border (double-outline
  read) + rivets at joins.

**Haft**
- Dark wood/iron with a **criss-cross lattice wrap** (X-pattern carving or
  strapping) along its whole length.
- Stacked ornate collar plates: long riveted langet cluster under the head,
  a gothic-profiled mid-collar, and near the butt a multi-plate section with
  **diamond openwork** (pierced diamond frames).
- **Butt: leaf-shaped double-edged blade spike**, not a simple cap.

## Weighted gap map (after ornament + format slices, main@e3ac596)

| Layer | Weight | Have | Gap |
|---|---|---|---|
| Silhouette | 40% | pierce ✓ fluke ✓ collars ✓ formats ✓ | head still v6 wedge: no horns/recurve, no cusped eye bracket, no top spike, fluke+pierce not composed, no bevel-band geometry |
| Damascus | 25% | wavy lines (card) / warped bands (3D) | reference is concentric swirl grain following the steel; card lines should be iso-distance contours of the silhouette |
| Lighting | 20% | PT studio (3D), flat fills (card) | card needs gradients/sheen/void; 3D needs dark-void register + iridescent bevel hint |
| Veins | 10% | random-walk lines (card), seam gilding (3D) | branching trunk→capillary network radiating from the eye |
| Hardware | 5% | plate collars only | plate-rim double outlines, rivets, diamond openwork, butt blade, lattice wrap |

## Honest pass — 2026-07-05, after slices 1–5 (viewed, not assumed)
Rendered #ccdfc795 (ornate greataxe card) beside the reference. Overall parity:
**~40%.** All five feature layers EXIST but the composition doesn't — the parts
read as separate decals on a stick, not one designed object. Per dimension:

| Dimension | Score | What the render actually shows |
|---|---|---|
| Silhouette | 3/10 | Head is a boxy slab, edge barely curves (no crescent), head tiny vs an over-long reedy haft (~1:4 vs reference ~1:2.2). Ring fluke = small donut floating behind; points are stubs. Top spike = accidental needle. |
| Damascus | 2/10 | Contours render as a thread-tangle scribble, not banding — wobble amplitude >> contour spacing, trims shred the lines. |
| Lighting | 5/10 | Void/glow/vignette work. But cheek steel is LIGHT, so the bevel band can't pop — reference has near-black etched cheek vs bright polished edge. |
| Veins | 2/10 | Orange scribbles lost inside the tangle; accent reads traffic-cone, not gold. |
| Hardware | 4/10 | Present but disconnected: rivets float beside langets, openwork reads as a sticker, collars thin. |

Root cause ranking (fix order):
1. COMPOSITION: head mass + crescent sweep + straighter/shorter haft + ring
   fused INTO the head plate. Name the knob: head-presence ratio.
2. Damascus wobble ≪ spacing (banding, not tangling); cheek darkens at ornate.
3. Gold = hue~46 s~70 l~55 + wider/fewer veins; kill the orange trim read.
4. Bevel contrast: bright band vs dark cheek (value flip, not more geometry).
5. Integrate hardware into clusters (rivets ON plates, spike gets a base collar).

## Slice 6 — composition + value/color pass (2026-07-05, shipped)
Attacks honest-pass fix order #1-#4 in one directed slice, both media:
- **Head presence**: `headScale` in the head plan (`u_hdScale`) grows the head
  toward `HEAD_PRESENCE_BY_TIER` (span:haft 0.34/0.40/0.46), clamp [1, 1.9],
  hanging from its mount (top edge fixed, crescent grows down/forward).
- **Fused silhouette**: belly amp 0.22→0.34; ring fluke fused INTO the head —
  neck widened to a full back plate (web 0.62 halfH, Ri/Ro 0.44/0.70).
- **Haft**: head-anchored spine (top meets the eye at x=0, base drifts) +
  `HAFT_CURVE_TAME` 0.45 — near-straight, like the reference.
- **Two-regime steel**: `CHEEK_L_MUL_BY_TIER` (1 / 0.60 / 0.26) darkens cheek
  + haft wood (half strength); bevel = blazing 3-stop iridescent ramp (card)
  / bevel-band blaze mask in surfaceMat (3D); bevel band opacity 0.55+0.45·el.
- **Real gold**: veins/trim/glow/frame = GOLD_HSL h46 s70 l55 (+ hot core) at
  ornate — rolled accent hue no longer touches the kintsugi read. 3D: VEIN_GOLD.
- **Banding not tangling**: contour wobble 0.015→0.005, freq 2-3, K 8-18 fine
  grain at opacity 0.22-0.44; 3D damascus warp 22→12.
Verified vs render (same discipline): head owns the weapon, near-black cheek,
blazing edge, gold network radiates, ring void reads punched-through. Remaining
gaps for eyes-gated tuning: vein network still thinner than reference, damascus
contours read as growth rings rather than fingerprint swirl, hardware clusters.

## Slice 7 — card depth pass, "drawings -> object" (2026-07-05, shipped)
Usul's read after slice 6: styling superb but flat — feels drawn, endgame feels
semi-real. This slice adds the physical cues SVG can carry:
- **Whole-weapon fx chain** (card.html `gid-fx`, viewBox units): forge-wobble
  displacement (kills vector-perfect edges), turbulence grain clipped to the
  object + multiply (metal tooth), drop shadow into the void (grounds it).
- **Contact shadows** (`aoPool`, role `ao`, every tier — physical, not
  ornament): head->haft, under plate collars, ring-web joint, guard->blade
  root, guard->grip. Blurred via per-layer `filter: 'soft'`.
- **Form shading** (worked+): broad soft core-shadow near the eye + sheen band
  down the mid-cheek (`--form-shade`/`--form-light`, `softer` blur) — the
  plate reads curved; bevel glint streak.
- **Detail octaves**: interleaved half-step damascus contours at half strength
  (fingerprint density); vein bloom underlay (hot gold glows into the steel).
- 3D: edge-cut Lipschitz factor 0.7 -> 0.5 (slice-6 belly/recurve steepened
  the profile; overshoot at horn tips could read as flicker/hole glitches).
OPEN: 3D "glitch" Usul reported is uncharacterized — headless compiles clean,
sword renders, ornate axe frame cost is up (bigger head = more shaded pixels).
Need Usul: what does the glitch look like (freeze / flicker / holes / black)?

## Slice 8 — render-to-card pipeline, the D2 move (2026-07-05, shipped)
Usul's endgame quality bar ("Diablo II but more convincing") + the reference's
studio-render look → the path tracer becomes the card's engine (D2 item art
was pre-rendered 3D, downscaled, painted over — same pipeline, ours is live):
- **index.html still mode** (`?still=WxH&spp=N[&mode=preview]`): strips the
  page to the bare canvas, one PT render of the hash at a fixed presentation
  pose (`STILL_POSE`), delivers via postMessage + `window.__forgeStill`.
  Disclosed fallbacks: partial-spp ships as `pt·N`, no-PT ships as `preview`.
- **card.html rendered mode**: hidden iframe runs the still; bitmap gets a
  paint-over post (exposure gain, lift, S-curve, posterize-lite, saturation —
  the "painted, not screenshot" read) and composites under the SVG chrome.
  Vector weapon stays as instant proof + toggle (`btn-mode`); every mode is
  disclosed in the header note.
- **3D detail octaves** (surfaceMat): interleaved finer damascus band set +
  micro tooth via roughness variation; ornate cheek eased 0.40→0.60 (0.40
  starved the dim studio env — still-mode evidence); PT tile size 90k→55k px
  (TDR headroom on the heavier SDF).
- Headless harness: `card.html?mode=preview&stillsize=…&spp=…` verifies the
  full composite chain instantly; converged PT quality is GPU-eyes territory.
**GLITCH ROOT-CAUSED + FIXED (the "3D glitches" Usul reported):** bisected via
the still+pose harness to the v6 haft-wrap block's `mix(1e9, dWrap, step(...))`
idiom — 1e9 through mix poisons the distance field (inf/NaN territory on
reduced-precision paths), producing a phantom "beige band" artifact field
around the weapon AND making rays creep (the grinding/slow renders). Fixed by
replacing the idiom with a plain branch; the beard subtraction carried the
same idiom and got the same fix. Verified: ornate greataxe preview clean,
wrap visible, PT still converges fast and reads correctly at 6spp.
TUNING OPEN (Usul's GPU eyes): still exposure/GAIN balance, STILL_POSE zoom
fit per format, paint-over strength.

## Windows/D3D verdict (2026-07-05, PC headless probes — the REAL root cause)
Usul's freezes/crashes reproduced and isolated on his own hardware via ssh +
headless Chrome (forge-compile-ab.ps1, DOM title markers):
- **ANGLE d3d11 (Chrome's Windows default): the GPU process crashes outright**
  (exit_code=34, twice within 4s of page load) on the SCENE shader. Every
  symptom tonight cascades from this: freeze -> context loss -> Chrome
  blocklists hardware -> software WebGL -> stalls/no-first-tick.
- **ANGLE gl: no crash**; still pipeline runs, watchdog + disclosed fallback
  behave. (PT completion unproven under virtual-time compression — needs a
  real-time probe or eyes.)
- Honest note: the 3D may NEVER have worked on Usul's Windows Chrome — all
  prior verification was VPS-headless (SwiftShader compiles differently).
Defensive fixes shipped along the way (all real, all keep): 1e9-mix NaN field
fix, preview band tiling, PT tiles 24k, fence-gated submission, paced
thumbnails, opt-in card render, context-lost disclosure, no-store dev server.
**NEXT SLICE (top of queue): restructure SCENE for D3D's compiler** — split
per-weapon-class programs (map() halves), replace full-map calls in shadow/AO
loops with a cheap proxy SDF, cut inline pressure; iterate compile probes
headlessly against the PC (title markers report state) until d3d11 survives.
Interim craft-loop workaround: a Chrome shortcut with --use-angle=gl.

## 2026-07-05 (later) — the shader-restructure premise was WRONG
Shipped the per-class split (SCENE_SWORD/SCENE_AXE via a brace-counting JS
slice, separate PT_FRAG_SWORD/AXE + PREVIEW_FRAG_SWORD/AXE, lazy-compiled +
cached per class in createRenderer — 110/110 tests green, headless-verified
both classes render clean locally). Re-ran the PC probe on the class-
specialized PREVIEW_FRAG_AXE alone (roughly half the old combined shader):
**still crashes, same exit_code=34, same ~1-4s timing.** Size wasn't the
cause. Bisected further with two purpose-built minimal test pages
(minitest-trivial.html: a single solid-color triangle, zero loops;
minitest-loopy.html: iteration-heavy but unrelated-to-our-SDF math) — **the
trivial shader crashes too**, in both `--headless=new` and classic
`--headless`. This is decisive: ANGLE-d3d11's GPU process cannot survive
ANY real WebGL2 draw on this PC in headless Chrome right now — not a
shader-complexity problem, not fixable by restructuring our code at all.
Likely cause: the PC's GPU driver (NVIDIA RTX 3060 Ti, driver 32.0.15.6094,
dated 2024-08-13 — ~11 months stale as of this session) has a D3D11/ANGLE
compat bug. **Open question, needs Usul**: does regular *windowed* Chrome
(not headless) also fail on ordinary WebGL2 content (e.g. get.webgl.org),
or is this specific to headless Chrome's GPU-process init path? Cheapest
next step is on his side: update the NVIDIA driver, then re-open the forge
3D page normally. The per-class shader split is a legitimate, harmless
general improvement (kept, tests green) but is NOT the fix — do not spend
more engineering effort on shader restructuring until the driver question
is answered.

## 2026-07-05 (still later) — real browser, real bugs, real fix (Web Worker)
Usul answered the open question above: get.webgl.org's spinning cube works
fine in his real, everyday Chrome. **The headless d3d11 crash was a headless-
Chrome-only artifact — confirmed a minimal trivial shader crashed identically
headless, ruling out our code, but real windowed WebGL2 is fine.** The PC
headless-probe methodology was the wrong tool for this bug; filed away for
future driver-level questions only.

Tested the real forge page in his real browser: freeze 10-60s on open, then
laggy/stuttery dragging. Two real bugs (`23f66d4`): synchronous preview-
shader compile blocking the tab, and uncoalesced `pointermove` renders.
Then it got **stuck showing "compiling shader..." forever** — traced to
`KHR_parallel_shader_compile`'s completion signal being unreliable on his
driver (never reports done). Fixed (`b9380e5`) with a bounded async wait +
forced synchronous fallback.

**Usul asked the right question: "isn't there a better approach, off-
browser?"** He was correct — the bounded-wait fix only capped how long we
*waited* before firing the same synchronous check; once the cap hit, that
check still blocked the tab for however long the real remaining compile
took (exactly "seemed to work, then froze"). No JS-side polling trick can
escape a call that's genuinely synchronous on the far side.

**The real fix (`db99369`): the entire render engine — every shader, all of
createRenderer(), setScene() — now lives in `forge-render-worker.mjs`, a
dedicated Web Worker driving OffscreenCanvas via `transferControlToOffscreen()`.**
index.html keeps the same render()/begin()/stop()/canPT shape via a small
message-passing proxy; every call is now a postMessage round trip. No
matter how slow a real compile or draw genuinely is on any GPU/driver, that
work happens on a worker thread — the main UI tab cannot freeze because of
it, structurally, regardless of driver quirks. This is the actual answer to
"off-browser": not less work, but the *right thread* for the work.

Two more real bugs found and fixed during headless verification of the
rewrite: (1) `begin-result` and `pt-progress` share a request id — the
dispatcher deleted the pending entry the instant `begin-result` arrived, so
no progress tick or final sample could ever reach its callback (PT silently
never finished); (2) the stage and the 12-thumbnail grid shared one worker
— since a worker is single-threaded, one slow class's compile fallback
could stall every other pending render behind it (confirmed: thumbnails
stuck head-of-line behind one slow axe cell, even after fixing the pacer to
requeue instead of retry-in-place). Fixed by giving the stage and the
thumbnail grid **separate workers**.

**Verified headless (SwiftShader, not real hardware):** 110/110 tests
green. Both classes render correctly in preview mode. Sword's full real-PT
pipeline completes end-to-end (~15s). Drag interaction doesn't break
anything, no page errors. Axe's real PT is still very slow under headless
SwiftShader specifically (100s+) — consistent with earlier-established
slowness for this exact hash under software rendering, not a new
regression; expected to be far faster on Usul's actual GPU.
**NEXT: Usul retests live tomorrow** — full plan in `~/sketches/CAMPAIGN.md`
§ Active Thread.

## Slice queue (each lands in BOTH media, eyes-gated between slices)
1. **Head silhouette craft pass** — craft-geo curves for the head: horns,
   beard hook, cusped eye bracket, composed fluke+pierce back structure,
   top spike (ornate-gated), bevel-band geometry.
2. **Card shading pass** — steel gradients, cheek sheen, void card bg.
3. **Damascus contours** — edge-following iso-distance etch (card),
   edge-distance band coordinate (3D).
4. **Branching veins** — trunk/capillary network from the eye.
5. **Micro-hardware** — plate rims, rivets, diamond openwork, butt blade,
   lattice wrap.
