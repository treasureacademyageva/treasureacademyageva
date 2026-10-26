-- Treasure Academy Cloudinary media governance
-- Run 6: additive upload reservation, provider confirmation, independent review,
-- immutable audit and fail-closed delivery metadata. No provider secret, media,
-- capability, consent record or public route is seeded or activated.

begin;

alter table public.public_media_assets
  add column provider_asset_uid text unique,
  add column provider_resource_type text check (provider_resource_type is null or provider_resource_type in ('image','video')),
  add column provider_delivery_type text not null default 'authenticated'
    check (provider_delivery_type='authenticated'),
  add column provider_version bigint check (provider_version is null or provider_version>0),
  add column provider_etag text check (provider_etag is null or provider_etag ~ '^[a-f0-9]{32,64}$'),
  add column original_format text check (original_format is null or original_format ~ '^[a-z0-9]{2,12}$'),
  add column original_mime_type text check (original_mime_type is null or original_mime_type in (
    'image/jpeg','image/png','image/webp','image/avif','image/heic',
    'video/mp4','video/webm','video/quicktime'
  )),
  add column byte_size bigint check (byte_size is null or byte_size between 1 and 52428800),
  add column upload_completed_at timestamptz,
  add column provenance_reviewed_by uuid references public.profiles(id) on delete restrict,
  add column provenance_reviewed_at timestamptz,
  add column safeguarding_status text not null default 'pending'
    check (safeguarding_status in ('not_required','pending','approved','rejected')),
  add column approved_by uuid references public.profiles(id) on delete restrict,
  add column approved_at timestamptz,
  add column rejected_by uuid references public.profiles(id) on delete restrict,
  add column rejected_at timestamptz,
  add column rejection_reason text check (rejection_reason is null or char_length(trim(rejection_reason)) between 8 and 500),
  add column retention_policy text not null default 'manual_only'
    check (retention_policy='manual_only'),
  add constraint public_media_provider_completion_shape check (
    (upload_completed_at is null and provider_asset_uid is null and provider_version is null and provider_etag is null
      and original_format is null and original_mime_type is null and byte_size is null)
    or
    (upload_completed_at is not null and provider='cloudinary' and provider_asset_id is not null
      and provider_asset_uid is not null and provider_resource_type is not null
      and provider_version is not null and provider_etag is not null
      and original_format is not null and original_mime_type is not null and byte_size is not null)
  ),
  add constraint public_media_provenance_review_shape check (
    (provenance_reviewed_at is null and provenance_reviewed_by is null)
    or (provenance_reviewed_at is not null and provenance_reviewed_by is not null)
  ),
  add constraint public_media_approval_shape check (
    (approved_at is null and approved_by is null)
    or (approved_at is not null and approved_by is not null)
  ),
  add constraint public_media_rejection_shape check (
    (rejected_at is null and rejected_by is null and rejection_reason is null)
    or (rejected_at is not null and rejected_by is not null and rejection_reason is not null)
  );

