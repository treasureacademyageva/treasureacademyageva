import { createHash, createHmac } from 'node:crypto';
import { isIP } from 'node:net';
import { createClient } from '@supabase/supabase-js';
import { normalizeNigerianPhone, passwordProblem } from './accounts.mjs';

const MAX_BODY_BYTES = 8 * 1024;
const AUTHORISATION = /^[A-Za-z0-9_-]{40,100}$/;

function response(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'"
    }
  });
}

function failure(status, code) {
  throw Object.assign(new Error(code), { status, code });
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

async function parseBody(request) {
  const mediaType = String(request.headers.get('content-type') || '').toLowerCase().split(';', 1)[0].trim();
  if (mediaType !== 'application/json') failure(400, 'invalid');
  const declaredHeader = request.headers.get('content-length');
  if (declaredHeader && !/^\d+$/.test(declaredHeader)) failure(400, 'invalid');
  const declared = Number(declaredHeader || 0);
  if (declared > MAX_BODY_BYTES) failure(413, 'large');
  const text = await request.text();
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) failure(413, 'large');
  try {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== 'object') failure(400, 'invalid');
    const allowed = ['authorisation', 'confirmPassword', 'password', 'phone'];
    const keys = Object.keys(value).sort();
    if (keys.length !== allowed.length || keys.some((key, index) => key !== allowed[index])) failure(400, 'invalid');
    return value;
  } catch (error) {
    if (error?.code) throw error;
    failure(400, 'invalid');
  }
}

function hash(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function networkAddress(request) {
  for (const name of ['x-vercel-forwarded-for', 'x-real-ip', 'x-forwarded-for']) {
    const value = String(request.headers.get(name) || '').split(',')[0].trim();
    if (isIP(value)) return value;
  }
  failure(503, 'network_identity_missing');
}

function privateSubjectHash(pepper, scope, value) {
  const day = new Date().toISOString().slice(0, 10);
  return createHmac('sha256', pepper).update(`${day}\u0000${scope}\u0000${value}`, 'utf8').digest('hex');
}

async function settings(overrides = {}) {
  const url = String(overrides.url || process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const secretKey = overrides.secretKey || process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const rateLimitPepper = overrides.rateLimitPepper || process.env.DEVELOPER_BOOTSTRAP_RATE_LIMIT_PEPPER || '';
  if (rateLimitPepper.length < 32) failure(503, 'misconfigured');
  if (overrides.adminClient) return { admin: overrides.adminClient, rateLimitPepper };
  if (!url || !secretKey) failure(503, 'misconfigured');
  return {
    rateLimitPepper,
    admin: createClient(url, secretKey, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false }
    })
  };
}

async function release(admin, authorisationId, authorisationHash, reasonCode) {
  const { data, error } = await admin.rpc('server_release_developer_bootstrap', {
    p_authorisation_id: authorisationId,
    p_authorisation_hash: authorisationHash,
    p_reason_code: reasonCode
  });
  return !error && data === true;
}

async function conflictingProfile(admin, phone) {
  const result = await admin.from('profiles').select('id').eq('phone_e164', phone).maybeSingle();
  if (result.error) failure(503, 'profile_lookup_failed');
  return result.data?.id || null;
}

async function takeRateLimits(admin, pepper, request, phone) {
  const address = networkAddress(request);
  const subjects = [
    ['network', address],
    // Bind the phone bucket to the same opaque network subject so an attacker
    // cannot globally exhaust another person's temporary setup window.
    ['phone', `${address}\u0000${phone}`]
  ];
  for (const [scope, value] of subjects) {
    const { data, error } = await admin.rpc('server_take_developer_bootstrap_rate_limit', {
      p_scope: scope,
      p_subject_hash: privateSubjectHash(pepper, scope, value)
    });
    if (error) failure(503, 'rate_limit_failed');
    if (data !== true) failure(429, 'rate_limited');
  }
}

async function reserve(admin, authorisationHash, phone) {
  // This RPC also enforces the authoritative per-authorisation five-attempt
  // lock under a row lock, after the persistent network/phone buckets pass.
  const { data, error } = await admin.rpc('server_reserve_developer_bootstrap', {
    p_authorisation_hash: authorisationHash,
    p_phone_e164: phone
  });
  if (error) failure(503, 'reserve_failed');
  return Array.isArray(data) ? data[0] || null : data || null;
}

