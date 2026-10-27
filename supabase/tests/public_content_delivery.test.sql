-- Treasure Academy Run 8 public-content delivery projection test.
-- Disposable local/staging database only; no persistent rows are created.
begin;

create or replace function pg_temp.assert_true(ok boolean,message text)
returns void language plpgsql as $$ begin
  if not coalesce(ok,false) then raise exception 'PUBLIC CONTENT DELIVERY TEST FAILED: %',message; end if;
end $$;

select pg_temp.assert_true(
  (select array_agg(attname::text order by attnum) = array[
    'revision_id','placement','placement_position','caption','media_id','provider','provider_asset_id',
    'media_type','title','alt_text','attribution','width','height','duration_seconds',
    'public_derivative_only','provider_version','original_format'
  ]::text[] from pg_attribute
   where attrelid='public.public_cms_published_media'::regclass and attnum>0 and not attisdropped),
  'Published media projection must expose exactly the accepted fixed columns'
);
select pg_temp.assert_true(
  has_table_privilege('anon','public.public_cms_published_media','SELECT'),
  'Anonymous rendering may read only the published media projection'
);
select pg_temp.assert_true(
  not has_table_privilege('anon','public.public_media_assets','SELECT'),
  'Anonymous rendering must not read base media records or consent/provider audit fields'
);
select pg_temp.assert_true(
  (select definition not ilike '%consent_reference%'
      and definition not ilike '%provider_asset_uid%'
      and definition not ilike '%provider_etag%'
      and definition not ilike '%checksum_sha256%'
      and definition not ilike '%created_by%'
   from pg_views where schemaname='public' and viewname='public_cms_published_media'),
  'Published delivery projection must omit private consent, audit and provider-verification fields'
);
select pg_temp.assert_true(
  (select definition ilike '%cms_revision_is_public%'
      and definition ilike '%lifecycle_state%approved%'
      and definition ilike '%provenance_status%verified%'
      and definition ilike '%provider_delivery_type%authenticated%'
      and definition ilike '%upload_completed_at%'
      and definition ilike '%safeguarding_status%approved%'
   from pg_views where schemaname='public' and viewname='public_cms_published_media'),
  'Published media must remain current, approved, verified and provider-confirmed'
);

rollback;
