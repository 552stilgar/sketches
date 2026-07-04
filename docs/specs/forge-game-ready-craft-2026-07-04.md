# Forge: Game-Ready Craft Pass (v7)
_Date: 2026-07-04 | Status: draft_

## Problem

v6 added 13 genes and closed expression gaps, but renders still read as programmer art —
straight-edged CSG blocks, unauthored materials (toy-yellow or marble-blotch hafts), broken
presentation (top-down axe poses, floor moiré, no ground contact). Parameter count was never
the gap; **shape language, material authorship, and presentation** are. Verdict source:
Usul's 2026-07-04 screenshot review ("not impressed — expected more game-ready").

## Solution

Staged craft program across both media ("Both, staged" — Usul's call):

- **Stage A — 3D stage: bugs + presentation.** Fix the three visible defects (square haft
  cross-sections, haft material zoning, env floor moiré/seam) and add the presentation layer
  (per-class hero pose, contact shadow, rim light, caption plate). No SDF re-architecture.
- **Stage B — SVG cards: prove the craft.** The curve language and material ramps are
  developed and iterated on the 2D medium, where beziers and gradients are native and cheap.
  This is where the look gets *ratified by Usul* — fast loop, no shader compiles.
- **Stage C — port winners back to 3D.** Only the ratified shape/material decisions get
  ported into SCENE (bend/sweep SDF ops, ramp-based surfaceMat). Gated on Stage B verdict.

DNA table is **frozen at 57 genes** — this program changes how genes *express*, not what
genes exist. All share tokens keep meaning.

## User stories

- As Usul, I want any fresh hash to render an item I'd believe seeing in a game shop, so
  sharing a URL feels like showing loot, not a tech demo. **(must)**
- As Usul, I want axes to present their bit profile by default, so the silhouette reads in
  under a second instead of collapsing into a top-down "T". **(must, Stage A)**
- As Usul, I want the SVG card of a hash to feel like the same item as its 3D render — same
  palette, same silhouette identity. **(must, Stage B)**
- As a URL recipient, I want the page interactive within seconds on any GPU (async compile +
  tiled PT — shipped 2026-07-04; regression constraint, not new work).

## Design direction

**Shape language (the curve rules — enforceable, not vibes):**
- No visible silhouette edge may run straight for more than ~15% of total weapon length —
  every long boundary gets sweep, taper, or swell.
- Cross-sections are never square: haft = rounded-octagon→ellipse blend, grip = swelling oval.
- Junctions are always resolved: head↔haft gets a collar or langet wedge, grip↔pommel gets a
  ferrule swell. No naked butt joints anywhere.
- Mass rhythm big–medium–small: one dominant mass (head/blade), one thin counter (haft), one
  punctuation (pommel/butt cap).

**Material ramps (named; tints modulate these, never replace them):**
- Wood: `heartwood #3E2A1C → oak #6B4A2E → worn-edge #A8825A`; grain = low-frequency stripes
  along the haft axis (kills both the toy-yellow and marble-blotch failures).
- Steel: `gunmetal #3A4148 → steel #8E9AA4 → edge-light #E8EEF2`; bevel planes facing the key
  take the ramp top.
- Accent metal (fittings only — collar/ferrule/pommel): `old-bronze #6E5326 → brass #C9A24B`.
- Leather/wrap: `oxblood #5C2E24 → #8A4A38`.

**Signature element: the edge-light.** One continuous bright line tracing the business edge
(blade edge / bit arc) — curvature-aware shading in 3D, explicit highlight path in SVG. It
reads at thumbnail size and is the shared identity mark across both media.

**Presentation framing:** per-class hero pose (axes pitch so the bit arc faces camera);
elliptical contact shadow + analytic floor gradient (replaces the moiré-prone strip-light
reflection); cool rim light from back-left (takes rarity color in loot register); caption
plate strip so stage and card share a framing identity. Black-void background stays — it is
the brand; everything stays quiet except edge-light + one accent metal.

## Interface

No API or DNA changes. Touch surface:
- `forge/index.html` — SCENE material/shading sections, env floor, pose defaults,
  presentation layer (Stage A), later curve-primitive ops (Stage C).
- `forge/card-geo.mjs` + `forge/card.html` — bezier silhouette primitives, ramp gradients,
  edge-highlight path (Stage B).
- New: `forge/craft-geo.mjs` (shared curve helpers usable by both card-geo and JS math
  mirrors), `forge/test-craft.mjs`, `forge/test-zoning.mjs`.
- Share-token format, DNA table, editor panel: untouched.

## Testing approach

Three seams (confirmed 2026-07-04):
1. **Geometry math-mirrors** — JS mirror functions for each new curve primitive
   (sweep/taper/collar/bend) with exact-distance unit tests, same pattern as `test-blade.mjs`.
   One assertion per primitive: mirrored distance matches closed-form expectation.
2. **Material zoning sweep** — N=200 seeded hashes: haft/grip zone always resolves to the
   wood ramp family, blade/head to steel, fittings to accent. Turns the marble-haft
   screenshot bug into a permanent regression test.
3. **Pixel-gate battery** — headless readbacks (rAF-cap-0 harness from 2026-07-04): rim-light
   edge-delta present, contact-shadow dark band present, floor ring-moiré probe below
   threshold, per-class default-pose silhouette aspect inside band.

## Out of scope

- New DNA genes (table frozen at 57).
- Engine export (glTF/mesh), animation, backend of any kind.
- Register rework (museum/loot/stylized stay as-is except where presentation touches them).
- PT performance work beyond the shipped tiling/async-compile fixes.
