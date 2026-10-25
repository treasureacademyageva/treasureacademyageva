-- Treasure Academy post-migration verification (READ ONLY).
-- Run only after all ten ordered migrations. This script changes no data and
-- activates no feature. Review every result; expected anomaly counts are zero.

begin transaction read only;

select current_database() as database_name,
       current_user as executing_role,
       current_setting('server_version') as postgres_version,
       now() as checked_at;

-- Every expected table should report present=true. public.school_data is shown
-- separately because it must remain preserved when it existed before cutover.
with expected(name) as (values
  ('profiles'), ('students'), ('student_guardians'), ('admission_applications'),
  ('website_requests'), ('verified_public_information'), ('student_enrolments'),
  ('graduates'), ('fee_schedules'), ('pupil_invoices'), ('inventory_movements'),
  ('manual_payments'), ('developer_capabilities'), ('admission_tracking_challenges'),
  ('admission_tracking_continuations'), ('otp_dispatch_events'),
  ('staff_assignment_changes'), ('common_entrance_candidates'),
  ('portal_account_claims'), ('portal_account_claim_challenges'), ('portal_account_claim_events'),
  ('developer_bootstrap_authorisations'), ('developer_bootstrap_events'),
  ('developer_bootstrap_http_limits')
)
select name, to_regclass('public.' || name) is not null as present
from expected order by name;

select to_regclass('public.school_data') is not null as legacy_school_data_still_present;

-- Every listed private/operational table should have RLS enabled.
select c.relname as table_name, c.relrowsecurity as rls_enabled
from pg_class c
join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public'
  and c.relname in (
    'profiles','students','student_guardians','admission_applications',
    'website_requests','verified_public_information','student_enrolments',
    'graduates','fee_schedules','pupil_invoices','inventory_movements',
    'manual_payments','developer_capabilities','admission_tracking_challenges',
    'admission_tracking_continuations','otp_dispatch_events',
    'staff_assignment_changes','common_entrance_candidates',
    'portal_account_claims','portal_account_claim_challenges','portal_account_claim_events',
    'developer_bootstrap_authorisations','developer_bootstrap_events',
    'developer_bootstrap_http_limits'
  )
order by c.relname;

-- Expected result: zero rows. Anonymous/authenticated users must have no direct
-- table grants on the server-only admission/developer/account-claim tables.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in (
    'developer_capabilities','admission_tracking_challenges',
    'admission_tracking_continuations','otp_dispatch_events',
    'portal_account_claims','portal_account_claim_challenges','portal_account_claim_events',
    'developer_bootstrap_authorisations','developer_bootstrap_events',
    'developer_bootstrap_http_limits'
  )
  and grantee in ('anon','authenticated')
order by grantee, table_name, privilege_type;

-- Expected result: zero rows. Bootstrap state is RPC-only even for deployed
-- service-role code; the owner issue/revoke functions remain dashboard-only.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in ('developer_bootstrap_authorisations','developer_bootstrap_events','developer_bootstrap_http_limits')
  and grantee in ('anon','authenticated','service_role')
order by grantee, table_name, privilege_type;

-- Expected values: public_execute=false, authenticated_execute=false,
-- service_execute=true for every server-only function.
with expected(signature) as (values
  ('public.server_active_admission_applications(uuid)'),
  ('public.developer_has_capability(uuid,text)'),
  ('public.server_reveal_otp_dispatch(uuid,uuid)'),
  ('public.server_mark_otp_sent(uuid,uuid,text)'),
  ('public.server_verify_admission_challenge(text,text)'),
  ('public.server_reveal_portal_claim_otp(uuid,uuid)'),
  ('public.server_mark_portal_claim_otp(uuid,uuid,text)'),
  ('public.server_verify_portal_account_claim(text,text,text)'),
  ('public.server_complete_portal_account_claim(uuid,uuid,text)'),
  ('public.server_take_developer_bootstrap_rate_limit(text,text)'),
  ('public.server_reserve_developer_bootstrap(text,text)'),
  ('public.server_release_developer_bootstrap(uuid,text,text)'),
  ('public.server_complete_developer_bootstrap(uuid,uuid,uuid,text)'),
  ('public.server_complete_developer_password_recovery(uuid,uuid,uuid,text)')
)
select signature,
       has_function_privilege('anon', signature, 'execute') as public_execute,
       has_function_privilege('authenticated', signature, 'execute') as authenticated_execute,
       has_function_privilege('service_role', signature, 'execute') as service_execute
