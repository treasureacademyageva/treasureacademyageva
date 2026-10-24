import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  randomInt,
  randomUUID
} from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const OTP = /^\d{6}$/;
const CHANNELS = new Set(['whatsapp', 'sms']);
const ACTIVE_CHALLENGE = ['queued', 'revealed', 'sent'];
const MAX_BODY_BYTES = 8 * 1024;

export function jsonResponse(status, body) {
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

function settings(requiredGate) {
  if (process.env[requiredGate] !== 'true') throw Object.assign(new Error('disabled'), { status: 404 });
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const pepper = String(process.env.ADMISSION_OTP_HASH_PEPPER || '');
  const encryptionSecret = String(process.env.ADMISSION_OTP_ENCRYPTION_KEY || '');
  if (!url || !publishableKey || !secretKey || pepper.length < 32 || encryptionSecret.length < 32) {
    throw Object.assign(new Error('misconfigured'), { status: 503 });
  }
  return { url, publishableKey, secretKey, pepper, encryptionSecret };
}

function clients(config) {
  const auth = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
  return {
    publicClient: createClient(config.url, config.publishableKey, { auth }),
    adminClient: createClient(config.url, config.secretKey, { auth })
  };
}

export function normalizeNigerianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^234[789]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0[789]\d{9}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return null;
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

function safeAuthenticatedReadOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return true;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

async function readJson(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) {
    throw Object.assign(new Error('content_type'), { status: 400 });
  }
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) {
    throw Object.assign(new Error('too_large'), { status: 413 });
  }
  const text = await request.text();
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
    throw Object.assign(new Error('too_large'), { status: 413 });
  }
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('json');
    return body;
  } catch {
    throw Object.assign(new Error('json'), { status: 400 });
  }
}

function hash(value) {
  return createHash('sha256').update(String(value), 'utf8').digest('hex');
}

function keyedHash(secret, value) {
  return createHmac('sha256', secret).update(String(value), 'utf8').digest('hex');
}

function requesterNetwork(request, config) {
  const forwarded = String(request.headers.get('x-forwarded-for') || '').split(',')[0].trim();
  const direct = String(request.headers.get('x-real-ip') || '').trim();
  const network = (forwarded || direct || 'unknown').slice(0, 80);
  return keyedHash(config.pepper, `network:${network}`);
}

function encryptDelivery(config, payload, challengeId) {
  const key = createHash('sha256').update(config.encryptionSecret, 'utf8').digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`admission-tracking:${challengeId}`, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    delivery_ciphertext: ciphertext.toString('base64'),
    delivery_iv: iv.toString('base64'),
    delivery_tag: cipher.getAuthTag().toString('base64')
  };
}

function decryptDelivery(config, row, challengeId) {
  const key = createHash('sha256').update(config.encryptionSecret, 'utf8').digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.delivery_iv, 'base64'));
  decipher.setAAD(Buffer.from(`admission-tracking:${challengeId}`, 'utf8'));
  decipher.setAuthTag(Buffer.from(row.delivery_tag, 'base64'));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(row.delivery_ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(clear);
}

function genericRequestResult(requestToken) {
  return {
    accepted: true,
    requestToken,
    expiresInSeconds: 300,
    message: 'If this registered phone has an eligible new-pupil application, an authorised dispatcher will send the code using the chosen channel.'
  };
}

async function recordUnavailableAttempt(adminClient, values) {
  // Persist only pseudonymous rate-limit material. The cancelled row never
  // enters the dispatcher queue and does not reveal whether an account exists.
  const { error } = await adminClient.from('admission_tracking_challenges').insert({
    id: randomUUID(),
    account_id: null,
    request_token_hash: values.requestTokenHash,
    phone_hash: values.phoneHash,
    phone_last4: values.phone.slice(-4),
    network_hash: values.networkHash,
    channel: values.channel,
    otp_hash: hash(randomBytes(32)),
    status: 'cancelled',
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    cancelled_at: new Date().toISOString()
  });
  if (error) throw new Error('rate_limit_record');
}

