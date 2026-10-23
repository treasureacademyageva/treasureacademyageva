-- Treasure Academy RLS integration tests
-- Run ONLY in a disposable Supabase staging/test database after applying:
--   202610230001_secure_school_portal.sql
--   202610230002_portal_accounts.sql
-- The transaction always rolls back. Every identity and record is fictional.

begin;

create or replace function pg_temp.assert_true(ok boolean, message text)
returns void language plpgsql as $$
begin
  if not coalesce(ok, false) then raise exception 'RLS TEST FAILED: %', message; end if;
end;
$$;

insert into auth.users (id, phone, raw_user_meta_data)
values
  ('10000000-0000-4000-8000-000000000001', '+2348000000001', '{"full_name":"Test Admin"}'),
  ('10000000-0000-4000-8000-000000000002', '+2348000000002', '{"full_name":"Test Teacher"}'),
  ('10000000-0000-4000-8000-000000000003', '+2348000000003', '{"full_name":"Test Parent A"}'),
  ('10000000-0000-4000-8000-000000000004', '+2348000000004', '{"full_name":"Test Parent B"}'),
  ('10000000-0000-4000-8000-000000000005', '+2348000000005', '{"full_name":"Test Parent C"}');

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now(), now()),
  ('90000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', now(), now()),
  ('90000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', now(), now()),
  ('90000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', now(), now()),
  ('90000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', now(), now());

update public.profiles
   set account_status = 'active', must_change_password = false, active = true;
update public.profiles set role = 'admin'
 where id = '10000000-0000-4000-8000-000000000001';
update public.profiles set role = 'teacher'
 where id = '10000000-0000-4000-8000-000000000002';

insert into public.students (id, admission_number, full_name, class_code, parent_id, admission_status)
values
  ('20000000-0000-4000-8000-000000000001', 'TEST-A-001', 'Test Pupil A', 'Primary 1', '10000000-0000-4000-8000-000000000003', 'pending'),
  ('20000000-0000-4000-8000-000000000002', 'TEST-B-001', 'Test Pupil B', 'Primary 2', '10000000-0000-4000-8000-000000000004', 'pending');

-- Explicit office-verified relationships. parent_id alone is not authorization.
insert into public.student_guardians(
  student_id, parent_id, relationship, is_primary, active, verified_by, verified_at
)
values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000003', 'parent', true, true, '10000000-0000-4000-8000-000000000001', now()),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'parent', true, true, '10000000-0000-4000-8000-000000000001', now()),
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000005', 'guardian', false, true, '10000000-0000-4000-8000-000000000001', now());

insert into public.teacher_class_assignments (teacher_id, class_code, subject)
values ('10000000-0000-4000-8000-000000000002', 'Primary 1', 'Mathematics');

insert into public.grades (student_id, subject, session_name, term, continuous_assessment, exam_score, recorded_by, published_at)
values
  ('20000000-0000-4000-8000-000000000001', 'Mathematics', '2099/2100', 'First', 30, 50, '10000000-0000-4000-8000-000000000002', now()),
  ('20000000-0000-4000-8000-000000000001', 'English', '2099/2100', 'First', 31, 51, '10000000-0000-4000-8000-000000000001', null),
  ('20000000-0000-4000-8000-000000000002', 'Mathematics', '2099/2100', 'First', 32, 52, '10000000-0000-4000-8000-000000000001', now());

insert into public.payments (id, student_id, session_name, term, description, amount, method, status, monnify_payment_reference)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '2099/2100', 'First', 'Fictional bank record', 1000, 'bank_transfer', 'pending', null),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '2099/2100', 'First', 'Fictional other-family record', 2000, 'bank_transfer', 'pending', null),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '2099/2100', 'First', 'Fictional Monnify scaffold record', 3000, 'monnify', 'pending', 'TA-FICTIONAL-MONNIFY-001');

-- Parent A: own profile, verified child, published grade and linked payments only.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000003', true);
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'Parent A must read only own profile');
select pg_temp.assert_true((select count(*) = 1 from public.students), 'Parent A must read only verified linked child');
select pg_temp.assert_true((select count(*) = 1 from public.grades), 'Parent A must read only own published grade');
select pg_temp.assert_true((select count(*) = 2 from public.payments), 'Parent A must read only linked payments');
select pg_temp.assert_true((select count(*) = 0 from public.students where id = '20000000-0000-4000-8000-000000000002'), 'Parent A must not read Child B');
select pg_temp.assert_true((select count(*) = 0 from public.grades where subject = 'English'), 'Parent A must not read a draft grade');

do $$
declare changed integer;
begin
  update public.students set class_code = 'Primary 6'
   where id = '20000000-0000-4000-8000-000000000001';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'RLS TEST FAILED: parent updated pupil'; end if;

  update public.profiles set role = 'admin'
   where id = '10000000-0000-4000-8000-000000000003';
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'RLS TEST FAILED: parent escalated own role'; end if;
end $$;
reset role;

