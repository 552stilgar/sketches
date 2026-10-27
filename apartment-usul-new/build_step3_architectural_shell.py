"""Build and render the Step 3 apartment shell in Blender.

Consumes only step3_geometry.json produced from the accepted PyMuPDF vector
reference. Earlier V01/V02 model geometry is intentionally not imported.
"""
from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

import bpy
from mathutils import Vector

ROOT = Path(__file__).resolve().parent
GEOM = ROOT / "step3_geometry.json"
PC_ROOT = Path(r"C:\Workshop\blender\scenes\apartment-usul-new")
PC_RENDERS = PC_ROOT / "renders" / "step3"
LOCAL_RENDERS = ROOT / "renders" / "step3"
BLEND_OUT = PC_ROOT / "apartment_shell_step3.blend"
RECEIPT_OUT = ROOT / "STEP3_BUILD_RECEIPT.json"

g = json.loads(GEOM.read_text(encoding="utf-8"))
ROI = g["roi_pdf_points"]
CELL = g["cell_pdf_points"]
SCALE = g["scale_m_per_pdf_point"]
DEFAULTS = g["defaults_provisional"]
WALL_H = DEFAULTS["wall_height_m"]
SLAB_T = DEFAULTS["slab_thickness_m"]

for p in (PC_ROOT, PC_RENDERS, LOCAL_RENDERS):
    p.mkdir(parents=True, exist_ok=True)


def clean_scene():
    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for block in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        pass


def mat(name, color, metallic=0.0, rough=0.65):
    m = bpy.data.materials.new(name)
    m.diffuse_color = color
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metallic
    return m


def box(name, center, dims, material, collection=None):
    bpy.ops.mesh.primitive_cube_add(location=center)
    o = bpy.context.object
    o.name = name
    o.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material:
        o.data.materials.append(material)
    if collection:
        for c in list(o.users_collection):
            c.objects.unlink(o)
        collection.objects.link(o)
    return o


def collection(name):
    c = bpy.data.collections.new(name)
    bpy.context.scene.collection.children.link(c)
    return c


def rect_world(rect):
    x0,x1,y0,y1 = rect
    return (x0*CELL*SCALE, -y1*CELL*SCALE, x1*CELL*SCALE, -y0*CELL*SCALE)


def pdf_world(p):
    return ((p[0]-ROI[0])*SCALE, -(p[1]-ROI[1])*SCALE)


def add_rects(rects, prefix, zc, height, material, coll):
    result=[]
    for i,r in enumerate(rects):
        x0,y0,x1,y1=rect_world(r)
        result.append(box(f"{prefix}_{i:03d}",((x0+x1)/2,(y0+y1)/2,zc),(x1-x0,y1-y0,height),material,coll))
    return result


def add_linear_box(name, p1, p2, width, zc, height, material, coll):
    x1,y1=pdf_world(p1); x2,y2=pdf_world(p2)
    length=math.hypot(x2-x1,y2-y1)
    o=box(name,((x1+x2)/2,(y1+y2)/2,zc),(length,width,height),material,coll)
    o.rotation_euler[2]=math.atan2(y2-y1,x2-x1)
    return o


def add_frame(name,p1,p2,sill,head,frame_mat,glass_mat,coll):
    x1,y1=pdf_world(p1); x2,y2=pdf_world(p2)
    vx,vy=x2-x1,y2-y1
    length=math.hypot(vx,vy)
    ang=math.atan2(vy,vx)
    ux,uy=vx/length,vy/length
    post=0.055
    depth=0.065
    objs=[]
    for label,x,y in (("A",x1,y1),("B",x2,y2)):
        o=box(f"{name}_post_{label}",(x,y,(sill+head)/2),(post,depth,head-sill),frame_mat,coll)
        o.rotation_euler[2]=ang; objs.append(o)
    for label,z in (("sill",sill+post/2),("head",head-post/2)):
        o=box(f"{name}_{label}",((x1+x2)/2,(y1+y2)/2,z),(length,depth,post),frame_mat,coll)
        o.rotation_euler[2]=ang; objs.append(o)
    glass=box(f"{name}_glass",((x1+x2)/2,(y1+y2)/2,(sill+head)/2),(max(0.02,length-post*2),0.018,max(0.02,head-sill-post*2)),glass_mat,coll)
    glass.rotation_euler[2]=ang; objs.append(glass)
    return objs


