import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';
import { buildSignedCloudinaryDeliveryUrl } from './cms-media.mjs';

const TRUE = 'true';
const ACTIONS = new Set(['search', 'core-slots', 'inventory', 'page-surface', 'page-media']);
const CORE_PATHS = new Set([
  '/about', '/academics', '/admissions', '/fees', '/contact', '/calendar',
  '/exams', '/transport', '/uniform', '/shop', '/pta', '/careers',
  '/privacy', '/safeguarding', '/credits', '/request-centre'
]);
const REPLACE_PAGE_PATHS = new Set([
  '/about', '/academics', '/alumni', '/anthem', '/board', '/calendar', '/careers', '/classes',
  '/classes/pre-nursery', '/classes/nursery-1', '/classes/nursery-2',
  '/classes/primary-1', '/classes/primary-2', '/classes/primary-3', '/classes/primary-4', '/classes/primary-6',
  '/credits', '/exams', '/fees', '/holiday', '/openday', '/photo-day', '/privacy', '/pta',
  '/safeguarding', '/story', '/support', '/testimonials', '/transport', '/uniform', '/volunteer', '/welcome'
]);
const SUPPLEMENT_PAGE_PATHS = new Set([
  '/', '/admission-form', '/admissions', '/birthdays', '/contact', '/elearning', '/site-map',
  '/homework', '/lost-found', '/poster', '/reading', '/receipt', '/request-centre', '/search',
  '/shop', '/website-help'
]);
const PAGE_PATHS = new Set([...REPLACE_PAGE_PATHS, ...SUPPLEMENT_PAGE_PATHS]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_PATH = /^\/(?!\/)[a-zA-Z0-9/_?#=&.%-]*$/;
const SEARCH_FAMILIES = Object.freeze([
  ['safety', /safeguard|safety|child protection|bully|abuse|welfare/],
  ['records', /result|report card|record|portal|login|password/],
  ['fees', /fee|cost|price|pay|payment|invoice/],
  ['admissions', /admission|apply|application|enrol|enroll|join/],
  ['location', /address|location|direction|visit|where/],
  ['time', /hour|opening|closing|school day/],
  ['dates', /calendar|term|holiday|resumption|event date/],
  ['classes', /class|creche|nursery|primary|placement/],
  ['uniform', /uniform|sportswear|dress/],
  ['transport', /transport|bus|route|pickup/],
  ['shop', /shop|book|stationery|supply|material|stock/],
  ['contact', /contact|phone|whatsapp|email|call/],
  ['careers', /career|vacancy|job|employment/],
  ['homework', /homework|assignment|schoolwork/],
  ['news', /news|notice|announcement|update/],
  ['privacy', /privacy|personal data|consent/],
  ['website', /website|broken page|search|cannot find/]
]);
const PRIVATE_QUERY = /password|one[- ]?time code|\botp\b|candidate number|pupil list|student list|report card|medical record|health record|safeguarding incident|payment proof|transfer screenshot|bank account|account number|linked child|linked pupil/i;
const PHONE = /(?:\+?234|0)[0-9 ()-]{9,}/;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer'
});

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}
function exactTrue(value) { return String(value || '').trim() === TRUE; }
function clean(value, max = 500) { return typeof value === 'string' ? value.trim().slice(0, max) : ''; }
function localPath(value) {
  const path = clean(value, 500);
  return SAFE_PATH.test(path) && !path.includes('//') && !/(^|\/)\.\.(\/|$)/.test(path) ? path : '';
}
function originAllowed(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch { return false; }
}
function isJsonRequest(request) {
  return String(request.headers.get('content-type') || '').toLowerCase().split(';')[0].trim() === 'application/json';
}
async function requestJson(request, maxBytes = 2048) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413 });
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}
function clientFor(env, key, createClientImpl = createClient) {
  const url = clean(env.SUPABASE_URL, 500);
  if (!url || !key) return null;
  return createClientImpl(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}
function publicClient(env, createClientImpl = createClient) {
  return clientFor(env, clean(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY, 2000), createClientImpl);
}
function serviceClient(env, createClientImpl = createClient) {
  return clientFor(env, clean(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, 4000), createClientImpl);
}
function requestIp(request) {
  return clean(request.headers.get('x-real-ip'), 100) || clean(String(request.headers.get('x-forwarded-for') || '').split(',')[0], 100);
}
function rateBucket(request, pepper, now = Date.now()) {
  const ip = requestIp(request);
  if (!ip || !pepper) return '';
  const window = Math.floor(now / 600000);
  return createHmac('sha256', pepper).update(`search-rate:${window}:${ip}`).digest('hex');
}
function searchFamily(query) {
  const value = String(query || '').toLowerCase();
  return SEARCH_FAMILIES.find(([, pattern]) => pattern.test(value))?.[0] || 'other';
}
function privateQuery(query) { return PRIVATE_QUERY.test(query) || PHONE.test(query) || EMAIL.test(query); }
function normaliseResult(row) {
  const url = localPath(row?.url);
  const source = localPath(row?.source_url) || url;
  if (!url || !source) return null;
  return {
    id: clean(row?.document_id, 200),
    kind: ['news', 'event', 'page', 'announcement', 'verified_information', 'inventory'].includes(row?.kind) ? row.kind : 'page',
    title: clean(row?.title, 180),
    summary: clean(row?.summary, 600),
    url,
    sourceUrl: source,
    reviewedOn: /^\d{4}-\d{2}-\d{2}$/.test(String(row?.reviewed_on || '')) ? row.reviewed_on : null,
    rank: Math.max(0, Number(row?.rank) || 0)
  };
}
function unavailable() {
  return json({ state: 'unavailable', message: 'Search is temporarily unavailable. You can still browse the site map or contact the school.' }, 503);
}

async function search(env, request, createClientImpl = createClient) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { allow: 'POST' });
  if (!originAllowed(request)) return json({ error: 'Same-origin request required.' }, 403);
  if (!isJsonRequest(request)) return json({ error: 'Content-Type must be application/json.' }, 415);
  let body;
  try { body = await requestJson(request); } catch (error) { return json({ error: error.status === 413 ? 'Request too large.' : 'Invalid request.' }, error.status || 400); }
  const query = clean(body.query, 121).replace(/\s+/g, ' ');
  if (query.length < 2 || query.length > 120) return json({ error: 'Enter between 2 and 120 characters.' }, 400);
  if (privateQuery(query)) return json({
    state: 'private',
    message: 'Private information requires secure sign-in.',
    results: [{ id: 'private:portal', kind: 'page', title: 'Open the secure portal', summary: 'Public Search never returns pupil, payment, account or safeguarding records.', url: '/portal/login.html', sourceUrl: '/privacy', reviewedOn: null, rank: 1 }]
  });

  const client = serviceClient(env, createClientImpl);
  const bucket = rateBucket(request, clean(env.CMS_SEARCH_HASH_PEPPER, 4000));
  if (!client || !bucket) return unavailable();
  try {
    const rate = await client.rpc('public_take_search_rate_limit', { p_bucket_hash: bucket });
    if (rate.error) throw rate.error;
    const rateRow = Array.isArray(rate.data) ? rate.data[0] : rate.data;
    if (!rateRow?.allowed) return json({ state: 'rate_limited', message: 'Too many searches. Please wait a few minutes and try again.' }, 429, { 'retry-after': String(Math.max(1, Number(rateRow?.retry_after_seconds) || 60)) });

    const family = searchFamily(query);
    const result = await client.rpc('public_search_published_content', {
      p_query: query,
      p_limit: 10,
      p_include_inventory: exactTrue(env.PUBLIC_INVENTORY_ENABLED)
    });
    if (result.error) throw result.error;
    const results = (Array.isArray(result.data) ? result.data : []).map(normaliseResult).filter(Boolean).slice(0, 10);
    const outcome = await client.rpc('public_record_search_outcome', { p_family: family, p_zero_result: results.length === 0 });
    if (outcome.error) throw outcome.error;
    if (!results.length) return json({
      state: 'no_answer', family,
      message: 'No matching page was found. Try fewer words or browse the site map.',
      results: []
    });
    const top = results[0];
    const answer = top.kind === 'verified_information' && top.rank >= 0.05 ? {
      title: top.title,
      text: top.summary,
      reviewedOn: top.reviewedOn,
      sources: [{ title: top.title, url: top.sourceUrl }]
    } : null;
    return json({
      state: answer ? 'answer' : 'results', family, answer, results,
      message: answer ? 'Verified answer with supporting source.' : 'Related published sources found.'
    });
  } catch (error) {
    console.error('Public Search failed', { code: String(error?.code || ''), status: Number(error?.status) || 0 });
    return unavailable();
  }
}

