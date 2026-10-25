# Run 4 — Production Acceptance Requirements and Execution Guide

**Prepared:** 25 October 2026
**Authority:** `docs/TREASURE-ACADEMY-DYNAMIC-PLATFORM-MASTER-PLAN-2026-10-25.md`
**Depends on:** Run 2 commit `65f329e` and Run 3 commit `d6fbe88`
**Production project:** `biyizitalhylkwtshrqt`
**Execution status:** `BLOCKED` — requirements only; no Run 4 production mutation is authorised by this document

## 1. Run 4 outcome and scope

Run 4 has two strictly ordered parts:

1. **Owner-authorised developer acceptance**
   - apply only the reviewed additive migrations 009 and 010;
   - deploy the accepted code with the bootstrap gate off;
   - let the owner issue exactly one short-lived authorisation;
   - let Jibril privately choose his own password through one protected acceptance deployment;
   - prove one-use consumption, exact developer capabilities, normal phone/password sign-in and no false application OTP verification;
   - close the bootstrap route immediately and make the gate-enabled deployment inaccessible.
2. **Manual school-account claim acceptance**
   - only after Part 1 is closed, prove the encrypted one-time manual OTP queue with a real owner-approved claimant;
   - keep automated Paragon delivery and admission tracking off;
   - open school account claims only after the manual queue, role and audit evidence pass.

Run 4 does **not** authorise CMS work, admission-tracking OTP, automated Meta/Paragon delivery, a provider template test, payment changes, roster invention, `school_data` retirement or any migration after 010.

## 2. Current read-only state

The following was rechecked without a production mutation on 25 October 2026:

### Repository

- Local `main` is at `d6fbe88e13cd959ebe16e7b8a6334890da21e64e` and is four commits ahead of `origin/main`.
- The three mode-only tool drifts were reconciled by restoring their already-committed executable modes. No file content changed.
- Migration 009 SHA-256: `b78ec9556b033960f0bb6087ad07b32b7f8393f1183b142b62148e3e4067f571`.
- Migration 010 SHA-256: `64ceb97c3a0b41a4a09c08d40cbae7b82f719fdfab5c62d7906f46fa8755faaf`.
- Trusted bootstrap handler SHA-256: `8ec918e98614d6222784c2d8b7e7d64d2380ceb3bb17b968e0b05ee5a86f7e04`.

### Supabase

- Project, Auth, database, REST and Storage report healthy.
- 102 public relations exist and all 102 have RLS enabled.
- 136 public policies and 136 public functions exist.
- `auth.users`: 0.
- `storage.objects`: 0.
- `school_data`: 1 preserved row.
- `portal_account_claims`: 4 pending and 0 expired.
- `developer_bootstrap_authorisations` and `developer_bootstrap_http_limits` do not yet exist.
- Migrations 009 and 010 are not in the remote migration history.
- Public sign-up is disabled, but the Supabase Phone provider is also disabled. Phone auth must be enabled before normal phone/password acceptance while sign-up and SMS auto-confirm remain disabled.

### Current deployment

- The public portal config reports the already-approved portal, registration and office interfaces enabled; account claims remain disabled.
- The deployed Developer Console routes reach their authentication boundary.
- `/api/developer/bootstrap` currently returns Vercel's platform 404 because Run 3 code has not been deployed. This is **not** yet proof of the new handler's fail-closed gate.

## 3. Migration-ledger reconciliation prepared

Current official Supabase CLI guidance states that `supabase migration list` compares **timestamp versions only**, not migration names. Read-only inspection found 15 remote entries, including seven older remote-only versions and eight applied application migrations whose provider-generated versions differ from their canonical source filenames. Migrations 009 and 010 are the only genuinely new schema changes.

The source-side reconciliation is now prepared and tested without changing production:

- `supabase/release/20261025_RUN4_PRODUCTION_MIGRATION_LEDGER.json` records all 15 remote versions and reviewed source evidence;
- `tools/build-run4-migration-bridge.py` generates a dedicated production bridge;
- `supabase/release/run-04-cli-workspace/` contains 15 exact-version historical ledger markers plus byte-for-byte copies of migrations 009 and 010;
- every historical marker raises an exception if a wrong target attempts to execute it;
- pending filenames now use 14-digit UTC-compatible versions, with unchanged SQL and SHA-256 values;
- SQL, policy, application, security, accessibility and browser acceptance pass.

