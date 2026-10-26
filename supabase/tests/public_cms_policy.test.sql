-- Treasure Academy public CMS lifecycle, RLS and security integration test.
-- Disposable local/staging database only; every fictional row rolls back.
begin;

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin
  if not coalesce(ok,false) then raise exception 'PUBLIC CMS TEST FAILED: %',message; end if;
end $$;
create or replace function pg_temp.assert_throws(statement text,message text)
returns void language plpgsql as $$ begin
  begin execute statement; exception when others then return; end;
  raise exception 'PUBLIC CMS TEST FAILED (expected error): %',message;
end $$;

insert into auth.users(id,phone,raw_user_meta_data) values
 ('15000000-0000-4000-8000-000000000001','+2348000000501','{"full_name":"Fictional Proprietress"}'),
 ('15000000-0000-4000-8000-000000000002','+2348000000502','{"full_name":"Fictional Headmistress"}'),
 ('15000000-0000-4000-8000-000000000003','+2348000000503','{"full_name":"Fictional Assistant Headmistress"}'),
 ('15000000-0000-4000-8000-000000000004','+2348000000504','{"full_name":"Fictional CMS Editor"}'),
 ('15000000-0000-4000-8000-000000000005','+2348000000505','{"full_name":"Fictional CMS Reviewer"}'),
 ('15000000-0000-4000-8000-000000000006','+2348000000506','{"full_name":"Fictional Developer"}'),
 ('15000000-0000-4000-8000-000000000007','+2348000000507','{"full_name":"Fictional Parent"}');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update public.profiles set account_status='active',must_change_password=false,active=true,phone_e164=phone
 where id::text like '15000000-0000-4000-8000-%';
update public.profiles set role='admin',leadership_scope='headmistress',position_title='Proprietress'
 where id='15000000-0000-4000-8000-000000000001';
update public.profiles set role='admin',leadership_scope='headmistress',position_title='Headmistress'
 where id='15000000-0000-4000-8000-000000000002';
update public.profiles set role='admin',leadership_scope='assistant_headmistress',position_title='Assistant Headmistress'
 where id='15000000-0000-4000-8000-000000000003';
update public.profiles set role='teacher'
 where id in ('15000000-0000-4000-8000-000000000004','15000000-0000-4000-8000-000000000005');
reset role;

-- Seed only the pre-existing developer-information capability. It must permit
-- review visibility, never drafting, approval or publication.
reset session authorization;
insert into public.developer_capabilities(
  profile_id,console_access,otp_dispatch,information_review,system_health_read,granted_by,reason
) values (
  '15000000-0000-4000-8000-000000000006',true,true,true,true,
  '15000000-0000-4000-8000-000000000001','Fictional owner-authorised developer fixture'
);
set session authorization authenticator;

create temporary table cms_documents(name text primary key,document jsonb not null);
insert into cms_documents(name,document) values (
  'revision_one',
  jsonb_build_object(
    'title','Fictional Term One Update',
    'summary','A verified fictional school update used only by rollback-safe tests.',
    'category','School update',
    'search_keywords',jsonb_build_array('fictional update','term one'),
    'classification','public',
    'source_note','Verified rollback-safe fixture source; not Production content.',
    'next_review_date','2099-12-31',
    'seo_title','Fictional Term One Update',
    'seo_description','A fictional CMS lifecycle fixture with no real school or pupil data.',
    'metadata',jsonb_build_object('fixture',true),
    'tags',jsonb_build_array('school-update'),
    'search_terms',jsonb_build_array('fictional term update'),
    'blocks',jsonb_build_array(
      jsonb_build_object('type','heading','payload',jsonb_build_object('text','Fictional update','level','2')),
      jsonb_build_object('type','paragraph','payload',jsonb_build_object('text','This is bounded plain text from a fictional local test fixture.'))
    )
  )
),(
  'revision_two',
  jsonb_build_object(
    'title','Fictional Term One Update Revised',
    'summary','A revised and independently reviewed fictional update for local tests.',
    'category','School update',
    'search_keywords',jsonb_build_array('fictional revised update'),
    'classification','public',
    'source_note','Verified rollback-safe revised fixture source; not Production content.',
    'next_review_date','2099-12-31',
    'seo_title','Fictional Term One Update Revised',
    'seo_description','A revised fictional CMS lifecycle fixture with no private data.',
    'metadata',jsonb_build_object('fixture',true,'revision',2),
    'tags',jsonb_build_array('school-update'),
    'search_terms',jsonb_build_array('fictional revised update'),
    'blocks',jsonb_build_array(
      jsonb_build_object('type','paragraph','payload',jsonb_build_object('text','This revised body remains plain structured text.'))
    )
  )
),(
  'scheduled_news',
  jsonb_build_object(
    'title','Fictional Scheduled Notice',
    'summary','A scheduled fictional notice used to verify due-time publication.',
    'classification','public',
    'source_note','Verified rollback-safe scheduling fixture.',
    'next_review_date','2099-12-31',
    'seo_title','Fictional Scheduled Notice',
    'seo_description','A fictional future publication used only by local lifecycle tests.',
    'blocks',jsonb_build_array(
      jsonb_build_object('type','paragraph','payload',jsonb_build_object('text','Scheduled publication test body.'))
    )
  )
);
grant select on cms_documents to anon,authenticated,service_role;

