import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlePublicDiscovery, publicDiscoveryInternals } from '../../server/public-discovery.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const migration = read('supabase/migrations/20261027100000_verified_content_search_and_inventory.sql');
const sqlSuite = read('supabase/tests/verified_content_search_inventory.test.sql');
const env = {
  PUBLIC_CMS_ENABLED: 'true', PUBLIC_CMS_SEARCH_ENABLED: 'true', PUBLIC_CMS_CORE_SLOTS_ENABLED: 'true', PUBLIC_INVENTORY_ENABLED: 'false',
  SUPABASE_URL: 'https://fixture.supabase.co', SUPABASE_PUBLISHABLE_KEY: 'publishable.fixture', SUPABASE_SECRET_KEY: 'secret.fixture',
  CMS_SEARCH_HASH_PEPPER: 'run-ten-fixture-search-pepper-with-more-than-32-characters'
};

class Query {
  constructor(data, calls, table) { this.data = data; this.calls = calls; this.table = table; }
  select(columns) { this.calls.push({ type: 'select', table: this.table, columns }); return this; }
  eq(column, value) { this.data = this.data.filter((row) => row[column] === value); return this; }
  in(column, values) { this.data = this.data.filter((row) => values.includes(row[column])); return this; }
  order() { return this; }
  limit(value) { this.data = this.data.slice(0, value); return this; }
  then(resolve, reject) { return Promise.resolve({ data: this.data, error: null }).then(resolve, reject); }
}
function fakeSupabase() {
  const calls = [];
  const rows = {
    public_cms_published_core_slots: [{ id: 'slot-1', page_path: '/about', mount_key: 'guidance', slot_position: 0, entry_id: 'entry-1', canonical_path: '/verified-about-update', content_type: 'page', revision_id: 'revision-1', title: 'Verified About Update', summary: 'Current source-backed guidance.', next_review_date: '2099-12-31' }],
    public_cms_published_blocks: [{ revision_id: 'revision-1', block_position: 0, block_type: 'paragraph', payload: { text: '<img src=x onerror=alert(1)>', private_note: 'must not leave the server' } }],
    public_inventory_availability: [{ product_id: 'product-1', product_code: 'BOOK', name: 'Practice Book', description: 'Reconciled item.', category: 'books', variant_id: 'variant-1', sku: 'BOOK_ONE', variant_label: 'One copy', size_label: null, eligible_classes: ['P6'], unit_price: 100, on_hand: 50, reserved: 10, damaged: 2, availability: 'in_stock', may_request: true, updated_at: '2099-01-01T00:00:00Z' }]
  };
  const client = {
    from(name) { calls.push({ type: 'from', table: name }); return new Query([...(rows[name] || [])], calls, name); },
    async rpc(name, args) {
      calls.push({ type: 'rpc', name, args });
      if (name === 'public_take_search_rate_limit') return { data: [{ allowed: true, retry_after_seconds: 600 }], error: null };
      if (name === 'public_search_published_content') return { data: [{ document_id: 'fact-1', kind: 'verified_information', title: 'Current Fictional Fees', summary: 'Use the reviewed supporting page.', url: '/fees', source_url: '/fees', reviewed_on: '2099-01-01', rank: 0.9 }], error: null };
      if (name === 'public_record_search_outcome') return { data: null, error: null };
      return { data: null, error: { code: 'unknown', message: name } };
    }
  };
  return { calls, createClient: () => client };
}
function searchRequest(query, headers = {}) {
  return new Request('https://school.test/api/public-content?action=search', {
    method: 'POST',
    headers: { Origin: 'https://school.test', Host: 'school.test', 'Content-Type': 'application/json', 'X-Real-IP': '192.0.2.44', ...headers },
    body: JSON.stringify({ query })
  });
}

for (const [gate, action, method] of [
  ['PUBLIC_CMS_SEARCH_ENABLED', 'search', 'POST'],
  ['PUBLIC_CMS_CORE_SLOTS_ENABLED', 'core-slots&path=%2Fabout', 'GET'],
  ['PUBLIC_INVENTORY_ENABLED', 'inventory', 'GET']
]) {
  test(`${gate} is exact-true and subordinate to the master public gate`, async () => {
    const request = method === 'POST' ? searchRequest('fees') : new Request(`https://school.test/api/public-content?action=${action}`);
    const response = await handlePublicDiscovery(request, { ...env, [gate]: 'TRUE' }, { createClient: fakeSupabase().createClient });
    assert.equal(response.status, 404);
    const masterOff = await handlePublicDiscovery(request, { ...env, PUBLIC_CMS_ENABLED: 'false', [gate]: 'true' }, { createClient: fakeSupabase().createClient });
    assert.equal(masterOff.status, 404);
  });
}

