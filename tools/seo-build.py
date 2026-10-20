#!/usr/bin/env python3
"""
Static SEO pass.

Writes real <meta> into each page at build time rather than injecting from JS,
because crawlers that do not execute scripts must still see the description,
canonical and social card. Run after adding or renaming a page:

    python3 tools/seo-build.py

Also regenerates sitemap.xml so new pages are discoverable.
"""
import re, glob, os, datetime

SITE = "https://www.treasureacademyageva.com"

# Hand-written, page-specific. Kept under ~158 chars so Google does not truncate.
DESC = {
 "index.html": "Treasure Academy, Ageva — a Creche to Primary 6 school in Ageva, Okene, Kogi State. Strong foundations in reading, maths and character. Admissions open.",
 "about.html": "Our story, mission and the people behind Treasure Academy, Ageva — a Creche to Primary 6 school serving Ageva and Okene, Kogi State.",
 "academics.html": "Phonics, mathematics, science and computer studies from Creche to Primary 6 at Treasure Academy, Ageva, Okene — how we teach and assess.",
 "admissions.html": "How to enrol your child at Treasure Academy, Ageva. Entry classes, required documents, fees and the admission steps for the 2026/2027 session.",
 "admission-form.html": "Complete the Treasure Academy, Ageva paid admission form online and receive a receipt you can present at the school office in Okene.",
 "alumni.html": "Meet our staff and the Common Entrance graduates of Treasure Academy, Ageva — exam records for the 2023 and 2025 classes, Okene, Kogi State.",
 "anthem.html": "The school anthem, creed and pledge recited every morning at Treasure Academy, Ageva, Okene.",
 "birthdays.html": "Staff birthdays at Treasure Academy, Ageva — send a message to the teachers and staff celebrating this month.",
 "board.html": "Latest notices for parents, pupils and staff of Treasure Academy, Ageva — meetings, deadlines and term announcements.",
 "calendar.html": "Term dates, mid-term break, examinations and resumption for the current session at Treasure Academy, Ageva, Okene.",
 "careers.html": "Teaching and support vacancies at Treasure Academy, Ageva. See open roles and how to apply to join our team in Okene, Kogi State.",
 "class.html": "Creche, Pre-Nursery, Nursery and Primary 1 to 6 at Treasure Academy, Ageva — what each class covers and the daily activities.",
 "contact.html": "Call, email, WhatsApp or visit Treasure Academy, Ageva — opposite Morak Pure-Water Factory, Ageva, Okene, Kogi State.",
 "elearning.html": "Free Common Entrance practice questions for Primary 6 pupils of Treasure Academy, Ageva — English, Mathematics and General Paper.",
 "exams.html": "Examination timetable for the current term at Treasure Academy, Ageva — dates, subjects and papers by class.",
 "fees.html": "School fees per class at Treasure Academy, Ageva, Okene — tuition and what each term covers, with bank transfer payment details.",
 "holiday.html": "Holiday assignments for every class at Treasure Academy, Ageva — keep your child learning through the break.",
 "homework.html": "Daily homework posted by class teachers at Treasure Academy, Ageva so parents can follow their child's work at home.",
 "lost-found.html": "Lost and found items at Treasure Academy, Ageva — report a missing item or claim property handed in at the school office.",
 "news.html": "News and events from Treasure Academy, Ageva — excursions, prize-giving, open day, cultural day and school announcements.",
 "openday.html": "Visit Treasure Academy, Ageva on Open Day — tour the classrooms, meet the teachers and see the school before you enrol.",
 "photo-day.html": "Book a school photograph session for your child at Treasure Academy, Ageva — dates, packages and how to pay.",
 "poster.html": "Full price list for uniforms, books and supplies from the Treasure Academy, Ageva school shop.",
 "privacy.html": "How Treasure Academy, Ageva collects, uses and protects the personal information of pupils and parents. Your rights and how to contact us about your data.",
 "safeguarding.html": "Safeguarding and child protection at Treasure Academy, Ageva — how we keep every pupil safe and how parents, pupils and staff can raise a concern.",
 "pta.html": "Parents-Teachers Association of Treasure Academy, Ageva — meeting dates, minutes and how parents can get involved.",
 "reading.html": "The Reading Corner at Treasure Academy, Ageva — book of the week, the reading leaderboard and stories for our pupils.",
 "receipt.html": "Your Treasure Academy, Ageva admission form payment receipt — print it or present it at the school office.",
 "search.html": "Search the Treasure Academy, Ageva website — fees, uniform, transport, admissions, calendar and more.",
 "shop.html": "Buy uniforms, textbooks, notebooks, crayons and sportswear from the Treasure Academy, Ageva school shop.",
 "story.html": "Read the full story from Treasure Academy, Ageva, Okene — news, events and life at our school.",
 "support.html": "Support Treasure Academy, Ageva — how parents, alumni and well-wishers can contribute to the school's growth.",
 "testimonials.html": "What parents say about Treasure Academy, Ageva — reviews from families in Ageva and Okene, Kogi State.",
 "transport.html": "School bus routes, pick-up points and transport fees for pupils of Treasure Academy, Ageva, Okene.",
 "uniform.html": "The complete Treasure Academy, Ageva uniform list with prices — daily wear, sportswear and where to buy.",
 "volunteer.html": "Volunteer at Treasure Academy, Ageva — read to a class, help at events or share a skill with our pupils.",
 "welcome.html": "New-parent welcome pack for Treasure Academy, Ageva — school routine, resumption times, uniform and what your child needs.",
}

