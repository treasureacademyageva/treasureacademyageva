# Legacy Supabase portal preservation — manual steps

The former Treasure Academy portal was real and substantial. Its browser authentication and broad `school_data` access were unsafe for current school records, but its legitimate records and familiar workflows must be preserved before cut-over.

## Historical inventory procedure — completed; do not repeat on production without approval

The owner completed the live read-only inventory on 23 October 2026. No further production SQL is authorised by this document. For the next staging-only rehearsal, use the exact manifest and agent prompt in `supabase/release/20261024_SQL_AGENT_HANDOFF.md`.

The completed procedure was:

1. Sign in to the **existing owner-controlled Supabase dashboard** directly without sharing a password, API key, recovery code or dashboard access.
2. Open **SQL Editor → New query**.
3. Paste and run only `00_read_only_legacy_portal_inventory.sql`.
4. The script starts a read-only transaction, returns metadata only and rolls back.
5. Share a cropped screenshot of the result tables only after hiding project, account, key and row details.

The result identifies whether the project contains:

- the Batch 19 JSON table `school_data`;
- the later normalized tables (`parent_accounts`, `pupils`, `attendance`, `results`, `fee_payments`, and others);
- the new secure tables; or
- a combination that requires a careful merge.

## Do not run yet

- `99_retire_legacy_school_data_after_verified_cutover.sql`
- the secure migration on the production project
- any `drop`, `truncate`, public-policy removal or bulk update

The retirement SQL is deliberately outside `supabase/migrations/`, so an automatic migration runner cannot close the former portal before preservation is complete.

## After the inventory

The comprehensive inventory and owner-controlled current-row CSV rescue were completed on 23 October 2026. The two private owner-held files contain the one `school_data` row and the other 69 current rows. They are a migration-preservation export, not a complete PostgreSQL disaster-recovery dump. The reviewed mapping is in `docs/LIVE-SCHEMA-ACCOUNT-MAPPING-2026-10-23.md`.

1. Keep the owner export private and retain a second owner-controlled copy when a trusted computer or encrypted drive is available.
2. Create a staging project or staging branch with fictional/copied-and-redacted test data.
3. Follow `supabase/release/20261024_SQL_AGENT_HANDOFF.md`: apply migrations `202610230001` through `202610240001` (all seven files), in exact filename order, in staging only. Migrations 005 and 006 add self-registration, permanent enrolment history, graduates, term bills, physical inventory, transport, fulfilment and manual payment controls; migration 007 adds admission tracking, manual OTP dispatch, developer capabilities and verified-answer extensions.
4. Map legitimate records to the secure schema. Never restore demo credentials, sample pupils, plaintext PINs or fabricated receipts.
5. Reconcile canonical Nigerian phones. Add existing pupils class by class as already enrolled; never invent unavailable admission numbers.
6. Restore the familiar portal workflows against RLS-protected tables.
7. In the disposable/staging database, run all three rollback-safe SQL suites: `supabase/tests/rls_portal_policy.test.sql`, `supabase/tests/programme_finance_inventory_policy.test.sql` and `supabase/tests/admission_tracking_developer_policy.test.sql`. Also run the acceptance matrix in `docs/SCHOOL-OFFICE-OPERATIONS-PROGRAMME-2026-10-23.md`, including restricted applicants, registration replay/rate limits, permanent progression with no Primary 5, Graduate Hall/Wall privacy, included-fee protection, inventory concurrency, procurement, fulfilment, returns/exchanges and manual bank/POS verification.
8. Create the two owner-verified leadership accounts privately, set their independent `leadership_scope` values and assign each leader's verified class. Never place their phone, password or Auth UUID in the repository.
9. Keep `PORTAL_ENABLED`, `PORTAL_ACCOUNTS_ENABLED`, `WEBSITE_REQUESTS_ENABLED`, `PUBLIC_INFORMATION_ENABLED`, `PARENT_LINKING_ENABLED`, `PORTAL_REGISTRATION_ENABLED`, `PORTAL_OFFICE_ENABLED`, `PUBLIC_GRADUATE_WALL_ENABLED`, `ADMISSION_TRACKING_ENABLED` and `DEVELOPER_CONSOLE_ENABLED` false until staging acceptance and separate owner activation approval. Keep both Monnify gates false; the approved payment methods are manual bank transfer and physical office POS.
10. Obtain owner approval for cut-over.
11. Only then run the manual retirement SQL and switch production configuration.
