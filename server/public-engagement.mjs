import { createClient } from '@supabase/supabase-js';
import { createHmac } from 'node:crypto';

const TRUE = 'true';
const JSON_HEADERS = Object.freeze({
  'content-type': 'application/json; charset=utf-8',
  'cache-control': 'private, no-store, max-age=0',
  'x-content-type-options': 'nosniff'
});
const PUBLIC_PATH = /^\/(news|events)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i;
const BOT = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|twitterbot|linkedinbot|discordbot|headless|lighthouse|pagespeed|curl|wget/i;
const MUTATIONS = new Set(['view', 'like', 'comment', 'edit_comment', 'delete_comment', 'report_comment']);
const COMMENT_MUTATIONS = new Set(['comment', 'edit_comment', 'delete_comment', 'report_comment']);

function json(body, status = 200, headers = {}) {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...headers } });
}

function exactTrue(value) {
  return String(value || '').trim() === TRUE;
}

function clean(value, max = 500) {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function bearer(request) {
  const match = String(request.headers.get('authorization') || '').match(/^Bearer ([A-Za-z0-9._~-]+)$/);
  return match?.[1] || '';
}

function originAllowed(request) {
  const origin = request.headers.get('origin');
  const host = request.headers.get('host') || new URL(request.url).host;
  if (!origin || !host) return false;
  try {
    const parsed = new URL(origin);
    return parsed.host === host && ['https:', 'http:'].includes(parsed.protocol);
  } catch {
    return false;
  }
}

function isJsonRequest(request) {
  return String(request.headers.get('content-type') || '').toLowerCase().split(';')[0].trim() === 'application/json';
}

async function requestJson(request, maxBytes = 4096) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413 });
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maxBytes) throw Object.assign(new Error('Request too large'), { status: 413 });
  try { return JSON.parse(text || '{}'); } catch { throw Object.assign(new Error('Invalid JSON'), { status: 400 }); }
}

