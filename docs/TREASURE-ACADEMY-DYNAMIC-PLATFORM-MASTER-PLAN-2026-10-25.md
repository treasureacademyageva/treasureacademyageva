# Treasure Academy Dynamic Platform Master Plan

**School:** Treasure Academy, Ageva
**Primary site:** <https://www.treasureacademyageva.com>
**Prepared:** 25 October 2026
**Status:** Owner-approved final pre-implementation blueprint. Phased implementation may proceed under the gates and safeguards below; no password/provider secret belongs in chat, and provider configuration or production-gate activation still requires its stated acceptance evidence.

---

## 1. Executive decision

Treasure Academy will evolve from a mostly static public website into a secure, database-driven school platform while preserving the current working site, portal records and operational safeguards.

The selected architecture is:

- **Vercel** for public delivery, dynamic server routes, clean URLs, security headers and deployment;
- **Supabase** for structured content, school operations, authentication, permissions, revisions and audit history;
- **Cloudinary** for consent-cleared public pictures and short videos;
- **the existing Treasure Academy portal** for the owner-controlled CMS and school operations;
- **the existing capability-scoped Developer Console** for manual OTP dispatch, information review and system health;
- **Paragon/Meta** as a later automatic OTP-delivery channel, with the manual dispatcher retained as a controlled fallback.

### Explicitly excluded

- WordPress, including conventional and headless WordPress;
- Zend Framework;
- Apache `mod_rewrite` as an added server dependency;
- a second public-content database;
- passwords in chat, source files, SQL migrations, ordinary Supabase tables or environment variables;
- card payments, Monnify activation or card-data storage;
- unauthorised child media or invented school facts;
- public pupil lists or account access from a pupil name/class lookup;
- online assignment submission;
- Primary 5 in the school progression;
- any destructive replacement of former Supabase records or `school_data` before verified cutover.

The guiding rule is:

> **Content and operational facts live in controlled data stores; layout, security and validation remain in code. One approved record must drive every public appearance of that information.**

---

## 2. Current production baseline to preserve

At the time of this plan:

- School source release: `c4cd6f317be31ed30d9778056c3a22c71950f098`.
- Live Vercel deployment: `XvHAkXrBFGcXxk81aCYCGP8H2w16`.
- Public site: <https://www.treasureacademyageva.com>.
- Paragon remote release remains `fd13a00dd42c1cf4e338a46c491993d90dbf98cf`.
- No automatic activation watcher is running.
- Non-OTP school features are live.
- The following gates remain false:
  - `PARAGON_OTP_RELAY_ENABLED`
  - `PORTAL_ACCOUNT_CLAIM_ENABLED`
  - `ADMISSION_TRACKING_ENABLED`
- Monnify/card processing remains disabled.
- The Meta Authentication template `treasure_academy_authentication / en_US` remains pending at the last authoritative check.
- Render still requires a private `APP_SECRET`, permanent live `PHONE_NUMBER_ID` correction and unsigned-webhook rejection verification.
- Existing school data and the first eight applied migrations must remain preserved. The first seven migrations must never be rerun.

Before future coding, the repository baseline must be verified and any pre-existing file-mode-only changes attributed or isolated so that unrelated changes do not enter CMS commits.

---

## 3. Authoritative decisions already made

1. **No WordPress now or later for this implementation.**
2. Build an **integrated first-party CMS** inside the protected school portal.
3. Use **Cloudinary** for public CMS pictures and videos.
4. Use **Supabase** for wording, content state, media metadata, publication workflow, search data and audit records.
5. Beautify **all public URLs** in a controlled migration, not only News and Events.
6. Publish separate **News** and **Events** sections, connected by a shared hub/navigation experience.
7. News and Events both support pictures and videos; Events additionally support countdowns and lifecycle states.
8. Inventory availability changes only after an **office-confirmed transaction**, return, cancellation, damage record or restock.
9. Retain the **manual Developer OTP Dispatcher** and later add automatic Meta/Paragon delivery ahead of it.
10. Create the developer account through a **one-time owner-authorised Supabase bootstrap** with Jibril privately selecting the password.
11. Never send an OTP from the Paragon bot number ending `6650` to itself.
12. Never substitute the public/admin number ending `2487` as Jibril’s account number.
13. Keep ordinary sign-in as **registered phone + password**, with browser-session-only persistence.
14. Keep payments manual: verified bank transfer or physical office POS, with independent office approval.
15. All real rosters and personal records must come from the owner; no records may be guessed.
16. Make almost all safe public wording database-managed: Home, About, Admissions, Classes, News, Events, Gallery, notices, selected policies, contact notices, shop descriptions, search records and related metadata.
17. Migrate verified existing text into the CMS; hold historical child-related media from republication until authority/provenance is reviewed.
18. Use top-level routes for core pages and typed clean routes for database-generated content (`/news/{slug}`, `/events/{slug}`, `/gallery/{slug}`).
19. Activate the manual school-account claim queue first after the developer bootstrap; admission tracking receives a separate acceptance step.
20. Proprietress and other pre-authorised leaders still verify an OTP before creating their first private password. Only the developer receives the exceptional one-time no-OTP owner bootstrap required to start the dispatcher.
21. Retain dynamic reading time, privacy-safe views, signed-in likes, signed-in moderated comments, and a Gallery generated from News/Event media relationships.
22. Migrate changing facts and content currently embedded in HTML/JavaScript to Supabase. Code remains responsible for templates, algorithms, validation, permissions and security—not for the changing facts themselves.

---

## 4. Target information architecture

### 4.1 Public primary routes

```text
/
/about
/academics
/admissions
/classes
/classes/creche
/classes/pre-nursery
/classes/nursery-1
/classes/nursery-2
/classes/primary-1
/classes/primary-2
/classes/primary-3
/classes/primary-4
/classes/primary-6
/fees
/news
/news/page/2
/news/{article-slug}
/events
/events/page/2
/events/archive
/events/{event-slug}
/gallery
/shop
/contact
/site-map
/search
/privacy
/safeguarding
/credits
```

### 4.2 Protected routes

```text
/portal/login
/portal/login#register
/portal/login#claim
/developer
/developer-review
```

Protected/private routes remain `noindex`, `nofollow`, `noarchive` and must not appear in public sitemaps.

### 4.3 Route principles