function cleanError(error, fallback = 'Service temporarily unavailable.') {
  const status = Number(error?.status || 0);
  if (status === 404 || String(error?.message) === 'disabled') return jsonResponse(404, { error: 'Not found' });
  if (status === 401) return jsonResponse(401, { error: 'Sign in again to continue.' });
  if (status === 403) return jsonResponse(403, { error: 'This account is not authorised for that action.' });
  if (status === 400 || ['content_type', 'json'].includes(String(error?.message))) return jsonResponse(400, { error: 'Check the submitted details.' });
  if (status === 413 || String(error?.message) === 'too_large') return jsonResponse(413, { error: 'Request too large.' });
  return jsonResponse(503, { error: fallback });
}

function bearerToken(request) {
  const match = String(request.headers.get('authorization') || '').match(/^Bearer\s+([^\s]+)$/i);
  return match && match[1].length <= 8192 ? match[1] : null;
}

function jwtSessionId(token) {
  try {
    const value = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8'));
    return UUID.test(String(value?.session_id || '')) ? value.session_id : null;
  } catch { return null; }
}

async function authenticate(request, config, capability = null) {
  const token = bearerToken(request);
  if (!token) throw Object.assign(new Error('unauthorized'), { status: 401 });
  const { publicClient, adminClient } = clients(config);
  const { data, error } = await publicClient.auth.getUser(token);
  const sessionId = jwtSessionId(token);
  if (error || !data?.user?.id || !sessionId) throw Object.assign(new Error('unauthorized'), { status: 401 });
  const [{ data: profile, error: profileError }, { data: sessionOk, error: sessionError }] = await Promise.all([
    adminClient.from('profiles').select('id,full_name,role,active,account_status,must_change_password').eq('id', data.user.id).single(),
    adminClient.rpc('server_validate_portal_session', { p_user_id: data.user.id, p_session_id: sessionId })
  ]);
  if (profileError || sessionError || sessionOk !== true || !profile || profile.active !== true || profile.account_status !== 'active' || profile.must_change_password !== false) {
    throw Object.assign(new Error('unauthorized'), { status: 401 });
  }
  if (capability) {
    const { data: allowed, error: capabilityError } = await adminClient.rpc('developer_has_capability', {
      p_profile_id: data.user.id,
      p_capability: capability
    });
    if (capabilityError || allowed !== true) throw Object.assign(new Error('forbidden'), { status: 403 });
  }
  return { user: data.user, profile, token, adminClient };
}

function requirePost(request) {
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Method not allowed' });
  if (!sameOrigin(request)) return jsonResponse(403, { error: 'Request origin not accepted.' });
  return null;
}