def add_door_frame(name,p1,p2,coll,material):
    x1,y1=pdf_world(p1); x2,y2=pdf_world(p2)
    vx,vy=x2-x1,y2-y1; length=math.hypot(vx,vy); ang=math.atan2(vy,vx)
    post=0.055; depth=0.10; head=DEFAULTS["door_height_m"]
    result=[]
    for label,x,y in (("A",x1,y1),("B",x2,y2)):
        o=box(f"{name}_jamb_{label}",(x,y,head/2),(post,depth,head),material,coll); o.rotation_euler[2]=ang; result.append(o)
    # Place the visible frame head above the requested clear opening height.
    o=box(f"{name}_head",((x1+x2)/2,(y1+y2)/2,head+post/2),(length,depth,post),material,coll); o.rotation_euler[2]=ang; result.append(o)
    return result


def add_label(text,pdf_point,size=0.17):
    x,y=pdf_world(pdf_point)
    # Top-plan annotations sit above full-height walls and are hidden for 3D views.
    bpy.ops.object.text_add(location=(x,y,WALL_H+0.04),rotation=(0,0,0))
    t=bpy.context.object
    t.name="Label_"+text.replace("/","_").replace(" ","_")
    t.data.body=text
    t.data.align_x="CENTER"; t.data.align_y="CENTER"; t.data.size=size; t.data.extrude=0.003
    t.data.materials.append(label_mat)
    t.visible_shadow=False
    return t


def point_camera(cam, target):
    cam.rotation_euler=(Vector(target)-cam.location).to_track_quat("-Z","Y").to_euler()


def camera(name, location, target, lens=38, ortho=None):
    data=bpy.data.cameras.new(name)
    cam=bpy.data.objects.new(name,data)
    bpy.context.scene.collection.objects.link(cam)
    cam.location=location
    point_camera(cam,target)
    data.lens=lens
    if ortho:
        data.type="ORTHO"; data.ortho_scale=ortho
    return cam


def render(name,cam):
    scene.camera=cam
    scene.render.filepath=str(PC_RENDERS/f"{name}.png")
    bpy.ops.render.render(write_still=True)
    shutil.copy2(PC_RENDERS/f"{name}.png",LOCAL_RENDERS/f"{name}.png")


clean_scene()
scene=bpy.context.scene
scene.render.engine="BLENDER_EEVEE"
scene.render.resolution_x=1600; scene.render.resolution_y=900; scene.render.resolution_percentage=100
scene.render.image_settings.file_format="PNG"
scene.render.film_transparent=False
scene.world.color=(0.72,0.74,0.77)
scene.view_settings.look="AgX - Medium High Contrast"

wall_mat=mat("Shell wall - provisional",(0.79,0.78,0.74,1))
floor_mat=mat("Interior floor - neutral",(0.58,0.48,0.37,1),rough=0.82)
balcony_mat=mat("Balcony floor - neutral",(0.37,0.49,0.54,1),rough=0.88)
frame_mat=mat("Frames",(0.055,0.065,0.075,1),metallic=0.45,rough=0.33)
glass_mat=mat("Glazing",(0.13,0.48,0.63,1),metallic=0.05,rough=0.18)
door_mat=mat("Door frames",(0.34,0.19,0.10,1),rough=0.55)
label_mat=mat("Zone labels",(0.03,0.035,0.04,1),rough=0.7)

