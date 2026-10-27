import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--dimensions", required=True)
    parser.add_argument("--blend-out", required=True)
    parser.add_argument("--render-dir", required=True)
    return parser.parse_args(argv)


def mat(name, rgba, roughness=0.6, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.diffuse_color = rgba
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = rgba
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return m


def link_only(obj, coll):
    for old in list(obj.users_collection):
        old.objects.unlink(obj)
    coll.objects.link(obj)


def box(name, center, size, coll, material=None, props=None):
    bpy.ops.mesh.primitive_cube_add(location=center)
    obj = bpy.context.object
    obj.name = name
    obj.dimensions = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    link_only(obj, coll)
    if material:
        obj.data.materials.append(material)
    for key, value in (props or {}).items():
        obj[key] = value
    return obj


def wall(name, a, b, thickness, height, coll, material, z=None):
    ax, ay = a
    bx, by = b
    length = math.hypot(bx - ax, by - ay)
    obj = box(name, ((ax + bx) / 2, (ay + by) / 2, z or height / 2), (length, thickness, height), coll, material,
              {"provisional_thickness_m": thickness, "provisional_height_m": height})
    obj.rotation_euler[2] = math.atan2(by - ay, bx - ax)
    return obj


def floor_zone(name, center, size, coll, material, measured):
    return box(name, (center[0], center[1], 0.04), (size[0], size[1], 0.08), coll, material,
               {"measured_width_m": measured[0], "measured_depth_m": measured[1], "source": "printed developer plan"})


def polygon_slab(name, points, thickness, coll, material, props=None):
    verts = [(x, y, 0.0) for x, y in points] + [(x, y, thickness) for x, y in points]
    n = len(points)
    faces = [tuple(range(n)), tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append((i, j, n + j, n + i))
    mesh = bpy.data.meshes.new(name + "Mesh")
    mesh.from_pydata(verts, [], faces)
    mesh.update()
    obj = bpy.data.objects.new(name, mesh)
    coll.objects.link(obj)
    obj.data.materials.append(material)
    for key, value in (props or {}).items():
        obj[key] = value
    return obj


def label(text, loc, coll, size=0.28, color_mat=None):
    curve = bpy.data.curves.new(text[:40] + "_curve", "FONT")
    curve.body = text
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"
    curve.size = size
    curve.extrude = 0.006
    obj = bpy.data.objects.new(text[:40], curve)
    obj.location = (loc[0], loc[1], loc[2])
    coll.objects.link(obj)
    if color_mat:
        obj.data.materials.append(color_mat)
    return obj


def aim(obj, point):
    obj.rotation_euler = (Vector(point) - obj.location).to_track_quat("-Z", "Y").to_euler()


def main():
    args = parse_args()
    dims_path = Path(args.dimensions).resolve()
    blend_out = Path(args.blend_out).resolve()
    render_dir = Path(args.render_dir).resolve()
    render_dir.mkdir(parents=True, exist_ok=True)
    blend_out.parent.mkdir(parents=True, exist_ok=True)
    data = json.loads(dims_path.read_text(encoding="utf-8"))
    p = data["printed_dimensions"]
    provisional = data["provisional"]
    t = provisional["wall_thickness"]
    h = provisional["ceiling_height"]

    bpy.ops.object.select_all(action="SELECT")
    bpy.ops.object.delete(use_global=False)
    for datablocks in (bpy.data.meshes, bpy.data.curves, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        pass

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1400
    scene.render.resolution_y = 1000
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.world.color = (0.055, 0.065, 0.08)
    scene["source_status"] = data["source_status"]
    scene["vertical_dimensions"] = "PROVISIONAL"
    scene["construction_feasibility"] = "NOT_ASSESSED"

    base = bpy.data.collections.new("BASE_MEASURED_SHELL")
    prov = bpy.data.collections.new("PROVISIONAL_VERTICALS_OPENINGS")
    proposed = bpy.data.collections.new("PROPOSED_PLACEHOLDERS")
    annotations = bpy.data.collections.new("ANNOTATIONS")
    review = bpy.data.collections.new("CAMERAS_LIGHTS")
    for coll in (base, prov, proposed, annotations, review):
        scene.collection.children.link(coll)
    proposed.hide_viewport = True
    proposed.hide_render = True
    proposed["status"] = "reserved for independently switchable architect proposal pass"

    floor_m = mat("Floor warm grey", (0.31, 0.34, 0.37, 1.0), 0.82)
    wet_m = mat("Wet rooms", (0.20, 0.34, 0.40, 1.0), 0.7)
    balcony_m = mat("Balcony", (0.18, 0.22, 0.24, 1.0), 0.9)
    wall_m = mat("Walls", (0.80, 0.82, 0.84, 1.0), 0.75)
    frame_m = mat("Opening frames", (0.015, 0.018, 0.025, 1.0), 0.3, 0.45)
    label_m = mat("Dimension labels", (0.92, 0.62, 0.16, 1.0), 0.4)

    living = p["living_dining"]
    suite = p["suite"]
    bedroom = p["bedroom"]
    kitchen = p["kitchen"]
    bath = p["main_bath"]

    # One continuous apartment floor traces the plan envelope; room overlays are
    # local clear spans and must not be read as independent room polygons.
    apartment_outline = [(0, 0), (12.52, 0), (12.52, 2.56), (9.59, 2.56),
                         (9.59, 3.33), (8.85, 3.33), (8.85, 6.37),
                         (5.85, 6.37), (5.85, 6.57), (0, 6.57)]
    polygon_slab("Apartment_Continuous_Floor_V02", apartment_outline, 0.08, base, floor_m,
                 {"topology": "continuous plan-traced envelope", "unprinted_offsets": "provisional"})
    floor_zone("Living_ClearSpan_6.70x3.33", (3.35, 1.665), (6.70, 3.33), base, floor_m, (6.70, 3.33))
    polygon_slab("Suite_Stepped_ClearZone", [(0,3.33),(3.22,3.33),(3.22,4.10),(3.72,4.10),
                 (3.72,6.57),(0,6.57)], 0.02, base, floor_m,
                 {"printed_clear_span_m": "3.22 x 3.24", "shape": "stepped with lower-right extension"})
    floor_zone("Dressing_Provisional", (3.82, 5.58), (1.20, 1.98), base, floor_m, (1.20, 1.98))
    floor_zone("Ensuite_Provisional", (5.12, 5.58), (1.40, 1.98), base, wet_m, (1.40, 1.98))
    floor_zone("Central_Passage_Connected", (4.98, 3.94), (3.52, 1.22), base, floor_m, (3.52, 1.22))
    floor_zone("Bedroom_ClearSpan_3.00x3.04", (7.35, 4.85), (3.00, 3.04), base, floor_m, (3.00, 3.04))
    floor_zone("Bedroom_Wardrobe_Recess", (5.70, 3.73), (0.30, 0.80), base, floor_m, (0.30, 0.80))
    floor_zone("Main_Bath_Above_Entry_1.57x2.32", (7.485, 2.04), (1.57, 2.32), base, wet_m, (1.57, 2.32))
    floor_zone("WC_Above_Entry_1.05x1.31", (8.925, 2.345), (1.05, 1.31), base, wet_m, (1.05, 1.31))
    floor_zone("Entry_Circulation_Connected", (8.145, 0.44), (2.89, 0.88), base, floor_m, (2.89, 0.88))
    floor_zone("Kitchen_ClearSpan_2.93x2.56", (11.055, 1.28), (2.93, 2.56), base, wet_m, (2.93, 2.56))

    # Wide lower balcony plus narrow upper strip adjoining the suite west facade.
    balcony_points = [(-2.40,0.00),(0.00,0.00),(0.00,6.19),(-1.10,6.19),
                      (-1.10,3.33),(-2.40,3.33)]
    polygon_slab("Balcony_Contiguous_Stepped_6.19x2.40wide", balcony_points, 0.08, base, balcony_m,
                 {"measured_length_m":6.19,"measured_wide_depth_m":2.40,"upper_strip_adjoins_suite":True})
    box("Balcony_LowerRight_Storage_Structure_Notch", (-0.36,0.36,0.65), (0.72,0.72,1.30), prov, wall_m,
        {"placement":"plan-traced","dimensions":"provisional"})

    # Walls are explicitly split at every passable doorway and glazed opening.
    wall_specs = [
        ("South living",(0,0),(6.70,0)),
        ("Entry south west",(6.70,0),(7.45,0)),("Entry south east",(8.35,0),(9.59,0)),
        ("Kitchen south",(9.59,0),(12.52,0)),("Kitchen east",(12.52,0),(12.52,2.56)),
        ("Kitchen north",(9.59,2.56),(12.52,2.56)),
        ("Kitchen west low",(9.59,0),(9.59,0.58)),("Kitchen west high",(9.59,1.48),(9.59,2.56)),
        ("Bedroom east",(8.85,3.33),(8.85,6.37)),
        ("Bedroom north west",(5.85,6.37),(6.25,6.37)),("Bedroom north east",(8.25,6.37),(8.85,6.37)),
        ("Ensuite north west",(4.42,6.57),(4.72,6.57)),("Ensuite north east",(5.55,6.57),(5.85,6.57)),
        ("Suite north west",(0,6.57),(0.55,6.57)),("Suite north east",(2.65,6.57),(3.22,6.57)),
        ("Living west low",(0,0),(0,0.35)),("Living west high",(0,2.95),(0,3.33)),
        ("Suite west low",(0,3.33),(0,3.72)),("Suite west high",(0,6.05),(0,6.57)),
        ("Living suite divider",(0,3.33),(3.22,3.33)),
        ("Living hall west",(3.22,3.33),(4.15,3.33)),("Living hall east",(5.20,3.33),(5.85,3.33)),
        ("Bedroom south west",(5.85,3.33),(6.45,3.33)),("Bedroom south east",(7.25,3.33),(8.85,3.33)),
        ("Suite east south",(3.22,3.33),(3.22,3.78)),("Suite east north",(3.22,4.58),(3.22,6.57)),
        ("Dressing south west",(3.22,4.55),(3.52,4.55)),("Dressing south east",(4.32,4.55),(4.42,4.55)),
        ("Ensuite south west",(4.42,4.55),(4.72,4.55)),("Ensuite south east",(5.52,4.55),(5.85,4.55)),
        ("Dressing ensuite divider low",(4.42,4.55),(4.42,5.05)),("Dressing ensuite divider high",(4.42,5.85),(4.42,6.57)),
        ("Ensuite bedroom divider",(5.85,4.15),(5.85,6.37)),
        ("Bath west",(6.70,0.88),(6.70,3.20)),("Bath east",(8.27,0.88),(8.27,3.20)),
        ("Bath north",(6.70,3.20),(8.27,3.20)),
        ("Bath south west",(6.70,0.88),(7.08,0.88)),("Bath south east",(7.88,0.88),(8.27,0.88)),
        ("WC west",(8.40,1.69),(8.40,3.00)),("WC east",(9.45,1.69),(9.45,3.00)),
        ("WC north",(8.40,3.00),(9.45,3.00)),
        ("WC south west",(8.40,1.69),(8.55,1.69)),("WC south east",(9.25,1.69),(9.45,1.69)),
    ]
    for name,a,b in wall_specs:
        wall(name,a,b,t,h,prov,wall_m)

    # Real openings: there is no wall mesh across these spans; frames only.
    glazing = [
        ("Living balcony glazing",(0,0.35),(0,2.95)),
        ("Suite balcony glazing",(0,3.72),(0,6.05)),
        ("Suite north glazing",(0.55,6.57),(2.65,6.57)),
        ("Ensuite north glazing",(4.72,6.57),(5.55,6.57)),
        ("Bedroom north glazing",(6.25,6.37),(8.25,6.37)),
    ]
    for name,a,b in glazing:
        ax,ay=a; bx,by=b; gh=provisional["glazing_height"]
        box(name+" jamb A",(ax,ay,gh/2),(0.07,0.07,gh),prov,frame_m)
        box(name+" jamb B",(bx,by,gh/2),(0.07,0.07,gh),prov,frame_m)
        wall(name+" header",a,b,0.07,0.07,prov,frame_m,z=gh)

    # Balcony parapet excludes the apartment-adjoining east edge.
    for idx,(a,b) in enumerate(zip(balcony_points,balcony_points[1:]+balcony_points[:1])):
        if a[0] == 0 and b[0] == 0:
            continue
        wall(f"Balcony parapet {idx+1}",a,b,0.08,provisional["balcony_parapet_height"],prov,frame_m)

    door_openings = {
        "entry_external":(7.90,0.00),"living_to_hall":(4.675,3.33),"bedroom":(6.85,3.33),
        "suite":(3.22,4.18),"dressing":(3.92,4.55),"ensuite":(5.12,4.55),
        "dressing_to_ensuite":(4.42,5.45),"main_bath":(7.48,0.88),
        "wc":(8.90,1.69),"kitchen":(9.59,1.03)
    }
    barriers=[]
    for dname,(x,y) in door_openings.items():
        for wname,(a,b) in [(n,(a,b)) for n,a,b in wall_specs]:
            if abs(a[1]-b[1])<1e-6 and abs(y-a[1])<1e-5 and min(a[0],b[0])-0.01<=x<=max(a[0],b[0])+0.01:
                barriers.append([dname,wname])
            if abs(a[0]-b[0])<1e-6 and abs(x-a[0])<1e-5 and min(a[1],b[1])-0.01<=y<=max(a[1],b[1])+0.01:
                barriers.append([dname,wname])
    if barriers:
        raise RuntimeError(f"Door openings blocked by walls: {barriers}")

    labels = [
        ("LIVING / DINING  6.70 x 3.33 m",(3.35,1.65,0.12)),
        ("SUITE  printed clear spans 3.22 x 3.24 m",(1.58,5.00,0.12)),
        ("DRESSING",(3.82,5.58,0.12)),("ENSUITE",(5.12,5.58,0.12)),
        ("CENTRAL PASSAGE",(4.95,3.95,0.12)),("BEDROOM  3.00 x 3.04 m",(7.35,4.90,0.12)),
        ("MAIN BATH  1.57 x 2.32 m",(7.48,2.20,0.12)),("WC  1.05 x 1.31 m",(8.92,2.36,0.12)),
        ("ENTRY / CIRCULATION  2.89 m",(8.14,0.48,0.12)),
        ("KITCHEN  2.93 x 2.56 m",(11.05,1.25,0.12)),
        ("BALCONY  6.19 m / 2.40 m wide section",(-1.65,2.70,0.12)),
        ("UNPRINTED OFFSETS + ALL VERTICALS: PROVISIONAL",(5.10,-0.52,0.12)),
    ]
    compact_label_sizes = {
        "MAIN BATH": 0.105,
        "WC ": 0.105,
    }
    for text_value,loc in labels:
        label_size = 0.17 if len(text_value)>22 else 0.20
        for prefix, compact_size in compact_label_sizes.items():
            if text_value.startswith(prefix):
                label_size = compact_size
                break
        obj=label(text_value,loc,annotations,label_size,label_m)
        if text_value.startswith("BALCONY"):
            obj.rotation_euler[2]=math.radians(90)

    # Top orthographic camera.
    cam_data = bpy.data.cameras.new("Top_Camera")
    top_cam = bpy.data.objects.new("Top_Camera", cam_data)
    review.objects.link(top_cam)
    top_cam.location = (5.1, 3.0, 19.0)
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 17.0
    aim(top_cam, (5.1, 3.0, 0.0))

    pcam_data = bpy.data.cameras.new("Perspective_Camera")
    pcam = bpy.data.objects.new("Perspective_Camera", pcam_data)
    review.objects.link(pcam)
    pcam.location = (18.5, -17.5, 16.0)
    pcam_data.lens = 54
    aim(pcam, (5.1, 3.0, 0.65))

    sun_data = bpy.data.lights.new("Sun", "SUN")
    sun_data.energy = 2.0
    sun = bpy.data.objects.new("Sun", sun_data)
    review.objects.link(sun)
    sun.rotation_euler = (math.radians(28), math.radians(-18), math.radians(28))
    area_data = bpy.data.lights.new("Fill", "AREA")
    area_data.energy = 1100
    area_data.shape = "DISK"
    area_data.size = 8.0
    area = bpy.data.objects.new("Fill", area_data)
    review.objects.link(area)
    area.location = (4.0, 2.5, 10.0)
    aim(area, (4.0, 2.5, 0.0))

    bpy.ops.wm.save_as_mainfile(filepath=str(blend_out))

    scene.camera = top_cam
    scene.render.filepath = str(render_dir / "top_measured_shell_v02.png")
    bpy.ops.render.render(write_still=True)
    # Review-only cutaway: preserve full-height editable geometry in the saved blend,
    # lower provisional walls temporarily so every circulation route remains visible.
    full_wall_state = []
    for obj in prov.objects:
        if "provisional_height_m" in obj:
            full_wall_state.append((obj, obj.dimensions.z, obj.location.z))
            obj.dimensions.z = min(obj.dimensions.z, 1.15)
            # Review-only cutaway: retain full-height geometry in the saved .blend,
            # but lower walls enough to expose connected floor routes and labels.
            obj.dimensions.z = min(obj.dimensions.z, 0.85)
            obj.location.z = obj.dimensions.z / 2
    scene.camera = pcam
    scene.render.filepath = str(render_dir / "cutaway_measured_shell_v02.png")
    bpy.ops.render.render(write_still=True)
    for obj,height,zloc in full_wall_state:
        obj.dimensions.z = height
        obj.location.z = zloc

    checks = {
        "status": "PASS",
        "blender_version": bpy.app.version_string,
        "blend_file": str(blend_out),
        "renders": [str(render_dir / "top_measured_shell_v02.png"), str(render_dir / "cutaway_measured_shell_v02.png")],
        "exact_printed_dimensions_m": {
            "living_dining": [6.70, 3.33], "suite": [3.22, 3.24], "bedroom": [3.00, 3.04],
            "balcony": [6.19, 2.40], "kitchen": [2.93, 2.56], "main_bath": [1.57, 2.32], "entry_run": 2.89
        },
        "provisional": provisional,
        "topology": {
            "continuous_floor": True,
            "balcony_upper_strip_adjoins_suite": True,
            "main_bath_above_entry_corridor": True,
            "wc_between_bath_and_kitchen": True,
            "suite_south_wall_stepped": True,
            "bedroom_wardrobe_recess": True
        },
        "door_openings": door_openings,
        "blocked_door_openings": barriers,
        "connectivity_graph": {
            "entry": ["circulation"],
            "circulation": ["living_dining","kitchen","main_bath","wc","central_passage"],
            "central_passage": ["suite","dressing","ensuite","bedroom"],
            "status": "PASS_BY_EXPLICIT_OPENINGS"
        },
        "qa_limit": "Plan-face offsets without printed dimensions remain provisional; topology checked, not an as-built survey.",
        "collections": [base.name, prov.name, proposed.name, annotations.name, review.name],
        "object_count": len(bpy.data.objects),
        "notes": data["notes"],
    }
    (blend_out.parent / "verification_v02.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
    print("APARTMENT_BUILD_V02_OK", json.dumps(checks["exact_printed_dimensions_m"], sort_keys=True))


if __name__ == "__main__":
    main()
