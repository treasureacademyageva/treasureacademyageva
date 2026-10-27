#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require('playwright');
const { AxeBuilder } = require('@axe-core/playwright');

const ROOT = path.join(__dirname, '..', '..');
const registry = JSON.parse(fs.readFileSync(path.join(ROOT, 'config/public-routes.json'), 'utf8'));
const cleanToSource = new Map(registry.routes.map((row) => [row.canonical, row.source]));
const sourceToClean = new Map(registry.routes.map((row) => [row.source, row.canonical]));
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.woff2': 'font/woff2', '.xml': 'application/xml' };

function startCleanRouteServer() {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url, 'http://127.0.0.1');
    const redirect = sourceToClean.get(requestUrl.pathname);
    if (redirect) {
      response.writeHead(308, { Location: redirect + requestUrl.search, 'Cache-Control': 'no-store' });
      return response.end();
    }
    const source = cleanToSource.get(requestUrl.pathname);
    const pathname = source || requestUrl.pathname;
    const file = path.resolve(ROOT, '.' + pathname);
    if (!file.startsWith(ROOT + path.sep)) {
      response.writeHead(403); return response.end('Forbidden');
    }
    fs.readFile(file, (error, body) => {
      if (error) { response.writeHead(404, { 'Content-Type': 'text/plain' }); return response.end('Not found'); }
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      response.end(body);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, base: `http://127.0.0.1:${server.address().port}/` }));
  });
}

(async () => {
  const { server, base } = await startCleanRouteServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark', reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.addInitScript(() => {
      window.__taaLayoutShift = 0;
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__taaLayoutShift += entry.value;
      }).observe({ type: 'layout-shift', buffered: true });
    });

    let formerRequests = 0;
    page.on('request', (request) => { if (new URL(request.url()).pathname === '/about.html') formerRequests += 1; });
    await page.goto(new URL('/about.html', base).href, { waitUntil: 'domcontentloaded' });
    assert.equal(new URL(page.url()).pathname, '/about');
    assert.equal(formerRequests, 1, 'former URL redirects in one request hop');
    assert.equal(await page.locator('link[rel="canonical"]').getAttribute('href'), 'https://www.treasureacademyageva.com/about');
    assert.equal(await page.locator('meta[property="og:url"]').getAttribute('content'), 'https://www.treasureacademyageva.com/about');
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    const aboutAxe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const seriousAbout = aboutAxe.violations.filter((item) => ['critical', 'serious'].includes(item.impact));
    assert.equal(seriousAbout.length, 0, JSON.stringify(seriousAbout.map((item) => ({ id: item.id, impact: item.impact, nodes: item.nodes.map((node) => node.target) }))));

    await page.goto(new URL('/site-map', base).href, { waitUntil: 'domcontentloaded' });
    assert.match(await page.locator('h1').innerText(), /Find the Right Page|Site Map/i);
    const formerPublicLinks = await page.locator('a').evaluateAll((links, former) => links.map((link) => new URL(link.href).pathname).filter((pathname) => former.includes(pathname)), [...sourceToClean.keys()]);
    assert.deepEqual(formerPublicLinks, []);
    for (const label of ['Join Treasure Academy', 'Learning', 'For Families', 'Our School']) {
      assert.equal(await page.getByText(label, { exact: true }).count() > 0, true, label);
    }
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);

    await page.goto(new URL('/admissions', base).href, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(150);
    const perf = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0];
      const resources = performance.getEntriesByType('resource');
      return {
        dom: nav ? nav.domContentLoadedEventEnd - nav.startTime : 99999,
        transfer: resources.reduce((sum, row) => sum + (row.transferSize || row.encodedBodySize || 0), 0),
        cls: window.__taaLayoutShift || 0,
        overflow: document.documentElement.scrollWidth > innerWidth + 1
      };
    });
    assert.ok(perf.dom < 2500, `DOMContentLoaded budget exceeded: ${perf.dom}`);
    assert.ok(perf.transfer < 1_750_000, `page transfer budget exceeded: ${perf.transfer}`);
    assert.ok(perf.cls < 0.1, `layout-shift budget exceeded: ${perf.cls}`);
    assert.equal(perf.overflow, false);

    await context.close();
    const desktop = await browser.newContext({ viewport: { width: 1366, height: 900 }, colorScheme: 'light' });
    const desktopPage = await desktop.newPage();
    await desktopPage.goto(new URL('/classes/primary-6', base).href, { waitUntil: 'domcontentloaded' });
    assert.equal(await desktopPage.locator('h1').count(), 1);
    assert.equal(await desktopPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true);
    const axe = await new AxeBuilder({ page: desktopPage }).withTags(['wcag2a', 'wcag2aa']).analyze();
    assert.equal(axe.violations.filter((item) => ['critical', 'serious'].includes(item.impact)).length, 0);
    await desktop.close();
    console.log('Run 11 browser checks passed (one-hop clean routes, canonical/site-map agreement, mobile/dark, performance budgets and axe).');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
})().catch((error) => { console.error(error); process.exit(1); });
