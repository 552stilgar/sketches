# Step 3 reviewed checkpoint

Checkpoint date: 2026-10-27
Branch: `codex-apartment-shell-20261026`
Status: **reviewed spatial shell accepted; Step 4 may start only from this checkpoint**

This document is the resume card for the apartment project. A Git commit records the reproducible text/data state; it is not by itself an off-machine backup of ignored sources, renders or Blender scenes.

## Accepted source of truth

Use these in order:

1. `validated_source/source_vector_reference.json` — PyMuPDF-interpreted developer-plan vector paths and reviewed jambs. Internal source-PDF SHA-256: `84f4cd1037c745215da6d1171d0f961aec916a81253ff09f36bc9db65eaea5f4`.
2. `STEP2_ROOM_OPENING_INVENTORY.md` and `STEP2_VALIDATED_REFERENCE_REPORT.md` — accepted semantics and source-validation boundary.
3. `prepare_step3_geometry.py` — derives wall/floor masks, preserves reviewed portals and checks actual mask reachability.
4. `step3_geometry.json` — deterministic Step 3 geometry payload.
5. `build_step3_architectural_shell.py` — builds the editable Blender shell and review views.
6. `STEP3_ARCHITECTURAL_SHELL_REPORT.md` and `STEP3_BUILD_RECEIPT.json` — reviewed result and machine-readable receipt.

The matching editable scene is outside Git on PC Workshop:

`C:\Workshop\blender\scenes\apartment-usul-new\apartment_shell_step3.blend`

## Reviewed result

- Full plan topology matches the accepted Step 2 vector reference within the stated 2 PDF-point shell-mask resolution.
- All ten interior zones pass the derived-mask route check.
- Main bath access remains bedroom-side; suite connects to dressing, then ensuite.
- Balcony is attached, stepped/slanted, and includes the separate storage/recess floor component.
- Seven door openings have 2.10 m clear height, a 0.055 m frame head above that clearance and a 0.50 m wall/lintel to the provisional 2.60 m wall height.
- Top and full-frame axon are the accepted spatial review views. The three room views are explicitly 0.80 m section-cut details, not realistic eye-level renders.
- Proposed furniture, cabinetry and remodel changes are absent.

## Rebuild and verify

On PC Workshop, from a copy of this directory:

```text
python prepare_step3_geometry.py
C:\Workshop\blender\blender-5.2.2-windows-x64\blender.exe --background --factory-startup --python build_step3_architectural_shell.py
```

Expected lightweight checks:

- `prepare_step3_geometry.py` reports every `reachability` value as `true`.
- `STEP3_BUILD_RECEIPT.json` records 61 base wall solids, 15 opening-infill solids, 56 interior-floor parts, 16 balcony-floor parts, 2 glazing thresholds and 46 opening/frame parts.
- Saved `.blend` contains seven 0.50 m `DR*_wall_above_head` objects centered at z=2.35 m, seven 0.055 m door-frame heads centered at z=2.1275 m, and base wall heights of 2.60 m.
- Review image hashes and scene/source hashes match `CHECKSUMS_STEP3.md` unless a new gated revision intentionally replaces them.
- `prepare_step3_geometry.py` writes LF-terminated JSON explicitly, so `step3_geometry.json` is byte-identical on Windows and Linux; the reviewed Blender geometry is unchanged by this serialization normalization.

## Explicitly rejected history

`archive/rejected-v01-v02/` contains the rectangle-based V01/V02 model, raster-inferred Step 2 trace and lightweight custom PDF parser. They are retained for audit only.

Do not import, execute or derive geometry from:

- `build_apartment.py` / `build_apartment_v02.py`
- `build_step2_plan.py` / `step2_trace.json`
- `extract_step2_pdf_vectors.py` / `parse_step2_vector_layers.py` / `step2_vector_layers.json`
- `build_step2_vector_plan.py`

The custom parser lost nested Form/graphics-state transforms and grossly misregistered the balcony, wet core, kitchen and glazing. The accepted replacement is `validated_source/source_vector_reference.json`, produced from PyMuPDF `Page.get_drawings()` with page rotation applied once.

## Current decisions and unresolved items

- Existing-condition baseline and architect proposal must remain separate object/data layers.
- Source photos support materials, visible fixed details and opening character; they do not override plan topology.
- No site measurement has yet confirmed the developer-plan scale as-built.
- Ceiling, wall thicknesses, door/window construction sizes, balcony details and GL-01/GL-02 operability remain provisional.
- Ambiguous photo-to-room assignments and proposal approval choices remain in `USER_PENDINGS.md`.

## Next resume entry point: Step 4

The user authorized Step 4 after this checkpoint is committed and verified.

Step 4 scope is **existing-condition materials and fixed details from the photos**:

- preserve the Step 3 topology and save a distinct Step 4 `.blend`/render set;
- map every added material/detail to photo evidence and label inference explicitly;
- retain uncertain room assignments and missing coverage in `USER_PENDINGS.md`;
- keep architect-proposed furniture/remodeling completely separate and unimplemented;
- return reviewable top, axon and detail views that clearly identify full-height versus cutaway renders.

Step 4 acceptance gate:

1. no unreferenced structural or wall-layout change;
2. evidence table for every material/fixed detail added;
3. distinct Step 4 scene and outputs, with Step 3 preserved;
4. actual-pixel inspection and updated checksums/report;
5. user review before any proposal/furniture stage.

## Later gated stages

- Proposal/furniture stage: only approved architect elements, independently switchable from the existing-condition baseline.
- Polished materials/lighting/final presentation: only after the existing-condition and proposal layers are separately reviewed.
