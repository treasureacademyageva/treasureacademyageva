#!/usr/bin/env python3
"""
Static SEO pass.

Writes real <meta> into each page at build time rather than injecting from JS,
because crawlers that do not execute scripts must still see the description,
canonical and social card. Run after adding or renaming a page:

    python3 tools/seo-build.py

Also regenerates sitemap.xml so new pages are discoverable.
"""
import re, glob, os, datetime, html as html_lib

SITE = "https://www.treasureacademyageva.com"

# Hand-written, page-specific. Kept under ~158 chars so Google does not truncate.
DESC = {
 "index.html": "Treasure Academy, Ageva — a Creche to Primary 6 school in Ageva, Okene, Kogi State. Strong foundations in reading, maths and character. Admissions open.",
 "about.html": "Our story, mission and the people behind Treasure Academy, Ageva — a Creche to Primary 6 school serving Ageva and Okene, Kogi State.",
 "academics.html": "Phonics, mathematics, science and computer studies from Creche to Primary 6 at Treasure Academy, Ageva, Okene — how we teach and assess.",
 "admissions.html": "How to enrol your child at Treasure Academy, Ageva. Entry classes, required documents, fees and the admission steps for the 2026/2027 session.",
 "admission-form.html": "Safe admission-form guidance for Treasure Academy, Ageva — admission decisions stay separate from payment, and payment details appear only on an official invoice.",
 "alumni.html": "Former-pupil record requests and consent-cleared achievement updates at Treasure Academy, Ageva, with clear privacy and safeguarding boundaries.",
 "anthem.html": "The restored Treasure Academy school anthem, creed, pledge and motto, preserved from the previous website for final owner review.",
 "birthdays.html": "Staff birthday-notice guidance for Treasure Academy, Ageva. Children’s birthdays are not displayed publicly; contact the office to pass on a private greeting.",
 "board.html": "School-notice guidance for Treasure Academy, Ageva. Check published news and confirm dates, closures, deadlines and payment instructions with the office.",
 "calendar.html": "Current term-date guidance for Treasure Academy, Ageva, with verified office contacts for resumption, breaks, examinations and closing dates.",
 "careers.html": "Careers at Treasure Academy, Ageva — ask the office whether any verified vacancy is open and confirm the approved application process before sending documents.",
 "class.html": "Creche, Pre-Nursery, Nursery, Primary 1–4 and Primary 6 at Treasure Academy, Ageva — what each class covers and the daily activities.",
 "contact.html": "Call, email, WhatsApp or visit Treasure Academy, Ageva — opposite Morak Pure-Water Factory, Ageva, Okene, Kogi State.",
 "credits.html": "Website design and implementation credits for Treasure Academy, Ageva, including publisher, data-controller and Paragon Hub processor roles.",
 "elearning.html": "Three Common Entrance-style practice questions for Primary 6 revision in Mathematics, English and Basic Science. Scores stay on the page.",
 "explore.html": "Explore every part of the Treasure Academy, Ageva website by task — admissions, classes, fees, family information, school news and support.",
 "exams.html": "Examination guidance for Treasure Academy, Ageva — ask the school for the current class timetable. Public candidate records and results are not published.",
 "fees.html": "School fee and safe-payment guidance for Treasure Academy, Ageva: current amounts and approved bank details appear only in the signed-in portal or official invoice.",
 "holiday.html": "Holiday-learning guidance for Treasure Academy, Ageva. Ask the class teacher for current work; assignments are not submitted through the public website.",
 "homework.html": "Homework guidance for Treasure Academy, Ageva. Confirm current work with the class teacher; the public website does not accept assignment submissions.",
 "lost-found.html": "Lost-property guidance for Treasure Academy, Ageva — contact the school office to report or claim an item without publishing a child’s private details.",
 "news.html": "Published news and verified website updates from Treasure Academy, Ageva, with current admissions guidance and official contact channels.",
 "openday.html": "The previous Treasure Academy Open Day campaign is closed. Contact the verified school office to arrange a current school visit by appointment.",
 "photo-day.html": "The previous Treasure Academy Photo Day booking is closed. Ask the office about any current arrangement, consent process, price and collection method.",
 "poster.html": "Current uniform and school-supply guidance for Treasure Academy, Ageva — confirm approved items, prices and stock with the school office.",
 "privacy.html": "How Treasure Academy, Ageva handles website preferences, verified contact channels and school records, including children's privacy and parent rights.",
 "safeguarding.html": "Safeguarding and child protection at Treasure Academy, Ageva — how we keep every pupil safe and how parents, pupils and staff can raise a concern.",
 "pta.html": "Parents–Teachers Association information for Treasure Academy, Ageva — ask the office for the next confirmed meeting, agenda and approved contributions.",
 "reading.html": "Reading-at-home guidance from Treasure Academy, Ageva. The former device-only log and leaderboard were retired and did not create a school record.",
 "receipt.html": "Verify a Treasure Academy receipt through the school office. A public browser-only lookup cannot prove that a payment reached the school.",
 "request-centre.html": "Send a structured request to Treasure Academy, receive a website reference and privately check its status with a tracking code.",
 "search.html": "Search the Treasure Academy, Ageva website — fees, uniform, transport, admissions, calendar and more.",
 "shop.html": "School-material ordering belongs in the signed-in parent portal, with verified stock, current prices and manually verified payment guidance.",
 "story.html": "Read the full story from Treasure Academy, Ageva, Okene — news, events and life at our school.",
 "support.html": "How to discuss a proposed contribution safely through the website Request Centre and require official written payment instructions.",
 "testimonials.html": "Private family-feedback guidance for Treasure Academy, Ageva. Unverified sample endorsements have been removed and publication requires review and consent.",
 "transport.html": "School transport enquiry guidance for Treasure Academy, Ageva — ask the office to confirm current availability, pickup arrangements and fees.",
 "uniform.html": "Uniform guidance for Treasure Academy, Ageva — ask the office to confirm the current approved list, sizes, prices and stock before paying.",
 "volunteer.html": "Volunteer enquiries for Treasure Academy, Ageva — contact the office to discuss skills, supervision and required safeguarding checks before a visit.",
 "welcome.html": "New-family checklist for Treasure Academy, Ageva — confirm admission, start date, fees, uniform, books, transport and parent support with the office.",
 "website-help.html": "Report a missing, unclear or broken Treasure Academy website page through the website Request Centre, with optional privacy-safe diagnostics.",
}

