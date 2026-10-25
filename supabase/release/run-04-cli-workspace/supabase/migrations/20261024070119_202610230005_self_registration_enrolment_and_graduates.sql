-- RUN 4 PRODUCTION LEDGER MARKER — ALREADY APPLIED; NEVER EXECUTE.
-- Production project: biyizitalhylkwtshrqt
-- Remote migration: 20261024070119 / 202610230005_self_registration_enrolment_and_graduates
-- Remote statement count: 1
-- Remote SQL character count: 49990
-- Remote SQL MD5: 48eac7d6a4121afecf4556ba0b6871a3
-- Reviewed source: supabase/migrations/202610230005_self_registration_enrolment_and_graduates.sql
-- Reviewed source SHA-256: 1ed559ec156dc6002f920cd98743ffc56742760c99517140241df2a16d5a0ab9
--
-- The version exists only so Supabase CLI can compare the canonical remote
-- ledger before applying migrations 009 and 010. If this version is absent on
-- the selected target, fail closed instead of replaying historical SQL.

do $run4_historical_migration_guard$
begin
  raise exception 'Run 4 historical ledger marker 20261024070119 must never be applied';
end
$run4_historical_migration_guard$;
