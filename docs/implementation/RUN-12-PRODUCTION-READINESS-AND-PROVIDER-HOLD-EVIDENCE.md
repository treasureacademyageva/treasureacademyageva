# Run 12 — Production Readiness and Provider-Hold Evidence

**Date:** 27 October 2026
**Authority:** owner-approved dynamic-platform master plan
**Safe boundary accepted:** local gate/relay tests plus read-only Production/Vercel/Supabase probes
**Run 11 accepted commit:** `f61a074be8a86058ca14c6fd452be351688e9a48`
**Production source:** unchanged Run 4 commit `a552618e40791a592cb9e586b2963d61ed46ad2c`

## 1. Outcome

Run 12 is complete at the safe technical and read-only preservation boundary. It records an exact gate-off release manifest, cryptographically exercises the signed relay without external traffic, proves account-claim/admission/relay gate independence, adds bounded GET-only Production probes, confirms the promoted rollback deployment and repeats exact Supabase preservation counts.

The Production release and external Meta/Render completion did **not** occur. No push, deployment, promotion, Production SQL, environment-variable change, gate activation, account/admission challenge, OTP, direct message, provider webhook, signed external relay, content import, inventory mutation or Cloudinary request occurred.

## 2. Release boundary

`config/run12-release-boundary.json` pins:

- accepted Run 11 commit `f61a074be8a86058ca14c6fd452be351688e9a48`;
- preserved Production source `a552618e40791a592cb9e586b2963d61ed46ad2c`;
- rollback deployment `dpl_DLjZRSt67DAxHhsBYprfhYeJV2h2`;
- Supabase project `biyizitalhylkwtshrqt`;
- 17 exact-false gates required for any future gate-off Runs 5–12 release;
- separate hold states for school-account claims, admission tracking and automatic Paragon relay;
- all seven external Meta/Render prerequisites;
- encrypted-restore and unexpected-count-decrease stop conditions.

The manifest deliberately preserves the already accepted Production portal configuration rather than falsely requiring the whole portal to be disabled. The live browser-safe configuration remains:

```text
portal enabled                     true
registration enabled               true
office enabled                     true
manual developer bootstrap         false
school account claims              false
```

No private key, URL value, pepper, password, OTP or provider secret is recorded.

The sandbox retained the accepted Run 10–11 working tree but lost the two unpushed local Git objects during environment restoration. Before Run 12 acceptance, that already-tested snapshot was recommitted as `f61a074be8a86058ca14c6fd452be351688e9a48`; no application file was reconstructed from guesswork and no remote changed. The Run 12 readiness suite now also requires `git cat-file` to prove the pinned commit object exists.

## 3. Read-only Production probes

`tools/run-production-preservation-probes.mjs` uses bounded GET requests only. It sends no authorization, cookies, API keys, form values or mutation body.

Accepted result:

```text
PRODUCTION PRESERVATION PROBES: 10/10 read-only checks passed
```

The probes verify:

- canonical HTTPS homepage 200 with school identity, CSP and `nosniff`;
- `robots.txt` and current sitemap 200;
- exact preserved public portal configuration;
- developer bootstrap, account claim, admission tracking and undeployed public-content endpoints fail closed with 404/405 and no redirect;
- a randomized unknown path is a real 404;
- apex host redirects in one permanent hop to `www`.

These are preservation probes for the existing Production source, not claims that Runs 5–12 were deployed.

## 4. Vercel preservation and rollback evidence

Connected Vercel read-only inspection confirms:

- project `prj_ZE21arjfWmtX6hjASAIaMgHDJO43`;
- deployment `dpl_DLjZRSt67DAxHhsBYprfhYeJV2h2` is `READY`, `PROMOTED` and a rollback candidate;
- exact Git source is `a552618e40791a592cb9e586b2963d61ed46ad2c`;
- `www`, apex and project aliases remain assigned without alias error;
- no new deployment was created.

Vercel domain configuration reports `misconfigured=false`, while also returning an `ipStatus=required-change` recommendation for the externally managed DNS. HTTPS, the canonical host and the apex redirect all pass live probes. DNS was not changed in this preservation-only run; the recommendation is recorded for a separate owner-authorised DNS review rather than silently altered.

## 5. Supabase preservation evidence

Connected Supabase read-only inspection confirms project status `ACTIVE_HEALTHY`. Auth, database, pooler, Realtime service, REST and Storage health endpoints all reported healthy.

Exact repeated counts:

```text
public tables                 105
RLS-enabled public tables     105
public policies               136
public functions              143
Auth users                      2
Storage objects                 0
school_data rows                1
account-claim rows              4
live claim challenges           0
live bootstrap authorisations   0
```

The migration ledger remains exactly 18 applied migrations ending at `20261026040507_fix_owner_bootstrap_pgcrypto_schema`. Runs 5–11 migrations are absent, as required. No Production query mutated a row.

## 6. School-account and admission boundaries

The Run 12 tests prove:

- `PORTAL_ACCOUNT_CLAIM_ENABLED` and `ADMISSION_TRACKING_ENABLED` are distinct exact-true gates;
- enabling/configuring the relay cannot bypass either closed caller gate;
- both closed handlers return 404 before Supabase or provider traffic;
- Stage 9 school-account claims remain on hold;
- admission-tracking OTP remains on its later, separate owner-authorised acceptance;
- one successful flow can never be presented as acceptance of the other.

No new claim, challenge, account, applicant continuation or dispatch event was created.

## 7. Signed relay acceptance without provider traffic

An ephemeral local Ed25519 key pair and mocked HTTPS endpoint prove:

- exact-true relay gating;
- HTTPS-only endpoint validation and PKCS#8 Ed25519 key enforcement;
- signed `${timestamp}.${body}` envelope verification;
- request ID/header/body correlation;
- only tenant, request/challenge IDs, WhatsApp channel, registered phone, authentication code and expiry enter the envelope;
- pupil, class, result, payment, password and message records are absent;
- provider non-acceptance fails closed;
- disabled mode returns the manual dispatcher without network access.

The local recipient fixture used the owner-approved public line ending `2487`, but the fetch was fully mocked and no message/provider request was sent. The sender line ending `6650` was not used.

Focused result:

```text
Run 12 local boundary: 10/10 tests passed
```

## 8. External hold remains truthful

Automatic relay acceptance remains blocked until all of the following occur privately and in order:

1. configure Render `APP_SECRET`;
2. permanently correct the live `PHONE_NUMBER_ID`;
3. redeploy and verify unsigned `/webhook` returns 403;
4. wait for `treasure_academy_authentication / en_US` approval;
5. perform one owner-authorised direct delivery to the number ending `2487`;
6. accept the delivery webhook evidence;
7. perform one signed relay test;
8. only then enable `PARAGON_OTP_RELAY_ENABLED=true`, retaining the manual dispatcher.

No item is marked passed merely because local cryptography works. No Meta/Render dashboard or secret was accessed in this run.

## 9. Acceptance summary

- Run 11 accepted commit pinned and present: pass.
- Local Run 12 gate/readiness/relay tests: **10/10**.
- Final uninterrupted current regression: pass, including visitor browser **1,618/1,618**, accessibility **59/59** light and **5/5** dark, and every specialised browser suite.
- Production GET-only preservation probes: **10/10**.
- Vercel promoted rollback deployment/source: confirmed read-only.
- Supabase exact preservation counts and 18-migration ledger: confirmed read-only.
- Production/provider mutation: none.
- Production release: held pending separate authorization.
- School-account claims: held pending Stage 9 acceptance.
- Admission tracking: held pending its later separate acceptance.
- Meta/Render automatic relay: external hold.
