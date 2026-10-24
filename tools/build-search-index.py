#!/usr/bin/env python3
"""Build the tiny, public, on-device site-search index."""
from __future__ import annotations

import importlib.util
import json
import re
from html import unescape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SEO_PATH = ROOT / "tools" / "seo-build.py"
spec = importlib.util.spec_from_file_location("taa_seo_build", SEO_PATH)
seo = importlib.util.module_from_spec(spec)
assert spec and spec.loader
spec.loader.exec_module(seo)

EXCLUDE = {
    "404.html", "developer.html", "developer-review.html", "developer-operations.html",
    "portal/admin.html", "portal/pupil.html", "portal/teacher.html",
}

KEYWORDS = {
    "index.html": "school private school ageva okene kogi creche nursery primary home",
    "about.html": "who we are founder story mission vision motto registration school identity",
    "admissions.html": "apply application enrol enrollment admission join register requirements documents places form",
    "admission-form.html": "request official form application safe process",
    "academics.html": "classes curriculum learning subjects teaching assessment creche nursery primary",
    "class.html": "choose class grade year creche nursery primary class finder",
    "story.html": "school story history mission founder identity about",
    "fees.html": "fees tuition cost price how much payment bank transfer schedule charges",
    "contact.html": "phone whatsapp email address location where directions visit office help",
    "credits.html": "website designer developer Jibril Abdullahi Onoruoiza Paragon Hub publisher data controller",
    "calendar.html": "calendar dates term resumption holiday break closing exam when",
    "news.html": "news updates announcement event graduation excursion current",
    "uniform.html": "uniform dress clothes sizes approved list price buy",
    "transport.html": "transport bus route pickup drop off driver availability area",
    "safeguarding.html": "safeguarding child protection safety concern bullying report headmistress",
    "privacy.html": "privacy personal data child photo consent information records delete",
    "portal/login.html": "portal login result attendance parent staff support account password",
    "elearning.html": "e-learning online practice common entrance primary 6 quiz revision cbt",
    "receipt.html": "receipt verify payment reference confirmation",
    "request-centre.html": "request reference tracking code status verification enquiry school office",
    "pta.html": "parents teachers association pta meeting levy contribution",
    "careers.html": "job jobs vacancy career teacher work apply recruitment",
    "shop.html": "shop supplies books stationery bag crayons uniform buy stock",
    "explore.html": "sitemap all pages browse website guide find",
    "welcome.html": "new family new parent first day checklist start",
    "anthem.html": "anthem creed pledge motto song lyrics school identity",
    "alumni.html": "alumni former pupil record graduate history",
    "exams.html": "exam examination timetable test paper result date",
    "homework.html": "homework assignment class work due teacher",
    "reading.html": "reading book literacy phonics home routine",
    "lost-found.html": "lost found missing property claim item",
    "support.html": "support donation contribution project library sports",
    "volunteer.html": "volunteer community help safeguarding",
    "testimonials.html": "feedback complaint suggestion parent headmistress",
    "openday.html": "open day tour visit booking appointment",
    "photo-day.html": "photo photography picture consent package",
    "birthdays.html": "birthday staff headmistress greeting",
    "board.html": "notice announcement current update",
    "holiday.html": "holiday assignment learning break",
    "poster.html": "poster uniform supplies list",
    "website-help.html": "website help broken page missing information unclear writing error problem report feedback accessibility slow loading search not useful",
}

PAGE_FAMILIES = {
    "index.html": "identity admissions classes learning",
    "about.html": "identity location",
    "admissions.html": "admissions classes fees",
    "admission-form.html": "admissions fees",
    "academics.html": "learning classes",
    "fees.html": "fees",
    "contact.html": "contact location time feedback",
    "credits.html": "identity website privacy",
    "calendar.html": "dates time",
    "news.html": "news dates",
    "uniform.html": "uniform fees shop",
    "transport.html": "transport fees",
    "safeguarding.html": "safety contact",
    "privacy.html": "privacy",
    "portal/login.html": "records contact",
    "elearning.html": "learning homework",
    "receipt.html": "fees records",
    "request-centre.html": "contact records website",
    "pta.html": "contact news",
    "careers.html": "careers contact",
    "shop.html": "shop fees uniform",
    "explore.html": "website",
    "welcome.html": "admissions uniform transport fees",
    "anthem.html": "identity",
    "alumni.html": "alumni records",
    "exams.html": "learning records dates",
    "homework.html": "homework learning",
    "reading.html": "learning homework",
    "lost-found.html": "contact",
    "support.html": "contact fees",
    "volunteer.html": "contact safety",
    "testimonials.html": "feedback contact",
    "openday.html": "location admissions",
    "photo-day.html": "privacy news",
    "birthdays.html": "news",
    "board.html": "news dates",
    "holiday.html": "homework dates learning",
    "poster.html": "uniform shop",
    "website-help.html": "website feedback contact",
}


