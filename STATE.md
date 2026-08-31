---
project: sketches
updated: 2026-08-31
next: "Rendered-variant review (blocked on Usul): compile district-weight (derived/log/linear), patina, scaffolding, ruins variants and look via dist/compare.html — four defaults/overlays shipped and none seen except cranes."
phase: "code-city V5.2b: derived district-weight exponent merged (default log->derived); 3 new temporal overlays landed OFF by default (age->patina, new-file->scaffolding, deleted-file->ruins). 11-lane orchestrated Workflow; browser-verify confirmed cranes read as intended."
campaign_ref: "2026-08-31 — code-city V5.2b: derived district-weight + 3 temporal overlays (patina/scaffolding/ruins), workflow-orchestrated, all overlays off by default"
gates:
  - "code-city: 43 test files, 494/494 green. --district-weight=log/linear/sqrt byte-identity vs pre-session proven by recompile+diff. Default-render-unchanged with all 3 new overlays off proven by scene-digest diff."
---

# sketches — STATE

## Now

code-city V5.2b: 11-lane orchestrated Workflow merged derived district-weight (default
log->derived), landed 3 temporal overlays OFF by default (age->patina, new-file->scaffolding,
deleted-file->ruins), rendered compare variants, browser-verified cranes (works — reads as
"under construction", not noise), pruned 43 merged branches (55->12).

Merge step caught+fixed a live never-fabricate violation: 2 lanes independently defined
`Building.metrics.age` (MAX vs MIN); the unfiltered MIN would've rendered 42/1108 real buildings
as "brand new." Split into `age`/`newestAge`, both gated by `ageMeasured`.

## Open

- **Rendered-variant review — nothing past cranes has been looked at.** `dist/compare.html`
  (:7500) has district-weight + patina + scaffolding + ruins variants wired, code/tests-only.
- **District-legibility floor may target wrong geometry** — 0.008 assumes a square proxy;
  district layout only emits full-canvas-width strips, so the floor renders a sliver not a
  patch. Fix-floor vs fix-layout is Usul's call (Structural Workaround LAW).
- **`clamped` (floor-hit flag) computed, documented, then discarded** before `city.json`/stderr —
  `massing.ts`'s `normalizedHeightScale` has the same shape; worth one shared fix, not two.
- **No independent review of the 10-commit diff yet** — the one violation above was caught by
  lane collision, not a structural check.
- **`gapBefore` is RESOLVED, not open** — prior open-item was wrong. `SubdirNotPresentAtCommitError`
  produces a genuine mid-sequence gap from real history; pinned by a real-git fixture, 2/2 passing.
- Footprint-floor default still unset (carried, unchanged). `dist/timeline.html` now
  browser-verified — loads, scrubber moves, Usul's "not really necessary" verdict stands.
- 12 active worktrees (2 dead/stale + 9 merged lanes). `git worktree remove` still permission-denied.

## Do not

- Don't add colors/fills into `src/renderer/svg.ts` — stays presentation-free.
- Don't hand-edit `bin/compile.ts`'s weight/footprint flags without updating the matching default
  doc comments in `layout.ts`/`buildings.ts`.
- Don't flip any of the 3 new overlays ON by default without the rendered review above.
