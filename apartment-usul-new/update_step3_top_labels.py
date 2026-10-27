"""Presentation-only correction for the Step 3 top-plan labels.

Run with the existing apartment_shell_step3.blend open. No mesh or camera
geometry is changed and only step3_top_down.png is rendered.
"""
from pathlib import Path
import shutil
import bpy

SCALE = 0.0254 * 50.0 / 72.0
ROI_X, ROI_Y = 220.0, 185.0
PC_OUT = Path(r"C:\Workshop\blender\scenes\apartment-usul-new\renders\step3\step3_top_down.png")
LOCAL_OUT = Path(r"C:\Users\Usul\Documents\Codex\2026-10-26\task\apartment-usul-new\renders\step3\step3_top_down.png")
BLEND = Path(r"C:\Workshop\blender\scenes\apartment-usul-new\apartment_shell_step3.blend")

def world(pdf_x, pdf_y):
    return ((pdf_x-ROI_X)*SCALE, -(pdf_y-ROI_Y)*SCALE, 2.64)

ensuite = bpy.data.objects["Label_ENSUITE"]
ensuite.location = world(613.0, 256.0)
ensuite.data.size = 0.14

main_bath = bpy.data.objects["Label_MAIN_BATH"]
main_bath.location = world(812.0, 455.0)
main_bath.data.size = 0.14

labels = [o for o in bpy.data.objects if o.name.startswith("Label_")]
infill = [o for o in bpy.data.objects if "wall_above_head" in o.name or "wall_below_sill" in o.name]
for o in labels:
    o.hide_render = False
for o in infill:
    o.hide_render = True

scene = bpy.context.scene
scene.camera = bpy.data.objects["CAM_TOP"]
scene.render.filepath = str(PC_OUT)
bpy.ops.render.render(write_still=True)
LOCAL_OUT.parent.mkdir(parents=True, exist_ok=True)
shutil.copy2(PC_OUT, LOCAL_OUT)

for o in labels:
    o.hide_render = True
for o in infill:
    o.hide_render = False
bpy.ops.wm.save_as_mainfile(filepath=str(BLEND))
print(f"Updated top plan only: {PC_OUT}")
