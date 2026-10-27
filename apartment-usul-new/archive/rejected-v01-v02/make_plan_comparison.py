import argparse
from pathlib import Path
from PIL import Image, ImageChops, ImageDraw, ImageEnhance, ImageOps


def fit(im, size, background):
    out = Image.new("RGB", size, background)
    copy = im.convert("RGB")
    copy.thumbnail((size[0] - 40, size[1] - 70), Image.Resampling.LANCZOS)
    out.paste(copy, ((size[0] - copy.width) // 2, 50 + (size[1] - 70 - copy.height) // 2))
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--plan", required=True)
    parser.add_argument("--model", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    plan = Image.open(args.plan).convert("RGB")
    # Tight page-space crop of the developer baseline plan at 360 dpi.
    plan = plan.crop((850, 900, 5750, 3560))
    model = Image.open(args.model).convert("RGB")
    panel_size = (1400, 950)
    left = fit(plan, panel_size, "white")
    right = fit(model, panel_size, (42, 44, 48))

    overlay_plan = ImageOps.grayscale(plan)
    overlay_plan = ImageEnhance.Contrast(overlay_plan).enhance(1.8).convert("RGB")
    overlay_plan = fit(overlay_plan, panel_size, "white")
    overlay_model = fit(model, panel_size, "white")
    overlay = Image.blend(overlay_plan, overlay_model, 0.45)

    canvas = Image.new("RGB", (panel_size[0] * 3, panel_size[1] + 70), "white")
    canvas.paste(left, (0, 70))
    canvas.paste(right, (panel_size[0], 70))
    canvas.paste(overlay, (panel_size[0] * 2, 70))
    draw = ImageDraw.Draw(canvas)
    draw.text((30, 24), "DEVELOPER PLAN - PRINTED DIMENSIONS", fill="black")
    draw.text((panel_size[0] + 30, 24), "V02 TOPOLOGY TRACE", fill="black")
    draw.text((panel_size[0] * 2 + 30, 24), "VISUAL OVERLAY - UNPRINTED OFFSETS PROVISIONAL", fill="black")
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    canvas.save(out)


if __name__ == "__main__":
    main()
