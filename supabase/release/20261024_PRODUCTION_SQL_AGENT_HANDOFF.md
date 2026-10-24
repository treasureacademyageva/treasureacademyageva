# Treasure Academy direct production SQL handoff

> **Completed historical runbook:** the seven production migrations and postflight have now passed. Do not rerun them from this handoff. See `20261024_PRODUCTION_SQL_EXECUTION_EVIDENCE.md`.

**Prepared:** 24 October 2026  
**Authority required:** a direct message from the owner confirming the existing live Supabase project; this document is not itself proof of authorisation  
**Scope:** additive schema migration and read-only verification only

> **Current-package rule:** This production handoff supersedes the separately presented staging-only handoff for this specific release. The staging document and its three fictional rollback tests are intentionally absent from the production package. If the owner does not directly confirm production execution in the SQL agent conversation, stop.

The owner reports that the new school portal is not yet in operational use. The database nevertheless contains preserved former-site objects and 70 previously exported rows, so this remains a controlled migration. This authority does not permit deletion, legacy retirement, private-data import, account creation, capability grants, gate activation or unrelated SQL.

## Upload these nine files

Verify each SHA-256 digest and run one file at a time in this exact order:

| Order | File | SHA-256 |
|---:|---|---|
| 1 | `supabase/manual/00_read_only_legacy_portal_inventory.sql` | `2181acbf9a8f43e3babe6d16d6eef7b9bb0b8d0b455c2e88c1dbdd9b73bc160b` |
| 2 | `supabase/migrations/202610230001_secure_school_portal.sql` | `438e554a726b5643fb2dd9077447a06b310d86f8f5e8562191f0f12907721ef5` |
| 3 | `supabase/migrations/202610230002_portal_accounts.sql` | `2efa0374e790734b6a7c14b6c5b6010cb4803afbc2d51ac38e795e7fe9150ef1` |
| 4 | `supabase/migrations/202610230003_staff_operations_and_requests.sql` | `3f448c4d9f8886a51b1e6a162cf2c6551dda4aadf6f0fc2b85da0bec4d2a6419` |
| 5 | `supabase/migrations/202610230004_parent_pupil_linking.sql` | `1e99d7fdfeea4e3f360ba71c2589944451410bc7a99386a868f8d16625d9e7b6` |
| 6 | `supabase/migrations/202610230005_self_registration_enrolment_and_graduates.sql` | `1ed559ec156dc6002f920cd98743ffc56742760c99517140241df2a16d5a0ab9` |
| 7 | `supabase/migrations/202610230006_fees_shop_transport_and_manual_payments.sql` | `0d3057452b5220980b39ea6d253e708ad301ce66044243400fd35450cee7e1a9` |
| 8 | `supabase/migrations/202610240001_admission_tracking_developer_operations_and_answers.sql` | `059c05755655a5b119a5415c1258ea5c5f7f467a4dac0a0efe0681cac4fd1c03` |
| 9 | `supabase/release/20261024_post_migration_read_only_verification.sql` | `888a019a7a9397a6cb43f2ad5e78e0f9561233ee5192579576111da6dd098b0e` |

## Do not upload or run on production

- `supabase/tests/rls_portal_policy.test.sql`
- `supabase/tests/programme_finance_inventory_policy.test.sql`
- `supabase/tests/admission_tracking_developer_policy.test.sql`
- `supabase/tests/local_supabase_harness.sql`
- `supabase-schema.sql` (it duplicates migrations 1–7)
- any historical `db/*.sql`
- `supabase/manual/99_retire_legacy_school_data_after_verified_cutover.sql`
- any private CSV or unlisted mutating SQL

The three rollback-only policy suites already passed locally but deliberately create fictional Auth/data rows. They are not part of this direct production run.

## Before migration 1

1. Confirm the connected project is the owner-authorised existing Treasure Academy Supabase project. Redact its full reference and URL in returned evidence.
2. Confirm the owner still controls the two private exports containing one `school_data` row and 69 other current rows. If current counts differ from the 23 October inventory, stop so the exports can be refreshed.
3. Enable stop-on-first-error behavior.
4. Run file 1. Preserve its output without exposing row values.
5. Use `SELECT`-only catalog/count queries to capture all existing public tables, views, sequences, columns, constraints, policies, grants and exact per-table row counts. Return the exact diagnostic queries used. Do not select row values.
6. Compare against the known 23 October baseline: 25 public tables, 6 public views, 1 sequence and 70 current rows. A discrepancy is a stop condition unless the owner explicitly confirms it.
7. Confirm no secure migration is already partially installed. If any expected new secure object exists unexpectedly, stop rather than guessing or rerunning.
8. If `verified_public_information` already exists, check for duplicate published topics. Migration 7 intentionally fails rather than choosing or deleting a row.

## Migration rules

