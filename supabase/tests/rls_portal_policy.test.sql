-- Treasure Academy RLS integration tests
-- Run ONLY in a disposable Supabase staging/test database after applying all
-- seven migrations through 202610240001, in exact filename order.
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
  ('10000000-0000-4000-8000-000000000005', '+2348000000005', '{"full_name":"Test Parent C"}'),
  ('10000000-0000-4000-8000-000000000006', '+2348000000006', '{"full_name":"Test Assistant Headmistress"}');

insert into auth.sessions (id, user_id, created_at, updated_at)
values
  ('90000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', now(), now()),
  ('90000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', now(), now()),
  ('90000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000003', now(), now()),
  ('90000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000004', now(), now()),
  ('90000000-0000-4000-8000-000000000005', '10000000-0000-4000-8000-000000000005', now(), now()),
  ('90000000-0000-4000-8000-000000000006', '10000000-0000-4000-8000-000000000006', now(), now());

select set_config('request.jwt.claim.role', 'service_role', true);

update public.profiles p
   set account_status = 'active', must_change_password = false, active = true,
       phone = u.phone, phone_e164 = u.phone
  from auth.users u
 where u.id = p.id;
update public.profiles set role = 'admin', leadership_scope = 'headmistress'
 where id = '10000000-0000-4000-8000-000000000001';
update public.profiles set role = 'teacher'
 where id = '10000000-0000-4000-8000-000000000002';
update public.profiles set role = 'admin', leadership_scope = 'assistant_headmistress'
 where id = '10000000-0000-4000-8000-000000000006';

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
values
  ('10000000-0000-4000-8000-000000000002', 'Primary 1', 'Mathematics'),
  ('10000000-0000-4000-8000-000000000001', 'Primary 1', '*'),
  ('10000000-0000-4000-8000-000000000006', 'Primary 2', '*');

insert into public.grades (student_id, subject, session_name, term, continuous_assessment, exam_score, recorded_by, published_at, workflow_status)
values
  ('20000000-0000-4000-8000-000000000001', 'Mathematics', '2099/2100', 'First', 30, 50, '10000000-0000-4000-8000-000000000002', now(), 'published'),
  ('20000000-0000-4000-8000-000000000001', 'English', '2099/2100', 'First', 31, 51, '10000000-0000-4000-8000-000000000001', null, 'draft'),
  ('20000000-0000-4000-8000-000000000002', 'Mathematics', '2099/2100', 'First', 32, 52, '10000000-0000-4000-8000-000000000001', now(), 'published'),
  ('20000000-0000-4000-8000-000000000001', 'English', '2099/2100', 'Second', 30, 50, '10000000-0000-4000-8000-000000000001', null, 'submitted');

insert into public.payments (id, student_id, session_name, term, description, amount, method, status, monnify_payment_reference)
values
  ('30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '2099/2100', 'First', 'Fictional bank record', 1000, 'bank_transfer', 'pending', null),
  ('30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000002', '2099/2100', 'First', 'Fictional other-family record', 2000, 'bank_transfer', 'pending', null),
  ('30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', '2099/2100', 'First', 'Fictional Monnify scaffold record', 3000, 'monnify', 'pending', 'TA-FICTIONAL-MONNIFY-001');
select set_config('request.jwt.claim.role', '', true);

-- Parent A: own profile, verified child, published grade and linked payments only.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000003', true);
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'Parent A must read only own profile');
select pg_temp.assert_true((select count(*) = 1 from public.parent_portal_students()), 'Parent A must read only verified linked child');
select pg_temp.assert_true((select count(*) = 1 from public.grades), 'Parent A must read only own published grade');
select pg_temp.assert_true((select count(*) = 2 from public.payments), 'Parent A must read only linked payments');
select pg_temp.assert_true((select count(*) = 0 from public.parent_portal_students() where id = '20000000-0000-4000-8000-000000000002'), 'Parent A must not read Child B');
select pg_temp.assert_true((select count(*) = 0 from public.grades where subject = 'English'), 'Parent A must not read a draft grade');
insert into public.admission_applications(application_reference, child_name, requested_class, parent_note)
values ('TA-ADM-20990110-ABCD2345', 'Fictional New Applicant', 'Primary 3', 'Staging-only application.');
select pg_temp.assert_true((select count(*) = 1 from public.parent_admission_applications()), 'Parent must read the submitted application only through the safe projection');

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
select pg_temp.assert_true((select count(*) = 1 from public.parent_portal_students()), 'Second caregiver must read the verified shared child');
select pg_temp.assert_true((select count(*) = 0 from public.parent_portal_students() where id = '20000000-0000-4000-8000-000000000002'), 'Second caregiver must not read an unrelated child');
reset role;
update public.student_guardians
   set active = false, verified_by = null, verified_at = null
 where student_id = '20000000-0000-4000-8000-000000000001'
   and parent_id = '10000000-0000-4000-8000-000000000005';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000005', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000005', true);
