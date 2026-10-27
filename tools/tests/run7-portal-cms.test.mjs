import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { JSDOM } from 'jsdom';

const root = path.resolve(import.meta.dirname, '../..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const portalSource = read('assets/js/portal-source.js');
const cmsSource = read('assets/js/cms-workspace.js');
const cmsEntry = read('assets/js/cms-workspace-entry.js');
const portalCss = read('assets/css/portal.css');
const configSource = read('api/portal-config.mjs');
const envExample = read('.env.example');
const vercel = JSON.parse(read('vercel.json'));
const packageJson = JSON.parse(read('package.json'));
const cms = await import(`data:text/javascript;base64,${Buffer.from(cmsSource).toString('base64')}`);

function validFields(overrides = {}) {
  return {
    contentType: 'news', title: 'A governed school update', summary: 'A sufficiently detailed public summary.',
    category: 'School news', classification: 'public', sourceNote: 'Verified by the school office.',
    nextReviewDate: '2027-01-01', seoTitle: 'Governed school update',
    seoDescription: 'A verified and governed Treasure Academy public school update.',
    searchKeywords: 'school update, ageva', tags: 'school-news, verified', searchTerms: 'latest update',
    effectiveFrom: '', expiresAt: '', featuredMediaId: '', socialMediaId: '', downloadMediaIds: [],
    ...overrides
  };
}

function paragraph(text = 'A safe structured paragraph.') {
  return [{ type: 'paragraph', payload: { text } }];
}

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://school.example/portal/login.html' });
  globalThis.window = dom.window;
  globalThis.document = dom.window.document;
  globalThis.Node = dom.window.Node;
  return dom;
}

test('CMS portal and media gates are independent and fail closed by default', async () => {
  assert.match(envExample, /^CMS_PORTAL_ENABLED=false$/m);
  assert.match(envExample, /^CMS_MEDIA_ENABLED=false$/m);
  assert.match(configSource, /CMS_PORTAL_ENABLED === 'true'/);
  assert.match(configSource, /CMS_MEDIA_ENABLED === 'true'/);
  assert.match(portalSource, /config\.cmsEnabled === true/);
  assert.match(portalSource, /config\.mediaEnabled === true/);
  assert.match(portalSource, /if \(state\.features\.cms\)/);
  assert.match(portalSource, /if \(state\.features\.media\)|features\.media/);
  assert.doesNotMatch(configSource, /CLOUDINARY_API_KEY|CLOUDINARY_API_SECRET|SUPABASE_SECRET_KEY/);

  const original = { ...process.env };
  try {
    process.env.PORTAL_ENABLED = 'true';
    process.env.SUPABASE_URL = 'https://fixture.supabase.co';
    process.env.SUPABASE_PUBLISHABLE_KEY = 'fixture-publishable';
    delete process.env.CMS_PORTAL_ENABLED;
    delete process.env.CMS_MEDIA_ENABLED;
    const api = await import(`${pathToFileURL(path.join(root, 'api/portal-config.mjs')).href}?run7=${Date.now()}`);
    let response = await api.default.fetch(new Request('https://school.example/api/portal-config'));
    let body = await response.json();
    assert.equal(body.cmsEnabled, false);
    assert.equal(body.mediaEnabled, false);

    process.env.CMS_PORTAL_ENABLED = 'TRUE';
    process.env.CMS_MEDIA_ENABLED = '1';
    response = await api.default.fetch(new Request('https://school.example/api/portal-config'));
    body = await response.json();
    assert.equal(body.cmsEnabled, false);
    assert.equal(body.mediaEnabled, false);

    process.env.CMS_PORTAL_ENABLED = 'true';
    process.env.CMS_MEDIA_ENABLED = 'true';
    response = await api.default.fetch(new Request('https://school.example/api/portal-config'));
    body = await response.json();
    assert.equal(body.cmsEnabled, true);
    assert.equal(body.mediaEnabled, true);
  } finally {
    for (const key of Object.keys(process.env)) if (!(key in original)) delete process.env[key];
    Object.assign(process.env, original);
  }
});

test('the CMS remains a separate lazy bundle while Run 8 uses the final Function slot', () => {
  assert.equal(packageJson.scripts['build:cms'].includes('cms-workspace-entry.js'), true);
  assert.equal(packageJson.scripts['build:portal'].includes('npm run build:cms'), true);
  assert.match(portalSource, /loadCmsBundle/);
  assert.match(portalSource, /cms-workspace-app\.js\?v=20261027-cms1/);
  assert.match(cmsEntry, /Object\.freeze\(cmsWorkspace\)/);
  assert.equal(fs.existsSync(path.join(root, 'assets/js/cms-workspace-app.js')), true);
  assert.equal(fs.statSync(path.join(root, 'assets/js/cms-workspace-app.js')).size < 80 * 1024, true);
  assert.equal(Object.keys(packageJson.scripts).includes('build:cms'), true);
  assert.equal(fs.readdirSync(path.join(root, 'api')).filter((name) => name.endsWith('.mjs')).length, 12);
});

