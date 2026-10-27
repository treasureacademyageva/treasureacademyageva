-- Treasure Academy Run 9 public engagement, moderation and placement integration test.
-- Disposable local/staging database only; every fictional row rolls back.
begin;

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin
  if not coalesce(ok,false) then raise exception 'PUBLIC ENGAGEMENT TEST FAILED: %',message; end if;
end $$;
create or replace function pg_temp.assert_throws(statement text,message text)
returns void language plpgsql as $$ begin
  begin execute statement; exception when others then return; end;
  raise exception 'PUBLIC ENGAGEMENT TEST FAILED (expected error): %',message;
end $$;

insert into auth.users(id,phone,raw_user_meta_data) values
 ('19000000-0000-4000-8000-000000000001','+2348000000901','{"full_name":"Fictional Proprietress"}'),
 ('19000000-0000-4000-8000-000000000002','+2348000000902','{"full_name":"Fictional Headmistress"}'),
 ('19000000-0000-4000-8000-000000000003','+2348000000903','{"full_name":"Fictional Assistant Headmistress"}'),
 ('19000000-0000-4000-8000-000000000004','+2348000000904','{"full_name":"Fictional Editor"}'),
 ('19000000-0000-4000-8000-000000000005','+2348000000905','{"full_name":"Fictional Parent One"}'),
 ('19000000-0000-4000-8000-000000000006','+2348000000906','{"full_name":"Fictional Parent Two"}'),
 ('19000000-0000-4000-8000-000000000007','+2348000000907','{"full_name":"Fictional Pupil"}'),
 ('19000000-0000-4000-8000-000000000008','+2348000000908','{"full_name":"Fictional Suspended Parent"}');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update public.profiles set account_status='active',must_change_password=false,active=true,phone_e164=phone
where id::text like '19000000-0000-4000-8000-%';
update public.profiles set role='admin',leadership_scope='headmistress',position_title='Proprietress'
where id='19000000-0000-4000-8000-000000000001';
update public.profiles set role='admin',leadership_scope='headmistress',position_title='Headmistress'
where id='19000000-0000-4000-8000-000000000002';
update public.profiles set role='admin',leadership_scope='assistant_headmistress',position_title='Assistant Headmistress'
where id='19000000-0000-4000-8000-000000000003';
update public.profiles set role='teacher' where id='19000000-0000-4000-8000-000000000004';
update public.profiles set role='parent' where id in ('19000000-0000-4000-8000-000000000005','19000000-0000-4000-8000-000000000006','19000000-0000-4000-8000-000000000008');
update public.profiles set role='parent',must_change_password=true where id='19000000-0000-4000-8000-000000000007';
update public.profiles set account_status='suspended',active=false where id='19000000-0000-4000-8000-000000000008';
reset role;

-- Engagement base tables stay inaccessible. Public roles receive only fixed
-- aggregate/comment projections and constrained functions.
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_throws('select * from public.public_content_views_daily','Anonymous must not read raw daily aggregates');
select pg_temp.assert_throws('select * from public.public_content_reactions','Anonymous must not read reaction actors');
select pg_temp.assert_throws('select * from public.public_content_comments','Anonymous must not read comment actors or moderation fields');
select pg_temp.assert_throws('select * from public.public_content_view_receipts','Anonymous must not read deduplication receipts');
select pg_temp.assert_throws($$select * from public.public_submit_content_comment('19000000-0000-4000-8000-000000000099','Anonymous comment')$$,'Anonymous comment RPC must not be executable');
select pg_temp.assert_true(has_table_privilege('anon','public.public_cms_engagement_totals','select'),'Anonymous may read only fixed public engagement totals');
select pg_temp.assert_true(has_table_privilege('anon','public.public_cms_approved_comments','select'),'Anonymous may read only approved role-safe comments');

-- Proprietress grants draft capability without changing the editor's school role.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_set_capabilities('19000000-0000-4000-8000-000000000004',true,false,false,false,false,'Fictional Run 9 editor grant',false);