wall_coll=collection("01_SOURCE_DERIVED_WALL_SOLIDS")
floor_coll=collection("02_SOURCE_DERIVED_FLOORS")
opening_coll=collection("03_SOURCE_OPENINGS_AND_FRAMES")

floors=add_rects(g["interior_floor_rects_cells"],"InteriorFloor",-SLAB_T/2,SLAB_T,floor_mat,floor_coll)
balcony=add_rects(g["balcony_floor_rects_cells"],"BalconyFloor",-SLAB_T/2,SLAB_T,balcony_mat,floor_coll)
walls=add_rects(g["wall_rects_cells"],"Wall",WALL_H/2,WALL_H,wall_mat,wall_coll)

glazing={
    "GL01":((320.32,224.04),(320.32,365.40),0.0,2.35),
    "GL02":((373.84,393.36),(373.84,534.48),0.0,2.35),
    "GL03":((857.80,226.68),(857.80,367.92),0.45,2.25),
    "GL04":((870.76,426.18),(904.72,426.18),0.90,2.10),
    "GL05":((927.28,426.18),(1006.36,426.18),0.90,2.10),
}
opening_objs=[]
opening_infill_objs=[]
threshold_objs=[]
for name,(p1,p2,sill,head) in glazing.items():
    opening_objs += add_frame(name,p1,p2,sill,head,frame_mat,glass_mat,opening_coll)
    if sill > 0:
        opening_infill_objs.append(add_linear_box(f"{name}_wall_below_sill",p1,p2,0.14,sill/2,sill,wall_mat,wall_coll))
    if head < WALL_H:
        opening_infill_objs.append(add_linear_box(f"{name}_wall_above_head",p1,p2,0.14,(head+WALL_H)/2,WALL_H-head,wall_mat,wall_coll))
    if name in {"GL01","GL02"}:
        # Source full-height glazing occupies an enclosure line; bridge the render-only
        # floor seam beneath it without claiming that the glazing is operable.
        threshold_objs.append(add_linear_box(f"{name}_floor_threshold",p1,p2,0.16,-SLAB_T/2,SLAB_T,floor_mat,floor_coll))

doors={
    "DR01_suite":((566.62,318.24),(566.62,367.92)),
    "DR02_bedroom":((629.86,318.24),(629.86,367.92)),
    "DR03_main_bath":((801.88,371.34),(851.56,371.34)),
    "DR04_ensuite":((583.30,235.92),(583.30,285.60)),
    "DR05_wc":((864.58,471.00),(898.47,471.00)),
    "DR06_entry":((763.51,573.29),(814.26,573.29)),
    "DR07_service":((924.52,570.72),(969.76,570.72)),
}
for name,(p1,p2) in doors.items():
    opening_objs += add_door_frame(name,p1,p2,opening_coll,door_mat)
    opening_infill_objs.append(add_linear_box(f"{name}_wall_above_head",p1,p2,0.14,(DEFAULTS["door_height_m"]+WALL_H)/2,WALL_H-DEFAULTS["door_height_m"],wall_mat,wall_coll))

labels={
    "SUITE":(450,280),"DRESSING":(545,245),"ENSUITE":(613,256),
    "BEDROOM":(760,285),"CENTRAL PASSAGE":(610,405),"LIVING / DINING":(600,500),
    "MAIN BATH":(812,455),"WC":(890,490),"ENTRY":(850,550),
    "KITCHEN":(1050,500),"BALCONY":(275,450),
}
label_objs=[add_label(k,v,0.14 if k in {"ENSUITE","MAIN BATH"} else (0.15 if len(k)>10 else 0.18)) for k,v in labels.items()]

# Neutral daylight rig.
bpy.ops.object.light_add(type="SUN",location=(8,-4,12)); sun=bpy.context.object; sun.name="Sun"; sun.data.energy=2.1; sun.rotation_euler=(math.radians(28),math.radians(-18),math.radians(28))
bpy.ops.object.light_add(type="AREA",location=(8,-3.5,11)); area=bpy.context.object; area.name="Softbox"; area.data.energy=1500; area.data.shape="RECTANGLE"; area.data.size=12; area.data.size_y=7; point_camera(area,(8,-3.5,0))

