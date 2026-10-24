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
import { normalizeNigerianPhone, passwordProblem } from './accounts.mjs';
import { dispatchOtpRelay } from './otp-relay.mjs';

const MAX_BODY_BYTES = 8 * 1024;
const OTP = /^\d{6}$/;
const CHANNELS = new Set(['whatsapp', 'sms']);
const ACTIVE = ['queued', 'revealed', 'sent'];

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

function config() {
  if (process.env.PORTAL_ENABLED !== 'true' || process.env.PORTAL_ACCOUNT_CLAIM_ENABLED !== 'true') {
    throw Object.assign(new Error('disabled'), { status: 404 });
  }
  const url = String(process.env.SUPABASE_URL || '').replace(/\/+$/, '');
  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const pepper = String(process.env.PORTAL_CLAIM_HASH_PEPPER || '');
  const encryptionSecret = String(process.env.PORTAL_CLAIM_OTP_ENCRYPTION_KEY || '');
  if (!url || !publishableKey || !secretKey || pepper.length < 32 || encryptionSecret.length < 32) {
    throw Object.assign(new Error('misconfigured'), { status: 503 });
  }
  const auth = { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false };
  return { admin: createClient(url, secretKey, { auth }), pepper, encryptionSecret };
}

function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try { return new URL(origin).origin === new URL(request.url).origin; } catch { return false; }
}

async function body(request) {
  if (!(request.headers.get('content-type') || '').toLowerCase().startsWith('application/json')) throw Object.assign(new Error('invalid'), { status: 400 });
  if (Number(request.headers.get('content-length') || 0) > MAX_BODY_BYTES) throw Object.assign(new Error('large'), { status: 413 });
  const text = await request.text();
  if (!text || Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) throw Object.assign(new Error('large'), { status: 413 });
  try {
    const value = JSON.parse(text);
    if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('invalid');
    return value;
  } catch { throw Object.assign(new Error('invalid'), { status: 400 }); }
}

function hash(value) { return createHash('sha256').update(String(value), 'utf8').digest('hex'); }
function keyedHash(secret, value) { return createHmac('sha256', secret).update(String(value), 'utf8').digest('hex'); }
function networkHash(request, pepper) {
  const value = String(request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown').split(',')[0].trim().slice(0, 80);
  return keyedHash(pepper, `network:${value}`);
}

function encrypt(configValue, challengeId, payload) {
  const key = createHash('sha256').update(configValue.encryptionSecret, 'utf8').digest();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from(`portal-account-claim:${challengeId}`, 'utf8'));
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return {
    delivery_ciphertext: encrypted.toString('base64'),
    delivery_iv: iv.toString('base64'),
    delivery_tag: cipher.getAuthTag().toString('base64')
  };
}