DESC["news/2026-2027-admissions-open.html"] = "Treasure Academy, Ageva is receiving 2026/2027 admission enquiries from Creche to Primary 6. Follow the verified, bank-transfer-safe application steps."
DESC.update({
    "news/2017-first-graduation-ceremony.html": "Treasure Academy’s school archive records its first full graduation ceremony in 2017 and the early history of the school in Ageva.",
    "news/2018-second-graduation-ceremony.html": "Treasure Academy’s school archive looks back at the second graduation ceremony held in Ageva in July 2018.",
    "news/2019-third-graduation-ceremony.html": "Treasure Academy’s school archive looks back at its third graduation ceremony and the 2019 graduands’ next-stage preparation.",
    "news/2020-fourth-graduation-ceremony.html": "Treasure Academy’s school archive records how the fourth graduating set was recognised during the Covid-19 period in 2020.",
    "news/2021-fifth-graduation-ceremony.html": "Treasure Academy’s school archive records its fifth graduation and a Common Entrance centre milestone in August 2021.",
})

for _slug, _name, _focus in [
    ("creche", "Creche", "gentle early care, routines and speech development"),
    ("pre-nursery", "Pre-Nursery", "play-based letters, numbers, colours and social learning"),
    ("nursery-1", "Nursery 1", "phonics, handwriting and early numeracy"),
    ("nursery-2", "Nursery 2", "reading fluency, spelling and primary-school readiness"),
    ("primary-1", "Primary 1", "English, Mathematics, handwriting and study habits"),
    ("primary-2", "Primary 2", "vocabulary, multiplication and confident writing"),
    ("primary-3", "Primary 3", "reasoning, science discovery and computer skills"),
    ("primary-4", "Primary 4", "wide reading, problem solving and independent learning"),
    ("primary-6", "Primary 6", "Common Entrance practice and secondary-school readiness"),
]:
    DESC[f"classes/{_slug}.html"] = f"{_name} at Treasure Academy, Ageva — {_focus}, taught with care in Ageva, Okene, Kogi State."

# Private/receipt utilities that must never appear in search results or the
# sitemap. The owner explicitly approved admission-form, story and search as
# public discoverable pages in Batch 53.
NOINDEX = {
    "developer.html", "admission-form.html", "receipt.html", "search.html", "class.html", "story.html", "anthem.html",
    "birthdays.html", "board.html", "holiday.html", "homework.html", "lost-found.html",
    "openday.html", "photo-day.html", "poster.html", "reading.html",
    "shop.html", "support.html", "testimonials.html", "volunteer.html", "website-help.html",
    "news/2017-first-graduation-ceremony.html", "news/2018-second-graduation-ceremony.html",
    "news/2019-third-graduation-ceremony.html", "news/2020-fourth-graduation-ceremony.html",
    "news/2021-fifth-graduation-ceremony.html",
}

