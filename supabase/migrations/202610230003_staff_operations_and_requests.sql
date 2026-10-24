-- Treasure Academy staff operations, leadership scope and website verification centre
-- Date: 2026-10-23
--
-- Apply only after migrations 001 and 002, an owner-controlled export, and
-- staging acceptance. This migration does not insert people, pupils, scores,
-- payments or public claims. It does not alter or retire public.school_data.

begin;

-- One administrator account can also be a class teacher. Leadership scope is
-- independent from role and class assignment.
do $$
begin
  create type public.leadership_scope as enum ('none', 'assistant_headmistress', 'headmistress');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.result_workflow_status as enum (
    'draft', 'submitted', 'under_review', 'returned', 'approved', 'published', 'locked'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.attendance_mark as enum ('present', 'absent', 'late', 'excused');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.staff_record_status as enum ('draft', 'submitted', 'locked');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.homework_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.website_request_type as enum (
    'general', 'admission', 'school_visit', 'class_enquiry', 'fee_schedule',
    'calendar', 'transport', 'uniform', 'supplies', 'pta', 'event',
    'lost_property', 'receipt_verification', 'school_record', 'alumni_update',
    'website_problem', 'safeguarding', 'private_feedback', 'testimonial_permission',
    'career', 'volunteer', 'support_proposal', 'account_help', 'homework',
    'reading', 'exam_timetable', 'birthday_greeting'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.website_request_status as enum (
    'received', 'assigned', 'under_review', 'needs_information',
    'confirmed', 'declined', 'closed'
  );
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.publication_status as enum ('draft', 'published', 'archived');
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists leadership_scope public.leadership_scope not null default 'none';

-- Restore the familiar CA1/CA2/Exam structure while retaining the former
-- continuous_assessment column as a compatibility total.
alter table public.grades
  add column if not exists ca1 numeric(5,2) not null default 0,
  add column if not exists ca2 numeric(5,2) not null default 0,
  add column if not exists workflow_status public.result_workflow_status not null default 'draft',
  add column if not exists submitted_at timestamptz,
  add column if not exists reviewed_by uuid references public.profiles(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists review_note text,
  add column if not exists published_by uuid references public.profiles(id) on delete set null,
  add column if not exists locked_at timestamptz;

update public.grades
   set ca1 = least(continuous_assessment, 20),
       ca2 = greatest(least(continuous_assessment - 20, 20), 0),
       workflow_status = case
         when published_at is not null then 'published'::public.result_workflow_status
         else workflow_status
       end
 where ca1 = 0 and ca2 = 0 and continuous_assessment > 0;

do $$
begin
  alter table public.grades add constraint grades_ca1_range check (ca1 between 0 and 20);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.grades add constraint grades_ca2_range check (ca2 between 0 and 20);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.grades add constraint grades_review_note_length check (review_note is null or char_length(review_note) <= 1000);
exception when duplicate_object then null;
end $$;
create index if not exists grades_workflow_status_idx on public.grades(workflow_status, updated_at desc);

create table if not exists public.result_review_events (
  id bigint generated always as identity primary key,
  grade_id uuid not null references public.grades(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  previous_status public.result_workflow_status,
  new_status public.result_workflow_status not null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);
create index if not exists result_review_events_grade_idx on public.result_review_events(grade_id, created_at desc);

create table if not exists public.attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  class_code text not null check (char_length(trim(class_code)) between 1 and 40),
  attendance_date date not null,
  status public.staff_record_status not null default 'draft',
  marked_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  submitted_at timestamptz,
  locked_by uuid references public.profiles(id) on delete set null,
  locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (class_code, attendance_date)
);
create index if not exists attendance_sessions_date_idx on public.attendance_sessions(attendance_date desc, class_code);

create table if not exists public.attendance_entries (
  session_id uuid not null references public.attendance_sessions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  mark public.attendance_mark not null default 'present',
  note text check (note is null or char_length(note) <= 300),
  recorded_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (session_id, student_id)
);
create index if not exists attendance_entries_student_idx on public.attendance_entries(student_id, session_id);

create table if not exists public.homework_assignments (
  id uuid primary key default gen_random_uuid(),
  class_code text not null check (char_length(trim(class_code)) between 1 and 40),
  subject text not null check (char_length(trim(subject)) between 1 and 80),
  title text not null check (char_length(trim(title)) between 2 and 160),
  instructions text not null check (char_length(trim(instructions)) between 2 and 4000),
  assigned_on date not null default current_date,
  due_on date,
  status public.homework_status not null default 'draft',
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (due_on is null or due_on >= assigned_on)
);
create index if not exists homework_class_due_idx on public.homework_assignments(class_code, due_on desc);

-- Public request references are identifiers, not secrets. The independently
-- generated tracking code is shown once and only its SHA-256 hash is retained.
create table if not exists public.website_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique check (request_reference ~ '^TA-REQ-[0-9]{8}-[A-Z0-9]{8}$'),
  tracking_hash text not null check (tracking_hash ~ '^[a-f0-9]{64}$'),
  request_type public.website_request_type not null,
  status public.website_request_status not null default 'received',
  submitter_name text not null check (char_length(trim(submitter_name)) between 2 and 120),
  phone_e164 text not null check (phone_e164 ~ '^\+234[789][0-9]{9}$'),
  email text check (email is null or char_length(email) <= 254),
  class_code text check (class_code is null or char_length(trim(class_code)) <= 40),
  subject text not null check (char_length(trim(subject)) between 2 and 160),
  message text not null check (char_length(trim(message)) between 2 and 4000),
  source text not null default 'website' check (source in ('website', 'whatsapp', 'phone', 'office_visit')),
  sensitive boolean not null default false,
  registered_by uuid references public.profiles(id) on delete set null,
  assigned_to uuid references public.profiles(id) on delete set null,
  public_note text check (public_note is null or char_length(public_note) <= 1000),
  private_note text check (private_note is null or char_length(private_note) <= 2000),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index if not exists website_requests_queue_idx on public.website_requests(status, submitted_at desc);
create index if not exists website_requests_type_idx on public.website_requests(request_type, submitted_at desc);
create index if not exists website_requests_assigned_idx on public.website_requests(assigned_to, status);

create table if not exists public.website_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.website_requests(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (char_length(trim(action)) between 2 and 80),
  previous_status public.website_request_status,
  new_status public.website_request_status,
  public_note text check (public_note is null or char_length(public_note) <= 1000),
  private_note text check (private_note is null or char_length(private_note) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists website_request_events_request_idx on public.website_request_events(request_id, created_at desc);

create table if not exists public.verified_public_information (
  id uuid primary key default gen_random_uuid(),
  topic text not null check (topic in (
    'admissions', 'class_availability', 'fees', 'calendar', 'exam_timetable',
    'transport', 'uniform', 'supplies', 'pta', 'events', 'general_notice'
  )),
  title text not null check (char_length(trim(title)) between 2 and 160),
  summary text not null check (char_length(trim(summary)) between 2 and 600),
  detail text check (detail is null or char_length(detail) <= 6000),
  status public.publication_status not null default 'draft',
  revision text not null unique check (revision ~ '^TA-INFO-[0-9]{8}-[A-Z0-9]{6}$'),
  effective_from date,
  effective_until date,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  published_by uuid references public.profiles(id) on delete set null,
  published_at timestamptz,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_until is null or effective_from is null or effective_until >= effective_from)
);
create index if not exists verified_public_information_topic_idx on public.verified_public_information(topic, status, published_at desc);

create table if not exists public.public_information_events (
  id bigint generated always as identity primary key,
  information_id uuid not null references public.verified_public_information(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  previous_status public.publication_status,
  new_status public.publication_status not null,
  revision text not null,
  created_at timestamptz not null default now()
);
create index if not exists public_information_events_info_idx on public.public_information_events(information_id, created_at desc);

create table if not exists public.staff_notices (
  id uuid primary key default gen_random_uuid(),
  notice_type text not null default 'general' check (notice_type in ('general', 'birthday', 'code_of_conduct')),
  title text not null check (char_length(trim(title)) between 2 and 160),
  body text not null check (char_length(trim(body)) between 2 and 4000),
  audience text not null default 'all_staff' check (audience in ('all_staff', 'teachers', 'administrators')),
  published boolean not null default false,
  effective_from date,
  effective_until date,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (effective_until is null or effective_from is null or effective_until >= effective_from)
);

create table if not exists public.duty_roster_entries (
  id uuid primary key default gen_random_uuid(),
  duty_date date not null,
  title text not null check (char_length(trim(title)) between 2 and 160),
  assigned_to uuid not null references public.profiles(id) on delete restrict,
  class_code text check (class_code is null or char_length(trim(class_code)) <= 40),
  note text check (note is null or char_length(note) <= 1000),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists duty_roster_date_idx on public.duty_roster_entries(duty_date, assigned_to);

create table if not exists public.leadership_section_records (
  id uuid primary key default gen_random_uuid(),
  section text not null check (section in (
    'contact_whatsapp', 'testimonials', 'website_extras',
    'shop_orders', 'code_of_conduct', 'settings'
  )),
  title text not null check (char_length(trim(title)) between 2 and 160),
  detail text not null check (char_length(trim(detail)) between 2 and 6000),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists leadership_section_records_idx on public.leadership_section_records(section, status, updated_at desc);

create table if not exists public.leadership_section_events (
  id bigint generated always as identity primary key,
  record_id uuid not null references public.leadership_section_records(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  previous_status text,
  new_status text not null,
  created_at timestamptz not null default now()
);
create index if not exists leadership_section_events_record_idx on public.leadership_section_events(record_id, created_at desc);

create or replace function public.current_leadership_scope()
returns public.leadership_scope
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select p.leadership_scope
      from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'admin'::public.app_role
       and public.portal_account_can_access(p.id)
  ), 'none'::public.leadership_scope)
$$;
revoke all on function public.current_leadership_scope() from public, anon;
grant execute on function public.current_leadership_scope() to authenticated;

create or replace function public.is_headmistress()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.current_leadership_scope() = 'headmistress'::public.leadership_scope
$$;
revoke all on function public.is_headmistress() from public, anon;
grant execute on function public.is_headmistress() to authenticated;

create or replace function public.teacher_can_manage_class(p_class_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.portal_account_can_access((select auth.uid()))
     and exists (
       select 1 from public.teacher_class_assignments a
        where a.teacher_id = (select auth.uid())
          and a.class_code = p_class_code
          and a.active = true
     )
$$;
revoke all on function public.teacher_can_manage_class(text) from public, anon;
grant execute on function public.teacher_can_manage_class(text) to authenticated;

create or replace function public.can_process_website_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1
      from public.website_requests r
     where r.id = p_request_id
       and (public.is_headmistress() or ((select public.is_admin()) and r.sensitive = false))
  ), false)
$$;
revoke all on function public.can_process_website_request(uuid) from public, anon;
grant execute on function public.can_process_website_request(uuid) to authenticated;

create or replace function public.server_actor_is_headmistress(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.profiles p
     where p.id = p_actor_id
       and p.role = 'admin'::public.app_role
       and p.leadership_scope = 'headmistress'::public.leadership_scope
       and p.active = true
       and p.account_status = 'active'::public.portal_account_status
       and p.must_change_password = false
  ), false)
$$;
revoke all on function public.server_actor_is_headmistress(uuid) from public, anon, authenticated;
grant execute on function public.server_actor_is_headmistress(uuid) to service_role;

-- Headmistress-only account administration: an assistant can operate the school
-- but cannot create, reset, suspend or assign teacher accounts.
create or replace function public.server_actor_can_manage_accounts(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.server_actor_is_headmistress(p_actor_id)
$$;
revoke all on function public.server_actor_can_manage_accounts(uuid) from public, anon, authenticated;
grant execute on function public.server_actor_can_manage_accounts(uuid) to service_role;

-- Migration 002 account RPCs call this established helper. Narrowing it here
-- means the database, not only the portal UI, enforces Headmistress-only account
-- creation, recovery, status and caregiver administration.
create or replace function public.server_actor_is_admin(p_actor_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.server_actor_can_manage_accounts(p_actor_id)
$$;
revoke all on function public.server_actor_is_admin(uuid) from public, anon, authenticated;
grant execute on function public.server_actor_is_admin(uuid) to service_role;

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.role is distinct from old.role
    or new.leadership_scope is distinct from old.leadership_scope
    or new.active is distinct from old.active
    or new.phone is distinct from old.phone
    or new.phone_e164 is distinct from old.phone_e164
    or new.account_status is distinct from old.account_status
    or new.must_change_password is distinct from old.must_change_password
    or new.phone_verified_by is distinct from old.phone_verified_by
    or new.phone_verified_at is distinct from old.phone_verified_at
    or new.created_by is distinct from old.created_by
    or new.legacy_source is distinct from old.legacy_source
    or new.legacy_account_no is distinct from old.legacy_account_no
    or new.last_password_change_at is distinct from old.last_password_change_at
  ) and coalesce((select auth.role()), '') <> 'service_role'
    and session_user not in ('postgres', 'supabase_admin', 'supabase_auth_admin') then
    raise exception 'Protected account fields require the trusted account service' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_profile_role_change() from public, anon, authenticated;

create or replace function public.guard_grade_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_scope public.leadership_scope;
  v_previous public.result_workflow_status;
begin
  new.continuous_assessment := new.ca1 + new.ca2;
  if coalesce((select auth.role()), '') = 'service_role'
     or session_user in ('postgres', 'supabase_admin') then
    return new;
  end if;

  v_role := public.current_user_role();
  v_scope := public.current_leadership_scope();
  v_previous := case when tg_op = 'UPDATE' then old.workflow_status else null end;
  if tg_op = 'UPDATE' and (
    new.id is distinct from old.id
    or new.student_id is distinct from old.student_id
    or new.subject is distinct from old.subject
    or new.session_name is distinct from old.session_name
    or new.term is distinct from old.term
    or new.recorded_by is distinct from old.recorded_by
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Result entry identity and ownership are immutable' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' and (
    new.submitted_at is distinct from old.submitted_at
    or new.reviewed_by is distinct from old.reviewed_by
    or new.reviewed_at is distinct from old.reviewed_at
    or new.published_by is distinct from old.published_by
    or new.published_at is distinct from old.published_at
    or new.locked_at is distinct from old.locked_at
  ) then
    raise exception 'Result workflow timestamps and actors are managed by the database' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and new.review_note is distinct from old.review_note
     and (
       v_role is distinct from 'admin'::public.app_role
       or old.recorded_by = (select auth.uid())
       or new.workflow_status is not distinct from old.workflow_status
       or new.workflow_status not in (
         'under_review'::public.result_workflow_status,
         'returned'::public.result_workflow_status,
         'approved'::public.result_workflow_status
       )
     ) then
    raise exception 'Only an independent reviewer may change a review note during review' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE'
     and old.workflow_status = 'locked'::public.result_workflow_status
     and new is distinct from old then
    raise exception 'Locked results are immutable' using errcode = '42501';
  end if;

  if tg_op = 'INSERT' then
    if not public.teacher_can_manage_grade(new.student_id, new.subject) then
      raise exception 'Active class and subject assignment required' using errcode = '42501';
    end if;
    new.recorded_by := (select auth.uid());
    new.submitted_at := null;
    new.reviewed_by := null;
    new.reviewed_at := null;
    new.review_note := null;
    new.published_by := null;
    new.published_at := null;
    new.locked_at := null;
    if new.workflow_status not in ('draft'::public.result_workflow_status, 'submitted'::public.result_workflow_status) then
      raise exception 'New results begin as draft or submitted' using errcode = '22023';
    end if;
  elsif v_role = 'teacher'::public.app_role then
    if old.recorded_by <> (select auth.uid())
       or not public.teacher_can_manage_grade(old.student_id, old.subject)
       or old.workflow_status not in ('draft'::public.result_workflow_status, 'returned'::public.result_workflow_status)
       or new.workflow_status not in ('draft'::public.result_workflow_status, 'submitted'::public.result_workflow_status) then
      raise exception 'Teacher may edit only assigned draft or returned results' using errcode = '42501';
    end if;
  elsif v_role = 'admin'::public.app_role then
    if v_scope not in ('assistant_headmistress'::public.leadership_scope, 'headmistress'::public.leadership_scope) then
      raise exception 'Recognised leadership scope required' using errcode = '42501';
    end if;
    if old.recorded_by = (select auth.uid()) then
      -- A leader working in My Class retains teacher draft/submit capability,
      -- but cannot review their own entry. The Headmistress may publish/lock an
      -- own-class result only after another leader independently approved it.
      if old.workflow_status in ('draft'::public.result_workflow_status, 'returned'::public.result_workflow_status)
         and new.workflow_status in ('draft'::public.result_workflow_status, 'submitted'::public.result_workflow_status) then
        null;
      elsif v_scope = 'headmistress'::public.leadership_scope
         and ((old.workflow_status = 'approved'::public.result_workflow_status and new.workflow_status = 'published'::public.result_workflow_status)
           or (old.workflow_status = 'published'::public.result_workflow_status and new.workflow_status = 'locked'::public.result_workflow_status))
         and new.ca1 is not distinct from old.ca1 and new.ca2 is not distinct from old.ca2
         and new.exam_score is not distinct from old.exam_score and new.teacher_comment is not distinct from old.teacher_comment then
        null;
      elsif new is not distinct from old then
        null;
      else
        raise exception 'A reviewer cannot review or alter their own submitted result entry' using errcode = '42501';
      end if;
    else
      if new.ca1 is distinct from old.ca1 or new.ca2 is distinct from old.ca2
         or new.exam_score is distinct from old.exam_score or new.teacher_comment is distinct from old.teacher_comment then
        raise exception 'Result reviewers return score corrections to the class teacher' using errcode = '42501';
      end if;
      if v_scope = 'assistant_headmistress'::public.leadership_scope
         and new.workflow_status in ('published'::public.result_workflow_status, 'locked'::public.result_workflow_status) then
        raise exception 'Only the Headmistress may publish or lock results' using errcode = '42501';
      end if;
      if v_scope = 'headmistress'::public.leadership_scope
         and new.workflow_status in ('under_review'::public.result_workflow_status, 'returned'::public.result_workflow_status, 'approved'::public.result_workflow_status)
         and not exists (
           select 1 from public.profiles p
            where p.id = old.recorded_by
              and p.leadership_scope = 'assistant_headmistress'::public.leadership_scope
         ) then
        raise exception 'The Assistant Headmistress reviews submitted teacher results' using errcode = '42501';
      end if;
    end if;
  else
    raise exception 'Result workflow access denied' using errcode = '42501';
  end if;

  if tg_op = 'UPDATE' and new.workflow_status is distinct from old.workflow_status then
    if new.workflow_status = 'submitted'::public.result_workflow_status
       and old.workflow_status not in ('draft'::public.result_workflow_status, 'returned'::public.result_workflow_status) then
      raise exception 'Only draft or returned results may be submitted' using errcode = '22023';
    elsif new.workflow_status = 'under_review'::public.result_workflow_status
       and old.workflow_status <> 'submitted'::public.result_workflow_status then
      raise exception 'Only submitted results may enter review' using errcode = '22023';
    elsif new.workflow_status in ('returned'::public.result_workflow_status, 'approved'::public.result_workflow_status)
       and old.workflow_status <> 'under_review'::public.result_workflow_status then
      raise exception 'Review must begin before return or approval' using errcode = '22023';
    elsif new.workflow_status = 'draft'::public.result_workflow_status
       and old.workflow_status not in ('draft'::public.result_workflow_status, 'returned'::public.result_workflow_status) then
      raise exception 'Only a returned result may be corrected as a new draft' using errcode = '22023';
    end if;
  end if;

  if new.workflow_status = 'submitted'::public.result_workflow_status and (tg_op = 'INSERT' or v_previous <> new.workflow_status) then
    new.submitted_at := now();
  end if;
  if new.workflow_status in ('under_review'::public.result_workflow_status, 'returned'::public.result_workflow_status, 'approved'::public.result_workflow_status)
     and (tg_op = 'INSERT' or v_previous <> new.workflow_status) then
    new.reviewed_by := (select auth.uid());
    new.reviewed_at := now();
  end if;
  if new.workflow_status = 'published'::public.result_workflow_status and (tg_op = 'INSERT' or v_previous <> new.workflow_status) then
    if v_scope <> 'headmistress'::public.leadership_scope then
      raise exception 'Headmistress publication required' using errcode = '42501';
    end if;
    if tg_op = 'UPDATE' and old.workflow_status <> 'approved'::public.result_workflow_status then
      raise exception 'Only approved results may be published' using errcode = '22023';
    end if;
    new.published_by := (select auth.uid());
    new.published_at := now();
  elsif new.workflow_status not in ('published'::public.result_workflow_status, 'locked'::public.result_workflow_status) then
    new.published_by := null;
    new.published_at := null;
    new.locked_at := null;
  end if;
  if new.workflow_status = 'locked'::public.result_workflow_status and (tg_op = 'INSERT' or v_previous <> new.workflow_status) then
    if tg_op = 'UPDATE' and old.workflow_status <> 'published'::public.result_workflow_status then
      raise exception 'Only published results may be locked' using errcode = '22023';
    end if;
    new.locked_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.guard_grade_workflow() from public, anon, authenticated;

create or replace function public.audit_grade_workflow()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workflow_status is distinct from old.workflow_status then
    insert into public.result_review_events(
      grade_id, actor_id, previous_status, new_status, note
    ) values (
      new.id, (select auth.uid()), old.workflow_status, new.workflow_status, new.review_note
    );
  end if;
  return new;
end;
$$;
revoke all on function public.audit_grade_workflow() from public, anon, authenticated;

create or replace function public.guard_attendance_session()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') = 'service_role'
     or session_user in ('postgres', 'supabase_admin') then return new; end if;
  if not ((select public.is_admin()) or public.teacher_can_manage_class(new.class_code)) then
    raise exception 'Active class assignment required' using errcode = '42501';
  end if;
  if tg_op = 'INSERT' then
    new.marked_by := (select auth.uid());
  elsif old.status = 'locked'::public.staff_record_status and new is distinct from old then
    raise exception 'Locked attendance requires an administrator correction workflow' using errcode = '42501';
  end if;
  if new.status = 'submitted'::public.staff_record_status and (tg_op = 'INSERT' or old.status <> new.status) then
    new.submitted_at := now();
  end if;
  if new.status = 'locked'::public.staff_record_status and (tg_op = 'INSERT' or old.status <> new.status) then
    if not (select public.is_admin()) then raise exception 'Administrator lock required' using errcode = '42501'; end if;
    new.locked_by := (select auth.uid()); new.locked_at := now();
  end if;
  return new;
end;
$$;
revoke all on function public.guard_attendance_session() from public, anon, authenticated;

create or replace function public.guard_attendance_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class text;
  v_status public.staff_record_status;
begin
  select s.class_code, s.status into v_class, v_status
    from public.attendance_sessions s where s.id = new.session_id;
  if not found then raise exception 'Attendance session not found' using errcode = '23503'; end if;
  if not exists (select 1 from public.students p where p.id = new.student_id and p.class_code = v_class and p.active = true) then
    raise exception 'Pupil is not in this attendance class' using errcode = '42501';
  end if;
  if coalesce((select auth.role()), '') <> 'service_role'
     and session_user not in ('postgres', 'supabase_admin') then
    if v_status = 'locked'::public.staff_record_status then
      raise exception 'Attendance session is locked' using errcode = '42501';
    end if;
    if not ((select public.is_admin()) or public.teacher_can_manage_class(v_class)) then
      raise exception 'Active class assignment required' using errcode = '42501';
    end if;
    new.recorded_by := (select auth.uid());
  end if;
  return new;
end;
$$;
revoke all on function public.guard_attendance_entry() from public, anon, authenticated;

create or replace function public.guard_homework_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') = 'service_role' or session_user in ('postgres', 'supabase_admin') then return new; end if;
  if tg_op = 'INSERT' then
    new.created_by := (select auth.uid());
  elsif new.created_by is distinct from old.created_by then
    raise exception 'Homework ownership cannot be reassigned' using errcode = '42501';
  end if;
  if new.status = 'published'::public.homework_status and (tg_op = 'INSERT' or old.status <> new.status) then
    new.published_at := now();
  elsif new.status <> 'published'::public.homework_status then
    new.published_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_homework_assignment() from public, anon, authenticated;

create or replace function public.classify_website_request()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.sensitive := new.request_type in (
    'safeguarding'::public.website_request_type,
    'private_feedback'::public.website_request_type,
    'testimonial_permission'::public.website_request_type,
    'school_record'::public.website_request_type,
    'account_help'::public.website_request_type
  );
  if new.source = 'website' then
    new.registered_by := null;
  elsif new.registered_by is null or not exists (
    select 1 from public.profiles p
     where p.id = new.registered_by
       and p.role in ('teacher'::public.app_role, 'admin'::public.app_role)
       and p.active = true
       and p.account_status = 'active'::public.portal_account_status
       and p.must_change_password = false
  ) then
    raise exception 'Active staff registration required for off-site requests' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.classify_website_request() from public, anon, authenticated;

create or replace function public.audit_website_request_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.website_request_events(request_id, actor_id, action, new_status)
  values (
    new.id,
    new.registered_by,
    case when new.source = 'website' then 'website_request_created' else 'staff_request_registered' end,
    new.status
  );
  return new;
end;
$$;
revoke all on function public.audit_website_request_insert() from public, anon, authenticated;

create or replace function public.guard_public_information()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    if not (select public.is_admin()) then raise exception 'Administrator publication required' using errcode = '42501'; end if;
    if tg_op = 'INSERT' then
      new.created_by := (select auth.uid());
      new.published_by := null;
      new.published_at := null;
      new.reviewed_at := null;
      if new.status = 'archived'::public.publication_status then
        raise exception 'A new publication begins as draft or published' using errcode = '22023';
      end if;
    else
      if new.id is distinct from old.id
         or new.created_by is distinct from old.created_by
         or new.created_at is distinct from old.created_at
         or new.revision is distinct from old.revision then
        raise exception 'Publication identity, ownership and revision identifiers are immutable' using errcode = '42501';
      end if;
      if new.published_by is distinct from old.published_by
         or new.published_at is distinct from old.published_at
         or new.reviewed_at is distinct from old.reviewed_at then
        raise exception 'Publication review fields are managed by the database' using errcode = '42501';
      end if;
      if old.status <> 'draft'::public.publication_status and (
        new.topic is distinct from old.topic
        or new.title is distinct from old.title
        or new.summary is distinct from old.summary
        or new.detail is distinct from old.detail
        or new.effective_from is distinct from old.effective_from
        or new.effective_until is distinct from old.effective_until
      ) then
        raise exception 'Published information is immutable; create a new revision' using errcode = '42501';
      end if;
      if new.status is distinct from old.status
         and not (
           (old.status = 'draft'::public.publication_status and new.status = 'published'::public.publication_status)
           or (old.status = 'published'::public.publication_status and new.status = 'archived'::public.publication_status)
         ) then
        raise exception 'Invalid publication status transition' using errcode = '22023';
      end if;
    end if;
    if new.status = 'published'::public.publication_status and (tg_op = 'INSERT' or old.status <> new.status) then
      new.published_by := (select auth.uid());
      new.published_at := now();
      new.reviewed_at := now();
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_public_information() from public, anon, authenticated;

create or replace function public.audit_public_information()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.public_information_events(information_id, actor_id, previous_status, new_status, revision)
    values (new.id, (select auth.uid()), case when tg_op = 'UPDATE' then old.status else null end, new.status, new.revision);
  end if;
  return new;
end;
$$;
revoke all on function public.audit_public_information() from public, anon, authenticated;

create or replace function public.guard_head_owned_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') <> 'service_role' and session_user not in ('postgres', 'supabase_admin') then
    if not (select public.is_headmistress()) then raise exception 'Headmistress permission required' using errcode = '42501'; end if;
    if tg_op = 'INSERT' then new.created_by := (select auth.uid());
    elsif new.created_by is distinct from old.created_by then raise exception 'Record ownership is immutable' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_head_owned_record() from public, anon, authenticated;

create or replace function public.audit_leadership_section_record()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.leadership_section_events(record_id, actor_id, action, previous_status, new_status)
    values (
      new.id, (select auth.uid()),
      case when tg_op = 'INSERT' then 'record_created' else 'status_changed' end,
      case when tg_op = 'UPDATE' then old.status else null end,
      new.status
    );
  end if;
  return new;
end;
$$;
revoke all on function public.audit_leadership_section_record() from public, anon, authenticated;

create or replace function public.create_website_request(
  p_request_reference text,
  p_tracking_hash text,
  p_request_type public.website_request_type,
  p_submitter_name text,
  p_phone_e164 text,
  p_email text,
  p_class_code text,
  p_subject text,
  p_message text,
  p_source text default 'website',
  p_registered_by uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.website_requests%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_phone_e164, 731));
  if p_source = 'website' and (
    select count(*) from public.website_requests r
     where r.phone_e164 = p_phone_e164
       and r.source = 'website'
       and r.submitted_at >= now() - interval '24 hours'
  ) >= 10 then
    raise exception 'request_rate_limited' using errcode = 'P0001';
  end if;

  insert into public.website_requests(
    request_reference, tracking_hash, request_type, submitter_name,
    phone_e164, email, class_code, subject, message, source, registered_by, assigned_to
  ) values (
    p_request_reference, p_tracking_hash, p_request_type, trim(p_submitter_name),
    p_phone_e164, nullif(lower(trim(p_email)), ''), nullif(trim(p_class_code), ''),
    trim(p_subject), trim(p_message), p_source, p_registered_by,
    case when p_registered_by is not null and exists (
      select 1 from public.profiles p where p.id = p_registered_by and p.role = 'admin'::public.app_role
    ) then p_registered_by else null end
  ) returning * into v_request;

  return jsonb_build_object(
    'id', v_request.id,
    'request_reference', v_request.request_reference,
    'status', v_request.status,
    'submitted_at', v_request.submitted_at
  );
end;
$$;
revoke all on function public.create_website_request(text, text, public.website_request_type, text, text, text, text, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.create_website_request(text, text, public.website_request_type, text, text, text, text, text, text, text, uuid) to service_role;

create or replace function public.process_website_request(
  p_request_id uuid,
  p_status public.website_request_status,
  p_public_note text default null,
  p_private_note text default null,
  p_assigned_to uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.website_request_status;
begin
  if not public.can_process_website_request(p_request_id) then
    raise exception 'Request processing access denied' using errcode = '42501';
  end if;
  if p_public_note is not null and char_length(p_public_note) > 1000 then raise exception 'Public note too long' using errcode = '22023'; end if;
  if p_private_note is not null and char_length(p_private_note) > 2000 then raise exception 'Private note too long' using errcode = '22023'; end if;
  if p_assigned_to is not null and not exists (
    select 1 from public.profiles p
     where p.id = p_assigned_to
       and p.role in ('teacher'::public.app_role, 'admin'::public.app_role)
       and p.active = true
       and p.account_status = 'active'::public.portal_account_status
       and p.must_change_password = false
  ) then
    raise exception 'Requests may be assigned only to active staff' using errcode = '22023';
  end if;

  select r.status into v_previous from public.website_requests r where r.id = p_request_id for update;
  update public.website_requests
     set status = p_status,
         public_note = nullif(trim(p_public_note), ''),
         private_note = nullif(trim(p_private_note), ''),
         assigned_to = p_assigned_to,
         resolved_at = case when p_status in ('confirmed', 'declined', 'closed') then now() else null end,
         updated_at = now()
   where id = p_request_id;

  insert into public.website_request_events(
    request_id, actor_id, action, previous_status, new_status, public_note, private_note
  ) values (
    p_request_id, (select auth.uid()), 'status_updated', v_previous, p_status,
    nullif(trim(p_public_note), ''), nullif(trim(p_private_note), '')
  );
  return jsonb_build_object('request_id', p_request_id, 'status', p_status);
end;
$$;
revoke all on function public.process_website_request(uuid, public.website_request_status, text, text, uuid) from public, anon;
grant execute on function public.process_website_request(uuid, public.website_request_status, text, text, uuid) to authenticated;

-- Deterministic triggers.
drop trigger if exists grades_guard_workflow on public.grades;
create trigger grades_guard_workflow before insert or update on public.grades
for each row execute function public.guard_grade_workflow();
drop trigger if exists grades_audit_workflow on public.grades;
create trigger grades_audit_workflow after update of workflow_status on public.grades
for each row execute function public.audit_grade_workflow();

drop trigger if exists attendance_sessions_touch_updated_at on public.attendance_sessions;
create trigger attendance_sessions_touch_updated_at before update on public.attendance_sessions
for each row execute function public.portal_touch_updated_at();
drop trigger if exists attendance_sessions_guard on public.attendance_sessions;
create trigger attendance_sessions_guard before insert or update on public.attendance_sessions
for each row execute function public.guard_attendance_session();

drop trigger if exists attendance_entries_touch_updated_at on public.attendance_entries;
create trigger attendance_entries_touch_updated_at before update on public.attendance_entries
for each row execute function public.portal_touch_updated_at();
drop trigger if exists attendance_entries_guard on public.attendance_entries;
create trigger attendance_entries_guard before insert or update on public.attendance_entries
for each row execute function public.guard_attendance_entry();

drop trigger if exists homework_touch_updated_at on public.homework_assignments;
create trigger homework_touch_updated_at before update on public.homework_assignments
for each row execute function public.portal_touch_updated_at();
drop trigger if exists homework_guard on public.homework_assignments;
create trigger homework_guard before insert or update on public.homework_assignments
for each row execute function public.guard_homework_assignment();

drop trigger if exists website_requests_touch_updated_at on public.website_requests;
create trigger website_requests_touch_updated_at before update on public.website_requests
for each row execute function public.portal_touch_updated_at();
drop trigger if exists website_requests_classify on public.website_requests;
create trigger website_requests_classify before insert or update of request_type, source, registered_by on public.website_requests
for each row execute function public.classify_website_request();
drop trigger if exists website_requests_audit_insert on public.website_requests;
create trigger website_requests_audit_insert after insert on public.website_requests
for each row execute function public.audit_website_request_insert();

drop trigger if exists verified_public_information_touch_updated_at on public.verified_public_information;
create trigger verified_public_information_touch_updated_at before update on public.verified_public_information
for each row execute function public.portal_touch_updated_at();
drop trigger if exists verified_public_information_guard on public.verified_public_information;
create trigger verified_public_information_guard before insert or update on public.verified_public_information
for each row execute function public.guard_public_information();
drop trigger if exists verified_public_information_audit on public.verified_public_information;
create trigger verified_public_information_audit after insert or update of status on public.verified_public_information
for each row execute function public.audit_public_information();

drop trigger if exists staff_notices_touch_updated_at on public.staff_notices;
create trigger staff_notices_touch_updated_at before update on public.staff_notices
for each row execute function public.portal_touch_updated_at();
drop trigger if exists staff_notices_guard on public.staff_notices;
create trigger staff_notices_guard before insert or update on public.staff_notices
for each row execute function public.guard_head_owned_record();

drop trigger if exists duty_roster_touch_updated_at on public.duty_roster_entries;
create trigger duty_roster_touch_updated_at before update on public.duty_roster_entries
for each row execute function public.portal_touch_updated_at();
drop trigger if exists duty_roster_guard on public.duty_roster_entries;
create trigger duty_roster_guard before insert or update on public.duty_roster_entries
for each row execute function public.guard_head_owned_record();

drop trigger if exists leadership_section_touch_updated_at on public.leadership_section_records;
create trigger leadership_section_touch_updated_at before update on public.leadership_section_records
for each row execute function public.portal_touch_updated_at();
drop trigger if exists leadership_section_guard on public.leadership_section_records;
create trigger leadership_section_guard before insert or update on public.leadership_section_records
for each row execute function public.guard_head_owned_record();
drop trigger if exists leadership_section_audit on public.leadership_section_records;
create trigger leadership_section_audit after insert or update of status on public.leadership_section_records
for each row execute function public.audit_leadership_section_record();

-- RLS.
alter table public.result_review_events enable row level security;
alter table public.attendance_sessions enable row level security;
alter table public.attendance_entries enable row level security;
alter table public.homework_assignments enable row level security;
alter table public.website_requests enable row level security;
alter table public.website_request_events enable row level security;
alter table public.verified_public_information enable row level security;
alter table public.public_information_events enable row level security;
alter table public.staff_notices enable row level security;
alter table public.duty_roster_entries enable row level security;
alter table public.leadership_section_records enable row level security;
alter table public.leadership_section_events enable row level security;

-- Historical staff/account/class-scope administration remains Headmistress-only.
drop policy if exists assignments_insert on public.teacher_class_assignments;
create policy assignments_insert on public.teacher_class_assignments for insert to authenticated
with check ((select public.is_headmistress()));
drop policy if exists assignments_update on public.teacher_class_assignments;
create policy assignments_update on public.teacher_class_assignments for update to authenticated
using ((select public.is_headmistress())) with check ((select public.is_headmistress()));
drop policy if exists assignments_delete on public.teacher_class_assignments;
create policy assignments_delete on public.teacher_class_assignments for delete to authenticated
using ((select public.is_headmistress()));

-- Result writes: assigned staff create entries; administrators review; only the
-- Headmistress deletes, publishes or locks through the workflow trigger.
drop policy if exists grades_insert on public.grades;
create policy grades_insert on public.grades for insert to authenticated
with check (
  public.portal_account_can_access((select auth.uid()))
  and recorded_by = (select auth.uid())
  and public.teacher_can_manage_grade(student_id, subject)
);
drop policy if exists grades_update on public.grades;
create policy grades_update on public.grades for update to authenticated
using ((select public.is_admin()) or public.teacher_can_manage_grade(student_id, subject))
with check ((select public.is_admin()) or public.teacher_can_manage_grade(student_id, subject));
drop policy if exists grades_delete on public.grades;
create policy grades_delete on public.grades for delete to authenticated
using ((select public.is_headmistress()));

drop policy if exists result_review_events_select on public.result_review_events;
create policy result_review_events_select on public.result_review_events for select to authenticated
using ((select public.is_admin()) or exists (
  select 1 from public.grades g
   where g.id = result_review_events.grade_id
     and public.teacher_can_manage_grade(g.student_id, g.subject)
));

create policy attendance_sessions_select on public.attendance_sessions for select to authenticated
using ((select public.is_admin()) or public.teacher_can_manage_class(class_code));
create policy attendance_sessions_insert on public.attendance_sessions for insert to authenticated
with check (public.teacher_can_manage_class(class_code));
create policy attendance_sessions_update on public.attendance_sessions for update to authenticated
using ((select public.is_admin()) or public.teacher_can_manage_class(class_code))
with check ((select public.is_admin()) or public.teacher_can_manage_class(class_code));
create policy attendance_sessions_delete on public.attendance_sessions for delete to authenticated
using ((select public.is_headmistress()));

create policy attendance_entries_select on public.attendance_entries for select to authenticated
using (
  (select public.is_admin())
  or exists (select 1 from public.attendance_sessions s where s.id = attendance_entries.session_id and public.teacher_can_manage_class(s.class_code))
);
create policy attendance_entries_insert on public.attendance_entries for insert to authenticated
with check (
  exists (select 1 from public.attendance_sessions s where s.id = attendance_entries.session_id and public.teacher_can_manage_class(s.class_code))
);
create policy attendance_entries_update on public.attendance_entries for update to authenticated
using (
  (select public.is_admin())
  or exists (select 1 from public.attendance_sessions s where s.id = attendance_entries.session_id and public.teacher_can_manage_class(s.class_code))
)
with check (
  (select public.is_admin())
  or exists (select 1 from public.attendance_sessions s where s.id = attendance_entries.session_id and public.teacher_can_manage_class(s.class_code))
);
create policy attendance_entries_delete on public.attendance_entries for delete to authenticated
using ((select public.is_headmistress()));

create policy homework_select on public.homework_assignments for select to authenticated
using ((select public.is_admin()) or public.teacher_can_manage_class(class_code) or status = 'published'::public.homework_status);
create policy homework_insert on public.homework_assignments for insert to authenticated
with check (created_by = (select auth.uid()) and public.teacher_can_manage_class(class_code));
create policy homework_update on public.homework_assignments for update to authenticated
using ((select public.is_admin()) or (created_by = (select auth.uid()) and public.teacher_can_manage_class(class_code)))
with check ((select public.is_admin()) or (created_by = (select auth.uid()) and public.teacher_can_manage_class(class_code)));
create policy homework_delete on public.homework_assignments for delete to authenticated
using ((select public.is_headmistress()) or (created_by = (select auth.uid()) and status = 'draft'::public.homework_status));

create policy website_requests_select on public.website_requests for select to authenticated
using (public.is_headmistress() or ((select public.is_admin()) and sensitive = false));
create policy website_request_events_select on public.website_request_events for select to authenticated
using (exists (
  select 1 from public.website_requests r
   where r.id = website_request_events.request_id
     and (public.is_headmistress() or ((select public.is_admin()) and r.sensitive = false))
));

create policy verified_public_information_public_select on public.verified_public_information for select to anon, authenticated
using (
  status = 'published'::public.publication_status
  and published_at is not null
  and (effective_from is null or effective_from <= current_date)
  and (effective_until is null or effective_until >= current_date)
);
create policy verified_public_information_admin_select on public.verified_public_information for select to authenticated
using ((select public.is_admin()));
create policy verified_public_information_admin_insert on public.verified_public_information for insert to authenticated
with check ((select public.is_admin()) and created_by = (select auth.uid()));
create policy verified_public_information_admin_update on public.verified_public_information for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy verified_public_information_head_delete on public.verified_public_information for delete to authenticated
using ((select public.is_headmistress()));
create policy public_information_events_admin_select on public.public_information_events for select to authenticated
using ((select public.is_admin()));

create policy staff_notices_select on public.staff_notices for select to authenticated
using (
  public.portal_account_can_access((select auth.uid()))
  and (published = true or (select public.is_headmistress()))
  and (audience = 'all_staff' or (audience = 'teachers' and (select public.current_user_role()) in ('teacher', 'admin')) or (audience = 'administrators' and (select public.is_admin())))
);
create policy staff_notices_head_insert on public.staff_notices for insert to authenticated
with check ((select public.is_headmistress()) and created_by = (select auth.uid()));
create policy staff_notices_head_update on public.staff_notices for update to authenticated
using ((select public.is_headmistress())) with check ((select public.is_headmistress()));
create policy staff_notices_head_delete on public.staff_notices for delete to authenticated
using ((select public.is_headmistress()));

create policy duty_roster_select on public.duty_roster_entries for select to authenticated
using (public.portal_account_can_access((select auth.uid())) and (select public.current_user_role()) in ('teacher', 'admin'));
create policy duty_roster_head_insert on public.duty_roster_entries for insert to authenticated
with check ((select public.is_headmistress()) and created_by = (select auth.uid()));
create policy duty_roster_head_update on public.duty_roster_entries for update to authenticated
using ((select public.is_headmistress())) with check ((select public.is_headmistress()));
create policy duty_roster_head_delete on public.duty_roster_entries for delete to authenticated
using ((select public.is_headmistress()));

create policy leadership_section_head_select on public.leadership_section_records for select to authenticated
using ((select public.is_headmistress()));
create policy leadership_section_head_insert on public.leadership_section_records for insert to authenticated
with check ((select public.is_headmistress()) and created_by = (select auth.uid()));
create policy leadership_section_head_update on public.leadership_section_records for update to authenticated
using ((select public.is_headmistress())) with check ((select public.is_headmistress()));
create policy leadership_section_head_delete on public.leadership_section_records for delete to authenticated
using ((select public.is_headmistress()));
create policy leadership_section_events_head_select on public.leadership_section_events for select to authenticated
using ((select public.is_headmistress()));

-- Browser grants. Website request creation/status lookup use a trusted server
-- endpoint and service key, never anonymous direct table access.
revoke all on table public.result_review_events, public.attendance_sessions,
  public.attendance_entries, public.homework_assignments, public.website_requests,
  public.website_request_events, public.verified_public_information,
  public.public_information_events, public.staff_notices, public.duty_roster_entries,
  public.leadership_section_records, public.leadership_section_events from anon, authenticated;

grant select on table public.result_review_events to authenticated;
grant select, insert, update, delete on table public.attendance_sessions to authenticated;
grant select, insert, update, delete on table public.attendance_entries to authenticated;
grant select, insert, update, delete on table public.homework_assignments to authenticated;
grant select on table public.website_requests, public.website_request_events to authenticated;
grant select on table public.verified_public_information to anon;
grant select, insert, update, delete on table public.verified_public_information to authenticated;
grant select on table public.public_information_events to authenticated;
grant select, insert, update, delete on table public.staff_notices to authenticated;
grant select, insert, update, delete on table public.duty_roster_entries to authenticated;
grant select, insert, update, delete on table public.leadership_section_records to authenticated;
grant select on table public.leadership_section_events to authenticated;

revoke all on sequence public.result_review_events_id_seq, public.website_request_events_id_seq,
  public.public_information_events_id_seq, public.leadership_section_events_id_seq from anon, authenticated;

comment on column public.profiles.leadership_scope is 'Independent leadership capability. Both leaders remain admin accounts and may also have class assignments.';
comment on table public.attendance_sessions is 'Daily class register controlled by class assignment and administrator oversight.';
comment on table public.homework_assignments is 'Teacher-authored homework. No pupil online-submission feature exists.';
comment on table public.website_requests is 'Website-verifiable operational requests. Tracking secrets are stored only as hashes.';
comment on table public.verified_public_information is 'Versioned school-office publications with effective and review dates.';
comment on table public.leadership_section_records is 'Headmistress-only working records for historical leadership sections. Active does not automatically publish website content.';

-- IMPORTANT: public.school_data and former portal objects remain untouched.
commit;