- HTTPS only.
- One canonical host: `www.treasureacademyageva.com`.
- Lowercase paths.
- Hyphens, never underscores, between URL words.
- Short descriptive English/Nigerian parent vocabulary.
- ASCII slugs; human titles can retain full Unicode.
- No content identity based only on a database UUID.
- No indexable content hidden behind `#` fragments.
- No session IDs, current timestamps or tracking tokens in internally linked public URLs.
- No date folder merely to make a duplicate story look different.
- No separate mobile domain or mobile URL.
- One no-trailing-slash policy.
- Decode once and encode once; reject malformed or double-encoded paths.

Google recommends descriptive URLs, hyphens, consistent casing and avoiding fragments for content-changing routes:
<https://developers.google.com/search/docs/crawling-indexing/url-structure>

Vercel clean URLs, redirects and internal rewrites will replace any perceived need for Apache `mod_rewrite`:
<https://vercel.com/docs/routing/rewrites>
<https://vercel.com/docs/project-configuration/vercel-json>

---

## 5. Safe URL migration and redirect policy

### 5.1 Existing public URLs

Existing `.html` routes will receive one-hop permanent redirects:

```text
/about.html                       → /about
/admissions.html                  → /admissions
/news.html                        → /news
/news/2026-2027-admissions-open.html
                                  → /news/2026-2027-admissions-open
```

The first page of a paginated collection is canonical without `/page/1`:

```text
/news/page/1   → /news
/events/page/1 → /events
```

Uppercase and trailing-slash variants redirect to the lowercase no-trailing-slash canonical.

### 5.2 Redirect use

- Permanent redirect for a durable move, renamed slug, retired `.html` URL or hostname normalization.
- Temporary redirect only for temporary maintenance, time-limited campaigns or controlled experiments.
- Never redirect all missing pages to the homepage; return a genuine helpful 404.
- Preserve query parameters only when they remain meaningful and safe.
- Store every changed CMS slug in a redirect-alias table.
- Detect and prevent redirect loops or chains before publication.

Google treats redirects as a strong canonical signal and recommends selecting one preferred URL:
<https://developers.google.com/search/docs/crawling-indexing/301-redirects>

---

## 6. Integrated CMS scope

The protected portal receives a new **Website CMS** workspace. It is not a second website and not a third-party CMS.

### 6.1 CMS-managed content

- News;
- Events;
- homepage announcements and alert bars;
- homepage featured News/Event cards;
- admissions availability and verified public guidance;
- class availability;
- calendar notices;
- uniform, supplies and transport notices;
- selected core-page sections;
- approved staff/public leadership profiles;
- consent-cleared gallery media;
- public shop descriptions and availability projections;
- contact-hours and closure notices;
- policy/review dates;
- SEO titles, descriptions and sharing media where a safe default is insufficient.

### 6.2 Code-managed concerns

- design system and responsive layout;
- authentication and authorisation;
- validation and sanitisation;
- route templates;
- security headers;
- accessibility components;
- structured-data generators;
- database policies and audit functions;
- payment and safeguarding boundaries.

Editors cannot upload arbitrary scripts, custom JavaScript or unrestricted raw HTML.

---

## 7. CMS content model

A new additive migration should introduce purpose-built live tables rather than reviving older unverified legacy `db/` tables.

### 7.1 Recommended tables

```text
public_content_entries
public_content_revisions
public_content_blocks
public_media_assets
public_content_media
public_content_tags
public_content_tag_links
public_content_slug_aliases
public_publication_events
public_content_approvals
public_site_content_slots
public_content_quality_findings
public_content_search_terms
public_site_navigation_items
public_content_views_daily
public_content_reactions
public_content_comments
public_comment_moderation_events
public_cms_bootstrap_authorisations
public_cms_bootstrap_events
```

Names may be refined during implementation, but responsibilities must remain separate.

### 7.2 Content entry fields

- immutable UUID;
- content type: `news`, `event`, `page`, `announcement`;
- lowercase unique slug;
- title;
- standfirst/summary;
- structured body blocks;
- category;
- tags and parent-facing search vocabulary;
- draft/review/scheduled/published/archived/cancelled status;
- author/creator;
- reviewer/approver;
- publisher;
- `created_at`, `updated_at`, `published_at`, `scheduled_for`, `archived_at`;
- optional effective and expiry times;
- featured-media ID;
- explicit social-media ID when needed;
- canonical route generated by the server;
- content-language and locale;
- source/provenance note;
- public/private classification;
- next-review date;
- content-version number.

### 7.3 Event fields

- start timestamp;
- end timestamp;
- Lagos display timezone;
- venue name;
- safe public address/description;
- event status: scheduled, postponed, cancelled, moved online, completed;
- attendance mode;
- public contact or registration action;
- automatic archive behavior;
- optional relation to a school term/calendar record without duplicating its facts.

### 7.4 Structured blocks

Allowed body blocks should include:

- paragraph;
- heading levels 2–4;
- ordered/unordered list;
- quote;
- callout;
- image;
- video;
- gallery;
- verified fact panel;
- table with accessible headers;
- button/CTA from an allowlisted route;
- related-content list.

No raw executable HTML is accepted. Every value is validated server-side and escaped for its output context.

---

## 8. Editorial workflow and authority

### 8.1 Workflow

```text
Draft
→ factual review
→ safeguarding/privacy review when required
→ approval
→ scheduled or published
→ periodic review
→ archived
```

### 8.2 Roles

- **Proprietress:** full-write authority, publishing and emergency override with an audit reason.
- **Headmistress:** authorised public-content and operational publishing.
- **Assistant Headmistress:** authorised public-content and operational publishing.
- **School Editor, if later approved:** draft/edit only unless separately granted publication authority.
- **Developer:** information review and technical health only; no publication authority unless the owner expressly grants a separate capability.
- **Safeguarding reviewer:** child-media approval scope only if introduced.

### 8.3 Recommended enhanced controls

- Ordinary verified text may be published by one authorised publisher.
- Content containing identifiable children should require a second safeguarding/consent confirmation.
- The creator should not approve their own child-media item except a Proprietress emergency override with a mandatory reason.
- Emergency notices must have an expiry time.
- Destructive delete is replaced by archive/soft delete; permanent media deletion requires no references and a retention delay.
- Every publication status change generates an immutable audit event.

---

## 9. News experience

### 9.1 Public structure

```text
/news
/news/page/{number}
/news/{slug}
/news/category/{slug}     (only if the category has enough unique useful content)
/news/feed.xml
```

### 9.2 News capabilities