cx=((ROI[2]-ROI[0])*SCALE)/2; cy=-((ROI[3]-ROI[1])*SCALE)/2
top=camera("CAM_TOP",(cx,cy,22),(cx,cy,0),ortho=17.8)
axon=camera("CAM_AXON",(cx+19,cy-19,20),(cx,cy,0.40),lens=52)
# Eye cameras are placed at reviewed free-space cells from the geometry mask.
eye_living=camera("CAM_EYE_CUTAWAY_LIVING",(*pdf_world((650,520)),2.15),(*pdf_world((610,350)),0.25),lens=30)
eye_bedroom=camera("CAM_EYE_CUTAWAY_BEDROOM",(*pdf_world((760,300)),2.15),(*pdf_world((825,440)),0.25),lens=30)
eye_kitchen=camera("CAM_EYE_CUTAWAY_KITCHEN",(*pdf_world((1050,520)),2.15),(*pdf_world((900,500)),0.25),lens=30)

# A true top-plan view suppresses only above-opening infill so source jamb gaps
# and glazing runs remain legible. The editable full model retains these solids.
for o in opening_infill_objs:
    o.hide_render=True
render("step3_top_down",top)
for o in label_objs:
    o.hide_render=True

# Temporary cutaway state for a readable full-frame axonometric; restore before save.
cut_state=[]
for o in walls+opening_objs:
    cut_state.append((o,o.dimensions.copy(),o.location.copy()))
    new_h=min(o.dimensions.z,0.80)
    o.dimensions.z=new_h; o.location.z=new_h/2
render("step3_cutaway_axon",axon)
render("step3_eye_cutaway_living",eye_living)
render("step3_eye_cutaway_bedroom",eye_bedroom)
render("step3_eye_cutaway_kitchen",eye_kitchen)
for o,dims,loc in cut_state:
    o.dimensions=dims; o.location=loc
for o in opening_infill_objs:
    o.hide_render=False

bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_OUT))

receipt={
    "source_sha256":g["source_sha256"],
    "geometry_json":str(GEOM),
    "blend":str(BLEND_OUT),
    "renders_pc":[str(PC_RENDERS/f"{n}.png") for n in ("step3_top_down","step3_cutaway_axon","step3_eye_cutaway_living","step3_eye_cutaway_bedroom","step3_eye_cutaway_kitchen")],
    "renders_project":[str(LOCAL_RENDERS/f"{n}.png") for n in ("step3_top_down","step3_cutaway_axon","step3_eye_cutaway_living","step3_eye_cutaway_bedroom","step3_eye_cutaway_kitchen")],
    "object_counts":{"base_wall_solids":len(walls),"opening_infill_solids":len(opening_infill_objs),"interior_floor_parts":len(floors),"balcony_floor_parts":len(balcony),"glazing_threshold_parts":len(threshold_objs),"opening_frame_parts":len(opening_objs),"labels":len(label_objs)},
    "opening_clearances_m":{"door_head":DEFAULTS["door_height_m"],"wall_height":WALL_H,"overdoor_lintel_height":WALL_H-DEFAULTS["door_height_m"],"full_height_glazing_head":DEFAULTS["full_height_glazing_head_m"],"lightwell_sill":DEFAULTS["lightwell_window_sill_m"],"lightwell_head":DEFAULTS["lightwell_window_head_m"]},
    "reachability":g["reachability_from_living_seed"],
    "defaults_provisional":DEFAULTS,
    "note":"Furniture proposal intentionally excluded from Step 3 shell.",
}
RECEIPT_OUT.write_text(json.dumps(receipt,indent=2),encoding="utf-8")
print(json.dumps(receipt,indent=2))