# PRIVATE is stricter than NOINDEX. A noindex utility page (receipt, search) is
# still a normal page and keeps its canonical and social tags. A private page
# must not advertise its own URL anywhere: no canonical, no og:url, no
# breadcrumb. developer.html is the internal console, and 404 is an error page -
# neither should be published. Tests assert developer.html is unlinked.
PRIVATE = {"developer.html", "404.html"}

# Pages in NOINDEX still need an entry here: build() skips anything without a
# description, and skipping a noindex page means it ships with no robots tag
# at all - the opposite of what NOINDEX is for.
for _p, _d in {
    "developer.html": "Internal developer console for Treasure Academy, Ageva. Private area, not for public use.",
}.items():
    DESC.setdefault(_p, _d)

ORG_LD = {
  "@context": "https://schema.org",
  "@type": "School",
  "name": "Treasure Academy, Ageva",
  "legalName": "Treasure Academy Ageva Limited",
  "alternateName": "Treasure Academy",
  "foundingDate": "2016",
  "slogan": "Our God is able",
  "description": "A Creche to Primary 6 private school in Ageva, Okene, Kogi State, Nigeria.",
  "url": SITE + "/",
  "image": SITE + "/assets/img/og-cover.png",
  "logo": SITE + "/assets/img/logo.jpg",
  "telephone": "+234 814 194 3478",
  "email": "treasuregroupofschool@gmail.com",
  "address": {
    "@type": "PostalAddress",
    "streetAddress": "Opposite Morak Pure-Water Factory, Ageva",
    "addressLocality": "Okene",
    "addressRegion": "Kogi State",
    "addressCountry": "NG",
  },
  "areaServed": ["Ageva", "Okene", "Kogi State"],
  "openingHoursSpecification": [{
    "@type": "OpeningHoursSpecification",
    "dayOfWeek": ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    "opens": "07:30", "closes": "15:00",
  }],
}


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def title_of(html):
    m = re.search(r"<title>(.*?)</title>", html, re.S)
    return html_lib.unescape(re.sub(r"\s+", " ", m.group(1))).strip() if m else "Treasure Academy, Ageva"


def insert_seo_block(html, block):
    """Insert one clean block before the first stylesheet and remain idempotent."""
    marker = (re.search(r'([ \t]*)<link rel="stylesheet"', html)
              or re.search(r'([ \t]*)<title[ >]', html)
              or re.search(r'([ \t]*)</head>', html))
    if not marker:
        return None
    indent = marker.group(1)
    prefix = html[:marker.start()].rstrip()
    suffix = html[marker.start():].lstrip("\r\n")
    return prefix + "\n\n" + indent + ("\n" + indent).join(block) + "\n\n" + suffix


