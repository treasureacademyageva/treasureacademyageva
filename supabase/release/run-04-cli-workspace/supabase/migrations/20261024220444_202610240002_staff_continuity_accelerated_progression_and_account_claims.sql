-- RUN 4 PRODUCTION LEDGER MARKER — ALREADY APPLIED; NEVER EXECUTE.
-- Production project: biyizitalhylkwtshrqt
-- Remote migration: 20261024220444 / 202610240002_staff_continuity_accelerated_progression_and_account_claims
-- Remote statement count: 1
-- Remote SQL character count: 1201
-- Remote SQL MD5: 172089a549acc3334852fac453c831fb
-- Reviewed source: supabase/migrations/202610240002_staff_continuity_accelerated_progression_and_account_claims.sql
-- Reviewed source SHA-256: 21a89547f87120f305fbb7679152763f995ff27836becfddac7c4e65e60b4f71
--
-- The version exists only so Supabase CLI can compare the canonical remote
-- ledger before applying migrations 009 and 010. If this version is absent on
-- the selected target, fail closed instead of replaying historical SQL.

do $run4_historical_migration_guard$
begin
  raise exception 'Run 4 historical ledger marker 20261024220444 must never be applied';
end
$run4_historical_migration_guard$;
