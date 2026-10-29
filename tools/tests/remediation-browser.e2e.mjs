#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { handlePublicContent } from '../../server/public-content.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const EVIDENCE = path.resolve(ROOT, '..', 'release-evidence', 'remediation-20261028', 'browser');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/public-routes.json'), 'utf8'));
const cleanToSource = new Map(registry.routes.map((row) => [row.canonical, row.source]));
const sourceToClean = new Map(registry.routes.map((row) => [row.source, row.canonical]));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.xml': 'application/xml' };

async function dynamic(request, response, url) {
  if (!url.pathname.startsWith('/events') && !url.pathname.startsWith('/gallery')) return false;
  const rendered = await handlePublicContent(new Request(`http://example.test${url.pathname}${url.search}`, { method: request.method }), { env: {}, now: () => new Date('2026-10-28T12:00:00.000Z') });
  const headers = Object.fromEntries(rendered.headers.entries());
  const body = request.method === 'HEAD' ? null : Buffer.from(await rendered.arrayBuffer());
  response.writeHead(rendered.status, headers);
  response.end(body);
  return true;
}

function startServer() {
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://127.0.0.1');
      if (await dynamic(request, response, url)) return;
      const redirect = sourceToClean.get(url.pathname);
      if (redirect) { response.writeHead(308, { Location: redirect + url.search }); return response.end(); }
      const source = cleanToSource.get(url.pathname);
      const pathname = source || url.pathname;
      const file = path.resolve(ROOT, '.' + pathname);
      if (!file.startsWith(ROOT + path.sep)) { response.writeHead(403); return response.end('Forbidden'); }
      fs.readFile(file, (error, body) => {
        if (error) { response.writeHead(404, { 'Content-Type': 'text/plain' }); return response.end('Not found'); }
        response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
        response.end(body);
      });
    } catch (error) {
      response.writeHead(500, { 'Content-Type': 'text/plain' }); response.end(String(error));
    }
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function assertPage(page, base, route, width) {
  const response = await page.goto(base + route, { waitUntil: 'load' });
  assert.equal(response.status(), 200, `${route} at ${width}px`);
  assert.equal(await page.locator('h1').count(), 1, `${route} one H1 at ${width}px`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${route} overflow at ${width}px`);
  const broken = await page.locator('img').evaluateAll((images) => images.filter((image) => (image.complete && image.naturalWidth < 1) || !image.hasAttribute('alt') || !image.hasAttribute('width') || !image.hasAttribute('height')).map((image) => image.currentSrc || image.src));
  assert.deepEqual(broken, [], `${route} broken or underspecified images at ${width}px`);
  const reqTargets = await page.locator('a[href^="/request-centre"][target]').count();
  assert.equal(reqTargets, 0, `${route} must not open same-site Request Centre links in a new tab`);
}

const widths = [
  { label: 'desktop', width: 1440, height: 900 },
  { label: '959', width: 959, height: 900 },
  { label: '680', width: 680, height: 900 },
  { label: '390', width: 390, height: 844 },
  { label: '320', width: 320, height: 760 }
];
const routes = ['/', '/admissions', '/request-centre', '/search', '/contact', '/classes/primary-6', '/fees', '/shop'];

const { server, base } = await startServer();
const browser = await chromium.launch({ headless: true });
fs.mkdirSync(EVIDENCE, { recursive: true });
const results = [];
try {
  for (const scheme of ['light', 'dark']) {
    for (const viewport of widths) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, colorScheme: scheme, reducedMotion: 'reduce' });
      const page = await context.newPage();
      for (const route of routes) await assertPage(page, base, route, viewport.width);

      await page.goto(base + '/', { waitUntil: 'load' });
      const schoolName = await page.locator('.lite-brand strong').innerText();
      assert.equal(schoolName.trim(), 'TREASURE ACADEMY');
      const brandBox = await page.locator('.lite-brand').boundingBox();
      assert.ok(brandBox && brandBox.x >= -0.5 && brandBox.x + brandBox.width <= viewport.width + 0.5, `school name clipped at ${viewport.width}px ${scheme}`);
      const heroActions = page.locator('.hero-ctas');
      assert.equal(await heroActions.count(), 2);
      for (let index = 0; index < await heroActions.count(); index += 1) {
        assert.equal(await heroActions.nth(index).isVisible(), true);
        const heroBox = await heroActions.nth(index).boundingBox();
        assert.ok(heroBox && heroBox.x >= -0.5 && heroBox.x + heroBox.width <= viewport.width + 0.5, `hero actions overflow at ${viewport.width}px ${scheme}`);
      }
      const optionalHidden = await page.evaluate(() => [...document.querySelectorAll('#cmsNewsStrip[hidden],#cmsHomepageSecondary[hidden]')].every((node) => getComputedStyle(node).display === 'none'));
      assert.equal(optionalHidden, true);
      await page.screenshot({ path: path.join(EVIDENCE, `${viewport.label}-${scheme}.jpg`), type: 'jpeg', quality: 68 });

      if ((viewport.width === 320 && scheme === 'dark') || (viewport.width === 1440 && scheme === 'light')) {
        const audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        const serious = audit.violations.filter((item) => ['critical', 'serious'].includes(item.impact));
        assert.deepEqual(serious.map((item) => item.id), [], `${viewport.width}px ${scheme}: ${JSON.stringify(serious.map((item) => ({ id: item.id, nodes: item.nodes.map((node) => node.target) })))}`);
      }
      if (viewport.width === 320) {
        await page.goto(base + '/fees', { waitUntil: 'load' });
        assert.match(await page.locator('main').innerText(), /School fees \(per term\)\s*₦8,500/);
        assert.match(await page.locator('main').innerText(), /Nursery 2:\s*₦26,000 \+ ₦15,800 = ₦41,800/);
        await page.screenshot({ path: path.join(EVIDENCE, `fees-320-${scheme}.jpg`), type: 'jpeg', quality: 68 });
      }
      results.push({ scheme, width: viewport.width, routes: routes.length, overflow: false, brokenImages: 0 });
      console.log(`Checked ${viewport.width}px ${scheme}: ${routes.length} pages`);
      await context.close();
    }
  }

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto(base + '/admissions', { waitUntil: 'load' });
  assert.equal(await page.locator('#admissionOtpRequest').isVisible(), true);
  assert.equal(await page.locator('#admissionOtpVerify').isHidden(), true);

  await page.goto(base + '/request-centre', { waitUntil: 'load' });
  const requestTabs = page.locator('[role="tab"]');
  await requestTabs.nth(0).focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await requestTabs.nth(1).getAttribute('aria-selected'), 'true');
  assert.equal(await page.locator('#request-view-check').isVisible(), true);
  const focusStyle = await requestTabs.nth(1).evaluate((node) => ({ outline: getComputedStyle(node).outlineStyle, width: getComputedStyle(node).outlineWidth }));
  assert.notEqual(focusStyle.outline, 'none');
  assert.notEqual(focusStyle.width, '0px');

  await page.goto(base + '/classes/primary-1', { waitUntil: 'load' });
  assert.match(await page.locator('a[href^="/request-centre?type=class_enquiry"]').first().getAttribute('href'), /class=Primary%201/);
  const classTitleSize = parseFloat(await page.locator('h1').evaluate((node) => getComputedStyle(node).fontSize));
  assert.ok(classTitleSize <= 64, `class title remains oversized: ${classTitleSize}px`);

  for (const route of ['/events', '/events/archive', '/gallery']) {
    await page.goto(base + route, { waitUntil: 'load' });
    assert.equal(await page.locator('h1').count(), 1);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
  }
  assert.match(await page.locator('main').innerText(), /No gallery photos are published/);
  await context.close();

  fs.writeFileSync(path.join(EVIDENCE, 'matrix.json'), JSON.stringify({ date: '2026-10-28', results }, null, 2) + '\n');
  console.log(`Remediation browser matrix passed: ${results.length} viewport/theme combinations, ${results.reduce((sum, row) => sum + row.routes, 0)} page loads, keyboard tabs, hidden OTP stage and gate-off collections.`);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
