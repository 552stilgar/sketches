"""Prepare source-derived Step 3 wall/floor masks from the accepted vector reference.

This is deliberately separate from Blender so topology checks and the exact mask used
for the shell can be reviewed without opening a .blend. It does not use V01/V02 data.
"""
from __future__ import annotations

import hashlib
import json
import math
from collections import deque
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "validated_source" / "source_vector_reference.json"
OUT_JSON = ROOT / "step3_geometry.json"
OUT_QA = ROOT / "renders" / "step3_geometry_mask_qa.png"

ROI = (220.0, 185.0, 1145.0, 585.0)
CELL_PT = 2.0
SCALE_M_PER_PT = 0.0254 * 50.0 / 72.0  # printed 1:50 plan
WALL_HEIGHT_M = 2.60  # provisional, reversible
SLAB_THICKNESS_M = 0.12  # provisional

ZONE_SEEDS = {
    "Z01_living_dining": (600.0, 500.0),
    "Z02_suite": (450.0, 280.0),
    "Z03_dressing": (540.0, 250.0),
    "Z04_ensuite": (690.0, 250.0),
    "Z05_central_passage": (610.0, 400.0),
    "Z06_bedroom": (760.0, 280.0),
    "Z07_main_bath": (825.0, 450.0),
    "Z08_wc": (890.0, 480.0),
    "Z09_entry": (850.0, 550.0),
    "Z10_kitchen": (1050.0, 500.0),
}
BALCONY_SEED = (275.0, 450.0)
BALCONY_STORAGE_SEED = (340.0, 555.0)


def pxy(p):
    return ((p[0] - ROI[0]) / CELL_PT, (p[1] - ROI[1]) / CELL_PT)


def sample_item(item):
    pts = item["points"]
    kind = item["kind"]
    if kind == "l":
        return [pts[0], pts[1]]
    if kind == "c":
        p0, p1, p2, p3 = pts
        out = []
        for i in range(25):
            t = i / 24
            u = 1 - t
            out.append([
                u**3*p0[0] + 3*u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
                u**3*p0[1] + 3*u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1],
            ])
        return out
    if kind == "qu":
        return [*pts, pts[0]]
    return []


def draw_paths(draw, paths, layers, width):
    for path in paths:
        if path["layer"] not in layers:
            continue
        for item in path["items"]:
            pts = sample_item(item)
            if len(pts) >= 2:
                draw.line([pxy(p) for p in pts], fill=255, width=width, joint="curve")


def flood(blocked, seed):
    w, h = blocked.size
    pix = blocked.load()
    sx, sy = (int((seed[0]-ROI[0])/CELL_PT), int((seed[1]-ROI[1])/CELL_PT))
    if not (0 <= sx < w and 0 <= sy < h) or pix[sx, sy]:
        raise RuntimeError(f"Seed {seed} lands on blocked/outside cell {(sx, sy)}")
    seen = bytearray(w*h)
    q = deque([(sx, sy)])
    seen[sy*w+sx] = 1
    while q:
        x, y = q.popleft()
        for nx, ny in ((x-1,y),(x+1,y),(x,y-1),(x,y+1)):
            if 0 <= nx < w and 0 <= ny < h:
                k = ny*w+nx
                if not seen[k] and not pix[nx,ny]:
                    seen[k] = 1
                    q.append((nx,ny))
    return seen


def rects_from_mask(mask_bytes, w, h):
    """Merge same horizontal cell runs on adjacent rows into rectangles."""
    active = {}
    result = []
    for y in range(h):
        runs = []
        x = 0
        while x < w:
            if mask_bytes[y*w+x]:
                x0 = x
                while x < w and mask_bytes[y*w+x]:
                    x += 1
                runs.append((x0, x))
            else:
                x += 1
        current = {}
        for run in runs:
            if run in active:
                x0, x1, y0, _ = active[run]
                current[run] = (x0, x1, y0, y+1)
            else:
                current[run] = (run[0], run[1], y, y+1)
        for run, rect in active.items():
            if run not in current:
                result.append(rect)
        active = current
    result.extend(active.values())
    return result


