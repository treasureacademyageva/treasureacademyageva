import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const MAX_BODY_BYTES = 12 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const REFERENCE = /^TA-REQ-[0-9]{8}-[A-Z0-9]{8}$/;
const TRACKING = /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/;
const TYPES = new Set([
  'general', 'admission', 'school_visit', 'class_enquiry', 'fee_schedule',
  'calendar', 'transport', 'uniform', 'supplies', 'pta', 'event',
  'lost_property', 'receipt_verification', 'school_record', 'alumni_update',
  'website_problem', 'safeguarding', 'private_feedback', 'testimonial_permission',
  'career', 'volunteer', 'support_proposal', 'account_help', 'homework',
  'reading', 'exam_timetable', 'birthday_greeting', 'information_update'
]);
const STAFF_SOURCES = new Set(['whatsapp', 'phone', 'office_visit']);
const STATUS_LABELS = {
  received: 'Received by the school',
  assigned: 'Assigned to a staff member',
  under_review: 'Under review',
  needs_information: 'More information is needed',
  confirmed: 'Confirmed',
  declined: 'Closed without confirmation',
  closed: 'Closed'
};

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer'
    }
  });
}

function config() {
  if (process.env.WEBSITE_REQUESTS_ENABLED !== 'true') throw new Error('disabled');
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !publishableKey || !secretKey) throw new Error('misconfigured');
  return { url, publishableKey, secretKey };
}

function clients(settings) {
  const auth = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
  return {
    publicClient: createClient(settings.url, settings.publishableKey, { auth }),
    adminClient: createClient(settings.url, settings.secretKey, { auth })
  };
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

export function normalizeNigerianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^234[789]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0[789]\d{9}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return null;
}

export function trackingHash(value) {
  return createHash('sha256').update(String(value || '').replaceAll('-', '').toUpperCase(), 'utf8').digest('hex');
}

export function generateTrackingCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(16);
  const characters = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
  return [0, 4, 8, 12].map((start) => characters.slice(start, start + 4).join('')).join('-');
}

function lagosDateStamp(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
}

export function generateRequestReference(now = new Date()) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = [...randomBytes(8)].map((byte) => alphabet[byte % alphabet.length]).join('');
  return `TA-REQ-${lagosDateStamp(now)}-${suffix}`;
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new Error('content_type');
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) throw new Error('too_large');
  const text = await request.text();
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new Error('too_large');
  let parsed;
  try { parsed = JSON.parse(text); } catch { throw new Error('json'); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new Error('json');
  return parsed;
}

function clean(value, max, min = 1) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length >= min && text.length <= max ? text : null;
}

function bearerToken(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+([^\s]+)$/i);
  return match && match[1].length <= 8192 ? match[1] : null;
}

function jwtSessionId(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return UUID.test(String(payload.session_id || '')) ? payload.session_id : null;
  } catch { return null; }
}

async function requireStaff(request, publicClient, adminClient) {
  const token = bearerToken(request);
  const sessionId = token ? jwtSessionId(token) : null;
  if (!token || !sessionId) throw Object.assign(new Error('unauthorized'), { status: 401 });
  const { data, error } = await publicClient.auth.getUser(token);
  if (error || !data?.user?.id) throw Object.assign(new Error('unauthorized'), { status: 401 });
  const [{ data: profile, error: profileError }, { data: current, error: sessionError }] = await Promise.all([
    adminClient.from('profiles').select('id,role,active,account_status,must_change_password').eq('id', data.user.id).single(),
    adminClient.rpc('server_validate_portal_session', { p_user_id: data.user.id, p_session_id: sessionId })
  ]);
  if (profileError || sessionError || current !== true || !profile
      || !['teacher', 'admin'].includes(profile.role) || profile.active !== true
      || profile.account_status !== 'active' || profile.must_change_password !== false) {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }
  return profile;
}

function emailValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const email = clean(value, 254, 5)?.toLowerCase();
  return email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

function requestError(error) {
  if (error?.status === 401) return response(401, { error: 'Sign in again to register an off-site request.' });
  if (error?.status === 403) return response(403, { error: 'This account cannot register staff requests.' });
  if (error?.message === 'disabled') return response(404, { error: 'Request Centre is not active yet.' });
  if (error?.message === 'too_large') return response(413, { error: 'Request is too large.' });
  if (String(error?.message || '').includes('request_rate_limited')) return response(429, { error: 'Too many recent requests for this phone number. Keep your existing references or contact the office.' });
  if (['content_type', 'json', 'invalid'].includes(String(error?.message))) return response(400, { error: 'Check the form and try again.' });
  return response(503, { error: 'The Request Centre is temporarily unavailable. No reference was created.' });
}

