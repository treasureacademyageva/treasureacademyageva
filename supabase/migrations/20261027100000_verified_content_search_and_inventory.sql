-- Treasure Academy verified-content migration, core slots, Search and safe inventory
-- Run 10 technical boundary. This migration is additive/data-neutral: it stages no
-- candidate, publishes no wording, reconciles no inventory and activates no gate.

begin;

-- ---------------------------------------------------------------------------
-- Verified operational information: fixed public projection and stale controls
-- ---------------------------------------------------------------------------

alter table public.verified_public_information
  add column if not exists source_path text,
  add column if not exists source_note text,
  add column if not exists accountable_owner text,
  add column if not exists next_review_date date;

alter table public.verified_public_information
  drop constraint if exists verified_public_information_source_path_check,
  add constraint verified_public_information_source_path_check check (
    source_path is null or (
      source_path ~ '^/[a-zA-Z0-9/_?#=&.%-]*$'
      and source_path !~ '//'
      and source_path !~ '(^|/)\.\.(/|$)'
      and char_length(source_path) between 1 and 500
    )
  ),
  drop constraint if exists verified_public_information_source_note_check,
  add constraint verified_public_information_source_note_check check (
    source_note is null or char_length(trim(source_note)) between 3 and 2000
  ),
  drop constraint if exists verified_public_information_owner_check,
  add constraint verified_public_information_owner_check check (
    accountable_owner is null or char_length(trim(accountable_owner)) between 2 and 120
  ),
  drop constraint if exists verified_public_information_publishable_check,
  add constraint verified_public_information_publishable_check check (
    status<>'published'::public.publication_status or (
      source_path is not null and source_note is not null and accountable_owner is not null
      and next_review_date is not null and reviewed_at is not null
      and published_by is not null and published_at is not null
    )
  ) not valid;
alter table public.verified_public_information
  validate constraint verified_public_information_publishable_check;

alter table public.public_information_events
  add column if not exists reason text not null default 'Portal publication workflow'
    check (char_length(trim(reason)) between 8 and 500);

