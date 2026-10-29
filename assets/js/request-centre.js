(() => {
  'use strict';

  const createForm = document.getElementById('request-create-form');
  const statusForm = document.getElementById('request-status-form');
  const createMessage = document.getElementById('request-create-message');
  const statusMessage = document.getElementById('request-status-message');
  const createResult = document.getElementById('request-created');
  const statusResult = document.getElementById('request-status-result');
  const startedAt = document.getElementById('request-started-at');
  const tabs = [...document.querySelectorAll('[data-request-tab]')];
  const views = [...document.querySelectorAll('[data-request-view]')];
  const prefillKey = 'treasureacademy.requestPrefill';
  const referencePattern = /^TA-REQ-[0-9]{8}-[A-Z0-9]{8}$/;
  const trackingPattern = /^[A-HJ-NP-Z2-9]{4}(?:-[A-HJ-NP-Z2-9]{4}){3}$/;
  const requestTypes = new Set([...document.querySelectorAll('#request-type option')].map((option) => option.value).filter(Boolean));

  function text(value, max = 4000) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
  }
  function validDate(value) {
    return typeof value === 'string' && value.length <= 40 && Number.isFinite(Date.parse(value));
  }
  function showMessage(node, message, isError = false) {
    if (!node) return;
    node.textContent = message;
    node.classList.toggle('is-error', isError);
    node.classList.toggle('is-success', !isError && Boolean(message));
  }
  function setPending(form, pending) {
    const button = form?.querySelector('button[type="submit"]');
    if (!button) return;
    if (!button.dataset.label) button.dataset.label = button.textContent;
    button.disabled = pending;
    button.textContent = pending ? 'Please wait…' : button.dataset.label;
  }
  function showTab(name, focus = false) {
    const selected = name === 'check' ? 'check' : 'create';
    tabs.forEach((tab) => {
      const active = tab.dataset.requestTab === selected;
      tab.setAttribute('aria-selected', String(active));
      tab.tabIndex = active ? 0 : -1;
    });
    views.forEach((view) => { view.hidden = view.dataset.requestView !== selected; });
    if (focus) {
      const heading = document.querySelector(`[data-request-view="${selected}"] h2`);
      heading?.focus();
    }
    history.replaceState(null, '', selected === 'check' ? '#check' : `${location.pathname}${location.search}`);
  }
  function activateTab(tab, focusHeading = false) {
    if (!tab?.dataset.requestTab) return;
    showTab(tab.dataset.requestTab, focusHeading);
  }
  tabs.forEach((tab) => {
    tab.addEventListener('click', (event) => {
      event.preventDefault();
      activateTab(tab, tab.getAttribute('role') !== 'tab');
    });
    if (tab.getAttribute('role') === 'tab') {
      tab.addEventListener('keydown', (event) => {
        const tabButtons = tabs.filter((item) => item.getAttribute('role') === 'tab');
        const index = tabButtons.indexOf(tab);
        let next = index;
        if (event.key === 'ArrowRight') next = (index + 1) % tabButtons.length;
        else if (event.key === 'ArrowLeft') next = (index - 1 + tabButtons.length) % tabButtons.length;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = tabButtons.length - 1;
        else return;
        event.preventDefault();
        tabButtons[next].focus();
        activateTab(tabButtons[next]);
      });
    }
  });

  async function post(url, payload) {
    const response = await fetch(url, {
      method: 'POST', credentials: 'same-origin', cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    });
    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    if (!contentType.startsWith('application/json')) throw new Error('The website received an unexpected response. Nothing on this page was cleared.');
    const body = await response.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('The website received an incomplete response. Nothing on this page was cleared.');
    if (!response.ok) throw new Error(text(body.error, 300) || 'The request could not be completed.');
    return body;
  }

  function createContract(body) {
    return referencePattern.test(text(body.reference, 24).toUpperCase())
      && trackingPattern.test(text(body.trackingCode, 19).toUpperCase())
      && text(body.status, 40)
      && text(body.statusLabel, 120)
      && validDate(body.submittedAt);
  }
  function statusContract(body, expectedReference) {
    return referencePattern.test(text(body.reference, 24).toUpperCase())
      && text(body.reference, 24).toUpperCase() === expectedReference
      && requestTypes.has(text(body.requestType, 40))
      && text(body.status, 40)
      && text(body.statusLabel, 120)
      && validDate(body.submittedAt)
      && validDate(body.updatedAt)
      && (body.publicNote === null || body.publicNote === undefined || typeof body.publicNote === 'string');
  }

  function storedPrefill() {
    try {
      const value = JSON.parse(sessionStorage.getItem(prefillKey) || 'null');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }
  function applyPrefill() {
    if (!createForm) return;
    const params = new URLSearchParams(location.search);
    const queryClass = text(params.get('class'), 40);
    const type = text(params.get('type'), 40);
    const saved = storedPrefill();
    const prefill = {
      requestType: requestTypes.has(type) ? type : text(saved.requestType, 40),
      classCode: queryClass || text(saved.classCode, 40),
      subject: text(saved.subject, 160),
      message: text(saved.message, 4000)
    };
    if (queryClass) {
      prefill.requestType = 'class_enquiry';
      prefill.subject = `Class enquiry — ${queryClass}`;
      prefill.message = `I would like to ask about current availability and admission guidance for ${queryClass}.`;
      try { sessionStorage.setItem(prefillKey, JSON.stringify(prefill)); } catch {}
    }
    if (prefill.requestType && requestTypes.has(prefill.requestType)) createForm.elements.requestType.value = prefill.requestType;
    ['classCode', 'subject', 'message'].forEach((name) => {
      if (prefill[name] && createForm.elements[name] && !createForm.elements[name].value) createForm.elements[name].value = prefill[name];
    });
  }

  let createdDetails = '';
  createForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(createMessage, '');
    createResult.hidden = true;
    if (!createForm.reportValidity()) return;
    const data = new FormData(createForm);
    setPending(createForm, true);
    try {
      const payload = Object.fromEntries(data.entries());
      payload.startedAt = Number(payload.startedAt || 0);
      const result = await post('/api/requests/create', payload);
      if (!createContract(result)) throw new Error('The website received an incomplete confirmation. Your form is still here; please do not assume a reference was created.');
      const reference = text(result.reference, 24).toUpperCase();
      const trackingCode = text(result.trackingCode, 19).toUpperCase();
      const submitted = new Date(result.submittedAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
      document.getElementById('created-reference').textContent = reference;
      document.getElementById('created-tracking-code').textContent = trackingCode;
      document.getElementById('created-time').textContent = submitted;
      createdDetails = `Treasure Academy website request\nReference: ${reference}\nPrivate tracking code: ${trackingCode}\nSubmitted: ${submitted}`;
      const manual = document.getElementById('request-copy-manual');
      const manualText = document.getElementById('request-copy-text');
      if (manual) manual.hidden = true;
      if (manualText) manualText.value = createdDetails;
      createForm.reset();
      if (startedAt) startedAt.value = String(Date.now());
      try { sessionStorage.removeItem(prefillKey); } catch {}
      createResult.hidden = false;
      createResult.focus();
      showMessage(createMessage, 'The website created your reference. Save both values before leaving this page.');
    } catch (error) {
      showMessage(createMessage, error.message || 'The Request Centre is unavailable. No success is being claimed.', true);
    } finally { setPending(createForm, false); }
  });

  document.getElementById('request-copy-details')?.addEventListener('click', async () => {
    const copyMessage = document.getElementById('request-copy-message');
    const manual = document.getElementById('request-copy-manual');
    const manualText = document.getElementById('request-copy-text');
    if (!createdDetails) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard unavailable');
      await navigator.clipboard.writeText(createdDetails);
      if (manual) manual.hidden = true;
      showMessage(copyMessage, 'Tracking details copied. Keep them private.');
    } catch {
      if (manual) manual.hidden = false;
      if (manualText) {
        manualText.value = createdDetails;
        manualText.focus();
        manualText.select();
      }
      showMessage(copyMessage, 'Automatic copying was unavailable. Select and copy the tracking details shown below.', true);
    }
  });

  statusForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    showMessage(statusMessage, '');
    statusResult.hidden = true;
    if (!statusForm.reportValidity()) return;
    const data = Object.fromEntries(new FormData(statusForm).entries());
    data.reference = text(data.reference, 24).toUpperCase();
    data.trackingCode = text(data.trackingCode, 19).toUpperCase();
    setPending(statusForm, true);
    try {
      const result = await post('/api/requests/status', data);
      if (!statusContract(result, data.reference)) throw new Error('The website received an incomplete status response. No result is being shown.');
      document.getElementById('status-reference').textContent = text(result.reference, 24).toUpperCase();
      document.getElementById('status-kind').textContent = text(result.requestType, 40).replaceAll('_', ' ');
      document.getElementById('status-state').textContent = text(result.statusLabel, 120);
      document.getElementById('status-submitted').textContent = new Date(result.submittedAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
      document.getElementById('status-updated').textContent = new Date(result.updatedAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' });
      const note = text(result.publicNote, 2000);
      const noteRow = document.getElementById('status-note-row');
      noteRow.hidden = !note;
      document.getElementById('status-note').textContent = note;
      statusResult.hidden = false;
      statusResult.focus();
      showMessage(statusMessage, 'Private status retrieved.');
    } catch (error) {
      showMessage(statusMessage, error.message || 'The request status could not be checked.', true);
    } finally { setPending(statusForm, false); }
  });

  if (startedAt) startedAt.value = String(Date.now());
  applyPrefill();
  showTab(location.hash === '#check' ? 'check' : 'create');
})();
