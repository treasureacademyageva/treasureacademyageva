-- RUN 4 PRODUCTION LEDGER MARKER — ALREADY APPLIED; NEVER EXECUTE.
-- Production project: biyizitalhylkwtshrqt
-- Remote migration: 20261024065523 / 202610230002_portal_accounts
-- Remote statement count: 1
-- Remote SQL character count: 33420
-- Remote SQL MD5: 2e49647c2bbbb55d7ed2a92c59441263
-- Reviewed source: supabase/migrations/202610230002_portal_accounts.sql
-- Reviewed source SHA-256: 2efa0374e790734b6a7c14b6c5b6010cb4803afbc2d51ac38e795e7fe9150ef1
--
-- The version exists only so Supabase CLI can compare the canonical remote
-- ledger before applying migrations 009 and 010. If this version is absent on
-- the selected target, fail closed instead of replaying historical SQL.

do $run4_historical_migration_guard$
begin
  raise exception 'Run 4 historical ledger marker 20261024065523 must never be applied';
end
$run4_historical_migration_guard$;
