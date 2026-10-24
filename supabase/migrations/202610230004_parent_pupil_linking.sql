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
