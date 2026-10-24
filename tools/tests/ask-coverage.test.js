#!/usr/bin/env node
'use strict';

/* Coverage of the current public-answer contract. Questions that require
   private or owner-verified data must receive a safe route, never a guessed
   roster, price, route, bank account, receipt or timetable. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const store = () => {
  const data = Object.create(null);
  return {
    getItem: (key) => Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null,
    setItem: (key, value) => { data[key] = String(value); },
    removeItem: (key) => { delete data[key]; }
  };
};

const global = { localStorage: store(), sessionStorage: store() };
global.window = global;
const database = {
  school: {}, calendar: [], lostfound: [], uniform: [], exams: [], ptaMeetings: [],
  teachers: [], newsEvents: [], testimonials: []
};
const run = (relative) => new Function('window', 'localStorage', 'sessionStorage', 'DB',
  `${read(relative)}\nreturn window;`)(global, global.localStorage, global.sessionStorage, {
    load: () => database,
    save: () => {}
  });
run('assets/js/chat-entities.js');
run('assets/js/chat-rag.js');
run('assets/js/chat-core.js');
global.TAChat.init(JSON.parse(read('assets/data/kb.json')));

const plain = (html) => String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const cases = [
  ['where is the school', /Morak Pure-Water Factory.*Ageva.*Okene/i],
  ['what classes do you have', /Creche.*Pre-Nursery.*Primary 4.*Primary 6.*Graduate Hall/i],
  ['what happens in primary 5', /no Primary 5.*Primary 4 to Primary 6/i],
  ['what happens after primary 4', /Primary 4.*Primary 6/i],
  ['how do I enrol my child', /restricted applicant route.*payment never approves/i],
  ['how can a second parent access the child', /two active parents or guardians.*TA-FAMILY/i],
  ['show me the pupil list', /cannot display or suggest a pupil or class list/i],
  ['how much are the Primary 4 fees', /will not quote a former price.*signed-in parent portal/i],
  ['where can I order a uniform', /verified materials.*signed-in parent portal/i],
  ['what is the transport route and fare', /will not quote a former price, route or bank account/i],
  ['how do I pay', /manual bank transfer.*physical office POS.*verification/i],
  ['where can I see the bank account details', /signed-in parent portal.*manual bank transfer/i],
  ['can I send payment proof on WhatsApp', /WhatsApp is not (?:a payment-evidence workflow|payment evidence)/i],
  ['is a transfer screenshot an official receipt', /official receipts.*verification/i],
  ['how can I view results', /published results only for a verified linked pupil/i],
  ['can I submit homework online', /not.*online assignment submissions.*offline process/i],
  ['what is CBT for', /Primary 6 Common Entrance practice.*not an official examination/i],
  ['what is the Graduate Wall', /consent-approved display name.*graduation session/i],
  ['how do I create a parent account', /TA-LINK.*TA-FAMILY.*restricted applicant route/i],
  ['who can see pupil birthdays', /authorised staff.*Headmistress/i]
];

let passed = 0;
for (const [question, expected] of cases) {
  global.TAChat.topic = null;
  global.TAChat.pending = null;
  const response = global.TAChat.respond(question) || {};
  const text = plain(response.html);
  assert.notEqual(response.type, 'handoff-ask', `safe public guidance dead-ended: ${question}`);
  assert.match(text, expected, `${question}\n${text}`);
  assert.doesNotMatch(text, /₦\s*\d|\b\d{10}\b|Monnify|online checkout/i, `unsafe value or workflow: ${question}`);
  passed += 1;
  console.log(`ok - ${question}`);
}

console.log(`\nCURRENT ANSWER COVERAGE: ${passed}/${cases.length} checks passed`);
