-- SAFE ENTRY POINT — Treasure Academy secure portal schema
--
-- This file mirrors both versioned secure migrations in order:
--   supabase/migrations/202610230001_secure_school_portal.sql
--   supabase/migrations/202610230002_portal_accounts.sql
-- It does NOT alter the former school_data table. Inventory and preserve the
-- existing Supabase portal first; retirement is a separate manual cut-over.
-- Keep this mirror aligned when changing either migration.

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
  and session_user not in ('postgres', 'supabase_admin', 'supabase_auth_admin', 'authenticator') then
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
  or public.parent_can_access_student(id)
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
