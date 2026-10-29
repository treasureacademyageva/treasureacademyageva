#!/usr/bin/env python3
"""Generate metrics-only brand, navigation and accessibility evidence.

The output is safe for the noindex Developer Operations page. It stores no page
paragraphs, form values, visitor identifiers or raw search text.
"""
from __future__ import annotations

import json
import re
from collections import Counter, deque
from html import unescape
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "assets" / "js" / "experience-audit.js"
PUBLIC_DIRS = ("classes", "news")
EXPECTED_NAME = "Treasure Academy"
EXPECTED_PHONE = "2348141943478"
EXPECTED_WHATSAPP = "2349063932487"
CTA_WORDS = re.compile(r"\b(apply|admission|visit|call|whatsapp|contact|directions|search|fees?)\b", re.I)
VAGUE = {"click here", "here", "more", "read more", "learn more", "continue"}
ROUTE_REGISTRY = json.loads((ROOT / "config" / "public-routes.json").read_text(encoding="utf-8"))
CLEAN_TO_SOURCE = {
    str(row["canonical"]).split("?", 1)[0].strip("/"): str(row["source"]).lstrip("/")
    for row in ROUTE_REGISTRY.get("routes", [])
    if row.get("canonical") is not None and row.get("source")
}


class AuditParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.stack: list[tuple[str, bool]] = []
        self.links: list[dict] = []
        self.images: list[dict] = []
        self.controls: list[dict] = []
        self.labels_for: set[str] = set()
        self.forms = 0
        self.form_actions: list[str] = []
        self.h1 = 0
        self.h2 = 0
        self.navs = 0
        self.mains = 0
        self.footers = 0
        self.hero = False
        self.hero_image = False
        self.logo = False
        self.brand_mark = False
        self.title = ""
        self.meta: dict[str, str] = {}
        self.canonical = ""
        self.text_parts: list[str] = []
        self._capture: dict | None = None
        self._label_depth = 0

    @staticmethod
    def attrs(attrs) -> dict[str, str]:
        return {k: (v or "") for k, v in attrs}

    def handle_starttag(self, tag: str, attrs) -> None:
        a = self.attrs(attrs)
        classes = set(a.get("class", "").split())
        parent_hero = any(is_hero for _, is_hero in self.stack)
        is_hero_container = bool({"page-hero", "home-hero"} & classes)
        if "site-monogram" in classes: self.brand_mark = True
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append((tag, is_hero_container))
        if tag == "title":
            self._capture = {"tag": tag, "parts": []}
        elif tag == "a":
            self._capture = {"tag": tag, "parts": [], "href": a.get("href", ""), "class": a.get("class", "")}
        elif tag == "label":
            self._label_depth += 1
            if a.get("for"):
                self.labels_for.add(a["for"])
        if tag == "h1": self.h1 += 1
        if tag == "h2": self.h2 += 1
        if tag == "nav": self.navs += 1
        if tag == "main": self.mains += 1
        if tag == "footer": self.footers += 1
        if tag == "form":
            self.forms += 1
            if a.get("action"): self.form_actions.append(a["action"])
        if tag in {"header", "section", "div"} and ({"page-hero", "home-hero"} & classes):
            self.hero = True
        if tag == "img":
            if parent_hero or is_hero_container: self.hero_image = True
            src = a.get("src", "")
            if "logo" in src.lower(): self.logo = True
            self.images.append({
                "src": src,
                "altPresent": "alt" in a,
                "altEmpty": a.get("alt", "") == "",
                "sized": bool(a.get("width") and a.get("height")),
                "lazy": a.get("loading") == "lazy",
            })
        if tag in {"input", "select", "textarea"} and a.get("type", "").lower() not in {"hidden", "submit", "button"}:
            self.controls.append({
                "id": a.get("id", ""),
                "labelledByAria": bool(a.get("aria-label") or a.get("aria-labelledby")),
                "wrapped": self._label_depth > 0,
                "type": a.get("type", tag),
            })
        if tag == "meta":
            key = a.get("name") or a.get("property")
            if key: self.meta[key.lower()] = a.get("content", "")
        if tag == "link" and a.get("rel", "").lower() == "canonical":
            self.canonical = a.get("href", "")

    def handle_data(self, data: str) -> None:
        clean = " ".join(data.split())
        if clean:
            self.text_parts.append(clean)
            if self._capture:
                self._capture["parts"].append(clean)

    def handle_endtag(self, tag: str) -> None:
        if self._capture and self._capture["tag"] == tag:
            text = " ".join(self._capture["parts"])
            if tag == "title": self.title = text
            elif tag == "a": self.links.append({
                "href": self._capture["href"],
                "text": text,
                "class": self._capture["class"],
            })
            self._capture = None
        if tag == "label" and self._label_depth:
            self._label_depth -= 1
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                del self.stack[index:]
                break


