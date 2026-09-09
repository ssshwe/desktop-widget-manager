from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BEFORE_PATH = Path(r"C:\Users\ADMINI~1\AppData\Local\Temp\codex-clipboard-90bee842-71aa-43c5-9ef5-4df4ba04efd0.png")
AFTER_PATH = PROJECT_ROOT / "output" / "qa" / "notes-initial-size" / "implementation.png"
OUTPUT_PATH = PROJECT_ROOT / "output" / "qa" / "notes-initial-size" / "before-after.png"

before = Image.open(BEFORE_PATH).convert("RGB")
after = Image.open(AFTER_PATH).convert("RGB")
label_height = 34
gap = 18
canvas = Image.new(
    "RGB",
    (before.width + gap + after.width, max(before.height, after.height) + label_height),
    "#dfe8f4",
)
canvas.paste(before, (0, label_height))
canvas.paste(after, (before.width + gap, label_height))

draw = ImageDraw.Draw(canvas)
font = ImageFont.load_default()
draw.text((12, 11), f"Before  {before.width} x {before.height}", fill="#26354d", font=font)
draw.text(
    (before.width + gap + 12, 11),
    f"After  {after.width} x {after.height}",
    fill="#26354d",
    font=font,
)
canvas.save(OUTPUT_PATH, quality=96)
print(OUTPUT_PATH)
