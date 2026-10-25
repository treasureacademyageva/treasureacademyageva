-- Treasure Academy one-time owner-authorised developer bootstrap.
--
-- This migration adds only dormant database controls. It does not create an
-- Auth user, issue an authorisation, set a password, activate an endpoint or
-- change any former record. A raw one-time authorisation is returned only by
-- the owner-only dashboard function and is never stored.
begin;

create table if not exists public.developer_bootstrap_authorisations (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.portal_account_claims(id) on delete restrict,
  purpose text not null check (purpose in ('initial_password','password_recovery')),
  authorisation_hash text unique check (authorisation_hash is null or authorisation_hash ~ '^[a-f0-9]{64}$'),
  status text not null default 'active'
    check (status in ('active','reserved','consumed','revoked','expired','locked')),
  attempt_count integer not null default 0 check (attempt_count between 0 and 5),
  issuance_source text not null default 'supabase_dashboard_owner_action'
    check (issuance_source = 'supabase_dashboard_owner_action'),
  owner_reason_code text not null
    check (owner_reason_code in ('owner_approved_developer_bootstrap','owner_approved_developer_recovery')),
  issued_by uuid references public.profiles(id) on delete set null,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  reserved_at timestamptz,
  consumed_by uuid references public.profiles(id) on delete set null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  check (expires_at > issued_at and expires_at <= issued_at + interval '30 minutes'),
  check (
    (status in ('active','reserved') and authorisation_hash is not null) or
    (status in ('consumed','revoked','expired','locked') and authorisation_hash is null)
  ),
  check ((status = 'reserved') = (reserved_at is not null)),
  check (
    (status = 'consumed' and consumed_at is not null and consumed_by is not null) or
    (status <> 'consumed' and consumed_at is null and consumed_by is null)
  ),
  check ((status = 'revoked') = (revoked_at is not null)),
  check (
    (purpose = 'initial_password' and owner_reason_code = 'owner_approved_developer_bootstrap') or
    (purpose = 'password_recovery' and owner_reason_code = 'owner_approved_developer_recovery')
  )
);

create unique index if not exists developer_bootstrap_one_live_purpose_idx
  on public.developer_bootstrap_authorisations(claim_id,purpose)
  where status in ('active','reserved');
create index if not exists developer_bootstrap_expiry_idx
  on public.developer_bootstrap_authorisations(status,expires_at);

