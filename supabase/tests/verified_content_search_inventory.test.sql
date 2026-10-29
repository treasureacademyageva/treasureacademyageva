-- Treasure Academy Run 10 verified migration, Search/core-slot and inventory test.
-- Disposable local/staging database only; every fictional row rolls back.
begin;

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin
  if not coalesce(ok,false) then raise exception 'RUN 10 POLICY TEST FAILED: %',message; end if;
end $$;
create or replace function pg_temp.assert_throws(statement text,message text)
returns void language plpgsql as $$ begin
  begin execute statement; exception when others then return; end;
  raise exception 'RUN 10 POLICY TEST FAILED (expected error): %',message;
end $$;

insert into auth.users(id,phone,raw_user_meta_data) values
 ('1a000000-0000-4000-8000-000000000001','+2348000001001','{"full_name":"Fictional Proprietress"}'),
 ('1a000000-0000-4000-8000-000000000002','+2348000001002','{"full_name":"Fictional Headmistress"}'),
 ('1a000000-0000-4000-8000-000000000003','+2348000001003','{"full_name":"Fictional Assistant Headmistress"}'),
 ('1a000000-0000-4000-8000-000000000004','+2348000001004','{"full_name":"Fictional Editor"}'),
 ('1a000000-0000-4000-8000-000000000005','+2348000001005','{"full_name":"Fictional Parent"}');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update public.profiles set account_status='active',must_change_password=false,active=true,phone_e164=phone
where id::text like '1a000000-0000-4000-8000-%';
update public.profiles set role='admin',leadership_scope='headmistress',position_title='Proprietress'
where id='1a000000-0000-4000-8000-000000000001';
update public.profiles set role='admin',leadership_scope='headmistress',position_title='Headmistress'
where id='1a000000-0000-4000-8000-000000000002';
update public.profiles set role='admin',leadership_scope='assistant_headmistress',position_title='Assistant Headmistress'
where id='1a000000-0000-4000-8000-000000000003';
update public.profiles set role='teacher' where id='1a000000-0000-4000-8000-000000000004';
update public.profiles set role='parent' where id='1a000000-0000-4000-8000-000000000005';
reset role;

-- Public roles receive fixed current projections only, never migration/private/rate data.
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_throws('select * from public.verified_public_information','Anonymous must not read operational base columns');
select pg_temp.assert_throws('select * from public.public_content_migration_candidates','Anonymous must not read held source documents');
select pg_temp.assert_throws('select * from public.public_search_documents','Anonymous must not enumerate the internal Search projection');
select pg_temp.assert_throws('select * from public.public_inventory_availability','Anonymous must not bypass the inventory release gate');
select pg_temp.assert_throws($$select * from public.public_search_published_content('fictional',10,true)$$,'Anonymous must not execute server-only Search');
select pg_temp.assert_true(has_table_privilege('anon','public.public_verified_information','select'),'Anonymous may read the fixed current-information projection');
select pg_temp.assert_true(has_table_privilege('anon','public.public_cms_published_core_slots','select'),'Anonymous may read effective fixed core slots');

-- Proprietress grants the fictional editor drafting authority.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_set_capabilities('1a000000-0000-4000-8000-000000000004',true,false,false,false,false,'Fictional Run 10 editor grant',false);

-- A text-only, source-hashed candidate is staged; media-bearing imports fail closed.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table run10_candidate as
select public.cms_stage_content_candidate(
  'repository_html/run10-fixture','repository_html','/fictional-run10-source.html',repeat('a',64),
  'page','fictional-run-ten-page',
  jsonb_build_object(
    'title','Fictional Run Ten Verified Page',
    'summary','A source-hashed fictional page used only for rollback-safe migration acceptance.',
    'classification','public','source_note','Fictional repository fixture.','next_review_date','2099-12-31',
    'seo_title','Fictional Run Ten Verified Page','seo_description','A fictional verified content migration fixture used for local policy acceptance only.',
    'search_keywords',jsonb_build_array('fictional','verified','migration'),
    'search_terms',jsonb_build_array('run ten fixture'),
    'blocks',jsonb_build_array(
      jsonb_build_object('type','heading','payload',jsonb_build_object('text','Verified fictional guidance','level','2')),
      jsonb_build_object('type','paragraph','payload',jsonb_build_object('text','This source-verified fictional body contains no real pupil, payment or safeguarding information.'))
    )
  ),true,'Stage a fictional source-hashed text candidate'
) as id;
grant select on run10_candidate to anon,authenticated,service_role;
select pg_temp.assert_true((select status='held' and historical_child_media_held from public.public_content_migration_candidates where id=(select id from run10_candidate)),'Candidate must start held with historical media excluded');
select pg_temp.assert_throws($sql$
  select public.cms_stage_content_candidate(
    'repository_html/run10-media','repository_html','/fictional-media.html',repeat('b',64),'page','fictional-media-page',
    jsonb_build_object('title','Fictional Media Page','summary','A rejected media-bearing fictional migration candidate.',
      'blocks',jsonb_build_array(jsonb_build_object('type','image','payload',jsonb_build_object('asset_id','1a000000-0000-4000-8000-000000000099','decorative',true))),
      'media',jsonb_build_array(jsonb_build_object('asset_id','1a000000-0000-4000-8000-000000000099','placement','body','position',0))),
    true,'This media candidate must remain held')
$sql$,'Migration staging must reject media-bearing documents');

