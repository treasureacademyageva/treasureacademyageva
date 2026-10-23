import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { computeMonnifySignature, parseSuccessfulPayment, sha256, supabaseServerHeaders, verifyMonnifySignature } from '../../server/monnify.mjs';
import { generateTemporaryPassword, handleCreateAccount, normalizeNigerianPhone, passwordProblem, sameOrigin } from '../../server/accounts.mjs';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
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
  process.env.SUPABASE_URL = 'https://must-not-be-returned.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'must-not-be-returned';
  const response = await portalConfigHandler.fetch(new Request('https://example.test/api/portal-config'));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { enabled: false });
  restorePortalEnvironment();
});
await asyncTest('enabled portal config returns only URL and publishable key', async () => {
  process.env.PORTAL_ENABLED = 'true';
  process.env.SUPABASE_URL = 'https://fictional-project.supabase.co';
  process.env.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_fictional';
  process.env.SUPABASE_SECRET_KEY = 'sb_secret_must-never-be-returned';
  const response = await portalConfigHandler.fetch(new Request('https://example.test/api/portal-config'));
  const body = await response.json();
  assert.deepEqual(body, { enabled: true, url: 'https://fictional-project.supabase.co', publishableKey: 'sb_publishable_fictional' });
  assert.doesNotMatch(JSON.stringify(body), /secret/i);
  restorePortalEnvironment();
});
restorePortalEnvironment();

