-- Treasure Academy controlled dynamic public page surfaces
-- Additive and gate-closed by default. This migration creates no content,
-- changes no public route and grants no new CMS capability.

begin;

-- The route and render mode are code-owned safety boundaries. A published CMS
-- Page may replace editorial content on ordinary information pages. Interactive
-- and privacy-sensitive pages accept reviewed supplementary content only; their
-- forms, validation, payment and safeguarding wording remain in the fixed shell.
create or replace function public.cms_page_surface_mode(p_path text)
returns text
language sql
immutable
set search_path=''
as $$
  select case
    when p_path in (
      '/about','/academics','/alumni','/anthem','/board','/calendar','/careers','/classes',
      '/classes/pre-nursery','/classes/nursery-1','/classes/nursery-2',
      '/classes/primary-1','/classes/primary-2','/classes/primary-3','/classes/primary-4','/classes/primary-6',
      '/credits','/exams','/fees','/holiday','/openday','/photo-day','/privacy','/pta',
      '/safeguarding','/story','/support','/testimonials','/transport','/uniform','/volunteer','/welcome'
    ) then 'replace'
    when p_path in (
      '/','/admission-form','/admissions','/birthdays','/contact','/elearning','/site-map',
      '/homework','/lost-found','/poster','/reading','/receipt','/request-centre','/search',
      '/shop','/website-help'
    ) then 'supplement'
    else null
  end
$$;
revoke all on function public.cms_page_surface_mode(text) from public,anon,authenticated;
grant execute on function public.cms_page_surface_mode(text) to service_role;

create table public.public_page_surfaces (
  id uuid primary key default gen_random_uuid(),
  page_path text not null unique,
  render_mode text generated always as (public.cms_page_surface_mode(page_path)) stored,
  entry_id uuid not null unique references public.public_content_entries(id) on delete restrict,
  active boolean not null default false,
  effective_from timestamptz,
  expires_at timestamptz,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (render_mode in ('replace','supplement')),
  check (expires_at is null or effective_from is null or expires_at>effective_from)
);

create table public.public_page_surface_events (
  id bigint generated always as identity primary key,
  surface_id uuid not null references public.public_page_surfaces(id) on delete restrict,
  page_path text not null,
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('set','updated','deactivated')),
  render_mode text not null check (render_mode in ('replace','supplement')),
  reason text not null check (char_length(trim(reason)) between 8 and 500),
  created_at timestamptz not null default now()
);

create index public_page_surfaces_entry_idx on public.public_page_surfaces(entry_id);
create index public_page_surface_events_surface_idx on public.public_page_surface_events(surface_id,created_at desc);

alter table public.public_page_surfaces enable row level security;
alter table public.public_page_surface_events enable row level security;

create policy public_page_surfaces_private_select
on public.public_page_surfaces for select to authenticated
using (public.cms_current_actor_can('view_private'));
create policy public_page_surface_events_private_select
on public.public_page_surface_events for select to authenticated
using (public.cms_current_actor_can('view_private'));

grant select on public.public_page_surfaces,public.public_page_surface_events to authenticated;

create trigger public_page_surface_events_immutable
before update or delete on public.public_page_surface_events
for each row execute function public.cms_reject_mutation();

create or replace view public.public_cms_published_page_surfaces
with (security_invoker=false,security_barrier=true)
as
select s.id,s.page_path,s.render_mode,s.entry_id,e.canonical_path,e.content_type,
  r.id as revision_id,r.title,r.summary,r.category,r.next_review_date,
  r.seo_title,r.seo_description,r.featured_media_id,r.social_media_id,
  s.effective_from,s.expires_at,s.updated_at
from public.public_page_surfaces s
join public.public_content_entries e on e.id=s.entry_id
join public.public_content_revisions r on r.id=e.published_revision_id
where s.active
  and e.content_type='page'::public.cms_content_type
  and (s.effective_from is null or s.effective_from<=now())
  and (s.expires_at is null or s.expires_at>now())
  and (r.next_review_date is null or r.next_review_date>=current_date)
  and public.cms_revision_is_public(r.id);
revoke all on public.public_cms_published_page_surfaces from public;
grant select on public.public_cms_published_page_surfaces to anon,authenticated,service_role;