- full article;
- short summary;
- featured picture;
- picture gallery;
- short video and poster;
- category and tags;
- authoring/publishing attribution to the school, not invented individuals;
- scheduled publication;
- optional expiry from featured placements without deleting the article;
- related stories;
- revision/update notice;
- share controls using the canonical URL;
- `NewsArticle` structured data when appropriate.

### 9.3 News quality rules

- unique headline and summary;
- no story created only to change a date;
- no copied social post without editorial context and authority;
- no candidate numbers, grades, private contacts, health records or unapproved child identities;
- minimum useful body threshold before indexing;
- exact duplicate hash block and near-duplicate warning;
- stale or superseded operational instructions link to the current authoritative guidance.

### 9.4 Reading time, views, likes and comments

- Reading time is calculated from the current published body at approximately 225 words per minute, with a minimum display of `1 min read`; video duration remains separate.
- Views are counted server-side, bot/repeated-refresh resistant where practical, aggregated without permanently retaining full IP addresses, and never trusted from a browser-supplied total.
- Likes require a signed-in active account, allow one reaction per account/content pair, can be removed, and expose only an aggregate count publicly.
- Comments require a signed-in authorised parent/staff account. Anonymous public comments are not accepted.
- Every comment begins `pending`; leadership moderation is required before publication.
- Comment states are `pending`, `approved`, `rejected`, `reported`, `hidden`, and `deleted_by_author`.
- Editing an approved comment returns it to review. Moderation actions require an audit reason.
- Public identity is privacy-safe (for example `Verified Parent` or `School Staff`); comments may not expose pupil names, phones, payment evidence or safeguarding details.
- Comments remain behind a dedicated feature gate until moderation coverage and tests pass.
- Popularity metrics never affect admission, payment, results, progression, account access or publication authority.

### 9.5 Database-generated Gallery

- A Cloudinary asset is uploaded once and linked through Supabase to one or more News/Event records.
- Approved relationships generate the article gallery, central `/gallery`, homepage placements and sharing media without duplicate uploads.
- Gallery filters include picture/video, News/Event, year and safe category.
- Every media viewer links back to its source News/Event.
- Withdrawing consent or unpublishing the source removes the media from every public placement through one backend state.
- Public download is a per-media permission: `view_only`, `public_derivative_download`, or `internal_only`.
- Public downloads use a safe optimised derivative with unnecessary camera/EXIF/geolocation metadata removed; original camera files and bulk child-media archives are not public by default.
- Videos require a poster and, where meaningful speech is present, captions or a transcript. They do not autoplay with sound.

---

## 10. Events experience

### 10.1 Public structure

```text
/events
/events/page/{number}
/events/archive
/events/{slug}
```

### 10.2 Countdown states

- More than 24 hours: `5 days to go`.
- Under 24 hours: `Starts in 6 hours 20 minutes`.
- Started and before end: `Happening now`.
- Ended: `Event ended` and move to archive.
- Postponed/cancelled: replace countdown with an explicit status and visible updated date.

The exact date/time remains visible and machine-readable at all times. JavaScript may update the countdown, but the server-rendered page must contain the event facts and a usable fallback.

### 10.3 Event SEO

Each indexable event has a unique leaf page and accurate `Event` JSON-LD matching the visible title, start/end time, status and location. Google recommends a unique URL focused on one event:
<https://developers.google.com/search/docs/appearance/structured-data/event>

---

## 11. Relative time and absolute-date policy

All stored timestamps use UTC. Editors work in and visitors see **Africa/Lagos** time.

| Age | Public label |
|---|---|
| Under 1 minute | `Just now` |
| 1–59 minutes | `12 minutes ago` |
| 1–23 hours | `4 hours ago` |
| 24–47 hours | `1 day ago` |
| 2–6 days | `3 days ago` |
| 7–13 days | `1 week ago` |
| 14–20 days | `2 weeks ago` |
| 21 days or older | `4 October 2026` |

Implementation rules:

- use `published_at` for “published” age;
- show a separate `updated_at` label only for a meaningful editorial change;
- retain `<time datetime="…">` with the complete timestamp;
- refresh relative labels without reloading;
- never reset publication age for a spelling correction;
- event countdown uses event start/end, never article publication time.

---

## 12. Media platform: Cloudinary + Supabase metadata

### 12.1 Responsibility split

- Cloudinary stores and serves approved public pictures/videos.
- Supabase stores ownership, consent, captions, alt text, dimensions, checksum, placement and review status.
- The CMS never stores a Cloudinary secret in browser code.
- Vercel issues short-lived signed upload authorisations after validating the signed-in user and capability.

Cloudinary’s current free plan is advertised as free without a card and uses a shared credit allowance for storage, delivery and transformations:
<https://cloudinary.com/pricing>
<https://cloudinary.com/documentation/billing_and_plans>

### 12.2 Media metadata

- Cloudinary public ID;
- secure delivery URL;
- resource type;
- original filename retained only where safe;
- MIME type and detected format;
- width/height/duration;
- byte size;
- checksum;
- alt text;
- caption;
- media owner/source;
- consent or authority reference;
- consent review/expiry date;
- people/child classification;
- uploaded by/time;
- approved by/time;
- publication state;
- allowed placements;
- focal point/crop preference;
- transcript/captions for meaningful video.

### 12.3 Media safety and performance

- permit only allowlisted image/video formats;
- validate file signatures, not only extensions;
- reject oversize files before upload;
- remove unnecessary EXIF/geolocation metadata from public derivatives;
- provide responsive widths and modern formats;
- retain dimensions to prevent layout shift;
- lazy-load below-the-fold media;
- preload only the true hero/LCP asset;
- provide a poster and captions/transcript for video;
- do not autoplay video with sound;
- block publication without meaningful alt text or an explicit decorative designation;
- block child-media publication without recorded authority;
- prevent deletion while referenced;
- produce an exportable media manifest to reduce vendor lock-in;
- alert before Cloudinary free-tier exhaustion.

### 12.4 CSP changes

Allow only the exact school Cloudinary delivery host in `img-src`/`media-src`. Uploads should pass through a signed server flow; no broad wildcard should be introduced unnecessarily.

---

## 13. Dynamic inventory and availability

The current shop, variant and inventory-movement structures remain the source of truth.

```text
available quantity = on hand − reserved − damaged
```

### 13.1 Public states

- In stock;
- Low stock;
- Out of stock;
- Temporarily unavailable;
- Not currently offered.

