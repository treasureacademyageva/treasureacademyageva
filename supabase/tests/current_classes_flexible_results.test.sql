-- Current active classes and flexible assessment acceptance test.
-- Fictional records only; always rolled back.
begin;

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin if not coalesce(ok,false) then raise exception 'CURRENT RESULTS TEST FAILED: %',message; end if; end $$;
create or replace function pg_temp.assert_throws(statement text,message text)
returns void language plpgsql as $$ declare blocked boolean:=false; begin
  begin execute statement; exception when others then blocked:=true; end;
  if not blocked then raise exception 'CURRENT RESULTS TEST FAILED: %',message; end if;
end $$;

set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_true((select count(*)=8 from public.class_progression where active_for_enrolment),'Exactly eight active teaching classes are required');
select pg_temp.assert_true((select not active_for_enrolment and next_class_code is null from public.class_progression where class_code='Creche'),'Creche must be retained only as an inactive historical class');
select pg_temp.assert_true((select routine_entry_class from public.class_progression where class_code='Pre-Nursery'),'Pre-Nursery must be the routine entry class');
select pg_temp.assert_true((select count(*)=0 from public.class_progression where class_code='Primary 5'),'Primary 5 must remain absent');
select pg_temp.assert_true((select next_class_code='Primary 6' from public.class_progression where class_code='Primary 4'),'Primary 4 must progress directly to Primary 6');
reset role;

insert into auth.users(id,phone,raw_user_meta_data) values
 ('13000000-0000-4000-8000-000000000001','+2348111111301','{"full_name":"Fictional Results Leader"}');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
update public.profiles set role='admin',leadership_scope='headmistress',account_status='active',must_change_password=false,active=true
 where id='13000000-0000-4000-8000-000000000001';

insert into public.students(id,full_name,sex,class_code,admission_status,active) values
 ('23000000-0000-4000-8000-000000000001','Fictional Pre-Nursery Pupil','female','Pre-Nursery','admitted',true),
 ('23000000-0000-4000-8000-000000000002','Fictional Primary Pupil','male','Primary 1','admitted',true);
select pg_temp.assert_throws(
 $$insert into public.students(full_name,sex,class_code,admission_status) values('Invalid Fictional Pupil','unknown','Primary 1','admitted')$$,
 'Pupil sex must be male, female or null');

insert into public.class_term_assessment_plans(id,class_code,session_name,term,scheme,selected_by) values
 ('53000000-0000-4000-8000-000000000001','Pre-Nursery','2099/2100','First','pre_nursery_exam_100','13000000-0000-4000-8000-000000000001'),
 ('53000000-0000-4000-8000-000000000002','Primary 1','2099/2100','First','four_entry_10_10_10_70','13000000-0000-4000-8000-000000000001');
select pg_temp.assert_throws(
 $$insert into public.class_term_assessment_plans(class_code,session_name,term,scheme,selected_by) values('Pre-Nursery','2099/2100','Second','three_entry_15_15_70','13000000-0000-4000-8000-000000000001')$$,
 'Pre-Nursery must reject CA schemes');
select pg_temp.assert_throws(
 $$insert into public.class_term_assessment_plans(class_code,session_name,term,scheme,selected_by) values('Primary 2','2099/2100','Second','pre_nursery_exam_100','13000000-0000-4000-8000-000000000001')$$,
 'Primary classes must reject examination-only scheme');

insert into public.grades(student_id,assessment_plan_id,subject,session_name,term,exam_score,recorded_by)
values('23000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','Early Learning','2099/2100','First',100,'13000000-0000-4000-8000-000000000001');
insert into public.grades(student_id,assessment_plan_id,subject,session_name,term,ca1,ca2,ca3,exam_score,recorded_by)
values('23000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000002','Mathematics','2099/2100','First',10,10,10,70,'13000000-0000-4000-8000-000000000001');
select pg_temp.assert_true((select continuous_assessment=30 from public.grades where student_id='23000000-0000-4000-8000-000000000002'),'Compatibility CA total must include CA3');
select pg_temp.assert_true((select ca1+ca2+ca3+exam_score=100 from public.grades where student_id='23000000-0000-4000-8000-000000000002'),'Four-entry total must equal 100');
select pg_temp.assert_throws(
 $$insert into public.grades(student_id,assessment_plan_id,subject,session_name,term,ca1,exam_score,recorded_by) values('23000000-0000-4000-8000-000000000001','53000000-0000-4000-8000-000000000001','Invalid CA','2099/2100','First',1,99,'13000000-0000-4000-8000-000000000001')$$,
 'Pre-Nursery must reject every CA score');
select pg_temp.assert_throws(
 $$insert into public.grades(student_id,assessment_plan_id,subject,session_name,term,ca1,ca2,ca3,exam_score,recorded_by) values('23000000-0000-4000-8000-000000000002','53000000-0000-4000-8000-000000000002','Over maximum','2099/2100','First',11,10,10,69,'13000000-0000-4000-8000-000000000001')$$,
 'A score above its obtainable mark must be rejected');
select pg_temp.assert_throws(
 $$update public.class_term_assessment_plans set scheme='three_entry_15_15_70',selection_reason='Attempt after score entry' where id='53000000-0000-4000-8000-000000000002'$$,
 'A plan must not change after score entry begins');

rollback;
