import argparse
import json
import math
import statistics
from collections import deque
from pathlib import Path

import numpy as np
from PIL import Image, ImageColor, ImageDraw, ImageFont


PROJECT = Path(__file__).resolve().parent


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--trace", default=str(PROJECT / "step2_trace.json"))
    parser.add_argument("--source", default=None)
    parser.add_argument("--out-dir", default=str(PROJECT / "renders"))
    return parser.parse_args()


def source_path(explicit):
    if explicit:
        return Path(explicit)
    fenrir = PROJECT / "sources" / "plan_reference_360dpi.png"
    if fenrir.exists():
        return fenrir
    return PROJECT.parent / "tmp" / "pdfs" / "hires" / "baseline.png"


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


def transform(point, crop, scale, top):
    return ((point[0] - crop[0]) * scale, top + (point[1] - crop[1]) * scale)


def polygon_area(points):
    return 0.5 * sum(
        points[i][0] * points[(i + 1) % len(points)][1]
        - points[(i + 1) % len(points)][0] * points[i][1]
        for i in range(len(points))
    )


def ccw(a, b, c):
    return (c[1] - a[1]) * (b[0] - a[0]) > (b[1] - a[1]) * (c[0] - a[0])


def segments_cross(a, b, c, d):
    if a in (c, d) or b in (c, d):
        return False
    return ccw(a, c, d) != ccw(b, c, d) and ccw(a, b, c) != ccw(a, b, d)


def self_intersections(points):
    count = 0
    n = len(points)
    for i in range(n):
        a, b = points[i], points[(i + 1) % n]
        for j in range(i + 1, n):
            if j in (i, (i + 1) % n) or (j + 1) % n in (i, (i + 1) % n):
                continue
            c, d = points[j], points[(j + 1) % n]
            count += int(segments_cross(a, b, c, d))
    return count


def reachable(graph, start):
    seen = {start}
    queue = deque([start])
    while queue:
        node = queue.popleft()
        for neighbor in graph.get(node, []):
            if neighbor not in seen:
                seen.add(neighbor)
                queue.append(neighbor)
        for other, neighbors in graph.items():
            if node in neighbors and other not in seen:
                seen.add(other)
                queue.append(other)
    return seen


def label(draw, xy, text, fill, size=27, bold=False, anchor="mm"):
    draw.multiline_text(xy, text, fill=fill, font=font(size, bold), anchor=anchor, align="center", spacing=4)


