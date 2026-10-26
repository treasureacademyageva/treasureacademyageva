import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256 = /^[a-f0-9]{64}$/;
const PUBLIC_ID = /^ta_[a-f0-9]{32}$/;
const MAX_BODY_BYTES = 16 * 1024;
const EXPECTED_CLOUD_NAME = 'ecbad9xj';
const EXPECTED_PRESET = 'treasure_academy_cms_signed';
const EXPECTED_ASSET_FOLDER = 'treasure-academy/cms/pending';
const EXPECTED_DELIVERY_TYPE = 'authenticated';
const REQUIRED_TAGS = ['treasure-academy', 'cms', 'manual-review-required'];

const MEDIA_RULES = Object.freeze({
  'image/jpeg': { mediaType: 'image', formats: ['jpg', 'jpeg'], maxBytes: 10 * 1024 * 1024 },
  'image/png': { mediaType: 'image', formats: ['png'], maxBytes: 10 * 1024 * 1024 },
  'image/webp': { mediaType: 'image', formats: ['webp'], maxBytes: 10 * 1024 * 1024 },
  'image/avif': { mediaType: 'image', formats: ['avif'], maxBytes: 10 * 1024 * 1024 },
  'image/heic': { mediaType: 'image', formats: ['heic', 'heif'], maxBytes: 10 * 1024 * 1024 },
  'video/mp4': { mediaType: 'video', formats: ['mp4'], maxBytes: 50 * 1024 * 1024 },
  'video/webm': { mediaType: 'video', formats: ['webm'], maxBytes: 50 * 1024 * 1024 },
  'video/quicktime': { mediaType: 'video', formats: ['mov', 'qt'], maxBytes: 50 * 1024 * 1024 }
});

const IMAGE_VARIANTS = Object.freeze({
  thumb: { transformation: 'c_fill,g_auto,h_320,w_320,q_auto:good,f_auto', extension: '', width: 320 },
  card: { transformation: 'c_fill,g_auto,h_675,w_1200,q_auto:good,f_auto', extension: '', width: 1200 },
  'content-640': { transformation: 'c_limit,w_640,q_auto:good,f_auto', extension: '', width: 640 },
  'content-960': { transformation: 'c_limit,w_960,q_auto:good,f_auto', extension: '', width: 960 },
  'content-1280': { transformation: 'c_limit,w_1280,q_auto:good,f_auto', extension: '', width: 1280 },
  hero: { transformation: 'c_limit,w_1600,q_auto:good,f_auto', extension: '', width: 1600 },
  'download-1600': { transformation: 'c_limit,w_1600,q_auto:best,f_auto,fl_attachment', extension: '', width: 1600 }
});

const VIDEO_VARIANTS = Object.freeze({
  poster: { transformation: 'c_limit,w_1280,q_auto:good,so_0,f_jpg', extension: '.jpg', width: 1280 },
  'video-720': { transformation: 'c_limit,h_720,w_1280,q_auto:good,f_mp4', extension: '.mp4', width: 1280 }
});

function jsonResponse(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
    }
  });
}

function fail(message, status = 400, code = 'invalid_request') {
  throw Object.assign(new Error(message), { status, code });
}

function exactObject(value, allowed) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).every((key) => allowed.has(key));
}

function sameOrigin(request, allowMissing = false) {
  const origin = request.headers.get('origin');
  if (!origin) return allowMissing;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function bearerToken(request) {
  const match = String(request.headers.get('authorization') || '').match(/^Bearer\s+([^\s]+)$/i);
  return match && match[1].length <= 8192 ? match[1] : null;
}

function jwtSessionId(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return UUID.test(String(payload?.session_id || '')) ? payload.session_id : null;
  } catch { return null; }
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) fail('content_type');
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) fail('too_large', 413, 'too_large');
  const text = await request.text();
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) fail('too_large', 413, 'too_large');
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('json');
    return body;
  } catch { fail('json'); }
}

