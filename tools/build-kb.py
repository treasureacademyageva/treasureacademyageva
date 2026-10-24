#!/usr/bin/env python3
"""
Build the chatbot knowledge base from the site itself.

Everything the bot knows comes from current public pages and explicit policy
facts. Former browser-store prices, stock, routes, rosters and fee records are
never indexed as public truth. Run it after changing site content:

    python3 tools/build-kb.py

Writes assets/data/kb.json.
"""
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Pages worth indexing, with the topic words a parent would actually type.
PAGES = {
    "index.html":        ("Home", "home welcome treasure academy ageva okene kogi"),
    "about.html":        ("About Us", "about story history mission vision motto founder headmistress"),
    "admissions.html":   ("Admissions", "admission apply enrol enroll register registration join entry"),
    "admission-form.html": ("Admission Form", "admission form buy purchase entrance download print"),
    "academics.html":    ("Academics", "academics class classes curriculum subjects creche nursery primary "
                          "age group stream level grade what class school offer teach"),
    "fees.html":         ("School Fees", "fees fee payment pay cost price tuition bank transfer"),
    "exams.html":        ("Examinations", "exam exams examination timetable paper test"),
    "calendar.html":     ("School Calendar", "calendar term date resumption holiday event closing"),
    "contact.html":      ("Contact Us", "contact phone call whatsapp email address location directions message"),
    "transport.html":    ("Transport", "transport bus route pickup drop school bus fare"),
    "uniform.html":      ("Uniform", "uniform shirt skirt shorts cardigan sportswear sandals socks beret"),
    "shop.html":         ("School Shop", "shop book textbook notebook pen stationery buy price stock"),
    "news.html":         ("News & Events", "news event photo video gallery story party excursion"),
    "pta.html":          ("PTA", "pta parent teacher association meeting"),
    "elearning.html":    ("E-Learning", "elearning e-learning practice cbt common entrance revision "
                          "online learning digital computer practice question mock test score"),
    "homework.html":     ("Homework", "homework assignment work exercise"),
    "holiday.html":      ("Holiday Work", "holiday assignment vacation break work"),
    "testimonials.html": ("Testimonials", "testimonial review parent say feedback"),
    "board.html":        ("Notice Board", "notice board announcement"),
    "birthdays.html":    ("Birthdays", "birthday celebrate staff"),
    "alumni.html":       ("Alumni", "alumni old pupil graduate former"),
    "careers.html":      ("Careers", "career job vacancy employment teacher apply work"),
    "volunteer.html":    ("Volunteer", "volunteer help support community"),
    "openday.html":      ("Open Day", "open day visit tour inspection"),
    "photo-day.html":    ("Photo Day", "photo picture portrait photograph"),
    "reading.html":      ("Reading Corner", "reading book library story read"),
    "lost-found.html":   ("Lost & Found", "lost found missing item property"),
    "support.html":      ("Support", "support help assistance problem issue"),
    "anthem.html":       ("School Anthem", "anthem song sing"),
    "story.html":        ("Our Story", "story history beginning founder"),
    "search.html":       ("Search", "search find look"),
    "receipt.html":      ("Receipt Check", "receipt verify check payment confirm authentic"),
    "welcome.html":      ("Welcome", "welcome new parent start"),
    "class.html":        ("Class Pages", "class page primary nursery teacher"),
}

# All roles use the single server-authenticated entry. Former role-specific
# browser pages are not indexed or suggested.
ROUTES = [
    ("Secure School Portal", "portal/login.html", False,
     "parent teacher administrator login log in sign in register account password results attendance fees notices timetable report card my child"),
]


