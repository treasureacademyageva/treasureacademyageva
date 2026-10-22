#!/usr/bin/env python3
"""Build the owner-confirmed graduation-history pages without private records."""
from pathlib import Path
from html import escape
ROOT=Path(__file__).resolve().parents[1]
VERSION="20261022-restoration1"
STORIES=[
("news/2017-first-graduation-ceremony.html","1st Graduation Ceremony","26 July 2017",[
"The first graduation ceremony of Treasure Academy, Ageva, took place on Wednesday, 26 July 2017.",
"The graduands were six pupils—children from other private and public schools who joined the school between 2016 and 2017—and the school celebrated their successful completion.",
"The school archive names the graduands as Jimoh Faridat (Head Girl), Aliyu AbdulHakeem, Olowolabi Favour, Abdulrazak Kamirudeen, Rashidat Muhammed and MomohJimoh Mutolib (Head Boy).",
"Before this set, one pupil had completed the school alone in 2016. The 2017 set became the first group that Treasure Academy celebrated with a full graduation ceremony.",
"Treasure Academy was established in 2016 by the Proprietress, Shaibu Sidikat Ruth, to serve Ageva and neighbouring communities. The school’s stated aim is to raise confident, brilliant and well-mannered children through strong academics and sound morals."
]),
("news/2018-second-graduation-ceremony.html","2nd Graduation Ceremony","24 July 2018",[
"The second graduation ceremony took place at the school premises on Tuesday, 24 July 2018.",
"The school archive records another set of graduands, including children who had joined Treasure Academy from other private and public schools, as the school continued to grow.",
"The write-up celebrates the pupils’ preparation for Common Entrance and other terminal examinations, and the confidence and determination they developed for those examinations.",
"Congratulations to the second set of graduands—once a Treasure pupil, always a Treasure pupil."
]),
("news/2019-third-graduation-ceremony.html","3rd Graduation Ceremony","6 August 2019",[
"The third graduation ceremony took place at the school premises on Tuesday, 6 August 2019.",
"According to the existing school archive, the graduands sat their Common Entrance and other external examinations at St. Paul Primary School and progressed successfully to their next stage.",
"The event marked another step in the school’s effort to prepare pupils confidently for external examinations and to establish its own examination-centre arrangements.",
"The school celebrated the graduands and the teachers and families who supported them."
]),
("news/2020-fourth-graduation-ceremony.html","4th Graduation Ceremony","7 August 2020",[
"The fourth graduation could not hold in the usual way because of the Covid-19 outbreak.",
"The school archive records that the set numbered eleven pupils. They were invited back for a ceremony that combined their graduation with the speech and prize-giving day so that their work could still be recognised.",
"The school gave thanks for seeing pupils, families and staff through that difficult period and celebrated a set that completed school in an unusual year."
]),
("news/2021-fifth-graduation-ceremony.html","5th Graduation Ceremony","12 August 2021",[
"The fifth graduation ceremony was held on Thursday, 12 August 2021, after the Covid-19 pandemic period.",
"The school archive records that the graduands wrote Common Entrance and other examinations in the name of Treasure Academy, Ageva, at the school’s own Common Entrance centre.",
"Moving from external centres to the school’s registered centre was an important milestone for the Treasure Academy community.",
"The school congratulated its graduands and thanked the teachers and parents whose work supported them."
])]
HEAD='''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>{title} — Treasure Academy, Ageva</title><link rel="icon" href="/assets/img/logo.jpg"><link rel="stylesheet" href="/assets/css/main.css?v={version}"><link rel="stylesheet" href="/assets/css/extra.css?v={version}"><link rel="stylesheet" href="/assets/css/corporate.css?v={version}"><style>.archive-nav{{background:var(--white);border-bottom:1px solid var(--line)}}.archive-nav .container{{display:flex;align-items:center;gap:18px;padding-block:10px;flex-wrap:wrap}}.archive-nav img{{border-radius:50%}}.archive-nav strong{{margin-right:auto;color:var(--green-deep)}}.archive-nav a{{font-weight:750;text-decoration:none}}.archive-story{{max-width:820px}}.archive-media img{{width:100%;height:auto;max-height:520px;object-fit:cover;border-radius:20px}}.archive-story>p{{font-size:1.05rem;line-height:1.8}}.privacy-note{{border-left:4px solid var(--gold);padding:14px 18px;background:var(--sun-soft);border-radius:10px}}</style></head><body><a class="skip-link" href="#main">Skip to content</a><nav class="archive-nav" aria-label="Primary navigation"><div class="container"><img src="/assets/img/logo.jpg" width="48" height="48" alt=""><strong>Treasure Academy, Ageva</strong><a href="/">Home</a><a href="/about.html">About</a><a href="/news.html">News</a><a href="/contact.html">Contact</a></div></nav>'''
FOOT='''<footer class="site-footer"><div class="container"><p><b>Treasure Academy, Ageva</b><br>Opposite Morak Pure-Water Factory, Ageva, Okene, Kogi State</p><p><a href="/news.html">All News</a> · <a href="/privacy.html">Privacy</a> · <a href="/contact.html">Contact</a></p></div></footer></body></html>'''
for filename,title,date,paras in STORIES:
    body=''.join(f'<p>{escape(p)}</p>' for p in paras)
    html=HEAD.format(title=escape(title),version=VERSION)+f'''<header class="page-hero"><div class="container"><span class="sec-tag">School History</span><h1>{escape(title)}</h1><p>Recorded in the existing Treasure Academy school archive · {escape(date)}</p></div></header><main id="main"><section><div class="container archive-story"><figure class="archive-media"><picture><source srcset="/assets/img/graduation.webp" type="image/webp"><img src="/assets/img/graduation.png" width="1200" height="669" alt="Restored graduation-group archive image" loading="eager"></picture><figcaption>Restored archive image; school identity, consent and placement await owner reconfirmation.</figcaption></figure><p class="privacy-note"><b>Archive privacy:</b> candidate numbers, subject marks, private contact details and photographed school records are not reproduced here.</p>{body}<p><a class="btn btn-mint" href="/news.html">Back to News &amp; Events</a> <a class="btn btn-white" href="/alumni.html">Former-Pupil Support</a></p></div></section></main>'''+FOOT
    p=ROOT/filename;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(html)
print(f"Generated {len(STORIES)} graduation-history pages.")
