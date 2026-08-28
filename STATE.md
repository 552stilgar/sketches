---
project: sketches
updated: 2026-08-28
campaign_ref: "2026-08-28 — (save stub) code-city vision: liveness/traffic recorded as PROJECT_IDEA §5.5; V2–V4 roadmap shape proposed"
phase: "code-city V1 (Phases 0–3: analyzer → compiler → renderer) is shipped and pushed. Session turned to vision: what V1 renders is structurally minimal — one BoxGeometry per building, language-style reduced to a hue, roads as 0.35-opacity lines — so a real repo reads as a field of blocks. The compiler, not the renderer, is the part that's genuinely done."
next: "Usul's call on the V2 scope: fix the three queued compiler defects first (footprint saturation, unscaled height, two localeCompare survivors), then the legibility pass — language→architecture, weighted roads, fan-in occupancy, dead-code-dark."
gates:
  - "code-city: 11/11 test files, 57/57 tests green, build clean, smoke green, browser-verify PASS 7/7."
---

# sketches — STATE

## Now

Vision session on code-city, no code changed. Recorded liveness/traffic as
`docs/PROJECT_IDEA.md` §5.5 (Usul's addition): dependencies and calls rendered as
*flow*, in three deliberately-distinct tiers — structural (`imports[]`, available now),
historical (git co-change), measured (an optional `traffic.json` sidecar, later). Two
constraints written in with it: the compiler emits weights while the renderer owns
animation, so `compileCity` stays pure; and unmeasured must never render as quiet.
Proposed but not ratified: **V2 legibility** (incl. static liveness), **V3 lenses**
(Phase 5), **V4 time travel** (Phase 4), measured runtime traffic its own later track.

## Open

- **Three queued compiler defects**, all in the metric→geometry seam, none fixed:
  `footprintSide` saturates near-flat at real directory-aggregate loc (buildings in a
  district come out nearly equal width); height is raw unscaled complexity (one hit
  2961 in a 1000-wide city); and two bare `localeCompare` survivors at
  `compiler/index.ts:76` (import sort) and `:86` (road sort) — the byte-determinism
  class the fix wave closed via `compareCodepoints` (`5e32832`), missed in the
  road-construction path. The determinism test doesn't vary locale, so it stays green.
- **Two gaps blocking §5.5**, both contract-level: `calls[]` is declared and validated
  in `types.ts` but `parser.ts` never populates it (empty on every node); and `Road` is
  `{from, to}` with no weight, with `compiler/index.ts` deduping edges through a `Set`
  — multiplicity is discarded at compile time.
- Dev server on :5273 still up, serving the qol-derived city.
