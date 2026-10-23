-- SAFE ENTRY POINT — Treasure Academy Supabase portal schema
--
-- The former public-write school_data schema was retired on 2026-10-23.
-- This file intentionally mirrors the versioned secure migration below:
--   supabase/migrations/202610230001_secure_school_portal.sql
-- Keep both files byte-for-byte aligned below this header when changing schema.

-- Treasure Academy secure school portal baseline
-- Date: 2026-10-23
--
-- Safe to apply through the Supabase SQL editor or migration runner.
-- This migration keeps legacy evidence but removes all access to the retired
-- public.school_data JSON store. It does not insert real people or school data.

begin;

create extension if not exists pgcrypto;

do $$
begin
  create type public.app_role as enum ('admin', 'teacher', 'parent');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.admission_status as enum ('pending', 'under_review', 'offered', 'admitted', 'declined', 'withdrawn');
exception when duplicate_object then null;
end $$;

do $$
begin
  create type public.payment_status as enum ('pending', 'paid', 'failed', 'reversed', 'waived');
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null default 'parent',
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  phone text check (phone is null or char_length(phone) between 7 and 24),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  admission_number text not null unique check (char_length(trim(admission_number)) between 2 and 40),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  date_of_birth date,
  class_code text not null check (char_length(trim(class_code)) between 1 and 40),
  parent_id uuid not null references public.profiles(id) on delete restrict,
  admission_status public.admission_status not null default 'pending',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists students_parent_id_idx on public.students(parent_id);
create index if not exists students_class_code_idx on public.students(class_code);

create table if not exists public.teacher_class_assignments (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  class_code text not null check (char_length(trim(class_code)) between 1 and 40),
  subject text not null default '*' check (char_length(trim(subject)) between 1 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teacher_id, class_code, subject)
);
create index if not exists teacher_assignments_teacher_idx on public.teacher_class_assignments(teacher_id);
create index if not exists teacher_assignments_class_idx on public.teacher_class_assignments(class_code);

create table if not exists public.grades (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  subject text not null check (char_length(trim(subject)) between 1 and 80),
  session_name text not null check (char_length(trim(session_name)) between 4 and 20),
  term text not null check (term in ('First', 'Second', 'Third')),
  continuous_assessment numeric(5,2) not null default 0 check (continuous_assessment between 0 and 40),
  exam_score numeric(5,2) not null default 0 check (exam_score between 0 and 60),
  teacher_comment text check (teacher_comment is null or char_length(teacher_comment) <= 500),
  recorded_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (student_id, subject, session_name, term)
);
create index if not exists grades_student_idx on public.grades(student_id);
create index if not exists grades_recorded_by_idx on public.grades(recorded_by);

create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  session_name text not null check (char_length(trim(session_name)) between 4 and 20),
  term text not null check (term in ('First', 'Second', 'Third')),
  description text not null check (char_length(trim(description)) between 2 and 160),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null default 'NGN' check (currency = 'NGN'),
  method text not null default 'bank_transfer' check (method in ('bank_transfer', 'monnify')),
  status public.payment_status not null default 'pending',
  bank_reference text,
  monnify_payment_reference text unique,
  monnify_transaction_reference text unique,
  paid_at timestamptz,
  verified_by uuid references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists payments_student_idx on public.payments(student_id);
create index if not exists payments_status_idx on public.payments(status);

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('monnify')),
  event_key text not null unique,
  payload_sha256 text not null check (char_length(payload_sha256) = 64),
  payment_reference text,
  transaction_reference text,
  outcome text not null default 'received' check (outcome in ('received', 'processed', 'duplicate', 'rejected')),
  reason text,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists webhook_events_payment_reference_idx on public.webhook_events(payment_reference);

