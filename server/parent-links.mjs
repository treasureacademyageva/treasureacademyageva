import { createHash, randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const MAX_BODY_BYTES = 8 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PUPIL_CODE = /^TA-LINK-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/;
const FAMILY_CODE = /^TA-FAMILY-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/;

function jsonResponse(status, body) {
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

function settings() {
  if (process.env.PORTAL_ENABLED !== 'true' || process.env.PARENT_LINKING_ENABLED !== 'true') throw new Error('disabled');
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !publishableKey || !secretKey) throw new Error('misconfigured');
  return { url, publishableKey, secretKey };
}

function clients(config) {
  const auth = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
  return {
    publicClient: createClient(config.url, config.publishableKey, { auth }),
    adminClient: createClient(config.url, config.secretKey, { auth })
  };
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function bearerToken(request) {
  const match = (request.headers.get('authorization') || '').match(/^Bearer\s+([^\s]+)$/i);
  return match && match[1].length <= 8192 ? match[1] : null;
}

function sessionId(token) {
  try {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return UUID.test(String(payload.session_id || '')) ? payload.session_id : null;
  } catch { return null; }
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw new Error('content_type');
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) throw new Error('too_large');
  const text = await request.text();
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new Error('too_large');
  let value;
  try { value = JSON.parse(text); } catch { throw new Error('json'); }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('json');
  return value;
}

function clean(value, max, min = 1) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length >= min && text.length <= max ? text : null;
}

function normalizeNigerianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^234[789]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0[789]\d{9}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return null;
}

function canonicalCode(value, pattern) {
  const code = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  return pattern.test(code) ? code : null;
}

export function linkCodeHash(value) {
  return createHash('sha256').update(String(value || '').trim().toUpperCase(), 'utf8').digest('hex');
}

export function generatePrivateCode(prefix) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = randomBytes(12);
  const characters = [...bytes].map((byte) => alphabet[byte % alphabet.length]);
  return `${prefix}-${[0, 4, 8].map((start) => characters.slice(start, start + 4).join('')).join('-')}`;
}

async function authenticate(request) {
  const token = bearerToken(request);
  const currentSessionId = token ? sessionId(token) : null;
  if (!token || !currentSessionId) throw Object.assign(new Error('unauthorized'), { status: 401 });
  const config = settings();
  const { publicClient, adminClient } = clients(config);
  const { data: identity, error: identityError } = await publicClient.auth.getUser(token);
  if (identityError || !identity?.user?.id) throw Object.assign(new Error('unauthorized'), { status: 401 });
  const [{ data: profile, error: profileError }, { data: current, error: currentError }] = await Promise.all([
    adminClient.from('profiles').select('id,role,leadership_scope,phone_e164,active,account_status,must_change_password').eq('id', identity.user.id).single(),
    adminClient.rpc('server_validate_portal_session', { p_user_id: identity.user.id, p_session_id: currentSessionId })
  ]);
  if (profileError || currentError || current !== true || !profile || profile.active !== true
      || profile.account_status !== 'active' || profile.must_change_password !== false) {
    throw Object.assign(new Error('unauthorized'), { status: 401 });
  }
  return { actorId: identity.user.id, profile, adminClient };
}

function early(request) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });
  if (!sameOrigin(request)) return jsonResponse(403, { error: 'Request origin not accepted.' });
  return null;
}

function failure(error) {
  if (error?.status === 401) return jsonResponse(401, { error: 'Sign in again to continue.' });
  if (error?.message === 'disabled') return jsonResponse(404, { error: 'Not found' });
  if (error?.message === 'too_large') return jsonResponse(413, { error: 'Request too large.' });
  if (['content_type', 'json', 'invalid'].includes(String(error?.message))) return jsonResponse(400, { error: 'Check the details and try again.' });
  const message = String(error?.message || '');
  if (message.includes('pupil_link_rate_limited')) return jsonResponse(429, { error: 'Too many recent attempts. Wait before trying again or contact the school.' });
  if (message.includes('two active') || String(error?.code) === '23514') return jsonResponse(409, { error: 'This pupil already has two active parent or guardian accounts.' });
  if (message.includes('different phone')) return jsonResponse(400, { error: 'Enter the second parent’s own Nigerian phone number.' });
  if (error?.status === 403 || String(error?.code) === '42501') return jsonResponse(403, { error: 'This account is not authorised for that action.' });
  return jsonResponse(503, { error: 'The pupil-linking service is temporarily unavailable.' });
}

