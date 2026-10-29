import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';

const read = (path) => fs.readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

function page(htmlPath, url) {
  const dom = new JSDOM(read(htmlPath), { url, runScripts: 'outside-only', pretendToBeVisual: true });
  dom.window.Response = globalThis.Response;
  dom.window.Request = globalThis.Request;
  dom.window.Headers = globalThis.Headers;
  return dom;
}
function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8' } });
}

test('admission tracking rejects malformed HTTP-200 contracts without opening or clearing the OTP stage', async () => {
  const dom = page('admissions.html', 'https://example.test/admissions#tracker');
  const { window } = dom;
  const requestForm = window.document.getElementById('admissionOtpRequest');
  const verifyForm = window.document.getElementById('admissionOtpVerify');
  window.document.getElementById('admissionPhone').value = '09063932487';
  requestForm.querySelector('input[value="sms"]').checked = true;
  window.fetch = async () => json({});
  window.eval(read('assets/js/admission-tracking.js'));
  requestForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(requestForm.hidden, false);
  assert.equal(verifyForm.hidden, true);
  assert.equal(window.document.getElementById('admissionPhone').value, '09063932487');
  assert.match(window.document.getElementById('admissionRequestState').textContent, /incomplete confirmation/i);

  window.fetch = async () => json({
    accepted: true,
    requestToken: 'A'.repeat(43),
    expiresInSeconds: 300,
    message: 'If this phone is eligible, the released code will arrive.'
  }, 202);
  requestForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(requestForm.hidden, true);
  assert.equal(verifyForm.hidden, false);

  const code = window.document.getElementById('admissionOtpCode');
  code.value = '123456';
  window.fetch = async () => json({ verified: true });
  verifyForm.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(code.value, '123456');
  assert.equal(window.document.getElementById('admissionTrackingResult').children.length, 0);
  assert.match(window.document.getElementById('admissionRequestState').textContent, /incomplete status response/i);
  dom.window.close();
});

test('Request Centre keeps input after malformed success, applies class prefill and exposes manual copy fallback', async () => {
  const dom = page('request-centre.html', 'https://example.test/request-centre?type=class_enquiry&class=Primary%201');
  const { window } = dom;
  window.fetch = async () => json({});
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('blocked'); } } });
  window.eval(read('assets/js/request-centre.js'));
  const form = window.document.getElementById('request-create-form');
  assert.equal(form.elements.requestType.value, 'class_enquiry');
  assert.equal(form.elements.classCode.value, 'Primary 1');
  assert.match(form.elements.subject.value, /Primary 1/);
  assert.match(window.sessionStorage.getItem('treasureacademy.requestPrefill'), /Primary 1/);

  form.elements.name.value = 'Test Parent';
  form.elements.phone.value = '09063932487';
  form.elements.message.value = 'Synthetic browser test only.';
  form.querySelector('input[type="checkbox"]').checked = true;
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(window.document.getElementById('request-created').hidden, true);
  assert.equal(form.elements.name.value, 'Test Parent');
  assert.match(window.document.getElementById('request-create-message').textContent, /incomplete confirmation/i);

  window.fetch = async () => json({
    reference: 'TA-REQ-20261028-ABCD2345',
    trackingCode: 'ABCD-EFGH-JKLM-2345',
    status: 'received',
    statusLabel: 'Received by the school',
    submittedAt: '2026-10-28T12:00:00.000Z'
  }, 201);
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  await tick();
  assert.equal(window.document.getElementById('request-created').hidden, false);
  window.document.getElementById('request-copy-details').click();
  await tick();
  assert.equal(window.document.getElementById('request-copy-manual').hidden, false);
  assert.match(window.document.getElementById('request-copy-text').value, /TA-REQ-20261028-ABCD2345/);

  const tabs = [...window.document.querySelectorAll('[role="tab"]')];
  tabs[0].focus();
  tabs[0].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(tabs[1].getAttribute('aria-selected'), 'true');
  assert.equal(window.document.getElementById('request-view-check').hidden, false);
  dom.window.close();
});

