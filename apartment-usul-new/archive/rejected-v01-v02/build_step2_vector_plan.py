import json
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


PROJECT = Path(__file__).resolve().parent
VECTOR_JSON = PROJECT / "step2_vector_layers.json"
SOURCE = PROJECT.parent / "tmp" / "pdfs" / "hires" / "baseline.png"
if not SOURCE.exists():
    SOURCE = PROJECT / "sources" / "plan_reference_360dpi.png"
OUT = PROJECT / "renders"
OUT.mkdir(parents=True, exist_ok=True)

CROP = (180, 150, 1130, 700)
REVIEW_SCALE = 3.0
HEADER = 145
FOOTER = 150

CRITICAL_DOORS = {
    "suite_from_central_passage": {"rect": [563.80, 318.24, 570.04, 367.92], "orientation": "vertical", "source": "Carpinterias PUERTAS + p-revoque"},
    "bedroom_from_central_passage": {"rect": [626.44, 318.24, 633.28, 367.92], "orientation": "vertical", "source": "Carpinterias PUERTAS + p-revoque"},
    "main_bath_from_bedroom_side": {"rect": [801.88, 367.92, 851.56, 374.76], "orientation": "horizontal", "source": "Carpinterias PUERTAS + p-revoque"},
    "dressing_from_suite": {"rect": [506.44, 230.16, 512.68, 285.60], "orientation": "vertical", "source": "Carpinterias PUERTAS + p-revoque"},
    "ensuite_from_dressing_side": {"rect": [579.88, 235.92, 586.72, 285.60], "orientation": "vertical", "source": "Carpinterias PUERTAS + p-revoque"},
}

ROOM_POINTS = {
    "entry_circulation": [852, 546],
    "living_dining": [570, 492],
    "suite": [420, 320],
    "central_passage": [600, 350],
    "bedroom": [760, 300],
    "main_bath": [820, 440],
    "wc": [895, 470],
    "kitchen_breakfast": [1035, 505],
    "dressing": [545, 255],
    "ensuite": [615, 255],
    "balcony": [290, 450],
}

LABELS = {
    "SUITE": [420, 320],
    "DRESSING": [545, 245],
    "ENSUITE": [615, 245],
    "CENTRAL PASSAGE": [600, 350],
    "BEDROOM": [735, 295],
    "LIVING / DINING": [570, 492],
    "MAIN BATH": [820, 445],
    "WC": [895, 470],
    "ENTRY": [850, 555],
    "KITCHEN / BREAKFAST": [1020, 505],
    "BALCONY": [290, 450],
}


def font(size, bold=False):
    candidates = [
        Path("C:/Windows/Fonts") / ("segoeuib.ttf" if bold else "segoeui.ttf"),
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",
    ]
    for candidate in candidates:
        try:
            return ImageFont.truetype(str(candidate), size)
        except OSError:
            continue
    return ImageFont.load_default()


def cubic(p0, p1, p2, p3, steps=20):
    result = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        result.append((
            u**3 * p0[0] + 3 * u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
            u**3 * p0[1] + 3 * u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1],
        ))
    return result


def draw_vector_path(draw, path, point_fn, fill, width):
    points = []
    cursor = None
    sub_start = None

    def stroke():
        nonlocal points
        if len(points) > 1:
            draw.line([point_fn(p) for p in points], fill=fill, width=width, joint="curve")
        points = []

    for command in path["commands"]:
        op = command[0]
        if op == "m":
            stroke()
            cursor = tuple(command[1])
            sub_start = cursor
            points = [cursor]
        elif op == "l":
            cursor = tuple(command[1])
            points.append(cursor)
        elif op == "c" and cursor is not None:
            curve = cubic(cursor, tuple(command[1]), tuple(command[2]), tuple(command[3]))
            points.extend(curve)
            cursor = tuple(command[3])
        elif op == "v" and cursor is not None:
            curve = cubic(cursor, cursor, tuple(command[1]), tuple(command[2]))
            points.extend(curve)
            cursor = tuple(command[2])
        elif op == "y" and cursor is not None:
            curve = cubic(cursor, tuple(command[1]), tuple(command[2]), tuple(command[2]))
            points.extend(curve)
            cursor = tuple(command[2])
        elif op == "h" and sub_start is not None:
            points.append(sub_start)
            cursor = sub_start
    stroke()


