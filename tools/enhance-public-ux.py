#!/usr/bin/env python3
"""Apply the consistent, fast visitor shell after content and SEO generation."""
from __future__ import annotations

import html
import json
import re
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
VERSION = "20261023-design1"
SKIP_SHELL = {"developer.html", "developer-review.html", "developer-operations.html"}
STORE_PAGES = {"index.html", "contact.html"}
SAFE_ACTION_PAGES = {"admissions.html", "contact.html"}
BRAND_ASSETS = json.loads((ROOT / "assets" / "data" / "brand-assets.json").read_text(encoding="utf-8"))


def page_group(rel: str) -> str:
    if rel in {"search.html", "explore.html", "404.html"}: return "other"
    if rel == "website-help.html": return "contact"
    if rel == "credits.html": return "about"
    if rel == "index.html": return "home"
    if rel in {"about.html", "anthem.html", "alumni.html", "careers.html", "support.html", "volunteer.html"}: return "about"
    if rel in {"admissions.html", "admission-form.html", "welcome.html", "openday.html"} or rel == "news/2026-2027-admissions-open.html": return "admissions"
    if rel == "academics.html" or rel == "class.html" or rel == "elearning.html" or rel.startswith("classes/") or rel in {"homework.html", "holiday.html", "reading.html", "exams.html"}: return "academics"
    if rel in {"fees.html", "receipt.html", "uniform.html", "transport.html", "shop.html", "poster.html"}: return "fees"
    if rel == "news.html" or rel.startswith("news/") or rel in {"calendar.html", "board.html", "birthdays.html", "photo-day.html"}: return "news"
    return "contact"


def category_for(rel: str) -> str:
    group = page_group(rel)
    return {
        "about": "Our School",
        "admissions": "Admissions & Visits",
        "academics": "Learning",
        "fees": "Fees & Essentials",
        "news": "News & Dates",
        "contact": "Family Help",
    }.get(group, "Website")


def nav_links(rel: str, lite: bool = False) -> str:
    current = page_group(rel)
    items = [
        ("home", "Home", "/"),
        ("about", "About", "/about.html"),
        ("admissions", "Admissions", "/admissions.html"),
        ("academics", "Classes", "/academics.html"),
        ("fees", "Fees", "/fees.html"),
        ("news", "News", "/news.html"),
        ("contact", "Contact", "/contact.html"),
    ]
    if lite:
        items = items[1:]
        return "".join(f'<a href="{href}"' + (' aria-current="page"' if key == current else "") + f'>{label}</a>' for key, label, href in items)
    return "".join(f'<a class="nav-link' + (' on' if key == current else '') + f'" href="{href}"' + (' aria-current="page"' if key == current else "") + f'>{label}</a>' for key, label, href in items)


def lite_nav(rel: str) -> str:
    return f'''<nav class="lite-nav" aria-label="Primary navigation"><div class="container">
<a class="lite-brand" href="/" aria-label="Treasure Academy — homepage"><img class="logo-badge" src="/assets/img/logo.jpg" width="397" height="397" alt="" decoding="async"><span><strong>TREASURE ACADEMY</strong><small>Creche · Nursery · Primary — Ageva</small></span></a>
<div class="lite-links">{nav_links(rel, True)}</div>
<div class="lite-actions"><a class="lite-search" href="/search.html">Search</a><button type="button" class="theme-btn icon-action" aria-label="Switch colour theme"></button><a class="btn btn-mint lite-apply" href="/admissions.html#apply">Apply</a></div>
</div></nav>'''


def primary_action(rel: str, title: str) -> tuple[str, str]:
    group = page_group(rel)
    if rel == "safeguarding.html":
        return "Raise a concern", "/request-centre.html?type=safeguarding"
    if rel == "contact.html" or rel == "openday.html": return "Schedule a Visit", "/request-centre.html?type=school_visit"
    if rel == "fees.html":
        return "Request current fees", "/request-centre.html?type=fee_schedule"
    if rel.startswith("classes/"):
        label = re.sub(r"\s+—.*$", "", title)
        return f"Ask about {label}", "/request-centre.html?type=class_enquiry"
    if group == "admissions": return "Start an admission enquiry", "/admissions.html#apply"
    if group == "academics": return "Explore all classes", "/academics.html"
    if group == "fees": return "View family essentials", "/explore.html#families"
    if group == "news": return "See current updates", "/news.html"
    if group == "about": return "Schedule a Visit", "/contact.html#visit"
    return "Contact the school", "/contact.html"


