-- LOCAL/DISPOSABLE TEST HARNESS ONLY.
-- This approximates the small part of Supabase Auth used by the migrations and
-- policy tests. Never run it in a real Supabase project: Supabase already owns
-- these roles, tables and functions there.

do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
do $$ begin create role authenticator nologin noinherit; exception when duplicate_object then null; end $$;

alter role service_role bypassrls;
grant anon, authenticated, service_role to authenticator;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to service_role;
alter default privileges for role postgres in schema public grant all on sequences to service_role;

-- Supabase installs extension-owned functions outside `public`. Mirror that
-- layout so explicit `extensions.pgcrypto_function(...)` references are tested.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
grant usage on schema extensions to anon, authenticated, service_role, authenticator;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key,
  phone text,
  raw_user_meta_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create table if not exists auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function auth.uid()
returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create or replace function auth.role()
returns text
language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), 'anon') $$;

create or replace function auth.jwt()
returns jsonb
language sql stable
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'sub', nullif(current_setting('request.jwt.claim.sub', true), ''),
    'role', nullif(current_setting('request.jwt.claim.role', true), ''),
    'session_id', nullif(current_setting('request.jwt.claim.session_id', true), '')
  ))
$$;

grant usage on schema auth to anon, authenticated, service_role, authenticator;
grant select, insert, update, delete on auth.users, auth.sessions to authenticator;
grant select, delete on auth.sessions to service_role;
grant select on auth.users to service_role;