### 13.2 State changes

- confirmed office sale/fulfilment reduces stock;
- authorised restock increases stock;
- confirmed return increases stock where fit for resale;
- cancellation releases a valid reservation;
- damage removes units from sellable stock;
- product/variant deactivation shows unavailable without falsifying quantity.

### 13.3 Safety

- no anonymous reservation;
- no browser-trusted quantity update;
- no negative stock;
- database transaction and row lock prevent overselling;
- every adjustment is an immutable movement with actor, reason and reference;
- reconciled/verified products only may become public;
- price changes have a separate event history;
- manual payment verification never automatically changes admission, result, progression or access.

---

## 14. Other dynamic public information

Use the existing verified-public-information model where it fits, and add purpose-built content records where article behavior is required.

Examples:

- admissions open/closed/limited;
- class availability;
- verified fees guidance;
- transport availability;
- office closures;
- school-hours notice;
- calendar guidance;
- uniform/supplies guidance;
- emergency alert;
- homepage notice.

Every operational item should have:

- source;
- accountable owner;
- effective start;
- effective end or review date;
- publication state;
- revision identifier;
- publisher;
- audit history.

Expired information must stop appearing in current slots automatically but remain auditable.

### 14.1 Hardcoded-to-backend conversion rule

The project is not complete while changing public facts remain authoritative in HTML or generated JavaScript. The migration inventory must cover:

- current News listing and all existing article bodies;
- homepage featured/update cards;
- Event status/countdowns;
- Gallery image/video lists and captions;
- repeated contact/footer facts;
- class/admissions/fees/calendar/uniform/transport notices;
- safe core-page sections;
- shop descriptions and public inventory projections;
- search index entries and factual direct answers;
- dynamic page metadata, related-content links and sitemap entries.

For each current section: inventory → verify → import to Supabase → preserve source/revision → render from the database → compare public parity → redirect the former URL where necessary → remove the coded copy as the source of truth. Unverified facts stay draft. Existing historical text may migrate; historical child-related media stays unpublished until provenance/consent review.

The database stores changing data and state. Code stores reusable templates, rendering, validation, algorithms, security and fallbacks. Maximum dynamism does not mean making permissions, secrets or security rules editable as content.

---

## 15. Search

### 15.1 Search scope

- static core pages;
- News;
- Events;
- approved public information;
- classes;
- shop/uniform/supply descriptions;
- safe gallery captions;
- approved public policies.

### 15.2 Search implementation

- Postgres full-text search with weighted fields: title > summary > tags/search terms > body;
- optional trigram typo tolerance after measurement;
- school/parent vocabulary and approved synonyms;
- safe highlighted excerpts;
- pagination;
- keyboard and screen-reader accessible controls;
- no exposure of draft/private records;
- no raw SQL query construction;
- strict query length/rate limits.

### 15.3 Indexing behavior

`/search?q=…` is for users, not an indexable content farm. Search/filter result pages receive `noindex,follow`; they do not enter the sitemap.

Do not use the obsolete `meta keywords` tag as an SEO strategy. CMS search terms support internal matching and editorial vocabulary instead.

### 15.4 Recommended privacy-safe search insight

Retain short-lived aggregate counts of popular queries and zero-result phrases without phone, account, pupil or full IP data. This helps editors improve wording while protecting families.

### 15.5 Current Search audit and required conversion

The current site has 57 HTML files linking to Search. Its generated on-device index also has 57 destinations: public/core pages, nine class pages, the News archive, guidance/support pages and the secure portal login. The 404 page links to Search but is not indexed; the Search page currently indexes itself and must be removed from its own results.

The live “AI-like” experience is currently a browser meaning-aware index plus a verified-answer engine and optional published-information fetch. The separate `ai/main.py` FastAPI/LLM system is an undeployed prototype and must not be represented as a live production AI service.

The static `search-index.js` and hardcoded factual branches cannot remain authoritative after the CMS migration. Published CMS records must enter Search automatically and unpublished/archived records must leave automatically without a code deployment.

### 15.6 Safe answer stack

1. **Verified direct answer:** deterministic answer from current published Supabase facts.
2. **Meaning-aware retrieval:** weighted full-text/synonym retrieval across published content with source links.
3. **Optional generative summary later:** only after separate owner/privacy approval; it may summarise retrieved public sources, must cite them, may not access private portal data, and must fail closed below a confidence threshold.

Required fallback language:

- No verified fact: `This information has not been verified or published yet. Treasure Academy Search will not guess.`
- No matching route: `No matching page was found. Try fewer words or browse the site map.`
- Service unavailable: `Search is temporarily unavailable. You can still browse the site map or contact the school.`
- Private query: `Private information requires secure sign-in.`
- Low confidence: show related source pages instead of inventing an answer.

Every direct answer should expose supporting links and, where relevant, its last-reviewed date.

---

## 16. Pagination

Use crawlable links and durable URLs:

```text
/news
/news/page/2
/news/page/3
```

Rules:

- each page has its own self-canonical;
- page one redirects to the base collection;
- each page has crawlable previous/next anchor links;
- no pagination through hash fragments;
- invalid or empty out-of-range pages return 404;
- filter/sort variants are noindex unless deliberately curated as useful landing pages;
- optional “Load more” enhancement must not replace crawlable pagination.

Google recommends a unique URL and self-canonical for each paginated page:
<https://developers.google.com/search/docs/specialty/ecommerce/pagination-and-incremental-page-loading>

---

## 17. Canonicalization and duplicate prevention

### 17.1 Canonical signals

Every indexable page must agree across:

- response URL;
- self-referential absolute canonical tag;
- internal links;
- sitemap URL;
- Open Graph URL;
- structured-data URL;
- redirect targets.

Only canonical HTTPS `www` URLs enter the sitemap.

### 17.2 CMS duplicate controls

- unique slug constraint;
- exact normalized body hash;
- duplicate-title warning;
- near-duplicate summary/body score;
- no publication under multiple dates merely to create fresh URLs;
- slug aliases and permanent redirects;
- block conflicting canonical metadata;
- block a published article with an empty/thin body unless it is a valid short announcement;
- prevent two current operational publications for a topic where only one may be authoritative.

Google describes redirects and `rel=canonical` as strong canonical signals and sitemap inclusion as a supporting signal:
<https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls>

---

## 18. Metadata, Open Graph and structured data

### 18.1 All indexable pages