export async function handleAdmissionTrackingRequest(request) {
  const early = requirePost(request);
  if (early) return early;
  try {
    const config = settings('ADMISSION_TRACKING_ENABLED');
    const body = await readJson(request);
    const phone = normalizeNigerianPhone(body.phone);
    const channel = String(body.channel || '').toLowerCase();
    if (!phone || !CHANNELS.has(channel) || (channel === 'whatsapp' && body.whatsappConfirmed !== true)) {
      return jsonResponse(400, { error: channel === 'whatsapp' ? 'Confirm that the registered number uses WhatsApp.' : 'Enter a valid registered Nigerian phone and delivery channel.' });
    }

    const { adminClient } = clients(config);
    const requestToken = randomBytes(32).toString('base64url');
    const requestTokenHash = hash(requestToken);
    const phoneHash = keyedHash(config.pepper, `phone:${phone}`);
    const networkHash = requesterNetwork(request, config);
    const sincePhone = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    const sinceNetwork = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const [phoneRate, networkRate] = await Promise.all([
      adminClient.from('admission_tracking_challenges').select('id', { count: 'exact', head: true }).eq('phone_hash', phoneHash).gte('requested_at', sincePhone),
      adminClient.from('admission_tracking_challenges').select('id', { count: 'exact', head: true }).eq('network_hash', networkHash).gte('requested_at', sinceNetwork)
    ]);
    if (phoneRate.error || networkRate.error) throw new Error('rate_limit_query');
    if (Number(phoneRate.count || 0) >= 3 || Number(networkRate.count || 0) >= 20) {
      return jsonResponse(429, { error: 'Please wait before requesting another code.' });
    }

    const { data: profile, error: profileError } = await adminClient
      .from('profiles')
      .select('id,role,parent_stage,active,account_status')
      .eq('phone_e164', phone)
      .in('role', ['parent'])
      .maybeSingle();
    if (profileError) throw new Error('profile_query');
    if (!profile || profile.active !== true || profile.account_status !== 'active' || !['applicant', 'parent'].includes(profile.parent_stage)) {
      await recordUnavailableAttempt(adminClient, { requestTokenHash, phoneHash, networkHash, phone, channel });
      return jsonResponse(202, genericRequestResult(requestToken));
    }
    const { count: applicationCount, error: applicationCountError } = await adminClient
      .from('admission_applications')
      .select('id', { count: 'exact', head: true })
      .eq('parent_id', profile.id);
    if (applicationCountError) throw new Error('application_count_query');
    if (!applicationCount) {
      await recordUnavailableAttempt(adminClient, { requestTokenHash, phoneHash, networkHash, phone, channel });
      return jsonResponse(202, genericRequestResult(requestToken));
    }

    const { data: replacedRows, error: replacedLookupError } = await adminClient.from('admission_tracking_challenges')
      .select('id,channel').eq('phone_hash', phoneHash).eq('purpose', 'admission_tracking').in('status', ACTIVE_CHALLENGE);
    if (replacedLookupError) throw new Error('challenge_replacement_lookup');
    const { error: cancellationError } = await adminClient.from('admission_tracking_challenges').update({
      status: 'cancelled', cancelled_at: new Date().toISOString(),
      delivery_ciphertext: null, delivery_iv: null, delivery_tag: null
    }).eq('phone_hash', phoneHash).eq('purpose', 'admission_tracking').in('status', ACTIVE_CHALLENGE);
    if (cancellationError) throw new Error('challenge_cancellation');
    if (replacedRows?.length) {
      const { error: replacementAuditError } = await adminClient.from('otp_dispatch_events').insert(replacedRows.map((row) => ({
        challenge_id: row.id, action: 'replaced', channel: row.channel, detail: { reason: 'new_code_requested' }
      })));
      if (replacementAuditError) throw new Error('challenge_replacement_audit');
    }

    const challengeId = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const message = `Treasure Academy admission tracking code: ${code}. It expires in 5 minutes. Do not share it with anyone except this website.`;
    const encrypted = encryptDelivery(config, { phone, message }, challengeId);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const { error: insertError } = await adminClient.from('admission_tracking_challenges').insert({
      id: challengeId,
      account_id: profile.id,
      request_token_hash: requestTokenHash,
      phone_hash: phoneHash,
      phone_last4: phone.slice(-4),
      network_hash: networkHash,
      channel,
      otp_hash: keyedHash(config.pepper, `otp:${challengeId}:${code}`),
      expires_at: expiresAt,
      ...encrypted
    });
    if (insertError) throw new Error('challenge_insert');
    const { error: auditError } = await adminClient.from('otp_dispatch_events').insert({
      challenge_id: challengeId, action: 'queued', channel, detail: { purpose: 'admission_tracking' }
    });
    if (auditError) {
      await adminClient.from('admission_tracking_challenges').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), delivery_ciphertext: null, delivery_iv: null, delivery_tag: null }).eq('id', challengeId);
      throw new Error('queue_audit');
    }
    return jsonResponse(202, genericRequestResult(requestToken));
  } catch (error) {
    return cleanError(error, 'Admission tracking is temporarily unavailable.');
  }
}

