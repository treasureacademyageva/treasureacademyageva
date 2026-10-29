#!/usr/bin/env python3
"""Generate crawlable, privacy-safe static class pages."""
from pathlib import Path
from html import escape
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "classes"
OUT.mkdir(exist_ok=True)
SITE = "https://www.treasureacademyageva.com"

CLASSES = [
 ("pre-nursery", "Pre-Nursery", "First steps into happy learning.", "Pre-Nursery blends play with early learning as children begin to recognise letters, numbers, colours and classroom routines.", ["Letter and number play", "Painting and building", "Rhymes and stories", "Table manners and sharing"]),
 ("nursery-1", "Nursery 1", "Sounds, letters and numbers come alive.", "Nursery 1 builds reading and writing foundations with phonics, handwriting practice and simple numeracy.", ["Phonics and reading", "Handwriting", "Simple counting", "Colouring and craft"]),
 ("nursery-2", "Nursery 2", "Confident readers, ready for Primary.", "Nursery 2 develops reading fluency, spelling and number work so children enter Primary 1 with confidence.", ["Reading fluency", "Spelling and dictation", "Addition and subtraction", "Show and tell"]),
 ("primary-1", "Primary 1", "A strong start for primary school.", "Primary 1 strengthens English, Mathematics, handwriting and good study habits with patient guidance.", ["English and comprehension", "Mental mathematics", "Handwriting", "Computer awareness"]),
 ("primary-2", "Primary 2", "Growing minds and deeper skills.", "Primary 2 stretches vocabulary, multiplication and writing while building confidence through class participation.", ["Grammar and writing", "Multiplication practice", "Reading", "Team activities"]),
 ("primary-3", "Primary 3", "Thinking, reasoning and discovery.", "Primary 3 introduces deeper reasoning, science discovery and age-appropriate computer skills.", ["Reasoning skills", "Science discovery", "Computer studies", "Debate and quiz"]),
 ("primary-4", "Primary 4", "Independent learners emerge.", "Primary 4 pupils read more widely, solve more demanding mathematics and express ideas clearly in writing before progressing directly to Primary 6.", ["Essay writing", "Problem solving", "Reading and research", "Responsible leadership"]),
 ("primary-6", "Primary 6", "Finish primary school with confidence.", "Primary 6 follows Primary 4 in the school progression and focuses on Common Entrance practice, interviews and readiness for secondary school.", ["Common Entrance practice", "Interview skills", "Revision planning", "Secondary-school readiness"]),
]

ESSENTIALS = {
    "pre-nursery": ("₦12,300", "6 pencils, 2 big erasers, 3 razor blades and 1 packet of colour pencils", "₦38,300"),
    "nursery-1": ("₦12,300", "6 pencils, 2 erasers, 3 blades, 1 packet of colour pencils and 1 Drawing & Writing item", "₦38,300"),
    "nursery-2": ("₦15,800", "7 pencils, 2 erasers, 3 blades, 1 packet of colour pencils, 1 ruler and 1 Drawing & Writing item", "₦41,800"),
}

NAV = '<a href="/">Home</a><a href="/about">About</a><a href="/admissions">Admissions</a><a href="/academics" aria-current="page">Classes</a><a href="/fees">Fees</a><a href="/news">News</a><a href="/contact">Contact</a>'

for slug, name, tagline, about, activities in CLASSES:
    canonical = f"{SITE}/classes/{slug}.html"
    cards = "".join(f"<li>{escape(x)}</li>" for x in activities)
    if slug in ESSENTIALS:
        book_total, materials, new_pupil_total = ESSENTIALS[slug]
        essentials = (f'<div class="panel class-essentials"><h2>Current books and materials</h2>'
                      f'<p>The current {escape(name)} book package is <strong>{book_total}</strong>. Required writing materials are {escape(materials)}. Writing-material prices are not included.</p>'
                      f'<p>The current new-pupil admission and book total is <strong>{new_pupil_total}</strong>. Families may buy the required materials elsewhere. After promotion, use the list for the pupil’s new class.</p>'
                      f'<p><a href="/fees#{slug}-list">View the complete {escape(name)} prices and safe payment guidance →</a></p></div>')
    else:
        essentials = '<div class="panel class-essentials"><h2>Current fees and materials</h2><p>The school has not yet supplied a public book and writing-material list for this class. Confirm the current requirements before buying or paying.</p><p><a href="/fees">View verified fee and safe payment guidance →</a></p></div>'
    class_query = quote(name)
    if slug in {"pre-nursery", "nursery-1", "nursery-2"}:
        fallback, webp = "stage-nursery.jpg", "stage-nursery.webp"
    else:
        fallback, webp = "stage-primary.jpg", "stage-primary.webp"
    source = f'<source type="image/webp" srcset="/assets/img/{webp}">'
    class_media = f'<figure class="class-media"><picture>{source}<img src="/assets/img/{fallback}" width="1408" height="768" alt="Illustration for the {escape(name)} stage" loading="eager" decoding="async"></picture></figure>'
    progression = ("Primary 6 follows Primary 4 in Treasure Academy’s current class sequence because Primary 5 is not offered. "
                   "This final primary stage consolidates earlier learning and prepares pupils for Common Entrance and the move to secondary education. "
                   "Treasure Academy is an approved Common Entrance Centre, number BS/OKN/141."
                   if slug == "primary-6" else
                   f"This page gives families a clear introduction to {name}. The school office confirms individual placement after considering the child’s previous schooling and the current class availability.")
    html = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{escape(name)} — Treasure Academy, Ageva</title>
