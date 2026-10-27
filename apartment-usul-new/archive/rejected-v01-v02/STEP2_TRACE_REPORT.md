# Step 2 - Registered 2D reconstruction and validation

Status: **PASS WITH PROVISIONAL ASSUMPTIONS**. This is a developer-baseline reconstruction, not an as-built survey.

## Registration

- Global fitted scale: 283.090 source pixels per metre.
- Theoretical 1:50 scale at 360 dpi: 283.465 px/m.
- Difference from theoretical: -0.132%.
- Mean absolute printed-span residual: 4.1 mm.
- Maximum absolute printed-span residual: 13.4 mm.
- No room-by-room rescaling was used.

| Span | Printed | Reconstructed | Residual |
| --- | ---: | ---: | ---: |
| balcony_length | 6.19 m | 6.192 m | +2.4 mm |
| balcony_wide_depth | 2.40 m | 2.399 m | -1.5 mm |
| living_width | 6.70 m | 6.701 m | +1.1 mm |
| living_depth | 3.33 m | 3.324 m | -6.0 mm |
| suite_width | 3.22 m | 3.218 m | -1.9 mm |
| suite_depth | 3.24 m | 3.253 m | +13.4 mm |
| bedroom_width | 3.00 m | 2.992 m | -8.0 mm |
| bedroom_depth | 3.04 m | 3.031 m | -9.2 mm |
| main_bath_width | 1.57 m | 1.572 m | +1.9 mm |
| main_bath_depth | 2.32 m | 2.328 m | +7.9 mm |
| wc_width | 1.05 m | 1.049 m | -0.9 mm |
| wc_depth | 1.31 m | 1.311 m | +0.5 mm |
| entry_run | 2.89 m | 2.890 m | -0.5 mm |
| kitchen_width | 2.93 m | 2.932 m | +1.9 mm |
| kitchen_west_depth | 2.53 m | 2.526 m | -4.3 mm |
| kitchen_east_depth | 2.56 m | 2.565 m | +4.6 mm |

## Room and zone inventory

| Zone | Evidence class | Notes |
| --- | --- | --- |
| suite | printed-plus-inferred | Printed local spans constrain part of the polygon. |
| dressing | plan-inferred | Shape/offset follows visible wall faces and remains provisional. |
| ensuite | plan-inferred | Shape/offset follows visible wall faces and remains provisional. |
| central_passage | plan-inferred | Shape/offset follows visible wall faces and remains provisional. |
| bedroom | printed-plus-inferred | Printed local spans constrain part of the polygon. |
| bedroom_wardrobe_recess | plan-inferred | Shape/offset follows visible wall faces and remains provisional. |
| living_dining | printed-plus-inferred | Printed local spans constrain part of the polygon. |
| main_bath | printed-plus-inferred | Printed local spans constrain part of the polygon. |
| wc | printed-plus-inferred | Printed local spans constrain part of the polygon. |
| entry_circulation | printed-plus-inferred | Printed local spans constrain part of the polygon. |
| kitchen_breakfast | printed-plus-inferred | Printed local spans constrain part of the polygon. |
| balcony | printed-plus-inferred | Printed local spans constrain part of the polygon. |
| balcony_storage_notch | plan-inferred | Shape/offset follows visible wall faces and remains provisional. |

## Opening inventory

### Doors and passable openings

- `entry_external`: exterior -> entry_circulation; plan-symbol.
- `entry_to_living`: entry_circulation -> living_dining; open-plan inferred.
- `entry_to_kitchen`: entry_circulation -> kitchen_breakfast; plan-symbol.
- `entry_to_main_bath`: entry_circulation -> main_bath; plan-symbol.
- `entry_to_wc`: entry_circulation -> wc; plan-symbol.
- `passage_to_bedroom`: central_passage -> bedroom; plan-symbol.
- `passage_to_suite`: central_passage -> suite; plan-symbol.
- `suite_to_dressing`: suite -> dressing; plan-symbol.
- `dressing_to_ensuite`: dressing -> ensuite; plan-symbol.
- `living_to_passage`: living_dining -> central_passage; open connection inferred.

### Glazing and exterior openings

- `suite_to_balcony`: suite -> balcony; plan-plus-photo-family.
- `living_to_balcony`: living_dining -> balcony; plan-plus-photo.
- `bedroom_exterior`: bedroom -> exterior; plan-symbol.
- `kitchen_lightwell_glazing`: kitchen_breakfast -> lightwell; plan-plus-photo.
- `kitchen_north_opening`: kitchen_breakfast -> lightwell; plan-symbol; type unresolved.

## Validation checks

- 13 closed zone polygons; zero-area zones: none.
- Self-intersections: 0 total.
- Entry-route targets missing from the declared connectivity graph: none.
- Kitchen glazing is registered to the internal lightwell, not the street balcony.
- The stepped balcony and lower-right storage/structure notch are separate polygons.
- The architect proposal is not included in any traced coordinate.

## Residual limitations

- Developer PDF orientation is used exactly as printed and is not mirrored.
- The developer unit-family plan is treated as the baseline even though current as-built correspondence is unresolved.
- Room-face polygons are registered to the source raster; unprinted offsets remain provisional.
- Architect proposal geometry is excluded from this baseline trace.
- Door/window types are taken from visible symbols; widths and construction details are not site-measured.
- The first three interior photos are not used to set geometry.
- Raster line weight and ambiguous dimension-arrow endpoints create residuals at the centimetre scale.
- Door leaves and glazing types are inventory annotations, not measured construction details.
- Prior V01/V02 geometry was not used as source evidence.

## Review boundary

Step 2 ends with this packet. Do not begin 3D reconstruction until the trace and consolidated pendings are reviewed.
