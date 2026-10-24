(function () {
  'use strict';
  var root = document.getElementById('admissionTracker');
  if (!root) return;
  var requestForm = document.getElementById('admissionOtpRequest');
  var verifyForm = document.getElementById('admissionOtpVerify');
  var phoneInput = document.getElementById('admissionPhone');
  var whatsappConfirm = document.getElementById('whatsappConfirmWrap');
  var whatsappCheckbox = document.getElementById('whatsappConfirmed');
  var requestState = document.getElementById('admissionRequestState');
  var result = document.getElementById('admissionTrackingResult');
  var requestToken = '';

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character];
    });
  }
  function setState(message, error) {
    requestState.hidden = !message;
    requestState.classList.toggle('tracker-error', !!error);
    requestState.textContent = message || '';
  }
  function setBusy(form, busy) {
    var button = form.querySelector('button[type="submit"]');
    if (!button) return;
    button.disabled = busy;
    button.classList.toggle('loading-button', busy);
    button.setAttribute('aria-busy', busy ? 'true' : 'false');
  }
  async function post(url, payload) {
    var response = await fetch(url, {
      method: 'POST',
      credentials: 'same-origin',
      headers: {'Content-Type':'application/json','Accept':'application/json'},
      body: JSON.stringify(payload)
    });
    var body = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(body.error || 'The service is temporarily unavailable.');
    return body;
  }
  function channel() {
    var checked = requestForm.querySelector('input[name="admissionChannel"]:checked');
    return checked ? checked.value : '';
  }
  function refreshChannel() {
    var isWhatsapp = channel() === 'whatsapp';
    whatsappConfirm.classList.toggle('is-visible', isWhatsapp);
    whatsappCheckbox.required = isWhatsapp;
    if (!isWhatsapp) whatsappCheckbox.checked = false;
  }
  requestForm.querySelectorAll('input[name="admissionChannel"]').forEach(function (input) {
    input.addEventListener('change', refreshChannel);
  });
  refreshChannel();

  requestForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    setState('', false);
    if (!requestForm.reportValidity()) return;
    setBusy(requestForm, true);
    try {
      var choice = channel();
      var body = await post('/api/admission/track/request', {
        phone: phoneInput.value,
        channel: choice,
        whatsappConfirmed: choice === 'whatsapp' && whatsappCheckbox.checked
      });
      requestToken = body.requestToken || '';
      setState(body.message || 'If eligible, the code is now awaiting protected delivery.', false);
      verifyForm.hidden = false;
      requestForm.hidden = true;
      document.getElementById('admissionOtpCode').focus();
    } catch (error) {
      if (/not found/i.test(error.message)) {
        setState('Secure tracking is not active yet. Ask the school through the Request Centre.', true);
      } else setState(error.message, true);
    } finally {
      setBusy(requestForm, false);
    }
  });

  document.getElementById('admissionOtpRestart').addEventListener('click', function () {
    requestToken = '';
    verifyForm.reset();
    verifyForm.hidden = true;
    requestForm.hidden = false;
    result.innerHTML = '';
    setState('', false);
    phoneInput.focus();
  });

  function statusLabel(status) {
    return ({pending:'Received',under_review:'Under review',offered:'Offer made',declined:'Closed',withdrawn:'Withdrawn'})[status] || 'In progress';
  }
  function formatDate(value) {
    try { return new Intl.DateTimeFormat('en-NG', {dateStyle:'medium'}).format(new Date(value)); } catch (error) { return ''; }
  }
  function renderApplications(body) {
    var rows = Array.isArray(body.applications) ? body.applications : [];
    var cards = rows.map(function (row) {
      return '<article class="application-card">' +
        '<p class="sec-tag">' + esc(statusLabel(row.status)) + '</p>' +
        '<h3>' + esc(row.childName) + '</h3>' +
        '<div class="application-meta"><span>' + esc(row.requestedClass) + '</span><span>' + esc(row.reference) + '</span></div>' +
        (row.message ? '<p>' + esc(row.message) + '</p>' : '') +
        (row.nextStep ? '<p><strong>Next step:</strong> ' + esc(row.nextStep) + '</p>' : '') +
        '<p class="tracker-privacy">Last updated ' + esc(formatDate(row.updatedAt)) + '</p></article>';
    }).join('');
    var tokens = Array.isArray(body.portalContinuationTokens) ? body.portalContinuationTokens : [];
    if (tokens.length) {
      try { sessionStorage.setItem('taa_admission_continuations', JSON.stringify(tokens)); } catch (error) {}
    }
    var heading = rows.length
      ? '<h2>Application status</h2><p>Only unlinked new-pupil applications are shown here.</p>'
      : '<h2>No unlinked application to show</h2><p>No active unlinked new-pupil application was found for this verified account.</p>';
    var portal = '<div class="private-continuation"><h3>Already admitted or linked?</h3><p>Existing linked pupils are never shown in this lightweight tracker. Sign in with this same parent account to continue privately.</p><a class="btn btn-mint" href="/portal/login.html" id="admissionPortalContinue">Sign in to continue securely</a></div>';
    result.innerHTML = heading + '<div class="application-list">' + cards + '</div>' + portal;
    result.focus();
  }

  verifyForm.addEventListener('submit', async function (event) {
    event.preventDefault();
    setState('', false);
    if (!requestToken || !verifyForm.reportValidity()) return;
    setBusy(verifyForm, true);
    try {
      var body = await post('/api/admission/track/verify', {
        requestToken: requestToken,
        code: document.getElementById('admissionOtpCode').value
      });
      document.getElementById('admissionOtpCode').value = '';
      requestToken = '';
      verifyForm.hidden = true;
      renderApplications(body);
    } catch (error) {
      setState(error.message, true);
    } finally {
      setBusy(verifyForm, false);
    }
  });
})();
