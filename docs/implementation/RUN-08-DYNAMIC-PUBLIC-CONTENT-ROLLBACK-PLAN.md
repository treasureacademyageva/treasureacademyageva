# Run 8 — Dynamic Public Content Rollback and Containment Plan

**Date:** 27 October 2026
**Scope:** consolidated public-content Function, Run 8 delivery projection, News/Event/Gallery rewrites, server rendering, feeds, derivative proxy, public assets and network-only service-worker handling

## 1. Current boundary

Run 8 source and SQL are local only. They have not been pushed, deployed, Production-applied or populated. No Supabase record, content/media import, Cloudinary request/upload or public route activation occurred.

The three exact Run 8 Production environment values now exist in Vercel as encrypted `false`:

```text
PUBLIC_CMS_ENABLED=false
PUBLIC_CMS_MEDIA_ENABLED=false
PUBLIC_CMS_DOWNLOADS_ENABLED=false
```

Creating those disabled values did not trigger a deployment. Production still serves Run 4 source `a552618e40791a592cb9e586b2963d61ed46ad2c` through deployment `dpl_DLjZRSt67DAxHhsBYprfhYeJV2h2`.

At this boundary, code rollback means abandoning the Run 8 commit and returning local `main` to `d381dc6fa263e7bf920bc890fab85d6d39d1bb44`. Production source and database require no Run 8 rollback. The three false values may remain as harmless fail-closed preparation; delete them only if Run 8 is formally abandoned, not as an incident reflex.

## 2. Universal containment order

If any future Run 8 acceptance fails:

1. retain or set `PUBLIC_CMS_DOWNLOADS_ENABLED=false`;
2. retain or set `PUBLIC_CMS_MEDIA_ENABLED=false`;
3. retain or set `PUBLIC_CMS_ENABLED=false`;
4. deploy/promote a configuration snapshot that contains those false values, because Vercel variable edits do not alter an already-built deployment;
5. verify `/news` returns only the approved temporary redirect to `/news.html`;
6. verify new Event, Gallery, feed, asset and download routes return non-indexable 404 responses;
7. if routing/config itself is suspect, promote the last accepted pre-Run-8 deployment;
8. preserve every content identity, revision, block, media relationship, alias, approval and provider asset;
9. preserve sanitised evidence without provider signatures, secrets, raw consent references or child records;
10. diagnose and repair forward before any later activation decision.

Do not disable the secure school portal or delete CMS/media history merely because the independent public renderer is contained.

## 3. Immediate containment triggers

Keep all three gates false for any of these:

- a new public route resolves while `PUBLIC_CMS_ENABLED` is not exactly `true`;
- `/news/*.html` is captured by a dynamic slug rewrite before verified clean-route cutover;
- a draft, future, expired, archived, cancelled-withdrawn or otherwise ineligible record appears publicly;
- an empty/filtered/unavailable response becomes indexable contrary to its state;
- visible facts disagree with canonical, Open Graph, JSON-LD or feed output;
- a hostile block, path, metadata value or JSON-LD value executes markup/script;
- Event archive/current membership or countdown wording disagrees with the authoritative Lagos lifecycle;
- an Event with a passed start and no end time is falsely reported as ended;
- Gallery contains media not derived from a current published News/Event relationship;
- a Gallery identifier exposes a UUID/provider ID or changes solely because relationships were reordered;
- consent, provenance, safeguarding, relationship or source withdrawal leaves a media route reachable;
- a signed provider URL, original asset or bulk child-media path reaches a client;
- a download succeeds without both the global gate and explicit current relationship permission;
- the proxy accepts redirects, unsupported types/variants, malformed/multiple ranges or an unexpected status;
- feeds expose blocks, private fields, media payloads or noncanonical URLs;
- the service worker serves stale dynamic HTML/media as an offline fallback;
- the Function count exceeds 12;
- a provider/database failure produces guessed content rather than a truthful 503;
- an unexplained Production deployment, SQL mutation, import or provider request occurs.

## 4. Forward-repair paths

### 4.1 Route/rewrite defect

- keep the master gate false;
- if needed, promote the pre-Run-8 deployment immediately;
- correct both Vercel patterns and server-side classification—never rely on only one;
- preserve `.html` filesystem routes until Run 10 parity and Run 11 redirect acceptance;
- run the official Vercel config validator and routing conversion locally;
- rerun legacy-path, pagination, alias, canonical and 404 regression before redeployment.

### 4.2 Published projection or RLS defect

- keep all public/media/download gates false;
- do not compensate with browser filtering or a service-role public query;
- correct the projection/helper additively with fixed columns and empty `search_path` for definer functions;
- prove anonymous base-table reads still fail;
- prove publish/unpublish/archive/consent/provenance/safeguarding transitions remove output immediately at the data authority;
- preserve legacy relations and all immutable CMS/media history.

