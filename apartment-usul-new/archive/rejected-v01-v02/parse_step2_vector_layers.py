import json
import math
import re
from pathlib import Path

from PIL import Image, ImageDraw


PROJECT = Path(__file__).resolve().parent
STREAM_DIR = PROJECT.parent / "tmp" / "pdfs" / "decoded_vector_streams"
OUT_JSON = PROJECT / "step2_vector_layers.json"
OUT_PNG = PROJECT / "renders" / "step2_vector_layer_check.png"

LAYER_NAMES = {
    "oc10": "p-revoque",
    "oc11": "MUROS",
    "oc14": "Carpinterias PUERTAS",
    "oc16": "p-puerta",
    "oc20": "CARPINTERIAS",
    "oc25": "100-cotas",
}

TOKEN = re.compile(r"/[A-Za-z0-9._$-]+|\((?:\\.|[^\\)])*\)|-?\d+(?:\.\d+)?|[A-Za-z][A-Za-z0-9*']*|\*|'|\"")
PAINT = {"S", "s", "f", "F", "f*", "B", "B*", "b", "b*", "n"}


def mat_mul(a, b):
    aa, ab, ac, ad, ae, af = a
    ba, bb, bc, bd, be, bf = b
    return (
        aa * ba + ac * bb,
        ab * ba + ad * bb,
        aa * bc + ac * bd,
        ab * bc + ad * bd,
        aa * be + ac * bf + ae,
        ab * be + ad * bf + af,
    )


def apply(m, p):
    a, b, c, d, e, f = m
    x, y = p
    portrait = (a * x + c * y + e, b * x + d * y + f)
    return (portrait[1], 842.0 - portrait[0])


def bbox(commands):
    points = []
    for cmd in commands:
        for p in cmd[1:]:
            if isinstance(p, (list, tuple)) and len(p) == 2:
                points.append(p)
    if not points:
        return None
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs), min(ys), max(xs), max(ys)]


def parse(text, source_name):
    tokens = TOKEN.findall(text)
    operands = []
    ctm = (1, 0, 0, 1, 0, 0)
    width = 1.0
    layer = None
    marked_layers = []
    states = []
    current = []
    paths = []

    def flush(paint):
        nonlocal current
        if current:
            box = bbox(current)
            if box:
                paths.append({
                    "layer_id": layer,
                    "layer": LAYER_NAMES.get(layer, f"UNMAPPED:{layer or 'none'}"),
                    "commands": current,
                    "paint": paint,
                    "line_width": width,
                    "bbox": box,
                    "source": source_name,
                })
        current = []

    for token in tokens:
        try:
            operands.append(float(token))
            continue
        except ValueError:
            pass
        if token.startswith("/") or token.startswith("("):
            operands.append(token)
            continue
        if token == "q":
            states.append((ctm, width, layer))
            operands.clear()
        elif token == "Q":
            flush("n")
            if states:
                ctm, width, layer = states.pop()
            operands.clear()
        elif token == "cm" and len(operands) >= 6:
            values = tuple(float(x) for x in operands[-6:])
            ctm = mat_mul(ctm, values)
            operands.clear()
        elif token == "w" and operands:
            width = float(operands[-1])
            operands.clear()
        elif token == "BDC":
            names = [x[1:] for x in operands if isinstance(x, str) and x.startswith("/")]
            marked_layers.append(layer)
            if len(names) >= 2 and names[-1].startswith("oc"):
                layer = names[-1]
            operands.clear()
        elif token == "BMC":
            marked_layers.append(layer)
            operands.clear()
        elif token == "EMC":
            flush("n")
            layer = marked_layers.pop() if marked_layers else None
            operands.clear()
        elif token == "m" and len(operands) >= 2:
            current.append(["m", apply(ctm, operands[-2:])])
            operands.clear()
        elif token == "l" and len(operands) >= 2:
            current.append(["l", apply(ctm, operands[-2:])])
            operands.clear()
        elif token == "c" and len(operands) >= 6:
            values = operands[-6:]
            current.append(["c", apply(ctm, values[0:2]), apply(ctm, values[2:4]), apply(ctm, values[4:6])])
            operands.clear()
        elif token == "v" and len(operands) >= 4:
            values = operands[-4:]
            current.append(["v", apply(ctm, values[0:2]), apply(ctm, values[2:4])])
            operands.clear()
        elif token == "y" and len(operands) >= 4:
            values = operands[-4:]
            current.append(["y", apply(ctm, values[0:2]), apply(ctm, values[2:4])])
            operands.clear()
        elif token == "re" and len(operands) >= 4:
            x, y, w, h = operands[-4:]
            p1, p2, p3, p4 = apply(ctm, (x, y)), apply(ctm, (x + w, y)), apply(ctm, (x + w, y + h)), apply(ctm, (x, y + h))
            current += [["m", p1], ["l", p2], ["l", p3], ["l", p4], ["h"]]
            operands.clear()
        elif token == "h":
            current.append(["h"])
            operands.clear()
        elif token in PAINT:
            flush(token)
            operands.clear()
        else:
            operands.clear()
    flush("n")
    return paths


