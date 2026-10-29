#!/usr/bin/env python3
"""Route structured school workflows to the website Request Centre.

Ordinary contact-page and private-feedback drafts remain non-storing WhatsApp
handoffs. A reviewed WhatsApp draft is never treated as a database request or
as proof of delivery. Frozen review/portal files are never transformed.
"""
from __future__ import annotations

import html
import re
from pathlib import Path
from urllib.parse import unquote_plus

ROOT = Path(__file__).resolve().parents[1]
SCHOOL_PREFIX = "https://wa.me/2349063932487?text="


def request_type(message: str, rel: str) -> str:
    value = unquote_plus(html.unescape(message)).lower()
    rules = [
        ("safeguard", "safeguarding"), ("private feedback", "private_feedback"),
        ("testimonial", "testimonial_permission"), ("former pupil record", "school_record"),
        ("school record", "school_record"), ("receipt", "receipt_verification"),
        ("password", "account_help"), ("account help", "account_help"),
        ("add or update", "information_update"), ("missing information", "information_update"),
        ("admission", "admission"), ("apply", "admission"), ("school visit", "school_visit"),
        ("visit", "school_visit"), ("class placement", "class_enquiry"),
        ("class availability", "class_enquiry"), ("creche", "class_enquiry"),
        ("nursery", "class_enquiry"), ("primary", "class_enquiry"),
        ("fee", "fee_schedule"), ("calendar", "calendar"), ("term date", "calendar"),
        ("transport", "transport"), ("uniform", "uniform"), ("supply", "supplies"),
        ("stock", "supplies"), ("pta", "pta"), ("event", "event"),
        ("photo", "event"), ("lost", "lost_property"), ("found item", "lost_property"),
        ("alumni", "alumni_update"), ("former-pupil achievement", "alumni_update"),
        ("website", "website_problem"), ("vacanc", "career"), ("career", "career"),
        ("volunteer", "volunteer"), ("contribution", "support_proposal"),
        ("support", "support_proposal"), ("homework", "homework"),
        ("holiday learning", "homework"), ("reading", "reading"),
        ("exam", "exam_timetable"), ("birthday", "birthday_greeting"),
    ]
    for needle, kind in rules:
        if needle in value:
            return kind
    page_defaults = {
        "admissions.html": "admission", "admission-form.html": "admission",
        "fees.html": "fee_schedule", "transport.html": "transport", "uniform.html": "uniform",
        "shop.html": "supplies", "safeguarding.html": "safeguarding",
        "contact.html": "general", "website-help.html": "website_problem",
    }
    return page_defaults.get(rel, "general")


def centre(kind: str) -> str:
    return f"/request-centre.html?type={kind}"


def transform_file(path: Path) -> int:
    rel = path.relative_to(ROOT).as_posix()
    text = path.read_text(encoding="utf-8")
    original = text

    if rel != "contact.html":
        # Static school-number links with a structured workflow message.
        pattern = re.compile(re.escape(SCHOOL_PREFIX) + r"(?P<message>[^\s\"'<>)]{2,})", re.I)
        text = pattern.sub(lambda match: centre(request_type(match.group("message"), rel)), text)

        # Dynamic structured workflows generated in a few interactive pages.
        dynamic = re.compile(
            r'window\.open\("https://wa\.me/2349063932487\?text="\+encodeURIComponent\((?P<body>.*?)\),"_blank","noopener"\);',
            re.S,
        )
        default_type = request_type(rel.replace("-", " "), rel)
        if rel == "admissions.html": default_type = "admission"
        if rel == "website-help.html": default_type = "website_problem"
        def dynamic_replacement(match: re.Match) -> str:
            kind = request_type(match.group("body"), rel)
            if kind == "general": kind = default_type
            return f'window.location.href="{centre(kind)}";'
        text = dynamic.sub(dynamic_replacement, text)
    text = text.replace("WhatsApp opened. Review the message, then tap Send.", "Opening the website Request Centre…")
    text = text.replace("WhatsApp opened. Review the draft, add any details you choose, then tap Send.", "Opening the website Request Centre…")
    copy_updates = {
        "WhatsApp opens with a draft. Review it before tapping Send; the website does not claim delivery.": "The Request Centre creates a website reference only after the school database saves your request.",
        "Start on Verified WhatsApp": "Start a Website Request",
        "Open WhatsApp": "Open Request Centre",
        "WhatsApp opens a draft for you to review and send.": "Create a website reference and track the request privately.",
        "Use the check section on this page to open the verified school WhatsApp, or call the office with your application details.": "Use the website Request Centre to create or check a request, or call the office with your reference.",
        "Message the verified WhatsApp line or call the office to confirm the current schedule before payment.": "Use the website Request Centre or call the office to confirm the current schedule before payment.",
    }
    if rel != "contact.html":
        for former, replacement in copy_updates.items():
            text = text.replace(former, replacement)
        # A transformed same-site link must not keep the old external-link target.
        text = re.sub(r'<a(?P<before>[^>]*?)\s+target="_blank"\s+rel="noopener"(?P<after>[^>]*?href="/request-centre(?:\.html)?[^"\s]*"[^>]*)>', r'<a\g<before>\g<after>>', text, flags=re.I)
    if rel == "admissions.html":
        text = text.replace('window.location.href="/request-centre.html?type=admission";\n  U.toast', 'window.location.href=kind==="receipt"?"/request-centre.html?type=receipt_verification":"/request-centre.html?type=admission";\n  U.toast', 1)

    if text != original:
        path.write_text(text, encoding="utf-8")
        return 1
    return 0


def main() -> None:
    changed = 0
    frozen_files = {"developer.html", "developer-review.html", "developer-operations.html"}
    for path in sorted(ROOT.rglob("*.html")):
        rel = path.relative_to(ROOT)
        if any(part.startswith(".") for part in rel.parts) or rel.parts[0] == "portal" or rel.as_posix() in frozen_files:
            continue
        changed += transform_file(path)
    print(f"Request workflow routing applied; {changed} HTML files updated.")


if __name__ == "__main__":
    main()