function publicClient(env, createClientImpl = createClient) {
  const url = clean(env.SUPABASE_URL, 500);
  const key = clean(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY, 2000);
  if (!url || !key) return null;
  return createClientImpl(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function serviceClient(env, createClientImpl = createClient) {
  const url = clean(env.SUPABASE_URL, 500);
  const key = clean(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY, 4000);
  if (!url || !key) return null;
  return createClientImpl(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

function authenticatedClient(env, token, createClientImpl = createClient) {
  const url = clean(env.SUPABASE_URL, 500);
  const key = clean(env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY, 2000);
  if (!url || !key || !token) return null;
  return createClientImpl(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  });
}

async function currentActor(env, request, createClientImpl = createClient) {
  const token = bearer(request);
  const client = authenticatedClient(env, token, createClientImpl);
  if (!client) return null;
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user?.id) return null;
  const { data: profile, error: profileError } = await client.from('profiles')
    .select('id,role,active,account_status,must_change_password')
    .eq('id', userData.user.id).maybeSingle();
  if (profileError || !profile?.active || profile.account_status !== 'active' || profile.must_change_password) return null;
  if (!['parent', 'teacher', 'admin'].includes(profile.role)) return null;
  return { client, profile };
}

async function findEntry(client, canonicalPath) {
  if (!PUBLIC_PATH.test(canonicalPath)) return null;
  const { data, error } = await client.from('public_cms_published_entries')
    .select('entry_id,content_type,slug,canonical_path,title,summary,published_at,updated_at')
    .eq('canonical_path', canonicalPath).maybeSingle();
  if (error) throw error;
  return data || null;
}

function normaliseCounts(row) {
  return {
    views: Math.max(0, Number(row?.view_count) || 0),
    likes: Math.max(0, Number(row?.like_count) || 0),
    comments: Math.max(0, Number(row?.comment_count) || 0),
    liked: Boolean(row?.liked)
  };
}

async function getCounts(client, entryId) {
  const { data, error } = await client.rpc('public_get_content_engagement', { p_entry_id: entryId });
  if (error) throw error;
  return normaliseCounts(Array.isArray(data) ? data[0] : data);
}

async function summary(env, request, canonicalPath, createClientImpl = createClient) {
  const client = publicClient(env, createClientImpl);
  if (!client) return json({ error: 'Public engagement is unavailable.' }, 503);
  const entry = await findEntry(client, canonicalPath);
  if (!entry) return json({ error: 'Published content was not found.' }, 404);

  let counts = await getCounts(client, entry.entry_id);
  let actor = null;
  if (bearer(request)) {
    actor = await currentActor(env, request, createClientImpl);
    if (actor) counts = await getCounts(actor.client, entry.entry_id);
  }

  let comments = [];
  let myComments = [];
  if (exactTrue(env.PUBLIC_CMS_COMMENTS_ENABLED)) {
    const publicResult = await client.from('public_cms_approved_comments')
      .select('id,body,author_label,created_at,updated_at').eq('entry_id', entry.entry_id)
      .order('created_at', { ascending: true }).limit(100);
    if (publicResult.error) throw publicResult.error;
    comments = publicResult.data || [];
    if (actor) {
      const ownResult = await actor.client.rpc('public_my_content_comments', { p_entry_id: entry.entry_id });
      if (ownResult.error) throw ownResult.error;
      myComments = ownResult.data || [];
    }
  }

  return json({
    available: true,
    commentsEnabled: exactTrue(env.PUBLIC_CMS_COMMENTS_ENABLED),
    signedIn: Boolean(actor),
    entry: { path: entry.canonical_path },
    counts,
    comments,
    myComments
  });
}

function requestIp(request) {
  const direct = clean(request.headers.get('x-real-ip'), 100);
  if (direct) return direct;
  return clean(String(request.headers.get('x-forwarded-for') || '').split(',')[0], 100);
}

function countableView(request) {
  const purpose = `${request.headers.get('purpose') || ''} ${request.headers.get('sec-purpose') || ''} ${request.headers.get('x-moz') || ''}`;
  const ua = clean(request.headers.get('user-agent'), 500);
  return Boolean(ua) && !BOT.test(ua) && !/prefetch|prerender/i.test(purpose);
}

function lagosDay(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

function viewReceipt(request, entryId, pepper) {
  const ip = requestIp(request);
  if (!ip || !pepper) return '';
  const day = lagosDay();
  const dailyKey = createHmac('sha256', pepper).update(`view-receipts:${day}`).digest();
  return createHmac('sha256', dailyKey).update(`${entryId}:${ip}`).digest('hex');
}

function mutationError(error) {
  const status = Number(error?.status) || 0;
  if (status === 413) return json({ error: 'Request too large.' }, 413);
  if (status === 400) return json({ error: 'Invalid request.' }, 400);
  const code = String(error?.code || '');
  const message = String(error?.message || '');
  if (code === '42501' || /account required|authority required/i.test(message)) return json({ error: 'An active authorised account is required.' }, 403);
  if (code === 'P0001' || /limit reached/i.test(message)) return json({ error: 'Please wait before submitting another comment.' }, 429);
  if (code === '22023' || /required|unsupported|private information/i.test(message)) return json({ error: 'The request could not be accepted. Remove private details and check every field.' }, 400);
  console.error('Public engagement operation failed', { code, status });
  return json({ error: 'Public engagement is temporarily unavailable.' }, 503);
}

async function mutate(env, request, createClientImpl = createClient) {
  if (!originAllowed(request)) return json({ error: 'Same-origin request required.' }, 403);
  if (!isJsonRequest(request)) return json({ error: 'Content-Type must be application/json.' }, 415);
  let body;
  try { body = await requestJson(request); } catch (error) { return mutationError(error); }
  const operation = clean(body.operation, 40);
  const canonicalPath = clean(body.path, 200);
  if (!MUTATIONS.has(operation) || !PUBLIC_PATH.test(canonicalPath)) return json({ error: 'Invalid request.' }, 400);
  if (COMMENT_MUTATIONS.has(operation) && !exactTrue(env.PUBLIC_CMS_COMMENTS_ENABLED)) return json({ error: 'Comments are not available.' }, 404);

  try {
    const publicApi = publicClient(env, createClientImpl);
    if (!publicApi) return json({ error: 'Public engagement is unavailable.' }, 503);
    const entry = await findEntry(publicApi, canonicalPath);
    if (!entry) return json({ error: 'Published content was not found.' }, 404);

    if (operation === 'view') {
      if (!countableView(request)) return json({ recorded: false, counts: await getCounts(publicApi, entry.entry_id) });
      const secret = serviceClient(env, createClientImpl);
      const receipt = viewReceipt(request, entry.entry_id, clean(env.CMS_ENGAGEMENT_HASH_PEPPER, 4000));
      if (!secret || !receipt) return json({ recorded: false, counts: await getCounts(publicApi, entry.entry_id) });
      const result = await secret.rpc('public_record_content_view', { p_entry_id: entry.entry_id, p_viewer_hash: receipt });
      if (result.error) throw result.error;
      const row = Array.isArray(result.data) ? result.data[0] : result.data;
      return json({ recorded: row?.recorded === true, counts: normaliseCounts(row) });
    }

    const actor = await currentActor(env, request, createClientImpl);
    if (!actor) return json({ error: 'Sign in with an active parent or staff account.' }, 401);

    if (operation === 'like') {
      if (typeof body.liked !== 'boolean') return json({ error: 'Invalid request.' }, 400);
      const result = await actor.client.rpc('public_toggle_content_like', { p_entry_id: entry.entry_id, p_liked: body.liked });
      if (result.error) throw result.error;
      return json({ counts: normaliseCounts(Array.isArray(result.data) ? result.data[0] : result.data) });
    }
    if (operation === 'comment') {
      const result = await actor.client.rpc('public_submit_content_comment', { p_entry_id: entry.entry_id, p_body: clean(body.body, 2200) });
      if (result.error) throw result.error;
      return json({ comment: Array.isArray(result.data) ? result.data[0] : result.data, message: 'Comment submitted for leadership review.' }, 201);
    }

    const commentId = clean(body.commentId, 100);
    if (!UUID.test(commentId)) return json({ error: 'Invalid request.' }, 400);
    if (operation === 'edit_comment') {
      const result = await actor.client.rpc('public_edit_content_comment', { p_comment_id: commentId, p_body: clean(body.body, 2200) });
      if (result.error) throw result.error;
      return json({ comment: Array.isArray(result.data) ? result.data[0] : result.data, message: 'Comment updated and returned to review.' });
    }
    if (operation === 'delete_comment') {
      const result = await actor.client.rpc('public_delete_own_content_comment', { p_comment_id: commentId });
      if (result.error) throw result.error;
      return json({ deleted: Boolean(result.data), message: 'Comment removed from publication.' });
    }
    const result = await actor.client.rpc('public_report_content_comment', { p_comment_id: commentId, p_reason: clean(body.reason, 600) });
    if (result.error) throw result.error;
    return json({ report: Array.isArray(result.data) ? result.data[0] : result.data, message: 'Concern sent for leadership review.' });
  } catch (error) {
    return mutationError(error);
  }
}

async function placements(env, createClientImpl = createClient) {
  const client = publicClient(env, createClientImpl);
  if (!client) return json({ error: 'Homepage placements are unavailable.' }, 503);
  const { data, error } = await client.from('public_cms_published_slots')
    .select('slot_key,slot_position,entry_id,content_type,canonical_path,title,summary')
    .order('slot_key', { ascending: true }).order('slot_position', { ascending: true });
  if (error) return json({ error: 'Homepage placements are temporarily unavailable.' }, 503);
  const slots = { alert: [], news: [], event: [] };
  for (const item of data || []) {
    const key = item.slot_key === 'home.alert' ? 'alert' : item.slot_key === 'home.news' ? 'news' : item.slot_key === 'home.event' ? 'event' : '';
    if (key) slots[key].push(item);
  }
  return json({ available: true, slots }, 200, { 'cache-control': 'public, max-age=30, stale-while-revalidate=120' });
}

export function isPublicEngagementRequest(request) {
  return ['engagement', 'placements'].includes(new URL(request.url).searchParams.get('action') || '');
}

export async function handlePublicEngagement(request, env = process.env, overrides = {}) {
  const createClientImpl = overrides.createClient || createClient;
  const action = new URL(request.url).searchParams.get('action') || '';
  if (action === 'placements') {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405, { allow: 'GET' });
    if (!exactTrue(env.PUBLIC_CMS_ENABLED) || !exactTrue(env.PUBLIC_CMS_PLACEMENTS_ENABLED)) return json({ error: 'Homepage placements are not available.' }, 404);
    return placements(env, createClientImpl);
  }
  if (action !== 'engagement') return json({ error: 'Not found.' }, 404);
  if (!exactTrue(env.PUBLIC_CMS_ENABLED) || !exactTrue(env.PUBLIC_CMS_ENGAGEMENT_ENABLED)) return json({ error: 'Public engagement is not available.' }, 404);
  if (request.method === 'GET') {
    const canonicalPath = clean(new URL(request.url).searchParams.get('path'), 200);
    if (!PUBLIC_PATH.test(canonicalPath)) return json({ error: 'Invalid content path.' }, 400);
    try { return await summary(env, request, canonicalPath, createClientImpl); } catch (error) { return mutationError(error); }
  }
  if (request.method === 'POST') return mutate(env, request, createClientImpl);
  return json({ error: 'Method not allowed.' }, 405, { allow: 'GET, POST' });
}

export const publicEngagementInternals = Object.freeze({
  exactTrue, originAllowed, countableView, lagosDay, viewReceipt, normaliseCounts
});
