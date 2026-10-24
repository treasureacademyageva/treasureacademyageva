# Live Supabase schema and account mapping

**Review date:** 23 October 2026

**Scope:** account functionality and preservation gates only

**Production changes made:** none

## 1. Evidence and limits

The owner completed two separate read-only catalog inventories against the existing Free-plan Supabase project. Every SQL batch used a read-only transaction and rolled back. The corrected live inventory contains:

- 25 `public` tables;
- 6 `public` views;
- 1 `public` sequence;
- 0 Auth users and 0 Auth identities;
- 0 Storage buckets and 0 Storage objects;
- no secure-portal tables from local migrations `202610230001` through `202610230004`.

The owner also downloaded two private CSV rescue files directly from the Supabase Dashboard to the owner's device:

- one `school_data` row;
- 69 rows from the other currently non-empty application tables.

The CSV files remain owner-controlled and are intentionally not stored in the repository, chat, an agent workspace, GitHub or WhatsApp. The downloads preserve current row data for migration review, but they are not a full PostgreSQL disaster-recovery dump. Empty-table schemas, constraints, policies and grants are preserved by the repository SQL plus the live metadata inventory.

The live snapshot cannot prove whether records existed and were deleted before the inventory. Conclusions below describe current state only.

## 2. Corrected current-state inventory

### Non-empty tables

| Existing table | Current rows | Account-release treatment |
|---|---:|---|
| `admission_windows` | 1 | Keep in place as public/admissions content. Do not copy into account tables. |
| `calendar_events` | 5 | Keep in place as public calendar content. |
| `exam_timetable` | 6 | Keep in place as public exam content. |
| `fee_structure` | 10 | Keep in place as fee information. It is not a payment or admission decision. |
| `holiday_assignments` | 2 | Keep in place; broader portal authorization is later scope. |
| `pta_meetings` | 1 | Keep in place as meeting content. |
| `school_data` | 1 | Preserve raw owner export. JSON structure is one non-sensitive scalar field and has no account/pupil/payment-shaped section. Do not migrate it into account tables or retire it yet. |
| `sessions` | 1 | Keep in place as the former portal's academic-session record. |
| `shop_items` | 25 | Keep in place as catalogue data. |
| `staff` | 6 | Treat only as candidate evidence for teacher/admin verification; never auto-create Auth accounts. |
| `staff_meetings` | 1 | Keep in place; private staff content remains separate from account creation. |
| `transport_routes` | 3 | Keep in place as public route/fee content. |
| `uniform_items` | 8 | Keep in place as public catalogue data. |

Total owner-exported current rows: 70, split between the private `school_data` CSV (1) and the consolidated live-data CSV (69).

### Empty tables

The following currently contain zero rows:

- `applications`
- `attendance`
- `audit_log`
- `fee_payments`
- `news_images`
- `news_posts`
- `parent_accounts`
- `parent_phones`
- `pta_attendance`
- `pupils`
- `results`
- `staff_subjects`

No data CSV is required for a table with zero current rows. Its structure and access model remain part of the preserved schema inventory.

### Views and sequence

Preserved views:

- `calendar_current_session`
- `calendar_upcoming`
- `exams_current_session`
- `exams_upcoming`
- `fee_balances`
- `shop_catalogue`

Preserved sequence: `audit_log_id_seq`.

## 3. Account evidence conclusion

There are currently:

- 0 rows in `auth.users`;
- 0 rows in `auth.identities`;
- 0 rows in `parent_accounts`;
- 0 rows in `parent_phones`;
- 0 rows in `pupils`;
- 0 rows in `staff_subjects`;
- no account/pupil/payment-shaped structure in the current `school_data.data` JSON.

Therefore the account release has **no existing Auth users, parent accounts, pupil accounts or parent–child links to copy from the current snapshot**. No automated former-account import should run.

This does not establish continuous historical absence. It means only that no migratable account or relationship rows exist now.

The six current `staff` rows are not accounts. They may be used only as office-verification evidence. A staff record does not receive portal access until the owner/headmistress verifies the person, current phone and intended role and an authorised administrator provisions a new Auth account.

## 4. Former-to-new mapping rules