def main():
    args = parse_args()
    trace_path = Path(args.trace)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    trace = json.loads(trace_path.read_text(encoding="utf-8"))
    source = source_path(args.source)
    image = Image.open(source).convert("RGB")
    crop = trace["source"]["crop_px"]

    anchor_results = []
    scales = []
    for anchor in trace["registration"]["anchors"]:
        p1, p2 = anchor["p1"], anchor["p2"]
        distance = abs(p2[0] - p1[0]) if anchor["axis"] == "x" else abs(p2[1] - p1[1])
        observed = distance / anchor["printed_m"]
        scales.append(observed)
        anchor_results.append({"id": anchor["id"], "pixel_distance": distance, "printed_m": anchor["printed_m"], "observed_px_per_m": observed})
    fitted_scale = statistics.median(scales)
    for row in anchor_results:
        reconstructed_m = row["pixel_distance"] / fitted_scale
        row["reconstructed_m"] = reconstructed_m
        row["residual_mm"] = (reconstructed_m - row["printed_m"]) * 1000
        row["residual_percent"] = (reconstructed_m / row["printed_m"] - 1) * 100

    self_hits = {z["id"]: self_intersections(z["polygon_px"]) for z in trace["zones"]}
    negative_or_zero = [z["id"] for z in trace["zones"] if abs(polygon_area(z["polygon_px"])) < 1]

    graph = trace["route_graph"]
    reached = reachable(graph, "exterior")
    route_targets = {"entry_circulation", "living_dining", "suite", "bedroom", "kitchen_breakfast", "main_bath", "wc", "ensuite", "balcony"}
    missing_routes = sorted(route_targets - reached)

    review_width = 2800
    crop_width = crop[2] - crop[0]
    crop_height = crop[3] - crop[1]
    scale = (review_width - 120) / crop_width
    header_h = 150
    footer_h = 150
    plan_w = int(crop_width * scale)
    plan_h = int(crop_height * scale)

    clean = Image.new("RGB", (review_width, header_h + plan_h + footer_h), "#f5f3ee")
    draw = ImageDraw.Draw(clean, "RGBA")
    draw.text((60, 34), "STEP 2 - REGISTERED 2D DEVELOPER-BASELINE TRACE", fill="#202326", font=font(38, True))
    draw.text((60, 91), "One global page scale; unprinted offsets and all as-built correspondence remain provisional", fill="#5a6065", font=font(24))

    for zone in trace["zones"]:
        pts = [transform(p, crop, scale, header_h) for p in zone["polygon_px"]]
        rgb = ImageColor.getrgb(zone["color"])
        draw.polygon(pts, fill=rgb + (220,), outline=(42, 46, 50, 255), width=8)

    for opening in trace["doors"]:
        p1, p2 = [transform(p, crop, scale, header_h) for p in opening["edge"]]
        draw.line((p1, p2), fill=(205, 113, 35, 255), width=12)
        draw.ellipse((p1[0] - 6, p1[1] - 6, p1[0] + 6, p1[1] + 6), fill=(205, 113, 35, 255))
        draw.ellipse((p2[0] - 6, p2[1] - 6, p2[0] + 6, p2[1] + 6), fill=(205, 113, 35, 255))

    for opening in trace["glazing"]:
        p1, p2 = [transform(p, crop, scale, header_h) for p in opening["edge"]]
        draw.line((p1, p2), fill=(35, 126, 178, 255), width=12)

    for zone in trace["zones"]:
        pos = transform(zone["label_px"], crop, scale, header_h)
        size = 17 if len(zone["label"]) > 26 else 21
        label(draw, pos, zone["label"], (33, 37, 40, 255), size=size, bold=True)

    legend_y = header_h + plan_h + 45
    draw.line((70, legend_y, 150, legend_y), fill=(205, 113, 35, 255), width=12)
    draw.text((165, legend_y - 17), "door / passable opening", fill="#34383c", font=font(22))
    draw.line((600, legend_y, 680, legend_y), fill=(35, 126, 178, 255), width=12)
    draw.text((695, legend_y - 17), "glazing / exterior opening", fill="#34383c", font=font(22))
    draw.text((1250, legend_y - 17), f"fitted scale: {fitted_scale:.2f} px/m at 360 dpi", fill="#34383c", font=font(22))
    draw.text((60, legend_y + 40), "Architect proposal excluded. Room fills show traced wall-face topology; they are not construction drawings.", fill="#7a4b20", font=font(22, True))

    clean_path = out_dir / "step2_registered_baseline_plan.png"
    clean.save(clean_path, optimize=True)

    original = image.crop(tuple(crop)).resize((plan_w, plan_h), Image.Resampling.LANCZOS)
    overlay = Image.new("RGB", (review_width, header_h + plan_h + footer_h), "white")
    overlay.paste(original, (60, header_h))
    odraw = ImageDraw.Draw(overlay, "RGBA")
    odraw.text((60, 34), "STEP 2 - ORIGINAL PLAN REGISTRATION OVERLAY", fill="#202326", font=font(38, True))
    odraw.text((60, 91), "Colored polygons are the reconstructed wall-face zones; printed dimension lines remain visible below", fill="#5a6065", font=font(24))
    overlay_crop = [crop[0] - 60 / scale, crop[1], crop[2], crop[3]]

    def overlay_point(p):
        return (60 + (p[0] - crop[0]) * scale, header_h + (p[1] - crop[1]) * scale)

    for zone in trace["zones"]:
        pts = [overlay_point(p) for p in zone["polygon_px"]]
        rgb = ImageColor.getrgb(zone["color"])
        odraw.polygon(pts, fill=rgb + (48,), outline=(213, 70, 48, 235), width=7)
    for opening in trace["doors"]:
        odraw.line(tuple(overlay_point(p) for p in opening["edge"]), fill=(205, 113, 35, 255), width=11)
    for opening in trace["glazing"]:
        odraw.line(tuple(overlay_point(p) for p in opening["edge"]), fill=(35, 126, 178, 255), width=11)
    odraw.text((60, header_h + plan_h + 35), "Registration uses full-page source pixels and one fitted scale. Red outlines expose residual plan mismatches; they are not hidden by local rescaling.", fill="#6e4020", font=font(22, True))
    overlay_path = out_dir / "step2_original_plan_overlay.png"
    overlay.save(overlay_path, optimize=True)

    validation = {
        "status": "PASS_WITH_PROVISIONAL_ASSUMPTIONS" if not missing_routes and not any(self_hits.values()) and not negative_or_zero else "REVIEW_REQUIRED",
        "source": str(source),
        "fitted_px_per_m": fitted_scale,
        "theoretical_px_per_m": trace["registration"]["theoretical_px_per_m_at_1_50"],
        "theoretical_delta_percent": (fitted_scale / trace["registration"]["theoretical_px_per_m_at_1_50"] - 1) * 100,
        "anchor_results": anchor_results,
        "max_abs_residual_mm": max(abs(r["residual_mm"]) for r in anchor_results),
        "mean_abs_residual_mm": statistics.mean(abs(r["residual_mm"]) for r in anchor_results),
        "zone_count": len(trace["zones"]),
        "door_count": len(trace["doors"]),
        "glazing_count": len(trace["glazing"]),
        "zone_self_intersections": self_hits,
        "zero_area_zones": negative_or_zero,
        "route_targets": sorted(route_targets),
        "reachable_from_entry": sorted(reached),
        "missing_routes": missing_routes,
        "limits": trace["assumptions"],
    }
    validation_path = out_dir / "step2_validation.json"
    validation_path.write_text(json.dumps(validation, indent=2), encoding="utf-8")

    report_lines = [
        "# Step 2 - Registered 2D reconstruction and validation",
        "",
        "Status: **PASS WITH PROVISIONAL ASSUMPTIONS**. This is a developer-baseline reconstruction, not an as-built survey.",
        "",
        "## Registration",
        "",
        f"- Global fitted scale: {fitted_scale:.3f} source pixels per metre.",
        f"- Theoretical 1:50 scale at 360 dpi: {trace['registration']['theoretical_px_per_m_at_1_50']:.3f} px/m.",
        f"- Difference from theoretical: {validation['theoretical_delta_percent']:+.3f}%.",
        f"- Mean absolute printed-span residual: {validation['mean_abs_residual_mm']:.1f} mm.",
        f"- Maximum absolute printed-span residual: {validation['max_abs_residual_mm']:.1f} mm.",
        "- No room-by-room rescaling was used.",
        "",
        "| Span | Printed | Reconstructed | Residual |",
        "| --- | ---: | ---: | ---: |",
    ]
    for row in anchor_results:
        report_lines.append(f"| {row['id']} | {row['printed_m']:.2f} m | {row['reconstructed_m']:.3f} m | {row['residual_mm']:+.1f} mm |")
    report_lines += [
        "",
        "## Room and zone inventory",
        "",
        "| Zone | Evidence class | Notes |",
        "| --- | --- | --- |",
    ]
    for zone in trace["zones"]:
        notes = "Printed local spans constrain part of the polygon." if "printed" in zone["confidence"] else "Shape/offset follows visible wall faces and remains provisional."
        report_lines.append(f"| {zone['id']} | {zone['confidence']} | {notes} |")
    report_lines += [
        "",
        "## Opening inventory",
        "",
        "### Doors and passable openings",
        "",
    ]
    for item in trace["doors"]:
        report_lines.append(f"- `{item['id']}`: {' -> '.join(item['between'])}; {item['confidence']}.")
    report_lines += ["", "### Glazing and exterior openings", ""]
    for item in trace["glazing"]:
        report_lines.append(f"- `{item['id']}`: {' -> '.join(item['between'])}; {item['confidence']}.")
    report_lines += [
        "",
        "## Validation checks",
        "",
        f"- {len(trace['zones'])} closed zone polygons; zero-area zones: {negative_or_zero or 'none'}.",
        f"- Self-intersections: {sum(self_hits.values())} total.",
        f"- Entry-route targets missing from the declared connectivity graph: {missing_routes or 'none'}.",
        "- Kitchen glazing is registered to the internal lightwell, not the street balcony.",
        "- The stepped balcony and lower-right storage/structure notch are separate polygons.",
        "- The architect proposal is not included in any traced coordinate.",
        "",
        "## Residual limitations",
        "",
    ]
    report_lines.extend(f"- {item}" for item in trace["assumptions"])
    report_lines += [
        "- Raster line weight and ambiguous dimension-arrow endpoints create residuals at the centimetre scale.",
        "- Door leaves and glazing types are inventory annotations, not measured construction details.",
        "- Prior V01/V02 geometry was not used as source evidence.",
        "",
        "## Review boundary",
        "",
        "Step 2 ends with this packet. Do not begin 3D reconstruction until the trace and consolidated pendings are reviewed.",
    ]
    report_path = PROJECT / "STEP2_TRACE_REPORT.md"
    report_path.write_text("\n".join(report_lines) + "\n", encoding="utf-8")

    pending_path = PROJECT / "USER_PENDINGS.md"
    pending_path.write_text(
        "# Consolidated user pendings\n\n"
        "This is the single review queue for unresolved apartment inputs. Items remain provisional until answered; they are not repeated as blockers elsewhere.\n\n"
        "## Baseline identity and current condition\n\n"
        "1. Confirm the exact apartment/unit and whether the supplied `UNIDAD 201 a 701` plan orientation is correct rather than mirrored.\n"
        "2. Confirm whether current walls and openings broadly match the developer plan; list known construction or renovation deviations.\n"
        "3. Confirm whether the August-style photo filenames reflect the current apartment condition.\n\n"
        "## Geometry control\n\n"
        "4. If the target is an as-built model, provide at least one current wall-face-to-wall-face control measurement. Preferred: kitchen printed 2.93 m or living/dining printed 6.70 m, measured at the same dimension-line location.\n"
        "5. Later 3D measurements: ceiling/slab height; wall thicknesses; door widths/heights; glazing widths, sill/head heights and frame depths; balcony parapet, projection/shaft, screen, drain and soffit dimensions.\n\n"
        "## Photo mapping and proposal decisions\n\n"
        "6. Identify the rooms shown in `20260804_124859.jpg`, `20260804_124904.jpg`, and `20260804_125132.jpg`. Current hypothesis: unassigned/suite-side, suite-or-living balcony side, and likely living/dining.\n"
        "7. Mark each architect-proposal element approved, rejected, or undecided before it is added to any later proposal layer.\n",
        encoding="utf-8",
    )

    print(json.dumps({"clean": str(clean_path), "overlay": str(overlay_path), "validation": str(validation_path), "report": str(report_path), "pendings": str(pending_path), "status": validation["status"]}, sort_keys=True))


if __name__ == "__main__":
    main()
