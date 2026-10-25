# Run 3 — Developer Bootstrap Trusted Endpoint and Private UI

**Implemented locally:** 25 October 2026
**Production status:** not deployed or applied; no real authorisation, Auth user, password or gate change
**Endpoint:** `POST /api/developer/bootstrap` through the existing `api/developer-service.mjs` multiplexer
**Default gate:** `DEVELOPER_MANUAL_BOOTSTRAP_ENABLED=false`

## Purpose

Complete the trusted application half of Jibril's one-time, owner-authorised, no-OTP Supabase bootstrap and the equivalent owner-authorised recovery path.

This run deliberately does not perform the bootstrap. It provides a dormant, fail-closed endpoint and an accessible private-password form in `developer.html`. Jibril creates his own password in the browser during a separately authorised Run 4 window; the school, owner and developer interface never display or store it.

## Function-count boundary

The new route is multiplexed through the existing `api/developer-service.mjs` Vercel Function:

```text
/api/developer/bootstrap → /api/developer-service?action=bootstrap
```

No additional file was added under `api/`, so the Vercel Function count does not increase.

## Fail-closed activation boundary

The endpoint returns `404` before parsing a request or accessing Supabase unless:

```text
DEVELOPER_MANUAL_BOOTSTRAP_ENABLED=true
```

The example and all current environments remain false. The private UI can display the temporary bootstrap form independently from normal portal sign-in, but browser-safe configuration exposes only the boolean gate state—never a Supabase secret or rate-limit secret.

Enabling the gate also requires a new independent server-only value of at least 32 characters:

```text
DEVELOPER_BOOTSTRAP_RATE_LIMIT_PEPPER
```

No real value belongs in source, chat, evidence or browser configuration.

## Request boundary

The endpoint accepts only same-origin JSON `POST` requests and enforces:

- exact origin equality;
- an 8 KiB request limit;
- a valid Nigerian phone normalized to E.164;
- a 40–100 character URL-safe owner authorisation;
- the existing 12–128 character strong-password policy;
- exact password confirmation;
- generic invalid/conflict/unavailable responses;
- no-store, no-sniff, no-referrer and restrictive response CSP headers.

It does not accept a purpose or capability set from the browser. Purpose, identity, profile and capabilities come only from the already-approved database authorisation and claim.

## Persistent privacy-safe rate limits

Run 3 adds the dormant additive migration:

`202610250002_developer_bootstrap_http_controls.sql`

It creates `developer_bootstrap_http_limits` and the service-only `server_take_developer_bootstrap_rate_limit(...)` RPC.

Controls:

- network bucket: 10 accepted requests per 15 minutes;
- network-bound phone bucket: 5 accepted requests per 15 minutes;
- the existing authorisation reservation independently locks after five matched-token/wrong-phone attempts;
- subjects are daily-rotating HMAC-SHA-256 values;
- no raw network address or phone is stored in the HTTP bucket;
- rows older than two days are deleted by the trusted rate-limit function;
- direct table access is denied to anonymous, authenticated and service roles;
- malformed, missing or untrusted network identity fails closed;
- a missing/short rate-limit pepper fails before any database request.

The phone bucket includes the same network subject, preventing an attacker from globally exhausting another person's temporary setup window. The exact owner authorisation remains the authoritative high-entropy boundary.

## Initial-password transaction

1. Validate gate, origin, schema, body size, phone and password.
2. Consume persistent network and network+phone rate buckets.
3. Hash the raw authorisation with SHA-256 in server memory.
4. Reserve the exact unexpired owner authorisation and exact approved phone through `server_reserve_developer_bootstrap`.
5. Check for an existing conflicting application profile.
6. Use trusted Supabase Auth Admin to create the phone/password user with owner-attested manual confirmation.
7. Complete the database bootstrap through `server_complete_developer_bootstrap`.
8. Consume/destroy the authorisation hash and activate only the four approved independent developer capabilities.
9. Return success without a session, password, authorisation or capability payload. Normal sign-in remains phone + password.

The database completion deliberately leaves application `phone_verified_at` null because no OTP was used. The audit reason remains `owner_authorised_supabase_bootstrap`.

## Initial-password compensation matrix

| Failure point | Safe behavior |
|---|---|
| Gate, origin, body, phone or password validation | No Supabase call |
| Persistent rate limit | `429`; no authorisation lookup or Auth call |
| Authorisation/phone mismatch, expiry, lock or replay | Generic rejection; no Auth call |
| Existing profile/Auth conflict | No new identity; release live reservation using a fixed code-free reason |
| Auth Admin create failure | No profile activation; release live reservation |
| Database completion failure after Auth creation | Hard-delete the newly created Auth identity, then release only if deletion succeeds |
| Auth deletion compensation failure | Keep reservation fail-closed; do not release for reuse; require operator review |

No catch path logs a request body, authorisation or password.

## Owner-authorised recovery transaction

