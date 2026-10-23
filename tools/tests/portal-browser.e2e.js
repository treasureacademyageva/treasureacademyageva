#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const BASE = process.env.TA_TEST_BASE || 'http://127.0.0.1:4173/';

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
    await page.route('https://fictional-project.supabase.co/auth/v1/token**', (route) => route.fulfill({
      status: 400,
      contentType: 'application/json',
      headers: { 'access-control-allow-origin': '*' },
      body: JSON.stringify({ error: 'invalid_grant', error_description: 'Invalid login credentials' })
    }));

    const response = await page.goto(new URL('portal/login.html', BASE).href, { waitUntil: 'networkidle' });
    assert(response && response.status() < 400, `portal HTTP at ${width}`);
    await page.getByRole('heading', { level: 1, name: 'Welcome back' }).waitFor();
    assert.equal(await page.locator('h1').count(), 1, `one h1 at ${width}`);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `no horizontal page overflow at ${width}`);
    assert.equal(await page.getByLabel('Email address').count(), 1, `email label at ${width}`);
    assert.equal(await page.getByLabel('Password').count(), 1, `password label at ${width}`);
    assert.match(await page.locator('.portal-banner').innerText(), /Bank transfer only/i);
    assert.match(await page.locator('.trust-panel').innerText(), /payment can never approve an admission/i);

    const controlHeights = await page.locator('input, button.button').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height));
    assert(controlHeights.every((height) => height >= 48), `48px portal controls at ${width}: ${controlHeights.join(',')}`);

    await page.getByLabel('Email address').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('input[name="password"]')), true, `logical focus order at ${width}`);

    if (width === 390) {
      await page.getByLabel('Email address').fill('parent@example.invalid');
      await page.getByLabel('Password').fill('fictional-password');
      await page.getByRole('button', { name: 'Sign in securely' }).click();
      await page.getByRole('alert').filter({ hasText: 'could not sign you in' }).waitFor();
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
  await inactive.goto(new URL('portal/login.html', BASE).href, { waitUntil: 'networkidle' });
  await inactive.getByRole('heading', { level: 1, name: 'Your school portal is being securely reconnected' }).waitFor();
  assert.match(await inactive.locator('.alert').innerText(), /Preserve first, then reconnect/i);
  assert.equal(await inactive.locator('html').getAttribute('data-theme'), 'dark');
  await inactiveContext.close();
  passed += 1;

  await browser.close();
  console.log(`PORTAL BROWSER QA: ${passed}/4 viewports/states passed`);
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