function normaliseBlock(row) {
  const type = clean(row?.block_type, 40);
  if (!['paragraph', 'heading', 'ordered_list', 'unordered_list', 'quote', 'callout', 'verified_fact', 'table', 'button'].includes(type)) return null;
  const source = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
  let payload;
  if (['paragraph', 'quote'].includes(type)) payload = { text: clean(source.text, 5000) };
  else if (type === 'heading') payload = { text: clean(source.text, 300), level: [2, 3, 4].includes(Number(source.level)) ? Number(source.level) : 2 };
  else if (['ordered_list', 'unordered_list'].includes(type)) payload = {
    items: (Array.isArray(source.items) ? source.items : []).slice(0, 50).map((item) => clean(item, 500)).filter(Boolean)
  };
  else if (type === 'callout') payload = { text: clean(source.text, 3000), style: ['info', 'warning', 'success'].includes(source.style) ? source.style : 'info' };
  else if (type === 'verified_fact') payload = { text: clean(source.text, 3000), source_path: localPath(source.source_path) };
  else if (type === 'table') {
    const headers = (Array.isArray(source.headers) ? source.headers : []).slice(0, 12).map((item) => clean(item, 120));
    payload = {
      headers,
      rows: (Array.isArray(source.rows) ? source.rows : []).slice(0, 100).map((cells) =>
        (Array.isArray(cells) ? cells : []).slice(0, headers.length || 12).map((item) => clean(String(item ?? ''), 500))
      )
    };
  } else {
    const path = localPath(source.path);
    if (!path) return null;
    payload = { label: clean(source.label, 80) || 'Read more', path };
  }
  return { position: Math.max(0, Math.min(99, Number(row?.block_position) || 0)), type, payload };
}
async function coreSlots(env, request, createClientImpl = createClient) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
  const path = clean(new URL(request.url).searchParams.get('path'), 100);
  if (!CORE_PATHS.has(path)) return json({ error: 'Invalid core page path.' }, 400);
  const client = publicClient(env, createClientImpl);
  if (!client) return json({ state: 'unavailable', message: 'Current page updates are temporarily unavailable.' }, 503);
  try {
    const slotsResult = await client.from('public_cms_published_core_slots')
      .select('id,page_path,mount_key,slot_position,entry_id,canonical_path,content_type,revision_id,title,summary,next_review_date')
      .eq('page_path', path).order('mount_key', { ascending: true }).order('slot_position', { ascending: true }).limit(9);
    if (slotsResult.error) throw slotsResult.error;
    const slots = slotsResult.data || [];
    const revisions = [...new Set(slots.map((slot) => slot.revision_id).filter(Boolean))];
    let blocks = [];
    if (revisions.length) {
      const blockResult = await client.from('public_cms_published_blocks')
        .select('revision_id,block_position,block_type,payload').in('revision_id', revisions)
        .order('block_position', { ascending: true }).limit(100);
      if (blockResult.error) throw blockResult.error;
      blocks = blockResult.data || [];
    }
    const items = slots.map((slot) => ({
      id: clean(slot.id, 100), mount: slot.mount_key, position: Number(slot.slot_position) || 0,
      title: clean(slot.title, 180), summary: clean(slot.summary, 600),
      canonicalPath: localPath(slot.canonical_path), nextReviewDate: slot.next_review_date || null,
      blocks: blocks.filter((block) => block.revision_id === slot.revision_id).map(normaliseBlock).filter(Boolean)
    })).filter((slot) => slot.canonicalPath);
    return json({ state: items.length ? 'current' : 'empty', path, items }, 200, { 'cache-control': 'public, max-age=30, stale-while-revalidate=120' });
  } catch {
    return json({ state: 'unavailable', message: 'Current page updates are temporarily unavailable.' }, 503);
  }
}

