import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { computeMonnifySignature, parseSuccessfulPayment, sha256, supabaseServerHeaders, verifyMonnifySignature } from '../../server/monnify.mjs';
import { generateTemporaryPassword, handleCreateAccount, normalizeNigerianPhone, passwordProblem, sameOrigin } from '../../server/accounts.mjs';
import { generateRequestReference, generateTrackingCode, handleCreateRequest, handleRequestStatus, trackingHash } from '../../server/requests.mjs';
import { generatePrivateCode, handleIssuePupilCode, handlePupilLink, handlePupilMatch, handleSecondInvitation, handleSecondRedemption, linkCodeHash } from '../../server/parent-links.mjs';
import { handleAdmissionTrackingRequest, handleAdmissionTrackingVerify, handleDeveloperOtp, handlePortalContinuation } from '../../server/admission-tracking.mjs';
import { handleDeveloperConsole } from '../../server/developer-console.mjs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const apiFunctionFiles = (await readdir(new URL('api/', root))).filter((name) => name.endsWith('.mjs'));
let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}
async function asyncTest(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

const secret = 'fictional-local-test-secret-not-a-live-key';
const payload = JSON.stringify({
  eventType: 'SUCCESSFUL_TRANSACTION',
  eventData: {
    paymentReference: 'TA-TEST-001',
    transactionReference: 'MNFY|TEST|001',
    amountPaid: 12500,
    paymentStatus: 'PAID',
    currency: 'NGN'
  }
});
const signature = computeMonnifySignature(payload, secret);

test('HMAC-SHA512 produces 128 lowercase hex characters', () => {
  assert.match(signature, /^[a-f0-9]{128}$/);
});
test('valid Monnify raw-body signature passes', () => {
  assert.equal(verifyMonnifySignature(payload, signature, secret), true);
});
test('altered raw body fails signature verification', () => {
  assert.equal(verifyMonnifySignature(`${payload} `, signature, secret), false);
});
test('malformed and wrong-length signatures fail closed', () => {
  assert.equal(verifyMonnifySignature(payload, 'not-hex', secret), false);
  assert.equal(verifyMonnifySignature(payload, signature.slice(2), secret), false);
});
test('successful payment parser returns only reconciliation fields', () => {
  assert.deepEqual(parseSuccessfulPayment(payload), {
    eventKey: 'SUCCESSFUL_TRANSACTION:MNFY|TEST|001',
    paymentReference: 'TA-TEST-001',
    transactionReference: 'MNFY|TEST|001',
    amountPaid: 12500,
    currency: 'NGN'
  });
});
test('parser rejects malformed, non-paid, unsupported and non-NGN events', () => {
  assert.throws(() => parseSuccessfulPayment('{'));
  assert.throws(() => parseSuccessfulPayment(JSON.stringify({ eventType: 'SETTLEMENT', eventData: {} })));
  assert.throws(() => parseSuccessfulPayment(JSON.stringify({ eventType: 'SUCCESSFUL_TRANSACTION', eventData: { paymentStatus: 'PENDING' } })));
  assert.throws(() => parseSuccessfulPayment(JSON.stringify({ eventType: 'SUCCESSFUL_TRANSACTION', eventData: { paymentStatus: 'PAID', paymentReference: 'A', transactionReference: 'B', amountPaid: 1, currency: 'USD' } })));
});
test('parser rejects zero, negative, non-numeric and extreme amounts', () => {
  for (const amountPaid of [0, -1, 'not-money', 10000000000]) {
    assert.throws(() => parseSuccessfulPayment(JSON.stringify({ eventType: 'SUCCESSFUL_TRANSACTION', eventData: { paymentStatus: 'PAID', paymentReference: 'A', transactionReference: 'B', amountPaid, currency: 'NGN' } })));
  }
});
test('payload SHA-256 is deterministic and contains no payload text', () => {
  assert.match(sha256(payload), /^[a-f0-9]{64}$/);
  assert.equal(sha256(payload), sha256(payload));
  assert.equal(sha256(payload).includes('TA-TEST'), false);
});
test('new Supabase secret keys use apikey only; legacy service JWT keeps Bearer', () => {
  const modern = supabaseServerHeaders('sb_secret_fictional');
  assert.equal(modern.apikey, 'sb_secret_fictional');
  assert.equal('Authorization' in modern, false);
  const legacy = supabaseServerHeaders('fictional.legacy.jwt');
  assert.equal(legacy.Authorization, 'Bearer fictional.legacy.jwt');
});
test('Nigerian phone normalization accepts familiar forms and rejects invalid identifiers', () => {
  for (const value of ['0906 393 2487', '09063932487', '2349063932487', '+2349063932487', '9063932487']) {
    assert.equal(normalizeNigerianPhone(value), '+2349063932487');
  }
  for (const value of ['', '1234', '+2339063932487', '06063932487', '234906393248']) {
    assert.equal(normalizeNigerianPhone(value), null);
  }
});
test('temporary passwords meet complexity without using a shared constant', () => {
  const first = generateTemporaryPassword();
  const second = generateTemporaryPassword();
  assert.equal(passwordProblem(first), null);
  assert.equal(passwordProblem(second), null);
  assert.notEqual(first, second);
  assert.equal(first.length, 18);
});
test('new password policy rejects short and predictable passwords', () => {
  assert.match(passwordProblem('Short1!'), /12/);
  assert.match(passwordProblem('abcdefghijklmnop'), /uppercase/i);
  assert.equal(passwordProblem('Correct-Horse7!Battery'), null);
});
test('account POST origin check requires an exact same origin', () => {
  assert.equal(sameOrigin(new Request('https://school.example/api/test', { headers: { Origin: 'https://school.example' } })), true);
  assert.equal(sameOrigin(new Request('https://school.example/api/test', { headers: { Origin: 'https://evil.example' } })), false);
  assert.equal(sameOrigin(new Request('https://school.example/api/test')), false);
});
await asyncTest('admission tracking, continuation and developer APIs fail closed behind independent gates', async () => {
  const post = (path, body = {}) => new Request(`https://school.example${path}`, {
    method: 'POST', headers: { Origin: 'https://school.example', 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  const get = (path) => new Request(`https://school.example${path}`, { headers: { Origin: 'https://school.example' } });
  delete process.env.ADMISSION_TRACKING_ENABLED;
  delete process.env.DEVELOPER_CONSOLE_ENABLED;
  assert.equal((await handleAdmissionTrackingRequest(post('/api/admission/track/request', { phone: '08030000000', channel: 'sms' }))).status, 404);
  assert.equal((await handleAdmissionTrackingVerify(post('/api/admission/track/verify', { requestToken: 'x'.repeat(43), code: '123456' }))).status, 404);
  assert.equal((await handlePortalContinuation(post('/api/portal/admission-continuation', { tokens: ['x'.repeat(43)] }))).status, 404);
  assert.equal((await handleDeveloperOtp(get('/api/developer/otp'))).status, 404);
  assert.equal((await handleDeveloperConsole(get('/api/developer/console'))).status, 404);
});
await asyncTest('OTP delivery encryption round-trips only for its own challenge identifier', async () => {
  const names = ['ADMISSION_TRACKING_ENABLED','DEVELOPER_CONSOLE_ENABLED','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','ADMISSION_OTP_HASH_PEPPER','ADMISSION_OTP_ENCRYPTION_KEY'];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const savedFetch = globalThis.fetch;
  const applicantId = '12000000-0000-4000-8000-000000000002';
  const developerId = '12000000-0000-4000-8000-000000000001';
  const sessionId = '92000000-0000-4000-8000-000000000001';
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'none' })}.${encode({ sub: developerId, session_id: sessionId })}.fictional`;
  let phase = 'request';
  let challenge = null;
  try {
    process.env.ADMISSION_TRACKING_ENABLED = 'true';
    process.env.DEVELOPER_CONSOLE_ENABLED = 'true';
    process.env.SUPABASE_URL = 'https://fictional-otp.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fictional_otp';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_fictional_otp';
    process.env.ADMISSION_OTP_HASH_PEPPER = 'fictional-otp-pepper-at-least-32-characters';
    process.env.ADMISSION_OTP_ENCRYPTION_KEY = 'fictional-encryption-key-at-least-32-characters';
    globalThis.fetch = async (url, options = {}) => {
      const href = String(url);
      const method = options.method || 'GET';
      if (href.endsWith('/auth/v1/user')) return Response.json({ id: developerId, role: 'authenticated' });
      if (href.endsWith('/rest/v1/rpc/server_validate_portal_session')) return Response.json(true);
      if (href.endsWith('/rest/v1/rpc/developer_has_capability')) return Response.json(true);
      if (href.endsWith('/rest/v1/rpc/server_reveal_otp_dispatch')) {
        return Response.json([{ delivery_ciphertext: challenge.delivery_ciphertext, delivery_iv: challenge.delivery_iv, delivery_tag: challenge.delivery_tag, channel: challenge.channel }]);
      }
      if (href.includes('/rest/v1/profiles')) {
        const profile = phase === 'request'
          ? { id: applicantId, role: 'parent', parent_stage: 'applicant', active: true, account_status: 'active' }
          : { id: developerId, full_name: 'Fictional Developer', role: 'admin', active: true, account_status: 'active', must_change_password: false };
        return Response.json(phase === 'request' ? [profile] : profile);
      }
      if (href.includes('/rest/v1/admission_applications') && method === 'HEAD') {
        return new Response(null, { status: 200, headers: { 'content-range': '0-0/1' } });
      }
      if (href.includes('/rest/v1/admission_tracking_challenges') && method === 'HEAD') {
        return new Response(null, { status: 200, headers: { 'content-range': '0-0/0' } });
      }
      if (href.includes('/rest/v1/admission_tracking_challenges') && method === 'GET') return Response.json([]);
      if (href.includes('/rest/v1/admission_tracking_challenges') && method === 'PATCH') return new Response(null, { status: 204 });
      if (href.includes('/rest/v1/admission_tracking_challenges') && method === 'POST') {
        challenge = JSON.parse(String(options.body || '{}'));
        return new Response(null, { status: 201 });
      }
      if (href.includes('/rest/v1/otp_dispatch_events') && method === 'POST') return new Response(null, { status: 201 });
      return Response.json({ message: `Unexpected fictional OTP route: ${method} ${href}` }, { status: 500 });
    };
    const requestResponse = await handleAdmissionTrackingRequest(new Request('https://school.example/api/admission/track/request', {
      method: 'POST', headers: { Origin: 'https://school.example', 'Content-Type': 'application/json', 'x-forwarded-for': '192.0.2.20' },
      body: JSON.stringify({ phone: '08030000102', channel: 'sms' })
    }));
    assert.equal(requestResponse.status, 202);
    assert.ok(challenge?.id && challenge.delivery_ciphertext && challenge.delivery_iv && challenge.delivery_tag);
    assert.doesNotMatch(JSON.stringify(challenge), /08030000102|\+2348030000102/);

    phase = 'developer';
    const revealRequest = (challengeId) => new Request('https://school.example/api/developer/otp', {
      method: 'POST',
      headers: { Origin: 'https://school.example', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ challengeId, action: 'reveal' })
    });
    const revealResponse = await handleDeveloperOtp(revealRequest(challenge.id));
    assert.equal(revealResponse.status, 200);
    const revealed = await revealResponse.json();
    assert.equal(revealed.phone, '+2348030000102');
    assert.match(revealed.message, /\b\d{6}\b/);

    const otherChallenge = `${challenge.id.startsWith('f') ? 'e' : 'f'}${challenge.id.slice(1)}`;
    const tamperedResponse = await handleDeveloperOtp(revealRequest(otherChallenge));
    assert.equal(tamperedResponse.status, 503, 'ciphertext must fail authentication when rebound to another challenge');
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    globalThis.fetch = savedFetch;
  }
});
await asyncTest('developer console omits and does not query categories without their capabilities', async () => {
  const names = ['DEVELOPER_CONSOLE_ENABLED','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','SUPABASE_SECRET_KEY','ADMISSION_OTP_HASH_PEPPER','ADMISSION_OTP_ENCRYPTION_KEY'];
  const saved = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const savedFetch = globalThis.fetch;
  const developerId = '12000000-0000-4000-8000-000000000001';
  const sessionId = '92000000-0000-4000-8000-000000000001';
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'none' })}.${encode({ sub: developerId, session_id: sessionId })}.fictional`;
  let restrictedQueries = 0;
  try {
    process.env.DEVELOPER_CONSOLE_ENABLED = 'true';
    process.env.SUPABASE_URL = 'https://fictional-console.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fictional_console';
    process.env.SUPABASE_SECRET_KEY = 'sb_secret_fictional_console';
    process.env.ADMISSION_OTP_HASH_PEPPER = 'fictional-console-pepper-at-least-32-characters';
    process.env.ADMISSION_OTP_ENCRYPTION_KEY = 'fictional-console-key-at-least-32-characters';
    globalThis.fetch = async (url) => {
      const href = String(url);
      if (href.endsWith('/auth/v1/user')) return Response.json({ id: developerId, role: 'authenticated' });
      if (href.endsWith('/rest/v1/rpc/server_validate_portal_session')) return Response.json(true);
      if (href.endsWith('/rest/v1/rpc/developer_has_capability')) return Response.json(true);
      if (href.includes('/rest/v1/profiles')) return Response.json({ id: developerId, full_name: 'Fictional Developer', role: 'admin', active: true, account_status: 'active', must_change_password: false });
      if (href.includes('/rest/v1/developer_capabilities')) return Response.json({ console_access: true, otp_dispatch: false, information_review: false, system_health_read: false, granted_at: '2099-01-01T00:00:00Z' });
      if (href.includes('/rest/v1/admission_applications')) return Response.json([]);
      if (/admission_tracking_challenges|website_requests|verified_public_information/.test(href)) {
        restrictedQueries += 1;
        return Response.json({ message: 'restricted category was queried' }, { status: 500 });
      }
      return Response.json({ message: `Unexpected fictional console route: ${href}` }, { status: 500 });
    };
    const response = await handleDeveloperConsole(new Request('https://school.example/api/developer/console', {
      headers: { Origin: 'https://school.example', Authorization: `Bearer ${token}` }
    }));
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.operations.otpQueue, null);
    assert.equal(body.information, null);
    assert.equal(body.gates, null);
    assert.equal(restrictedQueries, 0);
  } finally {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
    globalThis.fetch = savedFetch;
  }
});
test('website request references and private tracking codes use non-secret and secret formats', () => {
  assert.match(generateRequestReference(new Date('2026-10-23T10:00:00Z')), /^TA-REQ-20261023-[A-HJ-NP-Z2-9]{8}$/);
  const first = generateTrackingCode();
  const second = generateTrackingCode();
  assert.match(first, /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/);
  assert.notEqual(first, second);
  assert.match(trackingHash(first), /^[a-f0-9]{64}$/);
  assert.equal(trackingHash(first).includes(first.replaceAll('-', '')), false);
});
test('pupil and second-parent credentials are distinct, random and hash-only', () => {
  const pupilCode = generatePrivateCode('TA-LINK');
  const familyCode = generatePrivateCode('TA-FAMILY');
  assert.match(pupilCode, /^TA-LINK-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/);
  assert.match(familyCode, /^TA-FAMILY-[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){2}$/);
  assert.notEqual(pupilCode, generatePrivateCode('TA-LINK'));
  assert.match(linkCodeHash(pupilCode), /^[a-f0-9]{64}$/);
  assert.equal(linkCodeHash(pupilCode).includes('TA-LINK'), false);
});

