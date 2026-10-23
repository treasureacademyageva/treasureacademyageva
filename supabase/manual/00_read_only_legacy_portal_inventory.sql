-- Treasure Academy legacy Supabase portal inventory — READ ONLY
-- Date: 2026-10-23
--
-- Run in the existing Supabase project's SQL Editor BEFORE any migration.
-- This returns metadata and estimated row counts only. It does not display
-- names, phone numbers, passwords, grades, payments or any row content.
-- Share only a cropped/redacted screenshot of the result tables; never share
-- project keys, URLs, emails, names or browser address-bar details.

begin transaction read only;

select
  current_database() as database_name,
  current_user as database_role,
  now() as checked_at;

-- Which historical and new portal tables exist?
select
  n.nspname as schema_name,
  c.relname as table_name,
  case c.relkind
    when 'r' then 'table'
    when 'p' then 'partitioned table'
    when 'v' then 'view'
    when 'm' then 'materialized view'
    else c.relkind::text
  end as object_type,
  coalesce(s.n_live_tup, 0)::bigint as estimated_rows,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_stat_user_tables s on s.relid = c.oid
where n.nspname = 'public'
  and c.relname = any (array[
    'school_data',
    'parent_accounts', 'parent_phones', 'pupils', 'applications',
    'staff', 'staff_subjects', 'attendance', 'results', 'fee_payments',
    'profiles', 'students', 'teacher_class_assignments', 'grades', 'payments',
    'webhook_events', 'payment_audit_log', 'admission_audit_log'
  ])
order by c.relname;

-- Column names identify which historical schema version exists. No row data.
select table_name, ordinal_position, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = any (array[
    'school_data', 'parent_accounts', 'parent_phones', 'pupils',
    'applications', 'staff', 'attendance', 'results', 'fee_payments',
    'profiles', 'students', 'teacher_class_assignments', 'grades', 'payments'
  ])
order by table_name, ordinal_position;

-- Existing policy names and roles help identify unsafe exposure without reading data.
select schemaname, tablename, policyname, permissive, roles, cmd
from pg_policies
where schemaname = 'public'
  and tablename = any (array[
    'school_data', 'parent_accounts', 'parent_phones', 'pupils',
    'applications', 'staff', 'attendance', 'results', 'fee_payments',
    'profiles', 'students', 'teacher_class_assignments', 'grades', 'payments'
  ])
order by tablename, policyname;

-- Table-level grants only. This can reveal whether anon/authenticated can read/write.
select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'service_role')
  and table_name = any (array[
    'school_data', 'parent_accounts', 'parent_phones', 'pupils',
    'applications', 'staff', 'attendance', 'results', 'fee_payments',
    'profiles', 'students', 'teacher_class_assignments', 'grades', 'payments'
  ])
order by table_name, grantee, privilege_type;

rollback;
