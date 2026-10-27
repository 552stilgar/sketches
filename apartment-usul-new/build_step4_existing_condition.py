"""Create the photo-grounded Step 4 existing-condition scene.

The script opens the reviewed Step 3 blend, preserves its source-derived shell,
and adds only evidence-backed materials and fixed details in a separate
collection. Architect-proposal furniture and remodeling are intentionally
excluded.
"""
from __future__ import annotations

import json
import math
import shutil
from pathlib import Path

import bpy
from mathutils import Vector


ROOT = Path(__file__).resolve().parent
PC_ROOT = Path(r"C:\Workshop\blender\scenes\apartment-usul-new")
STEP3_BLEND = PC_ROOT / "apartment_shell_step3.blend"
STEP4_BLEND = PC_ROOT / "apartment_existing_step4.blend"
PC_RENDERS = PC_ROOT / "renders" / "step4"
LOCAL_RENDERS = ROOT / "renders" / "step4"
RECEIPT_OUT = ROOT / "STEP4_BUILD_RECEIPT.json"

for path in (PC_ROOT, PC_RENDERS, LOCAL_RENDERS):
    path.mkdir(parents=True, exist_ok=True)

bpy.ops.wm.open_mainfile(filepath=str(STEP3_BLEND))
scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1600
scene.render.resolution_y = 900
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.world.color = (0.68, 0.71, 0.75)
scene.world.use_nodes = True
world_bg = scene.world.node_tree.nodes.get("Background")
world_bg.inputs["Color"].default_value = (0.65, 0.68, 0.72, 1)
world_bg.inputs["Strength"].default_value = 0.32
scene.view_settings.look = "AgX - Medium High Contrast"


def make_principled(name, color, roughness=0.65, metallic=0.0):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = color
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return material


texture_origin = bpy.data.objects.new("S4_Texture_Origin", None)
scene.collection.objects.link(texture_origin)


