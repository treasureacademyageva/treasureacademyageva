import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { eventLifecycle, handlePublicContent, readingMinutes, relativeTime } from '../../server/public-content.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (path) => readFileSync(join(root, path), 'utf8');
const fixedNow = Date.parse('2026-10-27T12:00:00.000Z');
const revisionNews = '81000000-0000-4000-8000-000000000001';
const revisionEvent = '81000000-0000-4000-8000-000000000002';
const mediaId = '82000000-0000-4000-8000-000000000001';

const news = {
  id: '80000000-0000-4000-8000-000000000001', content_type: 'news', slug: 'fictional-safe-update',
  canonical_path: '/news/fictional-safe-update', published_at: '2026-10-27T10:00:00.000Z',
  revision_id: revisionNews, revision_number: 2, title: 'Fictional <script>alert(1)</script> Update',
  summary: 'A deliberately fictional public update used only for local acceptance testing.', category: 'School update',
  locale: 'en-NG', seo_title: 'Fictional Safe Update — Treasure Academy', seo_description: 'A fictional CMS update used to test safe server rendering without real school data.',
  featured_media_id: mediaId, social_media_id: mediaId
};
const event = {
  id: '80000000-0000-4000-8000-000000000002', content_type: 'event', slug: 'fictional-open-day',
  canonical_path: '/events/fictional-open-day', published_at: '2026-10-26T10:00:00.000Z',
  revision_id: revisionEvent, revision_number: 1, title: 'Fictional Open Day',
  summary: 'A fictional event used only to verify exact dates and lifecycle rendering.', category: 'Open day', locale: 'en-NG',
  event_starts_at: '2026-11-01T09:00:00.000Z', event_ends_at: '2026-11-01T11:00:00.000Z',
  event_timezone: 'Africa/Lagos', event_status: 'scheduled', attendance_mode: 'in_person',
  event_venue: 'Fictional Hall', event_public_address: 'Fictional public test address',
  public_action_label: 'Contact the school', public_action_path: '/contact.html'
};
const gallerySlug = `${news.slug}-media-${createHash('sha256').update(`${news.id}:${mediaId}`, 'utf8').digest('hex').slice(0, 12)}`;
const blocks = [
  { id: 'b1', revision_id: revisionNews, block_position: 0, block_type: 'paragraph', payload: { text: 'Safe body <img src=x onerror=alert(1)> remains text.' } },
  { id: 'b2', revision_id: revisionNews, block_position: 1, block_type: 'heading', payload: { text: 'What families should know', level: 2 } },
  { id: 'b3', revision_id: revisionNews, block_position: 2, block_type: 'unordered_list', payload: { items: ['First verified point', 'Second verified point'] } },
  { id: 'b4', revision_id: revisionNews, block_position: 3, block_type: 'image', payload: { asset_id: mediaId, alt: 'Fictional image' } },
  { id: 'b5', revision_id: revisionEvent, block_position: 0, block_type: 'paragraph', payload: { text: 'The exact fictional event date remains visible.' } }
];
const media = [
  { revision_id: revisionNews, placement: 'featured', placement_position: 0, caption: 'Fictional generated fixture', media_id: mediaId,
    provider: 'cloudinary', provider_asset_id: 'ta_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', media_type: 'image', title: 'Fictional fixture',
    alt_text: 'Abstract fictional school fixture with no identifiable person', attribution: 'Generated test fixture', width: 1200, height: 800,
    duration_seconds: null, public_derivative_only: true, provider_version: 1700000001, original_format: 'jpg' },
  { revision_id: revisionNews, placement: 'download', placement_position: 0, caption: 'Fictional generated fixture', media_id: mediaId,
    provider: 'cloudinary', provider_asset_id: 'ta_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', media_type: 'image', title: 'Fictional fixture',
    alt_text: 'Abstract fictional school fixture with no identifiable person', attribution: 'Generated test fixture', width: 1200, height: 800,
    duration_seconds: null, public_derivative_only: true, provider_version: 1700000001, original_format: 'jpg' }
];
const tags = [{ revision_id: revisionNews, tag_id: '83000000-0000-4000-8000-000000000001', slug: 'fictional', name: 'Fictional' }];

