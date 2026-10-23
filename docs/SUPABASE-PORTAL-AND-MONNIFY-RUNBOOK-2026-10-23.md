# Secure portal and disabled Monnify runbook

**Date:** 23 October 2026  
**Audience:** authorised Treasure Academy owner/administrator and deployment engineer  
**Rule:** use fictional data in staging. Do not paste secrets into chat, commits, browser code, screenshots or public documents.

## 1. What is implemented

- Secure baseline migration: `supabase/migrations/202610230001_secure_school_portal.sql`
- Account/verified-caregiver migration: `supabase/migrations/202610230002_portal_accounts.sql`
- Safe root SQL entry point containing both migrations in order: `supabase-schema.sql`
- Portal entry: `portal/login.html` (with `portal/index.html` equivalent)
- Browser-safe runtime config: `api/portal-config.mjs`
- Server-only account service: `server/accounts.mjs` plus same-origin `/api/admin/*` and `/api/account/change-password` Functions
- Disabled webhook: `api/monnify-webhook.mjs`
- Webhook validation library: `server/monnify.mjs`
- Portal source/bundle: `assets/js/portal-source.js` → `assets/js/portal-app.js`
- Policy/account/webhook regression test: `tools/tests/portal-security.test.mjs`

The portal supports Nigerian phone + password for admin, teacher and parent roles. There is no public registration and no pupil account. Bank transfer is active. No Monnify checkout route or button exists. The local account implementation remains undeployed and disabled until inventory, backup and staging acceptance are complete.

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
3. Review and apply `supabase/migrations/202610230001_secure_school_portal.sql`.
4. Review and apply `supabase/migrations/202610230002_portal_accounts.sql` second.
5. Confirm the baseline tables plus these account tables exist:
   - `student_guardians`
   - `account_audit_log`
   - `legacy_account_mappings`
6. Confirm RLS is enabled on every portal, account and audit table.
7. Confirm `students.parent_id` remains only a deprecated migration reference and parent access now requires an active, office-verified `student_guardians` row.
8. Confirm every legacy object reported by the inventory is still present and unchanged. Neither migration may revoke, drop, truncate or rewrite `school_data`, `pupils`, `results`, `attendance`, `fee_payments` or other former portal objects.
9. Confirm account provisioning/reset/status/caregiver RPCs and `process_monnify_payment_event` can be executed only by `service_role`.
10. Run `supabase/tests/rls_portal_policy.test.sql` only in disposable staging and retain redacted aggregate results.

Do not apply old `db/*.sql` or an earlier copy of `supabase-schema.sql` over these migrations. Do not run the manual retirement SQL until verified cut-over.

## 5. Bootstrap the first portal admin safely

New Auth users deliberately receive a restricted pending parent-shaped profile. Browser metadata can never assign an administrator role.

1. In **staging** Supabase Dashboard → Authentication → Users, create the owner-verified Nigerian phone account with a unique strong temporary password and confirm the phone through the trusted dashboard workflow. Do not use email as the portal identifier and do not paste the password or an access token into chat.
2. Copy only the resulting user UUID.
3. In SQL Editor, promote that exact verified UUID while keeping first-password activation required:

```sql
update public.profiles
set role = 'admin',
    full_name = 'OWNER-VERIFIED NAME',
    phone = '+234XXXXXXXXXX',
    phone_e164 = '+234XXXXXXXXXX',
    active = true,
    account_status = 'pending_activation',
    must_change_password = true,
    phone_verified_by = 'OWNER-VERIFIED-USER-UUID',
    phone_verified_at = now(),
    created_by = 'OWNER-VERIFIED-USER-UUID'
where id = 'OWNER-VERIFIED-USER-UUID';
```

4. In Preview only, enable the portal/account gates after migrations and tests, sign in with phone + temporary password and complete the forced 12-character password change. No school-record query should occur before that succeeds.
5. Verify the account becomes `active`, `must_change_password=false`, an account audit row exists and the Admin role badge appears.
6. Creating, promoting, resetting, suspending or archiving another administrator remains an owner-controlled dashboard recovery action. The ordinary admin UI intentionally cannot do it.
7. Enable MFA for Supabase dashboard administrators where supported. Portal-user TOTP expansion is a later separately tested step.