No production history repair, former migration replay, `--include-all`, seed, linked reset, bulk loader or SQL Editor bypass was used. Full evidence is in `RUN-04-MIGRATION-LEDGER-RECONCILIATION.md`.

The remaining live gate is to compare the bridge against production during the explicitly approved window. `supabase migration list --linked` must align through all 15 historical versions, and `supabase db push --linked --dry-run` must list exactly:

- `20261025000100_owner_authorised_developer_bootstrap.sql`;
- `20261025000200_developer_bootstrap_http_controls.sql`.

Anything else remains a hard stop. Preparing the bridge is not permission to migrate production.

## 4. Responsibility boundary

### 4.1 Owner-only private actions

The owner must perform or explicitly confirm these actions in the provider dashboards:

1. Confirm a current restorable Supabase backup and record only its timestamp/identifier. The backup content remains private. If the plan lacks a downloadable managed backup, establish an owner-controlled encrypted logical backup outside chat and outside the repository.
2. In Supabase Auth settings, enable **Phone** for phone/password sign-in while preserving:
   - `disable_signup=true`;
   - `sms_autoconfirm=false`;
   - no native SMS/OTP use for this bootstrap.
3. In Vercel, enter or verify the required values privately. Secret values must be saved as write-only **Secret** variables.
4. Enable Vercel Authentication/Standard Deployment Protection for the acceptance preview and grant only the intended people access. A public preview is not acceptable.
5. When the protected gate-enabled deployment is ready and Jibril is present, run the one owner-only authorisation statement in the official Supabase SQL Editor exactly once.
6. Pass the one-time authorisation directly to Jibril through a private real-time channel or let him enter it while the owner is present. It must not be sent through this chat.
7. Confirm that the Proprietress is available at the registered phone ending `3478` for the real manual account-claim acceptance.

The owner must not paste a database password, Vercel token, Supabase secret key, rate-limit pepper, encryption key, bootstrap authorisation, OTP or account password into chat.

### 4.2 Jibril-only private actions

Jibril must:

1. use the already-approved login identifier ending `6650`;
2. enter the one-time owner authorisation only in the protected bootstrap form;
3. create and confirm his own password privately;
4. use 12–128 characters containing uppercase, lowercase, a number and a symbol, avoiding a predictable school/name-based value;
5. sign in normally with phone + password after the bootstrap closes;
6. operate the account-claim manual queue for the acceptance claimant;
7. reveal a queued claim message once, send the exact message to the exact registered claimant through the selected WhatsApp/SMS channel, mark it sent and clear any clipboard copy.

No OTP or test message may be addressed to the number ending `6650`. It is the sender/login identity, not a bootstrap recipient.

### 4.3 Agent actions after explicit production-window approval

The agent can:

- prepare and test the migration-ledger source reconciliation;
- rerun full local SQL, application, security, accessibility and browser acceptance;
- compare hashes, commit identity and a clean release worktree;
- run read-only Supabase baseline/postflight queries;
- run `migration list` and `db push --dry-run` against the explicitly linked production project;
- apply only migrations 009 and 010 after all stop conditions clear;
- verify RLS, grants, functions, empty tables and preservation counts;
- deploy the accepted commit with gates off;
- run HTTP/API, database and deployment probes without printing secrets;
- verify one-use state, exact capability rows and code-free audit evidence;
- close and delete the temporary acceptance deployment;
- document evidence and update the tracker.

The agent cannot mint owner authority through the deployed service role and must not ask for, receive or record the private values listed above.

## 5. Required private configuration

Use the current `sb_publishable_...` and server-only `sb_secret_...` Supabase key types. Do not place a legacy `service_role` key into new configuration, and never expose the secret key to browser code.