function repository(overrides = {}) {
  const allEntries = overrides.entries || [news, event];
  return {
    calls: [],
    async listEntries(type) { this.calls.push(['listEntries', type]); return allEntries.filter((entry) => entry.content_type === type); },
    async findEntry(type, slug) { this.calls.push(['findEntry', type, slug]); return allEntries.find((entry) => entry.content_type === type && entry.slug === slug) || null; },
    async entriesBySlugs(slugs) { return allEntries.filter((entry) => slugs.includes(entry.slug)); },
    async blocks(ids) { return blocks.filter((block) => ids.includes(block.revision_id)); },
    async media(ids) { return media.filter((item) => ids.includes(item.revision_id)); },
    async tags(ids) { return tags.filter((tag) => ids.includes(tag.revision_id)); },
    async alias(path) { return path === '/news/former-fictional-path' ? { alias_path: path, destination_path: news.canonical_path } : null; }
  };
}

const contentEnv = { PUBLIC_CMS_ENABLED: 'true', PUBLIC_CMS_MEDIA_ENABLED: 'false', PUBLIC_CMS_DOWNLOADS_ENABLED: 'false' };
const mediaEnv = {
  ...contentEnv, PUBLIC_CMS_MEDIA_ENABLED: 'true', CLOUDINARY_CLOUD_NAME: 'ecbad9xj',
  CLOUDINARY_API_SECRET: 'fictional-test-secret-not-real'
};

async function body(response) { return response.text(); }

test('Run 8 gates remain exact-true while reviewed News and empty collections retain honest gate-off fallbacks', async () => {
  const repo = repository();
  const legacy = await handlePublicContent(new Request('https://example.test/news'), { env: { PUBLIC_CMS_ENABLED: 'TRUE' }, repository: repo, now: () => fixedNow });
  assert.equal(legacy.status, 200);
  assert.match(await body(legacy), /News &amp; Updates/);
  assert.equal(legacy.headers.get('location'), null);
  assert.deepEqual(repo.calls, []);
  const eventOff = await handlePublicContent(new Request('https://example.test/events'), { env: {}, repository: repo, now: () => fixedNow });
  assert.equal(eventOff.status, 200);
  assert.match(await body(eventOff), /No current events are published/);
  assert.deepEqual(repo.calls, []);
  const rewrittenLegacy = await handlePublicContent(new Request('https://example.test/api/public-content?route=news-list'), { env: {}, repository: repo, now: () => fixedNow });
  assert.equal(rewrittenLegacy.status, 200);
  assert.match(await body(rewrittenLegacy), /News &amp; Updates/);
  assert.equal(rewrittenLegacy.headers.get('location'), null);
  const reviewedDetail = await handlePublicContent(new Request('https://example.test/api/public-content?route=news-detail&slug=2026-2027-admissions-open'), { env: {}, repository: repo, now: () => fixedNow });
  assert.equal(reviewedDetail.status, 200);
  assert.match(await body(reviewedDetail), /2026\/2027 Admissions/);
  const galleryOff = await handlePublicContent(new Request('https://example.test/gallery'), { env: contentEnv, repository: repo, now: () => fixedNow });
  assert.equal(galleryOff.status, 200);
  assert.match(await body(galleryOff), /No gallery photos are published/);
  assert.match(read('.env.example'), /^PUBLIC_CMS_ENABLED=false$/m);
  assert.match(read('.env.example'), /^PUBLIC_CMS_MEDIA_ENABLED=false$/m);
  assert.match(read('.env.example'), /^PUBLIC_CMS_DOWNLOADS_ENABLED=false$/m);
});

test('relative time, reading time and event lifecycle follow the approved deterministic thresholds', () => {
  assert.equal(relativeTime('2026-10-27T11:59:31Z', new Date(fixedNow)), 'Just now');
  assert.equal(relativeTime('2026-10-27T11:48:00Z', new Date(fixedNow)), '12 minutes ago');
  assert.equal(relativeTime('2026-10-27T08:00:00Z', new Date(fixedNow)), '4 hours ago');
  assert.equal(relativeTime('2026-10-26T11:00:00Z', new Date(fixedNow)), '1 day ago');
  assert.equal(relativeTime('2026-10-24T12:00:00Z', new Date(fixedNow)), '3 days ago');
  assert.equal(relativeTime('2026-10-16T12:00:00Z', new Date(fixedNow)), '1 week ago');
  assert.equal(relativeTime('2026-10-06T12:00:00Z', new Date(fixedNow)), '6 October 2026');
  assert.equal(readingMinutes([{ block_type: 'paragraph', payload: { text: `${'word '.repeat(226)}` } }]), 2);
  assert.equal(eventLifecycle({ event_status: 'scheduled', event_starts_at: '2026-11-01T12:00:00Z' }, new Date(fixedNow)).label, '5 days to go');
  assert.equal(eventLifecycle({ event_status: 'scheduled', event_starts_at: '2026-10-27T18:20:00Z' }, new Date(fixedNow)).label, 'Starts in 6 hours 20 minutes');
  assert.equal(eventLifecycle({ event_status: 'scheduled', event_starts_at: '2026-10-27T11:00:00Z', event_ends_at: '2026-10-27T13:00:00Z' }, new Date(fixedNow)).label, 'Happening now');
  assert.equal(eventLifecycle({ event_status: 'scheduled', event_starts_at: '2026-10-27T11:00:00Z' }, new Date(fixedNow)).label, 'Event start time passed — confirm current status');
  assert.equal(eventLifecycle({ event_status: 'cancelled', event_starts_at: '2026-11-01T12:00:00Z' }, new Date(fixedNow)).label, 'Event cancelled');
});

