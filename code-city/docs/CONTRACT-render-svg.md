# Contract: city.json → SVG (render2d)

- Producer: `render2d(city: CityModel): string` — `src/renderer/svg.ts`
- Purpose: the Phase-1 debug/iteration view (`docs/PROJECT_IDEA.md` §9.7 — "iterate layout
  algorithms in 2D before orbiting a 3D camera"). Not the primary explorer. `render2d` never
  reads or writes files itself — `bin/render2d.ts` owns the file I/O (`city.json` in, `.svg`
  out).

## Coordinate space

`city.json` coordinates ARE the SVG coordinate space — **no additional scaling**. The root
`<svg>` element's `viewBox` must be `"0 0 1000 1000"` (the fixed canvas size from
`docs/CONTRACT-city-json.md`), and every `x`/`y`/`width`/`height` attribute below is copied
directly from the matching `CityModel` field (`Building.depth` maps to the SVG rect's `height`
attribute — SVG has no `depth` axis; this is the top-down projection of the city's Y axis).

## Required output shape

```
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="1000" height="1000"
     data-flow-provenance="structural (imports + calls)">

  <g class="district" data-id="{district.id}">
    <rect class="district-ground" x="{x}" y="{y}" width="{width}" height="{depth}" data-style="{style}" />
  </g>
  <!-- one <g class="district"> per CityModel.districts entry -->

  <rect class="building" data-id="{building.id}" x="{x}" y="{y}" width="{width}" height="{depth}"
        data-height="{height}" data-style="{style}" />
  <!-- one <rect class="building"> per CityModel.buildings entry -->

  <line class="road" data-from="{from}" data-to="{to}" data-tier="{tier}"
        stroke-width="{w}" stroke-opacity="{o}" stroke-dasharray="{period / 2} {period / 2}"
        x1="…" y1="…" x2="…" y2="…">
    <animate attributeName="stroke-dashoffset" from="0" to="{period}"
             dur="{period / speed}s" repeatCount="indefinite" />
  </line>
  <!-- roads: optional to render visibly, but use this shape if rendered -->

</svg>
```

Attribute **order within a tag is not significant** — every consumer, including
`tests/render2d.test.ts`, parses attributes by name, not position.

## What `tests/render2d.test.ts` gates

1. The output contains an `<svg …>` opening tag with a `viewBox` attribute.
2. Exactly one `<g class="district" …>` per district (a bare count, order not checked).
3. Exactly one `<rect class="building" …>` per building, each carrying `data-id`, `x`, `y`,
   `width`, `height` attributes.
4. Sorting buildings by `width * depth` (from `city.json`) and sorting the rendered
   `<rect class="building">` tags by `width * height` (parsed from the SVG) must produce the
   **same id order** — the renderer must not distort the relative footprint sizes it was given.
   Given the "no additional scaling" rule above, this holds trivially if `render2d` copies
   `width`/`depth` straight through, which is what's required.

## Road tiering (added 2026-08-28, V2)

Every rendered road carries `data-tier`, `stroke-width` and `stroke-opacity`, derived from
`Road.weight` (`docs/CONTRACT-city-json.md`, "Road weight"). `data-tier` is one of
`footpath` / `street` / `arterial` / `highway`.

- Tier boundaries are the **25th/50th/75th percentile of this city's own road weights**
  (nearest-rank, no interpolation), not fixed constants — a repo whose heaviest edge is weight 3
  still gets four distinguishable tiers instead of collapsing everything into `footpath`.
- A road with **no** `weight` is classified as weight `1` — *unweighted*, never zero-traffic
  (`PROJECT_IDEA.md` §5.5).
- The 3D and SVG renderers import the same boundary/classification functions from
  `src/renderer/roads.ts`, so the two views cannot drift into different tierings.
- `tests/render2d.test.ts` gates that a spread of road weights produces distinct, monotonically
  increasing `stroke-width` values, and that repeat renders stay byte-identical.

## Structural road flow (added 2026-08-28, V3)

Every rendered road describes its motion with static, declarative SMIL markup. The renderer calls
`flowBoundaries(city.roads.map(road => road.weight))` once and passes that same boundaries object
to both `roadTier` and `flowParams`. For each road, `flowParams(road.weight, boundaries)` is the
only source of dash density, speed, direction, and provenance; renderers must not define a second
weight-to-motion mapping.

The road's `stroke-dasharray` is exactly `"{dashPeriod / 2} {dashPeriod / 2}"`: an equal dash/gap
pair whose sum is `flowParams(...).dashPeriod`. Its child `<animate>` has
`attributeName="stroke-dashoffset"`, `from="0"`, `to="{dashPeriod}"`,
`dur="{dashPeriod / speed}s"`, and `repeatCount="indefinite"`, where `speed` and `dashPeriod` are
the values returned by `flowParams`. The animation therefore completes one full dash cycle every
`dashPeriod / speed` seconds.

Road coordinates retain their endpoint meaning: `x1`/`y1` is `Road.from` (the importer) and
`x2`/`y2` is `Road.to` (the imported building). Data flow runs **`to` → `from`**, representing
results flowing from imported leaves toward importers. On an SVG line drawn from `from` to `to`,
increasing `stroke-dashoffset` realizes that direction, so the animation increases from `0` to one
positive `dashPeriod`; it must not decrease.

`render2d` remains a pure synchronous function: the same `CityModel` must produce a
byte-identical SVG string on every call, forever. The SVG contains only static duration, period,
and direction attributes derived from the model. The renderer must not read a clock, choose a
random value, maintain a counter, or compute an instant-in-time dash offset.

The root `<svg>` carries
`data-flow-provenance="structural (imports + calls)"`, sourced from
`FLOW_PROVENANCE_LABEL.structural`. This documented attribute identifies the animation as an
imports/calls-derived structural signal, not measured runtime traffic.

Building and district `id`s **must** appear as `data-id` — this is the only reliable way a click
handler (Phase 3, out of scope here) or a test can join an SVG element back to its `CityModel`
entry.