def public_files() -> list[Path]:
    pages = list(ROOT.glob("*.html"))
    for folder in PUBLIC_DIRS:
        pages.extend((ROOT / folder).glob("*.html"))
    return sorted(p for p in pages if not p.name.startswith("developer"))


def page_key(path: Path) -> str:
    rel = path.relative_to(ROOT).as_posix()
    return "" if rel == "index.html" else rel


def local_target(href: str, base: Path) -> str | None:
    href = unescape(href or "").strip()
    if not href or href.startswith(("#", "mailto:", "tel:", "javascript:")):
        return None
    parts = urlsplit(href)
    if parts.scheme or parts.netloc:
        return None
    clean = parts.path
    if not clean or clean == "/": return ""
    if clean.startswith("/"):
        target = ROOT / clean.lstrip("/")
    else:
        target = base.parent / clean
    try:
        rel = target.resolve().relative_to(ROOT.resolve()).as_posix()
    except ValueError:
        return None
    if rel.endswith("/"): rel += "index.html"
    rel = CLEAN_TO_SOURCE.get(rel.strip("/"), rel)
    return "" if rel == "index.html" else rel


pages = []
graph: dict[str, set[str]] = {}
all_keys = {page_key(path) for path in public_files()}
for path in public_files():
    source = path.read_text(encoding="utf-8", errors="ignore")
    parser = AuditParser()
    parser.feed(source)
    rel = page_key(path)
    text = " ".join(parser.text_parts).lower()
    targets = {target for link in parser.links if (target := local_target(link["href"], path)) in all_keys}
    targets.update(target for action in parser.form_actions if (target := local_target(action, path)) in all_keys)
    graph[rel] = targets
    missing_labels = sum(
        1 for control in parser.controls
        if not (control["labelledByAria"] or control["wrapped"] or (control["id"] and control["id"] in parser.labels_for))
    )
    vague = sum(1 for link in parser.links if link["text"].strip().lower() in VAGUE)
    ctas = sum(1 for link in parser.links if CTA_WORDS.search(link["text"]) or "btn" in link["class"].split())
    issues = []
    if parser.h1 != 1: issues.append("h1_count")
    if parser.mains != 1: issues.append("main_landmark")
    if not parser.navs: issues.append("navigation_landmark")
    if missing_labels: issues.append("unlabelled_control")
    if any(not image["altPresent"] for image in parser.images): issues.append("missing_alt_attribute")
    if any(not image["sized"] for image in parser.images): issues.append("unsized_image")
    if vague: issues.append("vague_link")
    if not (parser.brand_mark or parser.logo): issues.append("brand_mark_missing")
    if EXPECTED_NAME.lower() not in text: issues.append("school_name_missing")
    if not parser.meta.get("description"): issues.append("description_missing")
    pages.append({
        "page": "index.html" if rel == "" else rel,
        "title": parser.title,
        "indexable": "noindex" not in parser.meta.get("robots", "").lower(),
        "brand": {
            "name": EXPECTED_NAME.lower() in text,
            "logo": parser.logo,
            "mark": parser.brand_mark or parser.logo,
            "description": bool(parser.meta.get("description")),
            "canonical": bool(parser.canonical),
            "socialImage": bool(parser.meta.get("og:image")),
        },
        "accessibility": {
            "h1": parser.h1,
            "h2": parser.h2,
            "landmarks": parser.navs + parser.mains + parser.footers,
            "images": len(parser.images),
            "missingAlt": sum(not image["altPresent"] for image in parser.images),
            "decorativeAlt": sum(image["altEmpty"] for image in parser.images),
            "unsizedImages": sum(not image["sized"] for image in parser.images),
            "controls": len(parser.controls),
            "missingLabels": missing_labels,
            "vagueLinks": vague,
        },
        "experience": {
            "hero": parser.hero,
            "heroImage": parser.hero_image,
            "forms": parser.forms,
            "ctas": ctas,
            "links": len(parser.links),
            "apply": "admission" in text or "apply" in text,
            "visit": "visit" in text or "directions" in text,
        },
        "content": {
            "mission": "mission" in text,
            "vision": "vision" in text,
            "academics": "academic" in text or "classes" in text,
            "activities": any(word in text for word in ("activity", "sports", "excursion", "culture")),
            "events": "event" in text or "term dates" in text,
            "fees": "fees" in text or "payment" in text,
            "contact": EXPECTED_PHONE in re.sub(r"\D", "", source) or EXPECTED_WHATSAPP in re.sub(r"\D", "", source),
        },
        "issues": issues,
    })

