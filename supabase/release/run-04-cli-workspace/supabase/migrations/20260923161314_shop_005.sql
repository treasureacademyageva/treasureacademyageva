-- RUN 4 PRODUCTION LEDGER MARKER — ALREADY APPLIED; NEVER EXECUTE.
-- Production project: biyizitalhylkwtshrqt
-- Remote migration: 20260923161314 / shop_005
-- Remote statement count: 1
-- Remote SQL character count: 5231
-- Remote SQL MD5: aa324f4913afd5fda49b49aa9af025ed
-- Reviewed source: remote_only_legacy
-- Reviewed source SHA-256: not available in the canonical migration folder
--
-- The version exists only so Supabase CLI can compare the canonical remote
-- ledger before applying migrations 009 and 010. If this version is absent on
-- the selected target, fail closed instead of replaying historical SQL.

do $run4_historical_migration_guard$
begin
  raise exception 'Run 4 historical ledger marker 20260923161314 must never be applied';
end
$run4_historical_migration_guard$;