create or replace function public.guard_public_information()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  if new.title ~ '[<>]' or new.summary ~ '[<>]' or coalesce(new.detail,'') ~ '[<>]'
     or coalesce(new.source_note,'') ~* '(password|otp|secret|token|credential|payment proof|safeguarding incident)' then
    raise exception 'Public information contains unsupported or private material' using errcode='22023';
  end if;

  if coalesce((select auth.role()),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then
    if not (select public.is_admin()) then
      raise exception 'Administrator publication required' using errcode='42501';
    end if;
    if tg_op='INSERT' then
      new.created_by:=(select auth.uid());
      new.published_by:=null;
      new.published_at:=null;
      new.reviewed_at:=null;
      if new.status='archived'::public.publication_status then
        raise exception 'A new publication begins as draft or published' using errcode='22023';
      end if;
    else
      if new.id is distinct from old.id or new.created_by is distinct from old.created_by
         or new.created_at is distinct from old.created_at or new.revision is distinct from old.revision then
        raise exception 'Publication identity, ownership and revision identifiers are immutable' using errcode='42501';
      end if;
      if new.published_by is distinct from old.published_by or new.published_at is distinct from old.published_at
         or new.reviewed_at is distinct from old.reviewed_at then
        raise exception 'Publication review fields are managed by the database' using errcode='42501';
      end if;
      if old.status<>'draft'::public.publication_status and (
        new.topic is distinct from old.topic or new.title is distinct from old.title
        or new.summary is distinct from old.summary or new.detail is distinct from old.detail
        or new.effective_from is distinct from old.effective_from
        or new.effective_until is distinct from old.effective_until
        or new.source_path is distinct from old.source_path
        or new.source_note is distinct from old.source_note
        or new.accountable_owner is distinct from old.accountable_owner
        or new.next_review_date is distinct from old.next_review_date
      ) then
        raise exception 'Published information is immutable; create a new revision' using errcode='42501';
      end if;
      if new.status is distinct from old.status and not (
        (old.status='draft'::public.publication_status and new.status='published'::public.publication_status)
        or (old.status='published'::public.publication_status and new.status='archived'::public.publication_status)
      ) then raise exception 'Invalid publication status transition' using errcode='22023'; end if;
    end if;

    if new.status='published'::public.publication_status and (tg_op='INSERT' or old.status<>new.status) then
      if new.source_path is null or new.source_note is null or new.accountable_owner is null
         or new.next_review_date is null or new.next_review_date<current_date then
        raise exception 'Source, accountable owner and a current next-review date are required' using errcode='22023';
      end if;
      new.published_by:=(select auth.uid());
      new.published_at:=now();
      new.reviewed_at:=now();
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_public_information() from public,anon,authenticated;

create trigger public_information_events_immutable
before update or delete on public.public_information_events
for each row execute function public.cms_reject_mutation();

create trigger verified_public_information_no_delete
before delete on public.verified_public_information
for each row execute function public.cms_prevent_hard_delete();

drop policy if exists verified_public_information_public_select on public.verified_public_information;
revoke select on public.verified_public_information from anon;

create or replace view public.public_verified_information
with (security_invoker=false,security_barrier=true)
as
select id,topic,title,summary,detail,revision,source_path,
  effective_from,effective_until,published_at,reviewed_at,next_review_date
from public.verified_public_information
where status='published'::public.publication_status
  and published_at is not null and reviewed_at is not null
  and source_path is not null
  and (effective_from is null or effective_from<=current_date)
  and (effective_until is null or effective_until>=current_date)
  and next_review_date>=current_date;
revoke all on public.public_verified_information from public;
grant select on public.public_verified_information to anon,authenticated,service_role;

-- ---------------------------------------------------------------------------
-- Held migration candidates: text only, source-hashed and explicitly verified
-- ---------------------------------------------------------------------------

do $$ begin
  create type public.cms_migration_status as enum ('held','verified','rejected','imported');
exception when duplicate_object then null; end $$;

create table public.public_content_migration_candidates (
  id uuid primary key default gen_random_uuid(),
  source_key text not null check (source_key ~ '^[a-z0-9]+(?:[._/-][a-z0-9]+)*$' and char_length(source_key) between 3 and 240),
  source_kind text not null check (source_kind in ('repository_html','repository_data','owner_document','legacy_database')),
  source_locator text not null check (char_length(trim(source_locator)) between 1 and 500),
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  content_type public.cms_content_type not null,
  slug text not null check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 120),
  document jsonb not null check (jsonb_typeof(document)='object' and pg_column_size(document)<=262144),
  historical_child_media_held boolean not null default true,
  status public.cms_migration_status not null default 'held',
  staged_by uuid not null references public.profiles(id) on delete restrict,
  staged_at timestamptz not null default now(),
  verified_by uuid references public.profiles(id) on delete restrict,
  verified_at timestamptz,
  verification_reason text check (verification_reason is null or char_length(trim(verification_reason)) between 8 and 500),
  imported_entry_id uuid references public.public_content_entries(id) on delete restrict,
  imported_at timestamptz,
  unique(source_key,source_sha256),
  check ((status='held' and verified_by is null and verified_at is null and imported_entry_id is null and imported_at is null)
      or (status in ('verified','rejected') and verified_by is not null and verified_at is not null and imported_entry_id is null and imported_at is null)
      or (status='imported' and verified_by is not null and verified_at is not null and imported_entry_id is not null and imported_at is not null))
);

create table public.public_content_migration_events (
  id bigint generated always as identity primary key,
  candidate_id uuid not null references public.public_content_migration_candidates(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('staged','verified','rejected','imported')),
  reason text not null check (char_length(trim(reason)) between 8 and 500),
  created_at timestamptz not null default now()
);

