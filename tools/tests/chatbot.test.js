#!/usr/bin/env node
'use strict';

/* Current chatbot safety contract.
   The bot may explain that former values are unavailable, but must never turn
   the unreconciled browser store into public truth. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`ok - ${name}`);
}

const kb = JSON.parse(read('assets/data/kb.json'));
const docs = kb.docs || [];
const byId = new Map(docs.map((doc) => [doc.id, doc]));
const allText = docs.map((doc) => `${doc.title} ${doc.text} ${doc.keywords || ''} ${doc.url || ''}`).join('\n');

function makeStore() {
  const values = Object.create(null);
  return {
    getItem: (key) => Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null,
    setItem: (key, value) => { values[key] = String(value); },
    removeItem: (key) => { delete values[key]; }
  };
}

function chatbot() {
  const global = {};
  global.window = global;
  global.localStorage = makeStore();
  global.sessionStorage = makeStore();
  const database = {
    school: {}, calendar: [], lostfound: [], uniform: [], exams: [],
    ptaMeetings: [], teachers: [], newsEvents: [], testimonials: []
  };
  const run = (relative) => new Function('window', 'localStorage', 'sessionStorage', 'DB',
    `${read(relative)}\nreturn window;`)(global, global.localStorage, global.sessionStorage, {
      load: () => database,
      save: () => {}
    });
  run('assets/js/chat-entities.js');
  run('assets/js/chat-rag.js');
  run('assets/js/chat-core.js');
  global.TAChat.init(kb);
  return global.TAChat;
}

const bot = chatbot();
const plain = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const answer = (question) => {
  bot.topic = null;
  bot.pending = null;
  return plain((bot.respond(question) || {}).html);
};

test('knowledge-base count is internally consistent', () => {
  assert.equal(kb.count, docs.length);
  assert(docs.length >= 90);
});

test('only the unified secure portal route is indexed', () => {
  const routes = docs.filter((doc) => doc.kind === 'route');
  assert.deepEqual(routes.map((doc) => doc.url), ['portal/login.html']);
  assert.doesNotMatch(allText, /portal\/(?:pupil|teacher|admin)\.html/i);
});

test('exact progression fact has no active Primary 5 stage', () => {
  const fact = byId.get('fact:classes');
  assert(fact);
  assert.match(fact.text, /There is no Primary 5/i);
  assert.match(fact.text, /Primary 4 progresses directly to Primary 6/i);
  assert.doesNotMatch(fact.text, /Primary 4\s*(?:→|to|-)\s*Primary 5/i);
});

test('payment fact is manual, verified and gateway-free', () => {
  const fact = byId.get('fact:payment');
  assert(fact);
  assert.match(fact.text, /manual bank transfer/i);
  assert.match(fact.text, /physical office POS/i);
  assert.match(fact.text, /manual office verification/i);
  assert.match(fact.text, /official receipt appears only after verification/i);
  assert.doesNotMatch(fact.text, /Monnify|online checkout|pay by card/i);
});

test('former static prices, routes and timetable dates are not indexed', () => {
  assert.doesNotMatch(allText, /₦\s*30,?000|\bN\s*30,?000\b|\bNGN\s*30,?000\b/i);
  assert.doesNotMatch(allText, /\bAdavi\b|2026-11-30/);
});

test('Primary 5 question explains the direct Primary 4 to Primary 6 progression', () => {
  const text = answer('what happens in primary 5');
  assert.match(text, /no Primary 5/i);
  assert.match(text, /Primary 4 to Primary 6/i);
});

test('fee question refuses a former price and gives approved methods', () => {
  const text = answer('how much is school fees for primary 4');
  assert.match(text, /will not quote a former price/i);
  assert.match(text, /manual bank transfer/i);
  assert.match(text, /physical office POS/i);
  assert.doesNotMatch(text, /₦\s*\d|\bN\s*\d/i);
});

test('bank-detail question routes to a signed-in invoice without revealing an account', () => {
  const text = answer('where can I see the bank account details');
  assert.match(text, /signed-in parent portal/i);
  assert.match(text, /manual bank transfer/i);
  assert.doesNotMatch(text, /\b\d{10}\b/);
});

test('WhatsApp payment-proof question is rejected safely', () => {
  const text = answer('can I send payment proof on WhatsApp');
  assert.match(text, /WhatsApp is not a payment-evidence workflow/i);
  assert.match(text, /office verification/i);
});

test('materials and transport questions avoid invented prices and browser orders', () => {
  for (const question of ['how can I order a uniform', 'what is the transport price']) {
    const text = answer(question);
    assert.match(text, /signed-in parent portal/i);
    assert.match(text, /office verification/i);
    assert.doesNotMatch(text, /checkout|browser receipt|₦\s*\d/i);
  }
});

test('exam question gives guidance without an invented dated timetable', () => {
  const text = answer('when is the exam');
  assert.match(text, /confirm|timetable|office/i);
  assert.doesNotMatch(text, /2026-11-30/);
});

console.log(`\nCHATBOT SAFETY: ${passed}/${passed} checks passed`);
