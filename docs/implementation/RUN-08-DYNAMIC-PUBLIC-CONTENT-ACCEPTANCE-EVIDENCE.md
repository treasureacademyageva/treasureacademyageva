# Run 8 — Dynamic Public News, Events and Gallery Acceptance Evidence

**Date:** 27 October 2026
**Authority:** owner-approved Dynamic Platform Master Plan and accepted Runs 5–7 CMS/media boundaries
**Acceptance boundary:** repository source, disposable-local PostgreSQL, mocked published projections/media delivery, Chromium rendering and Vercel configuration parsing
**Production boundary:** no push, deployment, Production SQL, Supabase row, content/media import, Cloudinary request/upload or public-gate activation

## 1. Decision

Run 8 is accepted at the repository, disposable-local and disabled-provider-configuration boundary. It adds a single fail-closed public-content Function and meaningful server-rendered News, Events and Gallery surfaces without fabricating or importing a record.

The three independent release gates are exact-true only:

```text
PUBLIC_CMS_ENABLED=false
PUBLIC_CMS_MEDIA_ENABLED=false
PUBLIC_CMS_DOWNLOADS_ENABLED=false
```

All three now exist as encrypted, Production-scoped Vercel values set to the literal disabled value `false`. This safe provider work did not create a deployment and cannot change the environment snapshot of the currently promoted deployment. During setup, three initially misnamed disabled values were recognised before any deployment and immediately deleted; only the exact code-consumed names above remain. No gate was true at any point.

Production remains on unchanged Run 4 source `a552618e40791a592cb9e586b2963d61ed46ad2c`, promoted as deployment `dpl_DLjZRSt67DAxHhsBYprfhYeJV2h2`. The Run 8 migration is not applied and no dynamic public route is deployed.

## 2. Implemented boundary

### 2.1 One consolidated Function and fail-closed routing

`api/public-content.mjs` dispatches all Run 8 routes to `server/public-content.mjs`. This is one new Function and brings the repository to the exact Hobby-plan ceiling of **12/12**, not one Function per page.

The accepted public route family is:

```text
/news
/news/page/{n}
/news/{safe-slug}
/news/feed.xml
/events
/events/page/{n}
/events/archive
/events/archive/page/{n}
/events/{safe-slug}
/events/feed.xml
/gallery
/gallery/{source-slug}-media-{opaque-12-hex-id}
/gallery/{source-slug}-media-{opaque-12-hex-id}/asset
/gallery/{source-slug}-media-{opaque-12-hex-id}/download
```

Vercel rewrite markers preserve the original public path inside the Function. Dynamic News/Event slug patterns accept lowercase letters, digits and hyphens only, so preserved `/news/*.html` files are not captured. Gallery paths require the exact opaque suffix shape. Route classification independently repeats the allowlists, bounds paths/queries and accepts only `GET` or `HEAD`.

With the master public gate false:

- `/news` temporarily redirects to the still-authoritative `/news.html`;
- every other new Run 8 route returns a private, non-indexable 404;
- no Supabase query, Cloudinary signing or provider request occurs.

Media and download gates are subordinate and independent. Gallery/media routes remain 404 when the media gate is false; derivative downloads remain 404 when either the download gate is false or the current relationship lacks explicit `placement='download'` permission.

### 2.2 Published-only data boundary

The renderer uses the browser-safe Supabase publishable key, no persistent session and only fixed-column Run 5/8 published projections:

- `public_cms_published_entries`;
- `public_cms_published_blocks`;
- `public_cms_published_media`;
- `public_cms_published_tags`;
- `public_cms_slug_redirects`.

Migration `20261027080000_public_content_delivery.sql` remains additive and data-neutral. It tightens public media usability to require:

- an approved, unarchived Cloudinary asset;
- authenticated provider delivery;
- a completed upload with provider version and original format;
- verified provenance;
- approved consent, or an explicit non-child `not_required` state;
- approved safeguarding for identifiable-child media;
- at least one currently public content relationship.

The published media view adds only `provider_version` and `original_format`, the minimum coordinates needed for version-bound transformed delivery. Consent references, checksums, etags, provider asset UIDs, creator/reviewer identities, private audit fields and original delivery URLs remain excluded.

The SQL creates no content, media, role, capability, alias, engagement or provider row. Existing legacy relations and `school_data` remain untouched.

### 2.3 Server-rendered News and Events

News and Event listing/detail responses are complete HTML, not browser-only placeholders. They include the existing public shell, accessible navigation, visible empty/unavailable states, responsive cards, canonical pagination and private-safe 404 handling.

News detail pages provide:

- title, summary, category, tags and publication facts from the current public revision;
- computed reading time at approximately 225 words per minute, minimum `1 min read`;
- approved relative-time thresholds with an absolute `<time datetime>` value;
- all 13 allowlisted block types where applicable;
- safe related-content links resolved back through the published projection;
- progressive share behavior without making client JavaScript authoritative.

Event pages use fixed `Africa/Lagos` formatting and machine-readable absolute start/end values. Accepted lifecycle outcomes include scheduled countdowns, happening now, postponed, moved online, cancelled, completed and ended. If a start time has passed but no end time exists, the renderer does not falsely mark the event ended; it says **“Event start time passed — confirm current status”**. Current and archived listing membership uses the same lifecycle function.