select pg_temp.assert_true((select count(*) = 0 from public.parent_portal_students()), 'Removed caregiver must immediately lose pupil access');
reset role;

-- Teacher: assigned Primary 1 Mathematics only; never payments.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000002', true);
select pg_temp.assert_true((select count(*) = 1 from public.students), 'Teacher must read assigned class only');
select pg_temp.assert_true((select count(*) = 1 from public.grades), 'Teacher must read assigned subject only');
select pg_temp.assert_true((select count(*) = 0 from public.payments), 'Teacher must not read payments');

insert into public.grades (student_id, subject, session_name, term, ca1, ca2, exam_score, recorded_by)
values ('20000000-0000-4000-8000-000000000001', 'Mathematics', '2099/2100', 'Second', 10, 10, 40, '10000000-0000-4000-8000-000000000002');
update public.grades set workflow_status = 'submitted'
 where student_id = '20000000-0000-4000-8000-000000000001'
   and subject = 'Mathematics' and term = 'Second';

insert into public.attendance_sessions(id, class_code, attendance_date)
values ('40000000-0000-4000-8000-000000000001', 'Primary 1', date '2099-01-10');
insert into public.attendance_entries(session_id, student_id, mark)
values ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'present');
insert into public.homework_assignments(class_code, subject, title, instructions, assigned_on, due_on, status)
values ('Primary 1', 'Mathematics', 'Fictional practice', 'Complete fictional questions offline.', date '2099-01-10', date '2099-01-11', 'published');
select pg_temp.assert_true((select count(*) = 1 from public.attendance_sessions), 'Teacher must read assigned-class attendance');
select pg_temp.assert_true((select count(*) = 1 from public.homework_assignments), 'Teacher must create assigned-class homework');

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

-- Fictional public and sensitive requests for leadership-scope checks.
insert into public.website_requests(
  request_reference, tracking_hash, request_type, submitter_name, phone_e164, subject, message, source
) values
  ('TA-REQ-20990110-ABCD2345', repeat('a', 64), 'general', 'Fictional Requester', '+2348000000007', 'Fictional general request', 'Test request only.', 'website'),
  ('TA-REQ-20990110-EFGH6789', repeat('b', 64), 'safeguarding', 'Fictional Private Requester', '+2348000000008', 'Fictional sensitive request', 'Test sensitive request only.', 'website');

-- Assistant Headmistress: broad operations and result review, but no sensitive
-- request, account/class-scope administration, publication or result self-review.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000006', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000006', true);
select pg_temp.assert_true((select count(*) = 1 from public.website_requests), 'Assistant must see only non-sensitive operations requests');
update public.grades set workflow_status = 'under_review'
 where student_id = '20000000-0000-4000-8000-000000000001'
   and subject = 'Mathematics' and term = 'Second';
update public.grades set workflow_status = 'approved'
 where student_id = '20000000-0000-4000-8000-000000000001'
   and subject = 'Mathematics' and term = 'Second';
-- The Assistant independently reviews the Headmistress's My Class submission.
update public.grades set workflow_status = 'under_review'
 where student_id = '20000000-0000-4000-8000-000000000001'
   and subject = 'English' and term = 'Second';
update public.grades set workflow_status = 'approved'
 where student_id = '20000000-0000-4000-8000-000000000001'
   and subject = 'English' and term = 'Second';
-- The Assistant also retains an independently assigned My Class workspace.
insert into public.grades (student_id, subject, session_name, term, ca1, ca2, exam_score, recorded_by)
values ('20000000-0000-4000-8000-000000000002', 'Mathematics', '2099/2100', 'Second', 11, 12, 43, '10000000-0000-4000-8000-000000000006');
update public.grades set workflow_status = 'submitted'
 where student_id = '20000000-0000-4000-8000-000000000002'
   and subject = 'Mathematics' and term = 'Second';
update public.students set admission_status = 'under_review'
 where id = '20000000-0000-4000-8000-000000000002';
insert into public.verified_public_information(topic, title, summary, status, revision)
values ('calendar', 'Fictional calendar notice', 'Fictional staging-only publication.', 'published', 'TA-INFO-20990110-ABC234');
do $$
begin
  begin
    insert into public.verified_public_information(topic, title, summary, status, revision)
    values ('calendar', 'Conflicting calendar notice', 'Must not become a second current answer.', 'published', 'TA-INFO-20990110-XYZ789');
    raise exception 'RLS TEST FAILED: two published revisions exist for one public-information topic';
  exception when unique_violation then null;
  end;