1. The owner issues a distinct `password_recovery` authorisation.
2. The endpoint applies the same validation and rate limits.
3. The database reservation returns only the already-claimed developer user ID.
4. Auth Admin verifies the exact Auth user/phone and updates the password.
5. `server_complete_developer_password_recovery` consumes the authorisation, records the code-free recovery audit and deletes every former `auth.sessions` row for that user.
6. The user signs in again normally with the new password.

A recovery password cannot be compensated because the former password is deliberately unknowable. If database completion fails after Auth update, the endpoint does not release the authorisation or delete the established identity. The reservation remains fail-closed for operator review and a separately issued recovery if needed.

## Password and authorisation handling

The readable password exists only in:

- the password fields in Jibril's browser;
- the HTTPS JSON request body in transient memory;
- the trusted Auth Admin create/update call;
- Supabase Auth's password verifier.

It is never sent to a database RPC, returned in a response, placed in user-visible audit, stored in an environment variable or written to an application table. The raw owner authorisation is also never sent to a database RPC; only its SHA-256 hash is used for reservation/completion.

The endpoint never sends or verifies an OTP. It never sends any traffic to the Paragon sender/login number.

## Private UI

`developer.html` and the generated Developer Console bundle now provide:

- a labelled, keyboard-usable first-password/recovery form;
- approved phone, masked one-time authorisation, new-password and confirmation fields;
- `autocomplete="new-password"` for both password fields;
- an explicit warning never to share the password with the owner, school staff or support;
- an explicit statement that this path does not send an OTP;
- live status text;
- form reset after success;
- responsive day/dark presentation without horizontal overflow.

When normal portal sign-in is disabled but bootstrap is temporarily enabled, the page truthfully shows “Normal sign-in is closed” and only the setup form. When the portal is enabled, ordinary phone/password login remains unchanged.

The JavaScript/CSS cache key changed to `20261025-1` because these immutable assets changed.

## Automated acceptance

### Endpoint unit/security checks

`tools/tests/developer-bootstrap.test.mjs` covers 12 scenarios:

1. gate-off short circuit;
2. cross-origin rejection;
3. invalid field/password rejection;
4. rejection of a browser-supplied server-controlled purpose;
5. missing private rate-limit configuration;
6. persistent rate-limit rejection before authorisation lookup;
7. initial-password success with hash-only RPC payloads;
8. existing-profile conflict and reservation release;
9. database completion failure with Auth deletion and release;
10. Auth deletion compensation failure with fail-closed reservation;
11. recovery success on the existing identity;
12. recovery completion failure without unsafe release or identity deletion.

### Database acceptance

The rollback-safe developer policy suite additionally proves:

- direct rate-bucket reads are denied;
- the first five phone-bucket requests pass and the sixth blocks;
- only a 64-character HMAC subject, bounded count and temporary block are stored;
- successful recovery deletes every former browser session.

Accepted disposable PostgreSQL result:

- 10/10 ordered migrations;
- 5/5 rollback-safe policy suites;
- expanded read-only postflight passed;
- root `supabase-schema.sql` mirrors all ten migrations verbatim and in order.

### Application/security/browser acceptance

Accepted results:

- portal/security static suite: 87/87;
- dedicated endpoint suite: 12/12;
- browser visitor QA: 1447/1447;
- accessibility components: 59/59 light pages and 5/5 dark pages, zero serious/critical findings;
- bootstrap browser path: dark theme, mobile reflow, labelled completion, field clearing and zero serious/critical axe findings;
- secure workflows: 5/5;
- operations browser: 3/3;
- portal browser: 7/7;
- header browser: 7 scenarios;
- complete current release runner passed.

## Production preservation

Run 3 performed no production query or mutation. It did not:

- apply migration 009 or 010;
- issue an owner authorisation;
- create/update/delete a real Auth user;
- receive or set a real password;
- deploy code;
- set a production environment value;
- enable portal, developer, account-claim, admission-tracking or relay gates;
- send an OTP or provider test;
- alter or retire `school_data` or any former record.

## Run 4 activation checklist

Run 4 remains a separate owner-authorised acceptance window. Before any real bootstrap:

1. repeat the production preservation baseline;
2. apply only the reviewed additive migrations 009 and 010 under the production SQL control;
3. confirm all new tables are empty, RLS-enabled and RPC-only;
4. deploy code with `DEVELOPER_MANUAL_BOOTSTRAP_ENABLED=false`;
5. configure a private independent rate-limit pepper without exposing it;
6. verify the disabled endpoint returns `404` without Supabase access;
7. have the owner issue exactly one short-lived authorisation in the official Supabase dashboard;
8. enable the temporary gate only for the private acceptance window;
9. Jibril privately creates his password; nobody requests or records it;
10. verify one-use consumption, exact independent capabilities, normal phone/password sign-in and no false application OTP verification;
11. immediately return the gate to false and verify replay fails;
12. only then test the encrypted manual account-claim OTP queue before opening claims.

## Rollback boundary

Before any real row exists, code rollback removes the route/UI and migration rollback may remove only the empty Run 3 rate-limit table/function and restore the prior recovery function. After any authorisation, bucket or audit row exists, do not destroy evidence: disable the environment gate, roll back application routing if needed and preserve database/audit state.