def main():
    data = json.loads(SOURCE.read_text(encoding="utf-8"))
    if data["source_sha256"] != "84f4cd1037c745215da6d1171d0f961aec916a81253ff09f36bc9db65eaea5f4":
        raise RuntimeError("Validated source hash identity changed")
    w = math.ceil((ROI[2]-ROI[0])/CELL_PT)
    h = math.ceil((ROI[3]-ROI[1])/CELL_PT)

    wall_line = Image.new("L", (w,h), 0)
    draw_paths(ImageDraw.Draw(wall_line), data["paths"], {"MUROS", "p-revoque"}, 1)
    # Close the paired wall-face lines into a reviewable provisional solid footprint.
    wall_mask = wall_line.filter(ImageFilter.MaxFilter(5))

    # Re-open only source-reviewed internal portals after morphological closure.
    # This prevents the provisional solidification step from bridging real jamb gaps.
    portal_boxes = {
        "DR01_suite": (561.0,316.0,572.0,370.0),
        "DR02_bedroom": (624.0,316.0,635.0,370.0),
        "DR03_bedroom_main_bath": (799.0,365.0,854.0,377.0),
        "DR04_dressing_ensuite": (577.0,233.0,589.0,288.0),
        "OP01_suite_dressing": (504.0,228.0,515.0,288.0),
        "DR05_entry_wc": (862.0,468.0,901.0,474.0),
        "OP02_living_passage": (568.0,365.0,629.0,374.0),
    }
    wm_draw = ImageDraw.Draw(wall_mask)
    for box in portal_boxes.values():
        wm_draw.rectangle([pxy((box[0],box[1])),pxy((box[2],box[3]))],fill=0)

    enclosure = wall_mask.copy()
    enc_draw = ImageDraw.Draw(enclosure)
    draw_paths(enc_draw, data["paths"], {"CARPINTERIAS", "p-puerta"}, 2)
    # Temporarily close only the two doors to EX01 for interior flood validation.
    enc_draw.line([pxy((763.51,573.29)), pxy((814.26,573.29))], fill=255, width=3)
    enc_draw.line([pxy((924.52,570.72)), pxy((969.76,570.72))], fill=255, width=3)
    enclosure = enclosure.filter(ImageFilter.MaxFilter(3))

    interior = flood(enclosure, ZONE_SEEDS["Z01_living_dining"])
    balcony_open = flood(enclosure, BALCONY_SEED)
    balcony_storage = flood(enclosure, BALCONY_STORAGE_SEED)
    balcony = bytearray(1 if balcony_open[i] or balcony_storage[i] else 0 for i in range(w*h))
    total = w*h
    interior_n = sum(interior)
    balcony_n = sum(balcony)
    if interior_n > total*0.65 or balcony_n > total*0.35:
        raise RuntimeError(f"Flood leaked: interior={interior_n}/{total}, balcony={balcony_n}/{total}")

    reachability = {}
    for name, seed in ZONE_SEEDS.items():
        sx, sy = int((seed[0]-ROI[0])/CELL_PT), int((seed[1]-ROI[1])/CELL_PT)
        reachability[name] = bool(interior[sy*w+sx])

    wall_pix = wall_mask.load()
    wall_bytes = bytearray(w*h)
    for y in range(h):
        for x in range(w):
            wall_bytes[y*w+x] = 1 if wall_pix[x,y] else 0

    payload = {
        "source_sha256": data["source_sha256"],
        "coordinate_frame": data["coordinate_frame"],
        "roi_pdf_points": ROI,
        "cell_pdf_points": CELL_PT,
        "scale_m_per_pdf_point": SCALE_M_PER_PT,
        "defaults_provisional": {
            "wall_height_m": WALL_HEIGHT_M,
            "slab_thickness_m": SLAB_THICKNESS_M,
            "full_height_glazing_head_m": 2.35,
            "lightwell_window_sill_m": 0.90,
            "lightwell_window_head_m": 2.10,
            "door_height_m": 2.10,
        },
        "mask_size_cells": [w,h],
        "wall_rects_cells": rects_from_mask(wall_bytes,w,h),
        "interior_floor_rects_cells": rects_from_mask(interior,w,h),
        "balcony_floor_rects_cells": rects_from_mask(balcony,w,h),
        "reachability_from_living_seed": reachability,
        "counts": {
            "source_paths": len(data["paths"]),
            "wall_plaster_paths": sum(1 for p in data["paths"] if p["layer"] in {"MUROS","p-revoque"}),
            "wall_cells": sum(wall_bytes),
            "interior_floor_cells": interior_n,
            "balcony_floor_cells": balcony_n,
        },
        "opening_inventory_source": "STEP2_ROOM_OPENING_INVENTORY.md",
        "source_reviewed_portal_clearances_pdf_points": portal_boxes,
        "limitations": [
            "Developer reference plan, not verified as-built.",
            "Wall solids are a 2 PDF-point rasterization of source wall-face paths with a reversible morphological closure; construction build-ups remain provisional.",
            "Flood reachability proves continuity in this derived 2D mask only; it is not accessibility or code compliance certification.",
            "Exterior entry/service doors are temporarily closed only for interior-region flood extraction.",
        ],
    }
    # Keep the committed geometry byte-identical across Windows and Linux.
    with OUT_JSON.open("w", encoding="utf-8", newline="\n") as stream:
        stream.write(json.dumps(payload, indent=2))
        stream.write("\n")

    qa = Image.new("RGB", (w,h), (244,242,236))
    qp = qa.load()
    for y in range(h):
        for x in range(w):
            k=y*w+x
            if balcony[k]: qp[x,y]=(202,220,232)
            if interior[k]: qp[x,y]=(222,231,218)
            if wall_bytes[k]: qp[x,y]=(42,48,52)
    qd=ImageDraw.Draw(qa)
    for name,seed in ZONE_SEEDS.items():
        sx,sy=pxy(seed); qd.ellipse((sx-2,sy-2,sx+2,sy+2),fill=(36,132,84))
    for seed in (BALCONY_SEED,BALCONY_STORAGE_SEED):
        sx,sy=pxy(seed); qd.ellipse((sx-2,sy-2,sx+2,sy+2),fill=(36,92,155))
    OUT_QA.parent.mkdir(parents=True,exist_ok=True)
    qa.resize((w*3,h*3),Image.Resampling.NEAREST).save(OUT_QA)
    print(json.dumps({"json":str(OUT_JSON),"qa":str(OUT_QA),"counts":payload["counts"],"reachability":reachability},indent=2))


if __name__ == "__main__":
    main()
