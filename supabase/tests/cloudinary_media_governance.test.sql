-- Treasure Academy Cloudinary media governance integration test.
-- Disposable local/staging database only; every fictional row rolls back.
begin;

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin
  if not coalesce(ok,false) then raise exception 'CLOUDINARY MEDIA TEST FAILED: %',message; end if;
end $$;
create or replace function pg_temp.assert_throws(statement text,message text)
returns void language plpgsql as $$ begin
  begin execute statement; exception when others then return; end;
  raise exception 'CLOUDINARY MEDIA TEST FAILED (expected error): %',message;
end $$;

insert into auth.users(id,phone,raw_user_meta_data) values
 ('16000000-0000-4000-8000-000000000001','+2348000000601','{"full_name":"Fictional Proprietress"}'),
 ('16000000-0000-4000-8000-000000000002','+2348000000602','{"full_name":"Fictional Headmistress"}'),
 ('16000000-0000-4000-8000-000000000003','+2348000000603','{"full_name":"Fictional Assistant Headmistress"}'),
 ('16000000-0000-4000-8000-000000000004','+2348000000604','{"full_name":"Fictional Media Editor"}'),
 ('16000000-0000-4000-8000-000000000005','+2348000000605','{"full_name":"Fictional Ordinary Account"}');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update public.profiles set account_status='active',must_change_password=false,active=true,phone_e164=phone
 where id::text like '16000000-0000-4000-8000-%';
update public.profiles set role='admin',leadership_scope='headmistress',position_title='Proprietress'
 where id='16000000-0000-4000-8000-000000000001';
update public.profiles set role='admin',leadership_scope='headmistress',position_title='Headmistress'
 where id='16000000-0000-4000-8000-000000000002';
update public.profiles set role='admin',leadership_scope='assistant_headmistress',position_title='Assistant Headmistress'
 where id='16000000-0000-4000-8000-000000000003';
update public.profiles set role='teacher' where id='16000000-0000-4000-8000-000000000004';
reset role;
reset session authorization;
insert into public.public_cms_capabilities(
  profile_id,can_draft,can_review,can_publish,can_safeguarding_review,can_emergency_publish,granted_by,grant_reason
) values (
  '16000000-0000-4000-8000-000000000004',true,true,false,false,false,
  '16000000-0000-4000-8000-000000000001','Fictional media editor fixture for local rollback testing'
);
set session authorization authenticator;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_true((select count(*)=0 from public.public_media_upload_authorisations),'Run 6 must seed no upload authorisations');
select pg_temp.assert_true((select count(*)=0 from public.public_media_events),'Run 6 must seed no media events');
reset role;
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.public_media_upload_authorisations'::regclass),'Upload authorisations must use RLS');
select pg_temp.assert_true((select relrowsecurity from pg_class where oid='public.public_media_events'::regclass),'Media audit must use RLS');
select pg_temp.assert_true(not has_table_privilege('anon','public.public_media_upload_authorisations','SELECT'),'Anonymous users must have no upload-authorisation grant');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.public_media_events','SELECT'),'Authenticated users must not bypass the audited media API');

-- Both owner-approved leadership scopes can perform independent safeguarding
-- review, while an ordinary account cannot inherit that authority.
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true(public.cms_current_actor_can('safeguarding_review'),'Both accepted leadership scopes must have safeguarding review authority (Headmistress)');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true(public.cms_current_actor_can('safeguarding_review'),'Both accepted leadership scopes must have safeguarding review authority (Assistant Headmistress)');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000005',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true(not public.cms_current_actor_can('safeguarding_review'),'Ordinary account must receive no safeguarding authority');
select pg_temp.assert_throws(
  $$select * from public.cms_begin_cloudinary_media_upload(
    'ta_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa','image','image/jpeg',2048,repeat('c',64),
    'Fictional child fixture','Fictional child-media alternative text','Generated fictional source record',true
  )$$,
  'Ordinary account must not reserve media uploads'
);

-- The editor may reserve only a bounded, allowlisted, checksum-bound upload.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table media_reservation as
 select * from public.cms_begin_cloudinary_media_upload(
   'ta_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb','image','image/jpeg',2048,repeat('c',64),
   'Fictional child fixture','Fictional child-media alternative text','Generated fictional source record',true
 );
grant select on media_reservation to anon,authenticated,service_role;
select pg_temp.assert_throws(
  $$select * from public.cms_begin_cloudinary_media_upload(
    'ta_cccccccccccccccccccccccccccccccc','image','image/svg+xml',2048,repeat('d',64),
    'Unsafe format fixture','Unsafe format alternative text','Generated fictional source record',false
  )$$,
  'SVG must not enter the governed media boundary'
);
select pg_temp.assert_throws(
  $$select * from public.cms_begin_cloudinary_media_upload(
    'ta_dddddddddddddddddddddddddddddddd','image','image/jpeg',10485761,repeat('e',64),
    'Oversize fixture','Oversize fixture alternative text','Generated fictional source record',false
  )$$,
  'Oversize image must be rejected before upload'
);
select pg_temp.assert_true(
  (select provider='cloudinary' and lifecycle_state='pending' and consent_status='pending'
      and safeguarding_status='pending' and retention_policy='manual_only'
   from public.public_media_assets where id=(select media_id from media_reservation)),
  'Reservation must create pending, manual-retention, fail-closed child media metadata'
);
select pg_temp.assert_throws('select * from public.public_media_upload_authorisations','Editor must not read raw upload-authorisation rows directly');

