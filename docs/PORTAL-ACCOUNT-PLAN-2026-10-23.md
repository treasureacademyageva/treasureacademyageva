# Treasure Academy portal account plan

**Confirmed 23 October 2026**

- Sign-in: Nigerian phone number + password
- Account creation: authorised school administrator only
- Recovery: office verifies identity and performs reset
- Session storage: browser-session only
- Roles: admin, teacher and parent; no pupil login initially
- Former Supabase records/accounts: inventory and preserve before migration

## Local implementation status

Implemented in the repository, but **not applied to Supabase, deployed or enabled**:

- account migration: `supabase/migrations/202610230002_portal_accounts.sql`;
- Nigerian phone/password browser sign-in with E.164 normalization;
- browser-session-only Supabase storage and explicit local sign-out;
- forced first-password-change screen before any school-record query;
- server-only account creation, reset, status and caregiver-link Functions;
- secret-key account service with authenticated-admin checks, same-origin POST checks and bounded JSON bodies;
- `student_guardians`, account state, append-only account audit and legacy mapping evidence;
- reset-time refresh-session revocation plus RLS denial for pending/suspended/archived accounts;
- admin account directory, provisioning, verified reset, status and caregiver-link controls;
- fictional static/server/browser tests.

The comprehensive live inventory and owner-controlled current-row CSV rescue are now complete. The corrected live snapshot has 25 public tables, 6 views, 1 sequence, no Auth users/identities, no parent or pupil rows, and no Storage objects. The two owner-held CSV files preserve 70 current rows and are not stored in the repository or chat. See `docs/LIVE-SCHEMA-ACCOUNT-MAPPING-2026-10-23.md` for the reviewed mapping and its limits.

Activation still requires a disposable staging migration and live database RLS/account tests. The CSV rescue is sufficient for current-row migration planning but is not a full PostgreSQL disaster-recovery dump. `PORTAL_ACCOUNTS_ENABLED` must remain false or unset until the remaining gates pass.

## 1. Account principles

1. **The former portal was real.** Legitimate parent, pupil and staff relationships are migration evidence, not disposable demo content.
2. **No public self-registration.** A public visitor cannot create an authenticated account or attach themselves to a child.
3. **Phone number is an identifier, not sufficient identity proof.** The office verifies the person and relationship before confirming the number.
4. **Passwords never migrate from browser code.** Former PINs/plaintext/demo credentials are discarded; every migrated person receives a new temporary password.
5. **Database policy is the authority.** Hiding a menu item is not access control.
6. **Accounts, payments and admission are separate.** Payment never creates/activates an account and never approves admission.
7. **No pupil login initially.** Parent accounts access linked children.

## 2. Why phone + password is workable

Supabase supports password sign-in using either email or phone. Phone/password avoids an ongoing SMS cost when the school administrator creates a verified account with `phone_confirm=true`. Only a trusted server using the Supabase secret key may call the Auth Admin API.

Important risk: mobile numbers can be recycled. Therefore:

- every phone change requires renewed office identity verification;
- changing a phone revokes existing sessions;
- admin and teacher accounts should add TOTP authenticator MFA in a later approved step (no SMS provider required);
- old/inactive accounts are suspended rather than silently reassigned to a new holder of the number.

Official references:

- <https://supabase.com/docs/guides/auth/passwords>
- <https://supabase.com/docs/reference/javascript/auth-signinwithpassword>
- <https://supabase.com/docs/reference/javascript/auth-admin-createuser>
- <https://supabase.com/docs/guides/auth/sessions>
- <https://supabase.com/docs/guides/auth/password-security>

## 3. Identity and relationship model

### Auth identity

`auth.users` stores:

- verified phone in E.164 form, e.g. `+2349063932487`;
- Supabase password hash (never plaintext in school tables);
- confirmation and session metadata.

### Profile

Extend `profiles` with:

- `phone_e164 text unique not null`
- `account_status`: `pending_activation`, `active`, `suspended`, `archived`
- `must_change_password boolean default true`
- `phone_verified_by uuid`
- `phone_verified_at timestamptz`
- `created_by uuid`
- `legacy_source text` and `legacy_account_no text` where verified
- `last_password_change_at timestamptz`

Role remains `admin`, `teacher` or `parent`. Role/account-status changes are admin-audited and cannot be changed by the profile owner.

