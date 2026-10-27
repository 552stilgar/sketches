# Step 1 - Source reference map and uncertainty register

Status: review checkpoint only. No new tracing, geometry, or Blender work is authorized by this document.

## Working rule

- The developer PDF is the dimensional baseline, not proof of the apartment's current as-built condition.
- Printed dimensions are local wall-face-to-wall-face or dimension-line spans. They must not be expanded into rectangular room bounding boxes.
- The architect proposal is a separate design-intent source. The user expects most, but not necessarily all, of it to be implemented.
- Photos provide adjacency, finish, opening, and current-condition clues only. They do not provide scale unless paired with a verified measurement.
- V01 and V02 are excluded as geometric evidence. They are retained only as prior checkpoints.

## Source inventory

### A. Developer baseline

**File:** `201 a 701 (3)(5).pdf`
**Library ID:** `libfile_ad19786a2de481919c44f140282a3cf3`
**Role:** Primary dimensional reference for a unit family labelled `UNIDAD 201 a 701`; one page; printed scale 1:50.
**Reliability:** High for legible printed annotations; medium-low for the present apartment unless the user confirms that this exact orientation and wall/opening arrangement matches the unit today.

The sheet states:

- covered area: 77.04 m2
- semi-covered area: 12.81 m2
- amenities allocation: 6.11 m2
- total commercial area: 95.96 m2

These are area/accounting values, not linear geometry. The 6.11 m2 amenities value is an allocation and must not become apartment floor area.

### B. Architect proposal

**File:** `image(20261026-222606).png`
**Library ID:** `libfile_7af84206cc7881918e446c41ef95a788`
**Role:** `LAYOUT PROPUESTA` design-intent plan by CF arquitectura & paisaje.
**Reliability:** High for communicating the proposal concept; low for measurement because no printed dimensions or confirmed scale are visible.

Visible proposal intent includes an office in the former suite zone, retained bedroom, revised bathroom/toilet arrangement, living/dining zoning, a coffee sector, revised kitchen use, and balcony laundry/storage. Treat every proposed element as independently switchable until the user confirms it.

### C. Photos

The filenames appear to encode `2026-08-04`, but the capture date and whether they show the current condition are not independently verified.

| File / Library ID | Tentative location or viewpoint | Confidence | Visible evidence and limitation |
| --- | --- | --- | --- |
| `20260804_124859.jpg` / `libfile_3faefe7755b081919e5722a323581d7c` | Unassigned finished room; possibly suite | Low | White wall, timber-look floor, outlets, black opening edge. No unique plan feature or sufficient context. |
| `20260804_124904.jpg` / `libfile_63b66ecfa9e8819188334cc4fa9cef8a` | Room beside street-facing balcony; possibly suite | Medium-low | Timber-look floor and black-framed glazed opening onto the street balcony. Framing is too tight to distinguish suite from living/dining reliably. |
| `20260804_125132.jpg` / `libfile_aa62f39146e88191b48c77ba40f82681` | Likely living/dining facing street balcony | Medium | Broad two-panel black-framed opening, street trees and balcony corner; room-wide context is stronger than the preceding images but not conclusive. |
| `20260804_125206.jpg` / `libfile_454f6b9a20208191953a65c9c7253314` | Kitchen appliance/tall-unit niche | High | Existing upper and side cabinetry, black stone splashback/counter edge, outlets and service points. |
| `20260804_125211.jpg` / `libfile_f5869882bd808191b3175ad668a2df82` | Kitchen worktop corner | High | Existing L-shaped cabinetry, oven, electric hob, black stone worktop and splashback. |
| `20260804_125219.jpg` / `libfile_4e09dc5882608191bcc15f9b17b8be81` | Kitchen sink/hob looking toward lightwell glazing | High | Sink, hob, oven and tall black-framed glazing; the exterior condition is a close internal void, not the street balcony. |
| `20260804_125223.jpg` / `libfile_47383ed4461c81918ac65d89c8f93456` | Kitchen glazing to internal lightwell | High | Full-height black-framed opening with close opposing walls and railings confirms a lightwell/courtyard condition. |
| `20260804_125227.jpg` / `libfile_d95221d795c88191b3f36bb4b22c2949` | Wall immediately beside kitchen lightwell glazing | Medium-high | Grey tile floor, controls/outlet, glazing and the same close internal void. Exact relation to the kitchen door is not visible. |
| `20260804_125523.jpg` / `libfile_68a6439d182c819180a597bb6535e65d` | Street-facing balcony, looking along its length | High | Long tiled balcony, glass balustrade, linear drain, timber soffit, dark facade and wall projection/shaft. |
| `20260804_125538.jpg` / `libfile_479d3ca0b74c8191a4b2353cadbe6ca7` | Street-facing balcony, reverse view | High | Sliding room openings, large dark projection/shaft, frosted end screen, glass balustrade, drain and timber soffit. |

No supplied photo clearly documents the main bathroom, WC, ensuite, dressing area, entrance/circulation, a complete bedroom overview, or all sides of the living/dining room.

## Printed dimension inventory

All values below are printed on the developer sheet. `Meaning` describes the dimension line that is visible; it does not generalize the value to the full polygon around it.

