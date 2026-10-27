import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';

const TRUE = 'true';
const ACTIONS = new Set(['search', 'core-slots', 'inventory']);
const CORE_PATHS = new Set([
  '/about', '/academics', '/admissions', '/fees', '/contact', '/calendar',
  '/exams', '/transport', '/uniform', '/shop', '/pta', '/careers',
  '/privacy', '/safeguarding', '/credits', '/request-centre'
]);
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
  return json({ error: 'Not found.' }, 404);
}

export const publicDiscoveryInternals = Object.freeze({
  exactTrue, localPath, originAllowed, privateQuery, searchFamily, rateBucket, normaliseResult
});
