-- MANUAL CUT-OVER ONLY — DO NOT RUN DURING INVENTORY OR MIGRATION
--
-- Preconditions (all must be true):
-- 1. The owner has approved retirement of the legacy JSON portal.
-- 2. A verified export/backup exists outside public browser access.
-- 3. Every required legitimate record has been mapped to the secure schema.
-- 4. Parent, teacher and admin acceptance tests passed in staging.
-- 5. The secure portal is ready to become the sole source of truth.
--
-- This preserves public.school_data and its rows. It removes API access; it
-- does not drop or truncate the table.

begin;

do $$
declare
  p record;
begin
  if to_regclass('public.school_data') is null then
    raise notice 'public.school_data does not exist; nothing to retire';
    return;
  end if;

  execute 'revoke all on table public.school_data from public, anon, authenticated';
  for p in
    select policyname
    from pg_policies
    where schemaname = 'public' and tablename = 'school_data'
  loop
    execute format('drop policy if exists %I on public.school_data', p.policyname);
  end loop;

  execute 'alter table public.school_data enable row level security';
  execute 'alter table public.school_data force row level security';
  execute 'comment on table public.school_data is ''RETIRED AFTER OWNER-VERIFIED CUT-OVER: preserved as historical evidence; no anon/authenticated API access.''';
end $$;

commit;