function normalisePageBlock(row) {
  const basic = normaliseBlock(row);
  if (basic) return basic;
  const type = clean(row?.block_type, 40);
  const source = row?.payload && typeof row.payload === 'object' && !Array.isArray(row.payload) ? row.payload : {};
  if (type === 'image' || type === 'video') {
    const assetId = clean(source.asset_id, 100);
    if (!UUID.test(assetId)) return null;
    return { position: Math.max(0, Math.min(99, Number(row?.block_position) || 0)), type, payload: { asset_id: assetId } };
  }
  if (type === 'gallery') {
    const assetIds = (Array.isArray(source.asset_ids) ? source.asset_ids : []).map((value) => clean(value, 100)).filter((value) => UUID.test(value)).slice(0, 24);
    return assetIds.length ? { position: Math.max(0, Math.min(99, Number(row?.block_position) || 0)), type, payload: { asset_ids: assetIds } } : null;
  }
  return null;
}

function normalisePageMedia(row, surfaceId) {
  const id = clean(row?.media_id, 100);
  const type = ['image', 'video'].includes(row?.media_type) ? row.media_type : '';
  if (!UUID.test(id) || !UUID.test(surfaceId) || !type) return null;
  const query = new URLSearchParams({ surface: surfaceId, media: id });
  return {
    id, type, title: clean(row?.title, 180), alt: clean(row?.alt_text, 500),
    caption: clean(row?.caption, 500), attribution: clean(row?.attribution, 500),
    width: Math.max(1, Math.min(20000, Number(row?.width) || (type === 'image' ? 1200 : 1280))),
    height: Math.max(1, Math.min(20000, Number(row?.height) || (type === 'image' ? 675 : 720))),
    assetPath: `/api/public/content/page-media?${query.toString()}&variant=${type === 'image' ? 'content-1280' : 'video-720'}`,
    posterPath: type === 'video' ? `/api/public/content/page-media?${query.toString()}&variant=poster` : null
  };
}

