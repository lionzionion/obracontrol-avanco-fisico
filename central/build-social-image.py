#!/usr/bin/env python3
"""Create a branded Open Graph JPEG for the RL Central.

Reads the official RL logo asset used by the RL Pedidos app; does not
read private operational data or require any Supabase credentials.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import sys

if len(sys.argv) != 3:
    raise SystemExit("Usage: build-social-image.py <logo.webp> <output.jpg>")

source = Path(sys.argv[1])
destination = Path(sys.argv[2])
if not source.is_file():
    raise SystemExit(f"Official RL logo file not found: {source}")

logo = Image.open(source).convert("RGBA")
alpha = logo.getchannel("A")
bbox = alpha.point(lambda value: 255 if value >= 16 else 0).getbbox()
if bbox:
    logo = logo.crop(bbox)
logo.thumbnail((1000, 315), Image.Resampling.LANCZOS)

width, height = 1200, 630
canvas = Image.new("RGB", (width, height), (7, 24, 38))
painter = ImageDraw.Draw(canvas)
for y in range(height):
    strength = y / height
    painter.line((0, y, width, y), fill=(int(7 + 9*strength), int(24+13*strength), int(38+14*strength)))
painter.rounded_rectangle((42, 54, 1158, 574), radius=28, fill=(10, 37, 54), outline=(46, 84, 96), width=2)
painter.rounded_rectangle((42, 54, 1158, 68), radius=6, fill=(126, 185, 64))
canvas.paste(logo, ((width - logo.width)//2, 120 + (315-logo.height)//2), logo)
painter.line((90, 442, 1110, 442), fill=(57, 90, 98), width=2)
bold_font = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
regular_font = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
if not Path(bold_font).is_file() or not Path(regular_font).is_file():
    raise SystemExit("Required system font is unavailable")
bold = ImageFont.truetype(bold_font, 35)
regular = ImageFont.truetype(regular_font, 23)
def center(text, font, y, color):
    box = painter.textbbox((0, 0), text, font=font)
    painter.text(((width - (box[2] - box[0]))/2, y), text, font=font, fill=color)

center("CENTRAL DE CONTROLE DE OBRAS", bold, 468, (238, 246, 249))
center("AMBEV  •  ITAPISSUMA / PE", regular, 519, (165, 206, 218))
destination.parent.mkdir(parents=True, exist_ok=True)
canvas.save(destination, format="JPEG", quality=81, optimize=True, subsampling=2)
image = Image.open(destination)
if image.size != (1200, 630):
    raise SystemExit("Invalid social preview dimensions")
print(f"Generated social preview: {destination} ({destination.stat().st_size} bytes, {image.size})")
