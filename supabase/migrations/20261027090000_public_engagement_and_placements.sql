-- Treasure Academy public engagement and shared homepage placements
-- Run 9: privacy-safe aggregate views, signed-in likes, premoderated comments,
-- leadership moderation and audited CMS placement control. This migration is
-- additive, creates no content/reaction/comment/placement row and activates no gate.

alter type public.cms_comment_status add value if not exists 'reported';
alter type public.cms_comment_status add value if not exists 'hidden';
alter type public.cms_comment_status add value if not exists 'deleted_by_author';

begin;

create table public.public_content_view_receipts (
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  viewed_on date not null,
  viewer_hash text not null check (viewer_hash ~ '^[a-f0-9]{64}$'),
  first_seen_at timestamptz not null default now(),
  primary key(entry_id,viewed_on,viewer_hash)
);

create table public.public_content_comment_reports (
  comment_id uuid not null references public.public_content_comments(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  created_at timestamptz not null default now(),
  primary key(comment_id,actor_id)
);

create table public.public_site_slot_events (
  id bigint generated always as identity primary key,
  slot_id uuid not null references public.public_site_content_slots(id) on delete restrict,
  entry_id uuid not null references public.public_content_entries(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (action in ('set','deactivated')),
  slot_key text not null check (slot_key in ('home.alert','home.news','home.event')),
  slot_position integer not null check (slot_position between 0 and 2),
  reason text not null check (char_length(trim(reason)) between 8 and 500),
  created_at timestamptz not null default now()
);

create index public_content_view_receipts_age_idx
  on public.public_content_view_receipts(viewed_on);
create index public_content_reactions_entry_idx
  on public.public_content_reactions(entry_id,created_at);
create index public_content_comments_entry_status_idx
  on public.public_content_comments(entry_id,status,created_at);
create index public_content_comment_reports_comment_idx
  on public.public_content_comment_reports(comment_id,created_at);
create index public_site_slot_events_created_idx
  on public.public_site_slot_events(created_at desc);

alter table public.public_content_view_receipts enable row level security;
alter table public.public_content_comment_reports enable row level security;
alter table public.public_site_slot_events enable row level security;

create trigger public_site_slot_events_immutable
before update or delete on public.public_site_slot_events
for each row execute function public.cms_reject_mutation();

create policy public_site_slot_events_private_select
on public.public_site_slot_events for select to authenticated
using (public.cms_current_actor_can('view_private'));

create policy public_comment_moderation_events_leadership_select
on public.public_comment_moderation_events for select to authenticated
using (public.cms_current_actor_can('comment_moderate'));

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
         and p_capability in ('view_private','draft','review','publish','safeguarding_review','comment_moderate') then true
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

create or replace function public.cms_comment_body_is_safe(p_body text)
returns boolean
language sql
immutable
set search_path=''
as $$
  select char_length(trim(coalesce(p_body,''))) between 2 and 2000
    and p_body !~ '[<>]'
    and p_body !~* '(https?://|www[.])'
    and p_body !~* '[[:alnum:]_.%+-]+@[[:alnum:].-]+[.][[:alpha:]]{2,}'
    and p_body !~* '([+]234|0)[0-9][0-9 ()-]{8,}'
    and p_body !~* '(password|one[- ]?time code|otp|candidate number|bank account|account number|payment proof|transfer screenshot|receipt image|medical record|health record|safeguarding incident)'
$$;
revoke all on function public.cms_comment_body_is_safe(text) from public,anon,authenticated;
grant execute on function public.cms_comment_body_is_safe(text) to service_role;

create or replace view public.public_cms_engagement_totals
with (security_invoker=false,security_barrier=true)
as
select e.id as entry_id,e.slug,e.canonical_path,
  coalesce((select sum(v.view_count) from public.public_content_views_daily v where v.entry_id=e.id),0)::bigint as view_count,
  coalesce((select count(*) from public.public_content_reactions r where r.entry_id=e.id and r.reaction='like'),0)::bigint as like_count,
  coalesce((select count(*) from public.public_content_comments c where c.entry_id=e.id and c.status='approved'),0)::bigint as comment_count
from public.public_content_entries e
where public.cms_revision_is_public(e.published_revision_id);

create or replace view public.public_cms_approved_comments
with (security_invoker=false,security_barrier=true)
as
select c.id,c.entry_id,c.body,c.created_at,c.updated_at,
  case when p.role='parent'::public.app_role then 'Verified Parent' else 'School Staff' end as author_label
from public.public_content_comments c
join public.profiles p on p.id=c.actor_id
join public.public_content_entries e on e.id=c.entry_id
where c.status='approved' and p.active and p.account_status='active'
  and public.cms_revision_is_public(e.published_revision_id);

create or replace function public.public_get_content_engagement(p_entry_id uuid)
returns table(view_count bigint,like_count bigint,comment_count bigint,liked boolean)
language sql
stable
security definer
set search_path=''
as $$
  select t.view_count,t.like_count,t.comment_count,
    case when (select auth.uid()) is null then false else exists(
      select 1 from public.public_content_reactions r
      where r.entry_id=t.entry_id and r.actor_id=(select auth.uid()) and r.reaction='like'
    ) end
  from public.public_cms_engagement_totals t
  where t.entry_id=p_entry_id
$$;
revoke all on function public.public_get_content_engagement(uuid) from public;
grant execute on function public.public_get_content_engagement(uuid) to anon,authenticated,service_role;

create or replace function public.public_record_content_view(p_entry_id uuid,p_viewer_hash text)
returns table(recorded boolean,view_count bigint,like_count bigint,comment_count bigint,liked boolean)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_day date:=(now() at time zone 'Africa/Lagos')::date;
  v_inserted bigint:=0;
begin
  if p_viewer_hash is null or p_viewer_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid privacy-safe view receipt' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.public_content_entries e
    where e.id=p_entry_id and public.cms_revision_is_public(e.published_revision_id)
  ) then raise exception 'Published content required' using errcode='22023'; end if;

  insert into public.public_content_view_receipts(entry_id,viewed_on,viewer_hash)
  values(p_entry_id,v_day,p_viewer_hash)
  on conflict do nothing;
  get diagnostics v_inserted=row_count;

  if v_inserted=1 then
    insert into public.public_content_views_daily(entry_id,viewed_on,view_count,updated_at)
    values(p_entry_id,v_day,1,now())
    on conflict(entry_id,viewed_on) do update
      set view_count=public.public_content_views_daily.view_count+1,updated_at=now();
  end if;

  delete from public.public_content_view_receipts where viewed_on<v_day-31;
  return query select v_inserted=1,e.view_count,e.like_count,e.comment_count,e.liked
    from public.public_get_content_engagement(p_entry_id) e;
end $$;
revoke all on function public.public_record_content_view(uuid,text) from public,anon,authenticated;
grant execute on function public.public_record_content_view(uuid,text) to service_role;

create or replace function public.public_toggle_content_like(p_entry_id uuid,p_liked boolean)
returns table(view_count bigint,like_count bigint,comment_count bigint,liked boolean)
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid());
begin
  if p_liked is null then raise exception 'Like state required' using errcode='22023'; end if;
  if not exists(
    select 1 from public.profiles p where p.id=v_actor and p.active and p.account_status='active'
      and not p.must_change_password and p.role in ('parent'::public.app_role,'teacher'::public.app_role,'admin'::public.app_role)
  ) then raise exception 'Active parent or staff account required' using errcode='42501'; end if;
  if not exists(
    select 1 from public.public_content_entries e
    where e.id=p_entry_id and public.cms_revision_is_public(e.published_revision_id)
  ) then raise exception 'Published content required' using errcode='22023'; end if;

  if p_liked then
    insert into public.public_content_reactions(entry_id,actor_id,reaction)
    values(p_entry_id,v_actor,'like') on conflict(entry_id,actor_id,reaction) do nothing;
  else
    delete from public.public_content_reactions
    where entry_id=p_entry_id and actor_id=v_actor and reaction='like';
  end if;
  return query select * from public.public_get_content_engagement(p_entry_id);
