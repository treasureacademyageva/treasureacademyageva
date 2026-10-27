import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, verify } from 'node:crypto';
import { dispatchOtpRelay } from '../../server/otp-relay.mjs';
import { handleAccountClaimRequest } from '../../server/account-claims.mjs';
import { handleAdmissionTrackingRequest } from '../../server/admission-tracking.mjs';

const relayKeys = [
  'PARAGON_OTP_RELAY_ENABLED', 'PARAGON_OTP_RELAY_URL', 'PARAGON_OTP_RELAY_PRIVATE_KEY_B64',
  'PARAGON_OTP_RELAY_KEY_ID', 'PARAGON_OTP_RELAY_TENANT'
];
const gateKeys = [
  'PORTAL_ENABLED', 'PORTAL_ACCOUNT_CLAIM_ENABLED', 'ADMISSION_TRACKING_ENABLED',
  'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY',
  'PORTAL_CLAIM_HASH_PEPPER', 'PORTAL_CLAIM_OTP_ENCRYPTION_KEY',
  'ADMISSION_OTP_HASH_PEPPER', 'ADMISSION_OTP_ENCRYPTION_KEY'
];
function preserve(keys) {
  const prior = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  return () => { for (const [key, value] of Object.entries(prior)) value === undefined ? delete process.env[key] : process.env[key] = value; };
}
function claimRequest(url) {
  return new Request(url, { method: 'POST', headers: { Origin: new URL(url).origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ phone: '09063932487', channel: 'whatsapp', whatsappConfirmed: true }) });
}

test('relay gate is exact-true and disabled mode cannot contact a provider', async () => {
  const restore = preserve(relayKeys);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    process.env.PARAGON_OTP_RELAY_ENABLED = 'TRUE';
    globalThis.fetch = async () => { calls += 1; throw new Error('network must not run'); };
    const result = await dispatchOtpRelay({ challengeId: 'challenge-local', phone: '+2349063932487', code: '123456', expiresInSeconds: 300 });
    assert.deepEqual(result, { delivered: false, mode: 'manual' });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test('signed relay envelope contains only the approved delivery boundary and verifies as Ed25519', async () => {
  const restore = preserve(relayKeys);
  const originalFetch = globalThis.fetch;
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  let captured;
  try {
    Object.assign(process.env, {
      PARAGON_OTP_RELAY_ENABLED: 'true',
      PARAGON_OTP_RELAY_URL: 'https://relay.invalid/otp',
      PARAGON_OTP_RELAY_PRIVATE_KEY_B64: privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64'),
      PARAGON_OTP_RELAY_KEY_ID: 'treasure-academy-local-test',
      PARAGON_OTP_RELAY_TENANT: 'treasure-academy'
    });
    globalThis.fetch = async (url, options) => {
      captured = { url: String(url), options };
      return new Response(JSON.stringify({ accepted: true, reference: 'local:accepted/2487' }), { status: 202, headers: { 'Content-Type': 'application/json' } });
    };
    const delivered = await dispatchOtpRelay({ challengeId: 'local-challenge-2487', phone: '+2349063932487', code: '123456', expiresInSeconds: 300 });
    assert.equal(delivered.delivered, true);
    assert.equal(delivered.providerReference, 'local:accepted/2487');
    assert.equal(captured.url, 'https://relay.invalid/otp');
    assert.equal(captured.options.method, 'POST');
    const body = JSON.parse(captured.options.body);
    assert.deepEqual(Object.keys(body).sort(), ['authenticationCode', 'challengeId', 'channel', 'expiresInSeconds', 'recipientPhone', 'requestId', 'tenant', 'version'].sort());
    assert.deepEqual({ version: body.version, tenant: body.tenant, challengeId: body.challengeId, channel: body.channel, recipientPhone: body.recipientPhone, expiresInSeconds: body.expiresInSeconds }, {
      version: 1, tenant: 'treasure-academy', challengeId: 'local-challenge-2487', channel: 'whatsapp', recipientPhone: '+2349063932487', expiresInSeconds: 300
    });
    assert.equal(JSON.stringify(body).match(/pupil|class|result|payment|password|message/i), null);
    const timestamp = captured.options.headers['X-Paragon-Timestamp'];
    const signature = captured.options.headers['X-Paragon-Signature'].replace(/^ed25519=/, '');
    assert.equal(captured.options.headers['X-Paragon-Request-Id'], body.requestId);
    assert.equal(verify(null, Buffer.from(`${timestamp}.${captured.options.body}`), publicKey, Buffer.from(signature, 'base64url')), true);
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test('enabled relay rejects invalid configuration and provider non-acceptance without manual-success claims', async () => {
  const restore = preserve(relayKeys);
  const originalFetch = globalThis.fetch;
  const { privateKey } = generateKeyPairSync('ed25519');
  try {
    process.env.PARAGON_OTP_RELAY_ENABLED = 'true';
    process.env.PARAGON_OTP_RELAY_URL = 'http://not-https.invalid';
    process.env.PARAGON_OTP_RELAY_PRIVATE_KEY_B64 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
    process.env.PARAGON_OTP_RELAY_KEY_ID = 'local-key';
    await assert.rejects(() => dispatchOtpRelay({ challengeId: 'local', phone: '+2349063932487', code: '123456', expiresInSeconds: 300 }), /relay_misconfigured/);
    process.env.PARAGON_OTP_RELAY_URL = 'https://relay.invalid/otp';
    globalThis.fetch = async () => new Response(JSON.stringify({ accepted: false }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    await assert.rejects(() => dispatchOtpRelay({ challengeId: 'local', phone: '+2349063932487', code: '123456', expiresInSeconds: 300 }), /relay_rejected/);
  } finally { globalThis.fetch = originalFetch; restore(); }
});

test('school-account and admission OTP gates remain separate and fail before database/provider traffic', async () => {
  const restore = preserve([...relayKeys, ...gateKeys]);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    for (const key of [...relayKeys, ...gateKeys]) delete process.env[key];
    process.env.PARAGON_OTP_RELAY_ENABLED = 'true';
    globalThis.fetch = async () => { calls += 1; throw new Error('provider must not run'); };
    const account = await handleAccountClaimRequest(claimRequest('https://school.test/api/account/claim/request'));
    const admission = await handleAdmissionTrackingRequest(claimRequest('https://school.test/api/admission/tracking/request'));
    assert.equal(account.status, 404);
    assert.equal(admission.status, 404);
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; restore(); }
});