create table if not exists public.payment_audit_log (
  id bigint generated always as identity primary key,
  payment_id uuid references public.payments(id) on delete set null,
  webhook_event_id uuid references public.webhook_events(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  previous_status public.payment_status,
  new_status public.payment_status,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists payment_audit_payment_idx on public.payment_audit_log(payment_id);

create table if not exists public.admission_audit_log (
  id bigint generated always as identity primary key,
  student_id uuid not null references public.students(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  previous_status public.admission_status,
  new_status public.admission_status not null,
  created_at timestamptz not null default now()
);
create index if not exists admission_audit_student_idx on public.admission_audit_log(student_id);

-- Fixed-search-path helpers avoid RLS recursion and object-shadowing attacks.
create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p where p.id = (select auth.uid()) and p.active = true
$$;
revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select public.current_user_role() = 'admin'::public.app_role), false)
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

create or replace function public.teacher_can_manage_grade(p_student_id uuid, p_subject text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.students s
      join public.teacher_class_assignments a
        on a.class_code = s.class_code
       and a.teacher_id = (select auth.uid())
       and a.active = true
       and (a.subject = '*' or lower(a.subject) = lower(p_subject))
     where s.id = p_student_id
       and s.active = true
  )
$$;
revoke all on function public.teacher_can_manage_grade(uuid, text) from public, anon;
grant execute on function public.teacher_can_manage_grade(uuid, text) to authenticated;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and not public.is_admin()
     and session_user not in ('postgres', 'supabase_admin', 'supabase_auth_admin') then
    raise exception 'Only an administrator may change portal roles or account status' using errcode = '42501';
  end if;
  return new;
end;
$$;

create or replace function public.audit_admission_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.admission_status is distinct from old.admission_status then
    insert into public.admission_audit_log(student_id, actor_id, previous_status, new_status)
    values (new.id, (select auth.uid()), old.admission_status, new.admission_status);
  end if;
  return new;
end;
$$;

create or replace function public.audit_payment_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- The server-only webhook RPC writes its own detailed audit row. Avoid a
  -- second generic trigger row when the authenticated database role is service_role.
  if new.status is distinct from old.status
     and coalesce((select auth.role()), '') <> 'service_role' then
    insert into public.payment_audit_log(payment_id, actor_id, action, previous_status, new_status, detail)
    values (
      new.id,
      (select auth.uid()),
      'payment_status_changed',
      old.status,
      new.status,
      jsonb_build_object('method', new.method, 'source', 'portal')
    );
  end if;
  return new;
end;
$$;

create or replace function public.create_parent_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Never trust user metadata to assign teacher/admin. New accounts start as parents.
  insert into public.profiles(id, role, full_name, phone)
  values (
    new.id,
    'parent'::public.app_role,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Parent account'),
    nullif(trim(new.raw_user_meta_data ->> 'phone'), '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Trigger functions are not API routes. Trigger execution does not require
-- client EXECUTE privileges, so remove the default PUBLIC grant explicitly.
revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.guard_profile_role_change() from public, anon, authenticated;
revoke all on function public.audit_admission_status_change() from public, anon, authenticated;
revoke all on function public.audit_payment_change() from public, anon, authenticated;
revoke all on function public.create_parent_profile() from public, anon, authenticated;

-- Atomic, idempotent webhook processor. Only the server-side service role may call it.
create or replace function public.process_monnify_payment_event(
  p_event_key text,
  p_payload_sha256 text,
  p_payment_reference text,
  p_transaction_reference text,
  p_amount_paid numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_payment public.payments%rowtype;
begin
  insert into public.webhook_events(
    provider, event_key, payload_sha256, payment_reference, transaction_reference
  ) values (
    'monnify', p_event_key, p_payload_sha256, p_payment_reference, p_transaction_reference
  )
  on conflict (event_key) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    return jsonb_build_object('outcome', 'duplicate');
  end if;

  select * into v_payment
    from public.payments
   where monnify_payment_reference = p_payment_reference
   for update;

  if not found then
    update public.webhook_events
       set outcome = 'rejected', reason = 'payment_reference_not_found', processed_at = now()
     where id = v_event_id;
    return jsonb_build_object('outcome', 'rejected', 'reason', 'payment_reference_not_found');
  end if;

  if v_payment.method <> 'monnify' then
    update public.webhook_events
       set outcome = 'rejected', reason = 'payment_method_mismatch', processed_at = now()
     where id = v_event_id;
    return jsonb_build_object('outcome', 'rejected', 'reason', 'payment_method_mismatch');
  end if;

  if round(v_payment.amount, 2) <> round(p_amount_paid, 2) then
    update public.webhook_events
       set outcome = 'rejected', reason = 'amount_mismatch', processed_at = now()
     where id = v_event_id;
    return jsonb_build_object('outcome', 'rejected', 'reason', 'amount_mismatch');
  end if;

  if v_payment.status = 'paid'::public.payment_status then
    update public.webhook_events
       set outcome = 'duplicate', reason = 'payment_already_paid', processed_at = now()
     where id = v_event_id;
    return jsonb_build_object('outcome', 'duplicate', 'reason', 'payment_already_paid');
  end if;

  update public.payments
     set status = 'paid'::public.payment_status,
         monnify_transaction_reference = p_transaction_reference,
         paid_at = now(),
         updated_at = now()
   where id = v_payment.id;

  insert into public.payment_audit_log(
    payment_id, webhook_event_id, action, previous_status, new_status, detail
  ) values (
    v_payment.id,
    v_event_id,
    'monnify_payment_verified',
    v_payment.status,
    'paid'::public.payment_status,
    jsonb_build_object('transaction_reference', p_transaction_reference)
  );

  update public.webhook_events
     set outcome = 'processed', processed_at = now()
   where id = v_event_id;

  -- Deliberately no update to students.admission_status. Admission is admin-only.
  return jsonb_build_object('outcome', 'processed', 'payment_id', v_payment.id);
end;
$$;
revoke all on function public.process_monnify_payment_event(text, text, text, text, numeric) from public, anon, authenticated;
grant execute on function public.process_monnify_payment_event(text, text, text, text, numeric) to service_role;

-- Recreate deterministic triggers without duplicates.
drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles
for each row execute function public.guard_profile_role_change();

drop trigger if exists students_touch_updated_at on public.students;
create trigger students_touch_updated_at before update on public.students
for each row execute function public.touch_updated_at();

drop trigger if exists students_audit_admission on public.students;
create trigger students_audit_admission after update of admission_status on public.students
for each row execute function public.audit_admission_status_change();

drop trigger if exists assignments_touch_updated_at on public.teacher_class_assignments;
create trigger assignments_touch_updated_at before update on public.teacher_class_assignments
for each row execute function public.touch_updated_at();

drop trigger if exists grades_touch_updated_at on public.grades;
create trigger grades_touch_updated_at before update on public.grades
for each row execute function public.touch_updated_at();

drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at before update on public.payments
for each row execute function public.touch_updated_at();

drop trigger if exists payments_audit_change on public.payments;
create trigger payments_audit_change after update of status on public.payments
for each row execute function public.audit_payment_change();

drop trigger if exists auth_user_created_parent_profile on auth.users;
create trigger auth_user_created_parent_profile
after insert on auth.users
for each row execute function public.create_parent_profile();

-- Enable and force RLS even for owners where PostgreSQL supports it.
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.teacher_class_assignments enable row level security;
alter table public.grades enable row level security;
alter table public.payments enable row level security;
alter table public.webhook_events enable row level security;
alter table public.payment_audit_log enable row level security;
alter table public.admission_audit_log enable row level security;

-- Clean policy names make the migration repeatable.
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_insert on public.profiles for insert to authenticated
with check ((select public.is_admin()));
create policy profiles_update on public.profiles for update to authenticated
using (id = (select auth.uid()) or (select public.is_admin()))
with check (id = (select auth.uid()) or (select public.is_admin()));
create policy profiles_delete on public.profiles for delete to authenticated
using ((select public.is_admin()));

drop policy if exists students_select on public.students;
drop policy if exists students_insert on public.students;
drop policy if exists students_update on public.students;
drop policy if exists students_delete on public.students;
create policy students_select on public.students for select to authenticated
using (
  (select public.is_admin())
  or parent_id = (select auth.uid())
  or exists (
    select 1 from public.teacher_class_assignments a
     where a.teacher_id = (select auth.uid())
       and a.class_code = students.class_code
       and a.active = true
  )
);
create policy students_insert on public.students for insert to authenticated
with check ((select public.is_admin()));
create policy students_update on public.students for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy students_delete on public.students for delete to authenticated
using ((select public.is_admin()));

drop policy if exists assignments_select on public.teacher_class_assignments;
drop policy if exists assignments_insert on public.teacher_class_assignments;
drop policy if exists assignments_update on public.teacher_class_assignments;
drop policy if exists assignments_delete on public.teacher_class_assignments;
create policy assignments_select on public.teacher_class_assignments for select to authenticated
using (teacher_id = (select auth.uid()) or (select public.is_admin()));
create policy assignments_insert on public.teacher_class_assignments for insert to authenticated
with check ((select public.is_admin()));
create policy assignments_update on public.teacher_class_assignments for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy assignments_delete on public.teacher_class_assignments for delete to authenticated
using ((select public.is_admin()));

drop policy if exists grades_select on public.grades;
drop policy if exists grades_insert on public.grades;
drop policy if exists grades_update on public.grades;
drop policy if exists grades_delete on public.grades;
create policy grades_select on public.grades for select to authenticated
using (
  (select public.is_admin())
  or public.teacher_can_manage_grade(student_id, subject)
  or (
    published_at is not null
    and exists (
      select 1 from public.students s
       where s.id = grades.student_id
         and s.parent_id = (select auth.uid())
    )
  )
);
create policy grades_insert on public.grades for insert to authenticated
with check (
  (select public.is_admin())
  or (recorded_by = (select auth.uid()) and public.teacher_can_manage_grade(student_id, subject))
);
create policy grades_update on public.grades for update to authenticated
using ((select public.is_admin()) or public.teacher_can_manage_grade(student_id, subject))
with check (
  (select public.is_admin())
  or (recorded_by = (select auth.uid()) and public.teacher_can_manage_grade(student_id, subject))
);
create policy grades_delete on public.grades for delete to authenticated
using ((select public.is_admin()) or (recorded_by = (select auth.uid()) and public.teacher_can_manage_grade(student_id, subject)));

drop policy if exists payments_select on public.payments;
drop policy if exists payments_insert on public.payments;
drop policy if exists payments_update on public.payments;
drop policy if exists payments_delete on public.payments;
create policy payments_select on public.payments for select to authenticated
using (
  (select public.is_admin())
  or exists (
    select 1 from public.students s
     where s.id = payments.student_id
       and s.parent_id = (select auth.uid())
  )
);
create policy payments_insert on public.payments for insert to authenticated
with check ((select public.is_admin()));
create policy payments_update on public.payments for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy payments_delete on public.payments for delete to authenticated
using ((select public.is_admin()));

drop policy if exists webhook_events_admin_select on public.webhook_events;
create policy webhook_events_admin_select on public.webhook_events for select to authenticated
using ((select public.is_admin()));

drop policy if exists payment_audit_admin_select on public.payment_audit_log;
create policy payment_audit_admin_select on public.payment_audit_log for select to authenticated
using ((select public.is_admin()));

drop policy if exists admission_audit_admin_select on public.admission_audit_log;
create policy admission_audit_admin_select on public.admission_audit_log for select to authenticated
using ((select public.is_admin()));

-- RLS and grants are separate controls. Anonymous browser users receive none.
revoke all on table public.profiles, public.students, public.teacher_class_assignments,
  public.grades, public.payments, public.webhook_events,
  public.payment_audit_log, public.admission_audit_log from anon;
revoke all on table public.profiles, public.students, public.teacher_class_assignments,
  public.grades, public.payments, public.webhook_events,
  public.payment_audit_log, public.admission_audit_log from authenticated;

grant select, insert, update, delete on table public.profiles to authenticated;
grant select, insert, update, delete on table public.students to authenticated;
grant select, insert, update, delete on table public.teacher_class_assignments to authenticated;
grant select, insert, update, delete on table public.grades to authenticated;
grant select, insert, update, delete on table public.payments to authenticated;
grant select on table public.webhook_events, public.payment_audit_log, public.admission_audit_log to authenticated;
revoke all on sequence public.payment_audit_log_id_seq, public.admission_audit_log_id_seq from anon, authenticated;

-- Preserve the retired table and any historical evidence, but remove every
-- public policy/grant so it cannot expose real data if this migration is run.
do $$
declare
  p record;
begin
  if to_regclass('public.school_data') is not null then
    execute 'revoke all on table public.school_data from public, anon, authenticated';
    for p in
      select policyname from pg_policies where schemaname = 'public' and tablename = 'school_data'
    loop
      execute format('drop policy if exists %I on public.school_data', p.policyname);
    end loop;
    execute 'alter table public.school_data enable row level security';
    execute 'alter table public.school_data force row level security';
    execute 'comment on table public.school_data is ''RETIRED 2026-10-23: preserved as evidence; no API access or policies. Do not store new data.''';
  end if;
end $$;

comment on table public.profiles is 'Authenticated portal identities. Role changes are admin-only.';
comment on table public.students is 'Pupil records accessed by linked parents, assigned teachers and admins through RLS.';
comment on table public.payments is 'Bank transfer is active. Monnify fields are dormant until the integration is explicitly enabled.';
comment on function public.process_monnify_payment_event(text, text, text, text, numeric) is
  'Server-only atomic payment reconciliation. Never changes admission status.';

commit;
