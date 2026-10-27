# Step 2 room, route and opening inventory

Coordinate frame: rotated landscape PDF points, top-left origin, page 1191 × 842. This inventory describes the developer-plan apartment ROI only. It is source-supported documentation, not an as-built survey or a computational walkability certificate.

## Zones

| ID | Source-supported zone | Notes |
| --- | --- | --- |
| Z01 | Living / dining | Printed `ESTAR COMEDOR`; continuous with the central and entry circulation. |
| Z02 | Suite | Printed `SUITE PRINCIPAL`; printed local clear spans 3.22 × 3.24 m. |
| Z03 | Dressing | Unlabeled sub-zone between suite and ensuite; source dimensions 2.03 × 0.98 m. |
| Z04 | Ensuite | Unlabeled wet-room sub-zone east of dressing; source dimensions 2.03 × 1.60 m. |
| Z05 | Central passage | Open passage between Z01 and the paired suite/bedroom doors. |
| Z06 | Bedroom | Printed `DORMITORIO`; printed local clear spans 3.00 × 3.04 m. |
| Z07 | Main bath | Wet room reached from Z06, not from the entry corridor. Printed local spans 1.57 × 2.32 m. |
| Z08 | WC | Separate WC reached from entry/circulation. Printed local width 1.03 m. |
| Z09 | Entry / circulation | Interior zone inside DR-06; continuous with Z01 and around Z08 toward Z10. |
| Z10 | Kitchen / breakfast | Right-hand kitchen zone; printed local width 2.93 m and other local spans 1.40, 1.00, 2.53 and 2.56 m. |
| Z11 | Balcony / terrace | Stepped semi-covered exterior zone on the left; includes the source notch/recess geometry and a sloped outer boundary. |
| EX01 | Common/service circulation | Outside the unit ROI; connects to DR-06 and DR-07. Not modeled as an apartment room. |

## Hinged doors

`Jambs` are exact reviewed pairs when available. `Closed leaf` is an exact source-path span when a separate reviewed jamb pair was not supplied.

| ID | Type | Connected spaces | Source endpoints (PDF points) | Source evidence |
| --- | --- | --- | --- | --- |
| DR-01 | Hinged door | Z05 central passage ↔ Z02 suite | Jambs `(563.20,318.24)–(570.04,318.24)` and `(563.20,367.92)–(570.04,367.92)` | Reviewed jamb pair; swing/leaf paths 323–324. |
| DR-02 | Hinged door | Z05 central passage ↔ Z06 bedroom | Jambs `(626.44,318.24)–(633.28,318.24)` and `(626.44,367.92)–(633.28,367.92)` | Reviewed jamb pair; swing/leaf paths 818–819. |
| DR-03 | Hinged door | Z06 bedroom ↔ Z07 main bath | Jambs `(801.88,367.92)–(801.88,374.76)` and `(851.56,367.92)–(851.56,374.76)` | Reviewed jamb pair; source arc opens into the bath; paths 743–744. |
| DR-04 | Hinged door | Z03 dressing ↔ Z04 ensuite | Jambs `(579.88,235.92)–(586.72,235.92)` and `(579.88,285.60)–(586.72,285.60)` | Reviewed jamb pair; swing/leaf paths 247–248. |
| DR-05 | Hinged door | Z09 entry/circulation ↔ Z08 WC | Closed leaf axis approximately `(864.58,471.00)–(898.47,471.00)`; open leaf axis `(865.48,471.00)–(865.48,504.96)` | Source leaf/arc paths 1252 and 1262; manually checked against the original. |
| DR-06 | Hinged unit entry | EX01 common circulation ↔ Z09 entry/circulation | Closed leaf axis approximately `(763.51,573.29)–(814.26,573.29)`; open leaf axis `(814.66,573.36)–(814.66,521.52)` | Source leaf/arc paths 562 and 590; manually checked against the original. |
| DR-07 | Hinged service/kitchen door | EX01 service circulation ↔ Z10 kitchen/breakfast | Closed leaf axis approximately `(924.52,570.72)–(969.76,570.72)`; open swing endpoint `(924.47,526.32)` | Source leaf/arc paths 927 and 928; manually checked against the original. |

## Open circulation and non-door passages

| ID | Classification | Connected spaces | Source endpoints / evidence |
| --- | --- | --- | --- |
| OP-01 | Open passage; no swing arc | Z02 suite ↔ Z03 dressing | Reviewed jamb pairs `(506.44,230.16)–(512.68,230.16)` and `(506.44,285.60)–(512.68,285.60)`. The original shows an opening without a door swing. |
| OP-02 | Open passage | Z01 living/dining ↔ Z05 central passage | Opening between the lower jamb sides of DR-01 and DR-02, approximately `(570.04,367.92)–(626.44,367.92)`; no closing wall or door symbol. |
| OP-03 | Continuous plan zone | Z01 living/dining ↔ Z09 entry/circulation | No discrete doorway symbol or independently encoded portal; source wall layout is continuous. |
| OP-04 | Continuous plan zone | Z09 entry/circulation ↔ Z10 kitchen/breakfast | No discrete internal door symbol; circulation continues around Z08 toward the kitchen. |

## Glazing and windows

Bounding endpoints are exact extents of grouped `CARPINTERIAS` source paths, not construction opening sizes.

| ID | Classification | Adjacent spaces | Source extent (PDF points) | Source paths |
| --- | --- | --- | --- | --- |
| GL-01 | Exterior glazing; operability unknown | Z02 suite ↔ Z11-facing exterior | `(313.48,224.04)–(327.16,365.40)` | 829–833 |
| GL-02 | Exterior glazing; operability unknown | Z01 living/dining ↔ Z11 balcony/terrace | `(369.28,393.36)–(378.40,534.48)` | 834–838 |
| GL-03 | Exterior glazing/window | Z06 bedroom ↔ exterior/lightwell | `(853.24,226.68)–(862.36,367.92)` | 839–843 |
| GL-04 | Horizontal glazing/window | Z08 WC ↔ lightwell/service void | `(870.76,421.68)–(904.72,430.68)` | 948–951 |
| GL-05 | Horizontal glazing/window | Z10 kitchen/breakfast ↔ lightwell/service void | `(927.28,421.68)–(1006.36,430.68)` | 966–970 |

The source symbols alone do not prove that GL-01 or GL-02 are passable balcony doors. Balcony access therefore remains **unknown**, not inferred from the mixed `p-puerta` layer.

## Source-supported route checks

- EX01 → DR-06 → Z09 entry/circulation → OP-03 → Z01 living/dining.
- Z01 → OP-02 → Z05 central passage → DR-01 → Z02 suite.
- Z01 → OP-02 → Z05 central passage → DR-02 → Z06 bedroom.
- Z06 bedroom → DR-03 → Z07 main bath. The source does **not** show main-bath access from Z09.
- Z02 suite → OP-01 → Z03 dressing → DR-04 → Z04 ensuite.
- Z09 entry/circulation → DR-05 → Z08 WC.
- Z09 entry/circulation → OP-04 → Z10 kitchen/breakfast; Z10 also has external/service access via DR-07.

These are observed source adjacencies and swing-symbol checks. They are not computational proof of clearance, accessible-route compliance, door direction feasibility, or closed room polygons.

## Remaining geometry work

Room polygons, wall solids and a certified walkability graph have **not** been produced. They must not be substituted with guessed rectangles or inferred meshes. The accepted deliverable at this gate is the source-faithful ROI vector reference plus this semantic inventory.
