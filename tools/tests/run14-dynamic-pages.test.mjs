import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { publicDiscoveryInternals } from '../../server/public-discovery.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const routes = JSON.parse(read('config/public-routes.json')).routes;
const nonNews = routes.filter((route) => !route.canonical.startsWith('/news'));
const migration = read('supabase/migrations/20261029140000_dynamic_public_page_surfaces.sql');

test('Run 14 migration keeps public Page routes fixed, published-only and capability controlled', () => {
  assert.match(migration, /create table public\.public_page_surfaces/i);
  assert.match(migration, /create table public\.public_page_surface_events/i);
  assert.match(migration, /public_cms_published_page_surfaces/i);
  assert.match(migration, /cms_set_page_surface/i);
  assert.match(migration, /cms_current_actor_can\('publish'\)/i);
  assert.match(migration, /content_type='page'/i);
  assert.match(migration, /Portal routes must never|cms_page_surface_mode/i);
  assert.doesNotMatch(migration, /values\s*\(\s*'\/about'/i);
  assert.match(read('.env.example'), /^PUBLIC_CMS_PAGES_ENABLED=false$/m);
  assert.match(read('supabase/tests/dynamic_public_pages.test.sql'), /^rollback;$/m);
});

test('every approved non-News public route has one deterministic held Page candidate', () => {
  const manifest = JSON.parse(read('content/migration/public-page-held-candidates.json'));
  assert.equal(manifest.all_candidates_held, true);
  assert.equal(manifest.candidate_count, nonNews.length);
  assert.deepEqual(new Set(manifest.candidates.map((item) => item.surface_path)), new Set(nonNews.map((route) => route.canonical)));
  for (const candidate of manifest.candidates) {
    assert.equal(candidate.verification_status, 'held');
    assert.equal(candidate.verification_required, true);
    assert.equal(candidate.media_imported, false);
    assert.deepEqual(candidate.document.media, []);
    assert.ok(candidate.document.blocks.length >= 1 && candidate.document.blocks.length <= 100);
    assert.equal(candidate.document.metadata.surface_mode, candidate.surface_mode);
    assert.equal(candidate.document.metadata.surface_path, candidate.surface_path);
    const bytes = readFileSync(join(root, candidate.source_locator));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), candidate.source_sha256);
  }
});

test('dynamic Page client is text-safe, fail-safe and installed exactly once on all approved Page surfaces', () => {
  const client = read('assets/js/dynamic-page.js');
  assert.doesNotMatch(client, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\s*\(/);
  assert.match(client, /textContent/);
  assert.match(client, /main\.replaceChildren\(content\)/);
  assert.match(client, /main\.prepend\(content\)/);
  assert.match(client, /complete reviewed static page is the fail-safe fallback/i);
  for (const route of nonNews) {
    const source = read(route.source.replace(/^\//, ''));
    assert.equal((source.match(/\/assets\/js\/dynamic-page\.js\?v=20261029-pages1/g) || []).length, 1, route.source);
  }
  for (const frozen of ['developer.html', 'developer-review.html', 'developer-operations.html', 'portal/login.html']) {
    assert.doesNotMatch(read(frozen), /dynamic-page\.js/);
  }
});

test('public discovery accepts only the fixed route allowlist and distinguishes replacement from safety-shell supplements', () => {
  assert.equal(publicDiscoveryInternals.PAGE_PATHS.size, nonNews.length);
  assert.equal(publicDiscoveryInternals.REPLACE_PAGE_PATHS.has('/about'), true);
  assert.equal(publicDiscoveryInternals.REPLACE_PAGE_PATHS.has('/classes/primary-6'), true);
  assert.equal(publicDiscoveryInternals.SUPPLEMENT_PAGE_PATHS.has('/admissions'), true);
  assert.equal(publicDiscoveryInternals.SUPPLEMENT_PAGE_PATHS.has('/request-centre'), true);
  assert.equal(publicDiscoveryInternals.PAGE_PATHS.has('/portal/login.html'), false);
  assert.equal(publicDiscoveryInternals.PAGE_PATHS.has('/developer.html'), false);
});

test('staff prepare Pages in the existing CMS while only publishers bind routes', () => {
  const cms = read('assets/js/cms-workspace.js');
  const portal = read('assets/js/portal-source.js');
  assert.match(cms, /function pageSurfacePanel/);
  assert.match(cms, /cms_set_page_surface/);
  assert.match(cms, /Staff with drafting access can prepare Page revisions/);
  assert.match(cms, /Only accepted leadership publishers can bind/);
  assert.match(portal, /publicPagesEnabled/);
  assert.match(read('api/portal-config.mjs'), /PUBLIC_CMS_PAGES_ENABLED/);
});

test('News now uses dynamic delivery with byte-for-byte reviewed static gate-off fallbacks', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const rewrites = new Map(vercel.rewrites.map((rule) => [rule.source, rule.destination]));
  assert.equal(rewrites.get('/news'), '/api/public-content?route=news-list');
  for (const route of routes.filter((item) => item.canonical.startsWith('/news/'))) {
    assert.equal(rewrites.get(route.canonical), `/api/public-content?route=news-detail&slug=${route.canonical.split('/').at(-1)}`);
  }
  const fallbackModule = read('server/public-fallbacks.generated.mjs');
  assert.match(fallbackModule, /PUBLIC_HTML_FALLBACKS/);
  for (const route of routes.filter((item) => item.canonical === '/news' || item.canonical.startsWith('/news/'))) {
    assert.match(fallbackModule, new RegExp(route.canonical.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(read('server/public-content.mjs'), /PUBLIC_HTML_FALLBACKS/);
});
