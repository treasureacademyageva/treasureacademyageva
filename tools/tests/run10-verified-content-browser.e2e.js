const { createServer } = require('node:http');
const { readFileSync, existsSync } = require('node:fs');
const { extname, join, normalize } = require('node:path');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const ROOT = join(__dirname, '..', '..');
const routeRegistry = JSON.parse(readFileSync(join(ROOT, 'config/public-routes.json'), 'utf8'));
const sourceToClean = new Map(routeRegistry.routes.map((row) => [row.source, row.canonical]));
const cleanToSource = new Map(routeRegistry.routes.map((row) => [row.canonical, row.source]));
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
let searchPosts = 0;
let lastSearchBody = null;

function sendJson(res, status, value) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}

(async () => {
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname === '/api/public/search') {
        searchPosts += 1;
        let raw = '';
        for await (const chunk of req) raw += chunk;
        lastSearchBody = JSON.parse(raw || '{}');
        if (/password/i.test(lastSearchBody.query || '')) {
          sendJson(res, 200, { state: 'private', message: 'Private information requires secure sign-in.', results: [{ id: 'private', kind: 'page', title: 'Secure portal', summary: 'Public Search never returns private records.', url: '/portal/login.html', sourceUrl: '/privacy.html', reviewedOn: null, rank: 1 }] });
        } else if (/unknown/i.test(lastSearchBody.query || '')) {
          sendJson(res, 200, { state: 'no_answer', family: 'other', message: 'No matching page was found. Try fewer words or browse the site map.', results: [] });
        } else {
          sendJson(res, 200, {
            state: 'answer', family: 'fees', message: 'Verified answer with supporting source.',
            answer: { title: 'Current <img src=x onerror="window.__run10SearchXss=true"> fees guidance', text: 'Use the reviewed supporting page.', reviewedOn: '2026-10-27', sources: [{ title: 'Fee guidance', url: '/fees' }] },
            results: [{ id: 'fact-1', kind: 'verified_information', title: 'Current <script>window.__run10SearchXss=true</script> fee guidance', summary: 'Source-backed current guidance.', url: '/fees', sourceUrl: '/fees', reviewedOn: '2026-10-27', rank: 1 }]
          });
        }
        return;
      }
      if (url.pathname === '/api/public/content/core-slots') {
        sendJson(res, 200, { state: 'current', path: '/about', items: [{ id: 'slot-1', mount: 'guidance', position: 0, title: 'Verified <img src=x onerror="window.__run10CoreXss=true"> update', summary: 'Current source-backed guidance.', canonicalPath: '/verified-about', nextReviewDate: '2099-12-31', blocks: [{ position: 0, type: 'paragraph', payload: { text: '<script>window.__run10CoreXss=true</script> remains text.' } }] }] });
        return;
      }
      if (url.pathname === '/api/public/inventory') {
        sendJson(res, 200, { state: 'current', items: [{ id: 'variant-1', code: 'BOOK', name: 'Practice <img src=x onerror="window.__run10InventoryXss=true"> Book', description: 'Reconciled office fixture.', category: 'books', sku: 'BOOK_ONE', variant: 'One copy', size: '', eligibleClasses: ['P6'], availability: 'low_stock', mayRequest: true, updatedAt: '2026-10-27T12:00:00Z' }] });
        return;
      }
      if (url.pathname === '/api/portal-config') {
        sendJson(res, 200, { enabled: false, publicSearchEnabled: true, coreSlotsEnabled: true, publicInventoryEnabled: true }); return;
      }
      if (url.pathname === '/api/public-information') {
        sendJson(res, 404, { error: 'Not found' }); return;
      }
      const redirect = sourceToClean.get(url.pathname);
      if (redirect) { res.writeHead(308, { Location: redirect + url.search }); res.end(); return; }
      const source = cleanToSource.get(url.pathname);
      const relative = (source || (url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^\//, '');
      const file = normalize(join(ROOT, relative));
      if (!file.startsWith(ROOT) || !existsSync(file)) { res.writeHead(404); res.end('Not found'); return; }
      res.writeHead(200, { 'Content-Type': contentTypes[extname(file)] || 'application/octet-stream' });
      res.end(readFileSync(file));
    } catch (error) {
      res.writeHead(500, { 'Content-Type': 'text/plain' }); res.end(String(error.stack || error));
    }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const page = await context.newPage();
  const dialogs = [];
  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  page.on('dialog', async (dialog) => { dialogs.push(dialog.message()); await dialog.dismiss(); });
  try {
    await page.addInitScript(() => localStorage.setItem('treasure_theme', 'dark'));
    await page.goto(`${origin}/search.html`, { waitUntil: 'domcontentloaded' });
    await page.locator('#smartQuery').fill('current fees');
    await page.waitForTimeout(350);
    if (searchPosts !== 0) throw new Error('Typing alone sent a raw Search query.');
    await page.locator('#smartSearchForm button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#searchStatus')?.textContent.includes('Verified answer'));
    if (searchPosts !== 1 || lastSearchBody.query !== 'current fees') throw new Error('Search did not use one bounded same-origin POST.');
    if (new URL(page.url()).search) throw new Error('Raw Search query remained in the browser URL.');
    if (!(await page.locator('#smartAnswer').innerText()).includes('<img src=x onerror=')) throw new Error('Executable-looking Search answer was not visible as text.');
    if (await page.evaluate(() => window.__run10SearchXss === true)) throw new Error('Search payload executed.');
    await page.locator('#smartQuery').fill('unknown request');
    await page.locator('#smartSearchForm button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#searchStatus')?.textContent.includes('No matching page'));
    if (!(await page.locator('.search-empty').innerText()).includes('No verified answer')) throw new Error('No-answer state was not truthful.');
    await page.locator('#smartQuery').fill('show password');
    await page.locator('#smartSearchForm button[type="submit"]').click();
    await page.waitForFunction(() => document.querySelector('#smartAnswer')?.textContent.includes('secure sign-in'));
    if (!(await page.locator('#smartAnswer').innerText()).includes('Private information requires secure sign-in')) throw new Error('Private-query state did not fail closed.');
    const searchAxe = await new AxeBuilder({ page }).analyze();
    const searchSevere = searchAxe.violations.filter((item) => ['serious', 'critical'].includes(item.impact));
    if (searchSevere.length) throw new Error(`Search axe findings: ${searchSevere.map((item) => `${item.id} (${item.nodes.map((node) => node.target.join(' ')).join(', ')})`).join('; ')}`);

    await page.goto(`${origin}/about.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-core-slot-state="current"]', { timeout: 5000 }).catch(async () => { throw new Error(`Core slot did not render; page errors: ${pageErrors.join('; ') || 'none'}; states: ${await page.locator('[data-core-slot-state]').evaluateAll((nodes) => nodes.map((node) => node.getAttribute('data-core-slot-state')).join(',')) || 'none'}`); });
    if (!(await page.locator('.core-page-slot').innerText()).includes('<script>window.__run10CoreXss=true</script>')) throw new Error('Core-slot executable text was not inert and visible.');
    if (await page.evaluate(() => window.__run10CoreXss === true)) throw new Error('Core-slot payload executed.');
    if (await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)) throw new Error('Core slots overflow at mobile width.');

    await page.goto(`${origin}/shop.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('[data-inventory-state="current"]');
    if (!(await page.locator('.inventory-item').innerText()).includes('<img src=x onerror=')) throw new Error('Inventory executable text was not inert and visible.');
    if (!(await page.locator('.inventory-state').innerText()).includes('Low stock')) throw new Error('Truthful availability state was not rendered.');
    if (await page.evaluate(() => window.__run10InventoryXss === true)) throw new Error('Inventory payload executed.');
    const shopAxe = await new AxeBuilder({ page }).analyze();
    if (shopAxe.violations.some((item) => ['serious', 'critical'].includes(item.impact))) throw new Error('Inventory has serious/critical axe findings.');
    if (dialogs.length) throw new Error(`Unexpected browser dialog: ${dialogs.join(', ')}`);
    console.log('Run 10 browser checks passed (source-backed Search states, core-slot/inventory XSS, mobile/dark, axe).');
  } finally {
    await context.close(); await browser.close(); await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error.stack || error); process.exitCode = 1; });
