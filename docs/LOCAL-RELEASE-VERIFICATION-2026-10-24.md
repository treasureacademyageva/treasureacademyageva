# Local release verification — 24 October 2026

**Status:** locally verified; staging and production remain blocked pending separate owner authorisation.

## Resolved during final re-audit

- Bound OTP delivery encryption/decryption to the actual challenge UUID and added a dynamic round-trip/rebinding rejection test.
- Confirmed a capability-restricted developer receives no protected category payload and causes no OTP/request/public-information category query, in both server integration and browser scenarios.
- Excluded all protected portal/developer pages and bundles from service-worker caching and renewed cache/asset versions.
- Made mutation success feedback survive the portal’s post-save data refresh; the previously timing-dependent admission browser test now passes repeatedly.
- Added a read-only post-migration verification script for expected objects, RLS, grants, server-function privileges, OTP/publication invariants, sensitive audit keys and critical indexes.
- Added the exact 12-file staging SQL manifest, SHA-256 values, stop conditions, evidence contract and production-prohibited SQL-agent prompt at `supabase/release/20261024_SQL_AGENT_HANDOFF.md`.
- Reconciled current documentation to seven migrations and the maintained release runners.

## Final local evidence

- `npm run test:all-current`: passed.
  - production audit: **16/16**
  - Visitor UX: **45/45**
  - verified answers: **10/10**
  - portal/security: **81/81**
  - chatbot safety: **11/11**
  - current answer coverage: **20/20**
  - encrypted Review gateway: **5 passed, 1 optional passphrase-bearing test skipped**
  - Visitor Browser QA: **1422/1422** across 56 pages and three viewports
  - accessibility: **58/58 light** and **5/5 dark**, no serious/critical automated findings
  - secure workflows: **4/4**
  - operations browser: **3/3**
  - portal browser: **7/7**
  - header browser: **7 scenarios**
- Portal browser’s formerly timing-dependent path also passed **three consecutive focused runs** after the feedback fix.
- `npm run test:sql-local`: **7/7 migrations**, **3/3 rollback-safe policy suites** and the read-only postflight passed on a clean process-specific PostgreSQL 17 database.
- `npm audit --json`: **0** info, low, moderate, high or critical vulnerabilities across 84 dependencies.
- Deterministic rebuild: `npm run build:content` plus `npm run build:schema` changed no workspace file content; the root schema contains all seven migrations in exact order.
- `git diff --check`, JavaScript syntax, Python syntax, shell syntax, 43 JSON files, Vercel JSON and protected-route artifact checks passed.
- Credential-shape scan found no private-key marker or live-looking Supabase/JWT credential; `.env.example` was the only credential-shaped filename.

## Boundaries retained

No commit, push, deployment, production SQL, private-data import, Auth/account bootstrap, developer-capability grant, feature-gate activation, Monnify activation or legacy retirement occurred. Production remains at the previously deployed revision. The local recovery stash remains available. Local PostgreSQL 17 and test HTTP services were stopped after verification.

Automated checks reduce risk but do not replace disposable Supabase staging, manual accessibility/usability review, owner data validation, backup/restore rehearsal or a separately authorised production change window.
