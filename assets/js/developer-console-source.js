import { createClient } from '@supabase/supabase-js';

const app = document.getElementById('developerApp');
const statusNode = document.getElementById('developerStatus');
const themeButton = document.getElementById('developerTheme');
const signOutButton = document.getElementById('developerSignOut');
const identityNode = document.getElementById('developerIdentity');
const shell = document.getElementById('developerShell');
const state = { supabase: null, session: null, dashboard: null, reveal: null, revealTimer: null };

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
}
function setStatus(message, error = false) {
  statusNode.textContent = message || '';
  statusNode.classList.toggle('is-error', error);
}
function normalizePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^234[789]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0[789]\d{9}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return null;
}
function configureTheme() {
  let saved = null;
  try { saved = sessionStorage.getItem('treasure-developer-theme'); } catch {}
  document.documentElement.dataset.theme = saved === 'dark' ? 'dark' : 'light';
  themeButton.setAttribute('aria-pressed', saved === 'dark' ? 'true' : 'false');
  themeButton.querySelector('span').textContent = saved === 'dark' ? 'Use day theme' : 'Use dark theme';
}
themeButton.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  themeButton.setAttribute('aria-pressed', next === 'dark' ? 'true' : 'false');
  themeButton.querySelector('span').textContent = next === 'dark' ? 'Use day theme' : 'Use dark theme';
  try { sessionStorage.setItem('treasure-developer-theme', next); } catch {}
});

