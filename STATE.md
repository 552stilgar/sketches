---
project: sketches
updated: 2026-09-01
next: "Look-and-decide: patina, scaffolding, ruins (compare.html, now unblocked — renders through
the current viewer, V1+V2 included). Then default-camera / progressive semantic zoom: facades are
browser-verified invisible at default framing, visible only at close zoom."
phase: "code-city visual phase started: V1 tone mapping/sky (scene.ts) + V2 procedural facades
(facades.ts, hybrid buckets+shader). District-weight default reverted derived->log (ruled).
511->548 tests, all local."
campaign_ref: "2026-09-01 — code-city: independent review + L1 rename-lineage fix + visual phase
(V1 tone mapping/sky, V2 procedural facades) + district-weight ruling reverted"
gates:
  - "548/548 tests green, 46 files, tsc clean on every touched file, dist rebuilt."
  - "V1 + V2 both browser-verified against the final build (not an earlier one) via browser-verify."
---

# sketches — STATE

## Now

Visual phase V1 (tone mapping + sky/IBL) and V2 (procedural facades, hybrid buckets+shader) both
shipped and browser-verified. District weight ruled back to `log` (was `derived`, 81.5% one
district -> 40.3%), recorded in both contract docs. Three real V2 defects were found and fixed
AFTER the suite was green (floor-scale mismatch, wrong-axis window columns, a GLSL/JS backtick
collision) -- none caught by the tests as first written, all now guarded properly. One of those
fixes (axis pairing) is currently unverifiable in the browser: every building in every city.json
is square by construction, so the bug it fixes has never been visually observed.

## Open

- **Three rulings still owed** -- patina, scaffolding, ruins. Deferred this morning as blocked on
  V1; that block is gone (`compare.html` renders live through the viewer). Surface:
  https://fenrir-vps.komodo-deneb.ts.net:7500/compare.html (backend =
  `python3 -m http.server 8099 --bind 127.0.0.1 --directory ~/sketches/code-city/dist`; running).
- **Facades don't read at the default camera.** Browser-verified twice: not resolvable at default
  framing, only at close zoom. Progressive semantic zoom (PROJECT_IDEA.md §5.1) was never built --
  candidate next visual move once the three rulings above land.
- **L2-L5 deferred, fully scoped** --
  `~/docs/reusable-playbooks/legacy-audits/outputs/code-city/2026-09-01/lanes-pending.md`.
- **Non-square footprints** are what would make the V2 axis-pairing fix observable -- currently a
  compiler-side change (`compiler/index.ts` emits `width: side, depth: side` from one value), not
  renderer work.
- Footprint-floor default still unset (0.008 floor answers square geometry, districts lay out as
  full-width strips) -- fix-floor vs fix-layout is Usul's call, unchanged from before this session.
- 12 active worktrees; `git worktree remove` still permission-denied.

## Do not

- Don't add colors/fills into `src/renderer/svg.ts` -- stays presentation-free.
- Don't flip patina/scaffolding/ruins ON by default before the three rulings above.
- Don't repoint `facades.ts`'s floor/window derivations at metrics (loc/complexity/churn/age) --
  they deliberately restate geometry only; the lens system already encodes those and a facade
  signal would silently contradict whichever lens is active. See the module header if revisiting.
- Don't raise `TONE_MAPPING_EXPOSURE` or `WINDOW_DARKEN` without checking
  `tests/tone-mapping.test.ts` / `tests/facades.test.ts` -- both are gated against the
  never-confusable lightness ladder (ruin < landmark-band < building < landmark-body).