export async function handleAdmissionTrackingVerify(request) {
  const early = requirePost(request);
  if (early) return early;
  try {
    const config = settings('ADMISSION_TRACKING_ENABLED');
    const body = await readJson(request);
    const requestToken = String(body.requestToken || '');
    const code = String(body.code || '').replace(/\s/g, '');
    if (requestToken.length < 32 || requestToken.length > 100 || !OTP.test(code)) {
      return jsonResponse(400, { error: 'Enter the six-digit code.' });
    }
    const { adminClient } = clients(config);
    const requestTokenHash = hash(requestToken);
    const { data: challenge, error: challengeError } = await adminClient.from('admission_tracking_challenges')
      .select('id').eq('request_token_hash', requestTokenHash).maybeSingle();
    if (challengeError) throw new Error('challenge_query');
    const candidateHash = challenge?.id
      ? keyedHash(config.pepper, `otp:${challenge.id}:${code}`)
      : keyedHash(config.pepper, `otp:missing:${code}`);
    const { data: claimed, error: claimError } = await adminClient.rpc('server_verify_admission_challenge', {
      p_request_token_hash: requestTokenHash,
      p_otp_hash: candidateHash
    });
    if (claimError || !claimed?.[0]?.account_id) {
      return jsonResponse(400, { error: 'The code is incorrect, expired or replaced. Request a new code if needed.' });
    }
    const accountId = claimed[0].account_id;
    const challengeId = claimed[0].challenge_id;
    const { data: activeRows, error: activeError } = await adminClient.rpc('server_active_admission_applications', {
      p_account_id: accountId
    });
    if (activeError) throw new Error('application_projection');

    const { data: convertedRows, error: convertedError } = await adminClient.from('admission_applications')
      .select('id').eq('parent_id', accountId).not('student_id', 'is', null).eq('status', 'admitted');
    if (convertedError) throw new Error('converted_lookup');
    const rawTokens = [];
    const continuationRows = [];
    for (const row of convertedRows || []) {
      const token = randomBytes(32).toString('base64url');
      rawTokens.push(token);
      continuationRows.push({
        token_hash: hash(token), account_id: accountId, application_id: row.id,
        challenge_id: challengeId, expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });
    }
    if (continuationRows.length) {
      const { error: continuationError } = await adminClient.from('admission_tracking_continuations').insert(continuationRows);
      if (continuationError) throw new Error('continuation_insert');
    }
    return jsonResponse(200, {
      verified: true,
      applications: (activeRows || []).map((row) => ({
        reference: row.application_reference,
        childName: row.child_name,
        requestedClass: row.requested_class,
        status: row.status,
        message: row.parent_verdict_message || null,
        nextStep: row.parent_next_step || null,
        session: row.admission_session_name || null,
        submittedAt: row.submitted_at,
        updatedAt: row.updated_at
      })),
      portalContinuationTokens: rawTokens,
      portalLoginAvailable: true
    });
  } catch (error) {
    return cleanError(error, 'Admission status could not be retrieved safely.');
  }
}

export async function handlePortalContinuation(request) {
  const early = requirePost(request);
  if (early) return early;
  try {
    const config = settings('ADMISSION_TRACKING_ENABLED');
    if (process.env.PORTAL_ENABLED !== 'true') throw Object.assign(new Error('disabled'), { status: 404 });
    const [body, auth] = await Promise.all([readJson(request), authenticate(request, config)]);
    const tokens = Array.isArray(body.tokens) ? body.tokens.slice(0, 10).map(String) : [];
    if (!tokens.length || tokens.some((token) => token.length < 32 || token.length > 100)) {
      return jsonResponse(400, { error: 'The admission continuation is missing or invalid.' });
    }
    const results = [];
    let matchedTokens = 0;
    for (const token of tokens) {
      const tokenHash = hash(token);
      const { data: continuation, error: continuationLookupError } = await auth.adminClient.from('admission_tracking_continuations')
        .select('id,application_id,expires_at,consumed_at')
        .eq('token_hash', tokenHash).eq('account_id', auth.user.id).maybeSingle();
      if (continuationLookupError) throw new Error('continuation_lookup');
      if (!continuation || continuation.consumed_at || new Date(continuation.expires_at).getTime() <= Date.now()) continue;
      const { data: application, error: applicationError } = await auth.adminClient.from('admission_applications')
        .select('child_name,requested_class,status,parent_verdict_message,parent_next_step,admission_session_name,updated_at')
        .eq('id', continuation.application_id).eq('parent_id', auth.user.id)
        .not('student_id', 'is', null).eq('status', 'admitted').maybeSingle();
      if (applicationError) throw new Error('continuation_application');
      if (!application) continue;
      const consumedAt = new Date().toISOString();
      const { data: consumed, error: consumeError } = await auth.adminClient.from('admission_tracking_continuations')
        .update({ consumed_at: consumedAt }).eq('id', continuation.id).is('consumed_at', null).select('id').maybeSingle();
      if (consumeError) throw new Error('continuation_consume');
      if (!consumed) continue;
      matchedTokens += 1;
      results.push({
        childName: application.child_name,
        requestedClass: application.requested_class,
        status: application.status,
        message: application.parent_verdict_message || 'This application has been admitted and linked to your signed-in family account.',
        nextStep: application.parent_next_step || 'Continue in the parent portal for the private next step.',
        session: application.admission_session_name || null,
        updatedAt: application.updated_at
      });
    }
    return jsonResponse(200, { applications: results, matchedTokens });
  } catch (error) {
    return cleanError(error, 'The private admission continuation could not be completed.');
  }
}