-- Build and publish one fictional article through the accepted CMS lifecycle.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table run9_entry as
select public.cms_create_entry(
  'news','fictional-run-nine-engagement',
  jsonb_build_object(
    'title','Fictional Run Nine Engagement',
    'summary','A reviewed fictional article used only for rollback-safe engagement tests.',
    'classification','public','source_note','Fictional local policy fixture.','next_review_date','2099-12-31',
    'seo_title','Fictional Run Nine Engagement','seo_description','A fictional public engagement policy fixture for local database verification.',
    'blocks',jsonb_build_array(jsonb_build_object('type','paragraph','payload',jsonb_build_object('text','This fictional body contains no real school or pupil information.')))
  ),
  'Initial fictional Run 9 fixture'
) as id;
grant select on run9_entry to anon,authenticated,service_role;
select public.cms_submit_for_review((select id from run9_entry),'Fictional article ready for independent review');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true(public.cms_current_actor_can('comment_moderate'),'Headmistress must have leadership moderation authority');
select public.cms_record_approval((select id from run9_entry),'factual','approved','Fictional facts independently reviewed');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true(public.cms_current_actor_can('comment_moderate'),'Assistant Headmistress must have leadership moderation authority');
select public.cms_record_approval((select id from run9_entry),'publication','approved','Fictional publication accepted');
select public.cms_publish((select id from run9_entry),'Publish fictional Run 9 fixture');

-- Server-only view recording deduplicates one rotating receipt and retains no IP.
reset role;
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_true((select recorded from public.public_record_content_view((select id from run9_entry),repeat('a',64))),'First daily receipt must increment');
select pg_temp.assert_true(not (select recorded from public.public_record_content_view((select id from run9_entry),repeat('a',64))),'Repeated receipt must not increment');
select pg_temp.assert_true((select recorded from public.public_record_content_view((select id from run9_entry),repeat('b',64))),'Distinct daily receipt must increment');
select pg_temp.assert_true((select view_count=2 from public.public_get_content_engagement((select id from run9_entry))),'Two distinct receipts must produce exactly two aggregate views');
select pg_temp.assert_throws($$select * from public.public_record_content_view((select id from run9_entry),'192.0.2.20')$$,'Raw/non-HMAC receipt must be rejected');
insert into public.public_content_view_receipts(entry_id,viewed_on,viewer_hash)
values((select id from run9_entry),(now() at time zone 'Africa/Lagos')::date-40,repeat('c',64));
select public.public_record_content_view((select id from run9_entry),repeat('d',64));
select pg_temp.assert_true((select count(*)=0 from public.public_content_view_receipts where viewed_on<(now() at time zone 'Africa/Lagos')::date-31),'Old view receipts must be removed while aggregates remain');

-- Active parents can add or remove one like; pupil/suspended accounts cannot.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.public_toggle_content_like((select id from run9_entry),true);
select public.public_toggle_content_like((select id from run9_entry),true);
select pg_temp.assert_true((select like_count=1 and liked from public.public_get_content_engagement((select id from run9_entry))),'Repeated like must remain one and report the actor liked state');
select pg_temp.assert_throws('select * from public.public_content_reactions','Parent must not enumerate reaction actors');
select public.public_toggle_content_like((select id from run9_entry),false);
select pg_temp.assert_true((select like_count=0 and not liked from public.public_get_content_engagement((select id from run9_entry))),'Like must be removable');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000007',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws($$select * from public.public_toggle_content_like((select id from run9_entry),true)$$,'Account awaiting password change must not like public content');
select pg_temp.assert_throws($$select * from public.public_submit_content_comment((select id from run9_entry),'Unready account comment')$$,'Account awaiting password change must not comment');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000008',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws($$select * from public.public_submit_content_comment((select id from run9_entry),'Suspended comment')$$,'Suspended parent must not comment');

