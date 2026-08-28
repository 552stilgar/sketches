---
project: sketches
updated: 2026-08-28
next: "Usul's call: push main to origin (12 commits ahead, unpushed) — then park code-city or start V3 (animated flow, §5.5 measured tier)."
phase: "code-city V2 shipped: contracts frozen (distribution-normalized footprint/height, Road.weight, calls[] resolution rule), then a 6-leaf orchestrated build (2 codex lanes + 2 sonnet lanes + 2 merges) landed weighted roads, populated calls[], road tiering, and fan-in occupancy/dead-code-dark/4 style profiles."
campaign_ref: "2026-08-28 — code-city V2: contracts frozen + 6-leaf orchestrated build shipped, dogfood HONEST on all 6 checks, browser-verify PASS 7/7"
gates:
  - "code-city: 14/14 test files, 122/122 tests green, build clean, smoke green, browser-verify PASS 7/7."
---

# sketches — STATE

## Now

code-city V2 done in one session: a board picked defect-fix + contract-slice + legibility over
parking or git-history; P1 (contract freeze) landed geometry distribution-normalized against
the city's own p95 (not a fixed constant), plus `Road.weight` and a `calls[]` no-fabrication
rule; a 6-leaf Workflow then built it (codex ×2 compiler/analyzer, sonnet ×2
road-tiering/building-legibility, 2 merges, verify). Dogfooded against `usul-qol` (the repo that
surfaced the original bugs): footprint spread and height band both read HONEST now, road
weights and `calls[]` populated and varied. browser-verify PASS 7/7, incl. a self-check
confirming the 4 style profiles render distinct silhouettes.

## Open

- **Not pushed.** `main` is 12 commits ahead of `origin/main` (contract freeze + 4 build
  commits + 4 merge/doc commits).
- **`codex exec` `--` separator lesson** (logged in `~/lessons.md`, not yet folded into
  `/usul-codex`'s dispatch mechanics): a task brief starting with a `---` line gets parsed as a
  CLI flag by `codex exec`, exit=2. Both P2 lanes hit this independently and fixed it themselves.
- **V2 legibility pass is now the floor, not a stretch goal to revisit** — road tiering and
  building occupancy/styles are live. Next real fork is §5.5's animated/measured tier (particle
  flow, `traffic.json` sidecar) or Phase 4 (git history / time travel), per the board run this
  session — animation was explicitly deferred to keep this wave static-only.
