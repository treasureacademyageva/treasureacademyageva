-- RUN 4 PRODUCTION LEDGER MARKER — ALREADY APPLIED; NEVER EXECUTE.
-- Production project: biyizitalhylkwtshrqt
-- Remote migration: 20261024065753 / 202610230003_staff_operations_and_requests
-- Remote statement count: 1
-- Remote SQL character count: 62152
-- Remote SQL MD5: 11aa0b2fd6dbc873386ffbdf590843d3
-- Reviewed source: supabase/migrations/202610230003_staff_operations_and_requests.sql
-- Reviewed source SHA-256: 3f448c4d9f8886a51b1e6a162cf2c6551dda4aadf6f0fc2b85da0bec4d2a6419
--
-- The version exists only so Supabase CLI can compare the canonical remote
-- ledger before applying migrations 009 and 010. If this version is absent on
-- the selected target, fail closed instead of replaying historical SQL.

do $run4_historical_migration_guard$
begin
  raise exception 'Run 4 historical ledger marker 20261024065753 must never be applied';
end
$run4_historical_migration_guard$;
