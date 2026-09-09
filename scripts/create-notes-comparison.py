from pathlib import Path

from PIL import Image, ImageDraw


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = Path(r"D:\edge下载\ChatGPT Image 2026年7月17日 22_08_53.png")
IMPLEMENTATION_PATH = PROJECT_ROOT / "output" / "qa" / "notes-visual" / "implementation.png"
OUTPUT_PATH = PROJECT_ROOT / "output" / "qa" / "notes-visual" / "comparison.png"
REFERENCE_NORMALIZED_PATH = PROJECT_ROOT / "output" / "qa" / "notes-visual" / "reference-normalized.png"
IMPLEMENTATION_FLATTENED_PATH = PROJECT_ROOT / "output" / "qa" / "notes-visual" / "implementation-flattened.png"
EXACT_COMPARISON_PATH = PROJECT_ROOT / "output" / "qa" / "notes-visual" / "comparison-exact.png"
FOCUS_COMPARISON_PATH = PROJECT_ROOT / "output" / "qa" / "notes-visual" / "comparison-focus.png"


def contain(image: Image.Image, size: tuple[int, int]) -> Image.Image:
    copy = image.copy()
    copy.thumbnail(size, Image.Resampling.LANCZOS)
    result = Image.new("RGB", size, "#eef3fb")
    left = (size[0] - copy.width) // 2
    top = (size[1] - copy.height) // 2
    result.paste(copy, (left, top))
    return result


source = Image.open(SOURCE_PATH).convert("RGB")
implementation_source = Image.open(IMPLEMENTATION_PATH).convert("RGBA")
implementation_background = Image.new("RGBA", implementation_source.size, "#eef3fb")
implementation = Image.alpha_composite(implementation_background, implementation_source).convert("RGB")

# The supplied reference contains a Windows wallpaper around the centered widget.
source_widget = source.crop((402, 66, 1038, 1042))

panel_size = (600, 820)
header_height = 48
gap = 24
canvas = Image.new("RGB", (panel_size[0] * 2 + gap, panel_size[1] + header_height), "#dce6f3")
draw = ImageDraw.Draw(canvas)
draw.rectangle((0, 0, panel_size[0], header_height), fill="#f7f9fc")
draw.rectangle((panel_size[0] + gap, 0, canvas.width, header_height), fill="#f7f9fc")
draw.text((20, 16), "SOURCE REFERENCE", fill="#24324a")
draw.text((panel_size[0] + gap + 20, 16), "ELECTRON IMPLEMENTATION", fill="#24324a")
canvas.paste(contain(source_widget, panel_size), (0, header_height))
canvas.paste(contain(implementation, panel_size), (panel_size[0] + gap, header_height))

OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
canvas.save(OUTPUT_PATH, quality=96)
source_widget.save(REFERENCE_NORMALIZED_PATH, quality=96)
implementation.save(IMPLEMENTATION_FLATTENED_PATH, quality=96)

gap_color = "#dce6f3"
exact = Image.new("RGB", (636 * 2 + 24, 976), gap_color)
exact.paste(source_widget, (0, 0))
exact.paste(implementation, (660, 0))
exact.save(EXACT_COMPARISON_PATH, quality=96)

focus_box = (15, 10, 621, 250)
source_focus = source_widget.crop(focus_box).resize((1212, 480), Image.Resampling.LANCZOS)
implementation_focus = implementation.crop(focus_box).resize((1212, 480), Image.Resampling.LANCZOS)
focus = Image.new("RGB", (1212, 984), gap_color)
focus.paste(source_focus, (0, 0))
focus.paste(implementation_focus, (0, 504))
focus.save(FOCUS_COMPARISON_PATH, quality=96)

print(OUTPUT_PATH)
print(EXACT_COMPARISON_PATH)
print(FOCUS_COMPARISON_PATH)