export async function handleCreateRequest(request) {
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' });
  if (!sameOrigin(request)) return response(403, { error: 'Request origin not accepted.' });
  try {
    const settings = config();
    const { publicClient, adminClient } = clients(settings);
    const body = await readJson(request);
    if (clean(body.website, 200)) throw new Error('invalid');

    const requestType = TYPES.has(body.requestType) ? body.requestType : null;
    const requestedSource = STAFF_SOURCES.has(body.source) ? body.source : 'website';
    let staff = null;
    if (requestedSource !== 'website') staff = await requireStaff(request, publicClient, adminClient);

    const name = clean(body.name, 120, 2);
    const phone = normalizeNigerianPhone(body.phone);
    const email = emailValue(body.email);
    const classCode = body.classCode ? clean(body.classCode, 40) : null;
    const subject = clean(body.subject, 160, 2);
    const message = clean(body.message, 4000, 2);
    if (!requestType || !name || !phone || !subject || !message || (body.email && !email)) throw new Error('invalid');

    if (!staff) {
      const startedAt = Number(body.startedAt || 0);
      const elapsed = Date.now() - startedAt;
      if (!Number.isFinite(startedAt) || elapsed < 1500 || elapsed > 24 * 60 * 60 * 1000) throw new Error('invalid');
    }

    let inserted = null;
    let trackingCode = null;
    for (let attempt = 0; attempt < 3 && !inserted; attempt += 1) {
      trackingCode = generateTrackingCode();
      const requestReference = generateRequestReference();
      const { data, error } = await adminClient.rpc('create_website_request', {
        p_request_reference: requestReference,
        p_tracking_hash: trackingHash(trackingCode),
        p_request_type: requestType,
        p_submitter_name: name,
        p_phone_e164: phone,
        p_email: email,
        p_class_code: classCode,
        p_subject: subject,
        p_message: message,
        p_source: requestedSource,
        p_registered_by: staff?.id || null
      });
      if (error) {
        if (String(error.code) === '23505') continue;
        throw error;
      }
      inserted = data;
    }
    if (!inserted || !trackingCode) throw new Error('reference_collision');

    return response(201, {
      reference: inserted.request_reference,
      trackingCode,
      status: inserted.status,
      statusLabel: STATUS_LABELS[inserted.status],
      submittedAt: inserted.submitted_at,
      instruction: 'Keep both the reference and private tracking code. The code is not stored in readable form and cannot be recovered.'
    });
  } catch (error) {
    return requestError(error);
  }
}

export async function handleRequestStatus(request) {
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' });
  if (!sameOrigin(request)) return response(403, { error: 'Request origin not accepted.' });
  try {
    const settings = config();
    const { adminClient } = clients(settings);
    const body = await readJson(request);
    const reference = String(body.reference || '').trim().toUpperCase();
    const trackingCode = String(body.trackingCode || '').trim().toUpperCase();
    if (!REFERENCE.test(reference) || !TRACKING.test(trackingCode)) throw new Error('invalid');

    const { data, error } = await adminClient.from('website_requests')
      .select('request_reference,tracking_hash,request_type,status,public_note,submitted_at,updated_at,resolved_at')
      .eq('request_reference', reference).maybeSingle();
    const supplied = Buffer.from(trackingHash(trackingCode), 'hex');
    const stored = Buffer.from(data?.tracking_hash || '0'.repeat(64), 'hex');
    const valid = supplied.length === stored.length && timingSafeEqual(supplied, stored);
    if (error || !data || !valid) return response(404, { error: 'Reference and tracking code did not match.' });

    return response(200, {
      reference: data.request_reference,
      requestType: data.request_type,
      status: data.status,
      statusLabel: STATUS_LABELS[data.status] || 'In progress',
      publicNote: data.public_note || null,
      submittedAt: data.submitted_at,
      updatedAt: data.updated_at,
      resolvedAt: data.resolved_at
    });
  } catch (error) {
    return requestError(error);
  }
}