async function accessToken() {
  const { data, error } = await state.supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Sign in again to continue.');
  return data.session.access_token;
}
async function api(url, options = {}) {
  const token = await accessToken();
  const response = await fetch(url, {
    method: options.method || 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}`, ...(options.body ? {'Content-Type':'application/json'} : {}) },
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Request failed.'), { status: response.status });
  return result;
}
function renderLogin(message = '') {
  shell.hidden = true;
  signOutButton.hidden = true;
  identityNode.innerHTML = '<strong>Protected console</strong><span>Authorised accounts only</span>';
  app.innerHTML = '<div class="auth-shell"><section class="auth-copy"><p class="eyebrow" style="color:#d7ffe7">Capability-scoped access</p><h1>Developer Console</h1><p>Operational metrics, the manual OTP dispatcher and release readiness share one protected workspace. Administrator status alone does not grant access.</p><ul class="check-list"><li>Browser-session-only sign-in</li><li>Separate OTP dispatch capability</li><li>Encrypted Review remains separate</li></ul></section><form class="auth-form" id="developerLogin" novalidate><p class="eyebrow">Authorised developer</p><h2>Sign in securely</h2><label class="field">Nigerian phone number<input name="phone" type="tel" inputmode="tel" autocomplete="username" required></label><label class="field">Password<input name="password" type="password" autocomplete="current-password" minlength="12" maxlength="128" required></label><p class="console-status' + (message ? ' is-error' : '') + '" id="developerLoginMessage" role="status">' + esc(message) + '</p><button class="primary-button" type="submit">Sign in</button><a href="/portal/login.html">Open the school portal instead</a></form></div>';
  const form = document.getElementById('developerLogin');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const messageNode = document.getElementById('developerLoginMessage');
    const button = form.querySelector('button');
    const data = new FormData(form);
    const phone = normalizePhone(data.get('phone'));
    if (!phone) { messageNode.textContent = 'Enter a valid Nigerian phone number.'; return; }
    button.disabled = true;
    messageNode.textContent = 'Signing in…';
    try {
      const result = await state.supabase.auth.signInWithPassword({ phone, password: String(data.get('password') || '') });
      if (result.error) throw result.error;
      await loadDashboard();
    } catch (error) {
      messageNode.textContent = error.status === 403 ? 'This account does not have developer console access.' : 'Sign-in was not accepted. Check the account or contact the owner.';
    } finally { button.disabled = false; }
  });
}
function metric(label, value, detail) {
  return '<article class="metric"><span>' + esc(label) + '</span><strong>' + esc(value) + '</strong><small>' + esc(detail) + '</small></article>';
}
function sum(object) { return Object.values(object || {}).reduce((total, value) => total + Number(value || 0), 0); }
function pretty(value) { return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (letter) => letter.toUpperCase()); }
function barRows(values) {
  const entries = Object.entries(values || {});
  const max = Math.max(1, ...entries.map((entry) => Number(entry[1])));
  if (!entries.length) return '<p>No records in this category.</p>';
  return '<div class="bar-list">' + entries.map(([label, value]) => '<div class="bar-row"><span>' + esc(pretty(label)) + '</span><span class="bar-track" aria-hidden="true"><span class="bar-fill" style="width:' + Math.max(4, Math.round(Number(value) / max * 100)) + '%"></span></span><strong>' + esc(value) + '</strong></div>').join('') + '</div>';
}
function gateGrid(gates) {
  return '<div class="gate-grid">' + Object.entries(gates || {}).map(([name, active]) => '<div class="gate"><span>' + esc(pretty(name)) + '</span><span class="status-pill ' + (active ? '' : 'off') + '">' + (active ? 'On' : 'Off') + '</span></div>').join('') + '</div>';
}
function qualityMetrics() {
  const content = window.TA_CONTENT_QUALITY || { pageCount: 0, totals: {} };
  const experience = window.TA_EXPERIENCE_AUDIT || { totals: {}, brand: { gaps: [] } };
  const searchCount = Array.isArray(window.TA_SEARCH_INDEX) ? window.TA_SEARCH_INDEX.length : 0;
  return {
    pages: content.pageCount || experience.totals.pages || 0,
    words: content.totals?.words || 0,
    contentIssues: content.totals?.pagesWithIssues || 0,
    accessibilityIssues: (experience.totals?.missingAlt || 0) + (experience.totals?.missingLabels || 0) + (experience.totals?.unsizedImages || 0),
    journeys: experience.totals?.withinTwoClicks || 0,
    searchCount,
    brandGaps: experience.brand?.gaps?.length || 0
  };
}
function dashboardMarkup(data) {
  const quality = qualityMetrics();
  const hasOtp = data.capabilities?.otp_dispatch === true;
  const hasInformation = data.capabilities?.information_review === true;
  const hasHealth = data.capabilities?.system_health_read === true;
  const information = data.information || { openUpdateRequests: 0, stalePublications: 0, publicationTopics: 0, byStatus: {} };
  const gatesReady = Object.values(data.gates || {}).filter(Boolean).length;
  const gateTotal = Object.keys(data.gates || {}).length;
  const restricted = (label) => '<div class="error-box">This account does not have the ' + esc(label) + ' capability. No data from this category was queried or returned.</div>';
  return '<div class="hero-row"><div><p class="eyebrow">Unified operations</p><h1>Developer control room</h1><p>Protected operations, verified information, journey quality and release evidence.</p></div><span class="status-pill">Live server check · ' + esc(new Date(data.generatedAt).toLocaleTimeString('en-NG', {hour:'2-digit',minute:'2-digit'})) + '</span></div>' +
    '<section id="overview" class="console-section" style="margin-top:0"><div class="metric-grid">' +
      metric('OTP queue', hasOtp ? data.operations.otpQueue : 'Restricted', hasOtp ? 'Manual WhatsApp or SMS delivery' : 'OTP dispatch capability required') +
      metric('Unlinked applications', data.admissions.unlinkedApplications, 'Eligible for lightweight tracking') +
      metric('Information needed', hasInformation ? information.openUpdateRequests : 'Restricted', hasInformation ? 'Open structured update requests' : 'Information-review capability required') +
      metric('Release gates', hasHealth ? gatesReady + '/' + gateTotal : 'Restricted', hasHealth ? 'Explicit environment controls' : 'System-health capability required') +
    '</div><div class="card-grid" style="margin-top:1rem"><article class="console-card console-card--wide"><p class="eyebrow">Priority order</p><h2>What needs attention</h2><ul class="priority-list"><li>' + (!hasOtp ? 'OTP queue details are capability-restricted.' : data.operations.otpQueue ? '<strong>' + esc(data.operations.otpQueue) + ' OTP message(s) await protected handling.</strong>' : 'OTP dispatch queue is clear.') + '</li><li>' + (!hasInformation ? 'Information-review details are capability-restricted.' : information.openUpdateRequests ? '<strong>' + esc(information.openUpdateRequests) + ' information request(s) need review.</strong>' : 'No structured information update is waiting.') + '</li><li>' + (!hasInformation ? 'Publication-review details are capability-restricted.' : information.stalePublications ? '<strong>' + esc(information.stalePublications) + ' public-information item(s) are past their review date.</strong>' : 'No published information is marked past its review date.') + '</li><li>Encrypted corpus review remains a separate passphrase boundary.</li></ul></article><article class="console-card"><p class="eyebrow">Release posture</p><h2>Local-first</h2><p>No action on this page commits code, runs production SQL or activates a feature gate.</p><span class="status-pill warn">Explicit release decision required</span></article></div></section>' +
    '<section id="otp" class="console-section"><div class="section-heading"><div><p class="eyebrow">Protected inbox</p><h2>Admission OTP dispatch</h2><p>One-time reveal; server payload destruction; code-free audit.</p></div><button class="quiet-button" id="refreshOtp" type="button">Refresh queue</button></div><div class="console-card"><div id="otpQueue"><p class="queue-empty">Loading protected queue…</p></div><div id="secureReveal"></div></div></section>' +
    '<section id="information" class="console-section"><div class="section-heading"><div><p class="eyebrow">Source of truth</p><h2>Information Needed &amp; publication</h2><p>Unknown details stay unpublished until an authorised office review.</p></div><a class="quiet-button" href="/request-centre.html?type=information_update">Open request path</a></div>' + (hasInformation ? '<div class="card-grid"><article class="console-card"><h3>Structured requests</h3><strong style="font-size:2rem">' + esc(information.openUpdateRequests) + '</strong><p>Open requests asking the school to add or update public information.</p></article><article class="console-card console-card--wide"><h3>Verified information status</h3>' + barRows(information.byStatus) + '<p>' + esc(information.publicationTopics) + ' topic records · ' + esc(information.stalePublications) + ' past review date.</p></article></div>' : restricted('information-review')) + '</section>' +
    '<section id="admissions" class="console-section"><div class="section-heading"><div><p class="eyebrow">Privacy boundary</p><h2>Admissions health</h2><p>Aggregate operations only. No pupil list is exposed here.</p></div></div><div class="card-grid"><article class="console-card console-card--wide"><h3>Application status</h3>' + barRows(data.admissions.byStatus) + '</article><article class="console-card"><h3>Conversion boundary</h3><p><strong style="font-size:2rem">' + esc(data.admissions.convertedApplications) + '</strong><br>applications privately linked after admission</p><p><strong>' + esc(data.admissions.unlinkedApplications) + '</strong> remain eligible for OTP tracking.</p></article><article class="console-card console-card--wide"><h3>Submission route</h3>' + barRows(data.admissions.bySource) + '</article></div></section>' +
    '<section id="search" class="console-section"><div class="section-heading"><div><p class="eyebrow">Verified answer first</p><h2>Ask &amp; Search lab</h2><p>Test the shared safe-answer route, followed by related website matches.</p></div></div><div class="card-grid"><article class="console-card console-card--wide"><form class="lab-form" id="searchLab"><label class="sr-only" for="searchLabQuery">Test a website question</label><input id="searchLabQuery" placeholder="For example: What time does school close?" required><button class="primary-button" type="submit">Test Search</button></form><p class="note">Low-confidence answers offer “Ask the school to add or update it” instead of inventing a fact.</p></article><article class="console-card"><h3>Coverage snapshot</h3><p><strong style="font-size:2rem">' + esc(quality.searchCount) + '</strong><br>related-page entries</p><p>Generated knowledge base; safety and answer contracts run in local tests.</p></article></div></section>' +
    '<section id="quality" class="console-section"><div class="section-heading"><div><p class="eyebrow">Experience evidence</p><h2>Brand, accessibility, journey &amp; research</h2></div></div><div class="metric-grid">' + metric('Audited pages', quality.pages, quality.words + ' public words measured') + metric('Accessibility gaps', quality.accessibilityIssues, 'Missing labels, alt text or image sizes') + metric('Two-click journeys', quality.journeys, 'Pages reachable within two clicks') + metric('Brand actions', quality.brandGaps, 'Owner-supplied assets or decisions') + '</div><div class="card-grid" style="margin-top:1rem"><article class="console-card"><h3>Content quality</h3><p><strong>' + esc(quality.contentIssues) + '</strong> pages currently exceed generated clarity checks.</p></article><article class="console-card"><h3>Research posture</h3><p>Operational metrics avoid raw search text, form values, child data and visitor identifiers.</p></article><article class="console-card"><h3>Responsive themes</h3><p>Day and dark tokens, keyboard focus, reduced layout density and mobile tables are included.</p></article></div></section>' +
    '<section id="system" class="console-section"><div class="section-heading"><div><p class="eyebrow">Controlled activation</p><h2>System health &amp; feature gates</h2><p>Displayed state only; this console does not toggle production.</p></div></div>' + (hasHealth ? '<div class="card-grid"><article class="console-card console-card--wide"><h3>Environment gates</h3>' + gateGrid(data.gates) + '</article><article class="console-card"><h3>Session health</h3><p><span class="status-pill">' + esc(pretty(data.operations.sessionValidation)) + '</span></p><p>Every developer API call revalidates the current live server session and capability.</p></article></div>' : restricted('system-health-read')) + '</section>' +
    '<section id="release" class="console-section"><div class="section-heading"><div><p class="eyebrow">Completion control</p><h2>Legacy completion &amp; release readiness</h2></div></div><div class="card-grid"><article class="console-card console-card--wide"><h3>Preservation checklist</h3><ul class="check-list"><li>Former Supabase records remain preserved.</li><li><code>school_data</code> is not retired before verified cutover.</li><li>Payments remain manual and cannot approve admission.</li><li>Fresh parent access uses TA-LINK, TA-FAMILY or restricted applicant registration.</li><li>Primary progression excludes Primary 5.</li></ul></article><article class="console-card"><h3>Independent review</h3><p>The sensitive corpus stays encrypted and separate from this console.</p><a class="primary-button" href="/developer-review.html">Open encrypted Review</a></article><article class="console-card"><h3>Before release</h3><ul class="check-list"><li>Run SQL integration tests</li><li>Run browser and accessibility QA</li><li>Review environment variables</li><li>Owner approves push and deployment</li></ul></article><article class="console-card console-card--wide"><h3>Safe next action</h3><p>When local verification is complete, prepare one explicit release decision. Do not infer approval from a green test.</p></article></div></section>';
}
async function loadDashboard() {
  setStatus('Validating developer capability…');
  try {
    const data = await api('/api/developer/console');
    state.dashboard = data;
    shell.hidden = false;
    signOutButton.hidden = false;
    identityNode.innerHTML = '<strong>' + esc(data.profile.fullName) + '</strong><span>Capability-scoped developer</span>';
    app.innerHTML = dashboardMarkup(data);
    bindDashboard();
    await loadOtpQueue();
    setStatus('Developer capability verified. Sensitive records remain server-side.');
  } catch (error) {
    if (error.status === 401) { renderLogin('Your session ended. Sign in again.'); return; }
    if (error.status === 403) { await state.supabase.auth.signOut({ scope: 'local' }); renderLogin('This account does not have developer console access.'); return; }
    renderLogin(error.status === 404 ? 'The protected developer console is not enabled.' : 'The developer console could not be loaded safely.');
  }
}
function bindDashboard() {
  document.getElementById('refreshOtp')?.addEventListener('click', loadOtpQueue);
  document.getElementById('searchLab')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const query = document.getElementById('searchLabQuery').value.trim();
    if (!query) return;
    try { sessionStorage.setItem('taa_pending_search', query); } catch {}
    window.open('/search.html', '_blank', 'noopener');
  });
}
async function loadOtpQueue() {
  const host = document.getElementById('otpQueue');
  if (!host) return;
  if (!state.dashboard?.capabilities?.otp_dispatch) {
    host.innerHTML = '<div class="error-box">This account can view the console but does not have OTP dispatch capability.</div>';
    return;
  }
  host.innerHTML = '<p class="queue-empty">Refreshing queue…</p>';
  try {
    const result = await api('/api/developer/otp');
    const rows = result.queue || [];
    if (!rows.length) { host.innerHTML = '<p class="queue-empty">No active OTP delivery is waiting.</p>'; return; }
    host.innerHTML = '<div class="table-wrap"><table class="queue-table"><thead><tr><th>Requested</th><th>Phone</th><th>Channel</th><th>Expires</th><th>Action</th></tr></thead><tbody>' + rows.map((row) => '<tr><td>' + esc(new Date(row.requested_at).toLocaleTimeString('en-NG', {hour:'2-digit',minute:'2-digit'})) + '</td><td>•••• ' + esc(row.phone_last4) + '</td><td><span class="status-pill">' + esc(pretty(row.channel)) + '</span></td><td>' + esc(new Date(row.expires_at).toLocaleTimeString('en-NG', {hour:'2-digit',minute:'2-digit'})) + '</td><td>' + (row.status === 'queued' ? '<button class="primary-button" type="button" data-reveal="' + esc(row.id) + '">Reveal once</button>' : '<span class="status-pill warn">' + esc(pretty(row.status)) + '</span>') + '</td></tr>').join('') + '</tbody></table></div>';
    host.querySelectorAll('[data-reveal]').forEach((button) => button.addEventListener('click', () => revealOtp(button.dataset.reveal, button)));
  } catch (error) {
    host.innerHTML = '<div class="error-box">' + esc(error.message) + '</div>';
  }
}
function clearReveal(message = 'Delivery payload cleared from this page.') {
  if (state.revealTimer) clearTimeout(state.revealTimer);
  state.revealTimer = null;
  if (state.reveal) { state.reveal.message = ''; state.reveal.phone = ''; }
  state.reveal = null;
  const host = document.getElementById('secureReveal');
  if (host) host.innerHTML = '<p class="note">' + esc(message) + ' If the message was not delivered, the parent must request a new code.</p>';
}
async function logDispatch(action) {
  if (!state.reveal) return;
  await api('/api/developer/otp', { method: 'POST', body: { challengeId: state.reveal.challengeId, action } });
}
async function revealOtp(challengeId, button) {
  button.disabled = true;
  clearReveal('Opening one-time payload…');
  try {
    const payload = await api('/api/developer/otp', { method: 'POST', body: { challengeId, action: 'reveal' } });
    state.reveal = payload;
    renderReveal();
    state.revealTimer = setTimeout(() => clearReveal(), Number(payload.clearAfterSeconds || 30) * 1000);
    await loadOtpQueue();
  } catch (error) {
    clearReveal(error.message);
    button.disabled = false;
  }
}
function renderReveal() {
  const host = document.getElementById('secureReveal');
  const item = state.reveal;
  if (!host || !item) return;
  host.innerHTML = '<section class="secure-reveal" aria-labelledby="revealTitle"><p class="eyebrow">One-time delivery payload</p><h3 id="revealTitle">Send by ' + esc(pretty(item.channel)) + ' to ' + esc(item.phone) + '</h3><p>Server copy destroyed. This page clears in <span class="countdown" id="revealCountdown">' + esc(item.clearAfterSeconds) + ' seconds</span>.</p><div class="reveal-message" id="revealMessage"></div><div class="reveal-actions"><button class="primary-button" type="button" id="openChannel">Open ' + esc(pretty(item.channel)) + '</button><button class="quiet-button" type="button" id="copyMessage">Copy message</button><button class="quiet-button" type="button" id="markSent">Mark sent</button><button class="quiet-button" type="button" id="clearMessage">Clear now</button><button class="quiet-button" type="button" id="overwriteClipboard">Overwrite clipboard</button></div><p class="console-status" id="revealStatus" role="status"></p></section>';
  document.getElementById('revealMessage').textContent = item.message;
  let remaining = Number(item.clearAfterSeconds || 30);
  const interval = setInterval(() => {
    remaining -= 1;
    const node = document.getElementById('revealCountdown');
    if (!node || !state.reveal) { clearInterval(interval); return; }
    node.textContent = remaining + ' second' + (remaining === 1 ? '' : 's');
    if (remaining <= 0) clearInterval(interval);
  }, 1000);
  document.getElementById('openChannel').addEventListener('click', async () => {
    if (!state.reveal) return;
    const digits = state.reveal.phone.replace(/\D/g, '');
    const url = state.reveal.channel === 'whatsapp'
      ? 'https://wa.me/' + digits + '?text=' + encodeURIComponent(state.reveal.message)
      : 'sms:' + encodeURIComponent(state.reveal.phone) + '?body=' + encodeURIComponent(state.reveal.message);
    window.open(url, '_blank', 'noopener');
    try { await logDispatch('opened_channel'); document.getElementById('revealStatus').textContent = 'Channel opened. Confirm delivery, then mark sent.'; } catch {}
  });
  document.getElementById('copyMessage').addEventListener('click', async () => {
    if (!state.reveal) return;
    try {
      await navigator.clipboard.writeText(state.reveal.message);
      await logDispatch('copied');
      document.getElementById('revealStatus').textContent = 'Message copied. Use “Overwrite clipboard” as soon as delivery is complete.';
    } catch { document.getElementById('revealStatus').textContent = 'Clipboard access was not available. Use the channel button instead.'; }
  });
  document.getElementById('markSent').addEventListener('click', async () => {
    try { await logDispatch('marked_sent'); clearReveal('Marked sent and cleared from this page.'); await loadOtpQueue(); }
    catch (error) { document.getElementById('revealStatus').textContent = error.message; }
  });
  document.getElementById('clearMessage').addEventListener('click', () => clearReveal());
  document.getElementById('overwriteClipboard').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('Treasure Academy dispatch complete.'); document.getElementById('revealStatus').textContent = 'Clipboard overwritten by your action.'; }
    catch { document.getElementById('revealStatus').textContent = 'Clipboard could not be overwritten automatically. Copy any harmless text now.'; }
  });
}
signOutButton.addEventListener('click', async () => {
  clearReveal('Signed out; delivery payload cleared.');
  await state.supabase.auth.signOut({ scope: 'local' });
  renderLogin();
});

async function start() {
  configureTheme();
  try {
    const response = await fetch('/api/portal-config', { cache: 'no-store', headers: { Accept: 'application/json' } });
    const config = await response.json();
    if (!response.ok || !config.enabled || !config.url || !config.publishableKey) throw new Error('Portal configuration unavailable');
    state.supabase = createClient(config.url, config.publishableKey, {
      auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { headers: { 'X-Client-Info': 'treasure-academy-developer/1.0' } }
    });
    const { data } = await state.supabase.auth.getSession();
    if (data.session) await loadDashboard(); else renderLogin();
    state.supabase.auth.onAuthStateChange((event, session) => {
      state.session = session;
      if (event === 'SIGNED_OUT') renderLogin();
    });
  } catch {
    renderLogin('Secure sign-in configuration is not available.');
  }
}
start();