export function cloudinarySettings(env = process.env) {
  if (env.CMS_MEDIA_ENABLED !== 'true') fail('disabled', 404, 'disabled');
  const config = {
    supabaseUrl: String(env.SUPABASE_URL || '').replace(/\/+$/, ''),
    publishableKey: String(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || ''),
    secretKey: String(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY || ''),
    cloudName: String(env.CLOUDINARY_CLOUD_NAME || ''),
    apiKey: String(env.CLOUDINARY_API_KEY || ''),
    apiSecret: String(env.CLOUDINARY_API_SECRET || ''),
    uploadPreset: String(env.CLOUDINARY_UPLOAD_PRESET || ''),
    assetFolder: String(env.CLOUDINARY_ASSET_FOLDER || ''),
    deliveryType: String(env.CLOUDINARY_DELIVERY_TYPE || ''),
    usageWarningPercent: Number(env.CLOUDINARY_USAGE_WARNING_PERCENT || 70)
  };
  if (!config.supabaseUrl || !config.publishableKey || !config.secretKey
      || config.cloudName !== EXPECTED_CLOUD_NAME
      || !/^[0-9]{6,32}$/.test(config.apiKey)
      || config.apiSecret.length < 16
      || config.uploadPreset !== EXPECTED_PRESET
      || config.assetFolder !== EXPECTED_ASSET_FOLDER
      || config.deliveryType !== EXPECTED_DELIVERY_TYPE
      || !Number.isFinite(config.usageWarningPercent)
      || config.usageWarningPercent < 50 || config.usageWarningPercent > 95) {
    fail('misconfigured', 503, 'misconfigured');
  }
  return config;
}