async function pageSurface(env, request, createClientImpl = createClient) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
  const path = clean(new URL(request.url).searchParams.get('path'), 160);
  if (!PAGE_PATHS.has(path)) return json({ error: 'Invalid public page path.' }, 400);
  const client = publicClient(env, createClientImpl);
  if (!client) return json({ state: 'unavailable', message: 'Current page content is temporarily unavailable.' }, 503);
  try {
    const surfaceResult = await client.from('public_cms_published_page_surfaces')
      .select('id,page_path,render_mode,entry_id,canonical_path,revision_id,title,summary,category,next_review_date,seo_title,seo_description,featured_media_id,social_media_id,updated_at')
      .eq('page_path', path).limit(1);
    if (surfaceResult.error) throw surfaceResult.error;
    const surface = (surfaceResult.data || [])[0];
    if (!surface) return json({ state: 'empty', path }, 200, { 'cache-control': 'public, max-age=30, stale-while-revalidate=120' });
    const expectedMode = REPLACE_PAGE_PATHS.has(path) ? 'replace' : 'supplement';
    if (surface.render_mode !== expectedMode || !UUID.test(String(surface.id || '')) || !UUID.test(String(surface.revision_id || ''))) throw new Error('page_surface_contract');
    const [blockResult, mediaResult] = await Promise.all([
      client.from('public_cms_published_blocks').select('revision_id,block_position,block_type,payload')
        .eq('revision_id', surface.revision_id).order('block_position', { ascending: true }).limit(100),
      client.from('public_cms_published_media').select('revision_id,placement,placement_position,caption,media_id,media_type,title,alt_text,attribution,width,height,duration_seconds')
        .eq('revision_id', surface.revision_id).order('placement_position', { ascending: true }).limit(100)
    ]);
    if (blockResult.error || mediaResult.error) throw blockResult.error || mediaResult.error;
    const blocks = (blockResult.data || []).map(normalisePageBlock).filter(Boolean);
    const media = (mediaResult.data || []).map((row) => normalisePageMedia(row, surface.id)).filter(Boolean);
    return json({
      state: 'current', path, mode: expectedMode,
      page: {
        id: clean(surface.id, 100), title: clean(surface.title, 180), summary: clean(surface.summary, 600),
        category: clean(surface.category, 80), seoTitle: clean(surface.seo_title, 70),
        seoDescription: clean(surface.seo_description, 180), nextReviewDate: surface.next_review_date || null,
        updatedAt: surface.updated_at || null, blocks, media
      }
    }, 200, { 'cache-control': 'public, max-age=30, stale-while-revalidate=120' });
  } catch {
    return json({ state: 'unavailable', message: 'Current page content is temporarily unavailable.' }, 503);
  }
}

