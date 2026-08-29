---
project: sketches
updated: 2026-08-29
next: "Open code-city/out/lod-compare/city-district.svg vs city-directory.svg and pick district vs directory LOD (631 vs 262 buildings on the merged mgmt trio, no clone data lost either way). Then browser-verify dist/timeline.html."
phase: "code-city V5 shipped via orchestrated Workflow: directory-LOD mode, git time-travel (snapshots + layout stability + timeline scrub), lens layer (Architecture/Complexity/Activity/Quality)."
campaign_ref: "2026-08-29 — code-city V5: directory-LOD mode, git time-travel (snapshots + layout stability + timeline scrub), lens layer"
gates:
  - "code-city: 31 test files, 330/330 tests green, build clean, smoke green. Layout-stability holds for incremental snapshots (0/621 over 0.3 tolerance on real 631-file graph), degrades on high-growth pairs (4/40 over tolerance on an actual 07->08 pair)."
---

# sketches — STATE

## Now

code-city V5: `compileCity(graph, { cloneLodScope })` makes district-vs-directory LOD selectable,
defaulting to today's district behavior (byte-identical when omitted). Git time-travel spine landed
end to end — `bin/snapshots.ts` (monthly repo.json, anchored to snapshot commit date), path-keyed
layout stability in `compiler/layout.ts`, and a timeline scrub UI (`dist/timeline.html`, driven
headlessly against 6 real months, not yet browser-verified). Lens layer over already-compiled
complexity/churn/architecture data, positions locked, percentile scales; Quality lens correctly
renders UNMEASURED (no coverage data exists) rather than fabricate a signal. 12 local commits,
pushed this close.

## Open

- **LOD call is Usul's** — comparison artifacts at `code-city/out/lod-compare/` (district: 631
  buildings / directory: 262, on the real merged mgmt trio; zero clone-identity data lost either way).
- **Timeline UI not browser-verified** — data/morph path confirmed headlessly, DOM/WebGL half owed.
- **Real defects found, not yet fixed**: misleading `spawn git ENOENT` in `bin/snapshots.ts` on a
  pre-existence window; `gapBefore` path unreachable from real generated data (git history is
  monotonic); `CONTRACTS.md` "Status" table is stale/wrong (says 3 modules are NotImplemented stubs);
  0-building snapshot months render as an empty plain with no UNMEASURED disclosure.
- **Two stale tailnet serve entries** from the prior (2026-08-28) session still up: `:7500`, `:7600`.
  Teardown: `tailscale serve --https=7500 off` / `--https=7600 off`.
- **11 stale lane worktrees** under `code-city/.claude/worktrees/` (6 from V4, 5 from V5) — pruning
  not done this session.