function supabaseClients(config, token, createClientImpl = createClient) {
  const auth = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
  const publicClient = createClientImpl(config.supabaseUrl, config.publishableKey, { auth });
  const adminClient = createClientImpl(config.supabaseUrl, config.secretKey, { auth });
  const userClient = createClientImpl(config.supabaseUrl, config.publishableKey, {
    auth,
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
  return { publicClient, adminClient, userClient };
}

async function authenticateMedia(request, config, capability, overrides = {}) {
  if (typeof overrides.authenticate === 'function') return overrides.authenticate(request, capability, config);
  const token = bearerToken(request);
  const sessionId = token && jwtSessionId(token);
  if (!token || !sessionId) fail('unauthorized', 401, 'unauthorized');
  const { publicClient, adminClient, userClient } = supabaseClients(config, token, overrides.createClient);
  const { data: authData, error: authError } = await publicClient.auth.getUser(token);
  if (authError || !authData?.user?.id) fail('unauthorized', 401, 'unauthorized');
  const userId = authData.user.id;
  const [{ data: profile, error: profileError }, { data: sessionValid, error: sessionError }, capabilityResult] = await Promise.all([
    adminClient.from('profiles').select('id,active,account_status,must_change_password').eq('id', userId).single(),
    adminClient.rpc('server_validate_portal_session', { p_user_id: userId, p_session_id: sessionId }),
    userClient.rpc('cms_current_actor_can', { p_capability: capability })
  ]);
  if (profileError || sessionError || capabilityResult.error || sessionValid !== true
      || !profile || profile.active !== true || profile.account_status !== 'active'
      || profile.must_change_password !== false) fail('unauthorized', 401, 'unauthorized');
  if (capabilityResult.data !== true) fail('forbidden', 403, 'forbidden');
  return { userId, adminClient, userClient };
}

export function signCloudinaryParameters(parameters, apiSecret, algorithm = 'sha256') {
  if (!['sha1', 'sha256'].includes(algorithm) || typeof apiSecret !== 'string' || apiSecret.length < 1) fail('signing');
  const serialized = Object.entries(parameters)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .map(([key, value]) => [key, Array.isArray(value) ? value.join(',') : String(value)])
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');
  return createHash(algorithm).update(serialized + apiSecret, 'utf8').digest('hex');
}

function safeText(value, min, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length >= min && text.length <= max ? text : null;
}

export function validateMediaReservation(body) {
  const allowed = new Set(['mediaType', 'mimeType', 'byteSize', 'checksumSha256', 'title', 'altText', 'sourceNote', 'childIdentifiable']);
  if (!exactObject(body, allowed)) fail('unsupported_fields');
  const rule = MEDIA_RULES[String(body.mimeType || '').toLowerCase()];
  const mediaType = String(body.mediaType || '').toLowerCase();
  const byteSize = Number(body.byteSize);
  const checksum = String(body.checksumSha256 || '').toLowerCase();
  const title = safeText(body.title, 2, 180);
  const altText = safeText(body.altText, 2, 500);
  const sourceNote = safeText(body.sourceNote, 8, 2000);
  if (!rule || rule.mediaType !== mediaType || !Number.isSafeInteger(byteSize) || byteSize < 1 || byteSize > rule.maxBytes
      || !SHA256.test(checksum) || !title || !altText || !sourceNote || typeof body.childIdentifiable !== 'boolean') {
    fail('invalid_media');
  }
  return { mediaType, mimeType: String(body.mimeType).toLowerCase(), byteSize, checksum, title, altText, sourceNote, childIdentifiable: body.childIdentifiable };
}

function randomPublicId(randomBytesImpl = randomBytes) {
  return `ta_${randomBytesImpl(16).toString('hex')}`;
}

function publicError(error) {
  const status = Number(error?.status || 0);
  const code = String(error?.code || error?.message || '');
  if (status === 404 || code === 'disabled') return jsonResponse(404, { error: 'Not found' });
  if (status === 401) return jsonResponse(401, { error: 'Sign in again to continue.' });
  if (status === 403) return jsonResponse(403, { error: 'This account is not authorised for governed media.' });
  if (status === 413) return jsonResponse(413, { error: 'Request too large.' });
  if (status === 409) return jsonResponse(409, { error: 'The provider upload is not ready for confirmation.' });
  if (status === 422) return jsonResponse(422, { error: 'The uploaded media did not pass provider validation.' });
  if (status === 400 || ['content_type', 'json', 'unsupported_fields', 'invalid_media'].includes(code)) {
    return jsonResponse(400, { error: 'Check the governed media details.' });
  }
  return jsonResponse(503, { error: 'Governed media is temporarily unavailable.' });
}

export async function handleMediaSign(request, overrides = {}) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });
  if (!sameOrigin(request)) return jsonResponse(403, { error: 'Request origin not accepted.' });
  try {
    const config = cloudinarySettings(overrides.env || process.env);
    const auth = await authenticateMedia(request, config, 'draft', overrides);
    const media = validateMediaReservation(await readJson(request));
    const publicId = randomPublicId(overrides.randomBytes || randomBytes);
    const reserve = overrides.reserve || (async () => auth.userClient.rpc('cms_begin_cloudinary_media_upload', {
      p_provider_asset_id: publicId,
      p_media_type: media.mediaType,
      p_expected_mime_type: media.mimeType,
      p_expected_byte_size: media.byteSize,
      p_checksum_sha256: media.checksum,
      p_title: media.title,
      p_alt_text: media.altText,
      p_source_note: media.sourceNote,
      p_child_identifiable: media.childIdentifiable
    }));
    const reservationResult = await reserve();
    const reservation = Array.isArray(reservationResult?.data) ? reservationResult.data[0] : reservationResult?.data;
    if (reservationResult?.error || !UUID.test(String(reservation?.authorisation_id || '')) || !UUID.test(String(reservation?.media_id || ''))) {
      throw new Error('reservation_failed');
    }
    const timestamp = Math.floor((overrides.now ? overrides.now() : Date.now()) / 1000);
    const parameters = {
      asset_folder: config.assetFolder,
      discard_original_filename: 'true',
      invalidate: 'false',
      overwrite: 'false',
      public_id: publicId,
      tags: REQUIRED_TAGS.join(','),
      timestamp,
      type: config.deliveryType,
      unique_filename: 'false',
      upload_preset: config.uploadPreset,
      use_filename: 'false'
    };
    const signature = signCloudinaryParameters(parameters, config.apiSecret, 'sha256');
    return jsonResponse(200, {
      reservationId: reservation.authorisation_id,
      mediaId: reservation.media_id,
      expiresAt: reservation.expires_at,
      upload: {
        url: `https://api.cloudinary.com/v1_1/${config.cloudName}/${media.mediaType}/upload`,
        cloudName: config.cloudName,
        apiKey: config.apiKey,
        signature,
        signatureAlgorithm: 'sha256',
        ...parameters,
        resourceType: media.mediaType,
        deliveryType: config.deliveryType
      },
      constraints: { mimeType: media.mimeType, byteSize: media.byteSize, checksumSha256: media.checksum }
    });
  } catch (error) {
    return publicError(error);
  }
}

function basicAuthorization(config) {
  return `Basic ${Buffer.from(`${config.apiKey}:${config.apiSecret}`, 'utf8').toString('base64')}`;
}

async function lookupReservation(auth, reservationId, overrides) {
  if (typeof overrides.lookupReservation === 'function') return overrides.lookupReservation(reservationId, auth);
  const result = await auth.adminClient.rpc('cms_get_cloudinary_upload_authorisation', { p_authorisation_id: reservationId });
  if (result.error) throw new Error('reservation_lookup');
  return Array.isArray(result.data) ? result.data[0] : result.data;
}

