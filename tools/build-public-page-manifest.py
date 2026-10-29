#!/usr/bin/env python3
"""Build a held, source-hashed CMS Page migration manifest.

The file is inert evidence: it does not connect to Supabase, create a row,
verify wording, import media or publish a route. Authorised staff stage one
candidate in the protected CMS and leadership independently verifies, imports,
reviews, publishes and binds it to its fixed public surface.
"""
from __future__ import annotations

import hashlib
import html
import json
import re
from pathlib import Path
from urllib.parse import urlsplit

from bs4 import BeautifulSoup, Tag

ROOT = Path(__file__).resolve().parents[1]
ROUTES = json.loads((ROOT / "config" / "public-routes.json").read_text(encoding="utf-8"))["routes"]
OUTPUT = ROOT / "content" / "migration" / "public-page-held-candidates.json"
REPLACE_PATHS = {
    "/about", "/academics", "/alumni", "/anthem", "/board", "/calendar", "/careers", "/classes",
    "/classes/pre-nursery", "/classes/nursery-1", "/classes/nursery-2",
    "/classes/primary-1", "/classes/primary-2", "/classes/primary-3", "/classes/primary-4", "/classes/primary-6",
    "/credits", "/exams", "/fees", "/holiday", "/openday", "/photo-day", "/privacy", "/pta",
    "/safeguarding", "/story", "/support", "/testimonials", "/transport", "/uniform", "/volunteer", "/welcome",
}


def clean(value: str, maximum: int) -> str:
    return " ".join(html.unescape(value or "").split())[:maximum].strip()


def safe_local_path(value: str) -> str:
    candidate = urlsplit(value or "").path
    return candidate if re.fullmatch(r"/(?!/)[A-Za-z0-9/_?#=&.%-]*", candidate) and "//" not in candidate and ".." not in candidate else ""


def text_of(node: Tag | None, maximum: int) -> str:
    return clean(node.get_text(" ", strip=True) if node else "", maximum)


def block_from(node: Tag) -> dict | None:
    name = node.name.lower()
    if name in {"h2", "h3", "h4"}:
        text = text_of(node, 300)
        return {"type": "heading", "payload": {"text": text, "level": int(name[1])}} if text else None
    if name == "p":
        text = text_of(node, 5000)
        return {"type": "paragraph", "payload": {"text": text}} if text else None
    if name in {"ul", "ol"}:
        items = [text_of(item, 500) for item in node.find_all("li", recursive=False)]
        items = [item for item in items if item][:50]
        return {"type": "ordered_list" if name == "ol" else "unordered_list", "payload": {"items": items}} if items else None
    if name == "blockquote":
        text = text_of(node, 5000)
        return {"type": "quote", "payload": {"text": text}} if text else None
    if name == "table":
        rows = []
        for tr in node.find_all("tr")[:101]:
            cells = [text_of(cell, 500) for cell in tr.find_all(["th", "td"], recursive=False)[:12]]
            if cells:
                rows.append(cells)
        if not rows:
            return None
        headers = [text_of(cell, 120) for cell in node.find("tr").find_all("th", recursive=False)[:12]] if node.find("tr") else []
        if headers and rows and rows[0] == headers:
            rows = rows[1:]
        if not rows:
            return None
        if not headers:
            width = min(12, max(len(row) for row in rows))
            headers = [f"Column {index + 1}" for index in range(width)]
        width = len(headers)
        normalised = [(row[:width] + [""] * width)[:width] for row in rows[:100]]
        return {"type": "table", "payload": {"headers": headers, "rows": normalised}}
    if name == "a" and any(part in (node.get("class") or []) for part in ["btn", "button"]):
        path = safe_local_path(node.get("href", ""))
        label = text_of(node, 80)
        return {"type": "button", "payload": {"label": label, "path": path}} if label and path else None
    return None


