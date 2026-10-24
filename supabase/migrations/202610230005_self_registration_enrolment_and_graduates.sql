-- Treasure Academy self-registration, permanent enrolment history and graduates
-- Date: 2026-10-23
--
-- Apply only after migrations 001-004, owner-controlled legacy exports and
-- isolated staging acceptance. This migration does not alter or retire
-- public.school_data or any former portal table. It inserts no real person.
-- Structural class rows are school rules, not pupil data.

begin;

-- Parent accounts are self-created. A new-family account remains a restricted
-- applicant until admission creates and links one permanent pupil.
alter table public.profiles
  add column if not exists parent_stage text not null default 'parent',
  add column if not exists registration_route text,
  add column if not exists self_registered_at timestamptz;

do $$
begin
  alter table public.profiles add constraint profiles_parent_stage_check
    check (
      (role = 'parent'::public.app_role and parent_stage in ('applicant', 'parent'))
      or (role <> 'parent'::public.app_role and parent_stage = 'parent')
    );
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.profiles add constraint profiles_registration_route_check
    check (registration_route is null or registration_route in (
      'school_provisioned', 'existing_pupil_code', 'second_parent_invitation',
      'new_admission_applicant'
    ));
exception when duplicate_object then null;
end $$;

alter table public.account_audit_log drop constraint if exists account_audit_log_action_check;
alter table public.account_audit_log add constraint account_audit_log_action_check check (action in (
  'account_provisioned', 'account_self_registered', 'applicant_upgraded',
  'password_reset_started', 'password_changed', 'account_status_changed',
  'sessions_revoked', 'guardian_linked', 'guardian_unlinked'
));

create table if not exists public.registration_attempts (
  id bigint generated always as identity primary key,
  phone_hash text not null check (phone_hash ~ '^[a-f0-9]{64}$'),
  network_hash text check (network_hash is null or network_hash ~ '^[a-f0-9]{64}$'),
  route text not null check (route in ('existing_pupil', 'second_parent', 'new_applicant')),
  succeeded boolean not null,
  reason_code text not null check (char_length(reason_code) between 2 and 80),
  created_at timestamptz not null default now()
);
create index if not exists registration_attempts_phone_idx
  on public.registration_attempts(phone_hash, created_at desc);
create index if not exists registration_attempts_network_idx
  on public.registration_attempts(network_hash, created_at desc)
  where network_hash is not null;

-- Exact school progression. Primary 4 moves directly to Primary 6; no other
-- class is inserted between them.
create table if not exists public.class_progression (
  class_code text primary key,
  sort_order integer not null unique,
  next_class_code text,
  active_for_enrolment boolean not null default true,
  routine_entry_class boolean not null default false,
  graduation_stage boolean not null default false,
  check (char_length(trim(class_code)) between 2 and 40),
  check (next_class_code is null or char_length(trim(next_class_code)) between 2 and 40)
);

insert into public.class_progression(
  class_code, sort_order, next_class_code, active_for_enrolment,
  routine_entry_class, graduation_stage
) values
  ('Creche', 10, 'Pre-Nursery', true, true, false),
  ('Pre-Nursery', 20, 'Nursery 1', true, false, false),
  ('Nursery 1', 30, 'Nursery 2', true, false, false),
  ('Nursery 2', 40, 'Primary 1', true, false, false),
  ('Primary 1', 50, 'Primary 2', true, false, false),
  ('Primary 2', 60, 'Primary 3', true, false, false),
  ('Primary 3', 70, 'Primary 4', true, false, false),
  ('Primary 4', 80, 'Primary 6', true, false, false),
  ('Primary 6', 90, 'Graduate Hall', true, false, false),
  ('Graduate Hall', 100, null, false, false, true)
on conflict (class_code) do update set
  sort_order = excluded.sort_order,
  next_class_code = excluded.next_class_code,
  active_for_enrolment = excluded.active_for_enrolment,
  routine_entry_class = excluded.routine_entry_class,
  graduation_stage = excluded.graduation_stage;

-- Baseline all-class entry is a temporary, auditable operation mode. It starts
-- closed and must be explicitly opened for verified cutover, then closed again.
create table if not exists public.enrolment_cutover_control (
  singleton boolean primary key default true check (singleton = true),
  baseline_open boolean not null default false,
  changed_by uuid references public.profiles(id) on delete restrict,
  change_reason text check (change_reason is null or char_length(trim(change_reason)) between 3 and 1000),
  changed_at timestamptz not null default now()
);
insert into public.enrolment_cutover_control(singleton, baseline_open)
values (true, false) on conflict (singleton) do nothing;

create or replace function public.set_initial_enrolment_cutover(p_open boolean, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Administrator and cutover reason required' using errcode = '42501';
  end if;
  update public.enrolment_cutover_control
     set baseline_open = p_open, changed_by = (select auth.uid()),
         change_reason = trim(p_reason), changed_at = now()
   where singleton = true;
end;
$$;
revoke all on function public.set_initial_enrolment_cutover(boolean, text) from public, anon;
grant execute on function public.set_initial_enrolment_cutover(boolean, text) to authenticated;

create or replace function public.is_active_school_class(p_class_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.class_progression c
     where c.class_code = trim(p_class_code) and c.active_for_enrolment = true
  ), false)
