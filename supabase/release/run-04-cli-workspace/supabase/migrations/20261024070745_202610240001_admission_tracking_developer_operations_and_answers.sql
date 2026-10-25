-- RUN 4 PRODUCTION LEDGER MARKER — ALREADY APPLIED; NEVER EXECUTE.
-- Production project: biyizitalhylkwtshrqt
-- Remote migration: 20261024070745 / 202610240001_admission_tracking_developer_operations_and_answers
-- Remote statement count: 1
-- Remote SQL character count: 991
-- Remote SQL MD5: 555353eafd2300cfdb6d18a95779ba25
-- Reviewed source: supabase/migrations/202610240001_admission_tracking_developer_operations_and_answers.sql
-- Reviewed source SHA-256: 059c05755655a5b119a5415c1258ea5c5f7f467a4dac0a0efe0681cac4fd1c03
--
-- The version exists only so Supabase CLI can compare the canonical remote
-- ledger before applying migrations 009 and 010. If this version is absent on
-- the selected target, fail closed instead of replaying historical SQL.

do $run4_historical_migration_guard$
begin
  raise exception 'Run 4 historical ledger marker 20261024070745 must never be applied';
end
$run4_historical_migration_guard$;