def route_bar(rel: str, title: str) -> str:
    category = category_for(rel)
    label, href = primary_action(rel, title)
    external = ' target="_blank" rel="noopener"' if href.startswith("http") else ""
    return f'''<!-- ux:route:start --><div class="route-bar"><div class="container">
<nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a><span class="sep" aria-hidden="true">›</span><a href="/explore.html">{html.escape(category)}</a><span class="sep" aria-hidden="true">›</span><span aria-current="page">{html.escape(title)}</span></nav>
<div class="route-actions"><a href="{html.escape(href)}"{external}>{html.escape(label)}</a><a href="/search.html">Search this site</a></div>
</div></div><!-- ux:route:end -->'''


def footer() -> str:
    return '''<footer class="universal-footer" id="siteFooter"><div class="container"><div class="uf-grid">
<div class="uf-col uf-about"><a class="uf-brand" href="/"><img src="/assets/img/logo.jpg" width="397" height="397" alt="" decoding="async"><b>Treasure Academy, Ageva</b></a><p>Creche, Nursery and Primary education in Ageva, Okene. Clear information, caring teaching and strong foundations.</p><p><a class="btn btn-sun btn-sm" href="/explore.html">Explore the Website</a></p></div>
<div class="uf-col"><h2>Find it fast</h2><nav class="uf-links" aria-label="Popular pages"><a href="/admissions.html">Admissions</a><a href="/academics.html">Classes</a><a href="/fees.html">Fees</a><a href="/calendar.html">Term dates</a><a href="/uniform.html">Uniform</a><a href="/transport.html">Transport</a></nav></div>
<div class="uf-col"><h2>School &amp; support</h2><nav class="uf-links" aria-label="School and support pages"><a href="/portal/login.html">Parent &amp; Staff Portal</a><a href="/portal/login.html#register">Create Parent Account</a><a href="/admissions.html#tracker">Track Application</a><a href="/request-centre.html">Request Centre</a><a href="/safeguarding.html">Safeguarding</a><a href="/privacy.html">Privacy</a><a href="/website-help.html">Website help</a><a href="/credits.html">Website credits</a></nav></div>
<div class="uf-col uf-contact"><h2>Verified contact</h2><p><a href="tel:+2348141943478"><b>+234 814 194 3478</b></a><br><a href="https://wa.me/2349063932487"><b>WhatsApp 09063932487</b></a><br><a href="mailto:treasuregroupofschool@gmail.com">treasuregroupofschool@gmail.com</a></p><p>Opposite Morak Pure-Water Factory, Ageva, Okene, Kogi State.</p><p><a href="/contact.html#visit">Visit &amp; directions →</a></p></div>
</div></div><div class="uf-bottom"><div class="container"><span>Treasure Academy Ageva Limited · RC 9634403</span><span>© 2026 Treasure Academy, Ageva. All rights reserved.</span><span><a href="https://paragonhub-kappa.vercel.app/" target="_blank" rel="noopener">Website designed and implemented by Jibril Abdullahi Onoruoiza, Paragon Hub.</a></span></div></div></footer>'''


