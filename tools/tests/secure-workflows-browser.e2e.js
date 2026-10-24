#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const BASE = process.env.TA_TEST_BASE || 'http://127.0.0.1:4173/';
function token(payload) {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode(payload)}.fictional-signature`;
}
(async () => {
  const browser = await chromium.launch({ headless: true });
  let passed = 0;

  const admission = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const admissionPage = await admission.newPage();
  let requestPayload;
  let verifyPayload;
  await admissionPage.route('**/api/public-information', (route) => route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"Not found"}' }));
  await admissionPage.route('**/api/admission/track/request', async (route) => {
    requestPayload = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 202, contentType: 'application/json', body: JSON.stringify({
      accepted: true, requestToken: 'opaque-request-token-that-is-long-enough-123456', expiresInSeconds: 300,
      message: 'If this registered phone has an eligible new-pupil application, an authorised dispatcher will send the code using the chosen channel.'
    }) });
  });
  await admissionPage.route('**/api/admission/track/verify', async (route) => {
    verifyPayload = JSON.parse(route.request().postData() || '{}');
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
      verified: true,
      applications: [{ reference: 'TA-ADM-20990120-AAAA1111', childName: 'Fictional New Applicant', requestedClass: 'Nursery 1', status: 'under_review', message: 'The fictional application is under review.', nextStep: 'Wait for the fictional office review.', updatedAt: '2099-01-20T10:00:00Z' }],
      portalContinuationTokens: ['opaque-continuation-token-that-is-long-enough-654321'], portalLoginAvailable: true
    }) });
  });
  await admissionPage.goto(new URL('admissions.html#tracker', BASE).href, { waitUntil: 'networkidle' });
  assert.equal(await admissionPage.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await admissionPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true);
  await admissionPage.locator('#admissionPhone').fill('0803 000 0000');
  await admissionPage.locator('input[name="admissionChannel"][value="whatsapp"]').check();
  await admissionPage.getByLabel('I confirm this registered phone number is enabled for WhatsApp.').check();
  await admissionPage.getByRole('button', { name: 'Request a five-minute code' }).click();
  assert.deepEqual(requestPayload, { phone: '0803 000 0000', channel: 'whatsapp', whatsappConfirmed: true });
  await admissionPage.getByLabel('Six-digit code').fill('123456');
  await admissionPage.getByRole('button', { name: 'Check application status' }).click();
  await admissionPage.getByRole('heading', { name: 'Application status' }).waitFor();
  assert.equal(await admissionPage.getByRole('heading', { name: 'Fictional New Applicant' }).count(), 1);
  assert.match(await admissionPage.locator('#admissionTrackingResult').innerText(), /Only unlinked new-pupil applications are shown here/);
  assert.deepEqual(verifyPayload, { requestToken: 'opaque-request-token-that-is-long-enough-123456', code: '123456' });
  assert.doesNotMatch(admissionPage.url(), /opaque|123456|TA-ADM/);
  assert.equal(await admissionPage.evaluate(() => JSON.parse(sessionStorage.getItem('taa_admission_continuations') || '[]').length), 1);
  assert.equal(await admissionPage.locator('a[href="/portal/login.html"]').count() > 0, true);
  passed += 1;
  await admission.close();

  const searchContext = await browser.newContext({ viewport: { width: 900, height: 700 } });
  const search = await searchContext.newPage();
  await search.route('**/api/public-information', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: [{ topic: 'calendar', title: 'Verified fictional calendar', summary: 'Fictional first term resumes 4 January 2099.', detail: '', revision: 'TEST-1' }] }) }));
  await search.goto(new URL('search.html', BASE).href, { waitUntil: 'networkidle' });
  await search.getByLabel('What do you need?').fill('When is term resumption?');
  await search.getByRole('button', { name: 'Search', exact: true }).click();
  assert.equal(await search.getByRole('heading', { name: 'Verified fictional calendar' }).count(), 1);
  assert.match(await search.locator('#smartAnswer').innerText(), /4 January 2099/);
  assert.equal(await search.locator('#smartResults .search-result').count() > 0, true);
  assert.doesNotMatch(search.url(), /resumption|When/);
  passed += 1;
  await searchContext.close();

  const developerContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const developer = await developerContext.newPage();
  const now = Math.floor(Date.now() / 1000);
  const accessToken = token({ sub: '10000000-0000-4000-8000-000000000001', session_id: '90000000-0000-4000-8000-000000000001', role: 'authenticated', exp: now + 3600 });
  const dashboard = {
    profile: { fullName: 'Fictional Developer' },
    capabilities: { console_access: true, otp_dispatch: true, information_review: true, system_health_read: true },
    operations: { otpQueue: 1, otpByStatus: { queued: 1 }, sessionValidation: 'current' },
    admissions: { totalApplications: 2, unlinkedApplications: 1, convertedApplications: 1, byStatus: { under_review: 1, admitted: 1 }, bySource: { online_self_service: 1, school_assisted: 1 } },
    information: { updateRequests: 1, openUpdateRequests: 1, publicationTopics: 2, byStatus: { published: 2 }, stalePublications: 0 },
    gates: { portal: true, accounts: true, admissionTracking: true, developerConsole: true, publicInformation: true, websiteRequests: true, monnifyWebhook: false },
    generatedAt: new Date().toISOString()
  };
  const challengeId = '70000000-0000-4000-8000-000000000001';
  const queue = [{ id: challengeId, phone_last4: '0102', channel: 'sms', status: 'queued', requested_at: new Date().toISOString(), expires_at: new Date(Date.now() + 300000).toISOString(), revealed_at: null, sent_at: null }];
  const dispatchActions = [];
  let otpGetCount = 0;
  await developer.route('**/api/portal-config', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ enabled: true, url: 'https://fictional.supabase.co', publishableKey: 'fictional-publishable-key' }) }));
  await developer.route('https://fictional.supabase.co/auth/v1/token**', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ access_token: accessToken, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'fictional-refresh', user: { id: '10000000-0000-4000-8000-000000000001', phone: '+2348000000001', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} } }) }));
  await developer.route('https://fictional.supabase.co/auth/v1/user', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: '10000000-0000-4000-8000-000000000001', phone: '+2348000000001', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }) }));
  await developer.route('**/api/developer/console', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(dashboard) }));
  await developer.route('**/api/developer/otp', async (route) => {
    if (route.request().method() === 'GET') {
      otpGetCount += 1;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ queue }) });
    }
    const action = JSON.parse(route.request().postData() || '{}');
    dispatchActions.push(action.action);
    if (action.action === 'reveal') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ challengeId, channel: 'sms', phone: '+2348000000102', message: 'Treasure Academy admission tracking code: 123456. It expires in 5 minutes.', clearAfterSeconds: 30 }) });
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"ok":true}' });
  });
  await developer.goto(new URL('developer.html', BASE).href, { waitUntil: 'networkidle' });
  await developer.getByLabel('Nigerian phone number').fill('0800 000 0001');
  await developer.getByLabel('Password').fill('Fictional!Password1');
  await developer.getByRole('button', { name: 'Sign in' }).click();
  await developer.getByRole('heading', { name: 'Developer control room' }).waitFor();
  await developer.locator('#otpQueue [data-reveal]').waitFor();
  assert.equal(await developer.locator('#otpQueue [data-reveal]').count(), 1);
  await developer.locator('#otpQueue [data-reveal]').click();
  await developer.locator('#revealMessage').waitFor();
  assert.match(await developer.locator('#revealMessage').innerText(), /123456/);
  assert.equal(dispatchActions.includes('reveal'), true);
  await developer.getByRole('button', { name: 'Mark sent' }).click();
  await developer.waitForFunction(() => document.querySelector('#secureReveal')?.textContent.includes('cleared from this page'));
  assert.equal(dispatchActions.includes('marked_sent'), true);
  assert.equal(await developer.locator('#revealMessage').count(), 0);
  assert.match(await developer.locator('#secureReveal').innerText(), /cleared from this page/i);
  assert.equal(await developer.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2), true);
  passed += 1;

  dashboard.capabilities = { console_access: true, otp_dispatch: false, information_review: false, system_health_read: false };
  dashboard.operations = { otpQueue: null, otpByStatus: null, sessionValidation: 'current' };
  dashboard.information = null;
  dashboard.gates = null;
  const otpGetsBeforeRestrictedReload = otpGetCount;
  await developer.reload({ waitUntil: 'networkidle' });
  await developer.getByRole('heading', { name: 'Developer control room' }).waitFor();
  assert.equal(await developer.getByText(/No data from this category was queried or returned/).count(), 2);
  assert.match(await developer.locator('#otpQueue').innerText(), /does not have OTP dispatch capability/i);
  assert.equal(otpGetCount, otpGetsBeforeRestrictedReload, 'restricted console must not request the protected OTP queue');
  passed += 1;
  await developerContext.close();

  await browser.close();
  console.log(`SECURE WORKFLOWS BROWSER QA: ${passed}/${passed} scenarios passed`);
})().catch((error) => { console.error(error.stack || error); process.exit(1); });
