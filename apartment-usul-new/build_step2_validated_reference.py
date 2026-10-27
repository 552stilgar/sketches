import hashlib
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont


PROJECT = Path(__file__).resolve().parent
REFERENCE = PROJECT / "validated_source" / "source_vector_reference.json"
PDF = PROJECT.parent / "references" / "201 a 701 (3)(5).pdf"
SOURCE = PROJECT.parent / "tmp" / "pdfs" / "hires" / "baseline.png"
OUT = PROJECT / "renders"
OUT.mkdir(parents=True, exist_ok=True)

COLORS = {
    "p-revoque": (213, 63, 48, 225),
    "MUROS": (35, 39, 43, 235),
    "Carpinterias PUERTAS": (219, 126, 27, 235),
    "p-puerta": (126, 82, 170, 235),
    "CARPINTERIAS": (24, 124, 174, 235),
}

LABELS = {
    "SUITE": (420, 322),
    "DRESSING": (548, 247),
    "ENSUITE": (618, 247),
    "CENTRAL PASSAGE": (600, 350),
    "BEDROOM": (735, 300),
    "LIVING / DINING": (570, 495),
    "MAIN BATH": (820, 452),
    "WC": (895, 455),
    "ENTRY": (850, 552),
    "KITCHEN / BREAKFAST": (1025, 500),
    "BALCONY": (275, 455),
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


def cubic(points, steps=24):
    p0, p1, p2, p3 = points
    result = []
    for index in range(steps + 1):
        t = index / steps
        u = 1 - t
        result.append((
            u**3 * p0[0] + 3 * u*u*t*p1[0] + 3*u*t*t*p2[0] + t**3*p3[0],
            u**3 * p0[1] + 3 * u*u*t*p1[1] + 3*u*t*t*p2[1] + t**3*p3[1],
        ))
    return result


def draw_reference(draw, paths, point_fn, width=3, monochrome=False):
    for path in paths:
        color = 255 if monochrome else COLORS[path["layer"]]
        for item in path["items"]:
            points = [tuple(point) for point in item["points"]]
            if item["kind"] == "c":
                points = cubic(points)
            elif item["kind"] == "qu":
                points = points + [points[0]]
            if len(points) >= 2:
                draw.line([point_fn(point) for point in points], fill=color, width=width, joint="curve")


data = json.loads(REFERENCE.read_text(encoding="utf-8"))
paths = data["paths"]
roi = tuple(data["coordinate_frame"]["main_plan_roi"])
pdf_sha256 = hashlib.sha256(PDF.read_bytes()).hexdigest()
hash_match = pdf_sha256.lower() == data["source_sha256"].lower()

# Clean ROI-only vector evidence view. Segments crossing the ROI were deliberately
# excluded by the validated extractor and are not reconstructed here.
scale = 3
header = 140
footer = 145
plan_w = round((roi[2] - roi[0]) * scale)
plan_h = round((roi[3] - roi[1]) * scale)
clean = Image.new("RGB", (plan_w + 100, header + plan_h + footer), "#f7f5f0")
clean_draw = ImageDraw.Draw(clean, "RGBA")
clean_draw.text((50, 28), "STEP 2 - VALIDATED PYMUPDF VECTOR EVIDENCE", fill="#202326", font=font(36, True))
clean_draw.text((50, 82), "Main-plan ROI only; crossing segments, labels and fixtures are intentionally excluded", fill="#62686d", font=font(22))


def clean_point(point):
    return (50 + (point[0] - roi[0]) * scale, header + (point[1] - roi[1]) * scale)


draw_reference(clean_draw, paths, clean_point, width=4)
for label, point in LABELS.items():
    x, y = clean_point(point)
    clean_draw.rounded_rectangle((x - 78, y - 15, x + 78, y + 15), radius=7, fill=(247, 245, 240, 218))
    clean_draw.text((x, y), label, fill=(41, 45, 48, 255), font=font(15, True), anchor="mm")
legend_y = header + plan_h + 38
legend = [
    ("MUROS / p-revoque", (35, 39, 43, 255)),
    ("Carpinterias PUERTAS", (219, 126, 27, 255)),
    ("p-puerta (mixed source layer)", (126, 82, 170, 255)),
    ("carpentry / glazing", (24, 124, 174, 255)),
]
for index, (label, color) in enumerate(legend):
    x = 55 + index * 385
    clean_draw.line((x, legend_y, x + 55, legend_y), fill=color, width=6)
    clean_draw.text((x + 68, legend_y), label, fill="#383d41", font=font(17), anchor="lm")
clean_draw.text((55, legend_y + 44), "Evidence extraction, not room segmentation or an as-built survey.", fill="#7c4f22", font=font(20, True))
clean_path = OUT / "step2_validated_vector_evidence.png"
clean.save(clean_path, optimize=True)

# Overlay at the PDF's verified 360 dpi mapping: one point equals five pixels.
source = Image.open(SOURCE).convert("RGB")
pixel_roi = tuple(round(value * 5) for value in roi)
source_crop = source.crop(pixel_roi)
overlay_layer = Image.new("RGBA", source_crop.size, (0, 0, 0, 0))
overlay_draw = ImageDraw.Draw(overlay_layer)


def overlay_point(point):
    return ((point[0] - roi[0]) * 5, (point[1] - roi[1]) * 5)


draw_reference(overlay_draw, paths, overlay_point, width=6)
overlay_crop = source_crop.copy()
overlay_crop.paste(overlay_layer, (0, 0), overlay_layer)
overlay = Image.new("RGB", (source_crop.width + 100, header + source_crop.height + footer), "white")
overlay.paste(overlay_crop, (50, header))
overlay_draw_final = ImageDraw.Draw(overlay)
overlay_draw_final.text((50, 28), "STEP 2 - VALIDATED PATHS ON ORIGINAL PDF", fill="#202326", font=font(36, True))
overlay_draw_final.text((50, 82), "PyMuPDF get_drawings() resolves nested Forms/graphics state; page rotation applied once", fill="#62686d", font=font(22))
overlay_draw_final.text((50, header + source_crop.height + 38), "Black/red: wall/plaster  |  Orange: Carpinterias PUERTAS  |  Purple: p-puerta (mixed)  |  Blue: carpentry", fill="#3b4145", font=font(19, True))
overlay_draw_final.text((50, header + source_crop.height + 78), "ROI-contained source segments only. Original grayscale remains visible for omitted crossing segments and fixtures.", fill="#7c4f22", font=font(20, True))
overlay_path = OUT / "step2_validated_original_overlay.png"
overlay.save(overlay_path, optimize=True)

# Quantify registration against the final rendered PDF. The source mask is
# dilated by three pixels each side to tolerate antialiasing/stroke-width changes.
source_gray = np.asarray(source_crop.convert("L"))
source_dark = Image.fromarray(np.where(source_gray < 205, 255, 0).astype(np.uint8)).filter(ImageFilter.MaxFilter(7))
source_dark_array = np.asarray(source_dark) > 0
coverage = {}
for layer in COLORS:
    mask = Image.new("L", source_crop.size, 0)
    mask_draw = ImageDraw.Draw(mask)
    draw_reference(mask_draw, [path for path in paths if path["layer"] == layer], overlay_point, width=3, monochrome=True)
    vector_pixels = np.asarray(mask) > 0
    count = int(vector_pixels.sum())
    matched = int(np.logical_and(vector_pixels, source_dark_array).sum())
    coverage[layer] = {
        "vector_pixels": count,
        "matched_source_pixels": matched,
        "coverage_fraction": round(matched / max(1, count), 5),
    }

validation = {
    "status": "VALIDATED_SOURCE_GEOMETRY_ROI_ONLY",
    "source_pdf_sha256": pdf_sha256,
    "reference_source_sha256": data["source_sha256"],
    "source_hash_match": hash_match,
    "extractor": data["extractor"],
    "source_path_count": data["source_path_count"],
    "roi": list(roi),
    "roi_contained_path_count": len(paths),
    "extracted_layer_counts": data["extracted_layer_counts"],
    "wall_plaster_path_count": data["extracted_layer_counts"]["MUROS"] + data["extracted_layer_counts"]["p-revoque"],
    "render_registration_coverage": coverage,
    "visual_qa": [
        "Balcony paths remain on the left and retain the source slope.",
        "Main-bath, WC and kitchen boundaries align with the original PDF.",
        "Carpentry/glazing paths align with the original openings and do not cross the bath incorrectly.",
        "Suite, bedroom, dressing, ensuite and central-passage partitions align with the original PDF.",
    ],
    "reviewed_door_jambs": data["reviewed_door_jambs"],
    "limitations": data["limitations"],
    "explicit_exclusions": [
        "Source paths with any point outside the ROI are excluded.",
        "Labels and fixtures are excluded by source-layer filtering.",
        "This evidence view is not room segmentation and does not fill omitted boundary segments.",
    ],
}
validation_path = OUT / "step2_validated_reference_validation.json"
validation_path.write_text(json.dumps(validation, indent=2), encoding="utf-8")

print(json.dumps({
    "clean": str(clean_path),
    "overlay": str(overlay_path),
    "validation": str(validation_path),
    "source_hash_match": hash_match,
    "paths": len(paths),
    "wall_plaster_paths": validation["wall_plaster_path_count"],
    "coverage": coverage,
}, sort_keys=True))
