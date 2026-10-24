-- Treasure Academy staff-continuity, exceptional-progression and account-claim
-- integration test. Disposable local/staging database only; transaction rolls back.
begin;

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin
  if not coalesce(ok,false) then raise exception 'CONTINUITY TEST FAILED: %',message; end if;
end $$;
create or replace function pg_temp.assert_throws(statement text,message text)
returns void language plpgsql as $$ begin
  begin execute statement; exception when others then return; end;
  raise exception 'CONTINUITY TEST FAILED (expected error): %',message;
end $$;

insert into auth.users(id,phone,raw_user_meta_data) values
 ('13000000-0000-4000-8000-000000000001','+2348000000201','{"full_name":"Fictional Recommender"}'),
 ('13000000-0000-4000-8000-000000000002','+2348000000202','{"full_name":"Fictional Approver"}'),
 ('13000000-0000-4000-8000-000000000003','+2348000000203','{"full_name":"Fictional Former Teacher"}'),
 ('13000000-0000-4000-8000-000000000004','+2348000000204','{"full_name":"Fictional Replacement"}'),
 ('13000000-0000-4000-8000-000000000005','+2348000000205','{"full_name":"Fictional Claimant"}');
insert into auth.sessions(id,user_id) values
 ('93000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000001'),
 ('93000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000002');

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update public.profiles set account_status='active',must_change_password=false,active=true,phone_e164=phone
 where id in ('13000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000002','13000000-0000-4000-8000-000000000003','13000000-0000-4000-8000-000000000004');
update public.profiles set role='admin',leadership_scope='assistant_headmistress' where id='13000000-0000-4000-8000-000000000001';
update public.profiles set role='admin',leadership_scope='headmistress',position_title='Fictional Proprietress' where id='13000000-0000-4000-8000-000000000002';
update public.profiles set role='teacher' where id in ('13000000-0000-4000-8000-000000000003','13000000-0000-4000-8000-000000000004');
insert into public.teacher_class_assignments(id,teacher_id,class_code,subject,active,assignment_kind,started_on)
values('33000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000003','Primary 3','*',true,'class_teacher',current_date);

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','93000000-0000-4000-8000-000000000001',true);
create temporary table recommended_change as
 select public.recommend_staff_assignment_change(
  'replace','33000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000004',
  'Primary 3','*','class_teacher','2099/2100',current_date,'Fictional replacement recommendation','Fictional handover note'
 ) as id;
select pg_temp.assert_throws($q$select public.decide_staff_assignment_change((select id from recommended_change),'approve','self approval')$q$,'Recommender must not approve the same assignment change');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','93000000-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(not public.is_designated_headmistress(),'A Proprietress full-write account must not bypass the standing Headmistress-only verified-payment reversal control');
select public.decide_staff_assignment_change((select id from recommended_change),'approve','Independent fictional approval');
select pg_temp.assert_true((select active=false and ended_on=current_date from public.teacher_class_assignments where id='33000000-0000-4000-8000-000000000001'),'Former assignment must close instead of being overwritten');
select pg_temp.assert_true((select count(*)=1 from public.teacher_class_assignments where teacher_id='13000000-0000-4000-8000-000000000004' and class_code='Primary 3' and active=true and replaces_assignment_id='33000000-0000-4000-8000-000000000001'),'Replacement must receive a new linked assignment row');

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into public.students(id,admission_number,full_name,class_code,parent_id,admission_status,active)
values('23000000-0000-4000-8000-000000000001','FICTIONAL-P4-1','Fictional Primary Four Pupil','Primary 4',null,'admitted',true);
insert into public.student_enrolments(id,student_id,session_name,class_code,status,source,recorded_by)
values('43000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','2098/2099','Primary 4','active','office_entry','13000000-0000-4000-8000-000000000001');
insert into public.promotion_batches(id,source_session,target_session,source_class,status,prepared_by)
values('53000000-0000-4000-8000-000000000001','2098/2099','2099/2100','Primary 4','draft','13000000-0000-4000-8000-000000000001');
insert into public.promotion_entries(batch_id,student_id,proposed_outcome,updated_by)
values('53000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','pending','13000000-0000-4000-8000-000000000001');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','93000000-0000-4000-8000-000000000001',true);
select public.recommend_exceptional_progression('53000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','accelerated_graduate',null,'Fictional evidence for an accelerated secondary transition');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.session_id','93000000-0000-4000-8000-000000000002',true);
select public.decide_exceptional_progression('53000000-0000-4000-8000-000000000001','23000000-0000-4000-8000-000000000001','approve','Independent fictional approval');
select public.apply_promotion_batch('53000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select completion_type='accelerated_secondary_transition' from public.graduates where student_id='23000000-0000-4000-8000-000000000001'),'Accelerated graduate must have the truthful distinct completion label');
select pg_temp.assert_true(not exists(select 1 from public.student_enrolments where student_id='23000000-0000-4000-8000-000000000001' and class_code='Primary 6'),'Accelerated transition must never fabricate Primary 6 enrolment');

reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into public.portal_account_claims(id,phone_e164,full_name,intended_role,leadership_scope,position_title,status,expires_at)
values('63000000-0000-4000-8000-000000000001','+2348000000205','Fictional Claimant','admin','headmistress','Fictional Proprietress','pending',now()+interval '1 day');
insert into public.portal_account_claim_challenges(id,claim_id,request_token_hash,phone_hash,phone_last4,network_hash,channel,otp_hash,status,expires_at)
values('73000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',repeat('1',64),repeat('2',64),'0205',repeat('3',64),'whatsapp',repeat('4',64),'sent',now()+interval '5 minutes');
create temporary table verified_account_claim as
 select * from public.server_verify_portal_account_claim(repeat('1',64),repeat('4',64),repeat('5',64));
select pg_temp.assert_true((select claim_id='63000000-0000-4000-8000-000000000001' from verified_account_claim),'Correct account-claim hash must verify the intended claim');
select public.server_complete_portal_account_claim('63000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000005',repeat('5',64));
select pg_temp.assert_true((select role='admin' and leadership_scope='headmistress' and position_title='Fictional Proprietress' and must_change_password=false from public.profiles where id='13000000-0000-4000-8000-000000000005'),'Verified claim must activate only its pre-authorised role and title');
select pg_temp.assert_true((select status='completed' and setup_token_hash is null from public.portal_account_claim_challenges where id='73000000-0000-4000-8000-000000000001'),'Completed claim setup token must be destroyed');

reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000004',true);
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws('select * from public.portal_account_claims','Authenticated staff must not enumerate owner-approved claims');
select pg_temp.assert_throws('select * from public.portal_account_claim_challenges','Authenticated staff must not read claim OTP state');
select pg_temp.assert_throws('select * from public.portal_account_claim_events','Authenticated staff must not read claim OTP audit');

reset role;
rollback;
