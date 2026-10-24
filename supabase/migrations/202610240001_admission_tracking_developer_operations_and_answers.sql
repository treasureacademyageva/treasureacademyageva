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
