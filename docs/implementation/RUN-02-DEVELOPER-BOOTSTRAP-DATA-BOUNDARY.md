# Run 2 — Owner-Authorised Developer Bootstrap Data Boundary

**Implemented locally:** 25 October 2026
**Production status:** not applied; no Auth user, authorisation, password, deployment or feature-gate change
**Migration:** `202610250001_owner_authorised_developer_bootstrap.sql`

## Purpose

Create the database half of Jibril's one-time, owner-authorised, no-OTP Supabase bootstrap so he can later operate the manual OTP dispatcher without sending an OTP from the Paragon sender to itself.

The migration is dormant. It does not issue a real authorisation, create a Supabase Auth user or activate a server endpoint.

## Authority boundary

A bootstrap is valid only for an existing owner-approved claim with this independent shape:

- ordinary base role `parent` because the current `app_role` enum has no developer role;
- leadership scope `none`;
- no class assignment;
- developer console, OTP dispatch, public-information review and system-health-read capabilities all explicitly approved;
- pending/unexpired claim for initial setup, or the same already-claimed active developer identity for recovery.

The base role does not grant pupil access: no guardian link exists, and RLS continues to require verified relationships. The bootstrap never grants school leadership, payment approval, results, admission administration, publishing authority or safeguarding access.

## New protected structures

### `developer_bootstrap_authorisations`

Stores only:

- claim reference;
- purpose (`initial_password` or `password_recovery`);
- SHA-256 hash of the one-time owner authorisation while live;
- short expiry (5–30 minutes);
- attempt count;
- active/reserved/consumed/revoked/expired/locked state;
- owner-dashboard issuance source and fixed reason code;
- reservation/consumption/revocation timestamps and references.

The raw authorisation and password have no table columns. The hash is destroyed when an authorisation is consumed, revoked, expired or locked.

A partial unique index allows at most one live authorisation per claim and purpose.

### `developer_bootstrap_events`

Records the code-free lifecycle:

- issued;
- reserved;
- failed attempt or locked;
- reservation released;
- owner-authorised initial bootstrap;
- owner-authorised recovery;
- revoked or expired.

JSON detail rejects password, secret, token, authorisation, OTP, code, phone, message and credential keys, including nested keys.

Both tables have RLS enabled and no direct grants to anonymous, authenticated or service roles. Deployed code can use only the narrowly scoped service RPCs.

## Owner-only issuance

`owner_issue_developer_bootstrap(...)`:

- can run only as the database owner through the official Supabase dashboard;
- explicitly rejects service-role callers;
- generates 32 cryptographically random bytes inside PostgreSQL;
- returns a URL-safe one-time value once;
- stores only its SHA-256 hash;
- requires the exact independent developer claim shape;
- prevents a second live authorisation for the same claim/purpose.

`owner_revoke_developer_bootstrap(...)` destroys a live hash and records a fixed owner-revoked event.

Neither owner function is executable by `anon`, `authenticated` or `service_role`.

No real owner action will occur until the trusted endpoint/UI is complete, tested and deployed with its gate false.

## Trusted-server transaction boundary

Run 3 will use these service-only functions:

1. `server_reserve_developer_bootstrap` — exact hash + exact registered phone; five-attempt lock; five-minute serialization; returns only the approved claim/capability payload.
2. Supabase Auth Admin creates the phone/password identity or changes its password. The password exists only in the HTTPS request and Supabase Auth call; application logs and database RPC payloads must omit it.
3. `server_complete_developer_bootstrap` — consumes initial authority, activates the profile and exact developer capabilities, and records `owner_authorised_supabase_bootstrap` without claiming OTP verification.
4. `server_complete_developer_password_recovery` — consumes a separate recovery authority for the already-claimed developer identity.
5. `server_release_developer_bootstrap` — after a failed Auth operation, releases a still-live reservation using one of two fixed non-secret reason codes. If Auth creation succeeded but database completion failed, Run 3 must delete that newly created Auth user before releasing the reservation.

Completion deliberately keeps `phone_verified_at` null in the application profile because no OTP was used. The separate audit reason records owner-attested manual bootstrap.

## Duplicate and race prevention

- one live row per claim/purpose;
- row locks in issue, reserve and complete functions;
- active → reserved before Auth Admin work;
- a second request cannot reserve during the five-minute transaction window;
- stale reservations can return to active with an audit event;
- consumed/revoked/expired/locked states have no reusable hash;
- the existing profile phone uniqueness constraint blocks duplicate identities;
- Run 3 must also query Auth Admin for an existing conflicting phone before creation.

## Automated acceptance

`developer_bootstrap_policy.test.sql` proves in a rolled-back disposable database:

- service role cannot issue owner authority;
- raw one-time value is not stored;
- ordinary/service callers cannot enumerate tables;
- wrong phone increments a code-free attempt;
- exact match reserves once;
- concurrent/replayed reservation fails;
- initial completion grants only the approved independent capabilities;
- no false OTP verification is recorded;
- the claim and authorisation are consumed once;
- completion replay fails;
- recovery binds to the same existing identity;
- five mismatches lock and destroy the hash;
- leadership-shaped claims cannot use this path;
- nested credential keys are rejected from audit.

Accepted local results:

- 9/9 ordered migrations;
- 5/5 rollback-safe SQL policy suites;
- read-only postflight passed;
- portal/security static suite 85/85 after adding bootstrap architecture assertions;
- root `supabase-schema.sql` mirror regenerated from all nine migrations.

## Production preservation

This migration contains no `INSERT` for real claims, no Auth call and no update/delete/drop/truncate of `school_data` or other former data. Before any future production application:

1. compare all Run 1 exact non-zero counts;
2. apply only this named additive migration;
3. verify both new tables exist, have RLS and have zero rows;
4. verify owner-only functions are unavailable to service/anonymous/authenticated roles;
5. verify service functions are executable only by service role;
6. rerun the expanded read-only postflight;
7. compare all former counts again;
8. leave endpoint and environment gate absent/off until Run 3 acceptance.

## Rollback boundary

Before any real authorisation exists, rollback may remove only the two new empty tables, their indexes/trigger and six new functions. After any authorisation/event exists, destructive rollback is prohibited; disable the server gate and preserve audit state instead.
