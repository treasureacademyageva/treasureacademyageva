# Content, Route and Dependency Migration Inventory

**Captured:** 25 October 2026; Runs 5–7 boundaries updated 27 October 2026
**Authority:** owner-approved Dynamic Platform Master Plan
**Rule:** inventory → owner/source verification → additive import → revision preservation → database rendering → parity proof → coded-authority retirement

This register describes current authorities and migration candidates. It does not declare unverified wording, media, legacy seed rows or old table contents publishable. Runs 5–7 added locally accepted schema/policy, fail-closed media-service source and a capability-gated protected CMS bundle. The dedicated provider credentials are stored privately in Production-only Vercel Sensitive variables, but no value entered source/evidence and no content/media, Production SQL, Run 5–7 source or public route authority was imported or activated.

## 1. Current deployable route inventory

The authoritative audit covers 65 HTML files.

### Root files (45)

```text
404.html
about.html
academics.html
admission-form.html
admissions.html
alumni.html
anthem.html
birthdays.html
board.html
calendar.html
careers.html
class.html
contact.html
credits.html
developer-operations.html
developer-review.html
developer.html
elearning.html
exams.html
explore.html
fees.html
holiday.html
homework.html
index.html
lost-found.html
news.html
openday.html
photo-day.html
poster.html
privacy.html
pta.html
reading.html
receipt.html
request-centre.html
safeguarding.html
search.html
shop.html
story.html
support.html
testimonials.html
transport.html
uniform.html
volunteer.html
website-help.html
welcome.html
```

### Class files (9)

```text
classes/creche.html
classes/pre-nursery.html
classes/nursery-1.html
classes/nursery-2.html
classes/primary-1.html
classes/primary-2.html
classes/primary-3.html
classes/primary-4.html
classes/primary-6.html
```

There is no active Primary 5 route. The approved progression must remain unchanged.

### News files (6)

```text
news/2017-first-graduation-ceremony.html
news/2018-second-graduation-ceremony.html
news/2019-third-graduation-ceremony.html
news/2020-fourth-graduation-ceremony.html
news/2021-fifth-graduation-ceremony.html
news/2026-2027-admissions-open.html
```

### Portal files (5)

```text
portal/index.html
portal/login.html
portal/admin.html
portal/teacher.html
portal/pupil.html
```

Admin/teacher/pupil legacy entries already redirect to the login route. Protected routes remain noindex/no-store.

## 2. Current sitemap authority

The XML sitemap contains these 31 canonical URLs:

```text
/
/about.html
/academics.html
/admissions.html
/alumni.html
/calendar.html
/careers.html
/classes/creche.html
/classes/pre-nursery.html
/classes/nursery-1.html
/classes/nursery-2.html
/classes/primary-1.html
/classes/primary-2.html
/classes/primary-3.html
/classes/primary-4.html
/classes/primary-6.html
/contact.html
/credits.html
/elearning.html
/exams.html
/explore.html
/fees.html
/news.html
/news/2026-2027-admissions-open.html
/privacy.html
/pta.html
/request-centre.html
/safeguarding.html
/transport.html
/uniform.html
/welcome.html
```

The other 34 audited files are noindex/private/utility/historical pages. No route may be removed merely because it is absent from the sitemap.

## 3. Approved target primary routes

```text
/
/about
/academics
/admissions
/classes
/classes/{approved-class-slug}
/fees
/news
/news/page/{n}
/news/{article-slug}
/events
/events/page/{n}
/events/archive
/events/{event-slug}
/gallery
/gallery/{media-or-story-slug}
/shop
/contact
/site-map
/search
/privacy
/safeguarding
/credits
/portal/login
/developer
/developer-review
```

The plan explicitly requires top-level core routes and typed News/Event/Gallery routes. Existing useful routes not listed as “primary” must remain reachable until a documented per-route retain/merge/archive decision and one-hop redirect test exists.

### Guaranteed first-wave canonical moves

| Current | Target | Treatment |
|---|---|---|
| `/about.html` | `/about` | Permanent one-hop redirect after parity |
| `/academics.html` | `/academics` | Permanent one-hop redirect after parity |
| `/admissions.html` | `/admissions` | Permanent one-hop redirect after parity |
| `/class.html` | `/classes` | Permanent one-hop redirect after the class index is equivalent |
| `/classes/{slug}.html` | `/classes/{slug}` | Permanent one-hop redirect after parity |
| `/fees.html` | `/fees` | Permanent one-hop redirect after parity |
| `/news.html` | `/news` | Permanent one-hop redirect after dynamic listing parity |
| `/news/{slug}.html` | `/news/{slug}` | Permanent one-hop redirect only after the CMS record and alias exist |
| `/contact.html` | `/contact` | Permanent one-hop redirect after parity |
| `/search.html` | `/search` | Permanent one-hop redirect after database Search acceptance |
| `/privacy.html` | `/privacy` | Permanent one-hop redirect after parity |
| `/safeguarding.html` | `/safeguarding` | Permanent one-hop redirect after parity |
| `/credits.html` | `/credits` | Permanent one-hop redirect after parity |
| `/explore.html` | `/site-map` or retained `/explore` plus `/site-map` | Decide during Run 11; do not silently merge distinct task-navigation behavior |

