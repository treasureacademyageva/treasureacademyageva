# Run 10 — Verified Content, Search, Core Slots and Inventory Acceptance Evidence

**Date:** 27 October 2026
**Authority:** owner-approved dynamic-platform master plan
**Boundary accepted:** repository, disposable local PostgreSQL and local browser environment only
**Production source:** unchanged Run 4 commit `a552618e40791a592cb9e586b2963d61ed46ad2c`

## 1. Outcome

Run 10 is complete at its safe local boundary. It adds source-hashed held content migration, reviewed operational-information projections, safe core-page placements, source-backed Search, coarse office-authoritative inventory availability and stale-content controls.

Nothing was published or activated. No Production SQL, source deployment, content staging/import, core slot, inventory reconciliation, Search request, Cloudinary request or public gate activation occurred. Existing static content remains the public authority.

Vercel Production now contains the three Run 10 gates as encrypted exact `false` and a private Search HMAC pepper as a Sensitive value. Creating those values caused no deployment.

## 2. Additive database boundary

Migration:

```text
supabase/migrations/20261027100000_verified_content_search_and_inventory.sql
```

The migration is data-neutral. It creates no candidate, publication, slot, inventory reconciliation or Search insight row. It adds:

- required source, accountability and next-review fields for future verified-information publication;
- a current, effective, non-stale public verified-information projection;
- source-hashed, text-only held migration candidates and immutable migration/source events;
- separate audited verification and ordinary-draft import RPCs;
- fixed allowlisted core-page slots and immutable placement events;
- a reconciled coarse inventory projection without public balances or actors;
- a service-only published Search projection and bounded weighted query RPC;
- short-lived HMAC rate buckets and aggregate topic/zero-result daily insights;
- a private stale/due-soon review queue.

All 16 ordered migrations, 10 rollback-safe policy suites and the read-only postflight pass in disposable PostgreSQL 17.

## 3. Verified content migration

`tools/build-content-migration-manifest.py` deterministically generates:

```text
content/migration/run10-held-candidates.json
```

The manifest contains 14 repository-HTML candidates. Every candidate is:

- held and verification-required;
- tied to the SHA-256 of its exact source HTML;
- structured text only;
- free of image, video and Gallery blocks;
- not a publication or import instruction.

Six historical News candidates explicitly keep child-related media held. The remaining safe core-page candidates carry no media relationship. Existing wording is not assumed current merely because it exists in the repository.

The protected CMS now supports local manifest selection and stages one candidate at a time through the capability-checked RPC. Browser parsing rejects unsupported, oversized, non-held, unhashed or media-bearing manifests. Staging still creates only a held row. Verification, draft import, independent review and publication remain separate audited decisions. No candidate was staged.

## 4. Current information and stale controls

A verified operational item cannot be newly published without:

- a local supporting source path;
- a private verification/source note;
- an accountable owner;
- a current next-review date;
- database-managed reviewer and publication timestamps.

The anonymous endpoint reads only `public_verified_information`, which excludes draft, archived, not-yet-effective, expired and stale rows. The protected CMS displays CMS and verified-information records that are overdue or due within 30 days. Public Search and core slots also exclude stale content.

## 5. Search

Search is dispatched through the existing twelfth Function:

```text
/api/public/search -> /api/public-content?action=search
```

Accepted controls:

- exact `PUBLIC_CMS_SEARCH_ENABLED=true`, subordinate to `PUBLIC_CMS_ENABLED=true`;
- same-origin `POST` with `application/json` only;
- 2–120 characters and a bounded request body;
- explicit submission only; typing does not transmit a query;
- no application-generated raw query in the page URL;
- obvious private queries fail closed before any database call;
- private, low-confidence/no-answer, rate-limited and unavailable states are distinct and truthful;
- verified direct answers include a supporting source;
- all results use local allowlisted paths and fixed output fields;
- Search does not index itself;
- inventory enters Search only when the independent inventory gate is exact true;
- an enabled-service failure never falls back to coded answers;
- the reviewed local index remains authoritative only while the database Search gate is disabled.

Rate limiting stores only a rotating HMAC bucket hash. A bucket is capped rather than allowed to overflow its constraint, and expired hashes are removed on the next request. Daily insights retain only an allowlisted topic family, total count and zero-result count. No raw query, full IP address, user agent or actor/account identifier is stored.

## 6. Safe core-page slots

Sixteen governed pages load the generated, versioned DOM-only core-slot client:

```text
about, academics, admissions, fees, contact, calendar, exams, transport,
uniform, shop, PTA, careers, privacy, safeguarding, credits, request-centre
```

A publisher may place only an already-public Page or Announcement at one of three fixed mounts and three bounded positions. The server returns an allowlisted block-type projection and strips unknown payload keys. The browser creates elements and text nodes; it does not accept raw HTML.