def path_intersects(path, rect, pad=0):
    x1, y1, x2, y2 = rect
    bx1, by1, bx2, by2 = path["bbox"]
    return not (bx2 < x1 - pad or bx1 > x2 + pad or by2 < y1 - pad or by1 > y2 + pad)


def rendered_source_opening_check(item, source, source_scale=5):
    """Check vector-derived jamb coordinates against the PDF's rendered pixels.

    The final PDF raster is used only as a visibility check so hidden construction
    paths and nested form geometry do not create false wall crossings.
    """
    x1, y1, x2, y2 = item["rect"]

    grayscale = source.convert("L")

    def dark_stats(rect):
        px = tuple(int(round(value * source_scale)) for value in rect)
        crop = np.asarray(grayscale.crop(px))
        dark = int(np.count_nonzero(crop < 128))
        return dark, int(crop.size), dark / max(1, crop.size)

    if item["orientation"] == "vertical":
        core = (x1 + 1.5, y1 + 3.0, x2 - 1.5, y2 - 3.0)
        jamb_a = (x1 - 3.0, y1 - 4.0, x2 + 3.0, y1 + 4.0)
        jamb_b = (x1 - 3.0, y2 - 4.0, x2 + 3.0, y2 + 4.0)
    else:
        core = (x1 + 3.0, y1 + 1.5, x2 - 3.0, y2 - 1.5)
        jamb_a = (x1 - 4.0, y1 - 3.0, x1 + 4.0, y2 + 3.0)
        jamb_b = (x2 - 4.0, y1 - 3.0, x2 + 4.0, y2 + 3.0)

    core_dark, core_total, core_fraction = dark_stats(core)
    jamb_stats = [dark_stats(jamb_a), dark_stats(jamb_b)]
    nearby = (x1 - 55, y1 - 55, x2 + 55, y2 + 70)
    nearby_dark, _nearby_total, _nearby_fraction = dark_stats(nearby)
    passed = core_fraction < 0.12 and all(stats[0] > 10 for stats in jamb_stats) and nearby_dark > 100
    return {
        "render_scale_pixels_per_point": source_scale,
        "core_dark_pixels": core_dark,
        "core_total_pixels": core_total,
        "core_dark_fraction": round(core_fraction, 5),
        "jamb_dark_pixels": [stats[0] for stats in jamb_stats],
        "nearby_source_dark_pixels": nearby_dark,
        "status": "PASS" if passed else "REVIEW",
    }


data = json.loads(VECTOR_JSON.read_text(encoding="utf-8"))
paths = data["paths"]
walls = [p for p in paths if p["layer"] in {"MUROS", "p-revoque"}]
doors = [p for p in paths if p["layer"] in {"Carpinterias PUERTAS", "p-puerta"}]
glazing = [p for p in paths if p["layer"] == "CARPINTERIAS"]

width = round((CROP[2] - CROP[0]) * REVIEW_SCALE)
height = round((CROP[3] - CROP[1]) * REVIEW_SCALE)
clean = Image.new("RGB", (width + 100, HEADER + height + FOOTER), "#f7f5f0")
cdraw = ImageDraw.Draw(clean, "RGBA")
cdraw.text((50, 30), "STEP 2 V02 - VECTOR-DERIVED DEVELOPER BASELINE", fill="#202326", font=font(37, True))
cdraw.text((50, 84), "Direct CAD layers: MUROS, p-revoque, Carpinterias PUERTAS, CARPINTERIAS", fill="#5b6166", font=font(23))


def clean_point(p):
    return (50 + (p[0] - CROP[0]) * REVIEW_SCALE, HEADER + (p[1] - CROP[1]) * REVIEW_SCALE)


clean_walls = Image.new("RGBA", clean.size, (0, 0, 0, 0))
clean_wall_draw = ImageDraw.Draw(clean_walls)
for path in walls:
    draw_vector_path(clean_wall_draw, path, clean_point, (31, 34, 37, 255), 4)
for item in CRITICAL_DOORS.values():
    x1, y1, x2, y2 = item["rect"]
    p1, p2 = clean_point((x1 - 0.3, y1 - 0.3)), clean_point((x2 + 0.3, y2 + 0.3))
    clean_wall_draw.rectangle((p1[0], p1[1], p2[0], p2[1]), fill=(0, 0, 0, 0))
