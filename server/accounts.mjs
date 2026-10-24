import { randomBytes } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const MAX_BODY_BYTES = 16 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESET_REASONS = new Set(['in_person', 'confirmed_voice_call', 'owner_approved_record_check']);
const STATUS_REASONS = new Set(['identity_review_complete', 'security_concern', 'employment_ended', 'relationship_changed', 'owner_instruction']);
const ACCOUNT_STATUSES = new Set(['active', 'suspended', 'archived']);
const RELATIONSHIPS = new Set(['parent', 'guardian', 'caregiver']);

export function jsonResponse(status, body) {
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

export function normalizeNigerianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^234[789]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0[789]\d{9}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return null;
}

export function passwordProblem(value) {
  const password = String(value || '');
  if (password.length < 12 || password.length > 128) return 'Use 12 to 128 characters.';
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    return 'Include an uppercase letter, lowercase letter, number and symbol.';
  }
  const normalized = password.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (['password123', 'treasureacademy', 'admin123456', 'qwerty123456'].includes(normalized)) {
    return 'Choose a less predictable password.';
  }
  return null;
}

export function generateTemporaryPassword() {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghijkmnopqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%*-_+=';
  const all = upper + lower + digits + symbols;
  const pick = (alphabet) => alphabet[randomBytes(1)[0] % alphabet.length];
  const characters = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (characters.length < 18) characters.push(pick(all));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const swap = randomBytes(1)[0] % (index + 1);
    [characters[index], characters[swap]] = [characters[swap], characters[index]];
  }
  return characters.join('');
}

function configFromEnvironment() {
  if (process.env.PORTAL_ENABLED !== 'true' || process.env.PORTAL_ACCOUNTS_ENABLED !== 'true') {
    throw new Error('disabled');
  }
  const url = process.env.SUPABASE_URL || '';
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !publishableKey || !secretKey) throw new Error('misconfigured');
  return { url: url.replace(/\/+$/, ''), publishableKey, secretKey };
}

function clients(config) {
  const auth = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
  return {
    publicClient: createClient(config.url, config.publishableKey, { auth }),
    adminClient: createClient(config.url, config.secretKey, { auth })
  };
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

export async function readJson(request) {
  const type = (request.headers.get('content-type') || '').toLowerCase();
  if (!type.startsWith('application/json')) throw new Error('content_type');
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) throw new Error('too_large');
  const text = await request.text();
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw new Error('too_large');
  try {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('json');
    return value;
  } catch {
    throw new Error('json');
  }
}

function bearerToken(request) {
  const header = request.headers.get('authorization') || '';
  const match = header.match(/^Bearer\s+([^\s]+)$/i);
  if (!match || match[1].length > 8192) return null;
  return match[1];
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}

async function authenticate(request, adminRequired) {
  const config = configFromEnvironment();
  const token = bearerToken(request);
  if (!token) throw Object.assign(new Error('unauthorized'), { status: 401 });
  const { publicClient, adminClient } = clients(config);
  const { data, error } = await publicClient.auth.getUser(token);
  if (error || !data?.user?.id) throw Object.assign(new Error('unauthorized'), { status: 401 });

  const claims = decodeJwtPayload(token);
  const sessionId = String(claims?.session_id || '');
  if (!UUID.test(sessionId)) throw Object.assign(new Error('unauthorized'), { status: 401 });

  const [{ data: profile, error: profileError }, { data: sessionIsCurrent, error: sessionError }] = await Promise.all([
    adminClient
      .from('profiles')
      .select('id,role,leadership_scope,active,account_status,must_change_password')
      .eq('id', data.user.id)
      .single(),
    adminClient.rpc('server_validate_portal_session', {
      p_user_id: data.user.id,
      p_session_id: sessionId
    })
  ]);
  if (profileError || !profile || sessionError || sessionIsCurrent !== true) {
    throw Object.assign(new Error('unauthorized'), { status: 401 });
  }

  if (adminRequired && !(
    profile.role === 'admin'
    && profile.leadership_scope === 'headmistress'
    && profile.active === true
    && profile.account_status === 'active'
    && profile.must_change_password === false
  )) {
    throw Object.assign(new Error('forbidden'), { status: 403 });
  }

  return {
    user: data.user,
    profile,
    token,
    claims,
    adminClient
  };
}

function cleanText(value, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= max ? text : null;
}