async function fetchProviderResource(config, reservation, overrides) {
  if (typeof overrides.fetchProviderResource === 'function') return overrides.fetchProviderResource(config, reservation);
  const response = await (overrides.fetch || fetch)(
    `https://api.cloudinary.com/v1_1/${config.cloudName}/resources/${reservation.media_type}/${config.deliveryType}/${encodeURIComponent(reservation.provider_asset_id)}?tags=true`,
    { headers: { Authorization: basicAuthorization(config), Accept: 'application/json' }, signal: AbortSignal.timeout(8000) }
  );
  if (response.status === 404) fail('provider_pending', 409, 'provider_pending');
  if (!response.ok) throw new Error('provider_lookup');
  return response.json();
}

function providerMime(resourceType, format) {
  const normalized = String(format || '').toLowerCase();
  if (resourceType === 'image') {
    if (['jpg', 'jpeg'].includes(normalized)) return 'image/jpeg';
    if (['png', 'webp', 'avif', 'heic'].includes(normalized)) return `image/${normalized}`;
    if (normalized === 'heif') return 'image/heic';
  }
  if (resourceType === 'video') {
    if (normalized === 'mov' || normalized === 'qt') return 'video/quicktime';
    if (['mp4', 'webm'].includes(normalized)) return `video/${normalized}`;
  }
  return null;
}

export function validateProviderResource(resource, reservation, config) {
  const tags = Array.isArray(resource?.tags) ? resource.tags.map(String) : [];
  const format = String(resource?.format || '').toLowerCase();
  const mimeType = providerMime(resource?.resource_type, format);
  const rule = MEDIA_RULES[String(reservation.expected_mime_type || '')];
  const valid = resource && PUBLIC_ID.test(String(resource.public_id || ''))
    && resource.public_id === reservation.provider_asset_id
    && resource.resource_type === reservation.media_type
    && resource.type === config.deliveryType
    && resource.asset_folder === config.assetFolder
    && rule?.formats.includes(format)
    && mimeType === reservation.expected_mime_type
    && Number(resource.bytes) === Number(reservation.expected_byte_size)
    && Number(resource.bytes) >= 1 && Number(resource.bytes) <= rule.maxBytes
    && REQUIRED_TAGS.every((tag) => tags.includes(tag))
    && typeof resource.asset_id === 'string' && resource.asset_id.length >= 8 && resource.asset_id.length <= 255
    && Number.isSafeInteger(Number(resource.version)) && Number(resource.version) > 0
    && /^[a-f0-9]{32,64}$/.test(String(resource.etag || ''))
    && Number.isInteger(Number(resource.width)) && Number(resource.width) > 0 && Number(resource.width) <= 20000
    && Number.isInteger(Number(resource.height)) && Number(resource.height) > 0 && Number(resource.height) <= 20000
    && (reservation.media_type === 'image'
      ? resource.duration === undefined || resource.duration === null
      : Number(resource.duration) > 0);
  if (!valid) fail('provider_metadata_mismatch', 422, 'provider_metadata_mismatch');
  const selected = {
    assetId: resource.asset_id,
    version: Number(resource.version),
    etag: String(resource.etag),
    format,
    mimeType,
    byteSize: Number(resource.bytes),
    width: Number(resource.width),
    height: Number(resource.height),
    duration: reservation.media_type === 'video' ? Number(resource.duration) : null
  };
  selected.responseDigest = createHash('sha256').update(JSON.stringify(selected), 'utf8').digest('hex');
  return selected;
}

async function rejectReservation(auth, reservationId, reasonCode, overrides) {
  if (typeof overrides.reject === 'function') return overrides.reject(reservationId, auth.userId, reasonCode);
  return auth.adminClient.rpc('cms_reject_cloudinary_media_upload', {
    p_authorisation_id: reservationId,
    p_actor_id: auth.userId,
    p_reason_code: reasonCode
  });
}