`/news/page/1` must redirect to `/news`; `/events/page/1` must redirect to `/events`. Lower/upper-case and trailing-slash normalization must not create chains. Query parameters are preserved only when meaningful and safe.

## 4. Current content authorities and duplication

| Surface | Current authority | Duplicate/consumer | Required final authority |
|---|---|---|---|
| News archive records | `assets/js/store.js` (`PUBLIC_NEWS`, 6 records) | `news.html`, six article files, homepage, Search index | Published CMS records/projection |
| Current admission campaign | `index.html`, `news.html`, admission article, metadata, `store.js`, Search answers/index | Multiple cards/badges/descriptions | One published CMS article/announcement plus placements |
| Event/calendar facts | legacy `calendar_events` rows plus static guidance pages | Search/chat fallbacks, homepage guidance | Verified CMS Event records related to operational calendar facts without duplication |
| Homepage news | browser render from `DB.load().newsEvents` | `store.js` fallback | Published CMS placement projection |
| Homepage gallery | four hardcoded illustration cards | links to `news.html#gallery` | Gallery projection from publishable News/Event media relationships |
| News gallery | three hardcoded excursion images | media inventory and `store.js` references | Media records only after consent/provenance approval |
| Search destinations | generated `assets/js/search-index.js` (57 static entries) | `smart-search.js` ranking | Published fixed-route + CMS Search projection |
| Direct answers | `verified-answer-engine.js`, duplicate `smart-search.js` fallback, optional public-info endpoint | Search UI | Verified database projection with supporting source links and fail-closed fallbacks |
| Repeated contacts/address/hours | repeated HTML shell/body plus Search scripts | up to 57 audited pages | Verified site-fact projection where changeable; stable rendering templates remain code |
| Core-page changing sections | direct HTML | Search index and chatbot corpus | CMS page/section/slot records after verification |
| Public inventory claims | static cautionary wording; legacy `shop_items`/uniform/transport seeds | shop/uniform/transport/search | Office-confirmed inventory/service projection only |
| Metadata and sitemap | direct HTML + static `sitemap.xml` | Search index build | Same published record/route projection as visible content |

Code continues to own templates, renderers, block allowlists, calculations, validation, permissions, security and safe fallback wording. Supabase owns safe changing content/state/relationships after cutover.

## 5. Exact static News migration candidates

| Candidate | Existing date | Existing sources | Migration rule |
|---|---|---|---|
| `2026-2027-admissions-open` | Published 15 Sep 2026; updated 21 Oct 2026 | Article, listing, homepage/store, metadata, Search | Reverify current session/status before import; one CMS record must drive every placement |
| `2017-first-graduation-ceremony` | 26 Jul 2017 | Article, listing/store, Search | Text may migrate after source review; keep media/private pupil records held |
| `2018-second-graduation-ceremony` | 24 Jul 2018 | Article, listing/store, Search | Same |
| `2019-third-graduation-ceremony` | 6 Aug 2019 | Article, listing/store, Search | Same |
| `2020-fourth-graduation-ceremony` | 7 Aug 2020 | Article, listing/store, Search | Same |
| `2021-fifth-graduation-ceremony` | 12 Aug 2021 | Article, listing/store, Search | Same |

The five historical stories are currently canonicalized noindex archive pages. Their publication/indexing state must be explicit in imported records; migration must not automatically make them indexable.

`public.news_posts` and `public.news_images` exist in production with zero rows. They are legacy schema, not proof of the approved CMS model and not a reason to bypass the purpose-built additive structures in the master plan.

## 6. Event inventory

There is no dedicated public `/events` listing or typed Event detail route. Production contains five legacy `calendar_events` rows, but their text, dates, public classification and source authority were not re-approved in Run 1.

Required process:

1. preserve all five rows;
2. inspect only privacy-safe fields during the CMS migration run;
3. obtain/record source, effective date, review date and public approval;
4. import approved facts into CMS Event records or relate them without duplicating authority;
5. render Lagos-time lifecycle/countdown states;
6. keep unverified/private rows out of the published projection and Search.

