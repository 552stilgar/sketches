# Usul new apartment

Private, reproducible apartment-model project hosted in the Fenrir `sketches` repository. The current reviewed checkpoint is the Step 3 architectural shell.

## Start here

1. Read `CHECKPOINT_STEP3.md` for the accepted state, resume entry point and gated next steps.
2. Read `STEP3_ARCHITECTURAL_SHELL_REPORT.md` for geometry and validation details.
3. Read `USER_PENDINGS.md` before treating any provisional value as measured.
4. Use `validated_source/source_vector_reference.json` and `step3_geometry.json` as the accepted geometry evidence/data.

Do **not** resume from `archive/rejected-v01-v02/`. Those files are retained only to explain failed early approaches.

## Host ownership

- **Fenrir / Sketches:** Git-tracked reports, decisions, accepted vector evidence, deterministic geometry data and rebuild scripts. Private source files and review renders live beside them under ignored `sources/` and `renders/`.
- **PC Workshop:** Blender 5.2.2 compute, editable `.blend` scenes and primary render output under `C:\Workshop\blender\scenes\apartment-usul-new`.

## Accepted rebuild

From a PC copy of this project:

```text
python prepare_step3_geometry.py
C:\Workshop\blender\blender-5.2.2-windows-x64\blender.exe --background --factory-startup --python build_step3_architectural_shell.py
```

`prepare_step3_geometry.py` validates the accepted source hash and writes `step3_geometry.json`. The Blender script builds a distinct Step 3 scene, renders the five review views, saves the editable scene and writes `STEP3_BUILD_RECEIPT.json`.

`update_step3_top_labels.py` is a presentation-only correction for an existing Step 3 scene. It changes no mesh geometry and renders only the top view.

## Scope boundary

- The developer PDF is a dimensioned reference baseline, not a confirmed as-built survey.
- Vertical dimensions, wall build-ups, sills/heads and opening details remain provisional unless explicitly documented otherwise.
- The architect proposal is design intent only and does not alter baseline walls.
- Step 4 may add existing-condition materials and fixed details grounded in photos; proposed furniture/remodeling remains a later, separately gated layer.
- No construction or structural feasibility is inferred.
