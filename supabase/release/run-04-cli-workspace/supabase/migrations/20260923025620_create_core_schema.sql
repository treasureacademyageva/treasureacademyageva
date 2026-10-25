-- RUN 4 PRODUCTION LEDGER MARKER — ALREADY APPLIED; NEVER EXECUTE.
-- Production project: biyizitalhylkwtshrqt
-- Remote migration: 20260923025620 / create_core_schema
-- Remote statement count: 1
-- Remote SQL character count: 38
-- Remote SQL MD5: d617b104665ee603df8e66ca957e45df
-- Reviewed source: remote_only_legacy
-- Reviewed source SHA-256: not available in the canonical migration folder
--
-- The version exists only so Supabase CLI can compare the canonical remote
-- ledger before applying migrations 009 and 010. If this version is absent on
-- the selected target, fail closed instead of replaying historical SQL.

do $run4_historical_migration_guard$
begin
  raise exception 'Run 4 historical ledger marker 20260923025620 must never be applied';
end
$run4_historical_migration_guard$;
