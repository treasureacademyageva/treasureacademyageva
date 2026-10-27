const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { extname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const ROOT = join(__dirname, '..', '..');
const REV_NEWS = '91000000-0000-4000-8000-000000000001';
const REV_EVENT = '91000000-0000-4000-8000-000000000002';
const MEDIA_ID = '92000000-0000-4000-8000-000000000001';
const entries = [
  {
    id: '90000000-0000-4000-8000-000000000001', content_type: 'news', slug: 'browser-safety-fixture',
    canonical_path: '/news/browser-safety-fixture', published_at: '2026-10-27T10:00:00.000Z', revision_id: REV_NEWS,
    revision_number: 2, title: 'Browser <script>window.__run8Xss=true</script> fixture',
    summary: 'A generated non-child fixture for safe browser acceptance of public CMS rendering.', category: 'Test fixture', locale: 'en-NG',
    seo_title: 'Browser Safety Fixture — Treasure Academy', seo_description: 'Generated non-child local fixture for browser accessibility and security acceptance.',
    featured_media_id: MEDIA_ID, social_media_id: MEDIA_ID
  },
  {
    id: '90000000-0000-4000-8000-000000000002', content_type: 'event', slug: 'browser-event-fixture',
    canonical_path: '/events/browser-event-fixture', published_at: '2026-10-26T10:00:00.000Z', revision_id: REV_EVENT,
    revision_number: 1, title: 'Browser Event Fixture', summary: 'A generated fictional event with exact public date and lifecycle.',
    category: 'Test fixture', locale: 'en-NG', event_starts_at: '2026-11-01T09:00:00.000Z', event_ends_at: '2026-11-01T11:00:00.000Z',
    event_timezone: 'Africa/Lagos', event_status: 'scheduled', attendance_mode: 'in_person', event_venue: 'Generated Test Hall',
    event_public_address: 'Generated public test address', public_action_label: 'Contact the school', public_action_path: '/contact.html'
  }
];
const blocks = [
  { id: 'b1', revision_id: REV_NEWS, block_position: 0, block_type: 'paragraph', payload: { text: 'Text only <img src=x onerror="window.__run8Xss=true"> preview.' } },
  { id: 'b2', revision_id: REV_NEWS, block_position: 1, block_type: 'heading', payload: { text: 'What this verifies', level: 2 } },
  { id: 'b3', revision_id: REV_NEWS, block_position: 2, block_type: 'unordered_list', payload: { items: ['Server HTML is meaningful', 'Executable-looking text remains text'] } },
  { id: 'b4', revision_id: REV_NEWS, block_position: 3, block_type: 'image', payload: { asset_id: MEDIA_ID, alt: 'Generated fixture' } },
  { id: 'b5', revision_id: REV_EVENT, block_position: 0, block_type: 'paragraph', payload: { text: 'Exact event facts remain in the server-rendered page.' } }
];
const media = [{
  revision_id: REV_NEWS, placement: 'featured', placement_position: 0, caption: 'Generated abstract fixture', media_id: MEDIA_ID,
  provider: 'cloudinary', provider_asset_id: 'ta_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', media_type: 'image', title: 'Generated fixture',
  alt_text: 'Abstract green and gold generated test fixture with no person', attribution: 'Generated fixture', width: 1200, height: 800,
  duration_seconds: null, public_derivative_only: true, provider_version: 1700000002, original_format: 'png'
}];
const tags = [{ revision_id: REV_NEWS, tag_id: '93000000-0000-4000-8000-000000000001', slug: 'fixture', name: 'Fixture' }];
const repository = {
  async listEntries(type) { return entries.filter((entry) => entry.content_type === type); },
  async findEntry(type, slug) { return entries.find((entry) => entry.content_type === type && entry.slug === slug) || null; },
  async entriesBySlugs(slugs) { return entries.filter((entry) => slugs.includes(entry.slug)); },
  async blocks(ids) { return blocks.filter((block) => ids.includes(block.revision_id)); },
  async media(ids) { return media.filter((item) => ids.includes(item.revision_id)); },
  async tags(ids) { return tags.filter((tag) => ids.includes(tag.revision_id)); },
  async alias() { return null; }
};
const env = {
  PUBLIC_CMS_ENABLED: 'true', PUBLIC_CMS_MEDIA_ENABLED: 'true', PUBLIC_CMS_DOWNLOADS_ENABLED: 'false',
  CLOUDINARY_CLOUD_NAME: 'ecbad9xj', CLOUDINARY_API_SECRET: 'fictional-browser-secret-not-real'
};
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const contentTypes = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

(async () => {
  const { handlePublicContent } = await import(pathToFileURL(join(ROOT, 'server/public-content.mjs')).href);
  const server = createServer(async (req, res) => {
    try {
      const pathname = new URL(req.url, `http://${req.headers.host}`).pathname;
      if (pathname.startsWith('/assets/')) {
        const file = join(ROOT, pathname);
        const bytes = readFileSync(file);
        res.writeHead(200, { 'Content-Type': contentTypes[extname(file)] || 'application/octet-stream' });
        res.end(bytes);
        return;
      }
      if (pathname === '/contact.html') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<!doctype html><title>Contact</title><h1>Contact</h1>');
        return;
      }
      const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers });
      const response = await handlePublicContent(request, {
        env, repository, now: () => Date.parse('2026-10-27T12:00:00.000Z'),
        fetch: async () => new Response(png, { status: 200, headers: { 'Content-Type': 'image/png' } })
      });
      const headers = Object.fromEntries(response.headers.entries());
      res.writeHead(response.status, headers);
      res.end(response.body ? Buffer.from(await response.arrayBuffer()) : undefined);
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(String(error.stack || error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const dialogs = [];
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  try {
    await page.addInitScript(() => localStorage.setItem('treasure_theme', 'dark'));
    await page.goto(`${origin}/news/browser-safety-fixture`, { waitUntil: 'domcontentloaded' });
    if ((await page.locator('h1').innerText()).includes('<script>') !== true) throw new Error('Hostile title was not preserved as visible text.');
    if (await page.evaluate(() => window.__run8Xss === true)) throw new Error('Executable-looking CMS text ran in the browser.');
    if (dialogs.length) throw new Error(`Unexpected browser dialog: ${dialogs.join(', ')}`);
    if (!(await page.locator('main').innerText()).includes('Server HTML is meaningful')) throw new Error('Structured body content did not render.');
    if (!(await page.locator('.content-aside').innerText()).includes('1 min read')) throw new Error('Reading time did not render.');
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) throw new Error('News detail has horizontal overflow at mobile width.');
    if ((await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--d-bg').trim())).length < 3) throw new Error('Dark theme tokens are unavailable.');
    let findings = await new AxeBuilder({ page }).analyze();
    let severe = findings.violations.filter((finding) => ['serious', 'critical'].includes(finding.impact));
    if (severe.length) throw new Error(`News axe findings: ${severe.map((finding) => `${finding.id} (${finding.nodes.map((node) => node.target.join(' ')).join(', ')})`).join('; ')}`);

    await page.goto(`${origin}/events/browser-event-fixture`, { waitUntil: 'domcontentloaded' });
    if (!(await page.locator('.event-facts').innerText()).includes('1 November 2026 at 10:00')) throw new Error('Exact Lagos event time is absent.');
    if (!(await page.locator('[data-event-state]').innerText()).includes('days to go')) throw new Error('Event countdown fallback is absent.');

    await page.goto(`${origin}/gallery`, { waitUntil: 'domcontentloaded' });
    if (await page.locator('.gallery-card').count() !== 1) throw new Error('Gallery was not generated from the published media relationship.');
    await page.locator('.gallery-card a').click();
    await page.waitForLoadState('domcontentloaded');
    if (!(await page.locator('.gallery-source').innerText()).includes('Published source')) throw new Error('Gallery source link is absent.');
    if (await page.getByText('Download approved derivative').count()) throw new Error('Disabled public downloads were visible.');
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) throw new Error('Gallery detail has horizontal overflow at mobile width.');
    findings = await new AxeBuilder({ page }).analyze();
    severe = findings.violations.filter((finding) => ['serious', 'critical'].includes(finding.impact));
    if (severe.length) throw new Error(`Gallery axe findings: ${severe.map((finding) => `${finding.id} (${finding.nodes.map((node) => node.target.join(' ')).join(', ')})`).join('; ')}`);

    console.log('Run 8 public-content browser checks passed (SSR, XSS, lifecycle, gallery, dark/mobile, axe).');
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
