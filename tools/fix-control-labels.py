#!/usr/bin/env python3
"""Add a programmatic accessible name to any remaining static form control."""
from pathlib import Path
from html import unescape
import re

ROOT = Path(__file__).resolve().parents[1]
FILES = sorted(ROOT.glob("*.html")) + sorted((ROOT / "portal").glob("*.html"))

SPECIAL = {
    "trkFormPhone": "Phone number used for the admission form",
    "trkPhone": "Phone number used for the application",
    "rcNo": "Receipt or payment reference number",
    "staffQ": "Search staff by name",
    "typeFilter": "Filter news by type",
    "dateFilter": "Filter news by date",
    "shopSearch": "Search school shop items",
    "importFile": "Choose review decision file to import",
    "dvPhone": "Developer phone number",
    "dvPass": "Developer password",
    "dvFile": "Choose school data backup file",
    "dvNotes": "Developer notes",
}


def clean(s: str) -> str:
    s = re.sub(r"\$\{.*?\}", "", s)
    s = re.sub(r"([a-z])([A-Z])", r"\1 \2", s)
    s = s.replace("_", " ").replace("-", " ")
    return " ".join(s.split()).strip(" .")


def apply(path: Path) -> None:
    text = path.read_text()
    labelled = set(re.findall(r'<label\b[^>]*\bfor="([^"]+)"', text, re.I))
    counter = 0

    pattern = re.compile(r'<(input|select|textarea)\b([^>]*)>', re.I)

    def repl(m: re.Match[str]) -> str:
        nonlocal counter
        tag, attrs = m.group(1), m.group(2)
        if re.search(r'\btype="hidden"', attrs, re.I):
            return m.group(0)
        if re.search(r'\baria-(?:label|labelledby)=', attrs, re.I):
            return m.group(0)
        ident_m = re.search(r'\bid="([^"]+)"', attrs, re.I)
        ident = ident_m.group(1) if ident_m else ""
        if ident and ident in labelled:
            return m.group(0)
        placeholder_m = re.search(r'\bplaceholder="([^"]*)"', attrs, re.I)
        name_m = re.search(r'\bname="([^"]+)"', attrs, re.I)
        type_m = re.search(r'\btype="([^"]+)"', attrs, re.I)
        label = SPECIAL.get(ident, "")
        if not label and placeholder_m:
            p = clean(unescape(placeholder_m.group(1)))
            if p and p != " ": label = p
        if not label and name_m:
            label = clean(name_m.group(1))
        if not label and ident:
            label = clean(ident)
        if not label and type_m and type_m.group(1).lower() == "file":
            label = "Choose a file"
        if not label:
            counter += 1
            label = f"Form field {counter}"
        return f'<{tag}{attrs} aria-label="{label}">'

    out = pattern.sub(repl, text)
    path.write_text(out)


for file in FILES:
    apply(file)
print(f"Checked accessible names in {len(FILES)} HTML files.")
