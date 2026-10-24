-- Treasure Academy post-migration verification (READ ONLY).
-- Run only after all seven ordered migrations. This script changes no data and
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
  ('admission_tracking_continuations'), ('otp_dispatch_events')
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
    'admission_tracking_continuations','otp_dispatch_events'
  )
order by c.relname;

-- Expected result: zero rows. Anonymous/authenticated users must have no direct
-- table grants on the four server-only admission/developer tables.
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema='public'
  and table_name in (
    'developer_capabilities','admission_tracking_challenges',
    'admission_tracking_continuations','otp_dispatch_events'
  )
  and grantee in ('anon','authenticated')
order by grantee, table_name, privilege_type;

-- Expected values: public_execute=false, authenticated_execute=false,
-- service_execute=true for every server-only function.
with expected(signature) as (values
  ('public.server_active_admission_applications(uuid)'),
  ('public.developer_has_capability(uuid,text)'),
  ('public.server_reveal_otp_dispatch(uuid,uuid)'),
  ('public.server_mark_otp_sent(uuid,uuid,text)'),
  ('public.server_verify_admission_challenge(text,text)')
)
select signature,
       has_function_privilege('anon', signature, 'execute') as public_execute,
       has_function_privilege('authenticated', signature, 'execute') as authenticated_execute,
       has_function_privilege('service_role', signature, 'execute') as service_execute
from expected order by signature;

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

-- These release-critical indexes should all report present=true.
with expected(name) as (values
  ('admission_tracking_one_active_phone_purpose_idx'),
  ('verified_public_information_one_published_topic_idx')
)
select name, to_regclass('public.' || name) is not null as present
from expected order by name;

rollback;
