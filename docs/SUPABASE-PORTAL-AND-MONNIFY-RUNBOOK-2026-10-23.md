# Secure portal and disabled Monnify runbook

**Date:** 23 October 2026  
**Audience:** authorised Treasure Academy owner/administrator and deployment engineer  
**Rule:** use fictional data in staging. Do not paste secrets into chat, commits, browser code, screenshots or public documents.

## 1. What is implemented

- Versioned secure database migration: `supabase/migrations/202610230001_secure_school_portal.sql`
- Safe root SQL entry point: `supabase-schema.sql`
- Portal entry: `portal/login.html` (with `portal/index.html` equivalent)
- Browser-safe runtime config: `api/portal-config.mjs`
- Disabled webhook: `api/monnify-webhook.mjs`
- Webhook validation library: `server/monnify.mjs`
- Portal source/bundle: `assets/js/portal-source.js` → `assets/js/portal-app.js`
- Policy/webhook regression test: `tools/tests/portal-security.test.mjs`

The portal supports admin, teacher and parent roles. There is no pupil account. Bank transfer is active. No Monnify checkout route or button exists.

## 2. Preserve the former Supabase portal first

The owner confirmed that the former portal used Supabase. Do not assume it was empty, and do not treat its history as inauthentic.

1. Sign in directly to the existing owner-controlled Supabase dashboard.
2. Run only `supabase/manual/00_read_only_legacy_portal_inventory.sql`.
3. Create an owner-controlled backup/export before any schema or policy change.
4. Determine whether the project contains the Batch 19 `school_data` table, the later normalized portal tables, or both.
5. Do **not** run `99_retire_legacy_school_data_after_verified_cutover.sql` yet.

The secure baseline intentionally leaves all former portal objects unchanged. Retirement is outside the automatic migrations and occurs only after record mapping, staging tests and a separate owner approval.

## 3. Prerequisites

- Owner-approved Supabase organisation/project and data-processing decision
- completed legacy inventory and owner-controlled backup/export
- Owner-approved production domain already mapped to Vercel
- Named person responsible for account creation, deactivation, record correction and incident handling
- Password/MFA policy for Supabase dashboard administrators
- Tested database backup/restore procedure
- Fictional staging accounts for one admin, two teachers, two parents and at least three pupils

Do not proceed with real pupil data merely because the SQL runs.

## 4. Apply the migration

1. Create or select the **staging** Supabase project.
2. Open SQL Editor as an authorised project administrator.
3. Review and apply `supabase/migrations/202610230001_secure_school_portal.sql` in one transaction.
4. Confirm these tables exist:
   - `profiles`
   - `students`
   - `teacher_class_assignments`
   - `grades`
   - `payments`
   - `webhook_events`
   - `payment_audit_log`
   - `admission_audit_log`
5. Confirm RLS is enabled on every listed new table.
6. Confirm every legacy object reported by the inventory is still present and unchanged. The baseline must not revoke, drop, truncate or rewrite `school_data`, `pupils`, `results`, `attendance`, `fee_payments` or other former portal objects.
7. Confirm `process_monnify_payment_event` can be executed only by `service_role`.

Do not apply old `db/*.sql` or an earlier copy of `supabase-schema.sql` over this migration. Do not run the manual retirement SQL until verified cut-over.

## 5. Create the first admin safely

New auth users deliberately default to `parent`, even if user metadata asks for another role. This prevents self-escalation.

1. In Supabase Dashboard → Authentication → Users, create the owner/admin email with a strong temporary password or invite flow.
2. Copy the resulting user UUID from the dashboard; do not copy access tokens.
3. In SQL Editor, promote that exact verified UUID:

```sql
update public.profiles
set role = 'admin', full_name = 'OWNER-VERIFIED NAME'
where id = 'OWNER-VERIFIED-USER-UUID';
```

4. Sign in on staging, change/recover the password through the approved flow and verify the role badge is Admin.
5. Enable MFA for dashboard administrators where supported. Portal-user MFA expansion should be planned separately rather than claimed without testing.

## 6. Create parent and teacher users

### Parent

1. Create/invite the verified parent in Supabase Auth.
2. Leave the automatically created role as `parent`.
3. Confirm the displayed full name with the parent.
4. Create a pupil through the admin portal and select that parent.
5. Never search/link a household by publicly callable phone-number enumeration.