<link rel="icon" href="/assets/img/logo.jpg">
<link rel="stylesheet" href="/assets/css/main.css?v=20261022-restoration1">
<link rel="stylesheet" href="/assets/css/extra.css?v=20261022-restoration1">
<link rel="stylesheet" href="/assets/css/corporate.css?v=20261022-restoration1">
<link rel="stylesheet" href="/assets/css/site.css?v=20261028-remediation1">
<meta name="theme-color" content="#0E5A2E">
</head>
<body data-page="academics">
<a class="skip-link" href="#main">Skip to content</a>
<nav class="lite-nav" aria-label="Primary navigation"><div class="container"><a class="lite-brand" href="/" aria-label="Treasure Academy — homepage"><img class="logo-badge" src="/assets/img/logo.jpg" width="397" height="397" alt="" loading="eager" decoding="async"><span><strong>TREASURE ACADEMY</strong><small>Pre-Nursery · Nursery · Primary — Ageva</small></span></a><div class="lite-links">{NAV}</div><div class="lite-actions"><a class="lite-search" href="/search" aria-label="Search the website">Search</a><a class="lite-portal" href="/portal/login.html">Portal</a><button type="button" class="theme-btn icon-action" aria-label="Switch colour theme"></button><a class="btn btn-mint lite-apply" href="/admission-form">Apply</a></div></div></nav>
<header class="page-hero"><div class="container"><span class="sec-tag">Our Classes</span><h1>{escape(name)}</h1><p>{escape(tagline)}</p></div></header>
<main id="main"><section><div class="container class-overview">
{class_media}
<div class="panel"><h2>What children build in {escape(name)}</h2><p>{escape(about)}</p><p>{escape(progression)}</p><p>The learning highlights are a public overview rather than a fixed weekly timetable. Teachers may adjust the order and pace of classroom work to support the pupils in the class while keeping the stage goals clear.</p></div>
<div class="panel"><h2>Learning highlights</h2><ul class="tick">{cards}</ul><h3>How families can help</h3><p>Read and talk together, encourage a calm daily routine and share any useful information about the child’s earlier learning with the school. Ask the teacher or office when guidance is unclear rather than relying on an older class list or fee notice.</p><h3>Before applying</h3><p>Confirm the child’s placement, available places, current fee schedule and required documents with the school office. An enquiry is separate from an application, and an application remains subject to an authorised admission decision.</p></div>
{essentials}
</div></section>
<section class="class-enquiry-band"><div class="container"><div class="cta-band"><div><h2>Ask about {escape(name)}</h2><p>Confirm placement guidance, available places, current fees and required documents with the school office.</p></div><div><a class="btn btn-sun" data-class-enquiry="{escape(name)}" href="/request-centre?type=class_enquiry&amp;class={class_query}">Ask the Office about {escape(name)}</a> <a class="btn btn-white" href="/admissions">Admission Steps</a></div></div></div></section>
</main>
<footer class="universal-footer" id="siteFooter"><div class="container"><div class="uf-grid"><div class="uf-col uf-about"><a class="uf-brand" href="/"><img src="/assets/img/logo.jpg" width="397" height="397" alt="" loading="lazy" decoding="async"><b>Treasure Academy, Ageva</b></a><p>Pre-Nursery, Nursery and Primary education in Ageva, Okene.</p></div><div class="uf-col"><h2>School &amp; support</h2><nav class="uf-links" aria-label="School and support"><a href="/admissions">Admissions</a><a href="/academics">Classes</a><a href="/fees">Fees</a><a href="/portal/login.html">Parent &amp; Staff Portal</a></nav></div><div class="uf-col uf-contact"><h2>Contact</h2><p><a href="tel:+2348141943478">+234 814 194 3478</a><br><a href="https://wa.me/2349063932487">WhatsApp 09063932487</a></p><p>Opposite Morak Pure-Water Factory, Ageva, Okene, Kogi State.</p></div></div></div></footer>
<script src="/assets/js/public-shell.js?v=20261028-remediation1"></script>
</body></html>
'''
    (OUT / f"{slug}.html").write_text(html)
print(f"Generated {len(CLASSES)} class pages.")
