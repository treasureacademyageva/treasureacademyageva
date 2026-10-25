-- Treasure Academy owner-authorised developer bootstrap integration test.
-- Disposable local/staging database only; the transaction rolls back.
begin;

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin
  if not coalesce(ok,false) then raise exception 'DEVELOPER BOOTSTRAP TEST FAILED: %',message; end if;
end $$;
create or replace function pg_temp.assert_throws(statement text,message text)
returns void language plpgsql as $$ begin
  begin execute statement; exception when others then return; end;
  raise exception 'DEVELOPER BOOTSTRAP TEST FAILED (expected error): %',message;
end $$;

-- The owner-approved claim exists before any Auth identity. Fictional values
-- ensure this test never creates or embeds a real authorisation or password.
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
insert into public.portal_account_claims(
  id,phone_e164,full_name,intended_role,leadership_scope,position_title,
  class_code,subject,developer_console,developer_otp,developer_information,
  developer_health,status,expires_at
) values (
  '64000000-0000-4000-8000-000000000001','+2348000000301','Fictional Developer',
  'parent','none','Fictional Website Developer',null,'*',true,true,true,true,
  'pending',now()+interval '1 day'
);

-- Deployed service-role code cannot mint owner authority.
select pg_temp.assert_throws(
  $$select * from public.owner_issue_developer_bootstrap('64000000-0000-4000-8000-000000000001','initial_password',15)$$,
  'Service role must not issue an owner authorisation'
);

-- Simulate the explicit official owner dashboard action. The generated raw
-- value exists only in this rolled-back temporary test table.
reset role;
reset session authorization;
select set_config('request.jwt.claim.role','',true);
create temporary table issued_initial as
  select * from public.owner_issue_developer_bootstrap(
    '64000000-0000-4000-8000-000000000001','initial_password',15
  );
grant select on issued_initial to service_role;
select pg_temp.assert_true(
  (select one_time_authorisation ~ '^[A-Za-z0-9_-]{43}$' from issued_initial),
  'Owner issue must return one high-entropy URL-safe value'
);
select pg_temp.assert_true(
  (select a.authorisation_hash = encode(public.digest(convert_to(i.one_time_authorisation,'UTF8'),'sha256'),'hex')
     from public.developer_bootstrap_authorisations a cross join issued_initial i
    where a.id=i.authorisation_id),
  'Only the SHA-256 authorisation hash must be stored'
);
select pg_temp.assert_true(
  not exists(
    select 1 from information_schema.columns
     where table_schema='public'
       and table_name in ('developer_bootstrap_authorisations','developer_bootstrap_events','developer_bootstrap_http_limits')
       and column_name ~* '(password|plaintext|raw_token|otp|credential)'
  ),
  'Bootstrap tables must have no password, OTP, credential or raw-token column'
);

-- Neither ordinary users nor the deployed service role can enumerate the
-- protected state directly; trusted operations use narrowly scoped RPCs.
set session authorization authenticator;
set local role authenticated;
select set_config('request.jwt.claim.role','authenticated',true);
select pg_temp.assert_throws(
  'select * from public.developer_bootstrap_authorisations',
  'Authenticated users must not read authorisations'
);
select pg_temp.assert_throws(
  'select * from public.developer_bootstrap_events',
  'Authenticated users must not read bootstrap audit events'
);
select pg_temp.assert_throws(
  'select * from public.developer_bootstrap_http_limits',
  'Authenticated users must not read bootstrap rate-limit buckets'
);
reset role;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select pg_temp.assert_throws(
  'select * from public.developer_bootstrap_authorisations',
  'Service role must use RPCs instead of direct table reads'
);
select pg_temp.assert_throws(
  'select * from public.developer_bootstrap_http_limits',
  'Service role must use the rate-limit RPC instead of direct reads'
);

-- Grant read access only inside this rolled-back test after the production
-- denial has been proved, so assertions can inspect state transitions.
reset role;
reset session authorization;
select set_config('request.jwt.claim.role','',true);
grant select on public.developer_bootstrap_authorisations,public.developer_bootstrap_events,public.developer_bootstrap_http_limits to service_role;
set session authorization authenticator;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);