end $$;
select pg_temp.assert_true((select count(*) = 1 from public.public_information_events), 'Assistant publication must be audit-recorded');
update public.admission_applications set status = 'under_review', decision_note = 'Fictional review started.'
 where application_reference = 'TA-ADM-20990110-ABCD2345';
update public.admission_applications set status = 'offered', decision_note = 'Fictional offer recorded.', admission_session_name = '2099/2100', parent_next_step = 'Complete the fictional office verification checklist.'
 where application_reference = 'TA-ADM-20990110-ABCD2345';
update public.admission_applications set status = 'admitted', decision_note = 'Fictional admission approved.'
 where application_reference = 'TA-ADM-20990110-ABCD2345';
select pg_temp.assert_true((select count(*) = 4 from public.admission_application_events), 'Parent submission and Assistant admission decisions must be audit-recorded');
select pg_temp.assert_true((select student_id is not null from public.admission_applications where application_reference = 'TA-ADM-20990110-ABCD2345'), 'Approved application must create one permanent pupil');

do $$
begin
  begin
    update public.grades set workflow_status = 'published'
     where student_id = '20000000-0000-4000-8000-000000000001'
       and subject = 'Mathematics' and term = 'Second';
    raise exception 'RLS TEST FAILED: assistant published a result';
  exception when insufficient_privilege or check_violation or invalid_parameter_value then null;
  end;
  begin
    update public.grades set workflow_status = 'under_review'
     where student_id = '20000000-0000-4000-8000-000000000002'
       and subject = 'Mathematics' and term = 'Second';
    raise exception 'RLS TEST FAILED: assistant reviewed own result';
  exception when insufficient_privilege or check_violation or invalid_parameter_value then null;
  end;
  begin
    update public.grades set submitted_at = now() - interval '1 day'
     where student_id = '20000000-0000-4000-8000-000000000001'
       and subject = 'Mathematics' and term = 'Second';
    raise exception 'RLS TEST FAILED: assistant altered database-managed result metadata';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    insert into public.teacher_class_assignments(teacher_id, class_code, subject)
    values ('10000000-0000-4000-8000-000000000002', 'Primary 2', '*');
    raise exception 'RLS TEST FAILED: assistant changed teacher scope';
  exception when insufficient_privilege or check_violation then null;
  end;
  begin
    insert into public.leadership_section_records(section, title, detail)
    values ('settings', 'Fictional assistant setting', 'Must be denied.');
    raise exception 'RLS TEST FAILED: assistant opened Headmistress-only settings';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;
reset role;

-- Admin: Headmistress all-row overrides, sensitive operations visibility and
-- final publication, plus an independently audited admission decision.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000001', true);
select pg_temp.assert_true((select count(*) = 6 from public.profiles), 'Headmistress must read all test profiles');
select pg_temp.assert_true((select count(*) = 3 from public.students), 'Headmistress must read existing and newly admitted test pupils');
select pg_temp.assert_true((select count(*) = 3 from public.payments), 'Headmistress must read all test payments');
select pg_temp.assert_true((select count(*) = 2 from public.website_requests), 'Headmistress must see sensitive and ordinary requests');
insert into public.leadership_section_records(section, title, detail, status)
values ('settings', 'Fictional protected setting', 'Staging-only leadership record.', 'active');
select pg_temp.assert_true((select count(*) = 1 from public.leadership_section_events), 'Headmistress-only section changes must be audited');
update public.students set admission_status = 'under_review'
 where id = '20000000-0000-4000-8000-000000000001';
update public.grades set workflow_status = 'published'
 where student_id = '20000000-0000-4000-8000-000000000001'
   and subject = 'Mathematics' and term = 'Second';
-- The Headmistress may publish her own class entry only after the Assistant's
-- independent approval, but reviews the Assistant's class entry herself.
update public.grades set workflow_status = 'published'
 where student_id = '20000000-0000-4000-8000-000000000001'
   and subject = 'English' and term = 'Second';
update public.grades set workflow_status = 'under_review'
 where student_id = '20000000-0000-4000-8000-000000000002'
   and subject = 'Mathematics' and term = 'Second';
update public.grades set workflow_status = 'approved'
 where student_id = '20000000-0000-4000-8000-000000000002'
   and subject = 'Mathematics' and term = 'Second';
update public.grades set workflow_status = 'published'
 where student_id = '20000000-0000-4000-8000-000000000002'
   and subject = 'Mathematics' and term = 'Second';