# Private/receipt utilities that must never appear in search results or the
# sitemap. The owner explicitly approved admission-form, story and search as
# public discoverable pages in Batch 53.
NOINDEX = {"developer.html", "receipt.html"}

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
  "alternateName": "Treasure Academy",
  "slogan": "Our God is able",
  "description": "A Creche to Primary 6 private school in Ageva, Okene, Kogi State, Nigeria.",
  "url": SITE + "/",
  "logo": SITE + "/assets/img/logo.jpg",
  "image": SITE + "/assets/img/og-cover.png",
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
    "opens": "07:00", "closes": "15:00",
  }],
}


def esc(s):
    return (s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
             .replace('"', "&quot;"))


def title_of(html):
    m = re.search(r"<title>(.*?)</title>", html, re.S)
    return re.sub(r"\s+", " ", m.group(1)).strip() if m else "Treasure Academy, Ageva"


def build():
    import json
    pages = sorted(glob.glob("*.html"))
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

        block = ["<!-- seo:start -->",
                 f'<meta name="description" content="{esc(desc)}">']
        if private:
            # Private pages get the robots tag and nothing else: no canonical,
            # no og:url, no breadcrumb. Publishing the URL of a page we are
            # asking crawlers to ignore is self-defeating.
            block.append('<meta name="robots" content="noindex, nofollow">')
            block.append("<!-- seo:end -->")
            marker = (re.search(r'([ \t]*)<link rel="stylesheet"', html)
                      or re.search(r'([ \t]*)<title[ >]', html)
                      or re.search(r'([ \t]*)</head>', html))
            if not marker:
                print("  no anchor:", p); continue
            ind = "\n" + marker.group(1)
            html = html[:marker.start()] + ind + ind.join(block) + html[marker.start():]
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
            ld = dict(ORG_LD)
            ld["potentialAction"] = {
                "@type": "SearchAction",
                "target": {"@type": "EntryPoint", "urlTemplate": SITE + "/search.html?q={search_term_string}"},
                "query-input": "required name=search_term_string",
            }
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
        block.append("<!-- seo:end -->")

        # Insert before the first stylesheet, whichever it is. Anchoring on one
        # specific filename broke silently when fonts.css was retired, so fall
        # back through <link rel=stylesheet>, then <title>, then <head>.
        marker = (re.search(r'([ \t]*)<link rel="stylesheet"', html)
                  or re.search(r'([ \t]*)<title[ >]', html)
                  or re.search(r'([ \t]*)</head>', html))
        if not marker:
            print("  no anchor:", p); continue
        ind = "\n" + marker.group(1)
        html = html[:marker.start()] + ind + ind.join(block) + html[marker.start():]

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