- unique `<title>`;
- useful meta description;
- absolute canonical;
- robots directive;
- Open Graph site name/title/description/URL/image/image alt;
- Twitter/X summary card metadata;
- breadcrumb structured data where appropriate;
- locale `en_NG`;
- meaningful visible heading hierarchy.

### 18.2 News

- `NewsArticle` only where the visible page is genuinely a news article;
- headline;
- publication and modification dates;
- school organisation as publisher;
- accurate image;
- canonical main entity.

### 18.3 Events

- `Event` with visible matching facts;
- event status;
- start/end;
- attendance mode;
- safe location;
- no invented ticket offer.

### 18.4 Shop

Do not claim merchant-purchase rich results until a truthful public purchase path and verified offer facts exist. Manual office purchase guidance must not be misrepresented as online checkout.

### 18.5 Quality rule

Structured data never contains hidden or invented facts. Preview, search, private and utility pages remain noindex.

---

## 19. Sitemap, feeds and discovery

### 19.1 Human sitemap

```text
/site-map
```

Friendly title: **Explore Treasure Academy**.

### 19.2 Machine sitemap

```text
/treasure-academy-sitemap.xml
```

The former `/sitemap.xml` permanently redirects to the machine sitemap. `robots.txt` points to the canonical sitemap URL.

The dynamic sitemap includes:

- canonical public core pages;
- published News;
- current and archived useful Events;
- approved public class pages;
- other valuable indexable pages;
- accurate `<lastmod>` from meaningful changes.

It excludes drafts, previews, search results, filter variants, login/portal/developer pages and redirects.

Google recommends fully qualified canonical URLs in a sitemap:
<https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap>

### 19.3 Feeds

Recommended:

```text
/news/feed.xml
/events/feed.xml
```

Feeds contain canonical URLs and summaries, not private content or full child-media payloads by default.

---

## 20. Server rendering and cache freshness

Indexable News/Event detail and listing pages must return meaningful HTML from the server. Social crawlers and search engines must not receive an empty shell that requires user interaction.

### 20.1 Recommended low-risk architecture

Retain the existing static + serverless Vercel architecture initially:

- existing core files remain stable behind clean routes;
- a consolidated serverless public-content renderer handles News, Events, feeds, sitemap and dynamic metadata;
- portal CMS JavaScript is modularised and bundled with esbuild;
- do not perform a wholesale Next.js/WordPress rewrite merely to add CMS capability.

A framework migration may be reconsidered only after the CMS stabilises and measurable maintenance/performance evidence supports it.

### 20.2 Freshness

Publishing should invalidate the relevant content tags/routes. If tag invalidation is unavailable in the chosen implementation, use a very short safe CDN TTL and explicit revalidation.

Vercel supports cache headers, runtime tags and on-demand invalidation:
<https://vercel.com/docs/caching/cdn-cache>
<https://vercel.com/docs/caching/cdn-cache/purge>

### 20.3 Service worker

- network-first for CMS pages and content APIs;
- cache-first only for versioned static assets;
- never cache authenticated/private API responses;
- do not let a stale service-worker response conceal an emergency update;
- version and retire old caches after deployment.

---

## 21. Developer account bootstrap without OTP

### 21.1 Goal

Allow the owner-approved developer to establish a private Supabase Auth password once, without Meta or same-number OTP, so the manual OTP Dispatcher can operate.

### 21.2 What must never be stored

Never store:

```text
DEVELOPER_PASSWORD=...
```

in an environment variable, ordinary table, migration, SQL seed, source file, chat message or audit log.

Supabase Auth, not a public table, owns password storage and verification. Supabase supports phone + password authentication and requires admin user creation to occur on a trusted server with the secret key kept out of browser code:
<https://supabase.com/docs/guides/auth/passwords>
<https://supabase.com/docs/reference/javascript/auth-admin-createuser>

### 21.3 Bootstrap flow

1. Owner uses the official Supabase dashboard to issue a random one-time developer-bootstrap authorisation.
2. Supabase stores only a hash, claim reference, expiry, usage state and owner-authorised reason.
3. Jibril opens the protected first-password section in `developer.html`.
4. He enters the already registered developer phone, one-time bootstrap authorisation and his own strong password twice.
5. The trusted Vercel server verifies:
   - bootstrap is unexpired and unused;
   - the phone matches the exact owner-approved pending claim;
   - the claim has developer-console authority;
   - no existing conflicting Auth user exists.
6. The server uses Supabase Auth Admin to create the phone/password user with owner-attested manual confirmation.
7. A service-only database function copies only the stored approved profile/capabilities.
8. Bootstrap is consumed and the endpoint closes.
9. Audit records `owner_authorised_supabase_bootstrap`, not a false WhatsApp verification.
10. Jibril signs in normally through `developer.html`.

### 21.4 Capability boundary

Jibril receives only the existing owner-approved capabilities:

- console access;
- OTP dispatch;
- public-information review;
- system-health read.

He does not receive school leadership, payment approval, pupil-record administration or publishing authority.

### 21.5 Number ending `6650`

- It is the Paragon bot sender and must never receive an OTP from itself.
- The manual bootstrap avoids self-OTP.
- It may remain a temporary login identifier only under the owner’s current direction.
- It must not be replaced with the public/admin number ending `2487`.
- A later owner-approved private number may replace it without creating a duplicate developer identity.

### 21.6 Bootstrap gate

Recommended temporary gate:

```text
DEVELOPER_MANUAL_BOOTSTRAP_ENABLED=true
```

After one successful bootstrap it returns to `false`. Database one-use state still prevents replay if environment configuration is changed incorrectly.

### 21.7 Recovery

- Signed-in password change requires the current password.
- Forgotten-password recovery uses another owner-issued, short-lived, one-use reset authorisation.
- No permanent recovery backdoor.
- Passwords remain absent from logs and developer/admin displays.

---

## 22. Manual OTP now, automatic Meta later

### 22.1 Manual mode

1. An eligible user requests an OTP.
2. The server creates a six-digit code, stores only a keyed hash and encrypts the one-time delivery payload.
3. The queue shows purpose, channel, timestamps and last four digits only.
4. An authorised developer reveals the message once.
5. The server destroys its encrypted copy.
6. The browser clears the reveal after 30 seconds.
7. The developer sends it manually to the exact registered number through WhatsApp or SMS.
8. The user verifies the code.
9. For account claims, the user then privately creates the first password.
10. Audit records actions but never code, message or full phone.