def page_document(source: Path, canonical: str, mode: str) -> dict:
    raw = source.read_text(encoding="utf-8", errors="strict")
    soup = BeautifulSoup(raw, "html.parser")
    main = soup.find("main")
    if not main:
        raise ValueError(f"No main element in {source}")
    title = text_of(main.find("h1") or soup.find("h1"), 180) or source.stem.replace("-", " ").title()
    meta_description = soup.find("meta", attrs={"name": "description"})
    description = clean(meta_description.get("content", "") if meta_description else "", 180)
    first_paragraph = next((text_of(p, 500) for p in main.find_all("p") if len(text_of(p, 500)) >= 10), "")
    summary = description if len(description) >= 10 else first_paragraph
    if len(summary) < 10:
        summary = f"Current reviewed information about {title}."

    work = BeautifulSoup(str(main), "html.parser")
    for removable in work.select("script,style,noscript,form,nav,.route-bar,.mobile-dock,[hidden]"):
        removable.decompose()
    blocks = []
    for node in work.find_all(["h2", "h3", "h4", "p", "ul", "ol", "blockquote", "table", "a"]):
        if node.name == "p" and node.find_parent(["li", "blockquote", "table"]):
            continue
        if node.name in {"ul", "ol"} and node.find_parent(["ul", "ol"]):
            continue
        if node.name == "a" and not any(part in (node.get("class") or []) for part in ["btn", "button"]):
            continue
        block = block_from(node)
        if block and block not in blocks:
            blocks.append(block)
        if len(blocks) == 100:
            break
    if not blocks:
        blocks = [{"type": "paragraph", "payload": {"text": summary}}]

    seo_title_node = soup.find("title")
    seo_title = text_of(seo_title_node, 70) if seo_title_node else title[:70]
    if len(seo_title) < 4:
        seo_title = title[:70]
    if len(description) < 20:
        description = summary[:180]
    category = "Class information" if canonical.startswith("/classes") else "School information"
    return {
        "title": title,
        "summary": summary,
        "category": category,
        "search_keywords": sorted({word.lower() for word in re.findall(r"[A-Za-z][A-Za-z-]{2,}", f"{title} {canonical}")})[:40],
        "language": "en",
        "locale": "en-NG",
        "classification": "public",
        "source_note": f"Source-hashed reviewed public page: {source.relative_to(ROOT).as_posix()}",
        "seo_title": seo_title,
        "seo_description": description,
        "metadata": {"surface_path": canonical, "surface_mode": mode, "initial_media_held": True},
        "blocks": blocks,
        "tags": ["public-page"],
        "search_terms": sorted({clean(title.lower(), 80), clean(canonical.strip("/").replace("/", " ").replace("-", " "), 80)} - {""}),
        "media": [],
    }


def slug_for(path: str) -> str:
    if path == "/":
        return "home"
    return path.strip("/").replace("/", "-")


candidates = []
for route in ROUTES:
    canonical = route["canonical"]
    if canonical.startswith("/news"):
        continue
    source = ROOT / route["source"].lstrip("/")
    mode = "replace" if canonical in REPLACE_PATHS else "supplement"
    raw = source.read_bytes()
    candidates.append({
        "source_key": f"public-page/{source.relative_to(ROOT).as_posix()}",
        "source_kind": "repository_html",
        "source_locator": source.relative_to(ROOT).as_posix(),
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "content_type": "page",
        "slug": slug_for(canonical),
        "document": page_document(source, canonical, mode),
        "historical_child_media_held": True,
        "verification_status": "held",
        "verification_required": True,
        "media_imported": False,
        "surface_path": canonical,
        "surface_mode": mode,
    })

manifest = {
    "version": 1,
    "generated_on": "2026-10-29",
    "purpose": "Held source-hashed public Page migration candidates; no row, verification, publication, binding or activation is performed by this file.",
    "all_candidates_held": True,
    "candidate_count": len(candidates),
    "candidates": candidates,
}
OUTPUT.parent.mkdir(parents=True, exist_ok=True)
OUTPUT.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
print(f"Generated {len(candidates)} held public Page candidates at {OUTPUT.relative_to(ROOT)}")
