# Legacy Supabase portal preservation — manual steps

The former Treasure Academy portal was real and substantial. Its browser authentication and broad `school_data` access were unsafe for current school records, but its legitimate records and familiar workflows must be preserved before cut-over.

## Owner’s safest next action

1. Sign in to the **existing owner-controlled Supabase dashboard** directly. Do not send anyone your password, API key, recovery code or dashboard access.
2. Open **SQL Editor → New query**.
3. Paste and run only `00_read_only_legacy_portal_inventory.sql`.
4. The script starts a read-only transaction, returns metadata only and rolls back.
5. Share a cropped screenshot of the result tables only after hiding:
   - browser address bar and project reference;
   - email addresses or account names;
   - all API keys and environment values;
   - any accidental row content.

The result will tell us whether the live project contains:

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
3. Apply `202610230001_secure_school_portal.sql`, then `202610230002_portal_accounts.sql`, in that order in staging only.
4. Map legitimate records to the secure schema. Never restore demo credentials, sample pupils, plaintext PINs or fabricated receipts.
5. Reconcile canonical Nigerian phones and verify caregiver links; unmatched identities remain pending/inactive.
6. Restore the familiar portal workflows against RLS-protected tables.
7. Test parent, teacher and admin accounts, including first-password change, reset/session revocation and multi-caregiver access.
8. Obtain owner approval for cut-over.
9. Only then run the manual retirement SQL and switch production configuration.
