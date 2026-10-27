import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const [migration, portal, routes, vercel, academics, classes, answers, registrations] = await Promise.all([
  read('supabase/migrations/20261027130000_current_classes_and_flexible_results.sql'),
  read('assets/js/portal-source.js'),
  read('config/public-routes.json'),
  read('vercel.json'),
  read('academics.html'),
  read('class.html'),
  read('assets/js/verified-answer-engine.js'),
  read('server/registrations.mjs')
]);

test('Pre-Nursery is the youngest active class and Primary 5 remains absent', () => {
  assert.match(migration, /when 'Creche' then null[\s\S]+active_for_enrolment = class_code not in \('Creche','Graduate Hall'\)/i);
  assert.match(migration, /routine_entry_class = class_code = 'Pre-Nursery'/i);
  assert.match(migration, /when 'Primary 4' then 'Primary 6'/i);
  assert.doesNotMatch(portal.match(/const SCHOOL_CLASSES = \[[^;]+/s)?.[0] || '', /Creche|Primary 5/i);
  assert.doesNotMatch(registrations.match(/const SCHOOL_CLASSES = new Set\(\[[\s\S]+?\]\)/)?.[0] || registrations.slice(0, 500), /Creche|Primary 5/i);
});

test('retired Creche page is not indexed and redirects directly to Pre-Nursery', () => {
  const registry = JSON.parse(routes);
  assert.equal(registry.routes.some((row) => row.canonical === '/classes/creche'), false);
  const config = JSON.parse(vercel);
  for (const source of ['/classes/creche', '/classes/creche.html']) {
    const redirect = config.redirects.find((row) => row.source === source);
    assert.equal(redirect?.destination, '/classes/pre-nursery');
    assert.equal(redirect?.permanent, true);
  }
  assert.doesNotMatch(academics, /href="\/classes\/creche"|<h3>Creche<\/h3>/i);
  assert.doesNotMatch(classes, /href="\/classes\/creche"|<b>Creche<\/b>/i);
  assert.match(answers, /Crèche\/Daycare is no longer an active class/i);
});

test('assessment plans enforce the three approved score structures', () => {
  for (const value of ['pre_nursery_exam_100', 'three_entry_15_15_70', 'four_entry_10_10_10_70']) assert.match(migration, new RegExp(value));
  assert.match(migration, /new\.ca1<>0 or new\.ca2<>0 or new\.ca3<>0 or new\.exam_score<0 or new\.exam_score>100/i);
  assert.match(migration, /new\.ca1>15[\s\S]+new\.ca2>15[\s\S]+new\.ca3<>0[\s\S]+new\.exam_score>70/i);
  assert.match(migration, /new\.ca1>10[\s\S]+new\.ca2>10[\s\S]+new\.ca3>10[\s\S]+new\.exam_score>70/i);
  assert.match(migration, /new\.continuous_assessment:=new\.ca1\+new\.ca2\+new\.ca3/i);
  assert.match(migration, /cannot change after score entry begins/i);
});

test('portal separates class-wide plan choice, score entry order and final result presentation', () => {
  assert.match(portal, /One structure applies to every pupil and subject in this class/i);
  assert.match(portal, /By subject — keep the subject and move through pupil names/i);
  assert.match(portal, /By pupil name — keep the pupil and move through subjects/i);
  assert.match(portal, /CA3 obtained \/ obtainable/i);
  assert.match(portal, /Pre-Nursery: one examination in Week 12, scored over 100/i);
  assert.match(portal, /This is the secure score-entry workspace\. Parents receive the separately formatted result/i);
});

test('pupil sex remains private and admission numbers are not invented', () => {
  assert.match(migration, /check \(sex is null or sex in \('male','female'\)\)/i);
  assert.match(migration, /Private office-verified pupil sex[\s\S]+never a public roster field/i);
  assert.match(portal, /Leave blank until the exact official numbering format and starting sequence are approved\. Never invent one/i);
  assert.doesNotMatch(
    `${migration}\n${portal}\n${routes}`,
    /teacher-claims-source\.csv|2026-2027-roster\.csv/i,
  );
});
