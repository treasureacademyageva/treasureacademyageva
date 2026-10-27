begin;

create or replace function pg_temp.assert_true(ok boolean,message text) returns void language plpgsql as $$
begin if coalesce(ok,false) is not true then raise exception 'RUN 11 SQL TEST FAILED: %',message; end if; end $$;

select pg_temp.assert_true(
  pg_get_constraintdef(c.oid) like '%/about%' and pg_get_constraintdef(c.oid) not like '%.html%',
  'Core-slot page constraint must accept clean paths only'
) from pg_constraint c
join pg_class t on t.oid=c.conrelid
join pg_namespace n on n.oid=t.relnamespace
where n.nspname='public' and t.relname='public_core_page_slots' and c.conname='public_core_page_slots_page_path_check';

select pg_temp.assert_true(
  pg_get_functiondef('public.cms_set_core_page_slot(uuid,text,text,integer,uuid,boolean,timestamp with time zone,timestamp with time zone,text)'::regprocedure) like '%/request-centre%'
  and pg_get_functiondef('public.cms_set_core_page_slot(uuid,text,text,integer,uuid,boolean,timestamp with time zone,timestamp with time zone,text)'::regprocedure) not like '%.html%',
  'Core-slot mutation must enforce the same clean route registry'
);

select pg_temp.assert_true(
  proconfig @> array['search_path=""']::text[],
  'Replaced core-slot definer must keep an empty search path'
) from pg_proc where oid='public.cms_set_core_page_slot(uuid,text,text,integer,uuid,boolean,timestamp with time zone,timestamp with time zone,text)'::regprocedure;

select pg_temp.assert_true(
  not has_function_privilege('anon','public.cms_set_core_page_slot(uuid,text,text,integer,uuid,boolean,timestamp with time zone,timestamp with time zone,text)','execute')
  and has_function_privilege('authenticated','public.cms_set_core_page_slot(uuid,text,text,integer,uuid,boolean,timestamp with time zone,timestamp with time zone,text)','execute'),
  'Clean-route slot mutation must remain authenticated-only'
);

select pg_temp.assert_true(
  pg_get_viewdef('public.public_search_documents'::regclass,true) like '%/shop%'
  and pg_get_viewdef('public.public_search_documents'::regclass,true) not like '%.html%',
  'Database Search projection must emit canonical clean destinations'
);

rollback;
