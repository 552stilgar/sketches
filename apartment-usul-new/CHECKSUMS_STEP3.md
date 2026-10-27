# Step 3 checksum and location manifest

Recorded 2026-10-27 after final label-only QA. SHA-256 values identify the reviewed checkpoint; paths marked ignored/outside Git are not stored by the commit.

## Editable Blender scenes on PC Workshop (outside Git)

| File | SHA-256 |
| --- | --- |
| `C:\Workshop\blender\scenes\apartment-usul-new\apartment_shell_step3.blend` | `f0177af4f7edd91b78b2dae188b8c78d05b81de11d438eded1c43bf235972f5d` |
| `C:\Workshop\blender\scenes\apartment-usul-new\apartment_shell_step3_pre_qa.blend` | `c043f63dc6e90ada9add33efff02910e196f6758ff1e3d4857be0af391da607b` |

## Reviewed renders (ignored in Git; Fenrir copy and PC output)

| Render | SHA-256 | Library identity/version |
| --- | --- | --- |
| `renders/step3/step3_top_down.png` | `2aa17acc262d186423b7a92d3fa9a1224b1ec4d7155ca339cab9df8a7f554209` | `libfile_3e922d414e94819192e41d0444b52d87`, v3 |
| `renders/step3/step3_cutaway_axon.png` | `fd5159f5538050be894dbd4e5ec676e00a612acc37e585eee3959dedb17a308d` | `libfile_4c077b9cc0d481918f9830401c3fd650`, v2 |
| `renders/step3/step3_eye_cutaway_living.png` | `15965993c33561e0f6ef4be725a9b0e6a8a4873ff086fd6481c5f6e41a05170c` | `libfile_b4d75230026c8191b592a89118bc35b8`, v2 |
| `renders/step3/step3_eye_cutaway_bedroom.png` | `ca5ea245e9255e8e01eee1fa786f37729066c1a24761e9a632c5ba2de24a2b54` | `libfile_baaa4dd3041081918b536aa66d91f5f8`, v2 |
| `renders/step3/step3_eye_cutaway_kitchen.png` | `24ee320da5d1447d1b58b93abb8051d78d1c2a34e996c8122660b7b519c7152d` | `libfile_9febded0149881919e7d10abb606d966`, v2 |

## Accepted reproducible geometry files

| File | SHA-256 |
| --- | --- |
| `validated_source/source_vector_reference.json` | `cc9d5638922e08c80180b75ab1868baccc8f9e4e79554a66b30d936f6b84f378` |
| `step3_geometry.json` | `c25ca64ada7aaefa602f25b1c4690d3aaa8609a8f6c1bb9e25350041a4d3529d` |
| `prepare_step3_geometry.py` | `3d710d07c526fd1efdf9cb32c7994d5dc606a20031d9b47b38da975137867f7f` |
| `build_step3_architectural_shell.py` | `91e4ab3a71ca295fb962c23125ae654847659a6979dc1c725bd956e800edfd25` |
| `update_step3_top_labels.py` | `722c4d39eee3d0101cd4455373eb9afd50a643de3698e2192eae0fb1c4b9556a` |

## Private source files on Fenrir (ignored in Git)

Base directory: `/home/fenrir/sketches/.worktrees/codex-apartment-shell-20261026/apartment-usul-new/sources`

| File | SHA-256 |
| --- | --- |
| `201 a 701 (3)(5).pdf` | `84f4cd1037c745215da6d1171d0f961aec916a81253ff09f36bc9db65eaea5f4` |
| `CF arquitectura & paisaje_UGARTE_1ra propuesta muebles.pdf` | `f31788d97195568b0ea45cd6d0f280cf88724f9bb0414feafe2bfc2b7520b0be` |
| `image(20261026-222606).png` | `fb362dababc01ce43db711dd37b6b4c6f663cd10246ef1765ac228b1dbd682dd` |
| `plan_reference_360dpi.png` | `c76e8a34d124e665bfc74960b109e9569bb7671965a67af7471f0abb8c02df7c` |
| `20260804_124859.jpg` | `5c5d54c1c4af25bbd5c2355ef6e6576e55a4e574cbcb5b8e5aabf733cafeee71` |
| `20260804_124904.jpg` | `d940db4ea678c99e9a276a4632325bafabc893a2101e3af05052173e0f9d6742` |
| `20260804_125132.jpg` | `a6f53a0ab448195c200240306edf2024158272c628bedab23c97ed162bfa2aeb` |
| `20260804_125206.jpg` | `907e916a899897ac09f90be0e8440d3b2092e981bb88baf891cc26ad29b5aa07` |
| `20260804_125211.jpg` | `737ae2513234ab806a4a22c1acbf383ed2ca332a90908a1554d105a9e3752ae4` |
| `20260804_125219.jpg` | `b7fff682393394fe0368c530ddf8ae0f76c7b71b75cb0b2613f78e80e1b5c77f` |
| `20260804_125223.jpg` | `99bfcf6b077a2d9fa550fb96657fc2896f1c757bb8313d9e6f6d0d022d6376d8` |
| `20260804_125227.jpg` | `d8833eb328099073002478b8683ceb9a87ea5770f78ddd79eb3a21c1bc66283e` |
| `20260804_125523.jpg` | `b27be59f78686b38a4db0884dd71d5f49fd28762c5cfcb3ba13c21ce4bf8f515` |
| `20260804_125538.jpg` | `88bc452e1599ea2c70c422678197c99df271f661e9dff041dd883a214541a391` |

## Rejected bulk retained locally but ignored

`archive/rejected-v01-v02/step2_vector_layers.json` remains on Fenrir for forensic comparison only. It is not committed and must not be used as source geometry.