### Parent–child links

Replace the one-parent-only assumption with a join table:

`student_guardians(student_id, parent_id, relationship, is_primary, active, verified_by, verified_at)`

This safely supports:

- one parent with several children;
- a child with two verified caregivers;
- removal of one caregiver without changing the pupil record;
- an auditable relationship-verification decision.

Parent RLS checks active rows in `student_guardians`. It never links families by a public phone lookup.

### Teacher scope

Keep `teacher_class_assignments` for class/subject access. Creating a teacher account alone provides no pupil access until an assignment is active.

## 4. Phone normalization

The interface accepts familiar Nigerian forms such as:

- `0906 393 2487`
- `09063932487`
- `2349063932487`
- `+2349063932487`

Before authentication, convert valid Nigerian numbers to `+234` plus the final ten national digits. Reject incomplete, impossible or non-Nigerian input in the first release. Store only canonical E.164 in Auth/profile fields; a formatted display value can be generated when shown.

Do not expose an endpoint that tells a visitor whether a phone exists.

## 5. Account creation workflow

### Parent

1. Admin searches existing records privately by verified former account number/phone.
2. Admin checks parent identity and relationship to each child through the school’s approved offline process.
3. System blocks duplicate canonical phone numbers.
4. Trusted server creates the Supabase Auth user with phone/password and `phone_confirm=true`.
5. System creates/updates the parent profile and verified `student_guardians` links.
6. System generates a strong temporary password once; it is never stored in an application table or log.
7. Admin provides it privately—in person or through a confirmed voice call, not a public/WhatsApp group.
8. First sign-in is restricted to the change-password screen.
9. After a successful change, `must_change_password` becomes false and linked records become available.

### Teacher

Same process, but:

- verify against an active staff record;
- create role `teacher` deliberately;
- add class/subject assignments separately;
- no payment visibility by default.

### Administrator

- First admin is bootstrapped through the owner-controlled Supabase dashboard.
- Creating/promoting another admin requires the owner/headmistress authority, not an ordinary teacher/parent admin form.
- Maintain at least two authorised administrative recovery contacts to avoid a single locked-out account.

## 6. Proposed server endpoints

All account-management endpoints are same-origin Vercel Functions, POST-only, no-store and available only to an authenticated admin. Each validates the caller against Supabase Auth and the `profiles` table before using the server-only secret key.

### `POST /api/admin/accounts`

Creates a parent or teacher account.

Input:

- canonicalizable phone
- verified full name
- role (`parent` or `teacher` only in the ordinary workflow)
- legacy account reference, if verified
- linked child IDs or teacher assignments in a separately confirmed step

Output:

- new account ID
- one-time temporary password, shown once to the authorised admin
- no secret key, password hash or private row dump

Controls:

- same-origin check
- authenticated admin JWT validation
- input allowlist and size limits
- duplicate phone check
- database transaction/RPC for profile and links
- append-only account audit
- never log request bodies or temporary passwords

### `POST /api/admin/accounts/:id/reset-password`

After office verification:

- generates a temporary password;
- sets `must_change_password=true`;
- revokes all active sessions for that user;
- appends an audit event;
- shows the temporary password once to the authorised admin.

### `POST /api/account/change-password`

Authenticated user submits current temporary password context and a new strong password. On success:

- update password through Supabase Auth;
- set `must_change_password=false`;
- record only timestamp/actor/action—never the password;
- issue/continue the browser session.

## 7. Password policy

- Minimum 12 characters for new/temporary passwords.
- Require upper, lower, number and symbol where Supabase configuration supports it.
- Block leaked passwords in Supabase if the project plan supports that control.
- No four-digit PINs.
- No default password reused across accounts.
- No password sent in URL, analytics, logs, source code or WhatsApp group.
- Temporary password expires operationally after first use or a short owner-approved window.
- Five failed attempts should trigger a temporary cool-down and office review; do not reveal whether the phone exists.

## 8. Recovery workflow

1. User selects **Account help**; the portal does not claim an automatic reset.
2. User contacts the verified office without sending an old password or child record.
3. Authorised staff locate the account privately.
4. Office verifies identity using approved school information/in-person confirmation—not security questions exposed on the website.
5. Admin triggers server-side reset.
6. All sessions for that user are revoked.
7. Temporary password is delivered privately after verification.
8. User signs in and must choose a new password before seeing school records.
9. Audit records who reset the account, target account, time and reason category—not the password.