def strip_html(html):
    """Readable text from a page: drop code and chrome, keep the prose."""
    html = re.sub(r"(?is)<script.*?</script>", " ", html)
    html = re.sub(r"(?is)<style.*?</style>", " ", html)
    html = re.sub(r"(?is)<svg.*?</svg>", " ", html)
    html = re.sub(r"(?is)<(nav|footer|header)[^>]*>.*?</\1>", " ", html)
    # The masthead, ticker, skip link and chat widget are on every page. Left
    # in, they poison every answer with "Skip to content Portal Login ...".
    html = re.sub(r"(?is)<(div|section|aside)[^>]*\bclass=\"[^\"]*\b"
                  r"(topbar|navbar|brand|site-footer|ticker|newsTicker|motto-ribbon|"
                  r"emg-banner|chat-panel|chat-fab|clock-widget|breadcrumb|page-hero)"
                  r"\b[^\"]*\"[^>]*>.*?</\1>", " ", html)
    html = re.sub(r"(?is)<a[^>]*\bclass=\"[^\"]*skip[^\"]*\"[^>]*>.*?</a>", " ", html)
    html = re.sub(r"(?s)<!--.*?-->", " ", html)
    html = re.sub(r"<[^>]+>", " ", html)
    txt = re.sub(r"&nbsp;?", " ", html)
    txt = (txt.replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">")
              .replace("&quot;", '"').replace("&#39;", "'").replace("&mdash;", "-")
              .replace("&ndash;", "-").replace("&hellip;", "..."))
    return re.sub(r"\s+", " ", txt).strip()


def headings(html):
    out = []
    for m in re.finditer(r"(?is)<h[1-3][^>]*>(.*?)</h[1-3]>", html):
        h = strip_html(m.group(1))
        if h and len(h) < 90:
            out.append(h)
    return out


def common_boilerplate(texts):
    """Phrases repeated across most pages are chrome, not content."""
    from collections import Counter
    c = Counter()
    for t in texts:
        for frag in set(re.split(r"(?<=[.!?])\s+|\s{2,}", t)):
            frag = frag.strip()
            if 8 <= len(frag) <= 120:
                c[frag] += 1
    threshold = max(3, int(len(texts) * 0.55))
    return set(f for f, n in c.items() if n >= threshold)