-- Completion is service-only and must match actor, bytes, format, dimensions and
-- authoritative provider identity exactly.
reset role;
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_true(
  (select status='reserved' and provider_asset_id='ta_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
   from public.cms_get_cloudinary_upload_authorisation((select authorisation_id from media_reservation))),
  'Service completion must retrieve only the exact reservation'
);
select pg_temp.assert_throws(
  $$select public.cms_complete_cloudinary_media_upload(
    (select authorisation_id from media_reservation),'16000000-0000-4000-8000-000000000003',
    'fictional-cloudinary-asset-uid',1700000001,repeat('a',32),'jpg','image/jpeg',2048,1200,800,null,repeat('f',64)
  )$$,
  'Wrong actor must not complete another account upload'
);
select public.cms_complete_cloudinary_media_upload(
  (select authorisation_id from media_reservation),'16000000-0000-4000-8000-000000000004',
  'fictional-cloudinary-asset-uid',1700000001,repeat('a',32),'jpg','image/jpeg',2048,1200,800,null,repeat('f',64)
);
select pg_temp.assert_true(
  (select upload_completed_at is not null and provider_delivery_type='authenticated'
      and original_format='jpg' and original_mime_type='image/jpeg' and byte_size=2048
   from public.public_media_assets where id=(select media_id from media_reservation)),
  'Provider confirmation must retain authoritative bounded metadata only'
);
select pg_temp.assert_throws(
  $$select public.cms_complete_cloudinary_media_upload(
    (select authorisation_id from media_reservation),'16000000-0000-4000-8000-000000000004',
    'fictional-cloudinary-asset-uid',1700000001,repeat('a',32),'jpg','image/jpeg',2048,1200,800,null,repeat('f',64)
  )$$,
  'Completed reservation must not replay'
);

-- The creator cannot review identifiable-child media. An independent named
-- leader confirms provenance, consent and safeguarding; the other leadership
-- scope can make the final publication decision.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws(
  $$select public.cms_review_media((select media_id from media_reservation),'provenance','approved',null,'Creator self review attempt')$$,
  'Media creator must not self-approve identifiable-child media'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_review_media((select media_id from media_reservation),'provenance','approved',null,'Verified fictional source provenance');
select public.cms_review_media((select media_id from media_reservation),'consent','approved','FICTIONAL-CONSENT-REFERENCE','Verified fictional consent authority');
select public.cms_review_media((select media_id from media_reservation),'safeguarding','approved',null,'Independent fictional safeguarding review');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claim.role','authenticated',true);
select public.cms_review_media((select media_id from media_reservation),'publication','approved',null,'Approve fictional media after all safeguards');
select pg_temp.assert_true(
  (select lifecycle_state='approved' and provenance_status='verified' and consent_status='approved'
      and safeguarding_status='approved' and approved_by='16000000-0000-4000-8000-000000000003'
   from public.public_media_assets where id=(select media_id from media_reservation)),
  'Publication approval must require all child-media safeguards'
);
select pg_temp.assert_true(
  (select count(*)=1 from public.cms_get_media_for_delivery((select media_id from media_reservation),'thumb')),
  'Authorised CMS reviewer may request only a bounded preview derivative'
);
select pg_temp.assert_throws(
  $$select * from public.cms_get_media_for_delivery((select media_id from media_reservation),'download-1600')$$,
  'Gallery download derivative must require explicit current placement permission'
);
select pg_temp.assert_throws(
  $$select * from public.cms_export_cloudinary_media_manifest(200,0)$$,
  'Publication authority alone must not export the provider manifest'
);
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_true(
  (select count(*)=1 and bool_and(retention_policy='manual_only' and orphan_candidate and orphan_reason='no_content_placement')
   from public.cms_export_cloudinary_media_manifest(200,0)),
  'Proprietress manifest must expose retained orphan state without a deletion operation'
);
reset role;
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_true(
  (select count(*)=6 from public.public_media_events where media_id=(select media_id from media_reservation)),
  'Reservation, completion, three reviews and publication must create immutable audit events'
);
reset role;
reset session authorization;
select pg_temp.assert_throws(
  $$update public.public_media_events set reason='Tampered audit' where media_id=(select media_id from media_reservation)$$,
  'Media audit must be immutable'
);
select pg_temp.assert_throws(
  $$delete from public.public_media_assets where id=(select media_id from media_reservation)$$,
  'Cloudinary media must never be hard-deleted while governed records exist'
);

-- Manual-only retention means expiry rejects and retains both records; no
-- automatic provider or database deletion occurs.
set session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claim.sub','16000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
create temporary table expiring_reservation as
 select * from public.cms_begin_cloudinary_media_upload(
   'ta_eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee','video','video/mp4',4096,repeat('a',64),
   'Fictional video fixture','Fictional video alternative text','Generated fictional source record',false
 );
grant select on expiring_reservation to anon,authenticated,service_role;
reset role;
reset session authorization;
update public.public_media_upload_authorisations set created_at=now()-interval '10 minutes',expires_at=now()-interval '5 minutes'
 where id=(select authorisation_id from expiring_reservation);
set session authorization authenticator;
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_true(public.cms_expire_cloudinary_media_uploads()=1,'Service expiry must contain one abandoned reservation');
select pg_temp.assert_true(
  (select status='expired' from public.public_media_upload_authorisations where id=(select authorisation_id from expiring_reservation)),
  'Expired authorisation must be retained for audit'
);
select pg_temp.assert_true(
  (select lifecycle_state='rejected' and retention_policy='manual_only'
   from public.public_media_assets where id=(select media_id from expiring_reservation)),
  'Expired orphan metadata must remain retained for manual cleanup review'
);

reset role;
rollback;
