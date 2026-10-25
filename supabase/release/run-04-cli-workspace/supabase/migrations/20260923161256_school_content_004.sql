-- RUN 4 PRODUCTION LEDGER MARKER — ALREADY APPLIED; NEVER EXECUTE.
-- Production project: biyizitalhylkwtshrqt
-- Remote migration: 20260923161256 / school_content_004
-- Remote statement count: 1
-- Remote SQL character count: 7846
-- Remote SQL MD5: 3b4f1ad05fa1a3400d6a0c8d28e1bfee
-- Reviewed source: remote_only_legacy
-- Reviewed source SHA-256: not available in the canonical migration folder
--
-- The version exists only so Supabase CLI can compare the canonical remote
-- ledger before applying migrations 009 and 010. If this version is absent on
-- the selected target, fail closed instead of replaying historical SQL.

do $run4_historical_migration_guard$
begin
  raise exception 'Run 4 historical ledger marker 20260923161256 must never be applied';
end
$run4_historical_migration_guard$;