## 6. Create parent and teacher users

Use the **Accounts & Classes** administrator screen only after `PORTAL_ACCOUNTS_ENABLED=true` has been approved in staging.

### Parent

1. Verify the person, Nigerian phone and caregiver relationship through the office process.
2. Create the phone/password parent account through **Create a parent or teacher account**. The trusted server calls Supabase Auth Admin with `phone_confirm=true`; there is no public sign-up.
3. Record the generated temporary password once and provide it privately after verification. It is never stored in a school table or log.
4. Link only verified children through `student_guardians`; one parent may have several children and a child may have multiple verified caregivers.
5. The parent signs in, replaces the temporary password, then receives only RLS-authorised linked-child access.
6. Never search or link a household through a publicly callable phone-number lookup.

### Teacher

1. Verify the person against an active staff record.
2. Create the teacher account through the same protected admin screen; do not edit Auth/browser metadata to assign the role.
3. Provide the one-time temporary password privately and require first-sign-in password change.
4. Assign the teacher to a class and specific subject separately. Creating the account alone grants no pupil scope.
5. Use subject `*` only for a class teacher who genuinely needs every subject in that class.
6. Suspend access promptly when employment or authority ends; suspension revokes refresh sessions and RLS denies outstanding short-lived JWTs.

## 7. RLS acceptance test matrix

Run with fictional records in staging. Use distinct browser profiles so sessions cannot mix.

| Scenario | Expected |
|---|---|
| anonymous REST select on every portal/account table | denied/no rows; no table grant |
| public visitor attempts sign-up or account API | no sign-up; account API denied |
| pending temporary-password account queries records | denied; change-password screen only |
| suspended/archived account attempts sign-in or queries | Auth ban blocks new sign-in/refresh; session deletion + RLS deny existing JWTs |
| office reset | all refresh sessions removed; account returns to pending activation |
| Parent A reads own profile | allowed |
| Parent A reads Parent B profile | denied/no row |
| Parent A reads office-verified linked Child A | allowed |
| Parent A reads Child B | denied/no row |
| second verified caregiver reads shared Child A | allowed; unrelated children denied |
| removed caregiver reads Child A | denied immediately |
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
| `PORTAL_ENABLED` | `false` | fail-closed portal UI/config switch |
| `PORTAL_ACCOUNTS_ENABLED` | `false` | separate fail-closed server account-operation switch |
| `SUPABASE_URL` | staging/production project URL | returned to portal only when enabled |
| `SUPABASE_PUBLISHABLE_KEY` | browser-safe publishable key | preferred browser key |
| `SUPABASE_ANON_KEY` | optional fallback only | legacy browser-safe key |
| `SUPABASE_SECRET_KEY` | secret, server only | Auth Admin, account RPCs and disabled webhook RPC; never returned to portal |
| `SUPABASE_SERVICE_ROLE_KEY` | optional legacy fallback | use only if secret-key model is unavailable |

The config function never reads or returns a secret/service key.

### Staging activation

1. Keep `PORTAL_ENABLED=false` and `PORTAL_ACCOUNTS_ENABLED=false`; deploy and confirm the truthful inactive state and 404 account endpoints.
2. Set staging Supabase URL, publishable key and server-only secret key.
3. Apply both migrations and run fictional database/account tests.
4. Change `PORTAL_ENABLED=true` and `PORTAL_ACCOUNTS_ENABLED=true` in Preview only.
5. Execute phone sign-in, forced password change, local sign-out, admin creation, office reset/session revocation, suspend/reactivate, multi-caregiver RLS, keyboard, screen-reader, mobile, dark-mode and correction-flow tests.
6. Review support responsibility, former-account reconciliation and real-data readiness with the owner.
7. Only then repeat with the production Supabase project and explicit owner approval.

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

1. Set `PORTAL_ENABLED=false` and `PORTAL_ACCOUNTS_ENABLED=false` to fail closed immediately without removing evidence.
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