export async function handleMediaComplete(request, overrides = {}) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });
  if (!sameOrigin(request)) return jsonResponse(403, { error: 'Request origin not accepted.' });
  let auth;
  let reservationId;
  try {
    const config = cloudinarySettings(overrides.env || process.env);
    auth = await authenticateMedia(request, config, 'draft', overrides);
    const body = await readJson(request);
    if (!exactObject(body, new Set(['reservationId'])) || !UUID.test(String(body.reservationId || ''))) fail('invalid_request');
    reservationId = body.reservationId;
    const reservation = await lookupReservation(auth, reservationId, overrides);
    if (!reservation || reservation.actor_id !== auth.userId || reservation.status !== 'reserved') fail('forbidden', 403, 'forbidden');
    if (new Date(reservation.expires_at).getTime() <= (overrides.now ? overrides.now() : Date.now())) fail('expired', 409, 'expired');
    let provider;
    try {
      provider = validateProviderResource(await fetchProviderResource(config, reservation, overrides), reservation, config);
    } catch (error) {
      if (Number(error?.status) === 422) await rejectReservation(auth, reservationId, 'provider_metadata_mismatch', overrides);
      throw error;
    }
    const complete = overrides.complete || (async () => auth.adminClient.rpc('cms_complete_cloudinary_media_upload', {
      p_authorisation_id: reservationId,
      p_actor_id: auth.userId,
      p_provider_asset_uid: provider.assetId,
      p_provider_version: provider.version,
      p_provider_etag: provider.etag,
      p_format: provider.format,
      p_mime_type: provider.mimeType,
      p_byte_size: provider.byteSize,
      p_width: provider.width,
      p_height: provider.height,
      p_duration_seconds: provider.duration,
      p_provider_response_digest: provider.responseDigest
    }));
    const result = await complete();
    if (result?.error || !UUID.test(String(result?.data || ''))) throw new Error('completion_failed');
    return jsonResponse(200, { accepted: true, mediaId: result.data, lifecycleState: 'pending', message: 'Upload confirmed. Independent review is required before publication.' });
  } catch (error) {
    return publicError(error);
  }
}

function deliveryVariant(mediaType, variant) {
  const selected = mediaType === 'image' ? IMAGE_VARIANTS[variant] : VIDEO_VARIANTS[variant];
  if (!selected) fail('invalid_variant');
  return selected;
}

export function buildSignedCloudinaryDeliveryUrl({ cloudName, apiSecret, publicId, mediaType, providerVersion, variant }) {
  const version = Number(providerVersion);
  if (cloudName !== EXPECTED_CLOUD_NAME || typeof apiSecret !== 'string' || apiSecret.length < 1 || !PUBLIC_ID.test(String(publicId || ''))
      || !['image', 'video'].includes(mediaType) || !Number.isSafeInteger(version) || version < 1) fail('invalid_delivery');
  const selected = deliveryVariant(mediaType, variant);
  const path = `${selected.transformation}/v${version}/${publicId}${selected.extension}`;
  const signature = createHash('sha1').update(path + apiSecret, 'utf8').digest('base64url').slice(0, 8);
  return {
    url: `https://res.cloudinary.com/${cloudName}/${mediaType}/authenticated/s--${signature}--/${path}`,
    width: selected.width,
    metadataPolicy: 'transformed-derivative-strips-embedded-metadata'
  };
}

export async function handleMediaDelivery(request, overrides = {}) {
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });
  if (!sameOrigin(request, true)) return jsonResponse(403, { error: 'Request origin not accepted.' });
  try {
    const config = cloudinarySettings(overrides.env || process.env);
    const auth = await authenticateMedia(request, config, 'view_private', overrides);
    const url = new URL(request.url);
    const mediaId = url.searchParams.get('mediaId') || '';
    const variant = url.searchParams.get('variant') || '';
    if (!UUID.test(mediaId) || !/^[a-z0-9-]{3,30}$/.test(variant)) fail('invalid_request');
    const getMedia = overrides.getMedia || (async () => auth.userClient.rpc('cms_get_media_for_delivery', {
      p_media_id: mediaId,
      p_variant: variant
    }));
    const result = await getMedia(mediaId, variant, auth);
    const media = Array.isArray(result?.data) ? result.data[0] : result?.data;
    if (result?.error || !media || !PUBLIC_ID.test(String(media.provider_asset_id || ''))) fail('not_found', 404, 'not_found');
    const delivery = buildSignedCloudinaryDeliveryUrl({
      cloudName: config.cloudName,
      apiSecret: config.apiSecret,
      publicId: media.provider_asset_id,
      mediaType: media.media_type,
      providerVersion: media.provider_version,
      variant
    });
    return jsonResponse(200, {
      mediaId: media.media_id,
      mediaType: media.media_type,
      title: media.title,
      altText: media.alt_text,
      lifecycleState: media.lifecycle_state,
      variant,
      ...delivery
    });
  } catch (error) {
    return publicError(error);
  }
}

