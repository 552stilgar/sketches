---
project: sketches
updated: 2026-08-30
next: "gapBefore judgment call: delete the unreachable-from-real-data path, or keep it with a synthetic-manifest test that documents why it can't fire from real generated history. Then: pick/wire a footprint-floor default (parameterized, no value chosen, no CLI flag), and browser-verify dist/timeline.html (low priority — Usul's read: 'ok, not really necessary for anything')."
phase: "code-city V5.1: 3D viewer is now the compare surface (?city=, ?heightScale=, layer toggles). Two rulings made against rendered variants: district-weight default linear->log, height-scale default 1->0.5. 6-lane orchestrated Workflow shipped camera/weight/footprint/tethers/2 defects/CONTRACTS fix."
campaign_ref: "2026-08-30 — code-city V5.1: 3D compare viewer + 3 rulings (weight/height), workflow-orchestrated"
gates:
  - "code-city: 33 test files, 360/360 green, build clean. Determinism + no-swallowed-exceptions verified by execution (double-compile diff, sha256) after the 6-lane merge, not by code reading."
---

# sketches — STATE

## Now

Compare surface moved from 2D SVG to the real 3D viewer: `?city=<path>` swaps the CityModel
(root-relative, explicit-fails-loud), `?heightScale=<n>` overrides massing live, layer control
is a pure view filter. Index at `dist/compare.html` (tailnet :7500, gitignored).

Two defaults changed by Usul's ruling against rendered variants, reversible via explicit option:
district weight `linear`→`log` (share 71.3%→40.9%), height scale `1`→`0.5` (aspect 7.4:1→3.7:1).
Root cause was height, not footprint — footprint-floor tuning was nearly invisible.

## Open

- **`gapBefore` judgment call** — unreachable from real generated data (git history is
  monotonic); delete the path or keep it with a synthetic-manifest test. Deliberately not
  delegated to a lane.
- **Footprint-floor default unset** — parameterized correctly, documented as the weaker lever,
  no CLI flag wired in `bin/compile.ts`, no value chosen.
- **`dist/timeline.html` still not browser-verified** — Usul's read on the underlying data: "ok,
  not really necessary for anything," so not prioritized this session.
- **18 registered lane worktrees at `.claude/worktrees/`** (11 at last close + 7 new V5.1 lanes),
  all provably merged. `git worktree remove` is denied by the permission classifier — needs a
  rule or Usul's own hand.

## Do not

- Don't add colors/fills into `src/renderer/svg.ts` — the 2D SVG contract deliberately stays
  presentation-free; the 3D viewer is now the compare surface, not the SVG path.
- Don't hand-edit `bin/compile.ts`'s district-weight/footprint flags without also updating the
  matching default-mode doc comments in `src/compiler/layout.ts` / `src/renderer/buildings.ts` —
  both constants document WHY the default is what it is, not just what it is.