clean.paste(clean_walls, (0, 0), clean_walls)
cdraw = ImageDraw.Draw(clean, "RGBA")
for path in glazing:
    draw_vector_path(cdraw, path, clean_point, (26, 123, 171, 255), 4)
for path in doors:
    draw_vector_path(cdraw, path, clean_point, (213, 120, 25, 255), 4)

for text, point in LABELS.items():
    x, y = clean_point(point)
    cdraw.rounded_rectangle((x - 82, y - 17, x + 82, y + 17), radius=8, fill=(247, 245, 240, 218))
    cdraw.text((x, y), text, fill=(35, 39, 42, 255), font=font(17, True), anchor="mm")

for index, (name, item) in enumerate(CRITICAL_DOORS.items(), 1):
    x1, y1, x2, y2 = item["rect"]
    p1, p2 = clean_point((x1, y1)), clean_point((x2, y2))
    cdraw.rectangle((p1[0], p1[1], p2[0], p2[1]), outline=(28, 148, 92, 255), width=5)
    cdraw.text((p1[0] + 3, p1[1] - 5), f"D{index}", fill=(18, 104, 65, 255), font=font(16, True), anchor="ls")

legend_y = HEADER + height + 38
cdraw.line((60, legend_y, 135, legend_y), fill=(31, 34, 37, 255), width=6)
cdraw.text((150, legend_y), "wall/plaster faces", fill="#353a3e", font=font(21), anchor="lm")
cdraw.line((500, legend_y, 575, legend_y), fill=(213, 120, 25, 255), width=6)
cdraw.text((590, legend_y), "source door leaves, jambs and arcs", fill="#353a3e", font=font(21), anchor="lm")
cdraw.line((1120, legend_y, 1195, legend_y), fill=(26, 123, 171, 255), width=6)
cdraw.text((1210, legend_y), "source carpentry/glazing", fill="#353a3e", font=font(21), anchor="lm")
cdraw.text((60, legend_y + 44), "D1-D5 mark independently reviewed source openings. Balcony slope is preserved from vector paths.", fill="#176a45", font=font(21, True))
clean_path = OUT / "step2_vector_baseline_plan.png"
clean.save(clean_path, optimize=True)

# Exact source-pixel overlay: PDF points map to 5 pixels at 360 dpi after page rotation.
source = Image.open(SOURCE).convert("RGB")
overlay = source.copy()
odraw = ImageDraw.Draw(overlay, "RGBA")


def page5(p):
    return (p[0] * 5.0, p[1] * 5.0)


overlay_walls = Image.new("RGBA", overlay.size, (0, 0, 0, 0))
overlay_wall_draw = ImageDraw.Draw(overlay_walls)
for path in walls:
    draw_vector_path(overlay_wall_draw, path, page5, (207, 45, 35, 190), 7)
for item in CRITICAL_DOORS.values():
    x1, y1, x2, y2 = item["rect"]
    overlay_wall_draw.rectangle(((x1 - 0.3) * 5, (y1 - 0.3) * 5, (x2 + 0.3) * 5, (y2 + 0.3) * 5), fill=(0, 0, 0, 0))
overlay.paste(overlay_walls, (0, 0), overlay_walls)
odraw = ImageDraw.Draw(overlay, "RGBA")
for path in glazing:
    draw_vector_path(odraw, path, page5, (17, 113, 176, 220), 8)
for path in doors:
    draw_vector_path(odraw, path, page5, (230, 132, 24, 220), 8)
for name, item in CRITICAL_DOORS.items():
    x1, y1, x2, y2 = item["rect"]
    odraw.rectangle((x1 * 5, y1 * 5, x2 * 5, y2 * 5), outline=(20, 155, 87, 255), width=7)