test('News detail is meaningful server HTML, escapes hostile text and emits matching metadata without engagement', async () => {
  const response = await handlePublicContent(new Request(`https://example.test${news.canonical_path}`), { env: contentEnv, repository: repository(), now: () => fixedNow });
  const html = await body(response);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/html/);
  assert.match(html, /<h1>Fictional &lt;script&gt;alert\(1\)&lt;\/script&gt; Update<\/h1>/);
  assert.match(html, /Safe body &lt;img src=x onerror=alert\(1\)&gt; remains text\./);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
  assert.match(html, /rel="canonical" href="https:\/\/www\.treasureacademyageva\.com\/news\/fictional-safe-update"/);
  assert.match(html, /property="og:image:alt" content="Treasure Academy, Ageva"/);
  assert.match(html, /name="twitter:image:alt" content="Treasure Academy, Ageva"/);
  assert.match(html, /"@type":"NewsArticle"/);
  assert.match(html, /"publisher":\{"@type":"Organization","name":"Treasure Academy, Ageva"/);
  assert.match(html, /1 min read/);
  assert.match(html, /Updated revision 2/);
  assert.doesNotMatch(html, /\blikes?\b|\bcomments?\b|view count/i);
  const rewritten = await handlePublicContent(new Request('https://example.test/api/public-content?route=news-detail&slug=fictional-safe-update'), { env: contentEnv, repository: repository(), now: () => fixedNow });
  assert.equal(rewritten.status, 200);
  assert.match(await body(rewritten), /canonical" href="https:\/\/www\.treasureacademyageva\.com\/news\/fictional-safe-update/);
});

test('every JSON-LD block parses after script-safe escaping, including ordinary u/digits and Unicode separators', async () => {
  const hostile = {
    ...news,
    title: 'Update 2026 u2089 </script> <>& line\u2028paragraph\u2029end',
    summary: 'Useful 2026 update with literal u, digits 2 0 8 9 and safe structured-data separators.'
  };
  const repo = repository({ entries: [hostile] });
  const response = await handlePublicContent(new Request(`https://example.test${hostile.canonical_path}`), { env: contentEnv, repository: repo, now: () => fixedNow });
  const html = await body(response);
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(scripts.length >= 2);
  const parsed = scripts.map((value) => JSON.parse(value));
  assert.ok(parsed.some((value) => value.name === hostile.title || value.headline === hostile.title));
  scripts.forEach((value) => {
    assert.doesNotMatch(value, /<\/script/i);
    assert.doesNotMatch(value, /undefined/);
    assert.doesNotMatch(value, /[\u2028\u2029]/u);
  });
});

test('Event pages expose exact Lagos facts, lifecycle fallback and matching Event JSON-LD', async () => {
  const response = await handlePublicContent(new Request(`https://example.test${event.canonical_path}`), { env: contentEnv, repository: repository(), now: () => fixedNow });
  const html = await body(response);
  assert.equal(response.status, 200);
  assert.match(html, /5 days to go/);
  assert.match(html, /1 November 2026 at 10:00/);
  assert.match(html, /Fictional Hall/);
  assert.match(html, /"@type":"Event"/);
  assert.match(html, /"startDate":"2026-11-01T09:00:00.000Z"/);
  assert.doesNotMatch(html, /"offers"/);
});

