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
 ("creche", "Creche", "Gentle care for our littlest treasures.", "Our Creche provides a calm, caring routine that supports early speech, movement, play and social confidence.", ["Rhymes and guided play", "Movement and early speech", "Rest and meal routines", "Kind social interaction"]),
 ("pre-nursery", "Pre-Nursery", "First steps into happy learning.", "Pre-Nursery blends play with early learning as children begin to recognise letters, numbers, colours and classroom routines.", ["Letter and number play", "Painting and building", "Rhymes and stories", "Table manners and sharing"]),
 ("nursery-1", "Nursery 1", "Sounds, letters and numbers come alive.", "Nursery 1 builds reading and writing foundations with phonics, handwriting practice and simple numeracy.", ["Phonics and reading", "Handwriting", "Simple counting", "Colouring and craft"]),
 ("nursery-2", "Nursery 2", "Confident readers, ready for Primary.", "Nursery 2 develops reading fluency, spelling and number work so children enter Primary 1 with confidence.", ["Reading fluency", "Spelling and dictation", "Addition and subtraction", "Show and tell"]),
 ("primary-1", "Primary 1", "A strong start for primary school.", "Primary 1 strengthens English, Mathematics, handwriting and good study habits with patient guidance.", ["English and comprehension", "Mental mathematics", "Handwriting", "Computer awareness"]),
 ("primary-2", "Primary 2", "Growing minds and deeper skills.", "Primary 2 stretches vocabulary, multiplication and writing while building confidence through class participation.", ["Grammar and writing", "Multiplication practice", "Reading", "Team activities"]),
 ("primary-3", "Primary 3", "Thinking, reasoning and discovery.", "Primary 3 introduces deeper reasoning, science discovery and age-appropriate computer skills.", ["Reasoning skills", "Science discovery", "Computer studies", "Debate and quiz"]),
 ("primary-4", "Primary 4", "Independent learners emerge.", "Primary 4 pupils read more widely, solve more demanding mathematics and express ideas clearly in writing.", ["Essay writing", "Problem solving", "Reading and research", "Responsible leadership"]),
 ("primary-5", "Primary 5", "Preparing for the final primary stage.", "Primary 5 combines advanced class work with exam technique and growing responsibility.", ["Exam technique", "Advanced mathematics", "Moral leadership", "Project work"]),
 ("primary-6", "Primary 6", "Finish primary school with confidence.", "Primary 6 focuses on Common Entrance practice, interviews and readiness for secondary school.", ["Common Entrance practice", "Interview skills", "Revision planning", "Secondary-school readiness"]),
]

NAV = '<a href="/">Home</a><a href="/about.html">About</a><a href="/admissions.html">Admissions</a><a href="/academics.html" aria-current="page">Academics</a><a href="/fees.html">Fees</a><a href="/news.html">News</a><a href="/contact.html">Contact</a>'

for slug, name, tagline, about, activities in CLASSES:
    canonical = f"{SITE}/classes/{slug}.html"
    cards = "".join(f"<li>{escape(x)}</li>" for x in activities)
    wa_text = quote("Hello Treasure Academy, I want to ask about " + name + ".")
    if slug == "creche":
        image, webp = "stage-creche.png", ""
    elif slug in {"pre-nursery", "nursery-1", "nursery-2"}:
        image, webp = "stage-nursery.png", "stage-nursery.webp"
    else:
        image, webp = "stage-primary.png", ""
    source = f'<source type="image/webp" srcset="/assets/img/{webp}">' if webp else ""
    class_media = f'<figure class="class-media"><picture>{source}<img src="/assets/img/{image}" width="1408" height="768" alt="Illustration for the {escape(name)} stage" loading="eager"></picture></figure>'
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
<meta name="theme-color" content="#0E5A2E">
<style>.class-simple-nav{{background:#fff;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:10}}.class-simple-nav .container{{display:flex;align-items:center;gap:14px;min-height:66px;flex-wrap:wrap}}.class-simple-nav img{{border-radius:50%;flex:none}}.class-simple-nav b{{color:var(--green-deep);margin-right:auto}}.class-simple-nav a{{color:var(--ink);font-weight:700;text-decoration:none;padding:8px 4px}}.class-simple-nav a[aria-current]{{color:var(--green);border-bottom:2px solid var(--gold)}}.class-overview{{display:grid;grid-template-columns:1.4fr 1fr;gap:22px;align-items:start}}.class-media{{grid-column:1/-1;margin:0}}.class-media img{{display:block;width:100%;height:auto;max-height:470px;object-fit:cover;border-radius:22px;box-shadow:var(--sh-2)}}@media(max-width:700px){{.class-simple-nav .container{{gap:8px;padding-block:10px}}.class-simple-nav b{{flex:1 0 100%}}.class-simple-nav a{{font-size:.82rem}}.class-overview{{grid-template-columns:1fr}}}}</style>
</head>
<body data-page="academics">
<a class="skip-link" href="#main">Skip to content</a>
<nav class="class-simple-nav" aria-label="Primary navigation"><div class="container"><img src="/assets/img/logo.jpg" width="48" height="48" alt=""><b>Treasure Academy, Ageva</b>{NAV}</div></nav>
<header class="page-hero"><div class="container"><span class="sec-tag">Our Classes</span><h1>{escape(name)}</h1><p>{escape(tagline)}</p></div></header>
<main id="main"><section><div class="container class-overview">
{class_media}
<div class="panel"><h2>What children build in {escape(name)}</h2><p>{escape(about)}</p><p>Class routines and materials may change during the session. Parents can arrange a visit or ask the school for the current class plan.</p></div>
<div class="panel"><h2>Learning highlights</h2><ul class="tick">{cards}</ul></div>
</div></section>
<section style="padding-top:0"><div class="container"><div class="cta-band"><div><h2>Ask about {escape(name)}</h2><p>Confirm age guidance, available places, current fees and required documents with the school office.</p></div><div><a class="btn btn-sun" target="_blank" rel="noopener" href="https://wa.me/2349063932487?text={wa_text}">Ask on WhatsApp</a> <a class="btn btn-white" href="/admissions.html">Admission Steps</a></div></div></div></section>
</main>
<footer class="site-footer"><div class="container"><p><b>Treasure Academy, Ageva</b><br>Opposite Morak Pure-Water Factory, Ageva, Okene, Kogi State</p><p><a href="tel:+2348141943478">+234 814 194 3478</a> · <a href="https://wa.me/2349063932487">WhatsApp 09063932487</a> · <a href="/privacy.html">Privacy</a> · <a href="/safeguarding.html">Safeguarding</a></p></div></footer>
</body></html>
'''
    (OUT / f"{slug}.html").write_text(html)
print(f"Generated {len(CLASSES)} class pages.")