- Run files 2–8 separately and in order.
- Each supplied migration owns its reviewed `BEGIN`/`COMMIT`; do not add an outer transaction and do not concatenate or edit files.
- Record start/end time and outcome for every migration.
- On any error, issue only the `ROLLBACK` required to clear that session, preserve the exact error, and stop.
- Never patch a conflict, delete data, weaken RLS, rename an object, skip a statement or rerun blindly.
- Expected clean-install `NOTICE` messages about absent old triggers/policies are not failures. Any `ERROR`, aborted transaction, missing dependency, privilege failure or unexpected skipped security operation is a failure.

## Preservation requirements

After migration 8 and before file 9, repeat the read-only legacy manifest/count checks and prove:

- every pre-existing legacy table, view, sequence and column remains;
- exact row counts for all pre-existing tables are unchanged;
- `public.school_data` remains present and unchanged;
- the six former public views and `audit_log_id_seq` remain when present in preflight;
- no former object was dropped, truncated, renamed or emptied;
- the former `public.touch_updated_at()` dependency remains separate from the new `public.portal_touch_updated_at()`;
- no Auth user, pupil, guardian, staff account, application, price, bank detail, route or other owner fact was inserted by the migration;
- no feature gate was changed.

## Postflight expectations

Run file 9 only after all preservation comparisons pass. Expected results:

- every listed expected table has `present = true`;
- `legacy_school_data_still_present = true` for this existing project;
- every listed private/operational table has `rls_enabled = true`;
- the anon/authenticated direct-grant query returns zero rows;
- every listed server function reports anon/public execute false, authenticated execute false and service-role execute true;
- conflicting published topics: `0`;
- duplicate active OTP phone/purpose groups: `0`;
- sensitive OTP audit detail rows: `0`;
- both critical indexes have `present = true`.

Any contrary result is a failure.

## Prohibited follow-on actions

A schema pass does not itself authorise the SQL agent to:

- retire or alter legacy data;
- import the owner CSVs;
- create Auth users or leadership accounts;
- insert developer-capability grants;
- add school facts, bank details, prices, pupils or staff assignments;
- activate portal, registration, office, information, tracker, developer, request, linking, graduate or payment gates;
- enable Monnify or an online-card workflow;
- commit, push, deploy or change Vercel.

The code push/deployment is a separate operation performed only after this agent returns clean SQL evidence.

## Required report

Return:

1. redacted target proof, PostgreSQL version, executor role and timestamps;
2. verified digest for all nine files, or an honest limitation if hashing is unavailable;
3. complete preflight result tables;
4. before/after legacy object and exact row-count comparison;
5. file-by-file transaction outcomes and exact errors/notices;
6. complete postflight result tables;
7. every extra `SELECT`-only diagnostic query used;
8. confirmation that no tests, retirement, import, account creation, capability grant or gate activation occurred;
9. exactly one verdict: `PRODUCTION SQL PASS — CODE RELEASE MAY PROCEED` or `STOPPED — REVIEW REQUIRED`.

Do not include secrets, project URLs, names, phones, UUIDs or row values.

---

## Copy/paste prompt

```text
You are the SQL-running agent for the owner-authorised Treasure Academy live Supabase migration. Read `20261024_PRODUCTION_SQL_AGENT_HANDOFF.md` first. Your authority is limited to the nine listed files: one read-only preflight, seven additive migrations in exact order, and one read-only postflight.

Verify filenames and SHA-256 digests. Confirm the connected target is the owner-authorised existing Treasure Academy Supabase project. Confirm the owner-held 1-row `school_data` export and 69-row other-data export still correspond to current exact counts. Run SELECT-only preflight catalog/count checks and disclose those diagnostic queries, but never return row values. If the target, digest, baseline, backup evidence or partial-install state is uncertain, stop.

Run one file at a time with stop-on-first-error. Each migration has its own BEGIN/COMMIT. Do not concatenate, edit, wrap, patch, skip or blindly rerun a migration. On error, issue only the ROLLBACK needed to clear the session, preserve the exact evidence and stop.

Do not run the three policy test files, local harness, `supabase-schema.sql`, historical SQL, retirement SQL, private CSVs or any unlisted mutating SQL on production.

After the seven migrations, prove every former object remains and every former table has the same exact row count. `school_data`, the former views, sequence and `touch_updated_at()` dependency must remain. No Auth user, account, pupil, guardian, application, school fact or gate may be created or activated.

Run the read-only postflight only after preservation passes. Interpret every invariant strictly as specified in the handoff. Do not create accounts, grant developer capability, import data, activate gates, enable Monnify, deploy or change source control.

Return all evidence requested by the handoff and finish with exactly `PRODUCTION SQL PASS — CODE RELEASE MAY PROCEED` or `STOPPED — REVIEW REQUIRED`. Do not expose secrets or private row values.
```