create table public.public_media_upload_authorisations (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null unique references public.public_media_assets(id) on delete restrict,
  actor_id uuid not null references public.profiles(id) on delete restrict,
  provider_asset_id text not null unique check (provider_asset_id ~ '^ta_[a-f0-9]{32}$'),
  media_type text not null check (media_type in ('image','video')),
  expected_mime_type text not null check (expected_mime_type in (
    'image/jpeg','image/png','image/webp','image/avif','image/heic',
    'video/mp4','video/webm','video/quicktime'
  )),
  expected_byte_size bigint not null check (expected_byte_size between 1 and 52428800),
  expected_checksum_sha256 text not null check (expected_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  status text not null default 'reserved'
    check (status in ('reserved','completed','rejected','expired','cancelled')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  terminal_reason_code text check (terminal_reason_code is null or terminal_reason_code ~ '^[a-z_]{3,50}$'),
  provider_response_digest text check (provider_response_digest is null or provider_response_digest ~ '^[a-f0-9]{64}$'),
  check (expires_at>created_at and expires_at<=created_at+interval '10 minutes'),
  check ((status='reserved' and completed_at is null and terminal_reason_code is null)
    or (status='completed' and completed_at is not null and terminal_reason_code is null and provider_response_digest is not null)
    or (status in ('rejected','expired','cancelled') and completed_at is null and terminal_reason_code is not null))
);

create index public_media_upload_actor_created_idx
  on public.public_media_upload_authorisations(actor_id,created_at desc);
create index public_media_upload_expiry_idx
  on public.public_media_upload_authorisations(status,expires_at)
  where status='reserved';

create table public.public_media_events (
  id bigint generated always as identity primary key,
  media_id uuid not null references public.public_media_assets(id) on delete restrict,
  actor_id uuid references public.profiles(id) on delete restrict,
  action text not null check (action in (
    'upload_reserved','upload_confirmed','upload_rejected','upload_expired',
    'review_recorded','approved','rejected','archived'
  )),
  previous_state public.cms_media_state,
  new_state public.cms_media_state,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  detail jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (not (detail ?| array['password','otp','code','phone','secret','token','credential','api_key','api_secret'])),
  check (detail::text !~* '"(password|otp|code|phone|secret|token|credential|api_key|api_secret)"[[:space:]]*:')
);
create index public_media_events_media_created_idx on public.public_media_events(media_id,created_at desc,id desc);

alter table public.public_media_upload_authorisations enable row level security;
alter table public.public_media_events enable row level security;

revoke all on table public.public_media_upload_authorisations,public.public_media_events from public,anon,authenticated;
grant select on table public.public_media_upload_authorisations,public.public_media_events to service_role;
grant usage,select on sequence public.public_media_events_id_seq to service_role;

create trigger public_media_events_immutable
before update or delete on public.public_media_events
for each row execute function public.cms_reject_mutation();

-- Leadership safeguarding authority is explicit and independent from the
-- creator. The named Headmistress and Assistant Headmistress inherit this from
-- their accepted active leadership scope; creator self-review is still blocked.
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
         and p_capability in ('view_private','draft','review','publish','safeguarding_review') then true
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

create or replace function public.cms_begin_cloudinary_media_upload(
  p_provider_asset_id text,
  p_media_type text,
  p_expected_mime_type text,
  p_expected_byte_size bigint,
  p_checksum_sha256 text,
  p_title text,
  p_alt_text text,
  p_source_note text,
  p_child_identifiable boolean
)
returns table(authorisation_id uuid,media_id uuid,expires_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_media uuid:=gen_random_uuid();
  v_authorisation uuid:=gen_random_uuid();
  v_expires timestamptz:=now()+interval '5 minutes';
  v_limit bigint;
begin
  if v_actor is null or not public.cms_current_actor_can('draft') then
    raise exception 'CMS drafting authority required' using errcode='42501';
  end if;
  if p_provider_asset_id is null or p_provider_asset_id !~ '^ta_[a-f0-9]{32}$' then
    raise exception 'Invalid provider asset identifier' using errcode='22023';
  end if;
  if p_media_type not in ('image','video') then raise exception 'Invalid media type' using errcode='22023'; end if;
  if (p_media_type='image' and p_expected_mime_type not in ('image/jpeg','image/png','image/webp','image/avif','image/heic'))
     or (p_media_type='video' and p_expected_mime_type not in ('video/mp4','video/webm','video/quicktime')) then
    raise exception 'Media MIME type is not allowlisted' using errcode='22023';
  end if;
  v_limit:=case when p_media_type='image' then 10485760 else 52428800 end;
  if p_expected_byte_size not between 1 and v_limit then raise exception 'Media exceeds the accepted size' using errcode='22023'; end if;
  if p_checksum_sha256 is null or p_checksum_sha256 !~ '^[a-f0-9]{64}$' then raise exception 'A SHA-256 checksum is required' using errcode='22023'; end if;
  if char_length(trim(coalesce(p_title,''))) not between 2 and 180
     or char_length(trim(coalesce(p_alt_text,''))) not between 2 and 500
     or char_length(trim(coalesce(p_source_note,''))) not between 8 and 2000 then
    raise exception 'Media title, alternative text and source note are required' using errcode='22023';
  end if;
  if (select count(*) from public.public_media_upload_authorisations where actor_id=v_actor and created_at>now()-interval '10 minutes')>=10
     or (select count(*) from public.public_media_upload_authorisations where actor_id=v_actor and created_at>now()-interval '1 day')>=100 then
    raise exception 'Media upload reservation limit reached' using errcode='P0001';
  end if;

  insert into public.public_media_assets(
    id,provider,provider_asset_id,media_type,lifecycle_state,title,alt_text,source_note,
    checksum_sha256,child_identifiable,provenance_status,consent_status,
    safeguarding_status,public_derivative_only,metadata,created_by,retention_policy
  ) values (
    v_media,'cloudinary',p_provider_asset_id,p_media_type,'pending',trim(p_title),trim(p_alt_text),trim(p_source_note),
    p_checksum_sha256,p_child_identifiable,'pending',case when p_child_identifiable then 'pending' else 'not_required' end,
    case when p_child_identifiable then 'pending' else 'not_required' end,true,
    jsonb_build_object(
      'upload_status','reserved','expected_mime_type',p_expected_mime_type,
      'expected_byte_size',p_expected_byte_size,'retention_policy','manual_only',
      'provider_preset','treasure_academy_cms_signed','asset_folder','treasure-academy/cms/pending'
    ),v_actor,'manual_only'
  );
  insert into public.public_media_upload_authorisations(
    id,media_id,actor_id,provider_asset_id,media_type,expected_mime_type,
    expected_byte_size,expected_checksum_sha256,expires_at
  ) values (
    v_authorisation,v_media,v_actor,p_provider_asset_id,p_media_type,p_expected_mime_type,
    p_expected_byte_size,p_checksum_sha256,v_expires
  );
  insert into public.public_media_events(media_id,actor_id,action,new_state,reason,detail)
  values(v_media,v_actor,'upload_reserved','pending','Signed Cloudinary upload reserved',
    jsonb_build_object('authorisation_id',v_authorisation,'media_type',p_media_type,'expires_at',v_expires));
  return query select v_authorisation,v_media,v_expires;
end $$;
revoke all on function public.cms_begin_cloudinary_media_upload(text,text,text,bigint,text,text,text,text,boolean) from public,anon;
grant execute on function public.cms_begin_cloudinary_media_upload(text,text,text,bigint,text,text,text,text,boolean) to authenticated;

create or replace function public.cms_get_cloudinary_upload_authorisation(p_authorisation_id uuid)
returns table(
  authorisation_id uuid,media_id uuid,actor_id uuid,provider_asset_id text,media_type text,
  expected_mime_type text,expected_byte_size bigint,status text,expires_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce((select auth.role()),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then
    raise exception 'Service media authority required' using errcode='42501';
  end if;
  return query
  select a.id,a.media_id,a.actor_id,a.provider_asset_id,a.media_type,
    a.expected_mime_type,a.expected_byte_size,a.status,a.expires_at
  from public.public_media_upload_authorisations a where a.id=p_authorisation_id;
end $$;
revoke all on function public.cms_get_cloudinary_upload_authorisation(uuid) from public,anon,authenticated;
grant execute on function public.cms_get_cloudinary_upload_authorisation(uuid) to service_role;

create or replace function public.cms_complete_cloudinary_media_upload(
  p_authorisation_id uuid,
  p_actor_id uuid,
  p_provider_asset_uid text,
  p_provider_version bigint,
  p_provider_etag text,
  p_format text,
  p_mime_type text,
  p_byte_size bigint,
  p_width integer,
  p_height integer,
  p_duration_seconds numeric,
  p_provider_response_digest text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare v_authorisation public.public_media_upload_authorisations%rowtype; v_format_ok boolean;
begin
  if coalesce((select auth.role()),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then
    raise exception 'Service media authority required' using errcode='42501';
  end if;
  select * into v_authorisation from public.public_media_upload_authorisations where id=p_authorisation_id for update;
  if not found then raise exception 'Media upload authorisation not found' using errcode='P0002'; end if;
  if v_authorisation.status<>'reserved' or v_authorisation.expires_at<=now() or v_authorisation.actor_id<>p_actor_id then
    raise exception 'Media upload authorisation is not completable' using errcode='42501';
  end if;
  v_format_ok:=case v_authorisation.expected_mime_type
    when 'image/jpeg' then p_format in ('jpg','jpeg')
    when 'image/png' then p_format='png'
    when 'image/webp' then p_format='webp'
    when 'image/avif' then p_format='avif'
    when 'image/heic' then p_format in ('heic','heif')
    when 'video/mp4' then p_format='mp4'
    when 'video/webm' then p_format='webm'
    when 'video/quicktime' then p_format in ('mov','qt')
    else false end;
  if not v_format_ok or p_mime_type<>v_authorisation.expected_mime_type
     or p_byte_size<>v_authorisation.expected_byte_size
     or p_provider_asset_uid is null or char_length(p_provider_asset_uid) not between 8 and 255
     or p_provider_version is null or p_provider_version<=0
     or p_provider_etag is null or p_provider_etag !~ '^[a-f0-9]{32,64}$'
     or p_provider_response_digest is null or p_provider_response_digest !~ '^[a-f0-9]{64}$'
     or (v_authorisation.media_type='image' and (p_width is null or p_height is null or p_duration_seconds is not null))
     or (v_authorisation.media_type='video' and (p_width is null or p_height is null or p_duration_seconds is null or p_duration_seconds<=0)) then
    raise exception 'Authoritative provider metadata does not match the reservation' using errcode='22023';
  end if;
  update public.public_media_assets set
    provider_asset_uid=p_provider_asset_uid,provider_resource_type=v_authorisation.media_type,
    provider_version=p_provider_version,provider_etag=p_provider_etag,original_format=p_format,
    original_mime_type=p_mime_type,byte_size=p_byte_size,width=p_width,height=p_height,
    duration_seconds=p_duration_seconds,upload_completed_at=now(),updated_at=now(),
    metadata=metadata || jsonb_build_object('upload_status','confirmed','provider_response_digest',p_provider_response_digest)
  where id=v_authorisation.media_id;
  update public.public_media_upload_authorisations set status='completed',completed_at=now(),
    provider_response_digest=p_provider_response_digest where id=p_authorisation_id;
  insert into public.public_media_events(media_id,actor_id,action,previous_state,new_state,reason,detail)
  values(v_authorisation.media_id,p_actor_id,'upload_confirmed','pending','pending','Authoritative Cloudinary upload confirmed',
    jsonb_build_object('authorisation_id',p_authorisation_id,'format',p_format,'byte_size',p_byte_size));
  return v_authorisation.media_id;
end $$;
revoke all on function public.cms_complete_cloudinary_media_upload(uuid,uuid,text,bigint,text,text,text,bigint,integer,integer,numeric,text) from public,anon,authenticated;
grant execute on function public.cms_complete_cloudinary_media_upload(uuid,uuid,text,bigint,text,text,text,bigint,integer,integer,numeric,text) to service_role;

create or replace function public.cms_reject_cloudinary_media_upload(
  p_authorisation_id uuid,p_actor_id uuid,p_reason_code text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_authorisation public.public_media_upload_authorisations%rowtype;
begin
  if coalesce((select auth.role()),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then
    raise exception 'Service media authority required' using errcode='42501';
  end if;
  if p_reason_code is null or p_reason_code !~ '^[a-z_]{3,50}$' then raise exception 'Invalid media rejection reason' using errcode='22023'; end if;
  select * into v_authorisation from public.public_media_upload_authorisations where id=p_authorisation_id for update;
  if not found or v_authorisation.status<>'reserved' or v_authorisation.actor_id<>p_actor_id then
    raise exception 'Media upload authorisation is not rejectable' using errcode='42501';
  end if;
  update public.public_media_upload_authorisations set status='rejected',terminal_reason_code=p_reason_code where id=p_authorisation_id;
  update public.public_media_assets set lifecycle_state='rejected',rejected_by=p_actor_id,rejected_at=now(),
    rejection_reason='Provider upload rejected by the governed validation boundary',updated_at=now(),
    metadata=metadata || jsonb_build_object('upload_status','rejected','rejection_reason_code',p_reason_code)
  where id=v_authorisation.media_id;
  insert into public.public_media_events(media_id,actor_id,action,previous_state,new_state,reason,detail)
  values(v_authorisation.media_id,p_actor_id,'upload_rejected','pending','rejected','Cloudinary upload rejected by provider validation',
    jsonb_build_object('authorisation_id',p_authorisation_id,'reason_code',p_reason_code));
  return true;
end $$;
revoke all on function public.cms_reject_cloudinary_media_upload(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.cms_reject_cloudinary_media_upload(uuid,uuid,text) to service_role;

create or replace function public.cms_expire_cloudinary_media_uploads()
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer:=0; v_row record;
begin
  if coalesce((select auth.role()),'')<>'service_role' and session_user not in ('postgres','supabase_admin') then
    raise exception 'Service media authority required' using errcode='42501';
  end if;
  for v_row in
    select id,media_id,actor_id from public.public_media_upload_authorisations
    where status='reserved' and expires_at<=now() for update skip locked
  loop
    update public.public_media_upload_authorisations set status='expired',terminal_reason_code='reservation_expired' where id=v_row.id;
    update public.public_media_assets set lifecycle_state='rejected',rejected_by=v_row.actor_id,rejected_at=now(),
      rejection_reason='Signed upload reservation expired before provider confirmation',updated_at=now(),
      metadata=metadata || jsonb_build_object('upload_status','expired') where id=v_row.media_id;
    insert into public.public_media_events(media_id,actor_id,action,previous_state,new_state,reason,detail)
    values(v_row.media_id,v_row.actor_id,'upload_expired','pending','rejected','Signed upload reservation expired',jsonb_build_object('authorisation_id',v_row.id));
    v_count:=v_count+1;
  end loop;
  return v_count;
end $$;
revoke all on function public.cms_expire_cloudinary_media_uploads() from public,anon,authenticated;
grant execute on function public.cms_expire_cloudinary_media_uploads() to service_role;

create or replace function public.cms_review_media(
  p_media_id uuid,p_review_kind text,p_decision text,p_reference text,p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid:=(select auth.uid());
  v_media public.public_media_assets%rowtype;
  v_previous public.cms_media_state;
  v_new public.cms_media_state;
  v_allowed boolean:=false;
begin
  if v_actor is null or char_length(trim(coalesce(p_reason,''))) not between 8 and 500 then
    raise exception 'An authenticated reviewer and detailed reason are required' using errcode='42501';
  end if;
  select * into v_media from public.public_media_assets where id=p_media_id for update;
  if not found or v_media.archived_at is not null or v_media.upload_completed_at is null then
    raise exception 'Completed active media is required' using errcode='22023';
  end if;
  if v_media.child_identifiable and v_media.created_by=v_actor then
    raise exception 'Identifiable-child media creator cannot review their own item' using errcode='42501';
  end if;
  v_previous:=v_media.lifecycle_state;
  v_new:=v_previous;

  if p_review_kind='provenance' then
    v_allowed:=public.cms_current_actor_can('review') or public.cms_current_actor_can('safeguarding_review');
    if not v_allowed or p_decision not in ('approved','rejected') then raise exception 'Provenance review authority and decision required' using errcode='42501'; end if;
    update public.public_media_assets set provenance_status=case when p_decision='approved' then 'verified' else 'rejected' end,
      provenance_reviewed_by=v_actor,provenance_reviewed_at=now(),
      lifecycle_state=case when p_decision='rejected' then 'rejected' else lifecycle_state end,
      rejected_by=case when p_decision='rejected' then v_actor else null end,
      rejected_at=case when p_decision='rejected' then now() else null end,
      rejection_reason=case when p_decision='rejected' then trim(p_reason) else null end,updated_at=now()
    where id=p_media_id;
    if p_decision='rejected' then v_new:='rejected'; end if;
  elsif p_review_kind='consent' then
    if not public.cms_current_actor_can('safeguarding_review') or p_decision not in ('approved','denied','expired','not_required') then
      raise exception 'Safeguarding consent review authority and decision required' using errcode='42501';
    end if;
    if v_media.child_identifiable and p_decision='not_required' then raise exception 'Identifiable-child media requires affirmative consent' using errcode='22023'; end if;
    if p_decision='approved' and char_length(trim(coalesce(p_reference,''))) not between 4 and 500 then raise exception 'Approved consent requires a reference' using errcode='22023'; end if;
    update public.public_media_assets set consent_status=p_decision,
      consent_reference=case when p_decision='approved' then trim(p_reference) else null end,
      consent_reviewed_by=v_actor,consent_reviewed_at=now(),
      lifecycle_state=case when p_decision in ('denied','expired') then 'rejected' else lifecycle_state end,
      rejected_by=case when p_decision in ('denied','expired') then v_actor else null end,
      rejected_at=case when p_decision in ('denied','expired') then now() else null end,
      rejection_reason=case when p_decision in ('denied','expired') then trim(p_reason) else null end,updated_at=now()
    where id=p_media_id;
    if p_decision in ('denied','expired') then v_new:='rejected'; end if;
  elsif p_review_kind='safeguarding' then
    if not public.cms_current_actor_can('safeguarding_review') or p_decision not in ('approved','rejected') then
      raise exception 'Safeguarding review authority and decision required' using errcode='42501';
    end if;
    if v_media.child_identifiable and p_decision='approved'
       and (v_media.provenance_status<>'verified' or v_media.consent_status<>'approved') then
      raise exception 'Verified provenance and approved consent are required first' using errcode='22023';
    end if;
    update public.public_media_assets set safeguarding_status=case when p_decision='approved' then 'approved' else 'rejected' end,
      safeguarding_reviewed_by=v_actor,safeguarding_reviewed_at=now(),
      lifecycle_state=case when p_decision='rejected' then 'rejected' else lifecycle_state end,
      rejected_by=case when p_decision='rejected' then v_actor else null end,
      rejected_at=case when p_decision='rejected' then now() else null end,
      rejection_reason=case when p_decision='rejected' then trim(p_reason) else null end,updated_at=now()
    where id=p_media_id;
    if p_decision='rejected' then v_new:='rejected'; end if;
  elsif p_review_kind='publication' then
    if not public.cms_current_actor_can('publish') or p_decision not in ('approved','rejected') then
      raise exception 'Publication authority and decision required' using errcode='42501';
    end if;
    if p_decision='approved' and (
      v_media.provenance_status<>'verified'
      or (v_media.child_identifiable and (v_media.consent_status<>'approved' or v_media.safeguarding_status<>'approved'))
      or (not v_media.child_identifiable and v_media.consent_status not in ('not_required','approved'))
      or v_media.title is null or v_media.alt_text is null
    ) then raise exception 'Media has unresolved publication blockers' using errcode='22023'; end if;
    v_new:=case when p_decision='approved' then 'approved'::public.cms_media_state else 'rejected'::public.cms_media_state end;
    update public.public_media_assets set lifecycle_state=v_new,
      approved_by=case when p_decision='approved' then v_actor else null end,
      approved_at=case when p_decision='approved' then now() else null end,
      rejected_by=case when p_decision='rejected' then v_actor else null end,
      rejected_at=case when p_decision='rejected' then now() else null end,
      rejection_reason=case when p_decision='rejected' then trim(p_reason) else null end,updated_at=now()
    where id=p_media_id;
  else
    raise exception 'Unsupported media review kind' using errcode='22023';
  end if;

  insert into public.public_media_events(media_id,actor_id,action,previous_state,new_state,reason,detail)
  values(p_media_id,v_actor,case when p_review_kind='publication' and p_decision='approved' then 'approved'
    when p_decision in ('rejected','denied','expired') then 'rejected' else 'review_recorded' end,
    v_previous,v_new,trim(p_reason),jsonb_build_object(
      'review_kind',p_review_kind,'decision',p_decision,'has_reference',p_reference is not null and trim(p_reference)<>''
    ));
  return true;
end $$;
revoke all on function public.cms_review_media(uuid,text,text,text,text) from public,anon;
grant execute on function public.cms_review_media(uuid,text,text,text,text) to authenticated;

create or replace function public.cms_archive_media(p_media_id uuid,p_reason text)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_actor uuid:=(select auth.uid()); v_media public.public_media_assets%rowtype;
begin
  if v_actor is null or not (public.cms_current_actor_can('publish') or public.cms_current_actor_can('administer')) then
    raise exception 'Media archive authority required' using errcode='42501';
  end if;
  if char_length(trim(coalesce(p_reason,''))) not between 8 and 500 then raise exception 'A detailed archive reason is required' using errcode='22023'; end if;
  select * into v_media from public.public_media_assets where id=p_media_id for update;
  if not found or v_media.archived_at is not null then raise exception 'Active media is required' using errcode='22023'; end if;
  update public.public_media_assets set lifecycle_state='archived',archived_at=now(),archived_by=v_actor,
    archive_reason=trim(p_reason),updated_at=now() where id=p_media_id;
  insert into public.public_media_events(media_id,actor_id,action,previous_state,new_state,reason)
  values(p_media_id,v_actor,'archived',v_media.lifecycle_state,'archived',trim(p_reason));
  return true;
end $$;
revoke all on function public.cms_archive_media(uuid,text) from public,anon;
grant execute on function public.cms_archive_media(uuid,text) to authenticated;

create or replace function public.cms_get_media_for_delivery(p_media_id uuid,p_variant text)
returns table(
  media_id uuid,provider_asset_id text,media_type text,original_format text,
  provider_version bigint,lifecycle_state public.cms_media_state,title text,alt_text text
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.cms_current_actor_can('view_private') then
    raise exception 'Private CMS visibility required' using errcode='42501';
  end if;
  if p_variant not in ('thumb','card','content-640','content-960','content-1280','hero','video-720','poster','download-1600') then
    raise exception 'Unsupported media derivative' using errcode='22023';
  end if;
  if p_variant='download-1600' and not exists(
    select 1 from public.public_content_media cm
    where cm.media_id=p_media_id and cm.placement='download'
      and public.cms_revision_is_public(cm.revision_id)
  ) then
    raise exception 'Explicit current download permission is required' using errcode='42501';
  end if;
  return query select m.id,m.provider_asset_id,m.media_type,m.original_format,m.provider_version,
    m.lifecycle_state,m.title,m.alt_text
  from public.public_media_assets m
  where m.id=p_media_id and m.provider='cloudinary' and m.upload_completed_at is not null and m.archived_at is null;
end $$;
revoke all on function public.cms_get_media_for_delivery(uuid,text) from public,anon;
grant execute on function public.cms_get_media_for_delivery(uuid,text) to authenticated;

create or replace function public.cms_export_cloudinary_media_manifest(p_limit integer default 200,p_offset integer default 0)
returns table(
  media_id uuid,provider_asset_id text,provider_asset_uid text,media_type text,
  provider_delivery_type text,provider_version bigint,original_format text,original_mime_type text,
  byte_size bigint,width integer,height integer,duration_seconds numeric,checksum_sha256 text,
  title text,alt_text text,attribution text,source_note text,child_identifiable boolean,
  provenance_status text,consent_status text,safeguarding_status text,lifecycle_state public.cms_media_state,
  retention_policy text,created_by uuid,created_at timestamptz,upload_completed_at timestamptz,
  approved_by uuid,approved_at timestamptz,archived_at timestamptz,
  has_placement boolean,orphan_candidate boolean,orphan_reason text
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.cms_current_actor_can('administer') then
    raise exception 'Media manifest administration required' using errcode='42501';
  end if;
  if p_limit not between 1 and 500 or p_offset not between 0 and 100000 then
    raise exception 'Manifest page is outside the accepted range' using errcode='22023';
  end if;
  return query
  select m.id,m.provider_asset_id,m.provider_asset_uid,m.media_type,
    m.provider_delivery_type,m.provider_version,m.original_format,m.original_mime_type,
    m.byte_size,m.width,m.height,m.duration_seconds,m.checksum_sha256,
    m.title,m.alt_text,m.attribution,m.source_note,m.child_identifiable,
    m.provenance_status,m.consent_status,m.safeguarding_status,m.lifecycle_state,
    m.retention_policy,m.created_by,m.created_at,m.upload_completed_at,
    m.approved_by,m.approved_at,m.archived_at,
    exists(select 1 from public.public_content_media cm where cm.media_id=m.id) as has_placement,
    (m.upload_completed_at is null or not exists(select 1 from public.public_content_media cm where cm.media_id=m.id)) as orphan_candidate,
    case
      when m.upload_completed_at is null then 'upload_not_confirmed'
      when not exists(select 1 from public.public_content_media cm where cm.media_id=m.id) then 'no_content_placement'
      else null
    end as orphan_reason
  from public.public_media_assets m
  where m.provider='cloudinary'
  order by m.created_at,m.id
  limit p_limit offset p_offset;
end $$;
revoke all on function public.cms_export_cloudinary_media_manifest(integer,integer) from public,anon;
grant execute on function public.cms_export_cloudinary_media_manifest(integer,integer) to authenticated;

comment on table public.public_media_upload_authorisations is 'Five-minute, actor-bound Cloudinary upload reservations; no secret or raw signature is stored.';
comment on table public.public_media_events is 'Immutable media upload/review/publication audit without provider secrets or raw consent references.';
comment on column public.public_media_assets.retention_policy is 'Run 6 owner decision: no automated orphan deletion; cleanup is manual and separately authorised.';

commit;