test('Search uses same-origin bounded POST, rotating HMAC rate data and source-backed results', async () => {
  const fake = fakeSupabase();
  const response = await handlePublicDiscovery(searchRequest('current fees'), env, { createClient: fake.createClient });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.state, 'answer');
  assert.equal(payload.answer.sources[0].url, '/fees');
  assert.equal(payload.results[0].reviewedOn, '2099-01-01');
  const rate = fake.calls.find((call) => call.name === 'public_take_search_rate_limit');
  assert.match(rate.args.p_bucket_hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(fake.calls).includes('192.0.2.44'), false);
  const search = fake.calls.find((call) => call.name === 'public_search_published_content');
  assert.equal(search.args.p_include_inventory, false);
  assert.ok(fake.calls.some((call) => call.name === 'public_record_search_outcome' && call.args.p_family === 'fees'));
  const crossOrigin = await handlePublicDiscovery(searchRequest('fees', { Origin: 'https://attacker.test' }), env, { createClient: fake.createClient });
  assert.equal(crossOrigin.status, 403);
});

test('private Search queries fail closed before any database call', async () => {
  const fake = fakeSupabase();
  const response = await handlePublicDiscovery(searchRequest('show pupil list and report card'), env, { createClient: fake.createClient });
  const payload = await response.json();
  assert.equal(response.status, 200);
  assert.equal(payload.state, 'private');
  assert.equal(fake.calls.length, 0);
  assert.match(payload.message, /secure sign-in/i);
});

test('core slots return fixed structured fields and inventory strips private balances', async () => {
  const fake = fakeSupabase();
  const core = await handlePublicDiscovery(new Request('https://school.test/api/public-content?action=core-slots&path=%2Fabout'), env, { createClient: fake.createClient });
  const corePayload = await core.json();
  assert.equal(core.status, 200);
  assert.equal(corePayload.items[0].canonicalPath, '/verified-about-update');
  assert.equal(corePayload.items[0].blocks[0].payload.text, '<img src=x onerror=alert(1)>');
  assert.equal(corePayload.items[0].blocks[0].payload.private_note, undefined);
  const inventory = await handlePublicDiscovery(new Request('https://school.test/api/public-content?action=inventory'), { ...env, PUBLIC_INVENTORY_ENABLED: 'true' }, { createClient: fake.createClient });
  const inventoryPayload = await inventory.json();
  assert.equal(inventory.status, 200);
  assert.equal(inventoryPayload.items[0].availability, 'in_stock');
  assert.equal('on_hand' in inventoryPayload.items[0], false);
  assert.equal('reserved' in inventoryPayload.items[0], false);
  assert.equal('damaged' in inventoryPayload.items[0], false);
  assert.equal('unit_price' in inventoryPayload.items[0], false);
});