-- A second verified caregiver can see the shared child, then loses access as
-- soon as the relationship is deactivated.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000005', true);
select pg_temp.assert_true((select count(*) = 1 from public.students), 'Second caregiver must read the verified shared child');
select pg_temp.assert_true((select count(*) = 0 from public.students where id = '20000000-0000-4000-8000-000000000002'), 'Second caregiver must not read an unrelated child');
reset role;
update public.student_guardians
   set active = false, verified_by = null, verified_at = null
 where student_id = '20000000-0000-4000-8000-000000000001'
   and parent_id = '10000000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000005', true);
select pg_temp.assert_true((select count(*) = 0 from public.students), 'Removed caregiver must immediately lose pupil access');
reset role;

-- Teacher: assigned Primary 1 Mathematics only; never payments.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true((select count(*) = 1 from public.students), 'Teacher must read assigned class only');
select pg_temp.assert_true((select count(*) = 1 from public.grades), 'Teacher must read assigned subject only');
select pg_temp.assert_true((select count(*) = 0 from public.payments), 'Teacher must not read payments');

insert into public.grades (student_id, subject, session_name, term, continuous_assessment, exam_score, recorded_by)
values ('20000000-0000-4000-8000-000000000001', 'Mathematics', '2099/2100', 'Second', 20, 40, '10000000-0000-4000-8000-000000000002');

do $$
begin
  begin
    insert into public.grades (student_id, subject, session_name, term, continuous_assessment, exam_score, recorded_by)
    values ('20000000-0000-4000-8000-000000000001', 'English', '2099/2100', 'Second', 20, 40, '10000000-0000-4000-8000-000000000002');
    raise exception 'RLS TEST FAILED: teacher inserted unassigned subject';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;
reset role;

-- A revoked session loses access immediately even while its JWT would otherwise
-- remain unexpired.
delete from auth.sessions where id = '90000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true((select count(*) = 0 from public.students), 'Revoked teacher session must not read pupils');
select pg_temp.assert_true((select count(*) = 0 from public.teacher_class_assignments), 'Revoked teacher session must not read assignments');
select pg_temp.assert_true((select count(*) = 0 from public.grades), 'Revoked teacher session must not read grades');
reset role;

-- Admin: deliberate all-row overrides and audited admission decision.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true((select count(*) = 5 from public.profiles), 'Admin must read all test profiles');
select pg_temp.assert_true((select count(*) = 2 from public.students), 'Admin must read all test pupils');
select pg_temp.assert_true((select count(*) = 3 from public.payments), 'Admin must read all test payments');
update public.students set admission_status = 'under_review'
 where id = '20000000-0000-4000-8000-000000000001';
select pg_temp.assert_true((select count(*) = 1 from public.admission_audit_log where student_id = '20000000-0000-4000-8000-000000000001'), 'Admin admission change must be audited');
reset role;

-- Pending activation blocks records even when a former relationship still exists.
update public.profiles
   set account_status = 'pending_activation', must_change_password = true
 where id = '10000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000004', true);
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'Pending parent may read only own activation profile');
select pg_temp.assert_true((select count(*) = 0 from public.students), 'Pending parent must not read linked pupil before password change');
select pg_temp.assert_true((select count(*) = 0 from public.payments), 'Pending parent must not read payments before password change');
reset role;

-- Service-only webhook RPC: exact match, idempotent and admission-independent.
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select pg_temp.assert_true(
  (public.process_monnify_payment_event('SUCCESSFUL_TRANSACTION:MNFY|FICTIONAL|001', repeat('a', 64), 'TA-FICTIONAL-MONNIFY-001', 'MNFY|FICTIONAL|001', 3000) ->> 'outcome') = 'processed',
  'Matching webhook must process'
);
select pg_temp.assert_true(
  (public.process_monnify_payment_event('SUCCESSFUL_TRANSACTION:MNFY|FICTIONAL|001', repeat('a', 64), 'TA-FICTIONAL-MONNIFY-001', 'MNFY|FICTIONAL|001', 3000) ->> 'outcome') = 'duplicate',
  'Same event key must be idempotent'
);
select pg_temp.assert_true((select status = 'paid' from public.payments where id = '30000000-0000-4000-8000-000000000003'), 'Matching payment must become paid');
select pg_temp.assert_true((select count(*) = 1 from public.payment_audit_log where payment_id = '30000000-0000-4000-8000-000000000003'), 'Webhook must create one detailed payment audit');
select pg_temp.assert_true((select admission_status = 'under_review' from public.students where id = '20000000-0000-4000-8000-000000000001'), 'Payment must not alter admission status');
select pg_temp.assert_true(
  (public.process_monnify_payment_event('SUCCESSFUL_TRANSACTION:MNFY|FICTIONAL|UNKNOWN', repeat('b', 64), 'UNKNOWN-REFERENCE', 'MNFY|FICTIONAL|UNKNOWN', 3000) ->> 'outcome') = 'rejected',
  'Unknown payment reference must reject'
);
reset role;

rollback;
