# Batch 52 focused security review

> **Historical review — superseded for current operations.** The approved payment methods are now manually verified bank transfer or in-person physical school-office POS. Parent access uses the new server-authenticated, RLS-protected portal design; former browser-only portal and shop behavior must not be restored. See `docs/SCHOOL-OFFICE-OPERATIONS-PROGRAMME-2026-10-23.md`.

Date: 29 September 2026  
Historical scope: retain the then-current portal, read-only Supabase content layer and Treasure Support chatbot; fix confirmed exposure and document the remaining boundary.

## Executive decision

The three systems remain in the site. They are **not equivalent to a server-authenticated school management system**. Public pages and the offline fallback remain safe to use, but real private pupil/parent records must not be treated as protected merely because a portal screen checks a browser session.

## Fixed in Batch 52

### 1. Graduate contact data in public JavaScript — fixed

The public `store.js` seed carried graduate phone numbers and full dates of birth even though the alumni page did not need them. Those fields were downloadable by every visitor.

- Removed phone, full date of birth, parent, login and admission fields from all graduate seed records.
- Added an always-on migration that scrubs those fields from older browser saves.
- Kept only the owner-approved public record fields used by the alumni page: name, class/year, gender, examination number and results.

### 2. Unapproved teacher login — disabled

The owner approved only the Headmistress and Assistant Headmistress as staff accounts.

- Teacher roster records no longer authenticate.
- The old teacher fixture has no PIN/password and is marked login-disabled.
- Old browser saves have teacher PIN/password values cleared on load.
- The two leadership records remain the only staff-login path. Pupil accounts are a separate parent/pupil feature.

### 3. Legacy browser cloud writes — disabled

The old `sync.js` could upload the complete local database to a generic `school_data` table with an anon key. That could include portal and pupil data and contradicted the stated read-only design.

- Browser `push()` is now a deliberate no-op.
- Automatic `pushSoon()` is disabled.
- Generic `school_data` pull/write behavior is retired.
- The admin settings panel now clearly says **Public Data Connection (Supabase)** and offers read-only public refresh only.
- Connection testing reads the public `sessions` table; `DBLive` continues to read only its allowlisted public tables.

### 4. Bank-account publication — permanently disabled

No public or portal page now renders bank name, account number or holder from browser/live data. Payment screens and printed/copyable messages direct families to confirm the current bank-transfer destination via:

- Call: `+234 814 194 3478`
- WhatsApp: `09063932487`

This historical review disabled the former browser checkout. The current approved design instead supports manually reviewed bank-transfer notifications and separately recorded in-person physical office-POS payments inside the protected portal; neither is an online checkout.

### 5. Response headers — strengthened

Vercel now applies HSTS, `nosniff`, strict-origin referrer policy, same-origin framing and a restrictive Permissions Policy site-wide. Microphone remains self-only because the support assistant has optional speech input.

## Reviewed and retained

### Supabase public content layer

The checked-in SQL enables RLS, withholds private pupil/parent/results/payment tables from `anon`, revokes the household phone lookup from public access, and restricts public staff columns. No `service_role` credential is present in browser code.

**Deployment caveat:** source review cannot prove that every SQL policy was actually applied to the live Supabase project. Verify `db/003_policies.sql` in the Supabase SQL editor before real private records are added.

### Portal

Authentication and sessions are currently implemented in browser storage. That can provide an offline/demo experience, but browser checks can be forged by someone controlling their own device. It is not a server authorization boundary.

**Required before real private school records are centrally hosted:** use Supabase Auth or a small authenticated server API, enforce roles server-side, hash credentials server-side, rate-limit OTP/login endpoints and keep the service-role key exclusively on the server.

### Treasure Support chatbot

- User questions are escaped before HTML rendering.
- Guest history stays in `sessionStorage`; signed-in history stays in that device's `localStorage`.
- No remote AI endpoint or model credential is embedded in the repository.
- Urgent routing uses only the approved WhatsApp line.

Do not ask users to submit passwords, medical details, payment account numbers or other private pupil information in chat.

## Remaining hardening backlog

1. Apply and verify `db/003_policies.sql` on the live Supabase project.
2. Replace browser-only portal authentication with server-enforced authentication before real pupil data is synced.
3. Move all future database writes behind an authenticated, rate-limited server endpoint.
4. Adopt a nonce/hash Content Security Policy when inline scripts are moved to external files. A strict CSP was not added now because the current site has many necessary inline scripts and would break.
5. Periodically inspect public bundles for unnecessary personal data before each release.
