-- Treasure Academy admission-tracking and developer-capability integration test.
-- Run only in a disposable database after all seven ordered migrations through
-- 202610240001. The transaction rolls back.
begin;

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin
  if not coalesce(ok,false) then raise exception 'ADMISSION TRACKING TEST FAILED: %',message; end if;
end $$;
create or replace function pg_temp.assert_throws(statement text,message text)
returns void language plpgsql as $$ begin
  begin execute statement; exception when others then return; end;
  raise exception 'ADMISSION TRACKING TEST FAILED (expected error): %',message;
end $$;

insert into auth.users(id,phone,raw_user_meta_data) values
 ('12000000-0000-4000-8000-000000000001','+2348000000101','{"full_name":"Fictional Developer"}'),
 ('12000000-0000-4000-8000-000000000002','+2348000000102','{"full_name":"Fictional Applicant"}'),
 ('12000000-0000-4000-8000-000000000003','+2348000000103','{"full_name":"Fictional Other Parent"}');
insert into auth.sessions(id,user_id) values
 ('92000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001'),
 ('92000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002'),
 ('92000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000003');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update public.profiles set account_status='active',must_change_password=false,active=true,phone_e164=phone where id in
 ('12000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000003');
update public.profiles set role='admin',leadership_scope='headmistress' where id='12000000-0000-4000-8000-000000000001';
update public.profiles set parent_stage='parent' where id in ('12000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000003');
insert into public.developer_capabilities(profile_id,console_access,otp_dispatch,information_review,granted_by,reason)
values('12000000-0000-4000-8000-000000000001',true,true,true,'12000000-0000-4000-8000-000000000001','Disposable capability policy test');
select pg_temp.assert_true(public.developer_has_capability('12000000-0000-4000-8000-000000000001','otp_dispatch'),'Explicit dispatcher capability must succeed');
select pg_temp.assert_true(not public.developer_has_capability('12000000-0000-4000-8000-000000000002','console'),'Parent role must not imply developer capability');

insert into public.students(id,admission_number,full_name,class_code,parent_id,admission_status,active)
values('22000000-0000-4000-8000-000000000001',null,'Fictional Converted Applicant','Primary 1',null,'admitted',true);
insert into public.admission_applications(id,application_reference,parent_id,child_name,requested_class,status,student_id,admission_session_name,parent_next_step,parent_verdict_message,submission_source)
values
 ('62000000-0000-4000-8000-000000000001','TA-ADM-20990120-AAAA1111','12000000-0000-4000-8000-000000000002','Fictional New Applicant','Nursery 1','under_review',null,null,'Wait for the fictional office review.','The fictional application is under review.','online_self_service'),
 ('62000000-0000-4000-8000-000000000002','TA-ADM-20990120-BBBB2222','12000000-0000-4000-8000-000000000002','Fictional Converted Applicant','Primary 1','admitted','22000000-0000-4000-8000-000000000001','2099/2100','Open the private family workspace.','The fictional applicant was admitted.','school_assisted');
select pg_temp.assert_true((select count(*)=1 from public.server_active_admission_applications('12000000-0000-4000-8000-000000000002')),'Projection must return only the unlinked application');
select pg_temp.assert_true(not exists(select 1 from public.server_active_admission_applications('12000000-0000-4000-8000-000000000002') where child_name='Fictional Converted Applicant'),'Converted applicant must be absent from lightweight projection');