| Variable | Type | Requirement |
|---|---|---|
| `SUPABASE_URL` | Config | Exact production project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Config/browser-safe | Production `sb_publishable_...` key |
| `SUPABASE_SECRET_KEY` | Secret/server-only | Production `sb_secret_...` key |
| `DEVELOPER_BOOTSTRAP_RATE_LIMIT_PEPPER` | Secret/server-only | New independent random value, at least 32 characters |
| `ADMISSION_OTP_HASH_PEPPER` | Secret/server-only | Independent value, at least 32 characters; required by Developer Console configuration even while admission tracking is off |
| `ADMISSION_OTP_ENCRYPTION_KEY` | Secret/server-only | Independent value, at least 32 characters |
| `PORTAL_CLAIM_HASH_PEPPER` | Secret/server-only | Independent value, at least 32 characters |
| `PORTAL_CLAIM_OTP_ENCRYPTION_KEY` | Secret/server-only | Independent value, at least 32 characters |

All five pepper/encryption values must be different from one another, passwords, provider keys and relay keys. Do not rotate a claim encryption/hash key while a claim challenge is active; rotation invalidates queued payloads/codes.

Preserve unrelated approved environment values. Run 4 changes only the gates named below.

### Production gate target before acceptance

```text
PORTAL_ENABLED=true
DEVELOPER_CONSOLE_ENABLED=true
DEVELOPER_MANUAL_BOOTSTRAP_ENABLED=false
PORTAL_ACCOUNT_CLAIM_ENABLED=false
ADMISSION_TRACKING_ENABLED=false
PARAGON_OTP_RELAY_ENABLED=false
```

`PORTAL_REGISTRATION_ENABLED`, `PORTAL_OFFICE_ENABLED`, `PORTAL_ACCOUNTS_ENABLED` and other approved production gates are not silently changed by Run 4.

### Protected bootstrap preview

Use a dedicated preview branch or custom environment with branch-scoped variables and Vercel Authentication. It must match the accepted production configuration except:

```text
DEVELOPER_MANUAL_BOOTSTRAP_ENABLED=true
PORTAL_ACCOUNT_CLAIM_ENABLED=false
```

The production environment remains `DEVELOPER_MANUAL_BOOTSTRAP_ENABLED=false` throughout.

### Protected account-claim preview

Only after bootstrap closure, create a fresh protected deployment with:

```text
DEVELOPER_MANUAL_BOOTSTRAP_ENABLED=false
PORTAL_ACCOUNT_CLAIM_ENABLED=true
ADMISSION_TRACKING_ENABLED=false
PARAGON_OTP_RELAY_ENABLED=false
```

Environment changes affect only new Vercel deployments. Changing a dashboard value does not disable an already-built gate-enabled deployment.

## 6. Pre-window acceptance gates

Every item must pass before scheduling the live window:

1. Migration-ledger reconciliation in Section 3 is complete and committed separately.
2. Worktree is clean and the intended commit is recorded.
3. Migration and handler hashes match Section 2.
4. Full local acceptance passes from a disposable database.
5. Production project is healthy.
6. Fresh preservation counts match the approved baseline or every difference has a separately approved explanation.
7. Four owner-approved claims remain present, pending and unexpired; `auth.users` remains zero.
8. A current backup is confirmed.
9. Required Vercel variable **names**, scopes and types are verified without reading or printing Secret values.
10. Supabase Phone auth is enabled, while public sign-up and SMS auto-confirm remain disabled.
11. Vercel preview protection is proven before any preview receives production Supabase credentials.
12. Owner, Jibril and the agent have an agreed uninterrupted window. The owner and Jibril must be available at the same time because the authorisation expires in 5–30 minutes.
13. The enabled preview can be deleted immediately after acceptance.
14. The production bootstrap gate remains false.

## 7. Exact execution order

### Stage 0 — final no-change preflight

1. Record commit, hashes, test results, time and operator.
2. Confirm the Supabase project ref is exactly `biyizitalhylkwtshrqt`.
3. Run `supabase migration list --linked`.
4. Run `supabase db push --linked --dry-run` without seed or `--include-all`.
5. Stop unless the only pending migrations are 009 and 010 in that order.
6. Capture a fresh read-only preservation baseline.
7. Confirm backup readiness and all gates/secrets by name and scope only.

### Stage 1 — apply only migrations 009 and 010

