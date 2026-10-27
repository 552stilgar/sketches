# Step 2 V02 - Vector-derived reconstruction and validation

Status: **REJECTED_PARSER_MISREGISTRATION**. Independent overlay QA found gross plan misregistration; do not use this packet as geometry.

The lightweight parser reads decoded streams independently and therefore loses the page-to-Form XObject transform/resource graph. It displaces the balcony from the left to the right wet-core/kitchen area, omits or corrupts the main-bath/WC/kitchen boundaries, and places glazing through the bath. The five reviewed opening spans remain useful local evidence, but they do not validate the surrounding plan.

## Correction basis

- The prior raster-inferred zone trace is retained as a rejected draft and is not used as geometric evidence.
- Wall faces come directly from `MUROS` and `p-revoque` CAD layers.
- Parsed door jambs, leaves and swing arcs come from `Carpinterias PUERTAS` and `p-puerta`; the five independently reviewed vector jamb spans are also applied explicitly because some nested-form paths are not exposed as standalone layer paths by the lightweight parser.
- Those five spans are cross-checked against the PDF's final 360 dpi rendering, so hidden CAD construction paths do not masquerade as visible barriers.
- Windows and glazing come directly from `CARPINTERIAS`.
- The PDF page rotation of 270 degrees is applied before comparison to the rendered landscape page.
- The balcony's source-vector slope is preserved; it is not orthogonalized.

## Independently reviewed doorway geometry

| Opening | Exact landscape-PDF jamb span (points) | Geometric check |
| --- | --- | --- |
| suite_from_central_passage | (563.80, 318.24) to (570.04, 367.92) | PASS; core dark fraction 0.005, jamb support [621, 494], nearby source pixels 23563 |
| bedroom_from_central_passage | (626.44, 318.24) to (633.28, 367.92) | PASS; core dark fraction 0.005, jamb support [572, 480], nearby source pixels 26495 |
| main_bath_from_bedroom_side | (801.88, 367.92) to (851.56, 374.76) | PASS; core dark fraction 0.019, jamb support [617, 594], nearby source pixels 27002 |
| dressing_from_suite | (506.44, 230.16) to (512.68, 285.60) | PASS; core dark fraction 0.000, jamb support [461, 533], nearby source pixels 25672 |
| ensuite_from_dressing_side | (579.88, 235.92) to (586.72, 285.60) | PASS; core dark fraction 0.006, jamb support [489, 630], nearby source pixels 33406 |

The main-bath entrance is on its upper/right bedroom-side boundary. The suite and bedroom entrances are vertical gaps flanking the central passage. The dressing and ensuite entrances are on their west dividers. No horizontal corridor-edge opening is invented.

## Geometry tests

- Vector paths: 173 wall/plaster, 455 door, 24 carpentry/glazing paths in the main-plan bounds.
- Each reviewed jamb span is taken from vector endpoints, then checked at 5 pixels per point against the PDF's final rendered state: the shrunken core must remain mostly clear, both jamb ends must have visible support, and source drawing geometry must occur nearby.
- Entry connectivity is tested by flood-filling free space derived from the source vector wall paths after clearing the five reviewed jamb spans and applying wall-band dilation.
- `entry_circulation` reachable from entry: **yes**
- `living_dining` reachable from entry: **yes**
- `suite` reachable from entry: **yes**
- `central_passage` reachable from entry: **yes**
- `bedroom` reachable from entry: **yes**
- `main_bath` reachable from entry: **yes**
- `wc` reachable from entry: **yes**
- `kitchen_breakfast` reachable from entry: **yes**
- `dressing` reachable from entry: **yes**
- `ensuite` reachable from entry: **yes**
- `balcony` reachable from entry: **yes**

## Limits

- This reconstructs the developer vector plan, not a confirmed as-built survey.
- Flood-fill is a topology test, not a code-compliant clearance or accessibility analysis.
- Opening construction sizes and heights remain unmeasured.
- Architect proposal paths are excluded.

Step 2 stops at this corrected review packet. Do not begin 3D before review.
