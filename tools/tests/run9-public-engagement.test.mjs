import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { handlePublicContent } from '../../server/public-content.mjs';
import { handlePublicEngagement, publicEngagementInternals } from '../../server/public-engagement.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const entryId = '90000000-0000-4000-8000-000000000001';
const revisionId = '90000000-0000-4000-8000-000000000002';
const commentId = '90000000-0000-4000-8000-000000000003';
const profileId = '90000000-0000-4000-8000-000000000004';
const path = '/news/run-nine-fixture';
const env = {
  PUBLIC_CMS_ENABLED: 'true', PUBLIC_CMS_ENGAGEMENT_ENABLED: 'true', PUBLIC_CMS_COMMENTS_ENABLED: 'true',
  PUBLIC_CMS_PLACEMENTS_ENABLED: 'true', SUPABASE_URL: 'https://fictional.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'fictional-publishable', SUPABASE_SECRET_KEY: 'fictional-secret',
  CMS_ENGAGEMENT_HASH_PEPPER: 'fictional-test-pepper-that-is-not-a-production-secret'
};

function fakeSupabase() {
  const state = { calls: [], viewHashes: new Set(), likes: 4 };
  const entry = {
    entry_id: entryId, content_type: 'news', slug: 'run-nine-fixture', canonical_path: path,
    title: 'Run Nine Fixture', summary: 'A fictional reviewed update for local tests.',
    published_at: '2026-10-27T09:00:00Z', updated_at: '2026-10-27T09:00:00Z'
  };
  class Query {
    constructor(mode, table) { this.mode = mode; this.table = table; this.filters = {}; }
    select() { return this; }
    eq(field, value) { this.filters[field] = value; return this; }
    order() { return this; }
    limit() { return this; }
    async maybeSingle() {
      if (this.table === 'public_cms_published_entries') return { data: this.filters.canonical_path === path ? entry : null, error: null };
      if (this.table === 'profiles') return { data: this.mode === 'authenticated' ? { id: profileId, role: 'parent', active: true, account_status: 'active', must_change_password: false } : null, error: null };
      return { data: null, error: null };
    }
    execute() {
      if (this.table === 'public_cms_approved_comments') return { data: [{ id: commentId, body: 'A safe approved fixture.', author_label: 'Verified Parent', created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z' }], error: null };
      if (this.table === 'public_cms_published_slots') return { data: [
        { slot_key: 'home.news', slot_position: 0, entry_id: entryId, content_type: 'news', canonical_path: path, title: entry.title, summary: entry.summary },
        { slot_key: 'home.alert', slot_position: 0, entry_id: entryId, content_type: 'news', canonical_path: path, title: entry.title, summary: entry.summary }
      ], error: null };
      return { data: [], error: null };
    }
    then(resolve, reject) { return Promise.resolve(this.execute()).then(resolve, reject); }
  }
  function client(mode) {
    return {
      from(table) { return new Query(mode, table); },
      auth: { async getUser(token) { return token === 'valid.fixture.token' ? { data: { user: { id: profileId } }, error: null } : { data: { user: null }, error: { message: 'invalid' } }; } },
      async rpc(name, args) {
        state.calls.push({ mode, name, args });
        if (name === 'public_get_content_engagement') return { data: [{ view_count: 12, like_count: state.likes, comment_count: 1, liked: mode === 'authenticated' }], error: null };
        if (name === 'public_my_content_comments') return { data: [{ id: commentId, body: 'A safe approved fixture.', status: 'approved', created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z' }], error: null };
        if (name === 'public_record_content_view') {
          const recorded = !state.viewHashes.has(args.p_viewer_hash);
          state.viewHashes.add(args.p_viewer_hash);
          return { data: [{ recorded, view_count: recorded ? 13 : 13, like_count: state.likes, comment_count: 1, liked: false }], error: null };
        }
        if (name === 'public_toggle_content_like') {
          state.likes = args.p_liked ? 5 : 4;
          return { data: [{ view_count: 13, like_count: state.likes, comment_count: 1, liked: args.p_liked }], error: null };
        }
        if (name === 'public_submit_content_comment') return { data: [{ id: commentId, status: 'pending' }], error: null };
        if (name === 'public_edit_content_comment') return { data: [{ id: commentId, status: 'pending' }], error: null };
        if (name === 'public_delete_own_content_comment') return { data: true, error: null };
        if (name === 'public_report_content_comment') return { data: [{ received: true, report_count: 1, status: 'approved' }], error: null };
        return { data: null, error: { code: 'unknown', message: name } };
      }
    };
  }
  const createClient = (_url, key, options = {}) => client(key === env.SUPABASE_SECRET_KEY ? 'service' : options.global?.headers?.Authorization ? 'authenticated' : 'public');
  return { state, createClient };
}

async function asJson(response) { return response.json(); }
function postRequest(body, headers = {}) {
  return new Request('https://example.test/api/public-content?action=engagement', {
    method: 'POST',
    headers: { Origin: 'https://example.test', 'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0 Fictional Browser', 'X-Real-IP': '192.0.2.25', ...headers },
    body: JSON.stringify({ path, ...body })
  });
}

test('Run 9 public gates are independent, exact-true and consolidated without a thirteenth Function', async () => {
  const fake = fakeSupabase();
  for (const [name, action] of [['PUBLIC_CMS_ENGAGEMENT_ENABLED', 'engagement'], ['PUBLIC_CMS_PLACEMENTS_ENABLED', 'placements']]) {
    const response = await handlePublicEngagement(new Request(`https://example.test/api/public-content?action=${action}${action === 'engagement' ? `&path=${encodeURIComponent(path)}` : ''}`), { ...env, [name]: 'TRUE' }, { createClient: fake.createClient });
    assert.equal(response.status, 404);
  }
  const commentsOff = await handlePublicEngagement(postRequest({ operation: 'comment', body: 'Safe fixture.' }, { Authorization: 'Bearer valid.fixture.token' }), { ...env, PUBLIC_CMS_COMMENTS_ENABLED: 'false' }, { createClient: fake.createClient });
  assert.equal(commentsOff.status, 404);
  assert.match(read('.env.example'), /^PUBLIC_CMS_ENGAGEMENT_ENABLED=false$/m);
  assert.match(read('.env.example'), /^PUBLIC_CMS_COMMENTS_ENABLED=false$/m);
  assert.match(read('.env.example'), /^PUBLIC_CMS_PLACEMENTS_ENABLED=false$/m);
  assert.match(read('api/public-content.mjs'), /handlePublicEngagement/);
  assert.equal(readdirSync(join(root, 'api')).filter((name) => /\.(?:js|mjs)$/.test(name)).length, 12);
});

test('public summary returns aggregate counts and privacy-safe comments without actor identity', async () => {
  const fake = fakeSupabase();
  const response = await handlePublicEngagement(new Request(`https://example.test/api/public-content?action=engagement&path=${encodeURIComponent(path)}`), env, { createClient: fake.createClient });
  const result = await asJson(response);
  assert.equal(response.status, 200);
  assert.deepEqual(result.counts, { views: 12, likes: 4, comments: 1, liked: false });
  assert.equal(result.signedIn, false);
  assert.equal(result.comments[0].author_label, 'Verified Parent');
  assert.equal(JSON.stringify(result).includes(profileId), false);
  assert.equal(JSON.stringify(result).includes('actor_id'), false);
});

test('view receipts rotate by Lagos day, deduplicate refreshes and reject bots or prefetch', async () => {
  const base = new Request('https://example.test/x', { headers: { 'User-Agent': 'Mozilla/5.0', 'X-Real-IP': '192.0.2.25' } });
  const first = publicEngagementInternals.viewReceipt(base, entryId, env.CMS_ENGAGEMENT_HASH_PEPPER);
  const second = publicEngagementInternals.viewReceipt(base, entryId, env.CMS_ENGAGEMENT_HASH_PEPPER);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.equal(first, second);
  assert.equal(first.includes('192.0.2.25'), false);
  assert.equal(publicEngagementInternals.countableView(base), true);
  assert.equal(publicEngagementInternals.countableView(new Request('https://example.test/x', { headers: { 'User-Agent': 'Googlebot' } })), false);
  assert.equal(publicEngagementInternals.countableView(new Request('https://example.test/x', { headers: { 'User-Agent': 'Mozilla/5.0', 'Sec-Purpose': 'prefetch' } })), false);

  const fake = fakeSupabase();
  const accepted = await asJson(await handlePublicEngagement(postRequest({ operation: 'view' }), env, { createClient: fake.createClient }));
  const repeat = await asJson(await handlePublicEngagement(postRequest({ operation: 'view' }), env, { createClient: fake.createClient }));
  assert.equal(accepted.recorded, true);
  assert.equal(repeat.recorded, false);
  const records = fake.state.calls.filter((call) => call.name === 'public_record_content_view');
  assert.equal(records.length, 2);
  assert.equal(records[0].args.p_viewer_hash, records[1].args.p_viewer_hash);
  assert.equal(JSON.stringify(records).includes('192.0.2.25'), false);

  const bot = await asJson(await handlePublicEngagement(postRequest({ operation: 'view' }, { 'User-Agent': 'Googlebot' }), env, { createClient: fake.createClient }));
  assert.equal(bot.recorded, false);
  assert.equal(fake.state.calls.filter((call) => call.name === 'public_record_content_view').length, 2);
});

test('mutations enforce same-origin JSON, active authentication and pending-first comments', async () => {
  const fake = fakeSupabase();
  const crossOrigin = await handlePublicEngagement(postRequest({ operation: 'like', liked: true }, { Origin: 'https://attacker.test', Authorization: 'Bearer valid.fixture.token' }), env, { createClient: fake.createClient });
  assert.equal(crossOrigin.status, 403);
  const anonymous = await handlePublicEngagement(postRequest({ operation: 'like', liked: true }), env, { createClient: fake.createClient });
  assert.equal(anonymous.status, 401);
  const malformedLike = await handlePublicEngagement(postRequest({ operation: 'like', liked: 'yes' }, { Authorization: 'Bearer valid.fixture.token' }), env, { createClient: fake.createClient });
  assert.equal(malformedLike.status, 400);

  const liked = await asJson(await handlePublicEngagement(postRequest({ operation: 'like', liked: true }, { Authorization: 'Bearer valid.fixture.token' }), env, { createClient: fake.createClient }));
  assert.equal(liked.counts.liked, true);
  const comment = await handlePublicEngagement(postRequest({ operation: 'comment', body: 'A safe fictional parent comment.' }, { Authorization: 'Bearer valid.fixture.token' }), env, { createClient: fake.createClient });
  assert.equal(comment.status, 201);
  assert.equal((await asJson(comment)).comment.status, 'pending');
  assert.ok(fake.state.calls.some((call) => call.mode === 'authenticated' && call.name === 'public_submit_content_comment'));
  assert.ok(!fake.state.calls.some((call) => call.mode === 'service' && call.name === 'public_submit_content_comment'));
});

test('placements expose only effective fixed-view fields and homepage rendering uses text-only DOM sinks', async () => {
  const fake = fakeSupabase();
  const response = await handlePublicEngagement(new Request('https://example.test/api/public-content?action=placements'), env, { createClient: fake.createClient });
  const result = await asJson(response);
  assert.equal(response.status, 200);
  assert.equal(result.slots.news[0].canonical_path, path);
  assert.equal(result.slots.alert[0].title, 'Run Nine Fixture');
  assert.equal(JSON.stringify(result).includes('created_by'), false);
  const source = read('assets/js/homepage-placements.js');
  assert.match(source, /textContent/);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|outerHTML/);
  assert.match(read('index.html'), /homepage-placements\.js\?v=20261027-run9/);
});

test('server-rendered details add aggregate engagement and role-safe comments only when gated', async () => {
  const entry = {
    id: entryId, content_type: 'news', slug: 'run-nine-fixture', canonical_path: path,
    published_at: '2026-10-27T09:00:00Z', revision_id: revisionId, revision_number: 1,
    title: 'Run Nine Fixture', summary: 'A fictional reviewed update for local tests.', category: 'Test', locale: 'en-NG'
  };
  const repository = {
    async findEntry() { return entry; }, async alias() { return null; }, async blocks() { return [{ revision_id: revisionId, block_position: 0, block_type: 'paragraph', payload: { text: 'Safe fixture body.' } }]; },
    async media() { return []; }, async tags() { return []; }, async entriesBySlugs() { return []; },
    async engagement() { return { view_count: 12, like_count: 4, comment_count: 1 }; },
    async comments() { return [{ id: commentId, body: '<script> remains harmless text', author_label: 'School Staff', created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z' }]; }
  };
  const response = await handlePublicContent(new Request(`https://example.test${path}`), { env, repository, now: () => Date.parse('2026-10-27T12:00:00Z') });
  const html = await response.text();
  assert.match(html, /data-public-engagement/);
  assert.match(html, /data-view-count>12</);
  assert.match(html, /data-like-count>4</);
  assert.match(html, /School Staff/);
  assert.match(html, /&lt;script&gt; remains harmless text/);
  assert.doesNotMatch(html, new RegExp(profileId));
  assert.match(html, /Popularity metrics never|never affect admission, payment, results, progression, access or publication/i);
});

test('Run 9 SQL is additive, RLS-protected, privacy bounded and audit-reasoned', () => {
  const sql = read('supabase/migrations/20261027090000_public_engagement_and_placements.sql');
  for (const status of ['reported', 'hidden', 'deleted_by_author']) assert.match(sql, new RegExp(`add value if not exists '${status}'`));
  for (const table of ['public_content_view_receipts', 'public_content_comment_reports', 'public_site_slot_events']) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`));
  }
  assert.match(sql, /viewer_hash text not null check \(viewer_hash ~ '\^\[a-f0-9\]\{64\}\$'\)/);
  assert.doesNotMatch(sql, /ip_address|user_agent|raw_ip/i);
  assert.match(sql, /viewed_on<v_day-31/);
  assert.match(sql, /primary key\(entry_id,viewed_on,viewer_hash\)/);
  assert.match(read('supabase/migrations/20261026060000_public_cms_foundation.sql'), /unique\(entry_id,actor_id,reaction\)/);
  assert.match(sql, /Author edited comment; returned to review/);
  assert.match(sql, /Immutable homepage placement audit/);
  assert.match(sql, /cms_current_actor_can\('comment_moderate'\)/);
  assert.match(sql, /char_length\(trim\(coalesce\(p_reason,''\)\)\) not between 3 and 500/);
  assert.doesNotMatch(sql, /grant (?:select|insert|update|delete|all)[^;]*public_content_comments[^;]*to (?:anon|authenticated)/is);
  assert.doesNotMatch(sql, /(?:insert|update|delete)\s+(?:from\s+|into\s+)?public\.(?:admissions|admission_applications|payments|pupils|results|progression|school_data)/i);
  const endpoint = read('server/public-engagement.mjs');
  assert.match(endpoint, /createHmac\('sha256'/);
  assert.match(endpoint, /PUBLIC_CMS_COMMENTS_ENABLED/);
  assert.doesNotMatch(endpoint, /Math\.random|localStorage/);
});