end $$;
revoke all on function public.public_toggle_content_like(uuid,boolean) from public,anon;
grant execute on function public.public_toggle_content_like(uuid,boolean) to authenticated;

create or replace function public.public_submit_content_comment(p_entry_id uuid,p_body text)
returns table(id uuid,status public.cms_comment_status)
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_id uuid;
begin
  if not exists(
    select 1 from public.profiles p where p.id=v_actor and p.active and p.account_status='active'
      and not p.must_change_password and p.role in ('parent'::public.app_role,'teacher'::public.app_role,'admin'::public.app_role)
  ) then raise exception 'Active parent or staff account required' using errcode='42501'; end if;
  if not exists(
    select 1 from public.public_content_entries e
    where e.id=p_entry_id and public.cms_revision_is_public(e.published_revision_id)
  ) then raise exception 'Published content required' using errcode='22023'; end if;
  if not public.cms_comment_body_is_safe(p_body) then
    raise exception 'Comment contains unsupported or private information' using errcode='22023';
  end if;
  if (select count(*) from public.public_content_comments c where c.actor_id=v_actor and c.created_at>now()-interval '1 hour')>=5
     or (select count(*) from public.public_content_comments c where c.actor_id=v_actor and c.status='pending')>=3 then
    raise exception 'Comment submission limit reached' using errcode='P0001';
  end if;

  insert into public.public_content_comments(entry_id,actor_id,body)
  values(p_entry_id,v_actor,trim(p_body)) returning public.public_content_comments.id into v_id;
  return query select v_id,'pending'::public.cms_comment_status;