export async function handleDeveloperOtp(request) {
  try {
    const config = settings('DEVELOPER_CONSOLE_ENABLED');
    const auth = await authenticate(request, config, 'otp_dispatch');
    if (request.method === 'GET') {
      if (!safeAuthenticatedReadOrigin(request)) return jsonResponse(403, { error: 'Request origin not accepted.' });
      const now = new Date().toISOString();
      const { data: expiredRows, error: expiryError } = await auth.adminClient.from('admission_tracking_challenges').update({
        status: 'expired', delivery_ciphertext: null, delivery_iv: null, delivery_tag: null
      }).in('status', ACTIVE_CHALLENGE).lte('expires_at', now).select('id,channel');
      if (expiryError) throw new Error('queue_expiry');
      if (expiredRows?.length) {
        const { error: expiryAuditError } = await auth.adminClient.from('otp_dispatch_events').insert(expiredRows.map((row) => ({
          challenge_id: row.id, actor_id: auth.user.id, action: 'expired', channel: row.channel, detail: {}
        })));
        if (expiryAuditError) throw new Error('queue_expiry_audit');
      }
      const { data, error } = await auth.adminClient.from('admission_tracking_challenges')
        .select('id,phone_last4,channel,status,requested_at,expires_at,revealed_at,sent_at')
        .in('status', ACTIVE_CHALLENGE).gt('expires_at', now).order('requested_at', { ascending: true }).limit(50);
      if (error) throw new Error('queue');
      return jsonResponse(200, { queue: data || [] });
    }
    const early = requirePost(request);
    if (early) return early;
    const body = await readJson(request);
    const challengeId = String(body.challengeId || '');
    const action = String(body.action || '');
    if (!UUID.test(challengeId)) return jsonResponse(400, { error: 'Invalid queue item.' });
    if (action === 'reveal') {
      const { data, error } = await auth.adminClient.rpc('server_reveal_otp_dispatch', {
        p_challenge_id: challengeId, p_actor_id: auth.user.id
      });
      if (error || !data?.[0]) return jsonResponse(409, { error: 'This one-time payload is no longer available.' });
      const payload = decryptDelivery(config, data[0], challengeId);
      return jsonResponse(200, {
        challengeId,
        channel: data[0].channel,
        phone: payload.phone,
        message: payload.message,
        clearAfterSeconds: 30
      });
    }
    if (['copied', 'opened_channel', 'marked_sent'].includes(action)) {
      const { data, error } = await auth.adminClient.rpc('server_mark_otp_sent', {
        p_challenge_id: challengeId, p_actor_id: auth.user.id, p_action: action
      });
      if (error || data !== true) return jsonResponse(409, { error: 'The queue item is no longer available.' });
      return jsonResponse(200, { ok: true });
    }
    return jsonResponse(400, { error: 'Invalid queue action.' });
  } catch (error) {
    return cleanError(error, 'Developer dispatch is temporarily unavailable.');
  }
}

export async function authenticateDeveloper(request, capability = 'console') {
  const config = settings('DEVELOPER_CONSOLE_ENABLED');
  return authenticate(request, config, capability);
}

export function developerSettings() {
  return settings('DEVELOPER_CONSOLE_ENABLED');
}