`/news/page/1`, `/events/page/1` and `/events/archive/page/1` canonicalise in one hop to their first-page routes. Out-of-range pages return a non-indexable 404. Current one-hop aliases redirect only to database-approved internal destinations; missing, unpublished, archived or withdrawn items reveal no draft data.

### 2.4 Context-safe structured content

Every text, attribute, URL and JSON-LD context is escaped independently. Internal paths reject protocol-relative paths and traversal. JSON-LD escapes HTML-significant characters. There is no raw-HTML block, `innerHTML` execution contract, arbitrary script, external embed or unmanaged media URL.

The renderer recognises only the accepted block set:

- paragraph and bounded headings;
- ordered/unordered lists;
- quote and typed callout;
- governed image, video and gallery;
- verified fact with an internal supporting source;
- accessible table;
- internal CTA button;
- published related content.

Unknown types render nothing. Media blocks resolve only an approved relationship from the current published revision. Hostile test payloads remain visible as text and do not execute.

### 2.5 Governed Gallery and media delivery

Gallery content is generated only from current News/Event media relationships in the published projection. It cannot be independently populated. Every item links back to its published source and disappears when source publication, asset approval, provenance, consent, safeguarding or the relationship ceases to be current.

Gallery identifiers are stable opaque values of the form:

```text
{source-slug}-media-{first 12 hex characters of SHA-256(entry UUID + media UUID)}
```

They do not expose either UUID, the Cloudinary public ID or provider asset UID, and they do not change when relationship ordering changes.

Gallery filtering supports media type, source type, Lagos year and safe category. Filtered and empty views are `noindex,follow`; the unfiltered non-empty Gallery may be indexed. Detail pages expose visible source/credit facts plus matching ImageObject or VideoObject structured data.

The trusted media proxy:

- signs only fixed, version-bound Cloudinary derivative allowlists;
- never returns or redirects to a provider signed URL;
- permits only accepted image/video content types and upstream 200/206 responses;
- passes only syntactically valid single byte ranges;
- rejects redirects and times out after eight seconds;
- sets `nosniff`, a media-only CSP, no-referrer and one-minute cache headers;
- provides a safe generated filename only for explicitly approved derivatives;
- has no original or bulk child-media route.

### 2.6 Metadata, feeds, cache and discovery

Visible facts and metadata use the same current public record. Accepted output includes:

- exact canonical URLs;
- Open Graph and Twitter title, description, URL, image and image alt text;
- NewsArticle or Event JSON-LD where applicable;
- BreadcrumbList data;
- ImageObject/VideoObject data on Gallery details;
- `noindex` on empty/filtered/unavailable/not-found states.

`/news/feed.xml` and `/events/feed.xml` expose at most 30 canonical published summaries with title, canonical URL and publication date. They include no blocks, child-media payloads, private fields, signed provider URLs or engagement details.

Dynamic public content and feeds use a one-minute safe CDN freshness window. The service worker treats `/news`, `/events` and `/gallery` dynamic routes as network-only and does not fall back to stale HTML. `/news.html` remains the preserved static authority while the master gate is false.

`sitemap.xml` and `robots.txt` are deliberately unchanged in Run 8. Advertising disabled routes or hardcoding an empty/unmigrated CMS catalog would be inaccurate. Dynamic sitemap ownership and clean-route cutover remain Run 11 work after verified content migration; Run 8 route responses still enforce their own robots state.

## 3. Acceptance evidence

### 3.1 Focused Node route/security suite

`npm run test:public-content` passed **9/9** checks covering:

- exact independent gates and legacy News fallback while disabled;
- relative-time, read-time and Event lifecycle thresholds;
- meaningful SSR News, hostile-text escaping and metadata parity;
- Lagos Event facts, truthful lifecycle fallback and Event JSON-LD;
- pagination, archive separation, feeds and one-hop aliases;
- relationship-only Gallery with stable opaque identifiers and source links;
- version-bound derivative delivery, signed-URL concealment and download permission;
- fixed projections and the 12/12 Function ceiling;
- patterned rewrites, legacy `.html` protection, service-worker network-only behavior and accessible assets.

### 3.2 Dedicated Chromium scenario

`npm run test:public-content-browser` passed:

- server-rendered News detail;
- hostile text/XSS containment;
- Event lifecycle output;
- Gallery rendering and source link;
- 390 × 844 mobile reflow;
- dark-theme rendering;
- zero serious or critical axe finding.

### 3.3 Disposable PostgreSQL reconstruction

`npm run test:sql-local` rebuilt the entire accepted schema in PostgreSQL 17:

```text
14/14 ordered migrations
8/8 rollback-safe policy suites
read-only postflight passed
```

The Run 8 SQL suite proves exact public-media columns, anonymous access only through fixed projections, current publication/media eligibility, withdrawal behavior and private-column exclusion using complete fictional provider-confirmed fixtures.

### 3.4 Complete regression

The full `npm test` path passed after Run 8 integration:

- production static audit: pass;
- visitor UX: **45/45**;
- verified answers: **10/10**;
- portal/security: **87/87**;
- developer bootstrap: **12/12**;
- combined Run 4–7 TAP: **34/34**;
- Run 8 focused suite: **9/9**.

The authoritative current runner additionally passed all existing chatbot, answer-coverage, review-gateway, visitor-browser, accessibility, secure-workflow, operations, portal, Run 7 CMS, Run 8 public-content and header-browser checks.

### 3.5 Vercel configuration and provider boundary

- JSON parsing: pass.
- Vercel CLI **65.4.0** `validateConfig`: pass.
- `@vercel/routing-utils` **6.6.0** `convertRewrites`: pass, producing the intended anchored regular expressions and substitutions for all 14 Run 8 rewrites.
- Dynamic slug rewrites exclude dots, so `/news/{slug}.html` remains a filesystem route.
- Gallery rewrite patterns require the exact 12-hex opaque suffix.
- Production gate values were created encrypted and false.
- A post-change Vercel deployment listing confirms the same Run 4 deployment remains current; no deployment was triggered.

A full local `vercel build` was not treated as acceptance evidence because the retained CLI token available in the sandbox was rejected. No login, token replacement, deploy or secret read was attempted. Configuration acceptance instead used the official CLI validator and routing package locally plus focused route regression.

## 4. Security and privacy conclusions

- No draft/private CMS table or service-role key is used by the public renderer.
- No real content or legacy calendar row was imported, reclassified or guessed.
- No child-media consent/provenance assumption was made.
- No provider URL, original-media route or bulk download is public.
- Download requires both a global exact-true gate and explicit current relationship permission.
- Stable Gallery identifiers expose no UUID or provider ID.
- Unknown blocks, unsafe paths, invalid methods, malformed ranges and unsupported variants fail closed.
- Database/provider failures return a truthful non-indexable 503, not fabricated content.
- Empty public collections are non-indexable and explain that the website will not invent information.
- Engagement counts/comments are absent; Run 9 remains separate.

## 5. Source identity

```text
d1239e337b42215badd946ddadb0e0f75a68bcae83f8f07d039d2e4f61a4cbd7  server/public-content.mjs
bf0b8f3b078353ca05999d587b3d5a838fb68ffed036ce01bf57f951b91b777a  api/public-content.mjs
8a9098bd9742ed9ac061856f132a271b967a5088b8e7d1bbb13f31f1bfad087c  supabase/migrations/20261027080000_public_content_delivery.sql
63ed45664ccf543682d5fa1498a1334f04bbf3d884b8bf36dee2639db6b56ca9  supabase/tests/public_content_delivery.test.sql
e1c0282e355dc4bb35f0503f3f69fc020327b58c4ee85f52100d05440cadc430  assets/css/public-content.css
904400b4552a224dc4c1adb000f912db9474292c2ff7f9c392af42129b6eae2f  assets/js/public-content.js
06dfa68a4007bd54729d6266d33bd1667d0a3733bdbf96ff4877f1666f294f96  tools/tests/run8-public-content.test.mjs
5616eb5f1b0061328fc22c461c90f96190761a8c4bf260e6992ab3bc42495e2a  tools/tests/run8-public-content-browser.e2e.js
a4dbc41b70ad0dd88c467be32e0006374d8e05c163d6dc00b05a81004126d4dd  vercel.json
60b0c83e14d8a1756603507a672f67dcfdacb93e436e261c670e728968aa68be  sw.js
3759c4aa827c6fee25546903fde29bb81329ad433b2eb3a1d427141c94fdbdd1  package.json
```

The accepted pre-Run-8 local commit is `d381dc6fa263e7bf920bc890fab85d6d39d1bb44`. `origin/main` and promoted Production remain `a552618e40791a592cb9e586b2963d61ed46ad2c`.

## 6. Holds before public release

1. Run 5, Run 6 and Run 8 SQL require a separately authorised Production preservation window with exact before/after counts.
2. Runs 5–8 source requires a separate push/deployment decision with all CMS/public/media/download gates false.
3. Protected CMS and neutral generated non-child media smoke acceptance remain prerequisites for real media work.
4. Real News/Event text requires Run 10 source verification and immutable import evidence; no legacy row becomes current automatically.
5. Historical child-related media remains held until provenance, consent and independent safeguarding review pass.
6. Public route activation requires route-by-route parity, content availability, production probes and a separate exact gate decision.
7. Dynamic sitemap/clean-route redirects remain Run 11 and must not advertise unavailable routes early.
8. Views, signed-in likes and moderated comments remain Run 9; no engagement placeholder or count was fabricated.

## 7. Boundary conclusion

Run 8 satisfies its local dynamic-public-content acceptance. The renderer is server-first, projection-only, context-escaped, lifecycle-consistent, relationship-generated, metadata-aligned, network-first and fail closed behind three independent disabled gates.

Run 8 is **not pushed, deployed, Production-applied, populated, provider-media-tested or activated**. The only provider change is the safe creation of the three exact Production gate values as encrypted `false`; it caused no deployment and no public behavior change. No owner dashboard action is required at this boundary.
