# Run 11 — Clean Routes, Discovery and Final Quality Acceptance Evidence

**Date:** 27 October 2026
**Authority:** owner-approved dynamic-platform master plan
**Boundary accepted:** repository, disposable local PostgreSQL and local browser/restore environments only
**Production source:** unchanged Run 4 commit `a552618e40791a592cb9e586b2963d61ed46ad2c`

## 1. Outcome

Run 11 is complete at its safe local boundary. It establishes one governed public-route registry, one-hop former-filename redirects, clean static rewrites, clean canonical/internal/Search links, a published-only dynamic XML sitemap, a grouped human site map, duplicate/link/metadata controls, rendered accessibility and performance budgets, cache-withdrawal controls and an authenticated encrypted backup/restore drill.

Nothing was released or activated. No push, deployment, Production SQL, content import, inventory reconciliation, Cloudinary request, OTP/provider message or gate activation occurred.

## 2. Route registry and compiler

`config/public-routes.json` is the authoritative reviewed route inventory. It contains:

- 56 unique former-source to clean-canonical dispositions;
- 31 fixed indexable routes with reviewed sitemap metadata;
- `/index.html` → `/`, `/class.html` → `/classes`, `/explore.html` → `/site-map`;
- clean nested Class and News routes;
- an explicit destination and indexability decision for every static public page.

`tools/build-clean-routes.py` validates that registry and deterministically compiles:

- page canonicals and Open Graph URLs;
- internal HTML links, local Search destinations and knowledge-base destinations;
- `server/public-routes.generated.mjs`;
- fixed `sitemap.xml` metadata;
- Vercel redirects, rewrites and clean-route cache/indexability headers.

The compiler runs after page/bundle generation and before held-content hashing, so earlier generators may emit their source templates but the final deployable output is always clean. Two complete builds produced byte-identical repository file content.

## 3. Routing and real not-found behavior

`vercel.json` now provides:

- permanent one-hop redirects for all 56 former public filenames;
- no destination that starts another generated redirect;
- clean static rewrites to preserved source files;
- dynamic `/news`, typed detail/feed/pagination routes and `/sitemap.xml` before static fallbacks;
- exact `/class` and `/explore` compatibility aliases;
- no homepage catch-all and no redirect loop.

The disabled-CMS `/news` path now returns a real 404 rather than redirecting back to `/news.html`, whose clean redirect would otherwise loop. Unknown and out-of-range dynamic routes remain real non-indexable 404 responses.

The local clean-route test server applies the same redirect/rewrite model to every authoritative browser suite. This replaced the former filesystem-only server assumptions and removed `networkidle` waits from the affected tests.

## 4. Canonical, links, Search and discovery agreement

Every registered page now has the exact clean canonical and matching `og:url`. Public HTML links, generated Search records and knowledge-base records emit clean destinations. The static audit resolves clean rewrites back to their reviewed files rather than treating extensionless routes as missing assets.

The fixed sitemap contains exactly 31 unique clean indexable locations. The consolidated public-content Function serves `/sitemap.xml` whether the CMS gate is off or on:

- gate off: fixed reviewed routes only;
- gate on: fixed routes plus current published News, Events and eligible Gallery detail routes;
- unpublished/archived/ineligible records disappear with the next request;
- feeds, aliases, filters, Search, pagination, archives, private and noindex states are excluded.

The human `/site-map` groups joining, learning, families, school, community and help tasks with crawlable clean links.

## 5. Database clean-path contract

Forward migration:

```text
supabase/migrations/20261027110000_clean_routes_and_discovery_quality.sql
```

It preserves rows while converting existing governed core-slot and verified-information source paths to clean destinations. It replaces only the core-slot path constraint/RPC contract and the fixed Search view contract. Inventory Search now emits `/shop`, and authenticated-only mutation, empty definer search path, RLS and grants are preserved.

Disposable PostgreSQL 17 acceptance passed:

```text
17/17 ordered migrations
11/11 rollback-safe policy suites
read-only postflight passed
```

