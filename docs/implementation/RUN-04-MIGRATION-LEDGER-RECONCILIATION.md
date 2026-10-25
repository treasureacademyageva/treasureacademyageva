# Run 4 — Production Migration-Ledger Reconciliation

**Prepared:** 25 October 2026
**Project:** `biyizitalhylkwtshrqt`
**Scope:** source/read-only preparation only
**Production mutation:** none

## Problem

Supabase CLI compares the numeric version prefix of local migration filenames with `supabase_migrations.schema_migrations.version`; matching descriptive names are not enough.

The read-only production inventory found:

- 15 remote migration-history versions;
- seven remote-only legacy versions;
- eight already-applied application migrations whose provider-generated remote versions differ from their canonical repository versions;
- two genuinely pending bootstrap migrations.

Running `db push` from the canonical migration folder could therefore reject the remote-only history or treat already-applied SQL as unmatched.

## Resolution

A dedicated, fail-closed production migration-control workspace now exists at:

`supabase/release/run-04-cli-workspace/`

It is generated from:

`supabase/release/20261025_RUN4_PRODUCTION_MIGRATION_LEDGER.json`

by:

`tools/build-run4-migration-bridge.py`

The bridge contains:

- 15 historical files using the exact remote production versions;
- each historical file is a ledger marker that raises an exception if a target ever attempts to execute it;
- exact byte-for-byte copies of pending migrations 009 and 010;
- no seed;
- no history-repair command;
- no production credential or secret.

The workspace is restricted to linked `migration list`, `db push --dry-run` and the final approved `db push`. It must never be used for reset, pull, diff, seed, `--include-all`, history repair or another project.

## Source identity proof

For applied application migrations 001–005, the production ledger SQL MD5 equals the canonical local SQL MD5 after removing only the final newline.

For applied migrations 006–008, the production history records the reviewed loader statements. Each loader pinned the exact canonical source SHA-256 and UTF-8 byte length before execution. Those source identities still match the repository.

The seven older legacy versions are preserved as production-ledger metadata and fail-closed markers; they are never replayed.

Pending migration contents did not change. Their filenames were extended to the current 14-digit UTC-compatible format:

- `20261025000100_owner_authorised_developer_bootstrap.sql`;
- `20261025000200_developer_bootstrap_http_controls.sql`.

Their unchanged SHA-256 values are:

- 009: `b78ec9556b033960f0bb6087ad07b32b7f8393f1183b142b62148e3e4067f571`;
- 010: `64ceb97c3a0b41a4a09c08d40cbae7b82f719fdfab5c62d7906f46fa8755faaf`.

## Automated acceptance

Passed after reconciliation:

- bridge generation: 15 historical markers + 2 exact pending migrations;
- bridge unit test: 1/1;
- SQL reconstruction: 10/10 migrations;
- SQL policy suites: 5/5;
- read-only local postflight: pass;
- portal/security: 87/87;
- developer-bootstrap endpoint: 12/12;
- production static audit: 16/16;
- visitor UX: 45/45;
- verified answers: 10/10;
- chatbot safety: 11/11;
- answer coverage: 20/20;
- Visitor Browser QA: 1447/1447;
- accessibility: 59/59 light and 5/5 dark with no serious/critical automated finding;
- secure-workflow browser: 5/5;
- operations browser: 3/3;
- portal browser: 7/7;
- header browser: 7/7.

The first full browser run stopped because the disposable workspace no longer had its Playwright browser binary. After installing the required Chromium runtime, the complete current release runner passed. This was an environment prerequisite, not an application failure.

## Remaining live gate

This reconciliation does not apply production SQL. During the separately approved production window:

1. compare a fresh remote migration list with the manifest;
2. link only to project `biyizitalhylkwtshrqt` through a private credential path;
3. run the bridge dry-run;
4. stop unless only migrations 009 and 010 are pending in order;
5. apply only those two exact migrations;
6. immediately verify remote history, RLS, grants, empty new tables and all preservation counts.

No push, deployment, Auth setting, owner authorisation, Auth user, OTP, password, secret or feature gate was changed while preparing this reconciliation.
