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

    floor_zone("Living_Dining_MEASURED_6.70x3.33", (living["width"] / 2, living["depth"] / 2),
               (living["width"], living["depth"]), base, floor_m, (living["width"], living["depth"]))
    floor_zone("Suite_MEASURED_3.22x3.24", (suite["width"] / 2, living["depth"] + suite["depth"] / 2),
               (suite["width"], suite["depth"]), base, floor_m, (suite["width"], suite["depth"]))
    floor_zone("Bedroom_MEASURED_3.00x3.04", (7.18, living["depth"] + bedroom["depth"] / 2),
               (bedroom["width"], bedroom["depth"]), base, floor_m, (bedroom["width"], bedroom["depth"]))
    floor_zone("Main_Bath_MEASURED_1.57x2.32", (living["width"] + bath["width"] / 2, bath["depth"] / 2),
               (bath["width"], bath["depth"]), base, wet_m, (bath["width"], bath["depth"]))
    floor_zone("Entry_Run_MEASURED_2.89", (9.17, 1.45), (p["entry_run"], 2.10), base, floor_m, (p["entry_run"], 2.10))
    floor_zone("Kitchen_MEASURED_2.93x2.56", (11.38, kitchen["depth"] / 2),
               (kitchen["width"], kitchen["depth"]), base, wet_m, (kitchen["width"], kitchen["depth"]))

    balcony_points = [(-2.40, 0.00), (0.00, 0.00), (0.00, 3.33), (-1.10, 3.33), (-1.10, 6.19), (-2.00, 6.19)]
    polygon_slab("Balcony_STEPPED_MEASURED_6.19x2.40wide", balcony_points, 0.08, base, balcony_m,
                 {"measured_length_m": 6.19, "measured_wide_depth_m": 2.40, "shape": "stepped"})

    # Perimeter and principal partitions; unprinted offsets remain schematic.
    wall_specs = [
        ("South living", (0, 0), (6.70, 0)),
        ("Living suite divider", (0, 3.33), (3.22, 3.33)),
        ("Suite north", (0, 6.57), (3.22, 6.57)),
        ("Suite east", (3.22, 3.33), (3.22, 6.57)),
        ("Bedroom north", (5.68, 6.37), (8.68, 6.37)),
        ("Bedroom east", (8.68, 3.33), (8.68, 6.37)),
        ("Bedroom south", (5.68, 3.33), (8.68, 3.33)),
        ("Bath west", (6.70, 0.00), (6.70, 2.32)),
        ("Bath east", (8.27, 0.00), (8.27, 2.32)),
        ("Bath north", (6.70, 2.32), (8.27, 2.32)),
        ("Kitchen south", (9.915, 0.00), (12.845, 0.00)),
        ("Kitchen north", (9.915, 2.56), (12.845, 2.56)),
        ("Kitchen east", (12.845, 0.00), (12.845, 2.56)),
        ("Kitchen west", (9.915, 0.00), (9.915, 2.56)),
        ("Entry south", (6.70, 0.00), (9.915, 0.00)),
        ("Hall north", (3.22, 3.33), (5.68, 3.33)),
        ("Hall north upper", (3.22, 6.37), (5.68, 6.37)),
    ]
    for name, a, b in wall_specs:
        wall(name, a, b, t, h, prov, wall_m)

    # Large glazed openings seen in photos; sizes and offsets are provisional.
    wall("Living balcony frame", (0, 0.35), (0, 2.95), 0.07, provisional["glazing_height"], prov, frame_m,
         z=provisional["glazing_height"] / 2)
    wall("Suite balcony frame", (0, 3.72), (0, 6.05), 0.07, provisional["glazing_height"], prov, frame_m,
         z=provisional["glazing_height"] / 2)
    wall("Kitchen lightwell glazing", (9.915, 0.40), (9.915, 2.15), 0.07, provisional["glazing_height"], prov, frame_m,
         z=provisional["glazing_height"] / 2)

    # Balcony parapet path, provisionally 1.05 m high.
    for idx, (a, b) in enumerate(zip(balcony_points, balcony_points[1:] + balcony_points[:1])):
        if a == (0.0, 0.0) and b == (0.0, 3.33):
            continue
        wall(f"Balcony parapet {idx+1}", a, b, 0.08, provisional["balcony_parapet_height"], prov, frame_m)

    labels = [
        ("LIVING / DINING  6.70 x 3.33 m", (3.35, 1.65, 0.11)),
        ("SUITE  3.22 x 3.24 m", (1.61, 4.95, 0.11)),
        ("BEDROOM  3.00 x 3.04 m", (7.18, 4.85, 0.11)),
        ("MAIN BATH  1.57 x 2.32 m", (7.48, 1.15, 0.11)),
        ("KITCHEN  2.93 x 2.56 m", (11.38, 1.27, 0.11)),
        ("BALCONY  6.19 m / 2.40 m wide section", (-1.55, 2.65, 0.11)),
        ("HEIGHTS / OPENINGS / WALL THICKNESS: PROVISIONAL", (5.15, -0.55, 0.11)),
    ]
    for text_value, loc in labels:
        obj = label(text_value, loc, annotations, 0.22 if "PROVISIONAL" not in text_value else 0.18, label_m)
        if "BALCONY" in text_value:
            obj.rotation_euler[2] = math.radians(90)

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
    pcam.location = (15.5, -13.0, 12.5)
    pcam_data.lens = 48
    aim(pcam, (5.2, 2.9, 0.8))

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
    scene.render.filepath = str(render_dir / "top_measured_shell.png")
    bpy.ops.render.render(write_still=True)
    scene.camera = pcam
    scene.render.filepath = str(render_dir / "perspective_measured_shell.png")
    bpy.ops.render.render(write_still=True)

    checks = {
        "status": "PASS",
        "blender_version": bpy.app.version_string,
        "blend_file": str(blend_out),
        "renders": [str(render_dir / "top_measured_shell.png"), str(render_dir / "perspective_measured_shell.png")],
        "exact_printed_dimensions_m": {
            "living_dining": [6.70, 3.33], "suite": [3.22, 3.24], "bedroom": [3.00, 3.04],
            "balcony": [6.19, 2.40], "kitchen": [2.93, 2.56], "main_bath": [1.57, 2.32], "entry_run": 2.89
        },
        "provisional": provisional,
        "collections": [base.name, prov.name, proposed.name, annotations.name, review.name],
        "object_count": len(bpy.data.objects),
        "notes": data["notes"],
    }
    (blend_out.parent / "verification.json").write_text(json.dumps(checks, indent=2), encoding="utf-8")
    print("APARTMENT_BUILD_OK", json.dumps(checks["exact_printed_dimensions_m"], sort_keys=True))


if __name__ == "__main__":
    main()