def cubic(p0, p1, p2, p3, steps=16):
    result = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        result.append((
            u**3 * p0[0] + 3 * u*u*t * p1[0] + 3 * u*t*t * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u*u*t * p1[1] + 3 * u*t*t * p2[1] + t**3 * p3[1],
        ))
    return result


all_paths = []
for path in sorted(STREAM_DIR.glob("object_*_stream_*.txt")):
    all_paths.extend(parse(path.read_text(encoding="latin1"), path.name))

main = [p for p in all_paths if p["bbox"][2] >= 180 and p["bbox"][0] <= 1120 and p["bbox"][3] >= 150 and p["bbox"][1] <= 720]
OUT_JSON.write_text(json.dumps({"page_landscape_points": [1191, 842], "paths": main}, indent=2), encoding="utf-8")

scale = 2
canvas = Image.new("RGB", (1191 * scale, 842 * scale), "white")
draw = ImageDraw.Draw(canvas)
colors = {
    "p-revoque": "#d84a34",
    "MUROS": "#222222",
    "Carpinterias PUERTAS": "#d07a19",
    "p-puerta": "#f0a133",
    "CARPINTERIAS": "#167ba8",
    "100-cotas": "#888888",
}

for path in main:
    points = []
    sub_start = None
    cursor = None
    for command in path["commands"]:
        op = command[0]
        if op == "m":
            if len(points) > 1:
                draw.line([(x * scale, y * scale) for x, y in points], fill=colors.get(path["layer"], "#cccccc"), width=max(1, round(path["line_width"] * 0.12 * scale)))
            cursor = tuple(command[1])
            sub_start = cursor
            points = [cursor]
        elif op == "l":
            cursor = tuple(command[1])
            points.append(cursor)
        elif op == "c" and cursor:
            curve = cubic(cursor, tuple(command[1]), tuple(command[2]), tuple(command[3]))
            points.extend(curve)
            cursor = tuple(command[3])
        elif op == "v" and cursor:
            curve = cubic(cursor, cursor, tuple(command[1]), tuple(command[2]))
            points.extend(curve)
            cursor = tuple(command[2])
        elif op == "y" and cursor:
            curve = cubic(cursor, tuple(command[1]), tuple(command[2]), tuple(command[2]))
            points.extend(curve)
            cursor = tuple(command[2])
        elif op == "h" and sub_start:
            points.append(sub_start)
            cursor = sub_start
    if len(points) > 1:
        draw.line([(x * scale, y * scale) for x, y in points], fill=colors.get(path["layer"], "#cccccc"), width=max(1, round(path["line_width"] * 0.12 * scale)))

OUT_PNG.parent.mkdir(parents=True, exist_ok=True)
canvas.save(OUT_PNG, optimize=True)

targets = {
    "suite_vertical": [563.8, 318.24, 570.04, 367.92],
    "bedroom_vertical": [626.44, 318.24, 633.28, 367.92],
    "main_bath_top": [801.88, 367.92, 851.56, 374.76],
    "dressing_west": [506.44, 230.16, 512.68, 285.60],
    "ensuite_west": [579.88, 235.92, 586.72, 285.60],
}

print(json.dumps({"all_layer_paths": len(all_paths), "main_paths": len(main), "layer_counts": {name: sum(p["layer"] == name for p in main) for name in colors}, "output_json": str(OUT_JSON), "output_png": str(OUT_PNG), "review_targets": targets}, indent=2))
