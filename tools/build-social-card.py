#!/usr/bin/env python3
"""Build a factual text-only social card without inventing a school crest."""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "assets" / "img" / "og-cover.png"
W, H = 1200, 630
im = Image.new("RGB", (W, H), "#073C21")
d = ImageDraw.Draw(im)
# Abstract academic page shapes, deliberately not presented as an official logo.
d.rounded_rectangle((72, 68, 216, 212), radius=28, fill="#0E5A2E", outline="#F2CD54", width=5)
d.line((112, 108, 112, 172), fill="#F7E6A0", width=7)
d.line((112, 108, 178, 92), fill="#F7E6A0", width=7)
d.line((112, 132, 178, 116), fill="#F7E6A0", width=7)
d.line((112, 156, 178, 140), fill="#F7E6A0", width=7)
d.polygon([(1010, 0), (1200, 0), (1200, 190)], fill="#D9B436")
d.rectangle((0, 602, W, H), fill="#D9B436")
font_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
regular_path = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
head = ImageFont.truetype(font_path, 64)
sub = ImageFont.truetype(regular_path, 34)
meta = ImageFont.truetype(font_path, 23)
d.text((72, 268), "TREASURE ACADEMY", font=head, fill="#FFF8DE")
d.text((75, 350), "Ageva, Okene, Kogi State", font=sub, fill="#FFFFFF")
d.text((75, 425), "Creche  •  Nursery  •  Primary", font=meta, fill="#F2CD54")
d.text((75, 482), "Our God is able", font=sub, fill="#DCEADE")
im.save(OUT, optimize=True)
print(f"Built factual social card: {OUT.relative_to(ROOT)} ({W}x{H})")