$$;
revoke all on function public.is_active_school_class(text) from public, anon;
grant execute on function public.is_active_school_class(text) to authenticated, service_role;

create or replace function public.next_school_class(p_class_code text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select c.next_class_code from public.class_progression c
   where c.class_code = trim(p_class_code)
$$;
revoke all on function public.next_school_class(text) from public, anon;
grant execute on function public.next_school_class(text) to authenticated, service_role;

create table if not exists public.student_enrolments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  session_name text not null check (char_length(trim(session_name)) between 4 and 40),
  class_code text not null references public.class_progression(class_code) on delete restrict,
  status text not null default 'active' check (status in (
    'active', 'completed', 'promoted', 'retained', 'graduated',
    'withdrawn', 'transferred_out', 'corrected'
  )),
  started_on date not null default current_date,
  ended_on date,
  source text not null default 'office_entry' check (source in (
    'initial_baseline', 'office_entry', 'admission', 'promotion', 'correction'
  )),
  recorded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_on is null or ended_on >= started_on),
  unique (student_id, session_name, class_code)
);
create unique index if not exists student_enrolments_one_current_idx
  on public.student_enrolments(student_id) where ended_on is null and status = 'active';
create index if not exists student_enrolments_class_idx
  on public.student_enrolments(session_name, class_code, status);

create table if not exists public.promotion_batches (
  id uuid primary key default gen_random_uuid(),
  source_session text not null check (char_length(trim(source_session)) between 4 and 40),
  target_session text not null check (char_length(trim(target_session)) between 4 and 40),
  source_class text not null references public.class_progression(class_code) on delete restrict,
  status text not null default 'draft' check (status in ('draft', 'applied', 'cancelled')),
  prepared_by uuid not null references public.profiles(id) on delete restrict,
  prepared_at timestamptz not null default now(),
  applied_by uuid references public.profiles(id) on delete restrict,
  applied_at timestamptz,
  note text check (note is null or char_length(note) <= 1000),
  unique (target_session, source_class)
);

