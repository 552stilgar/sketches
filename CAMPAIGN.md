# sketches — Campaign Log

## Status
Active. Creative coding sandbox — generative art experiments in self-contained HTML/JS files.

## What exists
- `particle-horizon.html` — warm amber particle field, interactive horizon drag, repel/attract/sculpt modes
- `entropic-collapse.html` — Kuramoto phase coupling, cos(Δφ) force dynamics, many/few + cyclic/attractor modes
- `chromatic-order.html` — generative art sketch
- `void-filament.html` — generative art sketch
- `voronoi-dominion.html` — live Voronoi tessellation; noise-field seed drift, soft wall, 4 mouse modes (passive/attractor/repulsor/vortex), identity hue + area-based saturation pressure, configurable slider panel (P), +/- seeds, h/e toggles

## Conventions
- Single self-contained HTML files — no build step, no framework
- Open directly in browser
- Each sketch is independent; no shared state or imports
- p5.js + d3-delaunay via CDN; dark canvas (#060608); monospace HUD overlay; CFG object at top

## Next actions
1. Add `generative-art` to newsletters topics-registry.json
2. Next sketch candidates: Lacuna (simplex noise dungeon), Axiom (L-system), Strata (FBM terrain octave decomp)
3. Fix reddit-session.mjs OAuth (552stilgar app — check Preferences→Apps) to resume sourcing ideas