def build():
    import json
    # Keep real nested paths in canonical and sitemap URLs. Normalising here
    # prevents classes/news entries from collapsing to root-level basenames.
    pages = sorted(p.replace(os.sep, "/") for p in (glob.glob("*.html") + glob.glob("classes/*.html") + glob.glob("news/*.html")))
    changed = 0
    for p in pages:
        html = open(p, encoding="utf-8").read()
        orig = html
        desc = DESC.get(p)
        if not desc:
            continue
        title = title_of(html)
        canon = SITE + "/" + ("" if p == "index.html" else p)
        noindex = p in NOINDEX or p in PRIVATE
        private = p in PRIVATE

        # Strip any previous pass so the script stays idempotent.
        html = re.sub(r'\n?[ \t]*<!-- seo:start -->.*?<!-- seo:end -->', "", html, flags=re.S)
        html = re.sub(r'\n?[ \t]*<meta name="description"[^>]*>', "", html)
        html = re.sub(r'\n?[ \t]*<meta name="robots"[^>]*>', "", html)

        block = ["<!-- seo:start -->",
                 f'<meta name="description" content="{esc(desc)}">']
        if private:
            # Private pages get the robots tag and nothing else: no canonical,
            # no og:url, no breadcrumb. Publishing the URL of a page we are
            # asking crawlers to ignore is self-defeating.
            block.append('<meta name="robots" content="noindex, nofollow, noarchive">')
            block.append("<!-- seo:end -->")
            html = insert_seo_block(html, block)
            if html is None:
                print("  no anchor:", p); continue
            if html != orig:
                open(p, "w", encoding="utf-8").write(html); changed += 1
            continue
        block.append(f'<link rel="canonical" href="{canon}">')
        if noindex:
            block.append('<meta name="robots" content="noindex,follow">')
        else:
            block.append('<meta name="robots" content="index,follow,max-image-preview:large,max-snippet:-1">')
        block += [
            '<meta property="og:type" content="website">',
            f'<meta property="og:site_name" content="Treasure Academy, Ageva">',
            f'<meta property="og:title" content="{esc(title)}">',
            f'<meta property="og:description" content="{esc(desc)}">',
            f'<meta property="og:url" content="{canon}">',
            f'<meta property="og:image" content="{SITE}/assets/img/og-cover.png">',
            '<meta property="og:image:width" content="1424">',
            '<meta property="og:image:height" content="752">',
            '<meta property="og:locale" content="en_NG">',
            '<meta name="twitter:card" content="summary_large_image">',
            f'<meta name="twitter:title" content="{esc(title)}">',
            f'<meta name="twitter:description" content="{esc(desc)}">',
            f'<meta name="twitter:image" content="{SITE}/assets/img/og-cover.png">',
            '<meta name="geo.region" content="NG-KO">',
            '<meta name="geo.placename" content="Ageva, Okene, Kogi State">',
        ]
        if p == "index.html":
            school = dict(ORG_LD)
            school.pop("@context", None)
            school["@id"] = SITE + "/#school"
            website = {
              "@type": "WebSite", "@id": SITE + "/#website", "url": SITE + "/",
              "name": "Treasure Academy, Ageva", "alternateName": "Treasure Academy",
              "publisher": {"@id": SITE + "/#school"}, "inLanguage": "en-NG",
            }
            ld = {"@context": "https://schema.org", "@graph": [school, website]}
            block.append('<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>")
        else:
            crumb = {
              "@context": "https://schema.org", "@type": "BreadcrumbList",
              "itemListElement": [
                {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
                {"@type": "ListItem", "position": 2, "name": re.sub(r"\s*[—|].*$", "", title), "item": canon},
              ],
            }
            block.append('<script type="application/ld+json">' + json.dumps(crumb, ensure_ascii=False) + "</script>")
            if p == "news/2026-2027-admissions-open.html":
                article = {
                  "@context": "https://schema.org", "@type": "NewsArticle",
                  "headline": "2026/2027 Admissions Are Open",
                  "datePublished": "2026-09-15", "dateModified": "2026-10-21",
                  "mainEntityOfPage": canon, "inLanguage": "en-NG",
                  "author": {"@type": "Organization", "name": "Treasure Academy, Ageva", "url": SITE + "/"},
                  "publisher": {"@type": "Organization", "name": "Treasure Academy, Ageva", "url": SITE + "/"},
                  "image": [SITE + "/assets/img/og-cover.png"],
                  "description": desc,
                }
                block.append('<script type="application/ld+json">' + json.dumps(article, ensure_ascii=False) + "</script>")
        block.append("<!-- seo:end -->")

        # Insert before the first stylesheet, whichever it is. Anchoring on one
        # specific filename broke silently when fonts.css was retired, so fall
        # back through <link rel=stylesheet>, then <title>, then <head>.
        html = insert_seo_block(html, block)
        if html is None:
            print("  no anchor:", p); continue

        if html != orig:
            open(p, "w", encoding="utf-8").write(html)
            changed += 1

    # ---- sitemap ----
    today = datetime.date.today().isoformat()
    urls = []
    for p in pages:
        if p in NOINDEX or p not in DESC:
            continue
        loc = SITE + "/" + ("" if p == "index.html" else p)
        pri = "1.0" if p == "index.html" else ("0.9" if p in ("admissions.html", "about.html", "contact.html", "fees.html") else "0.7")
        freq = "daily" if p in ("index.html", "news.html", "board.html") else "weekly"
        urls.append(f"  <url>\n    <loc>{loc}</loc>\n    <lastmod>{today}</lastmod>\n"
                    f"    <changefreq>{freq}</changefreq>\n    <priority>{pri}</priority>\n  </url>")
    open("sitemap.xml", "w", encoding="utf-8").write(
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + "\n".join(urls) + "\n</urlset>\n")

    print(f"pages updated: {changed}")
    print(f"sitemap urls : {len(urls)}")


if __name__ == "__main__":
    build()
