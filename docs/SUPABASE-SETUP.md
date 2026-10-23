# Supabase setup — secure Treasure Academy portal

> **Replaced 23 October 2026.** The former instructions for a public `school_data` JSON table and browser writes are retired and unsafe for school records. Do not follow an older copy and do not send any Supabase key in chat.

Use the current owner/deployment runbook:

- `docs/SUPABASE-PORTAL-AND-MONNIFY-RUNBOOK-2026-10-23.md`
- versioned migration: `supabase/migrations/202610230001_secure_school_portal.sql`
- disposable staging RLS tests: `supabase/tests/rls_portal_policy.test.sql`

## Non-negotiable controls

1. Apply and test in a staging project with fictional records first.
2. `anon` receives no table grants for portal records.
3. Authenticated access is filtered by RLS for linked parents, assigned teachers and deliberate admin overrides.
4. Browser code receives only a Supabase URL and publishable/anon browser key.
5. Secret/service keys remain server-side and are never pasted into chat, source code, screenshots or public files.
6. If legacy `public.school_data` exists, the migration preserves it as evidence but removes every policy and public/authenticated grant.
7. Keep `PORTAL_ENABLED=false` until the RLS test matrix and owner readiness review pass.
8. Keep `MONNIFY_WEBHOOK_ENABLED=false` and `MONNIFY_OWNER_VERIFIED=false`; bank transfer remains the active payment method.

No assistant or public browser needs direct dashboard access to prove the design. An authorised operator can run the documented tests and share only redacted aggregate pass/fail results.
