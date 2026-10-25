import assert from 'node:assert/strict';
import { handleDeveloperBootstrap } from '../../server/developer-bootstrap.mjs';

const ENDPOINT = 'https://school.test/api/developer/bootstrap';
const AUTHORISATION = 'A'.repeat(43);
const PASSWORD = 'Correct-Horse-Battery-9!';
const ENABLED = { enabled: true, rateLimitPepper: 'R'.repeat(32) };
const IDs = {
  authorisation: 'aaaaaaaa-0000-4000-8000-000000000001',
  claim: 'bbbbbbbb-0000-4000-8000-000000000001',
  user: 'cccccccc-0000-4000-8000-000000000001'
};

function request(body, { origin = 'https://school.test', method = 'POST', contentType = 'application/json' } = {}) {
  return new Request(ENDPOINT, {
    method,
    headers: { Origin: origin, 'Content-Type': contentType, 'X-Forwarded-For': '203.0.113.10' },
    body: method === 'POST' ? JSON.stringify(body) : undefined
  });
}

function payload(overrides = {}) {
  return {
    phone: '0800 000 0301',
    authorisation: AUTHORISATION,
    password: PASSWORD,
    confirmPassword: PASSWORD,
    ...overrides
  };
}

function fakeAdmin(options = {}) {
  const calls = { rpc: [], create: [], delete: [], get: [], update: [], profiles: [] };
  const reserved = options.reserved === null ? null : {
    authorisation_id: IDs.authorisation,
    claim_id: IDs.claim,
    purpose: options.purpose || 'initial_password',
    full_name: 'Approved Developer',
    expires_at: '2026-10-25T12:00:00Z',
    existing_user_id: options.purpose === 'password_recovery' ? IDs.user : null,
    ...(options.reserved || {})
  };
  const admin = {
    async rpc(name, args) {
      calls.rpc.push({ name, args });
      if (name === 'server_take_developer_bootstrap_rate_limit') {
        return { data: options.rateLimitedScope === args.p_scope ? false : true, error: options.rateError || null };
      }
      if (name === 'server_reserve_developer_bootstrap') return { data: reserved ? [reserved] : [], error: options.reserveError || null };
      if (name === 'server_release_developer_bootstrap') return { data: true, error: options.releaseError || null };
      if (name === 'server_complete_developer_bootstrap') {
        return { data: options.completeInitialError ? null : IDs.user, error: options.completeInitialError || null };
      }
      if (name === 'server_complete_developer_password_recovery') {
        return { data: options.completeRecoveryError ? null : true, error: options.completeRecoveryError || null };
      }
      throw new Error(`Unexpected RPC ${name}`);
    },
    from(table) {
      assert.equal(table, 'profiles');
      const chain = {
        select(columns) { calls.profiles.push(['select', columns]); return chain; },
        eq(column, value) { calls.profiles.push(['eq', column, value]); return chain; },
        async maybeSingle() { return { data: options.profileId ? { id: options.profileId } : null, error: options.profileError || null }; }
      };
      return chain;
    },
    auth: {
      admin: {
        async createUser(value) {
          calls.create.push(value);
          return options.createError
            ? { data: { user: null }, error: options.createError }
            : { data: { user: { id: IDs.user, phone: '+2348000000301' } }, error: null };
        },
        async deleteUser(id) {
          calls.delete.push(id);
          return { data: null, error: options.deleteError || null };
        },
        async getUserById(id) {
          calls.get.push(id);
          return options.getError
            ? { data: { user: null }, error: options.getError }
            : { data: { user: { id, phone: options.authPhone || '+2348000000301' } }, error: null };
        },
        async updateUserById(id, value) {
          calls.update.push({ id, value });
          return { data: { user: { id } }, error: options.updateError || null };
        }
      }
    }
  };
  return { admin, calls };
}

async function body(response) { return response.json(); }

{
  const { admin, calls } = fakeAdmin();
  const response = await handleDeveloperBootstrap(request(payload()), { enabled: false, adminClient: admin });
  assert.equal(response.status, 404);
  assert.equal(calls.rpc.length, 0, 'disabled gate must stop before database access');
}

{
  const { admin, calls } = fakeAdmin();
  const response = await handleDeveloperBootstrap(request(payload(), { origin: 'https://evil.test' }), { ...ENABLED, adminClient: admin });
  assert.equal(response.status, 403);
  assert.equal(calls.rpc.length, 0, 'cross-origin request must stop before database access');
}

{
  const { admin, calls } = fakeAdmin();
  const response = await handleDeveloperBootstrap(request(payload({ confirmPassword: 'Does-not-match-9!' })), { ...ENABLED, adminClient: admin });
  assert.equal(response.status, 400);
  assert.equal(calls.rpc.length, 0, 'invalid input must stop before database access');
}

{
  const { admin, calls } = fakeAdmin();
  const response = await handleDeveloperBootstrap(request(payload({ purpose: 'password_recovery' })), { ...ENABLED, adminClient: admin });
  assert.equal(response.status, 400);
  assert.equal(calls.rpc.length, 0, 'browser must not add or choose a server-controlled purpose');
}