## 7. Core-page and repeated-fact migration groups

### Highest-priority changing facts

- admission session/status, class availability and application notices;
- term, examination, resumption, closure and event dates;
- verified public contact details, office hours and visit notices;
- fees guidance, uniform items, school supplies and transport availability;
- current vacancies, PTA meetings, campaigns and school notices;
- homepage alert bar, news cards, event cards, quick answers and featured placements;
- policy effective/review dates;
- source-backed Search direct answers and vocabulary attached to CMS records;
- current metadata titles/descriptions/social images where their fact is CMS-managed.

### Repeated current facts detected

- phone/contact patterns occur across 57 audited public/protected HTML files;
- date/year patterns occur across 57 files;
- “current/open/closed/available/admission/calendar/term/fee/stock/transport/uniform/notice/reviewed/event” language occurs across 64 audited files;
- the public school-day answer (`Monday–Friday, 7:30 a.m.–3:00 p.m.`), address, class sequence, contacts and fee/calendar fallbacks are duplicated between Search scripts and pages;
- the admission campaign is repeated in home metadata, hero badge, News listing/detail, `store.js` and Search records.

Pattern counts identify review candidates, not automatic database fields. Historical dates, copyright years, stable legal wording, templates and security explanations must not be made dynamic merely because a keyword matched.

## 8. Search inventory

Current Search is browser-side retrieval, not a production generative-AI service:

- `search.html` — UI and related-page container;
- `assets/js/search-index.js` — 57 generated static destinations;
- `tools/build-search-index.py` — metadata-to-index generator;
- `assets/js/smart-search.js` — vocabulary families, ranking and a duplicate direct-answer fallback;
- `assets/js/verified-answer-engine.js` — deterministic verified/safe answers;
- `api/public-information.mjs` — optional, fail-closed database overlay from `verified_public_information`;
- `assets/js/verified-public-information.js` — topic-to-page overlay for published dynamic facts;
- `ai/` — localhost prototype only, excluded from production.

Required cutover:

1. fixed safe pages and published CMS records enter one projection;
2. unpublished/archived/expired records leave Search automatically;
3. direct answers cite supporting source pages/records;
4. low-confidence, private, unavailable and no-answer states remain truthful;
5. Search must not index itself as a useful answer destination;
6. raw user queries are not retained as public or personally identifying analytics;
7. no external generative AI is introduced without separate privacy review.

## 9. Media inventory and migration treatment

The preserved 108-file inventory is authoritative for file hashes and current treatment.

| Group | Current state | CMS migration treatment |
|---|---|---|
| 57 restored public assets | Currently deployed/referenced according to old register | Create metadata only after source/owner, authority, placement, alt text and review fields are resolved |
| 28 generated derivatives | Inherit source status | Regenerate through approved media pipeline; never treat as independent consent |
| 12 graduate record photographs | Deployment-excluded private records | Never import as public media; preserve privately |
| 5 third-party marks | Excluded | Hold pending exact permission/attribution |
| 5 unreferenced assets | Preserved | Hold; do not auto-publish |
| 1 third-party placeholder | Excluded | Never publish as school media |
| 3 excursion source photos | Static News currently references them | Hold from CMS publication pending consent/provenance review |
| 3 Facebook archive links | Public external links | Reverify school control and continued publication authority before creating relationships |

Cloudinary will own approved media binaries/derivatives; Supabase will own metadata, consent, provenance, relationships and permissions. Run 6 implements that fail-closed boundary locally against school environment `ecbad9xj`; the dedicated credential is privately stored but has not been used for a provider call, asset upload or public route. Run 7 adds the protected media-library UI while both `CMS_PORTAL_ENABLED` and `CMS_MEDIA_ENABLED` default false. No original/bulk child-media download is public by default.

## 10. API/dependency inventory

### Vercel API files

```text
account-service.mjs
admission-service.mjs
cms-media.mjs
developer-service.mjs
monnify-webhook.mjs
parent-service.mjs
portal-config.mjs
portal-register.mjs
public-graduates.mjs
public-information.mjs
website-request-service.mjs
```

The gate-off `cms-media.mjs` dispatcher owns exactly `/api/cms/media/sign`, `/complete`, `/delivery`, `/manifest` and `/usage`; no public content route consumes it. Run 7 adds no Function: `cms-workspace-app.js` is a lazy protected browser bundle loaded only when the independent CMS portal gate is true, after which every read/mutation remains capability- and RLS-checked.

### Server modules

