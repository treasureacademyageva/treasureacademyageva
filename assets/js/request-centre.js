(() => {
  'use strict';
  const byId = (id) => document.getElementById(id);
  const createForm = byId('request-create-form');
  const statusForm = byId('request-status-form');
  const createMessage = byId('request-create-message');
  const statusMessage = byId('request-status-message');
  const result = byId('request-created');
  const statusResult = byId('request-status-result');
  const startedAt = byId('request-started-at');
  const type = byId('request-type');
  const tabs = [...document.querySelectorAll('[data-request-tab]')];
  const views = [...document.querySelectorAll('[data-request-view]')];
  const typeValues = new Set([...type.options].map((option) => option.value));

  startedAt.value = String(Date.now());
  const requestedType = new URLSearchParams(location.search).get('type');
  if (typeValues.has(requestedType)) type.value = requestedType;
  try {
    const prefill = JSON.parse(sessionStorage.getItem('taa_request_prefill') || 'null');
    sessionStorage.removeItem('taa_request_prefill');
    if (prefill && prefill.type === requestedType) {
      const subject = createForm.elements.namedItem('subject');
      const message = createForm.elements.namedItem('message');
      if (subject && typeof prefill.subject === 'string') subject.value = prefill.subject.slice(0, 160);
      if (message && typeof prefill.message === 'string') message.value = prefill.message.slice(0, 4000);
    }
  } catch {}

  function showTab(name) {
    tabs.forEach((button) => button.setAttribute('aria-selected', String(button.dataset.requestTab === name)));
    views.forEach((view) => { view.hidden = view.dataset.requestView !== name; });
    const heading = document.querySelector(`[data-request-view="${name}"] h2`);
    heading?.focus?.();
  }
  tabs.forEach((button) => button.addEventListener('click', () => showTab(button.dataset.requestTab)));
  if (location.hash === '#check') showTab('check');

  function setMessage(node, text, kind = '') {
    node.textContent = text;
    if (kind) node.dataset.kind = kind; else delete node.dataset.kind;
    node.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  }
  function formatDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? 'Not recorded' : new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
  }
  async function post(url, payload) {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      cache: 'no-store',
      body: JSON.stringify(payload)
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || 'The school website could not complete the request.');
    return body;
  }

  createForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!createForm.reportValidity()) return;
    const submit = createForm.querySelector('[type="submit"]');
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    result.hidden = true;
    setMessage(createMessage, 'Creating a school website reference…');
    const values = new FormData(createForm);
    try {
      const body = await post('/api/requests', {
        requestType: values.get('requestType'),
        name: values.get('name'),
        phone: values.get('phone'),
        email: values.get('email'),
        classCode: values.get('classCode'),
        subject: values.get('subject'),
        message: values.get('message'),
        website: values.get('website'),
        startedAt: Number(values.get('startedAt'))
      });
      byId('created-reference').textContent = body.reference;
      byId('created-tracking-code').textContent = body.trackingCode;
      byId('created-time').textContent = formatDate(body.submittedAt);
      result.hidden = false;
      setMessage(createMessage, 'Your request was saved by the school website.', 'success');
      createForm.reset();
      startedAt.value = String(Date.now());
      result.focus();
    } catch (error) {
      setMessage(createMessage, error.message || 'No reference was created. Please try again.', 'error');
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  });

  statusForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!statusForm.reportValidity()) return;
    const submit = statusForm.querySelector('[type="submit"]');
    submit.disabled = true;
    statusResult.hidden = true;
    setMessage(statusMessage, 'Checking the private tracking details…');
    const values = new FormData(statusForm);
    try {
      const body = await post('/api/requests/status', {
        reference: values.get('reference'), trackingCode: values.get('trackingCode')
      });
      byId('status-reference').textContent = body.reference;
      byId('status-kind').textContent = String(body.requestType || '').replaceAll('_', ' ');
      byId('status-state').textContent = body.statusLabel;
      byId('status-submitted').textContent = formatDate(body.submittedAt);
      byId('status-updated').textContent = formatDate(body.updatedAt);
      const noteRow = byId('status-note-row');
      if (body.publicNote) {
        byId('status-note').textContent = body.publicNote;
        noteRow.hidden = false;
      } else noteRow.hidden = true;
      statusResult.hidden = false;
      setMessage(statusMessage, 'Matching request found.', 'success');
      statusResult.focus();
    } catch (error) {
      setMessage(statusMessage, error.message || 'The details did not match a request.', 'error');
    } finally { submit.disabled = false; }
  });
})();