The page generators now own the script attachments and Run 10 CSS. A complete rebuild preserves exactly one core-slot client on all 16 pages and one inventory client on the Shop page.

## 7. Inventory availability

The public inventory endpoint reads only reconciled product/variant pairs through the service-only projection. It returns:

- product and variant labels;
- SKU/category and eligible-class labels;
- one coarse state: in stock, low stock, out of stock, temporarily unavailable or not currently offered;
- whether a request may be started, which is always false for an inactive product or variant;
- a last-updated timestamp.

It never returns on-hand, reserved, damaged, movement, cost, price or actor fields. Public display creates no reservation. Office-confirmed transactions remain the only authority that changes or reserves stock.

The protected Inventory workspace now shows the exact coarse public-state preview and whether the public gate is closed. No legacy catalogue value, quantity or price was reconciled or guessed.

## 8. Protected CMS and portal controls

The CMS `Migration & freshness` panel includes:

- controlled held-manifest staging;
- candidate status, source locator and SHA-256;
- audited verify/reject and draft-import actions;
- historical-media hold warnings;
- stale-content review queue;
- core-slot form, current records and immutable audit history;
- current Search, core-slot and inventory gate states.

The Office Inventory panel retains its existing product/variant creation, preserved-row mapping, owner verification, active-state, stock movement, procurement, stocktake, order and return controls. Run 10 adds a public coarse-state preview only; it does not create a second stock authority.

## 9. Routing and Function ceiling

Run 10 adds three rewrites but no Function:

```text
/api/public/search                    -> /api/public-content?action=search
/api/public/content/core-slots        -> /api/public-content?action=core-slots
/api/public/inventory                 -> /api/public-content?action=inventory
```

The local API inventory remains exactly 12/12 Functions.

## 10. Acceptance results

### Focused Node/API

```text
npm run test:public-content
27/27 passed across Runs 8–10
```

Run 10 coverage includes exact gate hierarchy, POST/origin/body bounds, private-query fail-closed behavior, HMAC rate data, source citations, fixed block payloads, inventory field stripping, deterministic manifest hashes, migration controls, generator-owned clients, safe rendering and 12-Function routing.

### Disposable PostgreSQL 17

```text
npm run test:sql-local
16/16 ordered migrations
10/10 rollback-safe policy suites
read-only postflight passed
```

The Run 10 suite proves private-table RLS/grants, held → verified/rejected → imported transitions, source linkage, media rejection, publisher-only core slots, current/stale projections, reconciled inventory, non-negative sellable balance, service-only Search, inventory Search gating, bounded rate buckets, expired-bucket cleanup, aggregate-only insights and immutable audits.

### Browser/accessibility

```text
npm run test:verified-content-browser
passed
```

It proves explicit-submit Search, no query URL, answer/results/private/no-answer states, source rendering, executable-looking Search/core-slot/inventory strings remaining inert, mobile overflow, dark-theme contrast and zero serious/critical axe findings.

### Build and complete regression

- two complete content/schema builds produced byte-identical output across all 575 tracked/staged paths before this evidence-only note was updated;
- `supabase-schema.sql` is regenerated from all 16 migrations;
- JavaScript syntax and `git diff --check` pass;
- production audit, visitor UX, verified answers, portal/security, developer bootstrap, Runs 4–7 TAP, Runs 8–10 focused tests, chatbot, answer coverage and all browser/accessibility suites pass through the authoritative runner;
- visitor browser acceptance remains 1447/1447 across 57 pages and three viewports.

## 11. Production/provider state

Provider-safe changes only:

- `PUBLIC_CMS_SEARCH_ENABLED=false` — encrypted Production value;
- `PUBLIC_CMS_CORE_SLOTS_ENABLED=false` — encrypted Production value;
- `PUBLIC_INVENTORY_ENABLED=false` — encrypted Production value;
- `CMS_SEARCH_HASH_PEPPER` — private Sensitive Production value;
- no deployment was created or promoted;
- no Production SQL was applied;
- no Supabase row or Auth/storage record changed;
- no content candidate was staged, verified, imported or published;
- no core slot or inventory value was created/reconciled;
- no Cloudinary request/upload occurred;
- no OTP/test message was sent;
- Production source remains `a552618e40791a592cb9e586b2963d61ed46ad2c`.

## 12. Activation remains separate

A future release must first deploy Runs 5–10 source and apply the accepted additive migrations with every public gate false. It must then verify protected capabilities, candidate/source parity, current review dates, Search citations, stale/unavailable behavior and office inventory reconciliation. Search, core slots and inventory each require a separate explicit activation decision. Historical child media remains held until its own provenance, consent and safeguarding review succeeds.