test('listing pagination, archive separation, feeds and one-hop slug aliases are server controlled', async () => {
  const current = await handlePublicContent(new Request('https://example.test/events'), { env: contentEnv, repository: repository(), now: () => fixedNow });
  assert.match(await body(current), /Fictional Open Day/);
  const archiveRepo = repository({ entries: [{ ...event, event_status: 'completed' }] });
  const archive = await handlePublicContent(new Request('https://example.test/events/archive'), { env: contentEnv, repository: archiveRepo, now: () => fixedNow });
  const archiveHtml = await body(archive);
  assert.match(archiveHtml, /Fictional Open Day/);
  assert.match(archiveHtml, /type="application\/rss\+xml"[^>]+href="\/events\/feed\.xml"/);
  assert.doesNotMatch(archiveHtml, /\/events\/archive\/feed\.xml/);
  const pageOne = await handlePublicContent(new Request('https://example.test/news/page/1'), { env: contentEnv, repository: repository(), now: () => fixedNow });
  assert.equal(pageOne.status, 308);
  assert.equal(pageOne.headers.get('location'), '/news');
  const alias = await handlePublicContent(new Request('https://example.test/news/former-fictional-path'), { env: contentEnv, repository: repository(), now: () => fixedNow });
  assert.equal(alias.status, 308);
  assert.equal(alias.headers.get('location'), news.canonical_path);
  const feed = await handlePublicContent(new Request('https://example.test/news/feed.xml'), { env: contentEnv, repository: repository(), now: () => fixedNow });
  const xml = await body(feed);
  assert.match(feed.headers.get('content-type'), /application\/rss\+xml/);
  assert.match(xml, /<guid isPermaLink="true">https:\/\/www\.treasureacademyageva\.com\/news\/fictional-safe-update<\/guid>/);
  assert.doesNotMatch(xml, /Safe body|provider_asset_id|consent/i);
});

test('Gallery is generated only from published relationships and always links back to its source', async () => {
  const response = await handlePublicContent(new Request('https://example.test/gallery'), { env: mediaEnv, repository: repository(), now: () => fixedNow });
  const html = await body(response);
  assert.equal(response.status, 200);
  assert.ok(html.includes(gallerySlug));
  assert.match(html, /Pictures and videos approved by the school and linked to their published News or Event page/);
  const detail = await handlePublicContent(new Request(`https://example.test/gallery/${gallerySlug}`), { env: mediaEnv, repository: repository(), now: () => fixedNow });
  const detailHtml = await body(detail);
  assert.match(detailHtml, /href="\/news\/fictional-safe-update"/);
  assert.match(detailHtml, /approved derivative download feature is currently unavailable/i);
  assert.doesNotMatch(detailHtml, /Download approved derivative/);
  assert.doesNotMatch(detailHtml, /82000000-0000|ta_aaaaaaaa/);

  const manyEntries = Array.from({ length: 25 }, (_, index) => ({
    ...news,
    id: `fictional-entry-${index}`,
    revision_id: `fictional-revision-${index}`,
    slug: `fictional-gallery-source-${index}`,
    canonical_path: `/news/fictional-gallery-source-${index}`,
    published_at: new Date(fixedNow - index * 60000).toISOString(),
    featured_media_id: `fictional-media-${index}`,
    social_media_id: null
  }));
  const manyMedia = manyEntries.map((entry, index) => ({
    ...media[0], revision_id: entry.revision_id, media_id: `fictional-media-${index}`,
    provider_asset_id: `ta_fictional_${index}`
  }));
  const manyRepo = repository({ entries: manyEntries });
  manyRepo.media = async (ids) => manyMedia.filter((item) => ids.includes(item.revision_id));
  const paged = await handlePublicContent(new Request('https://example.test/gallery?source=news'), { env: mediaEnv, repository: manyRepo, now: () => fixedNow });
  const pagedHtml = await body(paged);
  assert.match(pagedHtml, /aria-label="Gallery pagination"/);
  assert.match(pagedHtml, /href="\/gallery\?source=news&amp;page=2"/);
  assert.doesNotMatch(pagedHtml, /route=gallery-list/);
  assert.match(pagedHtml, /name="robots" content="noindex,follow"/);
});