export async function handlePupilMatch(request) {
  const immediate = early(request); if (immediate) return immediate;
  try {
    const [auth, body] = await Promise.all([authenticate(request), readJson(request)]);
    if (auth.profile.role !== 'parent') throw Object.assign(new Error('forbidden'), { status: 403 });
    const classCode = clean(body.classCode, 40);
    const registeredName = clean(body.registeredName, 120, 2);
    if (!classCode || !registeredName) throw new Error('invalid');
    const { data, error } = await auth.adminClient.rpc('server_parent_match_pupil', {
      p_actor_id: auth.actorId, p_class_code: classCode, p_registered_name: registeredName
    });
    if (error) throw error;
    return jsonResponse(200, { matched: data?.matched === true });
  } catch (error) { return failure(error); }
}

export async function handlePupilLink(request) {
  const immediate = early(request); if (immediate) return immediate;
  try {
    const [auth, body] = await Promise.all([authenticate(request), readJson(request)]);
    if (auth.profile.role !== 'parent') throw Object.assign(new Error('forbidden'), { status: 403 });
    const classCode = clean(body.classCode, 40);
    const registeredName = clean(body.registeredName, 120, 2);
    const code = canonicalCode(body.code, PUPIL_CODE);
    if (!classCode || !registeredName || !code) throw new Error('invalid');
    const { data, error } = await auth.adminClient.rpc('server_redeem_pupil_link_code', {
      p_actor_id: auth.actorId, p_class_code: classCode,
      p_registered_name: registeredName, p_code_hash: linkCodeHash(code)
    });
    if (error) throw error;
    if (data?.linked !== true) return jsonResponse(404, { error: 'The pupil details and private code did not match.' });
    return jsonResponse(200, { linked: true, alreadyLinked: data?.already_linked === true });
  } catch (error) { return failure(error); }
}

export async function handleSecondInvitation(request) {
  const immediate = early(request); if (immediate) return immediate;
  try {
    const [auth, body] = await Promise.all([authenticate(request), readJson(request)]);
    if (auth.profile.role !== 'parent') throw Object.assign(new Error('forbidden'), { status: 403 });
    const studentId = String(body.studentId || '');
    const phone = normalizeNigerianPhone(body.phone);
    if (!UUID.test(studentId) || !phone) throw new Error('invalid');
    const code = generatePrivateCode('TA-FAMILY');
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
    const { data, error } = await auth.adminClient.rpc('server_create_second_guardian_invitation', {
      p_actor_id: auth.actorId, p_student_id: studentId, p_intended_phone_e164: phone,
      p_code_hash: linkCodeHash(code), p_expires_at: expiresAt
    });
    if (error) throw error;
    return jsonResponse(201, { invitationCode: code, expiresAt: data?.expires_at || expiresAt, instruction: 'Share privately with the intended second parent. It is shown only once.' });
  } catch (error) { return failure(error); }
}

export async function handleSecondRedemption(request) {
  const immediate = early(request); if (immediate) return immediate;
  try {
    const [auth, body] = await Promise.all([authenticate(request), readJson(request)]);
    if (auth.profile.role !== 'parent') throw Object.assign(new Error('forbidden'), { status: 403 });
    const code = canonicalCode(body.code, FAMILY_CODE);
    if (!code) throw new Error('invalid');
    const { data, error } = await auth.adminClient.rpc('server_redeem_second_guardian_invitation', {
      p_actor_id: auth.actorId, p_code_hash: linkCodeHash(code)
    });
    if (error) throw error;
    if (data?.linked !== true) return jsonResponse(404, { error: 'The invitation is invalid, expired or intended for a different phone number.' });
    return jsonResponse(200, { linked: true, alreadyLinked: data?.already_linked === true });
  } catch (error) { return failure(error); }
}

export async function handleIssuePupilCode(request) {
  const immediate = early(request); if (immediate) return immediate;
  try {
    const [auth, body] = await Promise.all([authenticate(request), readJson(request)]);
    if (auth.profile.role !== 'admin' || auth.profile.leadership_scope !== 'headmistress') {
      throw Object.assign(new Error('forbidden'), { status: 403 });
    }
    const studentId = String(body.studentId || '');
    if (!UUID.test(studentId)) throw new Error('invalid');
    const code = generatePrivateCode('TA-LINK');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await auth.adminClient.rpc('server_issue_pupil_link_code', {
      p_actor_id: auth.actorId, p_student_id: studentId,
      p_code_hash: linkCodeHash(code), p_expires_at: expiresAt
    });
    if (error) throw error;
    return jsonResponse(201, { linkingCode: code, expiresAt: data?.expires_at || expiresAt, instruction: 'Give this privately to the correct parent. It is shown only once.' });
  } catch (error) { return failure(error); }
}
