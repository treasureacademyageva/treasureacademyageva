-- Run 3: privacy-minimised persistent HTTP rate limits and recovery session revocation.
-- Additive and dormant until the separately gated trusted endpoint is enabled.

create table if not exists public.developer_bootstrap_http_limits (
  scope text not null check(scope in ('network','phone')),
  subject_hash text not null check(subject_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null default now(),
  attempt_count smallint not null default 0 check(attempt_count between 0 and 10),
  blocked_until timestamptz,
  last_attempt_at timestamptz not null default now(),
  primary key(scope,subject_hash)
);
create index if not exists developer_bootstrap_http_limits_cleanup_idx
  on public.developer_bootstrap_http_limits(last_attempt_at);
alter table public.developer_bootstrap_http_limits enable row level security;
revoke all on table public.developer_bootstrap_http_limits
  from public,anon,authenticated,service_role;
comment on table public.developer_bootstrap_http_limits is
  'Rotating HMAC-only network/phone request buckets for the temporary developer bootstrap endpoint; no raw network address or phone is stored.';

create or replace function public.server_take_developer_bootstrap_rate_limit(
  p_scope text,
  p_subject_hash text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_row public.developer_bootstrap_http_limits%rowtype;
  v_limit smallint;
begin
  if coalesce((select auth.role()),'')<>'service_role' then
    raise exception 'Service role required' using errcode='42501';
  end if;
  if p_scope is null or p_scope not in ('network','phone')
     or p_subject_hash is null or p_subject_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid rate-limit subject' using errcode='22023';
  end if;
  v_limit := case when p_scope='network' then 10 else 5 end;

  -- Daily-rotating HMAC subjects make old rows unlinkable. Keep at most two
  -- days of short-lived buckets even if a gate is accidentally left enabled.
  delete from public.developer_bootstrap_http_limits
   where last_attempt_at < now()-interval '2 days';
  insert into public.developer_bootstrap_http_limits(
    scope,subject_hash,attempt_count,window_started_at,last_attempt_at
  ) values (p_scope,p_subject_hash,0,now(),now())
  on conflict(scope,subject_hash) do nothing;

  select * into v_row
    from public.developer_bootstrap_http_limits
   where scope=p_scope and subject_hash=p_subject_hash
   for update;
  if v_row.blocked_until is not null and v_row.blocked_until>now() then
    update public.developer_bootstrap_http_limits
       set last_attempt_at=now()
     where scope=p_scope and subject_hash=p_subject_hash;
    return false;
  end if;
  if v_row.window_started_at<=now()-interval '15 minutes' then
    update public.developer_bootstrap_http_limits
       set window_started_at=now(),attempt_count=1,blocked_until=null,last_attempt_at=now()
     where scope=p_scope and subject_hash=p_subject_hash;
    return true;
  end if;
  if v_row.attempt_count>=v_limit then
    update public.developer_bootstrap_http_limits
       set blocked_until=now()+interval '15 minutes',last_attempt_at=now()
     where scope=p_scope and subject_hash=p_subject_hash;
    return false;
  end if;
  update public.developer_bootstrap_http_limits
     set attempt_count=attempt_count+1,last_attempt_at=now()
   where scope=p_scope and subject_hash=p_subject_hash;
  return true;
end;
$$;
revoke all on function public.server_take_developer_bootstrap_rate_limit(text,text)
  from public,anon,authenticated;
grant execute on function public.server_take_developer_bootstrap_rate_limit(text,text)
  to service_role;

-- Recovery changes the Auth password before this acknowledgement. Once the
-- database transaction completes, every former browser session must be gone.
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
  delete from auth.sessions where user_id=p_user_id;
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