test('contact WhatsApp handoff retains the form and always shows a direct link plus copyable draft', async () => {
  const dom = page('contact.html', 'https://example.test/contact');
  const { window } = dom;
  let opened = 0;
  window.open = () => { opened += 1; return null; };
  window.DB = { load: () => ({ school: { name: 'Treasure Academy, Ageva' }, whatsapp: [{ name: 'Treasure Academy', phone: '2349063932487', role: 'School office' }] }) };
  window.U = { esc: (value) => String(value).replace(/[&<>"']/g, ''), toast: () => {} };
  Object.defineProperty(window.navigator, 'clipboard', { configurable: true, value: { writeText: async () => { throw new Error('blocked'); } } });
  const scripts = [...window.document.querySelectorAll('script:not([src])')];
  const pageScript = scripts.find((node) => node.textContent.includes('prepareHandoff'));
  assert.ok(pageScript);
  window.eval(pageScript.textContent);
  const form = window.document.getElementById('contactForm');
  form.elements.name.value = 'Test Parent';
  form.elements.subject.value = 'Admission';
  form.elements.message.value = 'Synthetic message; do not send.';
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  assert.equal(opened, 0);
  assert.equal(form.elements.message.value, 'Synthetic message; do not send.');
  assert.equal(window.document.getElementById('contactWaHandoff').hidden, false);
  assert.match(window.document.getElementById('contactWaOpen').href, /^https:\/\/wa\.me\/2349063932487\?text=/);
  assert.match(window.document.getElementById('contactWaDraft').value, /Synthetic message/);
  window.document.getElementById('contactWaCopy').click();
  await tick();
  assert.match(window.document.getElementById('contactWaStatus').textContent, /Automatic copying was unavailable/);
  dom.window.close();
});

test('published fees and nursery book lists reproduce the supplied amounts and safe stock rules', () => {
  const dom = page('fees.html', 'https://example.test/fees');
  const { document } = dom.window;
  const values = [...document.querySelectorAll('#new-intake-charges + table tbody tr')].map((row) => [...row.cells].map((cell) => cell.textContent.trim()));
  const expected = [
    ['Form', '₦1,000'], ['School fees (per term)', '₦8,500'], ['Development fees', '₦1,000'],
    ['P.T.A levy', '₦500'], ['School uniform', '₦7,500'], ['Toiletries', '₦1,000'],
    ['Sportswear', '₦5,000'], ['Tax levy', '₦450'], ['Stamp duties', '₦50'], ['A F – I', '₦1,000']
  ];
  assert.deepEqual(values.slice(0, 10), expected);
  const amount = (value) => Number(value.replace(/[^0-9]/g, ''));
  assert.equal(values.slice(0, 10).reduce((sum, row) => sum + amount(row[1]), 0), 26000);
  assert.deepEqual(values[10], ['Total admission', '₦26,000']);
  const tables = [...document.querySelectorAll('#books-and-materials ~ table')].slice(0, 3);
  assert.deepEqual(tables.map((table) => [...table.tBodies[0].rows].reduce((sum, row) => sum + amount(row.cells[1].textContent), 0)), [12300, 12300, 15800]);
  const text = document.querySelector('main').textContent.replace(/\s+/g, ' ');
  assert.match(text, /Pre-Nursery: ₦26,000 \+ ₦12,300 = ₦38,300/);
  assert.match(text, /Nursery 1: ₦26,000 \+ ₦12,300 = ₦38,300/);
  assert.match(text, /Nursery 2: ₦26,000 \+ ₦15,800 = ₦41,800/);
  assert.match(text, /1 ruler and 1 Drawing & Writing item/);
  assert.match(text, /A request is not an order, stock promise or payment instruction/);
  assert.match(text, /There is no public online card form/);
  dom.window.close();
});

test('verified Search prioritises fees over class words and keeps private and safeguarding guidance specific', () => {
  const dom = new JSDOM('', { runScripts: 'outside-only' });
  dom.window.eval(read('assets/js/verified-answer-engine.js'));
  const answer = dom.window.TAVerifiedAnswers.answer;
  const fees = answer('Primary 1 fees');
  assert.equal(fees.topic, 'fees');
  assert.match(fees.text, /₦8,500 per term/);
  assert.equal(answer('my child result').topic, 'private_information');
  assert.equal(answer('safeguarding concern').topic, 'public_policy');
  dom.window.close();
});