-- Only publishing authority verifies; verification does not publish or import.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws($$select public.cms_verify_content_candidate((select id from run10_candidate),'verified','Parent verification must fail')$$,'Parent must not verify migration content');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_verify_content_candidate((select id from run10_candidate),'verified','Fictional source fields reviewed independently');
select pg_temp.assert_true((select status='verified' and imported_entry_id is null from public.public_content_migration_candidates where id=(select id from run10_candidate)),'Verification alone must not import or publish');

-- Editor imports the accepted source into an ordinary draft, then the normal
-- independent factual/publication approval lifecycle remains mandatory.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table run10_entry as
select public.cms_import_verified_candidate((select id from run10_candidate),'Import verified fictional text as a draft') as id;
grant select on run10_entry to anon,authenticated,service_role;
select pg_temp.assert_true((select workflow_status='draft' and published_revision_id is null from public.public_content_entries where id=(select id from run10_entry)),'Verified import must still begin as an unpublished draft');
select pg_temp.assert_true((select count(*)=1 from public.public_content_revision_sources where candidate_id=(select id from run10_candidate)),'Imported revision must retain the exact source hash link');
select public.cms_submit_for_review((select id from run10_entry),'Fictional imported page ready for review');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_record_approval((select id from run10_entry),'factual','approved','Fictional source and wording match');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_record_approval((select id from run10_entry),'publication','approved','Fictional page accepted for public projection');
select public.cms_publish((select id from run10_entry),'Publish fictional Run 10 page');
select public.cms_set_core_page_slot(null,'/about','guidance',0,(select id from run10_entry),true,null,null,'Place reviewed fictional guidance on the About page');
select pg_temp.assert_true((select count(*)=1 from public.public_core_page_slot_events where page_path='/about'),'Core placement must be audit-recorded');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true((select count(*)=1 from public.public_cms_published_core_slots where page_path='/about' and canonical_path='/fictional-run-ten-page'),'Effective core slot must expose only published CMS fields');

-- Current verified information needs source/owner/review fields; stale facts stop
-- appearing automatically without deleting their audit/history.
reset role;
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_throws($sql$
  insert into public.verified_public_information(topic,title,summary,status,revision,created_by)
  values('calendar','Incomplete fictional fact','Missing source fields must block publication.','published','TA-INFO-20991230-R10BAD','1a000000-0000-4000-8000-000000000003')
$sql$,'Published operational facts require source, owner and review controls');
insert into public.verified_public_information(
  topic,title,summary,detail,status,revision,effective_from,effective_until,
  source_path,source_note,accountable_owner,next_review_date,created_by,published_by,published_at,reviewed_at
) values (
  'calendar','Current fictional calendar guidance','A source-backed fictional direct answer for local Search.',
  'No real date or pupil information is included.','published','TA-INFO-20991230-R10CUR',current_date-1,current_date+30,
  '/calendar','Fictional office-approved calendar source.','School leadership',current_date+30,
  '1a000000-0000-4000-8000-000000000003','1a000000-0000-4000-8000-000000000003',now(),now()
);
select pg_temp.assert_true((select count(*)=1 from public.public_verified_information where revision='TA-INFO-20991230-R10CUR'),'Current verified fact must enter the fixed public projection');
update public.verified_public_information set status='archived' where revision='TA-INFO-20991230-R10CUR';
select pg_temp.assert_true((select count(*)=0 from public.public_verified_information where revision='TA-INFO-20991230-R10CUR'),'Archived fact must leave the public projection without deletion');

