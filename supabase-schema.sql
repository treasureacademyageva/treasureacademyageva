-- SAFE ENTRY POINT — Treasure Academy secure portal and school-office schema
--
-- This file mirrors the versioned migrations listed below in order. It does
-- not apply itself, alter public.school_data, activate a feature gate or retire
-- a former object. Inventory, backup and isolated staging acceptance remain
-- mandatory before any controlled production migration.
--
--   supabase/migrations/202610230001_secure_school_portal.sql
--   supabase/migrations/202610230002_portal_accounts.sql
--   supabase/migrations/202610230003_staff_operations_and_requests.sql
--   supabase/migrations/202610230004_parent_pupil_linking.sql
--   supabase/migrations/202610230005_self_registration_enrolment_and_graduates.sql
--   supabase/migrations/202610230006_fees_shop_transport_and_manual_payments.sql
--   supabase/migrations/202610240001_admission_tracking_developer_operations_and_answers.sql
--   supabase/migrations/202610240002_staff_continuity_accelerated_progression_and_account_claims.sql
--
-- Keep this mirror aligned whenever a versioned migration changes.

-- ============================================================================
-- BEGIN MIRROR: 202610230001_secure_school_portal.sql
-- ============================================================================

-- Treasure Academy secure school portal baseline
-- Date: 2026-10-23
--
-- Safe to apply through the Supabase SQL editor or migration runner only after
-- the read-only legacy inventory and backup steps in supabase/manual/README.md.
-- This migration does NOT alter or retire public.school_data or the older
-- normalized portal tables. Cut-over is deliberately separate and manual so
-- an existing Supabase portal cannot be closed before its records are preserved.
-- It does not insert real people or school data.

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

-- Keep portal plumbing separate from the former portal's live
-- public.touch_updated_at() function, which still serves public.school_data.
-- This migration must not replace or change that preserved legacy dependency.
create or replace function public.portal_touch_updated_at()
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
revoke all on function public.portal_touch_updated_at() from public, anon, authenticated;
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
for each row execute function public.portal_touch_updated_at();

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role before update on public.profiles
for each row execute function public.guard_profile_role_change();

drop trigger if exists students_touch_updated_at on public.students;
create trigger students_touch_updated_at before update on public.students
for each row execute function public.portal_touch_updated_at();

drop trigger if exists students_audit_admission on public.students;
create trigger students_audit_admission after update of admission_status on public.students
for each row execute function public.audit_admission_status_change();

drop trigger if exists assignments_touch_updated_at on public.teacher_class_assignments;
create trigger assignments_touch_updated_at before update on public.teacher_class_assignments
for each row execute function public.portal_touch_updated_at();

drop trigger if exists grades_touch_updated_at on public.grades;
create trigger grades_touch_updated_at before update on public.grades
for each row execute function public.portal_touch_updated_at();

drop trigger if exists payments_touch_updated_at on public.payments;
create trigger payments_touch_updated_at before update on public.payments
for each row execute function public.portal_touch_updated_at();

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

-- IMPORTANT: legacy public.school_data and the older normalized portal tables
-- are intentionally untouched here. Inventory and preserve them first. Only an
-- owner-approved, verified cut-over may run the separate manual retirement SQL.

comment on table public.profiles is 'Authenticated portal identities. Role changes are admin-only.';
comment on table public.students is 'Pupil records accessed by linked parents, assigned teachers and admins through RLS.';
comment on table public.payments is 'Bank transfer is active. Monnify fields are dormant until the integration is explicitly enabled.';
comment on function public.process_monnify_payment_event(text, text, text, text, numeric) is
  'Server-only atomic payment reconciliation. Never changes admission status.';

commit;

-- ============================================================================
-- BEGIN MIRROR: 202610230002_portal_accounts.sql
-- ============================================================================

-- Treasure Academy portal account lifecycle and verified caregiver links
-- Date: 2026-10-23
--
-- Apply only after 202610230001_secure_school_portal.sql and only after the
-- owner-controlled legacy inventory and backup. This migration does not alter,
-- retire, copy or delete former portal tables such as public.school_data.
-- Former passwords and PINs are never imported.

begin;

-- Account state is independent from admission and payment state.
do $$
begin
  create type public.portal_account_status as enum (
    'pending_activation',
    'active',
    'suspended',
    'archived'
  );
exception when duplicate_object then null;
end $$;

alter table public.profiles
  add column if not exists phone_e164 text,
  add column if not exists account_status public.portal_account_status not null default 'pending_activation',
  add column if not exists must_change_password boolean not null default true,
  add column if not exists phone_verified_by uuid references public.profiles(id) on delete set null,
  add column if not exists phone_verified_at timestamptz,
  add column if not exists created_by uuid references public.profiles(id) on delete set null,
  add column if not exists legacy_source text,
  add column if not exists legacy_account_no text,
  add column if not exists last_password_change_at timestamptz;

-- The nullable transition is deliberate: unknown former phone values must be
-- reconciled instead of guessed. All newly provisioned accounts require E.164.
do $$
begin
  alter table public.profiles
    add constraint profiles_phone_e164_format
    check (phone_e164 is null or phone_e164 ~ '^\+234[789][0-9]{9}$');
exception when duplicate_object then null;
end $$;
create unique index if not exists profiles_phone_e164_unique_idx
  on public.profiles(phone_e164) where phone_e164 is not null;
create index if not exists profiles_account_status_idx on public.profiles(account_status);
create index if not exists profiles_legacy_reference_idx
  on public.profiles(legacy_source, legacy_account_no)
  where legacy_source is not null and legacy_account_no is not null;

create table if not exists public.student_guardians (
  student_id uuid not null references public.students(id) on delete cascade,
  parent_id uuid not null references public.profiles(id) on delete cascade,
  relationship text not null default 'parent'
    check (relationship in ('parent', 'guardian', 'caregiver', 'legacy_primary')),
  is_primary boolean not null default false,
  active boolean not null default false,
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (student_id, parent_id),
  check ((active = false) or (verified_by is not null and verified_at is not null))
);
create index if not exists student_guardians_parent_idx
  on public.student_guardians(parent_id, active);
create unique index if not exists student_guardians_one_primary_idx
  on public.student_guardians(student_id) where is_primary = true and active = true;

-- Preserve the former one-parent value as an inactive migration candidate. An
-- administrator must verify it before the relationship grants portal access.
insert into public.student_guardians(
  student_id, parent_id, relationship, is_primary, active
)
select s.id, s.parent_id, 'legacy_primary', true, false
  from public.students s
 where s.parent_id is not null
on conflict (student_id, parent_id) do nothing;

-- parent_id is retained temporarily for compatibility and migration evidence,
-- but the verified join table is now authoritative for parent access.
alter table public.students alter column parent_id drop not null;

create table if not exists public.account_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  target_profile_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in (
    'account_provisioned',
    'password_reset_started',
    'password_changed',
    'account_status_changed',
    'sessions_revoked',
    'guardian_linked',
    'guardian_unlinked'
  )),
  reason_code text,
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists account_audit_target_idx
  on public.account_audit_log(target_profile_id, created_at desc);
create index if not exists account_audit_actor_idx
  on public.account_audit_log(actor_id, created_at desc);

create table if not exists public.legacy_account_mappings (
  id uuid primary key default gen_random_uuid(),
  source_name text not null check (char_length(trim(source_name)) between 2 and 80),
  source_key text not null check (char_length(trim(source_key)) between 1 and 160),
  profile_id uuid references public.profiles(id) on delete set null,
  mapping_status text not null default 'unmatched'
    check (mapping_status in ('unmatched', 'candidate', 'verified', 'rejected', 'archived')),
  verified_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_name, source_key)
);

-- Fixed-search-path helpers. A profile's role alone is not enough: normal data
-- access also requires a live Supabase session, an active account and completed
-- first password change. Checking auth.sessions makes reset/suspension revocation
-- effective immediately instead of waiting for a short-lived JWT to expire.
create or replace function public.portal_session_is_current()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with claim as (
    select coalesce(
      nullif(current_setting('request.jwt.claim.session_id', true), ''),
      (select auth.jwt() ->> 'session_id')
    ) as session_id
  )
  select coalesce(exists (
    select 1
      from auth.sessions s
      cross join claim c
     where s.user_id = (select auth.uid())
       and s.id = case
         when c.session_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89aAbB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$'
         then c.session_id::uuid
         else null
       end
  ), false)
$$;
revoke all on function public.portal_session_is_current() from public, anon;
grant execute on function public.portal_session_is_current() to authenticated;

create or replace function public.portal_account_can_access(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id = (select auth.uid())
     and public.portal_session_is_current()
     and coalesce(exists (
       select 1
         from public.profiles p
        where p.id = p_user_id
          and p.active = true
          and p.account_status = 'active'::public.portal_account_status
          and p.must_change_password = false
     ), false)
$$;
revoke all on function public.portal_account_can_access(uuid) from public, anon;
grant execute on function public.portal_account_can_access(uuid) to authenticated;

create or replace function public.current_user_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
    from public.profiles p
   where p.id = (select auth.uid())
     and public.portal_account_can_access(p.id)
$$;
revoke all on function public.current_user_role() from public, anon;
grant execute on function public.current_user_role() to authenticated;

create or replace function public.teacher_can_manage_grade(p_student_id uuid, p_subject text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.portal_account_can_access((select auth.uid()))
     and exists (
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

create or replace function public.parent_can_access_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.portal_account_can_access((select auth.uid()))
     and exists (
       select 1
         from public.student_guardians g
        where g.student_id = p_student_id
          and g.parent_id = (select auth.uid())
          and g.active = true
          and g.verified_by is not null
          and g.verified_at is not null
     )
$$;
revoke all on function public.parent_can_access_student(uuid) from public, anon;
grant execute on function public.parent_can_access_student(uuid) to authenticated;

-- Only server-side secret-key calls may use these helpers. Every helper checks
-- the claimed actor against an active administrator profile before changing data.
create or replace function public.server_actor_is_admin(p_actor_id uuid)
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
       and p.active = true
       and p.account_status = 'active'::public.portal_account_status
       and p.must_change_password = false
  ), false)
$$;
revoke all on function public.server_actor_is_admin(uuid) from public, anon, authenticated;
grant execute on function public.server_actor_is_admin(uuid) to service_role;

create or replace function public.server_validate_portal_session(
  p_user_id uuid,
  p_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from auth.sessions s
     where s.id = p_session_id and s.user_id = p_user_id
  ), false)
$$;
revoke all on function public.server_validate_portal_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.server_validate_portal_session(uuid, uuid) to service_role;

