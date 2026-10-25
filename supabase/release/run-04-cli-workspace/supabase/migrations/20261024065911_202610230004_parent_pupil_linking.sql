-- RUN 4 PRODUCTION LEDGER MARKER — ALREADY APPLIED; NEVER EXECUTE.
-- Production project: biyizitalhylkwtshrqt
-- Remote migration: 20261024065911 / 202610230004_parent_pupil_linking
-- Remote statement count: 1
-- Remote SQL character count: 30033
-- Remote SQL MD5: 63cab7b5b30b4612b284d0b3fe2bf357
-- Reviewed source: supabase/migrations/202610230004_parent_pupil_linking.sql
-- Reviewed source SHA-256: 1e99d7fdfeea4e3f360ba71c2589944451410bc7a99386a868f8d16625d9e7b6
--
-- The version exists only so Supabase CLI can compare the canonical remote
-- ledger before applying migrations 009 and 010. If this version is absent on
-- the selected target, fail closed instead of replaying historical SQL.

do $run4_historical_migration_guard$
begin
  raise exception 'Run 4 historical ledger marker 20261024065911 must never be applied';
end
$run4_historical_migration_guard$;