test('document builder creates only closed structured fields and governed media relationships', () => {
  const featured = '11111111-1111-4111-8111-111111111111';
  const body = '22222222-2222-4222-8222-222222222222';
  const gallery = '33333333-3333-4333-8333-333333333333';
  const documentValue = cms.buildCmsDocument(validFields({ featuredMediaId: featured, downloadMediaIds: [gallery] }), [
    { type: 'paragraph', payload: { text: 'Safe text' } },
    { type: 'image', payload: { asset_id: body, decorative: false, alt: 'Children-free school building' } },
    { type: 'gallery', payload: { asset_ids: [gallery] } }
  ]);
  assert.deepEqual(Object.keys(documentValue).sort(), [
    'blocks', 'category', 'classification', 'featured_media_id', 'language', 'locale', 'media',
    'metadata', 'next_review_date', 'search_keywords', 'search_terms', 'seo_description', 'seo_title',
    'source_note', 'summary', 'tags', 'title'
  ].sort());
  assert.equal(documentValue.media.some((item) => item.asset_id === featured && item.placement === 'featured'), true);
  assert.equal(documentValue.media.some((item) => item.asset_id === body && item.placement === 'body'), true);
  assert.equal(documentValue.media.some((item) => item.asset_id === gallery && item.placement === 'gallery'), true);
  assert.equal(documentValue.media.some((item) => item.asset_id === gallery && item.placement === 'download'), true);
  assert.equal(new Set(documentValue.media.map((item) => `${item.asset_id}:${item.placement}:${item.position}`)).size, documentValue.media.length);
  assert.doesNotMatch(JSON.stringify(documentValue), /"(?:raw_html|html|script)"|innerHTML/);
});

test('client validation and private preview reject executable markup and render text without HTML interpretation', () => {
  const safeDocument = cms.buildCmsDocument(validFields(), paragraph('Welcome to Treasure Academy.'));
  assert.deepEqual(cms.validateCmsDraft('news', 'safe-school-update', safeDocument), []);

  const malicious = cms.buildCmsDocument(validFields(), paragraph('<img src=x onerror=alert(1)>'));
  assert.match(cms.validateCmsDraft('news', 'malicious-update', malicious).join(' '), /Executable markup/);
  assert.match(cms.validateCmsDraft('news', '../escape', safeDocument).join(' '), /lowercase hyphenated slug/);

  const dom = installDom();
  const preview = cms.renderCmsPreview(malicious, cms.emptyCmsState());
  dom.window.document.body.append(preview);
  assert.equal(preview.querySelectorAll('img,script,iframe,object').length, 0);
  assert.match(preview.textContent, /<img src=x onerror=alert\(1\)>/);
  assert.doesNotMatch(cmsSource, /\.innerHTML\s*=|insertAdjacentHTML|document\.write/);
  dom.window.close();
});

test('event validation uses fixed Africa/Lagos timestamps and requires coherent lifecycle fields', () => {
  assert.equal(cms.lagosIso('2026-12-10T10:00'), '2026-12-10T09:00:00.000Z');
  const documentValue = cms.buildCmsDocument(validFields({
    contentType: 'event', eventStartsAt: '2026-12-10T10:00', eventEndsAt: '2026-12-10T09:00',
    eventStatus: 'scheduled', attendanceMode: 'in_person'
  }), paragraph());
  assert.match(cms.validateCmsDraft('event', 'school-event', documentValue).join(' '), /must not precede/);
  const missing = cms.buildCmsDocument(validFields({ contentType: 'event', eventStartsAt: '' }), paragraph());
  assert.match(cms.validateCmsDraft('event', 'school-event', missing).join(' '), /Event start is required/);
});

test('CMS data loading checks server-authoritative capabilities before any private table query', async () => {
  let tableCalled = false;
  const supabase = {
    rpc: async (name, args) => {
      assert.equal(name, 'cms_current_actor_can');
      assert.match(args.p_capability, /^(view_private|draft|review|publish|safeguarding_review|administer|emergency_publish)$/);
      return { data: false, error: null };
    },
    from: () => { tableCalled = true; throw new Error('must not query'); }
  };
  const result = await cms.loadCmsWorkspaceData(supabase);
  assert.equal(result.available, false);
  assert.equal(result.capabilities.view_private, false);
  assert.equal(tableCalled, false);
  assert.equal(cms.canUseCms(result), false);
});

