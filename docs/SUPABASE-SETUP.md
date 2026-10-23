# Supabase setup — secure Treasure Academy portal

> **Updated 23 October 2026.** The former portal was real and used Supabase. Its legitimate records and familiar workflows must be inventoried and preserved. The broad browser access in the earliest `school_data` instructions is not safe for current school records, so it will be replaced underneath the portal—not erased. Do not send any Supabase key in chat.

Use the current owner/deployment runbook:

- `docs/SUPABASE-PORTAL-AND-MONNIFY-RUNBOOK-2026-10-23.md`
- baseline migration: `supabase/migrations/202610230001_secure_school_portal.sql`
- account migration: `supabase/migrations/202610230002_portal_accounts.sql`
- disposable staging RLS/account tests: `supabase/tests/rls_portal_policy.test.sql`
- account implementation plan: `docs/PORTAL-ACCOUNT-PLAN-2026-10-23.md`
- reviewed live-schema/account mapping: `docs/LIVE-SCHEMA-ACCOUNT-MAPPING-2026-10-23.md`

## Non-negotiable controls

1. Run `supabase/manual/00_read_only_legacy_portal_inventory.sql` in the existing owner-controlled project before any migration.
2. Create an owner-controlled backup/export, then apply and test only in staging first.
3. The secure baseline must leave `school_data` and older normalized portal tables unchanged until verified cut-over.
4. `anon` receives no grants to the new secure portal records.
5. Authenticated access is filtered by RLS for linked parents, assigned teachers and deliberate admin overrides.
6. Browser code receives only a Supabase URL and publishable/anon browser key.
7. Secret/service keys remain server-side and are never pasted into chat, source code, screenshots or public files.
8. Keep `PORTAL_ENABLED=false` and `PORTAL_ACCOUNTS_ENABLED=false` until record mapping, forced-password/account tests, the RLS matrix and owner readiness review pass.
9. Phone/password accounts are created only by an authorised school admin through server-only Auth Admin operations; former PINs/passwords are never migrated.
10. Keep `MONNIFY_WEBHOOK_ENABLED=false` and `MONNIFY_OWNER_VERIFIED=false`; bank transfer remains the active payment method.
11. Run the manual legacy-retirement SQL only after a separate owner-approved cut-over.

No assistant or public browser needs direct dashboard access to prove the design. An authorised operator can run the documented tests and share only redacted aggregate pass/fail results.