create or replace function public.provision_portal_account(
  p_actor_id uuid,
  p_account_id uuid,
  p_full_name text,
  p_phone_e164 text,
  p_role public.app_role,
  p_legacy_source text default null,
  p_legacy_account_no text default null,
  p_student_ids uuid[] default '{}'::uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
begin
  if not public.server_actor_is_admin(p_actor_id) then
    raise exception 'Administrator authorization required' using errcode = '42501';
  end if;
  if p_role not in ('parent'::public.app_role, 'teacher'::public.app_role) then
    raise exception 'Only parent or teacher accounts may be provisioned here' using errcode = '22023';
  end if;
  if trim(p_full_name) = '' or char_length(trim(p_full_name)) not between 2 and 120 then
    raise exception 'Invalid full name' using errcode = '22023';
  end if;
  if p_phone_e164 !~ '^\+234[789][0-9]{9}$' then
    raise exception 'Invalid Nigerian E.164 phone' using errcode = '22023';
  end if;
  if p_role = 'teacher'::public.app_role and cardinality(p_student_ids) > 0 then
    raise exception 'Teacher accounts cannot receive caregiver links' using errcode = '22023';
  end if;

  insert into public.profiles(
    id, role, full_name, phone, phone_e164, active, account_status,
    must_change_password, phone_verified_by, phone_verified_at, created_by,
    legacy_source, legacy_account_no
  ) values (
    p_account_id, p_role, trim(p_full_name), p_phone_e164, p_phone_e164, true,
    'pending_activation'::public.portal_account_status, true,
    p_actor_id, now(), p_actor_id, nullif(trim(p_legacy_source), ''),
    nullif(trim(p_legacy_account_no), '')
  )
  on conflict (id) do update set
    role = excluded.role,
    full_name = excluded.full_name,
    phone = excluded.phone,
    phone_e164 = excluded.phone_e164,
    active = true,
    account_status = 'pending_activation'::public.portal_account_status,
    must_change_password = true,
    phone_verified_by = p_actor_id,
    phone_verified_at = now(),
    created_by = coalesce(public.profiles.created_by, p_actor_id),
    legacy_source = excluded.legacy_source,
    legacy_account_no = excluded.legacy_account_no,
    updated_at = now();

  if p_role = 'parent'::public.app_role then
    foreach v_student_id in array p_student_ids loop
      if not exists (select 1 from public.students s where s.id = v_student_id) then
        raise exception 'Unknown pupil relationship target' using errcode = '23503';
      end if;
      insert into public.student_guardians(
        student_id, parent_id, relationship, is_primary, active,
        verified_by, verified_at
      ) values (
        v_student_id, p_account_id, 'parent', false, true,
        p_actor_id, now()
      )
      on conflict (student_id, parent_id) do update set
        relationship = excluded.relationship,
        active = true,
        verified_by = p_actor_id,
        verified_at = now(),
        updated_at = now();

      insert into public.account_audit_log(
        actor_id, target_profile_id, action, reason_code, detail
      ) values (
        p_actor_id, p_account_id, 'guardian_linked', 'verified_at_provisioning',
        jsonb_build_object('student_id', v_student_id)
      );
    end loop;
  end if;

  insert into public.account_audit_log(
    actor_id, target_profile_id, action, reason_code, detail
  ) values (
    p_actor_id, p_account_id, 'account_provisioned', 'office_verified',
    jsonb_build_object(
      'role', p_role,
      'legacy_reference_supplied', p_legacy_source is not null or p_legacy_account_no is not null,
      'linked_student_count', cardinality(p_student_ids)
    )
  );

  return jsonb_build_object('account_id', p_account_id, 'status', 'pending_activation');
end;
$$;
revoke all on function public.provision_portal_account(uuid, uuid, text, text, public.app_role, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.provision_portal_account(uuid, uuid, text, text, public.app_role, text, text, uuid[]) to service_role;

create or replace function public.begin_portal_password_reset(
  p_actor_id uuid,
  p_account_id uuid,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
begin
  if not public.server_actor_is_admin(p_actor_id) then
    raise exception 'Administrator authorization required' using errcode = '42501';
  end if;
  if p_reason_code not in ('in_person', 'confirmed_voice_call', 'owner_approved_record_check') then
    raise exception 'Invalid verification reason' using errcode = '22023';
  end if;

  select p.role into v_role from public.profiles p where p.id = p_account_id for update;
  if not found then raise exception 'Account not found' using errcode = 'P0002'; end if;
  if v_role = 'admin'::public.app_role then
    raise exception 'Administrator resets require owner-controlled recovery' using errcode = '42501';
  end if;

  update public.profiles
     set account_status = 'pending_activation'::public.portal_account_status,
         must_change_password = true,
         active = true,
         updated_at = now()
   where id = p_account_id;

  -- Supabase has no user-id-only Auth Admin sign-out method. Removing these
  -- session rows revokes every refresh token. Outstanding short-lived JWTs are
  -- still denied by account_status in every portal data policy below.
  delete from auth.sessions where user_id = p_account_id;

  insert into public.account_audit_log(actor_id, target_profile_id, action, reason_code)
  values (p_actor_id, p_account_id, 'password_reset_started', p_reason_code);
  insert into public.account_audit_log(actor_id, target_profile_id, action, reason_code)
  values (p_actor_id, p_account_id, 'sessions_revoked', 'password_reset');

  return jsonb_build_object('account_id', p_account_id, 'status', 'pending_activation');
end;
$$;
revoke all on function public.begin_portal_password_reset(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.begin_portal_password_reset(uuid, uuid, text) to service_role;

create or replace function public.complete_portal_password_change(
  p_account_id uuid,
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.server_validate_portal_session(p_account_id, p_session_id) then
    raise exception 'Current authenticated session required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = p_account_id
       and p.active = true
       and p.account_status = 'pending_activation'::public.portal_account_status
       and p.must_change_password = true
  ) then
    raise exception 'Account is not awaiting password change' using errcode = '22023';
  end if;

  update public.profiles
     set account_status = 'active'::public.portal_account_status,
         must_change_password = false,
         last_password_change_at = now(),
         updated_at = now()
   where id = p_account_id;

  -- Keep the session that completed the password change and revoke every other
  -- temporary-password session. portal_session_is_current() makes those revoked
  -- sessions lose RLS access immediately, even before their JWT expiry time.
  delete from auth.sessions
   where user_id = p_account_id and id <> p_session_id;
  insert into public.account_audit_log(
    actor_id, target_profile_id, action, reason_code
  ) values (
    p_account_id, p_account_id, 'sessions_revoked', 'password_change_other_sessions'
  );

  insert into public.account_audit_log(
    actor_id, target_profile_id, action, reason_code
  ) values (
    p_account_id, p_account_id, 'password_changed', 'first_login_or_office_reset'
  );

  return jsonb_build_object('account_id', p_account_id, 'status', 'active');
end;
$$;
revoke all on function public.complete_portal_password_change(uuid, uuid) from public, anon, authenticated;
grant execute on function public.complete_portal_password_change(uuid, uuid) to service_role;

create or replace function public.set_portal_account_status(
  p_actor_id uuid,
  p_account_id uuid,
  p_status public.portal_account_status,
  p_reason_code text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous public.portal_account_status;
  v_role public.app_role;
begin
  if not public.server_actor_is_admin(p_actor_id) then
    raise exception 'Administrator authorization required' using errcode = '42501';
  end if;
  select p.account_status, p.role into v_previous, v_role
    from public.profiles p where p.id = p_account_id for update;
  if not found then raise exception 'Account not found' using errcode = 'P0002'; end if;
  if v_role = 'admin'::public.app_role then
    raise exception 'Administrator status changes require owner-controlled recovery' using errcode = '42501';
  end if;
  if p_status = 'pending_activation'::public.portal_account_status then
    raise exception 'Use the password reset workflow for pending activation' using errcode = '22023';
  end if;
  if p_status = 'active'::public.portal_account_status and exists (
    select 1 from public.profiles p where p.id = p_account_id and p.must_change_password = true
  ) then
    raise exception 'Password change must be completed before activation' using errcode = '22023';
  end if;
  if p_reason_code not in ('identity_review_complete', 'security_concern', 'employment_ended', 'relationship_changed', 'owner_instruction') then
    raise exception 'Invalid account status reason' using errcode = '22023';
  end if;

  update public.profiles
     set account_status = p_status,
         active = (p_status in ('active'::public.portal_account_status, 'pending_activation'::public.portal_account_status)),
         updated_at = now()
   where id = p_account_id;

  if p_status in ('suspended'::public.portal_account_status, 'archived'::public.portal_account_status) then
    delete from auth.sessions where user_id = p_account_id;
    insert into public.account_audit_log(actor_id, target_profile_id, action, reason_code)
    values (p_actor_id, p_account_id, 'sessions_revoked', 'account_status_changed');
  end if;

  insert into public.account_audit_log(
    actor_id, target_profile_id, action, reason_code, detail
  ) values (
    p_actor_id, p_account_id, 'account_status_changed', p_reason_code,
    jsonb_build_object('from', v_previous, 'to', p_status)
  );

  return jsonb_build_object('account_id', p_account_id, 'status', p_status);
end;
$$;
revoke all on function public.set_portal_account_status(uuid, uuid, public.portal_account_status, text) from public, anon, authenticated;
grant execute on function public.set_portal_account_status(uuid, uuid, public.portal_account_status, text) to service_role;

create or replace function public.set_verified_guardian_link(
  p_actor_id uuid,
  p_parent_id uuid,
  p_student_id uuid,
  p_relationship text,
  p_active boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.server_actor_is_admin(p_actor_id) then
    raise exception 'Administrator authorization required' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles p
     where p.id = p_parent_id and p.role = 'parent'::public.app_role
  ) then
    raise exception 'Verified parent account required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.students s where s.id = p_student_id) then
    raise exception 'Pupil not found' using errcode = 'P0002';
  end if;
  if p_relationship not in ('parent', 'guardian', 'caregiver') then
    raise exception 'Invalid caregiver relationship' using errcode = '22023';
  end if;

  insert into public.student_guardians(
    student_id, parent_id, relationship, is_primary, active,
    verified_by, verified_at
  ) values (
    p_student_id, p_parent_id, p_relationship, false, p_active,
    case when p_active then p_actor_id else null end,
    case when p_active then now() else null end
  )
  on conflict (student_id, parent_id) do update set
    relationship = excluded.relationship,
    is_primary = false,
    active = excluded.active,
    verified_by = excluded.verified_by,
    verified_at = excluded.verified_at,
    updated_at = now();

  insert into public.account_audit_log(
    actor_id, target_profile_id, action, reason_code, detail
  ) values (
    p_actor_id, p_parent_id,
    case when p_active then 'guardian_linked' else 'guardian_unlinked' end,
    'office_relationship_verification',
    jsonb_build_object('student_id', p_student_id, 'relationship', p_relationship)
  );

  return jsonb_build_object(
    'parent_id', p_parent_id,
    'student_id', p_student_id,
    'active', p_active
  );
end;
$$;
revoke all on function public.set_verified_guardian_link(uuid, uuid, uuid, text, boolean) from public, anon, authenticated;
grant execute on function public.set_verified_guardian_link(uuid, uuid, uuid, text, boolean) to service_role;

-- The Auth trigger always creates a restricted parent-shaped shell. The trusted
-- provisioning RPC deliberately assigns the verified role and relationships.
create or replace function public.create_parent_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles(
    id, role, full_name, phone, phone_e164, active,
    account_status, must_change_password
  ) values (
    new.id,
    'parent'::public.app_role,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), 'Pending account'),
    nullif(trim(new.phone), ''),
    case when coalesce(new.phone, '') ~ '^\+234[789][0-9]{9}$' then new.phone else null end,
    true,
    'pending_activation'::public.portal_account_status,
    true
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function public.create_parent_profile() from public, anon, authenticated;

-- Sensitive identity/status fields cannot be changed directly from browser SQL.
create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    new.role is distinct from old.role
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
  )
  and session_user not in ('postgres', 'supabase_admin', 'supabase_auth_admin')
  and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Protected account fields require the trusted account service' using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_profile_role_change() from public, anon, authenticated;

-- Existing pupil-entry UI may still supply parent_id during the transition. This
-- trigger creates an explicitly verified link only when an authenticated admin
-- performs that insert/update; parent_id itself no longer grants access.
create or replace function public.sync_primary_guardian_from_student_parent()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.parent_id is null or not public.is_admin() then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if new.parent_id is not distinct from old.parent_id then
      return new;
    end if;
  end if;

  update public.student_guardians
       set is_primary = false, updated_at = now()
     where student_id = new.id and is_primary = true and parent_id <> new.parent_id;

    insert into public.student_guardians(
      student_id, parent_id, relationship, is_primary, active,
      verified_by, verified_at
    ) values (
      new.id, new.parent_id, 'parent', true, true,
      (select auth.uid()), now()
    )
    on conflict (student_id, parent_id) do update set
      relationship = 'parent',
      is_primary = true,
      active = true,
      verified_by = (select auth.uid()),
      verified_at = now(),
      updated_at = now();
  return new;
end;
$$;
revoke all on function public.sync_primary_guardian_from_student_parent() from public, anon, authenticated;

drop trigger if exists students_sync_primary_guardian on public.students;
create trigger students_sync_primary_guardian
after insert or update of parent_id on public.students
for each row execute function public.sync_primary_guardian_from_student_parent();

drop trigger if exists student_guardians_touch_updated_at on public.student_guardians;
create trigger student_guardians_touch_updated_at before update on public.student_guardians
for each row execute function public.portal_touch_updated_at();

drop trigger if exists legacy_account_mappings_touch_updated_at on public.legacy_account_mappings;
create trigger legacy_account_mappings_touch_updated_at before update on public.legacy_account_mappings
for each row execute function public.portal_touch_updated_at();

-- RLS for new account tables.
alter table public.student_guardians enable row level security;
alter table public.account_audit_log enable row level security;
alter table public.legacy_account_mappings enable row level security;

drop policy if exists student_guardians_select on public.student_guardians;
create policy student_guardians_select on public.student_guardians for select to authenticated
using (
  (parent_id = (select auth.uid()) and public.portal_account_can_access((select auth.uid())))
  or (select public.is_admin())
);

drop policy if exists account_audit_admin_select on public.account_audit_log;
create policy account_audit_admin_select on public.account_audit_log for select to authenticated
using ((select public.is_admin()));

drop policy if exists legacy_account_mappings_admin_select on public.legacy_account_mappings;
create policy legacy_account_mappings_admin_select on public.legacy_account_mappings for select to authenticated
using ((select public.is_admin()));

-- Replace baseline policies so pending/suspended/archived accounts and
-- unverified caregiver links cannot read school records.
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_insert on public.profiles;
drop policy if exists profiles_update on public.profiles;
drop policy if exists profiles_delete on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
using (
  (id = (select auth.uid()) and public.portal_session_is_current())
  or (select public.is_admin())
);
create policy profiles_insert on public.profiles for insert to authenticated
with check (false);
create policy profiles_update on public.profiles for update to authenticated
using (false) with check (false);
create policy profiles_delete on public.profiles for delete to authenticated
using (false);

drop policy if exists students_select on public.students;
create policy students_select on public.students for select to authenticated
using (
  (select public.is_admin())
  or (
    public.portal_account_can_access((select auth.uid()))
    and exists (
      select 1 from public.teacher_class_assignments a
       where a.teacher_id = (select auth.uid())
         and a.class_code = students.class_code
         and a.active = true
    )
  )
);

drop policy if exists assignments_select on public.teacher_class_assignments;
create policy assignments_select on public.teacher_class_assignments for select to authenticated
using (
  (select public.is_admin())
  or (
    teacher_id = (select auth.uid())
    and public.portal_account_can_access((select auth.uid()))
  )
);

drop policy if exists grades_select on public.grades;
create policy grades_select on public.grades for select to authenticated
using (
  (select public.is_admin())
  or (
    public.portal_account_can_access((select auth.uid()))
    and public.teacher_can_manage_grade(student_id, subject)
  )
  or (
    published_at is not null
    and public.parent_can_access_student(student_id)
  )
);

drop policy if exists grades_insert on public.grades;
create policy grades_insert on public.grades for insert to authenticated
with check (
  (select public.is_admin())
  or (
    public.portal_account_can_access((select auth.uid()))
    and recorded_by = (select auth.uid())
    and public.teacher_can_manage_grade(student_id, subject)
  )
);

drop policy if exists grades_update on public.grades;
create policy grades_update on public.grades for update to authenticated
using (
  (select public.is_admin())
  or (
    public.portal_account_can_access((select auth.uid()))
    and public.teacher_can_manage_grade(student_id, subject)
  )
)
with check (
  (select public.is_admin())
  or (
    public.portal_account_can_access((select auth.uid()))
    and recorded_by = (select auth.uid())
    and public.teacher_can_manage_grade(student_id, subject)
  )
);

drop policy if exists grades_delete on public.grades;
create policy grades_delete on public.grades for delete to authenticated
using (
  (select public.is_admin())
  or (
    public.portal_account_can_access((select auth.uid()))
    and recorded_by = (select auth.uid())
    and public.teacher_can_manage_grade(student_id, subject)
  )
);

drop policy if exists payments_select on public.payments;
create policy payments_select on public.payments for select to authenticated
using (
  (select public.is_admin())
  or public.parent_can_access_student(student_id)
);

-- Write policies on school records retain their admin/teacher restrictions;
-- is_admin/current_user_role now also enforce active account state.

revoke all on table public.student_guardians, public.account_audit_log,
  public.legacy_account_mappings from anon, authenticated;
grant select on table public.student_guardians to authenticated;
grant select on table public.account_audit_log, public.legacy_account_mappings to authenticated;
revoke all on sequence public.account_audit_log_id_seq from anon, authenticated;

comment on column public.students.parent_id is
  'Deprecated migration reference. Verified access is controlled by student_guardians.';
comment on table public.student_guardians is
  'Office-verified caregiver relationships. Active verified rows grant parent access through RLS.';
comment on table public.account_audit_log is
  'Append-only account actions. Passwords and private verification evidence must never be stored here.';
comment on table public.legacy_account_mappings is
  'Owner-reviewed mapping evidence only; never stores former passwords or PINs.';

-- IMPORTANT: public.school_data and every former portal object remain untouched.
-- Do not run retirement SQL until export, mapping, staging and owner approval.

commit;

-- ============================================================================
-- BEGIN MIRROR: 202610230003_staff_operations_and_requests.sql
-- ============================================================================

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

-- ============================================================================
-- BEGIN MIRROR: 202610230004_parent_pupil_linking.sql
-- ============================================================================

-- Treasure Academy parent–pupil linking and parent admission applications
-- Date: 2026-10-23
--
-- Apply only after migrations 001–003, an owner-controlled export and isolated
-- staging acceptance. This migration creates no real people or pupil records.
-- It does not alter or retire public.school_data.

begin;

-- Existing pupils may not have a dependable historical admission number. UUID
-- identity remains authoritative; a verified number can be added later.
alter table public.students alter column admission_number drop not null;

create table if not exists public.pupil_link_codes (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active', 'consumed', 'revoked', 'expired')),
  issued_by uuid not null references public.profiles(id) on delete restrict,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_by uuid references public.profiles(id) on delete set null,
  consumed_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete set null,
  revoked_at timestamptz,
  check (expires_at > issued_at),
  check ((status <> 'consumed') or (consumed_by is not null and consumed_at is not null)),
  check ((status <> 'revoked') or (revoked_by is not null and revoked_at is not null))
);
create unique index if not exists pupil_link_codes_one_active_idx
  on public.pupil_link_codes(student_id) where status = 'active';
create index if not exists pupil_link_codes_expiry_idx
  on public.pupil_link_codes(status, expires_at);

create table if not exists public.guardian_invitations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  invited_by uuid not null references public.profiles(id) on delete cascade,
  intended_phone_e164 text not null check (intended_phone_e164 ~ '^\+234[789][0-9]{9}$'),
  code_hash text not null unique check (code_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'active' check (status in ('active', 'consumed', 'revoked', 'expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_by uuid references public.profiles(id) on delete set null,
  consumed_at timestamptz,
  check (expires_at > created_at),
  check ((status <> 'consumed') or (consumed_by is not null and consumed_at is not null))
);
create index if not exists guardian_invitations_expiry_idx
  on public.guardian_invitations(status, expires_at);
create unique index if not exists guardian_invitations_one_active_idx
  on public.guardian_invitations(student_id) where status = 'active';

create table if not exists public.pupil_link_attempts (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('match', 'redeem_pupil_code', 'create_second_invite', 'redeem_second_invite')),
  succeeded boolean not null,
  reason_code text not null check (char_length(reason_code) between 2 and 80),
  created_at timestamptz not null default now()
);
create index if not exists pupil_link_attempts_actor_idx
  on public.pupil_link_attempts(actor_id, created_at desc);

create table if not exists public.pupil_link_events (
  id bigint generated always as identity primary key,
  student_id uuid references public.students(id) on delete set null,
  actor_id uuid references public.profiles(id) on delete set null,
  target_parent_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in (
    'pupil_code_issued', 'pupil_code_revoked', 'pupil_linked',
    'second_guardian_invited', 'second_guardian_linked', 'guardian_link_removed'
  )),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists pupil_link_events_student_idx
  on public.pupil_link_events(student_id, created_at desc);

create table if not exists public.admission_applications (
  id uuid primary key default gen_random_uuid(),
  application_reference text not null unique
    check (application_reference ~ '^TA-ADM-[0-9]{8}-[A-Z0-9]{8}$'),
  parent_id uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  child_name text not null check (char_length(trim(child_name)) between 2 and 120),
  requested_class text not null check (char_length(trim(requested_class)) between 1 and 40),
  parent_note text check (parent_note is null or char_length(parent_note) <= 2000),
  status public.admission_status not null default 'pending',
  decision_note text check (decision_note is null or char_length(decision_note) <= 2000),
  decided_by uuid references public.profiles(id) on delete set null,
  decided_at timestamptz,
  student_id uuid references public.students(id) on delete set null,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists admission_applications_parent_idx
  on public.admission_applications(parent_id, submitted_at desc);
create index if not exists admission_applications_queue_idx
  on public.admission_applications(status, submitted_at desc);

create table if not exists public.admission_application_events (
  id bigint generated always as identity primary key,
  application_id uuid not null references public.admission_applications(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  previous_status public.admission_status,
  new_status public.admission_status not null,
  note text check (note is null or char_length(note) <= 2000),
  created_at timestamptz not null default now()
);
create index if not exists admission_application_events_application_idx
  on public.admission_application_events(application_id, created_at desc);

create or replace function public.normalize_pupil_match_name(p_value text)
returns text
language sql
immutable
set search_path = ''
as $$
  select lower(regexp_replace(trim(coalesce(p_value, '')), '[^[:alnum:]]+', '', 'g'))
$$;
revoke all on function public.normalize_pupil_match_name(text) from public, anon;
grant execute on function public.normalize_pupil_match_name(text) to authenticated, service_role;

create unique index if not exists admission_applications_one_open_child_idx
  on public.admission_applications(
    parent_id,
    public.normalize_pupil_match_name(child_name),
    lower(trim(requested_class))
  ) where status not in ('declined'::public.admission_status, 'withdrawn'::public.admission_status);

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
       and p.active = true
       and p.account_status = 'active'::public.portal_account_status
       and p.must_change_password = false
  ), false)
$$;
revoke all on function public.server_actor_is_active_parent(uuid) from public, anon, authenticated;
grant execute on function public.server_actor_is_active_parent(uuid) to service_role;

create or replace function public.guard_two_active_guardians()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.active then
    if not exists (
      select 1 from public.profiles p
       where p.id = new.parent_id
         and p.role = 'parent'::public.app_role
         and p.active = true
         and p.account_status in (
           'pending_activation'::public.portal_account_status,
           'active'::public.portal_account_status
         )
    ) then
      raise exception 'An active parent account is required' using errcode = '42501';
    end if;
    if (
      select count(*) from public.student_guardians g
       where g.student_id = new.student_id
         and g.active = true
         and g.parent_id <> new.parent_id
    ) >= 2 then
      raise exception 'A pupil may have at most two active parent or guardian accounts' using errcode = '23514';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_two_active_guardians() from public, anon, authenticated;

drop trigger if exists student_guardians_limit_two on public.student_guardians;
create trigger student_guardians_limit_two
before insert or update of student_id, parent_id, active on public.student_guardians
for each row execute function public.guard_two_active_guardians();

create or replace function public.server_parent_match_pupil(
  p_actor_id uuid,
  p_class_code text,
  p_registered_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_matches integer;
  v_recent integer;
begin
  if not public.server_actor_is_active_parent(p_actor_id) then
    raise exception 'Active parent account required' using errcode = '42501';
  end if;
  if char_length(trim(coalesce(p_class_code, ''))) not between 1 and 40
     or char_length(trim(coalesce(p_registered_name, ''))) not between 2 and 120 then
    raise exception 'Invalid pupil matching details' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 904));
  select count(*) into v_recent from public.pupil_link_attempts a
   where a.actor_id = p_actor_id and a.created_at >= now() - interval '1 hour';
  if v_recent >= 20 then
    raise exception 'pupil_link_rate_limited' using errcode = 'P0001';
  end if;

  select count(*) into v_matches
    from public.students s
   where s.active = true
     and s.admission_status = 'admitted'::public.admission_status
     and lower(trim(s.class_code)) = lower(trim(p_class_code))
     and public.normalize_pupil_match_name(s.full_name) = public.normalize_pupil_match_name(p_registered_name);

  insert into public.pupil_link_attempts(actor_id, action, succeeded, reason_code)
  values (p_actor_id, 'match', v_matches > 0, case when v_matches > 0 then 'candidate_found' else 'no_candidate' end);
  return jsonb_build_object('matched', v_matches > 0);
end;
$$;
revoke all on function public.server_parent_match_pupil(uuid, text, text) from public, anon, authenticated;
grant execute on function public.server_parent_match_pupil(uuid, text, text) to service_role;

create or replace function public.server_issue_pupil_link_code(
  p_actor_id uuid,
  p_student_id uuid,
  p_code_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code_id uuid;
begin
  if not public.server_actor_is_headmistress(p_actor_id) then
    raise exception 'Headmistress permission required' using errcode = '42501';
  end if;
  if p_code_hash !~ '^[a-f0-9]{64}$' or p_expires_at <= now() or p_expires_at > now() + interval '90 days' then
    raise exception 'Invalid pupil-linking credential' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.students s
     where s.id = p_student_id and s.active = true
       and s.admission_status = 'admitted'::public.admission_status
  ) then
    raise exception 'Only an active enrolled pupil can receive a linking code' using errcode = '23503';
  end if;

  update public.pupil_link_codes
     set status = 'revoked', revoked_by = p_actor_id, revoked_at = now()
   where student_id = p_student_id and status = 'active';
  insert into public.pupil_link_codes(student_id, code_hash, issued_by, expires_at)
  values (p_student_id, p_code_hash, p_actor_id, p_expires_at)
  returning id into v_code_id;
  insert into public.pupil_link_events(student_id, actor_id, action, detail)
  values (p_student_id, p_actor_id, 'pupil_code_issued', jsonb_build_object('code_id', v_code_id, 'expires_at', p_expires_at));
  return jsonb_build_object('code_id', v_code_id, 'expires_at', p_expires_at);
end;
$$;
revoke all on function public.server_issue_pupil_link_code(uuid, uuid, text, timestamptz) from public, anon, authenticated;
grant execute on function public.server_issue_pupil_link_code(uuid, uuid, text, timestamptz) to service_role;

create or replace function public.server_redeem_pupil_link_code(
  p_actor_id uuid,
  p_class_code text,
  p_registered_name text,
  p_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code public.pupil_link_codes%rowtype;
  v_student public.students%rowtype;
  v_existing boolean;
  v_guardian_count integer;
begin
  if not public.server_actor_is_active_parent(p_actor_id) then
    raise exception 'Active parent account required' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 905));
  if (select count(*) from public.pupil_link_attempts a where a.actor_id = p_actor_id and a.created_at >= now() - interval '1 hour') >= 20 then
    raise exception 'pupil_link_rate_limited' using errcode = 'P0001';
  end if;

  select c.* into v_code
    from public.pupil_link_codes c
   where c.code_hash = p_code_hash
   for update;
  if not found or v_code.status <> 'active' or v_code.expires_at <= now() then
    insert into public.pupil_link_attempts(actor_id, action, succeeded, reason_code)
    values (p_actor_id, 'redeem_pupil_code', false, 'invalid_or_expired_code');
    return jsonb_build_object('linked', false);
  end if;
  select s.* into v_student from public.students s where s.id = v_code.student_id for update;
  if not found or v_student.active <> true
     or v_student.admission_status <> 'admitted'::public.admission_status
     or lower(trim(v_student.class_code)) <> lower(trim(p_class_code))
     or public.normalize_pupil_match_name(v_student.full_name) <> public.normalize_pupil_match_name(p_registered_name) then
    insert into public.pupil_link_attempts(actor_id, action, succeeded, reason_code)
    values (p_actor_id, 'redeem_pupil_code', false, 'pupil_details_mismatch');
    return jsonb_build_object('linked', false);
  end if;

  select exists(select 1 from public.student_guardians g where g.student_id = v_student.id and g.parent_id = p_actor_id and g.active = true)
    into v_existing;
  if v_existing then return jsonb_build_object('linked', true, 'already_linked', true); end if;
  select count(*) into v_guardian_count from public.student_guardians g where g.student_id = v_student.id and g.active = true;
  if v_guardian_count >= 2 then
    insert into public.pupil_link_attempts(actor_id, action, succeeded, reason_code)
    values (p_actor_id, 'redeem_pupil_code', false, 'guardian_limit_reached');
    return jsonb_build_object('linked', false);
  end if;

  insert into public.student_guardians(student_id, parent_id, relationship, is_primary, active, verified_by, verified_at)
  values (v_student.id, p_actor_id, 'parent', v_guardian_count = 0, true, v_code.issued_by, now())
  on conflict (student_id, parent_id) do update set
    relationship = 'parent', active = true, is_primary = (v_guardian_count = 0),
    verified_by = v_code.issued_by, verified_at = now(), updated_at = now();
  update public.pupil_link_codes
     set status = 'consumed', consumed_by = p_actor_id, consumed_at = now()
   where id = v_code.id;
  insert into public.pupil_link_attempts(actor_id, action, succeeded, reason_code)
  values (p_actor_id, 'redeem_pupil_code', true, 'pupil_linked');
  insert into public.pupil_link_events(student_id, actor_id, target_parent_id, action, detail)
  values (v_student.id, p_actor_id, p_actor_id, 'pupil_linked', jsonb_build_object('method', 'school_pupil_code'));
  return jsonb_build_object('linked', true, 'already_linked', false);
end;
$$;
revoke all on function public.server_redeem_pupil_link_code(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.server_redeem_pupil_link_code(uuid, text, text, text) to service_role;

create or replace function public.server_create_second_guardian_invitation(
  p_actor_id uuid,
  p_student_id uuid,
  p_intended_phone_e164 text,
  p_code_hash text,
  p_expires_at timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation_id uuid;
  v_count integer;
begin
  if not public.server_actor_is_active_parent(p_actor_id) then raise exception 'Active parent account required' using errcode = '42501'; end if;
  if p_intended_phone_e164 !~ '^\+234[789][0-9]{9}$' or p_code_hash !~ '^[a-f0-9]{64}$'
     or p_expires_at <= now() or p_expires_at > now() + interval '7 days' then
    raise exception 'Invalid second-parent invitation' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.student_guardians g
     where g.student_id = p_student_id and g.parent_id = p_actor_id and g.active = true
  ) then raise exception 'Linked parent access required' using errcode = '42501'; end if;
  if exists (select 1 from public.profiles p where p.id = p_actor_id and p.phone_e164 = p_intended_phone_e164) then
    raise exception 'Use a different phone number for the second parent' using errcode = '22023';
  end if;
  select count(*) into v_count from public.student_guardians g where g.student_id = p_student_id and g.active = true;
  if v_count >= 2 then raise exception 'This pupil already has two active parents or guardians' using errcode = '23514'; end if;

  update public.guardian_invitations set status = 'revoked'
   where student_id = p_student_id and status = 'active';
  insert into public.guardian_invitations(student_id, invited_by, intended_phone_e164, code_hash, expires_at)
  values (p_student_id, p_actor_id, p_intended_phone_e164, p_code_hash, p_expires_at)
  returning id into v_invitation_id;
  insert into public.pupil_link_attempts(actor_id, action, succeeded, reason_code)
  values (p_actor_id, 'create_second_invite', true, 'invitation_created');
  insert into public.pupil_link_events(student_id, actor_id, action, detail)
  values (p_student_id, p_actor_id, 'second_guardian_invited', jsonb_build_object('invitation_id', v_invitation_id, 'expires_at', p_expires_at));
  return jsonb_build_object('invitation_id', v_invitation_id, 'expires_at', p_expires_at);
end;
$$;
revoke all on function public.server_create_second_guardian_invitation(uuid, uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.server_create_second_guardian_invitation(uuid, uuid, text, text, timestamptz) to service_role;

create or replace function public.server_redeem_second_guardian_invitation(
  p_actor_id uuid,
  p_code_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_invitation public.guardian_invitations%rowtype;
  v_parent public.profiles%rowtype;
  v_verifier uuid;
  v_count integer;
begin
  if not public.server_actor_is_active_parent(p_actor_id) then raise exception 'Active parent account required' using errcode = '42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_actor_id::text, 906));
  if (select count(*) from public.pupil_link_attempts a where a.actor_id = p_actor_id and a.created_at >= now() - interval '1 hour') >= 20 then
    raise exception 'pupil_link_rate_limited' using errcode = 'P0001';
  end if;
  select * into v_parent from public.profiles p where p.id = p_actor_id;
  select i.* into v_invitation from public.guardian_invitations i where i.code_hash = p_code_hash for update;
  if not found or v_invitation.status <> 'active' or v_invitation.expires_at <= now()
     or v_parent.phone_e164 is distinct from v_invitation.intended_phone_e164 then
    insert into public.pupil_link_attempts(actor_id, action, succeeded, reason_code)
    values (p_actor_id, 'redeem_second_invite', false, 'invalid_invitation');
    return jsonb_build_object('linked', false);
  end if;
  if not exists (
    select 1 from public.student_guardians g
     where g.student_id = v_invitation.student_id and g.parent_id = v_invitation.invited_by and g.active = true
  ) then return jsonb_build_object('linked', false); end if;
  if exists (
    select 1 from public.student_guardians g
     where g.student_id = v_invitation.student_id and g.parent_id = p_actor_id and g.active = true
  ) then return jsonb_build_object('linked', true, 'already_linked', true); end if;
  select count(*) into v_count from public.student_guardians g where g.student_id = v_invitation.student_id and g.active = true;
  if v_count >= 2 then return jsonb_build_object('linked', false); end if;
  select g.verified_by into v_verifier from public.student_guardians g
   where g.student_id = v_invitation.student_id and g.parent_id = v_invitation.invited_by and g.active = true;

  insert into public.student_guardians(student_id, parent_id, relationship, is_primary, active, verified_by, verified_at)
  values (v_invitation.student_id, p_actor_id, 'parent', false, true, v_verifier, now())
  on conflict (student_id, parent_id) do update set
    relationship = 'parent', is_primary = false, active = true,
    verified_by = v_verifier, verified_at = now(), updated_at = now();
  update public.guardian_invitations
     set status = 'consumed', consumed_by = p_actor_id, consumed_at = now()
   where id = v_invitation.id;
  insert into public.pupil_link_attempts(actor_id, action, succeeded, reason_code)
  values (p_actor_id, 'redeem_second_invite', true, 'second_guardian_linked');
  insert into public.pupil_link_events(student_id, actor_id, target_parent_id, action, detail)
  values (v_invitation.student_id, v_invitation.invited_by, p_actor_id, 'second_guardian_linked', jsonb_build_object('method', 'first_parent_invitation'));
  return jsonb_build_object('linked', true, 'already_linked', false);
end;
$$;
revoke all on function public.server_redeem_second_guardian_invitation(uuid, text) from public, anon, authenticated;
grant execute on function public.server_redeem_second_guardian_invitation(uuid, text) to service_role;

create or replace function public.guard_admission_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.app_role;
  v_student_id uuid;
begin
  if coalesce((select auth.role()), '') = 'service_role' or session_user in ('postgres', 'supabase_admin') then return new; end if;
  v_role := public.current_user_role();
  if tg_op = 'INSERT' then
    if v_role <> 'parent'::public.app_role then raise exception 'Active parent account required' using errcode = '42501'; end if;
    new.parent_id := (select auth.uid());
    new.status := 'pending'::public.admission_status;
    new.decision_note := null; new.decided_by := null; new.decided_at := null; new.student_id := null;
  else
    if v_role <> 'admin'::public.app_role then raise exception 'Administrator admission decision required' using errcode = '42501'; end if;
    if new.id is distinct from old.id or new.application_reference is distinct from old.application_reference
       or new.parent_id is distinct from old.parent_id or new.child_name is distinct from old.child_name
       or new.requested_class is distinct from old.requested_class or new.parent_note is distinct from old.parent_note
       or new.submitted_at is distinct from old.submitted_at or new.student_id is distinct from old.student_id
       or new.decided_by is distinct from old.decided_by or new.decided_at is distinct from old.decided_at then
      raise exception 'Application identity, applicant details and decision metadata are immutable' using errcode = '42501';
    end if;
    if new.decision_note is distinct from old.decision_note and new.status is not distinct from old.status then
      raise exception 'A decision note must accompany an admission status transition' using errcode = '22023';
    end if;
    if new.status is distinct from old.status and not (
      (old.status = 'pending'::public.admission_status and new.status in ('under_review'::public.admission_status, 'declined'::public.admission_status, 'withdrawn'::public.admission_status))
      or (old.status = 'under_review'::public.admission_status and new.status in ('offered'::public.admission_status, 'declined'::public.admission_status, 'withdrawn'::public.admission_status))
      or (old.status = 'offered'::public.admission_status and new.status in ('admitted'::public.admission_status, 'declined'::public.admission_status, 'withdrawn'::public.admission_status))
    ) then raise exception 'Invalid admission application transition' using errcode = '22023'; end if;
    if new.status is distinct from old.status then
      new.decided_by := (select auth.uid()); new.decided_at := now();
    end if;
    if new.status = 'admitted'::public.admission_status and old.status <> new.status then
      if exists (
        select 1
          from public.students s
          join public.student_guardians g on g.student_id = s.id
         where g.parent_id = old.parent_id and g.active = true and s.active = true
           and lower(trim(s.class_code)) = lower(trim(old.requested_class))
           and public.normalize_pupil_match_name(s.full_name) = public.normalize_pupil_match_name(old.child_name)
      ) then
        raise exception 'This parent already has a matching linked pupil' using errcode = '23505';
      end if;
      insert into public.students(admission_number, full_name, class_code, parent_id, admission_status, active)
      values (null, old.child_name, old.requested_class, null, 'admitted', true)
      returning id into v_student_id;
      insert into public.student_guardians(student_id, parent_id, relationship, is_primary, active, verified_by, verified_at)
      values (v_student_id, old.parent_id, 'parent', true, true, (select auth.uid()), now());
      new.student_id := v_student_id;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.guard_admission_application() from public, anon, authenticated;

create or replace function public.audit_admission_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.admission_application_events(application_id, actor_id, previous_status, new_status, note)
    values (new.id, (select auth.uid()), case when tg_op = 'UPDATE' then old.status else null end, new.status,
      case when tg_op = 'UPDATE' then new.decision_note else null end);
  end if;
  return new;
end;
$$;
revoke all on function public.audit_admission_application() from public, anon, authenticated;

drop trigger if exists admission_applications_touch_updated_at on public.admission_applications;
create trigger admission_applications_touch_updated_at before update on public.admission_applications
for each row execute function public.portal_touch_updated_at();
drop trigger if exists admission_applications_guard on public.admission_applications;
create trigger admission_applications_guard before insert or update on public.admission_applications
for each row execute function public.guard_admission_application();
drop trigger if exists admission_applications_audit on public.admission_applications;
create trigger admission_applications_audit after insert or update of status on public.admission_applications
for each row execute function public.audit_admission_application();

alter table public.pupil_link_codes enable row level security;
alter table public.guardian_invitations enable row level security;
alter table public.pupil_link_attempts enable row level security;
alter table public.pupil_link_events enable row level security;
alter table public.admission_applications enable row level security;
alter table public.admission_application_events enable row level security;

create policy pupil_link_events_head_select on public.pupil_link_events for select to authenticated
using ((select public.is_headmistress()));
create policy admission_applications_select on public.admission_applications for select to authenticated
using (parent_id = (select auth.uid()) or (select public.is_admin()));
create policy admission_applications_parent_insert on public.admission_applications for insert to authenticated
with check (parent_id = (select auth.uid()) and (select public.current_user_role()) = 'parent'::public.app_role);
create policy admission_applications_admin_update on public.admission_applications for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy admission_application_events_select on public.admission_application_events for select to authenticated
using ((select public.is_admin()) or exists (
  select 1 from public.admission_applications a
   where a.id = admission_application_events.application_id and a.parent_id = (select auth.uid())
));

revoke all on table public.pupil_link_codes, public.guardian_invitations,
  public.pupil_link_attempts, public.pupil_link_events, public.admission_applications,
  public.admission_application_events from anon, authenticated;
grant select on table public.pupil_link_events to authenticated;
grant select, insert, update on table public.admission_applications to authenticated;
grant select on table public.admission_application_events to authenticated;
revoke all on sequence public.pupil_link_attempts_id_seq, public.pupil_link_events_id_seq,
  public.admission_application_events_id_seq from anon, authenticated;

comment on column public.students.admission_number is 'Optional verified school admission number. Existing pupils may initially have no dependable historical number.';
comment on table public.pupil_link_codes is 'Single-use school-issued credentials. Only one-way code hashes are retained.';
comment on table public.guardian_invitations is 'Phone-bound, single-use invitations for the second and final parent/guardian account.';
comment on table public.admission_applications is 'Parent admission applications kept separate from active pupils, payments and parent linking.';

-- IMPORTANT: public.school_data and former portal objects remain untouched.
commit;

-- ============================================================================
-- BEGIN MIRROR: 202610230005_self_registration_enrolment_and_graduates.sql
-- ============================================================================

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

-- ============================================================================
-- BEGIN MIRROR: 202610230006_fees_shop_transport_and_manual_payments.sql
-- ============================================================================

-- Treasure Academy fees, physical inventory, fulfilment, transport and manual payments
-- Date: 2026-10-23
--
-- Payment policy encoded here:
--   * parent-submitted bank-transfer notification, manually verified; or
--   * in-person physical school POS record, manually recorded by an administrator.
-- No card capture, payment gateway, WhatsApp evidence, automatic verification or
-- admission/result/promotion side effect exists in this migration.
--
-- Apply only after migrations 001-005, preservation exports and staging QA.

begin;

create or replace function public.full_parent_access()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.profiles p
     where p.id = (select auth.uid())
       and p.role = 'parent'::public.app_role
       and p.parent_stage = 'parent'
       and public.portal_account_can_access(p.id)
  ), false)
$$;
revoke all on function public.full_parent_access() from public, anon;
grant execute on function public.full_parent_access() to authenticated;

-- Owner-approved bank details are visible only after full parent sign-in and on
-- generated invoices. Values are deliberately absent from this migration.
create table if not exists public.school_bank_accounts (
  id uuid primary key default gen_random_uuid(),
  bank_name text not null check (char_length(trim(bank_name)) between 2 and 120),
  account_name text not null check (char_length(trim(account_name)) between 2 and 160),
  account_number text not null check (account_number ~ '^[0-9]{10}$'),
  active boolean not null default false,
  approved_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  approved_at timestamptz not null default now(),
  deactivated_by uuid references public.profiles(id) on delete restrict,
  deactivated_at timestamptz,
  deactivation_reason text check (deactivation_reason is null or char_length(trim(deactivation_reason)) between 3 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists one_active_school_bank_account
  on public.school_bank_accounts(active) where active = true;

create table if not exists public.fee_schedules (
  id uuid primary key default gen_random_uuid(),
  session_name text not null check (char_length(trim(session_name)) between 4 and 40),
  term_name text not null check (char_length(trim(term_name)) between 2 and 40),
  class_code text not null references public.class_progression(class_code) on delete restrict,
  title text not null check (char_length(trim(title)) between 2 and 160),
  due_date date,
  publication_status text not null default 'draft' check (publication_status in ('draft', 'published', 'retired')),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  published_by uuid references public.profiles(id) on delete restrict,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_name, term_name, class_code)
);

create table if not exists public.fee_schedule_items (
  id uuid primary key default gen_random_uuid(),
  schedule_id uuid not null references public.fee_schedules(id) on delete cascade,
  item_code text not null check (item_code ~ '^[A-Z0-9_-]{2,40}$'),
  label text not null check (char_length(trim(label)) between 2 and 160),
  charge_kind text not null check (charge_kind in (
    'tuition', 'examination', 'materials', 'activity', 'meal', 'transport', 'other'
  )),
  billing_mode text not null check (billing_mode in ('included', 'separate', 'not_applicable')),
  amount numeric(12,2) not null default 0 check (amount >= 0),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (schedule_id, item_code),
  check ((billing_mode = 'separate' and amount > 0) or (billing_mode <> 'separate' and amount = 0))
);

create table if not exists public.legacy_fee_reconciliation (
  source_id text primary key,
  target_schedule_id uuid references public.fee_schedules(id) on delete restrict,
  target_item_id uuid references public.fee_schedule_items(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','mapped','owner_verified','excluded')),
  note text check (note is null or char_length(note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.pupil_invoices (
  id uuid primary key default gen_random_uuid(),
  invoice_reference text not null unique check (invoice_reference ~ '^TA-INV-[A-Z0-9-]{8,40}$'),
  student_id uuid not null references public.students(id) on delete restrict,
  schedule_id uuid references public.fee_schedules(id) on delete restrict,
  session_name text not null check (char_length(trim(session_name)) between 4 and 40),
  term_name text not null check (char_length(trim(term_name)) between 2 and 40),
  class_code text not null,
  title text not null check (char_length(trim(title)) between 2 and 160),
  total_amount numeric(12,2) not null default 0 check (total_amount >= 0),
  paid_amount numeric(12,2) not null default 0 check (paid_amount >= 0),
  status text not null default 'issued' check (status in ('draft', 'issued', 'part_paid', 'paid', 'cancelled')),
  due_date date,
  issued_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  issued_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (paid_amount <= total_amount)
);
create index if not exists pupil_invoices_student_idx
  on public.pupil_invoices(student_id, session_name, term_name, created_at desc);

create table if not exists public.pupil_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.pupil_invoices(id) on delete cascade,
  item_code text not null check (item_code ~ '^[A-Z0-9_-]{2,40}$'),
  label text not null check (char_length(trim(label)) between 2 and 160),
  charge_kind text not null check (charge_kind in (
    'tuition', 'examination', 'materials', 'activity', 'meal', 'transport', 'other'
  )),
  amount numeric(12,2) not null check (amount > 0),
  source_type text not null default 'fee_schedule' check (source_type in ('fee_schedule', 'transport', 'manual')),
  source_id uuid,
  unique (invoice_id, item_code)
);

-- Physical catalogue. Preserved former values are reconciled into inactive rows;
-- no product is visible to parents until an administrator verifies and activates it.
create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  product_code text not null unique check (product_code ~ '^[A-Z0-9_-]{2,50}$'),
  name text not null check (char_length(trim(name)) between 2 and 160),
  description text check (description is null or char_length(description) <= 1000),
  category text not null check (category in ('uniform', 'books', 'stationery', 'bag', 'art', 'other')),
  active boolean not null default false,
  reconciled boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.shop_products(id) on delete restrict,
  sku text not null unique check (sku ~ '^[A-Z0-9_-]{2,60}$'),
  variant_label text not null check (char_length(trim(variant_label)) between 1 and 120),
  size_label text check (size_label is null or char_length(trim(size_label)) <= 80),
  eligible_classes text[] not null default '{}',
  unit_price numeric(12,2) check (unit_price is null or unit_price > 0),
  on_hand integer not null default 0 check (on_hand >= 0),
  reserved integer not null default 0 check (reserved >= 0 and reserved <= on_hand),
  damaged integer not null default 0 check (damaged >= 0),
  low_stock_threshold integer not null default 0 check (low_stock_threshold >= 0),
  active boolean not null default false,
  reconciled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (product_id, variant_label)
);

create table if not exists public.legacy_catalog_reconciliation (
  source_table text not null check (source_table in ('shop_items', 'uniform_items')),
  source_id text not null,
  target_product_id uuid references public.shop_products(id) on delete restrict,
  target_variant_id uuid references public.shop_variants(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending', 'mapped', 'owner_verified', 'excluded')),
  note text check (note is null or char_length(note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (source_table, source_id)
);

create table if not exists public.shop_price_events (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.shop_variants(id) on delete restrict,
  previous_price numeric(12,2),
  new_price numeric(12,2),
  actor_id uuid references public.profiles(id) on delete set null,
  reason text,
  created_at timestamptz not null default now()
);

create table if not exists public.catalog_status_events (
  id bigint generated always as identity primary key,
  product_id uuid not null references public.shop_products(id) on delete restrict,
  variant_id uuid references public.shop_variants(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  previous_active boolean,
  new_active boolean not null,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  order_reference text not null unique check (order_reference ~ '^TA-ORD-[A-Z0-9-]{8,40}$'),
  parent_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  class_snapshot text not null,
  session_snapshot text not null,
  term_snapshot text,
  collection_method text not null check (collection_method in ('office', 'teacher_to_pupil')),
  status text not null default 'awaiting_payment' check (status in (
    'awaiting_payment', 'payment_submitted', 'paid_preparing',
    'ready_for_office', 'ready_for_teacher', 'collected', 'handed_to_pupil',
    'cancelled', 'returned', 'payment_reversed'
  )),
  total_amount numeric(12,2) not null default 0 check (total_amount > 0),
  reserved_until timestamptz,
  paid_at timestamptz,
  expected_ready_on date,
  released_by uuid references public.profiles(id) on delete restrict,
  released_at timestamptz,
  fulfilled_by uuid references public.profiles(id) on delete restrict,
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists shop_orders_parent_idx on public.shop_orders(parent_id, created_at desc);
create index if not exists shop_orders_student_idx on public.shop_orders(student_id, created_at desc);

create table if not exists public.shop_order_lines (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.shop_orders(id) on delete cascade,
  variant_id uuid not null references public.shop_variants(id) on delete restrict,
  product_name_snapshot text not null,
  variant_snapshot text not null,
  unit_price_snapshot numeric(12,2) not null check (unit_price_snapshot > 0),
  quantity integer not null check (quantity between 1 and 20),
  fulfilled_quantity integer not null default 0 check (fulfilled_quantity >= 0 and fulfilled_quantity <= quantity),
  unique (order_id, variant_id)
);

create table if not exists public.inventory_movements (
  id bigint generated always as identity primary key,
  variant_id uuid not null references public.shop_variants(id) on delete restrict,
  movement_kind text not null check (movement_kind in (
    'opening_balance', 'purchase_receipt', 'manual_adjustment', 'stocktake',
    'reservation', 'reservation_release', 'order_fulfilment',
    'return_to_stock', 'damaged_return', 'exchange_out', 'exchange_in'
  )),
  on_hand_delta integer not null default 0,
  reserved_delta integer not null default 0,
  damaged_delta integer not null default 0,
  resulting_on_hand integer not null check (resulting_on_hand >= 0),
  resulting_reserved integer not null check (resulting_reserved >= 0),
  resulting_damaged integer not null default 0 check (resulting_damaged >= 0),
  order_id uuid references public.shop_orders(id) on delete restrict,
  order_line_id uuid references public.shop_order_lines(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  actor_type text not null default 'user' check (actor_type in ('user', 'system')),
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  idempotency_key text unique,
  created_at timestamptz not null default now(),
  check (on_hand_delta <> 0 or reserved_delta <> 0 or damaged_delta <> 0),
  check ((actor_type = 'user' and actor_id is not null) or (actor_type = 'system' and actor_id is null))
);
create index if not exists inventory_movements_variant_idx
  on public.inventory_movements(variant_id, created_at desc);

create table if not exists public.stocktakes (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  status text not null default 'open' check (status in ('open', 'closed', 'cancelled')),
  note text check (note is null or char_length(note) <= 1000),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  closed_by uuid references public.profiles(id) on delete restrict,
  closed_at timestamptz
);
create unique index if not exists one_open_stocktake
  on public.stocktakes ((true)) where status = 'open';
create table if not exists public.stocktake_lines (
  stocktake_id uuid not null references public.stocktakes(id) on delete cascade,
  variant_id uuid not null references public.shop_variants(id) on delete restrict,
  expected_on_hand integer not null check (expected_on_hand >= 0),
  actual_on_hand integer check (actual_on_hand is null or actual_on_hand >= 0),
  note text check (note is null or char_length(note) <= 500),
  primary key (stocktake_id, variant_id)
);

create table if not exists public.restock_requests (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  product_id uuid not null references public.shop_products(id) on delete restrict,
  variant_label text check (variant_label is null or char_length(trim(variant_label)) <= 120),
  requested_quantity integer not null default 1 check (requested_quantity between 1 and 20),
  status text not null default 'requested' check (status in (
    'requested', 'reviewing', 'procurement_planned', 'available',
    'parent_confirmed', 'closed', 'cancelled'
  )),
  parent_confirmed_at timestamptz,
  admin_note text check (admin_note is null or char_length(admin_note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists restock_requests_status_idx on public.restock_requests(status, created_at);

create table if not exists public.procurement_batches (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  status text not null default 'draft' check (status in ('draft', 'ordered', 'part_received', 'received', 'cancelled')),
  supplier_note text check (supplier_note is null or char_length(supplier_note) <= 1000),
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  ordered_at timestamptz,
  received_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.procurement_lines (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.procurement_batches(id) on delete cascade,
  variant_id uuid not null references public.shop_variants(id) on delete restrict,
  ordered_quantity integer not null check (ordered_quantity > 0),
  received_quantity integer not null default 0 check (received_quantity >= 0 and received_quantity <= ordered_quantity),
  unit_cost numeric(12,2) check (unit_cost is null or unit_cost >= 0),
  unique (batch_id, variant_id)
);

create table if not exists public.return_exchange_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique,
  order_line_id uuid not null references public.shop_order_lines(id) on delete restrict,
  parent_id uuid not null references public.profiles(id) on delete restrict,
  request_kind text not null check (request_kind in ('return', 'exchange')),
  requested_quantity integer not null check (requested_quantity > 0),
  requested_variant_id uuid references public.shop_variants(id) on delete restrict,
  parent_reason text not null check (char_length(trim(parent_reason)) between 3 and 1000),
  status text not null default 'requested' check (status in (
    'requested', 'inspection_required', 'approved', 'declined', 'completed', 'cancelled'
  )),
  inspection_result text check (inspection_result is null or inspection_result in (
    'resellable', 'damaged', 'not_returned', 'not_eligible'
  )),
  monetary_adjustment numeric(12,2) not null default 0,
  office_note text check (office_note is null or char_length(office_note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Transport remains a capacity-approved service, never inventory.
create table if not exists public.transport_services (
  id uuid primary key default gen_random_uuid(),
  route_code text not null unique,
  route_name text not null check (char_length(trim(route_name)) between 2 and 160),
  session_name text not null check (char_length(trim(session_name)) between 4 and 40),
  term_name text not null check (char_length(trim(term_name)) between 2 and 40),
  term_amount numeric(12,2) check (term_amount is null or term_amount > 0),
  capacity integer check (capacity is null or capacity > 0),
  approved_count integer not null default 0 check (approved_count >= 0),
  active boolean not null default false,
  reconciled boolean not null default false,
  created_by uuid not null references public.profiles(id) on delete restrict default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (capacity is null or approved_count <= capacity)
);

create table if not exists public.legacy_transport_reconciliation (
  source_id text primary key,
  target_service_id uuid references public.transport_services(id) on delete restrict,
  status text not null default 'pending' check (status in ('pending','mapped','owner_verified','excluded')),
  note text check (note is null or char_length(note)<=1000),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.transport_requests (
  id uuid primary key default gen_random_uuid(),
  request_reference text not null unique,
  parent_id uuid not null references public.profiles(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  service_id uuid references public.transport_services(id) on delete restrict,
  general_area text not null check (char_length(trim(general_area)) between 2 and 240),
  status text not null default 'requested' check (status in (
    'requested', 'reviewing', 'approved', 'waitlisted', 'declined', 'cancelled'
  )),
  office_note text check (office_note is null or char_length(office_note) <= 1000),
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  invoice_id uuid references public.pupil_invoices(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.manual_payments (
  id uuid primary key default gen_random_uuid(),
  payment_reference text not null unique check (payment_reference ~ '^TA-PAY-[A-Z0-9-]{8,40}$'),
  invoice_id uuid references public.pupil_invoices(id) on delete restrict,
  order_id uuid references public.shop_orders(id) on delete restrict,
  submitted_by uuid not null references public.profiles(id) on delete restrict,
  method text not null check (method in ('bank_transfer', 'physical_pos')),
  amount numeric(12,2) not null check (amount > 0),
  status text not null default 'submitted' check (status in (
    'submitted', 'under_review', 'verified', 'rejected', 'reversed'
  )),
  payer_name text not null check (char_length(trim(payer_name)) between 2 and 160),
  sender_bank_name text,
  external_reference text,
  stated_paid_at timestamptz,
  terminal_reference text,
  bank_account_id uuid references public.school_bank_accounts(id) on delete restrict,
  reviewed_by uuid references public.profiles(id) on delete restrict,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(review_note) <= 1000),
  reversed_by uuid references public.profiles(id) on delete restrict,
  reversed_at timestamptz,
  reversal_reason text check (reversal_reason is null or char_length(reversal_reason) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((invoice_id is not null)::integer + (order_id is not null)::integer = 1),
  check (
    (method = 'bank_transfer' and sender_bank_name is not null and external_reference is not null and stated_paid_at is not null and terminal_reference is null)
    or (method = 'physical_pos' and terminal_reference is not null and sender_bank_name is null and stated_paid_at is not null)
  )
);
create unique index if not exists manual_payments_bank_reference_idx
  on public.manual_payments(lower(sender_bank_name), lower(external_reference))
  where method = 'bank_transfer' and status <> 'rejected';
create unique index if not exists manual_payments_pos_reference_idx
  on public.manual_payments(lower(terminal_reference))
  where method = 'physical_pos' and status <> 'rejected';

create table if not exists public.payment_receipts (
  id uuid primary key default gen_random_uuid(),
  receipt_reference text not null unique check (receipt_reference ~ '^TA-RCP-[A-Z0-9-]{8,40}$'),
  payment_id uuid not null unique references public.manual_payments(id) on delete restrict,
  issued_by uuid not null references public.profiles(id) on delete restrict,
  issued_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversal_reason text
);

create table if not exists public.finance_events (
  id bigint generated always as identity primary key,
  payment_id uuid references public.manual_payments(id) on delete restrict,
  invoice_id uuid references public.pupil_invoices(id) on delete restrict,
  order_id uuid references public.shop_orders(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  event_type text not null check (event_type in (
    'invoice_issued', 'invoice_cancelled', 'payment_submitted', 'payment_under_review',
    'payment_verified', 'payment_rejected', 'payment_reversed', 'receipt_issued',
    'return_exchange_completed'
  )),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.parent_shop_products()
returns table(id uuid, product_code text, name text, description text, category text, active boolean, reconciled boolean)
language sql
stable
security definer
set search_path=''
as $$
  select p.id,p.product_code,p.name,p.description,p.category,p.active,p.reconciled
    from public.shop_products p
   where public.full_parent_access() and p.active=true and p.reconciled=true
   order by p.name
$$;
revoke all on function public.parent_shop_products() from public,anon;
grant execute on function public.parent_shop_products() to authenticated;

create or replace function public.parent_transport_services()
returns table(id uuid,route_code text,route_name text,session_name text,term_name text,term_amount numeric,active boolean,reconciled boolean)
language sql
stable
security definer
set search_path=''
as $$
  select s.id,s.route_code,s.route_name,s.session_name,s.term_name,s.term_amount,s.active,s.reconciled
    from public.transport_services s
   where public.full_parent_access() and s.active=true and s.reconciled=true and s.term_amount is not null
   order by s.route_name
$$;
revoke all on function public.parent_transport_services() from public,anon;
grant execute on function public.parent_transport_services() to authenticated;

create or replace function public.parent_shop_variants()
returns table(id uuid,product_id uuid,sku text,variant_label text,size_label text,eligible_classes text[],unit_price numeric,available integer,active boolean,reconciled boolean)
language sql
stable
security definer
set search_path=''
as $$
  select v.id,v.product_id,v.sku,v.variant_label,v.size_label,v.eligible_classes,v.unit_price,
         greatest(v.on_hand-v.reserved,0),v.active,v.reconciled
    from public.shop_variants v join public.shop_products p on p.id=v.product_id
   where public.full_parent_access() and v.active=true and v.reconciled=true
     and p.active=true and p.reconciled=true and v.unit_price is not null
   order by p.name,v.variant_label
$$;
revoke all on function public.parent_shop_variants() from public,anon;
grant execute on function public.parent_shop_variants() to authenticated;

-- Readable low-stock projection; no browser writes and no automatic ordering.
create or replace view public.inventory_low_stock
with (security_invoker = true)
as
select v.id as variant_id, p.name as product_name, v.variant_label, v.size_label,
       v.sku, v.on_hand, v.reserved, (v.on_hand - v.reserved) as available,
       v.low_stock_threshold
  from public.shop_variants v
  join public.shop_products p on p.id = v.product_id
 where v.active = true and p.active = true
   and (v.on_hand - v.reserved) <= v.low_stock_threshold;

create or replace function public.shop_order_access(p_order_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(exists (
    select 1 from public.shop_orders o
     where o.id = p_order_id and (
       public.is_admin()
       or (o.parent_id = (select auth.uid()) and public.full_parent_access())
     )
  ), false)
$$;
revoke all on function public.shop_order_access(uuid) from public, anon;
grant execute on function public.shop_order_access(uuid) to authenticated;

-- Teachers receive only class-assigned handover fields through these narrow
-- projections. They never receive order totals, parent IDs, prices or payment
-- references from the base order tables.
create or replace function public.parent_manual_payments()
returns table(
  id uuid,payment_reference text,invoice_id uuid,order_id uuid,method text,amount numeric,status text,
  payer_name text,sender_bank_name text,external_reference text,stated_paid_at timestamptz,
  terminal_reference text,reviewed_at timestamptz,reversed_at timestamptz,reversal_reason text,
  created_at timestamptz,updated_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select m.id,m.payment_reference,m.invoice_id,m.order_id,m.method,m.amount,m.status,
         m.payer_name,m.sender_bank_name,m.external_reference,m.stated_paid_at,
         m.terminal_reference,m.reviewed_at,m.reversed_at,m.reversal_reason,m.created_at,m.updated_at
    from public.manual_payments m
   where public.full_parent_access() and (
     (m.invoice_id is not null and exists(
       select 1 from public.pupil_invoices i where i.id=m.invoice_id and public.parent_can_access_student(i.student_id)
     )) or (m.order_id is not null and exists(
       select 1 from public.shop_orders o where o.id=m.order_id and public.parent_can_access_student(o.student_id)
     ))
   )
   order by m.created_at
$$;
revoke all on function public.parent_manual_payments() from public,anon;
grant execute on function public.parent_manual_payments() to authenticated;

create or replace function public.parent_payment_receipts()
returns table(id uuid,receipt_reference text,payment_id uuid,issued_at timestamptz,reversed_at timestamptz,reversal_reason text)
language sql
stable
security definer
set search_path=''
as $$
  select r.id,r.receipt_reference,r.payment_id,r.issued_at,r.reversed_at,r.reversal_reason
    from public.payment_receipts r
    join public.manual_payments m on m.id=r.payment_id
   where public.full_parent_access() and (
     (m.invoice_id is not null and exists(
       select 1 from public.pupil_invoices i where i.id=m.invoice_id and public.parent_can_access_student(i.student_id)
     )) or (m.order_id is not null and exists(
       select 1 from public.shop_orders o where o.id=m.order_id and public.parent_can_access_student(o.student_id)
     ))
   )
   order by r.issued_at
$$;
revoke all on function public.parent_payment_receipts() from public,anon;
grant execute on function public.parent_payment_receipts() to authenticated;

create or replace function public.teacher_collection_orders()
returns table(
  id uuid, order_reference text, student_id uuid, class_snapshot text,
  collection_method text, status text, expected_ready_on date,
  released_at timestamptz, fulfilled_at timestamptz, created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select o.id, o.order_reference, o.student_id, o.class_snapshot,
         o.collection_method, o.status, o.expected_ready_on,
         o.released_at, o.fulfilled_at, o.created_at
    from public.shop_orders o
   where public.current_user_role() = 'teacher'::public.app_role
     and public.portal_account_can_access((select auth.uid()))
     and o.collection_method = 'teacher_to_pupil'
     and o.status in ('ready_for_teacher', 'handed_to_pupil')
     and exists (
       select 1 from public.teacher_class_assignments a
        where a.teacher_id = (select auth.uid()) and a.active = true
          and a.class_code = o.class_snapshot
     )
   order by o.created_at desc
$$;
revoke all on function public.teacher_collection_orders() from public, anon;
grant execute on function public.teacher_collection_orders() to authenticated;

create or replace function public.teacher_collection_order_lines()
returns table(
  id uuid, order_id uuid, product_name_snapshot text,
  variant_snapshot text, quantity integer, fulfilled_quantity integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select l.id, l.order_id, l.product_name_snapshot,
         l.variant_snapshot, l.quantity, l.fulfilled_quantity
    from public.shop_order_lines l
    join public.shop_orders o on o.id = l.order_id
   where public.current_user_role() = 'teacher'::public.app_role
     and public.portal_account_can_access((select auth.uid()))
     and o.collection_method = 'teacher_to_pupil'
     and o.status in ('ready_for_teacher', 'handed_to_pupil')
     and exists (
       select 1 from public.teacher_class_assignments a
        where a.teacher_id = (select auth.uid()) and a.active = true
          and a.class_code = o.class_snapshot
     )
   order by l.product_name_snapshot
$$;
revoke all on function public.teacher_collection_order_lines() from public, anon;
grant execute on function public.teacher_collection_order_lines() to authenticated;

create or replace function public.next_school_workday(p_from date)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare v_day date := p_from + 1;
begin
  while extract(isodow from v_day) in (6,7) loop v_day := v_day + 1; end loop;
  return v_day;
end;
$$;

create or replace function public.set_active_school_bank_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_headmistress() then raise exception 'Headmistress required' using errcode='42501'; end if;
  if not exists(select 1 from public.school_bank_accounts where id=p_account_id) then raise exception 'Bank account not found' using errcode='P0002'; end if;
  update public.school_bank_accounts set active=false,updated_at=now() where active=true;
  update public.school_bank_accounts set active=true,approved_by=(select auth.uid()),approved_at=now(),
    deactivated_by=null,deactivated_at=null,deactivation_reason=null,updated_at=now() where id=p_account_id;
end;
$$;
revoke all on function public.set_active_school_bank_account(uuid) from public,anon;
grant execute on function public.set_active_school_bank_account(uuid) to authenticated;

create or replace function public.disable_active_school_bank_account(p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_headmistress() or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Headmistress and deactivation reason required' using errcode='42501';
  end if;
  update public.school_bank_accounts set active=false,deactivated_by=(select auth.uid()),
    deactivated_at=now(),deactivation_reason=trim(p_reason),updated_at=now() where active=true;
  if not found then raise exception 'No active bank account found' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.disable_active_school_bank_account(text) from public,anon;
grant execute on function public.disable_active_school_bank_account(text) to authenticated;

create or replace function public.create_invoices_for_fee_schedule(p_schedule_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_schedule public.fee_schedules%rowtype;
  v_student record;
  v_invoice uuid;
  v_total numeric(12,2);
  v_count integer := 0;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  select * into v_schedule from public.fee_schedules where id = p_schedule_id for update;
  if not found or v_schedule.publication_status not in ('draft','published') then
    raise exception 'A draft or published fee schedule is required' using errcode = '22023';
  end if;
  if v_schedule.publication_status='draft' then
    update public.fee_schedules set publication_status='published',published_by=(select auth.uid()),
      published_at=now(),updated_at=now() where id=p_schedule_id;
    v_schedule.publication_status:='published';
  end if;
  select coalesce(sum(amount),0) into v_total from public.fee_schedule_items
   where schedule_id = p_schedule_id and billing_mode = 'separate';
  if v_total <= 0 then raise exception 'Schedule has no separately billable items' using errcode = '22023'; end if;
  for v_student in select s.id from public.students s
    where s.active = true and s.admission_status = 'admitted'::public.admission_status
      and s.class_code = v_schedule.class_code
  loop
    if not exists (select 1 from public.pupil_invoices i where i.student_id = v_student.id and i.schedule_id = p_schedule_id and i.status <> 'cancelled') then
      insert into public.pupil_invoices(
        invoice_reference, student_id, schedule_id, session_name, term_name,
        class_code, title, total_amount, status, due_date, issued_by
      ) values (
        'TA-INV-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
        v_student.id, p_schedule_id, v_schedule.session_name, v_schedule.term_name,
        v_schedule.class_code, v_schedule.title, v_total, 'issued', v_schedule.due_date, (select auth.uid())
      ) returning id into v_invoice;
      insert into public.pupil_invoice_items(invoice_id, item_code, label, charge_kind, amount)
      select v_invoice, item_code, label, charge_kind, amount from public.fee_schedule_items
       where schedule_id = p_schedule_id and billing_mode = 'separate';
      insert into public.finance_events(invoice_id, actor_id, event_type)
      values (v_invoice, (select auth.uid()), 'invoice_issued');
      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.create_invoices_for_fee_schedule(uuid) from public, anon;
grant execute on function public.create_invoices_for_fee_schedule(uuid) to authenticated;

create or replace function public.cancel_pupil_invoice(p_invoice_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Administrator and cancellation reason required' using errcode='42501';
  end if;
  update public.pupil_invoices set status='cancelled',updated_at=now()
   where id=p_invoice_id and status in ('draft','issued','part_paid') and paid_amount=0
     and not exists(select 1 from public.pupil_invoice_items l where l.invoice_id=p_invoice_id and l.source_type='transport')
     and not exists(select 1 from public.manual_payments m where m.invoice_id=p_invoice_id and m.status in ('submitted','under_review','verified'));
  if not found then raise exception 'Only an unpaid invoice without an open payment may be cancelled' using errcode='22023'; end if;
  insert into public.finance_events(invoice_id,actor_id,event_type,detail)
  values(p_invoice_id,(select auth.uid()),'invoice_cancelled',jsonb_build_object('reason',trim(p_reason)));
end;
$$;
revoke all on function public.cancel_pupil_invoice(uuid,text) from public,anon;
grant execute on function public.cancel_pupil_invoice(uuid,text) to authenticated;

create or replace function public.place_shop_order(
  p_student_id uuid,
  p_collection_method text,
  p_session_name text,
  p_term_name text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent uuid := (select auth.uid());
  v_student public.students%rowtype;
  v_order uuid;
  v_ref text;
  v_item jsonb;
  v_variant public.shop_variants%rowtype;
  v_product public.shop_products%rowtype;
  v_qty integer;
  v_total numeric(12,2) := 0;
  v_line uuid;
begin
  if not public.full_parent_access() or not public.parent_can_access_student(p_student_id) then
    raise exception 'Linked parent access required' using errcode = '42501';
  end if;
  if p_collection_method not in ('office', 'teacher_to_pupil')
     or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 20
     or char_length(trim(coalesce(p_session_name,''))) not between 4 and 40 then
    raise exception 'Invalid order details' using errcode = '22023';
  end if;
  select * into v_student from public.students where id = p_student_id and active = true;
  if not found then raise exception 'Active linked pupil required' using errcode = '22023'; end if;
  v_ref := 'TA-ORD-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.shop_orders(
    order_reference, parent_id, student_id, class_snapshot, session_snapshot,
    term_snapshot, collection_method, total_amount, reserved_until
  ) values (v_ref, v_parent, p_student_id, v_student.class_code, trim(p_session_name),
    nullif(trim(p_term_name),''), p_collection_method, 1, now() + interval '3 days')
  returning id into v_order;

  for v_item in select value from jsonb_array_elements(p_items)
  loop
    begin v_qty := (v_item->>'quantity')::integer; exception when others then raise exception 'Invalid order quantity' using errcode = '22023'; end;
    if v_qty not between 1 and 20 then raise exception 'Invalid order quantity' using errcode = '22023'; end if;
    select v.* into v_variant from public.shop_variants v where v.id = (v_item->>'variant_id')::uuid for update;
    if not found or not v_variant.active or v_variant.unit_price is null or v_variant.reconciled <> true
       or v_variant.on_hand - v_variant.reserved < v_qty then
      raise exception 'Item is unavailable; use a restock request instead' using errcode = '22023';
    end if;
    select * into v_product from public.shop_products p where p.id = v_variant.product_id and p.active = true and p.reconciled = true;
    if not found then raise exception 'Product is not available for ordering' using errcode = '22023'; end if;
    if cardinality(v_variant.eligible_classes) > 0 and not (v_student.class_code = any(v_variant.eligible_classes)) then
      raise exception 'Item does not apply to this pupil class' using errcode = '22023';
    end if;
    if exists (select 1 from public.shop_order_lines l where l.order_id = v_order and l.variant_id = v_variant.id) then
      raise exception 'Duplicate item in order' using errcode = '22023';
    end if;
    insert into public.shop_order_lines(order_id, variant_id, product_name_snapshot, variant_snapshot, unit_price_snapshot, quantity)
    values (v_order, v_variant.id, v_product.name, v_variant.variant_label, v_variant.unit_price, v_qty)
    returning id into v_line;
    update public.shop_variants set reserved = reserved + v_qty, updated_at = now() where id = v_variant.id;
    insert into public.inventory_movements(
      variant_id, movement_kind, reserved_delta, resulting_on_hand, resulting_reserved,
      resulting_damaged, order_id, order_line_id, actor_id, reason, idempotency_key
    ) values (
      v_variant.id, 'reservation', v_qty, v_variant.on_hand, v_variant.reserved + v_qty,
      v_variant.damaged, v_order, v_line, v_parent, 'Parent order reservation', 'reserve:' || v_line::text
    );
    v_total := v_total + (v_variant.unit_price * v_qty);
  end loop;
  update public.shop_orders set total_amount = v_total where id = v_order;
  return jsonb_build_object('order_id', v_order, 'order_reference', v_ref, 'total_amount', v_total);
end;
$$;
revoke all on function public.place_shop_order(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.place_shop_order(uuid, text, text, text, jsonb) to authenticated;

create or replace function public.request_restock(
  p_student_id uuid,
  p_product_id uuid,
  p_variant_label text,
  p_quantity integer default 1
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_id uuid;
begin
  if not public.full_parent_access() or not public.parent_can_access_student(p_student_id) then
    raise exception 'Linked parent access required' using errcode = '42501';
  end if;
  if p_quantity not between 1 and 20 or not exists (
    select 1 from public.shop_products p where p.id = p_product_id and p.reconciled = true
  ) then raise exception 'Invalid restock request' using errcode = '22023'; end if;
  insert into public.restock_requests(parent_id, student_id, product_id, variant_label, requested_quantity)
  values ((select auth.uid()), p_student_id, p_product_id, nullif(trim(p_variant_label),''), p_quantity)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.request_restock(uuid, uuid, text, integer) from public, anon;
grant execute on function public.request_restock(uuid, uuid, text, integer) to authenticated;

create or replace function public.verify_catalog_variant(
  p_product_id uuid,
  p_variant_id uuid,
  p_unit_price numeric,
  p_low_stock_threshold integer
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_previous boolean;
begin
  if not public.is_admin() or p_unit_price<=0 or p_low_stock_threshold<0 then
    raise exception 'Administrator and verified catalogue values required' using errcode='42501';
  end if;
  select v.active into v_previous from public.shop_variants v
   where v.id=p_variant_id and v.product_id=p_product_id for update;
  if not found then raise exception 'Matching product and variant required' using errcode='22023'; end if;
  if not exists(select 1 from public.shop_products p where p.id=p_product_id for update) then
    raise exception 'Matching product required' using errcode='22023';
  end if;
  update public.shop_products set reconciled=true,active=true,updated_at=now() where id=p_product_id;
  update public.shop_variants set unit_price=p_unit_price,low_stock_threshold=p_low_stock_threshold,
    reconciled=true,active=true,updated_at=now() where id=p_variant_id and product_id=p_product_id;
  insert into public.catalog_status_events(product_id,variant_id,actor_id,previous_active,new_active,reason)
  values(p_product_id,p_variant_id,(select auth.uid()),v_previous,true,'Owner-verified catalogue activation');
end;
$$;
revoke all on function public.verify_catalog_variant(uuid,uuid,numeric,integer) from public,anon;
grant execute on function public.verify_catalog_variant(uuid,uuid,numeric,integer) to authenticated;

create or replace function public.set_catalog_variant_active(
  p_variant_id uuid,p_active boolean,p_reason text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v public.shop_variants%rowtype;
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Administrator and status reason required' using errcode='42501';
  end if;
  select * into v from public.shop_variants where id=p_variant_id for update;
  if not found then raise exception 'Variant not found' using errcode='P0002'; end if;
  if p_active and (not v.reconciled or v.unit_price is null or not exists(
    select 1 from public.shop_products p where p.id=v.product_id and p.reconciled=true
  )) then raise exception 'Only a reconciled priced variant may be activated' using errcode='22023'; end if;
  update public.shop_variants set active=p_active,updated_at=now() where id=p_variant_id;
  if p_active then
    update public.shop_products set active=true,updated_at=now() where id=v.product_id;
  elsif not exists(select 1 from public.shop_variants x where x.product_id=v.product_id and x.id<>p_variant_id and x.active=true) then
    update public.shop_products set active=false,updated_at=now() where id=v.product_id;
  end if;
  insert into public.catalog_status_events(product_id,variant_id,actor_id,previous_active,new_active,reason)
  values(v.product_id,p_variant_id,(select auth.uid()),v.active,p_active,trim(p_reason));
end;
$$;
revoke all on function public.set_catalog_variant_active(uuid,boolean,text) from public,anon;
grant execute on function public.set_catalog_variant_active(uuid,boolean,text) to authenticated;

create or replace function public.record_inventory_adjustment(
  p_variant_id uuid,
  p_delta integer,
  p_reason text,
  p_kind text default 'manual_adjustment'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v public.shop_variants%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode = '42501'; end if;
  if p_delta = 0 or char_length(trim(coalesce(p_reason,''))) < 3
     or p_kind not in ('opening_balance','manual_adjustment') then
    raise exception 'Valid quantity change and reason required' using errcode = '22023';
  end if;
  select * into v from public.shop_variants where id = p_variant_id for update;
  if not found or v.on_hand + p_delta < v.reserved or v.on_hand + p_delta < 0 then
    raise exception 'Adjustment would make available stock negative' using errcode = '22023';
  end if;
  update public.shop_variants set on_hand = on_hand + p_delta, updated_at = now() where id = p_variant_id;
  insert into public.inventory_movements(
    variant_id, movement_kind, on_hand_delta, resulting_on_hand, resulting_reserved,
    resulting_damaged, actor_id, reason
  ) values (p_variant_id, p_kind, p_delta, v.on_hand + p_delta, v.reserved,
    v.damaged, (select auth.uid()), trim(p_reason));
end;
$$;
revoke all on function public.record_inventory_adjustment(uuid, integer, text, text) from public, anon;
grant execute on function public.record_inventory_adjustment(uuid, integer, text, text) to authenticated;

create or replace function public.cancel_shop_order(p_order_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_order public.shop_orders%rowtype;
  v_line record;
  v_variant public.shop_variants%rowtype;
begin
  if char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Cancellation reason required' using errcode='22023'; end if;
  select * into v_order from public.shop_orders where id=p_order_id for update;
  if not found or v_order.status not in ('awaiting_payment','payment_submitted','payment_reversed') then
    raise exception 'Only an unfulfilled unpaid order may be cancelled' using errcode='22023';
  end if;
  if not (public.is_admin() or coalesce((select auth.role()),'')='service_role'
    or (v_order.parent_id=(select auth.uid()) and public.full_parent_access())) then
    raise exception 'Order cancellation not authorised' using errcode='42501';
  end if;
  if exists(select 1 from public.manual_payments where order_id=p_order_id and status='verified') then
    raise exception 'A verified payment requires Headmistress reversal before cancellation' using errcode='42501';
  end if;
  for v_line in select * from public.shop_order_lines where order_id=p_order_id for update loop
    select * into v_variant from public.shop_variants where id=v_line.variant_id for update;
    if v_variant.reserved<v_line.quantity then raise exception 'Reserved inventory is inconsistent' using errcode='23514'; end if;
    update public.shop_variants set reserved=reserved-v_line.quantity,updated_at=now() where id=v_variant.id;
    insert into public.inventory_movements(variant_id,movement_kind,reserved_delta,resulting_on_hand,resulting_reserved,resulting_damaged,
      order_id,order_line_id,actor_id,actor_type,reason,idempotency_key)
    values(v_variant.id,'reservation_release',-v_line.quantity,v_variant.on_hand,v_variant.reserved-v_line.quantity,v_variant.damaged,
      p_order_id,v_line.id,case when coalesce((select auth.role()),'')='service_role' then null else (select auth.uid()) end,
      case when coalesce((select auth.role()),'')='service_role' then 'system' else 'user' end,
      trim(p_reason),'cancel:'||v_line.id::text);
  end loop;
  update public.shop_orders set status='cancelled',updated_at=now() where id=p_order_id;
end;
$$;
revoke all on function public.cancel_shop_order(uuid,text) from public,anon;
grant execute on function public.cancel_shop_order(uuid,text) to authenticated;

create or replace function public.release_expired_shop_reservations()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_order record; v_count integer:=0;
begin
  if not (public.is_admin() or coalesce((select auth.role()),'')='service_role') then
    raise exception 'Administrator or service role required' using errcode='42501';
  end if;
  for v_order in select id from public.shop_orders where reserved_until<now() and status='awaiting_payment' order by reserved_until for update skip locked loop
    perform public.cancel_shop_order(v_order.id,'Unpaid reservation expired');
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.release_expired_shop_reservations() from public,anon;
grant execute on function public.release_expired_shop_reservations() to authenticated,service_role;

create or replace function public.advance_shop_order(p_order_id uuid, p_action text, p_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.shop_orders%rowtype;
  v_line record;
  v_variant public.shop_variants%rowtype;
  v_actor uuid := (select auth.uid());
begin
  select * into v_order from public.shop_orders where id = p_order_id for update;
  if not found then raise exception 'Order not found' using errcode = 'P0002'; end if;
  if char_length(trim(coalesce(p_note,''))) < 3 then raise exception 'Action note required' using errcode = '22023'; end if;
  if p_action = 'ready' then
    if not public.is_admin() or v_order.status <> 'paid_preparing' then raise exception 'Paid preparing order required' using errcode = '42501'; end if;
    update public.shop_orders set
      status = case collection_method when 'office' then 'ready_for_office' else 'ready_for_teacher' end,
      released_by = v_actor, released_at = now(), updated_at = now()
     where id = p_order_id;
    return;
  end if;
  if p_action = 'fulfil' then
    if not (
      (public.is_admin() and v_order.status = 'ready_for_office' and v_order.collection_method = 'office')
      or (public.current_user_role() = 'teacher'::public.app_role and v_order.status = 'ready_for_teacher'
          and v_order.collection_method = 'teacher_to_pupil' and exists (
            select 1 from public.teacher_class_assignments a
             where a.teacher_id = v_actor and a.active = true and a.class_code = v_order.class_snapshot
          ))
    ) then raise exception 'Order is not authorised for this handover' using errcode = '42501'; end if;
    for v_line in select * from public.shop_order_lines where order_id = p_order_id for update
    loop
      select * into v_variant from public.shop_variants where id = v_line.variant_id for update;
      if v_variant.on_hand < v_line.quantity or v_variant.reserved < v_line.quantity then
        raise exception 'Reserved inventory is inconsistent' using errcode = '23514';
      end if;
      update public.shop_variants set on_hand = on_hand - v_line.quantity,
        reserved = reserved - v_line.quantity, updated_at = now() where id = v_line.variant_id;
      update public.shop_order_lines set fulfilled_quantity = quantity where id = v_line.id;
      insert into public.inventory_movements(
        variant_id, movement_kind, on_hand_delta, reserved_delta, resulting_on_hand,
        resulting_reserved, resulting_damaged, order_id, order_line_id, actor_id, reason, idempotency_key
      ) values (
        v_line.variant_id, 'order_fulfilment', -v_line.quantity, -v_line.quantity,
        v_variant.on_hand - v_line.quantity, v_variant.reserved - v_line.quantity,
        v_variant.damaged, p_order_id, v_line.id, v_actor, trim(p_note), 'fulfil:' || v_line.id::text
      );
    end loop;
    update public.shop_orders set
      status = case collection_method when 'office' then 'collected' else 'handed_to_pupil' end,
      fulfilled_by = v_actor, fulfilled_at = now(), updated_at = now()
     where id = p_order_id;
    return;
  end if;
  raise exception 'Invalid order action' using errcode = '22023';
end;
$$;
revoke all on function public.advance_shop_order(uuid, text, text) from public, anon;
grant execute on function public.advance_shop_order(uuid, text, text) to authenticated;

create or replace function public.request_return_exchange(
  p_order_line_id uuid,
  p_kind text,
  p_quantity integer,
  p_requested_variant_id uuid,
  p_reason text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_line public.shop_order_lines%rowtype;
  v_order public.shop_orders%rowtype;
  v_ref text;
begin
  if p_kind not in ('return','exchange') or p_quantity <= 0 or char_length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'Invalid return or exchange request' using errcode = '22023';
  end if;
  select * into v_line from public.shop_order_lines where id = p_order_line_id for update;
  if not found or p_quantity > v_line.fulfilled_quantity then raise exception 'Fulfilled order line required' using errcode = '22023'; end if;
  if coalesce((
    select sum(r.requested_quantity) from public.return_exchange_requests r
     where r.order_line_id = p_order_line_id and r.status not in ('declined','cancelled')
  ), 0) + p_quantity > v_line.fulfilled_quantity then
    raise exception 'Requested return or exchange quantity exceeds fulfilled quantity' using errcode = '23514';
  end if;
  select * into v_order from public.shop_orders where id = v_line.order_id;
  if v_order.parent_id <> (select auth.uid()) or v_order.status not in ('collected','handed_to_pupil') then
    raise exception 'Only the linked purchasing parent may request a return' using errcode = '42501';
  end if;
  if p_kind = 'exchange' and p_requested_variant_id is null then raise exception 'Exchange variant required' using errcode = '22023'; end if;
  v_ref := 'TA-RET-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.return_exchange_requests(
    request_reference, order_line_id, parent_id, request_kind, requested_quantity,
    requested_variant_id, parent_reason
  ) values (v_ref, p_order_line_id, (select auth.uid()), p_kind, p_quantity, p_requested_variant_id, trim(p_reason));
  return v_ref;
end;
$$;
revoke all on function public.request_return_exchange(uuid, text, integer, uuid, text) from public, anon;
grant execute on function public.request_return_exchange(uuid, text, integer, uuid, text) to authenticated;

create or replace function public.review_restock_request(
  p_request_id uuid,
  p_status text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v public.restock_requests%rowtype;
begin
  if not public.is_admin() or p_status not in ('reviewing','procurement_planned','available','closed','cancelled')
     or char_length(trim(coalesce(p_note,''))) < 3 then
    raise exception 'Administrator, valid status and note required' using errcode = '42501';
  end if;
  select * into v from public.restock_requests where id=p_request_id for update;
  if not found then raise exception 'Restock request not found' using errcode='P0002'; end if;
  if p_status='available' and not exists(
    select 1 from public.shop_variants sv join public.shop_products sp on sp.id=sv.product_id
     where sv.product_id=v.product_id and sv.active=true and sv.reconciled=true
       and sp.active=true and sp.reconciled=true and sv.on_hand-sv.reserved>0
       and (v.variant_label is null or lower(trim(v.variant_label)) in (
         lower(trim(sv.variant_label)),lower(trim(coalesce(sv.size_label,'')))
       ))
  ) then raise exception 'Matching verified stock is not available' using errcode='22023'; end if;
  update public.restock_requests set status=p_status, admin_note=trim(p_note), updated_at=now() where id=p_request_id;
  if p_status='available' and v.status<>'available' then
    insert into public.portal_notifications(recipient_id,student_id,kind,title,message)
    values (v.parent_id,v.student_id,'restock','Requested item may now be available',
      'The school marked your supply request as available. Confirm in the portal before placing an order; no charge or reservation has been created.');
  end if;
end;
$$;
revoke all on function public.review_restock_request(uuid,text,text) from public,anon;
grant execute on function public.review_restock_request(uuid,text,text) to authenticated;

create or replace function public.confirm_restock_interest(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  update public.restock_requests set status='parent_confirmed',parent_confirmed_at=now(),updated_at=now()
   where id=p_request_id and parent_id=(select auth.uid()) and status='available';
  if not found then raise exception 'Available parent request required' using errcode='42501'; end if;
end;
$$;
revoke all on function public.confirm_restock_interest(uuid) from public,anon;
grant execute on function public.confirm_restock_interest(uuid) to authenticated;

create or replace function public.cancel_parent_request(p_request_type text,p_request_id uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.full_parent_access() or p_request_type not in ('restock','return_exchange','transport') then
    raise exception 'Active parent request required' using errcode='42501';
  end if;
  if p_request_type='restock' then
    update public.restock_requests set status='cancelled',updated_at=now()
     where id=p_request_id and parent_id=(select auth.uid())
       and status in ('requested','reviewing','procurement_planned','available','parent_confirmed');
  elsif p_request_type='return_exchange' then
    update public.return_exchange_requests set status='cancelled',updated_at=now()
     where id=p_request_id and parent_id=(select auth.uid()) and status='requested';
  else
    update public.transport_requests set status='cancelled',updated_at=now()
     where id=p_request_id and parent_id=(select auth.uid()) and status in ('requested','reviewing','waitlisted');
  end if;
  if not found then raise exception 'Cancellable parent request not found' using errcode='42501'; end if;
end;
$$;
revoke all on function public.cancel_parent_request(text,uuid) from public,anon;
grant execute on function public.cancel_parent_request(text,uuid) to authenticated;

create or replace function public.complete_return_exchange(
  p_request_id uuid,
  p_action text,
  p_inspection_result text,
  p_monetary_adjustment numeric,
  p_note text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.return_exchange_requests%rowtype;
  v_line public.shop_order_lines%rowtype;
  v_old public.shop_variants%rowtype;
  v_new public.shop_variants%rowtype;
  v_actor uuid := (select auth.uid());
begin
  if not public.is_admin() or p_action not in ('decline','complete')
     or char_length(trim(coalesce(p_note,'')))<3 then
    raise exception 'Administrator decision and note required' using errcode='42501';
  end if;
  if coalesce(p_monetary_adjustment,0)<>0 and not public.is_headmistress() then
    raise exception 'Only the Headmistress may authorise monetary return or exchange adjustments' using errcode='42501';
  end if;
  select * into v_request from public.return_exchange_requests where id=p_request_id for update;
  if not found or v_request.status not in ('requested','inspection_required','approved') then
    raise exception 'Open return or exchange request required' using errcode='22023';
  end if;
  if p_action='decline' then
    if p_inspection_result not in ('not_returned','not_eligible') then raise exception 'Decline requires not returned or not eligible inspection result' using errcode='22023'; end if;
    if coalesce(p_monetary_adjustment,0)<>0 then raise exception 'A declined request cannot carry a monetary adjustment' using errcode='22023'; end if;
    update public.return_exchange_requests set status='declined',inspection_result=coalesce(p_inspection_result,'not_eligible'),
      monetary_adjustment=0,office_note=trim(p_note),reviewed_by=v_actor,reviewed_at=now(),updated_at=now()
     where id=p_request_id;
    return;
  end if;
  if p_inspection_result not in ('resellable','damaged') then
    raise exception 'Completed return requires a resellable or damaged inspection result' using errcode='22023';
  end if;
  select * into v_line from public.shop_order_lines where id=v_request.order_line_id for update;
  select * into v_old from public.shop_variants where id=v_line.variant_id for update;
  if p_inspection_result='resellable' then
    update public.shop_variants set on_hand=on_hand+v_request.requested_quantity,updated_at=now() where id=v_old.id;
    insert into public.inventory_movements(variant_id,movement_kind,on_hand_delta,resulting_on_hand,resulting_reserved,resulting_damaged,
      order_id,order_line_id,actor_id,reason,idempotency_key)
    values(v_old.id,'return_to_stock',v_request.requested_quantity,v_old.on_hand+v_request.requested_quantity,v_old.reserved,v_old.damaged,
      v_line.order_id,v_line.id,v_actor,trim(p_note),'return:'||p_request_id::text);
  else
    update public.shop_variants set damaged=damaged+v_request.requested_quantity,updated_at=now() where id=v_old.id;
    insert into public.inventory_movements(variant_id,movement_kind,damaged_delta,resulting_on_hand,resulting_reserved,resulting_damaged,
      order_id,order_line_id,actor_id,reason,idempotency_key)
    values(v_old.id,'damaged_return',v_request.requested_quantity,v_old.on_hand,v_old.reserved,v_old.damaged+v_request.requested_quantity,
      v_line.order_id,v_line.id,v_actor,trim(p_note),'return:'||p_request_id::text);
  end if;
  if v_request.request_kind='exchange' then
    select * into v_new from public.shop_variants where id=v_request.requested_variant_id for update;
    if not found or not v_new.active or not v_new.reconciled or v_new.unit_price is null
       or v_new.product_id<>v_old.product_id
       or v_new.on_hand-v_new.reserved<v_request.requested_quantity
       or not exists (select 1 from public.shop_products p where p.id=v_new.product_id and p.active=true and p.reconciled=true) then
      raise exception 'Requested exchange variant is unavailable' using errcode='22023';
    end if;
    update public.shop_variants set on_hand=on_hand-v_request.requested_quantity,updated_at=now() where id=v_new.id;
    insert into public.inventory_movements(variant_id,movement_kind,on_hand_delta,resulting_on_hand,resulting_reserved,resulting_damaged,
      order_id,actor_id,reason,idempotency_key)
    values(v_new.id,'exchange_out',-v_request.requested_quantity,v_new.on_hand-v_request.requested_quantity,v_new.reserved,v_new.damaged,
      v_line.order_id,v_actor,trim(p_note),'exchange:'||p_request_id::text);
  end if;
  update public.return_exchange_requests set status='completed',inspection_result=p_inspection_result,
    monetary_adjustment=coalesce(p_monetary_adjustment,0),office_note=trim(p_note),reviewed_by=v_actor,reviewed_at=now(),completed_at=now(),updated_at=now()
   where id=p_request_id;
  insert into public.finance_events(order_id,actor_id,event_type,detail)
  values(v_line.order_id,v_actor,'return_exchange_completed',jsonb_build_object(
    'request_id',p_request_id,'request_kind',v_request.request_kind,
    'inspection_result',p_inspection_result,'quantity',v_request.requested_quantity,
    'monetary_adjustment',coalesce(p_monetary_adjustment,0),'note',trim(p_note)
  ));
end;
$$;
revoke all on function public.complete_return_exchange(uuid,text,text,numeric,text) from public,anon;
grant execute on function public.complete_return_exchange(uuid,text,text,numeric,text) to authenticated;

create or replace function public.open_stocktake(p_reference text,p_note text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_id uuid;
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reference,'')))<3 then raise exception 'Administrator and reference required' using errcode='42501'; end if;
  insert into public.stocktakes(reference,note,created_by) values(trim(p_reference),nullif(trim(p_note),''),(select auth.uid())) returning id into v_id;
  insert into public.stocktake_lines(stocktake_id,variant_id,expected_on_hand)
  select v_id,id,on_hand from public.shop_variants where active=true;
  return v_id;
end;
$$;
revoke all on function public.open_stocktake(text,text) from public,anon;
grant execute on function public.open_stocktake(text,text) to authenticated;

create or replace function public.close_stocktake(p_stocktake_id uuid)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_line record;
  v_variant public.shop_variants%rowtype;
  v_delta integer;
  v_count integer:=0;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  if not exists(select 1 from public.stocktakes where id=p_stocktake_id and status='open' for update) then
    raise exception 'Open stocktake required' using errcode='22023';
  end if;
  if exists(select 1 from public.stocktake_lines where stocktake_id=p_stocktake_id and actual_on_hand is null) then
    raise exception 'Every stocktake line requires an actual count' using errcode='22023';
  end if;
  for v_line in select * from public.stocktake_lines where stocktake_id=p_stocktake_id for update loop
    select * into v_variant from public.shop_variants where id=v_line.variant_id for update;
    v_delta:=v_line.actual_on_hand-v_variant.on_hand;
    if v_line.actual_on_hand<v_variant.reserved then raise exception 'Actual count is below reserved stock' using errcode='23514'; end if;
    if v_delta<>0 then
      update public.shop_variants set on_hand=v_line.actual_on_hand,updated_at=now() where id=v_variant.id;
      insert into public.inventory_movements(variant_id,movement_kind,on_hand_delta,resulting_on_hand,resulting_reserved,resulting_damaged,actor_id,reason,idempotency_key)
      values(v_variant.id,'stocktake',v_delta,v_line.actual_on_hand,v_variant.reserved,v_variant.damaged,(select auth.uid()),
        coalesce(nullif(trim(v_line.note),''),'Closed stocktake adjustment'),'stocktake:'||p_stocktake_id::text||':'||v_variant.id::text);
      v_count:=v_count+1;
    end if;
  end loop;
  update public.stocktakes set status='closed',closed_by=(select auth.uid()),closed_at=now() where id=p_stocktake_id;
  return v_count;
end;
$$;
revoke all on function public.close_stocktake(uuid) from public,anon;
grant execute on function public.close_stocktake(uuid) to authenticated;

create or replace function public.create_procurement_batch(
  p_reference text,
  p_variant_id uuid,
  p_ordered_quantity integer,
  p_unit_cost numeric,
  p_supplier_note text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_batch uuid;
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reference,'')))<3
     or p_ordered_quantity<=0 or (p_unit_cost is not null and p_unit_cost<0)
     or not exists(select 1 from public.shop_variants where id=p_variant_id) then
    raise exception 'Administrator and valid procurement line required' using errcode='42501';
  end if;
  insert into public.procurement_batches(reference,status,supplier_note,created_by,ordered_at)
  values(trim(p_reference),'ordered',nullif(trim(p_supplier_note),''),(select auth.uid()),now())
  returning id into v_batch;
  insert into public.procurement_lines(batch_id,variant_id,ordered_quantity,unit_cost)
  values(v_batch,p_variant_id,p_ordered_quantity,p_unit_cost);
  return v_batch;
end;
$$;
revoke all on function public.create_procurement_batch(text,uuid,integer,numeric,text) from public,anon;
grant execute on function public.create_procurement_batch(text,uuid,integer,numeric,text) to authenticated;

create or replace function public.add_procurement_line(
  p_batch_id uuid,p_variant_id uuid,p_ordered_quantity integer,p_unit_cost numeric
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_line uuid;
begin
  if not public.is_admin() or p_ordered_quantity<=0 or (p_unit_cost is not null and p_unit_cost<0)
     or not exists(select 1 from public.procurement_batches where id=p_batch_id and status in ('draft','ordered') for update)
     or not exists(select 1 from public.shop_variants where id=p_variant_id) then
    raise exception 'Open procurement batch and valid line required' using errcode='42501';
  end if;
  insert into public.procurement_lines(batch_id,variant_id,ordered_quantity,unit_cost)
  values(p_batch_id,p_variant_id,p_ordered_quantity,p_unit_cost) returning id into v_line;
  return v_line;
end;
$$;
revoke all on function public.add_procurement_line(uuid,uuid,integer,numeric) from public,anon;
grant execute on function public.add_procurement_line(uuid,uuid,integer,numeric) to authenticated;

create or replace function public.cancel_procurement_batch(p_batch_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Administrator and reason required' using errcode='42501'; end if;
  update public.procurement_batches set status='cancelled',supplier_note=trim(p_reason),updated_at=now()
   where id=p_batch_id and status in ('draft','ordered')
     and not exists(select 1 from public.procurement_lines l where l.batch_id=p_batch_id and l.received_quantity>0);
  if not found then raise exception 'Unreceived procurement batch required' using errcode='22023'; end if;
end;
$$;
revoke all on function public.cancel_procurement_batch(uuid,text) from public,anon;
grant execute on function public.cancel_procurement_batch(uuid,text) to authenticated;

create or replace function public.cancel_stocktake(p_stocktake_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Administrator and reason required' using errcode='42501'; end if;
  update public.stocktakes set status='cancelled',note=trim(p_reason),closed_by=(select auth.uid()),closed_at=now()
   where id=p_stocktake_id and status='open';
  if not found then raise exception 'Open stocktake required' using errcode='22023'; end if;
end;
$$;
revoke all on function public.cancel_stocktake(uuid,text) from public,anon;
grant execute on function public.cancel_stocktake(uuid,text) to authenticated;

create or replace function public.receive_procurement_line(
  p_line_id uuid,
  p_quantity integer,
  p_note text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_line public.procurement_lines%rowtype;
  v_variant public.shop_variants%rowtype;
  v_parent_request record;
begin
  if not public.is_admin() or p_quantity<=0 or char_length(trim(coalesce(p_note,'')))<3 then
    raise exception 'Administrator, quantity and note required' using errcode='42501';
  end if;
  select * into v_line from public.procurement_lines where id=p_line_id for update;
  if not found or v_line.received_quantity+p_quantity>v_line.ordered_quantity then
    raise exception 'Procurement receipt exceeds ordered quantity' using errcode='22023';
  end if;
  if not exists(select 1 from public.procurement_batches b where b.id=v_line.batch_id and b.status in ('ordered','part_received') for update) then
    raise exception 'Ordered procurement batch required' using errcode='22023';
  end if;
  select * into v_variant from public.shop_variants where id=v_line.variant_id for update;
  update public.procurement_lines set received_quantity=received_quantity+p_quantity where id=p_line_id;
  update public.shop_variants set on_hand=on_hand+p_quantity,updated_at=now() where id=v_variant.id;
  insert into public.inventory_movements(variant_id,movement_kind,on_hand_delta,resulting_on_hand,resulting_reserved,resulting_damaged,actor_id,reason,
    idempotency_key)
  values(v_variant.id,'purchase_receipt',p_quantity,v_variant.on_hand+p_quantity,v_variant.reserved,v_variant.damaged,(select auth.uid()),trim(p_note),
    'procurement:'||p_line_id::text||':'||(v_line.received_quantity+p_quantity)::text);
  update public.procurement_batches b set status=case
    when not exists(select 1 from public.procurement_lines l where l.batch_id=b.id and l.id<>p_line_id and l.received_quantity<l.ordered_quantity)
      and v_line.received_quantity+p_quantity=v_line.ordered_quantity then 'received' else 'part_received' end,
    received_at=case when not exists(select 1 from public.procurement_lines l where l.batch_id=b.id and l.id<>p_line_id and l.received_quantity<l.ordered_quantity)
      and v_line.received_quantity+p_quantity=v_line.ordered_quantity then now() else b.received_at end,
    updated_at=now() where b.id=v_line.batch_id;
  for v_parent_request in select r.* from public.restock_requests r
    where r.product_id=v_variant.product_id and r.status in ('requested','reviewing','procurement_planned')
      and (r.variant_label is null or lower(trim(r.variant_label)) in (
        lower(trim(v_variant.variant_label)), lower(trim(coalesce(v_variant.size_label,'')))
      ))
  loop
    update public.restock_requests set status='available',admin_note='Stock received; parent confirmation required before ordering.',updated_at=now()
     where id=v_parent_request.id;
    insert into public.portal_notifications(recipient_id,student_id,kind,title,message)
    values(v_parent_request.parent_id,v_parent_request.student_id,'restock','Requested item may now be available',
      'Stock has been received. Confirm your interest in the portal before placing an order; availability is not guaranteed until an order reserves stock.');
  end loop;
end;
$$;
revoke all on function public.receive_procurement_line(uuid,integer,text) from public,anon;
grant execute on function public.receive_procurement_line(uuid,integer,text) to authenticated;

create or replace function public.reconcile_transport_service(
  p_source_id text,
  p_route_code text,
  p_route_name text,
  p_session_name text,
  p_term_name text,
  p_term_amount numeric,
  p_capacity integer,
  p_status text,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_service uuid; v_verified boolean;
begin
  if not public.is_admin() or p_status not in ('pending','mapped','owner_verified','excluded')
     or char_length(trim(coalesce(p_source_id,'')))<1 or char_length(trim(coalesce(p_note,'')))<3 then
    raise exception 'Administrator, preserved source and reconciliation note required' using errcode='42501';
  end if;
  v_verified:=p_status='owner_verified';
  select target_service_id into v_service from public.legacy_transport_reconciliation
   where source_id=trim(p_source_id) for update;
  if p_status='excluded' then
    if v_service is not null then update public.transport_services set active=false,reconciled=false,updated_at=now() where id=v_service; end if;
    insert into public.legacy_transport_reconciliation(source_id,status,note,reviewed_by,reviewed_at)
    values(trim(p_source_id),'excluded',trim(p_note),(select auth.uid()),now())
    on conflict(source_id) do update set target_service_id=null,status='excluded',note=excluded.note,
      reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
    return null;
  end if;
  if char_length(trim(coalesce(p_route_code,'')))<2 or char_length(trim(coalesce(p_route_name,'')))<2
     or char_length(trim(coalesce(p_session_name,''))) not between 4 and 40
     or char_length(trim(coalesce(p_term_name,''))) not between 2 and 40
     or (v_verified and (p_term_amount is null or p_term_amount<=0))
     or (p_capacity is not null and p_capacity<=0) then
    raise exception 'Complete verified route values required' using errcode='22023';
  end if;
  if v_service is null then
    insert into public.transport_services(route_code,route_name,session_name,term_name,term_amount,capacity,active,reconciled,created_by)
    values(trim(p_route_code),trim(p_route_name),trim(p_session_name),trim(p_term_name),p_term_amount,p_capacity,v_verified,v_verified,(select auth.uid()))
    returning id into v_service;
  else
    update public.transport_services set route_code=trim(p_route_code),route_name=trim(p_route_name),
      session_name=trim(p_session_name),term_name=trim(p_term_name),term_amount=p_term_amount,capacity=p_capacity,
      active=v_verified,reconciled=v_verified,updated_at=now() where id=v_service;
  end if;
  insert into public.legacy_transport_reconciliation(source_id,target_service_id,status,note,reviewed_by,reviewed_at)
  values(trim(p_source_id),v_service,p_status,trim(p_note),(select auth.uid()),now())
  on conflict(source_id) do update set target_service_id=excluded.target_service_id,status=excluded.status,
    note=excluded.note,reviewed_by=excluded.reviewed_by,reviewed_at=excluded.reviewed_at;
  return v_service;
end;
$$;
revoke all on function public.reconcile_transport_service(text,text,text,text,text,numeric,integer,text,text) from public,anon;
grant execute on function public.reconcile_transport_service(text,text,text,text,text,numeric,integer,text,text) to authenticated;

create or replace function public.request_transport(
  p_student_id uuid,
  p_service_id uuid,
  p_general_area text
)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare v_ref text;
begin
  if not public.full_parent_access() or not public.parent_can_access_student(p_student_id)
     or char_length(trim(coalesce(p_general_area,''))) not between 2 and 240 then
    raise exception 'Linked parent and general pickup area required' using errcode='42501';
  end if;
  if p_service_id is not null and not exists(
    select 1 from public.transport_services s where s.id=p_service_id and s.active=true and s.reconciled=true
  ) then raise exception 'Verified transport service required' using errcode='22023'; end if;
  if exists(
    select 1 from public.transport_requests r where r.student_id=p_student_id
      and r.parent_id=(select auth.uid()) and r.status in ('requested','reviewing','approved','waitlisted')
  ) then raise exception 'This pupil already has an open transport request' using errcode='23514'; end if;
  v_ref:='TA-TRN-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.transport_requests(request_reference,parent_id,student_id,service_id,general_area)
  values(v_ref,(select auth.uid()),p_student_id,p_service_id,trim(p_general_area));
  return v_ref;
end;
$$;
revoke all on function public.request_transport(uuid,uuid,text) from public,anon;
grant execute on function public.request_transport(uuid,uuid,text) to authenticated;

create or replace function public.review_transport_request(
  p_request_id uuid,
  p_status text,
  p_service_id uuid,
  p_note text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_request public.transport_requests%rowtype;
  v_service public.transport_services%rowtype;
  v_invoice uuid;
  v_item_code text;
begin
  if not public.is_admin() or p_status not in ('reviewing','approved','waitlisted','declined','cancelled')
     or char_length(trim(coalesce(p_note,'')))<3 then
    raise exception 'Administrator decision and note required' using errcode='42501';
  end if;
  select * into v_request from public.transport_requests where id=p_request_id for update;
  if not found or v_request.status in ('approved','declined','cancelled') then raise exception 'Open transport request required' using errcode='22023'; end if;
  if p_status='approved' then
    select * into v_service from public.transport_services where id=p_service_id and active=true and reconciled=true for update;
    if not found or v_service.term_amount is null or (v_service.capacity is not null and v_service.approved_count>=v_service.capacity) then
      raise exception 'Verified route with available capacity and price required' using errcode='22023';
    end if;
    insert into public.pupil_invoices(invoice_reference,student_id,session_name,term_name,class_code,title,total_amount,status,issued_by)
    select 'TA-INV-'||to_char(current_date,'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,10)),
      v_request.student_id,v_service.session_name,v_service.term_name,s.class_code,'School transport — '||v_service.route_name,
      v_service.term_amount,'issued',(select auth.uid()) from public.students s where s.id=v_request.student_id
    returning id into v_invoice;
    v_item_code:='TRANSPORT_'||upper(substr(replace(v_service.route_code,'-','_'),1,25));
    insert into public.pupil_invoice_items(invoice_id,item_code,label,charge_kind,amount,source_type,source_id)
    values(v_invoice,v_item_code,'School transport — '||v_service.route_name,'transport',v_service.term_amount,'transport',v_service.id);
    update public.transport_services set approved_count=approved_count+1,updated_at=now() where id=v_service.id;
    insert into public.finance_events(invoice_id,actor_id,event_type,detail)
    values(v_invoice,(select auth.uid()),'invoice_issued',jsonb_build_object('source','transport_request'));
  end if;
  update public.transport_requests set status=p_status,service_id=case when p_status='approved' then p_service_id else service_id end,
    office_note=trim(p_note),reviewed_by=(select auth.uid()),reviewed_at=now(),invoice_id=case when p_status='approved' then v_invoice else invoice_id end,
    updated_at=now() where id=p_request_id;
  if p_status in ('approved','waitlisted','declined') then
    insert into public.portal_notifications(recipient_id,student_id,kind,title,message)
    values(v_request.parent_id,v_request.student_id,'transport','Transport request updated',
      'Your transport request is now '||replace(p_status,'_',' ')||'. Open Fees, Shop & Transport for the current record.');
  end if;
  return v_invoice;
end;
$$;
revoke all on function public.review_transport_request(uuid,text,uuid,text) from public,anon;
grant execute on function public.review_transport_request(uuid,text,uuid,text) to authenticated;

create or replace function public.cancel_transport_approval(p_request_id uuid,p_reason text)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v public.transport_requests%rowtype;
begin
  if not public.is_admin() or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Administrator and cancellation reason required' using errcode='42501';
  end if;
  select * into v from public.transport_requests where id=p_request_id and status='approved' for update;
  if not found or v.invoice_id is null or v.service_id is null then raise exception 'Approved billed transport request required' using errcode='22023'; end if;
  update public.pupil_invoices set status='cancelled',updated_at=now()
   where id=v.invoice_id and status in ('issued','part_paid') and paid_amount=0
     and not exists(select 1 from public.manual_payments m where m.invoice_id=v.invoice_id and m.status in ('submitted','under_review','verified'));
  if not found then raise exception 'Transport invoice has a payment and cannot be cancelled here' using errcode='22023'; end if;
  insert into public.finance_events(invoice_id,actor_id,event_type,detail)
  values(v.invoice_id,(select auth.uid()),'invoice_cancelled',jsonb_build_object('reason',trim(p_reason),'source','transport'));
  update public.transport_services set approved_count=greatest(approved_count-1,0),updated_at=now() where id=v.service_id;
  update public.transport_requests set status='cancelled',office_note=trim(p_reason),reviewed_by=(select auth.uid()),reviewed_at=now(),updated_at=now() where id=p_request_id;
  insert into public.portal_notifications(recipient_id,student_id,kind,title,message)
  values(v.parent_id,v.student_id,'transport','Transport approval cancelled','The office cancelled the unpaid transport approval. No transport place or payable invoice remains active.');
end;
$$;
revoke all on function public.cancel_transport_approval(uuid,text) from public,anon;
grant execute on function public.cancel_transport_approval(uuid,text) to authenticated;

create or replace function public.submit_bank_transfer_notification(
  p_invoice_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_payer_name text,
  p_sender_bank_name text,
  p_external_reference text,
  p_paid_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
  v_bank uuid;
  v_owner boolean := false;
begin
  if not public.full_parent_access()
     or ((p_invoice_id is null)::integer + (p_order_id is null)::integer) <> 1
     or p_amount <= 0 or char_length(trim(coalesce(p_payer_name,''))) < 2
     or char_length(trim(coalesce(p_sender_bank_name,''))) < 2
     or char_length(trim(coalesce(p_external_reference,''))) < 3 or p_paid_at is null then
    raise exception 'Complete bank transfer details are required' using errcode = '22023';
  end if;
  if p_invoice_id is not null then
    select exists (
      select 1 from public.pupil_invoices i join public.student_guardians g on g.student_id = i.student_id
       where i.id = p_invoice_id and g.parent_id = (select auth.uid()) and g.active = true
         and i.status in ('issued','part_paid') and p_amount <= i.total_amount - coalesce((
           select sum(m.amount) from public.manual_payments m
            where m.invoice_id=i.id and m.status in ('submitted','under_review','verified')
         ),0)
    ) into v_owner;
  else
    select exists (
      select 1 from public.shop_orders o where o.id = p_order_id and o.parent_id = (select auth.uid())
       and o.status in ('awaiting_payment','payment_submitted')
       and p_amount = o.total_amount - coalesce((
         select sum(m.amount) from public.manual_payments m
          where m.order_id = o.id and m.status in ('submitted','under_review','verified')
       ),0)
    ) into v_owner;
  end if;
  if not v_owner then raise exception 'Payable linked invoice or order required' using errcode = '42501'; end if;
  select id into v_bank from public.school_bank_accounts where active = true;
  if v_bank is null then raise exception 'No approved bank account is currently available' using errcode = '22023'; end if;
  v_ref := 'TA-PAY-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.manual_payments(
    payment_reference, invoice_id, order_id, submitted_by, method, amount,
    payer_name, sender_bank_name, external_reference, stated_paid_at, bank_account_id
  ) values (v_ref, p_invoice_id, p_order_id, (select auth.uid()), 'bank_transfer', p_amount,
    trim(p_payer_name), trim(p_sender_bank_name), trim(p_external_reference), p_paid_at, v_bank);
  if p_order_id is not null then
    update public.shop_orders set status = 'payment_submitted', updated_at = now()
     where id = p_order_id and status = 'awaiting_payment';
  end if;
  insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type)
  select id, invoice_id, order_id, (select auth.uid()), 'payment_submitted'
    from public.manual_payments where payment_reference = v_ref;
  return v_ref;
end;
$$;
revoke all on function public.submit_bank_transfer_notification(uuid, uuid, numeric, text, text, text, timestamptz) from public, anon;
grant execute on function public.submit_bank_transfer_notification(uuid, uuid, numeric, text, text, text, timestamptz) to authenticated;

create or replace function public.finalize_verified_payment(p_payment_id uuid, p_actor_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.manual_payments%rowtype;
  v_total numeric(12,2);
  v_due numeric(12,2);
  v_receipt text;
begin
  select * into v_payment from public.manual_payments where id = p_payment_id for update;
  if not found or v_payment.status <> 'verified' then raise exception 'Verified payment required' using errcode = '22023'; end if;
  if v_payment.invoice_id is not null then
    select total_amount into v_due from public.pupil_invoices where id = v_payment.invoice_id for update;
    select coalesce(sum(amount),0) into v_total from public.manual_payments
     where invoice_id = v_payment.invoice_id and status = 'verified';
    if v_total > v_due then raise exception 'Verified payments exceed invoice balance' using errcode = '23514'; end if;
    update public.pupil_invoices set paid_amount = v_total,
      status = case when v_total = total_amount then 'paid' else 'part_paid' end, updated_at = now()
     where id = v_payment.invoice_id;
  else
    select total_amount into v_due from public.shop_orders where id = v_payment.order_id for update;
    select coalesce(sum(amount),0) into v_total from public.manual_payments
     where order_id = v_payment.order_id and status = 'verified';
    if v_total > v_due then raise exception 'Verified payments exceed order balance' using errcode = '23514'; end if;
    if v_total = v_due then
      update public.shop_orders set status = 'paid_preparing', paid_at = now(),
        expected_ready_on = public.next_school_workday(current_date), updated_at = now()
       where id = v_payment.order_id and status in ('awaiting_payment','payment_submitted');
    end if;
  end if;
  v_receipt := 'TA-RCP-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.payment_receipts(receipt_reference, payment_id, issued_by)
  values (v_receipt, p_payment_id, p_actor_id);
  insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type)
  values (p_payment_id, v_payment.invoice_id, v_payment.order_id, p_actor_id, 'payment_verified'),
         (p_payment_id, v_payment.invoice_id, v_payment.order_id, p_actor_id, 'receipt_issued');
  return v_receipt;
end;
$$;
revoke all on function public.finalize_verified_payment(uuid, uuid) from public, anon, authenticated;

create or replace function public.review_manual_payment(
  p_payment_id uuid,
  p_action text,
  p_note text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.manual_payments%rowtype;
  v_receipt text;
  v_total numeric(12,2);
begin
  if not public.is_admin() or char_length(trim(coalesce(p_note,''))) < 3 then
    raise exception 'Administrator and review note required' using errcode = '42501';
  end if;
  select * into v from public.manual_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if p_action = 'under_review' and v.status = 'submitted' then
    update public.manual_payments set status='under_review', reviewed_by=(select auth.uid()), reviewed_at=now(), review_note=trim(p_note), updated_at=now() where id=p_payment_id;
    insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type)
    values (p_payment_id, v.invoice_id, v.order_id, (select auth.uid()), 'payment_under_review');
    return null;
  elsif p_action = 'verify' and v.status in ('submitted','under_review') then
    update public.manual_payments set status='verified', reviewed_by=(select auth.uid()), reviewed_at=now(), review_note=trim(p_note), updated_at=now() where id=p_payment_id;
    v_receipt := public.finalize_verified_payment(p_payment_id, (select auth.uid()));
    return v_receipt;
  elsif p_action = 'reject' and v.status in ('submitted','under_review') then
    update public.manual_payments set status='rejected', reviewed_by=(select auth.uid()), reviewed_at=now(), review_note=trim(p_note), updated_at=now() where id=p_payment_id;
    if v.order_id is not null and not exists (select 1 from public.manual_payments m where m.order_id=v.order_id and m.id<>p_payment_id and m.status in ('submitted','under_review','verified')) then
      update public.shop_orders set status='awaiting_payment', updated_at=now() where id=v.order_id and status='payment_submitted';
    end if;
    insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type)
    values (p_payment_id, v.invoice_id, v.order_id, (select auth.uid()), 'payment_rejected');
    return null;
  elsif p_action = 'reverse' and v.status = 'verified' then
    if not public.is_headmistress() then raise exception 'Only the Headmistress may reverse a verified payment' using errcode = '42501'; end if;
    update public.manual_payments set status='reversed', reversed_by=(select auth.uid()), reversed_at=now(), reversal_reason=trim(p_note), updated_at=now() where id=p_payment_id;
    update public.payment_receipts set reversed_at=now(), reversal_reason=trim(p_note) where payment_id=p_payment_id;
    if v.invoice_id is not null then
      select coalesce(sum(amount),0) into v_total from public.manual_payments where invoice_id=v.invoice_id and status='verified';
      update public.pupil_invoices set paid_amount=v_total,
        status=case when v_total=0 then 'issued' when v_total=total_amount then 'paid' else 'part_paid' end,
        updated_at=now() where id=v.invoice_id;
    else
      update public.shop_orders set status='payment_reversed', updated_at=now() where id=v.order_id;
    end if;
    insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type, detail)
    values (p_payment_id, v.invoice_id, v.order_id, (select auth.uid()), 'payment_reversed', jsonb_build_object('reason',trim(p_note)));
    return null;
  end if;
  raise exception 'Invalid payment transition' using errcode = '22023';
end;
$$;
revoke all on function public.review_manual_payment(uuid, text, text) from public, anon;
grant execute on function public.review_manual_payment(uuid, text, text) to authenticated;

create or replace function public.record_physical_pos_payment(
  p_invoice_id uuid,
  p_order_id uuid,
  p_amount numeric,
  p_payer_name text,
  p_terminal_reference text,
  p_paid_at timestamptz,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ref text;
  v_id uuid;
  v_payable boolean := false;
begin
  if not public.is_admin() or ((p_invoice_id is null)::integer + (p_order_id is null)::integer) <> 1
     or p_amount <= 0 or char_length(trim(coalesce(p_payer_name,''))) < 2
     or char_length(trim(coalesce(p_terminal_reference,''))) < 3
     or p_paid_at is null or char_length(trim(coalesce(p_note,''))) < 3 then
    raise exception 'Complete physical POS record required' using errcode = '22023';
  end if;
  if p_invoice_id is not null then
    select exists (
      select 1 from public.pupil_invoices i
       where i.id=p_invoice_id and i.status in ('issued','part_paid')
         and p_amount <= i.total_amount-coalesce((
           select sum(m.amount) from public.manual_payments m
            where m.invoice_id=i.id and m.status in ('submitted','under_review','verified')
         ),0)
    ) into v_payable;
  else
    select exists (
      select 1 from public.shop_orders o
       where o.id=p_order_id and o.status in ('awaiting_payment','payment_submitted')
         and p_amount = o.total_amount-coalesce((
           select sum(m.amount) from public.manual_payments m
            where m.order_id=o.id and m.status in ('submitted','under_review','verified')
         ),0)
    ) into v_payable;
  end if;
  if not v_payable then raise exception 'Open payable invoice or full outstanding materials order required' using errcode='22023'; end if;
  v_ref := 'TA-PAY-' || to_char(current_date,'YYYYMMDD') || '-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10));
  insert into public.manual_payments(
    payment_reference, invoice_id, order_id, submitted_by, method, amount, status,
    payer_name, terminal_reference, stated_paid_at
  ) values (
    v_ref, p_invoice_id, p_order_id, (select auth.uid()), 'physical_pos', p_amount, 'submitted',
    trim(p_payer_name), trim(p_terminal_reference), p_paid_at
  ) returning id into v_id;
  if p_order_id is not null then
    update public.shop_orders set status='payment_submitted',updated_at=now()
     where id=p_order_id and status='awaiting_payment';
  end if;
  insert into public.finance_events(payment_id,invoice_id,order_id,actor_id,event_type,detail)
  values(v_id,p_invoice_id,p_order_id,(select auth.uid()),'payment_submitted',jsonb_build_object(
    'method','physical_pos','record_note',trim(p_note)
  ));
  return jsonb_build_object('payment_reference', v_ref, 'status', 'submitted');
end;
$$;
revoke all on function public.record_physical_pos_payment(uuid, uuid, numeric, text, text, timestamptz, text) from public, anon;
grant execute on function public.record_physical_pos_payment(uuid, uuid, numeric, text, text, timestamptz, text) to authenticated;

create or replace function public.guard_fee_schedule_update()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if tg_op='INSERT' then
    if new.publication_status<>'draft' or new.published_by is not null or new.published_at is not null then
      raise exception 'Fee schedules must begin as unpublished drafts' using errcode='42501';
    end if;
    return new;
  end if;
  if old.publication_status<>'draft' and (
    new.session_name is distinct from old.session_name or new.term_name is distinct from old.term_name
    or new.class_code is distinct from old.class_code or new.title is distinct from old.title
    or new.due_date is distinct from old.due_date
  ) then raise exception 'Published fee schedule details are immutable' using errcode='42501'; end if;
  if new.publication_status is distinct from old.publication_status and not (
    (old.publication_status='draft' and new.publication_status in ('published','retired'))
    or (old.publication_status='published' and new.publication_status='retired')
  ) then raise exception 'Invalid fee schedule transition' using errcode='22023'; end if;
  if new.publication_status='published' and (new.published_by is null or new.published_at is null) then
    raise exception 'Published fee schedule requires publisher and time' using errcode='22023';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_fee_schedule_update() from public,anon,authenticated;
drop trigger if exists fee_schedule_guard on public.fee_schedules;
create trigger fee_schedule_guard before insert or update on public.fee_schedules
for each row execute function public.guard_fee_schedule_update();

create or replace function public.guard_fee_schedule_item()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare v_schedule uuid:=case when tg_op='DELETE' then old.schedule_id else new.schedule_id end;
begin
  if not exists(select 1 from public.fee_schedules s where s.id=v_schedule and s.publication_status='draft') then
    raise exception 'Fee components may change only while the schedule is draft' using errcode='42501';
  end if;
  return case when tg_op='DELETE' then old else new end;
end;
$$;
revoke all on function public.guard_fee_schedule_item() from public,anon,authenticated;
drop trigger if exists fee_schedule_item_guard on public.fee_schedule_items;
create trigger fee_schedule_item_guard before insert or update or delete on public.fee_schedule_items
for each row execute function public.guard_fee_schedule_item();

create or replace function public.guard_stocktake_line_update()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if not exists(select 1 from public.stocktakes s where s.id=new.stocktake_id and s.status='open') then
    raise exception 'Only an open stocktake may receive physical counts' using errcode='42501';
  end if;
  if new.stocktake_id is distinct from old.stocktake_id or new.variant_id is distinct from old.variant_id
     or new.expected_on_hand is distinct from old.expected_on_hand then
    raise exception 'Stocktake identity and expected balance are immutable' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_stocktake_line_update() from public,anon,authenticated;
drop trigger if exists stocktake_line_guard on public.stocktake_lines;
create trigger stocktake_line_guard before update on public.stocktake_lines
for each row execute function public.guard_stocktake_line_update();

create or replace function public.guard_inventory_movement_immutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$ begin raise exception 'Inventory movements are immutable' using errcode = '42501'; end; $$;
revoke all on function public.guard_inventory_movement_immutable() from public, anon, authenticated;

drop trigger if exists inventory_movements_immutable on public.inventory_movements;
create trigger inventory_movements_immutable before update or delete on public.inventory_movements
for each row execute function public.guard_inventory_movement_immutable();

create or replace function public.audit_shop_variant_price()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.unit_price is distinct from old.unit_price then
    insert into public.shop_price_events(variant_id, previous_price, new_price, actor_id, reason)
    values (new.id, old.unit_price, new.unit_price, (select auth.uid()), 'Catalogue price changed');
  end if;
  return new;
end;
$$;
revoke all on function public.audit_shop_variant_price() from public, anon, authenticated;
drop trigger if exists shop_variant_price_audit on public.shop_variants;
create trigger shop_variant_price_audit after update of unit_price on public.shop_variants
for each row execute function public.audit_shop_variant_price();

-- Standard updated_at triggers.
do $$
declare n text;
begin
  foreach n in array array[
    'school_bank_accounts','fee_schedules','pupil_invoices','shop_products','shop_variants',
    'shop_orders','restock_requests','procurement_batches','return_exchange_requests',
    'transport_services','transport_requests','manual_payments'
  ] loop
    execute format('drop trigger if exists %I on public.%I', n || '_touch_updated_at', n);
    execute format('create trigger %I before update on public.%I for each row execute function public.portal_touch_updated_at()', n || '_touch_updated_at', n);
  end loop;
end $$;

-- RLS: configuration writes are administrator-only; parents see only linked
-- records; teacher distribution contains no amount, payment or parent contact.
do $$
declare n text;
begin
  foreach n in array array[
    'school_bank_accounts','fee_schedules','fee_schedule_items','legacy_fee_reconciliation','pupil_invoices','pupil_invoice_items',
    'shop_products','shop_variants','legacy_catalog_reconciliation','shop_price_events','catalog_status_events','shop_orders',
    'shop_order_lines','inventory_movements','stocktakes','stocktake_lines','restock_requests',
    'procurement_batches','procurement_lines','return_exchange_requests','transport_services',
    'legacy_transport_reconciliation','transport_requests','manual_payments','payment_receipts','finance_events'
  ] loop execute format('alter table public.%I enable row level security', n); end loop;
end $$;

create policy bank_accounts_select on public.school_bank_accounts for select to authenticated
using ((select public.is_admin()) or (active and (select public.full_parent_access())));
create policy bank_accounts_head_write on public.school_bank_accounts for all to authenticated
using ((select public.is_headmistress())) with check ((select public.is_headmistress()));

create policy fee_schedules_admin_all on public.fee_schedules for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy fee_items_admin_all on public.fee_schedule_items for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy legacy_fee_reconciliation_admin on public.legacy_fee_reconciliation for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy invoices_select on public.pupil_invoices for select to authenticated
using ((select public.is_admin()) or public.parent_can_access_student(student_id));
create policy invoice_items_select on public.pupil_invoice_items for select to authenticated
using ((select public.is_admin()) or exists (
  select 1 from public.pupil_invoices i where i.id = pupil_invoice_items.invoice_id and public.parent_can_access_student(i.student_id)
));

create policy products_select on public.shop_products for select to authenticated
using ((select public.is_admin()));
create policy products_admin_write on public.shop_products for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy variants_select on public.shop_variants for select to authenticated
using ((select public.is_admin()));
create policy variants_admin_insert on public.shop_variants for insert to authenticated with check ((select public.is_admin()));
create policy variants_admin_update on public.shop_variants for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy legacy_reconciliation_admin on public.legacy_catalog_reconciliation for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy price_events_admin_select on public.shop_price_events for select to authenticated using ((select public.is_admin()));
create policy catalog_status_events_admin_select on public.catalog_status_events for select to authenticated using ((select public.is_admin()));
create policy orders_select on public.shop_orders for select to authenticated using (public.shop_order_access(id));
create policy order_lines_select on public.shop_order_lines for select to authenticated using (public.shop_order_access(order_id));
create policy inventory_admin_select on public.inventory_movements for select to authenticated using ((select public.is_admin()));
create policy stocktakes_admin_all on public.stocktakes for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy stocktake_lines_admin_all on public.stocktake_lines for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy restock_select on public.restock_requests for select to authenticated
using ((select public.is_admin()) or (parent_id=(select auth.uid()) and (select public.full_parent_access())));
create policy restock_admin_update on public.restock_requests for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy procurement_batches_admin on public.procurement_batches for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy procurement_lines_admin on public.procurement_lines for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy returns_select on public.return_exchange_requests for select to authenticated
using ((select public.is_admin()) or parent_id=(select auth.uid()));
create policy returns_admin_update on public.return_exchange_requests for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy transport_services_select on public.transport_services for select to authenticated
using ((select public.is_admin()));
create policy transport_services_admin_write on public.transport_services for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy legacy_transport_admin on public.legacy_transport_reconciliation for all to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));
create policy transport_requests_select on public.transport_requests for select to authenticated
using ((select public.is_admin()) or (parent_id=(select auth.uid()) and (select public.full_parent_access())));
create policy transport_requests_parent_insert on public.transport_requests for insert to authenticated
with check (parent_id=(select auth.uid()) and (select public.full_parent_access()) and public.parent_can_access_student(student_id));
create policy transport_requests_admin_update on public.transport_requests for update to authenticated
using ((select public.is_admin())) with check ((select public.is_admin()));

create policy manual_payments_select on public.manual_payments for select to authenticated
using ((select public.is_admin()));
create policy receipts_select on public.payment_receipts for select to authenticated
using ((select public.is_admin()));
create policy finance_events_admin_select on public.finance_events for select to authenticated using ((select public.is_admin()));

-- No anonymous grants for finance, catalogue, stock, orders, transport or payments.
revoke all on table public.school_bank_accounts, public.fee_schedules, public.fee_schedule_items,
  public.legacy_fee_reconciliation, public.pupil_invoices, public.pupil_invoice_items, public.shop_products, public.shop_variants,
  public.legacy_catalog_reconciliation, public.shop_price_events, public.catalog_status_events, public.shop_orders,
  public.shop_order_lines, public.inventory_movements, public.stocktakes, public.stocktake_lines,
  public.restock_requests, public.procurement_batches, public.procurement_lines,
  public.return_exchange_requests, public.transport_services, public.legacy_transport_reconciliation,
  public.transport_requests, public.manual_payments, public.payment_receipts, public.finance_events from anon;

grant select on table public.school_bank_accounts, public.fee_schedules, public.fee_schedule_items,
  public.legacy_fee_reconciliation, public.pupil_invoices, public.pupil_invoice_items, public.shop_products, public.shop_variants,
  public.legacy_catalog_reconciliation, public.shop_price_events, public.catalog_status_events, public.shop_orders,
  public.shop_order_lines, public.inventory_movements, public.stocktakes, public.stocktake_lines,
  public.restock_requests, public.procurement_batches, public.procurement_lines,
  public.return_exchange_requests, public.transport_services, public.legacy_transport_reconciliation,
  public.transport_requests, public.manual_payments, public.payment_receipts, public.finance_events to authenticated;

grant insert(bank_name,account_name,account_number),
  update(bank_name,account_name,account_number,updated_at)
  on public.school_bank_accounts to authenticated;
grant insert(session_name,term_name,class_code,title,due_date) on public.fee_schedules to authenticated;
grant insert, update, delete on public.fee_schedule_items to authenticated;
grant insert, update on public.legacy_fee_reconciliation, public.legacy_catalog_reconciliation to authenticated;
grant insert(product_code,name,description,category) on public.shop_products to authenticated;
grant insert(product_id, sku, variant_label, size_label, eligible_classes, unit_price,
  low_stock_threshold) on public.shop_variants to authenticated;
grant update(actual_on_hand,note) on public.stocktake_lines to authenticated;
grant select on public.inventory_low_stock to authenticated;

revoke all on sequence public.shop_price_events_id_seq, public.catalog_status_events_id_seq,
  public.inventory_movements_id_seq, public.finance_events_id_seq from anon, authenticated;

comment on table public.fee_schedule_items is 'billing_mode prevents included examinations/materials from being billed again as separate invoice lines.';
comment on table public.inventory_movements is 'Immutable authoritative stock ledger. Browser code never decrements stock.';
comment on table public.manual_payments is 'Manual bank-transfer notifications and physical school POS records only; verification never affects admission, promotion, results or access.';
comment on table public.restock_requests is 'Demand signal only; it is not a reservation, order, charge or guarantee of availability.';
comment on table public.transport_services is 'Capacity-controlled non-stock service. No inventory movement is created.';

-- Former Monnify-era objects from migration 001 remain dormant preservation
-- evidence. No grants, UI routes or functions in this migration activate them.
commit;

-- ============================================================================
-- BEGIN MIRROR: 202610240001_admission_tracking_developer_operations_and_answers.sql
-- ============================================================================

-- Treasure Academy admission tracking, manual OTP dispatch, developer capability
-- and verified-answer extensions. This migration remains dormant until its
-- independent environment gates are explicitly enabled.
begin;

alter type public.website_request_type add value if not exists 'information_update';

alter table public.admission_applications
  add column if not exists submission_source text,
  add column if not exists parent_verdict_message text,
  add column if not exists linked_at timestamptz,
  add column if not exists converted_by uuid references public.profiles(id) on delete set null;
-- Do not infer how a pre-migration application was submitted. New rows receive
-- the online self-service default; preserved rows carry an explicit unknown-history source.
update public.admission_applications set submission_source='legacy_preserved' where submission_source is null;
alter table public.admission_applications alter column submission_source set default 'online_self_service';
alter table public.admission_applications alter column submission_source set not null;

do $$ begin
  alter table public.admission_applications add constraint admission_submission_source_check
    check (submission_source in ('online_self_service','school_assisted','staff_recorded_request','claimed_former_application','legacy_preserved'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.admission_applications add constraint admission_parent_verdict_message_check
    check (parent_verdict_message is null or char_length(trim(parent_verdict_message)) between 2 and 1000);
exception when duplicate_object then null; end $$;

-- Existing converted rows remain preserved without an invented linked_at time.
-- The trigger records linked_at only for conversions that happen from this point.
create or replace function public.guard_admission_tracking_conversion()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((select auth.role()), '') = 'service_role' or session_user in ('postgres','supabase_admin') then
    -- Service-role preservation/import paths must supply historical metadata
    -- only when it is known; this trigger never invents it.
    return new;
  end if;
  if new.student_id is not null then
    if new.status <> 'admitted'::public.admission_status then
      raise exception 'Only an admitted application may be linked to a pupil' using errcode='23514';
    end if;
    if new.linked_at is null then new.linked_at := now(); end if;
    if new.converted_by is null then new.converted_by := (select auth.uid()); end if;
  elsif new.status = 'admitted'::public.admission_status then
    raise exception 'An admitted application requires an atomic pupil link' using errcode='23514';
  end if;
  if tg_op='UPDATE' and old.student_id is not null and (
    new.student_id is distinct from old.student_id or
    new.linked_at is distinct from old.linked_at or
    new.converted_by is distinct from old.converted_by
  ) then
    raise exception 'Admission conversion identity is immutable' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_admission_tracking_conversion() from public,anon,authenticated;
drop trigger if exists admission_tracking_conversion_guard on public.admission_applications;
create trigger admission_tracking_conversion_guard
before insert or update on public.admission_applications
for each row execute function public.guard_admission_tracking_conversion();

-- Explicit developer capability: an account is not a developer merely because
-- it is a school administrator. Provisioning is a separate owner-approved act.
create table if not exists public.developer_capabilities (
  profile_id uuid primary key references public.profiles(id) on delete cascade,
  console_access boolean not null default false,
  otp_dispatch boolean not null default false,
  information_review boolean not null default false,
  system_health_read boolean not null default true,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  reason text not null check (char_length(trim(reason)) between 2 and 500)
);

create table if not exists public.admission_tracking_challenges (
  id uuid primary key default gen_random_uuid(),
  account_id uuid references public.profiles(id) on delete cascade,
  request_token_hash text not null unique check (request_token_hash ~ '^[a-f0-9]{64}$'),
  phone_hash text not null check (phone_hash ~ '^[a-f0-9]{64}$'),
  phone_last4 text not null check (phone_last4 ~ '^[0-9]{4}$'),
  network_hash text not null check (network_hash ~ '^[a-f0-9]{64}$'),
  channel text not null check (channel in ('whatsapp','sms')),
  purpose text not null default 'admission_tracking' check (purpose='admission_tracking'),
  otp_hash text not null check (otp_hash ~ '^[a-f0-9]{64}$'),
  delivery_ciphertext text,
  delivery_iv text,
  delivery_tag text,
  status text not null default 'queued' check (status in ('queued','revealed','sent','verified','expired','cancelled','locked')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  requested_at timestamptz not null default now(),
  revealed_at timestamptz,
  revealed_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  expires_at timestamptz not null,
  cancelled_at timestamptz,
  check (expires_at > requested_at)
);
create index if not exists admission_tracking_challenges_phone_idx
  on public.admission_tracking_challenges(phone_hash, requested_at desc);
create index if not exists admission_tracking_challenges_network_idx
  on public.admission_tracking_challenges(network_hash, requested_at desc);
create index if not exists admission_tracking_challenges_queue_idx
  on public.admission_tracking_challenges(status, expires_at);
create unique index if not exists admission_tracking_one_active_phone_purpose_idx
  on public.admission_tracking_challenges(phone_hash,purpose)
  where status in ('queued','revealed','sent');

create table if not exists public.admission_tracking_continuations (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[a-f0-9]{64}$'),
  account_id uuid not null references public.profiles(id) on delete cascade,
  application_id uuid not null references public.admission_applications(id) on delete cascade,
  challenge_id uuid not null references public.admission_tracking_challenges(id) on delete cascade,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);
create index if not exists admission_tracking_continuations_account_idx
  on public.admission_tracking_continuations(account_id, created_at desc);

create table if not exists public.otp_dispatch_events (
  id bigint generated always as identity primary key,
  challenge_id uuid not null references public.admission_tracking_challenges(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('queued','revealed','copied','opened_channel','marked_sent','verified','failed','expired','cancelled','replaced')),
  channel text not null check (channel in ('whatsapp','sms')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (not (detail ?| array['otp','code','phone','message']))
);
create index if not exists otp_dispatch_events_challenge_idx
  on public.otp_dispatch_events(challenge_id, created_at desc);
do $$ begin
  alter table public.otp_dispatch_events add constraint otp_dispatch_events_code_free_detail_check
    check (detail::text !~* '"(otp|code|phone|message)"[[:space:]]*:');
exception when duplicate_object then null; end $$;

alter table public.developer_capabilities enable row level security;
alter table public.admission_tracking_challenges enable row level security;
alter table public.admission_tracking_continuations enable row level security;
alter table public.otp_dispatch_events enable row level security;

revoke all on table public.developer_capabilities, public.admission_tracking_challenges,
  public.admission_tracking_continuations, public.otp_dispatch_events from public,anon,authenticated;
revoke all on sequence public.otp_dispatch_events_id_seq from public,anon,authenticated;

-- Parent-safe status tracking never joins students or guardian links. Converted
-- applications are deliberately absent and continue only after portal login.
create or replace function public.server_active_admission_applications(p_account_id uuid)
returns table(
  application_reference text,
  child_name text,
  requested_class text,
  status text,
  parent_verdict_message text,
  parent_next_step text,
  admission_session_name text,
  submitted_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select a.application_reference,a.child_name,a.requested_class,a.status::text,
         a.parent_verdict_message,a.parent_next_step,a.admission_session_name,
         a.submitted_at,a.updated_at
    from public.admission_applications a
   where a.parent_id=p_account_id and a.student_id is null
   order by a.submitted_at desc
$$;
revoke all on function public.server_active_admission_applications(uuid) from public,anon,authenticated;
grant execute on function public.server_active_admission_applications(uuid) to service_role;

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
         a.status::text,null::text,a.decided_at,a.student_id,
         a.admission_session_name,a.parent_next_step,a.submitted_at,a.updated_at
    from public.admission_applications a
   where a.parent_id=(select auth.uid())
     and public.portal_session_is_current()
   order by a.submitted_at
$$;
revoke all on function public.parent_admission_applications() from public,anon;
grant execute on function public.parent_admission_applications() to authenticated;
comment on function public.parent_admission_applications() is 'Parent projection hides private administrator decision notes; approved parent-facing status uses dedicated fields and workflows.';

create or replace function public.developer_has_capability(p_profile_id uuid,p_capability text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.developer_capabilities d
    join public.profiles p on p.id=d.profile_id
    where d.profile_id=p_profile_id and d.console_access=true and d.revoked_at is null
      and p.active=true and p.account_status='active' and p.must_change_password=false
      and case p_capability
        when 'console' then true
        when 'otp_dispatch' then d.otp_dispatch
        when 'information_review' then d.information_review
        when 'system_health_read' then d.system_health_read
        else false end
  )
$$;
revoke all on function public.developer_has_capability(uuid,text) from public,anon,authenticated;
grant execute on function public.developer_has_capability(uuid,text) to service_role;

create or replace function public.server_reveal_otp_dispatch(p_challenge_id uuid,p_actor_id uuid)
returns table(delivery_ciphertext text,delivery_iv text,delivery_tag text,channel text)
language plpgsql
security definer
set search_path=''
as $$
declare v_row public.admission_tracking_challenges%rowtype;
begin
  if not public.developer_has_capability(p_actor_id,'otp_dispatch') then
    raise exception 'Developer OTP dispatch capability required' using errcode='42501';
  end if;
  select * into v_row from public.admission_tracking_challenges
   where id=p_challenge_id for update;
  if not found or v_row.status <> 'queued' or v_row.expires_at <= now()
     or v_row.delivery_ciphertext is null then
    raise exception 'Dispatch payload is no longer available' using errcode='P0002';
  end if;
  update public.admission_tracking_challenges
     set status='revealed',revealed_at=now(),revealed_by=p_actor_id,
         delivery_ciphertext=null,delivery_iv=null,delivery_tag=null
   where id=p_challenge_id;
  insert into public.otp_dispatch_events(challenge_id,actor_id,action,channel,detail)
  values(p_challenge_id,p_actor_id,'revealed',v_row.channel,'{}'::jsonb);
  return query select v_row.delivery_ciphertext,v_row.delivery_iv,v_row.delivery_tag,v_row.channel;
end;
$$;
revoke all on function public.server_reveal_otp_dispatch(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_reveal_otp_dispatch(uuid,uuid) to service_role;

create or replace function public.server_mark_otp_sent(p_challenge_id uuid,p_actor_id uuid,p_action text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_channel text;
begin
  if not public.developer_has_capability(p_actor_id,'otp_dispatch') then
    raise exception 'Developer OTP dispatch capability required' using errcode='42501';
  end if;
  if p_action not in ('copied','opened_channel','marked_sent') then
    raise exception 'Invalid dispatch action' using errcode='22023';
  end if;
  select channel into v_channel from public.admission_tracking_challenges
   where id=p_challenge_id and status='revealed' and expires_at>now() for update;
  if not found then return false; end if;
  if p_action='marked_sent' then
    update public.admission_tracking_challenges set status='sent',sent_at=now(),sent_by=p_actor_id
     where id=p_challenge_id and status='revealed' and expires_at>now();
    if not found then return false; end if;
  end if;
  insert into public.otp_dispatch_events(challenge_id,actor_id,action,channel,detail)
  values(p_challenge_id,p_actor_id,p_action,v_channel,'{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.server_mark_otp_sent(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.server_mark_otp_sent(uuid,uuid,text) to service_role;

create or replace function public.server_verify_admission_challenge(p_request_token_hash text,p_otp_hash text)
returns table(challenge_id uuid,account_id uuid)
language plpgsql
security definer
set search_path=''
as $$
declare v_row public.admission_tracking_challenges%rowtype;
begin
  select * into v_row from public.admission_tracking_challenges
   where request_token_hash=p_request_token_hash for update;
  if not found or v_row.status not in ('revealed','sent') then return; end if;
  if v_row.expires_at<=now() then
    update public.admission_tracking_challenges set status='expired',delivery_ciphertext=null,delivery_iv=null,delivery_tag=null
     where id=v_row.id;
    insert into public.otp_dispatch_events(challenge_id,action,channel,detail)
    values(v_row.id,'expired',v_row.channel,'{}'::jsonb);
    return;
  end if;
  if v_row.attempt_count>=5 then
    update public.admission_tracking_challenges set status='locked',delivery_ciphertext=null,delivery_iv=null,delivery_tag=null
     where id=v_row.id;
    return;
  end if;
  if v_row.otp_hash<>p_otp_hash then
    update public.admission_tracking_challenges set attempt_count=attempt_count+1,
      status=case when attempt_count+1>=5 then 'locked' else status end,
      delivery_ciphertext=case when attempt_count+1>=5 then null else delivery_ciphertext end,
      delivery_iv=case when attempt_count+1>=5 then null else delivery_iv end,
      delivery_tag=case when attempt_count+1>=5 then null else delivery_tag end
    where id=v_row.id;
    insert into public.otp_dispatch_events(challenge_id,action,channel,detail)
    values(v_row.id,'failed',v_row.channel,jsonb_build_object('reason','invalid_code'));
    return;
  end if;
  update public.admission_tracking_challenges
     set status='verified',verified_at=now(),delivery_ciphertext=null,delivery_iv=null,delivery_tag=null
   where id=v_row.id;
  insert into public.otp_dispatch_events(challenge_id,action,channel,detail)
  values(v_row.id,'verified',v_row.channel,'{}'::jsonb);
  return query select v_row.id,v_row.account_id;
end;
$$;
revoke all on function public.server_verify_admission_challenge(text,text) from public,anon,authenticated;
grant execute on function public.server_verify_admission_challenge(text,text) to service_role;

-- Expand the reviewed public-information registry without publishing invented
-- values. Confirmed static facts remain in source until an authorised account
-- creates a revision through the office workflow.
alter table public.verified_public_information
  drop constraint if exists verified_public_information_topic_check;
alter table public.verified_public_information
  add constraint verified_public_information_topic_check check (topic in (
    'school_hours','address','class_progression','admission_procedure','admissions',
    'class_availability','fees','calendar','exam_timetable','transport','uniform',
    'supplies','pta','events','public_policy','general_notice'
  ));
-- A topic has one authoritative published revision. Operators archive the old
-- immutable revision before publishing its reviewed replacement, so Search and
-- public pages cannot receive conflicting current answers.
create unique index if not exists verified_public_information_one_published_topic_idx
  on public.verified_public_information(topic)
  where status='published';

comment on table public.admission_tracking_challenges is 'Manual WhatsApp/SMS admission-tracking OTP queue. Raw delivery payload is encrypted by the server and destroyed after one reveal.';
comment on table public.developer_capabilities is 'Owner-approved developer access is independent from school administrator roles.';
comment on function public.server_active_admission_applications(uuid) is 'Returns unconverted applications only and never reads existing pupil or guardian tables.';

commit;

-- ============================================================================
-- BEGIN MIRROR: 202610240002_staff_continuity_accelerated_progression_and_account_claims.sql
-- ============================================================================

-- Treasure Academy staff continuity, exceptional progression and account claims
-- Date: 2026-10-24
--
-- Additive maintenance migration. It preserves all former rows and keeps every
-- new workflow fail-closed until its independent runtime gate is enabled.
-- It does not insert real people, create Auth identities or activate a feature.

begin;

-- A public-facing title is independent from database capability. The
-- Proprietress may therefore display the correct title while an explicitly
-- owner-approved account uses the existing full leadership authority scope.
alter table public.profiles
  add column if not exists position_title text;

do $$
begin
  alter table public.profiles add constraint profiles_position_title_length
    check (position_title is null or char_length(trim(position_title)) between 2 and 80);
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- Staff assignment history and recommendation/approval workflow
-- ---------------------------------------------------------------------------

alter table public.teacher_class_assignments
  add column if not exists assignment_kind text not null default 'subject_teacher',
  add column if not exists session_name text,
  add column if not exists started_on date,
  add column if not exists ended_on date,
  add column if not exists ended_reason text,
  add column if not exists replaces_assignment_id uuid references public.teacher_class_assignments(id) on delete set null,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists handover_note text;

update public.teacher_class_assignments
   set assignment_kind = case when subject = '*' then 'class_teacher' else 'subject_teacher' end
 where assignment_kind = 'subject_teacher' and subject = '*';

do $$
begin
  alter table public.teacher_class_assignments add constraint teacher_assignments_kind_check
    check (assignment_kind in ('class_teacher','subject_teacher','assistant_teacher'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.teacher_class_assignments add constraint teacher_assignments_session_length
    check (session_name is null or char_length(trim(session_name)) between 4 and 40);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.teacher_class_assignments add constraint teacher_assignments_date_order
    check (ended_on is null or started_on is null or ended_on >= started_on);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.teacher_class_assignments add constraint teacher_assignments_end_reason_length
    check (ended_reason is null or char_length(trim(ended_reason)) between 3 and 1000);
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.teacher_class_assignments add constraint teacher_assignments_handover_length
    check (handover_note is null or char_length(handover_note) <= 2000);
exception when duplicate_object then null;
end $$;

alter table public.teacher_class_assignments
  drop constraint if exists teacher_class_assignments_teacher_id_class_code_subject_key;
create unique index if not exists teacher_assignments_one_active_scope_idx
  on public.teacher_class_assignments(teacher_id,class_code,subject)
  where active = true;
create unique index if not exists teacher_assignments_one_active_class_teacher_idx
  on public.teacher_class_assignments(class_code)
  where active = true and assignment_kind = 'class_teacher' and subject = '*';

create table if not exists public.staff_assignment_changes (
  id uuid primary key default gen_random_uuid(),
  action text not null check (action in ('assign','move','replace','end')),
  current_assignment_id uuid references public.teacher_class_assignments(id) on delete restrict,
  current_teacher_id uuid references public.profiles(id) on delete restrict,
  target_teacher_id uuid references public.profiles(id) on delete restrict,
  target_class_code text,
  target_subject text,
  target_kind text check (target_kind is null or target_kind in ('class_teacher','subject_teacher','assistant_teacher')),
  session_name text,
  effective_on date not null default current_date,
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  handover_note text check (handover_note is null or char_length(handover_note) <= 2000),
  status text not null default 'recommended' check (status in ('recommended','applied','rejected','cancelled')),
  recommended_by uuid not null references public.profiles(id) on delete restrict,
  recommended_at timestamptz not null default now(),
  decided_by uuid references public.profiles(id) on delete restrict,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  applied_assignment_id uuid references public.teacher_class_assignments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (session_name is null or char_length(trim(session_name)) between 4 and 40),
  check (target_class_code is null or char_length(trim(target_class_code)) between 1 and 40),
  check (target_subject is null or char_length(trim(target_subject)) between 1 and 80)
);
create index if not exists staff_assignment_changes_status_idx
  on public.staff_assignment_changes(status,recommended_at desc);

create table if not exists public.staff_assignment_change_events (
  id bigint generated always as identity primary key,
  change_id uuid not null references public.staff_assignment_changes(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create or replace function public.recommend_staff_assignment_change(
  p_action text,
  p_current_assignment_id uuid default null,
  p_target_teacher_id uuid default null,
  p_target_class_code text default null,
  p_target_subject text default '*',
  p_target_kind text default 'class_teacher',
  p_session_name text default null,
  p_effective_on date default current_date,
  p_reason text default null,
  p_handover_note text default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role public.app_role;
  v_current public.teacher_class_assignments%rowtype;
  v_change uuid;
begin
  select p.role into v_role from public.profiles p
   where p.id=v_actor and p.active=true and p.account_status='active';
  if v_role not in ('teacher'::public.app_role,'admin'::public.app_role) then
    raise exception 'Active staff account required' using errcode='42501';
  end if;
  if p_action not in ('assign','move','replace','end') or char_length(trim(coalesce(p_reason,''))) < 3 then
    raise exception 'Valid action and recommendation reason required' using errcode='22023';
  end if;
  if p_effective_on < current_date then
    raise exception 'Effective date cannot be in the past' using errcode='22023';
  end if;
  if p_action in ('move','replace','end') then
    select * into v_current from public.teacher_class_assignments
     where id=p_current_assignment_id and active=true for update;
    if not found then raise exception 'Active source assignment required' using errcode='22023'; end if;
    if v_role='teacher'::public.app_role and v_current.teacher_id<>v_actor then
      raise exception 'Teachers may recommend only their own assignment change' using errcode='42501';
    end if;
  elsif v_role='teacher'::public.app_role then
    raise exception 'Administrator recommendation required for a new assignment' using errcode='42501';
  end if;
  if p_action in ('assign','move','replace') then
    if p_target_teacher_id is null or nullif(trim(coalesce(p_target_class_code,'')),'') is null
       or p_target_kind not in ('class_teacher','subject_teacher','assistant_teacher') then
      raise exception 'Target teacher, class and assignment kind required' using errcode='22023';
    end if;
    if not exists (select 1 from public.profiles p where p.id=p_target_teacher_id
      and p.active=true and p.account_status='active' and p.role in ('teacher'::public.app_role,'admin'::public.app_role)) then
      raise exception 'Active staff target required' using errcode='22023';
    end if;
    if p_action='move' and p_target_teacher_id<>v_current.teacher_id then
      raise exception 'A move keeps the same teacher; use replace for another teacher' using errcode='22023';
    end if;
    if p_action='replace' and p_target_teacher_id=v_current.teacher_id then
      raise exception 'Replacement teacher must be different' using errcode='22023';
    end if;
  end if;
  insert into public.staff_assignment_changes(
    action,current_assignment_id,current_teacher_id,target_teacher_id,target_class_code,
    target_subject,target_kind,session_name,effective_on,reason,handover_note,recommended_by
  ) values (
    p_action,p_current_assignment_id,case when v_current.id is null then null else v_current.teacher_id end,
    p_target_teacher_id,nullif(trim(p_target_class_code),''),coalesce(nullif(trim(p_target_subject),''),'*'),
    p_target_kind,nullif(trim(p_session_name),''),p_effective_on,trim(p_reason),nullif(trim(p_handover_note),''),v_actor
  ) returning id into v_change;
  insert into public.staff_assignment_change_events(change_id,actor_id,action,note)
  values(v_change,v_actor,'recommended',trim(p_reason));
  return v_change;
end;
$$;
revoke all on function public.recommend_staff_assignment_change(text,uuid,uuid,text,text,text,text,date,text,text) from public,anon;
grant execute on function public.recommend_staff_assignment_change(text,uuid,uuid,text,text,text,text,date,text,text) to authenticated;

create or replace function public.decide_staff_assignment_change(
  p_change_id uuid,
  p_decision text,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_change public.staff_assignment_changes%rowtype;
  v_new uuid;
begin
  if not public.is_headmistress() then
    raise exception 'Full leadership authority required' using errcode='42501';
  end if;
  select * into v_change from public.staff_assignment_changes
   where id=p_change_id and status='recommended' for update;
  if not found then raise exception 'Pending recommendation required' using errcode='22023'; end if;
  if v_change.recommended_by=v_actor then
    raise exception 'Independent recommendation and approval are required' using errcode='42501';
  end if;
  if p_decision not in ('approve','reject') then
    raise exception 'Approve or reject required' using errcode='22023';
  end if;
  if p_decision='reject' then
    update public.staff_assignment_changes set status='rejected',decided_by=v_actor,
      decided_at=now(),decision_note=nullif(trim(p_note),''),updated_at=now() where id=p_change_id;
    insert into public.staff_assignment_change_events(change_id,actor_id,action,note)
    values(p_change_id,v_actor,'rejected',nullif(trim(p_note),''));
    return jsonb_build_object('change_id',p_change_id,'status','rejected');
  end if;
  if v_change.effective_on>current_date then
    raise exception 'Return on the effective date to apply this approved change' using errcode='22023';
  end if;
  if v_change.action in ('move','replace','end') then
    update public.teacher_class_assignments set active=false,ended_on=v_change.effective_on,
      ended_reason=v_change.reason,handover_note=coalesce(v_change.handover_note,handover_note),updated_at=now()
     where id=v_change.current_assignment_id and active=true;
    if not found then raise exception 'Source assignment changed; prepare a new recommendation' using errcode='40001'; end if;
  end if;
  if v_change.action in ('assign','move','replace') then
    insert into public.teacher_class_assignments(
      teacher_id,class_code,subject,active,assignment_kind,session_name,started_on,
      replaces_assignment_id,approved_by,approved_at,handover_note
    ) values (
      v_change.target_teacher_id,v_change.target_class_code,coalesce(v_change.target_subject,'*'),true,
      v_change.target_kind,v_change.session_name,v_change.effective_on,v_change.current_assignment_id,
      v_actor,now(),v_change.handover_note
    ) returning id into v_new;
  end if;
  update public.staff_assignment_changes set status='applied',decided_by=v_actor,
    decided_at=now(),decision_note=nullif(trim(p_note),''),applied_assignment_id=v_new,updated_at=now()
   where id=p_change_id;
  insert into public.staff_assignment_change_events(change_id,actor_id,action,note)
  values(p_change_id,v_actor,'applied',nullif(trim(p_note),''));
  return jsonb_build_object('change_id',p_change_id,'status','applied','assignment_id',v_new);
end;
$$;
revoke all on function public.decide_staff_assignment_change(uuid,text,text) from public,anon;
grant execute on function public.decide_staff_assignment_change(uuid,text,text) to authenticated;

-- Direct assignment mutation is retired in favour of the audited workflow.
drop policy if exists assignments_insert on public.teacher_class_assignments;
drop policy if exists assignments_update on public.teacher_class_assignments;
drop policy if exists assignments_delete on public.teacher_class_assignments;
create policy assignments_insert on public.teacher_class_assignments for insert to authenticated with check (false);
create policy assignments_update on public.teacher_class_assignments for update to authenticated using (false) with check (false);
create policy assignments_delete on public.teacher_class_assignments for delete to authenticated using (false);

alter table public.staff_assignment_changes enable row level security;
alter table public.staff_assignment_change_events enable row level security;
revoke all on table public.staff_assignment_changes,public.staff_assignment_change_events from public,anon;
grant select on table public.staff_assignment_changes,public.staff_assignment_change_events to authenticated;
create policy staff_assignment_changes_select on public.staff_assignment_changes for select to authenticated
  using (public.is_admin() or recommended_by=(select auth.uid()) or current_teacher_id=(select auth.uid()) or target_teacher_id=(select auth.uid()));
create policy staff_assignment_events_select on public.staff_assignment_change_events for select to authenticated
  using (exists(select 1 from public.staff_assignment_changes c where c.id=change_id and
    (public.is_admin() or c.recommended_by=(select auth.uid()) or c.current_teacher_id=(select auth.uid()) or c.target_teacher_id=(select auth.uid()))));

-- ---------------------------------------------------------------------------
-- Exceptional pupil progression and Common Entrance candidacy
-- ---------------------------------------------------------------------------

alter table public.promotion_entries
  drop constraint if exists promotion_entries_proposed_outcome_check;
alter table public.promotion_entries
  add constraint promotion_entries_proposed_outcome_check check (proposed_outcome in (
    'promote','retain','graduate','withdraw','transfer_out','pending',
    'accelerated_promote','early_secondary_transition','accelerated_graduate'
  ));

alter table public.promotion_entries
  add column if not exists exceptional_status text not null default 'none',
  add column if not exists exceptional_outcome text,
  add column if not exists exceptional_target_class text references public.class_progression(class_code) on delete restrict,
  add column if not exists exceptional_reason text,
  add column if not exists recommended_by uuid references public.profiles(id) on delete set null,
  add column if not exists recommended_at timestamptz,
  add column if not exists approved_by uuid references public.profiles(id) on delete set null,
  add column if not exists approved_at timestamptz;

do $$
begin
  alter table public.promotion_entries add constraint promotion_entries_exceptional_status_check
    check (exceptional_status in ('none','recommended','approved','rejected','cancelled'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.promotion_entries add constraint promotion_entries_exceptional_outcome_check
    check (exceptional_outcome is null or exceptional_outcome in ('accelerated_promote','early_secondary_transition','accelerated_graduate'));
exception when duplicate_object then null;
end $$;
do $$
begin
  alter table public.promotion_entries add constraint promotion_entries_exceptional_reason_length
    check (exceptional_reason is null or char_length(trim(exceptional_reason)) between 3 and 1000);
exception when duplicate_object then null;
end $$;

alter table public.student_enrolments drop constraint if exists student_enrolments_status_check;
alter table public.student_enrolments add constraint student_enrolments_status_check check (status in (
  'active','completed','promoted','retained','graduated','withdrawn','transferred_out','corrected',
  'accelerated_promoted','early_secondary_transition','accelerated_graduated'
));
alter table public.student_enrolments drop constraint if exists student_enrolments_source_check;
alter table public.student_enrolments add constraint student_enrolments_source_check check (source in (
  'initial_baseline','office_entry','admission','promotion','accelerated_promotion','correction'
));

alter table public.graduates
  add column if not exists completion_type text not null default 'standard_primary6';
do $$
begin
  alter table public.graduates add constraint graduates_completion_type_check
    check (completion_type in ('standard_primary6','accelerated_secondary_transition'));
exception when duplicate_object then null;
end $$;

drop function if exists public.parent_graduates();
create function public.parent_graduates()
returns table(student_id uuid,graduation_session text,graduated_on date,completion_type text,public_status text)
language sql stable security definer set search_path='' as $$
  select g.student_id,g.graduation_session,g.graduated_on,g.completion_type,g.public_status
    from public.graduates g
   where public.parent_can_access_student(g.student_id)
   order by g.graduated_on desc
$$;
revoke all on function public.parent_graduates() from public,anon;
grant execute on function public.parent_graduates() to authenticated;

create table if not exists public.exceptional_progression_events (
  id bigint generated always as identity primary key,
  batch_id uuid not null,
  student_id uuid not null references public.students(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  outcome text,
  target_class text,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  foreign key(batch_id,student_id) references public.promotion_entries(batch_id,student_id) on delete cascade
);

create or replace function public.recommend_exceptional_progression(
  p_batch_id uuid,
  p_student_id uuid,
  p_outcome text,
  p_target_class text default null,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_role public.app_role;
  v_batch public.promotion_batches%rowtype;
  v_source_order integer;
  v_target_order integer;
  v_next text;
begin
  select p.role into v_role from public.profiles p where p.id=v_actor and p.active=true and p.account_status='active';
  if v_role not in ('teacher'::public.app_role,'admin'::public.app_role) then
    raise exception 'Active staff account required' using errcode='42501';
  end if;
  select * into v_batch from public.promotion_batches where id=p_batch_id and status='draft' for update;
  if not found then raise exception 'Draft promotion batch required' using errcode='22023'; end if;
  if not exists(select 1 from public.promotion_entries e where e.batch_id=p_batch_id and e.student_id=p_student_id) then
    raise exception 'Promotion entry not found' using errcode='P0002';
  end if;
  if v_role='teacher'::public.app_role and not exists(
    select 1 from public.teacher_class_assignments a where a.teacher_id=v_actor and a.class_code=v_batch.source_class and a.active=true
  ) then raise exception 'Active source-class assignment required' using errcode='42501'; end if;
  if p_outcome not in ('accelerated_promote','early_secondary_transition','accelerated_graduate')
     or char_length(trim(coalesce(p_reason,'')))<3 then
    raise exception 'Exceptional outcome and reason required' using errcode='22023';
  end if;
  if p_outcome='accelerated_promote' then
    select sort_order,next_class_code into v_source_order,v_next from public.class_progression where class_code=v_batch.source_class;
    select sort_order into v_target_order from public.class_progression where class_code=trim(p_target_class) and active_for_enrolment=true;
    if v_target_order is null or v_target_order<=v_source_order or trim(p_target_class)=coalesce(v_next,'') then
      raise exception 'Accelerated promotion must skip at least one configured active class' using errcode='22023';
    end if;
  elsif v_batch.source_class<>'Primary 4' then
    raise exception 'Early secondary transition is available only from Primary 4' using errcode='22023';
  end if;
  update public.promotion_entries set
    proposed_outcome='pending',target_class=null,exceptional_status='recommended',exceptional_outcome=p_outcome,
    exceptional_target_class=case when p_outcome='accelerated_promote' then trim(p_target_class) when p_outcome='accelerated_graduate' then 'Graduate Hall' else null end,
    exceptional_reason=trim(p_reason),recommended_by=v_actor,recommended_at=now(),approved_by=null,approved_at=null,
    updated_by=v_actor,updated_at=now()
   where batch_id=p_batch_id and student_id=p_student_id;
  insert into public.exceptional_progression_events(batch_id,student_id,actor_id,action,outcome,target_class,note)
  values(p_batch_id,p_student_id,v_actor,'recommended',p_outcome,nullif(trim(p_target_class),''),trim(p_reason));
end;
$$;
revoke all on function public.recommend_exceptional_progression(uuid,uuid,text,text,text) from public,anon;
grant execute on function public.recommend_exceptional_progression(uuid,uuid,text,text,text) to authenticated;

create or replace function public.teacher_exceptional_progression_entries()
returns table(batch_id uuid,student_id uuid,source_class text,source_session text,target_session text,proposed_outcome text,exceptional_status text)
language sql stable security definer set search_path='' as $$
  select e.batch_id,e.student_id,b.source_class,b.source_session,b.target_session,e.proposed_outcome,e.exceptional_status
    from public.promotion_entries e
    join public.promotion_batches b on b.id=e.batch_id and b.status='draft'
   where exists(select 1 from public.teacher_class_assignments a
     where a.teacher_id=(select auth.uid()) and a.class_code=b.source_class and a.active=true)
     and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.active=true
       and p.account_status='active' and p.must_change_password=false and p.role in ('teacher'::public.app_role,'admin'::public.app_role))
   order by b.prepared_at desc,e.student_id
$$;
revoke all on function public.teacher_exceptional_progression_entries() from public,anon;
grant execute on function public.teacher_exceptional_progression_entries() to authenticated;

create or replace function public.decide_exceptional_progression(
  p_batch_id uuid,
  p_student_id uuid,
  p_decision text,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_entry public.promotion_entries%rowtype;
begin
  if not public.is_headmistress() then raise exception 'Full leadership authority required' using errcode='42501'; end if;
  select * into v_entry from public.promotion_entries
   where batch_id=p_batch_id and student_id=p_student_id and exceptional_status='recommended' for update;
  if not found then raise exception 'Recommended exceptional decision required' using errcode='22023'; end if;
  if v_entry.recommended_by=v_actor then raise exception 'Independent recommendation and approval are required' using errcode='42501'; end if;
  if p_decision not in ('approve','reject') then raise exception 'Approve or reject required' using errcode='22023'; end if;
  if p_decision='approve' then
    update public.promotion_entries set exceptional_status='approved',proposed_outcome=exceptional_outcome,
      target_class=exceptional_target_class,approved_by=v_actor,approved_at=now(),updated_by=v_actor,updated_at=now()
     where batch_id=p_batch_id and student_id=p_student_id;
  else
    update public.promotion_entries set exceptional_status='rejected',proposed_outcome='pending',target_class=null,
      approved_by=v_actor,approved_at=now(),updated_by=v_actor,updated_at=now()
     where batch_id=p_batch_id and student_id=p_student_id;
  end if;
  insert into public.exceptional_progression_events(batch_id,student_id,actor_id,action,outcome,target_class,note)
  values(p_batch_id,p_student_id,v_actor,p_decision,v_entry.exceptional_outcome,v_entry.exceptional_target_class,nullif(trim(p_note),''));
end;
$$;
revoke all on function public.decide_exceptional_progression(uuid,uuid,text,text) from public,anon;
grant execute on function public.decide_exceptional_progression(uuid,uuid,text,text) to authenticated;

create table if not exists public.common_entrance_candidates (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete restrict,
  exam_session text not null check (char_length(trim(exam_session)) between 4 and 40),
  source_class text not null check (source_class in ('Primary 4','Primary 6')),
  status text not null default 'recommended' check (status in ('recommended','approved','sat','completed','cancelled')),
  reason text not null check (char_length(trim(reason)) between 3 and 1000),
  recommended_by uuid not null references public.profiles(id) on delete restrict,
  recommended_at timestamptz not null default now(),
  approved_by uuid references public.profiles(id) on delete restrict,
  approved_at timestamptz,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(student_id,exam_session)
);

create or replace function public.recommend_common_entrance_candidate(p_student_id uuid,p_exam_session text,p_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_role public.app_role; v_class text; v_id uuid;
begin
  select p.role into v_role from public.profiles p where p.id=v_actor and p.active=true and p.account_status='active';
  if v_role not in ('teacher'::public.app_role,'admin'::public.app_role) then raise exception 'Active staff required' using errcode='42501'; end if;
  select e.class_code into v_class from public.student_enrolments e where e.student_id=p_student_id and e.status='active' and e.ended_on is null;
  if v_class not in ('Primary 4','Primary 6') then raise exception 'Primary 4 or Primary 6 active pupil required' using errcode='22023'; end if;
  if v_role='teacher'::public.app_role and not exists(select 1 from public.teacher_class_assignments a where a.teacher_id=v_actor and a.class_code=v_class and a.active=true) then raise exception 'Active class assignment required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_exam_session,'')))<4 or char_length(trim(coalesce(p_reason,'')))<3 then raise exception 'Session and reason required' using errcode='22023'; end if;
  insert into public.common_entrance_candidates(student_id,exam_session,source_class,reason,recommended_by)
  values(p_student_id,trim(p_exam_session),v_class,trim(p_reason),v_actor) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.recommend_common_entrance_candidate(uuid,text,text) from public,anon;
grant execute on function public.recommend_common_entrance_candidate(uuid,text,text) to authenticated;

create or replace function public.decide_common_entrance_candidate(p_candidate_id uuid,p_decision text,p_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_actor uuid:=(select auth.uid()); v_row public.common_entrance_candidates%rowtype;
begin
  if not public.is_headmistress() then raise exception 'Full leadership authority required' using errcode='42501'; end if;
  select * into v_row from public.common_entrance_candidates where id=p_candidate_id and status='recommended' for update;
  if not found then raise exception 'Recommended candidate required' using errcode='22023'; end if;
  if v_row.recommended_by=v_actor then raise exception 'Independent recommendation and approval are required' using errcode='42501'; end if;
  if p_decision not in ('approve','cancel') then raise exception 'Approve or cancel required' using errcode='22023'; end if;
  update public.common_entrance_candidates set status=case when p_decision='approve' then 'approved' else 'cancelled' end,
    approved_by=v_actor,approved_at=now(),note=nullif(trim(p_note),''),updated_at=now() where id=p_candidate_id;
end $$;
revoke all on function public.decide_common_entrance_candidate(uuid,text,text) from public,anon;
grant execute on function public.decide_common_entrance_candidate(uuid,text,text) to authenticated;

create or replace function public.set_common_entrance_candidate_status(p_candidate_id uuid,p_status text,p_note text default null)
returns void language plpgsql security definer set search_path='' as $$
declare v_row public.common_entrance_candidates%rowtype;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  select * into v_row from public.common_entrance_candidates where id=p_candidate_id for update;
  if not found then raise exception 'Candidate not found' using errcode='P0002'; end if;
  if p_status not in ('sat','completed','cancelled') then raise exception 'Invalid candidate status' using errcode='22023'; end if;
  if (p_status='sat' and v_row.status<>'approved') or (p_status='completed' and v_row.status<>'sat')
     or (p_status='cancelled' and v_row.status not in ('approved','sat')) then
    raise exception 'Invalid Common Entrance status transition' using errcode='22023';
  end if;
  update public.common_entrance_candidates set status=p_status,note=coalesce(nullif(trim(p_note),''),note),updated_at=now()
   where id=p_candidate_id;
end $$;
revoke all on function public.set_common_entrance_candidate_status(uuid,text,text) from public,anon;
grant execute on function public.set_common_entrance_candidate_status(uuid,text,text) to authenticated;

alter table public.exceptional_progression_events enable row level security;
alter table public.common_entrance_candidates enable row level security;
revoke all on table public.exceptional_progression_events,public.common_entrance_candidates from public,anon;
grant select on table public.exceptional_progression_events,public.common_entrance_candidates to authenticated;
create policy exceptional_progression_events_select on public.exceptional_progression_events for select to authenticated using (public.is_admin());
create policy common_entrance_candidates_select on public.common_entrance_candidates for select to authenticated using (
  public.is_admin() or exists(select 1 from public.teacher_class_assignments a join public.students s on s.id=student_id where a.teacher_id=(select auth.uid()) and a.class_code=s.class_code and a.active=true)
);

-- Existing normal outcome editor now clears any unapproved exceptional proposal.
create or replace function public.set_promotion_outcome(
  p_batch_id uuid,p_student_id uuid,p_outcome text,p_note text default null
)
returns void language plpgsql security definer set search_path='' as $$
declare v_batch public.promotion_batches%rowtype; v_target text;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  select * into v_batch from public.promotion_batches where id=p_batch_id for update;
  if not found or v_batch.status<>'draft' then raise exception 'Draft promotion batch required' using errcode='22023'; end if;
  if p_outcome not in ('promote','retain','graduate','withdraw','transfer_out','pending') then raise exception 'Invalid normal promotion outcome' using errcode='22023'; end if;
  if p_outcome='graduate' and v_batch.source_class<>'Primary 6' then raise exception 'Only Primary 6 may use standard graduation' using errcode='22023'; end if;
  v_target:=case when p_outcome='promote' then public.next_school_class(v_batch.source_class) when p_outcome='retain' then v_batch.source_class when p_outcome='graduate' then 'Graduate Hall' else null end;
  update public.promotion_entries set proposed_outcome=p_outcome,target_class=v_target,note=nullif(trim(p_note),''),
    exceptional_status='none',exceptional_outcome=null,exceptional_target_class=null,exceptional_reason=null,
    recommended_by=null,recommended_at=null,approved_by=null,approved_at=null,updated_by=(select auth.uid()),updated_at=now()
   where batch_id=p_batch_id and student_id=p_student_id;
  if not found then raise exception 'Promotion entry not found' using errcode='P0002'; end if;
end $$;
revoke all on function public.set_promotion_outcome(uuid,uuid,text,text) from public,anon;
grant execute on function public.set_promotion_outcome(uuid,uuid,text,text) to authenticated;

create or replace function public.apply_promotion_batch(p_batch_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_batch public.promotion_batches%rowtype; v_entry record; v_count integer:=0; v_guardian record; v_completion text;
begin
  if not public.is_admin() then raise exception 'Administrator required' using errcode='42501'; end if;
  select * into v_batch from public.promotion_batches where id=p_batch_id for update;
  if not found or v_batch.status<>'draft' then raise exception 'Draft promotion batch required' using errcode='22023'; end if;
  if not exists(select 1 from public.promotion_entries e where e.batch_id=p_batch_id) then raise exception 'Promotion preview contains no eligible pupils' using errcode='22023'; end if;
  if exists(select 1 from public.promotion_entries e where e.batch_id=p_batch_id and e.proposed_outcome='pending') then raise exception 'Every pupil requires a promotion outcome before confirmation' using errcode='22023'; end if;
  if exists(select 1 from public.promotion_entries e where e.batch_id=p_batch_id and e.proposed_outcome in ('accelerated_promote','early_secondary_transition','accelerated_graduate') and (e.exceptional_status<>'approved' or e.approved_by is null)) then raise exception 'Exceptional progression requires full leadership approval' using errcode='42501'; end if;
  if exists(
    select 1 from public.promotion_entries e join public.students s on s.id=e.student_id
    left join public.student_enrolments h on h.student_id=e.student_id and h.ended_on is null and h.status='active'
    where e.batch_id=p_batch_id and (s.active<>true or s.class_code<>v_batch.source_class or h.id is null or h.session_name<>v_batch.source_session or h.class_code<>v_batch.source_class)
  ) then raise exception 'Pupil class or enrolment history changed after preview; prepare a new batch' using errcode='40001'; end if;
  for v_entry in select e.*,s.full_name from public.promotion_entries e join public.students s on s.id=e.student_id where e.batch_id=p_batch_id order by s.full_name for update of e,s loop
    update public.student_enrolments set status=case v_entry.proposed_outcome
      when 'promote' then 'promoted' when 'retain' then 'retained' when 'graduate' then 'graduated'
      when 'accelerated_promote' then 'accelerated_promoted' when 'early_secondary_transition' then 'early_secondary_transition'
      when 'accelerated_graduate' then 'accelerated_graduated' when 'withdraw' then 'withdrawn' else 'transferred_out' end,
      ended_on=current_date,updated_at=now() where student_id=v_entry.student_id and ended_on is null and status='active';
    if v_entry.proposed_outcome in ('promote','retain','accelerated_promote') then
      update public.students set class_code=v_entry.target_class,active=true,updated_at=now() where id=v_entry.student_id;
      insert into public.student_enrolments(student_id,session_name,class_code,source,recorded_by)
      values(v_entry.student_id,v_batch.target_session,v_entry.target_class,case when v_entry.proposed_outcome='accelerated_promote' then 'accelerated_promotion' else 'promotion' end,(select auth.uid()));
    elsif v_entry.proposed_outcome in ('graduate','accelerated_graduate') then
      v_completion:=case when v_entry.proposed_outcome='graduate' then 'standard_primary6' else 'accelerated_secondary_transition' end;
      update public.students set class_code='Graduate Hall',active=false,updated_at=now() where id=v_entry.student_id;
      insert into public.graduates(student_id,graduation_session,graduated_on,recorded_by,completion_type)
      values(v_entry.student_id,v_batch.target_session,current_date,(select auth.uid()),v_completion)
      on conflict(student_id) do update set graduation_session=excluded.graduation_session,graduated_on=excluded.graduated_on,
        recorded_by=excluded.recorded_by,completion_type=excluded.completion_type,updated_at=now();
    else
      update public.students set active=false,updated_at=now() where id=v_entry.student_id;
    end if;
    for v_guardian in select g.parent_id from public.student_guardians g where g.student_id=v_entry.student_id and g.active=true loop
      insert into public.portal_notifications(recipient_id,student_id,kind,title,message) values(
        v_guardian.parent_id,v_entry.student_id,
        case when v_entry.proposed_outcome in ('promote','accelerated_promote') then 'promotion' when v_entry.proposed_outcome='retain' then 'retention' when v_entry.proposed_outcome in ('graduate','accelerated_graduate') then 'graduation' else 'general' end,
        case v_entry.proposed_outcome when 'promote' then 'Class promotion confirmed' when 'accelerated_promote' then 'Accelerated class placement confirmed' when 'retain' then 'Class placement confirmed' when 'graduate' then 'Graduation confirmed' when 'accelerated_graduate' then 'Accelerated secondary transition confirmed' when 'early_secondary_transition' then 'Early secondary transition confirmed' else 'Pupil record updated' end,
        case v_entry.proposed_outcome when 'promote' then v_entry.full_name||' has moved to '||v_entry.target_class||' for '||v_batch.target_session||'.' when 'accelerated_promote' then v_entry.full_name||' has an approved accelerated move to '||v_entry.target_class||' for '||v_batch.target_session||'.' when 'retain' then v_entry.full_name||' remains in '||v_entry.target_class||' for '||v_batch.target_session||'.' when 'graduate' then v_entry.full_name||' is now listed privately in Your Graduates for '||v_batch.target_session||'.' when 'accelerated_graduate' then v_entry.full_name||' has an approved accelerated secondary transition recorded in private Graduate Hall.' when 'early_secondary_transition' then v_entry.full_name||' has completed an approved early transition to secondary school without a false Primary 6 enrolment.' when 'withdraw' then v_entry.full_name||' is no longer on the active class roster.' else v_entry.full_name||' has been recorded as transferred out.' end
      );
    end loop;
    v_count:=v_count+1;
  end loop;
  update public.promotion_batches set status='applied',applied_by=(select auth.uid()),applied_at=now() where id=p_batch_id;
  return jsonb_build_object('batch_id',p_batch_id,'applied_count',v_count);
end $$;
revoke all on function public.apply_promotion_batch(uuid) from public,anon;
grant execute on function public.apply_promotion_batch(uuid) to authenticated;

-- The owner-approved Proprietress has broad full-write authority, while the
-- school's narrower standing control still reserves reversal of an already
-- verified payment to the designated Headmistress.
create or replace function public.is_designated_headmistress()
returns boolean language sql stable security definer set search_path='' as $$
  select exists(
    select 1 from public.profiles p
     where p.id=(select auth.uid()) and p.role='admin'::public.app_role
       and p.leadership_scope='headmistress'::public.leadership_scope
       and p.active=true and p.account_status='active' and p.must_change_password=false
       and lower(coalesce(nullif(trim(p.position_title),''),'headmistress'))='headmistress'
  )
$$;
revoke all on function public.is_designated_headmistress() from public,anon;
grant execute on function public.is_designated_headmistress() to authenticated;

-- Preserve the existing payment workflow verbatim except for the designated-
-- Headmistress reversal check above.
create or replace function public.review_manual_payment(
  p_payment_id uuid,
  p_action text,
  p_note text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.manual_payments%rowtype;
  v_receipt text;
  v_total numeric(12,2);
begin
  if not public.is_admin() or char_length(trim(coalesce(p_note,''))) < 3 then
    raise exception 'Administrator and review note required' using errcode = '42501';
  end if;
  select * into v from public.manual_payments where id = p_payment_id for update;
  if not found then raise exception 'Payment not found' using errcode = 'P0002'; end if;
  if p_action = 'under_review' and v.status = 'submitted' then
    update public.manual_payments set status='under_review', reviewed_by=(select auth.uid()), reviewed_at=now(), review_note=trim(p_note), updated_at=now() where id=p_payment_id;
    insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type)
    values (p_payment_id, v.invoice_id, v.order_id, (select auth.uid()), 'payment_under_review');
    return null;
  elsif p_action = 'verify' and v.status in ('submitted','under_review') then
    update public.manual_payments set status='verified', reviewed_by=(select auth.uid()), reviewed_at=now(), review_note=trim(p_note), updated_at=now() where id=p_payment_id;
    v_receipt := public.finalize_verified_payment(p_payment_id, (select auth.uid()));
    return v_receipt;
  elsif p_action = 'reject' and v.status in ('submitted','under_review') then
    update public.manual_payments set status='rejected', reviewed_by=(select auth.uid()), reviewed_at=now(), review_note=trim(p_note), updated_at=now() where id=p_payment_id;
    if v.order_id is not null and not exists (select 1 from public.manual_payments m where m.order_id=v.order_id and m.id<>p_payment_id and m.status in ('submitted','under_review','verified')) then
      update public.shop_orders set status='awaiting_payment', updated_at=now() where id=v.order_id and status='payment_submitted';
    end if;
    insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type)
    values (p_payment_id, v.invoice_id, v.order_id, (select auth.uid()), 'payment_rejected');
    return null;
  elsif p_action = 'reverse' and v.status = 'verified' then
    if not public.is_designated_headmistress() then raise exception 'Only the Headmistress may reverse a verified payment' using errcode = '42501'; end if;
    update public.manual_payments set status='reversed', reversed_by=(select auth.uid()), reversed_at=now(), reversal_reason=trim(p_note), updated_at=now() where id=p_payment_id;
    update public.payment_receipts set reversed_at=now(), reversal_reason=trim(p_note) where payment_id=p_payment_id;
    if v.invoice_id is not null then
      select coalesce(sum(amount),0) into v_total from public.manual_payments where invoice_id=v.invoice_id and status='verified';
      update public.pupil_invoices set paid_amount=v_total,
        status=case when v_total=0 then 'issued' when v_total=total_amount then 'paid' else 'part_paid' end,
        updated_at=now() where id=v.invoice_id;
    else
      update public.shop_orders set status='payment_reversed', updated_at=now() where id=v.order_id;
    end if;
    insert into public.finance_events(payment_id, invoice_id, order_id, actor_id, event_type, detail)
    values (p_payment_id, v.invoice_id, v.order_id, (select auth.uid()), 'payment_reversed', jsonb_build_object('reason',trim(p_note)));
    return null;
  end if;
  raise exception 'Invalid payment transition' using errcode = '22023';
end;
$$;
revoke all on function public.review_manual_payment(uuid, text, text) from public, anon;
grant execute on function public.review_manual_payment(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Phone-verified first-password claims for owner-approved staff identities
-- ---------------------------------------------------------------------------

create table if not exists public.portal_account_claims (
  id uuid primary key default gen_random_uuid(),
  phone_e164 text not null unique check (phone_e164 ~ '^\+234[789][0-9]{9}$'),
  full_name text not null check (char_length(trim(full_name)) between 2 and 120),
  intended_role public.app_role not null,
  leadership_scope public.leadership_scope not null default 'none',
  position_title text check (position_title is null or char_length(trim(position_title)) between 2 and 80),
  class_code text,
  subject text not null default '*',
  developer_console boolean not null default false,
  developer_otp boolean not null default false,
  developer_information boolean not null default false,
  developer_health boolean not null default false,
  status text not null default 'pending' check (status in ('pending','claimed','cancelled','expired')),
  expires_at timestamptz not null,
  claimed_user_id uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  updated_at timestamptz not null default now(),
  check (class_code is null or char_length(trim(class_code)) between 1 and 40),
  check (char_length(trim(subject)) between 1 and 80)
);

create table if not exists public.portal_account_claim_challenges (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid references public.portal_account_claims(id) on delete cascade,
  request_token_hash text not null unique check (request_token_hash ~ '^[a-f0-9]{64}$'),
  phone_hash text not null check (phone_hash ~ '^[a-f0-9]{64}$'),
  phone_last4 text not null check (phone_last4 ~ '^[0-9]{4}$'),
  network_hash text not null check (network_hash ~ '^[a-f0-9]{64}$'),
  channel text not null check (channel in ('whatsapp','sms')),
  otp_hash text not null check (otp_hash ~ '^[a-f0-9]{64}$'),
  delivery_ciphertext text,
  delivery_iv text,
  delivery_tag text,
  setup_token_hash text check (setup_token_hash is null or setup_token_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'queued' check (status in ('queued','revealed','sent','verified','completed','expired','cancelled','locked')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 10),
  requested_at timestamptz not null default now(),
  revealed_at timestamptz,
  revealed_by uuid references public.profiles(id) on delete set null,
  sent_at timestamptz,
  sent_by uuid references public.profiles(id) on delete set null,
  verified_at timestamptz,
  completed_at timestamptz,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create index if not exists portal_claim_challenges_phone_rate_idx on public.portal_account_claim_challenges(phone_hash,requested_at desc);
create index if not exists portal_claim_challenges_network_rate_idx on public.portal_account_claim_challenges(network_hash,requested_at desc);
create unique index if not exists portal_claim_one_active_phone_idx
  on public.portal_account_claim_challenges(phone_hash) where status in ('queued','revealed','sent');
create unique index if not exists portal_claim_setup_token_unique_idx
  on public.portal_account_claim_challenges(setup_token_hash) where setup_token_hash is not null;
do $$ begin
  alter table public.portal_account_claim_challenges add constraint portal_claim_challenge_expiry_check
    check (expires_at>requested_at);
exception when duplicate_object then null; end $$;

create table if not exists public.portal_account_claim_events (
  id bigint generated always as identity primary key,
  challenge_id uuid not null references public.portal_account_claim_challenges(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in ('queued','revealed','copied','opened_channel','marked_sent','verified','failed','expired','cancelled','replaced','completed')),
  channel text not null check (channel in ('whatsapp','sms')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (not (detail ?| array['otp','code','phone','message'])),
  check (detail::text !~* '\"(otp|code|phone|message)\"[[:space:]]*:')
);

create or replace function public.server_reveal_portal_claim_otp(p_challenge_id uuid,p_actor_id uuid)
returns table(delivery_ciphertext text,delivery_iv text,delivery_tag text,channel text)
language plpgsql security definer set search_path='' as $$
declare v_ciphertext text; v_iv text; v_tag text; v_channel text;
begin
  if coalesce((select auth.role()),'')<>'service_role' or not public.developer_has_capability(p_actor_id,'otp_dispatch') then
    raise exception 'OTP dispatch capability required' using errcode='42501';
  end if;
  select c.delivery_ciphertext,c.delivery_iv,c.delivery_tag,c.channel
    into v_ciphertext,v_iv,v_tag,v_channel
    from public.portal_account_claim_challenges c
   where c.id=p_challenge_id and c.status='queued' and c.expires_at>now()
   for update;
  if not found or v_ciphertext is null then return; end if;
  update public.portal_account_claim_challenges c set status='revealed',revealed_at=now(),revealed_by=p_actor_id,
    delivery_ciphertext=null,delivery_iv=null,delivery_tag=null,updated_at=now()
   where c.id=p_challenge_id;
  insert into public.portal_account_claim_events(challenge_id,actor_id,action,channel)
  values(p_challenge_id,p_actor_id,'revealed',v_channel);
  return query select v_ciphertext,v_iv,v_tag,v_channel;
end $$;
revoke all on function public.server_reveal_portal_claim_otp(uuid,uuid) from public,anon,authenticated;
grant execute on function public.server_reveal_portal_claim_otp(uuid,uuid) to service_role;

create or replace function public.server_mark_portal_claim_otp(p_challenge_id uuid,p_actor_id uuid,p_action text)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_channel text;
begin
  if coalesce((select auth.role()),'')<>'service_role' or not public.developer_has_capability(p_actor_id,'otp_dispatch') then
    raise exception 'OTP dispatch capability required' using errcode='42501';
  end if;
  if p_action not in ('copied','opened_channel','marked_sent') then raise exception 'Invalid dispatch action' using errcode='22023'; end if;
  if p_action='marked_sent' then
    update public.portal_account_claim_challenges set status='sent',sent_at=now(),sent_by=p_actor_id,
      delivery_ciphertext=null,delivery_iv=null,delivery_tag=null,updated_at=now()
     where id=p_challenge_id and status='revealed' and expires_at>now() returning channel into v_channel;
  else
    select channel into v_channel from public.portal_account_claim_challenges where id=p_challenge_id and status='revealed' and expires_at>now();
  end if;
  if v_channel is null then return false; end if;
  insert into public.portal_account_claim_events(challenge_id,actor_id,action,channel) values(p_challenge_id,p_actor_id,p_action,v_channel);
  return true;
end $$;
revoke all on function public.server_mark_portal_claim_otp(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.server_mark_portal_claim_otp(uuid,uuid,text) to service_role;

create or replace function public.server_verify_portal_account_claim(
  p_request_token_hash text,p_otp_hash text,p_setup_token_hash text
)
returns table(challenge_id uuid,claim_id uuid)
language plpgsql security definer set search_path='' as $$
declare v_row public.portal_account_claim_challenges%rowtype;
begin
  if coalesce((select auth.role()),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into v_row from public.portal_account_claim_challenges
   where request_token_hash=p_request_token_hash for update;
  if not found or v_row.status not in ('revealed','sent') or v_row.expires_at<=now() or v_row.attempt_count>=5 then return; end if;
  if v_row.otp_hash<>p_otp_hash then
    update public.portal_account_claim_challenges set attempt_count=attempt_count+1,
      status=case when attempt_count+1>=5 then 'locked' else status end,
      delivery_ciphertext=case when attempt_count+1>=5 then null else delivery_ciphertext end,
      delivery_iv=case when attempt_count+1>=5 then null else delivery_iv end,
      delivery_tag=case when attempt_count+1>=5 then null else delivery_tag end,updated_at=now() where id=v_row.id;
    insert into public.portal_account_claim_events(challenge_id,action,channel,detail)
    values(v_row.id,'failed',v_row.channel,jsonb_build_object('reason','invalid_attempt'));
    return;
  end if;
  update public.portal_account_claim_challenges set status='verified',verified_at=now(),
    setup_token_hash=p_setup_token_hash,delivery_ciphertext=null,delivery_iv=null,delivery_tag=null,updated_at=now()
   where id=v_row.id;
  insert into public.portal_account_claim_events(challenge_id,action,channel) values(v_row.id,'verified',v_row.channel);
  return query select v_row.id,v_row.claim_id;
end $$;
revoke all on function public.server_verify_portal_account_claim(text,text,text) from public,anon,authenticated;
grant execute on function public.server_verify_portal_account_claim(text,text,text) to service_role;

create or replace function public.server_complete_portal_account_claim(p_claim_id uuid,p_user_id uuid,p_setup_token_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_claim public.portal_account_claims%rowtype; v_challenge public.portal_account_claim_challenges%rowtype;
begin
  if coalesce((select auth.role()),'')<>'service_role' then raise exception 'Service role required' using errcode='42501'; end if;
  select * into v_challenge from public.portal_account_claim_challenges
   where claim_id=p_claim_id and setup_token_hash=p_setup_token_hash and status='verified'
     and verified_at>now()-interval '10 minutes' for update;
  if not found then raise exception 'Verified account setup required' using errcode='42501'; end if;
  select * into v_claim from public.portal_account_claims where id=p_claim_id and status='pending' and expires_at>now() for update;
  if not found then raise exception 'Active account claim required' using errcode='22023'; end if;
  update public.profiles set role=v_claim.intended_role,full_name=v_claim.full_name,phone=v_claim.phone_e164,
    phone_e164=v_claim.phone_e164,leadership_scope=v_claim.leadership_scope,position_title=v_claim.position_title,
    active=true,account_status='active',must_change_password=false,phone_verified_at=now(),last_password_change_at=now(),updated_at=now()
   where id=p_user_id;
  if not found then raise exception 'Auth profile trigger did not create a profile' using errcode='P0002'; end if;
  if v_claim.class_code is not null then
    insert into public.teacher_class_assignments(teacher_id,class_code,subject,active,assignment_kind,started_on,approved_at)
    values(p_user_id,v_claim.class_code,v_claim.subject,true,case when v_claim.subject='*' then 'class_teacher' else 'subject_teacher' end,current_date,now());
  end if;
  if v_claim.developer_console then
    insert into public.developer_capabilities(profile_id,console_access,otp_dispatch,information_review,system_health_read,reason)
    values(p_user_id,true,v_claim.developer_otp,v_claim.developer_information,v_claim.developer_health,'Owner-approved account claim')
    on conflict(profile_id) do update set console_access=true,otp_dispatch=excluded.otp_dispatch,
      information_review=excluded.information_review,system_health_read=excluded.system_health_read,
      revoked_at=null,reason=excluded.reason,granted_at=now();
  end if;
  update public.portal_account_claims set status='claimed',claimed_user_id=p_user_id,claimed_at=now(),updated_at=now() where id=p_claim_id;
  update public.portal_account_claim_challenges set status='completed',completed_at=now(),setup_token_hash=null,updated_at=now() where id=v_challenge.id;
  insert into public.portal_account_claim_events(challenge_id,action,channel) values(v_challenge.id,'completed',v_challenge.channel);
  insert into public.account_audit_log(target_profile_id,action,reason_code,detail)
  values(p_user_id,'account_provisioned','owner_approved_claim',jsonb_build_object('claim_id',p_claim_id,'position_title',v_claim.position_title));
  return jsonb_build_object('user_id',p_user_id,'role',v_claim.intended_role,'leadership_scope',v_claim.leadership_scope,'position_title',v_claim.position_title);
end $$;
revoke all on function public.server_complete_portal_account_claim(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.server_complete_portal_account_claim(uuid,uuid,text) to service_role;

alter table public.portal_account_claims enable row level security;
alter table public.portal_account_claim_challenges enable row level security;
alter table public.portal_account_claim_events enable row level security;
revoke all on table public.portal_account_claims,public.portal_account_claim_challenges,public.portal_account_claim_events from public,anon,authenticated;
grant all on table public.portal_account_claims,public.portal_account_claim_challenges,public.portal_account_claim_events to service_role;
grant all on sequence public.portal_account_claim_events_id_seq to service_role;

-- New tables use the shared timestamp trigger where client-visible updates occur.
drop trigger if exists staff_assignment_changes_touch on public.staff_assignment_changes;
create trigger staff_assignment_changes_touch before update on public.staff_assignment_changes
for each row execute function public.portal_touch_updated_at();
drop trigger if exists common_entrance_candidates_touch on public.common_entrance_candidates;
create trigger common_entrance_candidates_touch before update on public.common_entrance_candidates
for each row execute function public.portal_touch_updated_at();
drop trigger if exists portal_account_claims_touch on public.portal_account_claims;
create trigger portal_account_claims_touch before update on public.portal_account_claims
for each row execute function public.portal_touch_updated_at();
drop trigger if exists portal_account_claim_challenges_touch on public.portal_account_claim_challenges;
create trigger portal_account_claim_challenges_touch before update on public.portal_account_claim_challenges
for each row execute function public.portal_touch_updated_at();

comment on table public.staff_assignment_changes is 'Recommendation plus independent full-leadership approval for teacher assignment continuity and replacement.';
comment on table public.common_entrance_candidates is 'Common Entrance candidacy is independent from class placement; Primary 4 participation never fabricates Primary 6 history.';
comment on column public.graduates.completion_type is 'Distinguishes standard Primary 6 graduation from an owner-approved accelerated secondary transition.';
comment on table public.portal_account_claims is 'Service-only owner-approved identity claims; no password is stored and the account holder chooses the first password after phone verification.';
comment on table public.portal_account_claim_challenges is 'Service-only hash/encrypted OTP state for first-password account claims. Raw codes are never stored.';

commit;
