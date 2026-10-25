-- RUN 4 PRODUCTION LEDGER MARKER — ALREADY APPLIED; NEVER EXECUTE.
-- Production project: biyizitalhylkwtshrqt
-- Remote migration: 20261024065359 / 202610230001_secure_school_portal
-- Remote statement count: 1
-- Remote SQL character count: 25080
-- Remote SQL MD5: 7e08fd38d5e089296aace8b8ad2b78d7
-- Reviewed source: supabase/migrations/202610230001_secure_school_portal.sql
-- Reviewed source SHA-256: 438e554a726b5643fb2dd9077447a06b310d86f8f5e8562191f0f12907721ef5
--
-- The version exists only so Supabase CLI can compare the canonical remote
-- ledger before applying migrations 009 and 010. If this version is absent on
-- the selected target, fail closed instead of replaying historical SQL.

do $run4_historical_migration_guard$
begin
  raise exception 'Run 4 historical ledger marker 20261024065359 must never be applied';
end
$run4_historical_migration_guard$;