end $$;
revoke all on function public.public_submit_content_comment(uuid,text) from public,anon;
grant execute on function public.public_submit_content_comment(uuid,text) to authenticated;

create or replace function public.public_edit_content_comment(p_comment_id uuid,p_body text)
returns table(id uuid,status public.cms_comment_status)
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_previous public.cms_comment_status;
begin
  if not exists(
    select 1 from public.profiles p where p.id=v_actor and p.active and p.account_status='active'
      and not p.must_change_password and p.role in ('parent'::public.app_role,'teacher'::public.app_role,'admin'::public.app_role)
  ) then raise exception 'Active parent or staff account required' using errcode='42501'; end if;
  if not public.cms_comment_body_is_safe(p_body) then
    raise exception 'Comment contains unsupported or private information' using errcode='22023';
  end if;
  select c.status into v_previous from public.public_content_comments c
  where c.id=p_comment_id and c.actor_id=v_actor for update;
  if v_previous is null or v_previous='deleted_by_author' then
    raise exception 'Editable comment required' using errcode='42501';
  end if;
  update public.public_content_comments
  set body=trim(p_body),status='pending',updated_at=now(),moderated_by=null,moderated_at=null,moderation_reason=null
  where public.public_content_comments.id=p_comment_id;
  insert into public.public_comment_moderation_events(comment_id,actor_id,previous_status,new_status,reason)
  values(p_comment_id,v_actor,v_previous,'pending','Author edited comment; returned to review');
  return query select p_comment_id,'pending'::public.cms_comment_status;
end $$;
revoke all on function public.public_edit_content_comment(uuid,text) from public,anon;
grant execute on function public.public_edit_content_comment(uuid,text) to authenticated;

