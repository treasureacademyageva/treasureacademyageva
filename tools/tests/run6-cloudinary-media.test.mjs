import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import test from 'node:test';
import {
  buildSignedCloudinaryDeliveryUrl,
  cloudinarySettings,
  handleMediaComplete,
  handleMediaDelivery,
  handleMediaManifest,
  handleMediaSign,
  handleMediaUsage,
  mediaPolicy,
  sanitizeCloudinaryUsage,
  signCloudinaryParameters,
  validateMediaReservation,
  validateProviderResource
} from '../../server/cms-media.mjs';

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const migration = read('supabase/migrations/20261026070000_cloudinary_media_governance.sql');
const schema = read('supabase-schema.sql');
const vercel = JSON.parse(read('vercel.json'));
const envExample = read('.env.example');
const apiDispatcher = read('api/cms-media.mjs');
const server = read('server/cms-media.mjs');
const sqlSuite = read('supabase/tests/cloudinary_media_governance.test.sql');

const enabledEnv = {
  CMS_MEDIA_ENABLED: 'true',
  SUPABASE_URL: 'https://fictional.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fictional-publishable',
  SUPABASE_SECRET_KEY: 'fictional-secret',
  CLOUDINARY_CLOUD_NAME: 'ecbad9xj',
  CLOUDINARY_API_KEY: '123456789012345',
  CLOUDINARY_API_SECRET: 'fictional-cloudinary-secret-value',
  CLOUDINARY_UPLOAD_PRESET: 'treasure_academy_cms_signed',
  CLOUDINARY_ASSET_FOLDER: 'treasure-academy/cms/pending',
  CLOUDINARY_DELIVERY_TYPE: 'authenticated',
  CLOUDINARY_USAGE_WARNING_PERCENT: '70'
};

const actorId = '15000000-0000-4000-8000-000000000004';
const reservationId = '35000000-0000-4000-8000-000000000001';
const mediaId = '25000000-0000-4000-8000-000000000001';
const publicId = `ta_${'ab'.repeat(16)}`;
const checksum = 'c'.repeat(64);
const future = '2099-01-01T00:05:00.000Z';