async function completeInitial(admin, reserved, authorisationHash, phone, password) {
  const existingProfile = await conflictingProfile(admin, phone);
  if (existingProfile) {
    await release(admin, reserved.authorisation_id, authorisationHash, 'auth_creation_failed');
    failure(409, 'identity_conflict');
  }

  const created = await admin.auth.admin.createUser({
    phone,
    password,
    phone_confirm: true,
    user_metadata: { full_name: reserved.full_name }
  });
  const userId = created.data?.user?.id || null;
  if (created.error || !userId) {
    await release(admin, reserved.authorisation_id, authorisationHash, 'auth_creation_failed');
    failure(created.error?.status === 422 ? 409 : 503, created.error?.status === 422 ? 'identity_conflict' : 'auth_create_failed');
  }

  const completed = await admin.rpc('server_complete_developer_bootstrap', {
    p_authorisation_id: reserved.authorisation_id,
    p_claim_id: reserved.claim_id,
    p_user_id: userId,
    p_authorisation_hash: authorisationHash
  });
  if (completed.error || completed.data !== userId) {
    const deleted = await admin.auth.admin.deleteUser(userId);
    if (!deleted.error) {
      await release(admin, reserved.authorisation_id, authorisationHash, 'profile_completion_failed');
    }
    failure(503, 'completion_failed');
  }
  return 'initial_password';
}

async function completeRecovery(admin, reserved, authorisationHash, phone, password) {
  if (!reserved.existing_user_id) failure(503, 'recovery_identity_missing');
  const existing = await admin.auth.admin.getUserById(reserved.existing_user_id);
  if (existing.error || existing.data?.user?.phone !== phone) failure(503, 'recovery_identity_mismatch');

  const updated = await admin.auth.admin.updateUserById(reserved.existing_user_id, { password });
  if (updated.error) {
    await release(admin, reserved.authorisation_id, authorisationHash, 'auth_creation_failed');
    failure(503, 'auth_update_failed');
  }
  const completed = await admin.rpc('server_complete_developer_password_recovery', {
    p_authorisation_id: reserved.authorisation_id,
    p_claim_id: reserved.claim_id,
    p_user_id: reserved.existing_user_id,
    p_authorisation_hash: authorisationHash
  });
  // A password update cannot be compensated because the former password is
  // deliberately unknowable. Keep the database reservation fail-closed when
  // completion fails; never release it for reuse after an Auth update.
  if (completed.error || completed.data !== true) failure(503, 'completion_failed');
  return 'password_recovery';
}

function safeError(error) {
  const status = Number(error?.status || 0);
  if (status === 404 || error?.code === 'disabled') return response(404, { error: 'Not found' });
  if (status === 403) return response(403, { error: 'Request origin not accepted.' });
  if (status === 413 || error?.code === 'large') return response(413, { error: 'Request too large.' });
  if (status === 429) return response(429, { error: 'Too many private account setup attempts. Wait before trying again.' });
  if (status === 409) return response(409, { error: 'Account setup was not accepted. Contact the owner without sharing a password.' });
  if (status === 400 || error?.code === 'invalid') return response(400, { error: 'Account setup was not accepted. Check the fields or request a new owner authorisation.' });
  return response(503, { error: 'Private account setup is temporarily unavailable. Contact the owner without sharing a password.' });
}

export async function handleDeveloperBootstrap(request, overrides = {}) {
  if ((overrides.enabled ?? process.env.DEVELOPER_MANUAL_BOOTSTRAP_ENABLED === 'true') !== true) {
    return response(404, { error: 'Not found' });
  }
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' });
  if (!sameOrigin(request)) return response(403, { error: 'Request origin not accepted.' });

  try {
    const value = await parseBody(request);
    const phone = normalizeNigerianPhone(value.phone);
    const authorisation = String(value.authorisation || '').trim();
    const password = String(value.password || '');
    const confirmation = String(value.confirmPassword || '');
    const passwordIssue = passwordProblem(password);
    if (!phone || !AUTHORISATION.test(authorisation) || password !== confirmation || passwordIssue) {
      failure(400, 'invalid');
    }

    const config = await settings(overrides);
    await takeRateLimits(config.admin, config.rateLimitPepper, request, phone);
    const authorisationHash = hash(authorisation);
    const reserved = await reserve(config.admin, authorisationHash, phone);
    if (!reserved) failure(400, 'invalid');

    let purpose;
    if (reserved.purpose === 'initial_password') {
      purpose = await completeInitial(config.admin, reserved, authorisationHash, phone, password);
    } else if (reserved.purpose === 'password_recovery') {
      purpose = await completeRecovery(config.admin, reserved, authorisationHash, phone, password);
    } else {
      failure(503, 'invalid_purpose');
    }

    return response(200, {
      completed: true,
      purpose,
      message: purpose === 'initial_password'
        ? 'Your private developer password is ready. Sign in normally when the protected console is enabled.'
        : 'Your developer password was changed. Sign in again with the new password.'
    });
  } catch (error) {
    return safeError(error);
  }
}
