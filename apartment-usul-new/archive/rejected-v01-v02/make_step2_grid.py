from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


PROJECT = Path(__file__).resolve().parent
WORKSPACE = PROJECT.parent
SOURCE = WORKSPACE / "tmp" / "pdfs" / "hires" / "baseline.png"
OUT = WORKSPACE / "tmp" / "pdfs" / "step2_coordinate_grid.png"
CROP = (1050, 800, 5850, 3150)

image = Image.open(SOURCE).convert("RGB")
image = image.crop(CROP)
draw = ImageDraw.Draw(image, "RGBA")
try:
    font = ImageFont.truetype("C:/Windows/Fonts/consola.ttf", 24)
except OSError:
    font = ImageFont.truetype("DejaVuSansMono.ttf", 24)

for global_x in range(1100, 5900, 100):
    x = global_x - CROP[0]
    major = global_x % 500 == 0
    draw.line((x, 0, x, image.height), fill=(0, 110, 230, 120 if major else 45), width=3 if major else 1)
    if major:
        draw.text((x + 4, 5), str(global_x), fill=(0, 70, 170, 255), font=font)

for global_y in range(800, 3200, 100):
    y = global_y - CROP[1]
    major = global_y % 500 == 0
    draw.line((0, y, image.width, y), fill=(230, 80, 0, 120 if major else 45), width=3 if major else 1)
    if major:
        draw.text((4, y + 4), str(global_y), fill=(170, 45, 0, 255), font=font)

OUT.parent.mkdir(parents=True, exist_ok=True)
image.save(OUT, optimize=True)
print(OUT)
