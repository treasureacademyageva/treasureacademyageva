import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import portalConfig from '../../api/portal-config.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const boundary = JSON.parse(read('config/run12-release-boundary.json'));
const envExample = read('.env.example');

test('Run 12 boundary pins accepted Run 11 and exact preserved Production resources', () => {
  assert.equal(boundary.version, 1);
  assert.equal(boundary.run11AcceptedCommit, 'f61a074be8a86058ca14c6fd452be351688e9a48');
  assert.match(boundary.run11AcceptedCommit, /^[a-f0-9]{40}$/);
  assert.deepEqual(boundary.preservedProduction, {
    sourceCommit: 'a552618e40791a592cb9e586b2963d61ed46ad2c',
    deploymentId: 'dpl_DLjZRSt67DAxHhsBYprfhYeJV2h2',
    supabaseProjectRef: 'biyizitalhylkwtshrqt',
    browserConfig: { enabled: true, developerBootstrapEnabled: false, registrationEnabled: true, accountClaimEnabled: false, officeEnabled: true }
  });
  assert.equal(boundary.releaseMode, 'gate-off-only-until-separate-acceptance');
  assert.equal(boundary.rollback.stopOnUnexpectedCountDecrease, true);
  assert.equal(boundary.rollback.encryptedRestoreRequiredBeforeMigration, true);
});

test('every release gate is declared exact false and external acceptances cannot be conflated', () => {
  assert.equal(boundary.requiredFalseGates.length, 17);
  assert.equal(new Set(boundary.requiredFalseGates).size, boundary.requiredFalseGates.length);
  for (const gate of boundary.requiredFalseGates) {
    assert.match(envExample, new RegExp(`^${gate}=false$`, 'm'), gate);
    assert.doesNotMatch(envExample, new RegExp(`^${gate}=true$`, 'm'), gate);
  }
  assert.equal(boundary.separateAcceptances.schoolAccountClaims.status, 'hold');
  assert.equal(boundary.separateAcceptances.admissionTrackingOtp.status, 'hold');
  assert.equal(boundary.separateAcceptances.automaticParagonRelay.status, 'external-hold');
  assert.equal(boundary.separateAcceptances.automaticParagonRelay.requirements.length, 7);
  assert.equal(boundary.separateAcceptances.automaticParagonRelay.manualFallbackRequired, true);
  assert.equal(boundary.separateAcceptances.automaticParagonRelay.forbiddenTestRecipientSuffix, '6650');
  assert.notEqual(boundary.separateAcceptances.schoolAccountClaims.gate, boundary.separateAcceptances.admissionTrackingOtp.gate);
  assert.notEqual(boundary.separateAcceptances.admissionTrackingOtp.gate, boundary.separateAcceptances.automaticParagonRelay.gate);
});

test('release boundary and evidence contain no secret values or acceptance fiction', () => {
  const text = JSON.stringify(boundary);
  assert.doesNotMatch(text, /BEGIN (?:PRIVATE|RSA|EC) KEY|eyJhbGci|service_role|authenticationCode|password|otp.*\d{6}/i);
  assert.doesNotMatch(text, /"status":"(?:approved|passed|enabled|complete)"/i);
  assert.match(text, /external-hold/);
});

test('browser-safe portal config fails closed and omits private settings when its required configuration is absent', async () => {
  const names = ['PORTAL_ENABLED', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY', 'DEVELOPER_MANUAL_BOOTSTRAP_ENABLED', 'PUBLIC_CMS_ENABLED', 'PUBLIC_CMS_SEARCH_ENABLED', 'PUBLIC_CMS_CORE_SLOTS_ENABLED', 'PUBLIC_CMS_PAGES_ENABLED', 'PUBLIC_INVENTORY_ENABLED'];
  const prior = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  try {
    for (const name of names) delete process.env[name];
    const response = await portalConfig.fetch(new Request('https://school.test/api/portal-config'));
    const body = await response.json();
    assert.equal(response.status, 200);
    assert.deepEqual(body, { enabled: false, developerBootstrapEnabled: false, publicSearchEnabled: false, coreSlotsEnabled: false, publicPagesEnabled: false, publicInventoryEnabled: false });
    assert.doesNotMatch(JSON.stringify(body), /secret|service|pepper|private|relay|admission/i);
  } finally {
    for (const [name, value] of Object.entries(prior)) value === undefined ? delete process.env[name] : process.env[name] = value;
  }
});

test('Production preservation probe is read-only, bounded and checks fail-closed/public boundaries', () => {
  const probe = read('tools/run-production-preservation-probes.mjs');
  assert.match(probe, /method: 'GET'/);
  assert.doesNotMatch(probe, /method:\s*['"](?:POST|PUT|PATCH|DELETE)['"]/);
  assert.match(probe, /AbortController/);
  assert.match(probe, /const apex = await getUrl\('https:\/\/treasureacademyageva\.com\/'/);
  assert.match(probe, /\/api\/account\/claim\/request/);
  assert.match(probe, /\/api\/admission\/tracking\/request/);
  assert.match(probe, /\/api\/developer\/bootstrap/);
  assert.match(probe, /randomUUID\(\)/);
  assert.doesNotMatch(probe, /['"](?:authorization|apikey|cookie)['"]\s*:/i);
  assert.doesNotMatch(probe, /authenticationCode|Bearer\s|service_role/i);
});

test('Function ceiling and fail-closed source gates remain unchanged', () => {
  assert.equal(readdirSync(join(root, 'api')).filter((name) => /\.(?:js|mjs)$/.test(name)).length, 12);
  assert.match(read('server/account-claims.mjs'), /PORTAL_ACCOUNT_CLAIM_ENABLED !== 'true'/);
  assert.match(read('server/admission-tracking.mjs'), /settings\('ADMISSION_TRACKING_ENABLED'\)/);
  assert.match(read('server/otp-relay.mjs'), /PARAGON_OTP_RELAY_ENABLED !== 'true'/);
  assert.match(read('server/otp-relay.mjs'), /recipientPhone: phone/);
  assert.doesNotMatch(read('server/otp-relay.mjs'), /(?:pupil|student|result|payment|class_name|password)\s*:/i);
});