test('all CMS mutations use accepted capability-checked RPCs and never direct table writes', () => {
  const expected = [
    'cms_create_entry', 'cms_create_revision', 'cms_submit_for_review', 'cms_record_approval',
    'cms_publish', 'cms_archive', 'cms_restore_revision', 'cms_change_slug', 'cms_review_media',
    'cms_archive_media', 'cms_set_capabilities'
  ];
  expected.forEach((name) => assert.match(cmsSource, new RegExp(`context\\.rpc\\('${name}'`)));
  assert.match(cmsSource, /p_expected_version: editing\.current_revision_number/);
  assert.match(cmsSource, /p_scheduled_for:/);
  assert.doesNotMatch(cmsSource, /supabase\.from\([^)]*\)\.(?:insert|update|upsert|delete)/);
  assert.doesNotMatch(cmsSource, /\.delete\s*\(|delete_resources|\/destroy|original['"]/i);
  assert.match(cmsSource, /creator cannot review their own identifiable-child media|You created this identifiable-child asset/i);
  assert.match(cmsSource, /Manual only — no automatic deletion/);
});

test('media client enforces allowlisted MIME and size bounds before signed upload', () => {
  const image = { type: 'image/jpeg', size: 10 * 1024 * 1024 };
  const video = { type: 'video/mp4', size: 50 * 1024 * 1024 };
  assert.deepEqual(cms.validateMediaFile(image), { mime: 'image/jpeg', mediaType: 'image' });
  assert.deepEqual(cms.validateMediaFile(video), { mime: 'video/mp4', mediaType: 'video' });
  assert.throws(() => cms.validateMediaFile({ type: 'image/svg+xml', size: 20 }), /JPEG/);
  assert.throws(() => cms.validateMediaFile({ type: 'image/png', size: 10 * 1024 * 1024 + 1 }), /size limit/);
  assert.throws(() => cms.validateMediaFile({ type: 'video/mp4', size: 50 * 1024 * 1024 + 1 }), /size limit/);
});

test('Cloudinary browser form uses only the short-lived server-signed fixed upload contract', () => {
  const file = new Blob(['fixture'], { type: 'image/jpeg' });
  const upload = {
    apiKey: '123456789', signature: 'a'.repeat(64), signatureAlgorithm: 'sha256',
    asset_folder: 'treasure-academy/cms/pending', discard_original_filename: 'true', invalidate: 'false',
    overwrite: 'false', public_id: `ta_${'b'.repeat(32)}`, tags: 'treasure-academy,cms,manual-review-required',
    timestamp: 1700000000, type: 'authenticated', unique_filename: 'false', upload_preset: 'treasure_academy_cms_signed', use_filename: 'false'
  };
  const form = cms.cloudinaryFormData(file, upload);
  assert.equal(form.get('api_key'), upload.apiKey);
  assert.equal(form.get('signature'), upload.signature);
  assert.equal(form.get('signature_algorithm'), 'sha256');
  assert.equal(form.get('overwrite'), 'false');
  assert.equal(form.get('discard_original_filename'), 'true');
  assert.equal(form.get('type'), 'authenticated');
  assert.equal(form.has('api_secret'), false);
  assert.equal(form.has('filename'), false);
  assert.equal(form.has('context'), false);
  assert.doesNotMatch(cmsSource, /CLOUDINARY_API_SECRET|CLOUDINARY_URL/);
});

test('portal-specific CSP permits only exact Cloudinary upload and school delivery origins', () => {
  const portalHeader = vercel.headers.find((item) => item.source === '/portal/(.*)');
  const csp = portalHeader.headers.find((item) => item.key === 'Content-Security-Policy').value;
  assert.match(csp, /connect-src[^;]*https:\/\/api\.cloudinary\.com/);
  assert.match(csp, /img-src[^;]*https:\/\/res\.cloudinary\.com\/ecbad9xj\//);
  assert.match(csp, /media-src[^;]*https:\/\/res\.cloudinary\.com\/ecbad9xj\//);
  assert.doesNotMatch(csp, /\*\.cloudinary\.com/);
  assert.doesNotMatch(csp, /unsafe-eval/);
  assert.match(csp, /script-src 'self'/);
});

test('CMS UI preserves responsive, reduced-motion, keyboard and day/dark portal foundations', () => {
  assert.match(portalCss, /Run 7 protected Website CMS/);
  assert.match(portalCss, /\.cms-media-layout/);
  assert.match(portalCss, /@media \(max-width: 720px\)/);
  assert.match(portalCss, /@media \(forced-colors: active\)/);
  assert.match(portalCss, /var\(--surface\)/);
  assert.match(portalCss, /var\(--ink\)/);
  assert.match(read('portal/login.html'), /cms1/);
  assert.match(read('portal/index.html'), /cms1/);
  assert.match(cmsSource, /aria-live/);
  assert.match(cmsSource, /role: 'tabpanel'/);
  assert.match(cmsSource, /aria-selected/);
});
