# Rejected V01/V02 and parser drafts

Everything in this directory is historical evidence only. **Do not execute, import or resume from these files.**

Rejected families:

- `build_apartment.py`, `build_apartment_v02.py`, `dimensions.json`: early disconnected rectangle/massing shells.
- `build_step2_plan.py`, `step2_trace.json`, `STEP2_TRACE_REPORT.md`: raster-inferred trace that contained incorrect room/opening semantics, including false main-bath access.
- `extract_step2_pdf_vectors.py`, `parse_step2_vector_layers.py`, `step2_vector_layers.json`, `build_step2_vector_plan.py`, `STEP2_VECTOR_TRACE_REPORT.md`: lightweight custom-parser attempt. It lost nested Form/graphics-state transforms and grossly misregistered the plan.
- `analyze_step2_lines.py`, `make_step2_grid.py`, `make_plan_comparison.py`: diagnostics tied to the rejected raster/V01/V02 path.

Authoritative replacements:

- vector evidence: `../../validated_source/source_vector_reference.json`;
- opening semantics: `../../STEP2_ROOM_OPENING_INVENTORY.md`;
- current geometry: `../../step3_geometry.json`;
- build: `../../build_step3_architectural_shell.py`;
- resume instructions: `../../CHECKPOINT_STEP3.md`.

`step2_vector_layers.json` is intentionally ignored because it is generated bulk as well as invalid geometry evidence.