1. Apply the exact reviewed files through the approved migration control.
2. Do not paste their SQL into the production SQL Editor.
3. Immediately list the remote migration history and prove exactly two new records.
4. Verify the three new tables exist:
   - `developer_bootstrap_authorisations`;
   - `developer_bootstrap_events`;
   - `developer_bootstrap_http_limits`.
5. Verify every new table:
   - has zero rows;
   - has RLS enabled;
   - has no direct `anon`, `authenticated` or `service_role` table access;
   - is usable only through the reviewed RPC boundary.
6. Verify owner issue/revoke functions are unavailable to deployed roles and the narrowly scoped server functions are service-only.
7. Rerun the read-only postflight and prove all former non-zero counts are unchanged. The public-relation count should increase only by the three additive tables.

Do not issue an owner authorisation during migration verification.

### Stage 2 — deploy accepted code with bootstrap off

1. Push/deploy only the reviewed commit after migrations pass.
2. Build with the production bootstrap gate false.
3. Verify `GET /api/portal-config` reports `developerBootstrapEnabled:false`.
4. Probe `/api/developer/bootstrap` and require:
   - HTTP `404`;
   - JSON `{"error":"Not found"}` from the application boundary, not Vercel's missing-route page;
   - no change in authorisation, event or rate-limit table counts.
5. Verify existing public pages and protected Developer Console routing still work.

### Stage 3 — prepare the private bootstrap deployment

1. Create the dedicated protected acceptance branch/deployment from the exact accepted commit.
2. Confirm Vercel Authentication blocks an unauthorised browser.
3. Confirm only this protected preview has `DEVELOPER_MANUAL_BOOTSTRAP_ENABLED=true`.
4. Confirm production still returns the application-controlled 404.
5. Confirm the preview bootstrap UI opens only to an authorised viewer.
6. Confirm the owner and Jibril are ready before issuing anything.

### Stage 4 — owner issues exactly one authorisation

Only now, the owner runs the following pattern once in the official Supabase SQL Editor. Do not run it through deployed code or service credentials:

```sql
select *
from public.owner_issue_developer_bootstrap(
  (
    select id
    from public.portal_account_claims
    where phone_e164 = '+2348154936650'
      and full_name = 'Jibril Abdullahi Onoruoiza'
      and intended_role = 'parent'
      and leadership_scope = 'none'
      and class_code is null
      and subject = '*'
      and developer_console
      and developer_otp
      and developer_information
      and developer_health
      and status = 'pending'
      and claimed_user_id is null
      and expires_at > now()
  ),
  'initial_password',
  10
);
```

The result returns an `authorisation_id`, a one-time authorisation and expiry. The owner must not save the raw value in notes, screenshots, source, chat or evidence. Exactly one live `initial_password` authorisation may exist.

If the window is aborted before use, the owner revokes the displayed authorisation ID in the SQL Editor or lets it expire:

```sql
select public.owner_revoke_developer_bootstrap('<authorisation-id>'::uuid);
```

Do not place the real ID in chat.

### Stage 5 — Jibril completes the bootstrap privately

1. Jibril enters the approved phone, one-time authorisation and his privately chosen password twice in the protected preview.
2. No OTP is generated or sent.
3. Require a single successful completion. Do not retry blindly after an unexpected error.
4. The server must create the Auth user through Auth Admin, consume the exact claim/authorisation and grant only the approved independent capabilities.
5. If Auth creation succeeds but database completion fails, the handler must delete the newly created Auth user. Stop and prove no orphan before considering a new owner authorisation.

### Stage 6 — prove developer acceptance

Without exposing private values, verify:

- `auth.users` increased from 0 to 1;
- the developer claim changed from pending to claimed once;
- exactly one initial authorisation is consumed and its hash is null;
- code-free events show issued, reserved and `owner_authorised_supabase_bootstrap` completion;
- the profile is active, uses base role `parent`, has leadership scope `none`, no class assignment and no guardian/pupil relationship;
- `phone_verified_at` in the application profile remains null because no OTP was used;
- Supabase Auth may have owner-attested phone confirmation so phone/password login works; this must not be misreported as application OTP verification;
- capabilities are exactly console access, OTP dispatch, public-information review and system-health read;
- no school leadership, payment approval, pupil administration, admission decision or publishing authority exists;
- normal sign-in succeeds with phone + password in `developer.html`;
- browser-session-only persistence remains in effect;
- a consumed authorisation cannot be replayed.