def mobile_dock(rel: str) -> str:
    current = page_group(rel)
    if rel == "search.html": current = "search"
    elif rel == "explore.html": current = "explore"
    items = [
        ("home", "Home", "/", '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>'),
        ("admissions", "Admissions", "/admissions.html", '<path d="M4 19V7l8-4 8 4v12"/><path d="M8 11h8M8 15h8"/>'),
        ("explore", "Explore", "/explore.html", '<rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/>'),
        ("search", "Search", "/search.html", '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
        ("contact", "Contact", "/contact.html", '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>'),
    ]
    links = []
    for key, label, href, icon in items:
        active = ' aria-current="page"' if key == current else ""
        links.append(f'<a href="{href}" data-dock="{key}"{active}><svg viewBox="0 0 24 24" aria-hidden="true">{icon}</svg><span>{label}</span></a>')
    return '<!-- ux:dock:start --><nav class="mobile-dock" aria-label="Mobile quick navigation">' + "".join(links) + '</nav><!-- ux:dock:end -->'


def title_of(text: str, rel: str) -> str:
    match = re.search(r"<h1\b[^>]*>(.*?)</h1>", text, flags=re.I | re.S)
    if not match: return Path(rel).stem.replace("-", " ").title()
    return " ".join(html.unescape(re.sub(r"<[^>]+>", " ", match.group(1))).split())


def replace_css(text: str) -> str:
    pattern = r'\s*<link\b[^>]*href=["\'][^"\']*assets/css/(?:main|extra|glass|corporate|motion|site)\.css[^"\']*["\'][^>]*>'
    text = re.sub(pattern, "", text, flags=re.I)
    link = f'\n<link rel="stylesheet" href="/assets/css/site.css?v={VERSION}">\n'
    return text.replace("</head>", link + "</head>", 1)


def insert_verified_hero(text: str) -> str:
    """Publish a campus hero only after the fail-closed owner registry approves it."""
    text = re.sub(r'\s*<!-- brand:hero:start -->.*?<!-- brand:hero:end -->', "", text, flags=re.I | re.S)
    asset = BRAND_ASSETS.get("images", {}).get("campusHero", {})
    if asset.get("status") != "verified" or "page-hero" not in asset.get("placements", []):
        return text
    srcset = html.escape(str(asset.get("srcset", "")), quote=True)
    source = f'<source type="image/webp" srcset="{srcset}" sizes="100vw">' if srcset else ""
    block = (
        '<!-- brand:hero:start --><div class="page-hero-media" aria-hidden="true"><picture>'
        + source
        + f'<img src="{html.escape(str(asset["src"]), quote=True)}" width="{int(asset["width"])}" height="{int(asset["height"])}" alt="" fetchpriority="high" decoding="async">'
        + '</picture></div><!-- brand:hero:end -->'
    )
    return re.sub(r'(<div\b[^>]*class=["\'][^"\']*\bpage-hero\b[^"\']*["\'][^>]*>)', r'\1' + block, text, count=1, flags=re.I)


def optimize_images(text: str) -> str:
    # Collapse any previously generated JPEG/WebP wrapper so reruns remain valid.
    wrapper_rx = re.compile(r'(?:<picture><source\b[^>]*srcset=["\'][^"\']*-(?:560)\.webp["\'][^>]*>)+(?P<img><img\b[^>]*src=["\'][^"\']*\.(?:jpg|jpeg)["\'][^>]*>)(?:</picture>)+', re.I)
    text = wrapper_rx.sub(lambda match: match.group("img"), text)

    # Responsive WebP source sets.
    source_rx = re.compile(r'<source\b(?P<attrs>[^>]*?)srcset=["\'](?P<url>/?assets/img/(?P<name>[a-z0-9-]+)\.webp)["\'](?P<tail>[^>]*)>', re.I)
    def source_repl(match: re.Match) -> str:
        name = match.group("name")
        small = ROOT / "assets" / "img" / f"{name}-640.webp"
        original = ROOT / "assets" / "img" / f"{name}.webp"
        if not small.exists() or not original.exists(): return match.group(0)
        with Image.open(original) as image: width = image.width
        attrs = match.group("attrs")
        tail = match.group("tail")
        if "sizes=" not in (attrs + tail): tail += ' sizes="(max-width: 700px) 92vw, 1180px"'
        prefix = "/" if match.group("url").startswith("/") else ""
        return f'<source{attrs}srcset="{prefix}assets/img/{name}-640.webp 640w, {prefix}assets/img/{name}.webp {width}w"{tail}>'
    text = source_rx.sub(source_repl, text)

    # Previously JPEG-only shop/excursion images receive a small WebP source.
    image_rx = re.compile(r'<img\b(?P<before>[^>]*?)src=["\'](?P<url>/?assets/img/(?P<name>(?:shop-[a-z0-9-]+|excursion-girls))\.jpg)["\'](?P<after>[^>]*)>', re.I)
    def image_repl(match: re.Match) -> str:
        name = match.group("name")
        variant = ROOT / "assets" / "img" / f"{name}-560.webp"
        if not variant.exists(): return match.group(0)
        prefix = "/" if match.group("url").startswith("/") else ""
        image = f'<img{match.group("before")}src="{match.group("url")}"{match.group("after")}>'
        return f'<picture><source type="image/webp" srcset="{prefix}assets/img/{name}-560.webp">{image}</picture>'
    text = image_rx.sub(image_repl, text)

    def decoding_repl(match: re.Match) -> str:
        tag = match.group(0)
        if "decoding=" in tag: return tag
        return tag[:-1] + ' decoding="async">'
    return re.sub(r"<img\b[^>]*>", decoding_repl, text, flags=re.I)


paths = sorted(list(ROOT.glob("*.html")) + list((ROOT / "classes").glob("*.html")) + list((ROOT / "news").glob("*.html")))
# Private developer pages receive the bundled design source but no public shell.
enhanced_count = 0
for path in paths:
    if not path.exists(): continue
    rel = path.relative_to(ROOT).as_posix()
    text = path.read_text(encoding="utf-8", errors="ignore")
    if rel in SKIP_SHELL:
        # Private developer surfaces keep their own isolated styling and never
        # inherit the public visitor shell bundle.
        text = re.sub(r'\s*<link\b[^>]*href=["\'][^"\']*assets/css/site\.css[^"\']*["\'][^>]*>', '', text, flags=re.I)
        text = text.replace("20261022-ux1", VERSION).replace("20261022-ux2", VERSION)
        path.write_text(text, encoding="utf-8")
        continue
    text = replace_css(text)

    # The owner explicitly directed restoration of the familiar school crest
    # on 23 October 2026. Keep decorative instances silent because the adjacent
    # text already announces the school name.
    text = re.sub(
        r'<span class=["\']brand-logo-shell["\']>\s*(?:<span\b[^>]*site-monogram[^>]*>.*?</span>|<img\b[^>]*logo\.jpg[^>]*>)\s*</span>',
        '<span class="brand-logo-shell"><img class="logo-badge" src="/assets/img/logo.jpg" alt="" width="397" height="397" decoding="async"></span>',
        text,
        flags=re.I | re.S,
    )

    # Remove artificial loading screens and document-level no-cache meta tags.
    text = re.sub(r'<noscript><style>#siteLoader.*?</style></noscript>', "", text, flags=re.I | re.S)
    text = re.sub(r'<style>#siteLoader.*?</style>', "", text, flags=re.I | re.S)
    text = re.sub(r'<div id="siteLoader">.*?<div class="spin"></div></div>', "", text, flags=re.I | re.S)
    text = re.sub(r'\s*<meta http-equiv="(?:Cache-Control|Pragma|Expires)"[^>]*>', "", text, flags=re.I)

    # Theme bootstrap must run before stylesheet paint.
    text = re.sub(r'\s*<script\b[^>]*src=["\'][^"\']*assets/js/theme-init\.js[^"\']*["\'][^>]*></script>', "", text, flags=re.I)
    theme = f'\n<script src="/assets/js/theme-init.js?v={VERSION}"></script>'
    text = re.sub(r'(<meta\b[^>]*charset[^>]*>)', r'\1' + theme, text, count=1, flags=re.I)

    # Preserve the shared shell's current position on script-dependent core pages.
    shell_rx = r'<script\b[^>]*src=["\'][^"\']*assets/js/(?:site|public-shell)\.js[^"\']*["\'][^>]*></script>'
    insight_rx = r'\s*<script\b[^>]*src=["\'][^"\']*assets/js/visitor-insights\.js[^"\']*["\'][^>]*></script>'
    verified_info_rx = r'\s*<script\b[^>]*src=["\'][^"\']*assets/js/verified-public-information\.js[^"\']*["\'][^>]*></script>'
    text = re.sub(insight_rx, "", text, flags=re.I)
    text = re.sub(verified_info_rx, "", text, flags=re.I)
    text, shell_count = re.subn(shell_rx, "__UX_SHELL__", text, count=1, flags=re.I)
    text = re.sub(shell_rx, "", text, flags=re.I)
    shell_tag = f'<script src="/assets/js/visitor-insights.js?v={VERSION}"></script>\n<script src="/assets/js/verified-public-information.js?v={VERSION}"></script>\n<script src="/assets/js/public-shell.js?v={VERSION}"></script>'
    if shell_count:
        text = text.replace("__UX_SHELL__", shell_tag, 1)
    else:
        text = text.replace("</body>", shell_tag + "\n</body>", 1)

    # Only pages that actually use the small public data/actions load them.
    store_rx = r'\s*<script\b[^>]*src=["\'][^"\']*assets/js/store\.js[^"\']*["\'][^>]*></script>'
    safe_rx = r'\s*<script\b[^>]*src=["\'][^"\']*assets/js/safe-actions\.js[^"\']*["\'][^>]*></script>'
    if rel not in STORE_PAGES: text = re.sub(store_rx, "", text, flags=re.I)
    if rel not in SAFE_ACTION_PAGES: text = re.sub(safe_rx, "", text, flags=re.I)

    # One predictable primary navigation order.
    alt_classes = r'(?:utility-nav|news-nav|class-simple-nav|archive-nav|identity-nav|practice-nav|article-nav|lite-nav)'
    text = re.sub(rf'<nav\b[^>]*class=["\']{alt_classes}["\'][^>]*>.*?</nav>', lite_nav(rel), text, count=1, flags=re.I | re.S)
    if 'class="navbar"' not in text and 'class="lite-nav"' not in text and 'class="page-hero"' in text:
        text = text.replace('<div class="page-hero"', lite_nav(rel) + '\n<div class="page-hero"', 1)
        text = text.replace('<header class="page-hero"', lite_nav(rel) + '\n<header class="page-hero"', 1)
    text = re.sub(r'(<div\b[^>]*id=["\']mainNav["\'][^>]*>).*?(</div>)', lambda m: m.group(1) + nav_links(rel) + m.group(2), text, count=1, flags=re.I | re.S)
    if 'class="navbar"' in text and 'browse-action' not in text:
        browse = '<a class="icon-action browse-action" href="/explore.html" title="Explore all pages" aria-label="Explore all pages"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></svg><span>Explore</span></a>'
        text = text.replace('<a id="searchBtn"', browse + '<a id="searchBtn"', 1)
    text = re.sub(r'<button\b[^>]*class=["\'][^"\']*menu-toggle[^"\']*["\'][^>]*>.*?</button>', "", text, flags=re.I | re.S)
    text = re.sub(r'<div\b[^>]*class=["\']nav-veil["\'][^>]*></div>', "", text, flags=re.I)

    # Visible page context and actions. Search/explore already lead with their task.
    text = re.sub(r'<!-- ux:route:start -->.*?<!-- ux:route:end -->', "", text, flags=re.S)
    title = title_of(text, rel)
    if rel not in {"index.html", "search.html", "explore.html", "404.html"}:
        marker = re.search(r'<main\b[^>]*id=["\']main["\'][^>]*>', text, flags=re.I)
        if marker:
            text = text[:marker.start()] + route_bar(rel, title) + text[marker.start():]

    # One footer and one mobile quick-action pattern throughout the public site.
    text, footer_count = re.subn(r'<footer\b[^>]*>.*?</footer>', footer(), text, count=1, flags=re.I | re.S)
    if not footer_count:
        text = text.replace(shell_tag, footer() + "\n" + shell_tag, 1)
    text = re.sub(r'\s*<!-- ux:dock:start -->.*?<!-- ux:dock:end -->\s*', "\n", text, flags=re.S)
    text = re.sub(r'\s*</body>', "\n" + mobile_dock(rel) + "\n</body>", text, count=1)

    text = insert_verified_hero(text)
    text = optimize_images(text)
    text = text.replace("20261022-restoration1", VERSION).replace("20261022-ux1", VERSION).replace("20261022-ux2", VERSION)
    # Reruns remove and reinsert the generated dock. Collapse only the empty
    # separator immediately before that marker so builds remain byte-stable.
    text = re.sub(r'\n(?:[ \t]*\n){2,}(?=<!-- ux:dock:start -->)', '\n', text)
    text = "\n".join(line.rstrip() for line in text.split("\n"))
    path.write_text(text, encoding="utf-8")
    enhanced_count += 1

print(f"Enhanced {enhanced_count} public pages with consistent wayfinding and mobile actions; {len(SKIP_SHELL)} private developer pages kept outside the shell.")
