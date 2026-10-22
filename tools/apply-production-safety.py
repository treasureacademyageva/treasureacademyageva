#!/usr/bin/env python3
"""Apply the production-safety/content/accessibility changes from the 2026-10-21 audit.

Idempotent: safe to rerun. It intentionally keeps school-owned public identity
and staff-wall content while removing browser-demo accounts, child results,
seed endorsements and expired operational records from the public bundle.
"""
from __future__ import annotations

import re
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
STORE = ROOT / "assets/js/store.js"


def replace_once(text: str, pattern: str, replacement: str, label: str) -> str:
    out, n = re.subn(pattern, replacement, text, count=1, flags=re.S)
    if n != 1:
        raise RuntimeError(f"{label}: expected one match, got {n}")
    return out


def sanitise_store() -> None:
    s = STORE.read_text()
    s = replace_once(s, r"const GRADS_SEED = \[.*?\n\];\n\nfunction subjectsFor", "const GRADS_SEED = [];\n\nfunction subjectsFor", "graduate seed")
    s = replace_once(s, r"    admins: \[.*?\n    \],\n    teachers: \[.*?\n    \],\n    formerTeachers:", "    admins: [],\n    teachers: [],\n    formerTeachers:", "account seeds")
    s = replace_once(s, r"    pupils: \[.*?\n    \],\n    duty:", "    pupils: [],\n    duty:", "pupil seeds")
    s = replace_once(s, r"    promotions: \[.*?\n    \],\n    newsEvents:", '''    promotions: [
      {id:"PR1", badge:"Admissions Open", title:"2026/2027 Admission Is On", text:"Creche, Pre-Nursery, Nursery and Primary forms are available through the school office. Confirm every payment instruction using the verified Call or WhatsApp line.", cta:"Admission Details", link:"admissions.html", color:"sun"}
    ],
    newsEvents:''', "promotions")
    s = replace_once(s, r"    newsEvents: \[.*?\n    \],\n\n    practiceQuestions:", '''    newsEvents: [
      {id:"NEA26", type:"news", title:"2026/2027 Admissions Are Open", date:"2026-09-15", image:"assets/img/hero-kids.png", videoUrl:"", views:0, likes:0, images:[], text:"Admissions are open from Creche to Primary 6. Contact the verified school office before paying.", story:"Admissions for the 2026/2027 academic session are open from Creche to Primary 6. Contact the school on 0814 194 3478 or the verified WhatsApp line 0906 393 2487 to confirm the current form fee, required documents and bank details before making a transfer. Visit the school office in Ageva to complete the official process."}
    ],

    practiceQuestions:''', "news seed")
    s = replace_once(s, r"    calendar: \[.*?\n    \],\n    testimonials: \[.*?\n    \],\n    registrations:", "    calendar: [],\n    testimonials: [],\n    registrations:", "calendar/testimonials")
    s = replace_once(s, r"    messages: \[.*?\n    \],\n    whatsapp:", "    messages: [],\n    whatsapp:", "messages")
    s = replace_once(s, r"    starsOfWeek: .*?\n    ticker:", "    starsOfWeek: {staff:null,pupil:null},\n    ticker:", "star seed")
    for key, next_key in [
        ("homework", "lostfound"), ("lostfound", "claims"), ("photoSlots", "suggestions"),
        ("exams", "holiday"), ("holiday", "teacherVotes"), ("ptaMeetings", "uniform"),
        ("alumni", "notices"),
    ]:
        s = replace_once(s, rf"    {key}: \[.*?\n    \],\n    {next_key}:", f"    {key}: [],\n    {next_key}:", key)
    s = replace_once(s, r"    openday: \{.*?\},\n    rsvps:", "    openday: {},\n    rsvps:", "open day")
    s = replace_once(s, r"    notices: \[.*?\n    \],\n    classPages:", '''    notices: [
      {id:"NT3", to:"all", title:"Admissions open for 2026/2027", text:"Contact the school office to confirm the current admission steps and payment details.", date:"2026-09-15", readBy:[]}
    ],
    classPages:''', "notices")
    # The shop remains an information route, but live stock/order claims are removed.
    s = replace_once(s, r"    shopItems: \[.*?\n    \],\n    timetable:", "    shopItems: [],\n    timetable:", "shop seed")

    # Do not recreate endorsements in older browser profiles.
    s = s.replace('''    if(!db.supportPledges) db.supportPledges = [
      {id:"SP1",name:"Blessing O.",amount:20000,msg:"For the library books. Once a Treasure pupil, always Treasure!",date:"2026-09-18",status:"Approved"},
      {id:"SP2",name:"Anonymous well-wisher",amount:5000,msg:"For classroom fans. God bless the children.",date:"2026-09-19",status:"Approved"}
    ];''', '    if(!db.supportPledges) db.supportPledges = [];')

    # Final fail-closed scrub removes old demo/private data already stored on a device.
    marker = "    if(!db.seq.order) db.seq.order = 1;\n    return db;"
    scrub = '''    if(!db.seq.order) db.seq.order = 1;

    /* Production safety: public pages must never be a database for accounts,
       children, results, payments or submissions. Remove old browser-demo
       records as well as current seeds. Public information stays in the
       allowlisted school/class/news/staff-wall structures above. */
    ["admins","teachers","pupils","results","attendance","applications",
     "registrations","messages","orders","formClaims","jobApps","rsvps",
     "volunteers","claims","visitors","sickbay","feePayments","resultViews",
     "alumni","graduates","testimonials","supportPledges","comments",
     "photoSlots","homework","holiday","exams","ptaMeetings","ptaAttend",
     "lostfound","readLog","readTop","restock"].forEach(function(k){
       db[k] = (k === "comments" || k === "ptaAttend") ? {} : [];
    });
    db.calendar = [];
    db.openday = {};
    return db;'''
    if marker not in s:
        raise RuntimeError("safety scrub marker missing")
    s = s.replace(marker, scrub, 1)

    STORE.write_text(s)