async function pageMedia(env, request, createClientImpl = createClient, fetchImpl = fetch) {
  if (!['GET', 'HEAD'].includes(request.method)) return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, HEAD' });
  const url = new URL(request.url);
  const surfaceId = clean(url.searchParams.get('surface'), 100);
  const mediaId = clean(url.searchParams.get('media'), 100);
  const variant = clean(url.searchParams.get('variant'), 40);
  if (!UUID.test(surfaceId) || !UUID.test(mediaId) || !/^[a-z0-9-]{3,30}$/.test(variant)) return json({ error: 'Not found.' }, 404);
  const client = publicClient(env, createClientImpl);
  if (!client) return json({ error: 'Not found.' }, 404);
  try {
    const surfaceResult = await client.from('public_cms_published_page_surfaces')
      .select('id,revision_id').eq('id', surfaceId).limit(1);
    if (surfaceResult.error) throw surfaceResult.error;
    const surface = (surfaceResult.data || [])[0];
    if (!surface || !UUID.test(String(surface.revision_id || ''))) return json({ error: 'Not found.' }, 404);
    const mediaResult = await client.from('public_cms_published_media')
      .select('media_id,provider_asset_id,media_type,provider_version').eq('revision_id', surface.revision_id).eq('media_id', mediaId).limit(1);
    if (mediaResult.error) throw mediaResult.error;
    const media = (mediaResult.data || [])[0];
    if (!media) return json({ error: 'Not found.' }, 404);
    const allowed = media.media_type === 'image'
      ? new Set(['thumb', 'card', 'content-640', 'content-960', 'content-1280', 'hero'])
      : new Set(['poster', 'video-720']);
    if (!allowed.has(variant)) return json({ error: 'Not found.' }, 404);
    const delivery = buildSignedCloudinaryDeliveryUrl({
      cloudName: clean(env.CLOUDINARY_CLOUD_NAME, 100), apiSecret: String(env.CLOUDINARY_API_SECRET || ''),
      publicId: media.provider_asset_id, mediaType: media.media_type,
      providerVersion: Number(media.provider_version), variant
    });
    const upstreamHeaders = { Accept: variant === 'poster' || media.media_type === 'image' ? 'image/*' : 'video/*' };
    const range = request.headers.get('range');
    if (range && /^bytes=(?:\d+-\d*|-\d+)$/.test(range)) upstreamHeaders.Range = range;
    const upstream = await fetchImpl(delivery.url, { method: request.method, headers: upstreamHeaders, redirect: 'error', signal: AbortSignal.timeout(8000) });
    const contentType = String(upstream.headers.get('content-type') || '').toLowerCase();
    const expected = variant === 'poster' || media.media_type === 'image' ? 'image/' : 'video/';
    if (![200, 206].includes(upstream.status) || !contentType.startsWith(expected)) throw new Error('provider_delivery');
    const headers = new Headers({
      'Content-Type': contentType, 'Cache-Control': 'public, max-age=60, s-maxage=60',
      'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
      'Referrer-Policy': 'no-referrer', 'Accept-Ranges': upstream.headers.get('accept-ranges') || 'bytes'
    });
    for (const name of ['content-range', 'etag', 'last-modified']) {
      const value = upstream.headers.get(name); if (value) headers.set(name, value);
    }
    return new Response(request.method === 'HEAD' ? null : upstream.body, { status: upstream.status, headers });
  } catch {
    return json({ error: 'Not found.' }, 404);
  }
}

