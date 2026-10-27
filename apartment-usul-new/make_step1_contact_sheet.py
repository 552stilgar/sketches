from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps


PROJECT = Path(__file__).resolve().parent
LOCAL_WORKSPACE = PROJECT.parent
if (PROJECT / "sources").exists():
    REF = PROJECT / "sources"
    BASELINE_PREVIEW = REF / "plan_reference_360dpi.png"
else:
    REF = LOCAL_WORKSPACE / "references"
    BASELINE_PREVIEW = LOCAL_WORKSPACE / "tmp" / "pdfs" / "hires" / "baseline.png"
OUT = PROJECT / "renders" / "step1_source_contact_sheet.png"

SOURCES = [
    (BASELINE_PREVIEW, "01  Developer baseline PDF", "DIMENSIONED - NOT AS-BUILT"),
    (REF / "image(20261026-222606).png", "02  Architect proposal", "DESIGN INTENT - UNDIMENSIONED"),
    (REF / "20260804_124859.jpg", "03  124859", "UNASSIGNED ROOM - LOW CONFIDENCE"),
    (REF / "20260804_124904.jpg", "04  124904", "BALCONY-SIDE ROOM - MEDIUM-LOW"),
    (REF / "20260804_125132.jpg", "05  125132", "LIKELY LIVING / BALCONY - MEDIUM"),
    (REF / "20260804_125206.jpg", "06  125206", "KITCHEN TALL-UNIT NICHE - HIGH"),
    (REF / "20260804_125211.jpg", "07  125211", "KITCHEN WORKTOP CORNER - HIGH"),
    (REF / "20260804_125219.jpg", "08  125219", "KITCHEN SINK / LIGHTWELL - HIGH"),
    (REF / "20260804_125223.jpg", "09  125223", "KITCHEN LIGHTWELL GLAZING - HIGH"),
    (REF / "20260804_125227.jpg", "10  125227", "BESIDE KITCHEN LIGHTWELL - MEDIUM-HIGH"),
    (REF / "20260804_125523.jpg", "11  125523", "STREET BALCONY - HIGH"),
    (REF / "20260804_125538.jpg", "12  125538", "STREET BALCONY REVERSE - HIGH"),
]

PAGE_W = 2000
MARGIN = 70
GAP = 34
HEADER_H = 180
CELL_W = (PAGE_W - MARGIN * 2 - GAP) // 2
IMAGE_H = 570
LABEL_H = 92
CELL_H = IMAGE_H + LABEL_H
ROWS = (len(SOURCES) + 1) // 2
PAGE_H = HEADER_H + MARGIN + ROWS * CELL_H + (ROWS - 1) * GAP + MARGIN


def font(size: int, bold: bool = False):
    name = "segoeuib.ttf" if bold else "segoeui.ttf"
    path = Path("C:/Windows/Fonts") / name
    if path.exists():
        return ImageFont.truetype(str(path), size)
    try:
        return ImageFont.truetype("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf", size)
    except OSError:
        return ImageFont.load_default()


canvas = Image.new("RGB", (PAGE_W, PAGE_H), "#f3f1ed")
draw = ImageDraw.Draw(canvas)
draw.text((MARGIN, 54), "Apartment source contact sheet - Step 1", fill="#202327", font=font(42, True))
draw.text(
    (MARGIN, 112),
    "Location labels are evidence-based hypotheses, not geometry. Confirm ambiguous rooms before Stage 2.",
    fill="#555b61",
    font=font(24),
)

for index, (path, title, subtitle) in enumerate(SOURCES):
    col = index % 2
    row = index // 2
    x = MARGIN + col * (CELL_W + GAP)
    y = HEADER_H + row * (CELL_H + GAP)
    draw.rounded_rectangle((x, y, x + CELL_W, y + CELL_H), radius=12, fill="white", outline="#c8c4bd", width=2)
    with Image.open(path) as source:
        source = ImageOps.exif_transpose(source).convert("RGB")
        thumb = ImageOps.contain(source, (CELL_W - 24, IMAGE_H - 24), method=Image.Resampling.LANCZOS)
    tx = x + (CELL_W - thumb.width) // 2
    ty = y + (IMAGE_H - thumb.height) // 2
    canvas.paste(thumb, (tx, ty))
    draw.line((x, y + IMAGE_H, x + CELL_W, y + IMAGE_H), fill="#ddd9d1", width=2)
    draw.text((x + 18, y + IMAGE_H + 10), title, fill="#202327", font=font(24, True))
    draw.text((x + 18, y + IMAGE_H + 48), subtitle, fill="#8a5a2b", font=font(18, True))

OUT.parent.mkdir(parents=True, exist_ok=True)
canvas.save(OUT, optimize=True)
print(OUT)