### 22.2 Automatic-with-manual-fallback mode

1. Generate and queue exactly one challenge.
2. Attempt signed Paragon relay when enabled.
3. If provider delivery is accepted and audited, mark sent and destroy the manual payload.
4. If relay is unavailable/fails, leave the encrypted payload queued for manual dispatch.
5. Never create two active codes for the same request.

### 22.3 Gate evolution

After developer bootstrap and manual-queue acceptance:

- `PORTAL_ACCOUNT_CLAIM_ENABLED` may be enabled for the manual dispatcher under the owner’s revised direction.
- `PARAGON_OTP_RELAY_ENABLED` remains false until Meta/Render gates pass.
- `ADMISSION_TRACKING_ENABLED` should be enabled independently only after the developer queue is proven to handle that purpose and the owner confirms the operating procedure.

Later, after Meta approval and security completion:

- enable `PARAGON_OTP_RELAY_ENABLED`;
- retain manual fallback;
- do not remove manual audit/expiry/rate-limit protections.

---

## 23. Parent and staff account principles

- Normal login: Nigerian phone + password.
- Browser-session-only persistence.
- Strong password: 12–128 characters with uppercase, lowercase, number and symbol.
- Leadership/staff identity must be pre-authorised.
- Proprietress activation uses registered `08141943478` → manual Developer OTP now or Meta later → OTP verification → private first-password creation → full-write account. The developer never receives the password.
- Headmistress and Assistant Headmistress use the same OTP-before-first-password claim principle for their distinct approved identities.
- OTP is not required for every ordinary login under the standing protocol; future privileged-account MFA would be a separate controlled enhancement.
- Parents use `TA-LINK`, `TA-FAMILY` or restricted applicant registration.
- No pupil login.
- No account grant from name/class alone.
- Maximum two active guardians per pupil.
- Restricted applicant accounts do not gain pupil records before authorised admission/linking.
- Passwords never appear in CMS, Developer Console, audit logs or support messages.
- Account status and role assignment remain server/database controlled.
- Password reset requires recorded identity verification and session revocation.

---

## 24. Security and privacy hardening

### 24.1 Application security

- Row Level Security for all CMS data.
- Anonymous policies expose only currently published projections.
- Service role never reaches browser code.
- Same-origin checks on mutations.
- CSRF-resistant request design.
- strict content types and body-size limits.
- rate limiting by opaque network hash and account/phone hash.
- generic responses to avoid user/phone enumeration.
- prepared Supabase queries/RPCs; no string-built SQL.
- output-context escaping.
- block arbitrary HTML/script uploads.
- file signature/type checks.
- immutable, code-free audit trail.
- revoke active sessions after suspension or sensitive password recovery.
- security headers and no-store on private pages/APIs.

### 24.2 CSP improvement

Gradually remove unnecessary inline script allowances from public pages. Permit only exact self and required Cloudinary/Supabase origins. Keep stricter CSP on portal/developer routes.

### 24.3 Public-data boundary

Never publish:

- passwords or credentials;
- pupil/guardian private identifiers;
- results or candidate numbers;
- dates of birth/medical records;
- private safeguarding reports;
- payment evidence;
- private phone numbers;
- child media without authority;
- unverified claims/testimonials.

### 24.4 Paragon data minimisation

Paragon may process only:

- registered phone;
- short-lived OTP;
- expiry;
- request/delivery status.

It must receive no pupil, class, result, payment or safeguarding data.

---

## 25. Accessibility standard

Target WCAG 2.2 AA behavior across CMS output and portal controls.

- semantic headings and landmarks;
- visible keyboard focus;
- skip links;
- accessible forms with labels/instructions/errors;
- sufficient contrast in day and dark themes;
- no color-only status;
- 44px practical touch targets;
- reduced-motion support;
- captions/transcripts for meaningful video;
- descriptive alt text;
- accessible tables;
- countdown announcements that do not overwhelm screen readers;
- mobile reflow without horizontal scrolling;
- automated axe checks plus keyboard/browser tests.

---

## 26. Performance standard

Target at the 75th percentile on mobile and desktop:

- LCP ≤ 2.5 seconds;
- INP ≤ 200 milliseconds;
- CLS ≤ 0.1.

These are the current “good” Core Web Vitals thresholds:
<https://web.dev/articles/vitals>

Methods:

- server-rendered primary content;
- minimal JavaScript;
- module/code splitting for CMS/admin only;
- explicit image/video dimensions;
- responsive Cloudinary derivatives;
- lazy loading below the fold;
- compressed self-hosted fonts;
- no render-blocking third-party widget;
- CDN caching with explicit invalidation;
- small JSON projections;
- database indexes for status, publication time, slug and search vector;
- performance budgets enforced in CI.

Recommended budgets:

- public critical JavaScript under 100 KB compressed where practical;
- no unexpected layout shift from CMS media;
- hero image selected and prioritised deliberately;
- dynamic page TTFB monitored, with graceful cached fallback only for public content.

---

## 27. Reliability, backups and disaster recovery

- additive migrations only;
- pre-migration schema/data inventory;
- no rerun of migrations 001–007;
- verify preservation counts before and after each migration;
- rollback plan for code and feature flags;
- database changes designed to be backward compatible during release;
- versioned content revisions;
- weekly encrypted logical export until a managed automatic-backup plan is adopted;
- periodic restore test;
- Cloudinary media manifest export;
- quota monitoring for Supabase, Vercel and Cloudinary;
- fail closed on database/auth/provider errors;
- public pages provide truthful fallback contact information without inventing content.

No secret, personal-data export or database backup enters Git.

---

## 28. Observability and audit

Monitor without collecting unnecessary family information:

- publication successes/failures;
- scheduled-job lag;
- broken media;
- 404 routes and redirect loops;
- search zero-results aggregates;
- API latency/error rates;
- Cloudinary/Supabase quota use;
- OTP queued/sent/verified/expired counts without codes/full phones;
- sign-in failure rate without recording passwords;
- sitemap generation status;
- content past review date;
- inventory reconciliation exceptions.

Never log request bodies from password or OTP completion endpoints.

---

## 29. Automated content quality

Before publication, the CMS should check:

- title and description length/uniqueness;
- slug format;
- duplicate/near-duplicate content;
- broken or unsafe links;
- missing alt text;
- missing media consent;
- missing event time/location/status;
- expired operational facts;
- invalid heading order;
- empty CTA labels;
- canonical conflict;
- social image dimensions;
- structured-data/visible-content mismatch;
- thin content;
- prohibited private-data patterns;
- spelling warnings without silently rewriting owner facts.

