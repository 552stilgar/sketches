# Step 4 — existing-condition materials and fixed details

Status: **first review packet**. This stage preserves the reviewed Step 3 shell and adds a separate, photo-grounded existing-condition layer. It does not apply the architect's proposed furniture or remodeling.

## Scene separation

- Step 3 base remains `C:\Workshop\blender\scenes\apartment-usul-new\apartment_shell_step3.blend`.
- Step 4 is saved separately as `C:\Workshop\blender\scenes\apartment-usul-new\apartment_existing_step4.blend`.
- New fixed elements live in Blender collection `04_STEP4_EXISTING_FIXED_DETAILS`.
- The Step 3 wall/floor/opening topology is not edited by the Step 4 script.
- Cutaway wall heights are temporary render states; the saved Step 4 scene is restored to full-height geometry.

## Photo-grounded finish and detail register

| ID | Element | Evidence | Confidence | Model treatment |
| --- | --- | --- | --- | --- |
| S4-M01 | Interior plank flooring | `124859`, `124904`, `125132` | high | Pale gray staggered-plank pattern on non-kitchen interior floors; color and plank dimensions are not calibrated. |
| S4-M02 | Interior walls/base palette | all interior photos | high | Warm-white matte wall material. Baseboards are visible in photos but not yet separately dimensioned. |
| S4-M03 | Exterior/lightwell frames | `124904`, `125132`, `125223`, `125227` | high | Existing Step 3 frames changed to dark/black aluminum; operability still follows the source inventory rather than photo inference. |
| S4-K01 | Kitchen cabinetry | `125206`, `125211`, `125219` | high for type/material and L relationship, low for dimensions | Greige handleless base/upper/tall cabinets. The sink return is perpendicular to the cooktop/oven run as shown in `125219`; exact run lengths remain inferred. |
| S4-K02 | Kitchen counter/backsplash | `125206`, `125211`, `125219` | high | Polished black-stone counter and full-height backsplash. |
| S4-K03 | Kitchen fixtures/appliances | `125211`, `125219` | high for presence and relative arrangement, low for exact size | Two recessed stainless basins and connected chrome faucet on the return; black glass cooktop and oven on the perpendicular run. |
| S4-K04 | Kitchen floor | `125206`, `125223`, `125227` | high for material, medium for boundary | Mid-gray stone/porcelain tile assigned to a reversible inferred kitchen zone. |
| S4-B01 | Balcony floor/walls | `125132`, `125523`, `125538` | high | Dark gray large-format tile and charcoal recess/cladding finish. |
| S4-B02 | Balcony balustrade | `125132`, `125523`, `125538` | high for type, low for dimensions | Glass over solid parapet with black rail/posts terminating at the rail; height and spacing remain provisional. |
| S4-B03 | Balcony drainage | `125132`, `125523`, `125538` | high for presence | Gridded linear drain along the street edge; width, slat spacing and offset are provisional. |
| S4-B04 | Balcony soffit/lighting | `125523`, `125538` | high for type, low for dimensions | Warm wood soffit with discernible longitudinal slat joints and two black downlights; soffit follows the source balcony footprint. |

## Explicitly not inferred

- No bathroom finishes or fixtures: there are no bathroom photos.
- No definitive bedroom/suite-specific styling: `124859`, `124904`, and `125132` remain partly unresolved as room assignments.
- No structural changes, new openings, wall moves, or feasibility claims from perspective photos.
- No architect-proposal furniture, office conversion, coffee area, or balcony laundry/storage intervention.
- No measured joinery depth, counter height, balcony railing height, soffit height, drain size, or calibrated colors.

## Review outputs

- `step4_materials_top_cutaway.png`: temporary low-wall cutaway; saved scene remains full height.
- `step4_materials_axon_cutaway.png`: temporary low-wall cutaway; saved scene remains full height.
- `step4_kitchen_section_detail.png`: elevated section-detail with the source-derived walls and opening frames hidden only for this render so both L runs, sink, cabinets and appliances remain visible; the saved scene restores every shell object.
- `step4_balcony_full_height.png`: full-height existing-condition detail view.

The review packet is intended to validate material direction and fixed-detail placement before any proposal layer is developed.