def families_for(path: str) -> str:
    if path.startswith("classes/"):
        return "classes learning"
    if path.startswith("news/"):
        return "news dates" + (" admissions" if "admissions" in path else " alumni identity")
    return PAGE_FAMILIES.get(path, "")


def category_for(path: str) -> str:
    if path.startswith("classes/") or path in {"academics.html", "elearning.html", "exams.html", "homework.html", "holiday.html", "reading.html"}:
        return "Learning"
    if path.startswith("news/") or path in {"news.html", "calendar.html", "board.html", "birthdays.html", "photo-day.html"}:
        return "News & dates"
    if path in {"admissions.html", "admission-form.html", "fees.html", "uniform.html", "transport.html", "welcome.html", "openday.html", "receipt.html"}:
        return "Admissions & visits"
    if path in {"contact.html", "safeguarding.html", "privacy.html", "pta.html", "lost-found.html", "testimonials.html", "portal/login.html", "website-help.html"}:
        return "Family help"
    if path in {"about.html", "anthem.html", "alumni.html", "careers.html", "support.html", "volunteer.html", "shop.html", "poster.html"}:
        return "Our school"
    return "Start here"


def strip_tags(value: str) -> str:
    value = re.sub(r"<(script|style)\b.*?</\1>", " ", value, flags=re.I | re.S)
    value = re.sub(r"<[^>]+>", " ", value)
    return " ".join(unescape(value).split())


def title_and_intro(path: Path) -> tuple[str, str]:
    text = path.read_text(encoding="utf-8", errors="ignore")
    h1 = re.search(r"<h1\b[^>]*>(.*?)</h1>", text, flags=re.I | re.S)
    title = strip_tags(h1.group(1)) if h1 else path.stem.replace("-", " ").title()
    main = re.split(r"<main\b|<section\b[^>]*id=[\"']main", text, maxsplit=1, flags=re.I)
    body = main[1] if len(main) > 1 else text
    para = re.search(r"<p\b[^>]*>(.*?)</p>", body, flags=re.I | re.S)
    intro = strip_tags(para.group(1)) if para else ""
    return title, intro[:240]


entries = []
paths = sorted(list(ROOT.glob("*.html")) + list((ROOT / "classes").glob("*.html")) + list((ROOT / "news").glob("*.html")) + [ROOT / "portal" / "login.html"])
for path in paths:
    rel = path.relative_to(ROOT).as_posix()
    if rel in EXCLUDE:
        continue
    title, intro = title_and_intro(path)
    description = seo.DESC.get(rel, intro)
    category = category_for(rel)
    name_words = rel.replace(".html", "").replace("/", " ").replace("-", " ")
    priority = 8 if rel in {"index.html", "admissions.html", "academics.html", "fees.html", "contact.html", "news.html", "explore.html"} else 5
    if rel.startswith("news/20") and "admissions" not in rel:
        priority = 2
    entries.append({
        "t": title,
        "u": "index.html" if rel == "index.html" else rel,
        "d": description,
        "c": category,
        "k": " ".join(filter(None, [KEYWORDS.get(rel, ""), name_words, title, description])),
        "f": families_for(rel),
        "p": priority,
    })

output = ROOT / "assets" / "js" / "search-index.js"
output.write_text(
    "/* Generated by tools/build-search-index.py — public page metadata only. */\n"
    "window.TA_SEARCH_INDEX=" + json.dumps(entries, ensure_ascii=False, separators=(",", ":")) + ";\n",
    encoding="utf-8",
)
print(f"Generated smart-search index with {len(entries)} public destinations.")
