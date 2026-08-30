---
project: sketches
updated: 2026-08-30
next: "Usul: pick district vs directory LOD via code-city/out/lod-compare/ (tailnet :7500, static server on 8099) — roads toggle off makes the two panes actually comparable. Then browser-verify dist/timeline.html."
phase: "code-city V5 shipped and pushed. This session: built an interactive LOD compare viewer (out/lod-compare/index.html, gitignored) since the raw SVGs render solid black — render2d deliberately emits no colors (contract). Housekeeping done: stale tailnet serves + orphan procs killed."
campaign_ref: "2026-08-29 — code-city V5: directory-LOD mode, git time-travel (snapshots + layout stability + timeline scrub), lens layer"
gates:
  - "code-city: 31 test files, 330/330 tests green, build clean, smoke green. Layout-stability holds for incremental snapshots (0/621 over 0.3 tolerance on real 631-file graph), degrades on high-growth pairs (4/40 over tolerance on an actual 07->08 pair)."
---

# sketches — STATE

## Now

LOD compare viewer live at tailnet `:7500` (proxies static server on `127.0.0.1:8099`,
`code-city/out/lod-compare/`), browser-verified: buildings colored by language, height
re-encoded as fill-opacity, roads/tethers toggleable, district labels. On the merged mgmt trio:
district LOD 631 buildings/1479 roads, directory LOD 262 buildings/624 roads, identity links
match (31/31) — no clone data lost either way. Visual read: `frdops` district dominates the
canvas (~71%) so the compare is largely judging one district; roads read as dense haze at
fitted zoom until toggled off.

## Open

- **LOD call is Usul's** — see viewer above.
- **Timeline UI not browser-verified** — data/morph path confirmed headlessly, DOM/WebGL half owed.
- **Real defects found, not yet fixed**: misleading `spawn git ENOENT` in `bin/snapshots.ts` on a
  pre-existence window; `gapBefore` path unreachable from real generated data (git history is
  monotonic); `CONTRACTS.md` "Status" table is stale/wrong (says 3 modules are NotImplemented stubs);
  0-building snapshot months render as an empty plain with no UNMEASURED disclosure.
- **New this session**: `render2d`'s SVG output is unstyled by contract (`docs/CONTRACT-render-svg.md`
  — presentation is deliberately excluded, only the road/tether structural distinction is
  guaranteed to survive a bare view). In practice a bare view renders solid black. Worth deciding
  whether `bin/render2d.ts` should ship a companion stylesheet/HTML wrapper for consumers, or
  whether "bring your own CSS" stays the intended contract.
- **11 stale lane worktrees** at `sketches/.claude/worktrees/` (not `code-city/.claude/worktrees/`
  as previously noted) — all 11 branches provably merged into main, only untracked content is
  `code-city/node_modules`. `git worktree remove` is denied by the permission classifier (tried
  with and without `--force`); needs a permission rule or Usul's own hand.

## Do not

- Don't add colors/fills into `src/renderer/svg.ts` to fix the black-render issue — the contract
  deliberately keeps `render2d` presentation-free; paint belongs in the consumer (see the compare
  viewer for the pattern).
