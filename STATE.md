---
project: sketches
updated: 2026-10-21
next: "Look-and-decide: patina, scaffolding, ruins (compare.html renders through the current viewer). Then default-camera / progressive semantic zoom: facades are browser-verified invisible at default framing."
phase: "code-city L2 (ruins follow renames), L4 (tests pinned to real fixtures) and L5 (derived district-weight solver, layout.districtWeight disclosed) landed 7513065 via Codex round 5; 564 tests. Visual rulings still owed."
campaign_ref: "2026-10-21 — code-city L2/L4/L5 landed via Codex round 5"
gates:
  - "564/564 tests green, 48 files, tsc clean on every touched file, dist rebuilt."
  - "V1 + V2 both browser-verified against the final build (not an earlier one) via browser-verify."
---

# sketches — STATE

## Now

- L2: ruins follow renames and drop restored deletions (ruins.ts). L4: district-weight and ruins tests pinned to real fixtures. L5: derived exponent counts zero-file districts, discloses clamping on stderr, city.json names the mode under layout.districtWeight; log/linear outputs byte-identical to the L4 fixture.
- Three rulings still owed: patina, scaffolding, ruins. compare.html renders live through the viewer (static loopback server on 8099 over dist, forwarded).
- Facades don't read at the default camera (browser-verified twice); progressive semantic zoom (PROJECT_IDEA.md §5.1) never built.
- Non-square footprints would make the V2 axis-pairing fix observable; compiler-side change (width/depth from one value).
- Footprint-floor default still unset (fix-floor vs fix-layout is Usul's call).
- L3 remains in lanes-pending.md (legacy-audits/outputs/code-city/2026-09-01).

## Do not

- Don't add colors/fills into src/renderer/svg.ts -- stays presentation-free.
- Don't flip patina/scaffolding/ruins ON by default before the three rulings above.
- Don't repoint facades.ts's floor/window derivations at metrics (loc/complexity/churn/age) -- they deliberately restate geometry only; the lens system already encodes those.
- Don't raise TONE_MAPPING_EXPOSURE or WINDOW_DARKEN without checking tests/tone-mapping.test.ts / tests/facades.test.ts -- both are gated against the never-confusable lightness ladder.
- Don't run lane land with an untracked IDEAS.md in the checkout and expect it to pass: commit or move it, or hand-ff after the overlap check.

## Open
- [tb-157] P2 **Three rulings still owed** -- patina, scaffolding, ruins. Deferred this morning as blocked on
- [tb-158] P2 **Facades don't read at the default camera.** Browser-verified twice: not resolvable at default
- [tb-159] P2 **L2-L5 deferred, fully scoped** --
- [tb-160] P2 **Non-square footprints** are what would make the V2 axis-pairing fix observable -- currently a
- [tb-161] P2 Footprint-floor default still unset (0.008 floor answers square geometry, districts lay out as
- [tb-162] P2 12 active worktrees; `git worktree remove` still permission-denied.
