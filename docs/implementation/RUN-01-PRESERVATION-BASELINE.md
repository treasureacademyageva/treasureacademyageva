# Run 1 Preservation Baseline

**Captured:** 25 October 2026 (Africa/Lagos)
**Purpose:** immutable pre-implementation evidence for preservation, parity and rollback comparisons
**Mutation policy:** source inspection and live read-only queries only; no production SQL write, deployment, provider configuration or feature-gate change occurred

## 1. Source baseline

| Item | Value |
|---|---|
| Repository branch | `main` |
| Local HEAD | `da11bcdb414034cbc0b59243f7b354e9c518d5ae` |
| Local tree | `4595524d9393448d88857af113ebcb07e4335e53` |
| `origin/main` | `c4cd6f317be31ed30d9778056c3a22c71950f098` |
| Ahead/behind | local is one commit ahead, zero behind |
| Tracked files | 485 |
| Authoritative blueprint SHA-256 | `f5b4ba9179d68c926059a30f7bf9b543d74977f11e0f3fec3931b7ce6ca4a72f` |
| Current sitemap SHA-256 | `a4e41dc928392ad0ad597ac8af8ae9363bb6b4fe98edc696096ea6be6172e55e` |
| Current `vercel.json` SHA-256 | `d6c5e3944799ec1a5ab7a66c58b90fcbf097c601f07136d2bcc65e9c9022697f` |
| Concatenated eight migration SHA-256 | `29c02f49072dc97975096ea605786bec247907b289b76fd16921833d817433a2` |

The approved blueprint was committed alone at `da11bcd`. The three unrelated mode-only tool changes listed in the implementation tracker pre-date this run and remain unstaged.

## 2. Runtime/toolchain baseline

- Node.js `20.20.2`.
- npm `10.8.2`.
- Python `3.13.16`.
- Project dependencies installed from the lockfile with `npm ci`.
- Playwright Chromium and the required Linux runtime libraries installed for browser QA.
- PostgreSQL `17.11` installed locally only; the disposable test database is created and dropped by the existing SQL QA script.
- No Docker dependency is required for the accepted local SQL run.

## 3. Complete accepted test baseline

### Existing application runner

`bash tools/run-current-tests.sh` passed after browser prerequisites were installed:

- static audit: 65 HTML files, 31 sitemap URLs and 38 unique canonical links;
- production audit: 16/16;
- visitor UX: 45/45;
- verified answers: 10/10;
- portal/security: 84/84;
- chatbot safety: 11/11;
- answer coverage: 20/20;
- review gateway: 5 passed, 1 optional secret-bearing test skipped;
- browser visitor QA: 1,447/1,447 across 57 pages and three viewports;
- accessibility: 59 light-theme and 5 dark-theme pages, zero serious/critical findings;
- secure workflows: 4/4;
- operations browser: 3/3;
- portal browser: 7/7;
- header browser: 7/7.

### Disposable local database runner

`bash tools/test-sql-migrations.sh` passed against a fresh local PostgreSQL database:

- 8/8 repository migrations applied in order;
- 4/4 rollback-safe RLS/policy suites passed;
- `20261024_post_migration_read_only_verification.sql` passed;
- the disposable database was removed by the script.

This locally reconstructs the repository migration history only. It does not rerun any production migration.

## 4. Public route and discovery baseline

| Surface | Count | Notes |
|---|---:|---|
| Audited deployable HTML files | 65 | 45 root, 9 class, 6 news, 5 portal |
| Explicitly indexable HTML files | 31 | Exactly matches the current XML sitemap |
| Explicitly noindex HTML files | 34 | Includes utility/private/protected routes |
| Unique canonical links validated | 38 | Includes seven canonicalized noindex historical/utility pages outside the sitemap |
| Static Search records | 57 | Browser-side generated index; currently includes Search itself |
| Browser QA pages | 57 | Tested at three viewports |
| Current XML sitemap URLs | 31 | All use HTTPS and the canonical `www` host |

Current URLs remain `.html`-based except `/`. Clean-route implementation has not begun.

## 5. Media preservation baseline

- `assets/img/` contains 108 files totalling 11,123,130 bytes.
- The existing media decision register classifies all 108 assets: 57 restored public assets, 28 generated responsive derivatives, 12 excluded private record images, 5 excluded third-party marks, 5 retained-unreferenced files and 1 known third-party placeholder.
- `assets/img/graduates/` contains 12 private photographed record images. They remain excluded from deployment and must never be used as a public migration source.
- Three 2024 excursion source photographs and three Facebook archive links are currently referenced by the static News page. They must not be imported as publishable CMS media until the new consent/provenance workflow approves them.
- Existing illustration/provenance caveats remain preserved. Migration does not convert “restored for review” into consent evidence.

The authoritative per-file hashes and treatments remain in `docs/MEDIA-RESTORATION-INVENTORY-2026-10-22.csv`.

## 6. Production Supabase read-only baseline

Read-only inspection of the active `eu-west-1` project returned:

| Measure | Exact/current value |
|---|---:|
| Project health | `ACTIVE_HEALTHY` |
| Applied migration-history entries | 15 |
| Public tables | 102 |
| Public tables with RLS enabled | 102 |
| Exact rows across public tables | 85 |
| Public RLS policies | 136 |
| Public functions | 136 |
| Non-internal public triggers | 76 |
| Auth users | 0 |
| Auth users with phone identity | 0 |
| Auth users ever signed in | 0 |
| Supabase Storage buckets | 0 |
| Supabase Storage objects | 0 |
| Supabase Edge Functions | 0 |

### Exact non-zero public table counts

| Relation | Rows | Preservation rule |
|---|---:|---|
| `admission_windows` | 1 | Preserve; do not infer current owner approval from seed status |
| `calendar_events` | 5 | Preserve legacy content; verify before CMS Event migration |
| `class_progression` | 10 | Preserve approved no-Primary-5 progression |
| `enrolment_cutover_control` | 1 | Preserve cutover guard |
| `exam_timetable` | 6 | Preserve; remains private/verified operational data |
| `fee_structure` | 10 | Preserve; payment scope remains manual and private |
| `holiday_assignments` | 2 | Preserve; no online assignment submission |
| `portal_account_claims` | 4 | Preserve owner-approved claims; no Auth user exists yet |
| `pta_meetings` | 1 | Preserve; verify before public use |
| `school_data` | 1 | Mandatory preservation; never retire before verified cutover |
| `sessions` | 1 | Preserve legacy row and schema |
| `shop_items` | 25 | Preserve; public availability must later use office-confirmed state only |
| `staff` | 6 | Preserve private records; never treat as public staff-profile approval |
| `staff_meetings` | 1 | Preserve private operational record |
| `transport_routes` | 3 | Preserve; verify scope before public projection |
| `uniform_items` | 8 | Preserve; verify prices/stock before public projection |

All other 86 public tables contained zero rows at capture time. Important exact zero counts include `news_posts`, `news_images`, `verified_public_information`, `profiles`, `students`, `pupils`, `developer_capabilities`, `portal_account_claim_challenges`, all new inventory-ledger tables and all new payment tables.

The 15 production migration-history entries comprise seven earlier migrations plus the eight repository migrations. The first seven must never be rerun. Future migrations must be additive and individually named.

## 7. Authentication baseline

Production Auth is currently configured with:

- signup disabled;
- email provider enabled but unconfirmed signup remains disabled by the global signup switch;
- phone provider disabled;
- zero users;
- refresh-token rotation enabled;
- TOTP capability available but not yet part of the approved onboarding flow;
- site URL set to the canonical production site.

The application enforces 12–128-character passwords even though the provider-level minimum remains lower. Run 2 must keep the stronger application policy and test it at the trusted boundary. No provider configuration changed in Run 1.

## 8. Current service and provider dependency baseline

### Active architecture

- Vercel: static delivery, headers, redirects/rewrites and serverless API handlers.
- Supabase: database/Auth target; public content projection endpoint exists but is disabled and its table is empty.
- Paragon relay: code path exists, automatic relay remains disabled.
- Public outbound links: canonical school site, WhatsApp, Facebook archive posts/video, Google map/directions and the existing Paragon public site link.

### Absent or deliberately inactive

- No Cloudinary account/configuration or CSP allowance exists yet.
- No CMS database model, CMS editor or dynamic News/Event renderer exists.
- No Supabase Storage bucket/object or Edge Function is in use.
- No Auth user exists.
- No WordPress integration is authorised; the old proposal/prototype is historical only.
- The optional local FastAPI/LLM prototype is not production connected and remains excluded.
- Monnify/card-payment code is dormant and out of approved scope; its gates must remain false.

## 9. Repository API and database surface

- 10 Vercel API files under `api/`.
- 9 server modules under `server/`.
- 8 additive repository migrations under `supabase/migrations/`.
- Current public-information endpoint: `api/public-information.mjs`, anonymous published-only read from `verified_public_information`, fail-closed behind `PUBLIC_INFORMATION_ENABLED`.
- Existing account claims: `server/account-claims.mjs`, encrypted manual queue with one active challenge semantics and relay fallback behavior.
- Existing admission tracking: `server/admission-tracking.mjs`, separate encrypted manual OTP queue.
- Existing developer dispatcher: `server/developer-console.mjs` plus `api/developer-service.mjs`.
- No owner-authorised no-OTP developer bootstrap endpoint/table/function exists yet.

## 10. Fail-closed defaults

`.env.example` keeps every public/portal/claim/registration/admission/developer/relay/payment gate false. Provider keys and encryption/pepper fields are empty. This repository baseline does not prove a secret value and deliberately records no secret.

## 11. Preservation comparison protocol

Before and after every future live migration:

1. verify the active project and health;
2. record migration history and exact row counts for every previously non-zero table;
3. verify `school_data` remains present with at least its baseline row;
4. verify all former tables remain present and RLS-enabled;
5. verify Auth user, Storage and new CMS counts separately;
6. run repository SQL reconstruction and policy suites locally;
7. apply one named additive migration only through the approved migration mechanism;
8. rerun read-only postflight and compare counts;
9. stop on any unexplained decrease, missing relation, RLS disablement or unexpected public projection;
10. never “repair” a failed preservation check by deleting or recreating production data.
