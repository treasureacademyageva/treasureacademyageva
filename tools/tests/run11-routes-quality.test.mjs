import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { handlePublicContent, sitemapXml } from '../../server/public-content.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const registry = JSON.parse(read('config/public-routes.json'));
const routes = registry.routes;
const mapping = new Map(routes.map((row) => [row.source, row.canonical]));
const site = registry.siteOrigin;

function htmlAttributes(text, name) {
  return [...text.matchAll(new RegExp(`${name}=["']([^"']+)["']`, 'gi'))].map((match) => match[1]);
}

function normalText(text) {
  const main = text.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i)?.[1] || text;
  return main.replace(/<script\b[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ').replace(/&[a-z0-9#]+;/gi, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

test('one reviewed route registry owns every public filesystem page and clean canonical', () => {
  assert.equal(registry.version, 1);
  assert.equal(routes.length, 55);
  assert.equal(routes.filter((row) => row.indexable).length, 30);
  assert.equal(new Set(routes.map((row) => row.source)).size, routes.length);
  assert.equal(new Set(routes.map((row) => row.canonical)).size, routes.length);
  assert.equal(mapping.get('/index.html'), '/');
  assert.equal(mapping.get('/class.html'), '/classes');
  assert.equal(mapping.get('/explore.html'), '/site-map');
  assert.equal(mapping.get('/news/2026-2027-admissions-open.html'), '/news/2026-2027-admissions-open');
  assert.ok(routes.every((row) => !row.canonical.endsWith('.html') && !row.canonical.includes('//')));
});

test('Vercel clean-route redirects are one hop, rewrites preserve files and dynamic routes win', () => {
  const config = JSON.parse(read('vercel.json'));
  const redirects = new Map(config.redirects.filter((row) => !row.has).map((row) => [row.source, row.destination]));
  const rewrites = new Map(config.rewrites.map((row) => [row.source, row.destination]));
  for (const row of routes) {
    assert.equal(redirects.get(row.source), row.canonical, `missing redirect for ${row.source}`);
    assert.equal(redirects.has(row.canonical), false, `redirect chain begins at ${row.canonical}`);
    if (row.canonical !== '/' && row.canonical !== '/news' && !row.canonical.startsWith('/news/')) {
      assert.equal(rewrites.get(row.canonical), row.source, `missing clean rewrite for ${row.canonical}`);
    }
  }
  assert.equal(redirects.get('/class'), '/classes');
  assert.equal(redirects.get('/explore'), '/site-map');
  assert.equal(rewrites.get('/sitemap.xml'), '/api/public-content?route=sitemap');
  assert.equal(rewrites.get('/news'), '/api/public-content?route=news-list');
  assert.equal(rewrites.get('/news/:slug([a-z0-9-]+)'), '/api/public-content?route=news-detail&slug=:slug');
  assert.equal(rewrites.get('/events'), '/api/public-content?route=events-list');
  assert.equal(rewrites.get('/gallery'), '/api/public-content?route=gallery-list');
  assert.equal(readdirSync(join(root, 'api')).filter((name) => /\.(?:js|mjs)$/.test(name)).length, 12);
});

test('all public HTML has clean canonical, Open Graph URL, crawlable clean internal links and valid JSON-LD', () => {
  for (const row of routes) {
    const text = read(row.source.slice(1));
    assert.match(text, new RegExp(`<link rel="canonical" href="${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${row.canonical === '/' ? '/' : row.canonical}"`), row.source);
    assert.match(text, new RegExp(`<meta property="og:url" content="${site.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}${row.canonical === '/' ? '/' : row.canonical}"`), row.source);
    for (const href of htmlAttributes(text, 'href')) {
      let path = href;
      try { if (/^https?:/.test(href)) path = new URL(href).pathname; } catch {}
      path = path.split(/[?#]/)[0];
      assert.equal(mapping.has(path), false, `${row.source} still links to former route ${href}`);
    }
    for (const block of [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]) {
      assert.doesNotThrow(() => JSON.parse(block[1]), `${row.source} JSON-LD parses`);
    }
  }
});

test('fixed sitemap, local Search and knowledge base agree with clean public routes', () => {
  const sitemap = read('sitemap.xml');
  const locs = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((match) => match[1]);
  assert.equal(locs.length, 32);
  assert.equal(new Set(locs).size, locs.length);
  assert.ok(locs.every((loc) => loc.startsWith(site + '/') && !loc.endsWith('.html')));
  const expected = [...routes.filter((row) => row.indexable).map((row) => site + row.canonical), site + '/events', site + '/gallery'].sort();
  assert.deepEqual(locs.sort(), expected);
  const searchText = read('assets/js/search-index.js');
  const search = JSON.parse(searchText.slice(searchText.indexOf('=') + 1, searchText.lastIndexOf(';')));
  assert.ok(search.every((row) => !mapping.has('/' + String(row.u || '').replace(/^\//, '').split(/[?#]/)[0])));
  const kb = JSON.parse(read('assets/data/kb.json'));
  assert.ok(kb.docs.every((row) => !mapping.has('/' + String(row.url || '').replace(/^\//, '').split(/[?#]/)[0])));
});

test('dynamic sitemap follows publication and media lifecycle without aliases, filters or pagination', async () => {
  const news = { id: 'n1', revision_id: 'r1', content_type: 'news', slug: 'fictional-current-story', canonical_path: '/news/fictional-current-story', published_at: '2026-10-27T01:00:00Z' };
  const event = { id: 'e1', revision_id: 'r2', content_type: 'event', slug: 'fictional-open-day', canonical_path: '/events/fictional-open-day', published_at: '2026-10-27T02:00:00Z' };
  const repository = {
    listEntries: async (type) => type === 'news' ? [news] : [event],
    media: async () => []
  };
  const enabled = await handlePublicContent(new Request('https://school.test/sitemap.xml'), { env: { PUBLIC_CMS_ENABLED: 'true', PUBLIC_CMS_MEDIA_ENABLED: 'false' }, repository });
  assert.equal(enabled.status, 200);
  assert.match(enabled.headers.get('content-type'), /application\/xml/);
  const xml = await enabled.text();
  assert.match(xml, /\/news\/fictional-current-story<\/loc>/);
  assert.match(xml, /\/events\/fictional-open-day<\/loc>/);
  assert.match(xml, /\/events<\/loc>/);
  assert.doesNotMatch(xml, /\/page\/|\/feed\.xml|\?q=|\/events\/archive<\/loc>/);
  assert.equal((xml.match(/fictional-current-story/g) || []).length, 1);

  const disabled = await handlePublicContent(new Request('https://school.test/sitemap.xml'), { env: { PUBLIC_CMS_ENABLED: 'false' }, repository: { listEntries: async () => { throw new Error('must not query'); } } });
  assert.equal(disabled.status, 200);
  assert.doesNotMatch(await disabled.text(), /fictional-current-story/);

  const escaped = sitemapXml([{ ...news, canonical_path: '/news/invalid&path' }]);
  assert.doesNotMatch(escaped, /invalid&path/);
});

test('human site map remains grouped and public pages have no exact duplicate main content', () => {
  const siteMap = read('explore.html');
  assert.match(siteMap, /Join Treasure Academy/);
  assert.match(siteMap, /<h2>Learning<\/h2>/);
  assert.match(siteMap, /<h2>For Families<\/h2>/);
  assert.match(siteMap, /<h2>Our School<\/h2>/);
  const seen = new Map();
  for (const row of routes) {
    const value = normalText(read(row.source.slice(1)));
    assert.ok(value.length > 80, `${row.source} is unexpectedly thin`);
    const former = seen.get(value);
    assert.equal(former, undefined, `${row.source} duplicates ${former}`);
    seen.set(value, row.source);
  }
});

test('cache and service-worker boundaries cannot conceal publication or sitemap changes', () => {
  const sw = read('sw.js');
  assert.match(sw, /treasure-v20261027-run11/);
  assert.match(sw, /function isDynamicPublicContent/);
  assert.match(sw, /news\|events\|gallery/);
  const core = sw.match(/const CORE = \[([\s\S]*?)\];/)?.[1] || '';
  assert.doesNotMatch(core.replace('/404.html', ''), /\.html/);
  assert.match(read('server/public-content.mjs'), /s-maxage=30/);
  assert.doesNotMatch(read('server/public-content.mjs'), /s-maxage=60, stale-while-revalidate=60/);
});
