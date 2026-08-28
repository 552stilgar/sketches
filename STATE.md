---
project: sketches
updated: 2026-08-28
campaign_ref: "2026-08-28 — code-city: all 13 review findings fixed + merged via orchestrated fix wave"
phase: "code-city V1 shipped, verified, and pushed (origin f0f640c). A follow-up dogfood run against a real 540-file repo (usul-qol, the first past the >500 LOD threshold) surfaced two new bugs the synthetic fixtures never exercised: the sqrt(loc) footprint formula saturates near-flat at real directory-aggregate loc values (buildings within a district end up nearly the same width regardless of loc), and building height is raw unscaled complexity with no renderer-side normalization (one building hit height 2961 in a 1000-wide city)."
next: "Decide whether the qol-scale footprint/height bugs get a second fix wave, or whether V1 is considered done and these become V2 backlog. A vite.config.ts allowedHosts fix (tailnet dev-server access) is drafted but uncommitted."
gates:
  - "code-city: 11/11 test files, 57/57 tests green, build clean, smoke green, browser-verify PASS 7/7."
---

# sketches — STATE

## Now

code-city V1 closed out: 13 findings fixed via a fix wave, browser-verified, pushed
(f0f640c). Follow-up dogfood run against usul-qol (540 files, first repo past the
>500 LOD threshold) confirmed the LOD aggregation is correct on real data but
surfaced 2 new defects — see `phase`. Also fixed vite.config.ts's tailnet-host
block (uncommitted). Dev server (:5273) is up, serving the qol-derived city for
Usul to look at.

## Open

- Second fix wave for the qol-scale bugs (footprint saturation, unscaled height) —
  Usul's call, not yet requested.
- vite.config.ts allowedHosts fix — commit pending this checkpoint.
- Dev server on :5273 — kill when Usul is done looking, or leave running (costs ~100MB
  idle, no CPU).