from expected order by signature;

-- Expected values are false for all three roles. These functions may be used
-- only by the database owner in the official Supabase dashboard.
with owner_only(signature) as (values
  ('public.owner_issue_developer_bootstrap(uuid,text,integer)'),
  ('public.owner_revoke_developer_bootstrap(uuid)')
)
select signature,
       has_function_privilege('anon', signature, 'execute') as anon_execute,
       has_function_privilege('authenticated', signature, 'execute') as authenticated_execute,
       has_function_privilege('service_role', signature, 'execute') as service_execute
from owner_only order by signature;

-- Expected anomaly_count=0: one current publication per topic.
select count(*) as conflicting_published_topic_count
from (
  select topic from public.verified_public_information
  where status='published'
  group by topic having count(*) > 1
) conflicts;

-- Expected anomaly_count=0: one live OTP challenge per phone/purpose.
select count(*) as duplicate_active_otp_phone_purpose_count
from (
  select phone_hash, purpose from public.admission_tracking_challenges
  where status in ('queued','revealed','sent')
  group by phone_hash, purpose having count(*) > 1
) conflicts;

-- Expected anomaly_count=0: audit JSON must contain no sensitive key at any
-- nesting level. This checks historical rows as well as the constraints.
select count(*) as sensitive_otp_audit_detail_count
from public.otp_dispatch_events
where detail::text ~* '"(otp|code|phone|message)"[[:space:]]*:';

select count(*) as duplicate_active_account_claim_phone_count
from (
  select phone_hash from public.portal_account_claim_challenges
  where status in ('queued','revealed','sent')
  group by phone_hash having count(*) > 1
) conflicts;

select count(*) as sensitive_account_claim_audit_detail_count
from public.portal_account_claim_events
where detail::text ~* '"(otp|code|phone|message)"[[:space:]]*:';

select count(*) as duplicate_live_developer_authorisation_count
from (
  select claim_id,purpose from public.developer_bootstrap_authorisations
  where status in ('active','reserved')
  group by claim_id,purpose having count(*) > 1
) conflicts;

select count(*) as sensitive_developer_bootstrap_audit_detail_count
from public.developer_bootstrap_events
where detail::text ~* '"(password|secret|token|authori[sz]ation|otp|code|phone|message|credential)"[[:space:]]*:';

select count(*) as invalid_consumed_developer_authorisation_count
from public.developer_bootstrap_authorisations
where status='consumed'
  and (authorisation_hash is not null or consumed_by is null or consumed_at is null or reserved_at is not null);

select count(*) as invalid_developer_bootstrap_rate_bucket_count
from public.developer_bootstrap_http_limits
where subject_hash !~ '^[a-f0-9]{64}$'
   or attempt_count not between 0 and 10
   or scope not in ('network','phone');

-- These release-critical indexes should all report present=true.
with expected(name) as (values
  ('admission_tracking_one_active_phone_purpose_idx'),
  ('portal_claim_one_active_phone_idx'),
  ('portal_claim_setup_token_unique_idx'),
  ('teacher_assignments_one_active_scope_idx'),
  ('teacher_assignments_one_active_class_teacher_idx'),
  ('verified_public_information_one_published_topic_idx'),
  ('developer_bootstrap_one_live_purpose_idx'),
  ('developer_bootstrap_http_limits_cleanup_idx')
)
select name, to_regclass('public.' || name) is not null as present
from expected order by name;

rollback;
