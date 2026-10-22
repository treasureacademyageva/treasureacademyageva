#!/usr/bin/env python3
"""Fail-closed static production audit for the Treasure Academy brochure site."""
from __future__ import annotations
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit, unquote
import json, re, sys

ROOT=Path(__file__).resolve().parents[1]
SITE="https://www.treasureacademyageva.com"
CORE={"index.html","about.html","academics.html","admissions.html","fees.html","calendar.html","news.html","safeguarding.html","privacy.html","contact.html"}
PRIVATE={"developer.html","developer-review.html","developer-operations.html","404.html","receipt.html"}
EXPECTED_NOINDEX={"admission-form.html","birthdays.html","board.html","class.html","holiday.html","homework.html","lost-found.html","openday.html","photo-day.html","poster.html","reading.html","receipt.html","search.html","shop.html","story.html","support.html","testimonials.html","volunteer.html"}

class Doc(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.tags=[];self.ids=[];self.links=[];self.images=[];self.controls=[];self.labels=set();self.implicit=0
        self.meta=[];self.title=[];self.h1=0;self.headings=[];self.scripts=[];self._in_title=False;self._title=[];self._label_depth=0;self._script=None;self._script_text=[]
    def handle_starttag(self,tag,attrs):
        a=dict(attrs);self.tags.append((tag,a))
        if a.get('id'):self.ids.append(a['id'])
        if tag=='a':self.links.append(a)
        if tag=='img':self.images.append(a)
        if tag=='label':
            self._label_depth+=1
            if a.get('for'):self.labels.add(a['for'])
        if tag in ('input','select','textarea'):
            self.controls.append((tag,a,self._label_depth>0))
        if tag=='meta':self.meta.append(a)
        if re.fullmatch(r'h[1-6]',tag):
            self.headings.append(int(tag[1]))
            if tag=='h1':self.h1+=1
        if tag=='title':self._in_title=True;self._title=[]
        if tag=='script':self._script=(a,self.getpos());self._script_text=[]
    def handle_startendtag(self,tag,attrs):self.handle_starttag(tag,attrs)
    def handle_endtag(self,tag):
        if tag=='label' and self._label_depth:self._label_depth-=1
        if tag=='title' and self._in_title:self.title.append(''.join(self._title).strip());self._in_title=False
        if tag=='script' and self._script:
            self.scripts.append((self._script[0],''.join(self._script_text)));self._script=None;self._script_text=[]
    def handle_data(self,data):
        if self._in_title:self._title.append(data)
        if self._script is not None:self._script_text.append(data)

def html_files():
    return sorted(list(ROOT.glob('*.html'))+list((ROOT/'portal').glob('*.html'))+list((ROOT/'classes').glob('*.html'))+list((ROOT/'news').glob('*.html')))

def relative(p):return p.relative_to(ROOT).as_posix()

def resolve_link(page:Path,href:str):
    if not href or href.startswith(('#','mailto:','tel:','javascript:','data:')):return None
    u=urlsplit(href)
    if u.scheme:
        if u.scheme in ('http','https') and u.netloc in ('www.treasureacademyageva.com','treasureacademyageva.com'):
            path=unquote(u.path.lstrip('/')) or 'index.html'
        else:return None
    elif href.startswith('/'):
        path=unquote(u.path.lstrip('/')) or 'index.html'
    else:
        path=(page.parent/Path(unquote(u.path))).relative_to(ROOT).as_posix() if u.path else relative(page)
    if path.endswith('/'):path+='index.html'
    return ROOT/path

def meta_value(doc,name=None,prop=None):
    for m in doc.meta:
        if name and m.get('name','').lower()==name.lower():return m.get('content','')
        if prop and m.get('property','').lower()==prop.lower():return m.get('content','')
    return ''

def main():
    failures=[];warnings=[];docs={};canon={};titles={};descriptions={};schemas={}
    def fail(msg):failures.append(msg)
    for page in html_files():
        rel=relative(page);raw=page.read_text(encoding='utf-8',errors='replace');doc=Doc()
        try:doc.feed(raw)
        except Exception as exc:fail(f'{rel}: HTML parser error: {exc}')
        docs[rel]=doc
        html_tag=next((a for tag,a in doc.tags if tag=='html'),{})
        if not html_tag.get('lang'):fail(f'{rel}: html language is missing')
        dup=sorted({x for x in doc.ids if doc.ids.count(x)>1})
        if dup:fail(f'{rel}: duplicate ids {dup}')
        meta_keys=[(m.get('name') or ('property:'+m.get('property',''))).lower() for m in doc.meta if m.get('name') or m.get('property')]
        duplicate_meta=sorted({x for x in meta_keys if meta_keys.count(x)>1})
        if duplicate_meta:fail(f'{rel}: duplicate metadata {duplicate_meta}')
        canon_links=[a.get('href','') for tag,a in doc.tags if tag=='link' and a.get('rel')=='canonical']
        if len(canon_links)>1:fail(f'{rel}: multiple canonical links')
        if rel not in ('404.html','developer-review.html','portal/admin.html','portal/teacher.html','portal/pupil.html') and doc.h1!=1:fail(f'{rel}: expected one h1, found {doc.h1}')
        if any(nxt>current+1 for current,nxt in zip(doc.headings,doc.headings[1:])):fail(f'{rel}: heading levels are skipped: {doc.headings}')
        if not doc.title or not doc.title[0]:fail(f'{rel}: missing title')
        for tag,a,implicit in doc.controls:
            typ=a.get('type','').lower()
            if typ in ('hidden','submit','button','reset','image'):continue
            programmatically_hidden='hidden' in a.get('class','').split() or 'hidden' in a
            visible_label=implicit or (a.get('id') in doc.labels)
            named=visible_label or a.get('aria-label') or a.get('aria-labelledby')
            if not named:fail(f'{rel}: unnamed {tag}#{a.get("id","")}')
            elif not visible_label and not programmatically_hidden:fail(f'{rel}: {tag}#{a.get("id","")} lacks a visible label')
        for im in doc.images:
            if 'alt' not in im:fail(f'{rel}: image missing alt: {im.get("src","")}')
            if not im.get('width') or not im.get('height'):fail(f'{rel}: image missing dimensions: {im.get("src","")}')
        for a in doc.links:
            href=a.get('href','')
            if not href:fail(f'{rel}: link missing href')
            if a.get('target')=='_blank' and 'noopener' not in a.get('rel','').split():fail(f'{rel}: target=_blank missing noopener: {href}')
            target=resolve_link(page,href)
            if target and '${' not in str(target) and not target.exists():fail(f'{rel}: broken internal link {href} -> {relative(target)}')
        for tag,a in doc.tags:
            if tag in ('div','span') and a.get('onclick'):fail(f'{rel}: non-semantic clickable {tag}')
            asset = (a.get('src') or (a.get('srcset','').split() or [None])[0]) if tag in ('script','img','source') else (a.get('href') if tag=='link' else None)
            if asset:
                target=resolve_link(page,asset)
                if target and '${' not in str(target) and not target.exists():fail(f'{rel}: missing referenced asset {asset}')
            if asset and asset.startswith(('/assets/','assets/')) and asset.split('?',1)[0].endswith(('.js','.css')) and '?v=' not in asset:
                fail(f'{rel}: mutable asset missing version: {asset}')
        robots=meta_value(doc,name='robots').lower()
        if rel in PRIVATE or rel.startswith('portal/') or rel in EXPECTED_NOINDEX:
            if 'noindex' not in robots:fail(f'{rel}: expected noindex')
        elif rel not in ('portal/admin.html','portal/teacher.html','portal/pupil.html'):
            title=doc.title[0] if doc.title else ''
            desc=meta_value(doc,name='description')
            if not desc:fail(f'{rel}: missing description')
            elif len(desc)<70 or len(desc)>180:fail(f'{rel}: description length is {len(desc)}, expected 70–180')
            elif desc in descriptions:fail(f'{rel}: duplicate description also used by {descriptions[desc]}')
            else:descriptions[desc]=rel
            if title in titles:fail(f'{rel}: duplicate title also used by {titles[title]}')
            else:titles[title]=rel
            canonical=''
            for tag,a in doc.tags:
                if tag=='link' and a.get('rel')=='canonical':canonical=a.get('href','')
            expected_canonical=SITE+('/' if rel=='index.html' else '/'+rel)
            if not canonical:fail(f'{rel}: missing canonical')
            elif canonical!=expected_canonical:fail(f'{rel}: canonical {canonical} does not match {expected_canonical}')
            elif canonical in canon:fail(f'{rel}: duplicate canonical also used by {canon[canonical]}: {canonical}')
            else:canon[canonical]=rel
            if meta_value(doc,prop='og:url')!=canonical:fail(f'{rel}: og:url does not match canonical')
            if meta_value(doc,prop='og:title')!=title:fail(f'{rel}: og:title does not match title')
            if meta_value(doc,prop='og:description')!=desc:fail(f'{rel}: og:description does not match description')
            if not any(tag=='main' and a.get('id')=='main' for tag,a in doc.tags):fail(f'{rel}: missing main landmark target')
            if not any(tag=='a' and 'skip-link' in a.get('class','').split() and a.get('href')=='#main' for tag,a in doc.tags):fail(f'{rel}: missing skip link')
            if 'noindex' not in robots and 'index' not in robots:fail(f'{rel}: no explicit index robots policy')
        schemas[rel]=[]
        for attrs,text in doc.scripts:
            if attrs.get('type')=='application/ld+json':
                try:schemas[rel].append(json.loads(text))
                except Exception as exc:fail(f'{rel}: invalid JSON-LD: {exc}')
        low=raw.lower()
        forbidden=[
          ('demo credential','head001'),('demo phone','0805 111 2222'),('candidate number','bs/okn/141001'),
          ('fabricated performance claim','100% common entrance'),('fake result portal','results published to parent portal'),
          ('unsafe success','order received!'),('unsafe success','application received.'),
          ('known placeholder','class-feature.jpg')]
        if not rel.startswith('developer-review'):
            for label,needle in forbidden:
                if needle in low:fail(f'{rel}: {label}: {needle}')
    # Required architecture and content.
    for p in CORE:
        if p not in docs:fail(f'missing core page {p}')
    for slug in ('creche','pre-nursery','nursery-1','nursery-2','primary-1','primary-2','primary-3','primary-4','primary-5','primary-6'):
        if f'classes/{slug}.html' not in docs:fail(f'missing static class page {slug}')
    if 'news/2026-2027-admissions-open.html' not in docs:fail('missing crawlable admissions article')
    index=(ROOT/'index.html').read_text()
    if 'id="quickAnswers"' not in index:fail('home page missing quick-answer section')
    def schema_nodes(value):
        if isinstance(value,list):
            for item in value:yield from schema_nodes(item)
        elif isinstance(value,dict):
            yield value
            if '@graph' in value:yield from schema_nodes(value['@graph'])
    all_schema_nodes=[node for values in schemas.values() for value in values for node in schema_nodes(value)]
    all_schema_types={t for node in all_schema_nodes for t in ([node.get('@type')] if isinstance(node.get('@type'),str) else (node.get('@type') or []))}
    for prohibited in ('FAQPage','Review','AggregateRating'):
        if prohibited in all_schema_types:fail(f'unsupported structured-data type present: {prohibited}')
    home_nodes=[node for value in schemas.get('index.html',[]) for node in schema_nodes(value)]
    school=next((node for node in home_nodes if node.get('@type')=='School'),None)
    website=next((node for node in home_nodes if node.get('@type')=='WebSite'),None)
    if not school or school.get('legalName')!='Treasure Academy Ageva Limited' or school.get('foundingDate')!='2016':fail('home School schema is missing verified legal name or founding year')
    if not website or website.get('name')!='Treasure Academy, Ageva':fail('home WebSite schema is missing the public site name')
    article_nodes=[node for value in schemas.get('news/2026-2027-admissions-open.html',[]) for node in schema_nodes(value)]
    article=next((node for node in article_nodes if node.get('@type')=='NewsArticle'),None)
    if not article or not article.get('headline') or not article.get('datePublished'):fail('published admissions update is missing NewsArticle headline/date')
    store=(ROOT/'assets/js/store.js').read_text()
    for needle in ('const Auth =','password:"1234"','pin:"1234"','GRADS_SEED = [\n  {'):
        if needle in store:fail(f'store contains retired sensitive feature: {needle}')
    ignore_lines=(ROOT/'.vercelignore').read_text().splitlines()
    if not all(x in ignore_lines for x in ('docs/','db/','tools/','cms/','model/','.well-known/')):fail('.vercelignore does not exclude internal or placeholder directories')
    ignored_public_assets=('assets/js/auth-ui.js','assets/js/chat-core.js','assets/js/db-live.js','assets/js/notify.js','assets/js/sync.js','assets/js/verify.js','assets/data/kb.json')
    for rel,doc in docs.items():
        raw=(ROOT/rel).read_text(errors='ignore')
        for asset in ignored_public_assets:
            if asset in raw:fail(f'{rel}: references deployment-excluded asset {asset}')
    service_worker=(ROOT/'sw.js').read_text()
    if "pathname === '/developer-operations.html'" not in service_worker:fail('service worker may cache private operations page')
    vercel=json.loads((ROOT/'vercel.json').read_text())
    header_rules=vercel.get('headers',[])
    headers=json.dumps(header_rules)
    for name in ('Content-Security-Policy','Strict-Transport-Security','X-Content-Type-Options','Referrer-Policy','Permissions-Policy'):
        if name not in headers:fail(f'vercel headers missing {name}')
    redirects=vercel.get('redirects',[])
    canonical_redirect=next((r for r in redirects if r.get('source')=='/:path*'),None)
    if not canonical_redirect or not canonical_redirect.get('permanent') or canonical_redirect.get('destination')!='https://www.treasureacademyageva.com/:path*':fail('permanent canonical-host redirect is missing')
    for private_path in ('/developer.html','/developer-review.html','/developer-operations.html','/assets/data/review-gateway.enc.json','/portal/(.*)','/admission-form.html','/receipt.html'):
        rule=next((r for r in header_rules if r.get('source')==private_path),None)
        values={h.get('key','').lower():h.get('value','') for h in (rule or {}).get('headers',[])}
        if 'no-store' not in values.get('cache-control','') or 'noindex' not in values.get('x-robots-tag',''):
            fail(f'private/noindex headers missing for {private_path}')
    if any(r.get('source')=='/assets/(.*)' and 'immutable' in json.dumps(r) for r in header_rules):fail('unversioned image/data assets must not all be immutable')
    # Sitemap must contain every indexable canonical and no noindex URL.
    sitemap=(ROOT/'sitemap.xml').read_text()
    locs=set(re.findall(r'<loc>(.*?)</loc>',sitemap))
    expected=set()
    for rel,doc in docs.items():
        if rel.startswith('portal/') or rel in PRIVATE or rel in EXPECTED_NOINDEX:continue
        robots=meta_value(doc,name='robots').lower()
        if 'noindex' in robots:continue
        for tag,a in doc.tags:
            if tag=='link' and a.get('rel')=='canonical':expected.add(a.get('href',''))
    if locs!=expected:
        for x in sorted(expected-locs):fail(f'sitemap missing {x}')
        for x in sorted(locs-expected):fail(f'sitemap includes unexpected {x}')
    # Validate the staging-only CMS model and fail-closed starter boundaries.
    model=json.loads((ROOT/'cms/wordpress-migration/content-model.json').read_text())
    expected_types={'page','taa_class','taa_update','taa_event','taa_guidance','taa_staff','taa_policy','attachment'}
    if set(model.get('contentTypes',{}))!=expected_types:fail('CMS content model types changed unexpectedly')
    if model.get('requiredForPublication')!=['content_owner','source_reference','last_reviewed','approval_status=owner_approved']:
        fail('CMS publication requirements changed unexpectedly')
    rules=model.get('globalRules',{})
    if not rules or any(rules.values()):fail('CMS global prohibition rules must all remain fail-closed')
    plugin=(ROOT/'cms/wordpress-migration/treasure-academy-core.php').read_text()
    for needle in ("capability_type'    => array( 'taa_public_content', 'taa_public_contents' )",'taa_fail_closed_publication','taa_daily_expiry_check','owner_approved','taa_governed_post_types'):
        if needle not in plugin:fail(f'CMS plugin missing control: {needle}')
    reviewer_section=plugin.split('function taa_reviewer_capabilities()',1)[-1].split('function taa_manager_capabilities()',1)[0]
    if 'publish_' in reviewer_section or 'upload_files' in reviewer_section:fail('CMS reviewer role can publish or upload media')
    # Lightweight delimiter sanity check when PHP CLI is unavailable.
    stripped=re.sub(r'/\*.*?\*/|//[^\n]*|#[^\n]*', '', plugin, flags=re.S)
    stripped=re.sub(r"'(?:\\.|[^'\\])*'|\"(?:\\.|[^\"\\])*\"", "''", stripped)
    for opening,closing in (('{','}'),('(',')'),('[',']')):
        depth=0
        for char in stripped:
            if char==opening:depth+=1
            elif char==closing:
                depth-=1
                if depth<0:break
        if depth!=0:fail(f'CMS plugin has unbalanced {opening}{closing} delimiters')
    print(f'Audited {len(docs)} HTML files, {len(locs)} sitemap URLs and {len(canon)} unique canonicals.')
    for w in warnings:print('WARN:',w)
    if failures:
        for f in failures:print('FAIL:',f)
        print(f'FAILED: {len(failures)} issue(s).')
        return 1
    print('PASS: static production audit.')
    return 0

if __name__=='__main__':sys.exit(main())
