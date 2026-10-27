import { createHash, createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { normalizeNigerianPhone, passwordProblem } from './accounts.mjs';
import { linkCodeHash } from './parent-links.mjs';

const MAX_BODY_BYTES = 12 * 1024;
const PUPIL_CODE = /^TA-LINK-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/;
const FAMILY_CODE = /^TA-FAMILY-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/;
const ACTIVE_CLASSES = new Set([
  'Pre-Nursery', 'Nursery 1', 'Nursery 2',
  'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 6'
]);

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

function settings() {
  if (process.env.PORTAL_ENABLED !== 'true' || process.env.PORTAL_REGISTRATION_ENABLED !== 'true') {
    throw new Error('disabled');
  }
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const pepper = process.env.PORTAL_REGISTRATION_PEPPER || '';
  if (!url || !publishableKey || !secretKey || pepper.length < 24) throw new Error('misconfigured');
  const auth = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
  return {
    adminClient: createClient(url, secretKey, { auth }),
    pepper
  };
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    throw new Error('invalid');
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) throw new Error('too_large');
  const raw = await request.text();
  if (!raw || Buffer.byteLength(raw, 'utf8') > MAX_BODY_BYTES) throw new Error('too_large');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('invalid'); }
  if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('invalid');
  return value;
}

function clean(value, max, min = 1) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text.length >= min && text.length <= max ? text : null;
}

function code(value, pattern) {
  const canonical = String(value || '').trim().toUpperCase().replace(/\s+/g, '');
  return pattern.test(canonical) ? canonical : null;
}

function networkIdentifier(request) {
  const forwarded = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const platform = String(request.headers.get('x-real-ip') || request.headers.get('x-vercel-forwarded-for') || '').split(',')[0].trim();
  return (forwarded || platform || 'unknown').slice(0, 100);
}

function opaqueHash(pepper, label, value) {
  return createHmac('sha256', pepper).update(`${label}:${String(value).toLowerCase()}`, 'utf8').digest('hex');
}

async function recordAttempt(client, phoneHash, networkHash, route, succeeded, reasonCode) {
  await client.rpc('server_record_registration_attempt', {
    p_phone_hash: phoneHash,
    p_network_hash: networkHash,
    p_route: route,
    p_succeeded: succeeded,
    p_reason_code: reasonCode
  }).catch(() => null);
}

async function rateLimited(client, phoneHash, networkHash) {
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const [phone, network] = await Promise.all([
    client.from('registration_attempts').select('id', { count: 'exact', head: true })
      .eq('phone_hash', phoneHash).gte('created_at', since),
    client.from('registration_attempts').select('id', { count: 'exact', head: true })
      .eq('network_hash', networkHash).gte('created_at', since)
  ]);
  if (phone.error || network.error) throw new Error('storage');
  return Number(phone.count || 0) >= 5 || Number(network.count || 0) >= 20;
}

function publicFailure(error) {
  if (error?.message === 'disabled') return response(404, { error: 'Not found' });
  if (error?.message === 'too_large') return response(413, { error: 'Request too large.' });
  if (error?.message === 'rate_limited') {
    return response(429, { error: 'Too many recent attempts. Wait before trying again or contact the school office.' });
  }
  if (['invalid', 'password'].includes(String(error?.message))) {
    return response(400, { error: 'Check the registration route and required details.' });
  }
  return response(409, {
    error: 'Registration could not be completed. Check the private code and pupil details, or contact the school office without sharing your password.'
  });
}

export async function handleRegistration(request) {
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' });
  if (!sameOrigin(request)) return response(403, { error: 'Request origin not accepted.' });

  let config;
  let body;
  let route = 'new_applicant';
  let phoneHash = createHash('sha256').update('unavailable').digest('hex');
  let networkHash = null;
  try {
    config = settings();
    body = await readJson(request);
    route = ['existing_pupil', 'second_parent', 'new_applicant'].includes(body.route) ? body.route : null;
    const fullName = clean(body.fullName, 120, 2);
    const phone = normalizeNigerianPhone(body.phone);
    const passwordIssue = passwordProblem(body.password);
    if (!route || !fullName || !phone || passwordIssue) throw new Error(passwordIssue ? 'password' : 'invalid');

    phoneHash = opaqueHash(config.pepper, 'phone', phone);
    networkHash = opaqueHash(config.pepper, 'network', networkIdentifier(request));
    if (await rateLimited(config.adminClient, phoneHash, networkHash)) {
      await recordAttempt(config.adminClient, phoneHash, networkHash, route, false, 'rate_limited');
      throw new Error('rate_limited');
    }

    const classCode = route === 'existing_pupil' ? clean(body.classCode, 40, 2) : null;
    const registeredName = route === 'existing_pupil' ? clean(body.registeredName, 120, 2) : null;
    const privateCode = route === 'existing_pupil'
      ? code(body.code, PUPIL_CODE)
      : route === 'second_parent' ? code(body.code, FAMILY_CODE) : null;
    if (
      (route === 'existing_pupil' && (!classCode || !ACTIVE_CLASSES.has(classCode) || !registeredName || !privateCode))
      || (route === 'second_parent' && !privateCode)
    ) throw new Error('invalid');

    const { data: created, error: createError } = await config.adminClient.auth.admin.createUser({
      phone,
      password: String(body.password),
      phone_confirm: true,
      user_metadata: { full_name: fullName, registration_route: route }
    });
    if (createError || !created?.user?.id) {
      await recordAttempt(config.adminClient, phoneHash, networkHash, route, false, 'identity_unavailable');
      throw new Error('identity_unavailable');
    }

    const accountId = created.user.id;
    const { data, error: registrationError } = await config.adminClient.rpc('server_self_register_account', {
      p_account_id: accountId,
      p_full_name: fullName,
      p_phone_e164: phone,
      p_route: route,
      p_class_code: classCode,
      p_registered_name: registeredName,
      p_code_hash: privateCode ? linkCodeHash(privateCode) : null
    });
    if (registrationError) {
      await config.adminClient.auth.admin.deleteUser(accountId).catch(() => null);
      await recordAttempt(config.adminClient, phoneHash, networkHash, route, false, 'credential_rejected');
      throw registrationError;
    }

    await recordAttempt(config.adminClient, phoneHash, networkHash, route, true, 'registered');
    return response(201, {
      registered: true,
      stage: data?.stage === 'applicant' ? 'applicant' : 'parent',
      instruction: data?.stage === 'applicant'
        ? 'Sign in to complete and track the admission application. Pupil, fee and shop records stay unavailable until admission is approved.'
        : 'Sign in with the phone number and password you just created.'
    });
  } catch (error) {
    if (config?.adminClient && networkHash) {
      const reason = ['invalid', 'password'].includes(String(error?.message)) ? 'invalid_input' : 'request_failed';
      if (reason === 'invalid_input') await recordAttempt(config.adminClient, phoneHash, networkHash, route || 'new_applicant', false, reason);
    }
    return publicFailure(error);
  }
}
