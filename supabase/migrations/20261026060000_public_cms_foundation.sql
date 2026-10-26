-- Treasure Academy first-party public CMS foundation
-- Run 5: additive schema, workflow, immutable revisions/audit, published-only
-- projections and RLS. This migration imports no content, media or identities,
-- activates no route or feature gate, and does not alter legacy tables.

begin;

-- ---------------------------------------------------------------------------
-- Purpose-built CMS types
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.cms_content_type as enum ('news','event','page','announcement');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.cms_workflow_status as enum (
    'draft','in_review','changes_requested','approved','scheduled','published','archived','cancelled'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.cms_content_classification as enum ('public','private');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.cms_approval_kind as enum ('factual','safeguarding','publication');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.cms_approval_decision as enum ('approved','changes_requested','revoked');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.cms_block_type as enum (
    'paragraph','heading','ordered_list','unordered_list','quote','callout',
    'image','video','gallery','verified_fact','table','button','related_content'
  );
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.cms_media_state as enum ('pending','approved','rejected','archived');
exception when duplicate_object then null; end $$;
do $$ begin
  create type public.cms_comment_status as enum ('pending','approved','rejected','archived');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Separate CMS capability boundary
-- ---------------------------------------------------------------------------

create table public.public_cms_capabilities (
  profile_id uuid primary key references public.profiles(id) on delete restrict,
  can_draft boolean not null default false,
  can_review boolean not null default false,
  can_publish boolean not null default false,
  can_safeguarding_review boolean not null default false,
  can_emergency_publish boolean not null default false,
  granted_by uuid not null references public.profiles(id) on delete restrict,
  grant_reason text not null check (char_length(trim(grant_reason)) between 8 and 500),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references public.profiles(id) on delete restrict,
  revoke_reason text check (revoke_reason is null or char_length(trim(revoke_reason)) between 8 and 500),
  updated_at timestamptz not null default now(),
  check ((revoked_at is null and revoked_by is null and revoke_reason is null)
      or (revoked_at is not null and revoked_by is not null and revoke_reason is not null))
);

create table public.public_cms_capability_events (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('granted','updated','revoked')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (not (detail ?| array['password','otp','code','phone','secret','token','credential','message'])),
  check (detail::text !~* '"(password|otp|code|phone|secret|token|credential|message)"[[:space:]]*:')
);

-- ---------------------------------------------------------------------------
-- Media metadata. Run 6 will add the school-owned provider boundary.
-- ---------------------------------------------------------------------------

create table public.public_media_assets (
  id uuid primary key default gen_random_uuid(),
  provider text not null default 'unassigned' check (provider in ('unassigned','cloudinary')),
  provider_asset_id text unique,
  media_type text not null check (media_type in ('image','video')),
  lifecycle_state public.cms_media_state not null default 'pending',
  title text check (title is null or char_length(trim(title)) between 2 and 180),
  alt_text text check (alt_text is null or char_length(trim(alt_text)) between 2 and 500),
  attribution text check (attribution is null or char_length(trim(attribution)) <= 500),
  source_note text check (source_note is null or char_length(trim(source_note)) <= 2000),
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-f0-9]{64}$'),
  width integer check (width is null or width between 1 and 20000),
  height integer check (height is null or height between 1 and 20000),
  duration_seconds numeric(10,3) check (duration_seconds is null or duration_seconds > 0),
  child_identifiable boolean not null default false,
  provenance_status text not null default 'pending' check (provenance_status in ('pending','verified','rejected')),
  consent_status text not null default 'pending' check (consent_status in ('not_required','pending','approved','denied','expired')),
  consent_reference text,
  consent_reviewed_by uuid references public.profiles(id) on delete restrict,
  consent_reviewed_at timestamptz,
  safeguarding_reviewed_by uuid references public.profiles(id) on delete restrict,
  safeguarding_reviewed_at timestamptz,
  public_derivative_only boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  archive_reason text,
  check (provider <> 'cloudinary' or provider_asset_id is not null),
  check (not child_identifiable or public_derivative_only),
  check ((consent_reviewed_at is null and consent_reviewed_by is null)
      or (consent_reviewed_at is not null and consent_reviewed_by is not null)),
  check ((safeguarding_reviewed_at is null and safeguarding_reviewed_by is null)
      or (safeguarding_reviewed_at is not null and safeguarding_reviewed_by is not null)),
  check ((archived_at is null and archived_by is null and archive_reason is null)
      or (archived_at is not null and archived_by is not null and char_length(trim(archive_reason)) between 8 and 500)),
  check (not (metadata ?| array['password','otp','code','phone','secret','token','credential'])),
  check (metadata::text !~* '"(password|otp|code|phone|secret|token|credential)"[[:space:]]*:')
);

-- ---------------------------------------------------------------------------
-- Content identity, immutable revisions and validated blocks
-- ---------------------------------------------------------------------------

create or replace function public.cms_canonical_path(
  p_type public.cms_content_type,
  p_slug text
)
returns text
language sql
immutable
set search_path=''
as $$
  select case p_type
    when 'news'::public.cms_content_type then '/news/' || p_slug
    when 'event'::public.cms_content_type then '/events/' || p_slug
    when 'page'::public.cms_content_type then '/' || p_slug
    when 'announcement'::public.cms_content_type then '/announcements/' || p_slug
  end
$$;
revoke all on function public.cms_canonical_path(public.cms_content_type,text) from public,anon,authenticated;

create table public.public_content_entries (
  id uuid primary key default gen_random_uuid(),
  content_type public.cms_content_type not null,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 120),
  canonical_path text generated always as (public.cms_canonical_path(content_type,slug)) stored,
  workflow_status public.cms_workflow_status not null default 'draft',
  current_revision_number integer not null default 0 check (current_revision_number >= 0),
  current_revision_id uuid,
  published_revision_id uuid,
  scheduled_revision_id uuid,
  scheduled_for timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id) on delete restrict,
  archive_reason text,
  cancelled_at timestamptz,
  check ((scheduled_revision_id is null and scheduled_for is null)
      or (scheduled_revision_id is not null and scheduled_for is not null)),
  check ((archived_at is null and archived_by is null and archive_reason is null)
      or (archived_at is not null and archived_by is not null and char_length(trim(archive_reason)) between 8 and 500))
);

create table public.public_content_revisions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  title text not null check (char_length(trim(title)) between 4 and 180),
  summary text not null check (char_length(trim(summary)) between 10 and 500),
  category text check (category is null or char_length(trim(category)) between 2 and 80),
  search_keywords text[] not null default '{}',
  content_language text not null default 'en' check (content_language ~ '^[a-z]{2,3}$'),
  locale text not null default 'en-NG' check (locale ~ '^[a-z]{2}-[A-Z]{2}$'),
  classification public.cms_content_classification not null default 'public',
  source_note text check (source_note is null or char_length(trim(source_note)) <= 2000),
  next_review_date date,
  seo_title text check (seo_title is null or char_length(trim(seo_title)) between 4 and 70),
  seo_description text check (seo_description is null or char_length(trim(seo_description)) between 20 and 180),
  featured_media_id uuid references public.public_media_assets(id) on delete restrict,
  social_media_id uuid references public.public_media_assets(id) on delete restrict,
  effective_from timestamptz,
  expires_at timestamptz,
  event_starts_at timestamptz,
  event_ends_at timestamptz,
  event_timezone text not null default 'Africa/Lagos' check (event_timezone='Africa/Lagos'),
  event_venue text check (event_venue is null or char_length(trim(event_venue)) <= 200),
  event_public_address text check (event_public_address is null or char_length(trim(event_public_address)) <= 500),
  event_status text check (event_status is null or event_status in ('scheduled','postponed','cancelled','moved_online','completed')),
  attendance_mode text check (attendance_mode is null or attendance_mode in ('in_person','online','hybrid','not_applicable')),
  public_action_label text check (public_action_label is null or char_length(trim(public_action_label)) between 2 and 80),
  public_action_path text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid not null references public.profiles(id) on delete restrict,
  change_note text not null check (char_length(trim(change_note)) between 3 and 500),
  created_at timestamptz not null default now(),
  unique(entry_id,revision_number),
  unique(id,entry_id),
  check (expires_at is null or effective_from is null or expires_at>effective_from),
  check (event_ends_at is null or event_starts_at is null or event_ends_at>=event_starts_at),
  check (cardinality(search_keywords) <= 40),
  check (public_action_path is null or (
    public_action_path ~ '^/[a-zA-Z0-9/_?#=&.%-]*$'
    and public_action_path !~ '//'
    and public_action_path !~ '(^|/)\.\.(/|$)'
  )),
  check (not (metadata ?| array['password','otp','code','phone','secret','token','credential','message','raw_html','script'])),
  check (metadata::text !~* '"(password|otp|code|phone|secret|token|credential|message|raw_html|script)"[[:space:]]*:')
);

alter table public.public_content_entries
  add constraint public_content_entries_current_revision_fk
  foreign key(current_revision_id,id) references public.public_content_revisions(id,entry_id) on delete restrict;