create table if not exists public.promotion_entries (
  batch_id uuid not null references public.promotion_batches(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  proposed_outcome text not null check (proposed_outcome in (
    'promote', 'retain', 'graduate', 'withdraw', 'transfer_out', 'pending'
  )),
  target_class text references public.class_progression(class_code) on delete restrict,
  note text check (note is null or char_length(note) <= 1000),
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (batch_id, student_id)
);

create table if not exists public.graduates (
  student_id uuid primary key references public.students(id) on delete restrict,
  graduation_session text not null check (char_length(trim(graduation_session)) between 4 and 40),
  graduated_on date not null default current_date,
  recorded_by uuid not null references public.profiles(id) on delete restrict,
  public_status text not null default 'not_requested' check (public_status in (
    'not_requested', 'pending', 'approved', 'declined', 'revoked'
  )),
  public_name text check (public_name is null or char_length(trim(public_name)) between 2 and 120),
  public_message text check (public_message is null or char_length(public_message) <= 500),
  public_photo_path text check (public_photo_path is null or char_length(public_photo_path) <= 500),
  consent_reference text check (consent_reference is null or char_length(consent_reference) <= 160),
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (public_status <> 'approved' or (
    public_name is not null and consent_reference is not null
    and approved_by is not null and approved_at is not null
  ))
);
create index if not exists graduates_session_idx
  on public.graduates(graduation_session, graduated_on desc);

create table if not exists public.graduate_publication_events (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.graduates(student_id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  previous_status text,
  new_status text not null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.portal_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid references public.students(id) on delete cascade,
  kind text not null check (kind in (
    'promotion', 'retention', 'graduation', 'shop', 'payment',
    'restock', 'transport', 'admission', 'general'
  )),
  title text not null check (char_length(trim(title)) between 2 and 160),
  message text not null check (char_length(trim(message)) between 2 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists portal_notifications_recipient_idx
  on public.portal_notifications(recipient_id, created_at desc);

alter table public.admission_applications
  add column if not exists admission_session_name text,
  add column if not exists parent_next_step text;

do $$
begin
  alter table public.admission_applications add constraint admission_session_name_check
    check (admission_session_name is null or char_length(trim(admission_session_name)) between 4 and 40);
exception when duplicate_object then null;
end $$;

do $$
begin
  alter table public.admission_applications add constraint admission_parent_next_step_check
    check (parent_next_step is null or char_length(parent_next_step) <= 1000);
exception when duplicate_object then null;
end $$;

create table if not exists public.admission_checklist_entries (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.admission_applications(id) on delete cascade,
  label text not null check (char_length(trim(label)) between 2 and 160),
  completed boolean not null default false,
  parent_visible boolean not null default false,
  note text check (note is null or char_length(note) <= 1000),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (application_id, label)
);

create table if not exists public.admission_followups (
  id uuid primary key default gen_random_uuid(),
  application_id uuid not null references public.admission_applications(id) on delete cascade,
  followup_kind text not null check (followup_kind in ('office_contact', 'school_visit', 'information_request', 'decision_followup')),
  scheduled_at timestamptz,
  completed_at timestamptz,
  private_note text check (private_note is null or char_length(private_note) <= 2000),
  parent_note text check (parent_note is null or char_length(parent_note) <= 1000),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now()
);

create or replace function public.server_record_registration_attempt(
  p_phone_hash text,
  p_network_hash text,
  p_route text,
  p_succeeded boolean,
  p_reason_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_phone_hash !~ '^[a-f0-9]{64}$'
     or (p_network_hash is not null and p_network_hash !~ '^[a-f0-9]{64}$')
     or p_route not in ('existing_pupil', 'second_parent', 'new_applicant')
     or char_length(p_reason_code) not between 2 and 80 then
    raise exception 'Invalid registration attempt record' using errcode = '22023';
  end if;
  insert into public.registration_attempts(phone_hash, network_hash, route, succeeded, reason_code)
  values (p_phone_hash, p_network_hash, p_route, p_succeeded, p_reason_code);
end;
$$;
revoke all on function public.server_record_registration_attempt(text, text, text, boolean, text) from public, anon, authenticated;
grant execute on function public.server_record_registration_attempt(text, text, text, boolean, text) to service_role;

create or replace function public.server_self_register_account(
  p_account_id uuid,
  p_full_name text,
  p_phone_e164 text,
  p_route text,
  p_class_code text default null,
  p_registered_name text default null,
  p_code_hash text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.pupil_link_codes%rowtype;
  v_invitation public.guardian_invitations%rowtype;
  v_student public.students%rowtype;
  v_guardian_count integer;
  v_verifier uuid;
  v_stage text;
begin
  if trim(coalesce(p_full_name, '')) = '' or char_length(trim(p_full_name)) not between 2 and 120
     or p_phone_e164 !~ '^\+234[789][0-9]{9}$'
     or p_route not in ('existing_pupil', 'second_parent', 'new_applicant') then
    raise exception 'Invalid self-registration details' using errcode = '22023';
  end if;
  if not exists (select 1 from auth.users u where u.id = p_account_id and u.phone = p_phone_e164) then
    raise exception 'Matching Auth identity required' using errcode = '42501';
  end if;

  if p_route = 'new_applicant' then
    v_stage := 'applicant';
  elsif p_route = 'existing_pupil' then
    if p_code_hash !~ '^[a-f0-9]{64}$'
       or not public.is_active_school_class(coalesce(p_class_code, ''))
       or char_length(trim(coalesce(p_registered_name, ''))) not between 2 and 120 then
      raise exception 'Invalid existing-pupil registration details' using errcode = '22023';
    end if;
    select c.* into v_code from public.pupil_link_codes c
     where c.code_hash = p_code_hash for update;
    if not found or v_code.status <> 'active' or v_code.expires_at <= now() then
      raise exception 'Invalid or expired Parent Linking Code' using errcode = '22023';
    end if;
    select s.* into v_student from public.students s where s.id = v_code.student_id for update;
    if not found or v_student.active <> true
       or v_student.admission_status <> 'admitted'::public.admission_status
       or lower(trim(v_student.class_code)) <> lower(trim(p_class_code))
       or public.normalize_pupil_match_name(v_student.full_name)
          <> public.normalize_pupil_match_name(p_registered_name) then
      raise exception 'Pupil details do not match the private code' using errcode = '22023';
    end if;
    select count(*) into v_guardian_count from public.student_guardians g
     where g.student_id = v_student.id and g.active = true;
    if v_guardian_count >= 2 then
      raise exception 'This pupil already has two active parents or guardians' using errcode = '23514';
    end if;
    v_verifier := v_code.issued_by;
    v_stage := 'parent';
  else
    if p_code_hash !~ '^[a-f0-9]{64}$' then
      raise exception 'Invalid family invitation' using errcode = '22023';
    end if;
    select i.* into v_invitation from public.guardian_invitations i
     where i.code_hash = p_code_hash for update;
    if not found or v_invitation.status <> 'active' or v_invitation.expires_at <= now()
       or v_invitation.intended_phone_e164 <> p_phone_e164 then
      raise exception 'Invitation is invalid, expired or intended for another phone' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.student_guardians g
       where g.student_id = v_invitation.student_id
         and g.parent_id = v_invitation.invited_by and g.active = true
    ) then raise exception 'Inviting relationship is no longer active' using errcode = '42501'; end if;
    select count(*) into v_guardian_count from public.student_guardians g
     where g.student_id = v_invitation.student_id and g.active = true;
    if v_guardian_count >= 2 then
      raise exception 'This pupil already has two active parents or guardians' using errcode = '23514';
    end if;
    select s.* into v_student from public.students s where s.id = v_invitation.student_id for update;
    select g.verified_by into v_verifier from public.student_guardians g
     where g.student_id = v_invitation.student_id and g.parent_id = v_invitation.invited_by;
    v_stage := 'parent';
  end if;

  update public.profiles
     set role = 'parent'::public.app_role,
         parent_stage = v_stage,
         full_name = trim(p_full_name),
         phone = p_phone_e164,
         phone_e164 = p_phone_e164,
         active = true,
         account_status = 'active'::public.portal_account_status,
         must_change_password = false,
         registration_route = case p_route
           when 'existing_pupil' then 'existing_pupil_code'
           when 'second_parent' then 'second_parent_invitation'
           else 'new_admission_applicant' end,
         self_registered_at = now(),
         last_password_change_at = now(),
         updated_at = now()
   where id = p_account_id;
  if not found then raise exception 'Registration profile was not created' using errcode = 'P0002'; end if;

  if p_route in ('existing_pupil', 'second_parent') then
    insert into public.student_guardians(
      student_id, parent_id, relationship, is_primary, active, verified_by, verified_at
    ) values (
      v_student.id, p_account_id, 'parent', v_guardian_count = 0,
      true, v_verifier, now()
    )
    on conflict (student_id, parent_id) do update set
      relationship = 'parent', active = true,
      is_primary = (v_guardian_count = 0), verified_by = v_verifier,
      verified_at = now(), updated_at = now();
    if p_route = 'existing_pupil' then
      update public.pupil_link_codes set
        status = 'consumed', consumed_by = p_account_id, consumed_at = now()
       where id = v_code.id;
      insert into public.pupil_link_events(student_id, actor_id, target_parent_id, action, detail)
      values (v_student.id, p_account_id, p_account_id, 'pupil_linked', jsonb_build_object('method', 'self_registration_pupil_code'));
    else
      update public.guardian_invitations set
        status = 'consumed', consumed_by = p_account_id, consumed_at = now()
       where id = v_invitation.id;
      insert into public.pupil_link_events(student_id, actor_id, target_parent_id, action, detail)
      values (v_student.id, v_invitation.invited_by, p_account_id, 'second_guardian_linked', jsonb_build_object('method', 'self_registration_family_invitation'));
    end if;
  end if;

  insert into public.account_audit_log(actor_id, target_profile_id, action, reason_code, detail)
  values (p_account_id, p_account_id, 'account_self_registered', p_route,
    jsonb_build_object('stage', v_stage, 'linked_student', case when v_student.id is null then null else v_student.id end));
  return jsonb_build_object('account_id', p_account_id, 'stage', v_stage, 'linked', v_student.id is not null);
end;
$$;
revoke all on function public.server_self_register_account(uuid, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.server_self_register_account(uuid, text, text, text, text, text, text) to service_role;

create or replace function public.server_actor_is_active_parent(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.profiles p
     where p.id = p_actor_id
       and p.role = 'parent'::public.app_role
       and p.parent_stage = 'parent'
       and p.active = true
       and p.account_status = 'active'::public.portal_account_status
       and p.must_change_password = false
  ), false)
$$;
revoke all on function public.server_actor_is_active_parent(uuid) from public, anon, authenticated;
grant execute on function public.server_actor_is_active_parent(uuid) to service_role;

create or replace function public.current_parent_stage()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.parent_stage from public.profiles p
   where p.id = (select auth.uid())
     and public.portal_account_can_access(p.id)
     and p.role = 'parent'::public.app_role
$$;
revoke all on function public.current_parent_stage() from public, anon;
grant execute on function public.current_parent_stage() to authenticated;

create or replace function public.server_add_existing_pupil(
  p_full_name text,
  p_class_code text,
  p_session_name text,
  p_admission_number text default null,
  p_initial_baseline boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_student uuid;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  if char_length(trim(coalesce(p_full_name, ''))) not between 2 and 120
     or char_length(trim(coalesce(p_session_name, ''))) not between 4 and 40
     or not public.is_active_school_class(p_class_code) then
    raise exception 'Invalid pupil roster details' using errcode = '22023';
  end if;
  if p_initial_baseline and not coalesce((
    select c.baseline_open from public.enrolment_cutover_control c where c.singleton = true
  ), false) then
    raise exception 'Initial all-class cutover is closed' using errcode = '42501';
  end if;
  if not p_initial_baseline and trim(p_class_code) <> 'Creche' then
    raise exception 'Routine fresh roster entry is limited to Creche; use admission or promotion for other classes' using errcode = '22023';
  end if;
  insert into public.students(admission_number, full_name, class_code, parent_id, admission_status, active)
  values (nullif(trim(p_admission_number), ''), trim(p_full_name), trim(p_class_code), null, 'admitted', true)
  returning id into v_student;
  insert into public.student_enrolments(student_id, session_name, class_code, source, recorded_by)
  values (v_student, trim(p_session_name), trim(p_class_code),
    case when p_initial_baseline then 'initial_baseline' else 'office_entry' end, v_actor);
  return jsonb_build_object('student_id', v_student);
end;
$$;
revoke all on function public.server_add_existing_pupil(text, text, text, text, boolean) from public, anon;
grant execute on function public.server_add_existing_pupil(text, text, text, text, boolean) to authenticated;

create or replace function public.prepare_promotion_batch(
  p_source_session text,
  p_target_session text,
  p_source_class text,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch uuid;
  v_next text;
  v_default text;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  if trim(p_source_session) = trim(p_target_session)
     or char_length(trim(p_source_session)) not between 4 and 40
     or char_length(trim(p_target_session)) not between 4 and 40
     or not public.is_active_school_class(p_source_class) then
    raise exception 'Invalid promotion batch' using errcode = '22023';
  end if;
  v_next := public.next_school_class(p_source_class);
  if v_next is null then raise exception 'Class has no progression destination' using errcode = '22023'; end if;
  v_default := case when trim(p_source_class) = 'Primary 6' then 'graduate' else 'promote' end;
  insert into public.promotion_batches(source_session, target_session, source_class, prepared_by, note)
  values (trim(p_source_session), trim(p_target_session), trim(p_source_class), (select auth.uid()), nullif(trim(p_note), ''))
  returning id into v_batch;
  insert into public.promotion_entries(batch_id, student_id, proposed_outcome, target_class, updated_by)
  select v_batch, s.id, v_default,
         case when v_default = 'graduate' then 'Graduate Hall' else v_next end,
         (select auth.uid())
    from public.students s
    join public.student_enrolments e on e.student_id = s.id
     and e.ended_on is null and e.status = 'active'
     and e.session_name = trim(p_source_session)
     and e.class_code = trim(p_source_class)
   where s.active = true and s.admission_status = 'admitted'::public.admission_status
     and s.class_code = trim(p_source_class);
  return v_batch;
end;
$$;
revoke all on function public.prepare_promotion_batch(text, text, text, text) from public, anon;
grant execute on function public.prepare_promotion_batch(text, text, text, text) to authenticated;

create or replace function public.set_promotion_outcome(
  p_batch_id uuid,
  p_student_id uuid,
  p_outcome text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.promotion_batches%rowtype;
  v_target text;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  select * into v_batch from public.promotion_batches where id = p_batch_id for update;
  if not found or v_batch.status <> 'draft' then raise exception 'Draft promotion batch required' using errcode = '22023'; end if;
  if p_outcome not in ('promote', 'retain', 'graduate', 'withdraw', 'transfer_out', 'pending') then
    raise exception 'Invalid promotion outcome' using errcode = '22023';
  end if;
  if p_outcome = 'graduate' and v_batch.source_class <> 'Primary 6' then
    raise exception 'Only Primary 6 may graduate' using errcode = '22023';
  end if;
  v_target := case
    when p_outcome = 'promote' then public.next_school_class(v_batch.source_class)
    when p_outcome = 'retain' then v_batch.source_class
    when p_outcome = 'graduate' then 'Graduate Hall'
    else null end;
  update public.promotion_entries set
    proposed_outcome = p_outcome, target_class = v_target,
    note = nullif(trim(p_note), ''), updated_by = (select auth.uid()), updated_at = now()
   where batch_id = p_batch_id and student_id = p_student_id;
  if not found then raise exception 'Promotion entry not found' using errcode = 'P0002'; end if;
end;
$$;
revoke all on function public.set_promotion_outcome(uuid, uuid, text, text) from public, anon;
grant execute on function public.set_promotion_outcome(uuid, uuid, text, text) to authenticated;

create or replace function public.cancel_promotion_batch(p_batch_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Administrator and cancellation reason required' using errcode='42501';
  end if;
  update public.promotion_batches set status='cancelled',note=trim(p_reason)
   where id=p_batch_id and status='draft';
  if not found then raise exception 'Draft promotion batch required' using errcode='22023'; end if;
end;
$$;
revoke all on function public.cancel_promotion_batch(uuid,text) from public,anon;
grant execute on function public.cancel_promotion_batch(uuid,text) to authenticated;

create or replace function public.apply_promotion_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.promotion_batches%rowtype;
  v_entry record;
  v_count integer := 0;
  v_guardian record;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  select * into v_batch from public.promotion_batches where id = p_batch_id for update;
  if not found or v_batch.status <> 'draft' then raise exception 'Draft promotion batch required' using errcode = '22023'; end if;
  if not exists (select 1 from public.promotion_entries e where e.batch_id = p_batch_id) then
    raise exception 'Promotion preview contains no eligible pupils' using errcode = '22023';
  end if;
  if exists (select 1 from public.promotion_entries e where e.batch_id = p_batch_id and e.proposed_outcome = 'pending') then
    raise exception 'Every pupil requires a promotion outcome before confirmation' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.promotion_entries e
    join public.students s on s.id = e.student_id
    left join public.student_enrolments h on h.student_id = e.student_id
      and h.ended_on is null and h.status = 'active'
    where e.batch_id = p_batch_id and (
      s.active <> true or s.class_code <> v_batch.source_class
      or h.id is null or h.session_name <> v_batch.source_session
      or h.class_code <> v_batch.source_class
    )
  ) then
    raise exception 'Pupil class or enrolment history changed after preview; prepare a new batch' using errcode = '40001';
  end if;
  for v_entry in
    select e.*, s.full_name from public.promotion_entries e
    join public.students s on s.id = e.student_id
    where e.batch_id = p_batch_id order by s.full_name for update of e, s
  loop
    update public.student_enrolments set
      status = case v_entry.proposed_outcome
        when 'promote' then 'promoted'
        when 'retain' then 'retained'
        when 'graduate' then 'graduated'
        when 'withdraw' then 'withdrawn'
        else 'transferred_out' end,
      ended_on = current_date, updated_at = now()
     where student_id = v_entry.student_id and ended_on is null and status = 'active';

    if v_entry.proposed_outcome in ('promote', 'retain') then
      update public.students set class_code = v_entry.target_class, active = true, updated_at = now()
       where id = v_entry.student_id;
      insert into public.student_enrolments(student_id, session_name, class_code, source, recorded_by)
      values (v_entry.student_id, v_batch.target_session, v_entry.target_class, 'promotion', (select auth.uid()));
    elsif v_entry.proposed_outcome = 'graduate' then
      update public.students set class_code = 'Graduate Hall', active = false, updated_at = now()
       where id = v_entry.student_id;
      insert into public.graduates(student_id, graduation_session, graduated_on, recorded_by)
      values (v_entry.student_id, v_batch.target_session, current_date, (select auth.uid()))
      on conflict (student_id) do update set
        graduation_session = excluded.graduation_session,
        graduated_on = excluded.graduated_on,
        recorded_by = excluded.recorded_by,
        updated_at = now();
    else
      update public.students set active = false, updated_at = now() where id = v_entry.student_id;
    end if;

    for v_guardian in select g.parent_id from public.student_guardians g
      where g.student_id = v_entry.student_id and g.active = true
    loop
      insert into public.portal_notifications(recipient_id, student_id, kind, title, message)
      values (
        v_guardian.parent_id, v_entry.student_id,
        case v_entry.proposed_outcome when 'promote' then 'promotion' when 'retain' then 'retention' when 'graduate' then 'graduation' else 'general' end,
        case v_entry.proposed_outcome
          when 'promote' then 'Class promotion confirmed'
          when 'retain' then 'Class placement confirmed'
          when 'graduate' then 'Graduation confirmed'
          else 'Pupil record updated' end,
        case v_entry.proposed_outcome
          when 'promote' then v_entry.full_name || ' has moved to ' || v_entry.target_class || ' for ' || v_batch.target_session || '.'
          when 'retain' then v_entry.full_name || ' remains in ' || v_entry.target_class || ' for ' || v_batch.target_session || '.'
          when 'graduate' then v_entry.full_name || ' is now listed privately in Your Graduates for ' || v_batch.target_session || '.'
          when 'withdraw' then v_entry.full_name || ' is no longer on the active class roster.'
          else v_entry.full_name || ' has been recorded as transferred out.' end
      );
    end loop;
    v_count := v_count + 1;
  end loop;
  update public.promotion_batches set status = 'applied', applied_by = (select auth.uid()), applied_at = now()
   where id = p_batch_id;
  return jsonb_build_object('batch_id', p_batch_id, 'applied_count', v_count);
end;
$$;
revoke all on function public.apply_promotion_batch(uuid) from public, anon;
grant execute on function public.apply_promotion_batch(uuid) to authenticated;

create or replace function public.guard_admission_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_stage text;
  v_student_id uuid;
begin
  if coalesce((select auth.role()), '') = 'service_role' or session_user in ('postgres', 'supabase_admin') then return new; end if;
  v_role := public.current_user_role();
  v_stage := public.current_parent_stage();
  if tg_op = 'INSERT' then
    if v_role <> 'parent'::public.app_role or v_stage not in ('applicant', 'parent') then
      raise exception 'Active applicant or parent account required' using errcode = '42501';
    end if;
    if not public.is_active_school_class(new.requested_class) then
      raise exception 'Choose an active school class' using errcode = '22023';
    end if;
    if v_stage = 'applicant' and exists (
      select 1 from public.admission_applications a
       where a.parent_id = (select auth.uid()) and a.status not in ('declined','withdrawn')
    ) then
      raise exception 'Restricted applicants may keep one active family application' using errcode = '23514';
    end if;
    new.parent_id := (select auth.uid());
    new.status := 'pending'::public.admission_status;
    new.decision_note := null; new.decided_by := null; new.decided_at := null;
    new.student_id := null; new.admission_session_name := null; new.parent_next_step := null;
  else
    if v_role <> 'admin'::public.app_role then raise exception 'Administrator admission decision required' using errcode = '42501'; end if;
    if new.id is distinct from old.id or new.application_reference is distinct from old.application_reference
       or new.parent_id is distinct from old.parent_id or new.child_name is distinct from old.child_name
       or new.requested_class is distinct from old.requested_class or new.parent_note is distinct from old.parent_note
       or new.submitted_at is distinct from old.submitted_at or new.student_id is distinct from old.student_id
       or new.decided_by is distinct from old.decided_by or new.decided_at is distinct from old.decided_at then
      raise exception 'Application identity and applicant details are immutable' using errcode = '42501';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'pending' and new.status in ('under_review','declined','withdrawn'))
      or (old.status = 'under_review' and new.status in ('offered','declined','withdrawn'))
      or (old.status = 'offered' and new.status in ('admitted','declined','withdrawn'))
    ) then raise exception 'Invalid admission application transition' using errcode = '22023'; end if;
    if new.status is distinct from old.status and nullif(trim(coalesce(new.decision_note, '')), '') is null then
      raise exception 'A decision note is required for every status transition' using errcode = '22023';
    end if;
    if new.status is distinct from old.status then
      new.decided_by := (select auth.uid()); new.decided_at := now();
    end if;
    if new.status = 'admitted' and old.status <> new.status then
      if char_length(trim(coalesce(new.admission_session_name, ''))) not between 4 and 40 then
        raise exception 'Admission session is required before creating the pupil' using errcode = '22023';
      end if;
      if exists (
        select 1 from public.students s join public.student_guardians g on g.student_id = s.id
         where g.parent_id = old.parent_id and g.active = true and s.active = true
           and lower(trim(s.class_code)) = lower(trim(old.requested_class))
           and public.normalize_pupil_match_name(s.full_name) = public.normalize_pupil_match_name(old.child_name)
      ) then raise exception 'This parent already has a matching linked pupil' using errcode = '23505'; end if;
      insert into public.students(admission_number, full_name, class_code, parent_id, admission_status, active)
      values (null, old.child_name, old.requested_class, null, 'admitted', true)
      returning id into v_student_id;
      insert into public.student_guardians(student_id, parent_id, relationship, is_primary, active, verified_by, verified_at)
      values (v_student_id, old.parent_id, 'parent', true, true, (select auth.uid()), now());
      insert into public.student_enrolments(student_id, session_name, class_code, source, recorded_by)
      values (v_student_id, trim(new.admission_session_name), old.requested_class, 'admission', (select auth.uid()));
      update public.profiles set parent_stage = 'parent', updated_at = now()
       where id = old.parent_id and parent_stage = 'applicant';
      if found then
        insert into public.account_audit_log(actor_id, target_profile_id, action, reason_code, detail)
        values ((select auth.uid()), old.parent_id, 'applicant_upgraded', 'admission_approved', jsonb_build_object('student_id', v_student_id));
      end if;
      new.student_id := v_student_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_admission_application() from public, anon, authenticated;

create or replace function public.audit_graduate_publication()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.public_status is distinct from old.public_status then
    insert into public.graduate_publication_events(student_id, actor_id, previous_status, new_status)
    values (new.student_id, (select auth.uid()), old.public_status, new.public_status);
  end if;
  return new;
end;
$$;
revoke all on function public.audit_graduate_publication() from public, anon, authenticated;

drop trigger if exists student_enrolments_touch_updated_at on public.student_enrolments;
create trigger student_enrolments_touch_updated_at before update on public.student_enrolments
for each row execute function public.portal_touch_updated_at();
drop trigger if exists graduates_touch_updated_at on public.graduates;
create trigger graduates_touch_updated_at before update on public.graduates
for each row execute function public.portal_touch_updated_at();
drop trigger if exists graduates_publication_audit on public.graduates;
create trigger graduates_publication_audit after update of public_status on public.graduates
for each row execute function public.audit_graduate_publication();
drop trigger if exists admission_checklist_touch_updated_at on public.admission_checklist_entries;
create trigger admission_checklist_touch_updated_at before update on public.admission_checklist_entries
for each row execute function public.portal_touch_updated_at();

create or replace function public.list_public_graduates()
returns table(public_name text, graduation_session text, public_message text)
language sql
stable
security definer
set search_path = ''
as $$
  select g.public_name, g.graduation_session, g.public_message
    from public.graduates g
   where g.public_status = 'approved'
     and g.published_at is not null
     and g.consent_reference is not null
     and g.public_name is not null
   order by g.graduation_session desc, g.public_name
   limit 100
$$;
revoke all on function public.list_public_graduates() from public;
grant execute on function public.list_public_graduates() to anon, authenticated;

create or replace function public.parent_portal_students()
returns table(id uuid,admission_number text,full_name text,class_code text,admission_status text,active boolean)
language sql
stable
security definer
set search_path=''
as $$
  select s.id,s.admission_number,s.full_name,s.class_code,s.admission_status::text,s.active
    from public.students s
   where public.parent_can_access_student(s.id)
   order by s.full_name
$$;
revoke all on function public.parent_portal_students() from public,anon;
grant execute on function public.parent_portal_students() to authenticated;

create or replace function public.parent_admission_applications()
returns table(
  id uuid,application_reference text,child_name text,requested_class text,parent_note text,
  status text,decision_note text,decided_at timestamptz,student_id uuid,
  admission_session_name text,parent_next_step text,submitted_at timestamptz,updated_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select a.id,a.application_reference,a.child_name,a.requested_class,a.parent_note,
         a.status::text,a.decision_note,a.decided_at,a.student_id,
         a.admission_session_name,a.parent_next_step,a.submitted_at,a.updated_at
    from public.admission_applications a
   where a.parent_id=(select auth.uid())
     and public.portal_session_is_current()
   order by a.submitted_at
$$;
revoke all on function public.parent_admission_applications() from public,anon;
grant execute on function public.parent_admission_applications() to authenticated;

create or replace function public.parent_graduates()
returns table(student_id uuid,graduation_session text,graduated_on date,public_status text)
language sql
stable
security definer
set search_path=''
as $$
  select g.student_id,g.graduation_session,g.graduated_on,g.public_status
    from public.graduates g
   where public.parent_can_access_student(g.student_id)
   order by g.graduated_on desc
$$;
revoke all on function public.parent_graduates() from public,anon;
grant execute on function public.parent_graduates() to authenticated;

create or replace function public.parent_admission_checklist_entries()
returns table(id uuid,application_id uuid,label text,completed boolean,note text,created_at timestamptz,updated_at timestamptz)
language sql
stable
security definer
set search_path=''
as $$
  select e.id,e.application_id,e.label,e.completed,e.note,e.created_at,e.updated_at
    from public.admission_checklist_entries e
    join public.admission_applications a on a.id=e.application_id
   where a.parent_id=(select auth.uid()) and e.parent_visible=true
     and public.portal_account_can_access((select auth.uid()))
   order by e.created_at
$$;
revoke all on function public.parent_admission_checklist_entries() from public,anon;
grant execute on function public.parent_admission_checklist_entries() to authenticated;

alter table public.registration_attempts enable row level security;
alter table public.class_progression enable row level security;
alter table public.enrolment_cutover_control enable row level security;
alter table public.student_enrolments enable row level security;
alter table public.promotion_batches enable row level security;
alter table public.promotion_entries enable row level security;
alter table public.graduates enable row level security;
alter table public.graduate_publication_events enable row level security;
alter table public.portal_notifications enable row level security;
alter table public.admission_checklist_entries enable row level security;
alter table public.admission_followups enable row level security;

create policy class_progression_public_read on public.class_progression for select
using (active_for_enrolment = true or class_code = 'Graduate Hall');
create policy enrolment_cutover_admin_select on public.enrolment_cutover_control for select to authenticated
using ((select public.is_admin()));
create policy enrolments_select on public.student_enrolments for select to authenticated
using ((select public.is_admin()));
create policy promotion_batches_admin_select on public.promotion_batches for select to authenticated
using ((select public.is_admin()));
create policy promotion_entries_admin_select on public.promotion_entries for select to authenticated
using ((select public.is_admin()));
create policy graduates_select on public.graduates for select to authenticated
using ((select public.is_admin()));
create policy graduates_admin_update on public.graduates for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy graduate_events_admin_select on public.graduate_publication_events for select to authenticated
using ((select public.is_admin()));
create policy notifications_own_select on public.portal_notifications for select to authenticated
using (recipient_id = (select auth.uid()) and public.portal_account_can_access((select auth.uid())));
create policy notifications_own_update on public.portal_notifications for update to authenticated
using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
drop policy if exists admission_applications_select on public.admission_applications;
create policy admission_applications_select on public.admission_applications for select to authenticated
using ((select public.is_admin()));
drop policy if exists admission_application_events_select on public.admission_application_events;
create policy admission_application_events_select on public.admission_application_events for select to authenticated
using ((select public.is_admin()));

create policy admission_checklist_select on public.admission_checklist_entries for select to authenticated
using ((select public.is_admin()));
create policy admission_checklist_admin_write on public.admission_checklist_entries for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy admission_followups_select on public.admission_followups for select to authenticated
using ((select public.is_admin()));
create policy admission_followups_admin_write on public.admission_followups for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

revoke all on table public.registration_attempts from anon, authenticated;
revoke all on sequence public.registration_attempts_id_seq from anon, authenticated;
grant select on table public.class_progression to anon, authenticated;
grant select on table public.enrolment_cutover_control to authenticated;
grant select on table public.student_enrolments, public.promotion_batches,
  public.promotion_entries, public.graduates, public.graduate_publication_events,
  public.portal_notifications, public.admission_checklist_entries,
  public.admission_followups to authenticated;
grant update(public_status, public_name, public_message, public_photo_path,
  consent_reference, approved_by, approved_at, published_at, updated_at)
  on public.graduates to authenticated;
grant update(read_at) on public.portal_notifications to authenticated;
grant select, insert, update on public.admission_checklist_entries to authenticated;
grant select, insert, update on public.admission_followups to authenticated;
revoke all on sequence public.graduate_publication_events_id_seq from anon, authenticated;

comment on column public.profiles.parent_stage is 'Restricted applicant until admission or a valid private pupil/family credential establishes parent access.';
comment on table public.student_enrolments is 'Append-only session/class history. Promotion closes one row and creates the next without replacing the pupil.';
comment on table public.graduates is 'Private Graduate Hall record. Public fields require separate consent-controlled approval.';
comment on function public.list_public_graduates() is 'Minimal consent-approved public graduate projection: display name, graduation session and optional message only.';

-- public.school_data and all former portal/shop tables remain untouched.
commit;