create table public.public_content_revision_sources (
  revision_id uuid not null references public.public_content_revisions(id) on delete restrict,
  candidate_id uuid not null references public.public_content_migration_candidates(id) on delete restrict,
  source_sha256 text not null check (source_sha256 ~ '^[a-f0-9]{64}$'),
  linked_by uuid not null references public.profiles(id) on delete restrict,
  linked_at timestamptz not null default now(),
  primary key(revision_id,candidate_id)
);

create index public_content_migration_status_idx
  on public.public_content_migration_candidates(status,staged_at desc);
create index public_content_revision_sources_candidate_idx
  on public.public_content_revision_sources(candidate_id);

alter table public.public_content_migration_candidates enable row level security;
alter table public.public_content_migration_events enable row level security;
alter table public.public_content_revision_sources enable row level security;

create policy public_content_migration_candidates_private_select
on public.public_content_migration_candidates for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_content_migration_events_private_select
on public.public_content_migration_events for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_content_revision_sources_private_select
on public.public_content_revision_sources for select to authenticated
using (public.cms_current_actor_can('view_private'));
grant select on public.public_content_migration_candidates,public.public_content_migration_events,
  public.public_content_revision_sources to authenticated;

create trigger public_content_migration_events_immutable
before update or delete on public.public_content_migration_events
for each row execute function public.cms_reject_mutation();
create trigger public_content_revision_sources_immutable
before update or delete on public.public_content_revision_sources
for each row execute function public.cms_reject_mutation();