create or replace function public.public_delete_own_content_comment(p_comment_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_previous public.cms_comment_status;
begin
  if not exists(
    select 1 from public.profiles p where p.id=v_actor and p.active and p.account_status='active'
      and not p.must_change_password and p.role in ('parent'::public.app_role,'teacher'::public.app_role,'admin'::public.app_role)
  ) then raise exception 'Active parent or staff account required' using errcode='42501'; end if;
  select c.status into v_previous from public.public_content_comments c
  where c.id=p_comment_id and c.actor_id=v_actor for update;
  if v_previous is null or v_previous='deleted_by_author' then return false; end if;
  update public.public_content_comments
  set status='deleted_by_author',updated_at=now(),moderated_by=v_actor,moderated_at=now(),moderation_reason='Deleted by author'
  where id=p_comment_id;
  insert into public.public_comment_moderation_events(comment_id,actor_id,previous_status,new_status,reason)
  values(p_comment_id,v_actor,v_previous,'deleted_by_author','Deleted by author');
  return true;
end $$;
revoke all on function public.public_delete_own_content_comment(uuid) from public,anon;
grant execute on function public.public_delete_own_content_comment(uuid) to authenticated;

create or replace function public.public_report_content_comment(p_comment_id uuid,p_reason text)
returns table(received boolean,report_count bigint,status public.cms_comment_status)
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_count bigint; v_status public.cms_comment_status;
begin
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'Report reason required' using errcode='22023';
  end if;
  if not exists(
    select 1 from public.profiles p where p.id=v_actor and p.active and p.account_status='active' and not p.must_change_password
      and p.role in ('parent'::public.app_role,'teacher'::public.app_role,'admin'::public.app_role)
  ) then raise exception 'Active parent or staff account required' using errcode='42501'; end if;
  if not exists(
    select 1 from public.public_content_comments c
    join public.public_content_entries e on e.id=c.entry_id
    where c.id=p_comment_id and c.status='approved' and c.actor_id<>v_actor
      and public.cms_revision_is_public(e.published_revision_id)
  ) then raise exception 'Reportable comment required' using errcode='22023'; end if;

  insert into public.public_content_comment_reports(comment_id,actor_id,reason)
  values(p_comment_id,v_actor,trim(p_reason)) on conflict do nothing;
  select count(*) into v_count from public.public_content_comment_reports where comment_id=p_comment_id;
  select c.status into v_status from public.public_content_comments c where c.id=p_comment_id for update;
  if v_count>=2 and v_status='approved' then
    update public.public_content_comments set status='reported',updated_at=now(),moderated_by=v_actor,
      moderated_at=now(),moderation_reason='Multiple signed-in reports; leadership review required'
    where id=p_comment_id;
    insert into public.public_comment_moderation_events(comment_id,actor_id,previous_status,new_status,reason)
    values(p_comment_id,v_actor,'approved','reported','Multiple signed-in reports; leadership review required');
    v_status:='reported';
  end if;
  return query select true,v_count,v_status;
end $$;
revoke all on function public.public_report_content_comment(uuid,text) from public,anon;
grant execute on function public.public_report_content_comment(uuid,text) to authenticated;

create or replace function public.public_my_content_comments(p_entry_id uuid)
returns table(id uuid,body text,status public.cms_comment_status,created_at timestamptz,updated_at timestamptz)
language sql
stable
security definer
set search_path=''
as $$
  select c.id,c.body,c.status,c.created_at,c.updated_at
  from public.public_content_comments c
  where c.entry_id=p_entry_id and c.actor_id=(select auth.uid())
    and exists(
      select 1 from public.profiles p where p.id=(select auth.uid()) and p.active and p.account_status='active'
        and not p.must_change_password and p.role in ('parent'::public.app_role,'teacher'::public.app_role,'admin'::public.app_role)
    )
  order by c.created_at desc limit 20
$$;
revoke all on function public.public_my_content_comments(uuid) from public,anon;
grant execute on function public.public_my_content_comments(uuid) to authenticated;

create or replace function public.cms_comment_moderation_queue()
returns table(id uuid,entry_id uuid,canonical_path text,content_title text,body text,status public.cms_comment_status,
  author_label text,created_at timestamptz,updated_at timestamptz,report_count bigint,report_reasons jsonb)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.cms_current_actor_can('comment_moderate') then
    raise exception 'Leadership comment moderation required' using errcode='42501';
  end if;
  return query
  select c.id,c.entry_id,e.canonical_path,r.title,c.body,c.status,
    case when p.role='parent'::public.app_role then 'Verified Parent' else 'School Staff' end,
    c.created_at,c.updated_at,
    (select count(*) from public.public_content_comment_reports q where q.comment_id=c.id)::bigint,
    coalesce((select jsonb_agg(jsonb_build_object('reason',q.reason,'created_at',q.created_at) order by q.created_at)
      from public.public_content_comment_reports q where q.comment_id=c.id),'[]'::jsonb)
  from public.public_content_comments c
  join public.public_content_entries e on e.id=c.entry_id
  join public.public_content_revisions r on r.id=e.published_revision_id
  join public.profiles p on p.id=c.actor_id
  where c.status<>'deleted_by_author'
  order by case when c.status in ('pending','reported') then 0 else 1 end,c.updated_at desc
  limit 500;
end $$;
revoke all on function public.cms_comment_moderation_queue() from public,anon;
grant execute on function public.cms_comment_moderation_queue() to authenticated;

create or replace function public.cms_moderate_content_comment(p_comment_id uuid,p_status public.cms_comment_status,p_reason text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_previous public.cms_comment_status; v_body text; v_entry uuid;
begin
  if not public.cms_current_actor_can('comment_moderate') then
    raise exception 'Leadership comment moderation required' using errcode='42501';
  end if;
  if p_status not in ('pending','approved','rejected','hidden') then
    raise exception 'Unsupported moderation state' using errcode='22023';
  end if;
  if char_length(trim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'Moderation reason required' using errcode='22023';
  end if;
  select c.status,c.body,c.entry_id into v_previous,v_body,v_entry
  from public.public_content_comments c where c.id=p_comment_id for update;
  if v_previous is null or v_previous='deleted_by_author' then
    raise exception 'Moderatable comment required' using errcode='22023';
  end if;
  if p_status='approved' and (not public.cms_comment_body_is_safe(v_body) or not exists(
    select 1 from public.public_content_entries e where e.id=v_entry and public.cms_revision_is_public(e.published_revision_id)
  )) then raise exception 'Only safe comments on current public content may be approved' using errcode='22023'; end if;

  update public.public_content_comments
  set status=p_status,updated_at=now(),
    moderated_by=case when p_status='pending' then null else v_actor end,
    moderated_at=case when p_status='pending' then null else now() end,
    moderation_reason=case when p_status='pending' then null else trim(p_reason) end
  where id=p_comment_id;
  insert into public.public_comment_moderation_events(comment_id,actor_id,previous_status,new_status,reason)
  values(p_comment_id,v_actor,v_previous,p_status,trim(p_reason));
  return true;
end $$;
revoke all on function public.cms_moderate_content_comment(uuid,public.cms_comment_status,text) from public,anon;
grant execute on function public.cms_moderate_content_comment(uuid,public.cms_comment_status,text) to authenticated;

create or replace function public.cms_set_site_slot(
  p_slot_key text,p_slot_position integer,p_entry_id uuid,p_active boolean,
  p_effective_from timestamptz,p_expires_at timestamptz,p_reason text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_slot uuid; v_type public.cms_content_type;
begin
  if not public.cms_current_actor_can('publish') then raise exception 'CMS publication authority required' using errcode='42501'; end if;
  if p_slot_key not in ('home.alert','home.news','home.event') or p_slot_position not between 0 and 2
     or (p_slot_key='home.alert' and p_slot_position<>0) then
    raise exception 'Unsupported homepage slot' using errcode='22023';
  end if;
  if char_length(trim(coalesce(p_reason,''))) not between 8 and 500 then
    raise exception 'Placement reason required' using errcode='22023';
  end if;
  if p_expires_at is not null and p_effective_from is not null and p_expires_at<=p_effective_from then
    raise exception 'Placement expiry must follow its effective time' using errcode='22023';
  end if;
  select e.content_type into v_type from public.public_content_entries e
  where e.id=p_entry_id and public.cms_revision_is_public(e.published_revision_id);
  if v_type is null
     or (p_slot_key='home.news' and v_type<>'news')
     or (p_slot_key='home.event' and v_type<>'event')
     or (p_slot_key='home.alert' and v_type not in ('announcement','news')) then
    raise exception 'Published content type does not match the homepage slot' using errcode='22023';
  end if;

  insert into public.public_site_content_slots(slot_key,entry_id,slot_position,active,effective_from,expires_at,created_by)
  values(p_slot_key,p_entry_id,p_slot_position,p_active,p_effective_from,p_expires_at,v_actor)
  on conflict(slot_key,slot_position) do update set
    entry_id=excluded.entry_id,active=excluded.active,effective_from=excluded.effective_from,
    expires_at=excluded.expires_at,updated_at=now()
  returning id into v_slot;
  insert into public.public_site_slot_events(slot_id,entry_id,actor_id,action,slot_key,slot_position,reason)
  values(v_slot,p_entry_id,v_actor,case when p_active then 'set' else 'deactivated' end,p_slot_key,p_slot_position,trim(p_reason));
  return v_slot;
end $$;
revoke all on function public.cms_set_site_slot(text,integer,uuid,boolean,timestamptz,timestamptz,text) from public,anon;
grant execute on function public.cms_set_site_slot(text,integer,uuid,boolean,timestamptz,timestamptz,text) to authenticated;

revoke all on table public.public_content_view_receipts,public.public_content_comment_reports,public.public_site_slot_events
from public,anon,authenticated,service_role;
revoke all on sequence public.public_site_slot_events_id_seq from public,anon,authenticated,service_role;

grant select,insert,delete on table public.public_content_view_receipts to service_role;
grant select,insert on table public.public_content_comment_reports to service_role;
grant select on table public.public_site_slot_events,public.public_comment_moderation_events to authenticated,service_role;
grant usage,select on sequence public.public_site_slot_events_id_seq to service_role;

grant select on table public.public_cms_engagement_totals,public.public_cms_approved_comments
to anon,authenticated,service_role;

comment on table public.public_content_view_receipts is
  'Daily rotating HMAC deduplication receipts only; no IP address or user agent is stored and receipts older than 31 days are removed during accepted view writes.';
comment on table public.public_content_comment_reports is
  'One signed-in report per account/comment; public output never exposes reporter identity.';
comment on table public.public_site_slot_events is
  'Immutable homepage placement audit; changing a slot never changes publication authority or school operations.';
comment on view public.public_cms_engagement_totals is
  'Published aggregate counts only; no viewer or reacting-account identity is exposed.';
comment on view public.public_cms_approved_comments is
  'Leadership-approved current-public comments with role-safe labels and no account identity.';

commit;