-- The persistent phone bucket accepts only five requests per 15-minute window,
-- stores a rotating HMAC only and blocks before any authorisation lookup.
select pg_temp.assert_true(public.server_take_developer_bootstrap_rate_limit('phone',repeat('b',64)),'Rate request 1 must pass');
select pg_temp.assert_true(public.server_take_developer_bootstrap_rate_limit('phone',repeat('b',64)),'Rate request 2 must pass');
select pg_temp.assert_true(public.server_take_developer_bootstrap_rate_limit('phone',repeat('b',64)),'Rate request 3 must pass');
select pg_temp.assert_true(public.server_take_developer_bootstrap_rate_limit('phone',repeat('b',64)),'Rate request 4 must pass');
select pg_temp.assert_true(public.server_take_developer_bootstrap_rate_limit('phone',repeat('b',64)),'Rate request 5 must pass');
select pg_temp.assert_true(not public.server_take_developer_bootstrap_rate_limit('phone',repeat('b',64)),'Rate request 6 must be blocked');
select pg_temp.assert_true(
  (select attempt_count=5 and blocked_until>now() and subject_hash=repeat('b',64)
     from public.developer_bootstrap_http_limits where scope='phone'),
  'Rate bucket must persist only the HMAC, bounded count and temporary block'
);

-- A correct bearer value with the wrong phone increments only a code-free
-- attempt count, then the exact owner-approved claim may reserve once.
select * from public.server_reserve_developer_bootstrap(
  (select encode(public.digest(convert_to(one_time_authorisation,'UTF8'),'sha256'),'hex') from issued_initial),
  '+2348000000399'
);
select pg_temp.assert_true(
  (select attempt_count=1 and status='active'
     from public.developer_bootstrap_authorisations
    where id=(select authorisation_id from issued_initial)),
  'Wrong phone must increment attempts without exposing claim data'
);
create temporary table reserved_initial as
  select * from public.server_reserve_developer_bootstrap(
    (select encode(public.digest(convert_to(one_time_authorisation,'UTF8'),'sha256'),'hex') from issued_initial),
    '+2348000000301'
  );
select pg_temp.assert_true(
  (select claim_id='64000000-0000-4000-8000-000000000001'
      and purpose='initial_password' and existing_user_id is null
      and developer_console and developer_otp and developer_information and developer_health
     from reserved_initial),
  'Reservation must return only the exact approved independent capability set'
);
select pg_temp.assert_true(
  not exists(
    select 1 from public.server_reserve_developer_bootstrap(
      (select encode(public.digest(convert_to(one_time_authorisation,'UTF8'),'sha256'),'hex') from issued_initial),
      '+2348000000301'
    )
  ),
  'A live reservation must serialize concurrent or repeated requests'
);

-- Auth Admin creation happens outside SQL. This harness insert exercises the
-- same profile trigger, after which the service-only completion copies only the
-- pre-approved developer identity/capabilities.
reset role;
insert into auth.users(id,phone,raw_user_meta_data)
values(
  '14000000-0000-4000-8000-000000000001','+2348000000301',
  '{"full_name":"Fictional Developer"}'
);
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select public.server_complete_developer_bootstrap(
  (select authorisation_id from issued_initial),
  '64000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001',
  (select encode(public.digest(convert_to(one_time_authorisation,'UTF8'),'sha256'),'hex') from issued_initial)
);
select pg_temp.assert_true(
  (select role='parent' and leadership_scope='none' and account_status='active'
      and active and not must_change_password and phone_verified_at is null
     from public.profiles where id='14000000-0000-4000-8000-000000000001'),
  'Bootstrap must activate no school leadership role and record no false OTP verification'
);
select pg_temp.assert_true(
  (select console_access and otp_dispatch and information_review and system_health_read
      and revoked_at is null
     from public.developer_capabilities where profile_id='14000000-0000-4000-8000-000000000001'),
  'Bootstrap must copy all and only the approved developer capabilities'
);
select pg_temp.assert_true(
  (select status='claimed' and claimed_user_id='14000000-0000-4000-8000-000000000001'
     from public.portal_account_claims where id='64000000-0000-4000-8000-000000000001'),
  'Successful bootstrap must claim the exact approved identity once'
);
select pg_temp.assert_true(
  (select status='consumed' and authorisation_hash is null and reserved_at is null
      and consumed_by='14000000-0000-4000-8000-000000000001'
     from public.developer_bootstrap_authorisations
    where id=(select authorisation_id from issued_initial)),
  'Successful bootstrap must destroy the hash and consume the authorisation'
);
select pg_temp.assert_true(
  (select count(*)=1 from public.developer_bootstrap_events
    where authorisation_id=(select authorisation_id from issued_initial)
      and action='owner_authorised_supabase_bootstrap'
      and reason_code='completed'
      and detail::text !~* '(password|secret|token|otp|phone|credential)'),
  'Bootstrap audit must state owner authority without credential material'
);
select pg_temp.assert_throws(
  $$select public.server_complete_developer_bootstrap(
    (select authorisation_id from issued_initial),
    '64000000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000001',repeat('a',64))$$,
  'Consumed bootstrap must not replay'
);