### Stage 7 — close bootstrap immediately

1. Remove the branch-specific true value or set it false.
2. Create a new gate-off deployment.
3. Delete the formerly enabled deployment. If deletion is temporarily unavailable, keep it protected and treat Run 4 as blocked until it is deleted or otherwise made inaccessible.
4. Verify the former URL is unavailable/protected.
5. Verify production and the replacement preview return application-controlled 404 with no database mutation.
6. Verify normal Developer Console login still works.
7. Do not use Vercel Instant Rollback as closure; rollback restores an old build with its old environment.

### Stage 8 — prove the manual account-claim queue

Only after Stage 7 passes:

1. Deploy a **new** protected preview with account claims true, bootstrap false, admission tracking false and Paragon relay false.
2. Use the existing real owner-approved Proprietress claim at the registered phone ending `3478`. Do not create a dummy person or use the public line ending `2487` as a school-account claimant.
3. The Proprietress requests one account-claim code through her selected WhatsApp or SMS channel.
4. Require a generic public response and exactly one active encrypted challenge.
5. Jibril signs in normally and sees only purpose/channel/time/last four digits before reveal.
6. Jibril reveals the delivery payload once. The server destroys its encrypted copy, and the browser clears the reveal after 30 seconds.
7. Jibril sends the exact message to the exact registered phone and marks it sent. No OTP is sent to `6650`.
8. The Proprietress enters the six-digit code within five minutes.
9. After verification, she privately creates and confirms her own password within ten minutes. Nobody asks for or records it.
10. Prove the challenge cannot be reused, the claim is consumed once and the account receives the approved Proprietress/full-write authority:
    - role `admin`;
    - leadership scope `headmistress`;
    - position title `Proprietress`;
    - no fabricated class assignment;
    - ordinary future login is phone + password.
11. Prove audit rows contain no OTP, full phone, message, password or secret.
12. Delete the temporary claim-enabled preview after evidence is captured.

A lost reveal is not revealed twice. Requesting a replacement challenge must cancel the former active challenge rather than create duplicate active codes.

### Stage 9 — open school account claims after acceptance

If and only if Stage 8 passes and the owner approved opening claims:

1. Set production `PORTAL_ACCOUNT_CLAIM_ENABLED=true`.
2. Keep `DEVELOPER_MANUAL_BOOTSTRAP_ENABLED=false`.
3. Keep `ADMISSION_TRACKING_ENABLED=false`.
4. Keep `PARAGON_OTP_RELAY_ENABLED=false`.
5. Create a new production deployment; an environment edit alone is insufficient.
6. Verify claims are available and the bootstrap endpoint remains 404.
7. The Headmistress and Assistant Headmistress may then claim through their existing registered phones and privately chosen passwords. Do not invent roster data.

Admission-tracking OTP remains a separate later acceptance and must not be opened during Run 4.

## 8. Hard stop conditions

Stop immediately if any of the following occurs:

- no explicit owner approval for the named production window;
- no current restorable backup;
- repository content/hash/commit differs from the reviewed release;
- local tests fail or the worktree contains unexplained changes;
- migration history is not aligned;
- a dry run proposes anything other than migrations 009 and 010;
- any command proposes seed, `--include-all`, migration repair, linked reset or an earlier migration;
- Supabase health or preservation counts unexpectedly change;
- the four approved claims are missing, altered, expired or unexpectedly claimed;
- an unexpected Auth user exists before bootstrap;
- the production bootstrap gate is true;
- the acceptance preview is public or cannot be deleted/protected immediately;
- a required Secret is absent, reused, too short, exposed or only available as a legacy service-role key;
- Phone auth cannot be enabled while keeping sign-up and SMS auto-confirm disabled;
- the owner or Jibril is not privately available during the short window;
- more than one live authorisation appears;
- the token, OTP, password or provider secret is placed in chat, logs, screenshots, source or evidence;
- an OTP/test is addressed to `6650`;
- Paragon relay or admission tracking becomes enabled;
- normal phone/password login, replay rejection, capability checks or no-false-OTP evidence fails;
- the formerly enabled Vercel deployment remains accessible;
- account claims are opened before the manual queue passes.