function requestError(error) {
  const status = Number(error?.status || 0);
  if (status === 401) return jsonResponse(401, { error: 'Sign in again to continue.' });
  if (status === 403) return jsonResponse(403, { error: 'This account is not authorised for that action.' });
  if (String(error?.message) === 'disabled') return jsonResponse(404, { error: 'Not found' });
  if (['content_type', 'json'].includes(String(error?.message))) return jsonResponse(400, { error: 'Invalid request.' });
  if (String(error?.message) === 'too_large') return jsonResponse(413, { error: 'Request too large.' });
  return jsonResponse(503, { error: 'Account service temporarily unavailable.' });
}

function methodAndOrigin(request) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });
  if (!sameOrigin(request)) return jsonResponse(403, { error: 'Request origin not accepted.' });
  return null;
}

export async function handleCreateAccount(request) {
  const early = methodAndOrigin(request);
  if (early) return early;
  let auth;
  let body;
  try {
    [auth, body] = await Promise.all([authenticate(request, true), readJson(request)]);
  } catch (error) {
    return requestError(error);
  }

  const fullName = cleanText(body.fullName, 120);
  const phone = normalizeNigerianPhone(body.phone);
  // Ordinary parent accounts are never created by administrators. Parents use
  // the self-registration routes with a private pupil/family credential, or a
  // restricted new-admission applicant account. This endpoint provisions staff.
  const role = body.role === 'teacher' ? 'teacher' : null;
  const legacySource = body.legacySource ? cleanText(body.legacySource, 80) : null;
  const legacyAccountNo = body.legacyAccountNo ? cleanText(body.legacyAccountNo, 120) : null;
  const studentIds = Array.isArray(body.studentIds) ? [...new Set(body.studentIds)] : [];
  if (!fullName || !phone || !role || studentIds.length || studentIds.some((id) => !UUID.test(String(id)))) {
    return jsonResponse(400, { error: 'Enter the verified staff name and Nigerian phone. Parent accounts must self-register.' });
  }

  const temporaryPassword = generateTemporaryPassword();
  const { data: created, error: createError } = await auth.adminClient.auth.admin.createUser({
    phone,
    password: temporaryPassword,
    phone_confirm: true,
    user_metadata: { full_name: fullName }
  });
  if (createError || !created?.user?.id) {
    return jsonResponse(createError?.status === 422 ? 409 : 503, {
      error: createError?.status === 422
        ? 'An account with those verified details may already exist.'
        : 'Account creation could not be completed.'
    });
  }

  const accountId = created.user.id;
  const { error: provisionError } = await auth.adminClient.rpc('provision_portal_account', {
    p_actor_id: auth.user.id,
    p_account_id: accountId,
    p_full_name: fullName,
    p_phone_e164: phone,
    p_role: role,
    p_legacy_source: legacySource,
    p_legacy_account_no: legacyAccountNo,
    p_student_ids: studentIds
  });

  if (provisionError) {
    await auth.adminClient.auth.admin.deleteUser(accountId).catch(() => null);
    return jsonResponse(409, { error: 'The account could not be safely provisioned. No password was issued.' });
  }

  return jsonResponse(201, {
    accountId,
    status: 'pending_activation',
    temporaryPassword,
    instruction: 'Share privately after verification. It will not be shown again.'
  });
}

export function accountIdFromPath(request, action) {
  const url = new URL(request.url);
  const match = url.pathname.match(new RegExp(`/api/admin/accounts/([0-9a-f-]{36})/${action}/?$`, 'i'));
  const candidate = match?.[1] || url.searchParams.get('id') || '';
  return UUID.test(candidate) ? candidate : null;
}

export async function handleResetPassword(request) {
  const early = methodAndOrigin(request);
  if (early) return early;
  let auth;
  let body;
  try {
    [auth, body] = await Promise.all([authenticate(request, true), readJson(request)]);
  } catch (error) {
    return requestError(error);
  }
  const accountId = accountIdFromPath(request, 'reset-password');
  const reason = String(body.reason || '');
  if (!accountId || !RESET_REASONS.has(reason)) {
    return jsonResponse(400, { error: 'Choose an account and record the approved identity-verification method.' });
  }

  const temporaryPassword = generateTemporaryPassword();
  const { error: beginError } = await auth.adminClient.rpc('begin_portal_password_reset', {
    p_actor_id: auth.user.id,
    p_account_id: accountId,
    p_reason_code: reason
  });
  if (beginError) return jsonResponse(403, { error: 'Password reset was not authorised.' });

  const { error: passwordError } = await auth.adminClient.auth.admin.updateUserById(accountId, {
    password: temporaryPassword,
    ban_duration: 'none'
  });
  if (passwordError) {
    return jsonResponse(503, { error: 'The account was secured, but a temporary password was not issued. Retry the verified reset.' });
  }

  return jsonResponse(200, {
    accountId,
    status: 'pending_activation',
    temporaryPassword,
    instruction: 'All former sessions were revoked. Share privately; this password will not be shown again.'
  });
}