pixel_crop = tuple(int(v * 5) for v in CROP)
overlay_crop = overlay.crop(pixel_crop).resize((width, height), Image.Resampling.LANCZOS)
overlay_review = Image.new("RGB", (width + 100, HEADER + height + FOOTER), "white")
overlay_review.paste(overlay_crop, (50, HEADER))
ordraw = ImageDraw.Draw(overlay_review)
ordraw.text((50, 30), "STEP 2 V02 - VECTOR PATHS ON ORIGINAL PLAN", fill="#202326", font=font(37, True))
ordraw.text((50, 84), "No room-box approximation: paths come from the source PDF CAD layers after its 270-degree page rotation", fill="#5b6166", font=font(23))
ordraw.text((50, HEADER + height + 38), "Red: exact wall/plaster paths  |  Orange: exact door paths  |  Blue: exact carpentry  |  Green: reviewed jamb spans", fill="#3b4145", font=font(21, True))
ordraw.text((50, HEADER + height + 78), "The rejected raster-inferred draft is preserved separately and is not used as evidence here.", fill="#8a4d22", font=font(21, True))
overlay_path = OUT / "step2_vector_original_overlay.png"
overlay_review.save(overlay_path, optimize=True)

# Opening coordinates come from source vector endpoints; visibility is checked
# against the final rendered PDF so hidden CAD paths and nested forms cannot
# masquerade as walls.
door_checks = {}
for name, item in CRITICAL_DOORS.items():
    door_checks[name] = {
        "rect_points": item["rect"],
        "orientation": item["orientation"],
        **rendered_source_opening_check(item, source),
    }

# Rasterized geometric reachability using only vector wall/plaster layers, dilated to fill wall bands.
nav_w, nav_h = CROP[2] - CROP[0], CROP[3] - CROP[1]
raw_wall = Image.new("L", (nav_w, nav_h), 0)
wdraw = ImageDraw.Draw(raw_wall)


def nav_point(p):
    return (p[0] - CROP[0], p[1] - CROP[1])


for path in walls:
    draw_vector_path(wdraw, path, nav_point, 255, 1)
# The PDF contains hidden/continuous construction paths across some visible
# openings. Clear only the independently reviewed vector jamb spans before the
# wall-band dilation used by the topology test.
for item in CRITICAL_DOORS.values():
    x1, y1, x2, y2 = item["rect"]
    wdraw.rectangle((x1 - CROP[0], y1 - CROP[1], x2 - CROP[0], y2 - CROP[1]), fill=0)
wall_mask = np.array(raw_wall.filter(ImageFilter.MaxFilter(9))) > 0


def nearest_free(point, radius=12):
    x0, y0 = int(point[0] - CROP[0]), int(point[1] - CROP[1])
    for radius_now in range(radius + 1):
        for dy in range(-radius_now, radius_now + 1):
            for dx in range(-radius_now, radius_now + 1):
                x, y = x0 + dx, y0 + dy
                if 0 <= x < nav_w and 0 <= y < nav_h and not wall_mask[y, x]:
                    return x, y
    return None


start = nearest_free(ROOM_POINTS["entry_circulation"])
visited = np.zeros_like(wall_mask, dtype=bool)
if start:
    queue = deque([start])
    visited[start[1], start[0]] = True
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < nav_w and 0 <= ny < nav_h and not wall_mask[ny, nx] and not visited[ny, nx]:
                visited[ny, nx] = True
                queue.append((nx, ny))

reachability = {}
for name, point in ROOM_POINTS.items():
    sample = nearest_free(point)
    reachability[name] = bool(sample and visited[sample[1], sample[0]])

validation = {
    # This lightweight raw-stream parser does not resolve the page/Form XObject
    # graph or resource-scoped OCG properties.  Its V02 output is retained only
    # as a rejected diagnostic artifact; never promote it to a baseline.
    "status": "REJECTED_PARSER_MISREGISTRATION",
    "rejection_reasons": [
        "Balcony paths are displaced from the left side to the right wet-core/kitchen area.",
        "Main-bath, WC and kitchen boundaries are incomplete or missing.",
        "Glazing paths cross the main-bath area.",
        "Five reviewed jamb spans align locally, but local checks do not validate the surrounding plan registration.",
    ],
    "source_pdf_rotation_degrees": 270,
    "page_landscape_points": [1191, 842],
    "source_pixel_mapping_at_360dpi": "1 PDF point = 5 raster pixels",
    "layers": {
        "walls": ["MUROS", "p-revoque"],
        "doors": ["Carpinterias PUERTAS", "p-puerta"],
        "glazing": ["CARPINTERIAS"],
    },
    "path_counts": {"walls": len(walls), "doors": len(doors), "glazing": len(glazing)},
    "critical_door_geometry": door_checks,
    "geometric_reachability_from_entry": reachability,
    "navigation_test": "Raster flood-fill of source vector wall/plaster paths with the five reviewed jamb spans cleared, then 9-point wall-band dilation; door symbols are not treated as barriers.",
    "limits": [
        "This reconstructs the developer vector plan, not a confirmed as-built survey.",
        "Flood-fill is a topology test, not a code-compliant clearance or accessibility analysis.",
        "Opening construction sizes and heights remain unmeasured.",
        "Architect proposal paths are excluded.",
    ],
}
validation_path = OUT / "step2_vector_validation.json"
validation_path.write_text(json.dumps(validation, indent=2), encoding="utf-8")

