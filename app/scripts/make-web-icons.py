"""Draws the Scenic Stroll web icons (install icon, Apple home-screen icon, favicon) and the
share image that WhatsApp/Instagram/X show for a link (public/og-image.png, 1200x630).

Placeholder art until the team has a designed logo: a winding white path ending in a map pin on
our green. The template's icon in assets/images/icon.png is Expo's logo, so we don't reuse it
(DECISIONS D45). Only run this when the icon changes; the PNGs are committed.

    python scripts/make-web-icons.py      (from app/, needs Pillow: pip install pillow)
"""

import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

GREEN = (0x1B, 0xA1, 0x36)  # theme colour from the launch brief
DARK_GREEN = (0x0B, 0x2A, 0x18)
WHITE = (255, 255, 255)
SIZE = 2048  # draw big, then shrink: smooth edges without an anti-aliasing library

APP = Path(__file__).resolve().parent.parent
OUT = APP / "public" / "icons"


def bezier(p0, p1, p2, p3, steps=400):
    """Points along a cubic curve (the winding path)."""
    for i in range(steps + 1):
        t = i / steps
        u = 1 - t
        yield (
            u**3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t**3 * p3[0],
            u**3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t**3 * p3[1],
        )


def draw_icon() -> Image.Image:
    img = Image.new("RGB", (SIZE, SIZE), GREEN)
    d = ImageDraw.Draw(img)
    s = SIZE / 100  # work in a 0..100 grid

    # Everything stays inside the middle 60% so Android's round/squircle masks never cut it
    # ("maskable" safe zone is a circle of 80% diameter).
    path = list(bezier((32 * s, 76 * s), (74 * s, 74 * s), (28 * s, 48 * s), (62 * s, 48 * s)))
    width = 7 * s
    for x, y in path:  # a thick line = many overlapping dots
        d.ellipse((x - width / 2, y - width / 2, x + width / 2, y + width / 2), fill=WHITE)

    # Map pin whose tip sits on the end of the path: a circle with a point at the bottom.
    cx, cy, r = 62 * s, 29 * s, 10 * s
    d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=WHITE)
    tip_y = cy + r * 1.9
    a = math.radians(40)
    d.polygon(
        [
            (cx - r * math.cos(a), cy + r * math.sin(a)),
            (cx + r * math.cos(a), cy + r * math.sin(a)),
            (cx, tip_y),
        ],
        fill=WHITE,
    )
    hole = r * 0.42
    d.ellipse((cx - hole, cy - hole, cx + hole, cy + hole), fill=DARK_GREEN)
    return img


def font(size: int, bold: bool = False) -> ImageFont.ImageFont:
    """Segoe UI on Windows, DejaVu on Linux/macOS, else Pillow's built-in font."""
    names = ["segoeuib.ttf", "DejaVuSans-Bold.ttf"] if bold else ["segoeui.ttf", "DejaVuSans.ttf"]
    for name in names:
        for folder in ["C:/Windows/Fonts", "/usr/share/fonts/truetype/dejavu", "/Library/Fonts"]:
            try:
                return ImageFont.truetype(f"{folder}/{name}", size)
            except OSError:
                pass
    return ImageFont.load_default(size)


def draw_share_image(icon: Image.Image) -> Image.Image:
    """1200x630: icon on the left, name and what it does on the right, on the dark green."""
    img = Image.new("RGB", (1200, 630), DARK_GREEN)
    d = ImageDraw.Draw(img)
    img.paste(icon.resize((300, 300), Image.LANCZOS), (110, 165))
    d.text((470, 175), "Scenic Stroll", font=font(84, bold=True), fill=WHITE)
    lines = ["Shaded, sheltered and step-free", "walking routes in Hong Kong"]
    for i, line in enumerate(lines):
        d.text((474, 300 + i * 56), line, font=font(44), fill=(0xC4, 0xD4, 0xC8))
    d.text((474, 440), "Beta · CityU · Kowloon Tong · Festival Walk", font=font(32), fill=GREEN)
    return img


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    big = draw_icon()
    for name, px in [
        ("icon-192.png", 192),
        ("icon-512.png", 512),
        ("icon-maskable-512.png", 512),  # same art: it already fits the safe zone
        ("apple-touch-icon.png", 180),  # iPhone home screen (iOS rounds the corners itself)
    ]:
        big.resize((px, px), Image.LANCZOS).save(OUT / name, optimize=True)
    big.resize((48, 48), Image.LANCZOS).save(APP / "assets" / "images" / "favicon.png", optimize=True)
    draw_share_image(big).save(APP / "public" / "og-image.png", optimize=True)
    print(f"wrote icons to {OUT} and assets/images/favicon.png")


if __name__ == "__main__":
    main()