insert into public.admission_tracking_challenges(
 id,account_id,request_token_hash,phone_hash,phone_last4,network_hash,channel,otp_hash,
 delivery_ciphertext,delivery_iv,delivery_tag,status,expires_at
) values (
 '72000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002',repeat('1',64),repeat('2',64),'0102',repeat('3',64),'sms',repeat('4',64),
 'fictional-ciphertext','fictional-iv','fictional-tag','queued',now()+interval '5 minutes'
);
select pg_temp.assert_true(not exists(select 1 from public.server_verify_admission_challenge(repeat('1',64),repeat('4',64))),'A queued code must not verify before authorised one-time reveal');
select pg_temp.assert_throws($q$
 insert into public.admission_tracking_challenges(id,account_id,request_token_hash,phone_hash,phone_last4,network_hash,channel,otp_hash,status,expires_at)
 values('72000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002',repeat('5',64),repeat('2',64),'0102',repeat('6',64),'whatsapp',repeat('7',64),'queued',now()+interval '5 minutes')
$q$,'Only one active code per phone/purpose may exist');
create temporary table revealed_payload as
 select * from public.server_reveal_otp_dispatch('72000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select delivery_ciphertext='fictional-ciphertext' from revealed_payload),'First reveal must return the encrypted payload once');
select pg_temp.assert_true((select status='revealed' and delivery_ciphertext is null and delivery_iv is null and delivery_tag is null from public.admission_tracking_challenges where id='72000000-0000-4000-8000-000000000001'),'Reveal must atomically destroy the server delivery payload');
select pg_temp.assert_throws($q$select * from public.server_reveal_otp_dispatch('72000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001')$q$,'Reveal replay must fail');
select pg_temp.assert_true(public.server_mark_otp_sent('72000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','copied'),'Explicit copy action must create code-free audit while revealed');
select pg_temp.assert_true(public.server_mark_otp_sent('72000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','marked_sent'),'Dispatcher must be able to mark the revealed code sent');
select pg_temp.assert_true((select status='sent' from public.admission_tracking_challenges where id='72000000-0000-4000-8000-000000000001'),'Marked-sent action must change queue state');
select pg_temp.assert_true(not public.server_mark_otp_sent('72000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','copied'),'Dispatch audit actions must stop after marked sent');
select pg_temp.assert_true((select count(*)=1 from public.otp_dispatch_events where challenge_id='72000000-0000-4000-8000-000000000001' and action='revealed' and not (detail ?| array['otp','code','phone','message'])),'Reveal audit must be code-free');
select pg_temp.assert_throws($q$insert into public.otp_dispatch_events(challenge_id,actor_id,action,channel,detail) values('72000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','copied','sms','{"code":"123456"}')$q$,'Audit detail must reject a code');
select pg_temp.assert_throws($q$insert into public.otp_dispatch_events(challenge_id,actor_id,action,channel,detail) values('72000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000001','copied','sms','{"nested":{"message":"must never be stored"}}')$q$,'Audit detail must reject recursively nested sensitive keys');

insert into public.admission_tracking_challenges(
 id,account_id,request_token_hash,phone_hash,phone_last4,network_hash,channel,otp_hash,status,expires_at
) values (
 '72000000-0000-4000-8000-000000000003','12000000-0000-4000-8000-000000000002',repeat('8',64),repeat('9',64),'0102',repeat('a',64),'whatsapp',repeat('b',64),'revealed',now()+interval '5 minutes'
);
select * from public.server_verify_admission_challenge(repeat('8',64),repeat('c',64));
select pg_temp.assert_true((select attempt_count=1 and status='revealed' from public.admission_tracking_challenges where id='72000000-0000-4000-8000-000000000003'),'Wrong code hash must increment attempts without verifying');
create temporary table verified_claim as select * from public.server_verify_admission_challenge(repeat('8',64),repeat('b',64));
select pg_temp.assert_true((select account_id='12000000-0000-4000-8000-000000000002' from verified_claim),'Correct hash must claim the matching account');
select pg_temp.assert_true(not exists(select 1 from public.server_verify_admission_challenge(repeat('8',64),repeat('b',64))),'Verified challenge must not be reusable');
insert into public.admission_tracking_continuations(token_hash,account_id,application_id,challenge_id,expires_at)
values(repeat('d',64),'12000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000003',now()+interval '10 minutes');
update public.developer_capabilities set revoked_at=now() where profile_id='12000000-0000-4000-8000-000000000001';
select pg_temp.assert_true(not public.developer_has_capability('12000000-0000-4000-8000-000000000001','console'),'Revoked developer capability must fail immediately');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','92000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_throws('select * from public.admission_tracking_challenges','Authenticated parents must not read the OTP queue');
select pg_temp.assert_throws('select * from public.admission_tracking_continuations','Authenticated parents must not read opaque continuation rows directly');
select pg_temp.assert_throws('select * from public.otp_dispatch_events','Authenticated parents must not read dispatcher audit events');
select pg_temp.assert_throws('select * from public.developer_capabilities','Authenticated users must not enumerate developer capabilities');

reset role;
rollback;
