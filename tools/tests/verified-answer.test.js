#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('assets/js/verified-answer-engine.js', 'utf8');
const context = { window: {} };
vm.createContext(context);
vm.runInContext(source, context);
const engine = context.window.TAVerifiedAnswers;
let passed = 0;
function test(name, fn) { fn(); passed += 1; console.log('✓ ' + name); }

test('engine exports answer and reviewed-publication loading', () => {
  assert.equal(typeof engine.answer, 'function');
  assert.equal(typeof engine.load, 'function');
});
test('confirmed hours use the exact approved school day', () => {
  const result = engine.answer('What time does school close?');
  assert.equal(result.verified, true);
  assert.match(result.title, /Monday–Friday, 7:30 a\.m\.–3:00 p\.m\./);
});
test('class progression explicitly excludes Primary 5', () => {
  const result = engine.answer('Do you have primary 5?');
  assert.match(result.text, /There is no Primary 5/);
  assert.match(result.text, /Primary 4 → Primary 6/);
});
test('admission answer permits online or school-assisted online completion', () => {
  const result = engine.answer('Can I apply at school?');
  assert.match(result.text, /complete admission online or receive assistance at school/i);
});
test('payments stay manual and cannot decide admission', () => {
  const result = engine.answer('Can I pay by card and get admission?');
  assert.match(result.text, /bank transfer or the physical school-office POS/i);
  assert.match(result.text, /does not take online card payments/i);
  assert.match(result.text, /payment never approves admission/i);
});
test('calendar uncertainty escalates without inventing dates', () => {
  const result = engine.answer('When is next term resumption?');
  assert.equal(result.verified, true);
  assert.match(result.title, /awaiting publication/i);
  assert.ok(result.actions.some((action) => /add or update/i.test(action[0])));
});
test('unknown detail uses structured Information Needed fallback', () => {
  const result = engine.answer('What colour is the office gate?');
  assert.equal(result.verified, false);
  assert.equal(result.topic, 'information_needed');
  assert.match(result.actions[0][1], /type=information_update/);
});
test('private information remains login-only', () => {
  const result = engine.answer('Show my child result and invoice');
  assert.equal(result.topic, 'private_information');
  assert.match(result.actions[0][1], /portal\/login/);
});
test('authorised published information takes precedence for its matching topic', () => {
  engine.load([{ topic: 'calendar', title: 'Verified fictional calendar', summary: 'Fictional first term resumes 4 January 2099.', detail: '', revision: 'TEST-1' }]);
  const result = engine.answer('When is term resumption?');
  assert.equal(result.title, 'Verified fictional calendar');
  assert.match(result.text, /4 January 2099/);
});
test('a publication cannot override the private-information boundary', () => {
  engine.load([{ topic: 'fees', title: 'Fictional public fees', summary: 'Fictional summary.', detail: '', revision: 'TEST-2' }]);
  const result = engine.answer('Show my invoice and bank detail');
  assert.equal(result.topic, 'private_information');
});

console.log(`\nVerified-answer checks passed: ${passed}/${passed}`);