| Former object/field | Secure destination | Rule |
|---|---|---|
| `auth.users` / `auth.identities` | Supabase Auth plus `profiles` | No current rows. Create new accounts only through the approved bootstrap/admin workflow. |
| `parent_accounts.id` | `legacy_account_mappings.source_key` | Candidate reference only if a future verified row exists. Do not reuse it as an Auth/profile ID. |
| `parent_accounts.account_no` | `profiles.legacy_account_no` | Copy only after office verification. Current source count is zero. |
| `parent_accounts.parent_name` | `profiles.full_name` | Office-verified candidate; never an automatic identity match. |
| `parent_accounts.email/address` | no account-release destination | Preserve in former table/export; broader contact-data design is later scope. |
| `parent_accounts.password_hash` | nowhere | Never export for migration, copy, compare, log or restore into the new account system. |
| `parent_phones.phone` | `profiles.phone_e164` | Normalize only after office verification that the number is current and belongs to the person. |
| `parent_phones.phone_key` | nowhere authoritative | Do not use last-ten-digit matching as proof of identity or relationship. |
| `pupils.id` | `legacy_account_mappings.source_key` or reviewed student mapping | Preserve as source evidence; new `students.id` remains a separate UUID. Current count is zero. |
| `pupils.admission_no` | `students.admission_number` | Copy only in a separately reviewed pupil migration. |
| `pupils.full_name` | `students.full_name` | Copy only with owner-approved pupil records. |
| `pupils.class_name` | `students.class_code` | Normalize through a reviewed class-name mapping; do not guess. |
| `pupils.account_id` | `student_guardians` candidate | Never grants access automatically. An active link requires office verification, `verified_by` and `verified_at`. |
| `staff.id` / `staff.staff_no` | `legacy_account_mappings.source_key` / legacy reference | Preserve source identity without reusing the staff UUID as an Auth user ID. |
| `staff.full_name` | `profiles.full_name` | Candidate only; verify the person before provisioning. |
| `staff.phone` | `profiles.phone_e164` | Do not assume seeded/display numbers are current or authentic. Verify and normalize first. |
| `staff.role = teacher` | `profiles.role = teacher` candidate | Requires explicit office verification. |
| `staff.role = headmistress/admin` | owner-controlled administrator bootstrap candidate | Never pass through the ordinary parent/teacher creation endpoint. |
| `staff.role = support` | no account by default | Add only after a later explicit role/access decision. |
| `staff.class_name` + `staff_subjects.subject` | `teacher_class_assignments` candidate | Create only after confirming current assignments. `staff_subjects` is currently empty. |
| `applications.status` | admission workflow | Remains independent from account status. No current rows. |
| `fee_payments` | future reviewed `payments` migration | Remains independent from admission/account status. Current count is zero. |
| `results` | future reviewed `grades` migration | Later portal-functionality scope; current count is zero. |
| `audit_log` | preserved former audit | Never merge into `account_audit_log`; provenance and meaning differ. Current count is zero. |
| `school_data` | no secure-account destination | Preserve owner export; do not copy the leftover test-shaped JSON into account tables. |

## 5. Objects added by the secure migrations

The reviewed migrations add, without name collision with the current tables:

- `profiles`
- `students`
- `teacher_class_assignments`
- `grades`
- `payments`
- `webhook_events`
- `payment_audit_log`
- `admission_audit_log`
- `student_guardians`
- `account_audit_log`
- `legacy_account_mappings`

The subsequent local operations and parent-linking migrations additionally add attendance, homework, result-review, website-request, verified-public-information, staff-notice, duty-roster, protected leadership-section, hash-only pupil-linking, second-parent invitation and admission-application tables plus their audit records. They add no people or school facts.

Migrations 005 and 006 add restricted parent applicants, self-registration audit hashes, exact class progression, permanent enrolment history, promotion previews, Graduate Hall/Wall, term invoices, physical catalogue variants, immutable inventory movements, procurement, stocktakes, transport capacity, fulfilment, returns/exchanges and manual bank/POS payment verification. They insert no pupil, price, bank account, route or other owner data.

Migration 007 adds service-only admission tracking and manual OTP records, capability-scoped developer access, and extensions for reviewed public answers. It preserves the former tables and inserts no people, applications or operational facts.

Together the seven migrations add account/payment/admission/operations types, portal authorization helpers, narrow security-definer RPCs and RLS policies.

No new secure table currently exists in production.

## 6. Collision review and local correction

The live database already has a function named `public.touch_updated_at()` serving the preserved `public.school_data` trigger. The original secure baseline also used `create or replace function public.touch_updated_at()`. Although its behavior was similar, replacing that function would contradict the promise that former portal dependencies remain untouched before cut-over.

The local migrations now use a separate `public.portal_touch_updated_at()` function for all new secure-portal tables. They no longer replace or invoke the former `public.touch_updated_at()` function. A regression test enforces this separation.

Other reviewed names do not collide with the live application inventory. The Auth trigger and direct `auth.sessions` behavior still require disposable Supabase staging validation before production.

## 7. First-account plan

Because no Auth account exists, production account creation must begin with an owner-controlled first-administrator bootstrap after staging acceptance.

Required owner-provided facts at that later step:

- verified administrator full name;
- verified current Nigerian phone number;
- explicit owner/headmistress authorization;
- a privately delivered temporary password followed by mandatory first-sign-in change.

Do not place these values in repository files, migration SQL, chat transcripts or public deployment configuration.

After the owner-controlled Headmistress bootstrap and activation:

- teacher accounts may be created one at a time by the Headmistress from verified staff evidence;
- ordinary parent accounts are self-created through a school-issued `TA-LINK`, a phone-bound `TA-FAMILY`, or a restricted new-applicant route; the Headmistress does not create ordinary parent accounts;
- a restricted applicant cannot read pupil lists, fees, bank details, shop, results or current-family records until an authorised admission creates and links one permanent pupil;
- no pupil login is created;
- no payment or admission event creates or activates an account.

## 8. Remaining gates

The current owner CSV preservation satisfies the **current-row migration-preservation** gate for account planning, but not a complete disaster-recovery backup.

Before any production migration:

1. regenerate and review the root `supabase-schema.sql` mirror after the legacy-function isolation correction;
2. rerun the maintained repository security/browser tests;
3. follow `supabase/release/20261024_SQL_AGENT_HANDOFF.md` and apply all seven migrations through `202610240001`, in exact order, only to a disposable Supabase staging project;
4. execute all three rollback-only SQL RLS/session suites and the read-only postflight in staging;
5. validate direct `auth.sessions` reads/deletes and revoked-session denial on the actual Supabase version;
6. validate first-admin bootstrap and one fictional teacher/parent lifecycle;
7. confirm legacy tables and all 70 preserved production rows remain unchanged by the staged migration procedure;
8. obtain explicit owner approval before production SQL, push, deployment or activation.

`public.school_data` remains publicly mutable in production. Its security retirement stays separate and manual until export, mapping review, staged cut-over and explicit owner approval are complete.
