-- Run 11: clean-route cutover for governed core slots and public discovery.
-- Forward-only and row-preserving: existing provenance and placements are retained
-- while former public filenames become their one-hop canonical destinations.

update public.verified_public_information
set source_path=case source_path
  when '/about.html' then '/about'
  when '/academics.html' then '/academics'
  when '/admissions.html' then '/admissions'
  when '/fees.html' then '/fees'
  when '/contact.html' then '/contact'
  when '/calendar.html' then '/calendar'
  when '/exams.html' then '/exams'
  when '/transport.html' then '/transport'
  when '/uniform.html' then '/uniform'
  when '/shop.html' then '/shop'
  when '/pta.html' then '/pta'
  when '/careers.html' then '/careers'
  when '/privacy.html' then '/privacy'
  when '/safeguarding.html' then '/safeguarding'
  when '/credits.html' then '/credits'
  when '/request-centre.html' then '/request-centre'
  else source_path
end
where source_path in (
  '/about.html','/academics.html','/admissions.html','/fees.html','/contact.html','/calendar.html',
  '/exams.html','/transport.html','/uniform.html','/shop.html','/pta.html','/careers.html',
  '/privacy.html','/safeguarding.html','/credits.html','/request-centre.html'
);

alter table public.public_core_page_slots
  drop constraint public_core_page_slots_page_path_check;

update public.public_core_page_slots
set page_path=case page_path
  when '/about.html' then '/about'
  when '/academics.html' then '/academics'
  when '/admissions.html' then '/admissions'
  when '/fees.html' then '/fees'
  when '/contact.html' then '/contact'
  when '/calendar.html' then '/calendar'
  when '/exams.html' then '/exams'
  when '/transport.html' then '/transport'
  when '/uniform.html' then '/uniform'
  when '/shop.html' then '/shop'
  when '/pta.html' then '/pta'
  when '/careers.html' then '/careers'
  when '/privacy.html' then '/privacy'
  when '/safeguarding.html' then '/safeguarding'
  when '/credits.html' then '/credits'
  when '/request-centre.html' then '/request-centre'
  else page_path
end;

alter table public.public_core_page_slots
  add constraint public_core_page_slots_page_path_check check (page_path in (
    '/about','/academics','/admissions','/fees','/contact','/calendar',
    '/exams','/transport','/uniform','/shop','/pta','/careers',
    '/privacy','/safeguarding','/credits','/request-centre'
  ));

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
    '/about','/academics','/admissions','/fees','/contact','/calendar',
    '/exams','/transport','/uniform','/shop','/pta','/careers',
    '/privacy','/safeguarding','/credits','/request-centre'
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

-- Search documents emit canonical destinations only. The view keeps its exact
-- column contract so the existing weighted Search RPC remains valid.
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
  '/shop','/shop',i.updated_at,i.updated_at::date,null::date
from public.public_inventory_availability i;
revoke all on public.public_search_documents from public,anon,authenticated;
grant select on public.public_search_documents to service_role;
