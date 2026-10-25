-- RUN 4 PRODUCTION LEDGER MARKER — ALREADY APPLIED; NEVER EXECUTE.
-- Production project: biyizitalhylkwtshrqt
-- Remote migration: 20260919235852 / create_school_data_table
-- Remote statement count: 1
-- Remote SQL character count: 1379
-- Remote SQL MD5: 6d58dacf26cc85c1f231544c1705e830
-- Reviewed source: remote_only_legacy
-- Reviewed source SHA-256: not available in the canonical migration folder
--
-- The version exists only so Supabase CLI can compare the canonical remote
-- ledger before applying migrations 009 and 010. If this version is absent on
-- the selected target, fail closed instead of replaying historical SQL.

do $run4_historical_migration_guard$
begin
  raise exception 'Run 4 historical ledger marker 20260919235852 must never be applied';
end
$run4_historical_migration_guard$;
