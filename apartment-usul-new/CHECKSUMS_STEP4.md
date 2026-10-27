# Step 4 checksum and location manifest

Recorded 2026-10-27 after pixel review and saved-scene verification.

## Git base

- Reviewed Step 3 commit: `23b0115408294339b9f5befd6d003f5c5b8a0357`
- Branch: `codex-apartment-shell-20261026`
- This manifest belongs to the reviewed Step 4 checkpoint. No push or merge was performed.

## Blender scenes on PC Workshop (outside Git)

| File | SHA-256 |
| --- | --- |
| `C:\Workshop\blender\scenes\apartment-usul-new\apartment_shell_step3.blend` | `f0177af4f7edd91b78b2dae188b8c78d05b81de11d438eded1c43bf235972f5d` |
| `C:\Workshop\blender\scenes\apartment-usul-new\apartment_existing_step4.blend` | `130b1ec9ba2efe529b1a774e10720b5e56b43a9d7b1eccb03dafd2771cbf26bf` |

The Step 3 hash matches the reviewed checkpoint manifest, confirming that Step 4 did not overwrite it.

## Reproducible Step 4 files

| File | SHA-256 |
| --- | --- |
| `build_step4_existing_condition.py` | `885e12c4436a7130c2cbbafbb5adda255de6719425de0310de93381087adbdca` |
| `verify_step4_scene.py` | `e7ff4923808b42b857ebe837caf6230d6259e55fa4c3cb0bee15db73312c1350` |
| `STEP4_EXISTING_CONDITION_REPORT.md` | `becb873238a31dc84ad7788fd4aa6b333bc1830df31040236db26ff83f35909b` |
| `STEP4_BUILD_RECEIPT.json` | `061b9b377ceca9ce0235995fa2bc142c6d0f8a9f1440b1b09dc734de420a2bd2` |
| `STEP4_VERIFICATION.json` | `2ae52096f2e8c48f9a043fcfaa8006445b5b26df40a15b19ce7236d1da434982` |

## Final review renders

All four final PNGs are `1600 x 900` pixels.

| Render | SHA-256 | Review mode |
| --- | --- | --- |
| `renders/step4/step4_materials_top_cutaway.png` | `79b2ba18b220783208a7a8c57ba8ebd89ed80dfc44af0b5fba5c092a7ccd597e` | temporary low-wall cutaway |
| `renders/step4/step4_materials_axon_cutaway.png` | `4593a0188a06acb6518bf07763e7e334f0ea448f3a05bde766b3719caeadb680` | temporary low-wall cutaway |
| `renders/step4/step4_kitchen_section_detail.png` | `5590aa5d9acf1f4f6c2e3b59e965f13f5c293d9bf749d1b2950667a864418604` | elevated section-detail; shell hidden only for this render |
| `renders/step4/step4_balcony_full_height.png` | `dd57c7584b274c02d8e21aebda478628982842b0ce116d3bebcdbd775ff86e2d` | full-height view |

## Library delivery

| Render | Library file ID |
| --- | --- |
| `step4_materials_top_cutaway.png` | `libfile_fb11e76f3c1c81918ba8800bcdba65c0`, v1 |
| `step4_materials_axon_cutaway.png` | `libfile_33014a13c39c8191a98008b4bee27c90`, v1 |
| `step4_kitchen_section_detail.png` | `libfile_9caad9c564548191a3e7b2e5d70d7ea6`, v1 |
| `step4_balcony_full_height.png` | `libfile_8ace1e4b4b008191b64247e695452588`, v1 |

The Library writes succeeded. The Windows host does not expose `os.setxattr`, so local Library identity is recorded in `STEP4_LIBRARY_DELIVERY.json` rather than filesystem extended attributes.

## Verification result

`STEP4_VERIFICATION.json` reports `passed: true`: all 61 source-derived base walls are restored to the 2.60 m provisional full height, 120 Step 4 detail objects are visible after save, all four review cameras are present, and no proposal collection exists.