Warnings may be overridden only by an authorised publisher with a recorded reason; hard security/privacy violations cannot be overridden.

---

## 30. Testing programme

### 30.1 Database and RLS

- anonymous sees published/current records only;
- drafts and expired private records are inaccessible;
- role/capability escalation blocked;
- creator/publisher/audit fields cannot be forged;
- duplicate slugs blocked;
- revision and publication transaction atomic;
- inventory never negative;
- stock concurrency tested;
- old records preserved.

### 30.2 Authentication

- developer bootstrap token hashed, expiring and one-use;
- bootstrap accepts only the exact approved claim;
- password absent from logs/tables/responses;
- bot number receives no OTP;
- normal phone/password sign-in works;
- session remains browser-only;
- suspension/recovery revokes sessions;
- generic errors prevent enumeration.

### 30.3 Manual/automatic OTP

- one-time encrypted reveal;
- ciphertext destroyed on reveal/automatic delivery;
- browser clear timer;
- expiry and attempt lockout;
- code-free audit;
- automatic success removes manual payload;
- automatic failure preserves manual fallback;
- no self-message to `6650`;
- no school account created for test number `2487`.

### 30.4 CMS

- draft/review/schedule/publish/archive;
- revision restore;
- child-media approval;
- event countdown states;
- relative-time thresholds;
- homepage/list/detail consistency;
- cache invalidation;
- malformed block rejection;
- XSS payload rejection.

### 30.5 SEO/routes

- one-hop old-to-new redirects;
- no redirect loops;
- lowercase/case normalization;
- canonical/OG/sitemap agreement;
- pagination self-canonicals;
- search/filter noindex;
- real 404 for unknown/out-of-range pages;
- structured-data validation;
- crawlable links.

### 30.6 Accessibility/performance

- axe tests;
- keyboard-only use;
- screen-reader labels/status behavior;
- mobile/desktop browser tests;
- dark/day themes;
- reduced motion;
- image/video aspect-ratio stability;
- Lighthouse/performance budgets;
- no stale service-worker content after publication.

The owner is not required to perform application testing; automated and agent-run acceptance evidence must be supplied.

---

## 31. Phased implementation and commit plan

### Phase 0 — baseline and architecture

1. Preserve current source and production evidence.
2. Resolve unrelated working-tree mode changes.
3. Add architecture decision records and this plan.
4. Add feature flags and no-op interfaces without enabling production behavior.

### Phase 1 — developer bootstrap

1. Add one-time bootstrap table/function and code-free audit.
2. Add trusted server endpoint.
3. Add first-password UI to Developer Console.
4. Add password/recovery tests.
5. Deploy with bootstrap gate false.
6. Owner privately issues the one-time authorisation.
7. Jibril creates his password privately.
8. Disable bootstrap gate and verify normal login.

### Phase 2 — manual OTP operational release

1. Revalidate the existing encrypted queue and capability checks.
2. Test manual account-claim queue without Meta.
3. Enable account claims only after the dispatcher is operational.
4. Decide and separately test manual admission-tracking dispatch.
5. Keep Paragon relay false.

### Phase 3 — CMS database and policy

1. Apply one additive migration only.
2. Add content/revision/media/slug/audit structures.
3. Add published-only projections and RLS.
4. Prove preservation counts.

### Phase 4 — Cloudinary and media library

1. School-owned Cloudinary account.
2. Private Vercel secrets.
3. Signed upload route.
4. Media metadata/consent workflow.
5. Responsive delivery and CSP.

### Phase 5 — portal CMS

1. Modular CMS bundle.
2. block editor;
3. preview;
4. review/approval;
5. scheduling/archive;
6. revisions and audit;
7. media library.

### Phase 6 — dynamic News, Events, Gallery and interactions

1. server-rendered listings/details;
2. relative time and automatic reading time;
3. event countdown/lifecycle;
4. Cloudinary pictures/videos and database relationships;
5. generated Gallery and conditional safe downloads;
6. privacy-safe view aggregates;
7. signed-in likes;
8. signed-in moderated comments behind a feature gate;
9. homepage placements;
10. feeds and structured data.

### Phase 7 — hardcoded-to-backend conversion and operational dynamic data

1. migrate verified existing News/article text;
2. hold sensitive historical media for consent/provenance review;
3. migrate safe core-page sections, repeated public facts and homepage slots;
4. replace static search/factual answer sources with database projections;
5. verified information slots;
6. admissions/class/transport notices;
7. inventory availability projection;
8. stale-content reminders;
9. parity-check every migrated route before removing the coded copy as source of truth.

### Phase 8 — clean URL migration

1. route inventory and redirect map;
2. clean URLs and rewrites;
3. canonical updates;
4. internal-link updates;
5. one-hop regression tests;
6. Search Console migration monitoring.

### Phase 9 — search, sitemap and final quality

1. database search;
2. friendly human sitemap;
3. dynamic XML sitemap;
4. duplicate checks;
5. accessibility/performance/security hardening;
6. production acceptance and rollback evidence.

### Phase 10 — Meta/Render completion

1. private Render `APP_SECRET`;
2. permanent live `PHONE_NUMBER_ID`;
3. redeploy and unsigned-webhook 403;
4. Meta template approval;
5. one authorised direct delivery to `2487`;
6. delivery webhook evidence;
7. one signed relay test;
8. enable Paragon relay while retaining manual fallback.

Each commit should be single-purpose, tested and reversible. CMS work must not be mixed with provider-secret configuration.

---

## 32. Release gates and acceptance criteria

The dynamic CMS release is acceptable only when:

- existing public pages and portal remain available;
- former database records are preserved;
- authorised editors can draft/review/publish without code changes;
- one update appears consistently on home/list/detail/search/sitemap/social metadata;
- media permissions and consent are enforced;
- News and Events have unique clean URLs;
- changing News/Event/core-page facts no longer depend on a coded copy as the public source of truth;
- Gallery media is generated from database relationships and withdrawn everywhere from one backend state;
- read time, view aggregates, signed-in likes and moderated comments behave according to their privacy gates;
- Event countdown/archive behavior is correct;
- relative-time behavior matches the approved thresholds;
- newly published CMS records enter Search/sitemap/related content automatically and unpublished records leave automatically;
- office-confirmed inventory updates public availability atomically;
- clean URL redirects are one hop;
- no duplicate canonical URLs enter the sitemap;
- mobile and desktop use the same content and canonical URLs;
- private pages and search results are not indexed;
- accessibility/performance budgets pass;
- no password/OTP/secret is found in logs, source or audit data;
- automated production probes pass;
- a rollback is documented.