const webhookHandler = (await import('../../api/monnify-webhook.mjs')).default;
const originalFetch = globalThis.fetch;
const webhookEnvNames = [
  'MONNIFY_WEBHOOK_ENABLED', 'MONNIFY_OWNER_VERIFIED', 'MONNIFY_API_KEY',
  'MONNIFY_SECRET_KEY', 'MONNIFY_ENVIRONMENT', 'SUPABASE_URL', 'SUPABASE_SECRET_KEY'
];
const savedWebhookEnv = Object.fromEntries(webhookEnvNames.map((name) => [name, process.env[name]]));
function restoreWebhookEnvironment() {
  for (const [name, value] of Object.entries(savedWebhookEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
}

await asyncTest('disabled webhook fails closed with 404 and makes no network call', async () => {
  delete process.env.MONNIFY_WEBHOOK_ENABLED;
  delete process.env.MONNIFY_OWNER_VERIFIED;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not run'); };
  const response = await webhookHandler.fetch(new Request('https://example.test/api/monnify-webhook', { method: 'POST', body: payload, headers: { 'content-type': 'application/json' } }));
  assert.equal(response.status, 404);
  assert.equal(calls, 0);
  restoreWebhookEnvironment();
});

function enableFictionalWebhookEnvironment() {
  process.env.MONNIFY_WEBHOOK_ENABLED = 'true';
  process.env.MONNIFY_OWNER_VERIFIED = 'true';
  process.env.MONNIFY_API_KEY = 'fictional-api-key';
  process.env.MONNIFY_SECRET_KEY = secret;
  process.env.MONNIFY_ENVIRONMENT = 'sandbox';
  process.env.SUPABASE_URL = 'https://fictional-project.supabase.co';
  process.env.SUPABASE_SECRET_KEY = 'fictional-server-key';
}
function signedWebhookRequest(body = payload, receivedSignature = computeMonnifySignature(body, secret)) {
  return new Request('https://example.test/api/monnify-webhook', {
    method: 'POST',
    body,
    headers: {
      'content-type': 'application/json',
      'monnify-signature': receivedSignature,
      'x-forwarded-for': '35.242.133.146'
    }
  });
}

await asyncTest('valid webhook re-queries Monnify then calls one Supabase RPC', async () => {
  enableFictionalWebhookEnvironment();
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    if (String(url).endsWith('/api/v1/auth/login')) return Response.json({ requestSuccessful: true, responseBody: { accessToken: 'fictional-access-token', expiresIn: 60 } });
    if (String(url).includes('/api/v2/merchant/transactions/query')) return Response.json({ requestSuccessful: true, responseBody: { paymentReference: 'TA-TEST-001', transactionReference: 'MNFY|TEST|001', amountPaid: 12500, paymentStatus: 'PAID', currencyCode: 'NGN' } });
    if (String(url).includes('/rest/v1/rpc/process_monnify_payment_event')) return Response.json({ outcome: 'processed' });
    return new Response(null, { status: 500 });
  };
  const response = await webhookHandler.fetch(signedWebhookRequest());
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { received: true, outcome: 'processed' });
  assert.equal(urls.length, 3);
  assert.ok(urls[1].includes('transactionReference=MNFY%7CTEST%7C001'));
  restoreWebhookEnvironment();
});

await asyncTest('invalid signature is rejected before all upstream calls', async () => {
  enableFictionalWebhookEnvironment();
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; return new Response(null, { status: 500 }); };
  const response = await webhookHandler.fetch(signedWebhookRequest(payload, '0'.repeat(128)));
  assert.equal(response.status, 401);
  assert.equal(calls, 0);
  restoreWebhookEnvironment();
});

await asyncTest('authoritative amount mismatch fails closed before the database RPC', async () => {
  enableFictionalWebhookEnvironment();
  let rpcCalls = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith('/api/v1/auth/login')) return Response.json({ requestSuccessful: true, responseBody: { accessToken: 'fictional-access-token-2', expiresIn: 60 } });
    if (String(url).includes('/api/v2/merchant/transactions/query')) return Response.json({ requestSuccessful: true, responseBody: { paymentReference: 'TA-TEST-001', transactionReference: 'MNFY|TEST|001', amountPaid: 12499, paymentStatus: 'PAID', currencyCode: 'NGN' } });
    rpcCalls += 1;
    return Response.json({ outcome: 'processed' });
  };
  const response = await webhookHandler.fetch(signedWebhookRequest());
  assert.equal(response.status, 503);
  assert.equal(rpcCalls, 0);
  restoreWebhookEnvironment();
});

restoreWebhookEnvironment();