-- The migration is data-neutral and every CMS table is RLS protected.
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true(
  (select count(*)=0 from public.public_content_entries),
  'Run 5 must seed no content entry'
);
select pg_temp.assert_true(
  (select count(*)=20 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname in (
      'public_cms_capabilities','public_cms_capability_events','public_media_assets',
      'public_content_entries','public_content_revisions','public_content_blocks','public_content_tags',
      'public_content_tag_links','public_content_media','public_content_slug_aliases',
      'public_publication_events','public_content_approvals','public_site_content_slots',
      'public_content_quality_findings','public_content_search_terms','public_site_navigation_items',
      'public_content_views_daily','public_content_reactions','public_content_comments',
      'public_comment_moderation_events'
    ) and c.relrowsecurity),
  'All twenty CMS foundation tables must have RLS enabled'
);

-- Only the Proprietress administers explicit CMS capabilities. The grants do
-- not alter school-record roles or grant the developer publication authority.
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_set_capabilities(
  '15000000-0000-4000-8000-000000000004',true,false,false,true,false,
  'Fictional editor and self-safeguarding test grant',false
);
select public.cms_set_capabilities(
  '15000000-0000-4000-8000-000000000005',false,true,false,true,false,
  'Fictional independent reviewer grant',false
);
select pg_temp.assert_throws(
  $$select public.cms_set_capabilities('15000000-0000-4000-8000-000000000004',true,false,true,true,true,'Invalid delegated emergency authority',false)$$,
  'Emergency publication authority must remain Proprietress-only'
);
reset role;
reset session authorization;
select pg_temp.assert_true(
  (select role='teacher' from public.profiles where id='15000000-0000-4000-8000-000000000004'),
  'CMS capability must not change the editor school-record role'
);
set session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true(public.cms_current_actor_can('publish'),'Assistant Headmistress must retain publication authority');
select pg_temp.assert_throws(
  $$select public.cms_set_capabilities('15000000-0000-4000-8000-000000000007',true,false,false,false,false,'Unauthorised grant attempt',false)$$,
  'Assistant Headmistress must not administer CMS capability grants'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true(public.cms_current_actor_can('publish'),'Headmistress must retain publication authority');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true(public.cms_current_actor_can('view_private'),'Authorised developer information review may inspect private CMS state');
select pg_temp.assert_true(not public.cms_current_actor_can('draft') and not public.cms_current_actor_can('publish'),'Developer must receive no drafting or publication authority');

-- The editor can use constrained RPCs but cannot bypass them with direct DML.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws(
  $$insert into public.public_content_entries(content_type,slug,created_by) values('news','direct-bypass','15000000-0000-4000-8000-000000000004')$$,
  'Authenticated editor must not insert CMS rows directly'
);
select pg_temp.assert_throws(
  $$select public.cms_create_entry('news','unsafe-html',jsonb_set((select document from cms_documents where name='revision_one'),'{blocks,1,payload,text}',to_jsonb('<img src=x onerror=alert(1)>'::text)),'Unsafe fixture')$$,
  'Raw HTML and event-handler XSS must be rejected'
);
select pg_temp.assert_throws(
  $$select public.cms_create_entry('news','unsafe-key',jsonb_set((select document from cms_documents where name='revision_one'),'{blocks,1,payload,onerror}',to_jsonb('alert(1)'::text),true),'Unsafe fixture')$$,
  'Unsupported executable payload keys must be rejected'
);
select pg_temp.assert_throws(
  $$select public.cms_create_entry('news','private-material',jsonb_set((select document from cms_documents where name='revision_one'),'{metadata,phone}',to_jsonb('+2348000000000'::text),true),'Private fixture')$$,
  'Private phone material must be rejected from CMS documents'
);
select pg_temp.assert_throws(
  $$select public.cms_create_entry('news','unlinked-media',jsonb_set((select document from cms_documents where name='revision_one'),'{blocks,1}',jsonb_build_object('type','image','payload',jsonb_build_object('asset_id','25000000-0000-4000-8000-000000000099','alt','Unlinked fictional media'))),'Unlinked media fixture')$$,
  'Block media without a governed relationship must be rejected'
);
create temporary table cms_primary_entry as
 select public.cms_create_entry(
  'news','fictional-term-one-update',(select document from cms_documents where name='revision_one'),'Initial fictional draft'
 ) as id;
grant select on cms_primary_entry to anon,authenticated,service_role;

-- Drafts remain invisible to anonymous and ordinary signed-in accounts.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true((select count(*)=0 from public.public_content_entries),'Anonymous user must not read a draft identity');
select pg_temp.assert_true((select count(*)=0 from public.public_cms_published_entries),'Published projection must exclude drafts');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000007',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true((select count(*)=0 from public.public_content_entries),'Ordinary account must not read a draft');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000006',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true((select count(*)=1 from public.public_content_entries),'Developer information review may read but not mutate draft state');
select pg_temp.assert_throws(
  $$select public.cms_publish((select id from cms_primary_entry),'Developer publication attempt')$$,
  'Developer must never publish CMS content'
);

-- Review and publication require explicit authority and append-only evidence.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_submit_for_review((select id from cms_primary_entry),'Ready for independent review');
select pg_temp.assert_throws(
  $$select public.cms_record_approval((select id from cms_primary_entry),'factual','approved','Self approval attempt')$$,
  'Draft-only editor must not record factual approval'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_record_approval((select id from cms_primary_entry),'factual','approved','Fictional facts independently reviewed');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_record_approval((select id from cms_primary_entry),'publication','approved','Fictional publication approved');
select pg_temp.assert_true(
  (select workflow_status='approved' from public.public_content_entries where id=(select id from cms_primary_entry)),
  'Factual plus publication approval must move the exact revision to approved'
);
select public.cms_publish((select id from cms_primary_entry),'Publish approved fictional fixture');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true(
  (select count(*)=1 from public.public_cms_published_entries where slug='fictional-term-one-update' and title='Fictional Term One Update'),
  'Anonymous projection must expose exactly the accepted published revision'
);
select pg_temp.assert_true((select count(*)=2 from public.public_cms_published_blocks),'Published blocks must expose only the accepted revision');
select pg_temp.assert_true((select count(*)=1 from public.public_content_tags where slug='school-update'),'Only a tag attached to published content may be public');

-- History and stable aliases are immutable even to database-owner test code.
reset role;
reset session authorization;
select pg_temp.assert_throws(
  $$update public.public_content_revisions set title='Forged title' where entry_id=(select id from cms_primary_entry)$$,
  'Revision history must reject mutation'
);
select pg_temp.assert_throws(
  $$delete from public.public_content_entries where id=(select id from cms_primary_entry)$$,
  'CMS identities must be archived rather than hard-deleted'
);
set session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_change_slug((select id from cms_primary_entry),'fictional-term-one-update-final','Permanent fictional alias reason');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true(
  (select count(*)=1 from public.public_cms_slug_redirects where alias_path='/news/fictional-term-one-update' and destination_path='/news/fictional-term-one-update-final'),
  'Published slug change must retain a safe stable redirect alias'
);

-- A later draft must not replace the previously published revision until the
-- new immutable revision independently completes review and publication.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table cms_second_revision as
 select public.cms_create_revision(
  (select id from cms_primary_entry),1,(select document from cms_documents where name='revision_two'),'Create independently reviewed revision two'
 ) as id;
grant select on cms_second_revision to anon,authenticated,service_role;
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true(
  (select title='Fictional Term One Update' from public.public_cms_published_entries where slug='fictional-term-one-update-final'),
  'A new draft must leave the former accepted revision publicly stable'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_submit_for_review((select id from cms_primary_entry),'Revision two ready for review');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_record_approval((select id from cms_primary_entry),'factual','approved','Revision two facts reviewed');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_record_approval((select id from cms_primary_entry),'publication','approved','Revision two publication approved');
select public.cms_publish((select id from cms_primary_entry),'Publish accepted revision two');
select pg_temp.assert_true(
  (select count(*)=2 from public.public_content_revisions where entry_id=(select id from cms_primary_entry)),
  'Publishing a revision must preserve immutable prior history'
);

-- Archive removes every public projection. Restoring an archived revision
-- creates a new private draft and must not silently resurrect old live content.
select public.cms_archive((select id from cms_primary_entry),'Archive fictional lifecycle fixture');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true((select count(*)=0 from public.public_cms_published_entries where slug='fictional-term-one-update-final'),'Archived content must leave public projections');
select pg_temp.assert_true((select count(*)=0 from public.public_cms_slug_redirects where alias_path='/news/fictional-term-one-update'),'Archived aliases must leave public redirects');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table cms_restored_revision as
 select public.cms_restore_revision(
  (select id from cms_primary_entry),
  (select id from public.public_content_revisions where entry_id=(select id from cms_primary_entry) and revision_number=1),
  'Restore revision one as a new private draft'
 ) as id;
select pg_temp.assert_true(
  (select current_revision_number=3 and workflow_status='draft' and published_revision_id is null
     from public.public_content_entries where id=(select id from cms_primary_entry)),
  'Archived revision restore must clone history into a private draft without republishing'
);
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true((select count(*)=0 from public.public_cms_published_entries where slug='fictional-term-one-update-final'),'Restored archived draft must remain anonymous-invisible');

-- Scheduling is public only when due and is revalidated by the service task.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table cms_scheduled_entry as
 select public.cms_create_entry('news','fictional-scheduled-notice',(select document from cms_documents where name='scheduled_news'),'Create scheduled fixture') as id;
grant select on cms_scheduled_entry to anon,authenticated,service_role;
select public.cms_submit_for_review((select id from cms_scheduled_entry),'Scheduled fixture review');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_record_approval((select id from cms_scheduled_entry),'factual','approved','Scheduled facts reviewed');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_record_approval((select id from cms_scheduled_entry),'publication','approved','Scheduled publication approved');
select public.cms_publish((select id from cms_scheduled_entry),'Schedule accepted fictional notice',now()+interval '10 minutes');
reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true((select count(*)=0 from public.public_cms_published_entries where slug='fictional-scheduled-notice'),'Scheduled content must remain hidden before due time');
reset role;
reset session authorization;
update public.public_content_entries set scheduled_for=now()-interval '1 minute' where id=(select id from cms_scheduled_entry);
set session authorization authenticator;
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_true(public.cms_publish_due()=1,'Due scheduler must publish one still-valid accepted revision');
reset role;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true((select count(*)=1 from public.public_cms_published_entries where slug='fictional-scheduled-notice'),'Due valid content must enter the published projection');

-- Identifiable child media requires approved consent, an independent
-- safeguarding approval and due-time consent revalidation.
reset role;
reset session authorization;
insert into public.public_media_assets(
  id,media_type,lifecycle_state,title,alt_text,source_note,child_identifiable,
  provenance_status,consent_status,public_derivative_only,created_by
) values (
  '25000000-0000-4000-8000-000000000001','image','approved','Fictional child-media fixture',
  'Fictional safeguarding fixture','Verified fictional source',true,'verified','not_required',true,
  '15000000-0000-4000-8000-000000000004'
);
set session authorization authenticator;
insert into cms_documents(name,document) values (
  'child_story',
  jsonb_build_object(
    'title','Fictional Safeguarded Story',
    'summary','A fictional child-media story for consent and safeguarding tests.',
    'classification','public',
    'source_note','Verified fictional safeguarding fixture source.',
    'next_review_date','2099-12-31',
    'seo_title','Fictional Safeguarded Story',
    'seo_description','A fictional story used only to verify child-media safeguards.',
    'featured_media_id','25000000-0000-4000-8000-000000000001',
    'media',jsonb_build_array(jsonb_build_object(
      'asset_id','25000000-0000-4000-8000-000000000001','placement','featured','position',0,'caption','Fictional safe derivative'
    )),
    'blocks',jsonb_build_array(jsonb_build_object(
      'type','image','payload',jsonb_build_object('asset_id','25000000-0000-4000-8000-000000000001','alt','Fictional safe derivative')
    ))
  )
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table cms_child_entry as
 select public.cms_create_entry('news','fictional-safeguarded-story',(select document from cms_documents where name='child_story'),'Create child-media fixture') as id;
grant select on cms_child_entry to anon,authenticated,service_role;
select public.cms_submit_for_review((select id from cms_child_entry),'Child-media fixture review');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_record_approval((select id from cms_child_entry),'factual','approved','Child fixture facts reviewed');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_record_approval((select id from cms_child_entry),'publication','approved','Child fixture publication reviewed');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws(
  $$select public.cms_record_approval((select id from cms_child_entry),'safeguarding','approved','Creator safeguarding self approval')$$,
  'Child-media creator must not approve their own safeguarding review'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_record_approval((select id from cms_child_entry),'safeguarding','approved','Independent child-media safeguarding review');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws(
  $$select public.cms_publish((select id from cms_child_entry),'Schedule child fixture',now()+interval '10 minutes')$$,
  'Identifiable child media must never treat consent as not required'
);
reset role;
reset session authorization;
update public.public_media_assets set consent_status='approved',consent_reviewed_by='15000000-0000-4000-8000-000000000005',consent_reviewed_at=now()
 where id='25000000-0000-4000-8000-000000000001';
set session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_publish((select id from cms_child_entry),'Schedule consented child fixture',now()+interval '10 minutes');
reset role;
reset session authorization;
update public.public_media_assets set consent_status='denied',consent_reviewed_by='15000000-0000-4000-8000-000000000005',consent_reviewed_at=now()
 where id='25000000-0000-4000-8000-000000000001';
update public.public_content_entries set scheduled_for=now()-interval '1 minute' where id=(select id from cms_child_entry);
select pg_temp.assert_throws(
  $$delete from public.public_media_assets where id='25000000-0000-4000-8000-000000000001'$$,
  'Media metadata must be archived rather than hard-deleted'
);
set session authorization authenticator;
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_true(public.cms_publish_due()=0,'Due scheduler must refuse content whose child consent was withdrawn');
select pg_temp.assert_true(
  (select workflow_status='changes_requested' and published_revision_id is null and scheduled_revision_id is null
     from public.public_content_entries where id=(select id from cms_child_entry)),
  'Blocked scheduled content must fail closed and return to changes requested'
);
reset role;
set local role anon;
select set_config('request.jwt.claim.role','anon',true);
select pg_temp.assert_true((select count(*)=0 from public.public_cms_published_entries where slug='fictional-safeguarded-story'),'Consent-withdrawn child content must remain unpublished');
select pg_temp.assert_true((select count(*)=0 from public.public_cms_published_media where media_id='25000000-0000-4000-8000-000000000001'),'Consent-withdrawn child media must never enter public media projection');
select pg_temp.assert_throws('select * from public.public_content_reactions','Dormant engagement foundations must have no anonymous grants');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','15000000-0000-4000-8000-000000000007',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws('select * from public.public_content_comments','Dormant comments must have no authenticated grant before Run 9');
select pg_temp.assert_throws('insert into public.public_content_reactions(entry_id,actor_id) values((select id from cms_scheduled_entry),''15000000-0000-4000-8000-000000000007'')','Dormant likes must reject direct writes');

reset role;
rollback;
