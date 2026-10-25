-- RUN 4 PRODUCTION LEDGER MARKER — ALREADY APPLIED; NEVER EXECUTE.
-- Production project: biyizitalhylkwtshrqt
-- Remote migration: 20261024070732 / 202610230006_fees_shop_transport_and_manual_payments
-- Remote statement count: 1
-- Remote SQL character count: 993
-- Remote SQL MD5: c3047a74ac0ef8e8e3dfeb0f70cc71d9
-- Reviewed source: supabase/migrations/202610230006_fees_shop_transport_and_manual_payments.sql
-- Reviewed source SHA-256: 0d3057452b5220980b39ea6d253e708ad301ce66044243400fd35450cee7e1a9
--
-- The version exists only so Supabase CLI can compare the canonical remote
-- ledger before applying migrations 009 and 010. If this version is absent on
-- the selected target, fail closed instead of replaying historical SQL.

do $run4_historical_migration_guard$
begin
  raise exception 'Run 4 historical ledger marker 20261024070732 must never be applied';
end
$run4_historical_migration_guard$;
