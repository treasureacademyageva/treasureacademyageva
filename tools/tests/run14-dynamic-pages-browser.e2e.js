const { createServer } = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { extname, join, normalize } = require('node:path');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const ROOT = join(__dirname, '..', '..');
const registry = JSON.parse(readFileSync(join(ROOT, 'config/public-routes.json'), 'utf8'));
const sourceToClean = new Map(registry.routes.map((row) => [row.source, row.canonical]));
const cleanToSource = new Map(registry.routes.map((row) => [row.canonical, row.source]));
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml' };

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
function dynamicPayload(path) {
  if (path === '/about') return {
    state: 'current', path, mode: 'replace', page: {
      id: '11111111-1111-4111-8111-111111111111',
      title: 'Editable <img src=x onerror="window.__pageXss=true"> About Treasure Academy',
      summary: 'Leadership-approved content can change without a source deployment.', category: 'Our school',
      seoTitle: 'Editable About Page — Treasure Academy', seoDescription: 'Leadership-approved current public information.',
      nextReviewDate: '2099-12-31',
      media: [{ id: 'rejected-media', type: 'image', assetPath: 'https://unapproved.invalid/pupil.jpg', alt: 'Must not render', width: 1200, height: 675 }],
      blocks: [
        { position: 0, type: 'heading', payload: { level: 2, text: 'Current school profile' } },
        { position: 1, type: 'paragraph', payload: { text: '<script>window.__pageXss=true</script> remains harmless text.' } },
        { position: 2, type: 'table', payload: { headers: ['Item', 'Value'], rows: [['Status', 'Reviewed']] } },
        { position: 3, type: 'image', payload: { asset_id: 'rejected-media' } }
      ]
    }
  };
  if (path === '/admissions') return {
    state: 'current', path, mode: 'supplement', page: {
      id: '22222222-2222-4222-8222-222222222222', title: 'Current admissions guidance',
      summary: 'This reviewed notice supplements but cannot replace the secure admission tracker.', category: 'Admissions',
      seoTitle: 'Admissions — Treasure Academy', seoDescription: 'Current reviewed admissions guidance.',
      nextReviewDate: null, media: [], blocks: [{ position: 0, type: 'callout', payload: { style: 'info', text: 'Use the secure tracker for a new-pupil application only.' } }]
    }
  };
  return null;
}

(async () => {
  const server = createServer((req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/api/public/content/page-surface') {
        if (url.searchParams.get('path') === '/fees') return sendJson(res, 503, { state: 'unavailable' });
        const payload = dynamicPayload(url.searchParams.get('path'));
        return sendJson(res, payload ? 200 : 404, payload || { error: 'Not found' });
      }
      if (url.pathname.startsWith('/api/')) return sendJson(res, 404, { error: 'Not found' });
      const redirect = sourceToClean.get(url.pathname);
      if (redirect) { res.writeHead(308, { Location: redirect + url.search }); res.end(); return; }
      const source = cleanToSource.get(url.pathname);
      const relative = (source || (url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^\//, '');
      const file = normalize(join(ROOT, relative));
      if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': contentTypes[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch (error) { res.writeHead(500); res.end(String(error.stack || error)); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  let browser = null;
  let context = null;
  try {
    browser = await chromium.launch({ headless: true });
    context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.addInitScript(() => { localStorage.setItem('treasure_theme', 'dark'); window.__pageXss = false; });

    await page.goto(`${origin}/about`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-dynamic-page-state="current"]');
    if (await page.locator('h1').count() !== 1) throw new Error('Dynamic replacement must retain exactly one main H1.');
    if (!((await page.locator('h1').textContent()) || '').includes('<img src=x')) throw new Error('Hostile title was not rendered as text.');
    if (!((await page.locator('.dynamic-page__body').textContent()) || '').includes('<script>')) throw new Error('Hostile body was not rendered as text.');
    if (await page.evaluate(() => window.__pageXss === true)) throw new Error('Dynamic Page payload executed script.');
    if (await page.locator('main img[src="x"]').count()) throw new Error('Dynamic Page payload created hostile markup.');
    if (await page.locator('.dynamic-page-media').count()) throw new Error('An unapproved external media path was rendered.');
    if ((await page.title()) !== 'Editable About Page — Treasure Academy') throw new Error('Editable SEO title did not update.');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (overflow > 1) throw new Error(`Dynamic About overflowed by ${overflow}px.`);
    const axe = await new AxeBuilder({ page }).analyze();
    if (axe.violations.some((item) => ['serious', 'critical'].includes(item.impact))) throw new Error('Dynamic About has serious/critical axe violations.');

    await page.goto(`${origin}/admissions`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('.dynamic-page--supplement');
    if (await page.locator('h1').count() !== 1) throw new Error('Supplement must preserve the page H1.');
    if (await page.locator('#admissionOtpRequest').count() !== 1) throw new Error('Supplement removed the secure request form.');
    if (!(await page.locator('#admissionOtpVerify').evaluate((node) => node.hidden === true))) throw new Error('Supplement exposed the OTP verification stage.');
    if (!((await page.locator('.dynamic-page--supplement').textContent()) || '').includes('cannot replace the secure admission tracker')) throw new Error('Supplementary guidance did not render.');

    await page.goto(`${origin}/fees`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(250);
    if (await page.locator('[data-dynamic-page-state="current"]').count()) throw new Error('Unavailable Page service replaced the static fallback.');
    if (await page.locator('h1').count() !== 1) throw new Error('Static Fees fallback lost its H1.');
    if (errors.length) throw new Error(`Page errors: ${errors.join('; ')}`);
    console.log('Run 14 dynamic Page browser checks passed (replacement, safety-shell supplement, XSS, rejected media, SEO, mobile/dark, axe and fail-safe fallback).');
  } finally {
    if (context) await context.close();
    if (browser) await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