export async function handleAccountStatus(request) {
  const early = methodAndOrigin(request);
  if (early) return early;
  let auth;
  let body;
  try {
    [auth, body] = await Promise.all([authenticate(request, true), readJson(request)]);
  } catch (error) {
    return requestError(error);
  }
  const accountId = accountIdFromPath(request, 'status');
  const status = String(body.status || '');
  const reason = String(body.reason || '');
  if (!accountId || !ACCOUNT_STATUSES.has(status) || !STATUS_REASONS.has(reason)) {
    return jsonResponse(400, { error: 'Choose a valid account status and reason.' });
  }

  const { data, error } = await auth.adminClient.rpc('set_portal_account_status', {
    p_actor_id: auth.user.id,
    p_account_id: accountId,
    p_status: status,
    p_reason_code: reason
  });
  if (error) return jsonResponse(403, { error: 'The account status could not be changed.' });

  // Database/RLS state changes first so a partial failure always fails closed.
  // Supabase Auth banning additionally blocks new sign-ins and refreshes; the
  // database RPC already removed sessions when suspension/archive was chosen.
  const { error: authStatusError } = await auth.adminClient.auth.admin.updateUserById(accountId, {
    ban_duration: status === 'active' ? 'none' : '876000h'
  });
  if (authStatusError) {
    return jsonResponse(503, { error: 'Portal access was secured, but the Auth sign-in state needs an authorised retry.' });
  }
  return jsonResponse(200, data || { accountId, status });
}

export async function handleGuardianLink(request) {
  const early = methodAndOrigin(request);
  if (early) return early;
  let auth;
  let body;
  try {
    [auth, body] = await Promise.all([authenticate(request, true), readJson(request)]);
  } catch (error) {
    return requestError(error);
  }
  const parentId = String(body.parentId || '');
  const studentId = String(body.studentId || '');
  const relationship = String(body.relationship || '');
  const active = body.active === true;
  if (!UUID.test(parentId) || !UUID.test(studentId) || !RELATIONSHIPS.has(relationship) || typeof body.active !== 'boolean') {
    return jsonResponse(400, { error: 'Choose a verified parent, pupil, relationship and link action.' });
  }

  const { data, error } = await auth.adminClient.rpc('set_verified_guardian_link', {
    p_actor_id: auth.user.id,
    p_parent_id: parentId,
    p_student_id: studentId,
    p_relationship: relationship,
    p_active: active
  });
  if (error) return jsonResponse(403, { error: 'The caregiver relationship could not be changed.' });
  return jsonResponse(200, data || { parentId, studentId, active });
}

export async function handleChangePassword(request) {
  const early = methodAndOrigin(request);
  if (early) return early;
  let auth;
  let body;
  try {
    [auth, body] = await Promise.all([authenticate(request, false), readJson(request)]);
  } catch (error) {
    return requestError(error);
  }

  const problem = passwordProblem(body.password);
  if (problem) return jsonResponse(400, { error: problem });
  if (!auth.profile.active || auth.profile.account_status !== 'pending_activation' || auth.profile.must_change_password !== true) {
    return jsonResponse(403, { error: 'This account is not awaiting a password change.' });
  }

  const sessionId = String(auth.claims?.session_id || '');
  if (!UUID.test(sessionId)) return jsonResponse(401, { error: 'Sign in again to continue.' });
  const { data: sessionIsCurrent, error: sessionError } = await auth.adminClient.rpc('server_validate_portal_session', {
    p_user_id: auth.user.id,
    p_session_id: sessionId
  });
  if (sessionError || sessionIsCurrent !== true) return jsonResponse(401, { error: 'Sign in again to continue.' });

  const { error: passwordError } = await auth.adminClient.auth.admin.updateUserById(auth.user.id, {
    password: String(body.password)
  });
  if (passwordError) return jsonResponse(503, { error: 'Your password could not be updated. Try again.' });

  const { error: completeError } = await auth.adminClient.rpc('complete_portal_password_change', {
    p_account_id: auth.user.id,
    p_session_id: sessionId
  });
  if (completeError) {
    return jsonResponse(503, { error: 'Your password was secured, but activation needs to be retried. Sign in with the new password.' });
  }

  return jsonResponse(200, { status: 'active' });
}
