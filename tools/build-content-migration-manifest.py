#!/usr/bin/env python3
"""Build a deterministic, non-importing Run 10 content verification manifest.

The output is evidence for private field verification. It never changes Supabase,
publishes content, links media or treats repository wording as currently approved.
"""
from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "content" / "migration" / "run10-held-candidates.json"
SOURCES = [
    "news/2017-first-graduation-ceremony.html",
    "news/2018-second-graduation-ceremony.html",
    "news/2019-third-graduation-ceremony.html",
    "news/2020-fourth-graduation-ceremony.html",
    "news/2021-fifth-graduation-ceremony.html",
    "news/2026-2027-admissions-open.html",
    "about.html", "academics.html", "admissions.html", "fees.html",
    "contact.html", "privacy.html", "safeguarding.html", "credits.html",
]


def tidy(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


class Extractor(HTMLParser):
    capture_tags = {"h2", "h3", "h4", "p", "li", "blockquote"}
    skip_tags = {"script", "style", "noscript", "nav", "form", "figure", "footer", "svg", "template"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.in_main = 0
        self.skip = 0
        self.title_parts: list[str] = []
        self.in_h1 = 0
        self.description = ""
        self.current_tag: str | None = None
        self.current_depth = 0
        self.parts: list[str] = []
        self.items: list[tuple[str, str]] = []

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        attrs_map = dict(attrs)
        if tag == "meta" and attrs_map.get("name", "").lower() == "description":
            self.description = tidy(attrs_map.get("content") or "")
        if tag == "main":
            self.in_main += 1
        if tag == "h1":
            self.in_h1 += 1
        if self.in_main and tag in self.skip_tags:
            self.skip += 1
        if self.in_main and not self.skip and tag in self.capture_tags and self.current_tag is None:
            self.current_tag = tag
            self.current_depth = 1
            self.parts = []
        elif self.current_tag is not None:
            self.current_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if self.current_tag is not None:
            self.current_depth -= 1
            if self.current_depth == 0:
                value = tidy("".join(self.parts))
                if value:
                    self.items.append((self.current_tag, value))
                self.current_tag = None
                self.parts = []
        if tag == "h1" and self.in_h1:
            self.in_h1 -= 1
        if self.in_main and tag in self.skip_tags and self.skip:
            self.skip -= 1
        if tag == "main" and self.in_main:
            self.in_main -= 1

    def handle_data(self, data: str) -> None:
        if self.in_h1:
            self.title_parts.append(data)
        if self.current_tag is not None and self.in_main and not self.skip:
            self.parts.append(data)


def publication_date(html: str) -> str | None:
    json_ld = re.search(r'"datePublished"\s*:\s*"(\d{4}-\d{2}-\d{2})"', html)
    if json_ld:
        return json_ld.group(1)
    match = re.search(r"\b(\d{1,2}\s+(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4})\b", html)
    if not match:
        return None
    return datetime.strptime(match.group(1), "%d %B %Y").date().isoformat()


def build_candidate(relative: str) -> dict:
    path = ROOT / relative
    raw = path.read_bytes()
    html = raw.decode("utf-8")
    parser = Extractor()
    parser.feed(html)
    title = tidy("".join(parser.title_parts))
    summary = parser.description
    if not (4 <= len(title) <= 180):
        raise ValueError(f"invalid title in {relative!r}")
    if not (10 <= len(summary) <= 500):
        raise ValueError(f"invalid description in {relative!r}")

    blocks = []
    seen: set[tuple[str, str]] = set()
    for tag, text in parser.items:
        block_type = "heading" if tag in {"h2", "h3", "h4"} else "quote" if tag == "blockquote" else "paragraph"
        payload = {"text": text}
        if block_type == "heading":
            payload["level"] = tag[1]
        key = (block_type, text)
        if key in seen:
            continue
        seen.add(key)
        blocks.append({"type": block_type, "payload": payload})
    if not blocks:
        raise ValueError(f"no public main text extracted from {relative!r}")
    if len(blocks) > 100:
        raise ValueError(f"too many blocks in {relative!r}: {len(blocks)}")

    is_news = relative.startswith("news/")
    slug = Path(relative).stem
    metadata = {"legacy_source_path": f"/{relative}"}
    published = publication_date(html) if is_news else None
    if published:
        metadata["legacy_publication_date"] = published
    document = {
        "title": title,
        "summary": summary,
        "classification": "public",
        "source_note": "Repository source candidate; field verification is required before import.",
        "seo_title": title[:70],
        "seo_description": summary[:180],
        "search_keywords": [],
        "search_terms": [],
        "metadata": metadata,
        "blocks": blocks,
    }
    return {
        "source_key": f"repository_html/{relative}",
        "source_kind": "repository_html",
        "source_locator": f"/{relative}",
        "source_sha256": hashlib.sha256(raw).hexdigest(),
        "content_type": "news" if is_news else "page",
        "slug": slug,
        "canonical_target": f"/news/{slug}" if is_news else f"/{slug}",
        "verification_status": "held",
        "verification_required": True,
        "historical_child_media_held": is_news,
        "media_imported": False,
        "document": document,
    }


def main() -> None:
    candidates = [build_candidate(source) for source in SOURCES]
    payload = {
        "version": 1,
        "generated_from": "tracked repository HTML",
        "authority": "verification manifest only; not an import or publication instruction",
        "candidate_count": len(candidates),
        "all_candidates_held": True,
        "historical_media_policy": "No image/video relationship is included. Historical child-related media remains held for provenance and consent review.",
        "candidates": candidates,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"Wrote {len(candidates)} held candidates to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