-- Parent comments are pending-first, reject obvious private fields, and expose
-- no identity until a leadership decision with an immutable reason.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws($$select * from public.public_submit_content_comment((select id from run9_entry),'Call me on 08012345678')$$,'Phone number must be rejected from a public comment');
create temporary table run9_comment as
select id from public.public_submit_content_comment((select id from run9_entry),'A safe fictional parent comment for leadership review.');
grant select on run9_comment to anon,authenticated,service_role;
select pg_temp.assert_true((select status='pending' from public.public_my_content_comments((select id from run9_entry)) where id=(select id from run9_comment)),'Own submitted comment must begin pending');
select pg_temp.assert_true((select comment_count=0 from public.public_get_content_engagement((select id from run9_entry))),'Pending comment must not enter public total');
select pg_temp.assert_throws('select * from public.public_content_comments','Parent must not bypass own-comment RPC');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws($$select public.cms_moderate_content_comment((select id from run9_comment),'approved','Unauthorised approval')$$,'Parent must not moderate a comment');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_moderate_content_comment((select id from run9_comment),'approved','Plain text contains no private or safeguarding information');
select pg_temp.assert_true((select count(*)=1 from public.cms_comment_moderation_queue() where id=(select id from run9_comment) and status='approved'),'Leadership queue must show the recorded decision');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true((select count(*)=1 from public.public_cms_approved_comments where id=(select id from run9_comment) and author_label='Verified Parent'),'Approved comment must expose only a privacy-safe role label');
select pg_temp.assert_true(not exists(select 1 from information_schema.columns where table_schema='public' and table_name='public_cms_approved_comments' and column_name in ('actor_id','moderated_by','moderation_reason')),'Public comments view must omit private actor and moderation fields');

-- Editing an approved comment returns it to pending and removes it publicly.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select * from public.public_edit_content_comment((select id from run9_comment),'A safely edited fictional comment returned to review.');
select pg_temp.assert_true((select status='pending' from public.public_my_content_comments((select id from run9_entry)) where id=(select id from run9_comment)),'Edited approved comment must return to pending');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true((select count(*)=0 from public.public_cms_approved_comments where id=(select id from run9_comment)),'Edited comment must disappear until reapproved');

-- Reapproval and two unique signed-in reports move the item out of public view.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_moderate_content_comment((select id from run9_comment),'approved','Edited plain text is safe for public display');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claim.role','authenticated',true);
select * from public.public_report_content_comment((select id from run9_comment),'Fictional concern for leadership review');
select * from public.public_report_content_comment((select id from run9_comment),'Repeated report must remain deduplicated');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select * from public.public_report_content_comment((select id from run9_comment),'Second independent fictional concern');
select pg_temp.assert_true((select status='reported' and report_count=2 and jsonb_array_length(report_reasons)=2 from public.cms_comment_moderation_queue() where id=(select id from run9_comment)),'Two unique reports must move the comment to reported and expose reasons only in leadership queue');
select public.cms_moderate_content_comment((select id from run9_comment),'hidden','Leadership hid the reported fictional comment after review');

-- Homepage placements require publication authority and retain an immutable audit.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws($$select public.cms_set_site_slot('home.news',0,(select id from run9_entry),true,null,null,'Parent placement attempt must fail')$$,'Parent must not control homepage placements');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_set_site_slot('home.news',0,(select id from run9_entry),true,null,null,'Feature fictional approved News on the homepage');
select pg_temp.assert_true((select count(*)=1 from public.public_site_slot_events where slot_key='home.news'),'Publisher must see the placement audit');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true((select count(*)=1 from public.public_cms_published_slots where slot_key='home.news' and canonical_path='/news/fictional-run-nine-engagement'),'Effective placement must expose only already-public content');
select pg_temp.assert_true((select count(*)=0 from public.public_cms_approved_comments where id=(select id from run9_comment)),'Hidden comment must remain absent from public output');

-- Audit rows cannot be rewritten; ordinary accounts cannot enumerate them.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','19000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true((select count(*)=0 from public.public_comment_moderation_events),'Parent must not read moderation actor history');
select pg_temp.assert_true((select count(*)=0 from public.public_site_slot_events),'Parent must not read placement actor history');
reset role;
reset session authorization;
select pg_temp.assert_throws($$update public.public_comment_moderation_events set reason='forged' where comment_id=(select id from run9_comment)$$,'Comment moderation history must be immutable');
select pg_temp.assert_throws($$delete from public.public_site_slot_events where entry_id=(select id from run9_entry)$$,'Placement history must be immutable');

rollback;
