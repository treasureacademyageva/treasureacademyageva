-- Treasure Academy public CMS delivery projection
-- Run 8: expose only the provider version/format required to render approved
-- transformed derivatives. No content, media, identity, provider call, route or
-- feature gate is created or activated by this migration.

begin;

create or replace function public.cms_media_is_publicly_usable(p_media_id uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select exists(
    select 1 from public.public_media_assets m
    where m.id=p_media_id and m.lifecycle_state='approved' and m.archived_at is null
      and m.provenance_status='verified'
      and m.provider='cloudinary' and m.provider_delivery_type='authenticated'
      and m.upload_completed_at is not null and m.provider_version is not null and m.original_format is not null
      and (m.consent_status='approved' or (not m.child_identifiable and m.consent_status='not_required'))
      and (not m.child_identifiable or m.safeguarding_status='approved')
      and exists(
        select 1 from public.public_content_media cm
        where cm.media_id=m.id and public.cms_revision_is_public(cm.revision_id)
      )
  )
$$;
revoke all on function public.cms_media_is_publicly_usable(uuid) from public;
grant execute on function public.cms_media_is_publicly_usable(uuid) to anon,authenticated,service_role;

create or replace view public.public_cms_published_media
with (security_invoker=false,security_barrier=true)
as
select cm.revision_id,cm.placement,cm.placement_position,cm.caption,
  m.id as media_id,m.provider,m.provider_asset_id,m.media_type,m.title,m.alt_text,m.attribution,
  m.width,m.height,m.duration_seconds,m.public_derivative_only,
  m.provider_version,m.original_format
from public.public_content_media cm
join public.public_media_assets m on m.id=cm.media_id
where public.cms_revision_is_public(cm.revision_id)
  and m.lifecycle_state='approved' and m.archived_at is null
  and m.provenance_status='verified'
  and m.provider='cloudinary' and m.provider_delivery_type='authenticated'
  and m.upload_completed_at is not null and m.provider_version is not null
  and m.original_format is not null
  and (m.consent_status='approved' or (not m.child_identifiable and m.consent_status='not_required'))
  and (not m.child_identifiable or m.safeguarding_status='approved');

grant select on table public.public_cms_published_media to anon,authenticated,service_role;

comment on view public.public_cms_published_media is
  'Approved current content relationships and the minimum non-secret provider coordinates needed for bounded transformed public delivery; consent references, provider asset UIDs, etags, checksums, creator/reviewer identities and originals are excluded.';

commit;