{
  const { admin, calls } = fakeAdmin();
  const response = await handleDeveloperBootstrap(request(payload()), { enabled: true, rateLimitPepper: 'short', adminClient: admin });
  assert.equal(response.status, 503);
  assert.equal(calls.rpc.length, 0, 'missing private rate-limit configuration must fail before database access');
}

{
  const { admin, calls } = fakeAdmin({ rateLimitedScope: 'network' });
  const response = await handleDeveloperBootstrap(request(payload()), { ...ENABLED, adminClient: admin });
  assert.equal(response.status, 429);
  assert.equal(calls.rpc.filter((call) => call.name === 'server_take_developer_bootstrap_rate_limit').length, 1);
  assert.equal(calls.rpc.some((call) => call.name === 'server_reserve_developer_bootstrap'), false, 'rate limit must stop before authorisation lookup');
  assert.equal(JSON.stringify(calls.rpc).includes('+2348000000301'), false, 'rate-limit storage call must receive only a rotating phone HMAC');
}

{
  const { admin, calls } = fakeAdmin();
  const response = await handleDeveloperBootstrap(request(payload()), { ...ENABLED, adminClient: admin });
  assert.equal(response.status, 200);
  const result = await body(response);
  assert.equal(result.completed, true);
  assert.equal(result.purpose, 'initial_password');
  assert.deepEqual(calls.create, [{ phone: '+2348000000301', password: PASSWORD, phone_confirm: true, user_metadata: { full_name: 'Approved Developer' } }]);
  assert.equal(calls.delete.length, 0);
  const rateCalls = calls.rpc.filter((call) => call.name === 'server_take_developer_bootstrap_rate_limit');
  assert.equal(rateCalls.length, 2);
  assert.equal(rateCalls.every((call) => /^[a-f0-9]{64}$/.test(call.args.p_subject_hash)), true);
  assert.equal(JSON.stringify(rateCalls).includes('203.0.113.10'), false);
  assert.equal(JSON.stringify(rateCalls).includes('+2348000000301'), false);
  const reserve = calls.rpc.find((call) => call.name === 'server_reserve_developer_bootstrap');
  assert.match(reserve.args.p_authorisation_hash, /^[a-f0-9]{64}$/);
  assert.notEqual(reserve.args.p_authorisation_hash, AUTHORISATION);
  assert.equal(reserve.args.p_phone_e164, '+2348000000301');
  const databasePayloads = JSON.stringify(calls.rpc);
  assert.equal(databasePayloads.includes(AUTHORISATION), false, 'database calls must receive only the authorisation hash');
  assert.equal(databasePayloads.includes(PASSWORD), false, 'database calls must never receive the readable password');
  assert.equal(JSON.stringify(result).includes(PASSWORD), false, 'response must never return the password');
}

{
  const { admin, calls } = fakeAdmin({ profileId: IDs.user });
  const response = await handleDeveloperBootstrap(request(payload()), { ...ENABLED, adminClient: admin });
  assert.equal(response.status, 409);
  assert.equal(calls.create.length, 0);
  assert.equal(calls.rpc.at(-1).name, 'server_release_developer_bootstrap');
}

{
  const { admin, calls } = fakeAdmin({ completeInitialError: { message: 'synthetic completion failure' } });
  const response = await handleDeveloperBootstrap(request(payload()), { ...ENABLED, adminClient: admin });
  assert.equal(response.status, 503);
  assert.deepEqual(calls.delete, [IDs.user], 'new Auth identity must be compensated after database completion failure');
  assert.equal(calls.rpc.at(-1).name, 'server_release_developer_bootstrap');
}

{
  const { admin, calls } = fakeAdmin({ completeInitialError: { message: 'synthetic completion failure' }, deleteError: { message: 'synthetic delete failure' } });
  const response = await handleDeveloperBootstrap(request(payload()), { ...ENABLED, adminClient: admin });
  assert.equal(response.status, 503);
  assert.deepEqual(calls.delete, [IDs.user]);
  assert.equal(calls.rpc.some((call) => call.name === 'server_release_developer_bootstrap'), false, 'reservation must stay fail-closed when Auth compensation fails');
}

{
  const { admin, calls } = fakeAdmin({ purpose: 'password_recovery' });
  const response = await handleDeveloperBootstrap(request(payload()), { ...ENABLED, adminClient: admin });
  assert.equal(response.status, 200);
  const result = await body(response);
  assert.equal(result.purpose, 'password_recovery');
  assert.deepEqual(calls.get, [IDs.user]);
  assert.deepEqual(calls.update, [{ id: IDs.user, value: { password: PASSWORD } }]);
  assert.equal(calls.create.length, 0);
  assert.equal(calls.delete.length, 0);
  assert.equal(calls.rpc.some((call) => call.name === 'server_release_developer_bootstrap'), false);
}

{
  const { admin, calls } = fakeAdmin({ purpose: 'password_recovery', completeRecoveryError: { message: 'synthetic completion failure' } });
  const response = await handleDeveloperBootstrap(request(payload()), { ...ENABLED, adminClient: admin });
  assert.equal(response.status, 503);
  assert.equal(calls.rpc.some((call) => call.name === 'server_release_developer_bootstrap'), false, 'recovery cannot release an authorisation after the password changed');
  assert.equal(calls.delete.length, 0, 'recovery must never delete the established Auth identity');
}

console.log('Developer bootstrap endpoint checks passed (12/12).');