## 9. Rollback and abort boundaries

### Before migrations

Abort without production change.

### After migrations but before any new row

Keep all gates false. Because the changes are additive and dormant, an application rollback is possible. Database rollback is allowed only through a separately reviewed rollback and only while every new table is empty; do not improvise a destructive SQL rollback during the window.

### After an authorisation/event/rate-limit row exists

Do not drop the new tables or erase evidence. Revoke/expire the live authorisation, disable all temporary gates, make the enabled deployment inaccessible and preserve audit state.

### After Auth user creation begins

If the handler reports failure, stop. Verify whether compensation deleted an incomplete user. Do not issue a second authorisation until the Auth user, claim, authorisation and profile states are reconciled.

### After successful developer bootstrap

Do not delete the accepted developer identity as a routine rollback. Close the bootstrap gate and preserve the consumed authorisation/audit. If access must be suspended, use the approved account status/capability controls under a separate owner decision.

### During account-claim acceptance

If delivery, reveal, verification, completion, role or audit evidence fails, keep production account claims false. Cancel/expire the affected challenge, preserve audit, close the preview and investigate before another real attempt.

## 10. Acceptance evidence package

Record only non-secret evidence:

- owner approval time and production-window boundaries;
- backup timestamp/identifier and restore-scope confirmation;
- exact Git commit and three SHA-256 values;
- test totals;
- before/after preservation counts;
- migration-list and exact dry-run result;
- remote records for only migrations 009 and 010;
- RLS/grant/function checks and initial zero-row proof;
- deployment IDs, gate states and protection state;
- disabled endpoint status/body and unchanged DB counts;
- authorisation state counts/statuses without hash/raw value;
- developer profile/capability booleans without password/token;
- normal-login success and browser-session-only result;
- former enabled deployment deletion/protection proof;
- claim challenge status timeline and sanitised audit actions;
- Proprietress role/scope/title acceptance without password/OTP;
- final gate matrix.

Never record the database dump, secret values, one-time authorisation, password, OTP, full claim delivery message, private preview share token or ciphertext.

## 11. Final required gate matrix

| Gate | Required final state |
|---|---|
| `PORTAL_ENABLED` | `true` |
| `DEVELOPER_CONSOLE_ENABLED` | `true` |
| `DEVELOPER_MANUAL_BOOTSTRAP_ENABLED` | `false` |
| `PORTAL_ACCOUNT_CLAIM_ENABLED` | `true` only after manual claim acceptance; otherwise `false` |
| `ADMISSION_TRACKING_ENABLED` | `false` |
| `PARAGON_OTP_RELAY_ENABLED` | `false` |
| Monnify/card payment gates | `false` / out of scope |

## 12. Official guidance reviewed

- Supabase database migrations: <https://supabase.com/docs/guides/deployment/database-migrations>
- Supabase CLI migration list and `db push`: <https://supabase.com/docs/reference/cli/supabase-migration-list>
- Supabase local migration workflow: <https://supabase.com/docs/guides/local-development/cli-workflows>
- Supabase production backups: <https://supabase.com/docs/guides/platform/backups>
- Supabase API keys: <https://supabase.com/docs/guides/getting-started/api-keys>
- Supabase Auth Admin user creation: <https://supabase.com/docs/reference/javascript/auth-admin-createuser>
- Supabase password/phone sign-in: <https://supabase.com/docs/guides/auth/passwords>
- Vercel environment variables: <https://vercel.com/docs/environment-variables>
- Vercel Secret variables: <https://vercel.com/docs/environment-variables/sensitive-environment-variables>
- Vercel environments and branch-specific previews: <https://vercel.com/docs/deployments/environments>
- Vercel deployment protection: <https://vercel.com/docs/deployment-protection>
- Vercel secret rotation and old deployments: <https://vercel.com/docs/environment-variables/rotating-secrets>
- Vercel Instant Rollback limitations: <https://vercel.com/docs/instant-rollback>

---

This guide does not itself authorise a push, migration, deployment, Auth configuration change, owner authorisation, Auth user, OTP or feature-gate change. The next safe action is the migration-ledger source reconciliation, followed by a fresh review and explicit owner approval of the production window.