create or replace function public.cms_stage_content_candidate(
  p_source_key text,p_source_kind text,p_source_locator text,p_source_sha256 text,
  p_content_type public.cms_content_type,p_slug text,p_document jsonb,
  p_historical_child_media_held boolean,p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_id uuid;
begin
  if not public.cms_current_actor_can('draft') then raise exception 'CMS drafting authority required' using errcode='42501'; end if;
  if p_source_key !~ '^[a-z0-9]+(?:[._/-][a-z0-9]+)*$' or char_length(p_source_key) not between 3 and 240
     or p_source_kind not in ('repository_html','repository_data','owner_document','legacy_database')
     or char_length(trim(coalesce(p_source_locator,''))) not between 1 and 500
     or p_source_sha256 !~ '^[a-f0-9]{64}$'
     or char_length(trim(coalesce(p_reason,''))) not between 8 and 500 then
    raise exception 'Invalid migration source contract' using errcode='22023';
  end if;
  perform public.cms_validate_document(p_content_type,p_document);
  if coalesce(jsonb_array_length(coalesce(p_document->'media','[]'::jsonb)),0)>0
     or exists(select 1 from jsonb_array_elements(p_document->'blocks') b where b->>'type' in ('image','video','gallery')) then
    raise exception 'Migration candidates are text-only; historical media remains held' using errcode='22023';
  end if;
  insert into public.public_content_migration_candidates(
    source_key,source_kind,source_locator,source_sha256,content_type,slug,document,
    historical_child_media_held,staged_by
  ) values (
    p_source_key,p_source_kind,trim(p_source_locator),p_source_sha256,p_content_type,p_slug,p_document,
    coalesce(p_historical_child_media_held,true),v_actor
  ) returning id into v_id;
  insert into public.public_content_migration_events(candidate_id,actor_id,action,reason)
  values(v_id,v_actor,'staged',trim(p_reason));
  return v_id;
end $$;
revoke all on function public.cms_stage_content_candidate(text,text,text,text,public.cms_content_type,text,jsonb,boolean,text) from public,anon;
grant execute on function public.cms_stage_content_candidate(text,text,text,text,public.cms_content_type,text,jsonb,boolean,text) to authenticated;

create or replace function public.cms_verify_content_candidate(p_candidate_id uuid,p_decision text,p_reason text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_action text;
begin
  if not public.cms_current_actor_can('publish') then raise exception 'CMS publishing authority required' using errcode='42501'; end if;
  if p_decision not in ('verified','rejected') or char_length(trim(coalesce(p_reason,''))) not between 8 and 500 then
    raise exception 'A verification decision and reason are required' using errcode='22023';
  end if;
  update public.public_content_migration_candidates
  set status=p_decision::public.cms_migration_status,verified_by=v_actor,verified_at=now(),verification_reason=trim(p_reason)
  where id=p_candidate_id and status='held';
  if not found then raise exception 'Held migration candidate required' using errcode='22023'; end if;
  v_action:=p_decision;
  insert into public.public_content_migration_events(candidate_id,actor_id,action,reason)
  values(p_candidate_id,v_actor,v_action,trim(p_reason));
  return true;
end $$;
revoke all on function public.cms_verify_content_candidate(uuid,text,text) from public,anon;
grant execute on function public.cms_verify_content_candidate(uuid,text,text) to authenticated;

create or replace function public.cms_import_verified_candidate(p_candidate_id uuid,p_reason text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_candidate public.public_content_migration_candidates%rowtype; v_entry uuid; v_revision uuid;
begin
  if not public.cms_current_actor_can('draft') then raise exception 'CMS drafting authority required' using errcode='42501'; end if;
  if char_length(trim(coalesce(p_reason,''))) not between 8 and 500 then raise exception 'Import reason required' using errcode='22023'; end if;
  select * into v_candidate from public.public_content_migration_candidates where id=p_candidate_id for update;
  if not found or v_candidate.status<>'verified' then raise exception 'Verified migration candidate required' using errcode='22023'; end if;
  if exists(select 1 from public.public_content_entries where slug=v_candidate.slug) then
    raise exception 'A CMS entry already uses this slug' using errcode='23505';
  end if;
  v_entry:=public.cms_create_entry(v_candidate.content_type,v_candidate.slug,v_candidate.document,trim(p_reason));
  select current_revision_id into strict v_revision from public.public_content_entries where id=v_entry;
  insert into public.public_content_revision_sources(revision_id,candidate_id,source_sha256,linked_by)
  values(v_revision,p_candidate_id,v_candidate.source_sha256,v_actor);
  update public.public_content_migration_candidates
  set status='imported',imported_entry_id=v_entry,imported_at=now()
  where id=p_candidate_id;
  insert into public.public_content_migration_events(candidate_id,actor_id,action,reason)
  values(p_candidate_id,v_actor,'imported',trim(p_reason));
  return v_entry;
end $$;
revoke all on function public.cms_import_verified_candidate(uuid,text) from public,anon;
grant execute on function public.cms_import_verified_candidate(uuid,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Fixed safe core-page slots; no full-page raw HTML replacement
-- ---------------------------------------------------------------------------

create table public.public_core_page_slots (
  id uuid primary key default gen_random_uuid(),
  page_path text not null check (page_path in (
    '/about.html','/academics.html','/admissions.html','/fees.html','/contact.html','/calendar.html',
    '/exams.html','/transport.html','/uniform.html','/shop.html','/pta.html','/careers.html',
    '/privacy.html','/safeguarding.html','/credits.html','/request-centre.html'
  )),
  mount_key text not null check (mount_key in ('notice','intro','guidance')),
  slot_position integer not null check (slot_position between 0 and 2),
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  active boolean not null default false,
  effective_from timestamptz,
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(page_path,mount_key,slot_position),
  check (expires_at is null or effective_from is null or expires_at>effective_from)
);

create table public.public_core_page_slot_events (
  id bigint generated always as identity primary key,
  slot_id uuid not null references public.public_core_page_slots(id) on delete restrict,
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('set','deactivated')),
  page_path text not null,
  mount_key text not null,
  slot_position integer not null,
  reason text not null check (char_length(trim(reason)) between 8 and 500),
  created_at timestamptz not null default now()
);

alter table public.public_core_page_slots enable row level security;
alter table public.public_core_page_slot_events enable row level security;
create policy public_core_page_slots_private_select on public.public_core_page_slots for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_core_page_slot_events_private_select on public.public_core_page_slot_events for select to authenticated
using (public.cms_current_actor_can('view_private'));
grant select on public.public_core_page_slots,public.public_core_page_slot_events to authenticated;
create trigger public_core_page_slot_events_immutable before update or delete on public.public_core_page_slot_events
for each row execute function public.cms_reject_mutation();

create or replace view public.public_cms_published_core_slots
with (security_invoker=false,security_barrier=true)
as
select s.id,s.page_path,s.mount_key,s.slot_position,s.entry_id,e.canonical_path,e.content_type,
  r.id as revision_id,r.title,r.summary,r.next_review_date
from public.public_core_page_slots s
join public.public_content_entries e on e.id=s.entry_id
join public.public_content_revisions r on r.id=e.published_revision_id
where s.active and (s.effective_from is null or s.effective_from<=now())
  and (s.expires_at is null or s.expires_at>now())
  and (r.next_review_date is null or r.next_review_date>=current_date)
  and public.cms_revision_is_public(r.id);
revoke all on public.public_cms_published_core_slots from public;
grant select on public.public_cms_published_core_slots to anon,authenticated,service_role;

create or replace function public.cms_set_core_page_slot(
  p_slot_id uuid,p_page_path text,p_mount_key text,p_position integer,p_entry_id uuid,
  p_active boolean,p_effective_from timestamptz,p_expires_at timestamptz,p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_id uuid;
begin
  if not public.cms_current_actor_can('publish') then raise exception 'CMS publishing authority required' using errcode='42501'; end if;
  if p_page_path not in (
    '/about.html','/academics.html','/admissions.html','/fees.html','/contact.html','/calendar.html',
    '/exams.html','/transport.html','/uniform.html','/shop.html','/pta.html','/careers.html',
    '/privacy.html','/safeguarding.html','/credits.html','/request-centre.html'
  ) or p_mount_key not in ('notice','intro','guidance') or p_position not between 0 and 2
     or p_active is null or char_length(trim(coalesce(p_reason,''))) not between 8 and 500
     or (p_expires_at is not null and p_effective_from is not null and p_expires_at<=p_effective_from) then
    raise exception 'Invalid core-page slot contract' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.public_content_entries e
    where e.id=p_entry_id and e.content_type in ('page','announcement')
      and public.cms_revision_is_public(e.published_revision_id)
  ) then raise exception 'A published Page or Announcement is required' using errcode='22023'; end if;

  if p_slot_id is null then
    insert into public.public_core_page_slots(
      page_path,mount_key,slot_position,entry_id,active,effective_from,expires_at,created_by,updated_by
    ) values (p_page_path,p_mount_key,p_position,p_entry_id,p_active,p_effective_from,p_expires_at,v_actor,v_actor)
    returning id into v_id;
  else
    update public.public_core_page_slots set page_path=p_page_path,mount_key=p_mount_key,slot_position=p_position,
      entry_id=p_entry_id,active=p_active,effective_from=p_effective_from,expires_at=p_expires_at,
      updated_by=v_actor,updated_at=now()
    where id=p_slot_id returning id into v_id;
    if v_id is null then raise exception 'Core-page slot not found' using errcode='P0002'; end if;
  end if;
  insert into public.public_core_page_slot_events(slot_id,entry_id,actor_id,action,page_path,mount_key,slot_position,reason)
  values(v_id,p_entry_id,v_actor,case when p_active then 'set' else 'deactivated' end,p_page_path,p_mount_key,p_position,trim(p_reason));
  return v_id;
end $$;
revoke all on function public.cms_set_core_page_slot(uuid,text,text,integer,uuid,boolean,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.cms_set_core_page_slot(uuid,text,text,integer,uuid,boolean,timestamptz,timestamptz,text) to authenticated;

-- ---------------------------------------------------------------------------
-- Office-authoritative public inventory projection
-- ---------------------------------------------------------------------------

alter table public.shop_variants
  drop constraint if exists shop_variants_sellable_balance_check,
  add constraint shop_variants_sellable_balance_check check (reserved+damaged<=on_hand) not valid;
alter table public.shop_variants validate constraint shop_variants_sellable_balance_check;

create or replace view public.public_inventory_availability
with (security_invoker=false,security_barrier=true)
as
select p.id as product_id,p.product_code,p.name,p.description,p.category,
  v.id as variant_id,v.sku,v.variant_label,v.size_label,v.eligible_classes,v.unit_price,
  case
    when not p.active then 'not_currently_offered'
    when not v.active then 'temporarily_unavailable'
    when (v.on_hand-v.reserved-v.damaged)=0 then 'out_of_stock'
    when (v.on_hand-v.reserved-v.damaged)<=v.low_stock_threshold then 'low_stock'
    else 'in_stock'
  end as availability,
  (p.active and v.active and greatest(v.on_hand-v.reserved-v.damaged,0)>0) as may_request,
  greatest(p.updated_at,v.updated_at) as updated_at
from public.shop_products p
join public.shop_variants v on v.product_id=p.id
where p.reconciled and v.reconciled;
revoke all on public.public_inventory_availability from public,anon,authenticated;
grant select on public.public_inventory_availability to service_role;

-- ---------------------------------------------------------------------------
-- Published-only weighted Search and aggregate-only privacy controls
-- ---------------------------------------------------------------------------

create or replace function public.cms_block_search_text(p_type public.cms_block_type,p_payload jsonb)
returns text
language plpgsql
immutable
set search_path=''
as $$
declare v_text text:='';
begin
  if p_type in ('paragraph','heading','quote','callout','verified_fact') then
    return coalesce(p_payload->>'text','');
  elsif p_type in ('ordered_list','unordered_list') then
    select coalesce(string_agg(value#>>'{}',' '),'') into v_text from jsonb_array_elements(p_payload->'items');
    return v_text;
  elsif p_type='table' then
    select coalesce(string_agg(value#>>'{}',' '),'') into v_text from (
      select value from jsonb_array_elements(p_payload->'headers')
      union all
      select cell from jsonb_array_elements(p_payload->'rows') r cross join lateral jsonb_array_elements(r) cell
    ) q;
    return v_text;
  elsif p_type='button' then return coalesce(p_payload->>'label','');
  elsif p_type='image' then return coalesce(p_payload->>'alt','');
  elsif p_type='video' then return coalesce(p_payload->>'title','');
  end if;
  return '';
end $$;
revoke all on function public.cms_block_search_text(public.cms_block_type,jsonb) from public,anon,authenticated;
grant execute on function public.cms_block_search_text(public.cms_block_type,jsonb) to service_role;

create or replace view public.public_search_documents
with (security_invoker=false,security_barrier=true)
as
with cms_blocks as (
  select b.revision_id,string_agg(public.cms_block_search_text(b.block_type,b.payload),' ' order by b.block_position) as body_text
  from public.public_cms_published_blocks b group by b.revision_id
), cms_terms as (
  select s.revision_id,string_agg(s.term,' ') as terms
  from public.public_cms_published_search_terms s group by s.revision_id
)
select 'cms:'||e.id::text as document_id,e.content_type::text as kind,e.title,e.summary,
  coalesce(b.body_text,'') as body_text,
  concat_ws(' ',array_to_string(e.search_keywords,' '),t.terms) as keywords,
  e.canonical_path as url,e.canonical_path as source_url,e.published_at,
  e.published_at::date as reviewed_on,e.next_review_date as stale_after
from public.public_cms_published_entries e
left join cms_blocks b on b.revision_id=e.revision_id
left join cms_terms t on t.revision_id=e.revision_id
where e.next_review_date is null or e.next_review_date>=current_date
union all
select 'fact:'||i.id::text,'verified_information',i.title,i.summary,coalesce(i.detail,''),i.topic,
  i.source_path,i.source_path,i.published_at,i.reviewed_at::date,i.next_review_date
from public.public_verified_information i
union all
select 'inventory:'||i.variant_id::text,'inventory',i.name,
  concat_ws(' · ',nullif(i.variant_label,''),replace(initcap(i.availability),'_',' ')),coalesce(i.description,''),
  concat_ws(' ',i.product_code,i.sku,i.category,i.variant_label,i.size_label,array_to_string(i.eligible_classes,' ')),
  '/shop.html','/shop.html',i.updated_at,i.updated_at::date,null::date
from public.public_inventory_availability i;
revoke all on public.public_search_documents from public,anon,authenticated;
grant select on public.public_search_documents to service_role;

create or replace function public.public_search_published_content(p_query text,p_limit integer default 10,p_include_inventory boolean default false)
returns table(
  document_id text,kind text,title text,summary text,url text,source_url text,
  reviewed_on date,rank real
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_query text:=trim(coalesce(p_query,'')); v_ts tsquery;
begin
  if char_length(v_query) not between 2 and 120 or p_limit not between 1 and 20 then
    raise exception 'Search query contract is invalid' using errcode='22023';
  end if;
  v_ts:=websearch_to_tsquery('english',v_query);
  return query
  select d.document_id,d.kind,d.title,d.summary,d.url,d.source_url,d.reviewed_on,
    (
      ts_rank_cd(
        setweight(to_tsvector('english',coalesce(d.title,'')),'A') ||
        setweight(to_tsvector('english',coalesce(d.summary,'')),'B') ||
        setweight(to_tsvector('english',coalesce(d.keywords,'')),'C') ||
        setweight(to_tsvector('english',coalesce(d.body_text,'')),'D'),v_ts
      ) + case when lower(d.title)=lower(v_query) then 2 else 0 end
    )::real as rank
  from public.public_search_documents d
  where (p_include_inventory or d.kind<>'inventory') and (
    (
      setweight(to_tsvector('english',coalesce(d.title,'')),'A') ||
      setweight(to_tsvector('english',coalesce(d.summary,'')),'B') ||
      setweight(to_tsvector('english',coalesce(d.keywords,'')),'C') ||
      setweight(to_tsvector('english',coalesce(d.body_text,'')),'D')
    ) @@ v_ts
    or position(lower(v_query) in lower(coalesce(d.title,'')))>0
  )
  order by rank desc,d.title,d.url
  limit p_limit;
end $$;
revoke all on function public.public_search_published_content(text,integer,boolean) from public,anon,authenticated;
grant execute on function public.public_search_published_content(text,integer,boolean) to service_role;

create table public.public_search_rate_buckets (
  bucket_hash text primary key check (bucket_hash ~ '^[a-f0-9]{64}$'),
  request_count integer not null default 1 check (request_count between 1 and 1000),
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);
create table public.public_search_insights_daily (
  observed_on date not null,
  family text not null check (family in ('admissions','fees','location','contact','classes','learning','dates','time','uniform','transport','records','safety','careers','homework','news','identity','shop','alumni','feedback','privacy','website','other')),
  search_count bigint not null default 0 check (search_count>=0),
  zero_result_count bigint not null default 0 check (zero_result_count>=0 and zero_result_count<=search_count),
  primary key(observed_on,family)
);
alter table public.public_search_rate_buckets enable row level security;
alter table public.public_search_insights_daily enable row level security;
revoke all on public.public_search_rate_buckets,public.public_search_insights_daily from public,anon,authenticated;

create or replace function public.public_take_search_rate_limit(p_bucket_hash text)
returns table(allowed boolean,retry_after_seconds integer)
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer; v_expiry timestamptz;
begin
  if p_bucket_hash !~ '^[a-f0-9]{64}$' then raise exception 'Invalid search bucket' using errcode='22023'; end if;
  delete from public.public_search_rate_buckets where expires_at<now();
  insert into public.public_search_rate_buckets(bucket_hash,request_count,expires_at)
  values(p_bucket_hash,1,now()+interval '10 minutes')
  on conflict(bucket_hash) do update set request_count=least(public.public_search_rate_buckets.request_count+1,1000),updated_at=now()
  returning request_count,expires_at into v_count,v_expiry;
  return query select v_count<=30,greatest(0,ceil(extract(epoch from (v_expiry-now())))::integer);
end $$;
revoke all on function public.public_take_search_rate_limit(text) from public,anon,authenticated;
grant execute on function public.public_take_search_rate_limit(text) to service_role;

create or replace function public.public_record_search_outcome(p_family text,p_zero_result boolean)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare v_day date:=(now() at time zone 'Africa/Lagos')::date;
begin
  if p_family not in ('admissions','fees','location','contact','classes','learning','dates','time','uniform','transport','records','safety','careers','homework','news','identity','shop','alumni','feedback','privacy','website','other') then
    raise exception 'Invalid search family' using errcode='22023';
  end if;
  insert into public.public_search_insights_daily(observed_on,family,search_count,zero_result_count)
  values(v_day,p_family,1,case when p_zero_result then 1 else 0 end)
  on conflict(observed_on,family) do update set
    search_count=public.public_search_insights_daily.search_count+1,
    zero_result_count=public.public_search_insights_daily.zero_result_count+case when p_zero_result then 1 else 0 end;
end $$;
revoke all on function public.public_record_search_outcome(text,boolean) from public,anon,authenticated;
grant execute on function public.public_record_search_outcome(text,boolean) to service_role;

create or replace function public.cms_content_review_queue()
returns table(source_kind text,record_id uuid,title text,public_path text,review_due date,days_until_due integer,state text)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.cms_current_actor_can('view_private') then raise exception 'CMS private-view authority required' using errcode='42501'; end if;
  return query
  select q.source_kind,q.record_id,q.title,q.public_path,q.review_due,q.days_until_due,q.state
  from (
    select 'cms_content'::text as source_kind,e.id as record_id,e.title,e.canonical_path as public_path,
      e.next_review_date as review_due,(e.next_review_date-current_date)::integer as days_until_due,
      case when e.next_review_date<current_date then 'overdue' else 'due_soon' end::text as state
    from public.public_cms_published_entries e
    where e.next_review_date is not null and e.next_review_date<=current_date+30
    union all
    select 'verified_information'::text,i.id,i.title,i.source_path,i.next_review_date,
      (i.next_review_date-current_date)::integer,
      case when i.next_review_date<current_date then 'overdue' else 'due_soon' end::text
    from public.verified_public_information i
    where i.status='published'::public.publication_status and i.next_review_date is not null and i.next_review_date<=current_date+30
  ) q
  order by q.review_due,q.title;
end $$;
revoke all on function public.cms_content_review_queue() from public,anon;
grant execute on function public.cms_content_review_queue() to authenticated;

comment on table public.public_content_migration_candidates is 'Source-hashed text-only candidates. Verification and draft import are separate audited actions; historical media remains held.';
comment on view public.public_inventory_availability is 'Reconciled office-authoritative availability only. It creates no reservation and exposes no movement or actor.';
comment on view public.public_search_documents is 'Published/verified/reconciled search projection; private, stale and self-search documents are excluded.';
comment on table public.public_search_insights_daily is 'Aggregate topic and zero-result counts only; raw queries, accounts and full IP addresses are never stored.';

commit;