function jsonRequest(path, body) {
  return new Request(`https://school.example${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://school.example' },
    body: JSON.stringify(body)
  });
}

function validReservation(overrides = {}) {
  return {
    mediaType: 'image', mimeType: 'image/jpeg', byteSize: 2048,
    checksumSha256: checksum, title: 'Fictional safe fixture',
    altText: 'Fictional non-person media fixture',
    sourceNote: 'Generated locally for rollback-safe testing only.',
    childIdentifiable: false,
    ...overrides
  };
}

function authenticated(overrides = {}) {
  return async () => ({
    userId: actorId,
    adminClient: {},
    userClient: {},
    ...overrides
  });
}

test('Run 6 provider configuration is pinned, independently gated and secret-safe', () => {
  assert.throws(() => cloudinarySettings({ ...enabledEnv, CMS_MEDIA_ENABLED: 'false' }), /disabled/);
  assert.throws(() => cloudinarySettings({ ...enabledEnv, CLOUDINARY_CLOUD_NAME: 'other-cloud' }), /misconfigured/);
  assert.throws(() => cloudinarySettings({ ...enabledEnv, CLOUDINARY_DELIVERY_TYPE: 'upload' }), /misconfigured/);
  const config = cloudinarySettings(enabledEnv);
  assert.equal(config.cloudName, 'ecbad9xj');
  assert.equal(config.uploadPreset, 'treasure_academy_cms_signed');
  assert.equal(config.assetFolder, 'treasure-academy/cms/pending');
  assert.equal(config.deliveryType, 'authenticated');
  assert.doesNotMatch(apiDispatcher, /API_SECRET|apiSecret/);
  assert.match(envExample, /^CMS_MEDIA_ENABLED=false$/m);
  assert.match(envExample, /^CLOUDINARY_API_SECRET=$/m);
  assert.doesNotMatch(envExample, /CLOUDINARY_API_SECRET=\S+/);
});

test('reservation validation accepts only bounded image/video signatures and closed fields', () => {
  assert.equal(validateMediaReservation(validReservation()).mediaType, 'image');
  assert.equal(validateMediaReservation(validReservation({ mediaType: 'video', mimeType: 'video/mp4', byteSize: 50 * 1024 * 1024 })).mediaType, 'video');
  assert.throws(() => validateMediaReservation(validReservation({ mimeType: 'image/svg+xml' })), /invalid_media/);
  assert.throws(() => validateMediaReservation(validReservation({ byteSize: 10 * 1024 * 1024 + 1 })), /invalid_media/);
  assert.throws(() => validateMediaReservation(validReservation({ checksumSha256: 'not-a-checksum' })), /invalid_media/);
  assert.throws(() => validateMediaReservation({ ...validReservation(), originalFilename: 'child-name.jpg' }), /unsupported_fields/);
  assert.throws(() => validateMediaReservation(validReservation({ childIdentifiable: 'false' })), /invalid_media/);
});

test('SHA-256 upload signatures cover every fixed upload parameter', () => {
  const parameters = {
    asset_folder: 'treasure-academy/cms/pending',
    public_id: publicId,
    timestamp: 1700000000,
    type: 'authenticated',
    upload_preset: 'treasure_academy_cms_signed'
  };
  const canonical = Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('&');
  const expected = createHash('sha256').update(canonical + enabledEnv.CLOUDINARY_API_SECRET).digest('hex');
  assert.equal(expected, '47a313c0ed4153e09ba351cc512c983930de4bc1a0cf2bd239ec199a68cc727c');
  assert.equal(signCloudinaryParameters(parameters, enabledEnv.CLOUDINARY_API_SECRET), expected);
  assert.equal(expected.length, 64);
});

test('sign endpoint reserves an actor-bound record and never returns the API secret', async () => {
  const response = await handleMediaSign(jsonRequest('/api/cms/media/sign', validReservation()), {
    env: enabledEnv,
    authenticate: authenticated(),
    randomBytes: () => Buffer.alloc(16, 0xab),
    now: () => 1700000000000,
    reserve: async () => ({ data: [{ authorisation_id: reservationId, media_id: mediaId, expires_at: future }], error: null })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.reservationId, reservationId);
  assert.equal(body.mediaId, mediaId);
  assert.equal(body.upload.public_id, publicId);
  assert.equal(body.upload.type, 'authenticated');
  assert.equal(body.upload.tags, 'treasure-academy,cms,manual-review-required');
  assert.equal(body.upload.overwrite, 'false');
  assert.equal(body.upload.discard_original_filename, 'true');
  assert.equal(body.upload.url, 'https://api.cloudinary.com/v1_1/ecbad9xj/image/upload');
  assert.equal(body.upload.signatureAlgorithm, 'sha256');
  assert.equal(body.upload.signature.length, 64);
  assert.equal(body.upload.apiKey, enabledEnv.CLOUDINARY_API_KEY);
  assert.doesNotMatch(JSON.stringify(body), new RegExp(enabledEnv.CLOUDINARY_API_SECRET));
  assert.doesNotMatch(JSON.stringify(body), /originalFilename|sourceNote|altText/);
});

test('media endpoints fail closed before authentication when the independent gate is off', async () => {
  let called = false;
  const response = await handleMediaSign(jsonRequest('/api/cms/media/sign', validReservation()), {
    env: { ...enabledEnv, CMS_MEDIA_ENABLED: 'false' },
    authenticate: async () => { called = true; }
  });
  assert.equal(response.status, 404);
  assert.equal(called, false);
});

test('upload signing requires exact same-origin POST and rejects unknown metadata', async () => {
  let called = false;
  const crossOrigin = new Request('https://school.example/api/cms/media/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: 'https://attacker.example' },
    body: JSON.stringify(validReservation())
  });
  const rejected = await handleMediaSign(crossOrigin, {
    env: enabledEnv,
    authenticate: async () => { called = true; }
  });
  assert.equal(rejected.status, 403);
  assert.equal(called, false);

  const unknown = await handleMediaSign(jsonRequest('/api/cms/media/sign', { ...validReservation(), filename: 'child-name.jpg' }), {
    env: enabledEnv,
    authenticate: authenticated()
  });
  assert.equal(unknown.status, 400);
});

function reservation(overrides = {}) {
  return {
    authorisation_id: reservationId,
    media_id: mediaId,
    actor_id: actorId,
    provider_asset_id: publicId,
    media_type: 'image',
    expected_mime_type: 'image/jpeg',
    expected_byte_size: 2048,
    status: 'reserved',
    expires_at: future,
    ...overrides
  };
}

function providerResource(overrides = {}) {
  return {
    public_id: publicId,
    resource_type: 'image',
    type: 'authenticated',
    asset_folder: 'treasure-academy/cms/pending',
    format: 'jpg',
    bytes: 2048,
    tags: ['treasure-academy', 'cms', 'manual-review-required'],
    asset_id: 'fictional-cloudinary-asset-id',
    version: 1700000001,
    etag: 'a'.repeat(32),
    width: 1200,
    height: 800,
    ...overrides
  };
}

test('completion trusts authoritative provider metadata, not a browser response', async () => {
  const selected = validateProviderResource(providerResource(), reservation(), cloudinarySettings(enabledEnv));
  assert.equal(selected.mimeType, 'image/jpeg');
  assert.equal(selected.responseDigest.length, 64);
  let completion;
  let providerLookup;
  const response = await handleMediaComplete(jsonRequest('/api/cms/media/complete', { reservationId }), {
    env: enabledEnv,
    authenticate: authenticated(),
    now: () => Date.parse('2028-01-01T00:00:00Z'),
    lookupReservation: async () => reservation(),
    fetch: async (url, init) => {
      providerLookup = { url, authorization: init.headers.Authorization };
      return new Response(JSON.stringify(providerResource()), { status: 200, headers: { 'Content-Type': 'application/json' } });
    },
    complete: async () => {
      completion = true;
      return { data: mediaId, error: null };
    }
  });
  assert.equal(response.status, 200);
  assert.equal(completion, true);
  assert.equal(providerLookup.url, `https://api.cloudinary.com/v1_1/ecbad9xj/resources/image/authenticated/${publicId}?tags=true`);
  assert.match(providerLookup.authorization, /^Basic [A-Za-z0-9+/]+=*$/);
  assert.deepEqual(await response.json(), {
    accepted: true,
    mediaId,
    lifecycleState: 'pending',
    message: 'Upload confirmed. Independent review is required before publication.'
  });
});