### Teacher

1. Create/invite the verified staff member in Supabase Auth.
2. Promote the exact UUID to teacher:

```sql
update public.profiles
set role = 'teacher', full_name = 'OWNER-VERIFIED STAFF NAME'
where id = 'VERIFIED-TEACHER-UUID';
```

3. In the admin portal, assign the teacher to a class and a specific subject.
4. Use subject `*` only for a class teacher who genuinely needs every subject in that class.
5. Deactivate a profile promptly when access is no longer authorised. Assignment deactivation UI is a recommended next enhancement; until then, update it through a reviewed admin SQL operation.

## 7. RLS acceptance test matrix

Run with fictional records in staging. Use distinct browser profiles so sessions cannot mix.

| Scenario | Expected |
|---|---|
| anonymous REST select on every portal table | denied/no rows; no table grant |
| Parent A reads own profile | allowed |
| Parent A reads Parent B profile | denied/no row |
| Parent A reads linked Child A | allowed |
| Parent A reads Child B | denied/no row |
| Parent A reads published grade for Child A | allowed |
| Parent A reads draft grade for Child A | denied/no row |
| Parent A reads Child B payment | denied/no row |
| Parent A inserts/updates/deletes a student, grade or payment | denied |
| Teacher A reads a pupil in assigned class | allowed |
| Teacher A reads pupil in unassigned class | denied/no row |
| Teacher A writes assigned subject grade | allowed |
| Teacher A writes unassigned subject/class grade | denied |
| Teacher A reads payments | denied/no row |
| Admin reads and manages operational tables | allowed |
| Parent or teacher changes own role to admin | trigger denies |
| service webhook RPC with unknown payment reference | rejected + receipt, no payment change |
| same webhook event key twice | second outcome duplicate |
| webhook amount mismatch | rejected, no payment change |
| processed Monnify payment | matching payment paid + payment audit only |
| any payment processing | admission status unchanged |

Keep screenshots/logs free of names, email addresses, child records, references and amounts.

## 8. Portal environment configuration

Set server-side Vercel environment variables through the protected project settings, separately for Preview and Production:

| Variable | Initial value | Purpose |
|---|---|---|
| `PORTAL_ENABLED` | `false` | fail-closed public switch |
| `SUPABASE_URL` | staging/production project URL | returned to portal only when enabled |
| `SUPABASE_PUBLISHABLE_KEY` | browser-safe publishable key | preferred browser key |
| `SUPABASE_ANON_KEY` | optional fallback only | legacy browser-safe key |
| `SUPABASE_SECRET_KEY` | secret, server only | webhook RPC; never returned to portal |
| `SUPABASE_SERVICE_ROLE_KEY` | optional legacy fallback | use only if secret-key model is unavailable |

The config function never reads or returns a secret/service key.

### Staging activation

1. Keep `PORTAL_ENABLED=false`; deploy and confirm the truthful inactive state.
2. Set staging Supabase URL/publishable key.
3. Change `PORTAL_ENABLED=true` in Preview only.
4. Execute the full RLS, keyboard, screen-reader, mobile, dark-mode and correction-flow test plan.
5. Review support responsibility and real-data readiness with the owner.
6. Only then repeat with the production Supabase project and explicit owner approval.

## 9. Monnify remains disabled

Initial production values:

| Variable | Required initial value |
|---|---|
| `MONNIFY_WEBHOOK_ENABLED` | `false` |
| `MONNIFY_OWNER_VERIFIED` | `false` |
| `MONNIFY_ENVIRONMENT` | unset until readiness review |
| `MONNIFY_API_KEY` | unset |
| `MONNIFY_SECRET_KEY` | unset |
| `MONNIFY_ENFORCE_IP_ALLOWLIST` | leave default (`true`) |
| `MONNIFY_WEBHOOK_IPS` | optional; default is official `35.242.133.146` |

Disabled webhook requests return 404. The code requires **both** enable and owner-verification switches before reading operational credentials. There is no checkout endpoint, SDK or public button.

### Future activation checklist — do not perform without a new owner decision

