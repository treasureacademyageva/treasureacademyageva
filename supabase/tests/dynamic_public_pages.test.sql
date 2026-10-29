-- Treasure Academy controlled dynamic public Page surfaces.
-- Disposable local/staging database only; no content is published.
begin;

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin
  if not coalesce(ok,false) then raise exception 'DYNAMIC PAGE POLICY TEST FAILED: %',message; end if;
end $$;
create or replace function pg_temp.assert_throws(statement text,message text)
returns void language plpgsql as $$ begin
  begin execute statement; exception when others then return; end;
  raise exception 'DYNAMIC PAGE POLICY TEST FAILED (expected error): %',message;
end $$;

select pg_temp.assert_true(to_regclass('public.public_page_surfaces') is not null,'Page surface table must exist');
select pg_temp.assert_true(to_regclass('public.public_page_surface_events') is not null,'Page surface audit must exist');
select pg_temp.assert_true(to_regclass('public.public_cms_published_page_surfaces') is not null,'Published-only Page surface view must exist');
set local role service_role;
select pg_temp.assert_true(public.cms_page_surface_mode('/about')='replace','Ordinary information pages use editorial replacement');
select pg_temp.assert_true(public.cms_page_surface_mode('/admissions')='supplement','Admission controls retain the fixed safety shell');
select pg_temp.assert_true(public.cms_page_surface_mode('/portal/login.html') is null,'Portal routes must never be editable public surfaces');
select pg_temp.assert_true(public.cms_page_surface_mode('/developer.html') is null,'Developer routes must never be editable public surfaces');
reset role;
select pg_temp.assert_true(has_table_privilege('anon','public.public_cms_published_page_surfaces','select'),'Anonymous visitors may read only the published projection');
select pg_temp.assert_true(not has_table_privilege('anon','public.public_page_surfaces','select'),'Anonymous visitors must not read private binding rows');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.public_page_surfaces','insert'),'Authenticated users cannot bypass the publishing RPC');
select pg_temp.assert_true(has_function_privilege('authenticated','public.cms_set_page_surface(uuid,text,uuid,boolean,timestamp with time zone,timestamp with time zone,text)','execute'),'Authenticated callers may reach the capability-enforcing binding RPC');

set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_throws('select * from public.public_page_surfaces','Anonymous visitors cannot enumerate private Page bindings');
select pg_temp.assert_throws($$select public.cms_set_page_surface(null,'/about','00000000-0000-4000-8000-000000000001',true,null,null,'Anonymous publication must fail')$$,'Anonymous visitors cannot bind a Page');

rollback;
