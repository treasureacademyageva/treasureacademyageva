#!/usr/bin/env python3
"""Keep the verified secure Portal in consistent public navigation.

This replaces only known navigation anchors. It does not touch contextual
WhatsApp parent-support links elsewhere on the site.
"""
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
PORTAL = "/portal/login.html"

patterns = [
    (
        re.compile(r'<a\s+class="portal-link"[^>]*>.*?</a>', re.I | re.S),
        f'<a class="portal-link" href="{PORTAL}">Portal</a>',
    ),
    (
        re.compile(r'<a\s+class="drawer-portal"[^>]*>.*?</a>', re.I | re.S),
        f'<a class="drawer-portal" href="{PORTAL}">Portal</a>',
    ),
]

changed = 0
for path in sorted(ROOT.rglob("*.html")):
    relative = path.relative_to(ROOT)
    if relative.parts[0] in {'.git', 'node_modules', 'docs'}:
        continue
    text = path.read_text(encoding="utf-8")
    updated = text
    for pattern, replacement in patterns:
        updated = pattern.sub(replacement, updated)
    updated = re.sub(
        r'<a\s+class="icon-action sticky-portal"[^>]*>(.*?)</a>',
        rf'<a class="icon-action sticky-portal" href="{PORTAL}" title="Open secure portal" aria-label="Open secure parent and staff portal">\1</a>',
        updated,
        flags=re.I | re.S,
    )
    if updated != text:
        path.write_text(updated, encoding="utf-8")
        changed += 1

print(f"Secure portal navigation refreshed in {changed} public HTML files.")