-- Only reconciled office catalogue rows enter safe availability, with no actor,
-- movement or exact private balance exposed.
reset role;
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
insert into public.shop_products(id,product_code,name,description,category,active,reconciled,created_by)
values('1a000000-0000-4000-8000-000000000101','R10_BOOK','Fictional Practice Book','Local acceptance fixture only.','books',true,true,'1a000000-0000-4000-8000-000000000001');
insert into public.shop_variants(id,product_id,sku,variant_label,unit_price,on_hand,reserved,damaged,low_stock_threshold,active,reconciled)
values('1a000000-0000-4000-8000-000000000102','1a000000-0000-4000-8000-000000000101','R10_BOOK_ONE','One fictional copy',100,3,1,1,1,true,true);
select pg_temp.assert_true((select availability='low_stock' and may_request from public.public_inventory_availability where sku='R10_BOOK_ONE'),'Available quantity must be on hand minus reserved minus damaged');
update public.shop_products set active=false where id='1a000000-0000-4000-8000-000000000101';
select pg_temp.assert_true((select availability='not_currently_offered' and not may_request from public.public_inventory_availability where sku='R10_BOOK_ONE'),'An inactive product must never invite a public request');
update public.shop_products set active=true where id='1a000000-0000-4000-8000-000000000101';
update public.shop_variants set active=false where id='1a000000-0000-4000-8000-000000000102';
select pg_temp.assert_true((select availability='temporarily_unavailable' and not may_request from public.public_inventory_availability where sku='R10_BOOK_ONE'),'An inactive variant must never invite a public request');
update public.shop_variants set active=true where id='1a000000-0000-4000-8000-000000000102';
select pg_temp.assert_throws($sql$
  insert into public.shop_variants(product_id,sku,variant_label,on_hand,reserved,damaged,active,reconciled)
  values('1a000000-0000-4000-8000-000000000101','R10_NEGATIVE','Invalid balance',1,1,1,true,true)
$sql$,'Inventory constraint must prevent negative sellable quantity');
select pg_temp.assert_true(not exists(
  select 1 from information_schema.columns where table_schema='public' and table_name='public_inventory_availability'
  and column_name in ('on_hand','reserved','damaged','created_by','actor_id')
),'Public inventory projection must omit private balances and actors');

-- Search is service-only, weighted, excludes itself and can independently omit inventory.
select pg_temp.assert_true((select count(*)>=1 from public.public_search_published_content('fictional verified migration',10,false) where kind='page' and url='/about'),'Published CMS text must enter Search only through its fixed public surface');
select pg_temp.assert_true((select count(*)=0 from public.public_search_published_content('fictional practice book',10,false) where kind='inventory'),'Inventory gate false must omit inventory Search rows');
select pg_temp.assert_true((select count(*)=1 from public.public_search_published_content('fictional practice book',10,true) where kind='inventory' and url='/shop'),'Inventory gate true may include only reconciled projection rows');
select pg_temp.assert_true((select count(*)=0 from public.public_search_documents where url in ('/search','/search')),'Search must never index itself');

select pg_temp.assert_true((select allowed from public.public_take_search_rate_limit(repeat('c',64))),'First privacy-safe search bucket request must pass');
update public.public_search_rate_buckets set request_count=1000 where bucket_hash=repeat('c',64);
select pg_temp.assert_true(not (select allowed from public.public_take_search_rate_limit(repeat('c',64)))
  and (select request_count=1000 from public.public_search_rate_buckets where bucket_hash=repeat('c',64)),
  'A saturated bucket must stay bounded and return rate-limited instead of failing its constraint');
insert into public.public_search_rate_buckets(bucket_hash,request_count,expires_at) values(repeat('d',64),1,now()-interval '1 second');
select public.public_take_search_rate_limit(repeat('e',64));
select pg_temp.assert_true(not exists(select 1 from public.public_search_rate_buckets where bucket_hash=repeat('d',64)),
  'Expired HMAC buckets must be removed on the next Search request');
select public.public_record_search_outcome('other',false);
select pg_temp.assert_true((select search_count=1 and zero_result_count=0 from public.public_search_insights_daily where family='other'),'Search insight must store aggregate topic outcome only');
select pg_temp.assert_true(not exists(
  select 1 from information_schema.columns where table_schema='public' and table_name in ('public_search_rate_buckets','public_search_insights_daily')
  and column_name in ('query','raw_query','ip','ip_address','user_agent','actor_id','profile_id')
),'Search analytics must have no raw query, full-IP, user-agent or actor column');

-- Review reminders are private; event/source history is immutable.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','1a000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true((select count(*)>=0 from public.cms_content_review_queue()),'Authorised leadership may read the stale-content review queue');
reset role;
reset session authorization;
select pg_temp.assert_throws($$update public.public_content_migration_events set reason='forged history' where candidate_id=(select id from run10_candidate)$$,'Migration audit must be immutable');
select pg_temp.assert_throws($$delete from public.public_core_page_slot_events where entry_id=(select id from run10_entry)$$,'Core placement audit must be immutable');
select pg_temp.assert_throws($$delete from public.verified_public_information where revision='TA-INFO-20991230-R10CUR'$$,'Verified information must be preserved rather than hard-deleted');

rollback;
