# Step 4 reviewed checkpoint

Checkpoint date: 2026-10-27

## Accepted state

Step 4 is the reviewed existing-condition materials and fixed-detail layer built on the Step 3 architectural shell. The editable Step 3 scene and its source-derived topology remain unchanged. Architect-proposal furniture and remodeling remain excluded.

Accepted additions are photo-grounded pale gray plank flooring, white walls, black frames, the existing kitchen's L relationship and principal fixed elements, and the balcony's tile, charcoal finish, balustrade, linear drain, wood-slat soffit and downlights. Unmeasured sizes remain provisional.

## Host ownership and paths

- Fenrir project: `/home/fenrir/sketches/.worktrees/codex-apartment-shell-20261026/apartment-usul-new`
- Rebuild script: `build_step4_existing_condition.py`
- Verification script: `verify_step4_scene.py`
- Evidence/report: `STEP4_EXISTING_CONDITION_REPORT.md`
- Build receipt: `STEP4_BUILD_RECEIPT.json`
- Verification receipt: `STEP4_VERIFICATION.json`
- Checksums: `CHECKSUMS_STEP4.md`
- Library identities: `STEP4_LIBRARY_DELIVERY.json`
- Ignored private sources: `sources/`
- Ignored review renders: `renders/step4/`
- PC Workshop Step 3 scene: `C:\Workshop\blender\scenes\apartment-usul-new\apartment_shell_step3.blend`
- PC Workshop Step 4 scene: `C:\Workshop\blender\scenes\apartment-usul-new\apartment_existing_step4.blend`

## Rebuild and verify

Run from a PC copy of the project after confirming the reviewed Step 3 blend exists:

```text
C:\Workshop\blender\blender-5.2.2-windows-x64\blender.exe --background --python build_step4_existing_condition.py
C:\Workshop\blender\blender-5.2.2-windows-x64\blender.exe --background --python verify_step4_scene.py
```

The build opens the Step 3 scene, creates collection `04_STEP4_EXISTING_FIXED_DETAILS`, writes the distinct Step 4 blend, and renders four review views. Cutaway/section states are render-only; the saved scene restores the full-height shell.

## Verified checkpoint properties

- 61/61 source-derived base walls are restored to the provisional 2.60 m full height.
- 120 separate Step 4 detail objects are visible after save.
- No architect-proposal collection exists.
- Step 3 blend SHA-256 remains `f0177af4f7edd91b78b2dae188b8c78d05b81de11d438eded1c43bf235972f5d`.
- Step 4 blend SHA-256 is `130b1ec9ba2efe529b1a774e10720b5e56b43a9d7b1eccb03dafd2771cbf26bf`.
- The four reviewed Library images retain the identities recorded in `STEP4_LIBRARY_DELIVERY.json` at version 1.

## Remaining provisional items

- Exact kitchen cabinet/run/counter dimensions and kitchen tile boundary.
- Exact plank/tile module dimensions and calibrated material colors.
- Balcony parapet, rail, drain, soffit, slat and downlight dimensions.
- Bathroom finishes and fixtures because no bathroom photo is available.
- Room assignments for `20260804_124859.jpg`, `20260804_124904.jpg`, and `20260804_125132.jpg`.
- Current as-built correspondence, ceiling height, wall build-ups and opening dimensions listed in `USER_PENDINGS.md`.

## Resume boundary

Resume by reviewing the four Step 4 Library images and `USER_PENDINGS.md`. The next gated step may resolve measurements/photo assignments and then create a separate architect-proposal layer, but no proposal modeling or later-stage work is authorized by this checkpoint.

Do not resume from `archive/rejected-v01-v02/`, and do not overwrite either reviewed Blender scene.