-- Password recovery uses a distinct owner-issued one-time authorisation and
-- the same already-claimed developer identity. Auth Admin changes the password
-- before this completion acknowledgement; SQL stores no password. A fictional
-- former browser session proves recovery revokes every existing session.
reset role;
insert into auth.sessions(id,user_id)
values('94000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001');
reset session authorization;
select set_config('request.jwt.claim.role','',true);
create temporary table issued_recovery as
  select * from public.owner_issue_developer_bootstrap(
    '64000000-0000-4000-8000-000000000001','password_recovery',10
  );
grant select on issued_recovery to service_role;
set session authorization authenticator;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
create temporary table reserved_recovery as
  select * from public.server_reserve_developer_bootstrap(
    (select encode(public.digest(convert_to(one_time_authorisation,'UTF8'),'sha256'),'hex') from issued_recovery),
    '+2348000000301'
  );
select pg_temp.assert_true(
  (select purpose='password_recovery'
      and existing_user_id='14000000-0000-4000-8000-000000000001'
     from reserved_recovery),
  'Recovery must bind to the existing claimed developer user'
);
select pg_temp.assert_true(
  public.server_complete_developer_password_recovery(
    (select authorisation_id from issued_recovery),
    '64000000-0000-4000-8000-000000000001',
    '14000000-0000-4000-8000-000000000001',
    (select encode(public.digest(convert_to(one_time_authorisation,'UTF8'),'sha256'),'hex') from issued_recovery)
  ),
  'Recovery completion must consume the reserved owner authorisation'
);
select pg_temp.assert_true(
  not exists(select 1 from auth.sessions where user_id='14000000-0000-4000-8000-000000000001'),
  'Owner-authorised recovery must revoke every former browser session'
);
select pg_temp.assert_true(
  (select count(*)=1 from public.developer_bootstrap_events
    where authorisation_id=(select authorisation_id from issued_recovery)
      and action='owner_authorised_password_recovery'
      and reason_code='completed'),
  'Recovery must have a distinct code-free audit event'
);

-- Five phone mismatches lock a fresh authorisation and destroy its hash.
reset role;
reset session authorization;
select set_config('request.jwt.claim.role','',true);
create temporary table issued_lock_test as
  select * from public.owner_issue_developer_bootstrap(
    '64000000-0000-4000-8000-000000000001','password_recovery',10
  );
grant select on issued_lock_test to service_role;
set session authorization authenticator;
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select * from public.server_reserve_developer_bootstrap((select encode(public.digest(convert_to(one_time_authorisation,'UTF8'),'sha256'),'hex') from issued_lock_test),'+2348000000399');
select * from public.server_reserve_developer_bootstrap((select encode(public.digest(convert_to(one_time_authorisation,'UTF8'),'sha256'),'hex') from issued_lock_test),'+2348000000399');
select * from public.server_reserve_developer_bootstrap((select encode(public.digest(convert_to(one_time_authorisation,'UTF8'),'sha256'),'hex') from issued_lock_test),'+2348000000399');
select * from public.server_reserve_developer_bootstrap((select encode(public.digest(convert_to(one_time_authorisation,'UTF8'),'sha256'),'hex') from issued_lock_test),'+2348000000399');
select * from public.server_reserve_developer_bootstrap((select encode(public.digest(convert_to(one_time_authorisation,'UTF8'),'sha256'),'hex') from issued_lock_test),'+2348000000399');
select pg_temp.assert_true(
  (select status='locked' and attempt_count=5 and authorisation_hash is null
     from public.developer_bootstrap_authorisations
    where id=(select authorisation_id from issued_lock_test)),
  'Attempt limit must lock the authorisation and destroy its hash'
);

-- Leadership-shaped claims cannot use the independent developer bootstrap even
-- if developer flags are mistakenly set.
insert into public.portal_account_claims(
  id,phone_e164,full_name,intended_role,leadership_scope,position_title,
  developer_console,developer_otp,developer_information,developer_health,status,expires_at
) values (
  '64000000-0000-4000-8000-000000000002','+2348000000302','Fictional Leader',
  'admin','headmistress','Fictional Headmistress',true,true,true,true,'pending',now()+interval '1 day'
);
reset role;
reset session authorization;
select set_config('request.jwt.claim.role','',true);
select pg_temp.assert_throws(
  $$select * from public.owner_issue_developer_bootstrap('64000000-0000-4000-8000-000000000002','initial_password',15)$$,
  'School leadership authority must not flow through the developer bootstrap'
);
select pg_temp.assert_throws(
  $$insert into public.developer_bootstrap_events(authorisation_id,claim_id,action,reason_code,detail)
    values(
      (select authorisation_id from issued_initial),
      '64000000-0000-4000-8000-000000000001','attempt_failed','phone_mismatch',
      '{"nested":{"password":"must-not-be-stored"}}'
    )$$,
  'Bootstrap audit must reject recursively nested credential keys'
);

rollback;