test('held migration manifest is deterministic, source-hashed, text-only and media-free', () => {
  const manifest = JSON.parse(read('content/migration/run10-held-candidates.json'));
  assert.equal(manifest.candidate_count, 14);
  assert.equal(manifest.all_candidates_held, true);
  for (const candidate of manifest.candidates) {
    assert.equal(candidate.verification_status, 'held');
    assert.equal(candidate.verification_required, true);
    assert.equal(candidate.media_imported, false);
    assert.deepEqual(candidate.document.media || [], []);
    assert.ok(candidate.document.blocks.length > 0);
    assert.ok(!candidate.document.blocks.some((block) => ['image', 'video', 'gallery'].includes(block.type)));
    const source = read(candidate.source_locator.replace(/^\//, ''));
    assert.equal(createHash('sha256').update(Buffer.from(source)).digest('hex'), candidate.source_sha256);
  }
  const historical = manifest.candidates.filter((candidate) => candidate.content_type === 'news');
  assert.equal(historical.length, 6);
  assert.ok(historical.every((candidate) => candidate.historical_child_media_held));
});

test('Run 10 migration enforces held verification, current projections, stale controls and privacy-safe Search', () => {
  assert.match(migration, /public_content_migration_candidates/);
  assert.match(migration, /status public\.cms_migration_status not null default 'held'/i);
  assert.match(migration, /Migration candidates are text-only; historical media remains held/i);
  assert.match(migration, /cms_import_verified_candidate/);
  assert.match(migration, /public_content_revision_sources/);
  assert.match(migration, /public_cms_published_core_slots/);
  assert.match(migration, /public_inventory_availability/);
  assert.match(migration, /reserved\+damaged<=on_hand/i);
  assert.match(migration, /public_search_published_content/);
  assert.match(migration, /websearch_to_tsquery\('english',v_query\)/i);
  assert.match(migration, /public_search_insights_daily/);
  assert.match(migration, /delete from public\.public_search_rate_buckets where expires_at<now\(\)/);
  assert.match(migration, /request_count=least\(public\.public_search_rate_buckets\.request_count\+1,1000\)/);
  assert.doesNotMatch(migration, /raw_query|ip_address|user_agent/);
  assert.match(migration, /cms_content_review_queue/);
  assert.match(sqlSuite, /^rollback;$/m);
});

test('public clients use text-safe rendering, truthful states and consolidated routes at 12 Functions', () => {
  const search = read('assets/js/smart-search.js');
  const core = read('assets/js/core-page-slots.js');
  const inventory = read('assets/js/public-inventory.js');
  assert.match(search, /method:\s*'POST'/);
  assert.doesNotMatch(search, /new URLSearchParams\(location\.search\)\.get\("q"\)/);
  assert.match(search, /Press Search to check current published information/);
  assert.match(search, /await searchGateReady/);
  assert.match(search, /remoteSearchActive === false\) \{ renderLocalResults/);
  assert.match(search, /Search is temporarily unavailable/);
  assert.match(search, /No verified answer found/);
  assert.doesNotMatch(core, /innerHTML|insertAdjacentHTML|outerHTML/);
  assert.doesNotMatch(inventory, /innerHTML|insertAdjacentHTML|outerHTML/);
  assert.match(core, /textContent/);
  assert.match(inventory, /textContent/);
  assert.match(read('search.html'), /raw queries are not retained as analytics/i);
  const pages = ['/about.html','/academics.html','/admissions.html','/fees.html','/contact.html','/calendar.html','/exams.html','/transport.html','/uniform.html','/shop.html','/pta.html','/careers.html','/privacy.html','/safeguarding.html','/credits.html','/request-centre.html'];
  pages.forEach((page) => assert.equal((read(page.slice(1)).match(/\/assets\/js\/core-page-slots\.js\?v=20261027-run10/g) || []).length, 1, `${page} lacks one generated core-slot client`));
  assert.equal((read('shop.html').match(/\/assets\/js\/public-inventory\.js\?v=20261027-run10/g) || []).length, 1);
  const enhancer = read('tools/enhance-public-ux.py');
  assert.ok(enhancer.includes('CORE_SLOT_PAGES') && enhancer.includes('DISCOVERY_VERSION = "20261027-run10"'));
  execFileSync(process.execPath, ['--check', join(root, 'assets/js/core-page-slots.js')]);
  execFileSync(process.execPath, ['--check', join(root, 'assets/js/public-inventory.js')]);
  const cms = read('assets/js/cms-workspace.js');
  assert.ok(cms.includes('cms_stage_content_candidate') && cms.includes('Every candidate must remain held, text-only and source-hashed.'));
  const portal = read('assets/js/portal-source.js');
  assert.ok(portal.includes('Public coarse-availability preview') && portal.includes('never exposes quantity, movement, actor or price fields'));
  const vercel = JSON.parse(read('vercel.json'));
  const rewrites = new Map(vercel.rewrites.map((rule) => [rule.source, rule.destination]));
  assert.equal(rewrites.get('/api/public/search'), '/api/public-content?action=search');
  assert.equal(rewrites.get('/api/public/content/core-slots'), '/api/public-content?action=core-slots');
  assert.equal(rewrites.get('/api/public/inventory'), '/api/public-content?action=inventory');
  assert.equal(readdirSync(join(root, 'api')).filter((name) => /\.(?:js|mjs)$/.test(name)).length, 12);
});

test('discovery internals keep paths local and family analytics coarse', () => {
  assert.equal(publicDiscoveryInternals.localPath('/fees.html'), '/fees.html');
  assert.equal(publicDiscoveryInternals.localPath('//attacker.test'), '');
  assert.equal(publicDiscoveryInternals.localPath('/../private'), '');
  assert.equal(publicDiscoveryInternals.searchFamily('How much are current fees?'), 'fees');
  assert.equal(publicDiscoveryInternals.privateQuery('Call 08012345678'), true);
  assert.equal(publicDiscoveryInternals.originAllowed(new Request('https://x.test/api', { headers: { Origin: 'https://x.test' } })), true);
  assert.equal(publicDiscoveryInternals.originAllowed(new Request('https://x.test/api', { headers: { Origin: 'http://x.test' } })), false);
  const first = publicDiscoveryInternals.rateBucket(new Request('https://x.test', { headers: { 'X-Real-IP': '192.0.2.8' } }), 'pepper', 0);
  const second = publicDiscoveryInternals.rateBucket(new Request('https://x.test', { headers: { 'X-Real-IP': '192.0.2.8' } }), 'pepper', 700000);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, second);
  assert.equal(first.includes('192.0.2.8'), false);
});