select pg_temp.assert_true((select workflow_status = 'published' from public.grades where student_id = '20000000-0000-4000-8000-000000000001' and subject = 'Mathematics' and term = 'Second'), 'Headmistress must publish only the approved teacher result');
select pg_temp.assert_true((select workflow_status = 'published' from public.grades where student_id = '20000000-0000-4000-8000-000000000001' and subject = 'English' and term = 'Second'), 'Headmistress My Class result must require independent Assistant approval');
select pg_temp.assert_true((select workflow_status = 'published' from public.grades where student_id = '20000000-0000-4000-8000-000000000002' and subject = 'Mathematics' and term = 'Second'), 'Headmistress must review and publish the Assistant result');
do $$
begin
  begin
    update public.verified_public_information set title = 'Silently changed published wording'
     where revision = 'TA-INFO-20990110-ABC234';
    raise exception 'RLS TEST FAILED: published information changed without a new revision';
  exception when insufficient_privilege or check_violation then null;
  end;
end $$;
update public.verified_public_information set status = 'archived'
 where revision = 'TA-INFO-20990110-ABC234';
select pg_temp.assert_true((select count(*) = 2 from public.public_information_events where revision = 'TA-INFO-20990110-ABC234'), 'Publication and archival decisions must both be audited');
select pg_temp.assert_true((select count(*) = 1 from public.admission_audit_log where student_id = '20000000-0000-4000-8000-000000000001'), 'Headmistress admission change must be audited');
reset role;

-- Pending activation blocks records even when a former relationship still exists.
select set_config('request.jwt.claim.role', 'service_role', true);
update public.profiles
   set account_status = 'pending_activation', must_change_password = true
 where id = '10000000-0000-4000-8000-000000000004';
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000004', true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select set_config('request.jwt.claim.session_id', '90000000-0000-4000-8000-000000000004', true);
select pg_temp.assert_true((select count(*) = 1 from public.profiles), 'Pending parent may read only own activation profile');
select pg_temp.assert_true((select count(*) = 0 from public.parent_portal_students()), 'Pending parent must not read linked pupil before password change');
select pg_temp.assert_true((select count(*) = 0 from public.payments), 'Pending parent must not read payments before password change');
reset role;

-- Service-only webhook RPC: exact match, idempotent and admission-independent.
set local role service_role;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'service_role', true);
select pg_temp.assert_true(public.server_actor_is_admin('10000000-0000-4000-8000-000000000001'), 'Headmistress must pass the trusted account-management capability');
select pg_temp.assert_true(not public.server_actor_is_admin('10000000-0000-4000-8000-000000000006'), 'Assistant must fail the Headmistress-only account-management capability');

-- Existing-pupil linking is automatic only with the school-issued hash-only
-- credential. A separate phone-bound invitation adds the second and final parent.
insert into public.students(id, admission_number, full_name, class_code, parent_id, admission_status, active)
values ('20000000-0000-4000-8000-000000000003', null, 'Fictional Existing Pupil', 'Primary 3', null, 'admitted', true);
select public.server_issue_pupil_link_code(
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000003', repeat('c', 64), now() + interval '30 days'
);
select pg_temp.assert_true(
  (public.server_parent_match_pupil('10000000-0000-4000-8000-000000000005', 'Primary 3', '  FICTIONAL existing-pupil ') ->> 'matched')::boolean,
  'Normalised typed name and selected class must locate an existing pupil without returning a roster'
);
select pg_temp.assert_true(
  (public.server_redeem_pupil_link_code('10000000-0000-4000-8000-000000000005', 'Primary 3', 'Fictional Existing Pupil', repeat('c', 64)) ->> 'linked')::boolean,
  'Valid one-time pupil code must create the first parent link'
);
select pg_temp.assert_true(
  (select status = 'consumed' and consumed_by = '10000000-0000-4000-8000-000000000005' from public.pupil_link_codes where student_id = '20000000-0000-4000-8000-000000000003'),
  'Pupil linking code must be consumed once'
);
select public.server_create_second_guardian_invitation(
  '10000000-0000-4000-8000-000000000005',
  '20000000-0000-4000-8000-000000000003', '+2348000000003', repeat('d', 64), now() + interval '2 days'
);
select pg_temp.assert_true(
  (public.server_redeem_second_guardian_invitation('10000000-0000-4000-8000-000000000003', repeat('d', 64)) ->> 'linked')::boolean,
  'Phone-bound invitation must create the second parent link'
);
select pg_temp.assert_true(
  (select count(*) = 2 from public.student_guardians where student_id = '20000000-0000-4000-8000-000000000003' and active = true),
  'Exactly two active parents must be linked'
);
do $$
begin
  begin
    insert into public.student_guardians(student_id, parent_id, relationship, active, verified_by, verified_at)
    values ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000004', 'parent', true, '10000000-0000-4000-8000-000000000001', now());
    raise exception 'RLS TEST FAILED: third parent linked to one pupil';
  exception when check_violation then null;
  end;
end $$;

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