test('safe derivative delivery rechecks the current relationship, hides the signed provider URL and gates downloads', async () => {
  let requestedUrl = '';
  let requestedRange = null;
  const fakeFetch = async (url, options = {}) => {
    requestedUrl = String(url);
    requestedRange = options.headers?.Range || null;
    return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'Content-Type': 'image/jpeg', ETag: 'fictional' } });
  };
  const asset = await handlePublicContent(new Request(`https://example.test/gallery/${gallerySlug}/asset?variant=content-640`), {
    env: mediaEnv, repository: repository(), now: () => fixedNow, fetch: fakeFetch
  });
  assert.equal(asset.status, 200);
  assert.equal(asset.headers.get('location'), null);
  assert.equal(asset.headers.get('cache-control'), 'public, max-age=60, s-maxage=60');
  assert.match(requestedUrl, /^https:\/\/res\.cloudinary\.com\/ecbad9xj\/image\/authenticated\/s--[A-Za-z0-9_-]{8}--\/c_limit,w_640/);
  const invalidMultipleRange = await handlePublicContent(new Request(`https://example.test/gallery/${gallerySlug}/asset?variant=content-640`, { headers: { Range: 'bytes=0-1,4-5' } }), {
    env: mediaEnv, repository: repository(), now: () => fixedNow, fetch: fakeFetch
  });
  assert.equal(invalidMultipleRange.status, 200);
  assert.equal(requestedRange, null);
  const validSingleRange = await handlePublicContent(new Request(`https://example.test/gallery/${gallerySlug}/asset?variant=content-640`, { headers: { Range: 'bytes=0-1023' } }), {
    env: mediaEnv, repository: repository(), now: () => fixedNow, fetch: fakeFetch
  });
  assert.equal(validSingleRange.status, 200);
  assert.equal(requestedRange, 'bytes=0-1023');
  const blocked = await handlePublicContent(new Request(`https://example.test/gallery/${gallerySlug}/download`), {
    env: mediaEnv, repository: repository(), now: () => fixedNow, fetch: fakeFetch
  });
  assert.equal(blocked.status, 404);
  const allowed = await handlePublicContent(new Request(`https://example.test/gallery/${gallerySlug}/download`), {
    env: { ...mediaEnv, PUBLIC_CMS_DOWNLOADS_ENABLED: 'true' }, repository: repository(), now: () => fixedNow, fetch: fakeFetch
  });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.headers.get('content-disposition'), `attachment; filename="treasure-academy-${gallerySlug}.jpg"`);
  assert.match(requestedUrl, /download-1600|fl_attachment/);
});

test('the consolidated renderer consumes fixed published-only projections and stays within the Function ceiling', () => {
  const source = read('server/public-content.mjs');
  const migration = read('supabase/migrations/20261027080000_public_content_delivery.sql');
  const functions = readdirSync(join(root, 'api')).filter((name) => name.endsWith('.mjs'));
  assert.equal(functions.length, 12);
  assert.match(source, /public_cms_published_entries/);
  assert.match(source, /public_cms_published_blocks/);
  assert.match(source, /public_cms_published_media/);
  assert.match(source, /public_cms_slug_redirects/);
  assert.doesNotMatch(source, /SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /public_content_views_daily|public_content_reactions|public_content_comments/);
  assert.match(migration, /provider_version,m\.original_format/);
  assert.doesNotMatch(migration, /consent_reference|provider_asset_uid|provider_etag|checksum_sha256|created_by/);
});

test('routing, service-worker and browser assets keep dynamic content network-first and inaccessible while gated off', () => {
  const vercel = JSON.parse(read('vercel.json'));
  const routes = vercel.rewrites.map((item) => item.source);
  for (const route of ['/news', '/news/:slug([a-z0-9-]+)', '/news/feed.xml', '/events', '/events/archive', '/events/:slug([a-z0-9-]+)', '/events/feed.xml', '/gallery', '/gallery/:slug([a-z0-9-]+-media-[a-f0-9]{12})', '/gallery/:slug([a-z0-9-]+-media-[a-f0-9]{12})/asset', '/gallery/:slug([a-z0-9-]+-media-[a-f0-9]{12})/download']) assert.ok(routes.includes(route), route);
  assert.ok(!routes.includes('/news/:slug'), 'Legacy .html News files must not be captured by the CMS rewrite');
  assert.match(read('sw.js'), /isDynamicPublicContent/);
  assert.match(read('sw.js'), /Public CMS responses are always network-only/);
  assert.match(read('assets/js/public-content.js'), /data-event-state/);
  assert.match(read('assets/css/public-content.css'), /prefers-reduced-motion/);
  assert.match(read('assets/css/public-content.css'), /forced-colors/);
  assert.match(read('assets/css/public-content.css'), /html\[data-theme="dark"\]/);
});