report = [
    "# Step 2 V02 - Vector-derived reconstruction and validation",
    "",
    f"Status: **{validation['status']}**. Independent overlay QA found gross plan misregistration; do not use this packet as geometry.",
    "",
    "The lightweight parser reads decoded streams independently and therefore loses the page-to-Form XObject transform/resource graph. The five reviewed opening spans remain useful local evidence, but they do not rescue the surrounding geometry.",
    "",
    "## Correction basis",
    "",
    "- The prior raster-inferred zone trace is retained as a rejected draft and is not used as geometric evidence.",
    "- Wall faces come directly from `MUROS` and `p-revoque` CAD layers.",
    "- Parsed door jambs, leaves and swing arcs come from `Carpinterias PUERTAS` and `p-puerta`; the five independently reviewed vector jamb spans are also applied explicitly because some nested-form paths are not exposed as standalone layer paths by the lightweight parser.",
    "- Those five spans are cross-checked against the PDF's final 360 dpi rendering, so hidden CAD construction paths do not masquerade as visible barriers.",
    "- Windows and glazing come directly from `CARPINTERIAS`.",
    "- The PDF page rotation of 270 degrees is applied before comparison to the rendered landscape page.",
    "- The balcony's source-vector slope is preserved; it is not orthogonalized.",
    "",
    "## Independently reviewed doorway geometry",
    "",
    "| Opening | Exact landscape-PDF jamb span (points) | Geometric check |",
    "| --- | --- | --- |",
]
for name, check in door_checks.items():
    r = check["rect_points"]
    report.append(f"| {name} | ({r[0]:.2f}, {r[1]:.2f}) to ({r[2]:.2f}, {r[3]:.2f}) | {check['status']}; core dark fraction {check['core_dark_fraction']:.3f}, jamb support {check['jamb_dark_pixels']}, nearby source pixels {check['nearby_source_dark_pixels']} |")
report += [
    "",
    "The main-bath entrance is on its upper/right bedroom-side boundary. The suite and bedroom entrances are vertical gaps flanking the central passage. The dressing and ensuite entrances are on their west dividers. No horizontal corridor-edge opening is invented.",
    "",
    "## Geometry tests",
    "",
    f"- Vector paths: {len(walls)} wall/plaster, {len(doors)} door, {len(glazing)} carpentry/glazing paths in the main-plan bounds.",
    "- Each reviewed jamb span is taken from vector endpoints, then checked at 5 pixels per point against the PDF's final rendered state: the shrunken core must remain mostly clear, both jamb ends must have visible support, and source drawing geometry must occur nearby.",
    "- Entry connectivity is tested by flood-filling free space derived from the source vector wall paths after clearing the five reviewed jamb spans and applying wall-band dilation.",
]
for name, reached in reachability.items():
    report.append(f"- `{name}` reachable from entry: **{'yes' if reached else 'no'}**")
report += [
    "",
    "## Limits",
    "",
]
report.extend(f"- {item}" for item in validation["limits"])
report += ["", "Step 2 stops at this corrected review packet. Do not begin 3D before review.", ""]
report_path = PROJECT / "STEP2_VECTOR_TRACE_REPORT.md"
report_path.write_text("\n".join(report), encoding="utf-8")

print(json.dumps({"clean": str(clean_path), "overlay": str(overlay_path), "validation": str(validation_path), "report": str(report_path), "status": validation["status"]}, sort_keys=True))
