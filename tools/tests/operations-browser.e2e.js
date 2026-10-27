#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const BASE = process.env.TA_TEST_BASE || 'http://127.0.0.1:4173/';

(async () => {
  const browser = await chromium.launch({ headless: true });
  let passed = 0;

  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  let createPayload = null;
  let statusPayload = null;
  await page.route('**/api/public-information', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not found"}' }));
  await page.route('**/api/requests/status', async (route) => {
    statusPayload = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      reference: 'TA-REQ-20261023-ABCD2345', requestType: 'fee_schedule', status: 'under_review', statusLabel: 'Under review',
      publicNote: 'Fictional status note.', submittedAt: '2026-10-23T10:00:00Z', updatedAt: '2026-10-23T11:00:00Z', resolvedAt: null
    }) });
  });
  await page.route('**/api/requests', async (route) => {
    createPayload = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({
      reference: 'TA-REQ-20261023-ABCD2345', trackingCode: 'ABCD-EFGH-JKLM-2345', status: 'received',
      statusLabel: 'Received by the school', submittedAt: '2026-10-23T10:00:00Z'
    }) });
  });

  const response = await page.goto(new URL('request-centre.html?type=fee_schedule', BASE).href, { waitUntil: 'domcontentloaded' });
  assert(response && response.status() < 400, 'Request Centre returns a document');
  assert.equal(await page.getByRole('heading', { level: 1, name: 'Request & Verification Centre' }).count(), 1, 'one Request Centre H1');
  assert.equal(await page.getByLabel('Request type').inputValue(), 'fee_schedule', 'workflow link preselects request type');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Request Centre has no mobile overflow');

  await page.getByLabel('Your name').fill('Fictional Requester');
  await page.getByLabel('Nigerian mobile number').fill('0906 393 2487');
  await page.getByLabel('Subject').fill('Fictional current fee request');
  await page.getByLabel('What do you need?').fill('Please provide fictional staging-only guidance.');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Create website reference' }).click();
  await page.getByRole('heading', { name: 'Request saved' }).waitFor();
  assert.equal(await page.locator('#created-reference').innerText(), 'TA-REQ-20261023-ABCD2345', 'success displays database reference');
  assert.equal(await page.locator('#created-tracking-code').innerText(), 'ABCD-EFGH-JKLM-2345', 'success displays one-time tracking code');
  assert.equal(createPayload.requestType, 'fee_schedule', 'create API receives structured type');
  assert.equal(createPayload.phone, '0906 393 2487', 'create API receives entered phone for server normalization');
  assert.equal('trackingCode' in createPayload, false, 'browser never chooses its tracking secret');
  passed += 1;

  await page.getByRole('tab', { name: 'Check a request' }).click();
  await page.getByLabel('Website reference').fill('TA-REQ-20261023-ABCD2345');
  await page.getByLabel('Private tracking code').fill('ABCD-EFGH-JKLM-2345');
  await page.getByRole('button', { name: 'Check status' }).click();
  await page.getByRole('heading', { name: 'Website request status' }).waitFor();
  assert.equal(await page.locator('#status-state').innerText(), 'Under review', 'matching private lookup renders status');
  assert.equal(statusPayload.reference, 'TA-REQ-20261023-ABCD2345', 'status API receives reference');
  assert.equal(statusPayload.trackingCode, 'ABCD-EFGH-JKLM-2345', 'status API receives private code only in POST body');
  assert.doesNotMatch(page.url(), /ABCD-EFGH|TA-REQ-20261023-ABCD2345/, 'tracking values never enter the URL');
  passed += 1;
  await context.close();

  const galleryContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const galleryPage = await galleryContext.newPage();
  await galleryPage.goto(new URL('index.html', BASE).href, { waitUntil: 'domcontentloaded' });
  const gallery = await galleryPage.locator('.gal-grid .gal').evaluateAll((nodes) => ({
    count: nodes.length,
    visible: nodes.filter((node) => getComputedStyle(node).display !== 'none' && node.getBoundingClientRect().width > 0).length
  }));
  assert(gallery.count >= 4, `homepage contains at least four gallery items (${gallery.count})`);
  assert(gallery.visible >= 4, `mobile displays all four gallery items (${gallery.visible})`);
  passed += 1;
  await galleryContext.close();

  await browser.close();
  console.log(`OPERATIONS BROWSER QA: ${passed}/${passed} request/status/gallery scenarios passed`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