```text
account-claims.mjs
accounts.mjs
admission-tracking.mjs
cms-media.mjs
developer-console.mjs
monnify.mjs
otp-relay.mjs
parent-linking.mjs
portal-register.mjs
registrations.mjs
```

### Current external/runtime dependencies

- Supabase JS client from the locked npm dependency tree;
- Vercel routing/serverless runtime;
- Paragon signed relay code path, disabled;
- WhatsApp and Facebook outbound links;
- direct Cloudinary Upload/Admin/Usage REST integration in the trusted server, with no added SDK dependency and `CMS_MEDIA_ENABLED=false`;
- no production AI backend;
- dormant Monnify files/gates, out of approved scope.

## 11. Database inventory boundary

The accepted pre/post-Run-5 Production database baseline, preserved unchanged through local Run 7, contains 105 public tables, all 105 RLS-enabled:

- earlier tables such as `school_data`, `news_posts`, `news_images`, `calendar_events`, `shop_items`, `fee_structure`, `transport_routes`, `uniform_items`, `staff` and related operational tables;
- additive secure-portal families for accounts, operations, family linking, enrolment, finance/inventory, admission tracking/developer capabilities, continuity/account claims and the accepted Run 4 bootstrap boundary.

Production still contains zero of the 22 planned Run 5/6 CMS and media-governance tables. `school_data` remains present with its preserved row; Auth users/identities remain `2/2`; storage remains empty; pending/claimed account claims remain `2/2`; live claim challenges and bootstrap authorisations remain zero.

Run 5 now has exactly one purpose-built source migration, `20261026060000_public_cms_foundation.sql`, with:

- stable entries and immutable revisions/blocks;
- tags, controlled search terms and media relationships;
- media consent/provenance metadata;
- aliases, approvals, publication audit and quality findings;
- slots and navigation;
- separate CMS capabilities;
- dormant privacy-safe views, signed-in likes and premoderated comments;
- eight fixed-column published-only projections with no anonymous base-table grants.

Run 6 adds `20261026070000_cloudinary_media_governance.sql`, two RLS relations, nine protected media functions, immutable events and provider metadata on the existing media manifest. The trusted service exposes one consolidated five-action Function for upload signing/completion, bounded private derivatives, owner manifest/orphan export and sanitised quota usage. It adds no SDK dependency or row and stays gate-off; private provider values exist only in Vercel Sensitive storage.

Run 7 adds no migration. Its protected portal reads the accepted Run 5/6 relations through RLS, performs all mutations through accepted capability-checked RPCs, and exposes no public rendering route.

Both migrations remain unapplied to Production and contain no import. The empty legacy `news_posts/news_images` relations are preserved and are not reused as the new authority. Old `db/*.sql` and `cms/wordpress-migration/*` files are not production migration sources.

### Runs 5–7 authority status

| Surface | Local result | Current public authority |
|---|---|---|
| News/Event/Page/Announcement identities | Schema and lifecycle accepted locally; zero records | Existing static site remains authoritative |
| Structured body blocks | Allowlist and validation accepted locally; zero blocks | Existing reviewed HTML remains authoritative |
| Media metadata/relationships | Governed signed-upload, provider confirmation, consent/provenance/safeguarding, placement/download, manifest/orphan and quota boundary accepted locally; zero media | Existing approved deployment assets only; historical child media held |
| Slug aliases | Stable alias model accepted locally; zero aliases | Existing `.html` routes remain unchanged |
| Search vocabulary | Controlled per-revision terms accepted locally; zero terms; no raw queries | Existing static Search remains authoritative |
| Homepage slots/navigation | Foundation accepted locally; zero rows | Existing coded layout/navigation remains authoritative |
| Engagement | Tables fail closed with no public/authenticated grants | No CMS views/likes/comments feature is active |
| Public projections | RLS and published-only behavior proven locally | No dynamic public route consumes them yet |

## 12. Parity and retirement checklist for each migrated item

A coded copy may cease being authoritative only when all are true:

- [ ] owner/source verification is recorded;
- [ ] safe content classification is recorded;
- [ ] CMS record and immutable source revision exist;
- [ ] permissions, RLS and published-only projection pass;
- [ ] media consent/provenance is approved or media is omitted;
- [ ] preview matches approved source;
- [ ] visible route, homepage placement, related content and metadata match;
- [ ] Search direct answer/result and source link match;
- [ ] sitemap/feed lifecycle matches publication state;
- [ ] cache invalidation/service-worker behavior is proven;
- [ ] old URL redirects in one hop after clean-route cutover;
- [ ] coded fact is removed from public output/fallback authority;
- [ ] rollback can restore the prior published revision without data loss.