The existing revision-restore lifecycle test continues to pass, including immutable revision history and private restore before republication.

## 6. Content, accessibility and performance quality

Run 11 automated quality checks prove:

- every public route has one clean canonical and matching Open Graph URL;
- all JSON-LD blocks parse;
- no registered page has exact duplicate normalised main content;
- all registered pages remain substantial and link-resolvable;
- mobile/dark and desktop/day clean routes have no horizontal overflow;
- automated axe has no serious or critical finding on representative clean routes;
- keyboard, reduced-motion and screen-reader/status regressions remain green in the complete suite;
- representative local `DOMContentLoaded` stays under 2.5 seconds;
- representative transferred resources stay under 1.75 MiB;
- cumulative layout shift stays below 0.1.

A dark-theme contrast defect on the founder avatar was found and corrected in the owned CSS source before the bundle was regenerated.

## 7. Cache and withdrawal controls

Dynamic News, Events and Gallery requests remain network-only in the service worker. Dynamic sitemap is not precached. Clean private form/receipt paths and all protected portal/developer/CMS assets remain excluded. Fixed navigation has a new Run 11 cache identity.

Public SSR, feed and sitemap shared-cache windows are 30 seconds. The service worker cannot conceal a publication, archive, consent withdrawal or emergency correction. The cache test rejects dynamic precaching and obsolete 60-second response policy.

## 8. Encrypted backup and restoration

Three operator tools were added:

- `tools/create-encrypted-database-backup.sh` — private `pg_service.conf` input, custom-format dump, AES-256-CBC/PBKDF2 encryption, independent derived encryption/MAC keys, HMAC-SHA256 encrypt-then-MAC, mode-600 artifacts and non-secret manifest;
- `tools/verify-encrypted-database-backup.sh` — authenticates before decryption and permits restore only to an explicitly disposable local `taa_restore_*` database;
- `tools/test-encrypted-backup-restore.sh` — constructs the complete local schema, writes a sentinel record, encrypts, proves plaintext removal, authenticates/decrypts byte-identically and restores into a second database.

The accepted drill restored **112 public tables, 112 RLS-enabled tables and the exact sentinel data**. Plain dumps, generated passphrases and restored databases were destroyed by the test trap. No Production data or secret entered the workspace.

Recovery targets are documented in the Run 11 rollback plan: encrypted export at least weekly and before any Production migration; maximum seven-day scheduled RPO; a 60-minute full isolated-restore validation target; quarterly restore rehearsal and after any material schema/backup-tool change. A backup is not accepted until its MAC, decryption and restored catalog/data checks pass.

## 9. Acceptance results

- Run 11 route/discovery Node tests: **7/7**.
- Run 11 clean-route browser acceptance: passed one-hop redirect, mobile/dark, desktop/day, axe and performance budgets.
- Production audit: **16/16**.
- Visitor UX: **45/45**.
- Portal/security: **87/87**.
- Runs 8–10 public content: **27/27**.
- Visitor browser: **1618/1618** across 57 pages and three viewports.
- Accessibility components: 59 light-theme and 5 dark-theme pages with zero serious/critical findings.
- Complete secure, operations, portal, CMS, public-content, engagement, verified-content, Run 11 and header browser suites passed.
- `git diff --check`, JavaScript syntax, deterministic rebuild and schema mirror checks passed.

## 10. Production and activation boundary

Production remains on deployment `dpl_DLjZRSt67DAxHhsBYprfhYeJV2h2` and source `a552618e40791a592cb9e586b2963d61ed46ad2c`. Run 11 SQL is not applied. No clean redirect or dynamic sitemap is deployed. All public/CMS/media/engagement/comment/placement/Search/core-slot/inventory/account/admission/relay gates remain fail-closed.

A future authorised release must first take and restore-verify an encrypted backup, record exact preservation counts, deploy/apply with every gate false, run Production probes, and retain immediate Vercel promotion rollback. Real content/provider/gate acceptance remains separate.