create or replace function public.cms_set_page_surface(
  p_surface_id uuid,
  p_page_path text,
  p_entry_id uuid,
  p_active boolean,
  p_effective_from timestamptz,
  p_expires_at timestamptz,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_id uuid;
  v_mode text:=public.cms_page_surface_mode(p_page_path);
  v_existing public.public_page_surfaces%rowtype;
begin
  if not public.cms_current_actor_can('publish') then
    raise exception 'CMS publishing authority required' using errcode='42501';
  end if;
  if v_mode is null or p_active is null
     or char_length(trim(coalesce(p_reason,''))) not between 8 and 500
     or (p_expires_at is not null and p_effective_from is not null and p_expires_at<=p_effective_from) then
    raise exception 'Invalid public page surface contract' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.public_content_entries e
    join public.public_content_revisions r on r.id=e.published_revision_id
    where e.id=p_entry_id and e.content_type='page'::public.cms_content_type
      and (r.next_review_date is null or r.next_review_date>=current_date)
      and public.cms_revision_is_public(r.id)
  ) then
    raise exception 'A current published Page is required' using errcode='22023';
  end if;

  if p_surface_id is null then
    insert into public.public_page_surfaces(
      page_path,entry_id,active,effective_from,expires_at,created_by,updated_by
    ) values (
      p_page_path,p_entry_id,p_active,p_effective_from,p_expires_at,v_actor,v_actor
    ) returning id into v_id;
  else
    select * into v_existing from public.public_page_surfaces where id=p_surface_id for update;
    if not found then raise exception 'Public page surface not found' using errcode='P0002'; end if;
    update public.public_page_surfaces
    set page_path=p_page_path,entry_id=p_entry_id,active=p_active,
        effective_from=p_effective_from,expires_at=p_expires_at,
        updated_by=v_actor,updated_at=now()
    where id=p_surface_id returning id into v_id;
  end if;

  insert into public.public_page_surface_events(
    surface_id,page_path,entry_id,actor_id,action,render_mode,reason
  ) values (
    v_id,p_page_path,p_entry_id,v_actor,
    case when not p_active then 'deactivated' when p_surface_id is null then 'set' else 'updated' end,
    v_mode,trim(p_reason)
  );
  return v_id;
end $$;
revoke all on function public.cms_set_page_surface(uuid,text,uuid,boolean,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.cms_set_page_surface(uuid,text,uuid,boolean,timestamptz,timestamptz,text) to authenticated;

-- Search points a surfaced Page at its fixed public route rather than at the
-- internal CMS identity used to prepare its revisions.
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
  coalesce(ps.page_path,cs.page_path,e.canonical_path) as url,
  coalesce(ps.page_path,cs.page_path,e.canonical_path) as source_url,
  e.published_at,e.published_at::date as reviewed_on,e.next_review_date as stale_after
from public.public_cms_published_entries e
left join cms_blocks b on b.revision_id=e.revision_id
left join cms_terms t on t.revision_id=e.revision_id
left join public.public_cms_published_page_surfaces ps on ps.entry_id=e.id
left join lateral (
  select slot.page_path
  from public.public_cms_published_core_slots slot
  where slot.entry_id=e.id
  order by slot.page_path,slot.mount_key,slot.slot_position
  limit 1
) cs on true
where (e.next_review_date is null or e.next_review_date>=current_date)
  and (e.content_type<>'page'::public.cms_content_type or ps.page_path is not null or cs.page_path is not null)
union all
select 'fact:'||i.id::text,'verified_information',i.title,i.summary,coalesce(i.detail,''),i.topic,
  i.source_path,i.source_path,i.published_at,i.reviewed_at::date,i.next_review_date
from public.public_verified_information i
union all
select 'inventory:'||i.variant_id::text,'inventory',i.name,
  concat_ws(' · ',nullif(i.variant_label,''),replace(initcap(i.availability),'_',' ')),coalesce(i.description,''),
  concat_ws(' ',i.product_code,i.sku,i.category,i.variant_label,i.size_label,array_to_string(i.eligible_classes,' ')),
  '/shop','/shop',i.updated_at,i.updated_at::date,null::date
from public.public_inventory_availability i;
revoke all on public.public_search_documents from public,anon,authenticated;
grant select on public.public_search_documents to service_role;

comment on table public.public_page_surfaces is
  'Owner-published bindings from fixed public routes to independently reviewed CMS Page revisions. Gate closed until Preview acceptance.';
comment on table public.public_page_surface_events is
  'Append-only audit of public Page binding and deactivation decisions.';

commit;