def make_brick_pattern(name, color_a, color_b, mortar, scale, width, row_height, roughness):
    material = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    coords = nodes.new("ShaderNodeTexCoord")
    coords.object = texture_origin
    brick = nodes.new("ShaderNodeTexBrick")
    brick.inputs["Color1"].default_value = color_a
    brick.inputs["Color2"].default_value = color_b
    brick.inputs["Mortar"].default_value = mortar
    brick.inputs["Scale"].default_value = scale
    brick.inputs["Mortar Size"].default_value = 0.018
    brick.inputs["Mortar Smooth"].default_value = 0.003
    brick.inputs["Brick Width"].default_value = width
    brick.inputs["Row Height"].default_value = row_height
    bsdf.inputs["Roughness"].default_value = roughness
    links.new(coords.outputs["Object"], brick.inputs["Vector"])
    links.new(brick.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return material


def make_glass(name, tint=(0.20, 0.28, 0.30, 1), roughness=0.12):
    material = make_principled(name, tint, roughness=roughness, metallic=0.0)
    bsdf = material.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Transmission Weight"].default_value = 0.72
    bsdf.inputs["Alpha"].default_value = 0.42
    material.surface_render_method = "DITHERED"
    return material


def assign(obj, material):
    obj.data.materials.clear()
    obj.data.materials.append(material)


def collection(name):
    existing = bpy.data.collections.get(name)
    if existing:
        return existing
    result = bpy.data.collections.new(name)
    scene.collection.children.link(result)
    return result


def box(name, center, dims, material, coll, evidence="inferred"):
    bpy.ops.mesh.primitive_cube_add(location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = dims
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if material is not None:
        assign(obj, material)
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    coll.objects.link(obj)
    obj["step4_evidence"] = evidence
    return obj


def cylinder(name, center, radius, depth, material, coll, evidence="photo"):
    bpy.ops.mesh.primitive_cylinder_add(vertices=48, radius=radius, depth=depth, location=center)
    obj = bpy.context.object
    obj.name = name
    assign(obj, material)
    for current in list(obj.users_collection):
        current.objects.unlink(obj)
    coll.objects.link(obj)
    obj["step4_evidence"] = evidence
    return obj


def cut_box(target, name, center, dims, coll):
    cutter = box(name, center, dims, None, coll, "build helper")
    modifier = target.modifiers.new(name=f"{name}_boolean", type="BOOLEAN")
    modifier.operation = "DIFFERENCE"
    modifier.solver = "EXACT"
    modifier.object = cutter
    bpy.ops.object.select_all(action="DESELECT")
    target.select_set(True)
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def recessed_basin(name, center, dims, counter, material, coll):
    x, y, z = center
    width, length, depth = dims
    cut_box(counter, f"{name}_Cutter", (x, y, z + 0.02), (width, length, depth + 0.16), coll)
    result = [box(f"{name}_Bottom", (x, y, z - depth / 2), (width - 0.05, length - 0.05, 0.025), material, coll, "photo")]
    wall = 0.022
    result += [
        box(f"{name}_Side_A", (x - width/2 + wall/2, y, z - depth/2), (wall, length, depth), material, coll, "photo"),
        box(f"{name}_Side_B", (x + width/2 - wall/2, y, z - depth/2), (wall, length, depth), material, coll, "photo"),
        box(f"{name}_End_A", (x, y - length/2 + wall/2, z - depth/2), (width, wall, depth), material, coll, "photo"),
        box(f"{name}_End_B", (x, y + length/2 - wall/2, z - depth/2), (width, wall, depth), material, coll, "photo"),
    ]
    return result


def point_camera(camera, target):
    camera.rotation_euler = (Vector(target) - camera.location).to_track_quat("-Z", "Y").to_euler()


def ensure_camera(name, location, target, lens=38, ortho=None):
    old = bpy.data.objects.get(name)
    if old:
        bpy.data.objects.remove(old, do_unlink=True)
    data = bpy.data.cameras.new(name)
    camera = bpy.data.objects.new(name, data)
    scene.collection.objects.link(camera)
    camera.location = location
    point_camera(camera, target)
    data.lens = lens
    if ortho is not None:
        data.type = "ORTHO"
        data.ortho_scale = ortho
    return camera


def render(filename, camera):
    scene.camera = camera
    target = PC_RENDERS / f"{filename}.png"
    scene.render.filepath = str(target)
    bpy.ops.render.render(write_still=True)
    shutil.copy2(target, LOCAL_RENDERS / target.name)


def horizontal_rail(name, x, y0, y1, z, material, coll):
    return box(name, (x, (y0 + y1) / 2, z), (0.055, abs(y1 - y0), 0.055), material, coll, "photo+source")


# Photo-grounded materials. Their hues are representative, not color-calibrated.
wall_white = make_principled("S4_EXISTING_Wall_White", (0.69, 0.68, 0.64, 1), roughness=0.88)
wood_floor = make_brick_pattern("S4_EXISTING_Pale_Gray_Wood", (0.42, 0.44, 0.43, 1), (0.32, 0.34, 0.33, 1), (0.16, 0.17, 0.17, 1), 1.0, 3.8, 0.38, 0.78)
tile_gray = make_brick_pattern("S4_EXISTING_Gray_Stone_Tile", (0.34, 0.36, 0.36, 1), (0.27, 0.29, 0.29, 1), (0.11, 0.12, 0.12, 1), 1.35, 1.0, 1.0, 0.82)
balcony_tile = make_brick_pattern("S4_EXISTING_Balcony_Stone_Tile", (0.24, 0.25, 0.25, 1), (0.17, 0.18, 0.18, 1), (0.07, 0.075, 0.075, 1), 1.15, 1.0, 1.0, 0.90)
charcoal = make_principled("S4_EXISTING_Balcony_Charcoal", (0.045, 0.050, 0.052, 1), roughness=0.84)
black_metal = make_principled("S4_EXISTING_Black_Aluminum", (0.012, 0.014, 0.016, 1), roughness=0.28, metallic=0.58)
greige = make_principled("S4_EXISTING_Kitchen_Greige", (0.47, 0.45, 0.41, 1), roughness=0.45)
black_stone = make_principled("S4_EXISTING_Polished_Black_Stone", (0.018, 0.022, 0.024, 1), roughness=0.12)
stainless = make_principled("S4_EXISTING_Stainless", (0.34, 0.37, 0.39, 1), roughness=0.22, metallic=0.92)
glass = make_glass("S4_EXISTING_Clear_Glass")
wood_soffit = make_principled("S4_EXISTING_Warm_Wood_Soffit", (0.42, 0.22, 0.085, 1), roughness=0.68)

# Replace the Step 3 neutral palette without changing shell topology.
wall_objects = list(bpy.data.collections.get("01_SOURCE_DERIVED_WALL_SOLIDS").objects)
floor_objects = list(bpy.data.collections.get("02_SOURCE_DERIVED_FLOORS").objects)
opening_objects = list(bpy.data.collections.get("03_SOURCE_OPENINGS_AND_FRAMES").objects)
for obj in wall_objects:
    assign(obj, charcoal if obj.location.x < 3.4 else wall_white)
for obj in floor_objects:
    if obj.name.startswith("BalconyFloor"):
        assign(obj, balcony_tile)
    elif obj.location.x > 11.2 and obj.location.y < -3.8:
        # Kitchen gray tile is directly evidenced; the geometric cutoff is inferred.
        assign(obj, tile_gray)
        obj["step4_evidence"] = "photo material; inferred boundary"
    else:
        assign(obj, wood_floor)
for obj in opening_objects:
    if "glass" in obj.name.lower():
        assign(obj, glass)
    else:
        assign(obj, black_metal)

details = collection("04_STEP4_EXISTING_FIXED_DETAILS")
review = collection("05_STEP4_REVIEW_ONLY")
created = []

# Kitchen: photo-confirmed type/material; dimensions and placement remain reversible.
counter_z = 0.90
north_counter = box("S4_Kitchen_Counter_North", (13.80, -4.62, counter_z), (3.96, 0.64, 0.045), black_stone, details, "photo")
return_counter = box("S4_Kitchen_Counter_Return", (12.10, -5.43, counter_z), (0.64, 1.45, 0.045), black_stone, details, "photo")
created += [north_counter, return_counter,
    box("S4_Kitchen_Base_North", (13.80, -4.62, 0.43), (3.90, 0.60, 0.86), greige, details, "photo type; inferred dimensions"),
    box("S4_Kitchen_Base_Return", (12.10, -5.43, 0.43), (0.60, 1.40, 0.86), greige, details, "photo type; inferred dimensions"),
    box("S4_Kitchen_BackSplash_North", (13.80, -4.315, 1.24), (3.96, 0.025, 0.64), black_stone, details, "photo"),
    box("S4_Kitchen_BackSplash_Cooktop", (15.05, -4.335, 1.25), (1.45, 0.055, 0.72), black_stone, details, "photo"),
    box("S4_Kitchen_Upper_Left", (12.25, -4.46, 1.98), (0.88, 0.34, 0.86), greige, details, "photo type; inferred dimensions"),
    box("S4_Kitchen_Upper_Right", (14.95, -4.46, 1.98), (1.35, 0.34, 0.86), greige, details, "photo type; inferred dimensions"),
    box("S4_Kitchen_Tall_Cabinet", (16.02, -5.64, 1.25), (0.54, 0.82, 2.50), greige, details, "photo type; inferred dimensions"),
    box("S4_Kitchen_Oven", (15.25, -4.925, 0.48), (0.58, 0.055, 0.62), black_metal, details, "photo"),
    box("S4_Kitchen_Cooktop", (15.22, -4.60, 0.936), (0.62, 0.46, 0.018), black_metal, details, "photo"),
]
created += recessed_basin("S4_Kitchen_Sink_A", (12.10, -5.18, counter_z + 0.01), (0.46, 0.48, 0.20), return_counter, stainless, details)
created += recessed_basin("S4_Kitchen_Sink_B", (12.10, -5.70, counter_z + 0.01), (0.46, 0.48, 0.20), return_counter, stainless, details)
# Connected chrome faucet: vertical riser plus joined horizontal spout.
faucet_riser = cylinder("S4_Kitchen_Faucet_Riser", (11.91, -4.88, 1.17), 0.032, 0.50, stainless, details)
faucet_spout = cylinder("S4_Kitchen_Faucet_Spout", (12.06, -4.88, 1.40), 0.027, 0.30, stainless, details)
faucet_spout.rotation_euler[1] = math.radians(90)
created += [faucet_riser, faucet_spout]

# Balcony footprint and evidence-backed fixed details.
balcony_floors = [obj for obj in floor_objects if obj.name.startswith("BalconyFloor")]
min_x = min(obj.location.x - obj.dimensions.x / 2 for obj in balcony_floors)
max_x = max(obj.location.x + obj.dimensions.x / 2 for obj in balcony_floors)
min_y = min(obj.location.y - obj.dimensions.y / 2 for obj in balcony_floors)
max_y = max(obj.location.y + obj.dimensions.y / 2 for obj in balcony_floors)
rail_x = min_x + 0.10
created += [
    box("S4_Balcony_Parapet", (rail_x, (min_y + max_y) / 2, 0.39), (0.18, max_y - min_y, 0.78), charcoal, details, "photo+source; height provisional"),
    horizontal_rail("S4_Balcony_Handrail", rail_x, min_y, max_y, 1.10, black_metal, details),
    box("S4_Balcony_Glass", (rail_x, (min_y + max_y) / 2, 0.92), (0.025, max_y - min_y - 0.12, 0.34), glass, details, "photo+source; height provisional"),
    box("S4_Balcony_Linear_Drain", (rail_x + 0.27, (min_y + max_y) / 2, 0.018), (0.22, max_y - min_y - 0.20, 0.035), black_metal, details, "photo; dimensions provisional"),
]
for index, y in enumerate((min_y + 0.15, (min_y + max_y) / 2, max_y - 0.15)):
    created.append(box(f"S4_Balcony_Post_{index+1:02d}", (rail_x, y, 0.55), (0.055, 0.055, 1.10), black_metal, details, "photo; spacing provisional"))
drain_length = max_y - min_y - 0.20
drain_slats = max(2, int(drain_length / 0.10))
for index in range(drain_slats + 1):
    y = min_y + 0.10 + drain_length * index / drain_slats
    created.append(box(f"S4_Balcony_Drain_Grate_{index:03d}", (rail_x + 0.27, y, 0.042), (0.20, 0.018, 0.014), stainless, details, "photo; spacing provisional"))

# Mirror the stepped balcony floor cells at ceiling level for a source-shaped soffit.
for index, floor_obj in enumerate(balcony_floors):
    created.append(box(
        f"S4_Balcony_Wood_Soffit_{index:03d}",
        (floor_obj.location.x, floor_obj.location.y, 2.54),
        (floor_obj.dimensions.x, floor_obj.dimensions.y, 0.055),
        wood_soffit,
        details,
        "photo material; source footprint; height provisional",
    ))
for index, y in enumerate((min_y + (max_y-min_y)*0.30, min_y + (max_y-min_y)*0.70)):
    light = cylinder(f"S4_Balcony_Downlight_{index+1:02d}", ((min_x+max_x)/2, y, 2.49), 0.075, 0.08, black_metal, details)
    created.append(light)
# Photo-visible narrow soffit slats run along the long balcony axis.
slat_count = 12
for index in range(slat_count):
    x = min_x + (max_x - min_x) * (index + 0.5) / slat_count
    created.append(box(f"S4_Balcony_Soffit_Slat_{index:02d}", (x, (min_y + max_y) / 2, 2.505), (0.030, max_y - min_y - 0.08, 0.018), charcoal, details, "photo; spacing provisional"))

# Charcoal cladding around the balcony recess, kept as a thin finish layer.
created.append(box("S4_Balcony_Recess_Cladding", (max_x - 0.11, (min_y + max_y) / 2, 1.27), (0.045, 0.90, 2.48), charcoal, details, "photo; planar extent inferred"))

# Remove Step 3 annotation text from all Step 4 reviews.
for obj in bpy.data.objects:
    if obj.type == "FONT":
        obj.hide_render = True

# Neutral daylight plus warmer balcony bounce.
for obj in list(bpy.data.objects):
    if obj.type == "LIGHT":
        bpy.data.objects.remove(obj, do_unlink=True)
bpy.ops.object.light_add(type="SUN", location=(5, -4, 11))
sun = bpy.context.object
sun.name = "S4_Sun"
sun.data.energy = 1.35
sun.rotation_euler = (math.radians(24), math.radians(-18), math.radians(32))
bpy.ops.object.light_add(type="AREA", location=(7.5, -4.0, 10.0))
area = bpy.context.object
area.name = "S4_Softbox"
area.data.energy = 520
area.data.shape = "RECTANGLE"
area.data.size = 12
area.data.size_y = 7
point_camera(area, (7.0, -3.8, 0.2))
bpy.ops.object.light_add(type="AREA", location=(14.0, -5.4, 2.25))
kitchen_light = bpy.context.object
kitchen_light.name = "S4_Kitchen_Fill"
kitchen_light.data.energy = 260
kitchen_light.data.shape = "RECTANGLE"
kitchen_light.data.size = 3.0
point_camera(kitchen_light, (14.0, -4.6, 0.8))
bpy.ops.object.light_add(type="AREA", location=((min_x+max_x)/2, (min_y+max_y)/2, 2.20))
balcony_light = bpy.context.object
balcony_light.name = "S4_Balcony_Fill"
balcony_light.data.energy = 320
balcony_light.data.shape = "RECTANGLE"
balcony_light.data.size = 4.0
point_camera(balcony_light, ((min_x+max_x)/2, (min_y+max_y)/2, 0.4))

all_meshes = [obj for obj in bpy.data.objects if obj.type == "MESH"]
min_all_x = min(obj.location.x - obj.dimensions.x / 2 for obj in floor_objects)
max_all_x = max(obj.location.x + obj.dimensions.x / 2 for obj in floor_objects)
min_all_y = min(obj.location.y - obj.dimensions.y / 2 for obj in floor_objects)
max_all_y = max(obj.location.y + obj.dimensions.y / 2 for obj in floor_objects)
center_x = (min_all_x + max_all_x) / 2
center_y = (min_all_y + max_all_y) / 2

top = ensure_camera("S4_CAM_TOP_CUTAWAY", (center_x, center_y, 23), (center_x, center_y, 0), ortho=18.2)
axon = ensure_camera("S4_CAM_AXON_CUTAWAY", (center_x + 22, center_y - 22, 22), (center_x + 0.35, center_y, 0.55), lens=52)
kitchen = ensure_camera("S4_CAM_KITCHEN_SECTION_DETAIL", (9.70, -9.10, 4.80), (13.90, -5.05, 0.95), lens=42)
balcony = ensure_camera("S4_CAM_BALCONY_FULL_HEIGHT", ((min_x+max_x)/2 - 0.10, min_y + 0.25, 1.48), ((min_x+max_x)/2, max_y - 0.40, 1.05), lens=21)

# Review-only temporary cutaway. The saved editable scene is restored to full height.
cut_targets = wall_objects + opening_objects
cut_state = [(obj, obj.dimensions.copy(), obj.location.copy()) for obj in cut_targets]
cut_hidden = [obj for obj in created if "Wood_Soffit" in obj.name or "Soffit_Slat" in obj.name or "Downlight" in obj.name or "Recess_Cladding" in obj.name]
for obj in cut_hidden:
    obj.hide_render = True
for obj in cut_targets:
    height = min(obj.dimensions.z, 0.78)
    obj.dimensions.z = height
    obj.location.z = height / 2
render("step4_materials_top_cutaway", top)
render("step4_materials_axon_cutaway", axon)
for obj in cut_hidden:
    obj.hide_render = False
for obj, dims, location in cut_state:
    obj.dimensions = dims
    obj.location = location

# Remove only the foreground wall from the kitchen review camera; all other
# walls remain full height and the saved scene is immediately restored.
kitchen_section = wall_objects + opening_objects
for obj in kitchen_section:
    obj.hide_render = True
render("step4_kitchen_section_detail", kitchen)
for obj in kitchen_section:
    obj.hide_render = False
render("step4_balcony_full_height", balcony)

bpy.ops.wm.save_as_mainfile(filepath=str(STEP4_BLEND))

receipt = {
    "stage": "Step 4 existing-condition materials and fixed details",
    "base_step3_blend": str(STEP3_BLEND),
    "step4_blend": str(STEP4_BLEND),
    "separation": {
        "existing_condition_collection": details.name,
        "architect_proposal_objects": 0,
        "step3_shell_topology_changed": False,
    },
    "renders_pc": [str(PC_RENDERS / f"{name}.png") for name in (
        "step4_materials_top_cutaway",
        "step4_materials_axon_cutaway",
        "step4_kitchen_section_detail",
        "step4_balcony_full_height",
    )],
    "renders_project": [str(LOCAL_RENDERS / f"{name}.png") for name in (
        "step4_materials_top_cutaway",
        "step4_materials_axon_cutaway",
        "step4_kitchen_section_detail",
        "step4_balcony_full_height",
    )],
    "photo_grounded_features": [
        "pale gray wood-look interior flooring",
        "white walls and black aluminum frames",
        "greige handleless kitchen with polished black stone counter/backsplash",
        "double stainless sink, chrome faucet, black cooktop and oven",
        "dark gray balcony tile, charcoal walls, glass balustrade, linear drain",
        "warm wood-slat balcony soffit and black downlights",
    ],
    "provisional": [
        "all cabinetry and fixture dimensions/coordinates",
        "kitchen tile boundary",
        "balcony parapet, drain, soffit and railing heights/depths",
        "uncalibrated material colors",
    ],
    "fixed_detail_objects": len(created),
    "note": "No architect-proposal furniture or remodeling is included.",
}
with RECEIPT_OUT.open("w", encoding="utf-8", newline="\n") as stream:
    stream.write(json.dumps(receipt, indent=2))
    stream.write("\n")
print(json.dumps(receipt, indent=2))
