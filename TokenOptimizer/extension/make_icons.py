"""Generate the extension's PNG icons (16/48/128). Run once; the PNGs are committed.

    python extension/make_icons.py
"""

from pathlib import Path

from PIL import Image, ImageDraw

BG = (79, 70, 229)  # indigo
FG = (255, 255, 255)
ICONS_DIR = Path(__file__).parent / "icons"


def rounded(size: int) -> Image.Image:
    # Supersample for smooth edges, then downscale.
    s = size * 4
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    radius = int(s * 0.22)
    d.rounded_rectangle([0, 0, s - 1, s - 1], radius=radius, fill=BG)

    # A downward arrow ("reduce"): vertical stem + chevron head.
    cx = s / 2
    stem_w = s * 0.10
    d.rectangle([cx - stem_w / 2, s * 0.26, cx + stem_w / 2, s * 0.60], fill=FG)
    d.polygon(
        [(cx - s * 0.20, s * 0.55), (cx + s * 0.20, s * 0.55), (cx, s * 0.78)],
        fill=FG,
    )
    return img.resize((size, size), Image.LANCZOS)


def main() -> None:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    for size in (16, 48, 128):
        rounded(size).save(ICONS_DIR / f"icon{size}.png")
        print("wrote", ICONS_DIR / f"icon{size}.png")


if __name__ == "__main__":
    main()