const portalConfigHandler = (await import('../../api/portal-config.mjs')).default;
const savedPortalEnv = {
  PORTAL_ENABLED: process.env.PORTAL_ENABLED,
  PORTAL_REGISTRATION_ENABLED: process.env.PORTAL_REGISTRATION_ENABLED,
  PORTAL_ACCOUNT_CLAIM_ENABLED: process.env.PORTAL_ACCOUNT_CLAIM_ENABLED,
  PORTAL_OFFICE_ENABLED: process.env.PORTAL_OFFICE_ENABLED,
  CMS_PORTAL_ENABLED: process.env.CMS_PORTAL_ENABLED,
  CMS_MEDIA_ENABLED: process.env.CMS_MEDIA_ENABLED,
  PUBLIC_CMS_ENABLED: process.env.PUBLIC_CMS_ENABLED,
  PUBLIC_CMS_ENGAGEMENT_ENABLED: process.env.PUBLIC_CMS_ENGAGEMENT_ENABLED,
  PUBLIC_CMS_COMMENTS_ENABLED: process.env.PUBLIC_CMS_COMMENTS_ENABLED,
  PUBLIC_CMS_PLACEMENTS_ENABLED: process.env.PUBLIC_CMS_PLACEMENTS_ENABLED,
  PUBLIC_CMS_SEARCH_ENABLED: process.env.PUBLIC_CMS_SEARCH_ENABLED,
  PUBLIC_CMS_CORE_SLOTS_ENABLED: process.env.PUBLIC_CMS_CORE_SLOTS_ENABLED,
  PUBLIC_INVENTORY_ENABLED: process.env.PUBLIC_INVENTORY_ENABLED,
  DEVELOPER_MANUAL_BOOTSTRAP_ENABLED: process.env.DEVELOPER_MANUAL_BOOTSTRAP_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY
};
function restorePortalEnvironment() {
  for (const [name, value] of Object.entries(savedPortalEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
}
await asyncTest('portal config endpoint fails closed when the activation switch is off', async () => {
  process.env.PORTAL_ENABLED = 'false';
  process.env.DEVELOPER_MANUAL_BOOTSTRAP_ENABLED = 'false';
  process.env.SUPABASE_URL = 'https://must-not-be-returned.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'must-not-be-returned';
  const response = await portalConfigHandler.fetch(new Request('https://example.test/api/portal-config'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { enabled: false, developerBootstrapEnabled: false, publicSearchEnabled: false, coreSlotsEnabled: false, publicInventoryEnabled: false });
  restorePortalEnvironment();
});
await asyncTest('portal config can expose only the temporary bootstrap gate while normal sign-in stays closed', async () => {
  process.env.PORTAL_ENABLED = 'false';
  process.env.DEVELOPER_MANUAL_BOOTSTRAP_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://must-not-be-returned.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'must-not-be-returned';
  const response = await portalConfigHandler.fetch(new Request('https://example.test/api/portal-config'));
  assert.deepEqual(await response.json(), { enabled: false, developerBootstrapEnabled: true, publicSearchEnabled: false, coreSlotsEnabled: false, publicInventoryEnabled: false });
  restorePortalEnvironment();
});
await asyncTest('enabled portal config returns only public keys and gate booleans', async () => {
  process.env.PORTAL_ENABLED = 'true';
  process.env.PORTAL_REGISTRATION_ENABLED = 'false';
  process.env.PORTAL_ACCOUNT_CLAIM_ENABLED = 'false';
  process.env.PORTAL_OFFICE_ENABLED = 'false';
  process.env.CMS_PORTAL_ENABLED = 'false';
  process.env.CMS_MEDIA_ENABLED = 'false';
  process.env.DEVELOPER_MANUAL_BOOTSTRAP_ENABLED = 'false';
  process.env.SUPABASE_URL = 'https://fictional-project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fictional';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_fictional_must-never-be-returned';
  const response = await portalConfigHandler.fetch(new Request('https://example.test/api/portal-config'));
  const body = await response.json();
  assert.deepEqual(body, { enabled: true, developerBootstrapEnabled: false, url: 'https://fictional-project.supabase.co', publishableKey: 'sb_publishable_fictional', registrationEnabled: false, accountClaimEnabled: false, officeEnabled: false, cmsEnabled: false, mediaEnabled: false, publicEngagementEnabled: false, commentsEnabled: false, placementsEnabled: false, publicSearchEnabled: false, coreSlotsEnabled: false, publicInventoryEnabled: false });
  assert.doesNotMatch(JSON.stringify(body), /secret/i);
  restorePortalEnvironment();
});
restorePortalEnvironment();

const accountEnvNames = [
  'PORTAL_ENABLED', 'PORTAL_ACCOUNTS_ENABLED', 'PORTAL_ACCOUNT_CLAIM_ENABLED',
  'PORTAL_CLAIM_HASH_PEPPER', 'PORTAL_CLAIM_OTP_ENCRYPTION_KEY',
  'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'
];
const savedAccountEnv = Object.fromEntries(accountEnvNames.map((name) => [name, process.env[name]]));
function restoreAccountEnvironment() {
  for (const [name, value] of Object.entries(savedAccountEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
}
const accountEntryHandler = (await import('../../api/account-service.mjs')).default;
await asyncTest('the consolidated account Function fails closed for every action before any network use', async () => {
  delete process.env.PORTAL_ENABLED;
  delete process.env.PORTAL_ACCOUNTS_ENABLED;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not run'); };
  for (const action of ['create', 'reset', 'status', 'guardian', 'change-password', 'claim-request', 'claim-verify', 'claim-complete']) {
    const response = await accountEntryHandler.fetch(new Request(`https://school.example/api/account-service?action=${action}`, { method: 'POST' }));
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { error: 'Not found' });
  }
  assert.equal(calls, 0);
  restoreAccountEnvironment();
});
await asyncTest('account provisioning endpoint fails closed while its activation gate is off', async () => {
  delete process.env.PORTAL_ENABLED;
  delete process.env.PORTAL_ACCOUNTS_ENABLED;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not run'); };
  const response = await handleCreateAccount(new Request('https://school.example/api/admin/accounts', {
    method: 'POST',
    headers: { Origin: 'https://school.example', 'Content-Type': 'application/json', Authorization: 'Bearer fictional' },
    body: JSON.stringify({ fullName: 'Fictional Parent', phone: '09063932487', role: 'parent' })
  }));
  assert.equal(response.status, 404);
  assert.equal(calls, 0);
  restoreAccountEnvironment();
});
await asyncTest('authorised staff provisioning creates a teacher Auth user then runs the audited profile RPC', async () => {
  process.env.PORTAL_ENABLED = 'true';
  process.env.PORTAL_ACCOUNTS_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://fictional-project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fictional';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_fictional';
  const actorId = '10000000-0000-4000-8000-000000000001';
  const accountId = '10000000-0000-4000-8000-000000000099';
  const sessionId = '90000000-0000-4000-8000-000000000001';
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const userJwt = `${encoded({ alg: 'none' })}.${encoded({ sub: actorId, session_id: sessionId })}.fictional`;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, method: options.method || 'GET', body: String(options.body || '') });
    if (href.endsWith('/auth/v1/user')) return Response.json({ id: actorId, role: 'authenticated' });
    if (href.includes('/rest/v1/profiles')) return Response.json({ id: actorId, role: 'admin', leadership_scope: 'headmistress', active: true, account_status: 'active', must_change_password: false });
    if (href.endsWith('/rest/v1/rpc/server_validate_portal_session')) return Response.json(true);
    if (href.endsWith('/auth/v1/admin/users')) return Response.json({ id: accountId, phone: '+2349063932487' });
    if (href.endsWith('/rest/v1/rpc/provision_portal_account')) return Response.json({ account_id: accountId, status: 'pending_activation' });
    return Response.json({ message: 'unexpected fictional route' }, { status: 500 });
  };
  const response = await handleCreateAccount(new Request('https://school.example/api/admin/accounts', {
    method: 'POST',
    headers: { Origin: 'https://school.example', 'Content-Type': 'application/json', Authorization: `Bearer ${userJwt}` },
    body: JSON.stringify({ fullName: 'Fictional Teacher', phone: '0906 393 2487', role: 'teacher', studentIds: [] })
  }));
  const result = await response.json();
  assert.equal(response.status, 201);
  assert.equal(result.accountId, accountId);
  assert.equal(passwordProblem(result.temporaryPassword), null);
  const createCall = calls.find((call) => call.href.endsWith('/auth/v1/admin/users'));
  assert.match(createCall.body, /"phone":"\+2349063932487"/);
  assert.match(createCall.body, /"phone_confirm":true/);
  const rpcCall = calls.find((call) => call.href.endsWith('/rest/v1/rpc/provision_portal_account'));
  assert.ok(rpcCall);
  assert.doesNotMatch(rpcCall.body, new RegExp(result.temporaryPassword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(JSON.stringify(result), /sb_secret|sb_publishable/);
  restoreAccountEnvironment();
});
await asyncTest('revoked admin session cannot call a server account endpoint with an unexpired JWT', async () => {
  process.env.PORTAL_ENABLED = 'true';
  process.env.PORTAL_ACCOUNTS_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://fictional-project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fictional';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_fictional';
  const actorId = '10000000-0000-4000-8000-000000000001';
  const sessionId = '90000000-0000-4000-8000-000000000001';
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const userJwt = `${encoded({ alg: 'none' })}.${encoded({ sub: actorId, session_id: sessionId })}.fictional`;
  let createCalls = 0;
  globalThis.fetch = async (url) => {
    const href = String(url);
    if (href.endsWith('/auth/v1/user')) return Response.json({ id: actorId, role: 'authenticated' });
    if (href.includes('/rest/v1/profiles')) return Response.json({ id: actorId, role: 'admin', leadership_scope: 'headmistress', active: true, account_status: 'active', must_change_password: false });
    if (href.endsWith('/rest/v1/rpc/server_validate_portal_session')) return Response.json(false);
    if (href.endsWith('/auth/v1/admin/users')) createCalls += 1;
    return Response.json({}, { status: 500 });
  };
  const response = await handleCreateAccount(new Request('https://school.example/api/admin/accounts', {
    method: 'POST',
    headers: { Origin: 'https://school.example', 'Content-Type': 'application/json', Authorization: `Bearer ${userJwt}` },
    body: JSON.stringify({ fullName: 'Fictional Parent', phone: '09063932487', role: 'parent' })
  }));
  assert.equal(response.status, 401);
  assert.equal(createCalls, 0);
  restoreAccountEnvironment();
});
restoreAccountEnvironment();

const requestEnvNames = ['WEBSITE_REQUESTS_ENABLED', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const savedRequestEnv = Object.fromEntries(requestEnvNames.map((name) => [name, process.env[name]]));
function restoreRequestEnvironment() {
  for (const [name, value] of Object.entries(savedRequestEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
}
await asyncTest('website Request Centre fails closed before any database call when activation is off', async () => {
  delete process.env.WEBSITE_REQUESTS_ENABLED;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not run'); };
  const request = new Request('https://school.example/api/requests', {
    method: 'POST', headers: { Origin: 'https://school.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ requestType: 'general' })
  });
  const response = await handleCreateRequest(request);
  assert.equal(response.status, 404);
  assert.equal(calls, 0);
  restoreRequestEnvironment();
});
await asyncTest('public website request returns a reference and one-time tracking code only after insert succeeds', async () => {
  process.env.WEBSITE_REQUESTS_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://fictional-project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fictional';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_fictional';
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    calls.push({ href, body: String(options.body || '') });
    if (href.endsWith('/rest/v1/rpc/create_website_request')) return Response.json({
      id: '50000000-0000-4000-8000-000000000001', request_reference: 'TA-REQ-20261023-ABCD2345', status: 'received', submitted_at: '2026-10-23T10:00:00Z'
    });
    return Response.json({ message: 'unexpected fictional route' }, { status: 500 });
  };
  const response = await handleCreateRequest(new Request('https://school.example/api/requests', {
    method: 'POST', headers: { Origin: 'https://school.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      requestType: 'fee_schedule', name: 'Fictional Requester', phone: '09063932487', email: '', classCode: 'Primary 1',
      subject: 'Fictional fee request', message: 'Please send fictional staging guidance.', website: '', startedAt: Date.now() - 3000
    })
  }));
  const body = await response.json();
  assert.equal(response.status, 201);
  assert.equal(body.reference, 'TA-REQ-20261023-ABCD2345');
  assert.match(body.trackingCode, /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/);
  const insert = calls.find((call) => call.href.endsWith('/rest/v1/rpc/create_website_request'));
  assert.ok(insert);
  assert.match(insert.body, /"p_tracking_hash":"[a-f0-9]{64}"/);
  assert.doesNotMatch(insert.body, new RegExp(body.trackingCode.replaceAll('-', '')));
  restoreRequestEnvironment();
});
await asyncTest('status lookup requires both the public reference and matching private tracking hash', async () => {
  process.env.WEBSITE_REQUESTS_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://fictional-project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fictional';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_fictional';
  const code = 'ABCD-EFGH-JKLM-2345';
  globalThis.fetch = async (url) => {
    if (String(url).includes('/rest/v1/website_requests')) return Response.json({
      request_reference: 'TA-REQ-20261023-ABCD2345', tracking_hash: trackingHash(code), request_type: 'general', status: 'under_review',
      public_note: 'Fictional public note.', submitted_at: '2026-10-23T10:00:00Z', updated_at: '2026-10-23T11:00:00Z', resolved_at: null
    });
    return Response.json({}, { status: 500 });
  };
  const matching = await handleRequestStatus(new Request('https://school.example/api/requests/status', {
    method: 'POST', headers: { Origin: 'https://school.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference: 'TA-REQ-20261023-ABCD2345', trackingCode: code })
  }));
  assert.equal(matching.status, 200);
  assert.equal((await matching.json()).status, 'under_review');
  const wrong = await handleRequestStatus(new Request('https://school.example/api/requests/status', {
    method: 'POST', headers: { Origin: 'https://school.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ reference: 'TA-REQ-20261023-ABCD2345', trackingCode: 'WXYZ-6789-NPQR-4567' })
  }));
  assert.equal(wrong.status, 404);
  restoreRequestEnvironment();
});
await asyncTest('active staff can register an off-site request with an audited source and actor', async () => {
  process.env.WEBSITE_REQUESTS_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://fictional-project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fictional';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_fictional';
  const actorId = '10000000-0000-4000-8000-000000000003';
  const sessionId = '90000000-0000-4000-8000-000000000001';
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const userJwt = `${encoded({ alg: 'none' })}.${encoded({ sub: actorId, session_id: sessionId })}.fictional`;
  let insertBody = '';
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.endsWith('/auth/v1/user')) return Response.json({ id: actorId, role: 'authenticated' });
    if (href.includes('/rest/v1/profiles')) return Response.json({ id: actorId, role: 'teacher', active: true, account_status: 'active', must_change_password: false });
    if (href.endsWith('/rest/v1/rpc/server_validate_portal_session')) return Response.json(true);
    if (href.endsWith('/rest/v1/rpc/create_website_request')) {
      insertBody = String(options.body || '');
      return Response.json({ request_reference: 'TA-REQ-20261023-WXYZ6789', status: 'received', submitted_at: '2026-10-23T12:00:00Z' });
    }
    return Response.json({ message: 'unexpected fictional route' }, { status: 500 });
  };
  const response = await handleCreateRequest(new Request('https://school.example/api/requests', {
    method: 'POST',
    headers: { Origin: 'https://school.example', 'Content-Type': 'application/json', Authorization: `Bearer ${userJwt}` },
    body: JSON.stringify({
      source: 'phone', requestType: 'general', name: 'Fictional Caller', phone: '08030000000',
      subject: 'Fictional office question', message: 'A staging-only telephone request.', website: ''
    })
  }));
  assert.equal(response.status, 201);
  assert.match(insertBody, /"p_source":"phone"/);
  assert.match(insertBody, new RegExp(`"p_registered_by":"${actorId}"`));
  restoreRequestEnvironment();
});
restoreRequestEnvironment();

const publicInformationHandler = (await import('../../api/public-information.mjs')).default;
const savedPublicInformationEnv = {
  PUBLIC_INFORMATION_ENABLED: process.env.PUBLIC_INFORMATION_ENABLED,
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY
};
function restorePublicInformationEnvironment() {
  for (const [name, value] of Object.entries(savedPublicInformationEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
}
await asyncTest('public information is independently gated and exposes only published public fields', async () => {
  delete process.env.PUBLIC_INFORMATION_ENABLED;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not run'); };
  const disabled = await publicInformationHandler.fetch(new Request('https://school.example/api/public-information'));
  assert.equal(disabled.status, 404);
  assert.equal(calls, 0);

  process.env.PUBLIC_INFORMATION_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://fictional-project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fictional';
  let query = '';
  globalThis.fetch = async (url) => {
    query = String(url);
    return Response.json([{ topic: 'calendar', title: 'Fictional calendar update', summary: 'Staging only.', detail: null, revision: 1, effective_from: null, effective_until: null, published_at: '2026-10-23T12:00:00Z' }]);
  };
  const enabled = await publicInformationHandler.fetch(new Request('https://school.example/api/public-information'));
  const body = await enabled.json();
  assert.equal(enabled.status, 200);
  assert.equal(body.items.length, 1);
  assert.match(query, /\/rest\/v1\/public_verified_information\?/);
  assert.doesNotMatch(query, /status=eq\.published|published_at=not\.is\.null/);
  assert.match(query, /select=topic%2Ctitle%2Csummary%2Cdetail%2Crevision%2Csource_path%2Ceffective_from%2Ceffective_until%2Cpublished_at%2Creviewed_at%2Cnext_review_date/);
  assert.doesNotMatch(query, /created_by|approved_by|content_hash|id%2C/);
  assert.match(enabled.headers.get('cache-control') || '', /s-maxage=300/);
  restorePublicInformationEnvironment();
});
restorePublicInformationEnvironment();

const parentEnvNames = ['PORTAL_ENABLED', 'PARENT_LINKING_ENABLED', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'];
const savedParentEnv = Object.fromEntries(parentEnvNames.map((name) => [name, process.env[name]]));
function restoreParentEnvironment() {
  for (const [name, value] of Object.entries(savedParentEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
}
function parentRequest(path, body, token) {
  return new Request(`https://school.example${path}`, {
    method: 'POST',
    headers: { Origin: 'https://school.example', 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
}
function enableParentEnvironment() {
  process.env.PORTAL_ENABLED = 'true';
  process.env.PARENT_LINKING_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://fictional-project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fictional';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_fictional';
}
await asyncTest('parent pupil-linking endpoints fail closed independently', async () => {
  process.env.PORTAL_ENABLED = 'true';
  delete process.env.PARENT_LINKING_ENABLED;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not run'); };
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encoded({ alg: 'none' })}.${encoded({ sub: '10000000-0000-4000-8000-000000000003', session_id: '90000000-0000-4000-8000-000000000003' })}.fictional`;
  const response = await handlePupilMatch(parentRequest('/api/parent/pupil-match', { classCode: 'Primary 1', registeredName: 'Fictional Pupil' }, token));
  assert.equal(response.status, 404);
  assert.equal(calls, 0);
  restoreParentEnvironment();
});
await asyncTest('active parent can privately match and redeem a one-time pupil code', async () => {
  enableParentEnvironment();
  const actorId = '10000000-0000-4000-8000-000000000003';
  const sessionId = '90000000-0000-4000-8000-000000000003';
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encoded({ alg: 'none' })}.${encoded({ sub: actorId, session_id: sessionId })}.fictional`;
  const rpcBodies = [];
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url); const body = String(options.body || '');
    if (href.endsWith('/auth/v1/user')) return Response.json({ id: actorId, role: 'authenticated' });
    if (href.includes('/rest/v1/profiles')) return Response.json({ id: actorId, role: 'parent', leadership_scope: 'none', phone_e164: '+2348000000003', active: true, account_status: 'active', must_change_password: false });
    if (href.endsWith('/rest/v1/rpc/server_validate_portal_session')) return Response.json(true);
    if (href.includes('/rest/v1/rpc/')) rpcBodies.push({ href, body });
    if (href.endsWith('/rest/v1/rpc/server_parent_match_pupil')) return Response.json({ matched: true });
    if (href.endsWith('/rest/v1/rpc/server_redeem_pupil_link_code')) return Response.json({ linked: true, already_linked: false });
    return Response.json({}, { status: 500 });
  };
  const matched = await handlePupilMatch(parentRequest('/api/parent/pupil-match', { classCode: 'Primary 1', registeredName: 'Fictional Pupil' }, token));
  assert.equal(matched.status, 200);
  assert.equal((await matched.json()).matched, true);
  const rawCode = 'TA-LINK-ABCD-EFGH-JKLM';
  const linked = await handlePupilLink(parentRequest('/api/parent/pupil-link', { classCode: 'Primary 1', registeredName: 'Fictional Pupil', code: rawCode }, token));
  assert.equal(linked.status, 200);
  const redemption = rpcBodies.find((call) => call.href.endsWith('/server_redeem_pupil_link_code'));
  assert.ok(redemption);
  assert.match(redemption.body, new RegExp(`"p_code_hash":"${linkCodeHash(rawCode)}"`));
  assert.doesNotMatch(redemption.body, /TA-LINK-ABCD/);
  restoreParentEnvironment();
});
await asyncTest('second-parent invitation is phone-bound and raw codes never reach storage RPCs', async () => {
  enableParentEnvironment();
  const actorId = '10000000-0000-4000-8000-000000000003';
  const sessionId = '90000000-0000-4000-8000-000000000003';
  const studentId = '20000000-0000-4000-8000-000000000001';
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encoded({ alg: 'none' })}.${encoded({ sub: actorId, session_id: sessionId })}.fictional`;
  let invitationRpcBody = '';
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.endsWith('/auth/v1/user')) return Response.json({ id: actorId, role: 'authenticated' });
    if (href.includes('/rest/v1/profiles')) return Response.json({ id: actorId, role: 'parent', leadership_scope: 'none', phone_e164: '+2348000000003', active: true, account_status: 'active', must_change_password: false });
    if (href.endsWith('/rest/v1/rpc/server_validate_portal_session')) return Response.json(true);
    if (href.endsWith('/rest/v1/rpc/server_create_second_guardian_invitation')) {
      invitationRpcBody = String(options.body || '');
      return Response.json({ invitation_id: '70000000-0000-4000-8000-000000000001', expires_at: '2026-10-25T12:00:00Z' });
    }
    if (href.endsWith('/rest/v1/rpc/server_redeem_second_guardian_invitation')) return Response.json({ linked: true, already_linked: false });
    return Response.json({}, { status: 500 });
  };
  const invitation = await handleSecondInvitation(parentRequest('/api/parent/second-invitation', { studentId, phone: '08030000004' }, token));
  assert.equal(invitation.status, 201);
  const invitationBody = await invitation.json();
  assert.match(invitationBody.invitationCode, /^TA-FAMILY-/);
  assert.match(invitationRpcBody, /"p_intended_phone_e164":"\+2348030000004"/);
  assert.doesNotMatch(invitationRpcBody, /TA-FAMILY-/);
  const redeemed = await handleSecondRedemption(parentRequest('/api/parent/second-redemption', { code: invitationBody.invitationCode }, token));
  assert.equal(redeemed.status, 200);
  restoreParentEnvironment();
});
await asyncTest('only Headmistress endpoint issues a pupil code and stores its hash', async () => {
  enableParentEnvironment();
  const actorId = '10000000-0000-4000-8000-000000000001';
  const sessionId = '90000000-0000-4000-8000-000000000001';
  const studentId = '20000000-0000-4000-8000-000000000001';
  const encoded = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encoded({ alg: 'none' })}.${encoded({ sub: actorId, session_id: sessionId })}.fictional`;
  let issueRpcBody = '';
  globalThis.fetch = async (url, options = {}) => {
    const href = String(url);
    if (href.endsWith('/auth/v1/user')) return Response.json({ id: actorId, role: 'authenticated' });
    if (href.includes('/rest/v1/profiles')) return Response.json({ id: actorId, role: 'admin', leadership_scope: 'headmistress', phone_e164: '+2348000000001', active: true, account_status: 'active', must_change_password: false });
    if (href.endsWith('/rest/v1/rpc/server_validate_portal_session')) return Response.json(true);
    if (href.endsWith('/rest/v1/rpc/server_issue_pupil_link_code')) {
      issueRpcBody = String(options.body || '');
      return Response.json({ code_id: '70000000-0000-4000-8000-000000000002', expires_at: '2026-11-22T12:00:00Z' });
    }
    return Response.json({}, { status: 500 });
  };
  const response = await handleIssuePupilCode(parentRequest('/api/admin/pupil-link-code', { studentId }, token));
  assert.equal(response.status, 201);
  const body = await response.json();
  assert.match(body.linkingCode, /^TA-LINK-/);
  assert.match(issueRpcBody, /"p_code_hash":"[a-f0-9]{64}"/);
  assert.doesNotMatch(issueRpcBody, /TA-LINK-/);
  restoreParentEnvironment();
});
restoreParentEnvironment();

const [migration, accountMigration, operationsMigration, parentMigration, enrolmentMigration, financeMigration, admissionTrackingMigration, continuityMigration, bootstrapMigration, bootstrapHttpMigration, bootstrapCorrectionMigration, cmsFoundationMigration, cloudinaryMediaMigration, publicContentDeliveryMigration, publicEngagementMigration, verifiedContentMigration, cleanRoutesMigration, currentResultsMigration, rootSchema, legacyInventory, legacyRetirement, webhook, monnify, accountServer, accountClaimServer, otpRelayServer, requestServer, parentLinkServer, admissionTrackingServer, developerConsoleServer, requestApi, requestStatusApi, publicInfoApi, requestPage, requestScript, verifiedInfoScript, verifiedAnswerEngine, workflowBuilder, configApi, portalSource, portalHtml, portalCss, uxCss, developerHtml, developerOperationsHtml, developerSource, admissionPage, admissionScript, serviceWorker, vercel, pkg] = await Promise.all([
  read('supabase/migrations/202610230001_secure_school_portal.sql'),
  read('supabase/migrations/202610230002_portal_accounts.sql'),
  read('supabase/migrations/202610230003_staff_operations_and_requests.sql'),
  read('supabase/migrations/202610230004_parent_pupil_linking.sql'),
  read('supabase/migrations/202610230005_self_registration_enrolment_and_graduates.sql'),
  read('supabase/migrations/202610230006_fees_shop_transport_and_manual_payments.sql'),
  read('supabase/migrations/202610240001_admission_tracking_developer_operations_and_answers.sql'),
  read('supabase/migrations/202610240002_staff_continuity_accelerated_progression_and_account_claims.sql'),
  read('supabase/migrations/20261025000100_owner_authorised_developer_bootstrap.sql'),
  read('supabase/migrations/20261025000200_developer_bootstrap_http_controls.sql'),
  read('supabase/migrations/20261026040507_fix_owner_bootstrap_pgcrypto_schema.sql'),
  read('supabase/migrations/20261026060000_public_cms_foundation.sql'),
  read('supabase/migrations/20261026070000_cloudinary_media_governance.sql'),
  read('supabase/migrations/20261027080000_public_content_delivery.sql'),
  read('supabase/migrations/20261027090000_public_engagement_and_placements.sql'),
  read('supabase/migrations/20261027100000_verified_content_search_and_inventory.sql'),
  read('supabase/migrations/20261027110000_clean_routes_and_discovery_quality.sql'),
  read('supabase/migrations/20261027130000_current_classes_and_flexible_results.sql'),
  read('supabase-schema.sql'),
  read('supabase/manual/00_read_only_legacy_portal_inventory.sql'),
  read('supabase/manual/99_retire_legacy_school_data_after_verified_cutover.sql'),
  read('api/monnify-webhook.mjs'),
  read('server/monnify.mjs'),
  read('server/accounts.mjs'),
  read('server/account-claims.mjs'),
  read('server/otp-relay.mjs'),
  read('server/requests.mjs'),
  read('server/parent-links.mjs'),
  read('server/admission-tracking.mjs'),
  read('server/developer-console.mjs'),
  read('api/website-request-service.mjs'),
  read('api/website-request-service.mjs'),
  read('api/public-information.mjs'),
  read('request-centre.html'),
  read('assets/js/request-centre.js'),
  read('assets/js/verified-public-information.js'),
  read('assets/js/verified-answer-engine.js'),
  read('tools/build-request-workflows.py'),
  read('api/portal-config.mjs'),
  read('assets/js/portal-source.js'),
  read('portal/login.html'),
  read('assets/css/portal.css'),
  read('assets/css/ux.css'),
  read('developer.html'),
  read('developer-operations.html'),
  read('assets/js/developer-console-source.js'),
  read('admissions.html'),
  read('assets/js/admission-tracking.js'),
  read('sw.js'),
  read('vercel.json'),
  read('package.json')
]);
const [developerBootstrapServer, developerServiceApi, envExample] = await Promise.all([
  read('server/developer-bootstrap.mjs'),
  read('api/developer-service.mjs'),
  read('.env.example')
]);

test('all eight portal/audit tables explicitly enable RLS', () => {
  for (const table of ['profiles', 'students', 'teacher_class_assignments', 'grades', 'payments', 'webhook_events', 'payment_audit_log', 'admission_audit_log']) {
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
});
test('account, caregiver and legacy-mapping tables explicitly enable RLS', () => {
  for (const table of ['student_guardians', 'account_audit_log', 'legacy_account_mappings']) {
    assert.match(accountMigration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(accountMigration, /revoke all on table public\.student_guardians[\s\S]+from anon, authenticated/i);
});
test('operations migration enables RLS for daily work, requests and verified publications', () => {
  for (const table of ['result_review_events', 'attendance_sessions', 'attendance_entries', 'homework_assignments', 'website_requests', 'website_request_events', 'verified_public_information', 'public_information_events', 'staff_notices', 'duty_roster_entries', 'leadership_section_records', 'leadership_section_events']) {
    assert.match(operationsMigration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.doesNotMatch(operationsMigration, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);
  assert.doesNotMatch(operationsMigration, /(?:drop|truncate|alter|delete from)\s+(?:table\s+)?public\.school_data/i);
});
test('parent-linking migration uses hash-only credentials, two-guardian enforcement and separate admissions', () => {
  for (const table of ['pupil_link_codes', 'guardian_invitations', 'pupil_link_attempts', 'pupil_link_events', 'admission_applications', 'admission_application_events']) {
    assert.match(parentMigration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(parentMigration, /code_hash text not null unique check \(code_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/i);
  assert.doesNotMatch(parentMigration, /linking_code\s+text|invitation_code\s+text|plain(?:text)?_code/i);
  assert.match(parentMigration, /create trigger student_guardians_limit_two/i);
  assert.match(parentMigration, /count\(\*\)[\s\S]+>= 2[\s\S]+at most two active parent or guardian accounts/i);
  assert.match(parentMigration, /server_redeem_pupil_link_code[\s\S]+status = 'consumed'/i);
  assert.match(parentMigration, /server_redeem_second_guardian_invitation[\s\S]+intended_phone_e164/i);
  assert.match(parentMigration, /grant execute on function public\.server_redeem_pupil_link_code[\s\S]+to service_role/i);
  assert.match(parentMigration, /create table if not exists public\.admission_applications/i);
  assert.match(parentMigration, /Payment can never approve admission|kept separate from active pupils, payments/i);
  assert.doesNotMatch(parentMigration, /(?:drop|truncate|delete from)\s+(?:table\s+)?public\.school_data/i);
  assert.match(parentLinkServer, /PARENT_LINKING_ENABLED !== 'true'/);
  assert.match(parentLinkServer, /linkCodeHash\(code\)/);
});
test('self-registration, permanent enrolment and graduation migration enforces the approved progression', () => {
  assert.match(enrolmentMigration, /\('Primary 4',\s*80,\s*'Primary 6'/i);
  assert.match(enrolmentMigration, /\('Primary 6',\s*90,\s*'Graduate Hall'/i);
  assert.doesNotMatch(enrolmentMigration, /\('Primary 5',/i);
  assert.match(enrolmentMigration, /create or replace function public\.prepare_promotion_batch/i);
  assert.match(enrolmentMigration, /create or replace function public\.apply_promotion_batch/i);
  assert.match(enrolmentMigration, /create or replace function public\.cancel_promotion_batch/i);
  assert.match(enrolmentMigration, /create or replace function public\.parent_graduates/i);
  assert.match(enrolmentMigration, /create or replace function public\.list_public_graduates/i);
  assert.match(enrolmentMigration, /public_status = 'approved'/i);
});
test('parent pupil and applicant reads use fixed-column projections without birthday or reviewer fields', () => {
  const pupilProjection = enrolmentMigration.match(/create or replace function public\.parent_portal_students[\s\S]+?\n\$\$;/i)?.[0] || '';
  const applicantProjection = enrolmentMigration.match(/create or replace function public\.parent_admission_applications[\s\S]+?\n\$\$;/i)?.[0] || '';
  assert.match(pupilProjection, /admission_number text,full_name text,class_code text/i);
  assert.doesNotMatch(pupilProjection, /date_of_birth|parent_id|recorded_by/i);
  assert.doesNotMatch(applicantProjection, /decided_by|parent_id text/i);
  assert.match(accountMigration, /create policy students_select[\s\S]+teacher_class_assignments/i);
  assert.doesNotMatch(accountMigration.match(/create policy students_select[\s\S]+?;\n/i)?.[0] || '', /parent_can_access_student/i);
});
test('fees, materials, transport and manual payments are transaction-controlled and audited', () => {
  for (const fn of ['create_invoices_for_fee_schedule', 'place_shop_order', 'advance_shop_order', 'complete_return_exchange', 'create_procurement_batch', 'receive_procurement_line', 'open_stocktake', 'close_stocktake', 'review_transport_request', 'cancel_transport_approval', 'review_manual_payment', 'set_catalog_variant_active']) {
    assert.match(financeMigration, new RegExp(`create or replace function public\\.${fn}\\s*\\(`, 'i'));
  }
  assert.match(financeMigration, /method text not null check \(method in \('bank_transfer', 'physical_pos'\)\)/i);
  assert.match(financeMigration, /Only the Headmistress may reverse a verified payment/i);
  assert.match(financeMigration, /inventory_movements_immutable/i);
  assert.match(financeMigration, /one_open_stocktake/i);
  assert.match(financeMigration, /Published fee schedule details are immutable/i);
  assert.match(financeMigration, /grant insert\(session_name,term_name,class_code,title,due_date\) on public\.fee_schedules/i);
  assert.doesNotMatch(financeMigration, /grant\s+(?:insert,\s*)?update\s+on public\.fee_schedules/i);
});
test('parent finance and catalogue views are fixed-column projections and base writes remain unavailable', () => {
  for (const fn of ['parent_shop_products', 'parent_shop_variants', 'parent_transport_services', 'parent_manual_payments', 'parent_payment_receipts']) {
    assert.match(financeMigration, new RegExp(`create or replace function public\\.${fn}\\s*\\(`, 'i'));
    assert.match(portalSource, new RegExp(`rpcCall\\('${fn}'`, 'i'));
  }
  assert.match(financeMigration, /create policy manual_payments_select[\s\S]+using \(\(select public\.is_admin\(\)\)\)/i);
  assert.match(financeMigration, /create policy receipts_select[\s\S]+using \(\(select public\.is_admin\(\)\)\)/i);
  assert.doesNotMatch(financeMigration, /grant insert[\s\S]{0,100}public\.(?:manual_payments|payment_receipts|inventory_movements|shop_orders)/i);
});
test('office UI calls every privileged programme RPC and keeps payment methods manual', () => {
  for (const fn of ['create_invoices_for_fee_schedule', 'cancel_pupil_invoice', 'record_physical_pos_payment', 'review_manual_payment', 'place_shop_order', 'cancel_shop_order', 'advance_shop_order', 'request_return_exchange', 'complete_return_exchange', 'request_transport', 'review_transport_request', 'cancel_transport_approval', 'create_procurement_batch', 'receive_procurement_line', 'open_stocktake', 'close_stocktake', 'set_catalog_variant_active']) {
    assert.match(portalSource, new RegExp(`rpcCall\\('${fn}'`, 'i'));
  }
  assert.match(portalSource, /manual bank[- ]transfer/i);
  assert.match(portalSource, /physical (?:school-)?office POS/i);
  assert.doesNotMatch(portalSource, /checkout\.monnify|MonnifySDK|name:\s*['"](?:card|cvv|pin|otp)/i);
});
test('leadership capability is independent, account management is Headmistress-only and both admins retain operational authority', () => {
  assert.match(operationsMigration, /create type public\.leadership_scope as enum \('none', 'assistant_headmistress', 'headmistress'\)/i);
  assert.match(operationsMigration, /server_actor_can_manage_accounts[\s\S]+server_actor_is_headmistress/i);
  assert.match(operationsMigration, /create or replace function public\.server_actor_is_admin[\s\S]+server_actor_can_manage_accounts/i);
  assert.match(operationsMigration, /assignments_insert[\s\S]+is_headmistress/i);
  assert.match(operationsMigration, /verified_public_information_admin_insert[\s\S]+is_admin/i);
  assert.match(accountServer, /profile\.leadership_scope === 'headmistress'/);
});
test('class-wide flexible assessment, score limits, review and publication are database-enforced', () => {
  assert.match(operationsMigration, /add column if not exists ca1 numeric\(5,2\)/i);
  assert.match(operationsMigration, /add column if not exists ca2 numeric\(5,2\)/i);
  assert.match(currentResultsMigration, /add column if not exists ca3 numeric\(5,2\)/i);
  assert.match(currentResultsMigration, /create table if not exists public\.class_term_assessment_plans/i);
  assert.match(currentResultsMigration, /pre_nursery_exam_100[\s\S]+three_entry_15_15_70[\s\S]+four_entry_10_10_10_70/i);
  assert.match(currentResultsMigration, /Pre-Nursery accepts Examination 0-100 and no CA scores/i);
  assert.match(currentResultsMigration, /Three-entry scores must be CA1 0-15, CA2 0-15 and Examination 0-70/i);
  assert.match(currentResultsMigration, /Four-entry scores must be CA1 0-10, CA2 0-10, CA3 0-10 and Examination 0-70/i);
  assert.match(currentResultsMigration, /A term assessment plan cannot change after score entry begins/i);
  assert.match(operationsMigration, /Only the Headmistress may publish or lock results/i);
  assert.match(operationsMigration, /cannot review or alter their own submitted result entry/i);
  assert.match(operationsMigration, /Only approved results may be published/i);
  assert.match(operationsMigration, /Result workflow timestamps and actors are managed by the database/i);
  assert.match(operationsMigration, /Result entry identity and ownership are immutable/i);
  assert.match(operationsMigration, /Locked results are immutable/i);
  assert.match(operationsMigration, /insert into public\.result_review_events/i);
});
test('website requests retain only a tracking hash and sensitive queues are Headmistress-only', () => {
  assert.match(operationsMigration, /tracking_hash text not null check \(tracking_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/i);
  assert.doesNotMatch(operationsMigration, /tracking_code\s+text|tracking_secret\s+text/i);
  assert.match(operationsMigration, /new\.sensitive := new\.request_type in/i);
  assert.match(operationsMigration, /public\.is_headmistress\(\) or \(\(select public\.is_admin\(\)\) and r\.sensitive = false\)/i);
  assert.match(operationsMigration, /create or replace function public\.create_website_request/i);
  assert.match(operationsMigration, /pg_advisory_xact_lock/i);
  assert.match(operationsMigration, /submitted_at >= now\(\) - interval '24 hours'/i);
  assert.match(requestServer, /timingSafeEqual/);
  assert.match(requestServer, /trackingHash\(trackingCode\)/);
  assert.doesNotMatch(requestServer, /localStorage|sessionStorage/);
});
test('account state and forced password change are independent from payment and admission', () => {
  assert.match(accountMigration, /create type public\.portal_account_status as enum/i);
  assert.match(accountMigration, /add column if not exists must_change_password boolean not null default true/i);
  assert.match(accountMigration, /portal_account_can_access[\s\S]+account_status = 'active'/i);
  assert.match(accountMigration, /portal_account_can_access[\s\S]+must_change_password = false/i);
  assert.match(accountMigration, /portal_session_is_current[\s\S]+from auth\.sessions/i);
  const changeFunction = accountMigration.match(/create or replace function public\.complete_portal_password_change[\s\S]+?\n\$\$;/i)?.[0] || '';
  assert.doesNotMatch(changeFunction, /payments|admission_status/i);
});
test('account provisioning/reset RPCs are service-role-only and audit without passwords', () => {
  assert.match(accountMigration, /grant execute on function public\.provision_portal_account[\s\S]+to service_role/i);
  assert.match(accountMigration, /grant execute on function public\.begin_portal_password_reset[\s\S]+to service_role/i);
  assert.match(accountMigration, /delete from auth\.sessions where user_id = p_account_id/i);
  assert.match(accountMigration, /password_reset_started/i);
  assert.doesNotMatch(accountMigration, /insert into public\.account_audit_log[\s\S]{0,400}(?:password_hash|temporary_password|plaintext_pin)/i);
});
test('anonymous table grants are revoked and no allow-all policy remains', () => {
  assert.match(migration, /revoke all on table[\s\S]+from anon;/i);
  assert.doesNotMatch(migration, /using\s*\(\s*true\s*\)|with check\s*\(\s*true\s*\)/i);
});
test('parent policies require an active office-verified caregiver relationship', () => {
  assert.match(accountMigration, /create table if not exists public\.student_guardians/i);
  assert.match(accountMigration, /g\.parent_id = \(select auth\.uid\(\)\)/i);
  assert.match(accountMigration, /g\.active = true/i);
  assert.match(accountMigration, /g\.verified_by is not null/i);
  assert.match(accountMigration, /published_at is not null[\s\S]+parent_can_access_student\(student_id\)/i);
  assert.doesNotMatch(accountMigration, /parent_id\s*=\s*\(select auth\.uid\(\)\)[\s\S]{0,120}published_at/i);
});
test('teacher grade writes require a matching active class/subject assignment', () => {
  assert.match(migration, /teacher_can_manage_grade\(student_id, subject\)/i);
  assert.match(migration, /a\.teacher_id = \(select auth\.uid\(\)\)/i);
  assert.match(migration, /a\.subject = '\*' or lower\(a\.subject\) = lower\(p_subject\)/i);
});
test('role escalation has a database trigger guard and new users default to parent', () => {
  assert.match(migration, /Only an administrator may change portal roles or account status/i);
  assert.match(migration, /Never trust user metadata to assign teacher\/admin/i);
  assert.match(migration, /'parent'::public\.app_role/i);
});
test('admission tracking schema is service-only, rate-limited and one-time revealable', () => {
  for (const table of ['developer_capabilities', 'admission_tracking_challenges', 'admission_tracking_continuations', 'otp_dispatch_events']) {
    assert.match(admissionTrackingMigration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(admissionTrackingMigration, /revoke all on table public\.developer_capabilities[\s\S]+from public,anon,authenticated/i);
  assert.match(admissionTrackingMigration, /admission_tracking_one_active_phone_purpose_idx[\s\S]+where status in \('queued','revealed','sent'\)/i);
  assert.match(admissionTrackingMigration, /server_reveal_otp_dispatch[\s\S]+for update[\s\S]+delivery_ciphertext=null,delivery_iv=null,delivery_tag=null/i);
  assert.match(admissionTrackingMigration, /attempt_count>=5/i);
  assert.match(admissionTrackingMigration, /expires_at<=now\(\)/i);
  assert.match(admissionTrackingMigration, /submission_source='legacy_preserved'/i);
  assert.doesNotMatch(admissionTrackingMigration, /set linked_at\s*=\s*coalesce\(linked_at,\s*decided_at/i);
  assert.match(admissionTrackingMigration, /not \(detail \?\| array\['otp','code','phone','message'\]\)/i);
});
test('lightweight admission projection never reads existing pupil or guardian records', () => {
  const projection = admissionTrackingMigration.match(/create or replace function public\.server_active_admission_applications[\s\S]+?\n\$\$;/i)?.[0] || '';
  assert.match(projection, /from public\.admission_applications/i);
  assert.match(projection, /a\.student_id is null/i);
  assert.doesNotMatch(projection, /public\.(students|student_guardians|grades|payments)/i);
  assert.doesNotMatch(admissionTrackingServer, /\.from\(['"](?:students|student_guardians|grades|payments|pupil_invoices)['"]\)/i);
});
test('manual OTP implementation is WhatsApp-or-SMS only with encrypted payloads and code-free audit', () => {
  assert.match(admissionTrackingServer, /new Set\(\['whatsapp', 'sms'\]\)/);
  assert.match(admissionTrackingServer, /createCipheriv\('aes-256-gcm'/);
  assert.match(admissionTrackingServer, /setAAD\(Buffer\.from\(`admission-tracking:\$\{challengeId\}`/);
  assert.match(admissionTrackingServer, /encryptDelivery\(config, \{ phone, message \}, challengeId\)/);
  assert.match(admissionTrackingServer, /decryptDelivery\(config, data\[0\], challengeId\)/);
  assert.match(admissionTrackingServer, /createHmac\('sha256'/);
  assert.match(admissionTrackingServer, /Date\.now\(\) \+ 5 \* 60 \* 1000/);
  assert.match(admissionTrackingServer, /Number\(phoneRate\.count \|\| 0\) >= 3/);
  assert.match(admissionTrackingServer, /Number\(networkRate\.count \|\| 0\) >= 20/);
  assert.doesNotMatch(`${admissionTrackingServer}\n${admissionPage}\n${admissionScript}`, /\b(?:SNS|AWS)\b/);
  assert.match(admissionScript, /whatsappConfirmed/);
  assert.match(developerSource, /Overwrite clipboard/);
  assert.match(developerSource, /clearAfterSeconds/);
});
test('owner-approved account claims are hash/encryption protected and create no password in SQL', () => {
  for (const table of ['portal_account_claims', 'portal_account_claim_challenges', 'portal_account_claim_events']) {
    assert.match(continuityMigration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(continuityMigration, /revoke all on table public\.portal_account_claims,public\.portal_account_claim_challenges,public\.portal_account_claim_events from public,anon,authenticated/i);
  assert.match(continuityMigration, /server_verify_portal_account_claim[\s\S]+attempt_count\+1>=5/i);
  assert.match(continuityMigration, /server_complete_portal_account_claim[\s\S]+setup_token_hash=p_setup_token_hash[\s\S]+status='verified'/i);
  assert.match(accountClaimServer, /createCipheriv\('aes-256-gcm'/);
  assert.match(accountClaimServer, /portal-account-claim:\$\{challengeId\}/);
  assert.match(accountClaimServer, /passwordProblem\(password\)/);
  assert.match(accountClaimServer, /auth\.admin\.createUser/);
  assert.doesNotMatch(continuityMigration, /password\s+(?:text|varchar)|temporary_password/i);
  assert.match(portalSource, /Claim your school account/i);
  assert.match(portalSource, /\/api\/account\/claim\/request/);
});
test('owner-authorised developer bootstrap is one-use, code-free and independent from school authority', () => {
  for (const table of ['developer_bootstrap_authorisations', 'developer_bootstrap_events']) {
    assert.match(bootstrapMigration, new RegExp(`alter table public\\.${table} enable row level security`, 'i'));
  }
  assert.match(bootstrapMigration, /authorisation_hash text unique check \(authorisation_hash is null or authorisation_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/i);
  assert.match(bootstrapMigration, /status in \('active','reserved','consumed','revoked','expired','locked'\)/i);
  assert.match(bootstrapMigration, /expires_at > issued_at and expires_at <= issued_at \+ interval '30 minutes'/i);
  assert.match(bootstrapMigration, /revoke all on table public\.developer_bootstrap_authorisations[\s\S]+from public,anon,authenticated,service_role/i);
  assert.match(bootstrapMigration, /owner_issue_developer_bootstrap[\s\S]+session_user not in \('postgres','supabase_admin'\)[\s\S]+auth\.role\(\)[\s\S]+='service_role'/i);
  assert.match(bootstrapMigration, /gen_random_bytes\(32\)[\s\S]+digest\(convert_to\(v_raw,'UTF8'\),'sha256'\)/i);
  assert.match(bootstrapMigration, /server_reserve_developer_bootstrap[\s\S]+for update[\s\S]+status='reserved'/i);
  assert.match(bootstrapMigration, /server_complete_developer_bootstrap[\s\S]+role='parent'[\s\S]+leadership_scope='none'[\s\S]+phone_verified_at=null/i);
  assert.match(bootstrapMigration, /owner_authorised_supabase_bootstrap/i);
  assert.match(bootstrapMigration, /detail::text !~\* '[^']*password[^']*credential/i);
  assert.match(bootstrapHttpMigration, /alter table public\.developer_bootstrap_http_limits enable row level security/i);
  assert.match(bootstrapHttpMigration, /revoke all on table public\.developer_bootstrap_http_limits[\s\S]+from public,anon,authenticated,service_role/i);
  assert.match(bootstrapHttpMigration, /v_limit := case when p_scope='network' then 10 else 5 end/i);
  assert.match(bootstrapHttpMigration, /last_attempt_at < now\(\)-interval '2 days'/i);
  assert.match(bootstrapHttpMigration, /server_complete_developer_password_recovery[\s\S]+delete from auth\.sessions where user_id=p_user_id/i);
  assert.doesNotMatch(bootstrapMigration, /password\s+(?:text|varchar)|readable_password|temporary_password/i);
  assert.doesNotMatch(bootstrapMigration, /(?:drop|truncate|delete from|update)\s+(?:table\s+)?public\.school_data/i);
});
test('teacher continuity and exceptional progression require independent full-authority approval', () => {
  assert.match(continuityMigration, /create table if not exists public\.staff_assignment_changes/i);
  assert.match(continuityMigration, /v_change\.recommended_by=v_actor[\s\S]+Independent recommendation and approval are required/i);
  assert.match(continuityMigration, /A move keeps the same teacher; use replace for another teacher/i);
  assert.match(continuityMigration, /'accelerated_promoted'/i);
  assert.match(continuityMigration, /early_secondary_transition/i);
  assert.match(continuityMigration, /completion_type in \('standard_primary6','accelerated_secondary_transition'\)/i);
  assert.match(continuityMigration, /Common Entrance candidacy is independent from class placement/i);
  assert.match(continuityMigration, /exceptional_status<>'approved'/i);
  assert.match(continuityMigration, /create or replace function public\.is_designated_headmistress/i);
  assert.match(continuityMigration, /not public\.is_designated_headmistress\(\)[\s\S]+Only the Headmistress may reverse a verified payment/i);
  assert.match(portalSource, /No invented Primary 6 history/i);
});
test('Paragon relay is server-to-server, signed, gated and excludes school records', () => {
  assert.match(otpRelayServer, /PARAGON_OTP_RELAY_ENABLED/);
  assert.match(otpRelayServer, /createPrivateKey/);
  assert.match(otpRelayServer, /asymmetricKeyType !== 'ed25519'/);
  assert.match(otpRelayServer, /sign\(null,/);
  assert.match(otpRelayServer, /X-Paragon-Signature/);
  assert.match(otpRelayServer, /ed25519=/);
  assert.match(otpRelayServer, /recipientPhone/);
  assert.match(otpRelayServer, /authenticationCode/);
  assert.doesNotMatch(otpRelayServer, /pupil|student|classCode|payment|supabase/i);
  assert.match(admissionTrackingServer, /dispatchOtpRelay\(\{ challengeId, phone, code, expiresInSeconds: 300 \}\)/);
  assert.match(accountClaimServer, /dispatchOtpRelay\(\{ challengeId, phone, code, expiresInSeconds: 300 \}\)/);
  assert.doesNotMatch(otpRelayServer, /\bpurpose\b/i);
});
test('opaque admission continuation is session-only, URL-free and account-bound after portal login', () => {
  assert.match(admissionTrackingMigration, /token_hash text not null unique/);
  assert.match(admissionTrackingServer, /eq\('token_hash', tokenHash\)\.eq\('account_id', auth\.user\.id\)/);
  assert.match(admissionScript, /sessionStorage\.setItem\('taa_admission_continuations'/);
  assert.match(portalSource, /sessionStorage\.getItem\('taa_admission_continuations'/);
  assert.match(portalSource, /\/api\/portal\/admission-continuation/);
  assert.doesNotMatch(admissionScript, /portal\/login\.html\?/);
  assert.match(admissionPage, /never shows existing linked pupils/i);
});
test('developer capability is independent and operations page is retired without weakening encrypted Review', () => {
  assert.match(admissionTrackingMigration, /create table if not exists public\.developer_capabilities/i);
  assert.match(admissionTrackingMigration, /developer_has_capability/i);
  assert.match(developerConsoleServer, /authenticateDeveloper\(request, 'console'\)/);
  assert.match(developerConsoleServer, /capabilities\.otp_dispatch\s*\?\s*auth\.adminClient\.from\('admission_tracking_challenges'\)/);
  assert.match(developerConsoleServer, /capabilities\.information_review\s*\?\s*auth\.adminClient\.from\('website_requests'\)/);
  assert.match(developerConsoleServer, /const gates = capabilities\.system_health_read \?/);
  assert.match(developerConsoleServer, /monnifyWebhook: enabled\('MONNIFY_WEBHOOK_ENABLED'\) && enabled\('MONNIFY_OWNER_VERIFIED'\)/);
  assert.doesNotMatch(developerConsoleServer, /MONNIFY_ENABLED/);
  assert.match(developerSource, /No data from this category was queried or returned/);
  assert.match(developerHtml, /developer-console\.js/);
  assert.match(developerHtml, /developer-review\.html/);
  assert.match(developerOperationsHtml, /developer\.html#overview/);
  assert.doesNotMatch(developerHtml, /review-gateway\.enc\.json|review passphrase|forgot/i);
});
test('owner-authorised developer password setup is gated, same-origin and trusted-server-only', () => {
  assert.match(envExample, /^DEVELOPER_MANUAL_BOOTSTRAP_ENABLED=false$/m);
  assert.match(envExample, /^DEVELOPER_BOOTSTRAP_RATE_LIMIT_PEPPER=$/m);
  assert.match(developerBootstrapServer, /DEVELOPER_MANUAL_BOOTSTRAP_ENABLED === 'true'/);
  assert.match(developerBootstrapServer, /DEVELOPER_BOOTSTRAP_RATE_LIMIT_PEPPER/);
  assert.match(developerBootstrapServer, /createHmac\('sha256', pepper\)/);
  assert.match(developerBootstrapServer, /server_take_developer_bootstrap_rate_limit/);
  assert.match(developerBootstrapServer, /x-vercel-forwarded-for/);
  assert.match(developerBootstrapServer, /new URL\(origin\)\.origin === new URL\(request\.url\)\.origin/);
  assert.match(developerBootstrapServer, /MAX_BODY_BYTES = 8 \* 1024/);
  assert.match(developerBootstrapServer, /mediaType !== 'application\/json'/);
  assert.match(developerBootstrapServer, /const allowed = \['authorisation', 'confirmPassword', 'password', 'phone'\]/);
  assert.match(developerBootstrapServer, /passwordProblem\(password\)/);
  assert.match(developerBootstrapServer, /createHash\('sha256'\)/);
  assert.match(developerBootstrapServer, /admin\.auth\.admin\.createUser/);
  assert.match(developerBootstrapServer, /phone_confirm: true/);
  assert.match(developerBootstrapServer, /admin\.auth\.admin\.deleteUser/);
  assert.match(developerBootstrapServer, /server_release_developer_bootstrap/);
  assert.match(developerBootstrapServer, /never release it for reuse after an Auth update/i);
  assert.doesNotMatch(developerBootstrapServer, /signInWithPassword|sendOtp|verifyOtp/);
  assert.match(developerServiceApi, /action === 'bootstrap'/);
  assert.match(vercel, /"source": "\/api\/developer\/bootstrap"[\s\S]+action=bootstrap/);
  assert.match(configApi, /developerBootstrapEnabled/);
  assert.match(developerSource, /\/api\/developer\/bootstrap/);
  assert.match(developerSource, /autocomplete="new-password"/);
  assert.match(developerSource, /does not send an OTP/);
  assert.match(pkg, /developer-bootstrap\.test\.mjs/);
});
test('structured Information Needed and verified-answer-first Search remain safe', () => {
  assert.match(requestServer, /'information_update'/);
  assert.match(requestPage, /value="information_update"/);
  assert.match(verifiedAnswerEngine, /Ask the school to add or update it/);
  assert.match(verifiedAnswerEngine, /Monday–Friday, 7:30 a\.m\.–3:00 p\.m\./);
  assert.match(verifiedAnswerEngine, /There is no Primary 5/);
  assert.match(verifiedAnswerEngine, /does not take online card payments/);
  assert.match(portalSource, /'school_hours', 'address', 'class_progression', 'admission_procedure'/);
  assert.match(portalSource, /status: 'draft', revision: randomRevision\(\)/);
  assert.match(admissionTrackingMigration, /verified_public_information_one_published_topic_idx/);
  assert.match(admissionTrackingMigration, /where status='published'/);
});
test('baseline preserves the former Supabase portal until a separate verified cut-over', () => {
  assert.match(migration, /does NOT alter or retire public\.school_data/i);
  assert.doesNotMatch(migration, /revoke all on table public\.school_data/i);
  assert.doesNotMatch(migration, /create or replace function public\.touch_updated_at\s*\(/i);
  assert.match(migration, /create or replace function public\.portal_touch_updated_at\s*\(/i);
  assert.doesNotMatch(accountMigration, /execute function public\.touch_updated_at\s*\(/i);
  assert.doesNotMatch(accountMigration, /(?:drop|truncate|alter|delete from|update)\s+(?:table\s+)?public\.school_data/i);
  assert.doesNotMatch(rootSchema, /drop policy if exists %I on public\.school_data/i);
  assert.match(rootSchema, /202610230002_portal_accounts\.sql/i);
  assert.match(rootSchema, /202610230003_staff_operations_and_requests\.sql/i);
  assert.match(rootSchema, /202610230004_parent_pupil_linking\.sql/i);
  assert.match(rootSchema, /202610230005_self_registration_enrolment_and_graduates\.sql/i);
  assert.match(rootSchema, /202610230006_fees_shop_transport_and_manual_payments\.sql/i);
  assert.match(rootSchema, /202610240001_admission_tracking_developer_operations_and_answers\.sql/i);
  assert.match(rootSchema, /202610240002_staff_continuity_accelerated_progression_and_account_claims\.sql/i);
  assert.match(rootSchema, /20261025000100_owner_authorised_developer_bootstrap\.sql/i);
  assert.match(rootSchema, /20261025000200_developer_bootstrap_http_controls\.sql/i);
  assert.match(rootSchema, /20261026040507_fix_owner_bootstrap_pgcrypto_schema\.sql/i);
  assert.match(rootSchema, /20261026060000_public_cms_foundation\.sql/i);
  assert.match(rootSchema, /20261026070000_cloudinary_media_governance\.sql/i);
  assert.match(rootSchema, /20261027080000_public_content_delivery\.sql/i);
  assert.match(rootSchema, /20261027090000_public_engagement_and_placements\.sql/i);
  assert.match(rootSchema, /20261027100000_verified_content_search_and_inventory\.sql/i);
  assert.match(rootSchema, /20261027110000_clean_routes_and_discovery_quality\.sql/i);
  assert.match(rootSchema, /20261027130000_current_classes_and_flexible_results\.sql/i);
  for (const orderedMigration of [migration, accountMigration, operationsMigration, parentMigration, enrolmentMigration, financeMigration, admissionTrackingMigration, continuityMigration, bootstrapMigration, bootstrapHttpMigration, bootstrapCorrectionMigration, cmsFoundationMigration, cloudinaryMediaMigration, publicContentDeliveryMigration, publicEngagementMigration, verifiedContentMigration, cleanRoutesMigration, currentResultsMigration]) {
    assert.ok(rootSchema.includes(orderedMigration.trim()), 'root schema must contain every migration verbatim');
  }
  assert.ok(rootSchema.trimEnd().endsWith(currentResultsMigration.trimEnd()), 'root schema must end with the exact current classes/results migration');
  assert.match(legacyInventory, /begin transaction read only/i);
  assert.match(legacyInventory, /rollback;/i);
  assert.doesNotMatch(legacyInventory, /select\s+\*\s+from\s+public\.(?:school_data|pupils|results|fee_payments)/i);
  assert.match(legacyRetirement, /MANUAL CUT-OVER ONLY/i);
  assert.match(legacyRetirement, /revoke all on table public\.school_data from public, anon, authenticated/i);
  assert.match(legacyRetirement, /does not drop or truncate/i);
});
test('Monnify RPC is service-role-only and idempotent', () => {
  assert.match(migration, /on conflict \(event_key\) do nothing/i);
  assert.match(migration, /for update;/i);
  assert.match(migration, /grant execute on function public\.process_monnify_payment_event[\s\S]+to service_role;/i);
  assert.match(migration, /revoke all on function public\.process_monnify_payment_event[\s\S]+from public, anon, authenticated;/i);
});
test('Monnify RPC updates only payment/audit/webhook tables, never admission', () => {
  const rpc = migration.match(/create or replace function public\.process_monnify_payment_event[\s\S]+?\n\$\$;\nrevoke all on function public\.process_monnify_payment_event/i)?.[0] || '';
  assert.match(rpc, /update public\.payments/i);
  assert.match(rpc, /insert into public\.payment_audit_log/i);
  assert.doesNotMatch(rpc, /update public\.students/i);
  assert.doesNotMatch(rpc, /set\s+admission_status/i);
});
test('webhook is double-gated, reads raw text and re-verifies with Monnify', () => {
  assert.match(webhook, /MONNIFY_WEBHOOK_ENABLED === 'true'/);
  assert.match(webhook, /MONNIFY_OWNER_VERIFIED === 'true'/);
  assert.match(webhook, /await request\.text\(\)/);
  assert.doesNotMatch(webhook, /request\.json\(\)/);
  assert.match(webhook, /verifyTransactionWithMonnify/);
  assert.match(webhook, /processWithSupabase/);
});
test('webhook signature uses Node timingSafeEqual and exact raw body', () => {
  assert.match(monnify, /timingSafeEqual/);
  assert.match(monnify, /createHmac\('sha512', secret\)\.update\(rawBody, 'utf8'\)/);
});
test('webhook has strict body, event, status, reference, currency and amount checks', () => {
  assert.match(webhook, /MAX_BODY_BYTES/);
  assert.match(monnify, /SUCCESSFUL_TRANSACTION/);
  assert.match(monnify, /paymentStatus !== 'PAID'/);
  assert.match(monnify, /Unsupported currency/);
  assert.match(monnify, /Payment reference mismatch/);
  assert.match(monnify, /Verified amount mismatch/);
});
test('portal config exposes browser-safe configuration only', () => {
  assert.match(configApi, /PORTAL_ENABLED === 'true'/);
  assert.match(configApi, /SUPABASE_PUBLISHABLE_KEY/);
  assert.doesNotMatch(configApi, /process\.env\.SUPABASE_SECRET_KEY|process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});
test('portal uses phone/password, session storage, gated server registration and no pupil role', () => {
  assert.match(portalSource, /storage: window\.sessionStorage/);
  assert.match(portalSource, /signInWithPassword\(\{\s*phone: normalizedPhone/i);
  assert.match(portalSource, /signOut\(\{ scope: 'local' \}\)/);
  assert.doesNotMatch(portalSource, /signUp\s*\(/);
  assert.match(portalSource, /\/api\/portal\/register/);
  assert.match(portalSource, /TA-LINK/);
  assert.match(portalSource, /TA-FAMILY/);
  assert.deepEqual([...portalSource.matchAll(/profile\.role\s*===\s*'([^']+)'/g)].map((m) => m[1]).filter((v) => v === 'pupil'), []);
});
test('temporary-password accounts are gated before portal data loads', () => {
  const pendingGate = portalSource.indexOf("profile.account_status === 'pending_activation'");
  const dataLoad = portalSource.indexOf('await loadPortalData();', pendingGate);
  assert.ok(pendingGate > 0 && dataLoad > pendingGate);
  assert.match(portalSource, /renderPasswordChange\(\)/);
  assert.match(portalSource, /\/api\/account\/change-password/);
  assert.match(portalSource, /minlength: '12'/);
});
test('server account operations are explicitly gated, admin-authorised and never support admin creation', () => {
  assert.match(accountServer, /PORTAL_ENABLED !== 'true'/);
  assert.match(accountServer, /PORTAL_ACCOUNTS_ENABLED !== 'true'/);
  assert.match(accountServer, /profile\.role === 'admin'/);
  assert.match(accountServer, /server_validate_portal_session/);
  assert.match(accountServer, /body\.role === 'teacher' \? 'teacher' : null/);
  assert.doesNotMatch(accountServer, /body\.role === 'admin'|body\.role === 'parent' \?/);
  assert.match(accountServer, /auth\.admin\.createUser/);
  assert.match(accountServer, /phone_confirm: true/);
  assert.match(accountServer, /auth\.admin\.updateUserById/);
  assert.match(accountServer, /ban_duration: status === 'active' \? 'none' : '876000h'/);
  assert.doesNotMatch(accountServer, /console\.(?:log|info|debug)\s*\(/);
});
test('portal restores teacher daily work and leadership result controls without pupil uploads', () => {
  for (const marker of ['Attendance', 'Homework', 'Operations Inbox', 'Public Information', 'Staff Info', 'Leadership Tools']) {
    assert.match(portalSource, new RegExp(marker, 'i'));
  }
  assert.match(portalSource, /three_entry_15_15_70/i);
  assert.match(portalSource, /four_entry_10_10_10_70/i);
  assert.match(portalSource, /pre_nursery_exam_100/i);
  assert.match(portalSource, /CA3 obtained \/ obtainable/i);
  assert.match(portalSource, /workflow_status: values\.get\('workflow_status'\)/i);
  assert.match(portalSource, /state\.profile\.leadership_scope === 'headmistress'/i);
  assert.match(portalSource, /no online assignment submission or pupil upload/i);
  assert.doesNotMatch(portalSource, /<input[^>]+type=["']file|from\(['"]assignment_submissions/i);
});
test('parent portal supports one-time existing-pupil linking, a second guardian and separate new applications', () => {
  assert.match(portalSource, /\['add-child', 'Add a Child'/);
  assert.match(portalSource, /Pupil’s name on the school register/);
  assert.match(portalSource, /portal never displays or suggests a class list/i);
  assert.match(portalSource, /\/api\/parent\/pupil-match/);
  assert.match(portalSource, /\/api\/parent\/pupil-link/);
  assert.match(portalSource, /✓ Pupil record found/);
  assert.match(portalSource, /\/api\/parent\/second-invitation/);
  assert.match(portalSource, /\/api\/parent\/second-redemption/);
  assert.match(portalSource, /two active parent or guardian accounts|Two-parent maximum/i);
  assert.match(portalSource, /from\('admission_applications'\)\.insert/);
  assert.match(portalSource, /Payment can never approve admission/i);
  assert.match(portalSource, /profile\.role === 'parent' && !state\.admissionContinuations\.length[\s\S]{0,160}\? 'add-child'/);
});
test('Request Centre succeeds only after its API, supports private status lookup and replaces structured WhatsApp routes', () => {
  assert.match(requestPage, /Create website reference/i);
  assert.match(requestPage, /Private tracking code/i);
  assert.match(requestScript, /if \(!response\.ok\) throw new Error/i);
  assert.match(requestScript, /\/api\/requests\/status/);
  assert.match(requestApi, /WEBSITE_REQUESTS_ENABLED !== 'true'/);
  assert.match(requestStatusApi, /WEBSITE_REQUESTS_ENABLED !== 'true'/);
  assert.match(workflowBuilder, /SCHOOL_PREFIX = "https:\/\/wa\.me\/2349063932487\?text="/);
  assert.doesNotMatch(requestPage, /wa\.me\/2349063932487\?text=/i);
});
test('verified public information has an independently gated, read-only website surface', () => {
  assert.match(publicInfoApi, /PUBLIC_INFORMATION_ENABLED !== 'true'/);
  assert.match(publicInfoApi, /from\('public_verified_information'\)/);
  assert.match(publicInfoApi, /source_path,effective_from,effective_until,published_at,reviewed_at,next_review_date/);
  assert.doesNotMatch(publicInfoApi, /from\('verified_public_information'\)|\.eq\('status', 'published'\)/);
  assert.match(verifiedInfoScript, /\/api\/public-information/);
  assert.match(verifiedInfoScript, /textContent = item\.summary/);
  assert.doesNotMatch(verifiedInfoScript, /innerHTML/);
});
test('mobile School Life gallery no longer hides items three and four', () => {
  assert.doesNotMatch(uxCss, /\.gal-grid \.gal:nth-child\(n\+3\)\s*\{\s*display:none/i);
});
test('portal supports only manually verified bank transfer and physical office POS', () => {
  assert.match(portalHtml, /approved bank transfer or the physical school-office POS/i);
  assert.match(portalSource, /submit_bank_transfer_notification/);
  assert.match(portalSource, /record_physical_pos_payment/);
  assert.match(portalSource, /review_manual_payment/);
  assert.doesNotMatch(`${portalHtml}\n${portalSource}`, /checkout\.monnify|MonnifySDK|initializeTransaction/i);
});
test('portal has explicit labels, focus styling, reduced motion and mobile reflow', () => {
  assert.match(portalSource, /h\('label', \{ for: id/);
  assert.match(portalCss, /:focus-visible/);
  assert.match(portalCss, /prefers-reduced-motion/);
  assert.match(portalCss, /@media \(max-width: 620px\)/);
  assert.match(portalHtml, /class="skip-link"/);
});
test('service worker never caches protected portal or developer assets', () => {
  assert.match(serviceWorker, /treasure-v20261027-run11/);
  for (const asset of ['portal-app.js', 'cms-workspace-app.js', 'cms-workspace.js', 'portal.css', 'developer-console.js', 'developer-console.css', 'developer-review.js']) {
    assert.match(serviceWorker, new RegExp(asset.replace('.', '\\.')));
  }
  assert.match(portalHtml, /portal-app\.js\?v=20261027-cms1/);
  assert.match(developerHtml, /developer-console\.js\?v=20261025-1/);
});
test('Vercel policy keeps portal/API private and consolidates gated routes within the Hobby Function limit', () => {
  const settings = JSON.parse(vercel);
  const portalRule = settings.headers.find((rule) => rule.source === '/portal/(.*)');
  const apiRule = settings.headers.find((rule) => rule.source === '/api/(.*)');
  const developerRule = settings.headers.find((rule) => rule.source === '/developer.html');
  const reviewRule = settings.headers.find((rule) => rule.source === '/developer-review.html');
  assert.ok(portalRule.headers.some((header) => header.key === 'Cache-Control' && header.value.includes('no-store')));
  assert.ok(portalRule.headers.some((header) => header.key === 'Content-Security-Policy' && header.value.includes('https://*.supabase.co')));
  assert.ok(apiRule.headers.some((header) => header.key === 'Cache-Control' && header.value.includes('no-store')));
  for (const rule of [developerRule, reviewRule]) {
    const csp = rule.headers.find((header) => header.key === 'Content-Security-Policy')?.value || '';
    assert.match(csp, /script-src 'self';/);
    assert.doesNotMatch(csp, /script-src[^;]*'unsafe-inline'/);
  }
  const rewriteDestinations = new Map(settings.rewrites.map((rule) => [rule.source, rule.destination]));
  const expectedRoutes = {
    '/api/admin/accounts': '/api/account-service?action=create',
    '/api/admin/accounts/:id/reset-password': '/api/account-service?action=reset&id=:id',
    '/api/admin/accounts/:id/status': '/api/account-service?action=status&id=:id',
    '/api/admin/guardian-links': '/api/account-service?action=guardian',
    '/api/account/change-password': '/api/account-service?action=change-password',
    '/api/parent/pupil-match': '/api/parent-service?action=match',
    '/api/parent/pupil-link': '/api/parent-service?action=link',
    '/api/parent/second-invitation': '/api/parent-service?action=invite',
    '/api/parent/second-redemption': '/api/parent-service?action=redeem',
    '/api/admin/pupil-link-code': '/api/parent-service?action=issue-code',
    '/api/admission/track/request': '/api/admission-service?action=request',
    '/api/admission/track/verify': '/api/admission-service?action=verify',
    '/api/portal/admission-continuation': '/api/admission-service?action=continuation',
    '/api/developer/console': '/api/developer-service?action=console',
    '/api/developer/otp': '/api/developer-service?action=otp',
    '/api/developer/bootstrap': '/api/developer-service?action=bootstrap',
    '/api/requests': '/api/website-request-service?action=create',
    '/api/requests/status': '/api/website-request-service?action=status',
    '/api/cms/media/sign': '/api/cms-media?action=sign',
    '/api/cms/media/complete': '/api/cms-media?action=complete',
    '/api/cms/media/delivery': '/api/cms-media?action=delivery',
    '/api/cms/media/manifest': '/api/cms-media?action=manifest',
    '/api/cms/media/usage': '/api/cms-media?action=usage'
  };
  for (const [source, destination] of Object.entries(expectedRoutes)) {
    assert.equal(rewriteDestinations.get(source), destination, `incorrect Vercel rewrite ${source}`);
  }
  assert.ok(apiFunctionFiles.length <= 12, `Vercel Hobby permits at most 12 Functions, found ${apiFunctionFiles.length}`);
});
test('portal build and security test are wired into package scripts', () => {
  const packageJson = JSON.parse(pkg);
  assert.match(packageJson.scripts['build:portal'], /esbuild/);
  assert.match(packageJson.scripts['build:developer'], /esbuild/);
  assert.match(packageJson.scripts['build:schema'], /build-supabase-schema\.py/);
  assert.match(packageJson.scripts['test:all-current'], /run-current-tests\.sh/);
  assert.match(packageJson.scripts['test:sql-local'], /test-sql-migrations\.sh/);
  assert.match(packageJson.scripts['build:content'], /build-request-workflows\.py/);
  assert.match(packageJson.scripts['build:content'], /build:developer/);
  assert.match(packageJson.scripts.test, /test:portal/);
});

console.log(`\nPortal/security checks passed: ${passed}/${passed}`);
