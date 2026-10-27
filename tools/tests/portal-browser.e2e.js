#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const BASE = process.env.TA_TEST_BASE || 'http://127.0.0.1:4173/';
const FICTIONAL_USER_ID = '10000000-0000-4000-8000-000000000003';
const FICTIONAL_SESSION_ID = '90000000-0000-4000-8000-000000000001';
const jwtPart = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const FICTIONAL_ACCESS_TOKEN = `${jwtPart({ alg: 'none', typ: 'JWT' })}.${jwtPart({ sub: FICTIONAL_USER_ID, aud: 'authenticated', role: 'authenticated', session_id: FICTIONAL_SESSION_ID, exp: Math.floor(Date.now() / 1000) + 3600 })}.fictional`;
const corsHeaders = { 'access-control-allow-origin': '*', 'content-type': 'application/json' };
function fictionalSession() {
  return {
    access_token: FICTIONAL_ACCESS_TOKEN,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: 'fictional-refresh-token',
    user: {
      id: FICTIONAL_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      phone: '+2349063932487',
      phone_confirmed_at: new Date().toISOString(),
      app_metadata: { provider: 'phone', providers: ['phone'] },
      user_metadata: {},
      created_at: new Date().toISOString()
    }
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  let passed = 0;

  for (const width of [320, 390, 1024]) {
    const context = await browser.newContext({ viewport: { width, height: 800 }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.route('**/api/portal-config', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ enabled: true, url: 'https://fictional-project.supabase.co', publishableKey: 'fictional-browser-key' })
    }));
    let authRequestBody = '';
    await page.route('https://fictional-project.supabase.co/auth/v1/token**', (route) => {
      authRequestBody = route.request().postData() || '';
      return route.fulfill({
      status: 400,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' })
      });
    });

    const response = await page.goto(new URL('portal/login.html', BASE).href, { waitUntil: 'domcontentloaded' });
    assert(response && response.status() < 400, `portal HTTP at ${width}`);
    await page.getByRole('heading', { level: 1, name: 'Welcome back' }).waitFor();
    assert.equal(await page.locator('h1').count(), 1, `one h1 at ${width}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no horizontal page overflow at ${width}`);
    assert.equal(await page.getByLabel('Nigerian phone number').count(), 1, `phone label at ${width}`);
    assert.equal(await page.getByLabel('Password').count(), 1, `password label at ${width}`);
    assert.match(await page.locator('.portal-banner').innerText(), /approved bank transfer or the physical school-office POS/i);
    assert.match(await page.locator('.trust-panel').innerText(), /payment can never approve an admission/i);

    const controlHeights = await page.locator('input, button.button').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    assert(controlHeights.every((height) => height >= 48), `48px portal controls at ${width}: ${controlHeights.join(',')}`);

    await page.getByLabel('Nigerian phone number').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('input[name="password"]')), true, `logical focus order at ${width}`);

    if (width === 390) {
      await page.getByLabel('Nigerian phone number').fill('0906 393 2487');
      await page.getByLabel('Password').fill('fictional-password');
      await page.getByRole('button', { name: 'Sign in securely' }).click();
      await page.getByRole('alert').filter({ hasText: 'could not sign you in' }).waitFor();
      assert.match(authRequestBody, /"phone":"\+2349063932487"/, 'login sends canonical Nigerian E.164 phone');
      assert.doesNotMatch(authRequestBody, /"email"/, 'login does not send an email identifier');
      assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('input[name="password"]')), true, 'failed sign-in returns focus to password');
      const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
      const serious = axe.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact));
      assert.deepEqual(serious.map((violation) => violation.id), [], 'enabled login has no serious/critical Axe findings');
    }

    await context.close();
    passed += 1;
  }

  const inactiveContext = await browser.newContext({ viewport: { width: 390, height: 844 }, colorScheme: 'dark' });
  const inactive = await inactiveContext.newPage();
  await inactive.route('**/api/portal-config', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"enabled":false}' }));
  await inactive.goto(new URL('portal/login.html', BASE).href, { waitUntil: 'domcontentloaded' });
  await inactive.getByRole('heading', { level: 1, name: 'Your school portal is being securely reconnected' }).waitFor();
  assert.match(await inactive.locator('.alert').innerText(), /Preserve first, then reconnect/i);
  assert.equal(await inactive.locator('html').getAttribute('data-theme'), 'dark');
  await inactiveContext.close();
  passed += 1;

  const passwordContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const passwordPage = await passwordContext.newPage();
  let profileActive = false;
  let privateDataCallsBeforeChange = 0;
  await passwordPage.route('**/api/portal-config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ enabled: true, url: 'https://fictional-project.supabase.co', publishableKey: 'fictional-browser-key' })
  }));
  await passwordPage.route('**/api/account/change-password', (route) => {
    profileActive = true;
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"status":"active"}' });
  });
  await passwordPage.route('https://fictional-project.supabase.co/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/auth/v1/token') {
      return route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(fictionalSession()) });
    }
    if (url.pathname === '/rest/v1/profiles') {
      return route.fulfill({
        status: 200,
        headers: corsHeaders,
        body: JSON.stringify({
          id: FICTIONAL_USER_ID,
          role: 'parent',
          full_name: 'Fictional Parent',
          active: true,
          account_status: profileActive ? 'active' : 'pending_activation',
          must_change_password: !profileActive,
          phone_e164: '+2349063932487'
        })
      });
    }
    if (url.pathname.startsWith('/rest/v1/')) {
      if (!profileActive) privateDataCallsBeforeChange += 1;
      return route.fulfill({ status: 200, headers: corsHeaders, body: '[]' });
    }
    return route.fulfill({ status: 404, headers: corsHeaders, body: '{}' });
  });
  await passwordPage.goto(new URL('portal/login.html', BASE).href, { waitUntil: 'domcontentloaded' });
  await passwordPage.getByLabel('Nigerian phone number').fill('0906 393 2487');
  await passwordPage.getByLabel('Password').fill('Temporary7!Password');
  await passwordPage.getByRole('button', { name: 'Sign in securely' }).click();
  await passwordPage.getByRole('heading', { level: 1, name: 'Choose a new password' }).waitFor();
  assert.equal(privateDataCallsBeforeChange, 0, 'pending account loads no school record tables');
  assert.match(await passwordPage.locator('.alert').innerText(), /records remain locked/i);
  await passwordPage.getByLabel('New password', { exact: true }).fill('New-Fictional7!Password');
  await passwordPage.getByLabel('Confirm new password').fill('New-Fictional7!Password');
  await passwordPage.getByRole('button', { name: 'Set my new password' }).click();
  await passwordPage.getByRole('heading', { name: 'Add a child' }).waitFor();
  assert.equal(await passwordPage.getByRole('button', { name: 'Add a Child' }).getAttribute('aria-current'), 'page', 'first parent activation opens child onboarding');
  assert.equal(await passwordPage.evaluate(() => Object.keys(localStorage).some((key) => key.includes('auth-token'))), false, 'auth session is not persisted in localStorage');
  assert.equal(await passwordPage.evaluate(() => Object.keys(sessionStorage).some((key) => key.includes('auth-token'))), true, 'auth session is persisted only in sessionStorage');
  await passwordContext.close();
  passed += 1;

  const parentContext = await browser.newContext({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const parentPage = await parentContext.newPage();
  let matchBody = null;
  let linkBody = null;
  let admissionBody = null;
  await parentPage.route('**/api/portal-config', (route) => route.fulfill({
    status: 200, contentType: 'application/json',
    body: JSON.stringify({ enabled: true, url: 'https://fictional-project.supabase.co', publishableKey: 'fictional-browser-key' })
  }));
  await parentPage.route('**/api/parent/pupil-match', (route) => {
    matchBody = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"matched":true}' });
  });
  await parentPage.route('**/api/parent/pupil-link', (route) => {
    linkBody = JSON.parse(route.request().postData() || '{}');
    return route.fulfill({ status: 200, contentType: 'application/json', body: '{"linked":true,"alreadyLinked":false}' });
  });
  await parentPage.route('https://fictional-project.supabase.co/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/auth/v1/token') return route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(fictionalSession()) });
    if (url.pathname === '/rest/v1/profiles') return route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ id: FICTIONAL_USER_ID, role: 'parent', leadership_scope: 'none', full_name: 'Fictional Parent', active: true, account_status: 'active', must_change_password: false, phone_e164: '+2349063932487' }) });
    if (url.pathname === '/rest/v1/admission_applications' && request.method() === 'POST') {
      admissionBody = JSON.parse(request.postData() || '{}');
      return route.fulfill({ status: 201, headers: corsHeaders, body: '[]' });
    }
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ status: 200, headers: corsHeaders, body: '[]' });
    return route.fulfill({ status: 404, headers: corsHeaders, body: '{}' });
  });
  await parentPage.goto(new URL('portal/login.html', BASE).href, { waitUntil: 'domcontentloaded' });
  await parentPage.getByLabel('Nigerian phone number').fill('0906 393 2487');
  await parentPage.getByLabel('Password').fill('Fictional7!Password');
  await parentPage.getByRole('button', { name: 'Sign in securely' }).click();
  await parentPage.getByRole('heading', { name: 'Add a child' }).waitFor();
  await parentPage.getByLabel('Current class').selectOption('Primary 1');
  await parentPage.getByLabel('Pupil’s name on the school register').fill('Fictional Pupil');
  await parentPage.getByRole('button', { name: 'Find existing pupil' }).click();
  await parentPage.getByText('✓ Pupil record found').waitFor();
  assert.deepEqual(matchBody, { classCode: 'Primary 1', registeredName: 'Fictional Pupil' }, 'typed name and selected class are matched without a pupil-name list');
  await parentPage.getByLabel('Private Parent Linking Code').fill('TA-LINK-ABCD-EFGH-JKLM');
  await parentPage.getByRole('button', { name: 'Verify code and add child' }).click();
  await parentPage.getByRole('heading', { name: 'My children' }).waitFor();
  assert.deepEqual(linkBody, { classCode: 'Primary 1', registeredName: 'Fictional Pupil', code: 'TA-LINK-ABCD-EFGH-JKLM' }, 'one-time linking submits the typed details and private code in a POST body');
  assert.doesNotMatch(parentPage.url(), /Fictional|TA-LINK/, 'pupil name and linking code never enter the URL');

  await parentPage.getByRole('button', { name: 'Add a Child' }).click();
  await parentPage.getByText('Apply for admission for a new pupil').click();
  await parentPage.getByLabel('Child’s full name').fill('Fictional New Applicant');
  await parentPage.getByLabel('Class applying for').selectOption('Nursery 1');
  await parentPage.getByRole('button', { name: 'Submit new-pupil application' }).click();
  await parentPage.getByText(/Application TA-ADM-/).waitFor();
  assert.equal(admissionBody.child_name, 'Fictional New Applicant', 'new admission keeps applicant separate from existing-pupil matching');
  assert.equal(admissionBody.requested_class, 'Nursery 1', 'new admission records requested class');
  const parentAxe = await new AxeBuilder({ page: parentPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  assert.deepEqual(parentAxe.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact)).map((violation) => violation.id), [], 'parent child-onboarding has no serious/critical Axe findings');
  await parentContext.close();
  passed += 1;

  const adminContext = await browser.newContext({ viewport: { width: 1024, height: 900 }, reducedMotion: 'reduce' });
  const adminPage = await adminContext.newPage();
  await adminPage.route('**/api/portal-config', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify({ enabled: true, url: 'https://fictional-project.supabase.co', publishableKey: 'fictional-browser-key' })
  }));
  await adminPage.route('https://fictional-project.supabase.co/**', (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/auth/v1/token') return route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify(fictionalSession()) });
    if (url.pathname === '/rest/v1/profiles' && url.searchParams.has('id')) {
      return route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify({ id: FICTIONAL_USER_ID, role: 'admin', leadership_scope: 'headmistress', full_name: 'Fictional Admin', active: true, account_status: 'active', must_change_password: false, phone_e164: '+2349063932487' }) });
    }
    if (url.pathname === '/rest/v1/profiles') {
      return route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([
        { id: FICTIONAL_USER_ID, role: 'admin', leadership_scope: 'headmistress', full_name: 'Fictional Admin', phone_e164: '+2349063932487', account_status: 'active', must_change_password: false, active: true, legacy_account_no: null, created_at: new Date().toISOString() },
        { id: '10000000-0000-4000-8000-000000000004', role: 'parent', full_name: 'Fictional Parent', phone_e164: '+2348000000004', account_status: 'active', must_change_password: false, active: true, legacy_account_no: 'OLD-004', created_at: new Date().toISOString() }
      ]) });
    }
    if (url.pathname === '/rest/v1/students') {
      return route.fulfill({ status: 200, headers: corsHeaders, body: JSON.stringify([{ id: '20000000-0000-4000-8000-000000000001', admission_number: 'TEST-001', full_name: 'Fictional Pupil', class_code: 'Primary 1', parent_id: '10000000-0000-4000-8000-000000000004', admission_status: 'pending', active: true }]) });
    }
    if (url.pathname.startsWith('/rest/v1/')) return route.fulfill({ status: 200, headers: corsHeaders, body: '[]' });
    return route.fulfill({ status: 404, headers: corsHeaders, body: '{}' });
  });
  await adminPage.goto(new URL('portal/login.html', BASE).href, { waitUntil: 'domcontentloaded' });
  await adminPage.getByLabel('Nigerian phone number').fill('0906 393 2487');
  await adminPage.getByLabel('Password').fill('Fictional7!Password');
  await adminPage.getByRole('button', { name: 'Sign in securely' }).click();
  await adminPage.getByRole('button', { name: 'Teachers & Accounts' }).click();
  await adminPage.getByRole('heading', { name: 'Accounts & classes' }).waitFor();
  assert.equal(await adminPage.getByText('Create a teacher account', { exact: true }).count(), 1, 'staff-only account creation panel exists');
  assert.equal(await adminPage.getByText('Reset a password after office verification', { exact: true }).count(), 1, 'admin reset panel exists');
  assert.equal(await adminPage.getByLabel('Search portal accounts').count(), 1, 'private account directory search is labelled');
  const adminAxe = await new AxeBuilder({ page: adminPage }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).analyze();
  assert.deepEqual(adminAxe.violations.filter((violation) => ['critical', 'serious'].includes(violation.impact)).map((violation) => violation.id), [], 'account management has no serious/critical Axe findings');
  await adminContext.close();
  passed += 1;

  await browser.close();
  console.log(`PORTAL BROWSER QA: ${passed}/${passed} viewports/states passed`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