### 4.3 Escaping or structured-block defect

- keep the master gate false;
- preserve only synthetic hostile fixtures in tests;
- tighten server validation/rendering context by context;
- keep unknown block types non-rendering;
- prove text, attributes, internal paths and JSON-LD are independently safe;
- do not introduce raw HTML, arbitrary embeds or client-only sanitisation as a shortcut.

### 4.4 Event lifecycle defect

- keep the master gate false if the wrong state can affect current/archive membership or public decisions;
- correct the shared server lifecycle first, then matching progressive client wording;
- use absolute instants and fixed `Africa/Lagos` display;
- never infer an end time or completion state;
- rerun boundary tests around start/end/status transitions and machine-readable times.

### 4.5 Gallery/media/download defect

- set the download gate false first, then media false if viewing is affected;
- preserve every provider asset and Supabase manifest/relationship row;
- archive/withdraw through accepted governance rather than deleting evidence;
- rotate the dedicated provider credential only if exposure is suspected;
- never paste a replacement credential into chat, source or evidence;
- never call a provider destroy/delete API as automatic rollback;
- re-test with fictional repository data and a generated non-child fixture only after separate provider-smoke authorisation.

### 4.6 Metadata, feed or cache defect

- keep the master gate false for private/incorrect metadata exposure;
- generate visible facts and machine metadata from the same public record;
- exclude full bodies, private fields and media payloads from feeds;
- retain one-minute CDN freshness only after withdrawal behavior is proven;
- keep dynamic routes network-only in the service worker;
- do not add disabled routes to the sitemap as a workaround.

### 4.7 Accessibility or responsive defect

- keep affected routes disabled when the defect blocks essential reading/navigation;
- repair semantic landmarks, headings, labels, focus, contrast, status announcements and mobile overflow in the shared renderer/styles;
- rerun light/dark mobile Chromium and axe checks plus complete existing browser regression.

## 5. Database treatment

Run 8 adds one data-neutral migration that replaces a public-usability helper and published-media projection. It creates no content rows.

If it has not been applied, there is no Production database rollback.

If it is later applied, rollback remains containment plus forward repair:

- never rerun the first seven migrations;
- never use migration-history repair, canonical `db push`, `--include-all` or former-migration replay;
- never drop `school_data`, legacy News/Event relations or immutable CMS/media history;
- never delete content/media to hide a projection defect;
- issue a new additive migration to restrict or correct the helper/view;
- retain zero anonymous base-table privileges and exact fixed-column projections;
- repeat full disposable reconstruction and exact Production before/after preservation counts.

Dropping the Run 8 view is not an acceptable emergency response if any accepted consumer exists. Gate off the public surface first and repair forward.

## 6. Cache and withdrawal expectations

- HTML and feed edge freshness is at most 60 seconds plus 60 seconds stale-while-revalidate.
- Media derivatives use 60-second browser/edge freshness.
- The service worker stores no dynamic public-content response.
- Database withdrawal is authoritative; after containment, a gate-off deployment must return 404 regardless of stale catalog state.
- If one-minute propagation is unsafe for a specific incident, promote the last accepted gate-off deployment and verify externally rather than deleting source records/assets.

## 7. Re-acceptance minimum

Before reopening any contained Run 8 surface:

- all three gates are proven false in a deployed snapshot first;
- exact source/migration hashes and deployment source commit are recorded;
- Function count is exactly 12/12 or lower;
- Vercel schema validation and rewrite conversion pass;
- `.html` legacy News paths remain preserved until authorised cutover;
- only publishable projections are queried with a publishable key;
- anonymous base-table and private-column reads fail;
- News/Event listing, pagination, archive, detail, alias and 404 tests pass;
- read-time, relative-time and Lagos lifecycle boundary tests pass;
- structured blocks, internal paths, metadata and JSON-LD adversarial tests pass;
- Gallery source linkage, opaque stable IDs and all withdrawal cases pass;
- original/bulk routes remain absent and signed provider URLs remain concealed;
- derivative type/status/range/timeout/redirect controls pass;
- download requires both gates and relationship permission;
- feeds contain canonical summaries only;
- dynamic service-worker handling remains network-only;
- mobile/light/dark/axe checks pass;
- 14-migration disposable SQL, all policy suites, portal/security and full current regression pass;
- exact Production preservation probes show no unexplained loss or activation;
- a separate owner-approved gate decision exists for the specific surface being opened.

## 8. Conclusion

Run 8 rollback is gate-first, deployment-aware and non-destructive. Disable downloads, then media, then the master public renderer; ensure those values are present in the deployed snapshot; preserve all records and assets; retain legacy static News until verified cutover; and repair projections/rendering forward.

Destructive SQL reversal, automatic provider deletion, invented fallback content, stale service-worker fallback or opening one gate to work around another is not permitted.
