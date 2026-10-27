"""Verify the saved Step 4 scene without changing it."""
from __future__ import annotations

import json
from pathlib import Path

import bpy


ROOT = Path(__file__).resolve().parent
BLEND = Path(r"C:\Workshop\blender\scenes\apartment-usul-new\apartment_existing_step4.blend")
OUT = ROOT / "STEP4_VERIFICATION.json"

bpy.ops.wm.open_mainfile(filepath=str(BLEND))

walls = [obj for obj in bpy.data.objects if obj.name.startswith("Wall_")]
details = bpy.data.collections.get("04_STEP4_EXISTING_FIXED_DETAILS")
proposal_collections = [name for name in bpy.data.collections.keys() if "proposal" in name.lower()]
detail_hidden = [obj.name for obj in details.objects if obj.hide_render]
evidence_counts = {}
for obj in details.objects:
    evidence = obj.get("step4_evidence", "missing")
    evidence_counts[evidence] = evidence_counts.get(evidence, 0) + 1

expected_cameras = [
    "S4_CAM_TOP_CUTAWAY",
    "S4_CAM_AXON_CUTAWAY",
    "S4_CAM_KITCHEN_SECTION_DETAIL",
    "S4_CAM_BALCONY_FULL_HEIGHT",
]

result = {
    "blend": str(BLEND),
    "base_wall_count": len(walls),
    "base_wall_full_height_count": sum(abs(obj.dimensions.z - 2.6) < 0.001 for obj in walls),
    "step4_detail_count": len(details.objects),
    "step4_detail_hidden_after_save": detail_hidden,
    "proposal_collections": proposal_collections,
    "expected_cameras_present": {name: bpy.data.objects.get(name) is not None for name in expected_cameras},
    "evidence_counts": evidence_counts,
    "passed": (
        len(walls) == 61
        and sum(abs(obj.dimensions.z - 2.6) < 0.001 for obj in walls) == 61
        and len(details.objects) >= 39
        and not detail_hidden
        and not proposal_collections
        and all(bpy.data.objects.get(name) is not None for name in expected_cameras)
    ),
}
with OUT.open("w", encoding="utf-8", newline="\n") as stream:
    stream.write(json.dumps(result, indent=2))
    stream.write("\n")
print(json.dumps(result, indent=2))
