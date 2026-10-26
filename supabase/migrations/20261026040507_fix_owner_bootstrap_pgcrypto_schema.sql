-- Correct the pgcrypto schema references in the owner-only bootstrap issuer.
-- Supabase installs pgcrypto in `extensions`; the original function's explicit
-- empty search_path intentionally requires fully qualified function calls.
-- No table data, authority, grant, or bootstrap gate is changed here.

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

  v_raw := replace(replace(rtrim(encode(extensions.gen_random_bytes(32),'base64'),'='),'+','-'),'/','_');
  v_hash := encode(extensions.digest(convert_to(v_raw,'UTF8'),'sha256'),'hex');
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
