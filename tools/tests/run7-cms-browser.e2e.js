const { chromium } = require('playwright');
const AxeBuilder = require('@axe-core/playwright').default;
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const browserContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await browserContext.newPage();
  page.on('pageerror', (error) => console.error('PAGE ERROR:', error.message));
  await page.setContent(`<!doctype html><html data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="file://${path.resolve(__dirname, '../../assets/css/portal.css')}"></head><body><main><div id="root"></div></main></body></html>`);
  await page.addStyleTag({ path: path.resolve(__dirname, '../../assets/css/portal.css') });
  await page.addScriptTag({ path: path.resolve(__dirname, '../../assets/js/cms-workspace-app.js') });
  await page.evaluate(() => {
    const cms = window.TreasureAcademyCms;
    const state = {
      supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture' } }, error: null }) } },
      profile: { id: '11111111-1111-4111-8111-111111111111', full_name: 'Authorised Reviewer' },
      data: { profiles: [] },
      features: { cms: true, media: false },
      cms: {
        ...cms.emptyCmsState(), available: true,
        capabilities: { view_private: true, draft: true, review: true, publish: true, safeguarding_review: true, administer: false, emergency_publish: false }
      }
    };
    const root = document.querySelector('#root');
    const context = {
      state,
      rpc: async () => true,
      refresh: async () => {},
      setStatus: () => {},
      rerender: () => { root.replaceChildren(cms.renderCmsWorkspace(context)); }
    };
    context.rerender();
  });

  await page.getByRole('heading', { name: 'Website CMS' }).waitFor();
  await page.getByRole('button', { name: 'Create content' }).click();
  await page.locator('.cms-editor').waitFor();
  await page.getByLabel('Lowercase route slug').fill('safe-school-update');
  await page.getByLabel('Title', { exact: true }).fill('A safe school update');
  await page.getByLabel('Summary / standfirst').fill('A sufficiently detailed and verified school update.');
  await page.locator('.cms-block-editor textarea[data-key="text"]').fill('<img src=x onerror=alert(1)>');
  await page.getByRole('button', { name: 'Preview draft' }).click();
  const error = page.locator('.form-message--error');
  if (!/Executable markup/.test(await error.textContent())) throw new Error('Executable markup was not rejected in the editor.');

  await page.locator('.cms-block-editor textarea[data-key="text"]').fill('This content is rendered as structured text.');
  await page.getByRole('button', { name: 'Preview draft' }).click();
  await page.locator('.cms-preview').waitFor();
  if (await page.locator('.cms-preview script,.cms-preview iframe,.cms-preview object').count()) throw new Error('Unsafe preview node rendered.');

  await page.getByRole('button', { name: 'Add content block' }).click();
  if (await page.locator('.cms-block-editor').count() !== 2) throw new Error('Block editor did not add a structured block.');
  await page.locator('.cms-block-editor').nth(1).getByRole('button', { name: 'Move up' }).click();
  await page.locator('.cms-block-editor').nth(0).getByRole('button', { name: 'Remove' }).click();
  if (await page.locator('.cms-block-editor').count() !== 1) throw new Error('Block editor controls did not preserve one block.');

  const accessibility = await new AxeBuilder({ page }).include('.cms-workspace').analyze();
  const serious = accessibility.violations.filter((item) => ['serious', 'critical'].includes(item.impact));
  if (serious.length) throw new Error(`CMS accessibility violations: ${serious.map((item) => item.id).join(', ')}`);

  const colors = await page.evaluate(() => ({ color: getComputedStyle(document.body).color, background: getComputedStyle(document.body).backgroundColor }));
  if (!colors.color || !colors.background || colors.color === colors.background) throw new Error('Dark theme tokens were not applied.');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (overflow > 1) throw new Error(`CMS overflowed the mobile viewport by ${overflow}px.`);

  await browser.close();
  console.log('Run 7 CMS browser checks passed (structured editor, XSS preview, block controls, dark/mobile).');
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