async function inventory(env, request, createClientImpl = createClient) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
  const client = serviceClient(env, createClientImpl);
  if (!client) return json({ state: 'unavailable', message: 'Verified availability is temporarily unavailable.' }, 503);
  try {
    const result = await client.from('public_inventory_availability')
      .select('product_id,product_code,name,description,category,variant_id,sku,variant_label,size_label,eligible_classes,availability,may_request,updated_at')
      .order('category', { ascending: true }).order('name', { ascending: true }).order('variant_label', { ascending: true }).limit(100);
    if (result.error) throw result.error;
    const items = (result.data || []).map((item) => ({
      id: clean(item.variant_id, 100), code: clean(item.product_code, 50), name: clean(item.name, 160),
      description: clean(item.description, 1000), category: clean(item.category, 40), sku: clean(item.sku, 60),
      variant: clean(item.variant_label, 120), size: clean(item.size_label, 80),
      eligibleClasses: Array.isArray(item.eligible_classes) ? item.eligible_classes.map((value) => clean(value, 40)).filter(Boolean).slice(0, 20) : [],
      availability: ['in_stock', 'low_stock', 'out_of_stock', 'temporarily_unavailable', 'not_currently_offered'].includes(item.availability) ? item.availability : 'temporarily_unavailable',
      mayRequest: item.may_request === true,
      updatedAt: item.updated_at || null
    })).filter((item) => item.id && item.name);
    return json({ state: items.length ? 'current' : 'empty', items }, 200, { 'cache-control': 'public, max-age=30, stale-while-revalidate=120' });
  } catch {
    return json({ state: 'unavailable', message: 'Verified availability is temporarily unavailable.' }, 503);
  }
}

export function isPublicDiscoveryRequest(request) {
  return ACTIONS.has(new URL(request.url).searchParams.get('action') || '');
}

export async function handlePublicDiscovery(request, env = process.env, overrides = {}) {
  const createClientImpl = overrides.createClient || createClient;
  const action = new URL(request.url).searchParams.get('action') || '';
  if (!exactTrue(env.PUBLIC_CMS_ENABLED)) return json({ error: 'Not found.' }, 404);
  if (action === 'search') {
    if (!exactTrue(env.PUBLIC_CMS_SEARCH_ENABLED)) return json({ error: 'Not found.' }, 404);
    return search(env, request, createClientImpl);
  }
  if (action === 'core-slots') {
    if (!exactTrue(env.PUBLIC_CMS_CORE_SLOTS_ENABLED)) return json({ error: 'Not found.' }, 404);
    return coreSlots(env, request, createClientImpl);
  }
  if (action === 'inventory') {
    if (!exactTrue(env.PUBLIC_INVENTORY_ENABLED)) return json({ error: 'Not found.' }, 404);
    return inventory(env, request, createClientImpl);
  }
  if (action === 'page-surface') {
    if (!exactTrue(env.PUBLIC_CMS_PAGES_ENABLED)) return json({ error: 'Not found.' }, 404);
    return pageSurface(env, request, createClientImpl);
  }
  if (action === 'page-media') {
    if (!exactTrue(env.PUBLIC_CMS_PAGES_ENABLED) || !exactTrue(env.PUBLIC_CMS_MEDIA_ENABLED)) return json({ error: 'Not found.' }, 404);
    return pageMedia(env, request, createClientImpl, overrides.fetch || fetch);
  }
  return json({ error: 'Not found.' }, 404);
}

export const publicDiscoveryInternals = Object.freeze({
  exactTrue, localPath, originAllowed, privateQuery, searchFamily, rateBucket, normaliseResult,
  normaliseBlock, normalisePageBlock, normalisePageMedia, PAGE_PATHS, REPLACE_PAGE_PATHS, SUPPLEMENT_PAGE_PATHS
});