const accountEnvNames = [
  'PORTAL_ENABLED', 'PORTAL_ACCOUNTS_ENABLED', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_ANON_KEY', 'SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY'
];
const savedAccountEnv = Object.fromEntries(accountEnvNames.map((name) => [name, process.env[name]]));
function restoreAccountEnvironment() {
  for (const [name, value] of Object.entries(savedAccountEnv)) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
  globalThis.fetch = originalFetch;
}
const accountEntryHandlers = await Promise.all([
  '../../api/admin-accounts.mjs',
  '../../api/admin-account-reset.mjs',
  '../../api/admin-account-status.mjs',
  '../../api/admin-guardian-links.mjs',
  '../../api/account-change-password.mjs'
].map(async (path) => (await import(path)).default));
await asyncTest('all account Function entry points fail closed before loading account dependencies', async () => {
  delete process.env.PORTAL_ENABLED;
  delete process.env.PORTAL_ACCOUNTS_ENABLED;
  let calls = 0;
  globalThis.fetch = async () => { calls += 1; throw new Error('must not run'); };
  for (const handler of accountEntryHandlers) {
    const response = await handler.fetch(new Request('https://school.example/api/account-test', { method: 'POST' }));
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
await asyncTest('authorised account provisioning creates phone Auth user then runs the audited profile RPC', async () => {
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
    if (href.includes('/rest/v1/profiles')) return Response.json({ id: actorId, role: 'admin', active: true, account_status: 'active', must_change_password: false });
    if (href.endsWith('/rest/v1/rpc/server_validate_portal_session')) return Response.json(true);
    if (href.endsWith('/auth/v1/admin/users')) return Response.json({ id: accountId, phone: '+2349063932487' });
    if (href.endsWith('/rest/v1/rpc/provision_portal_account')) return Response.json({ account_id: accountId, status: 'pending_activation' });
    return Response.json({ message: 'unexpected fictional route' }, { status: 500 });
  };
  const response = await handleCreateAccount(new Request('https://school.example/api/admin/accounts', {
    method: 'POST',
    headers: { Origin: 'https://school.example', 'Content-Type': 'application/json', Authorization: `Bearer ${userJwt}` },
    body: JSON.stringify({ fullName: 'Fictional Parent', phone: '0906 393 2487', role: 'parent', studentIds: [] })
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
    if (href.includes('/rest/v1/profiles')) return Response.json({ id: actorId, role: 'admin', active: true, account_status: 'active', must_change_password: false });
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

const [migration, accountMigration, rootSchema, legacyInventory, legacyRetirement, webhook, monnify, accountServer, configApi, portalSource, portalHtml, portalCss, vercel, pkg] = await Promise.all([
  read('supabase/migrations/202610230001_secure_school_portal.sql'),
  read('supabase/migrations/202610230002_portal_accounts.sql'),
  read('supabase-schema.sql'),
  read('supabase/manual/00_read_only_legacy_portal_inventory.sql'),
  read('supabase/manual/99_retire_legacy_school_data_after_verified_cutover.sql'),
  read('api/monnify-webhook.mjs'),
  read('server/monnify.mjs'),
  read('server/accounts.mjs'),
  read('api/portal-config.mjs'),
  read('assets/js/portal-source.js'),
  read('portal/login.html'),
  read('assets/css/portal.css'),
  read('vercel.json'),
  read('package.json')
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
test('baseline preserves the former Supabase portal until a separate verified cut-over', () => {
  assert.match(migration, /does NOT alter or retire public\.school_data/i);
  assert.doesNotMatch(migration, /revoke all on table public\.school_data/i);
  assert.doesNotMatch(migration, /create or replace function public\.touch_updated_at\s*\(/i);
  assert.match(migration, /create or replace function public\.portal_touch_updated_at\s*\(/i);
  assert.doesNotMatch(accountMigration, /execute function public\.touch_updated_at\s*\(/i);
  assert.doesNotMatch(accountMigration, /(?:drop|truncate|alter|delete from|update)\s+(?:table\s+)?public\.school_data/i);
  assert.doesNotMatch(rootSchema, /drop policy if exists %I on public\.school_data/i);
  assert.match(rootSchema, /202610230002_portal_accounts\.sql/i);
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
test('portal uses phone/password, session storage, local sign-out and no public signup or pupil role', () => {
  assert.match(portalSource, /storage: window\.sessionStorage/);
  assert.match(portalSource, /signInWithPassword\(\{\s*phone: normalizedPhone/i);
  assert.match(portalSource, /signOut\(\{ scope: 'local' \}\)/);
  assert.doesNotMatch(portalSource, /signUp\s*\(/);
  assert.deepEqual([...portalSource.matchAll(/profile\.role\s*===\s*'([^']+)'/g)].map((m) => m[1]).filter((v) => v === 'pupil'), []);
  assert.match(portalSource, /There is no public sign-up and no pupil login/);
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
  assert.match(accountServer, /body\.role === 'parent' \|\| body\.role === 'teacher'/);
  assert.doesNotMatch(accountServer, /body\.role === 'admin'/);
  assert.match(accountServer, /auth\.admin\.createUser/);
  assert.match(accountServer, /phone_confirm: true/);
  assert.match(accountServer, /auth\.admin\.updateUserById/);
  assert.match(accountServer, /ban_duration: status === 'active' \? 'none' : '876000h'/);
  assert.doesNotMatch(accountServer, /console\.(?:log|info|debug)\s*\(/);
});
test('portal keeps bank transfer active and exposes no Monnify checkout', () => {
  assert.match(portalHtml, /Bank transfer only/i);
  assert.match(portalSource, /method: 'bank_transfer'/);
  assert.doesNotMatch(`${portalHtml}\n${portalSource}`, /checkout\.monnify|MonnifySDK|initializeTransaction/i);
});
test('portal has explicit labels, focus styling, reduced motion and mobile reflow', () => {
  assert.match(portalSource, /h\('label', \{ for: id/);
  assert.match(portalCss, /:focus-visible/);
  assert.match(portalCss, /prefers-reduced-motion/);
  assert.match(portalCss, /@media \(max-width: 620px\)/);
  assert.match(portalHtml, /class="skip-link"/);
});
test('Vercel policy keeps portal/API private, permits Supabase connections and routes account functions', () => {
  const settings = JSON.parse(vercel);
  const portalRule = settings.headers.find((rule) => rule.source === '/portal/(.*)');
  const apiRule = settings.headers.find((rule) => rule.source === '/api/(.*)');
  assert.ok(portalRule.headers.some((header) => header.key === 'Cache-Control' && header.value.includes('no-store')));
  assert.ok(portalRule.headers.some((header) => header.key === 'Content-Security-Policy' && header.value.includes('https://*.supabase.co')));
  assert.ok(apiRule.headers.some((header) => header.key === 'Cache-Control' && header.value.includes('no-store')));
  const rewriteSources = new Set(settings.rewrites.map((rule) => rule.source));
  for (const source of ['/api/admin/accounts', '/api/admin/accounts/:id/reset-password', '/api/admin/accounts/:id/status', '/api/admin/guardian-links', '/api/account/change-password']) {
    assert.ok(rewriteSources.has(source), `missing Vercel account rewrite ${source}`);
  }
});
test('portal build and security test are wired into package scripts', () => {
  const packageJson = JSON.parse(pkg);
  assert.match(packageJson.scripts['build:portal'], /esbuild/);
  assert.match(packageJson.scripts.test, /test:portal/);
});

console.log(`\nPortal/security checks passed: ${passed}/${passed}`);