1. Owner verifies the Monnify merchant, contract and settlement bank configuration.
2. Security owner approves credential storage and incident/reversal handling.
3. Use sandbox credentials and `MONNIFY_ENVIRONMENT=sandbox` in Preview.
4. Create a fictional pending `payments` row with:
   - method `monnify`;
   - unique expected `monnify_payment_reference`;
   - expected amount and NGN currency.
5. Configure the Preview webhook URL in Monnify only after the function is deployed.
6. Set sandbox API/secret keys server-side.
7. Set `MONNIFY_OWNER_VERIFIED=true`, then `MONNIFY_WEBHOOK_ENABLED=true` in Preview.
8. Send an officially signed sandbox notification and verify:
   - source IP allowlist;
   - raw-body HMAC-SHA512 signature;
   - authoritative server-to-server re-query;
   - exact transaction/payment references, PAID status, NGN and amount;
   - atomic idempotent RPC;
   - payment audit entry;
   - no admission change.
9. Test altered signature, malformed JSON, wrong type/status/currency/amount/reference, duplicate, unknown payment and upstream timeout.
10. Confirm reversals and reconciliation process before any production acceptance. The current webhook intentionally processes successful transactions only.
11. Obtain a new explicit owner approval for production. Rotate from sandbox to production credentials; never reuse shared/test secrets.

Because no checkout exists, enabling only the webhook still does not create a public Monnify payment option.

## 10. Webhook processing sequence

1. POST only; JSON only; maximum 1 MiB.
2. Both environment gates must be true.
3. Source IP must match the official allowlist unless an authorised operator explicitly changes the enforcement variable.
4. Read exact raw request text once.
5. Compute HMAC-SHA512 with `MONNIFY_SECRET_KEY` and compare 64-byte values with `timingSafeEqual`.
6. Parse only after signature verification.
7. Accept only `SUCCESSFUL_TRANSACTION` with payload status `PAID`, valid references, positive amount and NGN.
8. Authenticate to Monnify server-to-server and query the transaction reference.
9. Require the authoritative response to match both references, exact amount, PAID and NGN.
10. Call one server-only Supabase RPC.
11. In one database transaction: reserve unique event key, lock matching payment, check method/amount, update payment and append payment audit.
12. Return only generic outcomes; never log payload, customer, source account, reference or secrets.

## 11. Build and local test

```bash
npm ci
npm run build:portal
npm run test:portal
npm test
# With a local static server already listening on port 4173:
npm run test:portal-browser
npm run test:a11y
```

The committed portal bundle lets the static site deploy without running a framework build. Rebuild it after every change to `portal-source.js` or Supabase client version.

Local static preview does not provide Vercel Functions. Without `/api/portal-config`, the portal intentionally shows an unavailable state. Use a Vercel Preview (or a compatible local function emulator with fictional data) for end-to-end auth tests.

## 12. Deployment and rollback

1. Confirm git diff contains no `.env`, key, token, real person, payment or pupil fixture.
2. Run all tests and save only aggregate pass/fail counts.
3. Deploy Preview first.
4. Verify public pages remain fast and unchanged by the portal dependency.
5. Verify canonical host redirects and the legacy Vercel alias 308 acceptance criterion.
6. Activate only the portal switch approved for that environment.
7. Production promotion requires owner approval through the existing release process.

Rollback:

1. Set `PORTAL_ENABLED=false` to fail closed immediately without removing evidence.
2. Set both Monnify switches false if ever activated.
3. Revoke affected Supabase user sessions/keys when incident scope requires it.
4. Restore the previous verified deployment.
5. Preserve audit evidence; do not delete tables or logs to hide an incident.
6. Rotate any potentially exposed key and document the date/owner/action without storing the key.

## 13. Incident priorities

- **Wrong-family data visible:** disable portal, revoke sessions, preserve evidence, assess affected rows/policies and follow the school’s privacy response process.
- **Credential/key exposure:** disable affected path, rotate key, inspect access logs and never reuse the exposed value.
- **Payment mismatch:** leave pending/rejected, do not approve admission, reconcile with bank/Monnify through authorised staff.
- **Result error:** keep correction within assigned teacher/admin permissions; communicate through verified private channels.
- **Unverified asset published:** remove it from public representation while preserving the file and review history.
