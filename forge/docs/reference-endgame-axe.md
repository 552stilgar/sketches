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
