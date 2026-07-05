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