# Meaning-aware Search is a real second route to every indexed destination. Count
# those links in click depth even though results are rendered by JavaScript.
index_source = (ROOT / "assets" / "js" / "search-index.js").read_text(encoding="utf-8", errors="ignore")
match = re.search(r"window\.TA_SEARCH_INDEX=(\[.*?\]);", index_source, flags=re.S)
if match:
    try:
        for entry in json.loads(match.group(1)):
            route = str(entry.get("u", "")).split("#", 1)[0].split("?", 1)[0].strip("/")
            route = CLEAN_TO_SOURCE.get(route, route)
            route = "" if route == "index.html" else route
            if route in all_keys:
                graph.setdefault("search.html", set()).add(route)
    except (TypeError, ValueError, json.JSONDecodeError):
        pass

# Shortest click depth from the homepage. This is a content-graph measure, not a visitor trace.
depth = {"": 0}
queue = deque([""])
while queue:
    current = queue.popleft()
    for target in graph.get(current, set()):
        if target not in depth:
            depth[target] = depth[current] + 1
            queue.append(target)
for page in pages:
    key = "" if page["page"] == "index.html" else page["page"]
    page["experience"]["clickDepth"] = depth.get(key)
    if key not in depth: page["issues"].append("unreachable_from_home")
    elif depth[key] > 2: page["issues"].append("over_two_clicks")

home_source = (ROOT / "index.html").read_text(encoding="utf-8", errors="ignore")
brand_gaps = [
    {
        "id": "logo-master",
        "severity": "owner-action",
        "finding": "The current restored logo artwork reads ‘Treasure Kiddies’ while the website name is ‘Treasure Academy’. Supply the approved master logo before replacing it.",
    },
    {
        "id": "authentic-photos",
        "severity": "owner-action",
        "finding": "No campus photograph in the restored media set is confirmed as an owner-approved Treasure Academy original. Verified image slots must stay pending.",
    },
    {
        "id": "social-profiles",
        "severity": "owner-action",
        "finding": "No social-profile URL is approved for Organization sameAs markup. Existing Facebook archive links are not treated as verified brand profiles.",
    },
    {
        "id": "public-documents",
        "severity": "owner-action",
        "finding": "No current owner-approved admissions prospectus, fee schedule or calendar document is available for public download.",
    },
]

report = {
    "version": 1,
    "generated": "2026-10-22",
    "privacy": "Metrics only: no page paragraphs, visitor identifiers, form values or raw search text.",
    "totals": {
        "pages": len(pages),
        "indexable": sum(page["indexable"] for page in pages),
        "pagesWithIssues": sum(bool(page["issues"]) for page in pages),
        "withinTwoClicks": sum(page["experience"]["clickDepth"] is not None and page["experience"]["clickDepth"] <= 2 for page in pages),
        "missingAlt": sum(page["accessibility"]["missingAlt"] for page in pages),
        "missingLabels": sum(page["accessibility"]["missingLabels"] for page in pages),
        "unsizedImages": sum(page["accessibility"]["unsizedImages"] for page in pages),
        "heroShells": sum(page["experience"]["hero"] for page in pages),
        "heroImages": sum(page["experience"]["heroImage"] for page in pages),
        "forms": sum(page["experience"]["forms"] for page in pages),
        "ctas": sum(page["experience"]["ctas"] for page in pages),
    },
    "brand": {
        "name": "Treasure Academy, Ageva",
        "legalName": "Treasure Academy Ageva Limited",
        "logoPath": "/assets/img/logo.jpg",
        "socialImagePath": "/assets/img/og-cover.png",
        "schoolSchema": '"@type": "School"' in home_source or '"@type":"School"' in home_source,
        "gaps": brand_gaps,
    },
    "depthDistribution": dict(sorted(Counter(
        "unreachable" if page["experience"]["clickDepth"] is None else str(page["experience"]["clickDepth"])
        for page in pages
    ).items())),
    "pages": pages,
}
OUTPUT.write_text(
    "/* Generated by tools/build-experience-audit.py; metrics only. */\n"
    "window.TA_EXPERIENCE_AUDIT=" + json.dumps(report, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
print(f"Wrote brand/accessibility/journey evidence for {len(pages)} public pages.")