Changing a phone follows the same verification plus session revocation. A recycled-number report immediately suspends the account until resolved.

## 9. Session policy

The browser client uses `sessionStorage`, so closing the browser session removes the locally stored Auth session. It never offers “remember me” in the first release.

Additional controls:

- use `signOut({ scope: 'local' })` for the normal Sign out button so one device does not unexpectedly log out every other authorised device;
- admin reset/suspension deletes the user’s Auth session rows through a service-only database function, and every portal RLS read checks that the signed JWT’s `session_id` still exists;
- suspension/archive also applies a long Supabase Auth ban to block new sign-ins and refreshes; reactivation explicitly lifts it;
- configure a reasonable Supabase time-box/inactivity limit as a backstop;
- clear role-specific in-memory state immediately on sign-out;
- no private portal tables in service-worker/browser application caches.

Recommended later review: 30-minute inactivity lock for admin/teacher and 60 minutes for parents, tested for real school usability.

## 10. Former-account migration

1. Run the read-only legacy inventory and owner-controlled backup.
2. Determine whether former accounts are in `school_data`, normalized `parent_accounts`/`staff`, Supabase Auth, or a combination.
3. Produce candidate account rows without copying former passwords/PINs.
4. Office verifies each phone/person/role before activation.
5. Preserve verified legacy account numbers only as references.
6. Map parent–child relationships into `student_guardians`.
7. Map teachers into profiles and assignments.
8. Require every migrated person to use a new temporary password and change it on first sign-in.
9. Compare counts and sampled owner-approved records before cut-over.
10. Keep unmatched records archived for manual review; never guess identity matches.

## 11. Account states

| State | Can sign in? | Can read portal records? | Use |
|---|---:|---:|---|
| `pending_activation` | temporary-password flow only | No | Created but first password not changed |
| `active` | Yes | According to RLS | Normal account |
| `suspended` | No | No | Security, employment or identity concern |
| `archived` | No | No | Historical former user; evidence retained |

Payment status and admission status never change these account states automatically.

## 12. Admin account screen

Initial safe actions:

- search by name/phone ending/legacy account number (admin only);
- create verified parent or teacher;
- view role, status, linked children/assignments and last sign-in time;
- reset password after recording verification reason;
- suspend/reactivate;
- revoke sessions;
- link/unlink caregiver or teacher assignment with confirmation;
- review account audit.

Not included:

- viewing passwords;
- impersonating users;
- bulk account creation from unreviewed legacy rows;
- deleting audit/history;
- public self-signup approvals without identity review.

## 13. Tests required

### Authentication

- Nigerian phone normalization and rejection cases
- generic wrong-phone/wrong-password error
- inactive/suspended account denial
- temporary password forces change before data access
- browser close removes local session
- local sign-out does not revoke another device
- reset revokes all sessions

### Authorization

- parent sees only actively linked children
- second verified caregiver sees the same linked child but not unrelated children
- removed caregiver immediately loses access
- teacher without assignment sees no pupils
- teacher cannot create accounts or change roles
- admin account action is audited

### Migration

- no legacy password/PIN copied
- no duplicate canonical phone
- record counts reconciled
- unmatched identities remain inactive
- old tables remain unchanged before owner-approved cut-over

### Accessibility/mobile

- phone field has explicit label, `tel` input mode and example
- password requirements/errors are textual
- first-error focus and visible focus ring
- 320px width without zoom or horizontal overflow
- account-help hand-off clearly states that the user must contact the office

## 14. Account implementation order

1. Finish existing Supabase inventory/backup.
2. Add profile account state, canonical phone, account audit and `student_guardians` migration.
3. Switch login from email/password to phone/password.
4. Add forced first-password-change gate enforced in RLS.
5. Add admin-only provisioning/reset Functions.
6. Add account-management admin screen.
7. Run fictional staging migration and account tests.
8. Verify former accounts one by one or in owner-approved reviewed batches.
9. Activate accounts in staging, then production only after owner approval.

Payment-flow design can proceed next, but it must consume verified account/child links rather than creating accounts or admission decisions itself.
