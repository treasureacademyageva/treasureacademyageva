#!/usr/bin/env python3
"""Build the single public stylesheet and small responsive image variants."""
from __future__ import annotations

import gzip
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
CSS_DIR = ROOT / "assets" / "css"
IMG_DIR = ROOT / "assets" / "img"

sources = ["main.css", "extra.css", "corporate.css", "motion.css", "ux.css"]
parts = []
for name in sources:
    parts.append(f"\n/* ---- source: {name} ---- */\n")
    parts.append((CSS_DIR / name).read_text(encoding="utf-8"))
bundle = "".join(parts).replace("font-display:swap", "font-display:optional")
output = CSS_DIR / "site.css"
output.write_text(bundle, encoding="utf-8")

made = 0
for source in sorted(IMG_DIR.glob("*.webp")):
    if source.stem.endswith("-640"):
        continue
    with Image.open(source) as image:
        if image.width <= 720:
            continue
        ratio = 640 / image.width
        target = IMG_DIR / f"{source.stem}-640.webp"
        resized = image.resize((640, max(1, round(image.height * ratio))), Image.Resampling.LANCZOS)
        resized.save(target, "WEBP", quality=72, method=6)
        made += 1

for source in sorted(IMG_DIR.glob("shop-*.jpg")) + [IMG_DIR / "excursion-girls.jpg"]:
    if not source.exists():
        continue
    with Image.open(source) as image:
        width = min(560, image.width)
        ratio = width / image.width
        target = IMG_DIR / f"{source.stem}-560.webp"
        resized = image.resize((width, max(1, round(image.height * ratio))), Image.Resampling.LANCZOS)
        resized.save(target, "WEBP", quality=72, method=6)
        made += 1

raw = output.stat().st_size
gz = len(gzip.compress(output.read_bytes(), compresslevel=9))
print(f"Built assets/css/site.css: {raw:,} bytes raw, about {gz:,} bytes gzip.")
print(f"Built {made} responsive WebP variants.")
