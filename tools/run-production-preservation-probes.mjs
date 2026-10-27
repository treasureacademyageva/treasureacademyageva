#!/usr/bin/env node
// Read-only Production probes. GET/HEAD only: no login, OTP, provider, mutation or gate change.
import { randomUUID } from 'node:crypto';

const origin = new URL(process.env.TA_PRODUCTION_ORIGIN || 'https://www.treasureacademyageva.com');
if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/') {
  throw new Error('TA_PRODUCTION_ORIGIN must be an HTTPS origin without credentials or a path');
}
const timeoutMs = 12_000;
async function getUrl(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { method: 'GET', redirect: options.redirect || 'follow', signal: controller.signal, headers: { 'User-Agent': 'Treasure-Academy-Preservation-Probe/1.0' } });
  } finally { clearTimeout(timer); }
}
async function get(path, options = {}) {
  return getUrl(new URL(path, origin), options);
}
function expect(ok, message) { if (!ok) throw new Error(message); }

const results = [];
const home = await get('/');
expect(home.status === 200, `homepage status ${home.status}`);
const homeText = await home.text();
expect(/Treasure Academy/i.test(homeText), 'homepage identity marker missing');
expect((home.headers.get('x-content-type-options') || '').toLowerCase() === 'nosniff', 'homepage nosniff header missing');
expect((home.headers.get('content-security-policy') || '').includes("default-src 'self'"), 'homepage CSP missing');
results.push(['homepage', 200]);

for (const path of ['/robots.txt', '/sitemap.xml']) {
  const response = await get(path);
  expect(response.status === 200, `${path} status ${response.status}`);
  results.push([path, response.status]);
}

const configResponse = await get('/api/portal-config');
expect(configResponse.status === 200, `portal config status ${configResponse.status}`);
const config = await configResponse.json();
const preservedBrowserConfig = {
  enabled: true,
  developerBootstrapEnabled: false,
  registrationEnabled: true,
  accountClaimEnabled: false,
  officeEnabled: true
};
for (const [key, value] of Object.entries(preservedBrowserConfig)) expect(config[key] === value, `${key} changed from the preserved Production baseline`);
expect(!Object.prototype.hasOwnProperty.call(config, 'secretKey'), 'portal config exposed a private key field');
results.push(['portal-config-preserved', 200]);

for (const path of [
  '/api/developer/bootstrap',
  '/api/account/claim/request',
  '/api/admission/tracking/request',
  '/api/public-content?route=news-list',
  `/run12-not-found-${randomUUID()}`
]) {
  const response = await get(path);
  expect(response.status === 404 || response.status === 405, `${path} unexpectedly returned ${response.status}`);
  expect(!response.headers.get('location'), `${path} unexpectedly redirected`);
  results.push([path.split('?')[0], response.status]);
}

const apex = await getUrl('https://treasureacademyageva.com/', { redirect: 'manual' });
expect([301, 308].includes(apex.status), `apex redirect status ${apex.status}`);
expect(apex.headers.get('location') === 'https://www.treasureacademyageva.com/', `apex destination ${apex.headers.get('location')}`);
results.push(['apex-one-hop', apex.status]);

console.log(`PRODUCTION PRESERVATION PROBES: ${results.length}/${results.length} read-only checks passed; homepage, discovery, fail-closed gates, real 404 and canonical host remain available.`);