| Value | Drawing location | Meaning for future tracing |
| ---: | --- | --- |
| 3.22 m | suite | Horizontal clear span through the main rectangular part of the suite. It does not include the stepped circulation/service-zone shape. |
| 3.24 m | suite | Vertical clear span through the main rectangular part of the suite. It is not the complete suite polygon depth. |
| 2.03 m (two callouts) | upper dressing/ensuite block | Two distinct local vertical spans, one in each service-zone bay. They are not a combined width. |
| 0.98 m | upper dressing/service zone | Short local span between the dimensioned faces; arrow endpoints must be followed during tracing. |
| 0.60 m | ensuite fixture zone | Short local span beside the fixtures; it is not assumed to be a door width. |
| 3.00 m | bedroom | Horizontal clear span through the main bedroom rectangle. |
| 3.04 m | bedroom | Vertical clear span through the main bedroom rectangle. |
| 0.60 m | bedroom lower recess | Local depth of the stepped lower recess/circulation edge, not the bedroom's full depth. |
| 6.19 m | balcony | Longitudinal overall dimension along the stepped street-facing balcony zone. |
| 2.40 m | balcony | Clear depth of the wider lower balcony portion only; the upper strip is narrower. |
| 6.70 m | living/dining | Horizontal clear span on the printed dimension line through the open living/dining zone. |
| 3.33 m | living/dining | Vertical clear span through the main living/dining zone. |
| 1.57 m | main bathroom | Horizontal clear span through the bath zone. |
| 2.32 m | main bathroom | Vertical clear span through the bath zone. |
| 1.05 m | WC | Horizontal clear span through the WC. |
| 1.31 m | WC | Vertical clear span through the WC. |
| 2.89 m | entrance/circulation | Local horizontal run shown along the entry zone; not the full apartment or hall width. |
| 2.93 m | kitchen | Horizontal clear span through the kitchen. High-resolution inspection confirms `2.93`, not `2.95`. |
| 2.56 m | kitchen east bay | Local vertical clear span at the east side of the kitchen. |
| 2.53 m | kitchen west/central bay | Local vertical clear span on the adjacent bay; it differs from 2.56 because the wall faces/steps differ. |
| 1.40 m | kitchen west/central bay | Local horizontal subdivision shown between the dimensioned faces. |
| 1.00 m | kitchen east bay | Local horizontal subdivision shown between the dimensioned faces. |

`AA` marks section/cut references and is not a dimension.

## Evidence classes

### Site-measured

None yet. No supplied value is confirmed as measured in the apartment.

### Plan-printed

The values in the table above and the stated areas are plan-printed. They may be used to constrain a developer-baseline trace after the exact unit/orientation is confirmed.

### Plan-inferred, not measured

- Wall thicknesses and structural pier/shaft sizes.
- Exact door and glazing widths, jamb positions, and swing geometry.
- Unprinted offsets around the suite service block, central passage, bedroom recess, bath/WC/entry transitions and balcony projections.
- Whether drawn finishes or cabinetry correspond to current installation.
- Pixel-based distances after PDF/image rescaling.

### Unknown

- Current as-built deviations from the developer sheet.
- Floor-to-ceiling and floor-to-slab heights.
- Door, glazing, sill and head heights.
- Wall build-ups and structural/non-structural status.
- Exact balcony parapet, drain, shaft/projection and privacy-screen geometry.
- Complete current geometry of bathrooms, WC, dressing and entrance.
- Which architect-proposal items are approved, rejected, or already executed.

## Conflicts and cautions

1. The developer sheet covers a `201 a 701` unit family; it does not by itself prove the exact floor, orientation, mirroring, or current as-built condition of this apartment.
2. The architect proposal changes use and partitions but is undimensioned. It cannot override the developer dimensions without explicit approval or new measurements.
3. Existing kitchen photos show a built L-shaped kitchen and glazing to an internal lightwell. The proposal's kitchen/coffee arrangement is design intent, not evidence of current geometry.
4. The street balcony is documented well in photos, but its stepped plan, shaft/projection and end screen are not fully dimensioned.
5. The first three interior photos cannot yet be assigned confidently enough to drive wall or opening placement.
6. The photo filenames suggest a date, but neither that date nor present-day currency is verified.

## What blocks Stage 2 (2D baseline tracing)

Only these decisions are required before a disciplined 2D trace:

1. Confirm the exact apartment/unit and that the supplied developer plan is not mirrored relative to the apartment.
2. Confirm whether the existing wall/opening arrangement broadly matches the developer plan, and list any known built deviations.
3. Confirm that Stage 2 should trace the current/developer baseline only, with the architect proposal kept on a separate optional layer.

A new site measurement is not strictly required to produce a clearly labelled developer-baseline trace. If the target is an as-built trace rather than a document-baseline trace, at least one verified control measurement and all known deviations are required before calling it accurate.

## What can wait until later 3D/detail stages

- Ceiling/slab height and any dropped ceilings or beams.
- Door and glazing heights, sill heights, frame depths and leaf/sliding configuration.
- Wall thickness/build-up verification.
- Cabinet, appliance, plumbing and electrical dimensions.
- Balcony parapet, drain, shaft/projection, screen and soffit details.
- Finish/material cataloguing and lighting.
- Final approval matrix for architect-proposal elements.

## Bounded next step after user review

After the three Stage 2 questions are answered, produce a wall-face 2D baseline trace directly from the developer PDF, constrain it with every printed dimension line, keep inferred edges visually distinct, and compare the trace back against the original sheet. Do not start 3D or proposal furnishings at that point.