function sanitizeUsageMetric(value) {
  if (!value || typeof value !== 'object') return null;
  const usage = Number(value.usage ?? value.used ?? value.current);
  const limit = Number(value.limit);
  if (!Number.isFinite(usage) || !Number.isFinite(limit) || limit <= 0) return null;
  return { usage, limit, percent: Math.round((usage / limit) * 1000) / 10 };
}

export function sanitizeCloudinaryUsage(payload, warningPercent = 70) {
  const metrics = {};
  for (const key of ['credits', 'bandwidth', 'storage', 'transformations', 'objects']) {
    const metric = sanitizeUsageMetric(payload?.[key]);
    if (metric) metrics[key] = metric;
  }
  const highestPercent = Object.values(metrics).reduce((highest, item) => Math.max(highest, item.percent), 0);
  return {
    plan: safeText(String(payload?.plan || ''), 1, 80) || 'unknown',
    lastUpdated: safeText(String(payload?.last_updated || payload?.lastUpdated || ''), 1, 80),
    metrics,
    highestPercent,
    warning: highestPercent >= warningPercent,
    warningPercent
  };
}

export async function handleMediaManifest(request, overrides = {}) {
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });
  if (!sameOrigin(request, true)) return jsonResponse(403, { error: 'Request origin not accepted.' });
  try {
    const config = cloudinarySettings(overrides.env || process.env);
    const auth = await authenticateMedia(request, config, 'administer', overrides);
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some((key) => !['limit', 'offset'].includes(key))) fail('invalid_request');
    const rawLimit = url.searchParams.get('limit') || '200';
    const rawOffset = url.searchParams.get('offset') || '0';
    if (!/^\d{1,3}$/.test(rawLimit) || !/^\d{1,6}$/.test(rawOffset)) fail('invalid_request');
    const limit = Number(rawLimit);
    const offset = Number(rawOffset);
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 500
        || !Number.isSafeInteger(offset) || offset < 0 || offset > 100000) fail('invalid_request');
    const getManifest = overrides.getManifest || (async () => auth.userClient.rpc('cms_export_cloudinary_media_manifest', {
      p_limit: limit,
      p_offset: offset
    }));
    const result = await getManifest(limit, offset, auth);
    if (result?.error || !Array.isArray(result?.data)) throw new Error('manifest_lookup');
    return jsonResponse(200, {
      generatedAt: new Date(overrides.now ? overrides.now() : Date.now()).toISOString(),
      retentionPolicy: 'manual_only',
      deletionPolicy: 'manual_authorisation_required',
      offset,
      count: result.data.length,
      nextOffset: result.data.length === limit ? offset + limit : null,
      items: result.data
    });
  } catch (error) {
    return publicError(error);
  }
}

export async function handleMediaUsage(request, overrides = {}) {
  if (request.method !== 'GET') return jsonResponse(405, { error: 'Method not allowed' });
  if (!sameOrigin(request, true)) return jsonResponse(403, { error: 'Request origin not accepted.' });
  try {
    const config = cloudinarySettings(overrides.env || process.env);
    await authenticateMedia(request, config, 'administer', overrides);
    const response = await (overrides.fetch || fetch)(`https://api.cloudinary.com/v1_1/${config.cloudName}/usage`, {
      headers: { Authorization: basicAuthorization(config), Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) throw new Error('usage_lookup');
    return jsonResponse(200, sanitizeCloudinaryUsage(await response.json(), config.usageWarningPercent));
  } catch (error) {
    return publicError(error);
  }
}

// Used only in constant-time test vectors; provider secrets never leave the server.
export function equalSignature(a, b) {
  const left = Buffer.from(String(a || ''), 'utf8');
  const right = Buffer.from(String(b || ''), 'utf8');
  return left.length === right.length && timingSafeEqual(left, right);
}

export const mediaPolicy = Object.freeze({
  cloudName: EXPECTED_CLOUD_NAME,
  uploadPreset: EXPECTED_PRESET,
  assetFolder: EXPECTED_ASSET_FOLDER,
  deliveryType: EXPECTED_DELIVERY_TYPE,
  requiredTags: REQUIRED_TAGS,
  rules: MEDIA_RULES,
  imageVariants: IMAGE_VARIANTS,
  videoVariants: VIDEO_VARIANTS
});
