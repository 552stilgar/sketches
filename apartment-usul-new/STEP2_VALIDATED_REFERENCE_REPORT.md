# Step 2 - Validated source-vector reference

Status: **VALIDATED_SOURCE_GEOMETRY_ROI_ONLY**. This replaces the rejected lightweight-parser evidence, but it is not an as-built survey or a whole-building model.

## Source and coordinate frame

- Source PDF SHA-256: `84f4cd1037c745215da6d1171d0f961aec916a81253ff09f36bc9db65eaea5f4`.
- The local PDF hash matches the validated reference exactly.
- Source interpreter: PyMuPDF 1.26.6 `Page.get_drawings()`.
- `Page.get_drawings()` resolves graphics state and nested Form matrices before export.
- Page rotation is applied exactly once using `page.rotation_matrix`.
- Landscape frame: 1191 × 842 PDF points, top-left origin.
- Main apartment ROI: `(220, 185, 1145, 585)` PDF points.

## Extracted evidence

- Full source drawing count: 7,236.
- ROI-contained paths from the five selected source layers: 661.
- Wall/plaster paths: 182 total (`MUROS` 95, `p-revoque` 87).
- `Carpinterias PUERTAS`: 450 paths.
- `p-puerta`: 5 paths. This source layer is semantically mixed and includes balcony/perimeter geometry; it is not treated as “doors only.”
- `CARPINTERIAS`: 24 paths.
- All rendered pixels from the extracted paths fall on the original 360-dpi drawing within a three-pixel antialiasing tolerance.

## Pixel inspection

- Balcony geometry remains on the left and retains its source slope.
- Main-bath, WC and kitchen boundaries align with the source.
- Glazing aligns with source openings and no longer crosses the main bath.
- Suite, bedroom, dressing, ensuite and central-passage partitions align with the source.
- The five independently reviewed jamb pairs are retained in the validated JSON.

## Explicit exclusions

- Any source path with a point outside the ROI was excluded by the reference extractor.
- Labels and fixtures were intentionally excluded from geometry extraction; labels on the clean review view are annotations only.
- Layer names alone are not semantic room classifications.
- This packet does not fill omitted boundary segments, infer construction thicknesses, or establish code-compliant clearance.
- Entry-to-room reachability is not re-certified from this ROI-only layer packet because `p-puerta` is semantically mixed and exterior crossing paths are deliberately excluded.
- Developer-plan geometry is not confirmed as-built.

The previous V02 lightweight-parser files remain marked `REJECTED_PARSER_MISREGISTRATION` and must not be used as geometry.

## Documentation acceptance gate

The source-faithful version-2 images have passed independent visual QA as a 2D reference. `STEP2_ROOM_OPENING_INVENTORY.md` records stable zone, hinged-door, open-passage and glazing IDs with source endpoints and connected spaces.

Manual checks against the original plan confirm the following route topology:

- Main bath access is from the bedroom through `DR-03`, not from entry circulation.
- Suite access is through `DR-01`; dressing is an open passage `OP-01` from the suite; ensuite access is then through `DR-04`.
- WC access is from entry/circulation through `DR-05`.
- Kitchen is continuously connected to entry/circulation and also has the source-shown exterior/service door `DR-07`.
- Balcony-facing `GL-01` and `GL-02` are glazing. Their operability/passability is not proven by the source and is not claimed.

This closes the Step 2 documentation gate only. It does not certify room polygons, wall solids, walkability, accessibility, construction feasibility or as-built agreement.
