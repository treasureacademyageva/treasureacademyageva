const { createServer } = require('node:http');
const { readFileSync } = require('node:fs');
const { extname, join } = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const ROOT = join(__dirname, '..', '..');
const ENTRY_ID = '99000000-0000-4000-8000-000000000001';
const REVISION_ID = '99000000-0000-4000-8000-000000000002';
const COMMENT_ID = '99000000-0000-4000-8000-000000000003';
const entry = {
  id: ENTRY_ID, content_type: 'news', slug: 'engagement-browser-fixture', canonical_path: '/news/engagement-browser-fixture',
  published_at: '2026-10-27T09:00:00Z', revision_id: REVISION_ID, revision_number: 1,
  title: 'Engagement Browser Fixture', summary: 'A fictional reviewed article used only for local browser acceptance.',
  category: 'Test fixture', locale: 'en-NG'
};
const repository = {
  async findEntry(type, slug) { return type === 'news' && slug === entry.slug ? entry : null; },
  async alias() { return null; },
  async blocks() { return [{ revision_id: REVISION_ID, block_position: 0, block_type: 'paragraph', payload: { text: 'Fictional browser engagement body.' } }]; },
  async media() { return []; }, async tags() { return []; }, async entriesBySlugs() { return []; },
  async engagement() { return { view_count: 12, like_count: 4, comment_count: 1 }; },
  async comments() { return [{ id: COMMENT_ID, body: '<img src=x onerror="window.__run9Xss=true"> stays text.', author_label: 'Verified Parent', created_at: '2026-10-27T10:00:00Z', updated_at: '2026-10-27T10:00:00Z' }]; }
};
const env = { PUBLIC_CMS_ENABLED: 'true', PUBLIC_CMS_MEDIA_ENABLED: 'false', PUBLIC_CMS_ENGAGEMENT_ENABLED: 'true', PUBLIC_CMS_COMMENTS_ENABLED: 'true' };
const contentTypes = { '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.woff2': 'font/woff2' };

(async () => {
  const { handlePublicContent } = await import(pathToFileURL(join(ROOT, 'server/public-content.mjs')).href);
  let views = 12;
  let viewPosts = 0;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/assets/')) {
        const file = join(ROOT, url.pathname);
        res.writeHead(200, { 'Content-Type': contentTypes[extname(file)] || 'application/octet-stream' });
        res.end(readFileSync(file));
        return;
      }
      if (url.pathname === '/api/portal-config') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ enabled: false }));
        return;
      }
      if (url.pathname === '/api/public/content/engagement') {
        if (req.method === 'POST') {
          let payload = '';
          for await (const chunk of req) payload += chunk;
          const body = JSON.parse(payload || '{}');
          if (body.operation === 'view') { viewPosts += 1; views = 13; }
          res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
          res.end(JSON.stringify({ recorded: body.operation === 'view', counts: { views, likes: 4, comments: 1, liked: false } }));
          return;
        }
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
        res.end(JSON.stringify({ available: true, commentsEnabled: true, signedIn: false, entry: { path: entry.canonical_path }, counts: { views, likes: 4, comments: 1, liked: false }, comments: await repository.comments(), myComments: [] }));
        return;
      }
      const request = new Request(`http://${req.headers.host}${req.url}`, { method: req.method, headers: req.headers });
      const response = await handlePublicContent(request, { env, repository, now: () => Date.parse('2026-10-27T12:00:00Z') });
      res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
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
    await page.goto(`${origin}${entry.canonical_path}`, { waitUntil: 'networkidle' });
    if (await page.locator('[data-view-count]').innerText() !== '12') throw new Error('Server aggregate view count was not rendered.');
    if (await page.locator('[data-like-count]').innerText() !== '4') throw new Error('Server aggregate like count was not rendered.');
    if (!(await page.locator('.content-comment').innerText()).includes('<img src=x onerror=')) throw new Error('Executable-looking comment did not remain visible text.');
    if (await page.evaluate(() => window.__run9Xss === true)) throw new Error('Executable-looking comment ran in the browser.');
    if (dialogs.length) throw new Error(`Unexpected browser dialog: ${dialogs.join(', ')}`);
    if (!(await page.locator('[data-like-button]').isDisabled())) throw new Error('Anonymous like control was not disabled.');
    if (await page.locator('[data-comment-form]').isVisible()) throw new Error('Anonymous comment form became visible.');
    if ((await page.locator('[data-comment-auth] a').getAttribute('href')) !== '/portal/login.html') throw new Error('Protected sign-in guidance is absent.');

    await page.waitForTimeout(4300);
    if (viewPosts !== 1) throw new Error(`Expected one delayed visible view post, received ${viewPosts}.`);
    if (await page.locator('[data-view-count]').innerText() !== '13') throw new Error('Authoritative post-view aggregate did not refresh.');
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) throw new Error('Engagement panel has horizontal overflow at mobile width.');
    const parsedStructuredData = await page.locator('script[type="application/ld+json"]').evaluateAll((scripts) => scripts.map((script) => JSON.parse(script.textContent)));
    if (parsedStructuredData.length < 2) throw new Error('Structured data did not parse in the browser.');
    const findings = await new AxeBuilder({ page }).analyze();
    const severe = findings.violations.filter((finding) => ['serious', 'critical'].includes(finding.impact));
    if (severe.length) throw new Error(`Run 9 axe findings: ${severe.map((finding) => `${finding.id} (${finding.nodes.map((node) => node.target.join(' ')).join(', ')})`).join('; ')}`);
    console.log('Run 9 browser checks passed (delayed views, anonymous controls, comment XSS, JSON-LD, dark/mobile, axe).');
  } finally {
    await context.close();
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
