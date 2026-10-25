# Treasure Academy, Ageva — public website and secure school portal

Static public website plus a gated Supabase-backed parent, teacher and administrator portal for **Treasure Academy, Ageva, Okene, Kogi State**.

The canonical production site is `https://www.treasureacademyageva.com`. Local protected-branch work is not production. A branch push or deployment never authorises database SQL, data import or feature activation.

## Start here

- Maintenance and owner rules: `docs/MAINTENANCE.md`
- Current school-office architecture and acceptance gates: `docs/SCHOOL-OFFICE-OPERATIONS-PROGRAMME-2026-10-23.md`
- Live-schema preservation map: `docs/LIVE-SCHEMA-ACCOUNT-MAPPING-2026-10-23.md`
- Running implementation history: `docs/HANDOVER.md`
- Manual legacy preservation steps: `supabase/manual/README.md`

## Local setup

```bash
npm ci
npm run build:content
python3 -m http.server 4173 --bind 0.0.0.0
```

The browser and accessibility suites expect the static server on port 4173.

## Main architecture

```text
*.html                       privacy-safe public site
portal/login.html            one secure phone/password portal entry
assets/js/portal-source.js   source for parent/staff/admin workspaces
assets/js/portal-app.js      generated portal bundle
server/                      same-origin trusted account/registration services
api/                         fail-closed Vercel Function entry points
supabase/migrations/         versioned secure schema, all ten ordered migrations
supabase/tests/              rollback-only staging RLS/session matrix
supabase/manual/             read-only inventory and separately prohibited retirement SQL
tools/                       content builders, audits and automated tests
docs/                        operations, preservation, security and handover documents
```

The former browser-local portal is not authoritative. `assets/js/store.js` is a scrubbed public brochure compatibility layer and contains no accounts, pupils, results, payments, live prices or submissions.

## Parent accounts and classes

Ordinary parents self-register through one of three routes:

- an existing-pupil `TA-LINK` credential;
- a phone-bound second-parent `TA-FAMILY` invitation; or
- a restricted new-admission applicant account.

A name and class never grant access. A pupil has at most two active guardians with separate accounts. There is no pupil login.

Active progression is:

> Creche → Pre-Nursery → Nursery 1 → Nursery 2 → Primary 1 → Primary 2 → Primary 3 → Primary 4 → Primary 6 → Graduate Hall

There is no Primary 5. Promotion, retention, transfer and graduation preserve the pupil identity and append permanent enrolment history.

## Fees, shop, transport and payment

Parent portal sections are Term Bills, School Materials, Transport, Orders & Collection, Receipts and Requests.

- Term bills and transport are non-stock services with no cart quantity.
- Included examinations/materials cannot also become separate invoice lines.
- Physical materials have variants/sizes, reservations and immutable stock movements.
- Handover is parent/guardian office collection or teacher distribution to the linked pupil after release.
- Unavailable-item requests feed procurement but are not orders, charges, reservations or guarantees.
- Returns/exchanges require a fulfilled order, inspection and audited stock/monetary treatment.

Approved payment methods are manual bank transfer or an in-person transaction on the school’s physical office POS. Both are manually verified. There is no payment gateway, online card form, card-data storage or WhatsApp payment-evidence workflow. An official receipt exists only after office verification; only the Headmistress may reverse a verified payment.

## Database migrations

Apply only in order and only after owner-controlled preservation and isolated staging review:

1. `202610230001_secure_school_portal.sql`
2. `202610230002_portal_accounts.sql`
3. `202610230003_staff_operations_and_requests.sql`
4. `202610230004_parent_pupil_linking.sql`
5. `202610230005_self_registration_enrolment_and_graduates.sql`
6. `202610230006_fees_shop_transport_and_manual_payments.sql`
7. `202610240001_admission_tracking_developer_operations_and_answers.sql`
8. `202610240002_staff_continuity_accelerated_progression_and_account_claims.sql`
9. `202610250001_owner_authorised_developer_bootstrap.sql`
10. `202610250002_developer_bootstrap_http_controls.sql`

`supabase-schema.sql` mirrors all ten ordered migrations through `202610250002`. The ninth migration adds the dormant owner-authorised developer-bootstrap data boundary. The tenth adds rotating HMAC-only HTTP rate buckets and revokes former sessions after owner-authorised recovery. Neither migration issues a real authorisation, creates an Auth user, sets a password or activates a gate. No migration retires `public.school_data`. The retirement file is intentionally outside the migration directory and remains prohibited before verified cutover and separate owner approval.

## Fail-closed feature gates

Copy `.env.example` only as a names/reference file; never commit real secrets. New features remain unavailable unless explicitly enabled:

- `PORTAL_ENABLED`
- `PORTAL_ACCOUNTS_ENABLED`
- `PARENT_LINKING_ENABLED`
- `PORTAL_REGISTRATION_ENABLED`
- `PORTAL_ACCOUNT_CLAIM_ENABLED`
- `PORTAL_OFFICE_ENABLED`
- `WEBSITE_REQUESTS_ENABLED`
- `PUBLIC_INFORMATION_ENABLED`
- `PUBLIC_GRADUATE_WALL_ENABLED`
- `ADMISSION_TRACKING_ENABLED`
- `DEVELOPER_CONSOLE_ENABLED`
- `DEVELOPER_MANUAL_BOOTSTRAP_ENABLED` (temporary; false by default)

`PORTAL_REGISTRATION_PEPPER` is server-only and must be a new private random value of at least 24 characters. Account claiming additionally requires independent `PORTAL_CLAIM_HASH_PEPPER` and `PORTAL_CLAIM_OTP_ENCRYPTION_KEY` secrets of at least 32 characters. Temporary developer bootstrap requires its own server-only `DEVELOPER_BOOTSTRAP_RATE_LIMIT_PEPPER` of at least 32 characters. The Paragon relay stays disabled unless its separate HMAC/replay/tenant acceptance checks pass.

## Build and tests

```bash
npm run build:content
npm run build:schema
npm run test:all-current
npm run test:sql-local   # requires local PostgreSQL 17 access
```

The maintained browser runner starts its own local server. SQL parser checks in the Node suite are not a substitute for applying all ten migrations and all five rollback-only policy suites in a disposable local or isolated Supabase staging database. `supabase/release/20261024_SQL_AGENT_HANDOFF.md` is preserved historical evidence for the earlier seven-migration package and must not be reused for migration 009; prepare a fresh checksum manifest before any separately authorised production application.

## Deployment safety

Do not commit, push, deploy, apply production SQL, import private CSVs or activate a gate without explicit owner approval for that separate action. Do not paste passwords, API keys, recovery codes, private exports, pupil records or bank credentials into source, chat, screenshots or issue trackers.