def update_html() -> None:
    root_pages = sorted(ROOT.glob("*.html"))
    excluded = {"developer.html", "developer-review.html"}
    wa_help = "https://wa.me/2349063932487?text=" + quote("Hello Treasure Academy, I need parent support.")

    for path in root_pages:
        s = path.read_text()
        # Failed analytics was a 404 on every route.
        s = re.sub(r'\s*<script defer src="/_vercel/insights/script\.js"></script>', "", s)

        if path.name not in excluded:
            # Public pages do not need database bridge, portal auth or 250KB of chatbot code.
            s = re.sub(r'<script defer src="assets/js/db-live\.js\?v=[^"]+"></script>', "", s)
            s = re.sub(r'\s*<script src="assets/js/sync\.js\?v=[^"]+"></script>', "", s)
            s = re.sub(r'\s*<script defer src="assets/js/chat-(?:entities|rag|core|ui)\.js\?v=[^"]+"></script>', "", s)
            s = re.sub(r'<script defer src="assets/js/auth-ui\.js\?v=[^"]+"></script>', "", s)
            if "assets/js/site.js" in s and "assets/js/safe-actions.js" not in s:
                s = re.sub(r'(<script src="assets/js/site\.js\?v=[^"]+"></script>)', r'\1\n<script src="assets/js/safe-actions.js?v=20261022-restoration1"></script>', s, count=1)

            # Honest CTA destinations while the secure portal is being rebuilt.
            s = s.replace('href="portal/login.html?mode=register"', 'href="admissions.html#apply"')
            s = s.replace('href="portal/login.html"', f'href="{wa_help}" target="_blank" rel="noopener"')
            s = s.replace('>Portal Login</a>', '>Parent Help</a>')
            s = s.replace('title="Portal Login" aria-label="Portal Login"', 'title="Parent help on WhatsApp" aria-label="Parent help on WhatsApp"')

        # Encode spaces in class query links.
        s = re.sub(r'href="class\.html\?class=([^"]* [^"]*)"', lambda m: 'href="class.html?class=' + quote(m.group(1), safe="-") + '"', s)

        # Associate visible field labels with their controls (control follows label).
        s = re.sub(
            r'<label(?![^>]*\bfor=)([^>]*)>(.*?)</label>(\s*)<(input|select|textarea)([^>]*\bid="([^"]+)"[^>]*)>',
            lambda m: f'<label for="{m.group(6)}"{m.group(1)}>{m.group(2)}</label>{m.group(3)}<{m.group(4)}{m.group(5)}>',
            s, flags=re.S,
        )
        # Floating labels follow their control.
        s = re.sub(
            r'<(input|select|textarea)([^>]*\bid="([^"]+)"[^>]*)>(\s*)<label(?![^>]*\bfor=)([^>]*)>',
            lambda m: f'<{m.group(1)}{m.group(2)}>{m.group(4)}<label for="{m.group(3)}"{m.group(5)}>',
            s,
        )
        path.write_text(s)


def main() -> None:
    sanitise_store()
    update_html()
    print("Applied production safety, privacy, performance, CTA and label fixes.")


if __name__ == "__main__":
    main()
