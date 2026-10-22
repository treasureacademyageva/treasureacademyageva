#!/usr/bin/env python3
"""Build the exact media-restoration review inventory.

This does not approve or license media. It records the public-build treatment chosen
on 22 October 2026 so the owner can make item-by-item decisions later.
"""
from __future__ import annotations

import csv
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IMG_ROOT = ROOT / "assets" / "img"
OUTPUT = ROOT / "docs" / "MEDIA-RESTORATION-INVENTORY-2026-10-22.csv"


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def references(asset: Path) -> list[str]:
    relative = asset.relative_to(ROOT).as_posix()
    basename = asset.name
    found: list[str] = []
    candidates = []
    for pattern in ("*.html", "*.js", "*.css", "*.json", "*.webmanifest"):
        candidates.extend(ROOT.rglob(pattern))
    for candidate in sorted(set(candidates)):
        relative_parts = candidate.relative_to(ROOT).parts
        if any(part in {".git", "node_modules"} for part in candidate.parts) or (relative_parts and relative_parts[0] in {"tools", "docs", "cms"}):
            continue
        try:
            text = candidate.read_text(encoding="utf-8", errors="ignore")
        except OSError:
            continue
        if relative in text or f"assets/img/{asset.relative_to(IMG_ROOT).as_posix()}" in text or basename in text:
            found.append(candidate.relative_to(ROOT).as_posix())
    return found


rows = []
for asset in sorted(path for path in IMG_ROOT.rglob("*") if path.is_file()):
    rel = asset.relative_to(IMG_ROOT).as_posix()
    refs = references(asset)
    if rel.endswith("-640.webp") or rel.endswith("-560.webp"):
        treatment = "generated-responsive-derivative"
        reason = "Smaller WebP derivative generated locally from the adjacent restored source to reduce mobile data use."
        owner_action = "Decision follows the source asset; regenerate if an approved replacement source is supplied."
    elif rel.startswith("graduates/"):
        treatment = "excluded-private-record"
        reason = "Photographed graduate/result record; excluded from deployment by .vercelignore."
        owner_action = "Keep private; do not publish names, candidate numbers, marks or record-sheet images."
    elif rel.startswith("partners/"):
        treatment = "excluded-third-party-mark"
        reason = "Third-party mark retained in repository but excluded from deployment."
        owner_action = "Confirm exact issuer, permission and permitted placement before any publication."
    elif rel == "class-feature.jpg":
        treatment = "excluded-known-third-party-placeholder"
        reason = "Retained for comparison but excluded from deployment and page references."
        owner_action = "Replace with owner-provided school media; do not publish this file."
    elif refs:
        treatment = "restored-to-public-build"
        reason = "Existing website asset restored at the owner's direction; not automatically provenance-approved."
        owner_action = "Confirm source/owner, authority or consent, permitted placements, alt text and review date."
    else:
        treatment = "retained-unreferenced"
        reason = "Existing repository asset retained but not referenced by a current page."
        owner_action = "Decide whether to approve and place it, continue holding it, or remove it."
    rows.append({
        "asset": f"assets/img/{rel}",
        "sha256": sha256(asset),
        "bytes": asset.stat().st_size,
        "treatment": treatment,
        "current_references": "; ".join(refs),
        "reason": reason,
        "owner_action": owner_action,
    })

OUTPUT.parent.mkdir(parents=True, exist_ok=True)
with OUTPUT.open("w", encoding="utf-8", newline="") as stream:
    writer = csv.DictWriter(stream, fieldnames=rows[0].keys(), lineterminator="\n")
    writer.writeheader()
    writer.writerows(rows)
print(f"Wrote {len(rows)} media decisions to {OUTPUT.relative_to(ROOT)}")