test('provider mismatches fail closed, are quarantined and are never auto-deleted', async () => {
  let rejected;
  let completed = false;
  const response = await handleMediaComplete(jsonRequest('/api/cms/media/complete', { reservationId }), {
    env: enabledEnv,
    authenticate: authenticated(),
    now: () => Date.parse('2028-01-01T00:00:00Z'),
    lookupReservation: async () => reservation(),
    fetchProviderResource: async () => providerResource({ type: 'upload' }),
    reject: async (id, actor, reason) => { rejected = { id, actor, reason }; return { data: true, error: null }; },
    complete: async () => { completed = true; }
  });
  assert.equal(response.status, 422);
  assert.deepEqual(rejected, { id: reservationId, actor: actorId, reason: 'provider_metadata_mismatch' });
  assert.equal(completed, false);
  assert.doesNotMatch(server, /destroy\s*\(|\/destroy|delete_resources/i);
});

test('delivery helper exposes bounded transformed derivatives and never an original URL', async () => {
  const first = buildSignedCloudinaryDeliveryUrl({
    cloudName: 'ecbad9xj', apiSecret: enabledEnv.CLOUDINARY_API_SECRET,
    publicId, mediaType: 'image', providerVersion: 1700000001, variant: 'content-640'
  });
  const second = buildSignedCloudinaryDeliveryUrl({
    cloudName: 'ecbad9xj', apiSecret: enabledEnv.CLOUDINARY_API_SECRET,
    publicId, mediaType: 'video', providerVersion: 1700000001, variant: 'poster'
  });
  assert.match(first.url, /^https:\/\/res\.cloudinary\.com\/ecbad9xj\/image\/authenticated\/s--[A-Za-z0-9_-]{8}--\/c_limit,w_640,q_auto:good,f_auto\/v1700000001\/ta_[a-f0-9]{32}$/);
  assert.match(second.url, /^https:\/\/res\.cloudinary\.com\/ecbad9xj\/video\/authenticated\/s--[A-Za-z0-9_-]{8}--\/c_limit,w_1280,q_auto:good,so_0,f_jpg\/v1700000001\/ta_[a-f0-9]{32}\.jpg$/);
  assert.equal(first.metadataPolicy, 'transformed-derivative-strips-embedded-metadata');
  assert.doesNotMatch(first.url, new RegExp(enabledEnv.CLOUDINARY_API_SECRET));
  assert.throws(() => buildSignedCloudinaryDeliveryUrl({ cloudName: 'ecbad9xj', apiSecret: 'x', publicId, mediaType: 'image', providerVersion: 1700000001, variant: 'original' }), /invalid_variant/);

  const response = await handleMediaDelivery(new Request(`https://school.example/api/cms/media/delivery?mediaId=${mediaId}&variant=thumb`), {
    env: enabledEnv,
    authenticate: authenticated(),
    getMedia: async () => ({ data: [{ media_id: mediaId, provider_asset_id: publicId, media_type: 'image', provider_version: 1700000001, lifecycle_state: 'pending', title: 'Fixture', alt_text: 'Fixture alt' }], error: null })
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.variant, 'thumb');
  assert.equal(body.width, 320);
  assert.match(body.url, /\/authenticated\/s--/);
});

test('quota response is privacy-safe and warns before the configured threshold', async () => {
  const providerPayload = {
    plan: 'Free', last_updated: '2026-10-26',
    credits: { usage: 18, limit: 25 },
    storage: { usage: 3, limit: 25 },
    account_id: 'must-not-appear', api_key: 'must-not-appear'
  };
  const usage = sanitizeCloudinaryUsage(providerPayload, 70);
  assert.equal(usage.warning, true);
  assert.equal(usage.highestPercent, 72);
  assert.equal(usage.metrics.credits.percent, 72);
  assert.doesNotMatch(JSON.stringify(usage), /account_id|api_key|must-not-appear/);

  let requiredCapability;
  const response = await handleMediaUsage(new Request('https://school.example/api/cms/media/usage'), {
    env: enabledEnv,
    authenticate: async (request, capability) => {
      requiredCapability = capability;
      return { userId: actorId, adminClient: {}, userClient: {} };
    },
    fetch: async () => new Response(JSON.stringify(providerPayload), { status: 200 })
  });
  assert.equal(response.status, 200);
  assert.equal(requiredCapability, 'administer');
  assert.doesNotMatch(await response.text(), /account_id|api_key|must-not-appear/);
});

test('owner-only manifest paginates exportable orphan state without a deletion action', async () => {
  let requiredCapability;
  let requestedPage;
  const item = {
    media_id: mediaId,
    provider_asset_id: publicId,
    media_type: 'image',
    lifecycle_state: 'rejected',
    retention_policy: 'manual_only',
    has_placement: false,
    orphan_candidate: true,
    orphan_reason: 'no_content_placement'
  };
  const response = await handleMediaManifest(new Request('https://school.example/api/cms/media/manifest?limit=1&offset=4'), {
    env: enabledEnv,
    now: () => Date.parse('2026-10-26T12:00:00Z'),
    authenticate: async (request, capability) => {
      requiredCapability = capability;
      return { userId: actorId, adminClient: {}, userClient: {} };
    },
    getManifest: async (limit, offset) => {
      requestedPage = { limit, offset };
      return { data: [item], error: null };
    }
  });
  assert.equal(response.status, 200);
  assert.equal(requiredCapability, 'administer');
  assert.deepEqual(requestedPage, { limit: 1, offset: 4 });
  assert.deepEqual(await response.json(), {
    generatedAt: '2026-10-26T12:00:00.000Z',
    retentionPolicy: 'manual_only',
    deletionPolicy: 'manual_authorisation_required',
    offset: 4,
    count: 1,
    nextOffset: 5,
    items: [item]
  });
});

test('migration enforces manual retention, independent child review and immutable audit', () => {
  assert.match(migration, /retention_policy text not null default 'manual_only'/i);
  assert.match(migration, /public_media_upload_authorisations/i);
  assert.match(migration, /expires_at>created_at and expires_at<=created_at\+interval '10 minutes'/i);
  assert.match(migration, /Identifiable-child media creator cannot review their own item/i);
  assert.match(migration, /p_capability in \('view_private','draft','review','publish','safeguarding_review'\)/i);
  assert.match(migration, /create trigger public_media_events_immutable/i);
  assert.match(migration, /cms_export_cloudinary_media_manifest/i);
  assert.match(migration, /orphan_candidate boolean,orphan_reason text/i);
  assert.match(migration, /Media manifest administration required/i);
  assert.match(migration, /revoke all on table public\.public_media_upload_authorisations,public\.public_media_events from public,anon,authenticated/i);
  assert.doesNotMatch(migration, /delete\s+from\s+public\.public_media_assets|drop\s+table/i);
  assert.match(sqlSuite, /Both accepted leadership scopes must have safeguarding review authority/i);
  assert.match(sqlSuite, /Media creator must not self-approve identifiable-child media/i);
  assert.match(sqlSuite, /^rollback;/m);
});

test('routes, CSP and Function count keep the provider surface exact and dormant', () => {
  const rewrites = new Map(vercel.rewrites.map((item) => [item.source, item.destination]));
  assert.equal(rewrites.get('/api/cms/media/sign'), '/api/cms-media?action=sign');
  assert.equal(rewrites.get('/api/cms/media/complete'), '/api/cms-media?action=complete');
  assert.equal(rewrites.get('/api/cms/media/delivery'), '/api/cms-media?action=delivery');
  assert.equal(rewrites.get('/api/cms/media/manifest'), '/api/cms-media?action=manifest');
  assert.equal(rewrites.get('/api/cms/media/usage'), '/api/cms-media?action=usage');
  const globalCsp = vercel.headers.find((item) => item.source === '/(.*)').headers.find((item) => item.key === 'Content-Security-Policy').value;
  assert.match(globalCsp, /img-src[^;]+https:\/\/res\.cloudinary\.com\/ecbad9xj\//);
  assert.match(globalCsp, /media-src[^;]+https:\/\/res\.cloudinary\.com\/ecbad9xj\//);
  assert.match(globalCsp, /connect-src[^;]+https:\/\/api\.cloudinary\.com/);
  assert.doesNotMatch(globalCsp, /\*\.cloudinary\.com/);
  const apiFunctionFiles = readdirSync(new URL('../../api/', import.meta.url)).filter((name) => name.endsWith('.mjs'));
  assert.ok(apiFunctionFiles.length <= 12, `Vercel Hobby permits at most 12 Functions, found ${apiFunctionFiles.length}`);
  assert.match(apiDispatcher, /handleMediaSign/);
  assert.match(server, /CMS_MEDIA_ENABLED/);
  assert.match(server, /signatureAlgorithm: 'sha256'/);
  assert.match(server, /deliveryType: config\.deliveryType/);
});

test('generated schema ends with the exact Run 6 migration', () => {
  assert.ok(schema.includes(migration.trim()));
  assert.ok(schema.trimEnd().endsWith(migration.trimEnd()));
  assert.equal(mediaPolicy.cloudName, 'ecbad9xj');
  assert.equal(mediaPolicy.deliveryType, 'authenticated');
  assert.deepEqual(mediaPolicy.requiredTags, ['treasure-academy', 'cms', 'manual-review-required']);
});
