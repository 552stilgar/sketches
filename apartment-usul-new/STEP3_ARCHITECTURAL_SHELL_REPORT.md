# Step 3 - source-derived architectural shell

Status: **READY FOR USER REVIEW, NOT AS-BUILT CERTIFIED**

## Inputs and separation

- Geometry source: accepted Step 2 PyMuPDF vector reference, SHA-256 `84f4cd1037c745215da6d1171d0f961aec916a81253ff09f36bc9db65eaea5f4`.
- Coordinate frame: rotated landscape PDF points, 1191 x 842, main-plan ROI `(220,185,1145,585)`.
- Scale: printed 1:50 conversion, `0.0176388889 m/PDF point`.
- The rejected V01/V02 custom-parser geometry is not imported.
- Architect source inspected separately: `C:\Users\Usul\Downloads\CF arquitectura & paisaje_UGARTE_1ra propuesta muebles.pdf`, 15 pages. See `ARCHITECT_PROPOSAL_REFERENCE.md`.
- Proposed furniture, office conversion, cabinetry, finishes and lighting are intentionally excluded from the Step 3 baseline shell.

## Geometry method

1. Rasterize the accepted `MUROS` and `p-revoque` wall-face paths at 2 PDF-point cells.
2. Apply a reversible morphological closure to turn paired source faces into provisional wall footprints.
3. Re-open only the source-reviewed internal portal boxes so the solidification step cannot bridge actual door gaps.
4. Treat `CARPINTERIAS` and `p-puerta` geometry as enclosure boundaries for floor-region extraction; temporarily close only the two EX01 exterior doors during the flood test.
5. Flood the apartment and balcony regions separately, retaining the source stepped/slanted balcony outline.
6. Extrude the derived wall and floor rectangles in Blender; add exact source-supported door/window runs as independently editable frame objects.

This produces a coherent, reproducible review shell. It does not claim construction build-up accuracy, survey-grade wall thickness, or code compliance.

## Validation receipt

- Source paths consumed: 661.
- Wall/plaster paths: 182.
- Derived wall cells: 13,425.
- Interior floor cells: 47,025.
- Balcony floor cells: 7,724.
- Blender objects: 61 base wall solids, 15 above/below-opening infill solids, 56 interior-floor parts, 16 balcony-floor parts, 2 glazing-threshold parts, 46 opening/frame parts and 11 zone labels.
- Actual mask reachability from the living seed: PASS for living/dining, suite, dressing, ensuite, central passage, bedroom, main bath, WC, entry and kitchen.
- Source route semantics retained: bedroom to main bath; suite to dressing to ensuite; entry to WC; entry/circulation to kitchen.
- Balcony flood region is contiguous and distinct from the apartment interior because GL-01/GL-02 operability remains unknown.
- Exact source-reviewed internal door spans are re-opened after wall solidification; exterior entry and service doors are modeled as frames but temporarily closed only in the floor flood test.

## Visual inspection

- `step3_top_down.png`: full plan is in frame; kitchen, wet core, both sleeping-side zones, circulation and balcony are present; no detached balcony. Labels are placed above the full walls for this view and hidden in the 3D views. Final presentation QA moved `ENSUITE` fully inside its room and reduced/recentered `MAIN BATH` inside its walls.
- `step3_cutaway_axon.png`: the full apartment, kitchen/front corner and balcony are in frame with margin.
- Three `step3_eye_cutaway_*.png` views were inspected at full resolution. Each camera is inside its named room and uses an explicit 0.80 m render-only section cut. The saved `.blend` restores all base walls to 2.60 m and all opening infills are visible.
- The balcony storage/recess is now a separately flood-validated floor component; balcony-floor parts increased from 14 to 16.
- GL-01 and GL-02 have narrow floor-threshold parts beneath the source glazing line, removing the render seam without asserting operability.
- The thin grey member beside the living-side passage is a source-derived wall jamb next to the brown door-frame post; it is floor-connected and not a floating object.

## Opening-height geometry check

- Seven door openings have a 2.10 m clear head and a 0.50 m wall/lintel solid above, centered at z=2.35 m, completing the 2.60 m wall.
- Seven brown door-frame head members span z=2.10-2.155 m (center z=2.1275 m), leaving a full 2.10 m clear opening beneath.
- Eight glazing wall-infill solids provide the required wall below provisional sills and/or above provisional heads.
- Full-height GL-01/GL-02: sill 0.00 m, head 2.35 m, wall above 0.25 m.
- GL-03: provisional sill 0.45 m and head 2.25 m.
- Lightwell GL-04/GL-05: provisional sill 0.90 m and head 2.10 m.
- Read-only inspection of the saved `.blend` confirmed 61 restored base walls at exactly 2.60 m, seven 0.50 m over-door solids, and no hidden over-door lintels in the editable file.

## Provisional vertical/default parameters

| Parameter | Step 3 value | Status |
| --- | ---: | --- |
| Wall height | 2.60 m | Provisional; architect page 7 also shows 2.60 m, but only for proposed joinery/elevation. |
| Slab thickness | 0.12 m | Provisional visualization value. |
| Door height | 2.10 m | Provisional. |
| Full-height glazing head | 2.35 m | Provisional. |
| Lightwell sill/head | 0.90 / 2.10 m | Provisional. |

Horizontal geometry is source-derived from the developer drawing and its printed 1:50 scale, but remains unverified as-built. The 2 PDF-point shell mask corresponds to about 35.3 mm in model space; source face-to-face thicknesses are therefore represented for review, not construction documentation.

## Outputs

Fenrir project source location:

`/home/fenrir/sketches/.worktrees/codex-apartment-shell-20261026/apartment-usul-new`

PC Workshop editable/render outputs:

- `C:\Workshop\blender\scenes\apartment-usul-new\apartment_shell_step3.blend`
- `C:\Workshop\blender\scenes\apartment-usul-new\renders\step3\`

Reproducible project files:

- `prepare_step3_geometry.py`
- `step3_geometry.json`
- `build_step3_architectural_shell.py`
- `STEP3_BUILD_RECEIPT.json`
- `ARCHITECT_PROPOSAL_REFERENCE.md`
- `USER_PENDINGS.md`

## Stop gate

This completes the Step 3 review packet only. Do not start furniture, proposed-layout, material or polished-lighting work until the user reviews the shell and the consolidated pendings.