alter table public.public_content_entries
  add constraint public_content_entries_published_revision_fk
  foreign key(published_revision_id,id) references public.public_content_revisions(id,entry_id) on delete restrict;
alter table public.public_content_entries
  add constraint public_content_entries_scheduled_revision_fk
  foreign key(scheduled_revision_id,id) references public.public_content_revisions(id,entry_id) on delete restrict;

create table public.public_content_blocks (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.public_content_revisions(id) on delete restrict,
  block_position integer not null check (block_position between 0 and 99),
  block_type public.cms_block_type not null,
  payload jsonb not null,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(revision_id,block_position),
  check (jsonb_typeof(payload)='object'),
  check (pg_column_size(payload) <= 65536)
);

create table public.public_content_tags (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 80),
  name text not null check (char_length(trim(name)) between 2 and 80),
  created_at timestamptz not null default now()
);

create table public.public_content_tag_links (
  revision_id uuid not null references public.public_content_revisions(id) on delete restrict,
  tag_id uuid not null references public.public_content_tags(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key(revision_id,tag_id)
);

create table public.public_content_media (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.public_content_revisions(id) on delete restrict,
  media_id uuid not null references public.public_media_assets(id) on delete restrict,
  placement text not null check (placement in ('featured','social','body','gallery','download')),
  placement_position integer not null default 0 check (placement_position between 0 and 99),
  caption text check (caption is null or char_length(trim(caption)) <= 500),
  created_at timestamptz not null default now(),
  unique(revision_id,media_id,placement,placement_position)
);

create table public.public_content_slug_aliases (
  id uuid primary key default gen_random_uuid(),
  alias_path text not null unique check (
    alias_path ~ '^/[a-z0-9/_-]+$' and alias_path !~ '//' and alias_path !~ '(^|/)\.\.(/|$)'
  ),
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.public_publication_events (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  revision_id uuid references public.public_content_revisions(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null check (action in (
    'draft_created','revision_created','submitted_review','changes_requested','approved',
    'scheduled','published','scheduled_published','archived','cancelled','revision_restored','slug_changed'
  )),
  previous_status public.cms_workflow_status,
  new_status public.cms_workflow_status not null,
  reason text check (reason is null or char_length(trim(reason)) between 3 and 500),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (not (detail ?| array['password','otp','code','phone','secret','token','credential','message'])),
  check (detail::text !~* '"(password|otp|code|phone|secret|token|credential|message)"[[:space:]]*:')
);

create table public.public_content_approvals (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  revision_id uuid not null references public.public_content_revisions(id) on delete restrict,
  approval_kind public.cms_approval_kind not null,
  decision public.cms_approval_decision not null,
  reviewer_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now()
);

create table public.public_site_content_slots (
  id uuid primary key default gen_random_uuid(),
  slot_key text not null check (slot_key ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  slot_position integer not null default 0 check (slot_position between 0 and 99),
  active boolean not null default true,
  effective_from timestamptz,
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(slot_key,slot_position),
  check (expires_at is null or effective_from is null or expires_at>effective_from)
);

create table public.public_content_quality_findings (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  revision_id uuid not null references public.public_content_revisions(id) on delete restrict,
  finding_code text not null check (finding_code ~ '^[a-z][a-z0-9_]{2,79}$'),
  severity text not null check (severity in ('warning','error','hard_block')),
  status text not null default 'open' check (status in ('open','resolved','overridden')),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references public.profiles(id) on delete restrict,
  resolution_reason text,
  check ((status='open' and resolved_at is null and resolved_by is null and resolution_reason is null)
      or (status<>'open' and resolved_at is not null and resolved_by is not null
          and char_length(trim(resolution_reason)) between 8 and 500)),
  check (not (detail ?| array['password','otp','code','phone','secret','token','credential','message'])),
  check (detail::text !~* '"(password|otp|code|phone|secret|token|credential|message)"[[:space:]]*:')
);

-- These are controlled parent-facing vocabulary terms, not retained raw user queries.
create table public.public_content_search_terms (
  revision_id uuid not null references public.public_content_revisions(id) on delete restrict,
  term text not null check (term=lower(term) and char_length(trim(term)) between 2 and 80),
  source text not null default 'editor' check (source in ('editor','verified_synonym','migration')),
  created_at timestamptz not null default now(),
  primary key(revision_id,term)
);

create table public.public_site_navigation_items (
  id uuid primary key default gen_random_uuid(),
  navigation_key text not null check (navigation_key ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  label text not null check (char_length(trim(label)) between 2 and 80),
  href text not null check (href ~ '^/[a-zA-Z0-9/_?#=&.%-]*$' and href !~ '//' and href !~ '(^|/)\.\.(/|$)'),
  entry_id uuid references public.public_content_entries(id) on delete restrict,
  item_position integer not null default 0 check (item_position between 0 and 99),
  active boolean not null default true,
  created_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(navigation_key,item_position)
);

-- Engagement foundations remain dormant until Run 9 feature-gate acceptance.
create table public.public_content_views_daily (
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  viewed_on date not null,
  view_count bigint not null default 0 check (view_count>=0),
  updated_at timestamptz not null default now(),
  primary key(entry_id,viewed_on)
);

create table public.public_content_reactions (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null default 'like' check (reaction='like'),
  created_at timestamptz not null default now(),
  unique(entry_id,actor_id,reaction)
);

create table public.public_content_comments (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 2 and 2000),
  status public.cms_comment_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  moderated_by uuid references public.profiles(id) on delete restrict,
  moderated_at timestamptz,
  moderation_reason text,
  check ((status='pending' and moderated_by is null and moderated_at is null and moderation_reason is null)
      or (status<>'pending' and moderated_by is not null and moderated_at is not null
          and char_length(trim(moderation_reason)) between 3 and 500))
);

create table public.public_comment_moderation_events (
  id bigint generated always as identity primary key,
  comment_id uuid not null references public.public_content_comments(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  previous_status public.cms_comment_status not null,
  new_status public.cms_comment_status not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index public_content_entries_type_idx on public.public_content_entries(content_type,workflow_status);
create index public_content_entries_public_idx on public.public_content_entries(published_revision_id,published_at) where archived_at is null;
create index public_content_entries_schedule_idx on public.public_content_entries(scheduled_for) where scheduled_revision_id is not null;
create index public_content_revisions_entry_idx on public.public_content_revisions(entry_id,revision_number desc);
create index public_content_revisions_review_idx on public.public_content_revisions(next_review_date);
create index public_content_blocks_revision_idx on public.public_content_blocks(revision_id,block_position);
create index public_content_media_revision_idx on public.public_content_media(revision_id,placement,placement_position);
create index public_content_approvals_revision_idx on public.public_content_approvals(revision_id,approval_kind,created_at desc);
create index public_publication_events_entry_idx on public.public_publication_events(entry_id,created_at desc);
create index public_site_slots_active_idx on public.public_site_content_slots(slot_key,active,slot_position);
create index public_quality_findings_open_idx on public.public_content_quality_findings(revision_id,severity) where status='open';
create index public_search_terms_term_idx on public.public_content_search_terms(term);
create index public_comments_queue_idx on public.public_content_comments(status,created_at);

-- ---------------------------------------------------------------------------
-- Capability checks
-- ---------------------------------------------------------------------------

create or replace function public.cms_current_actor_can(p_capability text)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select (
      case
        when p.role='admin'::public.app_role
         and p.leadership_scope in ('headmistress'::public.leadership_scope,'assistant_headmistress'::public.leadership_scope)
         and p_capability in ('view_private','draft','review','publish') then true
        when p.role='admin'::public.app_role
         and p.leadership_scope='headmistress'::public.leadership_scope
         and lower(trim(coalesce(p.position_title,'')))='proprietress'
         and p_capability in ('administer','emergency_publish') then true
        when p_capability='view_private' and exists(
          select 1 from public.developer_capabilities d
           where d.profile_id=p.id and d.information_review and d.revoked_at is null
        ) then true
        else exists(
          select 1 from public.public_cms_capabilities c
           where c.profile_id=p.id and c.revoked_at is null
             and case p_capability
               when 'view_private' then c.can_draft or c.can_review or c.can_publish or c.can_safeguarding_review
               when 'draft' then c.can_draft
               when 'review' then c.can_review
               when 'publish' then c.can_publish
               when 'safeguarding_review' then c.can_safeguarding_review
               when 'emergency_publish' then c.can_emergency_publish
                 and p.role='admin'::public.app_role
                 and p.leadership_scope='headmistress'::public.leadership_scope
                 and lower(trim(coalesce(p.position_title,'')))='proprietress'
               else false
             end
        )
      end
    )
    from public.profiles p
    where p.id=(select auth.uid()) and p.active and p.account_status='active' and not p.must_change_password
  ),false)
$$;
revoke all on function public.cms_current_actor_can(text) from public;
grant execute on function public.cms_current_actor_can(text) to anon,authenticated,service_role;

create or replace function public.cms_set_capabilities(
  p_profile_id uuid,
  p_can_draft boolean,
  p_can_review boolean,
  p_can_publish boolean,
  p_can_safeguarding_review boolean,
  p_can_emergency_publish boolean,
  p_reason text,
  p_revoke boolean default false
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_action text;
begin
  if not public.cms_current_actor_can('administer') then raise exception 'Proprietress CMS administration required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 8 and 500 then raise exception 'A recorded capability reason is required' using errcode='22023'; end if;
  if not exists(select 1 from public.profiles p where p.id=p_profile_id and p.active and p.account_status='active' and p.role in ('teacher'::public.app_role,'admin'::public.app_role)) then
    raise exception 'Active staff profile required' using errcode='22023';
  end if;
  if p_can_emergency_publish and not p_can_publish then raise exception 'Emergency publication requires publication authority' using errcode='22023'; end if;
  if p_can_emergency_publish and not exists(
    select 1 from public.profiles p where p.id=p_profile_id
      and p.role='admin'::public.app_role
      and p.leadership_scope='headmistress'::public.leadership_scope
      and lower(trim(coalesce(p.position_title,'')))='proprietress'
  ) then raise exception 'Emergency publication is reserved to the Proprietress' using errcode='42501'; end if;
  select case when exists(select 1 from public.public_cms_capabilities where profile_id=p_profile_id) then 'updated' else 'granted' end into v_action;
  insert into public.public_cms_capabilities(
    profile_id,can_draft,can_review,can_publish,can_safeguarding_review,can_emergency_publish,
    granted_by,grant_reason,granted_at,revoked_at,revoked_by,revoke_reason,updated_at
  ) values (
    p_profile_id,p_can_draft,p_can_review,p_can_publish,p_can_safeguarding_review,p_can_emergency_publish,
    v_actor,trim(p_reason),now(),case when p_revoke then now() end,case when p_revoke then v_actor end,
    case when p_revoke then trim(p_reason) end,now()
  ) on conflict(profile_id) do update set
    can_draft=excluded.can_draft,can_review=excluded.can_review,can_publish=excluded.can_publish,
    can_safeguarding_review=excluded.can_safeguarding_review,can_emergency_publish=excluded.can_emergency_publish,
    granted_by=excluded.granted_by,grant_reason=excluded.grant_reason,granted_at=excluded.granted_at,
    revoked_at=excluded.revoked_at,revoked_by=excluded.revoked_by,revoke_reason=excluded.revoke_reason,updated_at=now();
  if p_revoke then v_action:='revoked'; end if;
  insert into public.public_cms_capability_events(profile_id,actor_id,action,detail)
  values(p_profile_id,v_actor,v_action,jsonb_build_object(
    'draft',p_can_draft,'review',p_can_review,'publish',p_can_publish,
    'safeguarding_review',p_can_safeguarding_review,'emergency_publish',p_can_emergency_publish,
    'reason',trim(p_reason)
  ));
  return true;
end $$;
revoke all on function public.cms_set_capabilities(uuid,boolean,boolean,boolean,boolean,boolean,text,boolean) from public,anon;
grant execute on function public.cms_set_capabilities(uuid,boolean,boolean,boolean,boolean,boolean,text,boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- Validation and immutable-history guards
-- ---------------------------------------------------------------------------

create or replace function public.cms_block_payload_valid(p_type public.cms_block_type,p_payload jsonb)
returns boolean
language plpgsql
immutable
set search_path=''
as $$
declare v_count integer;
begin
  if p_payload is null or jsonb_typeof(p_payload)<>'object' or pg_column_size(p_payload)>65536 then return false; end if;
  if p_payload::text ~* '(<[[:space:]]*/?[[:space:]]*[a-z][^>]*>|(java|vb)script[[:space:]]*:|data[[:space:]]*:[[:space:]]*text/html|css[[:space:]]*expression[[:space:]]*\(|"(raw_html|html|script|javascript|on[a-z]+)"[[:space:]]*:)' then return false; end if;
  if p_type in ('paragraph','quote') then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('text')) then return false; end if;
    return char_length(trim(coalesce(p_payload->>'text',''))) between 1 and 5000;
  elsif p_type='heading' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('text','level')) then return false; end if;
    return char_length(trim(coalesce(p_payload->>'text',''))) between 1 and 300
      and coalesce(p_payload->>'level','') in ('2','3','4');
  elsif p_type in ('ordered_list','unordered_list') then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('items')) then return false; end if;
    if jsonb_typeof(p_payload->'items')<>'array' then return false; end if;
    select jsonb_array_length(p_payload->'items') into v_count;
    return v_count between 1 and 50 and not exists(
      select 1 from jsonb_array_elements(p_payload->'items') i
      where jsonb_typeof(i)<>'string' or char_length(trim(i#>>'{}')) not between 1 and 500
    );
  elsif p_type='callout' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('text','style')) then return false; end if;
    return char_length(trim(coalesce(p_payload->>'text',''))) between 1 and 3000
      and coalesce(p_payload->>'style','info') in ('info','warning','success');
  elsif p_type='image' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('asset_id','decorative','alt')) then return false; end if;
    perform (p_payload->>'asset_id')::uuid;
    return coalesce((p_payload->>'decorative')::boolean,false)
      or char_length(trim(coalesce(p_payload->>'alt',''))) between 2 and 500;
  elsif p_type='video' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('asset_id','title')) then return false; end if;
    perform (p_payload->>'asset_id')::uuid;
    return char_length(trim(coalesce(p_payload->>'title',''))) between 2 and 180;
  elsif p_type='gallery' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('asset_ids')) then return false; end if;
    if jsonb_typeof(p_payload->'asset_ids')<>'array' then return false; end if;
    select jsonb_array_length(p_payload->'asset_ids') into v_count;
    if v_count not between 1 and 24 then return false; end if;
    perform (v#>>'{}')::uuid from jsonb_array_elements(p_payload->'asset_ids') v;
    return true;
  elsif p_type='verified_fact' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('text','source_path')) then return false; end if;
    return char_length(trim(coalesce(p_payload->>'text',''))) between 2 and 3000
      and coalesce(p_payload->>'source_path','') ~ '^/[a-zA-Z0-9/_?#=&.%-]*$'
      and coalesce(p_payload->>'source_path','') !~ '//'
      and coalesce(p_payload->>'source_path','') !~ '(^|/)\.\.(/|$)';
  elsif p_type='table' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('headers','rows')) then return false; end if;
    return jsonb_typeof(p_payload->'headers')='array' and jsonb_array_length(p_payload->'headers') between 1 and 12
      and jsonb_typeof(p_payload->'rows')='array' and jsonb_array_length(p_payload->'rows') between 1 and 100
      and not exists(select 1 from jsonb_array_elements(p_payload->'headers') h
        where jsonb_typeof(h)<>'string' or char_length(trim(h#>>'{}')) not between 1 and 120)
      and not exists(select 1 from jsonb_array_elements(p_payload->'rows') r
        where jsonb_typeof(r)<>'array' or jsonb_array_length(r)<>jsonb_array_length(p_payload->'headers'));
  elsif p_type='button' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('label','path')) then return false; end if;
    return char_length(trim(coalesce(p_payload->>'label',''))) between 2 and 80
      and coalesce(p_payload->>'path','') ~ '^/[a-zA-Z0-9/_?#=&.%-]*$'
      and coalesce(p_payload->>'path','') !~ '//'
      and coalesce(p_payload->>'path','') !~ '(^|/)\.\.(/|$)';
  elsif p_type='related_content' then
    if exists(select 1 from jsonb_object_keys(p_payload) k where k not in ('slugs')) then return false; end if;
    return jsonb_typeof(p_payload->'slugs')='array'
      and jsonb_array_length(p_payload->'slugs') between 1 and 20
      and not exists(
        select 1 from jsonb_array_elements(p_payload->'slugs') s
        where jsonb_typeof(s)<>'string' or (s#>>'{}') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
      );
  end if;
  return false;
exception when others then return false;
end $$;
revoke all on function public.cms_block_payload_valid(public.cms_block_type,jsonb) from public,anon,authenticated;

create or replace function public.cms_guard_block_payload()
returns trigger
language plpgsql
set search_path=''
as $$ begin
  if not public.cms_block_payload_valid(new.block_type,new.payload) then
    raise exception 'Malformed or unsafe CMS block payload' using errcode='22023';
  end if;
  return new;
end $$;
revoke all on function public.cms_guard_block_payload() from public,anon,authenticated;
create trigger public_content_blocks_validate before insert on public.public_content_blocks
for each row execute function public.cms_guard_block_payload();

create or replace function public.cms_reject_mutation()
returns trigger
language plpgsql
set search_path=''
as $$ begin
  raise exception 'CMS history is append-only' using errcode='42501';
end $$;
revoke all on function public.cms_reject_mutation() from public,anon,authenticated;

create trigger public_content_revisions_immutable before update or delete on public.public_content_revisions
for each row execute function public.cms_reject_mutation();
create trigger public_content_blocks_immutable before update or delete on public.public_content_blocks
for each row execute function public.cms_reject_mutation();
create trigger public_content_tag_links_immutable before update or delete on public.public_content_tag_links
for each row execute function public.cms_reject_mutation();
create trigger public_content_media_immutable before update or delete on public.public_content_media
for each row execute function public.cms_reject_mutation();
create trigger public_content_aliases_immutable before update or delete on public.public_content_slug_aliases
for each row execute function public.cms_reject_mutation();
create trigger public_publication_events_immutable before update or delete on public.public_publication_events
for each row execute function public.cms_reject_mutation();
create trigger public_content_approvals_immutable before update or delete on public.public_content_approvals
for each row execute function public.cms_reject_mutation();
create trigger public_content_search_terms_immutable before update or delete on public.public_content_search_terms
for each row execute function public.cms_reject_mutation();
create trigger public_cms_capability_events_immutable before update or delete on public.public_cms_capability_events
for each row execute function public.cms_reject_mutation();
create trigger public_comment_moderation_events_immutable before update or delete on public.public_comment_moderation_events
for each row execute function public.cms_reject_mutation();

create or replace function public.cms_prevent_hard_delete()
returns trigger
language plpgsql
set search_path=''
as $$ begin
  raise exception 'Archive CMS records instead of deleting them' using errcode='42501';
end $$;
revoke all on function public.cms_prevent_hard_delete() from public,anon,authenticated;
create trigger public_content_entries_no_delete before delete on public.public_content_entries
for each row execute function public.cms_prevent_hard_delete();
create trigger public_media_assets_no_delete before delete on public.public_media_assets
for each row execute function public.cms_prevent_hard_delete();

create or replace function public.cms_validate_document(p_type public.cms_content_type,p_document jsonb)
returns void
language plpgsql
set search_path=''
as $$
declare v_block jsonb; v_media jsonb; v_start timestamptz; v_end timestamptz; v_effective timestamptz; v_expiry timestamptz;
begin
  if p_document is null or jsonb_typeof(p_document)<>'object' or pg_column_size(p_document)>262144 then
    raise exception 'CMS document must be a bounded JSON object' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_object_keys(p_document) k where k not in (
    'title','summary','category','search_keywords','language','locale','classification','source_note',
    'next_review_date','seo_title','seo_description','featured_media_id','social_media_id',
    'effective_from','expires_at','event','metadata','blocks','tags','search_terms','media'
  )) then raise exception 'CMS document contains an unsupported field' using errcode='22023'; end if;
  if p_document::text ~* '(<[[:space:]]*/?[[:space:]]*[a-z][^>]*>|(java|vb)script[[:space:]]*:|data[[:space:]]*:[[:space:]]*text/html|css[[:space:]]*expression[[:space:]]*\(|"(password|otp|code|phone|secret|token|credential|raw_html|html|script|javascript|on[a-z]+)"[[:space:]]*:)' then
    raise exception 'CMS document contains prohibited executable or private material' using errcode='22023';
  end if;
  if char_length(trim(coalesce(p_document->>'title',''))) not between 4 and 180
     or char_length(trim(coalesce(p_document->>'summary',''))) not between 10 and 500 then
    raise exception 'CMS title or summary is invalid' using errcode='22023';
  end if;
  if coalesce(p_document->>'classification','public') not in ('public','private') then raise exception 'Invalid CMS classification' using errcode='22023'; end if;
  if p_document ? 'search_keywords' and (
    jsonb_typeof(p_document->'search_keywords')<>'array' or jsonb_array_length(p_document->'search_keywords')>40
    or exists(select 1 from jsonb_array_elements(p_document->'search_keywords') v
      where jsonb_typeof(v)<>'string' or char_length(trim(v#>>'{}')) not between 2 and 80)
  ) then raise exception 'Invalid search vocabulary' using errcode='22023'; end if;
  if p_document ? 'tags' and (
    jsonb_typeof(p_document->'tags')<>'array' or jsonb_array_length(p_document->'tags')>20
    or exists(select 1 from jsonb_array_elements(p_document->'tags') v
      where jsonb_typeof(v)<>'string' or (v#>>'{}') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
        or char_length(v#>>'{}') not between 2 and 80)
  ) then raise exception 'Invalid CMS tags' using errcode='22023'; end if;
  if p_document ? 'search_terms' and (
    jsonb_typeof(p_document->'search_terms')<>'array' or jsonb_array_length(p_document->'search_terms')>40
    or exists(select 1 from jsonb_array_elements(p_document->'search_terms') v
      where jsonb_typeof(v)<>'string' or char_length(trim(v#>>'{}')) not between 2 and 80)
  ) then raise exception 'Invalid verified search terms' using errcode='22023'; end if;
  if jsonb_typeof(p_document->'blocks')<>'array' or jsonb_array_length(p_document->'blocks') not between 1 and 100 then raise exception 'One to one hundred structured blocks are required' using errcode='22023'; end if;
  for v_block in select value from jsonb_array_elements(p_document->'blocks') loop
    if jsonb_typeof(v_block)<>'object' or not (v_block ? 'type') or not (v_block ? 'payload') then raise exception 'Malformed CMS block' using errcode='22023'; end if;
    if coalesce(v_block->>'type','') not in ('paragraph','heading','ordered_list','unordered_list','quote','callout','image','video','gallery','verified_fact','table','button','related_content') then raise exception 'Unsupported CMS block type' using errcode='22023'; end if;
    if not public.cms_block_payload_valid((v_block->>'type')::public.cms_block_type,v_block->'payload') then raise exception 'Malformed or unsafe CMS block payload' using errcode='22023'; end if;
  end loop;
  if p_document ? 'media' then
    if jsonb_typeof(p_document->'media')<>'array' or jsonb_array_length(p_document->'media')>100 then raise exception 'Invalid CMS media relationships' using errcode='22023'; end if;
    for v_media in select value from jsonb_array_elements(p_document->'media') loop
      if jsonb_typeof(v_media)<>'object' or exists(
        select 1 from jsonb_object_keys(v_media) k where k not in ('asset_id','placement','position','caption')
      ) then raise exception 'Malformed CMS media relationship' using errcode='22023'; end if;
      perform (v_media->>'asset_id')::uuid;
      if coalesce(v_media->>'placement','') not in ('featured','social','body','gallery','download')
         or coalesce((v_media->>'position')::integer,0) not between 0 and 99
         or char_length(trim(coalesce(v_media->>'caption',''))) > 500 then
        raise exception 'Invalid CMS media placement' using errcode='22023';
      end if;
    end loop;
  end if;
  if nullif(p_document->>'featured_media_id','') is not null and not exists(
    select 1 from jsonb_array_elements(coalesce(p_document->'media','[]'::jsonb)) m
    where m->>'asset_id'=p_document->>'featured_media_id' and m->>'placement'='featured'
  ) then raise exception 'Featured media must have a matching controlled relationship' using errcode='22023'; end if;
  if nullif(p_document->>'social_media_id','') is not null and not exists(
    select 1 from jsonb_array_elements(coalesce(p_document->'media','[]'::jsonb)) m
    where m->>'asset_id'=p_document->>'social_media_id' and m->>'placement'='social'
  ) then raise exception 'Social media must have a matching controlled relationship' using errcode='22023'; end if;
  for v_block in select value from jsonb_array_elements(p_document->'blocks') loop
    if v_block->>'type' in ('image','video') and not exists(
      select 1 from jsonb_array_elements(coalesce(p_document->'media','[]'::jsonb)) m
      where m->>'asset_id'=v_block#>>'{payload,asset_id}'
    ) then raise exception 'Block media must have a matching controlled relationship' using errcode='22023'; end if;
    if v_block->>'type'='gallery' and exists(
      select 1 from jsonb_array_elements(v_block#>'{payload,asset_ids}') a
      where not exists(
        select 1 from jsonb_array_elements(coalesce(p_document->'media','[]'::jsonb)) m
        where m->>'asset_id'=a#>>'{}'
      )
    ) then raise exception 'Gallery media must have matching controlled relationships' using errcode='22023'; end if;
  end loop;
  v_effective:=nullif(p_document->>'effective_from','')::timestamptz;
  v_expiry:=nullif(p_document->>'expires_at','')::timestamptz;
  if v_expiry is not null and v_effective is not null and v_expiry<=v_effective then raise exception 'CMS expiry must follow its effective time' using errcode='22023'; end if;
  if p_type='event' and p_document ? 'event' then
    if jsonb_typeof(p_document->'event')<>'object' then raise exception 'Event data must be an object' using errcode='22023'; end if;
    v_start:=nullif(p_document#>>'{event,starts_at}','')::timestamptz;
    v_end:=nullif(p_document#>>'{event,ends_at}','')::timestamptz;
    if v_end is not null and v_start is not null and v_end<v_start then raise exception 'Event end must not precede its start' using errcode='22023'; end if;
  end if;
end $$;
revoke all on function public.cms_validate_document(public.cms_content_type,jsonb) from public,anon,authenticated;

-- ---------------------------------------------------------------------------
-- Revision writer and editorial workflow RPCs
-- ---------------------------------------------------------------------------

create or replace function public.cms_insert_revision(
  p_entry_id uuid,p_revision_number integer,p_document jsonb,p_actor uuid,p_change_note text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_type public.cms_content_type; v_revision uuid; v_block jsonb; v_media jsonb; v_tag text; v_term text; v_tag_id uuid; v_position integer:=0;
begin
  select content_type into strict v_type from public.public_content_entries where id=p_entry_id;
  perform public.cms_validate_document(v_type,p_document);
  if char_length(trim(coalesce(p_change_note,''))) not between 3 and 500 then raise exception 'A revision change note is required' using errcode='22023'; end if;
  insert into public.public_content_revisions(
    entry_id,revision_number,title,summary,category,search_keywords,content_language,locale,classification,
    source_note,next_review_date,seo_title,seo_description,featured_media_id,social_media_id,effective_from,expires_at,
    event_starts_at,event_ends_at,event_venue,event_public_address,event_status,attendance_mode,
    public_action_label,public_action_path,metadata,created_by,change_note
  ) values (
    p_entry_id,p_revision_number,trim(p_document->>'title'),trim(p_document->>'summary'),nullif(trim(p_document->>'category'),''),
    array(select distinct lower(trim(value)) from jsonb_array_elements_text(coalesce(p_document->'search_keywords','[]'::jsonb)) where char_length(trim(value)) between 2 and 80),
    coalesce(nullif(p_document->>'language',''),'en'),coalesce(nullif(p_document->>'locale',''),'en-NG'),
    coalesce(p_document->>'classification','public')::public.cms_content_classification,nullif(trim(p_document->>'source_note'),''),
    nullif(p_document->>'next_review_date','')::date,nullif(trim(p_document->>'seo_title'),''),nullif(trim(p_document->>'seo_description'),''),
    nullif(p_document->>'featured_media_id','')::uuid,nullif(p_document->>'social_media_id','')::uuid,
    nullif(p_document->>'effective_from','')::timestamptz,nullif(p_document->>'expires_at','')::timestamptz,
    nullif(p_document#>>'{event,starts_at}','')::timestamptz,nullif(p_document#>>'{event,ends_at}','')::timestamptz,
    nullif(trim(p_document#>>'{event,venue}'),''),nullif(trim(p_document#>>'{event,public_address}'),''),
    nullif(p_document#>>'{event,status}',''),nullif(p_document#>>'{event,attendance_mode}',''),
    nullif(trim(p_document#>>'{event,action_label}'),''),nullif(trim(p_document#>>'{event,action_path}'),''),
    coalesce(p_document->'metadata','{}'::jsonb),p_actor,trim(p_change_note)
  ) returning id into v_revision;
  v_position:=0;
  for v_block in select value from jsonb_array_elements(p_document->'blocks') loop
    insert into public.public_content_blocks(revision_id,block_position,block_type,payload,created_by)
    values(v_revision,v_position,(v_block->>'type')::public.cms_block_type,v_block->'payload',p_actor);
    v_position:=v_position+1;
  end loop;
  for v_tag in select distinct lower(trim(value)) from jsonb_array_elements_text(coalesce(p_document->'tags','[]'::jsonb)) loop
    if v_tag !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(v_tag) not between 2 and 80 then raise exception 'Invalid CMS tag' using errcode='22023'; end if;
    insert into public.public_content_tags(slug,name) values(v_tag,initcap(replace(v_tag,'-',' '))) on conflict(slug) do nothing;
    select id into strict v_tag_id from public.public_content_tags where slug=v_tag;
    insert into public.public_content_tag_links(revision_id,tag_id) values(v_revision,v_tag_id);
  end loop;
  for v_term in select distinct lower(trim(value)) from jsonb_array_elements_text(coalesce(p_document->'search_terms','[]'::jsonb)) loop
    if char_length(v_term) not between 2 and 80 then raise exception 'Invalid verified search term' using errcode='22023'; end if;
    insert into public.public_content_search_terms(revision_id,term) values(v_revision,v_term);
  end loop;
  if p_document ? 'media' then
    for v_media in select value from jsonb_array_elements(p_document->'media') loop
      insert into public.public_content_media(revision_id,media_id,placement,placement_position,caption)
      values(v_revision,(v_media->>'asset_id')::uuid,v_media->>'placement',coalesce((v_media->>'position')::integer,0),nullif(trim(v_media->>'caption'),''));
    end loop;
  end if;
  return v_revision;
end $$;
revoke all on function public.cms_insert_revision(uuid,integer,jsonb,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.cms_create_entry(
  p_content_type public.cms_content_type,p_slug text,p_document jsonb,p_change_note text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_entry uuid; v_revision uuid;
begin
  if not public.cms_current_actor_can('draft') then raise exception 'CMS drafting authority required' using errcode='42501'; end if;
  if p_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(p_slug) not between 2 and 120 then raise exception 'Invalid lowercase CMS slug' using errcode='22023'; end if;
  if exists(select 1 from public.public_content_slug_aliases a where a.alias_path=public.cms_canonical_path(p_content_type,p_slug)) then raise exception 'CMS slug conflicts with a retained alias' using errcode='23505'; end if;
  insert into public.public_content_entries(content_type,slug,created_by) values(p_content_type,p_slug,v_actor) returning id into v_entry;
  v_revision:=public.cms_insert_revision(v_entry,1,p_document,v_actor,p_change_note);
  update public.public_content_entries set current_revision_number=1,current_revision_id=v_revision,updated_at=now() where id=v_entry;
  insert into public.public_publication_events(entry_id,revision_id,actor_id,action,new_status,reason)
  values(v_entry,v_revision,v_actor,'draft_created','draft',trim(p_change_note));
  return v_entry;
end $$;
revoke all on function public.cms_create_entry(public.cms_content_type,text,jsonb,text) from public,anon;
grant execute on function public.cms_create_entry(public.cms_content_type,text,jsonb,text) to authenticated;

create or replace function public.cms_create_revision(
  p_entry_id uuid,p_expected_version integer,p_document jsonb,p_change_note text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_entry public.public_content_entries%rowtype; v_revision uuid; v_previous public.cms_workflow_status;
begin
  if not public.cms_current_actor_can('draft') then raise exception 'CMS drafting authority required' using errcode='42501'; end if;
  select * into v_entry from public.public_content_entries where id=p_entry_id for update;
  if not found then raise exception 'CMS entry not found' using errcode='P0002'; end if;
  if v_entry.current_revision_number<>p_expected_version then raise exception 'CMS revision conflict' using errcode='40001'; end if;
  v_previous:=v_entry.workflow_status;
  v_revision:=public.cms_insert_revision(p_entry_id,p_expected_version+1,p_document,v_actor,p_change_note);
  update public.public_content_entries set current_revision_number=p_expected_version+1,current_revision_id=v_revision,
    workflow_status='draft',
    published_revision_id=case when v_entry.archived_at is not null then null else published_revision_id end,
    published_at=case when v_entry.archived_at is not null then null else published_at end,
    scheduled_revision_id=null,scheduled_for=null,archived_at=null,archived_by=null,archive_reason=null,updated_at=now()
  where id=p_entry_id;
  insert into public.public_publication_events(entry_id,revision_id,actor_id,action,previous_status,new_status,reason)
  values(p_entry_id,v_revision,v_actor,'revision_created',v_previous,'draft',trim(p_change_note));
  return v_revision;
end $$;
revoke all on function public.cms_create_revision(uuid,integer,jsonb,text) from public,anon;
grant execute on function public.cms_create_revision(uuid,integer,jsonb,text) to authenticated;

create or replace function public.cms_submit_for_review(p_entry_id uuid,p_reason text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_entry public.public_content_entries%rowtype;
begin
  if not public.cms_current_actor_can('draft') then raise exception 'CMS drafting authority required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'A review reason is required' using errcode='22023'; end if;
  select * into v_entry from public.public_content_entries where id=p_entry_id for update;
  if not found or v_entry.current_revision_id is null or v_entry.workflow_status not in ('draft','changes_requested','approved','published') then raise exception 'CMS draft is not reviewable' using errcode='22023'; end if;
  update public.public_content_entries set workflow_status='in_review',updated_at=now() where id=p_entry_id;
  insert into public.public_publication_events(entry_id,revision_id,actor_id,action,previous_status,new_status,reason)
  values(p_entry_id,v_entry.current_revision_id,v_actor,'submitted_review',v_entry.workflow_status,'in_review',trim(p_reason));
  return true;
end $$;
revoke all on function public.cms_submit_for_review(uuid,text) from public,anon;
grant execute on function public.cms_submit_for_review(uuid,text) to authenticated;

create or replace function public.cms_revision_has_approval(p_revision_id uuid,p_kind public.cms_approval_kind)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select coalesce((
    select a.decision='approved'::public.cms_approval_decision
    from public.public_content_approvals a
    where a.revision_id=p_revision_id and a.approval_kind=p_kind
    order by a.created_at desc,a.id desc limit 1
  ),false)
$$;
revoke all on function public.cms_revision_has_approval(uuid,public.cms_approval_kind) from public,anon,authenticated;

create or replace function public.cms_record_approval(
  p_entry_id uuid,p_kind public.cms_approval_kind,p_decision public.cms_approval_decision,p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_entry public.public_content_entries%rowtype; v_creator uuid; v_new public.cms_workflow_status;
begin
  if p_kind='safeguarding' and not public.cms_current_actor_can('safeguarding_review') then raise exception 'Safeguarding review authority required' using errcode='42501'; end if;
  if p_kind='publication' and not public.cms_current_actor_can('publish') then raise exception 'CMS publication authority required' using errcode='42501'; end if;
  if p_kind='factual' and not (public.cms_current_actor_can('review') or public.cms_current_actor_can('publish')) then raise exception 'CMS review authority required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'An approval reason is required' using errcode='22023'; end if;
  select * into v_entry from public.public_content_entries where id=p_entry_id for update;
  if not found or v_entry.current_revision_id is null or v_entry.workflow_status not in ('in_review','approved','changes_requested') then raise exception 'CMS entry is not in review' using errcode='22023'; end if;
  select created_by into strict v_creator from public.public_content_revisions where id=v_entry.current_revision_id;
  if p_kind='safeguarding' and v_creator=v_actor then raise exception 'Child-media creator cannot approve their own safeguarding review' using errcode='42501'; end if;
  insert into public.public_content_approvals(entry_id,revision_id,approval_kind,decision,reviewer_id,reason)
  values(p_entry_id,v_entry.current_revision_id,p_kind,p_decision,v_actor,trim(p_reason));
  v_new:=case when p_decision='approved'
    and public.cms_revision_has_approval(v_entry.current_revision_id,'factual')
    and public.cms_revision_has_approval(v_entry.current_revision_id,'publication') then 'approved'::public.cms_workflow_status
    when p_decision='approved' then v_entry.workflow_status
    else 'changes_requested'::public.cms_workflow_status end;
  update public.public_content_entries set workflow_status=v_new,updated_at=now() where id=p_entry_id;
  insert into public.public_publication_events(entry_id,revision_id,actor_id,action,previous_status,new_status,reason,detail)
  values(p_entry_id,v_entry.current_revision_id,v_actor,
    case when p_decision='approved' then 'approved' else 'changes_requested' end,
    v_entry.workflow_status,v_new,trim(p_reason),jsonb_build_object('approval_kind',p_kind::text,'decision',p_decision::text));
  return true;
end $$;
revoke all on function public.cms_record_approval(uuid,public.cms_approval_kind,public.cms_approval_decision,text) from public,anon;
grant execute on function public.cms_record_approval(uuid,public.cms_approval_kind,public.cms_approval_decision,text) to authenticated;

create or replace function public.cms_revision_is_publishable(p_revision_id uuid,p_emergency boolean default false)
returns boolean
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_revision public.public_content_revisions%rowtype; v_type public.cms_content_type; v_has_child boolean;
begin
  select r.* into v_revision
  from public.public_content_revisions r
  where r.id=p_revision_id;
  if found then
    select e.content_type into strict v_type
    from public.public_content_entries e
    where e.id=v_revision.entry_id;
  end if;
  if not found or v_revision.classification<>'public' or v_revision.source_note is null
     or v_revision.next_review_date is null or v_revision.next_review_date<current_date
     or (v_revision.expires_at is not null and v_revision.expires_at<=now())
     or not exists(select 1 from public.public_content_blocks b where b.revision_id=p_revision_id)
     or exists(select 1 from public.public_content_quality_findings q where q.revision_id=p_revision_id and q.status='open' and q.severity in ('error','hard_block')) then return false; end if;
  if v_type='event' and (v_revision.event_starts_at is null or v_revision.event_status is null or v_revision.attendance_mode is null) then return false; end if;
  if v_type='announcement' and v_revision.expires_at is null then return false; end if;
  if exists(
    select 1 from public.public_content_media cm join public.public_media_assets m on m.id=cm.media_id
    where cm.revision_id=p_revision_id and (
      m.lifecycle_state<>'approved' or m.archived_at is not null or m.provenance_status<>'verified'
      or m.consent_status in ('pending','denied','expired')
      or (m.child_identifiable and m.consent_status<>'approved')
    )
  ) then return false; end if;
  select exists(
    select 1 from public.public_content_media cm join public.public_media_assets m on m.id=cm.media_id
    where cm.revision_id=p_revision_id and m.child_identifiable
  ) into v_has_child;
  if v_has_child and not p_emergency and not public.cms_revision_has_approval(p_revision_id,'safeguarding') then return false; end if;
  if not p_emergency and (
    not public.cms_revision_has_approval(p_revision_id,'factual')
    or not public.cms_revision_has_approval(p_revision_id,'publication')
  ) then return false; end if;
  return true;
end $$;
revoke all on function public.cms_revision_is_publishable(uuid,boolean) from public,anon,authenticated;

create or replace function public.cms_publish(
  p_entry_id uuid,p_reason text,p_scheduled_for timestamptz default null,p_emergency boolean default false
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_entry public.public_content_entries%rowtype; v_revision public.public_content_revisions%rowtype; v_new public.cms_workflow_status;
begin
  if not public.cms_current_actor_can('publish') then raise exception 'CMS publication authority required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then raise exception 'A publication reason is required' using errcode='22023'; end if;
  select * into v_entry from public.public_content_entries where id=p_entry_id for update;
  if not found or v_entry.current_revision_id is null then raise exception 'CMS entry not found' using errcode='P0002'; end if;
  select * into strict v_revision from public.public_content_revisions where id=v_entry.current_revision_id;
  if p_emergency then
    if not public.cms_current_actor_can('emergency_publish') or char_length(trim(p_reason))<12 then raise exception 'Proprietress emergency publication and a detailed reason are required' using errcode='42501'; end if;
    if v_revision.expires_at is null or v_revision.expires_at>now()+interval '7 days' then raise exception 'Emergency publication must expire within seven days' using errcode='22023'; end if;
  elsif v_entry.workflow_status<>'approved' then raise exception 'Approved CMS revision required' using errcode='22023'; end if;
  if not public.cms_revision_is_publishable(v_entry.current_revision_id,p_emergency) then raise exception 'CMS revision has unresolved publication blockers' using errcode='22023'; end if;
  if exists(
    select 1 from public.public_content_entries e
    join public.public_content_revisions r on r.id=e.published_revision_id
    where e.id<>p_entry_id and e.archived_at is null and r.seo_title is not null
      and lower(r.seo_title)=lower(v_revision.seo_title)
  ) then raise exception 'Published SEO title must be unique' using errcode='23505'; end if;
  if p_scheduled_for is not null and p_scheduled_for>now()+interval '1 minute' then
    if (v_revision.expires_at is not null and p_scheduled_for>=v_revision.expires_at)
       or p_scheduled_for::date>v_revision.next_review_date then
      raise exception 'Schedule must precede content expiry and review deadline' using errcode='22023';
    end if;
    v_new:='scheduled';
    update public.public_content_entries set workflow_status=v_new,scheduled_revision_id=current_revision_id,
      scheduled_for=p_scheduled_for,updated_at=now() where id=p_entry_id;
    insert into public.public_publication_events(entry_id,revision_id,actor_id,action,previous_status,new_status,reason,detail)
    values(p_entry_id,v_entry.current_revision_id,v_actor,'scheduled',v_entry.workflow_status,v_new,trim(p_reason),jsonb_build_object('scheduled_for',p_scheduled_for));
  else
    v_new:='published';
    update public.public_content_entries set workflow_status=v_new,published_revision_id=current_revision_id,
      published_at=now(),scheduled_revision_id=null,scheduled_for=null,archived_at=null,archived_by=null,archive_reason=null,updated_at=now()
    where id=p_entry_id;
    insert into public.public_publication_events(entry_id,revision_id,actor_id,action,previous_status,new_status,reason,detail)
    values(p_entry_id,v_entry.current_revision_id,v_actor,'published',v_entry.workflow_status,v_new,trim(p_reason),jsonb_build_object('emergency',p_emergency));
  end if;
  return true;
end $$;
revoke all on function public.cms_publish(uuid,text,timestamptz,boolean) from public,anon;
grant execute on function public.cms_publish(uuid,text,timestamptz,boolean) to authenticated;

create or replace function public.cms_publish_due()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer:=0; v_entry record;
begin
  if coalesce((select auth.role()),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then raise exception 'Service scheduler required' using errcode='42501'; end if;
  for v_entry in
    select id,scheduled_revision_id,workflow_status from public.public_content_entries
    where workflow_status='scheduled' and scheduled_revision_id is not null and scheduled_for<=now() and archived_at is null
    for update skip locked
  loop
    if not public.cms_revision_is_publishable(v_entry.scheduled_revision_id,false) then
      update public.public_content_entries set workflow_status='changes_requested',
        scheduled_revision_id=null,scheduled_for=null,updated_at=now() where id=v_entry.id;
      insert into public.public_publication_events(entry_id,revision_id,action,previous_status,new_status,reason)
      values(v_entry.id,v_entry.scheduled_revision_id,'changes_requested',v_entry.workflow_status,'changes_requested','Scheduled publication blockers detected');
    else
      update public.public_content_entries set workflow_status='published',published_revision_id=scheduled_revision_id,
        published_at=now(),scheduled_revision_id=null,scheduled_for=null,updated_at=now() where id=v_entry.id;
      insert into public.public_publication_events(entry_id,revision_id,action,previous_status,new_status,reason)
      values(v_entry.id,v_entry.scheduled_revision_id,'scheduled_published',v_entry.workflow_status,'published','Scheduled publication time reached');
      v_count:=v_count+1;
    end if;
  end loop;
  return v_count;
end $$;
revoke all on function public.cms_publish_due() from public,anon,authenticated;
grant execute on function public.cms_publish_due() to service_role;

create or replace function public.cms_archive(p_entry_id uuid,p_reason text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_entry public.public_content_entries%rowtype;
begin
  if not public.cms_current_actor_can('publish') then raise exception 'CMS publication authority required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 8 and 500 then raise exception 'An archive reason is required' using errcode='22023'; end if;
  select * into v_entry from public.public_content_entries where id=p_entry_id for update;
  if not found or v_entry.workflow_status='archived' then raise exception 'Active CMS entry required' using errcode='22023'; end if;
  update public.public_content_entries set workflow_status='archived',archived_at=now(),archived_by=v_actor,
    archive_reason=trim(p_reason),scheduled_revision_id=null,scheduled_for=null,updated_at=now() where id=p_entry_id;
  insert into public.public_publication_events(entry_id,revision_id,actor_id,action,previous_status,new_status,reason)
  values(p_entry_id,v_entry.current_revision_id,v_actor,'archived',v_entry.workflow_status,'archived',trim(p_reason));
  return true;
end $$;
revoke all on function public.cms_archive(uuid,text) from public,anon;
grant execute on function public.cms_archive(uuid,text) to authenticated;

create or replace function public.cms_restore_revision(p_entry_id uuid,p_revision_id uuid,p_note text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_entry public.public_content_entries%rowtype; v_source public.public_content_revisions%rowtype; v_new uuid; v_number integer;
begin
  if not public.cms_current_actor_can('draft') then raise exception 'CMS drafting authority required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_note,''))) not between 8 and 500 then raise exception 'A restore reason is required' using errcode='22023'; end if;
  select * into v_entry from public.public_content_entries where id=p_entry_id for update;
  select * into v_source from public.public_content_revisions where id=p_revision_id and entry_id=p_entry_id;
  if not found then raise exception 'Revision does not belong to this entry' using errcode='22023'; end if;
  v_number:=v_entry.current_revision_number+1;
  insert into public.public_content_revisions(
    entry_id,revision_number,title,summary,category,search_keywords,content_language,locale,classification,
    source_note,next_review_date,seo_title,seo_description,featured_media_id,social_media_id,effective_from,expires_at,
    event_starts_at,event_ends_at,event_timezone,event_venue,event_public_address,event_status,attendance_mode,
    public_action_label,public_action_path,metadata,created_by,change_note
  ) select entry_id,v_number,title,summary,category,search_keywords,content_language,locale,classification,
    source_note,next_review_date,seo_title,seo_description,featured_media_id,social_media_id,effective_from,expires_at,
    event_starts_at,event_ends_at,event_timezone,event_venue,event_public_address,event_status,attendance_mode,
    public_action_label,public_action_path,metadata,v_actor,trim(p_note)
  from public.public_content_revisions where id=p_revision_id returning id into v_new;
  insert into public.public_content_blocks(revision_id,block_position,block_type,payload,created_by)
  select v_new,block_position,block_type,payload,v_actor from public.public_content_blocks where revision_id=p_revision_id;
  insert into public.public_content_tag_links(revision_id,tag_id) select v_new,tag_id from public.public_content_tag_links where revision_id=p_revision_id;
  insert into public.public_content_media(revision_id,media_id,placement,placement_position,caption)
  select v_new,media_id,placement,placement_position,caption from public.public_content_media where revision_id=p_revision_id;
  insert into public.public_content_search_terms(revision_id,term,source)
  select v_new,term,source from public.public_content_search_terms where revision_id=p_revision_id;
  update public.public_content_entries set current_revision_number=v_number,current_revision_id=v_new,workflow_status='draft',
    published_revision_id=case when v_entry.archived_at is not null then null else published_revision_id end,
    published_at=case when v_entry.archived_at is not null then null else published_at end,
    scheduled_revision_id=null,scheduled_for=null,archived_at=null,archived_by=null,archive_reason=null,updated_at=now()
  where id=p_entry_id;
  insert into public.public_publication_events(entry_id,revision_id,actor_id,action,previous_status,new_status,reason,detail)
  values(p_entry_id,v_new,v_actor,'revision_restored',v_entry.workflow_status,'draft',trim(p_note),jsonb_build_object('restored_revision_number',v_source.revision_number));
  return v_new;
end $$;
revoke all on function public.cms_restore_revision(uuid,uuid,text) from public,anon;
grant execute on function public.cms_restore_revision(uuid,uuid,text) to authenticated;

create or replace function public.cms_change_slug(p_entry_id uuid,p_new_slug text,p_reason text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_entry public.public_content_entries%rowtype; v_new_path text;
begin
  if not public.cms_current_actor_can('publish') then raise exception 'CMS publication authority required' using errcode='42501'; end if;
  if p_new_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(p_new_slug) not between 2 and 120 then raise exception 'Invalid lowercase CMS slug' using errcode='22023'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 8 and 500 then raise exception 'A slug-change reason is required' using errcode='22023'; end if;
  select * into v_entry from public.public_content_entries where id=p_entry_id for update;
  if not found then raise exception 'CMS entry not found' using errcode='P0002'; end if;
  v_new_path:=public.cms_canonical_path(v_entry.content_type,p_new_slug);
  if exists(select 1 from public.public_content_entries where slug=p_new_slug and id<>p_entry_id)
     or exists(select 1 from public.public_content_slug_aliases where alias_path=v_new_path) then raise exception 'CMS slug or alias conflict' using errcode='23505'; end if;
  insert into public.public_content_slug_aliases(alias_path,entry_id,reason,created_by)
  values(v_entry.canonical_path,p_entry_id,trim(p_reason),v_actor);
  update public.public_content_entries set slug=p_new_slug,updated_at=now() where id=p_entry_id;
  insert into public.public_publication_events(entry_id,revision_id,actor_id,action,previous_status,new_status,reason,detail)
  values(p_entry_id,v_entry.current_revision_id,v_actor,'slug_changed',v_entry.workflow_status,v_entry.workflow_status,trim(p_reason),jsonb_build_object('former_path',v_entry.canonical_path,'new_path',v_new_path));
  return true;
end $$;
revoke all on function public.cms_change_slug(uuid,text,text) from public,anon;
grant execute on function public.cms_change_slug(uuid,text,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Published-only helpers and projections
-- ---------------------------------------------------------------------------

create or replace function public.cms_revision_is_public(p_revision_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.public_content_entries e
    join public.public_content_revisions r on r.id=e.published_revision_id
    where r.id=p_revision_id and e.archived_at is null and e.cancelled_at is null
      and r.classification='public'::public.cms_content_classification
      and (r.effective_from is null or r.effective_from<=now())
      and (r.expires_at is null or r.expires_at>now())
  )
$$;
revoke all on function public.cms_revision_is_public(uuid) from public;
grant execute on function public.cms_revision_is_public(uuid) to anon,authenticated,service_role;

create or replace view public.public_cms_published_entries
with (security_invoker=true,security_barrier=true)
as
select e.id,e.content_type,e.slug,e.canonical_path,e.published_at,
  r.id as revision_id,r.revision_number,r.title,r.summary,r.category,r.search_keywords,
  r.content_language,r.locale,r.source_note,r.next_review_date,r.seo_title,r.seo_description,
  r.featured_media_id,r.social_media_id,r.effective_from,r.expires_at,
  r.event_starts_at,r.event_ends_at,r.event_timezone,r.event_venue,r.event_public_address,
  r.event_status,r.attendance_mode,r.public_action_label,r.public_action_path,r.metadata
from public.public_content_entries e
join public.public_content_revisions r on r.id=e.published_revision_id
where e.archived_at is null and e.cancelled_at is null
  and r.classification='public'::public.cms_content_classification
  and (r.effective_from is null or r.effective_from<=now())
  and (r.expires_at is null or r.expires_at>now());

create or replace view public.public_cms_published_blocks
with (security_invoker=true,security_barrier=true)
as
select b.id,b.revision_id,b.block_position,b.block_type,b.payload
from public.public_content_blocks b
where public.cms_revision_is_public(b.revision_id);

create or replace view public.public_cms_published_media
with (security_invoker=true,security_barrier=true)
as
select cm.revision_id,cm.placement,cm.placement_position,cm.caption,
  m.id as media_id,m.provider,m.provider_asset_id,m.media_type,m.title,m.alt_text,m.attribution,
  m.width,m.height,m.duration_seconds,m.public_derivative_only
from public.public_content_media cm
join public.public_media_assets m on m.id=cm.media_id
where public.cms_revision_is_public(cm.revision_id)
  and m.lifecycle_state='approved' and m.archived_at is null
  and m.provenance_status='verified'
  and (m.consent_status='approved' or (not m.child_identifiable and m.consent_status='not_required'));

create or replace view public.public_cms_published_slots
with (security_invoker=true,security_barrier=true)
as
select s.id,s.slot_key,s.slot_position,s.entry_id,e.canonical_path,e.content_type,r.title,r.summary
from public.public_site_content_slots s
join public.public_content_entries e on e.id=s.entry_id
join public.public_content_revisions r on r.id=e.published_revision_id
where s.active and (s.effective_from is null or s.effective_from<=now())
  and (s.expires_at is null or s.expires_at>now())
  and public.cms_revision_is_public(r.id);

create or replace view public.public_cms_published_navigation
with (security_invoker=true,security_barrier=true)
as
select n.id,n.navigation_key,n.label,n.href,n.entry_id,n.item_position
from public.public_site_navigation_items n
where n.active and (n.entry_id is null or exists(
  select 1 from public.public_content_entries e where e.id=n.entry_id and public.cms_revision_is_public(e.published_revision_id)
));

create or replace view public.public_cms_slug_redirects
with (security_invoker=true,security_barrier=true)
as
select a.alias_path,e.canonical_path as destination_path
from public.public_content_slug_aliases a
join public.public_content_entries e on e.id=a.entry_id
where public.cms_revision_is_public(e.published_revision_id);

-- ---------------------------------------------------------------------------
-- Row Level Security and privileges
-- ---------------------------------------------------------------------------

alter table public.public_cms_capabilities enable row level security;
alter table public.public_cms_capability_events enable row level security;
alter table public.public_media_assets enable row level security;
alter table public.public_content_entries enable row level security;
alter table public.public_content_revisions enable row level security;
alter table public.public_content_blocks enable row level security;
alter table public.public_content_tags enable row level security;
alter table public.public_content_tag_links enable row level security;
alter table public.public_content_media enable row level security;
alter table public.public_content_slug_aliases enable row level security;
alter table public.public_publication_events enable row level security;
alter table public.public_content_approvals enable row level security;
alter table public.public_site_content_slots enable row level security;
alter table public.public_content_quality_findings enable row level security;
alter table public.public_content_search_terms enable row level security;
alter table public.public_site_navigation_items enable row level security;
alter table public.public_content_views_daily enable row level security;
alter table public.public_content_reactions enable row level security;
alter table public.public_content_comments enable row level security;
alter table public.public_comment_moderation_events enable row level security;

create policy public_content_entries_published_select on public.public_content_entries for select to anon,authenticated
using (published_revision_id is not null and archived_at is null and cancelled_at is null
  and public.cms_revision_is_public(published_revision_id));
create policy public_content_entries_private_select on public.public_content_entries for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_content_revisions_published_select on public.public_content_revisions for select to anon,authenticated
using (public.cms_revision_is_public(id));
create policy public_content_revisions_private_select on public.public_content_revisions for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_content_blocks_published_select on public.public_content_blocks for select to anon,authenticated
using (public.cms_revision_is_public(revision_id));
create policy public_content_blocks_private_select on public.public_content_blocks for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_content_tags_published_select on public.public_content_tags for select to anon,authenticated
using (exists(select 1 from public.public_content_tag_links l where l.tag_id=id and public.cms_revision_is_public(l.revision_id)));
create policy public_content_tags_private_select on public.public_content_tags for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_content_tag_links_published_select on public.public_content_tag_links for select to anon,authenticated
using (public.cms_revision_is_public(revision_id));
create policy public_content_tag_links_private_select on public.public_content_tag_links for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_media_assets_published_select on public.public_media_assets for select to anon,authenticated
using (lifecycle_state='approved' and archived_at is null and provenance_status='verified'
  and (consent_status='approved' or (not child_identifiable and consent_status='not_required'))
  and exists(select 1 from public.public_content_media cm where cm.media_id=id and public.cms_revision_is_public(cm.revision_id)));
create policy public_media_assets_private_select on public.public_media_assets for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_content_media_published_select on public.public_content_media for select to anon,authenticated
using (public.cms_revision_is_public(revision_id));
create policy public_content_media_private_select on public.public_content_media for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_content_aliases_published_select on public.public_content_slug_aliases for select to anon,authenticated
using (exists(select 1 from public.public_content_entries e where e.id=entry_id and public.cms_revision_is_public(e.published_revision_id)));
create policy public_content_aliases_private_select on public.public_content_slug_aliases for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_site_slots_published_select on public.public_site_content_slots for select to anon,authenticated
using (active and (effective_from is null or effective_from<=now()) and (expires_at is null or expires_at>now())
  and exists(select 1 from public.public_content_entries e where e.id=entry_id and public.cms_revision_is_public(e.published_revision_id)));
create policy public_site_slots_private_select on public.public_site_content_slots for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_search_terms_published_select on public.public_content_search_terms for select to anon,authenticated
using (public.cms_revision_is_public(revision_id));
create policy public_search_terms_private_select on public.public_content_search_terms for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_navigation_published_select on public.public_site_navigation_items for select to anon,authenticated
using (active and (entry_id is null or exists(select 1 from public.public_content_entries e where e.id=entry_id and public.cms_revision_is_public(e.published_revision_id))));
create policy public_navigation_private_select on public.public_site_navigation_items for select to authenticated
using (public.cms_current_actor_can('view_private'));

create policy public_cms_capabilities_private_select on public.public_cms_capabilities for select to authenticated
using (profile_id=(select auth.uid()) or public.cms_current_actor_can('administer'));
create policy public_cms_capability_events_private_select on public.public_cms_capability_events for select to authenticated
using (profile_id=(select auth.uid()) or public.cms_current_actor_can('administer'));
create policy public_publication_events_private_select on public.public_publication_events for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_content_approvals_private_select on public.public_content_approvals for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_quality_findings_private_select on public.public_content_quality_findings for select to authenticated
using (public.cms_current_actor_can('view_private'));

-- Engagement remains fail-closed: no policies or role grants until Run 9.

revoke all on table
  public.public_cms_capabilities,public.public_cms_capability_events,public.public_media_assets,
  public.public_content_entries,public.public_content_revisions,public.public_content_blocks,
  public.public_content_tags,public.public_content_tag_links,public.public_content_media,
  public.public_content_slug_aliases,public.public_publication_events,public.public_content_approvals,
  public.public_site_content_slots,public.public_content_quality_findings,public.public_content_search_terms,
  public.public_site_navigation_items,public.public_content_views_daily,public.public_content_reactions,
  public.public_content_comments,public.public_comment_moderation_events
from public,anon,authenticated,service_role;

revoke all on sequence public.public_cms_capability_events_id_seq,public.public_publication_events_id_seq,
  public.public_content_approvals_id_seq,public.public_comment_moderation_events_id_seq
from public,anon,authenticated,service_role;

grant select on table
  public.public_media_assets,public.public_content_entries,public.public_content_revisions,
  public.public_content_blocks,public.public_content_tags,public.public_content_tag_links,
  public.public_content_media,public.public_content_slug_aliases,public.public_site_content_slots,
  public.public_content_search_terms,public.public_site_navigation_items
  to anon,authenticated;
grant select on table
  public.public_cms_capabilities,public.public_cms_capability_events,
  public.public_publication_events,public.public_content_approvals,public.public_content_quality_findings
  to authenticated;
grant select on table
  public.public_cms_capabilities,public.public_cms_capability_events,public.public_media_assets,
  public.public_content_entries,public.public_content_revisions,public.public_content_blocks,
  public.public_content_tags,public.public_content_tag_links,public.public_content_media,
  public.public_content_slug_aliases,public.public_publication_events,public.public_content_approvals,
  public.public_site_content_slots,public.public_content_quality_findings,public.public_content_search_terms,
  public.public_site_navigation_items,public.public_content_views_daily,public.public_content_reactions,
  public.public_content_comments,public.public_comment_moderation_events
  to service_role;

grant select on table
  public.public_cms_published_entries,public.public_cms_published_blocks,public.public_cms_published_media,
  public.public_cms_published_slots,public.public_cms_published_navigation,public.public_cms_slug_redirects
  to anon,authenticated,service_role;

comment on table public.public_content_entries is 'Stable CMS content identities and workflow pointers. No content is seeded or activated by Run 5.';
comment on table public.public_content_revisions is 'Immutable source revisions; publication points at one accepted revision while later drafts remain private.';
comment on table public.public_content_blocks is 'Allowlisted structured blocks only; executable HTML and script payloads are rejected.';
comment on table public.public_media_assets is 'Metadata and consent boundary only. Run 6 adds the school-owned media provider; no child media is imported here.';
comment on table public.public_publication_events is 'Immutable code-free editorial audit trail.';
comment on table public.public_content_search_terms is 'Controlled editor vocabulary attached to content, never retained raw visitor queries.';
comment on table public.public_content_views_daily is 'Privacy-safe aggregate foundation; feature remains dormant until Run 9.';
comment on table public.public_content_reactions is 'Signed-in like foundation; feature remains dormant until Run 9.';
comment on table public.public_content_comments is 'Signed-in premoderated comment foundation; feature remains dormant until Run 9.';
comment on view public.public_cms_published_entries is 'Current effective, unexpired, public-classified published revisions only.';

commit;