create table if not exists public.developer_bootstrap_events (
  id bigint generated always as identity primary key,
  authorisation_id uuid not null references public.developer_bootstrap_authorisations(id) on delete restrict,
  claim_id uuid not null references public.portal_account_claims(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null check (action in (
    'issued','reserved','attempt_failed','locked','reservation_released',
    'owner_authorised_supabase_bootstrap','owner_authorised_password_recovery',
    'revoked','expired'
  )),
  reason_code text not null check (reason_code in (
    'owner_approved_developer_bootstrap','owner_approved_developer_recovery',
    'exact_claim_and_phone_match','phone_mismatch','attempt_limit',
    'auth_creation_failed','profile_completion_failed','stale_reservation',
    'owner_revoked','authorisation_expired','completed'
  )),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (not (detail ?| array[
    'password','secret','token','authorisation','authorization','otp','code',
    'phone','message','credential'
  ])),
  check (detail::text !~* '\"(password|secret|token|authori[sz]ation|otp|code|phone|message|credential)\"[[:space:]]*:')
);
create index if not exists developer_bootstrap_events_authorisation_idx
  on public.developer_bootstrap_events(authorisation_id,created_at desc);
create index if not exists developer_bootstrap_events_claim_idx
  on public.developer_bootstrap_events(claim_id,created_at desc);

alter table public.developer_bootstrap_authorisations enable row level security;
alter table public.developer_bootstrap_events enable row level security;

revoke all on table public.developer_bootstrap_authorisations,
  public.developer_bootstrap_events from public,anon,authenticated,service_role;
revoke all on sequence public.developer_bootstrap_events_id_seq
  from public,anon,authenticated,service_role;

-- A direct owner action in the official Supabase SQL dashboard returns a random
-- one-time value once and stores only its SHA-256 hash. The service role used by
-- deployed code is explicitly not allowed to mint this owner authority.
create or replace function public.owner_issue_developer_bootstrap(
  p_claim_id uuid,
  p_purpose text default 'initial_password',
  p_lifetime_minutes integer default 15
)
returns table(authorisation_id uuid,one_time_authorisation text,expires_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_claim public.portal_account_claims%rowtype;
  v_id uuid;
  v_raw text;
  v_hash text;
  v_expires timestamptz;
begin
  if session_user not in ('postgres','supabase_admin')
     or coalesce((select auth.role()),'')='service_role' then
    raise exception 'Official owner dashboard action required' using errcode='42501';
  end if;
  if p_purpose not in ('initial_password','password_recovery') then
    raise exception 'Invalid bootstrap purpose' using errcode='22023';
  end if;
  if p_lifetime_minutes not between 5 and 30 then
    raise exception 'Authorisation lifetime must be 5 to 30 minutes' using errcode='22023';
  end if;

  select * into v_claim
    from public.portal_account_claims
   where id=p_claim_id
   for update;
  if not found
     or v_claim.intended_role<>'parent'::public.app_role
     or v_claim.leadership_scope<>'none'::public.leadership_scope
     or v_claim.class_code is not null
     or v_claim.subject<>'*'
     or not v_claim.developer_console
     or not v_claim.developer_otp
     or not v_claim.developer_information
     or not v_claim.developer_health then
    raise exception 'Exact owner-approved developer claim required' using errcode='42501';
  end if;

  if p_purpose='initial_password' and (
    v_claim.status<>'pending' or v_claim.claimed_user_id is not null or v_claim.expires_at<=now()
  ) then
    raise exception 'Active pending developer claim required' using errcode='22023';
  end if;
  if p_purpose='password_recovery' and (
    v_claim.status<>'claimed' or v_claim.claimed_user_id is null or not exists(
      select 1 from public.developer_capabilities d
       where d.profile_id=v_claim.claimed_user_id
         and d.console_access and d.otp_dispatch and d.information_review and d.system_health_read
         and d.revoked_at is null
    )
  ) then
    raise exception 'Active claimed developer identity required' using errcode='22023';
  end if;

  update public.developer_bootstrap_authorisations a
     set status='expired',authorisation_hash=null,reserved_at=null,updated_at=now()
   where a.claim_id=p_claim_id and a.purpose=p_purpose
     and a.status in ('active','reserved') and a.expires_at<=now();
  insert into public.developer_bootstrap_events(authorisation_id,claim_id,action,reason_code)
  select a.id,a.claim_id,'expired','authorisation_expired'
    from public.developer_bootstrap_authorisations a
   where a.claim_id=p_claim_id and a.purpose=p_purpose and a.status='expired'
     and not exists(
       select 1 from public.developer_bootstrap_events e
        where e.authorisation_id=a.id and e.action='expired'
     );

  if exists(
    select 1 from public.developer_bootstrap_authorisations a
     where a.claim_id=p_claim_id and a.purpose=p_purpose and a.status in ('active','reserved')
  ) then
    raise exception 'A live authorisation already exists for this purpose' using errcode='23505';
  end if;

  v_raw := replace(replace(rtrim(encode(public.gen_random_bytes(32),'base64'),'='),'+','-'),'/','_');
  v_hash := encode(public.digest(convert_to(v_raw,'UTF8'),'sha256'),'hex');
  v_expires := now()+make_interval(mins=>p_lifetime_minutes);

  insert into public.developer_bootstrap_authorisations(
    claim_id,purpose,authorisation_hash,owner_reason_code,expires_at
  ) values (
    p_claim_id,p_purpose,v_hash,
    case when p_purpose='initial_password'
      then 'owner_approved_developer_bootstrap'
      else 'owner_approved_developer_recovery' end,
    v_expires
  ) returning id into v_id;

  insert into public.developer_bootstrap_events(
    authorisation_id,claim_id,action,reason_code,detail
  ) values (
    v_id,p_claim_id,'issued',
    case when p_purpose='initial_password'
      then 'owner_approved_developer_bootstrap'
      else 'owner_approved_developer_recovery' end,
    jsonb_build_object('purpose',p_purpose,'lifetime_minutes',p_lifetime_minutes)
  );

  return query select v_id,v_raw,v_expires;
end;
$$;
revoke all on function public.owner_issue_developer_bootstrap(uuid,text,integer)
  from public,anon,authenticated,service_role;

create or replace function public.owner_revoke_developer_bootstrap(p_authorisation_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_claim_id uuid;
begin
  if session_user not in ('postgres','supabase_admin')
     or coalesce((select auth.role()),'')='service_role' then
    raise exception 'Official owner dashboard action required' using errcode='42501';
  end if;
  update public.developer_bootstrap_authorisations
     set status='revoked',authorisation_hash=null,reserved_at=null,revoked_at=now(),updated_at=now()
   where id=p_authorisation_id and status in ('active','reserved')
   returning claim_id into v_claim_id;
  if v_claim_id is null then return false; end if;
  insert into public.developer_bootstrap_events(authorisation_id,claim_id,action,reason_code)
  values(p_authorisation_id,v_claim_id,'revoked','owner_revoked');
  return true;
end;
$$;
revoke all on function public.owner_revoke_developer_bootstrap(uuid)
  from public,anon,authenticated,service_role;

-- The trusted endpoint hashes the submitted one-time value before this call.
-- Reservation serializes concurrent requests before Auth Admin creates or
-- updates a user. The phone is compared only with the exact owner-approved
-- claim and is never copied to bootstrap audit detail.
create or replace function public.server_reserve_developer_bootstrap(
  p_authorisation_hash text,
  p_phone_e164 text
)
returns table(
  authorisation_id uuid,
  claim_id uuid,
  purpose text,
  full_name text,
  position_title text,
  existing_user_id uuid,
  developer_console boolean,
  developer_otp boolean,
  developer_information boolean,
  developer_health boolean
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_authorisation public.developer_bootstrap_authorisations%rowtype;
  v_claim public.portal_account_claims%rowtype;
  v_attempts integer;
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_authorisation_hash !~ '^[a-f0-9]{64}$'
     or p_phone_e164 !~ '^\+234[789][0-9]{9}$' then
    return;
  end if;

  select * into v_authorisation
    from public.developer_bootstrap_authorisations
   where authorisation_hash=p_authorisation_hash
   for update;
  if not found then return; end if;

  if v_authorisation.status='reserved'
     and v_authorisation.reserved_at<=now()-interval '5 minutes' then
    update public.developer_bootstrap_authorisations
       set status='active',reserved_at=null,updated_at=now()
     where id=v_authorisation.id;
    insert into public.developer_bootstrap_events(authorisation_id,claim_id,action,reason_code)
    values(v_authorisation.id,v_authorisation.claim_id,'reservation_released','stale_reservation');
    v_authorisation.status := 'active';
    v_authorisation.reserved_at := null;
  end if;

  if v_authorisation.status<>'active' then return; end if;
  if v_authorisation.expires_at<=now() then
    update public.developer_bootstrap_authorisations
       set status='expired',authorisation_hash=null,reserved_at=null,updated_at=now()
     where id=v_authorisation.id;
    insert into public.developer_bootstrap_events(authorisation_id,claim_id,action,reason_code)
    values(v_authorisation.id,v_authorisation.claim_id,'expired','authorisation_expired');
    return;
  end if;

  select * into v_claim
    from public.portal_account_claims
   where id=v_authorisation.claim_id
   for update;
  if not found or v_claim.phone_e164<>p_phone_e164 then
    v_attempts := least(v_authorisation.attempt_count+1,5);
    update public.developer_bootstrap_authorisations
       set attempt_count=v_attempts,
           status=case when v_attempts>=5 then 'locked' else 'active' end,
           authorisation_hash=case when v_attempts>=5 then null else authorisation_hash end,
           updated_at=now()
     where id=v_authorisation.id;
    insert into public.developer_bootstrap_events(authorisation_id,claim_id,action,reason_code,detail)
    values(
      v_authorisation.id,v_authorisation.claim_id,
      case when v_attempts>=5 then 'locked' else 'attempt_failed' end,
      case when v_attempts>=5 then 'attempt_limit' else 'phone_mismatch' end,
      jsonb_build_object('attempt_count',v_attempts)
    );
    return;
  end if;

  if v_claim.intended_role<>'parent'::public.app_role
     or v_claim.leadership_scope<>'none'::public.leadership_scope
     or v_claim.class_code is not null
     or v_claim.subject<>'*'
     or not v_claim.developer_console
     or not v_claim.developer_otp
     or not v_claim.developer_information
     or not v_claim.developer_health then
    return;
  end if;
  if v_authorisation.purpose='initial_password' and (
    v_claim.status<>'pending' or v_claim.claimed_user_id is not null or v_claim.expires_at<=now()
  ) then return; end if;
  if v_authorisation.purpose='password_recovery' and (
    v_claim.status<>'claimed' or v_claim.claimed_user_id is null or not exists(
      select 1 from public.developer_capabilities d
       where d.profile_id=v_claim.claimed_user_id
         and d.console_access and d.otp_dispatch and d.information_review and d.system_health_read
         and d.revoked_at is null
    )
  ) then return; end if;

  update public.developer_bootstrap_authorisations
     set status='reserved',reserved_at=now(),updated_at=now()
   where id=v_authorisation.id;
  insert into public.developer_bootstrap_events(authorisation_id,claim_id,action,reason_code,detail)
  values(
    v_authorisation.id,v_claim.id,'reserved','exact_claim_and_phone_match',
    jsonb_build_object('purpose',v_authorisation.purpose)
  );

  return query select
    v_authorisation.id,v_claim.id,v_authorisation.purpose,v_claim.full_name,
    v_claim.position_title,v_claim.claimed_user_id,
    v_claim.developer_console,v_claim.developer_otp,
    v_claim.developer_information,v_claim.developer_health;
end;
$$;
revoke all on function public.server_reserve_developer_bootstrap(text,text)
  from public,anon,authenticated;
grant execute on function public.server_reserve_developer_bootstrap(text,text)
  to service_role;

create or replace function public.server_release_developer_bootstrap(
  p_authorisation_id uuid,
  p_authorisation_hash text,
  p_reason_code text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_claim_id uuid;
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_reason_code not in ('auth_creation_failed','profile_completion_failed') then
    raise exception 'Invalid release reason' using errcode='22023';
  end if;
  update public.developer_bootstrap_authorisations
     set status='active',reserved_at=null,updated_at=now()
   where id=p_authorisation_id and authorisation_hash=p_authorisation_hash
     and status='reserved' and expires_at>now()
   returning claim_id into v_claim_id;
  if v_claim_id is null then return false; end if;
  insert into public.developer_bootstrap_events(authorisation_id,claim_id,action,reason_code)
  values(p_authorisation_id,v_claim_id,'reservation_released',p_reason_code);
  return true;
end;
$$;
revoke all on function public.server_release_developer_bootstrap(uuid,text,text)
  from public,anon,authenticated;
grant execute on function public.server_release_developer_bootstrap(uuid,text,text)
  to service_role;

create or replace function public.server_complete_developer_bootstrap(
  p_authorisation_id uuid,
  p_claim_id uuid,
  p_user_id uuid,
  p_authorisation_hash text
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_authorisation public.developer_bootstrap_authorisations%rowtype;
  v_claim public.portal_account_claims%rowtype;
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select * into v_authorisation
    from public.developer_bootstrap_authorisations
   where id=p_authorisation_id and claim_id=p_claim_id
     and authorisation_hash=p_authorisation_hash
     and purpose='initial_password' and status='reserved'
     and reserved_at>now()-interval '5 minutes' and expires_at>now()
   for update;
  if not found then
    raise exception 'Reserved bootstrap authorisation required' using errcode='42501';
  end if;
  select * into v_claim
    from public.portal_account_claims
   where id=p_claim_id and status='pending' and claimed_user_id is null and expires_at>now()
     and intended_role='parent'::public.app_role
     and leadership_scope='none'::public.leadership_scope
     and class_code is null and subject='*'
     and developer_console and developer_otp and developer_information and developer_health
   for update;
  if not found then
    raise exception 'Exact pending developer claim required' using errcode='22023';
  end if;

  update public.profiles
     set role='parent'::public.app_role,
         full_name=v_claim.full_name,
         phone=v_claim.phone_e164,
         phone_e164=v_claim.phone_e164,
         leadership_scope='none'::public.leadership_scope,
         position_title=v_claim.position_title,
         active=true,
         account_status='active'::public.portal_account_status,
         must_change_password=false,
         phone_verified_by=null,
         phone_verified_at=null,
         last_password_change_at=now(),
         updated_at=now()
   where id=p_user_id;
  if not found then
    raise exception 'Auth profile trigger did not create a profile' using errcode='P0002';
  end if;

  insert into public.developer_capabilities(
    profile_id,console_access,otp_dispatch,information_review,system_health_read,
    granted_by,reason
  ) values (
    p_user_id,v_claim.developer_console,v_claim.developer_otp,
    v_claim.developer_information,v_claim.developer_health,null,
    'Owner-authorised Supabase bootstrap'
  )
  on conflict(profile_id) do update set
    console_access=excluded.console_access,
    otp_dispatch=excluded.otp_dispatch,
    information_review=excluded.information_review,
    system_health_read=excluded.system_health_read,
    granted_by=null,granted_at=now(),revoked_at=null,reason=excluded.reason;

  update public.portal_account_claims
     set status='claimed',claimed_user_id=p_user_id,claimed_at=now(),updated_at=now()
   where id=p_claim_id;
  update public.developer_bootstrap_authorisations
     set status='consumed',authorisation_hash=null,reserved_at=null,
         consumed_by=p_user_id,consumed_at=now(),updated_at=now()
   where id=p_authorisation_id;
  insert into public.developer_bootstrap_events(
    authorisation_id,claim_id,actor_id,action,reason_code,detail
  ) values (
    p_authorisation_id,p_claim_id,p_user_id,
    'owner_authorised_supabase_bootstrap','completed',
    jsonb_build_object('capability_set','developer_console_dispatch_information_health')
  );
  insert into public.account_audit_log(
    target_profile_id,action,reason_code,detail
  ) values (
    p_user_id,'account_provisioned','owner_authorised_supabase_bootstrap',
    jsonb_build_object('claim_id',p_claim_id,'bootstrap_id',p_authorisation_id)
  );

  return jsonb_build_object(
    'user_id',p_user_id,
    'role','parent',
    'leadership_scope','none',
    'developer_console',true
  );
end;
$$;
revoke all on function public.server_complete_developer_bootstrap(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.server_complete_developer_bootstrap(uuid,uuid,uuid,text)
  to service_role;

create or replace function public.server_complete_developer_password_recovery(
  p_authorisation_id uuid,
  p_claim_id uuid,
  p_user_id uuid,
  p_authorisation_hash text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_authorisation public.developer_bootstrap_authorisations%rowtype;
  v_claim public.portal_account_claims%rowtype;
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  select * into v_authorisation
    from public.developer_bootstrap_authorisations
   where id=p_authorisation_id and claim_id=p_claim_id
     and authorisation_hash=p_authorisation_hash
     and purpose='password_recovery' and status='reserved'
     and reserved_at>now()-interval '5 minutes' and expires_at>now()
   for update;
  if not found then
    raise exception 'Reserved recovery authorisation required' using errcode='42501';
  end if;
  select * into v_claim
    from public.portal_account_claims
   where id=p_claim_id and status='claimed' and claimed_user_id=p_user_id
   for update;
  if not found or not exists(
    select 1 from public.developer_capabilities d
     where d.profile_id=p_user_id
       and d.console_access and d.otp_dispatch and d.information_review and d.system_health_read
       and d.revoked_at is null
  ) then
    raise exception 'Active claimed developer identity required' using errcode='22023';
  end if;

  update public.profiles
     set must_change_password=false,last_password_change_at=now(),updated_at=now()
   where id=p_user_id and account_status='active'::public.portal_account_status and active=true;
  if not found then
    raise exception 'Active developer profile required' using errcode='22023';
  end if;
  update public.developer_bootstrap_authorisations
     set status='consumed',authorisation_hash=null,reserved_at=null,
         consumed_by=p_user_id,consumed_at=now(),updated_at=now()
   where id=p_authorisation_id;
  insert into public.developer_bootstrap_events(
    authorisation_id,claim_id,actor_id,action,reason_code
  ) values (
    p_authorisation_id,p_claim_id,p_user_id,
    'owner_authorised_password_recovery','completed'
  );
  insert into public.account_audit_log(
    target_profile_id,action,reason_code,detail
  ) values (
    p_user_id,'password_changed','owner_authorised_developer_recovery',
    jsonb_build_object('claim_id',p_claim_id,'bootstrap_id',p_authorisation_id)
  );
  return true;
end;
$$;
revoke all on function public.server_complete_developer_password_recovery(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.server_complete_developer_password_recovery(uuid,uuid,uuid,text)
  to service_role;

-- Shared timestamp trigger is safe because direct table writes remain revoked.
drop trigger if exists developer_bootstrap_authorisations_touch
  on public.developer_bootstrap_authorisations;
create trigger developer_bootstrap_authorisations_touch
before update on public.developer_bootstrap_authorisations
for each row execute function public.portal_touch_updated_at();

comment on table public.developer_bootstrap_authorisations is
  'Owner-dashboard-issued, short-lived, one-use hash state for the developer first password or recovery. No readable authorisation or password is stored.';
comment on table public.developer_bootstrap_events is
  'Code-free audit for owner-authorised developer bootstrap and recovery; details reject password, token, OTP, phone and credential keys recursively.';
comment on function public.owner_issue_developer_bootstrap(uuid,text,integer) is
  'Owner-only Supabase dashboard action that returns a random authorisation once and stores only its hash. Never call through deployed service-role code.';
comment on function public.server_complete_developer_bootstrap(uuid,uuid,uuid,text) is
  'Consumes a reserved owner authorisation, activates only the approved independent developer capability set and records no false phone verification.';

commit;
