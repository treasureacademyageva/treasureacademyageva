#!/usr/bin/env node
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const ROOT = path.resolve(__dirname, '../..');
const read = name => fs.readFileSync(path.join(ROOT, name), 'utf8');
const payload = JSON.parse(read('assets/data/review-gateway.enc.json'));
const html = read('developer-review.html');
const client = read('assets/js/developer-review.js');
const builder = read('tools/build-review-gateway.js');
const vercel = JSON.parse(read('vercel.json'));

const expectedTracks = {
  candidate_licence: 54,
  candidate_teacher: 50,
  candidate_safeguarding: 50,
  pilot_teacher: 96,
  pilot_safeguarding: 96,
  conditional_legal: 4
};

test('public package is authenticated ciphertext, not embedded corpus JSON', () => {
  assert.equal(payload.schema, 'treasure-encrypted-review-payload-v1');
  assert.equal(payload.cipher, 'AES-256-GCM');
  assert.equal(payload.kdf, 'PBKDF2-HMAC-SHA-256');
  assert.equal(payload.iterations, 310000);
  assert.equal(payload.training_authorised, false);
  assert.deepEqual(payload.tracks, expectedTracks);
  assert.match(payload.ciphertext_b64, /^[A-Za-z0-9+/]+=*$/);
  assert.ok(payload.ciphertext_b64.length > 1000000);
  assert.equal(Object.hasOwn(payload, 'candidates'), false);
  assert.equal(Object.hasOwn(payload, 'pilot'), false);
  assert.equal(Object.hasOwn(payload, 'passphrase'), false);
  assert.equal(Object.hasOwn(payload, 'key'), false);
});

test('gateway is noindex, unlisted and exposes required review controls', () => {
  assert.match(html, /noindex,nofollow,noarchive/);
  assert.match(html, /id="passphrase" type="password"/);
  for (const id of ['exportButton','downloadButton','copyButton','shareButton','importButton']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.doesNotMatch(read('sitemap.xml'), /developer-review/);
  assert.match(read('robots.txt'), /Disallow: \/developer-review\.html/);
  assert.match(read('developer.html'), /href=["']developer-review\.html["']/);
});

test('browser controller keeps review decisions hash-bound and grants no training approval', () => {
  assert.match(client, /currentTrack='pilot_teacher'/);
  assert.match(client, /localStorage\.setItem/);
  assert.match(client, /contentSha256/);
  assert.match(client, /trainingApprovalGranted:false/);
  assert.match(client, /track\.decisions\.indexOf\(review\.decision\)/);
  assert.match(client, /review\.reviewerRole!==track\.requiredRole/);
  assert.doesNotMatch(client, /trainingApprovalGranted:true/);
});

test('deployment headers prevent indexing and caching of review resources', () => {
  for (const source of ['/developer-review.html','/assets/data/review-gateway.enc.json','/assets/js/developer-review.js']) {
    const rule = vercel.headers.find(item => item.source === source);
    assert.ok(rule, `missing ${source} header rule`);
    const headers = Object.fromEntries(rule.headers.map(item => [item.key.toLowerCase(), item.value]));
    assert.match(headers['cache-control'], /no-store/);
    assert.match(headers['x-robots-tag'], /noindex/);
  }
  assert.match(read('sw.js'), /review-gateway\.enc\.json/);
});

test('builder requires an environment passphrase and emits only ciphertext plus a non-secret report', () => {
  assert.match(builder, /process\.env\.REVIEW_GATEWAY_PASSPHRASE/);
  assert.match(builder, /aes-256-gcm/);
  assert.match(builder, /pbkdf2Sync/);
  assert.match(builder, /passphrase_committed: false/);
  assert.doesNotMatch(builder, /REVIEW_GATEWAY_PASSPHRASE\s*=\s*['"][^'"]{20}/);
});

test('optional secret-bearing test decrypts the exact package without publishing the secret', {skip: !process.env.REVIEW_GATEWAY_PASSPHRASE}, () => {
  const key = crypto.pbkdf2Sync(process.env.REVIEW_GATEWAY_PASSPHRASE, Buffer.from(payload.salt_b64,'base64'), payload.iterations, 32, 'sha256');
  const sealed = Buffer.from(payload.ciphertext_b64, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv_b64,'base64'));
  decipher.setAAD(Buffer.from(payload.aad_b64,'base64'));
  decipher.setAuthTag(sealed.subarray(sealed.length - 16));
  const plaintext = Buffer.concat([decipher.update(sealed.subarray(0,-16)), decipher.final()]);
  assert.equal(crypto.createHash('sha256').update(plaintext).digest('hex'), payload.plaintext_sha256);
  const data = JSON.parse(plaintext);
  assert.equal(data.schema, 'treasure-human-review-portal-v1');
  assert.equal(data.trainingAuthorised, false);
  assert.deepEqual(Object.fromEntries(Object.entries(data.tracks).map(([key,value]) => [key,value.ids.length])), expectedTracks);
  assert.ok(data.tracks.pilot_teacher.showContent);
  assert.ok(data.tracks.candidate_teacher.showContent);
});
