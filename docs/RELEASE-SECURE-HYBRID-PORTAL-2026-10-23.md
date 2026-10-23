# Secure hybrid portal release record

**Release state:** complete local implementation; not deployed; live Supabase migration not applied  
**Date:** 23 October 2026  
**Branch:** `improve/brand-journey-accessibility-20261022`

## Delivered

### Phase 1 — research, journeys and IA

- `PHASE-1-UX-AUDIT-2026-10-23.md`
- `PHASE-1-EMPATHY-MAPS-2026-10-23.md`
- `PHASE-1-JOURNEYS-FUNNEL-IA-2026-10-23.md`

These artifacts cover parent, teacher, administrator, pupil and visitor needs; current/future gaps; admissions/payment abandonment and recovery; safeguarding; fee transparency; result accuracy; and the 1–2-click Fees/Portal/Admissions/Contact architecture.

### Public experience

- Public pages remain static and fast; Supabase is not loaded outside the portal.
- The primary header, drawer and compact portal action now use one consistent **Portal** route.
- Homepage/contact search guidance now describes secure school-issued parent access rather than the retired browser-only implementation.
- Existing brand/media files remain preserved. No uncertain logo, photo, testimonial or social profile was promoted as authentic.
- Apply and Schedule a Visit routes remain intact.

### Secure portal

- Premium responsive parent/teacher/admin shell at `portal/login.html`.
- Day/dark tokens, skip link, native keyboard controls, explicit labels, inline status/errors, 48px controls, reduced-motion behavior and mobile table regions.
- Parent: linked children, published results and linked payment records only.
- Teacher: active assigned classes/subjects, draft-by-default result entry, CA 40/exam 60 constraints.
- Admin: pupil records, separate admission decisions, teacher assignments, pending bank-transfer records, bank verification and audit views.
- No pupil login and no public sign-up.
- Missing environment configuration produces a fail-closed setup state.
- Portal sessions use browser-session storage, not indefinite application local storage.

### Supabase

- Replaced unsafe root `supabase-schema.sql` with the secure versioned baseline.
- Added tables for profiles, students, assignments, grades, payments, webhook events and payment/admission audits.
- Added explicit grants and RLS for parent links, teacher class/subject scope and admin overrides.
- New auth users always begin as parents; role/account-status changes are trigger-guarded.
- The legacy `school_data` table is preserved as evidence if present, but every policy and anon/authenticated grant is removed and RLS is forced.
- Added a disposable staging RLS integration script using fictional data.

### Monnify scaffold

- No checkout endpoint, SDK or public checkout button.
- Webhook stays off unless both `MONNIFY_WEBHOOK_ENABLED=true` and `MONNIFY_OWNER_VERIFIED=true`.
- Exact raw-body HMAC-SHA512 with constant-time comparison.
- Official source-IP allowlist, event/status/reference/currency/amount checks and 1 MiB request limit.
- Authoritative server-to-server Monnify re-query before the database RPC.
- Idempotent event key, locked matching payment, atomic update and payment audit.
- New opaque Supabase secret keys use `apikey` only; legacy service-role JWT fallback uses Bearer.
- No payload/customer/bank-source logging.
- The RPC contains no pupil/admission update. Payment never approves admission.

### Operations

- Complete staging, RLS, account creation, environment, activation, incident and rollback guidance in `SUPABASE-PORTAL-AND-MONNIFY-RUNBOOK-2026-10-23.md`.
- Old `SUPABASE-SETUP.md` now explicitly retires the public-write instructions.
- Portal source and migrations are excluded from the public static deployment where appropriate; the server library remains available for Vercel function bundling.

## Verified locally

| Suite | Result |
|---|---:|
| Static production audit | pass |
| Production safety assertions | 16/16 |
| Visitor UX assertions | 45/45 |
| Portal/webhook/security assertions | 32/32 |
| Portal browser states/viewports | 4/4 |
| Browser visitor QA | 1,424/1,424 |
| Automated accessibility, light | 58/58 pages; 0 serious/critical findings |
| Automated accessibility, dark | 5/5 representative pages; 0 serious/critical findings |
| Header/browser scenarios | 7/7 |

`npm audit` reported zero known dependency vulnerabilities after the portal dependency installation.

## Intentionally not claimed

- No production or staging Supabase project was accessed.
- The migration and SQL RLS integration script were not executed against a live database in this workspace because no owner-approved database connection was provided.
- No real parent, staff, pupil, grade or payment data was inserted.
- Portal and Monnify environment switches were not activated.
- Monnify merchant ownership, production credentials and settlement configuration were not verified.
- Vercel production was not deployed. The prior legacy-host 308 acceptance criterion therefore remains pending.
- Vercel Web Analytics remains unavailable/unverified.

## Owner decisions required before any activation

1. Approve a staging Supabase project and named operational owner.
2. Run the migration and fictional RLS test matrix; retain only redacted pass/fail evidence.
3. Confirm user onboarding, password recovery, account deactivation, result correction and privacy incident processes.
4. Approve portal production activation separately from code deployment.
5. Keep Monnify off. A future Monnify decision requires a separate merchant/security/reversal/reconciliation review and new explicit production approval.

## Recommended next round

1. Execute the SQL migration and RLS integration tests in disposable staging.
2. Add assignment deactivation and grade-change audit after owner workflow review.
3. Test VoiceOver/TalkBack and 200% zoom on real devices with fictional records.
4. Complete secure deployment and verify the canonical/legacy-host 308 redirects without changing domain email/DNS records.
