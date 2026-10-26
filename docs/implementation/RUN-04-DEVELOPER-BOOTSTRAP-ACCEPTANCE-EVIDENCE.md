# Run 4 Developer Bootstrap Acceptance Evidence

**Date:** 26 October 2026
**Scope:** Run 4 Stages 1–7 only — owner-authorised developer bootstrap
**Result:** Accepted and closed
**Next controlled stage:** Stage 8, protected manual Proprietress account-claim acceptance

This record intentionally excludes passwords, one-time authorisations, API keys, peppers, full delivery messages, OTPs, ciphertext and private preview credentials.

## Accepted source and production state

- Accepted application commit: `56c1cde9d4a7cd6983984cf7a26413ceae0dc627`.
- Corrective source commit: `6668b848a51edd2bc502e12851925bf1521b6808`.
- Current production deployment: `dpl_6Hzmr687cycJegjpAfbfWSZWEJiF`.
- Current production deployment state: `READY` and `PROMOTED`.
- Production homepage: HTTP `200`.
- Production portal config: HTTP `200`, portal enabled, developer bootstrap false and account claims false.
- Production bootstrap POST: application-controlled HTTP `404` with `{"error":"Not found"}`.
- Admission tracking and Paragon relay remained disabled throughout.

The corrective commit added only one additive SQL migration and its regression test. Git integration created the current production deployment automatically; runtime application code did not change.

## Production migrations

The previously accepted migrations remained unchanged:

- `20261025000100_owner_authorised_developer_bootstrap.sql`
  - SHA-256: `b78ec9556b033960f0bb6087ad07b32b7f8393f1183b142b62148e3e4067f571`
- `20261025000200_developer_bootstrap_http_controls.sql`
  - SHA-256: `64ceb97c3a0b41a4a09c08d40cbae7b82f719fdfab5c62d7906f46fa8755faaf`

The first official owner issuance attempt failed transactionally because the owner-only issuer referenced pgcrypto functions in `public`, while this Supabase project installs pgcrypto in `extensions`. Immediate reconciliation proved zero Auth users, authorisations, events and HTTP-limit rows.

The additive correction was reviewed, transaction-compiled and applied as:

- Remote migration: `20261026040507_fix_owner_bootstrap_pgcrypto_schema`
- Source file: `supabase/migrations/20261026040507_fix_owner_bootstrap_pgcrypto_schema.sql`
- SHA-256: `6287ff5844a1f702b3d8652e042ac76d121ee9df4f57b3fea9bf419a5c567900`

The correction changed only these two fully qualified calls in the issuer definition:

- `public.gen_random_bytes` → `extensions.gen_random_bytes`
- `public.digest` → `extensions.digest`

Post-application checks proved both corrected references, no remaining `public` references, `SECURITY DEFINER`, the restricted search path and revoked execution for `anon`, `authenticated` and `service_role`.

## Automated checks

- Portal/security checks: `87/87` passed.
- Developer bootstrap endpoint checks: `12/12` passed.
- Migration bridge/correction tests: `2/2` passed.
- Original migration 009 checksum remained unchanged.
- The corrective function body matched the original body except for the two reviewed pgcrypto schema qualifiers.

## Protected acceptance boundary

The protected branch was `run4-bootstrap-acceptance-20261026` at the accepted application commit.

Vercel Authentication returned an anonymous `302` to Vercel SSO for the deployment URL, branch alias and portal-config endpoint. An authorised viewer confirmed the temporary owner-authorised form was visible before issuance.

Only the acceptance branch received these four preview-scoped values:

- production Supabase URL;
- branch bootstrap gate;
- temporary Sensitive Supabase secret key;
- independent Sensitive bootstrap rate-limit pepper.

No Sensitive value is recorded here. Production entries remained separate.

The gate-enabled deployment was:

- `dpl_6ALXBjZuomKgLfSrbS7koQujKQ8d`
- ready at `2026-10-26T03:57:38.694Z`
- protected by Vercel Authentication
- deleted immediately after successful server completion was reconciled

## Owner authorisation and completion

After the correction, the owner issued exactly one ten-minute `initial_password` authorisation through the official Supabase SQL Editor.

Sanitised timeline:

- issued: `2026-10-26T04:07:29.158916Z`
- Auth user/profile created: approximately `2026-10-26T04:11:40.56Z`
- authorisation consumed, claim completed and audit committed: `2026-10-26T04:11:40.954425Z`

No OTP was generated or sent. No message was addressed to the sender/login number.

The browser initially reported a generic setup rejection, so no blind retry or second issuance was allowed. Immediate server-side reconciliation proved that the first accepted server operation had completed. Normal production phone-and-password sign-in then succeeded privately.

## Identity and capability acceptance

Post-completion evidence proved:

- Auth users: `1`.
- Auth identities: `1`.
- Exactly one accepted application profile.
- Base role: `parent`.
- Leadership scope: `none`.
- Account active and no forced password change.
- Application `phone_verified_at` and `phone_verified_by`: null.
- Supabase Auth phone confirmation: present as owner attestation, not application OTP verification.
- Phone/password identity; no email, SSO or anonymous identity.
- Exact active developer capabilities:
  - console access;
  - OTP dispatch;
  - public-information review;
  - system-health read.
- Teacher/class assignments: `0`.
- Guardian links: `0`.
- Legacy parent/pupil links: `0`.
- Applicant links: `0`.
- Provisioning audit rows for this action: `1`.
- Consumed authorisations with destroyed hash: `1`.
- Live authorisations: `0`.
- Bootstrap event order:
  1. `issued`;
  2. `reserved`;
  3. `owner_authorised_supabase_bootstrap`.
- Normal production Developer Console phone/password sign-in succeeded.
- No durable server-side Auth session remained after the browser-session-only check.

The accepted identity has no school leadership, class, pupil, guardian, applicant, payment, admission-decision or publishing authority.

## Closure evidence

The branch gate was first changed to false. A protected replacement was deployed as `dpl_2jMjRdWkWwg6ZZn5P6LZP3Lh8QhA` and became ready at `2026-10-26T04:14:30.266Z`.

Closure then removed:

- the gate-enabled deployment;
- the replacement and all earlier acceptance deployments;
- all four branch-specific Vercel variables;
- the temporary Supabase secret API key;
- the remote and local acceptance branch.

The four deployment URLs and former branch alias all returned HTTP `404` after deletion.

Final developer-bootstrap state:

- production bootstrap gate: false;
- production bootstrap POST: application-controlled `404`;
- live authorisations: zero;
- temporary branch variables: deleted;
- temporary Supabase key: deleted;
- acceptance deployments: deleted;
- acceptance branch: deleted;
- accepted developer identity and code-free audit: preserved.

## Stage boundary

Run 4 Stage 8 has not started. Production account claims remain false. A fresh protected preview, fresh temporary key and separately verified manual delivery/reveal flow are required before the real Proprietress claim may be consumed. Admission tracking and Paragon relay remain false.