The manual developer/OTP release is acceptable only when:

- bootstrap is one-use and disabled after success;
- Jibril’s password remains private;
- capabilities match the existing approved claim only;
- no OTP is sent to the bot number from itself;
- manual queue reveal/destruction/audit controls pass;
- ordinary claimants create their own password only after OTP verification.

---

## 33. Highest recommendations — owner-confirmed implementation rules

The following recommendations are all explicitly retained in the approved scope:

1. **One source of truth:** never maintain the same current fact in HTML and Supabase. A changing item is not migrated until the database is authoritative and the coded copy is retired from public output.
2. **Structured blocks, not raw HTML:** provide maximum editorial flexibility without creating an unrestricted script/layout security hole.
3. **Server rendering:** dynamic pages must remain fast, indexable, resilient and shareable.
4. **Stable clean URLs:** title changes must not casually change a public URL; internal UUIDs stay hidden and old slugs become aliases/redirects.
5. **Two-person review for identifiable child media:** safeguarding/consent approval is distinct from ordinary editorial approval.
6. **Signed-in, moderated comments only:** no anonymous public school-site comments; every comment begins pending and moderation is audited.
7. **Signed-in likes and privacy-safe aggregated views:** no browser-controlled totals and no public list of family identities.
8. **Original media is not publicly downloadable by default:** offer only an approved derivative, remove unnecessary metadata, and prohibit default bulk child-media downloads.
9. **Every operational fact needs a source, effective date and review date:** fees, events, closures, availability and notices must expire or return for review rather than silently becoming stale.
10. **Search answers cite published sources and refuse to guess:** low confidence returns related pages or a truthful handoff instead of an invented answer.
11. **No external generative AI until a separate privacy review:** retrieval-first verified answers remain the default.
12. **Cache invalidation on publication:** one CMS change must appear across home, detail, listing, Search, sitemap, related content and social metadata promptly.
13. **Revision history and restoration:** provide diffs and one-click restore so editorial errors are not irreversible.
14. **Soft archive instead of destructive deletion:** preserve public history, redirects, audit evidence and safe recovery.
15. **Additive migrations only:** protect every former Supabase record and never rerun the first seven migrations.
16. **Automated preservation, security, accessibility and SEO tests before every release:** no reliance on owner testing.
17. **Weekly encrypted database export and periodic restore test:** a backup is not trusted until restoration is proven.
18. **Cloudinary quota and orphan-media monitoring:** alert before limits, export a media manifest and remove unreferenced files only after the approved retention delay.
19. **Future MFA for privileged accounts:** add a suitable owner-approved second factor when the delivery/provider path is ready.
20. **Avoid a wholesale framework rewrite:** improve the working static/serverless architecture incrementally and reconsider a framework migration only with measurable evidence.
21. **Keep the manual OTP dispatcher permanently as an emergency fallback:** automatic Meta success clears the manual payload; provider failure leaves a controlled manual route.
22. **Separate CMS permissions from school-record permissions:** publishing authority is never an indirect grant to pupil, result, payment or safeguarding records.
23. **Never let popularity metrics influence school operations:** views, likes and comments do not affect admission, payment, progression, results, access or publication authority.
24. **Use feature gates for comments, downloads, AI and automatic OTP:** build and test each capability before public activation and retain an immediate fail-closed switch.
25. **Do not activate public content until its database record and permission model are proven:** preview, RLS, audit, consent and published-only projection must pass first.

Additional high-value rules retained with them:

26. **Automatic Search/sitemap lifecycle:** published CMS records enter every discovery surface automatically; unpublished/archived records leave automatically.
27. **Shared renderer and shell:** database-generated and fixed-route pages are visually, semantically and technically indistinguishable.
28. **Preview tokens with `noindex`/`no-store`:** reviewers can inspect accurate output without exposing drafts.
29. **Content quality gate:** test duplicate content, broken links, accessibility, alt text, metadata, structured data and prohibited private-data patterns before publication.
30. **Emergency publication mode with forced expiry:** urgent notices can move quickly but remain time-bounded and auditable.

---

## 34. Remaining owner/provider decisions

These are not passwords and should be settled before their relevant phase:

- creation of the school-owned Cloudinary account;
- preferred retention period for orphaned/unpublished media;
- assignment of the second safeguarding/consent reviewer for identifiable child media;
- timing of the separate manual admission-tracking acceptance window after account claims are proven;
- when an owner-approved private receiving number becomes available for Jibril’s long-term identity;
- when the owner can privately complete Meta and Render dashboard configuration.

No provider secret or password is ever required in chat.

---

## 35. Required footer for every future commit report

Every future implementation commit report must end with this reminder:

> **External Meta/Render hold reminder:** Privately configure Render `APP_SECRET`; permanently correct the live `PHONE_NUMBER_ID`; redeploy and verify unsigned `/webhook` returns 403; wait for `treasure_academy_authentication / en_US` to become APPROVED; perform one authorised delivery test to the number ending `2487`; verify the delivery webhook; run one signed relay test; then enable the automatic Paragon relay while retaining the manual dispatcher. Never send an OTP to the bot number ending `6650`, and never paste a password or provider secret into chat.

---

## 36. Final architecture summary

```text
Authorised school leader
        │
        ▼
Protected Treasure Academy portal / CMS
        │
        ├── Supabase: content, operations, permissions, revisions, audit
        │
        ├── Cloudinary: approved public pictures and videos
        │
        └── Vercel: server rendering, clean routes, cache, security
                    │
                    ▼
        Public website, News, Events, Search, Sitemap

Approved claimant
        │ requests OTP
        ▼
Encrypted Treasure Academy challenge
        │
        ├── Later: signed Paragon/Meta automatic delivery
        │
        └── Always retained fallback: capability-scoped manual Developer Console
                    │
                    ▼
        OTP verification → claimant creates private password → normal phone/password login
```

This structure keeps the public site dynamic without introducing WordPress, keeps school operations in one governed system, protects passwords from developers and chat, and allows manual OTP operations to work before Meta automation is ready.
