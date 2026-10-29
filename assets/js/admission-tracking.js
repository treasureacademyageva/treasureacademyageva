(() => {
  'use strict';

  const root = document.getElementById('admissionTracker');
  if (!root) return;

  const requestForm = document.getElementById('admissionOtpRequest');
  const verifyForm = document.getElementById('admissionOtpVerify');
  const phoneInput = document.getElementById('admissionPhone');
  const codeInput = document.getElementById('admissionOtpCode');
  const confirmWrap = document.getElementById('whatsappConfirmWrap');
  const confirmInput = document.getElementById('whatsappConfirmed');
  const state = document.getElementById('admissionRequestState');
  const result = document.getElementById('admissionTrackingResult');
  const restart = document.getElementById('admissionOtpRestart');
  const tokenPattern = /^[A-Za-z0-9_-]{32,100}$/;
  let requestToken = '';

  function clean(value, max = 1000) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }
  function validDate(value) {
    return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
  }
  function showState(message, tone = 'info') {
    state.hidden = !message;
    state.textContent = message || '';
    state.dataset.tone = tone;
  }
  function pending(form, active, waitingLabel) {
    const button = form?.querySelector('button[type="submit"]');
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = active;
    button.textContent = active ? waitingLabel : button.dataset.label;
  }
  function selectedChannel() {
    return requestForm.querySelector('input[name="admissionChannel"]:checked')?.value || '';
  }
  function syncWhatsAppConfirm() {
    const whatsapp = selectedChannel() === 'whatsapp';
    confirmWrap.hidden = !whatsapp;
    confirmWrap.classList.toggle('is-visible', whatsapp);
    confirmInput.required = whatsapp;
    if (!whatsapp) confirmInput.checked = false;
  }
  requestForm.querySelectorAll('input[name="admissionChannel"]').forEach((input) => input.addEventListener('change', syncWhatsAppConfirm));
  syncWhatsAppConfirm();

  async function post(url, payload) {
    const response = await fetch(url, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('application/json')) throw new Error('The website received an unexpected response. Your details remain in the form.');
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('The website received an incomplete response. Your details remain in the form.');
    if (!response.ok) throw new Error(clean(body.error, 300) || 'The request could not be completed.');
    return body;
  }
  function requestContract(body) {
    return body.accepted === true
      && tokenPattern.test(clean(body.requestToken, 100))
      && Number.isInteger(body.expiresInSeconds)
      && body.expiresInSeconds > 0
      && body.expiresInSeconds <= 600
      && Boolean(clean(body.message, 600));
  }
  function applicationContract(application) {
    if (!application || typeof application !== 'object' || Array.isArray(application)) return false;
    return Boolean(clean(application.reference, 100))
      && Boolean(clean(application.childName, 160))
      && Boolean(clean(application.requestedClass, 80))
      && Boolean(clean(application.status, 80))
      && validDate(application.submittedAt)
      && validDate(application.updatedAt)
      && (application.message === null || application.message === undefined || typeof application.message === 'string')
      && (application.nextStep === null || application.nextStep === undefined || typeof application.nextStep === 'string')
      && (application.session === null || application.session === undefined || typeof application.session === 'string');
  }
  function verifyContract(body) {
    return body.verified === true
      && Array.isArray(body.applications)
      && body.applications.length <= 20
      && body.applications.every(applicationContract)
      && Array.isArray(body.portalContinuationTokens)
      && body.portalContinuationTokens.length <= 10
      && body.portalContinuationTokens.every((token) => tokenPattern.test(String(token || '')))
      && typeof body.portalLoginAvailable === 'boolean';
  }

  function make(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function addField(list, term, value) {
    if (!value) return;
    const row = make('div', 'tracker-result-row');
    row.append(make('dt', '', term), make('dd', '', value));
    list.append(row);
  }
  function statusCard(application) {
    const article = make('article', 'tracker-result-card');
    article.append(make('h3', '', `Application ${clean(application.reference, 100)}`));
    const list = make('dl', 'tracker-result-list');
    addField(list, 'Child', clean(application.childName, 160));
    addField(list, 'Requested class', clean(application.requestedClass, 80));
    addField(list, 'Status', clean(application.status, 80).replaceAll('_', ' '));
    addField(list, 'Session', clean(application.session, 100));
    if (validDate(application.submittedAt) && application.submittedAt) addField(list, 'Submitted', new Date(application.submittedAt).toLocaleDateString('en-NG', { dateStyle: 'medium' }));
    if (validDate(application.updatedAt) && application.updatedAt) addField(list, 'Updated', new Date(application.updatedAt).toLocaleDateString('en-NG', { dateStyle: 'medium' }));
    article.append(list);
    if (clean(application.message, 1000)) article.append(make('p', 'tracker-verdict', clean(application.message, 1000)));
    if (clean(application.nextStep, 1000)) article.append(make('p', 'tracker-next-step', `Next step: ${clean(application.nextStep, 1000)}`));
    return article;
  }
  function renderResults(payload) {
    result.replaceChildren();
    const heading = make('h3', '', 'Application status');
    result.append(heading, make('p', 'tracker-privacy', 'Only unlinked new-pupil applications are shown here. Existing linked pupils require secure parent sign-in.'));
    if (!payload.applications.length) result.append(make('p', 'tracker-empty', 'No active new-pupil application is available to show. Converted pupil records require full parent sign-in.'));
    payload.applications.forEach((application) => result.append(statusCard(application)));
    if (payload.portalContinuationTokens.length && payload.portalLoginAvailable) {
      try { sessionStorage.setItem('taa_admission_continuations', JSON.stringify(payload.portalContinuationTokens)); } catch {}
      const link = make('a', 'btn btn-white tracker-portal', 'Continue to secure parent sign-in');
      link.href = '/portal/login.html';
      result.append(link);
    }
    result.focus();
  }

  requestForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showState('');
    result.replaceChildren();
    if (!requestForm.reportValidity()) return;
    const channel = selectedChannel();
    pending(requestForm, true, 'Requesting code…');
    try {
      const body = await post('/api/admission-tracking/request', {
        phone: phoneInput.value,
        channel,
        whatsappConfirmed: channel === 'whatsapp' && confirmInput.checked
      });
      if (!requestContract(body)) throw new Error('The website received an incomplete confirmation. The code stage has not been opened; please try again.');
      requestToken = clean(body.requestToken, 100);
      requestForm.hidden = true;
      verifyForm.hidden = false;
      showState(clean(body.message, 600), 'success');
      codeInput.focus();
    } catch (error) {
      showState(error.message || 'Admission tracking is temporarily unavailable.', 'error');
    } finally { pending(requestForm, false, 'Requesting code…'); }
  });

  verifyForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    showState('');
    if (!verifyForm.reportValidity() || !tokenPattern.test(requestToken)) {
      if (!requestToken) showState('Request a new code before checking an application.', 'error');
      return;
    }
    pending(verifyForm, true, 'Checking status…');
    try {
      const body = await post('/api/admission-tracking/verify', { requestToken, code: codeInput.value.trim() });
      if (!verifyContract(body)) throw new Error('The website received an incomplete status response. No application result is being shown.');
      renderResults(body);
      showState('Private application status retrieved.', 'success');
    } catch (error) {
      showState(error.message || 'The code could not be checked.', 'error');
    } finally { pending(verifyForm, false, 'Checking status…'); }
  });

  restart.addEventListener('click', () => {
    requestToken = '';
    verifyForm.reset();
    requestForm.hidden = false;
    verifyForm.hidden = true;
    result.replaceChildren();
    showState('');
    phoneInput.focus();
  });
})();
