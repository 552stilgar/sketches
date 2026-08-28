---
project: sketches
updated: 2026-08-28
next: "Push 13 local commits (V3 flow + V4 datastores/clones) to origin — Usul's call, pending. Then judge the LOD trade-off (clone-bearing districts now bypass the 500-file threshold entirely) and either accept it or scope it to directory-level."
phase: "code-city V3 (animated flow, shared flow.ts contract) and V4 (datastore landmarks + clone-identity tethers, camera fit-to-bounds, district/material craft) both shipped this session via orchestrated Workflow waves."
campaign_ref: "2026-08-28 — code-city V3 + V4: flow contract, merge-stage dogfood, camera/craft/datastores/clones, live tailnet viewer"
gates:
  - "code-city: 24 test files, 237/237 tests green, build clean, smoke green, browser-verify PASS on V3 flow (offsets wrap, weight-proportional rate, provenance visible on screen)."
---

# sketches — STATE

## Now

V3: shared `src/renderer/flow.ts` gives roads animated, provenance-tagged flow. `bin/merge.ts`
renders multiple repos as one city — usul-mgmt trio shows 0 cross-district roads, confirming the
shared kernel is vendored not imported. V4: datastore landmarks (schema-derived only, never the
live `.db`) + clone-identity tethers (exact content-hash, static/elevated, never confusable with
a road). A merge-stage bug silently dropping datastores across repos was caught by verifying the
real trio, not the suite, and fixed. Real trio: 3 vendored-kernel reservoirs (24/22/22 tables,
vendors 2 behind), 31 identity links (19 span all three). Two live tailnet views up for Usul —
see live-urls.md.

## Open

- **13 local commits, not pushed** (V3 flow + merge-stage fix + full V4 wave) — Usul's call.
- **LOD design trade-off, undecided.** Clone-aware LOD landed at *district* granularity, not the
  *directory* granularity originally specced — any district containing even one duplicated file
  pair now keeps full file-level detail past the 500-file threshold. This is what makes tethers
  attachable at all, but the merged mgmt city went from 21 buildings to 625 as a result. Worth
  judging by eye in the live viewer before it hardens.
- **Two tailnet serve entries left running**, outlive this session only until reboot:
  `:7500` (static screenshot/plate gallery) and `:7600` (live dev viewer proxy). Teardown:
  `tailscale serve --https=7500 off` / `--https=7600 off`.
- Vendor-sync drift in usul-mgmt-itba/frd-ops (3 kernel files stale) was handed to the concurrent
  usul-mgmt session directly, not tracked here — see that project's own state.
</content>