def build():
    docs = []

    def add(doc_id, title, text, keywords, url, needs_login=False, kind="page"):
        text = re.sub(r"\s+", " ", text or "").strip()
        if not text:
            return
        docs.append({
            "id": doc_id, "title": title, "text": text[:1400],
            "keywords": keywords, "url": url,
            "needs_login": bool(needs_login), "kind": kind,
        })

    # ---- 1. every public page -------------------------------------------
    raws = {}
    for fname in PAGES:
        path = os.path.join(ROOT, fname)
        if os.path.exists(path):
            raws[fname] = open(path, encoding="utf-8", errors="ignore").read()
    boiler = common_boilerplate([strip_html(r) for r in raws.values()])

    def de_chrome(text):
        for frag in boiler:
            text = text.replace(frag, " ")
        # Whatever survives of the skip link / brand line goes too.
        text = re.sub(r"(?i)\bskip to (main )?content\b", " ", text)
        text = re.sub(r"(?i)\bportal login\b", " ", text)
        # The page title and address line repeat on every page.
        text = re.sub(r"(?i)\s*[-\u2013\u2014]\s*Treasure Academy,? Ageva\b", " ", text)
        text = re.sub(r"(?i)\bTreasure Academy,? Ageva\b", " ", text)
        text = re.sub(r"(?i)\bAgeva,? Okene,? Kogi State\b", " ", text)
        text = re.sub(r"(?i)\b(Print|Download)\s+\w+\b", " ", text)
        return re.sub(r"\s+", " ", text).strip(" .,-|")

    for fname, (title, kw) in sorted(PAGES.items()):
        if fname not in raws:
            continue
        raw = raws[fname]
        body = de_chrome(strip_html(raw))
        # Pages whose content is painted by JavaScript leave almost nothing in
        # the HTML. Indexing that shell makes the bot answer with a page title.
        # The live-data documents below carry the real content for these.
        if len(body) < 140:
            continue
        hs = headings(raw)
        add("page:" + fname, title, body,
            (kw + " " + " ".join(hs)).lower(), fname, False, "page")

        # Long pages become several passages so retrieval can be precise.
        # Split on sentence boundaries: slicing every 700 characters cuts words
        # in half ("est pride - an online portal"), which reads like a broken
        # machine and wrecks the term weighting for that passage.
        if len(body) > 900:
            sentences = re.split(r"(?<=[.!?])\s+", body)
            chunk, n = "", 2
            for sent in sentences:
                if len(chunk) + len(sent) > 650 and chunk:
                    add("page:%s#%d" % (fname, n), title, chunk.strip(),
                        kw.lower(), fname, False, "page")
                    n += 1
                    chunk = sent + " "
                else:
                    chunk += sent + " "
            if chunk.strip() and n <= 7:
                add("page:%s#%d" % (fname, n), title, chunk.strip(),
                    kw.lower(), fname, False, "page")

    # Former browser store data is intentionally not indexed. Prices, stock,
    # routes, rosters and fee records remain unverified until reconciled in the
    # protected office schema; static store.js values are not public truth.

    # ---- 2d. the FAQ blocks the school wrote itself ----------------------
    # contact.html and admissions.html each hold a FAQS array rendered by
    # JavaScript, so none of it survived the HTML scrape. These are the exact
    # questions the school chose to answer, which makes them the highest
    # quality content on the site.
    for fname in ("contact.html", "admissions.html"):
        path = os.path.join(ROOT, fname)
        if not os.path.exists(path):
            continue
        raw = open(path, encoding="utf-8", errors="ignore").read()
        pos = raw.find("FAQS=[")
        if pos < 0:
            continue
        bstart = raw.find("[", pos)
        depth = 0
        block = ""
        for k in range(bstart, len(raw)):
            if raw[k] == "[":
                depth += 1
            elif raw[k] == "]":
                depth -= 1
                if depth == 0:
                    block = raw[bstart:k + 1]
                    break
        pairs = re.findall(
            r'\[\s*"((?:[^"\\]|\\.)*)"\s*,\s*"((?:[^"\\]|\\.)*)"\s*\]', block)
        for n, (question, answer) in enumerate(pairs, 1):
            clean = re.sub(r"<[^>]+>", " ", answer)
            clean = clean.replace("\\n", " ").replace('\\"', '"')
            clean = re.sub(r"\s+", " ", clean).strip()
            add("faq:%s:%d" % (fname, n), question.rstrip("?"),
                question + " " + clean,
                question.lower().replace("?", ""), fname, False, "faq")

    # ---- 3. routes ------------------------------------------------------
    for title, url, needs_login, kw in ROUTES:
        add("route:" + url, title,
            "%s is at %s.%s" % (title, url,
                                " You need to be logged in to use it." if needs_login else ""),
            kw, url, needs_login, "route")

    # ---- 4. things a parent asks that no page states outright -----------
    facts = [
        ("fact:payment", "Safe School Payments",
         "Approved payment methods are manual bank transfer using the account on a signed-in portal invoice, or an in-person transaction on the school physical office POS. Both require manual office verification. A notification or POS record is not a receipt; an official receipt appears only after verification. There is no online card form, card-data storage or WhatsApp payment-evidence workflow.",
         "pay payment bank transfer office pos receipt invoice verify card whatsapp evidence", "fees.html", False),
        ("fact:password", "Portal Registration and Login Help",
         "Parents create their own phone-and-password accounts through a private TA-LINK code for an existing pupil, a phone-bound TA-FAMILY invitation for a second parent, or the restricted applicant route. The Headmistress does not create ordinary parent accounts. Browser sessions are not made persistent; use a structured account-help request if access fails.",
         "password login phone register ta-link ta-family applicant account help", "portal/login.html", False),
        ("fact:results", "Checking Results",
         "A signed-in parent can view published results only for a verified linked pupil. Payment never publishes a result, changes admission, changes promotion or controls portal access.",
         "result results report card grade score check linked pupil published", "portal/login.html", True),
        ("fact:whatsapp", "WhatsApp Is Ordinary Contact",
         "WhatsApp 09063932487 is an ordinary contact line only. Structured admissions, account help, fees, shop, transport and record requests belong on the website or in the signed-in portal. WhatsApp is not payment evidence and does not create an official request record.",
         "whatsapp contact request payment evidence official record", "request-centre.html", False),
        ("fact:head", "School Leadership",
         "The Headmistress of Treasure Academy, Ageva is Mrs. Salihu Nanahawa. Contact the school through the public Contact page or website Request Centre.",
         "headmistress head principal leadership management", "about.html", False),
        ("fact:where", "Where the School Is",
         "Treasure Academy is opposite Morak Pure-Water Factory in Ageva, Okene, Kogi State. The Contact page has current directions and public contact details.",
         "where located location address directions map visit", "contact.html", False),
        ("fact:classes", "Exact School Progression",
         "The class progression is Creche, Pre-Nursery, Nursery 1, Nursery 2, Primary 1, Primary 2, Primary 3, Primary 4, Primary 6 and Graduate Hall. There is no Primary 5; Primary 4 progresses directly to Primary 6.",
         "classes progression primary 4 primary 5 primary 6 graduate hall", "academics.html", False),
        ("fact:family", "Linked Parents and Children",
         "One parent account may link several verified children. A pupil may have at most two active parents or guardians, each with a separate account. A name and class alone never reveal a pupil or grant access.",
         "siblings multiple children second parent guardian family link privacy", "portal/login.html", False),
        ("fact:new-parent", "Starting an Admission Enquiry",
         "A new family uses the restricted applicant route or the verified school office. The administrators decide admission. Payment never approves admission, and payment details appear only on an official invoice.",
         "new parent applicant admission enrol apply invoice", "admissions.html", False),
        ("fact:visit", "Visiting the School",
         "Use the website Request Centre to ask for a school visit, then follow the office response. Do not publish a child list, medical file or other unnecessary private information in a public message.",
         "visit tour appointment school office request", "request-centre.html?type=school_visit", False),
        ("fact:homework", "Homework Is Offline",
         "Teachers may publish clear homework instructions, but the website does not accept pupil uploads or online assignment submissions. Pupils complete and return work through the school-approved offline process.",
         "homework assignment submit upload online offline teacher", "homework.html", False),
        ("fact:cbt", "Primary 6 Common Entrance Practice",
         "The CBT-style activity is only for Primary 6 Common Entrance practice. It is practice, not an official examination or published result.",
         "cbt common entrance practice primary 6 exam", "elearning.html", False),
        ("fact:shop", "School Materials Orders",
         "Verified school materials belong in the signed-in parent portal. Physical products use sizes or variants, real stock reservations and office collection or teacher handover after release. Unavailable items use a restock request; term fees and transport are not cart products.",
         "shop materials uniform stock size order collection teacher handover restock", "shop.html", True),
        ("fact:transport", "School Transport Requests",
         "A linked parent requests transport in the signed-in portal. The school reviews route and capacity before issuing any service invoice. Transport does not change physical stock and a request does not guarantee a place.",
         "transport route capacity request invoice linked pupil", "transport.html", True),
        ("fact:graduates", "Graduate Hall and Graduate Wall",
         "Graduation keeps the permanent pupil identity and history. Parents see their linked former pupils privately in Your Graduates. The public Graduate Wall shows only a consent-approved display name, graduation session and optional message.",
         "graduate hall wall alumni consent former pupil your graduates", "alumni.html", False),
        ("fact:birthdays", "Birthday Privacy",
         "Birthday information is limited to authorised staff and the Headmistress. Pupil and staff birthday dates are not published on the public website.",
         "birthday privacy staff headmistress pupil date", "birthdays.html", False),
    ]
    for fid, title, text, kw, url, need in facts:
        add(fid, title, text, kw, url, need, "fact")

    os.makedirs(os.path.join(ROOT, "assets/data"), exist_ok=True)
    out = os.path.join(ROOT, "assets/data/kb.json")
    payload = {"version": 1, "count": len(docs), "docs": docs}
    with open(out, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))

    kinds = {}
    for d in docs:
        kinds[d["kind"]] = kinds.get(d["kind"], 0) + 1
    size = os.path.getsize(out)
    print("kb.json written: %d documents, %.1f KB" % (len(docs), size / 1024.0))
    for k in sorted(kinds):
        print("   %-6s %d" % (k, kinds[k]))
    return 0


if __name__ == "__main__":
    sys.exit(build())