export function decryptAccountClaimDelivery(configValue, row, challengeId) {
  const key = createHash('sha256').update(configValue.encryptionSecret, 'utf8').digest();
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(row.delivery_iv, 'base64'));
  decipher.setAAD(Buffer.from(`portal-account-claim:${challengeId}`, 'utf8'));
  decipher.setAuthTag(Buffer.from(row.delivery_tag, 'base64'));
  const clear = Buffer.concat([
    decipher.update(Buffer.from(row.delivery_ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
  return JSON.parse(clear);
}

function generic(requestToken) {
  return {
    accepted: true,
    requestToken,
    expiresInSeconds: 300,
    message: 'If this phone has an owner-approved school account, a one-time code will be sent using the selected channel.'
  };
}

function failure(error) {
  const status = Number(error?.status || 0);
  if (status === 404 || error?.message === 'disabled') return response(404, { error: 'Not found' });
  if (status === 400 || error?.message === 'invalid') return response(400, { error: 'Check the submitted details.' });
  if (status === 413 || error?.message === 'large') return response(413, { error: 'Request too large.' });
  if (status === 429) return response(429, { error: 'Please wait before requesting another code.' });
  return response(503, { error: 'Account claim is temporarily unavailable. Contact the school office without sharing a password.' });
}

function requirePost(request) {
  if (request.method !== 'POST') return response(405, { error: 'Method not allowed' });
  if (!sameOrigin(request)) return response(403, { error: 'Request origin not accepted.' });
  return null;
}

async function fakeRecord(client, values) {
  const { error } = await client.from('portal_account_claim_challenges').insert({
    id: randomUUID(), claim_id: null, request_token_hash: values.requestTokenHash,
    phone_hash: values.phoneHash, phone_last4: values.phone.slice(-4), network_hash: values.network,
    channel: values.channel, otp_hash: hash(randomBytes(32)), status: 'cancelled',
    expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  });
  if (error) throw new Error('record');
}

export async function handleAccountClaimRequest(request) {
  const early = requirePost(request);
  if (early) return early;
  try {
    const settings = config();
    const value = await body(request);
    const phone = normalizeNigerianPhone(value.phone);
    const channel = String(value.channel || '').toLowerCase();
    if (!phone || !CHANNELS.has(channel) || (channel === 'whatsapp' && value.whatsappConfirmed !== true)) {
      return response(400, { error: channel === 'whatsapp' ? 'Confirm that this registered phone uses WhatsApp.' : 'Enter a valid Nigerian phone and delivery channel.' });
    }
    const requestToken = randomBytes(32).toString('base64url');
    const requestTokenHash = hash(requestToken);
    const phoneHash = keyedHash(settings.pepper, `phone:${phone}`);
    const network = networkHash(request, settings.pepper);
    const [byPhone, byNetwork] = await Promise.all([
      settings.admin.from('portal_account_claim_challenges').select('id', { count: 'exact', head: true }).eq('phone_hash', phoneHash).gte('requested_at', new Date(Date.now() - 15 * 60 * 1000).toISOString()),
      settings.admin.from('portal_account_claim_challenges').select('id', { count: 'exact', head: true }).eq('network_hash', network).gte('requested_at', new Date(Date.now() - 60 * 60 * 1000).toISOString())
    ]);
    if (byPhone.error || byNetwork.error) throw new Error('rate');
    if (Number(byPhone.count || 0) >= 3 || Number(byNetwork.count || 0) >= 20) throw Object.assign(new Error('rate'), { status: 429 });

    const { data: claim, error: claimError } = await settings.admin.from('portal_account_claims')
      .select('id,status,expires_at').eq('phone_e164', phone).maybeSingle();
    if (claimError) throw new Error('claim');
    if (!claim || claim.status !== 'pending' || new Date(claim.expires_at).getTime() <= Date.now()) {
      await fakeRecord(settings.admin, { requestTokenHash, phoneHash, network, phone, channel });
      return response(202, generic(requestToken));
    }

    const { data: replaced, error: replacedError } = await settings.admin.from('portal_account_claim_challenges')
      .select('id,channel').eq('phone_hash', phoneHash).in('status', ACTIVE);
    if (replacedError) throw new Error('replace');
    const { error: cancelError } = await settings.admin.from('portal_account_claim_challenges').update({
      status: 'cancelled', delivery_ciphertext: null, delivery_iv: null, delivery_tag: null
    }).eq('phone_hash', phoneHash).in('status', ACTIVE);
    if (cancelError) throw new Error('replace');
    if (replaced?.length) await settings.admin.from('portal_account_claim_events').insert(replaced.map((row) => ({
      challenge_id: row.id, action: 'replaced', channel: row.channel, detail: { reason: 'new_request' }
    })));

    const challengeId = randomUUID();
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    const message = `Treasure Academy school account code: ${code}. It expires in 5 minutes. Do not share it with anyone except this website.`;
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const sealed = encrypt(settings, challengeId, { phone, message });
    const { error: insertError } = await settings.admin.from('portal_account_claim_challenges').insert({
      id: challengeId, claim_id: claim.id, request_token_hash: requestTokenHash,
      phone_hash: phoneHash, phone_last4: phone.slice(-4), network_hash: network, channel,
      otp_hash: keyedHash(settings.pepper, `otp:${challengeId}:${code}`), expires_at: expiresAt, ...sealed
    });
    if (insertError) throw new Error('insert');
    await settings.admin.from('portal_account_claim_events').insert({ challenge_id: challengeId, action: 'queued', channel, detail: { purpose: 'account_claim' } });

    if (channel === 'whatsapp') {
      try {
        const relay = await dispatchOtpRelay({ challengeId, phone, code, expiresInSeconds: 300 });
        if (relay.delivered) {
          const sentAt = new Date().toISOString();
          const { data: marked, error: markError } = await settings.admin.from('portal_account_claim_challenges').update({
            status: 'sent', sent_at: sentAt, delivery_ciphertext: null, delivery_iv: null, delivery_tag: null
          }).eq('id', challengeId).eq('status', 'queued').select('id').maybeSingle();
          if (markError || !marked) throw new Error('relay_state');
          const { error: eventError } = await settings.admin.from('portal_account_claim_events').insert({
            challenge_id: challengeId, action: 'marked_sent', channel,
            detail: { dispatcher: 'paragon_relay', request_id: relay.requestId, provider_reference: relay.providerReference }
          });
          if (eventError) {
            await settings.admin.from('portal_account_claim_challenges').update({ status: 'cancelled' }).eq('id', challengeId);
            throw new Error('relay_audit');
          }
        }
      } catch {
        // Fail closed to the authorised manual queue. Never leak relay/provider detail.
      }
    }
    return response(202, generic(requestToken));
  } catch (error) { return failure(error); }
}

export async function handleAccountClaimVerify(request) {
  const early = requirePost(request);
  if (early) return early;
  try {
    const settings = config();
    const value = await body(request);
    const requestToken = String(value.requestToken || '');
    const code = String(value.code || '').replace(/\s/g, '');
    if (requestToken.length < 32 || requestToken.length > 100 || !OTP.test(code)) return response(400, { error: 'Enter the six-digit code.' });
    const requestTokenHash = hash(requestToken);
    const { data: challenge, error: challengeError } = await settings.admin.from('portal_account_claim_challenges')
      .select('id').eq('request_token_hash', requestTokenHash).maybeSingle();
    if (challengeError) throw new Error('lookup');
    const candidate = challenge?.id
      ? keyedHash(settings.pepper, `otp:${challenge.id}:${code}`)
      : keyedHash(settings.pepper, `otp:missing:${code}`);
    const setupToken = randomBytes(32).toString('base64url');
    const { data: verified, error: verifyError } = await settings.admin.rpc('server_verify_portal_account_claim', {
      p_request_token_hash: requestTokenHash,
      p_otp_hash: candidate,
      p_setup_token_hash: hash(setupToken)
    });
    if (verifyError || !verified?.[0]?.claim_id) return response(400, { error: 'The code is incorrect, expired or replaced. Request a new code if needed.' });
    return response(200, { verified: true, setupToken, expiresInSeconds: 600 });
  } catch (error) { return failure(error); }
}

export async function handleAccountClaimComplete(request) {
  const early = requirePost(request);
  if (early) return early;
  let createdUserId = null;
  let settings;
  try {
    settings = config();
    const value = await body(request);
    const setupToken = String(value.setupToken || '');
    const password = String(value.password || '');
    if (setupToken.length < 32 || setupToken.length > 100 || password !== String(value.confirmPassword || '') || passwordProblem(password)) {
      return response(400, { error: password !== String(value.confirmPassword || '') ? 'Passwords do not match.' : (passwordProblem(password) || 'Account setup token is invalid.') });
    }
    const setupHash = hash(setupToken);
    const { data: challenge, error: challengeError } = await settings.admin.from('portal_account_claim_challenges')
      .select('claim_id,verified_at,status').eq('setup_token_hash', setupHash).eq('status', 'verified').maybeSingle();
    if (challengeError || !challenge?.claim_id || Date.now() - new Date(challenge.verified_at).getTime() > 10 * 60 * 1000) {
      return response(400, { error: 'Account setup has expired. Request a new code.' });
    }
    const { data: claim, error: claimError } = await settings.admin.from('portal_account_claims')
      .select('id,phone_e164,full_name,status,expires_at').eq('id', challenge.claim_id).maybeSingle();
    if (claimError || !claim || claim.status !== 'pending' || new Date(claim.expires_at).getTime() <= Date.now()) {
      return response(400, { error: 'Account setup has expired. Contact the school office.' });
    }
    const { data: created, error: createError } = await settings.admin.auth.admin.createUser({
      phone: claim.phone_e164,
      password,
      phone_confirm: true,
      user_metadata: { full_name: claim.full_name, registration_route: 'owner_approved_claim' }
    });
    if (createError || !created?.user?.id) return response(409, { error: 'This account could not be created. If it already exists, use normal sign-in or contact the school office.' });
    createdUserId = created.user.id;
    const { data: completed, error: completeError } = await settings.admin.rpc('server_complete_portal_account_claim', {
      p_claim_id: claim.id,
      p_user_id: createdUserId,
      p_setup_token_hash: setupHash
    });
    if (completeError || !completed?.user_id) throw new Error('complete');
    return response(201, {
      completed: true,
      positionTitle: completed.position_title || null,
      instruction: 'Your school account is active. Sign in with this phone number and the password you just created.'
    });
  } catch (error) {
    if (createdUserId && settings?.admin) await settings.admin.auth.admin.deleteUser(createdUserId).catch(() => null);
    return failure(error);
  }
}

export function accountClaimSettingsForDeveloper() { return config(); }
