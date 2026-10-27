import { createClient } from '@supabase/supabase-js';

let cmsModule = null;
function emptyCmsState(error = false) {
  return cmsModule ? cmsModule.emptyCmsState(error) : {
    available: false,
    error,
    capabilities: { view_private: false },
    entries: [], revisions: [], blocks: [], media: []
  };
}
function canUseCms(cms) {
  return cmsModule ? cmsModule.canUseCms(cms) : false;
}
async function loadCmsBundle() {
  if (cmsModule) return cmsModule;
  await new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = '/assets/js/cms-workspace-app.js?v=20261027-cms1';
    script.async = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.append(script);
  });
  if (!window.TreasureAcademyCms) throw new Error('CMS bundle unavailable');
  cmsModule = window.TreasureAcademyCms;
  return cmsModule;
}

const WHATSAPP_NUMBER = '2349063932487';
const app = document.querySelector('#portal-app');
const bootStatus = document.querySelector('#portal-status');
const themeToggle = document.querySelector('#theme-toggle');
const SCHOOL_CLASSES = ['Pre-Nursery', 'Nursery 1', 'Nursery 2', 'Primary 1', 'Primary 2', 'Primary 3', 'Primary 4', 'Primary 6'];
const ASSESSMENT_SCHEMES = Object.freeze({
  pre_nursery_exam_100: { label: 'Pre-Nursery: Examination 100', ca1: 0, ca2: 0, ca3: 0, exam: 100, entries: 1 },
  three_entry_15_15_70: { label: 'Three entries: CA 15 + CA 15 + Examination 70', ca1: 15, ca2: 15, ca3: 0, exam: 70, entries: 3 },
  four_entry_10_10_10_70: { label: 'Four entries: CA 10 + CA 10 + CA 10 + Examination 70', ca1: 10, ca2: 10, ca3: 10, exam: 70, entries: 4 }
});

const state = {
  supabase: null,
  user: null,
  profile: null,
  data: {},
  cms: emptyCmsState(),
  features: { registration: false, accountClaim: false, office: false, cms: false, media: false, engagement: false, comments: false, placements: false, publicSearch: false, coreSlots: false, publicInventory: false },
  tab: 'overview',
  hubTab: 'term-bills',
  admissionContinuations: [],
  admissionContinuationMismatch: false,
  loading: false
};

function h(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs || {}).forEach(([key, value]) => {
    if (value === null || value === undefined || value === false) return;
    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === 'checked' || key === 'required' || key === 'disabled' || key === 'selected') node[key] = Boolean(value);
    else node.setAttribute(key, String(value));
  });
  children.flat(Infinity).forEach((child) => {
    if (child === null || child === undefined || child === false) return;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

function replace(target, ...children) {
  target.replaceChildren(...children.flat(Infinity).filter(Boolean));
}

function icon(name) {
  const paths = {
    lock: 'M7 10V7a5 5 0 0 1 10 0v3m-9 0h8a2 2 0 0 1 2 2v7H6v-7a2 2 0 0 1 2-2Z',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0',
    pupils: 'M16 20v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1m7-9a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm13 9v-1a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
    results: 'M9 11h6m-6 4h6M7 3h7l4 4v14H6V3h1Zm7 0v5h5',
    payments: 'M3 7h18v12H3V7Zm0 4h18M7 15h3',
    shield: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Zm-3-10 2 2 4-5',
    classes: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14Zm0 0V5.5',
    attendance: 'M5 3h14v18H5V3Zm4-1v4m6-4v4M8 11l2 2 5-5m-7 9h8',
    homework: 'M4 4h16v16H4V4Zm4 4h8M8 12h8M8 16h5',
    inbox: 'M4 5h16v14H4V5Zm0 9h4l2 3h4l2-3h4',
    publish: 'M12 3v12m-4-4 4 4 4-4M5 19h14',
    audit: 'M12 8v4l3 2m6-2a9 9 0 1 1-9-9 9 9 0 0 1 9 9Z'
  };
  return h('svg', { viewBox: '0 0 24 24', 'aria-hidden': 'true', focusable: 'false', class: 'icon' },
    h('path', { d: paths[name] || paths.shield, fill: 'none', stroke: 'currentColor', 'stroke-width': '1.8', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' })
  );
}

function alertBox(kind, title, message) {
  return h('div', { class: `alert alert--${kind}`, role: kind === 'error' ? 'alert' : 'status' },
    icon(kind === 'error' ? 'shield' : 'lock'),
    h('div', {}, h('strong', { text: title }), h('p', { text: message }))
  );
}

function setStatus(message, error = false) {
  if (!bootStatus) return;
  bootStatus.textContent = message;
  bootStatus.className = error ? 'portal-status portal-status--error' : 'portal-status';
  bootStatus.setAttribute('role', error ? 'alert' : 'status');
}

function friendlyError() {
  return 'We could not complete that request. Check your connection and permissions, then try again.';
}

function primaryButton(label, options = {}) {
  const button = h('button', {
    type: options.type || 'button',
    class: `button ${options.secondary ? 'button--secondary' : ''}`,
    onClick: options.onClick,
    disabled: options.disabled
  }, options.icon ? icon(options.icon) : null, h('span', { text: label }));
  return button;
}

let idCounter = 0;
function controlField(label, input, hint) {
  const id = input.id || `field-${++idCounter}`;
  input.id = id;
  const describedBy = hint ? `${id}-hint` : null;
  if (describedBy) input.setAttribute('aria-describedby', describedBy);
  return h('div', { class: 'field' },
    h('label', { for: id, text: label }),
    hint ? h('p', { id: describedBy, class: 'field__hint', text: hint }) : null,
    input
  );
}

function textInput(name, label, options = {}) {
  return controlField(label, h('input', {
    name,
    type: options.type || 'text',
    autocomplete: options.autocomplete || 'off',
    required: options.required !== false,
    min: options.min,
    max: options.max,
    step: options.step,
    maxlength: options.maxlength,
    inputmode: options.inputmode,
    placeholder: options.placeholder
  }), options.hint);
}

function selectInput(name, label, values, options = {}) {
  const select = h('select', { name, required: options.required !== false });
  if (options.placeholder) select.append(h('option', { value: '', text: options.placeholder, selected: true, disabled: true }));
  values.forEach((item) => {
    const value = typeof item === 'string' ? item : item.value;
    const text = typeof item === 'string' ? item : item.label;
    select.append(h('option', { value, text }));
  });
  return controlField(label, select, options.hint);
}

let pendingMutationMessage = '';

function formMessage() {
  return h('div', { class: 'form-message', 'aria-live': 'polite' });
}

function setFormMessage(node, message, error = false) {
  node.textContent = message;
  node.className = `form-message ${error ? 'form-message--error' : 'form-message--success'}`;
  node.setAttribute('role', error ? 'alert' : 'status');
  if (error) node.focus?.();
  else pendingMutationMessage = message;
}

function normalizeNigerianPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (/^234[789]\d{9}$/.test(digits)) return `+${digits}`;
  if (/^0[789]\d{9}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^[789]\d{9}$/.test(digits)) return `+234${digits}`;
  return null;
}

function formatMoney(value) {
  return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 2 }).format(Number(value || 0));
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(date);
}

function titleCase(value) {
  return String(value || '').replaceAll('_', ' ').replace(/\b\w/g, (match) => match.toUpperCase());
}

function badge(value) {
  const normalized = String(value || 'unknown').toLowerCase();
  return h('span', { class: `badge badge--${normalized.replace(/[^a-z]+/g, '-')}`, text: titleCase(value) });
}

function emptyState(title, message) {
  return h('div', { class: 'empty-state' }, icon('classes'), h('h3', { text: title }), h('p', { text: message }));
}

function section(title, intro, ...content) {
  return h('section', { class: 'portal-section' },
    h('div', { class: 'section-heading' }, h('h2', { text: title }), intro ? h('p', { text: intro }) : null),
    ...content
  );
}

function statCard(label, value, note, iconName) {
  return h('article', { class: 'stat-card' },
    h('div', { class: 'stat-card__icon' }, icon(iconName)),
    h('p', { class: 'stat-card__label', text: label }),
    h('strong', { class: 'stat-card__value', text: String(value) }),
    h('p', { class: 'stat-card__note', text: note })
  );
}

function table(headers, rows, label) {
  if (!rows.length) return null;
  return h('div', { class: 'table-scroll', role: 'region', tabindex: '0', 'aria-label': label },
    h('table', {},
      h('thead', {}, h('tr', {}, headers.map((heading) => h('th', { scope: 'col', text: heading })))),
      h('tbody', {}, rows.map((cells) => h('tr', {}, cells.map((cell) => h('td', {}, cell)))))
    )
  );
}

function configureTheme() {
  const stored = sessionStorage.getItem('treasure-portal-theme');
  const dark = stored ? stored === 'dark' : window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  updateThemeButton();
}

function updateThemeButton() {
  const dark = document.documentElement.dataset.theme === 'dark';
  if (!themeToggle) return;
  themeToggle.setAttribute('aria-pressed', String(dark));
  themeToggle.querySelector('span').textContent = dark ? 'Use light theme' : 'Use dark theme';
}

themeToggle?.addEventListener('click', () => {
  const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = next;
  sessionStorage.setItem('treasure-portal-theme', next);
  updateThemeButton();
});

function renderMaintenance() {
  replace(app,
    h('div', { class: 'auth-layout' },
      h('section', { class: 'auth-card', 'aria-labelledby': 'maintenance-title' },
        h('p', { class: 'eyebrow', text: 'Treasure Academy portal' }),
        h('h1', { id: 'maintenance-title', text: 'Your school portal is being securely reconnected' }),
        h('p', { text: 'The former portal and its history are being preserved. Sign-in remains paused while the existing Supabase records are inventoried and placed behind secure parent, teacher and administrator access.' }),
        alertBox('info', 'Preserve first, then reconnect', 'Nothing should be overwritten or retired until the owner-controlled backup, record mapping and access tests are complete.'),
        h('div', { class: 'button-row' },
          h('a', { class: 'button', href: '/' }, h('span', { text: 'Return to website' })),
          h('a', { class: 'button button--secondary', href: `https://wa.me/${WHATSAPP_NUMBER}` }, h('span', { text: 'Contact the school' }))
        )
      ),
      h('aside', { class: 'portal-art-panel', 'aria-label': 'Treasure Academy portal illustration' },
        h('img', { src: '/assets/img/login-art.webp', width: '768', height: '1376', alt: 'Illustration of a welcoming school and secure account panel' }),
        h('p', { class: 'portal-art-panel__caption', text: 'The familiar portal look is being restored on a secure foundation.' })
      )
    )
  );
  setStatus('Portal reconnection is not active yet.');
}

async function postAccountApi(url, body) {
  const { data, error } = await state.supabase.auth.getSession();
  if (error || !data.session?.access_token) throw new Error('Sign in again to continue.');
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${data.session.access_token}`
    },
    cache: 'no-store',
    body: JSON.stringify(body)
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'The account service could not complete that request.');
  return result;
}

async function consumeAdmissionContinuation() {
  state.admissionContinuations = [];
  state.admissionContinuationMismatch = false;
  if (state.profile?.role !== 'parent') return;
  let tokens = [];
  try {
    const saved = JSON.parse(sessionStorage.getItem('taa_admission_continuations') || '[]');
    if (Array.isArray(saved)) tokens = saved.filter((token) => typeof token === 'string').slice(0, 10);
  } catch {}
  if (!tokens.length) return;
  try {
    const result = await postAccountApi('/api/portal/admission-continuation', { tokens });
    state.admissionContinuations = Array.isArray(result.applications) ? result.applications : [];
    if (Number(result.matchedTokens || 0) > 0) sessionStorage.removeItem('taa_admission_continuations');
    else state.admissionContinuationMismatch = true;
  } catch {
    // Keep the opaque tokens in this browser session so a temporary network
    // problem does not destroy the parent-controlled continuation.
  }
}

function renderPasswordChange() {
  const message = formMessage();
  const nextPassword = h('input', { name: 'password', type: 'password', autocomplete: 'new-password', required: true, minlength: '12', maxlength: '128' });
  const confirmation = h('input', { name: 'confirmation', type: 'password', autocomplete: 'new-password', required: true, minlength: '12', maxlength: '128' });
  const submit = primaryButton('Set my new password', { type: 'submit', icon: 'lock' });
  const form = h('form', { class: 'auth-form', novalidate: '', onSubmit: async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (nextPassword.value !== confirmation.value) {
      setFormMessage(message, 'The two passwords do not match.', true);
      confirmation.focus();
      return;
    }
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    setFormMessage(message, 'Securing your new password…');
    try {
      await postAccountApi('/api/account/change-password', { password: nextPassword.value });
      nextPassword.value = '';
      confirmation.value = '';
      setFormMessage(message, 'Password changed. Loading your authorised portal…');
      const { data } = await state.supabase.auth.getSession();
      await establishSession(data.session);
    } catch (error) {
      setFormMessage(message, error.message || friendlyError(), true);
      nextPassword.focus();
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  } },
    controlField('New password', nextPassword, 'Use at least 12 characters with uppercase, lowercase, a number and a symbol.'),
    controlField('Confirm new password', confirmation),
    message,
    submit
  );

  replace(app,
    h('div', { class: 'auth-layout auth-layout--single' },
      h('section', { class: 'auth-card', 'aria-labelledby': 'password-change-title' },
        h('p', { class: 'eyebrow', text: 'First sign-in security' }),
        h('h1', { id: 'password-change-title', text: 'Choose a new password' }),
        h('p', { text: `Welcome, ${state.profile.full_name}. Your temporary password cannot be used as your permanent portal password.` }),
        alertBox('info', 'School records remain locked', 'Your authorised records become available only after this password change succeeds. Never reuse a former PIN or share the new password.'),
        form,
        h('button', { type: 'button', class: 'sign-out', onClick: async () => { await state.supabase.auth.signOut({ scope: 'local' }); } }, icon('lock'), h('span', { text: 'Sign out instead' }))
      )
    )
  );
  setStatus('A new password is required before portal records can open.');
  nextPassword.focus();
}

function renderRegistration() {
  if (!state.features.registration) { renderLogin(); return; }
  const message = formMessage();
  const route = h('select', { name: 'route', required: true },
    h('option', { value: '', text: 'Choose how you are joining', selected: true, disabled: true }),
    h('option', { value: 'existing_pupil', text: 'I have a TA-LINK code for an existing pupil' }),
    h('option', { value: 'second_parent', text: 'I have a phone-bound TA-FAMILY invitation' }),
    h('option', { value: 'new_applicant', text: 'I am applying for a genuinely new pupil' })
  );
  const existingPanel = h('div', { class: 'route-fields' },
    selectInput('classCode', 'Pupil’s current class', SCHOOL_CLASSES, { placeholder: 'Choose the current class' }),
    textInput('registeredName', 'Pupil’s name on the school register', { maxlength: '120', autocomplete: 'off', hint: 'Type it yourself. The portal never displays or suggests pupil names.' }),
    textInput('existingCode', 'Private Parent Linking Code', { maxlength: '27', autocomplete: 'off', placeholder: 'TA-LINK-XXXX-XXXX-XXXX' })
  );
  const familyPanel = h('div', { class: 'route-fields' },
    textInput('familyCode', 'Private second-parent invitation', { maxlength: '29', autocomplete: 'off', placeholder: 'TA-FAMILY-XXXX-XXXX-XXXX', hint: 'It works only with the Nigerian phone number chosen by the inviting parent.' })
  );
  const applicantPanel = h('div', { class: 'route-fields' },
    alertBox('info', 'Restricted applicant access', 'You may submit and track your own admission application. Pupil lists, current-family records, fees, shop, results and payments remain locked until an authorised admission decision creates and links a pupil.')
  );
  existingPanel.hidden = familyPanel.hidden = applicantPanel.hidden = true;
  const setRoute = () => {
    const value = route.value;
    existingPanel.hidden = value !== 'existing_pupil';
    familyPanel.hidden = value !== 'second_parent';
    applicantPanel.hidden = value !== 'new_applicant';
    existingPanel.querySelectorAll('input,select').forEach((input) => { input.required = value === 'existing_pupil'; });
    familyPanel.querySelectorAll('input,select').forEach((input) => { input.required = value === 'second_parent'; });
  };
  route.addEventListener('change', setRoute);
  const form = h('form', { class: 'auth-form', novalidate: '', onSubmit: async (event) => {
    event.preventDefault(); setRoute(); if (!form.reportValidity()) return;
    const values = new FormData(form);
    const phone = normalizeNigerianPhone(values.get('phone'));
    const password = String(values.get('password') || '');
    if (!phone) { setFormMessage(message, 'Enter a valid Nigerian mobile number.', true); return; }
    if (password !== String(values.get('confirmation') || '')) { setFormMessage(message, 'The two passwords do not match.', true); return; }
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    setFormMessage(message, 'Creating the restricted secure account…');
    try {
      const selectedRoute = values.get('route');
      const response = await fetch('/api/portal/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          route: selectedRoute,
          fullName: String(values.get('fullName') || '').trim(),
          phone,
          password,
          classCode: selectedRoute === 'existing_pupil' ? values.get('classCode') : null,
          registeredName: selectedRoute === 'existing_pupil' ? String(values.get('registeredName') || '').trim() : null,
          code: selectedRoute === 'existing_pupil' ? values.get('existingCode') : selectedRoute === 'second_parent' ? values.get('familyCode') : null
        })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || friendlyError());
      form.reset(); setRoute();
      replace(app, h('section', { class: 'auth-card auth-card--standalone', 'aria-labelledby': 'registered-title' },
        h('p', { class: 'eyebrow', text: 'Parent registration complete' }),
        h('h1', { id: 'registered-title', text: result.stage === 'applicant' ? 'Continue with your application' : 'Your parent account is ready' }),
        alertBox('info', 'Sign in with your new password', result.instruction || 'Use the phone number and password you just created.'),
        primaryButton('Go to secure sign in', { icon: 'lock', onClick: renderLogin })
      ));
      setStatus('Parent registration completed. Sign in to continue.');
    } catch (error) { setFormMessage(message, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    controlField('Registration route', route, 'A name and class alone can never grant access.'),
    textInput('fullName', 'Your full name', { maxlength: '120', autocomplete: 'name' }),
    textInput('phone', 'Your Nigerian mobile number', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: '24', placeholder: '0803 000 0000' }),
    existingPanel, familyPanel, applicantPanel,
    textInput('password', 'Create a password', { type: 'password', autocomplete: 'new-password', minlength: '12', maxlength: '128', hint: 'Use 12–128 characters with uppercase, lowercase, a number and a symbol.' }),
    textInput('confirmation', 'Confirm the password', { type: 'password', autocomplete: 'new-password', minlength: '12', maxlength: '128' }),
    alertBox('warning', 'Keep credentials private', 'Never send this password to the school. A family invitation is separate from the inviting parent’s password. Maximum: two active guardians per pupil.'),
    message,
    primaryButton('Create secure parent account', { type: 'submit', icon: 'shield' }),
    h('button', { type: 'button', class: 'button button--secondary', onClick: renderLogin }, h('span', { text: 'Back to sign in' }))
  );
  replace(app, h('div', { class: 'auth-layout auth-layout--single' },
    h('section', { class: 'auth-card', 'aria-labelledby': 'registration-title' },
      h('p', { class: 'eyebrow', text: 'Parent self-registration' }),
      h('h1', { id: 'registration-title', text: 'Create your own parent account' }),
      h('p', { text: 'Existing families need a private school credential. New-family applicants receive restricted access until an authorised admission decision.' }), form
    )
  ));
  setStatus('Secure parent registration is ready.');
  route.focus();
}

function renderAccountClaim() {
  let requestToken = '';
  let setupToken = '';
  const message = formMessage();
  const card = h('section', { class: 'auth-card auth-card--standalone', 'aria-labelledby': 'claim-title' },
    h('p', { class: 'eyebrow', text: 'Owner-approved staff onboarding' }),
    h('h1', { id: 'claim-title', text: 'Claim your school account' }),
    h('p', { text: 'Use the same registered phone that the school owner approved. The one-time code goes only to that number; no pupil, class, result or payment record is sent to the delivery processor.' }),
    alertBox('warning', 'Pre-authorised profiles only', 'This process cannot create an unapproved role. A phone number that is not on the owner-approved claim list receives no access.'),
    h('div', { id: 'claim-stage' }), message,
    h('button', { type: 'button', class: 'button button--secondary', onClick: renderLogin }, h('span', { text: 'Back to sign in' }))
  );
  const stage = card.querySelector('#claim-stage');

  function showRequest() {
    const form = h('form', { class: 'auth-form', onSubmit: async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = new FormData(form);
      const phone = normalizeNigerianPhone(values.get('phone'));
      const channel = String(values.get('channel') || 'whatsapp');
      if (!phone) { setFormMessage(message, 'Enter a valid Nigerian mobile number.', true); return; }
      if (channel === 'whatsapp' && values.get('whatsappConfirmed') !== 'yes') { setFormMessage(message, 'Confirm that this registered number uses WhatsApp.', true); return; }
      const submit = form.querySelector('[type=submit]'); submit.disabled = true;
      setFormMessage(message, 'Requesting a private one-time code…');
      try {
        const response = await fetch('/api/account/claim/request', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, cache: 'no-store',
          body: JSON.stringify({ phone, channel, whatsappConfirmed: channel === 'whatsapp' })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || friendlyError());
        requestToken = result.requestToken;
        setFormMessage(message, result.message || 'If this phone is approved, the code is on its way.');
        showVerify();
      } catch (error) { setFormMessage(message, error.message || friendlyError(), true); }
      finally { submit.disabled = false; }
    } },
      textInput('phone', 'Registered Nigerian phone', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: '24', placeholder: '0803 000 0000' }),
      selectInput('channel', 'Delivery channel', [{ value: 'whatsapp', label: 'WhatsApp' }, { value: 'sms', label: 'SMS (when the school has configured it)' }]),
      h('div', { class: 'field' }, h('label', { class: 'check-row' }, h('input', { name: 'whatsappConfirmed', type: 'checkbox', value: 'yes' }), h('span', { text: 'This registered number can receive WhatsApp messages.' })), h('p', { class: 'field__hint', text: 'Required when WhatsApp is selected.' })),
      primaryButton('Send one-time code', { type: 'submit', icon: 'shield' })
    );
    replace(stage, form);
  }

  function showVerify() {
    const form = h('form', { class: 'auth-form', onSubmit: async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const submit = form.querySelector('[type=submit]'); submit.disabled = true;
      setFormMessage(message, 'Verifying the one-time code…');
      try {
        const response = await fetch('/api/account/claim/verify', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, cache: 'no-store',
          body: JSON.stringify({ requestToken, code: new FormData(form).get('code') })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || friendlyError());
        setupToken = result.setupToken;
        setFormMessage(message, 'Phone verified. Create your first private password now.');
        showPassword();
      } catch (error) { setFormMessage(message, error.message || friendlyError(), true); }
      finally { submit.disabled = false; }
    } },
      textInput('code', 'Six-digit code', { inputmode: 'numeric', autocomplete: 'one-time-code', minlength: '6', maxlength: '6', placeholder: '000000' }),
      primaryButton('Verify code', { type: 'submit', icon: 'shield' }),
      h('button', { type: 'button', class: 'button button--secondary', onClick: showRequest }, h('span', { text: 'Request a new code' }))
    );
    replace(stage, form);
  }

  function showPassword() {
    const form = h('form', { class: 'auth-form', onSubmit: async (event) => {
      event.preventDefault();
      if (!form.reportValidity()) return;
      const values = new FormData(form);
      if (values.get('password') !== values.get('confirmPassword')) { setFormMessage(message, 'The two passwords do not match.', true); return; }
      const submit = form.querySelector('[type=submit]'); submit.disabled = true;
      setFormMessage(message, 'Activating the owner-approved profile…');
      try {
        const response = await fetch('/api/account/claim/complete', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, cache: 'no-store',
          body: JSON.stringify({ setupToken, password: values.get('password'), confirmPassword: values.get('confirmPassword') })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || friendlyError());
        replace(stage,
          alertBox('info', result.positionTitle ? `${result.positionTitle} account activated` : 'School account activated', result.instruction),
          primaryButton('Continue to secure sign in', { icon: 'lock', onClick: renderLogin })
        );
        setFormMessage(message, 'Account activated. The password remains private to you.');
      } catch (error) { setFormMessage(message, error.message || friendlyError(), true); }
      finally { submit.disabled = false; }
    } },
      textInput('password', 'Create your first password', { type: 'password', autocomplete: 'new-password', minlength: '12', maxlength: '128', hint: 'Use 12–128 characters with uppercase, lowercase, a number and a symbol.' }),
      textInput('confirmPassword', 'Confirm the password', { type: 'password', autocomplete: 'new-password', minlength: '12', maxlength: '128' }),
      alertBox('warning', 'Never share this password', 'Treasure Academy, Paragon Hub and the developer do not need to know it.'),
      primaryButton('Activate school account', { type: 'submit', icon: 'lock' })
    );
    replace(stage, form);
  }

  showRequest();
  replace(app, h('div', { class: 'auth-layout auth-layout--single' }, card));
  setStatus('Owner-approved school account claim is ready.');
}

function renderLogin() {
  const message = formMessage();
  const phone = h('input', { name: 'phone', type: 'tel', autocomplete: 'username', inputmode: 'tel', required: true, placeholder: '0906 393 2487' });
  const password = h('input', { name: 'password', type: 'password', autocomplete: 'current-password', required: true, minlength: '12', maxlength: '128' });
  const submit = primaryButton('Sign in securely', { type: 'submit', icon: 'lock' });
  const form = h('form', { class: 'auth-form', novalidate: '', onSubmit: async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const values = new FormData(form);
    const normalizedPhone = normalizeNigerianPhone(values.get('phone'));
    if (!normalizedPhone) {
      setFormMessage(message, 'Enter a valid Nigerian mobile number, for example 0906 393 2487.', true);
      phone.focus();
      return;
    }
    submit.disabled = true;
    submit.setAttribute('aria-busy', 'true');
    setFormMessage(message, 'Signing in…');
    try {
      const { error } = await state.supabase.auth.signInWithPassword({
        phone: normalizedPhone,
        password: String(values.get('password') || '')
      });
      if (error) throw error;
      setFormMessage(message, 'Signed in. Loading your portal…');
    } catch {
      setFormMessage(message, 'We could not sign you in. Check your details or contact the school office.', true);
      password.focus();
    } finally {
      submit.disabled = false;
      submit.removeAttribute('aria-busy');
    }
  } },
    controlField('Nigerian phone number', phone, 'Use the number verified by the school, for example 0906 393 2487.'),
    controlField('Password', password),
    h('p', { class: 'field__hint', text: 'Parents use their own self-registered account. Staff accounts are issued by the school. There is no pupil login.' }),
    message,
    submit,
    state.features.registration ? h('button', { type: 'button', class: 'button button--secondary', onClick: renderRegistration }, h('span', { text: 'Create a parent account' })) : null,
    state.features.accountClaim ? h('button', { type: 'button', class: 'button button--secondary', onClick: renderAccountClaim }, h('span', { text: 'Claim your school account' })) : null
  );

  replace(app,
    h('div', { class: 'auth-layout' },
      h('section', { class: 'auth-card', 'aria-labelledby': 'login-title' },
        h('p', { class: 'eyebrow', text: 'Parent & staff portal' }),
        h('h1', { id: 'login-title', text: 'Welcome back' }),
        h('p', { text: 'Parents can view linked children. Teachers see only assigned classes. Administrators manage authorised records.' }),
        alertBox('info', 'Returning family or staff member?', state.features.registration ? 'Use your existing account. If you have never registered, choose the private TA-LINK, TA-FAMILY or restricted applicant route below. Never send a password in chat.' : 'Your former portal history is being preserved. Do not create a duplicate identity or send an old PIN in chat; the school will reconnect verified access.'),
        form,
        h('div', { class: 'auth-help' },
          h('h2', { text: 'Need account help?' }),
          h('p', { text: 'For safeguarding, portal access is issued by the school. The office verifies password resets; never send your old or temporary password in chat.' }),
          h('a', { href: `https://wa.me/${WHATSAPP_NUMBER}`, text: 'Contact the verified school WhatsApp' })
        )
      ),
      h('aside', { class: 'trust-panel', 'aria-label': 'Portal safeguards' },
        h('p', { class: 'eyebrow', text: 'Familiar portal, secure foundation' }),
        h('h2', { text: 'Your school tools, with safer records.' }),
        h('ul', { class: 'trust-list' },
          h('li', {}, icon('user'), h('span', { text: 'Parents access only children linked to their account.' })),
          h('li', {}, icon('classes'), h('span', { text: 'Teachers manage results only for assigned classes and subjects.' })),
          h('li', {}, icon('payments'), h('span', { text: 'Bank transfer and the physical office POS both require manual office verification.' })),
          h('li', {}, icon('shield'), h('span', { text: 'No online card form is used, and payment can never approve an admission.' }))
        )
      )
    )
  );
  setStatus('Secure sign-in is ready.');
}

async function fetchRows(tableName, columns, orderColumn = null) {
  let query = state.supabase.from(tableName).select(columns);
  if (orderColumn) query = query.order(orderColumn, { ascending: true });
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

async function rpcCall(name, args = {}) {
  const { data, error } = await state.supabase.rpc(name, args);
  if (error) throw error;
  return data;
}

function randomReference(prefix) {
  const values = new Uint8Array(8);
  crypto.getRandomValues(values);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = [...values].map((value) => alphabet[value % alphabet.length]).join('');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(new Date()).replaceAll('-', '');
  return `${prefix}-${day}-${suffix}`;
}

async function loadPortalData() {
  const role = state.profile.role;
  const staff = role === 'teacher' || role === 'admin';
  const studentColumns = role === 'admin'
    ? 'id,admission_number,full_name,sex,class_code,parent_id,admission_status,active'
    : 'id,admission_number,full_name,sex,class_code,admission_status,active';
  const common = [
    role === 'parent' ? rpcCall('parent_portal_students') : fetchRows('students', studentColumns, 'full_name'),
    fetchRows('grades', 'id,student_id,assessment_plan_id,subject,session_name,term,ca1,ca2,ca3,continuous_assessment,exam_score,teacher_comment,recorded_by,workflow_status,submitted_at,reviewed_by,reviewed_at,review_note,published_by,published_at,locked_at', 'subject'),
    fetchRows('class_term_assessment_plans', 'id,class_code,session_name,term,scheme,selected_by,selection_reason,created_at,updated_at', 'class_code'),
    fetchRows('payments', 'id,student_id,session_name,term,description,amount,currency,method,status,paid_at,created_at', 'created_at'),
    staff ? fetchRows('teacher_class_assignments', 'id,teacher_id,class_code,subject,active,assignment_kind,session_name,started_on,ended_on,ended_reason,replaces_assignment_id,approved_by,approved_at,handover_note', 'class_code') : Promise.resolve([]),
    staff ? fetchRows('attendance_sessions', 'id,class_code,attendance_date,status,marked_by,submitted_at,locked_by,locked_at,created_at', 'attendance_date') : Promise.resolve([]),
    staff ? fetchRows('attendance_entries', 'session_id,student_id,mark,note,recorded_by,updated_at', 'student_id') : Promise.resolve([]),
    staff ? fetchRows('homework_assignments', 'id,class_code,subject,title,instructions,assigned_on,due_on,status,created_by,published_at,updated_at', 'due_on') : Promise.resolve([]),
    staff ? fetchRows('staff_notices', 'id,notice_type,title,body,audience,published,effective_from,effective_until,created_by,updated_at', 'updated_at') : Promise.resolve([]),
    staff ? fetchRows('duty_roster_entries', 'id,duty_date,title,assigned_to,class_code,note,created_by,updated_at', 'duty_date') : Promise.resolve([]),
    staff ? fetchRows('result_review_events', 'id,grade_id,actor_id,previous_status,new_status,note,created_at', 'created_at') : Promise.resolve([]),
    role === 'admin' ? fetchRows('admission_applications', 'id,application_reference,parent_id,child_name,requested_class,parent_note,status,decision_note,parent_verdict_message,decided_by,decided_at,student_id,admission_session_name,parent_next_step,submission_source,linked_at,submitted_at,updated_at', 'submitted_at') : role === 'parent' ? rpcCall('parent_admission_applications') : Promise.resolve([]),
    role === 'admin' ? fetchRows('admission_application_events', 'id,application_id,actor_id,previous_status,new_status,note,created_at', 'created_at') : Promise.resolve([])
  ];

  const adminOnly = role === 'admin' ? [
    fetchRows('profiles', 'id,role,leadership_scope,position_title,parent_stage,registration_route,full_name,phone_e164,account_status,must_change_password,active,legacy_account_no,created_at', 'full_name'),
    fetchRows('admission_audit_log', 'id,student_id,actor_id,previous_status,new_status,created_at', 'created_at'),
    fetchRows('payment_audit_log', 'id,payment_id,actor_id,action,previous_status,new_status,created_at', 'created_at'),
    fetchRows('webhook_events', 'id,event_key,outcome,reason,received_at,processed_at', 'received_at'),
    fetchRows('student_guardians', 'student_id,parent_id,relationship,active,verified_at,created_at', 'created_at'),
    fetchRows('account_audit_log', 'id,actor_id,target_profile_id,action,reason_code,detail,created_at', 'created_at'),
    fetchRows('website_requests', 'id,request_reference,request_type,status,submitter_name,phone_e164,email,class_code,subject,message,source,sensitive,registered_by,assigned_to,public_note,private_note,submitted_at,updated_at,resolved_at', 'submitted_at'),
    fetchRows('website_request_events', 'id,request_id,actor_id,action,previous_status,new_status,public_note,created_at', 'created_at'),
    fetchRows('verified_public_information', 'id,topic,title,summary,detail,status,revision,effective_from,effective_until,source_path,source_note,accountable_owner,next_review_date,created_by,published_by,published_at,reviewed_at,updated_at', 'updated_at'),
    fetchRows('public_information_events', 'id,information_id,actor_id,previous_status,new_status,revision,created_at', 'created_at'),
    fetchRows('leadership_section_records', 'id,section,title,detail,status,created_by,created_at,updated_at', 'updated_at'),
    fetchRows('leadership_section_events', 'id,record_id,actor_id,action,previous_status,new_status,created_at', 'created_at'),
    fetchRows('staff_assignment_changes', 'id,action,current_assignment_id,current_teacher_id,target_teacher_id,target_class_code,target_subject,target_kind,session_name,effective_on,reason,handover_note,status,recommended_by,recommended_at,decided_by,decided_at,decision_note,applied_assignment_id', 'recommended_at')
  ] : Array.from({ length: 13 }, () => Promise.resolve([]));

  const values = await Promise.all([...common, ...adminOnly]);
  const [students, grades, assessmentPlans, payments, assignments, attendanceSessions, attendanceEntries, homework, staffNotices, dutyRoster, resultAudit,
    admissionApplications, admissionApplicationEvents,
    profiles, admissionAudit, paymentAudit, webhooks, guardians, accountAudit, websiteRequests, requestAudit, publicInformation, publicInformationAudit, leadershipRecords, leadershipAudit, assignmentChanges] = values;
  state.data = { students, grades, assessmentPlans, payments, assignments, attendanceSessions, attendanceEntries, homework, staffNotices, dutyRoster, resultAudit,
    admissionApplications, admissionApplicationEvents,
    profiles, admissionAudit, paymentAudit, webhooks, guardians, accountAudit, websiteRequests, requestAudit, publicInformation, publicInformationAudit, leadershipRecords, leadershipAudit, assignmentChanges };
  if (state.features.office) await loadOfficeData();
  state.cms = emptyCmsState();
  if (state.features.cms) {
    try {
      state.cms = await cmsModule.loadCmsWorkspaceData(state.supabase);
    } catch {
      state.cms = emptyCmsState(true);
    }
  }
}

async function loadOfficeData() {
  const role = state.profile.role;
  const isAdmin = role === 'admin';
  const isParent = role === 'parent' && state.profile.parent_stage !== 'applicant';
  const isTeacher = role === 'teacher';
  const always = [
    fetchRows('class_progression', 'class_code,sort_order,next_class_code,active_for_enrolment,routine_entry_class,graduation_stage', 'sort_order'),
    role === 'admin' ? fetchRows('student_enrolments', 'id,student_id,session_name,class_code,status,started_on,ended_on,source,recorded_by,created_at', 'created_at') : Promise.resolve([]),
    role === 'parent' ? fetchRows('portal_notifications', 'id,student_id,kind,title,message,read_at,created_at', 'created_at') : Promise.resolve([]),
    role === 'admin' ? fetchRows('graduates', 'student_id,graduation_session,graduated_on,completion_type,public_status,public_name,public_message,public_photo_path,consent_reference,approved_by,approved_at,published_at,created_at,updated_at', 'graduated_on') : role === 'parent' ? rpcCall('parent_graduates') : Promise.resolve([]),
    role === 'admin' ? fetchRows('admission_checklist_entries', 'id,application_id,label,completed,parent_visible,note,verified_by,verified_at,created_at,updated_at', 'created_at') : role === 'parent' ? rpcCall('parent_admission_checklist_entries') : Promise.resolve([]),
    role === 'admin' ? fetchRows('admission_followups', 'id,application_id,followup_kind,scheduled_at,completed_at,private_note,parent_note,created_by,created_at', 'created_at') : Promise.resolve([]),
    isTeacher ? rpcCall('teacher_exceptional_progression_entries') : Promise.resolve([])
  ];
  const family = (isParent || isAdmin) ? [
    fetchRows('school_bank_accounts', 'id,bank_name,account_name,account_number,active,approved_at', 'bank_name'),
    fetchRows('pupil_invoices', 'id,invoice_reference,student_id,schedule_id,session_name,term_name,class_code,title,total_amount,paid_amount,status,due_date,issued_at,created_at', 'created_at'),
    fetchRows('pupil_invoice_items', 'id,invoice_id,item_code,label,charge_kind,amount,source_type,source_id', 'label'),
    isAdmin ? fetchRows('shop_products', 'id,product_code,name,description,category,active,reconciled,created_at,updated_at', 'name') : rpcCall('parent_shop_products'),
    isAdmin ? fetchRows('shop_variants', 'id,product_id,sku,variant_label,size_label,eligible_classes,unit_price,on_hand,reserved,damaged,low_stock_threshold,active,reconciled,updated_at', 'variant_label') : rpcCall('parent_shop_variants'),
    fetchRows('shop_orders', 'id,order_reference,parent_id,student_id,class_snapshot,session_snapshot,term_snapshot,collection_method,status,total_amount,reserved_until,paid_at,expected_ready_on,released_by,released_at,fulfilled_by,fulfilled_at,created_at,updated_at', 'created_at'),
    fetchRows('shop_order_lines', 'id,order_id,variant_id,product_name_snapshot,variant_snapshot,unit_price_snapshot,quantity,fulfilled_quantity', 'product_name_snapshot'),
    fetchRows('restock_requests', 'id,parent_id,student_id,product_id,variant_label,requested_quantity,status,parent_confirmed_at,admin_note,created_at,updated_at', 'created_at'),
    fetchRows('return_exchange_requests', 'id,request_reference,order_line_id,parent_id,request_kind,requested_quantity,requested_variant_id,parent_reason,status,inspection_result,monetary_adjustment,office_note,reviewed_by,reviewed_at,completed_at,created_at,updated_at', 'created_at'),
    isAdmin ? fetchRows('transport_services', 'id,route_code,route_name,session_name,term_name,term_amount,capacity,approved_count,active,reconciled,updated_at', 'route_name') : rpcCall('parent_transport_services'),
    fetchRows('transport_requests', 'id,request_reference,parent_id,student_id,service_id,general_area,status,office_note,reviewed_by,reviewed_at,invoice_id,created_at,updated_at', 'created_at'),
    isAdmin ? fetchRows('manual_payments', 'id,payment_reference,invoice_id,order_id,submitted_by,method,amount,status,payer_name,sender_bank_name,external_reference,stated_paid_at,terminal_reference,reviewed_by,reviewed_at,review_note,reversed_by,reversed_at,reversal_reason,created_at,updated_at', 'created_at') : rpcCall('parent_manual_payments'),
    isAdmin ? fetchRows('payment_receipts', 'id,receipt_reference,payment_id,issued_by,issued_at,reversed_at,reversal_reason', 'issued_at') : rpcCall('parent_payment_receipts')
  ] : Array.from({ length: 13 }, () => Promise.resolve([]));
  const teacherOrders = isTeacher ? [
    rpcCall('teacher_collection_orders'),
    rpcCall('teacher_collection_order_lines')
  ] : [Promise.resolve([]), Promise.resolve([])];
  const admin = isAdmin ? [
    fetchRows('fee_schedules', 'id,session_name,term_name,class_code,title,due_date,publication_status,created_by,published_by,published_at,created_at,updated_at', 'created_at'),
    fetchRows('fee_schedule_items', 'id,schedule_id,item_code,label,charge_kind,billing_mode,amount,required,created_at', 'label'),
    fetchRows('legacy_fee_reconciliation', 'source_id,target_schedule_id,target_item_id,status,note,reviewed_by,reviewed_at,created_at', 'source_id'),
    fetchRows('promotion_batches',  'id,source_session,target_session,source_class,status,prepared_by,prepared_at,applied_by,applied_at,note', 'prepared_at'),
    fetchRows('promotion_entries', 'batch_id,student_id,proposed_outcome,target_class,note,exceptional_status,exceptional_outcome,exceptional_target_class,exceptional_reason,recommended_by,recommended_at,approved_by,approved_at,updated_by,updated_at', 'updated_at'),
    fetchRows('inventory_movements', 'id,variant_id,movement_kind,on_hand_delta,reserved_delta,damaged_delta,resulting_on_hand,resulting_reserved,resulting_damaged,order_id,order_line_id,actor_id,actor_type,reason,created_at', 'created_at'),
    fetchRows('inventory_low_stock', 'variant_id,product_name,variant_label,size_label,sku,on_hand,reserved,available,low_stock_threshold', 'product_name'),
    fetchRows('legacy_catalog_reconciliation', 'source_table,source_id,target_product_id,target_variant_id,status,note,reviewed_by,reviewed_at,created_at', 'source_table'),
    fetchRows('catalog_status_events', 'id,product_id,variant_id,actor_id,previous_active,new_active,reason,created_at', 'created_at'),
    fetchRows('procurement_batches',  'id,reference,status,supplier_note,created_by,ordered_at,received_at,created_at,updated_at', 'created_at'),
    fetchRows('procurement_lines', 'id,batch_id,variant_id,ordered_quantity,received_quantity,unit_cost', 'id'),
    fetchRows('stocktakes', 'id,reference,status,note,created_by,created_at,closed_by,closed_at', 'created_at'),
    fetchRows('stocktake_lines', 'stocktake_id,variant_id,expected_on_hand,actual_on_hand,note', 'variant_id'),
    fetchRows('finance_events', 'id,payment_id,invoice_id,order_id,actor_id,event_type,detail,created_at', 'created_at'),
    fetchRows('graduate_publication_events', 'id,student_id,actor_id,previous_status,new_status,note,created_at', 'created_at'),
    fetchRows('legacy_transport_reconciliation', 'source_id,target_service_id,status,note,reviewed_by,reviewed_at,created_at', 'source_id'),
    fetchRows('enrolment_cutover_control', 'singleton,baseline_open,changed_by,change_reason,changed_at', 'changed_at'),
    fetchRows('common_entrance_candidates', 'id,student_id,exam_session,source_class,status,reason,recommended_by,recommended_at,approved_by,approved_at,note,created_at,updated_at', 'recommended_at'),
    fetchRows('exceptional_progression_events', 'id,batch_id,student_id,actor_id,action,outcome,target_class,note,created_at', 'created_at')
  ] : Array.from({ length: 19 }, () => Promise.resolve([]));

  const values = await Promise.all([...always, ...family, ...teacherOrders, ...admin]);
  const [classProgression, studentEnrolments, portalNotifications, graduates, admissionChecklist, admissionFollowups, teacherExceptionalEntries,
    bankAccounts, pupilInvoices, pupilInvoiceItems, shopProducts, shopVariants, familyOrders, familyOrderLines,
    restockRequests, returnRequests, transportServices, transportRequests, manualPayments, paymentReceipts,
    teacherOrderRows, teacherOrderLineRows,
    feeSchedules, feeScheduleItems, legacyFeeReconciliation, promotionBatches, promotionEntries, inventoryMovements, lowStock,
    legacyReconciliation, catalogStatusEvents, procurementBatches, procurementLines, stocktakes, stocktakeLines, financeEvents,
    graduatePublicationEvents, legacyTransportReconciliation, enrolmentCutoverControl, commonEntranceCandidates, exceptionalProgressionEvents] = values;
  Object.assign(state.data, {
    classProgression, studentEnrolments, portalNotifications, graduates, bankAccounts, pupilInvoices,
    pupilInvoiceItems, shopProducts, shopVariants, shopOrders: isTeacher ? teacherOrderRows : familyOrders,
    shopOrderLines: isTeacher ? teacherOrderLineRows : familyOrderLines, restockRequests, returnRequests,
    transportServices, transportRequests, manualPayments, paymentReceipts, feeSchedules, feeScheduleItems,
    legacyFeeReconciliation, promotionBatches, promotionEntries, inventoryMovements, lowStock, legacyReconciliation, procurementBatches,
    procurementLines, stocktakes, stocktakeLines, financeEvents, graduatePublicationEvents,
    admissionChecklist, admissionFollowups, teacherExceptionalEntries, legacyTransportReconciliation, enrolmentCutoverControl, catalogStatusEvents,
    commonEntranceCandidates, exceptionalProgressionEvents
  });
}

async function establishSession(session) {
  if (!session?.user) {
    state.user = null;
    state.profile = null;
    state.data = {};
    state.cms = emptyCmsState();
    const route = window.location.hash.toLowerCase();
    if (route === '#register' && state.features.registration) renderRegistration();
    else if (route === '#claim' && state.features.accountClaim) renderAccountClaim();
    else renderLogin();
    return;
  }
  state.user = session.user;
  state.loading = true;
  setStatus('Loading your authorised records…');
  replace(app, h('div', { class: 'loading-card', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { text: 'Loading your secure portal…' })));

  try {
    const { data: profile, error } = await state.supabase
      .from('profiles')
      .select('id,role,leadership_scope,position_title,full_name,active,account_status,must_change_password,phone_e164,parent_stage')
      .eq('id', session.user.id)
      .single();
    if (error || !profile?.active) throw error || new Error('Inactive profile');
    if (!['parent', 'teacher', 'admin'].includes(profile.role)) throw new Error('Unsupported role');
    state.profile = profile;
    if (profile.account_status === 'pending_activation' && profile.must_change_password === true) {
      state.data = {};
      renderPasswordChange();
      return;
    }
    if (profile.account_status !== 'active' || profile.must_change_password === true) {
      throw new Error('Account is not active');
    }
    await loadPortalData();
    await consumeAdmissionContinuation();
    state.tab = profile.role === 'parent' && !state.admissionContinuations.length && !state.admissionContinuationMismatch && (profile.parent_stage === 'applicant' || state.data.students.length === 0) ? 'add-child' : 'overview';
    renderAuthenticated();
    setStatus(`Signed in as ${profile.full_name}.`);
  } catch {
    await state.supabase.auth.signOut({ scope: 'local' });
    replace(app, alertBox('error', 'Portal access unavailable', 'Your account could not be matched to an active authorised profile. Contact the school office.'));
    setStatus('Portal access unavailable.', true);
  } finally {
    state.loading = false;
  }
}

function tabsForRole(role) {
  if (role === 'parent') {
    if (state.profile.parent_stage === 'applicant') return [
      ['overview', 'Home', 'shield'], ['add-child', 'My Application', 'pupils']
    ];
    const parentTabs = [
      ['overview', 'Home', 'shield'], ['children', 'My Children', 'pupils'], ['add-child', 'Add a Child', 'pupils'],
      ['results', 'My Results', 'results']
    ];
    if (state.features.office) parentTabs.push(['fees-hub', 'Fees, Shop & Transport', 'payments'], ['graduates', 'Your Graduates', 'publish']);
    return parentTabs;
  }
  if (role === 'teacher') {
    const teacherTabs = [
      ['overview', 'Home', 'shield'], ['classes', 'My Class', 'classes'], ['attendance', 'Attendance', 'attendance'],
      ['homework', 'Homework', 'homework'], ['results', 'Results', 'results'], ['staff', 'Staff Info', 'user'], ['requests', 'Register Request', 'inbox']
    ];
    if (state.features.office) teacherTabs.splice(5, 0, ['distributions', 'Pupil Handover', 'inbox']);
    if (canUseCms(state.cms)) teacherTabs.push(['website-cms', 'Website CMS', 'publish']);
    return teacherTabs;
  }
  const tabs = [
    ['overview', 'Overview', 'shield'], ['operations', 'Operations Inbox', 'inbox'], ['students', 'Pupils & Admissions', 'pupils']
  ];
  if (state.features.office) tabs.push(['enrolment', 'Enrolment & Promotion', 'classes'], ['finance', 'Bills & Payments', 'payments'], ['inventory', 'Inventory & Orders', 'inbox'], ['graduates', 'Graduate Hall', 'publish']);
  tabs.push(
    ['classes', 'My Class', 'classes'], ['attendance', 'Attendance', 'attendance'], ['homework', 'Homework', 'homework'],
    ['results', 'Results', 'results'], ['public-info', 'Public Information', 'publish'],
    ['staff', 'Staff Info', 'user'], ['audit', 'Audit', 'audit']
  );
  if (state.profile.leadership_scope === 'headmistress') {
    tabs.splice(3, 0, ['people', 'Teachers & Accounts', 'classes']);
    tabs.splice(tabs.length - 1, 0, ['leadership', 'Leadership Tools', 'shield']);
  }
  if (canUseCms(state.cms)) tabs.push(['website-cms', 'Website CMS', 'publish']);
  return tabs;
}

function portalNavigation() {
  const nav = h('nav', { class: 'portal-nav', 'aria-label': 'Portal sections' });
  tabsForRole(state.profile.role).forEach(([key, label, iconName]) => {
    nav.append(h('button', {
      type: 'button',
      class: key === state.tab ? 'portal-nav__item portal-nav__item--active' : 'portal-nav__item',
      'aria-current': key === state.tab ? 'page' : null,
      onClick: () => { state.tab = key; renderAuthenticated(); document.querySelector('#workspace-title')?.focus(); }
    }, icon(iconName), h('span', { text: label })));
  });
  return nav;
}

function nameForStudent(id) {
  return state.data.students.find((student) => student.id === id)?.full_name || 'Restricted pupil';
}
function nameForProfile(id) {
  if (id === state.profile.id) return state.profile.full_name;
  return state.data.profiles.find((profile) => profile.id === id)?.full_name || 'System or former user';
}

function myAssignments() {
  return state.data.assignments.filter((assignment) => assignment.teacher_id === state.profile.id && assignment.active);
}
function myClassCodes() {
  return [...new Set(myAssignments().map((assignment) => assignment.class_code))];
}
function myClassStudents() {
  const classes = new Set(myClassCodes());
  return state.data.students.filter((student) => classes.has(student.class_code) && student.active);
}
function gradeForId(id) {
  return state.data.grades.find((grade) => grade.id === id);
}
function randomRevision() {
  const values = new Uint8Array(6);
  crypto.getRandomValues(values);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = [...values].map((value) => alphabet[value % alphabet.length]).join('');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `TA-INFO-${parts.year}${parts.month}${parts.day}-${suffix}`;
}

function randomAdmissionReference() {
  const values = new Uint8Array(8);
  crypto.getRandomValues(values);
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const suffix = [...values].map((value) => alphabet[value % alphabet.length]).join('');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(new Date()).reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `TA-ADM-${parts.year}${parts.month}${parts.day}-${suffix}`;
}

function admissionContinuationPanel() {
  if (state.profile.role !== 'parent') return null;
  if (state.admissionContinuationMismatch) {
    return alertBox('warning', 'Sign in with the application account', 'This sign-in did not match the parent account used for the tracked application. Sign out and use the same registered phone and password before the continuation expires.');
  }
  if (!state.admissionContinuations.length) return null;
  return h('section', { class: 'form-panel', 'aria-labelledby': 'private-admission-title' },
    h('p', { class: 'eyebrow', text: 'Private admission continuation' }),
    h('h2', { id: 'private-admission-title', text: 'Your admitted application' }),
    h('p', { text: 'This result appears only after the matching parent account completed full sign-in.' }),
    h('div', { class: 'card-grid' }, state.admissionContinuations.map((item) => h('article', { class: 'record-card' },
      h('div', { class: 'record-card__top' }, h('div', { class: 'avatar', 'aria-hidden': 'true', text: item.childName.charAt(0).toUpperCase() }), h('div', {}, h('h3', { text: item.childName }), h('p', { text: item.requestedClass }))),
      h('p', {}, badge('admitted')),
      h('p', { text: item.message }),
      h('p', {}, h('strong', { text: 'Next step: ' }), h('span', { text: item.nextStep })),
      item.session ? h('p', { class: 'field__hint', text: `Admission session: ${item.session}` }) : null
    )))
  );
}

function roleOverview() {
  const { students, grades, payments, assignments } = state.data;
  const pendingPayments = state.features.office
    ? (state.data.manualPayments || []).filter((item) => ['submitted', 'under_review'].includes(item.status)).length
    : payments.filter((item) => item.status === 'pending').length;
  const unpublished = grades.filter((item) => !item.published_at).length;
  const role = state.profile.role;

  const cards = role === 'parent'
    ? [statCard('Linked children', students.length, 'Only children connected to this parent account', 'pupils'), statCard('Published results', grades.length, 'Available results across terms and subjects', 'results'), statCard('Pending records', pendingPayments, 'Payment records awaiting office verification', 'payments')]
    : role === 'teacher'
      ? [statCard('Assigned classes', myClassCodes().length, 'Active class workspaces', 'classes'), statCard('Visible pupils', students.length, 'Limited by active assignments', 'pupils'), statCard('Submitted results', grades.filter((item) => item.workflow_status === 'submitted').length, 'Awaiting leadership review', 'results')]
      : [statCard('Operations inbox', state.data.websiteRequests.filter((item) => !['closed', 'confirmed', 'declined'].includes(item.status)).length, 'Website and staff-registered requests', 'inbox'), statCard('My classes', myClassCodes().length, 'Leadership class-teacher assignments', 'classes'), statCard('Pending bank transfers', pendingPayments, 'Require evidence and an independent decision', 'payments')];

  return section(`Good day, ${state.profile.full_name.split(' ')[0]}`, `This is your ${role} workspace. Access is limited by database policies, not just by what is visible on this screen.`,
    admissionContinuationPanel(),
    h('div', { class: 'stats-grid' }, cards),
    alertBox('info', 'Admission decisions stay separate', 'Payment status never changes a pupil’s admission status. Only an authorised administrator can record an admission decision.'),
    role === 'parent' ? h('div', { class: 'quick-links' },
      h('a', { href: '#add-child', onClick: (event) => { event.preventDefault(); state.tab = 'add-child'; renderAuthenticated(); } }, icon('pupils'), h('span', {}, h('strong', { text: 'Add a child' }), h('small', { text: 'Connect an existing pupil or apply for a new pupil' }))),
      h('a', { href: '/admissions' }, icon('pupils'), h('span', {}, h('strong', { text: 'Admissions' }), h('small', { text: 'Requirements and next steps' }))),
      state.features.office && state.profile.parent_stage !== 'applicant'
        ? h('a', { href: '#fees-hub', onClick: (event) => { event.preventDefault(); state.tab = 'fees-hub'; renderAuthenticated(); } }, icon('payments'), h('span', {}, h('strong', { text: 'Fees, materials & transport' }), h('small', { text: 'Open private bills, orders, receipts and requests' })))
        : h('a', { href: '/fees' }, icon('payments'), h('span', {}, h('strong', { text: 'Fees' }), h('small', { text: 'See public payment guidance' }))),
      h('a', { href: '/contact' }, icon('user'), h('span', {}, h('strong', { text: 'Contact' }), h('small', { text: 'Reach the verified school channels' })))
    ) : null
  );
}

function secondGuardianInviteForm() {
  if (!state.data.students.length) return null;
  const message = formMessage();
  const result = h('div', { class: 'credential-result', hidden: true, tabindex: '-1' });
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      const data = await postAccountApi('/api/parent/second-invitation', { studentId: values.get('student_id'), phone: values.get('phone') });
      replace(result,
        h('strong', { text: 'Second-parent invitation created' }),
        h('p', { text: 'Share this privately with the intended person. It is shown only once and expires in 48 hours.' }),
        h('code', { text: data.invitationCode }),
        h('p', { text: `Expires ${formatDate(data.expiresAt)}.` })
      );
      result.hidden = false; result.focus();
      setFormMessage(message, 'Invitation ready. Do not send your own password.');
    } catch (error) { setFormMessage(message, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('student_id', 'Pupil', state.data.students.map((student) => ({ value: student.id, label: `${student.full_name} — ${student.class_code}` })), { placeholder: 'Choose your linked pupil' }),
    textInput('phone', 'Second parent’s Nigerian phone number', { type: 'tel', inputmode: 'tel', autocomplete: 'tel', maxlength: '24', placeholder: '0803 000 0000', hint: 'The invitation works only for a parent account using this phone number.' }),
    alertBox('info', 'Two-parent maximum', 'The second parent uses a separate account and password. A third active parent or guardian cannot be added.'),
    message, primaryButton('Create private invitation', { type: 'submit', icon: 'lock' }), result
  );
  return h('details', { class: 'form-panel' }, h('summary', { text: 'Invite a second parent or guardian' }), form);
}

function childrenView() {
  if (!state.data.students.length) return section('My children', 'A child appears here after the one-time linking or approved-admission process.',
    emptyState('No linked child yet', 'Use Add a Child to connect an existing pupil or apply for a new pupil.'));
  return section('My children', 'Core details are read-only. Class promotion keeps the same pupil record and parent relationship.',
    h('div', { class: 'card-grid' }, state.data.students.map((student) => h('article', { class: 'record-card' },
      h('div', { class: 'record-card__top' }, h('div', { class: 'avatar', 'aria-hidden': 'true', text: student.full_name.charAt(0).toUpperCase() }), h('div', {}, h('h3', { text: student.full_name }), h('p', { text: student.class_code }))),
      h('dl', {}, h('div', {}, h('dt', { text: 'Admission number' }), h('dd', { text: student.admission_number || 'Not recorded yet' })), h('div', {}, h('dt', { text: 'Admission status' }), h('dd', {}, badge(student.admission_status))))
    ))),
    secondGuardianInviteForm()
  );
}

function addChildView() {
  const matchMessage = formMessage();
  const classSelect = h('select', { name: 'class_code', required: true },
    h('option', { value: '', text: 'Choose the pupil’s current class', selected: true, disabled: true }),
    SCHOOL_CLASSES.map((value) => h('option', { value, text: value }))
  );
  const registeredName = h('input', { name: 'registered_name', required: true, maxlength: '120', autocomplete: 'off' });
  const matchSuccess = h('div', { class: 'match-confirmation', hidden: true, role: 'status' },
    h('strong', { text: '✓ Pupil record found' }), h('p', { text: 'Now enter the private Parent Linking Code supplied by the school.' })
  );
  const code = h('input', { name: 'code', required: true, maxlength: '27', autocomplete: 'off', placeholder: 'TA-LINK-XXXX-XXXX-XXXX' });
  const linkMessage = formMessage();
  const linkForm = h('form', { class: 'data-form', hidden: true, onSubmit: async (event) => {
    event.preventDefault(); if (!linkForm.reportValidity()) return;
    const submit = linkForm.querySelector('[type=submit]'); submit.disabled = true;
    try {
      await postAccountApi('/api/parent/pupil-link', { classCode: classSelect.value, registeredName: registeredName.value, code: code.value });
      setFormMessage(linkMessage, '✓ Private code verified. ✓ Child added to your account.');
      await refreshAfterMutation(); state.tab = 'children'; renderAuthenticated();
    } catch (error) { setFormMessage(linkMessage, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    controlField('Private Parent Linking Code', code, 'This single-use code is not an admission number and is never needed again after linking.'),
    linkMessage, primaryButton('Verify code and add child', { type: 'submit', icon: 'shield' })
  );
  const matchForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!matchForm.reportValidity()) return;
    const submit = matchForm.querySelector('[type=submit]'); submit.disabled = true;
    matchSuccess.hidden = true; linkForm.hidden = true;
    try {
      const data = await postAccountApi('/api/parent/pupil-match', { classCode: classSelect.value, registeredName: registeredName.value });
      if (!data.matched) throw new Error('No matching pupil was found. Check the class and the name as written on the school register.');
      matchSuccess.hidden = false; linkForm.hidden = false; code.focus();
      setFormMessage(matchMessage, 'A matching enrolled-pupil record is available. No other pupil details have been displayed.');
    } catch (error) { setFormMessage(matchMessage, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    controlField('Current class', classSelect),
    controlField('Pupil’s name on the school register', registeredName, 'Type the name yourself. The portal never displays or suggests a class list.'),
    matchMessage, primaryButton('Find existing pupil', { type: 'submit', icon: 'pupils' })
  );
  const existingPupilPanel = h('div', {}, matchForm, matchSuccess, linkForm);

  const inviteMessage = formMessage();
  const inviteForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!inviteForm.reportValidity()) return;
    const submit = inviteForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(inviteForm);
    try {
      await postAccountApi('/api/parent/second-redemption', { code: values.get('code') });
      setFormMessage(inviteMessage, 'Second-parent invitation verified. The child has been added to your account.');
      await refreshAfterMutation(); state.tab = 'children'; renderAuthenticated();
    } catch (error) { setFormMessage(inviteMessage, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    textInput('code', 'Second-parent invitation code', { maxlength: '29', placeholder: 'TA-FAMILY-XXXX-XXXX-XXXX' }),
    inviteMessage, primaryButton('Redeem private invitation', { type: 'submit', icon: 'lock' })
  );

  const admissionMessage = formMessage();
  const admissionForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!admissionForm.reportValidity()) return;
    const submit = admissionForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(admissionForm);
    const reference = randomAdmissionReference();
    try {
      const { error } = await state.supabase.from('admission_applications').insert({
        application_reference: reference,
        child_name: String(values.get('child_name') || '').trim(),
        requested_class: values.get('requested_class'),
        parent_note: String(values.get('parent_note') || '').trim() || null
      });
      if (error) throw error;
      setFormMessage(admissionMessage, `Application ${reference} was submitted. It is not an admission decision and no pupil record has been created yet.`);
      admissionForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(admissionMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    textInput('child_name', 'Child’s full name', { maxlength: '120', autocomplete: 'name' }),
    selectInput('requested_class', 'Class applying for', SCHOOL_CLASSES, { placeholder: 'Choose a class' }),
    controlField('Information for the admissions team (optional)', h('textarea', { name: 'parent_note', maxlength: '2000', rows: '5' }), 'Do not include passwords, card details or unnecessary medical information.'),
    alertBox('warning', 'Application is not admission', 'An authorised administrator must make the admission decision. Payment can never approve admission.'),
    admissionMessage, primaryButton('Submit new-pupil application', { type: 'submit', icon: 'pupils' })
  );
  const applicationRows = [...state.data.admissionApplications].reverse().map((item) => {
    const checklist = (state.data.admissionChecklist || []).filter((entry) => entry.application_id === item.id).map((entry) => `${entry.completed ? '✓' : '○'} ${entry.label}`).join('; ');
    const followups = (state.data.admissionFollowups || []).filter((entry) => entry.application_id === item.id && entry.parent_note).map((entry) => entry.parent_note).join('; ');
    return [item.application_reference, item.child_name, item.requested_class, badge(item.status), item.parent_next_step || followups || 'Awaiting office update', checklist || 'No visible checklist items', formatDate(item.submitted_at)];
  });

  return section('Add a child', 'Use the existing-pupil route for a child already enrolled at Treasure Academy. Use the application route only for a genuinely new pupil.',
    h('div', { class: 'details-grid' },
      state.profile.parent_stage !== 'applicant' ? h('details', { class: 'form-panel', open: !state.data.students.length }, h('summary', { text: 'Connect an existing pupil' }), existingPupilPanel) : null,
      state.profile.parent_stage !== 'applicant' ? h('details', { class: 'form-panel' }, h('summary', { text: 'Redeem a second-parent invitation' }), inviteForm) : null,
      h('details', { class: 'form-panel', open: state.profile.parent_stage === 'applicant' }, h('summary', { text: 'Apply for admission for a new pupil' }), admissionForm)
    ),
    h('h2', { class: 'subheading', text: 'My admission applications' }),
    table(['Reference', 'Child', 'Requested class', 'Status', 'Next step', 'Visible checklist', 'Submitted'], applicationRows, 'My new-pupil admission applications') || emptyState('No new-pupil applications', 'Existing-pupil linking does not create an admission application.')
  );
}

function assessmentScheme(planId) {
  const plan = (state.data.assessmentPlans || []).find((item) => item.id === planId);
  return { plan, limits: ASSESSMENT_SCHEMES[plan?.scheme] || null };
}

function assessmentPlanForm() {
  const classCodes = state.profile.role === 'admin' ? SCHOOL_CLASSES : myClassCodes();
  if (!classCodes.length) return null;
  const message = formMessage();
  const classField = h('select', { name: 'class_code', required: true }, h('option', { value: '', text: 'Choose a class', disabled: true, selected: true }));
  classCodes.forEach((value) => classField.append(h('option', { value, text: value })));
  const schemeField = h('select', { name: 'scheme', required: true });
  const refreshSchemes = () => {
    const allowed = classField.value === 'Pre-Nursery'
      ? ['pre_nursery_exam_100']
      : ['three_entry_15_15_70', 'four_entry_10_10_10_70'];
    replace(schemeField,
      h('option', { value: '', text: classField.value ? 'Choose the class-wide term scheme' : 'Choose a class first', disabled: true, selected: true }),
      allowed.map((value) => h('option', { value, text: ASSESSMENT_SCHEMES[value].label }))
    );
  };
  classField.addEventListener('change', refreshSchemes);
  refreshSchemes();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      const payload = {
        class_code: values.get('class_code'),
        session_name: String(values.get('session_name') || '').trim(),
        term: values.get('term'),
        scheme: values.get('scheme'),
        selection_reason: String(values.get('selection_reason') || '').trim() || null
      };
      const { error } = await state.supabase.from('class_term_assessment_plans')
        .upsert(payload, { onConflict: 'class_code,session_name,term' });
      if (error) throw error;
      setFormMessage(message, 'The class-wide term assessment plan was saved. It becomes immutable when the first score is entered.');
      await refreshAfterMutation();
    } catch { setFormMessage(message, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    controlField('Class', classField),
    textInput('session_name', 'Academic session', { placeholder: '2026/2027', maxlength: '40' }),
    selectInput('term', 'Term', ['First', 'Second', 'Third'], { placeholder: 'Choose a term' }),
    controlField('Score-entry structure', schemeField, 'One structure applies to every pupil and subject in this class for the selected term.'),
    controlField('Reason (required only when changing an unused plan)', h('textarea', { name: 'selection_reason', maxlength: '1000', rows: '3', required: false }), 'A plan cannot change after score entry begins.'),
    message, primaryButton('Save class term plan', { type: 'submit', icon: 'results' })
  );
  return h('details', { class: 'form-panel' }, h('summary', { text: 'Choose the class term score structure' }), form);
}

function resultsTable() {
  return table(['Pupil', 'Subject', 'Session / term', 'CA1 obtained / obtainable', 'CA2 obtained / obtainable', 'CA3 obtained / obtainable', 'Exam obtained / obtainable', 'Term total', 'Workflow'], state.data.grades.map((grade) => {
    const { limits } = assessmentScheme(grade.assessment_plan_id);
    const max = limits || { ca1: 0, ca2: 0, ca3: 0, exam: 0 };
    const total = Number(grade.ca1) + Number(grade.ca2) + Number(grade.ca3 || 0) + Number(grade.exam_score);
    const score = (value, obtainable) => obtainable ? `${Number(value)}/${obtainable}` : 'Not used';
    return [nameForStudent(grade.student_id), grade.subject, `${grade.session_name} · ${grade.term}`,
      score(grade.ca1, max.ca1), score(grade.ca2, max.ca2), score(grade.ca3, max.ca3), score(grade.exam_score, max.exam), `${total}/100`, badge(grade.workflow_status)];
  }), 'Score-entry records and review status. The final pupil result layout is separate from this staff entry table.');
}

function gradeForm() {
  const pupils = myClassStudents();
  const plans = (state.data.assessmentPlans || []).filter((plan) => (
    state.profile.role === 'admin' || myClassCodes().includes(plan.class_code)
  ));
  if (!pupils.length) return emptyState('No pupils in My Class', 'The Headmistress must assign the correct class scope before results can be entered.');
  if (!plans.length) return emptyState('Choose a class term plan first', 'Select the class-wide score structure before entering any pupil score.');

  const message = formMessage();
  const planSelect = h('select', { name: 'assessment_plan_id', required: true }, h('option', { value: '', text: 'Choose class, session and term', disabled: true, selected: true }));
  plans.forEach((plan) => planSelect.append(h('option', { value: plan.id, text: `${plan.class_code} — ${plan.session_name} — ${plan.term} — ${ASSESSMENT_SCHEMES[plan.scheme]?.label || plan.scheme}` })));
  const pupilSelect = h('select', { name: 'student_id', required: true });
  const scoreStatus = h('p', { class: 'field__hint', text: 'Choose a class term plan to load obtainable marks.' });
  const scoreInputs = ['ca1', 'ca2', 'ca3', 'exam_score'].reduce((result, name) => {
    result[name] = h('input', { name, type: 'number', min: '0', max: '0', step: '0.01', inputmode: 'decimal', required: true, value: '0' });
    return result;
  }, {});
  const scoreFields = {
    ca1: controlField('CA1', scoreInputs.ca1), ca2: controlField('CA2', scoreInputs.ca2),
    ca3: controlField('CA3', scoreInputs.ca3), exam_score: controlField('Examination', scoreInputs.exam_score)
  };
  const updatePlanControls = () => {
    const { plan, limits } = assessmentScheme(planSelect.value);
    const matching = pupils.filter((student) => student.class_code === plan?.class_code);
    replace(pupilSelect, h('option', { value: '', text: matching.length ? 'Choose a pupil' : 'No pupil in this class', disabled: true, selected: true }),
      matching.map((student) => h('option', { value: student.id, text: `${student.full_name} — ${student.class_code}` })));
    if (!limits) return;
    [['ca1', limits.ca1], ['ca2', limits.ca2], ['ca3', limits.ca3], ['exam_score', limits.exam]].forEach(([name, maximum]) => {
      const input = scoreInputs[name];
      input.max = String(maximum); input.value = '0'; input.disabled = maximum === 0;
      const label = scoreFields[name].querySelector('label');
      label.textContent = `${name === 'exam_score' ? 'Examination' : name.toUpperCase()} (0–${maximum})`;
    });
    scoreStatus.textContent = limits.entries === 1
      ? 'Pre-Nursery: one examination in Week 12, scored over 100. CA fields are disabled.'
      : limits.entries === 3
        ? 'Three entries: Week 4 CA 15, Week 8 CA 15 and Week 12 examination 70.'
        : 'Four entries: Week 3 CA 10, Week 6 CA 10, Week 9 CA 10 and Week 12 examination 70.';
  };
  planSelect.addEventListener('change', updatePlanControls);
  updatePlanControls();

  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    const { plan } = assessmentScheme(values.get('assessment_plan_id'));
    try {
      if (!plan) throw new Error('assessment_plan');
      const payload = {
        student_id: values.get('student_id'), assessment_plan_id: plan.id,
        subject: String(values.get('subject') || '').trim(), session_name: plan.session_name, term: plan.term,
        ca1: Number(values.get('ca1') || 0), ca2: Number(values.get('ca2') || 0), ca3: Number(values.get('ca3') || 0),
        exam_score: Number(values.get('exam_score') || 0),
        teacher_comment: String(values.get('teacher_comment') || '').trim() || null,
        workflow_status: values.get('workflow_status')
      };
      const existing = state.data.grades.find((grade) => grade.student_id === payload.student_id
        && grade.subject === payload.subject && grade.session_name === payload.session_name && grade.term === payload.term);
      const mutation = existing
        ? state.supabase.from('grades').update({ ca1: payload.ca1, ca2: payload.ca2, ca3: payload.ca3,
            exam_score: payload.exam_score, teacher_comment: payload.teacher_comment, workflow_status: payload.workflow_status }).eq('id', existing.id)
        : state.supabase.from('grades').insert(payload);
      const { error } = await mutation; if (error) throw error;
      setFormMessage(message, payload.workflow_status === 'submitted' ? 'Result submitted for independent leadership review.' : 'Draft score entry saved.');
      const mode = values.get('entry_mode');
      ['ca1','ca2','ca3','exam_score'].forEach((name) => { scoreInputs[name].value = '0'; });
      form.querySelector('[name="teacher_comment"]').value = '';
      if (mode === 'subject') pupilSelect.value = '';
      else form.querySelector('[name="subject"]').value = '';
      await refreshAfterMutation();
    } catch { setFormMessage(message, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('entry_mode', 'Entry order', [
      { value: 'subject', label: 'By subject — keep the subject and move through pupil names' },
      { value: 'pupil', label: 'By pupil name — keep the pupil and move through subjects' }
    ]),
    controlField('Class term assessment plan', planSelect),
    controlField('Pupil', pupilSelect),
    textInput('subject', 'Subject', { maxlength: '80' }),
    scoreStatus,
    h('div', { class: 'score-grid' }, scoreFields.ca1, scoreFields.ca2, scoreFields.ca3, scoreFields.exam_score),
    controlField('Teacher comment (optional)', h('textarea', { name: 'teacher_comment', maxlength: '500', rows: '4' }), 'Do not include diagnoses or unrelated private family information.'),
    selectInput('workflow_status', 'Save action', [
      { value: 'draft', label: 'Save staff-only draft' },
      { value: 'submitted', label: 'Submit for leadership review' }
    ]),
    alertBox('info', 'Entry and final result are different', 'This is the secure score-entry workspace. Parents receive the separately formatted result only after independent review and Headmistress publication.'),
    message, primaryButton('Save score entry', { type: 'submit', icon: 'results' })
  );
  return h('details', { class: 'form-panel', open: true }, h('summary', { text: 'Enter scores by subject or pupil name' }), form);
}

function resultWorkflowForm() {
  if (state.profile.role !== 'admin') return null;
  const scope = state.profile.leadership_scope;
  const candidates = state.data.grades.filter((grade) => {
    if (scope === 'assistant_headmistress') return ['submitted', 'under_review'].includes(grade.workflow_status) && grade.recorded_by !== state.profile.id;
    if (['approved', 'published'].includes(grade.workflow_status)) return true;
    const author = state.data.profiles.find((profile) => profile.id === grade.recorded_by);
    return ['submitted', 'under_review'].includes(grade.workflow_status) && author?.leadership_scope === 'assistant_headmistress';
  });
  const message = formMessage();
  const gradeSelect = h('select', { name: 'grade_id', required: true }, h('option', { value: '', text: 'Choose a result', disabled: true, selected: true }));
  candidates.forEach((grade) => gradeSelect.append(h('option', { value: grade.id, text: `${nameForStudent(grade.student_id)} — ${grade.subject} — ${titleCase(grade.workflow_status)}` })));
  const action = h('select', { name: 'workflow_status', required: true });
  const refreshActions = () => {
    const grade = gradeForId(gradeSelect.value);
    const options = [];
    if (grade?.workflow_status === 'submitted') options.push(['under_review', 'Begin review']);
    if (grade?.workflow_status === 'under_review') options.push(['returned', 'Return for correction'], ['approved', 'Approve for publication']);
    if (scope === 'headmistress' && grade?.workflow_status === 'approved') options.push(['published', 'Publish to linked parents']);
    if (scope === 'headmistress' && grade?.workflow_status === 'published') options.push(['locked', 'Lock published result']);
    replace(action, h('option', { value: '', text: options.length ? 'Choose an action' : 'Choose a result first', disabled: true, selected: true }), options.map(([value, label]) => h('option', { value, text: label })));
  };
  gradeSelect.addEventListener('change', refreshActions);
  refreshActions();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      const { error } = await state.supabase.from('grades').update({
        workflow_status: values.get('workflow_status'),
        review_note: String(values.get('review_note') || '').trim() || null
      }).eq('id', values.get('grade_id'));
      if (error) throw error;
      setFormMessage(message, 'Result workflow updated and audit-recorded.');
      await refreshAfterMutation();
    } catch { setFormMessage(message, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    controlField('Result', gradeSelect),
    controlField('Workflow action', action),
    controlField('Review note (optional)', h('textarea', { name: 'review_note', maxlength: '1000', rows: '4' }), 'Use a clear correction reason when returning a result.'),
    alertBox('warning', 'Independent control', scope === 'headmistress' ? 'Publish only an approved result. Reviewers cannot approve their own score entry.' : 'Reviewers cannot change scores or review their own entries. Return corrections to the class teacher.'),
    message, primaryButton('Record workflow action', { type: 'submit', icon: scope === 'headmistress' ? 'publish' : 'shield', disabled: !candidates.length })
  );
  return h('details', { class: 'form-panel' }, h('summary', { text: scope === 'headmistress' ? 'Review or publish a result' : 'Review submitted results' }), form);
}

function resultsView() {
  const staff = state.profile.role === 'teacher' || state.profile.role === 'admin';
  return section('Results', staff ? 'Pre-Nursery uses one examination over 100. Every other class uses one approved class-wide term plan: 15 + 15 + 70 or 10 + 10 + 10 + 70. Entry, independent review and publication remain separate.' : 'Only results published by the Headmistress are visible here.',
    staff ? assessmentPlanForm() : null,
    staff ? gradeForm() : null,
    resultWorkflowForm(),
    resultsTable() || emptyState('No results available', staff ? 'Choose the class term plan, then enter staff-only draft scores.' : 'Published results will appear after school review.')
  );
}

function paymentsView() {
  return section('Payments', 'Legacy payment records remain preserved for controlled cutover.',
    alertBox('info', 'Use the new manual-payment workspace', state.features.office
      ? 'Open Fees, Shop & Transport as a parent or Bills & Payments as an administrator. Bank transfers and the physical school-office POS require manual verification; no online card form is used.'
      : 'The replacement manual bank-transfer and physical office-POS workflow is staged but not activated. Contact the office and do not use an old browser receipt or checkout page.'),
    emptyState('Legacy payment mutations are disabled', 'Preserved former records are read-only during reconciliation.'));
}

function teacherAssignmentRecommendationForm(assignments) {
  if (state.profile.role !== 'teacher' || !assignments.length) return null;
  const message = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(event.currentTarget);
    const action = values.get('action');
    try {
      await rpcCall('recommend_staff_assignment_change', {
        p_action: action,
        p_current_assignment_id: values.get('current_assignment_id'),
        p_target_teacher_id: action === 'move' ? state.profile.id : null,
        p_target_class_code: action === 'move' ? values.get('target_class_code') : null,
        p_target_subject: String(values.get('target_subject') || '*').trim() || '*',
        p_target_kind: values.get('target_kind'),
        p_session_name: String(values.get('session_name') || '').trim() || null,
        p_effective_on: values.get('effective_on'),
        p_reason: String(values.get('reason')).trim(),
        p_handover_note: String(values.get('handover_note') || '').trim() || null
      });
      setFormMessage(message, 'Your assignment recommendation was sent for independent full-leadership approval.'); event.currentTarget.reset();
    } catch (error) { setFormMessage(message, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('current_assignment_id', 'My current assignment', assignments.map((item) => ({ value: item.id, label: `${item.class_code} — ${item.subject === '*' ? 'All subjects' : item.subject}` })), { placeholder: 'Choose an assignment' }),
    selectInput('action', 'Recommendation', [{ value: 'move', label: 'Move my assignment to another class' }, { value: 'end', label: 'End my assignment' }], { placeholder: 'Choose move or end' }),
    selectInput('target_class_code', 'Target class (for a move)', SCHOOL_CLASSES, { placeholder: 'Not needed when ending', required: false }),
    h('div', { class: 'form-grid' },
      textInput('target_subject', 'Target subject scope', { maxlength: '80', placeholder: '* for all subjects', required: false }),
      selectInput('target_kind', 'Target assignment kind', [{ value: 'class_teacher', label: 'Class teacher' }, { value: 'subject_teacher', label: 'Subject teacher' }, { value: 'assistant_teacher', label: 'Assistant teacher' }])
    ),
    h('div', { class: 'form-grid' }, textInput('session_name', 'Session (optional)', { maxlength: '40', required: false }), textInput('effective_on', 'Effective date', { type: 'date' })),
    controlField('Recommendation reason', h('textarea', { name: 'reason', minlength: '3', maxlength: '1000', rows: '3', required: true })),
    controlField('Handover note (optional)', h('textarea', { name: 'handover_note', maxlength: '2000', rows: '3' })),
    message, primaryButton('Send assignment recommendation', { type: 'submit', icon: 'classes' })
  );
  return h('details', { class: 'form-panel' }, h('summary', { text: 'Recommend a move or end to my assignment' }), form);
}

function teacherExceptionalProgressionForm() {
  const entries = state.data.teacherExceptionalEntries || [];
  if (state.profile.role !== 'teacher' || !state.features.office || !entries.length) return null;
  const message = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(event.currentTarget); const [batchId, studentId] = String(values.get('entry')).split(':');
    try {
      await rpcCall('recommend_exceptional_progression', {
        p_batch_id: batchId, p_student_id: studentId, p_outcome: values.get('outcome'),
        p_target_class: String(values.get('target_class') || '').trim() || null,
        p_reason: String(values.get('reason')).trim()
      });
      setFormMessage(message, 'Exceptional progression recommendation sent for independent full-leadership approval.'); await refreshAfterMutation();
    } catch (error) { setFormMessage(message, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('entry', 'Pupil in my draft progression preview', entries.map((entry) => ({ value: `${entry.batch_id}:${entry.student_id}`, label: `${nameForStudent(entry.student_id)} — ${entry.source_class} — ${entry.source_session} → ${entry.target_session}` })), { placeholder: 'Choose a pupil preview' }),
    selectInput('outcome', 'Exceptional outcome', [
      { value: 'accelerated_promote', label: 'Accelerated move to a later active class' },
      { value: 'early_secondary_transition', label: 'Primary 4 early secondary transition' },
      { value: 'accelerated_graduate', label: 'Primary 4 accelerated graduate label' }
    ], { placeholder: 'Choose an outcome' }),
    selectInput('target_class', 'Accelerated target class (if applicable)', SCHOOL_CLASSES, { placeholder: 'Not used for a Primary 4 exit label', required: false }),
    controlField('Recommendation and evidence summary', h('textarea', { name: 'reason', minlength: '3', maxlength: '1000', rows: '4', required: true })),
    alertBox('warning', 'Recommendation is not approval', 'The Headmistress or another owner-authorised full-write leader must decide it independently. Common Entrance candidacy remains a separate record.'),
    message, primaryButton('Send progression recommendation', { type: 'submit', icon: 'pupils' })
  );
  return h('details', { class: 'form-panel' }, h('summary', { text: 'Recommend exceptional pupil progression' }), form);
}

function teacherCommonEntranceRecommendationForm() {
  const pupils = myClassStudents().filter((student) => ['Primary 4', 'Primary 6'].includes(student.class_code));
  if (state.profile.role !== 'teacher' || !state.features.office || !pupils.length) return null;
  const message = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(event.currentTarget);
    try {
      await rpcCall('recommend_common_entrance_candidate', { p_student_id: values.get('student_id'), p_exam_session: String(values.get('exam_session')).trim(), p_reason: String(values.get('reason')).trim() });
      setFormMessage(message, 'Common Entrance candidacy recommended without changing the pupil’s recorded class.'); event.currentTarget.reset();
    } catch (error) { setFormMessage(message, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('student_id', 'Assigned Primary 4 or Primary 6 pupil', pupils.map((student) => ({ value: student.id, label: `${student.full_name} — ${student.class_code}` })), { placeholder: 'Choose a pupil' }),
    textInput('exam_session', 'Common Entrance session', { maxlength: '40', placeholder: '2026/2027' }),
    controlField('Candidacy reason', h('textarea', { name: 'reason', minlength: '3', maxlength: '1000', rows: '3', required: true })),
    alertBox('info', 'Separate from enrolment', 'A recommendation never presents a Primary 4 pupil as a Primary 6 pupil.'),
    message, primaryButton('Recommend Common Entrance candidacy', { type: 'submit', icon: 'audit' })
  );
  return h('details', { class: 'form-panel' }, h('summary', { text: 'Recommend Common Entrance candidacy' }), form);
}

function assignedClassesView() {
  const assignments = myAssignments();
  const pupils = myClassStudents();
  const rows = assignments.map((assignment) => [assignment.class_code, assignment.subject === '*' ? 'All assigned subjects' : assignment.subject, titleCase(assignment.assignment_kind || 'subject_teacher'), assignment.session_name || 'Not recorded', assignment.active ? badge('active') : badge('inactive')]);
  return section('My Class', 'Both classroom teachers and school leaders work here through their own active class assignments.',
    table(['Class', 'Subject scope', 'Kind', 'Session', 'Status'], rows, 'My active class assignments') || emptyState('No active assignment', 'Ask the Headmistress to record the correct class and subject before class work begins.'),
    teacherAssignmentRecommendationForm(assignments),
    teacherExceptionalProgressionForm(),
    teacherCommonEntranceRecommendationForm(),
    h('h2', { class: 'subheading', text: 'My assigned pupils' }),
    table(['Pupil', 'Class', 'Admission number'], pupils.map((student) => [student.full_name, student.class_code, student.admission_number]), 'My assigned pupils') || emptyState('No pupils in My Class', 'Pupils appear when an active class assignment matches their class.')
  );
}

function attendanceView() {
  const classes = myClassCodes();
  const sessions = state.data.attendanceSessions;
  const createMessage = formMessage();
  const createForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!createForm.reportValidity()) return;
    const submit = createForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(createForm);
    try {
      const { error } = await state.supabase.from('attendance_sessions').insert({
        class_code: values.get('class_code'), attendance_date: values.get('attendance_date'), status: 'draft'
      });
      if (error) throw error;
      setFormMessage(createMessage, 'Daily register opened as a draft.');
      createForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(createMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('class_code', 'My class', classes, { placeholder: classes.length ? 'Choose a class' : 'No assigned class' }),
    textInput('attendance_date', 'Attendance date', { type: 'date' }),
    createMessage, primaryButton('Open daily register', { type: 'submit', icon: 'attendance', disabled: !classes.length })
  );

  const editable = sessions.filter((session) => session.status !== 'locked' && (state.profile.role === 'admin' || classes.includes(session.class_code)));
  const markMessage = formMessage();
  const sessionSelect = h('select', { name: 'session_id', required: true }, h('option', { value: '', text: 'Choose an open register', selected: true, disabled: true }));
  editable.forEach((session) => sessionSelect.append(h('option', { value: session.id, text: `${session.class_code} — ${formatDate(session.attendance_date)} — ${titleCase(session.status)}` })));
  const pupilSelect = h('select', { name: 'student_id', required: true });
  const updatePupils = () => {
    const selected = editable.find((session) => session.id === sessionSelect.value);
    const pupils = selected ? state.data.students.filter((student) => student.class_code === selected.class_code && student.active) : [];
    replace(pupilSelect, h('option', { value: '', text: pupils.length ? 'Choose a pupil' : 'Choose a register first', selected: true, disabled: true }), pupils.map((pupil) => h('option', { value: pupil.id, text: pupil.full_name })));
  };
  sessionSelect.addEventListener('change', updatePupils); updatePupils();
  const markForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!markForm.reportValidity()) return;
    const submit = markForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(markForm);
    try {
      const { error } = await state.supabase.from('attendance_entries').upsert({
        session_id: values.get('session_id'), student_id: values.get('student_id'), mark: values.get('mark'),
        note: String(values.get('note') || '').trim() || null
      }, { onConflict: 'session_id,student_id' });
      if (error) throw error;
      setFormMessage(markMessage, 'Attendance mark saved.'); await refreshAfterMutation();
    } catch { setFormMessage(markMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    controlField('Daily register', sessionSelect), controlField('Pupil', pupilSelect),
    selectInput('mark', 'Attendance mark', ['present', 'absent', 'late', 'excused'].map((value) => ({ value, label: titleCase(value) }))),
    textInput('note', 'Note (optional)', { maxlength: '300', required: false }),
    markMessage, primaryButton('Save attendance mark', { type: 'submit', icon: 'attendance', disabled: !editable.length })
  );

  const statusMessage = formMessage();
  const statusForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!statusForm.reportValidity()) return;
    const submit = statusForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(statusForm);
    try {
      const { error } = await state.supabase.from('attendance_sessions').update({ status: values.get('status') }).eq('id', values.get('session_id'));
      if (error) throw error;
      setFormMessage(statusMessage, 'Register status updated.'); await refreshAfterMutation();
    } catch { setFormMessage(statusMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('session_id', 'Register', editable.map((session) => ({ value: session.id, label: `${session.class_code} — ${formatDate(session.attendance_date)} — ${titleCase(session.status)}` })), { placeholder: 'Choose a register' }),
    selectInput('status', 'New status', state.profile.role === 'admin' ? [{ value: 'submitted', label: 'Submitted' }, { value: 'locked', label: 'Locked after oversight' }] : [{ value: 'submitted', label: 'Submit to administration' }]),
    statusMessage, primaryButton('Update register status', { type: 'submit', icon: 'shield', disabled: !editable.length })
  );

  const rows = [...sessions].reverse().map((session) => {
    const entries = state.data.attendanceEntries.filter((entry) => entry.session_id === session.id);
    return [formatDate(session.attendance_date), session.class_code, entries.length, entries.filter((entry) => entry.mark === 'present').length, entries.filter((entry) => entry.mark === 'absent').length, badge(session.status)];
  });
  return section('Attendance', state.profile.role === 'admin' ? 'Open My Class registers and oversee submitted attendance across the school.' : 'Mark the daily register for assigned pupils, then submit it for administrator oversight.',
    h('div', { class: 'details-grid' },
      h('details', { class: 'form-panel' }, h('summary', { text: 'Open a daily register' }), createForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Mark a pupil' }), markForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Submit or lock a register' }), statusForm)
    ),
    table(['Date', 'Class', 'Marked', 'Present', 'Absent', 'Status'], rows, 'Class attendance oversight') || emptyState('No attendance registers', 'Open a daily register for an assigned class.')
  );
}

function homeworkView() {
  const classes = myClassCodes();
  const message = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      const { error } = await state.supabase.from('homework_assignments').insert({
        class_code: values.get('class_code'), subject: String(values.get('subject')).trim(), title: String(values.get('title')).trim(),
        instructions: String(values.get('instructions')).trim(), assigned_on: values.get('assigned_on'), due_on: values.get('due_on') || null,
        status: values.get('status')
      });
      if (error) throw error;
      setFormMessage(message, values.get('status') === 'published' ? 'Homework published for family viewing.' : 'Homework draft saved.');
      form.reset(); await refreshAfterMutation();
    } catch { setFormMessage(message, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('class_code', 'My class', classes, { placeholder: classes.length ? 'Choose a class' : 'No assigned class' }),
    textInput('subject', 'Subject', { maxlength: '80' }), textInput('title', 'Homework title', { maxlength: '160' }),
    controlField('Instructions', h('textarea', { name: 'instructions', maxlength: '4000', rows: '5', required: true }), 'Give clear offline work. The portal does not accept pupil uploads or online submissions.'),
    h('div', { class: 'form-grid' }, textInput('assigned_on', 'Assigned date', { type: 'date' }), textInput('due_on', 'Due date (optional)', { type: 'date', required: false })),
    selectInput('status', 'Save action', [{ value: 'draft', label: 'Save staff-only draft' }, { value: 'published', label: 'Publish homework notice' }]),
    message, primaryButton('Save homework', { type: 'submit', icon: 'homework', disabled: !classes.length })
  );
  const rows = [...state.data.homework].reverse().map((item) => [item.class_code, item.subject, item.title, formatDate(item.assigned_on), formatDate(item.due_on), badge(item.status)]);
  return section('Homework', 'Set clear offline work for My Class. There is no online assignment submission or pupil upload feature.',
    h('details', { class: 'form-panel' }, h('summary', { text: 'Create homework' }), form),
    table(['Class', 'Subject', 'Title', 'Assigned', 'Due', 'Status'], rows, 'Homework assignments') || emptyState('No homework records', 'Create a draft or published homework notice for My Class.')
  );
}

function staffInformationView() {
  const notices = [...state.data.staffNotices].reverse().map((item) => [titleCase(item.notice_type), item.title, item.body, titleCase(item.audience), item.effective_until ? formatDate(item.effective_until) : 'Open']);
  const duties = state.data.dutyRoster.map((item) => [formatDate(item.duty_date), item.title, nameForProfile(item.assigned_to), item.class_code || 'School-wide', item.note || '—']);
  return section('Staff information', 'Internal notices and duties are visible only to active authorised staff. Birthday information is not published to families here.',
    h('h2', { class: 'subheading', text: 'Staff notices' }),
    table(['Type', 'Title', 'Details', 'Audience', 'Until'], notices, 'Internal staff notices') || emptyState('No current staff notices', 'Published staff information will appear here.'),
    h('h2', { class: 'subheading', text: 'Duty roster' }),
    table(['Date', 'Duty', 'Assigned to', 'Class', 'Note'], duties, 'Staff duty roster') || emptyState('No duty entries', 'The Headmistress can add duty roster entries in Leadership Tools.')
  );
}

function staffRequestForm() {
  const message = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      const result = await postAccountApi('/api/requests', {
        source: values.get('source'), requestType: values.get('requestType'), name: String(values.get('name')).trim(),
        phone: String(values.get('phone')).trim(), email: String(values.get('email') || '').trim(), classCode: String(values.get('classCode') || '').trim(),
        subject: String(values.get('subject')).trim(), message: String(values.get('message')).trim(), website: ''
      });
      setFormMessage(message, `Saved. Give the requester reference ${result.reference} and private tracking code ${result.trackingCode}. They must record both now.`);
      form.reset();
      if (state.profile.role === 'admin') await refreshAfterMutation();
    } catch (error) { setFormMessage(message, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('source', 'Conversation channel', [{ value: 'phone', label: 'Phone call' }, { value: 'whatsapp', label: 'Generic WhatsApp conversation' }, { value: 'office_visit', label: 'Office visit' }]),
    selectInput('requestType', 'Request type', [
      'general', 'admission', 'school_visit', 'class_enquiry', 'fee_schedule', 'calendar', 'transport', 'uniform', 'supplies', 'pta', 'event', 'lost_property', 'receipt_verification', 'school_record', 'website_problem', 'safeguarding', 'private_feedback', 'career', 'volunteer', 'support_proposal', 'account_help', 'homework', 'reading', 'exam_timetable'
    ].map((value) => ({ value, label: titleCase(value) })), { placeholder: 'Choose a request type' }),
    h('div', { class: 'form-grid' }, textInput('name', 'Requester name', { maxlength: '120' }), textInput('phone', 'Nigerian mobile number', { type: 'tel', inputmode: 'tel', maxlength: '24' })),
    h('div', { class: 'form-grid' }, textInput('email', 'Email (optional)', { type: 'email', maxlength: '254', required: false }), textInput('classCode', 'Class (optional)', { maxlength: '40', required: false })),
    textInput('subject', 'Request subject', { maxlength: '160' }),
    controlField('Request summary', h('textarea', { name: 'message', maxlength: '4000', rows: '5', required: true }), 'Record only information needed to route and follow up the request.'),
    alertBox('warning', 'Issue both values privately', 'A staff-entered request is complete only after the website returns a database reference and private tracking code.'),
    message, primaryButton('Register and issue reference', { type: 'submit', icon: 'inbox' })
  );
  return form;
}

function registerRequestView() {
  return section('Register an off-site request', 'Turn a phone, generic WhatsApp or office conversation into a verifiable website request.', staffRequestForm());
}

function operationsView() {
  const requests = [...state.data.websiteRequests].reverse();
  const processMessage = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      const { error } = await state.supabase.rpc('process_website_request', {
        p_request_id: values.get('request_id'), p_status: values.get('status'),
        p_public_note: String(values.get('public_note') || '').trim() || null,
        p_private_note: String(values.get('private_note') || '').trim() || null,
        p_assigned_to: values.get('assigned_to') || null
      });
      if (error) throw error;
      setFormMessage(processMessage, 'Request status updated and audit-recorded.'); await refreshAfterMutation();
    } catch { setFormMessage(processMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('request_id', 'Website request', requests.map((item) => ({ value: item.id, label: `${item.request_reference} — ${titleCase(item.request_type)} — ${titleCase(item.status)}` })), { placeholder: requests.length ? 'Choose a request' : 'Inbox is empty' }),
    selectInput('status', 'New status', ['received', 'assigned', 'under_review', 'needs_information', 'confirmed', 'declined', 'closed'].map((value) => ({ value, label: titleCase(value) }))),
    selectInput('assigned_to', 'Assign to administrator (optional)', state.data.profiles.filter((profile) => profile.role === 'admin' && profile.active).map((profile) => ({ value: profile.id, label: profile.full_name })), { placeholder: 'No administrator selected', required: false }),
    controlField('Public tracking note (optional)', h('textarea', { name: 'public_note', maxlength: '1000', rows: '3' }), 'This note appears when the requester enters the matching private code.'),
    controlField('Private office note (optional)', h('textarea', { name: 'private_note', maxlength: '2000', rows: '3' }), 'Visible only to authorised administrators.'),
    processMessage, primaryButton('Update request', { type: 'submit', icon: 'inbox', disabled: !requests.length })
  );
  const rows = requests.map((item) => [item.request_reference, item.submitter_name, titleCase(item.request_type), h('span', {}, h('strong', { text: item.subject }), h('br'), item.message), item.source === 'website' ? 'Website' : titleCase(item.source), maskPhone(item.phone_e164), badge(item.status), formatDate(item.submitted_at)]);
  return section('Operations Inbox', 'Track website and staff-registered requests. Sensitive categories are restricted by database policy to the Headmistress.',
    h('div', { class: 'details-grid' },
      h('details', { class: 'form-panel' }, h('summary', { text: 'Register a phone, WhatsApp or office request' }), staffRequestForm()),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Process a request' }), form)
    ),
    table(['Reference', 'Requester', 'Type', 'Request details', 'Source', 'Phone', 'Status', 'Received'], rows, 'Website operations inbox') || emptyState('Inbox is clear', 'New website requests will appear only after database creation succeeds.')
  );
}

function publicInformationView() {
  const message = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      const { error } = await state.supabase.from('verified_public_information').insert({
        topic: values.get('topic'), title: String(values.get('title')).trim(), summary: String(values.get('summary')).trim(),
        detail: String(values.get('detail') || '').trim() || null, status: 'draft', revision: randomRevision(),
        effective_from: values.get('effective_from') || null, effective_until: values.get('effective_until') || null,
        source_path: String(values.get('source_path')).trim(), source_note: String(values.get('source_note')).trim(),
        accountable_owner: String(values.get('accountable_owner')).trim(), next_review_date: values.get('next_review_date')
      });
      if (error) throw error;
      setFormMessage(message, 'Publication draft saved. Archive any current revision for this topic before publishing the reviewed replacement.');
      form.reset(); await refreshAfterMutation();
    } catch { setFormMessage(message, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('topic', 'Information topic', ['school_hours', 'address', 'class_progression', 'admission_procedure', 'admissions', 'class_availability', 'fees', 'calendar', 'exam_timetable', 'transport', 'uniform', 'supplies', 'pta', 'events', 'public_policy', 'general_notice'].map((value) => ({ value, label: titleCase(value) }))),
    textInput('title', 'Public title', { maxlength: '160' }),
    controlField('Short verified summary', h('textarea', { name: 'summary', maxlength: '600', rows: '3', required: true })),
    controlField('Full details (optional)', h('textarea', { name: 'detail', maxlength: '6000', rows: '6' })),
    h('div', { class: 'form-grid' }, textInput('source_path', 'Supporting public page', { maxlength: '500', placeholder: '/calendar' }), textInput('accountable_owner', 'Accountable office or role', { maxlength: '120', placeholder: 'School leadership' })),
    controlField('Private source verification note', h('textarea', { name: 'source_note', maxlength: '2000', rows: '3', required: true }), 'Record what was checked and by whom; do not include passwords, payment evidence or safeguarding details.'),
    h('div', { class: 'form-grid' }, textInput('effective_from', 'Effective from (optional)', { type: 'date', required: false }), textInput('effective_until', 'Effective until (optional)', { type: 'date', required: false })),
    textInput('next_review_date', 'Next review date', { type: 'date' }),
    alertBox('warning', 'Review before publishing', 'New information is saved as a draft. Publication requires a supporting page, source note, accountable role and current review date. Either administrator may publish it after archiving any current revision for the same topic. Do not use this area for pupil records, payment approval or admission decisions.'),
    message, primaryButton('Save public-information draft', { type: 'submit', icon: 'publish' })
  );
  const manageable = state.data.publicInformation.filter((item) => ['draft', 'published'].includes(item.status));
  const actionMessage = formMessage();
  const publicationSelect = h('select', { name: 'information_id', required: true }, h('option', { value: '', text: manageable.length ? 'Choose a publication' : 'No draft or published records', disabled: true, selected: true }));
  manageable.forEach((item) => publicationSelect.append(h('option', { value: item.id, text: `${item.title} — ${titleCase(item.status)} — ${item.revision}` })));
  const publicationAction = h('select', { name: 'status', required: true });
  const refreshPublicationActions = () => {
    const item = manageable.find((entry) => entry.id === publicationSelect.value);
    const options = item?.status === 'draft' ? [['published', 'Publish this verified revision']] : item?.status === 'published' ? [['archived', 'Archive this revision']] : [];
    replace(publicationAction, h('option', { value: '', text: options.length ? 'Choose an action' : 'Choose a publication first', disabled: true, selected: true }), options.map(([value, label]) => h('option', { value, text: label })));
  };
  publicationSelect.addEventListener('change', refreshPublicationActions);
  refreshPublicationActions();
  const actionForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!actionForm.reportValidity()) return;
    const submit = actionForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(actionForm);
    try {
      const { error } = await state.supabase.from('verified_public_information').update({ status: values.get('status') }).eq('id', values.get('information_id'));
      if (error) throw error;
      setFormMessage(actionMessage, values.get('status') === 'published' ? 'Verified information published and audit-recorded.' : 'Publication archived and audit-recorded.');
      await refreshAfterMutation();
    } catch { setFormMessage(actionMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    controlField('Publication revision', publicationSelect),
    controlField('Publication action', publicationAction),
    alertBox('info', 'Revision control', 'Published wording is immutable and each topic can have only one published revision. Archive the current revision before publishing its reviewed replacement.'),
    actionMessage, primaryButton('Record publication action', { type: 'submit', icon: 'publish', disabled: !manageable.length })
  );
  const rows = [...state.data.publicInformation].reverse().map((item) => [titleCase(item.topic), item.title, item.revision, badge(item.status), item.source_path || 'Source required', item.published_by ? nameForProfile(item.published_by) : 'Not published', item.next_review_date ? formatDate(item.next_review_date) : 'Review required', item.effective_until ? formatDate(item.effective_until) : 'Open']);
  return section('Public Information', 'Create source-backed, versioned and date-aware operational information for the website. Publication decisions are independent and audit-recorded.',
    h('div', { class: 'details-grid' },
      h('details', { class: 'form-panel' }, h('summary', { text: 'Create a verified publication' }), form),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Publish or archive a revision' }), actionForm)
    ),
    table(['Topic', 'Title', 'Revision', 'Status', 'Source', 'Publisher', 'Review due', 'Until'], rows, 'Verified public information') || emptyState('No publication records', 'Create a verified publication when operational information is ready.')
  );
}

function leadershipView() {
  const staff = state.data.profiles.filter((profile) => ['teacher', 'admin'].includes(profile.role) && profile.active);
  const noticeMessage = formMessage();
  const noticeForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!noticeForm.reportValidity()) return;
    const submit = noticeForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(noticeForm);
    try {
      const { error } = await state.supabase.from('staff_notices').insert({ notice_type: values.get('notice_type'), title: String(values.get('title')).trim(), body: String(values.get('body')).trim(), audience: values.get('audience'), published: true, effective_from: values.get('effective_from') || null, effective_until: values.get('effective_until') || null });
      if (error) throw error;
      setFormMessage(noticeMessage, 'Staff notice published.'); noticeForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(noticeMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('notice_type', 'Notice type', ['general', 'birthday', 'code_of_conduct'].map((value) => ({ value, label: titleCase(value) }))),
    textInput('title', 'Notice title', { maxlength: '160' }), controlField('Notice details', h('textarea', { name: 'body', maxlength: '4000', rows: '5', required: true })),
    selectInput('audience', 'Audience', ['all_staff', 'teachers', 'administrators'].map((value) => ({ value, label: titleCase(value) }))),
    h('div', { class: 'form-grid' }, textInput('effective_from', 'Effective from (optional)', { type: 'date', required: false }), textInput('effective_until', 'Effective until (optional)', { type: 'date', required: false })),
    noticeMessage, primaryButton('Publish staff notice', { type: 'submit', icon: 'user' })
  );
  const dutyMessage = formMessage();
  const dutyForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!dutyForm.reportValidity()) return;
    const submit = dutyForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(dutyForm);
    try {
      const { error } = await state.supabase.from('duty_roster_entries').insert({ duty_date: values.get('duty_date'), title: String(values.get('title')).trim(), assigned_to: values.get('assigned_to'), class_code: String(values.get('class_code') || '').trim() || null, note: String(values.get('note') || '').trim() || null });
      if (error) throw error;
      setFormMessage(dutyMessage, 'Duty roster entry saved.'); dutyForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(dutyMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    textInput('duty_date', 'Duty date', { type: 'date' }), textInput('title', 'Duty title', { maxlength: '160' }),
    selectInput('assigned_to', 'Assigned staff member', staff.map((profile) => ({ value: profile.id, label: profile.full_name })), { placeholder: 'Choose a staff member' }),
    textInput('class_code', 'Class (optional)', { maxlength: '40', required: false }), textInput('note', 'Note (optional)', { maxlength: '1000', required: false }),
    dutyMessage, primaryButton('Save duty entry', { type: 'submit', icon: 'attendance', disabled: !staff.length })
  );
  const recordMessage = formMessage();
  const recordForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!recordForm.reportValidity()) return;
    const submit = recordForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(recordForm);
    try {
      const { error } = await state.supabase.from('leadership_section_records').insert({
        section: values.get('section'), title: String(values.get('title')).trim(), detail: String(values.get('detail')).trim(), status: values.get('status')
      });
      if (error) throw error;
      setFormMessage(recordMessage, 'Leadership record saved and audit-recorded. This does not automatically publish website content.');
      recordForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(recordMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('section', 'Headmistress section', [
      { value: 'contact_whatsapp', label: 'Contact / WhatsApp administration' }, { value: 'testimonials', label: 'Testimonials and consent' },
      { value: 'website_extras', label: 'Website extras' }, { value: 'shop_orders', label: 'Shop & orders' },
      { value: 'code_of_conduct', label: 'Code of conduct' }, { value: 'settings', label: 'Settings' }
    ], { placeholder: 'Choose a protected section' }),
    textInput('title', 'Record title', { maxlength: '160' }),
    controlField('Working details', h('textarea', { name: 'detail', maxlength: '6000', rows: '6', required: true }), 'Do not place passwords, private keys or bank credentials here. Active status does not change the public website automatically.'),
    selectInput('status', 'Record status', ['draft', 'active', 'archived'].map((value) => ({ value, label: titleCase(value) }))),
    recordMessage, primaryButton('Save protected record', { type: 'submit', icon: 'shield' })
  );
  const leadershipRows = [...state.data.leadershipRecords].reverse().map((item) => [titleCase(item.section), item.title, item.detail, badge(item.status), formatDate(item.updated_at)]);
  return section('Leadership Tools', 'Historical Headmistress-only controls remain hidden and database-enforced for other roles.',
    h('div', { class: 'leadership-scope' },
      h('strong', { text: 'Headmistress-only scope' }),
      h('p', { text: 'Teachers and accounts · Duty Roster · Contact/WhatsApp administration · Testimonials · Website Extras · Shop & Orders · Code of Conduct · Settings' })
    ),
    h('div', { class: 'details-grid' }, h('details', { class: 'form-panel' }, h('summary', { text: 'Publish a staff notice' }), noticeForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Add a duty roster entry' }), dutyForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Open a protected leadership record' }), recordForm)),
    h('h2', { class: 'subheading', text: 'Protected leadership records' }),
    table(['Section', 'Title', 'Working details', 'Status', 'Updated'], leadershipRows, 'Headmistress-only section records') || emptyState('No protected leadership records', 'Use the form above to begin a consent, settings, contact, website or order record.')
  );
}

function studentAdminForms() {
  const addMessage = formMessage();
  const addForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!addForm.reportValidity()) return;
    const submit = addForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(addForm);
    try {
      const { error } = await state.supabase.rpc('server_add_existing_pupil_with_sex', {
        p_full_name: String(values.get('full_name')).trim(),
        p_sex: values.get('sex'),
        p_class_code: values.get('class_code'),
        p_session_name: String(values.get('session_name')).trim(),
        p_admission_number: String(values.get('admission_number') || '').trim() || null,
        p_initial_baseline: values.get('initial_baseline') === 'yes'
      });
      if (error) throw error;
      setFormMessage(addMessage, 'Existing enrolled pupil added to the class roster. No admission application or parent link was created.');
      addForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(addMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    textInput('full_name', 'Name on the school register', { maxlength: '120' }),
    selectInput('sex', 'Sex on the school register', [{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }], { placeholder: 'Choose the verified school record' }),
    selectInput('class_code', 'Current class', SCHOOL_CLASSES, { placeholder: 'Choose the pupil’s class' }),
    textInput('session_name', 'Enrolment session', { maxlength: '40', placeholder: '2026/2027' }),
    textInput('admission_number', 'Admission number (optional)', { maxlength: '40', required: false, hint: 'Leave blank until the exact official numbering format and starting sequence are approved. Never invent one.' }),
    selectInput('initial_baseline', 'Roster entry type', [
      { value: 'yes', label: 'Initial all-class cutover (one-time baseline)' },
      { value: 'no', label: 'Routine fresh entry (Pre-Nursery only)' }
    ], { placeholder: 'Choose why this pupil is being entered' }),
    alertBox('info', 'Existing pupil roster', 'Initial cutover accepts every active class. After cutover, routine fresh roster entries begin in Pre-Nursery; higher-class entries require the admission workflow. Pupil identity is never replaced.'),
    !state.features.office ? alertBox('info', 'Staged feature', 'Permanent enrolment history must be activated only after migrations and cutover checks pass.') : null,
    addMessage, primaryButton('Add existing pupil', { type: 'submit', icon: 'pupils', disabled: !state.features.office })
  );

  const applications = state.data.admissionApplications.filter((item) => !['admitted', 'declined', 'withdrawn'].includes(item.status));
  const decisionMessage = formMessage();
  const applicationSelect = h('select', { name: 'application_id', required: true }, h('option', { value: '', text: applications.length ? 'Choose an application' : 'No pending applications', disabled: true, selected: true }));
  applications.forEach((item) => applicationSelect.append(h('option', { value: item.id, text: `${item.application_reference} — ${item.child_name} — ${titleCase(item.status)}` })));
  const statusSelect = h('select', { name: 'status', required: true });
  const refreshDecisionOptions = () => {
    const item = applications.find((entry) => entry.id === applicationSelect.value);
    const options = item?.status === 'pending' ? ['under_review', 'declined', 'withdrawn']
      : item?.status === 'under_review' ? ['offered', 'declined', 'withdrawn']
        : item?.status === 'offered' ? ['admitted', 'declined', 'withdrawn'] : [];
    replace(statusSelect, h('option', { value: '', text: options.length ? 'Choose a decision' : 'Choose an application first', disabled: true, selected: true }),
      options.map((value) => h('option', { value, text: titleCase(value) })));
  };
  applicationSelect.addEventListener('change', refreshDecisionOptions); refreshDecisionOptions();
  const decisionForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!decisionForm.reportValidity()) return;
    const submit = decisionForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(decisionForm);
    try {
      const { error } = await state.supabase.from('admission_applications').update({
        status: values.get('status'),
        decision_note: String(values.get('decision_note') || '').trim() || null,
        parent_verdict_message: String(values.get('parent_verdict_message') || '').trim() || null,
        admission_session_name: String(values.get('admission_session_name') || '').trim() || null,
        parent_next_step: String(values.get('parent_next_step') || '').trim() || null
      }).eq('id', values.get('application_id'));
      if (error) throw error;
      setFormMessage(decisionMessage, values.get('status') === 'admitted'
        ? 'Admission approved. One permanent pupil record was created and linked to the applying parent.'
        : 'Admission workflow decision saved and audit-recorded.');
      await refreshAfterMutation();
    } catch { setFormMessage(decisionMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    controlField('Application', applicationSelect), controlField('Decision', statusSelect),
    controlField('Private decision record', h('textarea', { name: 'decision_note', maxlength: '2000', rows: '4', required: true }), 'Record the factual office basis for the transition. Keep sensitive details out of the public-facing message.'),
    controlField('Parent-facing status message (optional)', h('textarea', { name: 'parent_verdict_message', maxlength: '1000', rows: '3' }), 'Shown only after verified tracking or matching parent sign-in. Do not include bank details.'),
    textInput('admission_session_name', 'Admission session (required only when admitting)', { maxlength: '40', required: false, placeholder: '2026/2027' }),
    controlField('Parent’s next step (optional)', h('textarea', { name: 'parent_next_step', maxlength: '1000', rows: '3' }), 'Use for a visit, information request or office follow-up. Do not include bank details.'),
    alertBox('warning', 'Independent admission decision', 'Either administrator may decide an application. An admitted pupil receives one permanent identity and enrolment-history row. Payment status is never an admission decision.'),
    decisionMessage, primaryButton('Record application decision', { type: 'submit', icon: 'shield', disabled: !applications.length })
  );

  const cutover = (state.data.enrolmentCutoverControl || [])[0];
  const cutoverMessage = formMessage();
  const cutoverForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { await rpcCall('set_initial_enrolment_cutover', { p_open: values.get('baseline_open') === 'yes', p_reason: String(values.get('reason')).trim() }); setFormMessage(cutoverMessage, values.get('baseline_open') === 'yes' ? 'Initial all-class cutover opened with an audit reason.' : 'Initial all-class cutover closed. Routine fresh roster entry is now Creche only.'); await refreshAfterMutation(); }
    catch { setFormMessage(cutoverMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, alertBox(cutover?.baseline_open ? 'warning' : 'info', cutover?.baseline_open ? 'Initial cutover is open' : 'Initial cutover is closed', cutover?.baseline_open ? 'All active classes may receive verified baseline pupils. Close this mode as soon as the one-time cutover is complete.' : 'Routine fresh roster entry is limited to Creche. Higher-class entries use the admission workflow.'), selectInput('baseline_open', 'Cutover mode', [{ value: 'no', label: 'Closed — routine Creche entry only' }, { value: 'yes', label: 'Open — controlled initial all-class cutover' }], { placeholder: 'Choose cutover state' }), textInput('reason', 'Required audit reason', { maxlength: '1000' }), cutoverMessage, primaryButton('Save cutover control', { type: 'submit', icon: 'shield' }));
  const checklistMessage = formMessage();
  const checklistForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { const completed = values.get('completed') === 'yes'; const { error } = await state.supabase.from('admission_checklist_entries').upsert({ application_id: values.get('application_id'), label: String(values.get('label')).trim(), completed, parent_visible: values.get('parent_visible') === 'yes', note: String(values.get('note') || '').trim() || null, verified_by: completed ? state.profile.id : null, verified_at: completed ? new Date().toISOString() : null }, { onConflict: 'application_id,label' }); if (error) throw error; setFormMessage(checklistMessage, 'Admission checklist item saved.'); form.reset(); await refreshAfterMutation(); }
    catch { setFormMessage(checklistMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('application_id', 'Application', state.data.admissionApplications.map((item) => ({ value: item.id, label: `${item.application_reference} — ${item.child_name}` })), { placeholder: 'Choose an application' }), textInput('label', 'Checklist item', { maxlength: '160' }), selectInput('completed', 'Completion', [{ value: 'no', label: 'Open' }, { value: 'yes', label: 'Completed and verified' }]), selectInput('parent_visible', 'Parent visibility', [{ value: 'no', label: 'Office only' }, { value: 'yes', label: 'Show status to applicant parent' }]), textInput('note', 'Checklist note (optional)', { maxlength: '1000', required: false }), checklistMessage, primaryButton('Save checklist item', { type: 'submit', icon: 'audit' }));
  const followupMessage = formMessage();
  const followupForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { const { error } = await state.supabase.from('admission_followups').insert({ application_id: values.get('application_id'), followup_kind: values.get('followup_kind'), scheduled_at: values.get('scheduled_at') ? new Date(String(values.get('scheduled_at'))).toISOString() : null, private_note: String(values.get('private_note') || '').trim() || null, parent_note: String(values.get('parent_note') || '').trim() || null }); if (error) throw error; setFormMessage(followupMessage, 'Admission follow-up saved.'); form.reset(); await refreshAfterMutation(); }
    catch { setFormMessage(followupMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('application_id', 'Application', state.data.admissionApplications.map((item) => ({ value: item.id, label: `${item.application_reference} — ${item.child_name}` })), { placeholder: 'Choose an application' }), selectInput('followup_kind', 'Follow-up type', ['office_contact', 'school_visit', 'information_request', 'decision_followup'].map((value) => ({ value, label: titleCase(value) }))), textInput('scheduled_at', 'Scheduled date and time (optional)', { type: 'datetime-local', required: false }), controlField('Parent next step (optional)', h('textarea', { name: 'parent_note', maxlength: '1000', rows: '3' })), controlField('Private office note (optional)', h('textarea', { name: 'private_note', maxlength: '2000', rows: '3' })), followupMessage, primaryButton('Save admission follow-up', { type: 'submit', icon: 'inbox' }));
  const openFollowups = (state.data.admissionFollowups || []).filter((item) => !item.completed_at);
  const completeFollowupMessage = formMessage();
  const completeFollowupForm = h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form); try { const { error } = await state.supabase.from('admission_followups').update({ completed_at: new Date().toISOString(), private_note: String(values.get('private_note') || '').trim() || null, parent_note: String(values.get('parent_note') || '').trim() || null }).eq('id', values.get('followup_id')).is('completed_at', null); if (error) throw error; setFormMessage(completeFollowupMessage, 'Admission follow-up completed and the approved parent next step saved.'); await refreshAfterMutation(); } catch { setFormMessage(completeFollowupMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, selectInput('followup_id', 'Open follow-up', openFollowups.map((item) => { const application = state.data.admissionApplications.find((entry) => entry.id === item.application_id); return { value: item.id, label: `${application?.application_reference || 'Application'} — ${titleCase(item.followup_kind)}${item.scheduled_at ? ` — ${formatDate(item.scheduled_at)}` : ''}` }; }), { placeholder: openFollowups.length ? 'Choose a follow-up' : 'No open follow-ups' }), controlField('Parent outcome or next step (optional)', h('textarea', { name: 'parent_note', maxlength: '1000', rows: '3' })), controlField('Private completion note (optional)', h('textarea', { name: 'private_note', maxlength: '2000', rows: '3' })), completeFollowupMessage, primaryButton('Complete follow-up', { type: 'submit', icon: 'audit', disabled: !openFollowups.length }));
  return h('div', { class: 'details-grid' },
    h('details', { class: 'form-panel' }, h('summary', { text: 'Open or close initial all-class cutover' }), cutoverForm),
    h('details', { class: 'form-panel' }, h('summary', { text: 'Add an existing enrolled pupil' }), addForm),
    h('details', { class: 'form-panel' }, h('summary', { text: 'Process a new-pupil application' }), decisionForm),
    state.features.office ? h('details', { class: 'form-panel' }, h('summary', { text: 'Add an admission checklist item' }), checklistForm) : null,
    state.features.office ? h('details', { class: 'form-panel' }, h('summary', { text: 'Schedule office contact, visit or information follow-up' }), followupForm) : null,
    state.features.office ? h('details', { class: 'form-panel' }, h('summary', { text: 'Complete an admission follow-up' }), completeFollowupForm) : null
  );
}

function pupilLinkCodeForm() {
  if (state.profile.leadership_scope !== 'headmistress' || !state.data.students.length) return null;
  const message = formMessage();
  const result = h('div', { class: 'credential-result', hidden: true, tabindex: '-1' });
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      const data = await postAccountApi('/api/admin/pupil-link-code', { studentId: values.get('student_id') });
      replace(result, h('strong', { text: 'One-time Parent Linking Code' }), h('code', { text: data.linkingCode }),
        h('p', { text: 'Give it privately to the correct parent. Issuing another code cancels this one. It is shown only once.' }));
      result.hidden = false; result.focus();
      setFormMessage(message, `Code issued. It expires ${formatDate(data.expiresAt)}.`);
    } catch (error) { setFormMessage(message, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('student_id', 'Existing enrolled pupil', state.data.students.filter((student) => student.active && student.admission_status === 'admitted').map((student) => ({ value: student.id, label: `${student.full_name} — ${student.class_code}` })), { placeholder: 'Choose a pupil' }),
    alertBox('warning', 'Private credential', 'Confirm the parent before handing over the code. Never send a class list, account password or another pupil’s code.'),
    message, primaryButton('Issue one-time linking code', { type: 'submit', icon: 'lock' }), result
  );
  return h('details', { class: 'form-panel' }, h('summary', { text: 'Issue a Parent Linking Code' }), form);
}

function studentsAdminView() {
  const applicationRows = [...state.data.admissionApplications].reverse().map((item) => [item.application_reference, item.child_name, item.requested_class, nameForProfile(item.parent_id), badge(item.status), formatDate(item.submitted_at)]);
  return section('Pupils & Admissions', 'Existing rosters, new applications and parent linking remain distinct from payment verification.',
    studentAdminForms(), pupilLinkCodeForm(),
    h('h2', { class: 'subheading', text: 'New-pupil applications' }),
    table(['Reference', 'Child', 'Requested class', 'Parent', 'Status', 'Submitted'], applicationRows, 'New-pupil admission applications') || emptyState('No admission applications', 'Parent applications appear here after database submission.'),
    h('h2', { class: 'subheading', text: 'Current pupil roster' }),
    table(['Pupil', 'Admission number', 'Class', 'Admission status'], state.data.students.map((student) => [student.full_name, student.admission_number || 'Not recorded', student.class_code, badge(student.admission_status)]), 'Pupil records') || emptyState('No pupil records', 'Add existing enrolled pupils class by class or approve a new-pupil application.')
  );
}

function assignmentForm() {
  const teachers = state.data.profiles.filter((profile) => ['teacher', 'admin'].includes(profile.role) && profile.active && profile.account_status === 'active');
  const activeAssignments = state.data.assignments.filter((item) => item.active);
  const message = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    const action = String(values.get('action'));
    const sourceId = String(values.get('current_assignment_id') || '') || null;
    const targetTeacher = String(values.get('target_teacher_id') || '') || null;
    const targetClass = String(values.get('target_class_code') || '').trim() || null;
    if (['move', 'replace', 'end'].includes(action) && !sourceId) { setFormMessage(message, 'Choose the current assignment that will change.', true); submit.disabled = false; return; }
    if (['assign', 'move', 'replace'].includes(action) && (!targetTeacher || !targetClass)) { setFormMessage(message, 'Choose the target teacher and class.', true); submit.disabled = false; return; }
    try {
      await rpcCall('recommend_staff_assignment_change', {
        p_action: action,
        p_current_assignment_id: sourceId,
        p_target_teacher_id: targetTeacher,
        p_target_class_code: targetClass,
        p_target_subject: String(values.get('target_subject') || '*').trim() || '*',
        p_target_kind: values.get('target_kind'),
        p_session_name: String(values.get('session_name') || '').trim() || null,
        p_effective_on: values.get('effective_on'),
        p_reason: String(values.get('reason') || '').trim(),
        p_handover_note: String(values.get('handover_note') || '').trim() || null
      });
      setFormMessage(message, 'Assignment change recommended for independent full-leadership approval.'); form.reset(); await refreshAfterMutation();
    } catch (error) { setFormMessage(message, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('action', 'Change type', [
      { value: 'assign', label: 'New assignment' }, { value: 'move', label: 'Move the same teacher' },
      { value: 'replace', label: 'Replace with another teacher' }, { value: 'end', label: 'End assignment without replacement' }
    ], { placeholder: 'Choose a change type' }),
    selectInput('current_assignment_id', 'Current assignment (for move, replace or end)', activeAssignments.map((item) => ({ value: item.id, label: `${nameForProfile(item.teacher_id)} — ${item.class_code} — ${item.subject === '*' ? 'All subjects' : item.subject}` })), { placeholder: 'Not needed for a new assignment', required: false }),
    selectInput('target_teacher_id', 'Target teacher', teachers.map((teacher) => ({ value: teacher.id, label: `${teacher.full_name}${teacher.position_title ? ` — ${teacher.position_title}` : ''}` })), { placeholder: 'Not needed when ending an assignment', required: false }),
    h('div', { class: 'form-grid' },
      selectInput('target_class_code', 'Target class', SCHOOL_CLASSES, { placeholder: 'Choose a class', required: false }),
      textInput('target_subject', 'Subject scope', { placeholder: '* for all subjects', maxlength: '80', required: false })
    ),
    h('div', { class: 'form-grid' },
      selectInput('target_kind', 'Assignment kind', [
        { value: 'class_teacher', label: 'Class teacher' }, { value: 'subject_teacher', label: 'Subject teacher' }, { value: 'assistant_teacher', label: 'Assistant teacher' }
      ], { placeholder: 'Choose assignment kind' }),
      textInput('session_name', 'Session (optional)', { maxlength: '40', required: false, placeholder: '2026/2027' }),
      textInput('effective_on', 'Effective date', { type: 'date' })
    ),
    controlField('Recommendation reason', h('textarea', { name: 'reason', maxlength: '1000', minlength: '3', rows: '3', required: true })),
    controlField('Handover note (optional)', h('textarea', { name: 'handover_note', maxlength: '2000', rows: '3' })),
    alertBox('info', 'History is preserved', 'The current assignment is ended rather than overwritten. The replacement receives a new authored assignment only after a different full-authority leader approves it.'),
    message, primaryButton('Recommend assignment change', { type: 'submit', icon: 'classes', disabled: !teachers.length })
  );

  const pending = (state.data.assignmentChanges || []).filter((item) => item.status === 'recommended' && item.recommended_by !== state.profile.id);
  const decisionMessage = formMessage();
  const decisionForm = state.profile.leadership_scope === 'headmistress' ? h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(event.currentTarget);
    try {
      await rpcCall('decide_staff_assignment_change', { p_change_id: values.get('change_id'), p_decision: values.get('decision'), p_note: String(values.get('note') || '').trim() || null });
      setFormMessage(decisionMessage, 'Assignment recommendation decided and audit-recorded.'); await refreshAfterMutation();
    } catch (error) { setFormMessage(decisionMessage, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('change_id', 'Pending independent recommendation', pending.map((item) => ({ value: item.id, label: `${titleCase(item.action)} — ${nameForProfile(item.current_teacher_id || item.target_teacher_id)} — ${item.target_class_code || 'end assignment'} — ${formatDate(item.effective_on)}` })), { placeholder: pending.length ? 'Choose a recommendation' : 'No independently recommended changes' }),
    selectInput('decision', 'Decision', [{ value: 'approve', label: 'Approve and apply' }, { value: 'reject', label: 'Reject' }], { placeholder: 'Choose a decision' }),
    textInput('note', 'Decision note (optional)', { maxlength: '1000', required: false }),
    alertBox('warning', 'Independent approval', 'The person who made the recommendation cannot approve it. A future-dated change is applied only on its effective date.'),
    decisionMessage, primaryButton('Record assignment decision', { type: 'submit', icon: 'shield', disabled: !pending.length })
  ) : null;

  return h('div', { class: 'details-grid' },
    h('details', { class: 'form-panel' }, h('summary', { text: 'Recommend a teacher movement, replacement or new assignment' }), form),
    decisionForm ? h('details', { class: 'form-panel' }, h('summary', { text: 'Approve or reject an assignment recommendation' }), decisionForm) : null
  );
}

function maskPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length >= 4 ? `•••• ${digits.slice(-4)}` : 'Not reconciled';
}

function oneTimePasswordPanel() {
  const password = h('code', { class: 'one-time-password' });
  const instruction = h('p', { class: 'field__hint' });
  const panel = h('div', { class: 'one-time-credential', hidden: true },
    h('strong', { text: 'One-time temporary password' }),
    password,
    instruction,
    h('button', { type: 'button', class: 'button button--secondary', onClick: () => {
      password.textContent = '';
      instruction.textContent = '';
      panel.setAttribute('hidden', '');
    } }, h('span', { text: 'I have recorded it privately' }))
  );
  return {
    panel,
    show(value, note) {
      password.textContent = value;
      instruction.textContent = note;
      panel.removeAttribute('hidden');
      password.focus?.();
    }
  };
}

function accountManagementForms() {
  const nonAdminAccounts = state.data.profiles.filter((profile) => profile.role !== 'admin');
  const parentAccounts = state.data.profiles.filter((profile) => profile.role === 'parent');

  const createMessage = formMessage();
  const createCredential = oneTimePasswordPanel();
  const createForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault();
    if (!createForm.reportValidity()) return;
    const submit = createForm.querySelector('[type=submit]');
    submit.disabled = true;
    const values = new FormData(createForm);
    try {
      const result = await postAccountApi('/api/admin/accounts', {
        fullName: String(values.get('full_name') || '').trim(),
        phone: String(values.get('phone') || ''),
        role: values.get('role'),
        legacySource: String(values.get('legacy_source') || '').trim() || null,
        legacyAccountNo: String(values.get('legacy_account_no') || '').trim() || null,
        studentIds: []
      });
      createForm.reset();
      setFormMessage(createMessage, 'Account created in pending activation. Record the temporary password now; the user must replace it at first sign-in.');
      createCredential.show(result.temporaryPassword, result.instruction);
    } catch (error) {
      setFormMessage(createMessage, error.message || friendlyError(), true);
    } finally { submit.disabled = false; }
  } },
    textInput('full_name', 'Verified full name', { maxlength: '120', autocomplete: 'off' }),
    textInput('phone', 'Verified Nigerian phone', { type: 'tel', inputmode: 'tel', placeholder: '0906 393 2487', maxlength: '24', hint: 'The office must verify the person and number before creation.' }),
    selectInput('role', 'Account role', [{ value: 'teacher', label: 'Teacher' }], { placeholder: 'Teacher' }),
    alertBox('info', 'Parents create their own accounts', 'Do not create ordinary parent accounts here. Parents use TA-LINK, phone-bound TA-FAMILY or the restricted new-applicant route. This trusted workflow is only for staff provisioning and recovery.'),
    h('div', { class: 'form-grid' },
      textInput('legacy_source', 'Legacy source (optional)', { maxlength: '80', required: false, hint: 'For example: school_data or parent_accounts. Never enter a former PIN.' }),
      textInput('legacy_account_no', 'Former account number (optional)', { maxlength: '120', required: false })
    ),
    alertBox('warning', 'Staff provisioning only', 'Verify employment and the staff phone before creation. This workflow cannot create a parent or another administrator.'),
    createMessage,
    createCredential.panel,
    primaryButton('Create verified account', { type: 'submit', icon: 'user' })
  );

  const resetMessage = formMessage();
  const resetCredential = oneTimePasswordPanel();
  const resetForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault();
    if (!resetForm.reportValidity()) return;
    const submit = resetForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(resetForm);
    const accountId = values.get('account_id');
    try {
      const result = await postAccountApi(`/api/admin/accounts/${encodeURIComponent(accountId)}/reset-password`, { reason: values.get('reason') });
      setFormMessage(resetMessage, 'Former sessions were revoked. Record the new temporary password now.');
      resetCredential.show(result.temporaryPassword, result.instruction);
    } catch (error) { setFormMessage(resetMessage, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('account_id', 'Parent or teacher account', nonAdminAccounts.map((profile) => ({ value: profile.id, label: `${profile.full_name} — ${titleCase(profile.role)} — ${maskPhone(profile.phone_e164)}` })), { placeholder: nonAdminAccounts.length ? 'Choose a verified account' : 'No eligible accounts' }),
    selectInput('reason', 'Office identity-verification method', [
      { value: 'in_person', label: 'Verified in person' },
      { value: 'confirmed_voice_call', label: 'Confirmed voice call' },
      { value: 'owner_approved_record_check', label: 'Owner-approved record check' }
    ], { placeholder: 'Choose how identity was verified' }),
    alertBox('warning', 'Verification required', 'Do not reset from a chat message alone. Administrator-account recovery remains owner-controlled.'),
    resetMessage,
    resetCredential.panel,
    primaryButton('Issue one-time reset password', { type: 'submit', icon: 'lock', disabled: !nonAdminAccounts.length })
  );

  const statusMessage = formMessage();
  const statusForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!statusForm.reportValidity()) return;
    const submit = statusForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(statusForm);
    const accountId = values.get('account_id');
    try {
      await postAccountApi(`/api/admin/accounts/${encodeURIComponent(accountId)}/status`, { status: values.get('status'), reason: values.get('reason') });
      setFormMessage(statusMessage, 'Account status updated and audit-recorded.');
      await refreshAfterMutation();
    } catch (error) { setFormMessage(statusMessage, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('account_id', 'Parent or teacher account', nonAdminAccounts.map((profile) => ({ value: profile.id, label: `${profile.full_name} — ${titleCase(profile.account_status)}` })), { placeholder: nonAdminAccounts.length ? 'Choose an account' : 'No eligible accounts' }),
    selectInput('status', 'New account status', [
      { value: 'active', label: 'Active' },
      { value: 'suspended', label: 'Suspended' },
      { value: 'archived', label: 'Archived' }
    ], { placeholder: 'Choose a status' }),
    selectInput('reason', 'Reason category', [
      { value: 'identity_review_complete', label: 'Identity review complete' },
      { value: 'security_concern', label: 'Security concern' },
      { value: 'employment_ended', label: 'Employment ended' },
      { value: 'relationship_changed', label: 'Caregiver relationship changed' },
      { value: 'owner_instruction', label: 'Owner instruction' }
    ], { placeholder: 'Choose a reason' }),
    statusMessage,
    primaryButton('Update account status', { type: 'submit', icon: 'shield', disabled: !nonAdminAccounts.length })
  );

  const linkMessage = formMessage();
  const linkForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!linkForm.reportValidity()) return;
    const submit = linkForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(linkForm);
    try {
      await postAccountApi('/api/admin/guardian-links', {
        parentId: values.get('parent_id'),
        studentId: values.get('student_id'),
        relationship: values.get('relationship'),
        active: values.get('action') === 'link'
      });
      setFormMessage(linkMessage, values.get('action') === 'link' ? 'Verified caregiver link saved.' : 'Caregiver access removed.');
      await refreshAfterMutation();
    } catch (error) { setFormMessage(linkMessage, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('parent_id', 'Parent account', parentAccounts.map((profile) => ({ value: profile.id, label: `${profile.full_name} — ${maskPhone(profile.phone_e164)}` })), { placeholder: parentAccounts.length ? 'Choose a verified parent' : 'No parent accounts' }),
    selectInput('student_id', 'Pupil', state.data.students.map((student) => ({ value: student.id, label: `${student.full_name} — ${student.class_code}` })), { placeholder: state.data.students.length ? 'Choose a pupil' : 'No pupils' }),
    selectInput('relationship', 'Relationship', [
      { value: 'parent', label: 'Parent' },
      { value: 'guardian', label: 'Guardian' },
      { value: 'caregiver', label: 'Caregiver' }
    ], { placeholder: 'Choose a relationship' }),
    selectInput('action', 'Access action', [
      { value: 'link', label: 'Verify and link' },
      { value: 'unlink', label: 'Remove access' }
    ], { placeholder: 'Choose link or remove' }),
    alertBox('info', 'Verified relationships only', 'Never link families by a public phone search. One parent may have several children. One pupil may have at most two active, separately authenticated parents or guardians.'),
    linkMessage,
    primaryButton('Save caregiver access', { type: 'submit', icon: 'pupils', disabled: !parentAccounts.length || !state.data.students.length })
  );

  return h('div', { class: 'details-grid account-actions' },
    h('details', { class: 'form-panel' }, h('summary', { text: 'Create a teacher account' }), createForm),
    h('details', { class: 'form-panel' }, h('summary', { text: 'Reset a password after office verification' }), resetForm),
    h('details', { class: 'form-panel' }, h('summary', { text: 'Suspend, archive or reactivate an account' }), statusForm),
    h('details', { class: 'form-panel' }, h('summary', { text: 'Link or unlink a verified caregiver' }), linkForm)
  );
}

function accountDirectory() {
  const search = h('input', { type: 'search', inputmode: 'search', autocomplete: 'off', placeholder: 'Name, last 4 digits or former account number' });
  const results = h('div');
  const render = () => {
    const query = search.value.trim().toLowerCase();
    const digits = query.replace(/\D/g, '');
    const profiles = state.data.profiles.filter((profile) => {
      if (!query) return true;
      return profile.full_name.toLowerCase().includes(query)
        || (digits && String(profile.phone_e164 || '').endsWith(digits))
        || String(profile.legacy_account_no || '').toLowerCase().includes(query);
    });
    replace(results, table(['Name', 'Phone', 'Role', 'Account status', 'Password setup'], profiles.map((profile) => [
      profile.full_name,
      maskPhone(profile.phone_e164),
      profile.position_title || badge(profile.role),
      badge(profile.account_status),
      profile.must_change_password ? 'Change required' : 'Complete'
    ]), 'Filtered portal accounts') || emptyState('No matching account', 'Check the spelling, last four phone digits or verified former account number.'));
  };
  search.addEventListener('input', render);
  render();
  return h('div', {}, controlField('Search portal accounts', search, 'Only authorised administrators can use this private directory. Full phone numbers are not displayed.'), results);
}

function peopleView() {
  const guardianRows = state.data.guardians.map((link) => [
    nameForProfile(link.parent_id),
    nameForStudent(link.student_id),
    titleCase(link.relationship),
    link.active ? badge('active') : badge('inactive'),
    link.verified_at ? formatDate(link.verified_at) : 'Awaiting verification'
  ]);
  return section('Accounts & classes', 'Create and recover accounts through the trusted server workflow. Roles, status, caregiver links and class assignments remain separate decisions.',
    accountManagementForms(),
    h('h2', { class: 'subheading', text: 'Portal account directory' }),
    accountDirectory(),
    h('h2', { class: 'subheading', text: 'Verified caregiver links' }),
    table(['Parent or caregiver', 'Pupil', 'Relationship', 'Access', 'Verified'], guardianRows, 'Verified caregiver links') || emptyState('No caregiver links', 'Verify the relationship before granting a parent access to a child.'),
    h('h2', { class: 'subheading', text: 'Teacher class scope and continuity' }),
    assignmentForm(),
    table(['Teacher', 'Class', 'Scope', 'Kind', 'Session', 'From', 'To / status'], state.data.assignments.map((assignment) => [
      nameForProfile(assignment.teacher_id), assignment.class_code, assignment.subject === '*' ? 'All subjects' : assignment.subject,
      titleCase(assignment.assignment_kind || 'subject_teacher'), assignment.session_name || 'Not recorded', assignment.started_on ? formatDate(assignment.started_on) : 'Former date not recorded',
      assignment.active ? badge('active') : (assignment.ended_on ? formatDate(assignment.ended_on) : badge('inactive'))
    ]), 'Teacher assignment history') || emptyState('No assignments', 'Recommend an assignment before teachers enter results.'),
    h('h2', { class: 'subheading', text: 'Assignment recommendations' }),
    table(['Action', 'Current teacher', 'Target teacher / class', 'Effective', 'Recommended by', 'Status'], (state.data.assignmentChanges || []).slice().reverse().map((item) => [
      titleCase(item.action), nameForProfile(item.current_teacher_id), `${nameForProfile(item.target_teacher_id)}${item.target_class_code ? ` — ${item.target_class_code}` : ''}`,
      formatDate(item.effective_on), nameForProfile(item.recommended_by), badge(item.status)
    ]), 'Assignment recommendation history') || emptyState('No assignment recommendations', 'Teacher movements and replacements will appear here without overwriting authorship history.')
  );
}

function adminPaymentForms() {
  return alertBox('info', 'Legacy payment workflow disabled', 'Use Bills & Payments after the staged office migration is activated. Former browser payment mutations and pre-verification receipts are not available.');
}

function bankTransferForm() {
  const invoices = (state.data.pupilInvoices || []).filter((item) => ['issued', 'part_paid'].includes(item.status));
  const orders = (state.data.shopOrders || []).filter((item) => ['awaiting_payment', 'payment_submitted'].includes(item.status));
  if (!invoices.length && !orders.length) return emptyState('Nothing awaiting payment', 'An issued term invoice or reserved materials order will appear here.');
  const message = formMessage();
  const target = h('select', { name: 'target', required: true }, h('option', { value: '', text: 'Choose an invoice or order', disabled: true, selected: true }));
  invoices.forEach((item) => target.append(h('option', { value: `invoice:${item.id}`, text: `${item.invoice_reference} — ${item.title} — balance ${formatMoney(Number(item.total_amount) - Number(item.paid_amount))}` })));
  orders.forEach((item) => target.append(h('option', { value: `order:${item.id}`, text: `${item.order_reference} — materials order — ${formatMoney(item.total_amount)}` })));
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    const [kind, id] = String(values.get('target')).split(':');
    try {
      const reference = await rpcCall('submit_bank_transfer_notification', {
        p_invoice_id: kind === 'invoice' ? id : null,
        p_order_id: kind === 'order' ? id : null,
        p_amount: Number(values.get('amount')),
        p_payer_name: String(values.get('payer_name')).trim(),
        p_sender_bank_name: String(values.get('sender_bank_name')).trim(),
        p_external_reference: String(values.get('external_reference')).trim(),
        p_paid_at: new Date(String(values.get('paid_at'))).toISOString()
      });
      setFormMessage(message, `Transfer notification ${reference} was saved for office review. This is not an official receipt.`);
      form.reset(); await refreshAfterMutation();
    } catch { setFormMessage(message, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    controlField('Invoice or order', target),
    h('div', { class: 'form-grid' },
      textInput('amount', 'Amount transferred (NGN)', { type: 'number', min: '1', step: '0.01', inputmode: 'decimal' }),
      textInput('paid_at', 'Transfer date and time', { type: 'datetime-local' })
    ),
    textInput('payer_name', 'Sender or payer name', { maxlength: '160', autocomplete: 'name' }),
    h('div', { class: 'form-grid' },
      textInput('sender_bank_name', 'Sending bank', { maxlength: '120' }),
      textInput('external_reference', 'Bank transaction reference', { maxlength: '160' })
    ),
    alertBox('warning', 'Notification only', 'The school checks its bank statement manually. Do not upload evidence or send it through WhatsApp. An official receipt appears only after authorised verification.'),
    message, primaryButton('Notify the office of this transfer', { type: 'submit', icon: 'payments' })
  );
  return h('details', { class: 'form-panel' }, h('summary', { text: 'Notify the office of a bank transfer' }), form);
}

function termBillsPanel() {
  const bank = (state.data.bankAccounts || []).find((item) => item.active);
  const invoiceRows = (state.data.pupilInvoices || []).map((item) => [
    item.invoice_reference, nameForStudent(item.student_id), item.title,
    `${item.session_name} · ${item.term_name}`, formatMoney(item.total_amount),
    formatMoney(Number(item.total_amount) - Number(item.paid_amount)), badge(item.status), formatDate(item.due_date)
  ]);
  return h('div', {},
    alertBox('info', 'Term bills accept instalments', 'Each bill lists non-quantity service lines. Included examinations or materials are not billed again as separate lines. Payment never changes admission, promotion, results or account access.'),
    bank ? h('article', { class: 'record-card' }, h('h3', { text: 'Approved bank account' }),
      h('p', { text: `${bank.bank_name} · ${bank.account_name}` }), h('strong', { text: bank.account_number }),
      h('p', { class: 'field__hint', text: 'Use this account only for a portal invoice or order. The office must still verify the transfer.' }))
      : alertBox('warning', 'No bank account is currently approved in the portal', 'Do not transfer using an old screenshot or forwarded account number. Contact the school office.'),
    bankTransferForm(),
    table(['Invoice', 'Pupil', 'Bill', 'Session / term', 'Total', 'Balance', 'Status', 'Due'], invoiceRows, 'Term bills')
      || emptyState('No issued term bills', 'The office will publish a class bill only after its items and inclusions are verified.')
  );
}

function materialsPanel() {
  const products = state.data.shopProducts || [];
  const variants = state.data.shopVariants || [];
  const operationalStudents = state.data.students.filter((student) => student.active && student.admission_status === 'admitted');
  const available = variants.filter((variant) => variant.active && variant.reconciled && Number(variant.available ?? (Number(variant.on_hand) - Number(variant.reserved))) > 0 && variant.unit_price);
  const message = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      const result = await rpcCall('place_shop_order', {
        p_student_id: values.get('student_id'), p_collection_method: values.get('collection_method'),
        p_session_name: String(values.get('session_name')).trim(), p_term_name: String(values.get('term_name') || '').trim(),
        p_items: [{ variant_id: values.get('variant_id'), quantity: Number(values.get('quantity')) }]
      });
      setFormMessage(message, `Order ${result.order_reference} reserved the selected stock. Pay the exact order total before release.`);
      form.reset(); await refreshAfterMutation();
    } catch { setFormMessage(message, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('student_id', 'Linked pupil', operationalStudents.map((student) => ({ value: student.id, label: `${student.full_name} — ${student.class_code}` })), { placeholder: 'Choose an active pupil' }),
    selectInput('variant_id', 'Verified item and variant', available.map((variant) => {
      const product = products.find((item) => item.id === variant.product_id);
      return { value: variant.id, label: `${product?.name || 'School item'} — ${variant.variant_label}${variant.size_label ? ` / ${variant.size_label}` : ''} — ${formatMoney(variant.unit_price)} — ${Number(variant.available ?? (Number(variant.on_hand) - Number(variant.reserved)))} available` };
    }), { placeholder: available.length ? 'Choose an available variant' : 'No verified stock available' }),
    h('div', { class: 'form-grid' }, textInput('quantity', 'Quantity', { type: 'number', min: '1', max: '20', step: '1', inputmode: 'numeric' }),
      selectInput('collection_method', 'Handover method', [{ value: 'office', label: 'Parent or guardian collects from the office' }, { value: 'teacher_to_pupil', label: 'Teacher hands it to the linked pupil' }], { placeholder: 'Choose collection or distribution' })),
    h('div', { class: 'form-grid' }, textInput('session_name', 'Session', { maxlength: '40', placeholder: '2026/2027' }), textInput('term_name', 'Term (optional)', { maxlength: '40', required: false })),
    alertBox('info', 'Physical stock only', 'A materials order reserves real variant stock. It is normally released only after full verified payment. Term charges and transport are not cart items.'),
    message, primaryButton('Reserve item and create order', { type: 'submit', icon: 'inbox', disabled: !available.length || !operationalStudents.length })
  );

  const restockMessage = formMessage();
  const restockForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!restockForm.reportValidity()) return;
    const submit = restockForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(restockForm);
    try {
      await rpcCall('request_restock', { p_student_id: values.get('student_id'), p_product_id: values.get('product_id'), p_variant_label: String(values.get('variant_label') || '').trim() || null, p_quantity: Number(values.get('quantity')) });
      setFormMessage(restockMessage, 'Restock interest recorded. It is not an order, charge, reservation or guarantee.');
      restockForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(restockMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('student_id', 'Linked pupil', operationalStudents.map((student) => ({ value: student.id, label: student.full_name })), { placeholder: 'Choose an active pupil' }),
    selectInput('product_id', 'Product', products.map((product) => ({ value: product.id, label: product.name })), { placeholder: products.length ? 'Choose a product' : 'No reconciled products' }),
    h('div', { class: 'form-grid' }, textInput('variant_label', 'Preferred size or variant (optional)', { maxlength: '120', required: false }), textInput('quantity', 'Wanted quantity', { type: 'number', min: '1', max: '20', step: '1', inputmode: 'numeric' })),
    restockMessage, primaryButton('Record restock interest', { type: 'submit', icon: 'inbox', disabled: !products.length })
  );
  return h('div', {}, h('details', { class: 'form-panel', open: true }, h('summary', { text: 'Create a materials order' }), form),
    h('details', { class: 'form-panel' }, h('summary', { text: 'Request an unavailable product' }), restockForm));
}

function transportPanel() {
  const services = state.data.transportServices || [];
  const operationalStudents = state.data.students.filter((student) => student.active && student.admission_status === 'admitted');
  const message = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      const reference = await rpcCall('request_transport', {
        p_student_id: values.get('student_id'), p_service_id: values.get('service_id') || null,
        p_general_area: String(values.get('general_area')).trim()
      });
      setFormMessage(message, `Transport request ${reference} saved for capacity and route review. No bill exists until the office approves it.`);
      form.reset(); await refreshAfterMutation();
    } catch { setFormMessage(message, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('student_id', 'Linked pupil', operationalStudents.map((student) => ({ value: student.id, label: `${student.full_name} — ${student.class_code}` })), { placeholder: 'Choose an active pupil' }),
    selectInput('service_id', 'Verified route (optional)', services.map((service) => ({ value: service.id, label: `${service.route_name} — ${service.session_name} ${service.term_name}${service.term_amount ? ` — ${formatMoney(service.term_amount)}` : ''}` })), { placeholder: 'Ask the office to match my area', required: false }),
    textInput('general_area', 'General pickup area', { maxlength: '240', hint: 'Do not enter the child’s exact home address here. The office will arrange private route details if capacity is approved.' }),
    alertBox('info', 'Transport is a service', 'A route request uses capacity review and a service invoice. It never changes physical inventory and does not guarantee a place.'),
    message, primaryButton('Submit transport request', { type: 'submit', icon: 'inbox' })
  );
  const rows = (state.data.transportRequests || []).map((item) => { const cancellable = ['requested', 'reviewing', 'waitlisted'].includes(item.status); const action = cancellable ? h('button', { type: 'button', class: 'table-action', onClick: async () => { try { await rpcCall('cancel_parent_request', { p_request_type: 'transport', p_request_id: item.id }); await refreshAfterMutation(); } catch { setStatus(friendlyError(), true); } } }, 'Cancel request') : '—'; return [item.request_reference, nameForStudent(item.student_id), services.find((service) => service.id === item.service_id)?.route_name || item.general_area, badge(item.status), item.invoice_id ? 'Invoice issued' : 'No invoice', formatDate(item.created_at), action]; });
  return h('div', {}, h('details', { class: 'form-panel' }, h('summary', { text: 'Request school transport' }), form),
    table(['Reference', 'Pupil', 'Route / area', 'Status', 'Billing', 'Requested', 'Action'], rows, 'My transport requests') || emptyState('No transport requests', 'Submit only if school transport is needed.'));
}

function ordersPanel() {
  const rows = (state.data.shopOrders || []).map((order) => {
    const lines = (state.data.shopOrderLines || []).filter((line) => line.order_id === order.id).map((line) => `${line.product_name_snapshot} · ${line.variant_snapshot} × ${line.quantity}`).join('; ');
    const cancel = ['awaiting_payment', 'payment_submitted', 'payment_reversed'].includes(order.status)
      ? h('button', { type: 'button', class: 'table-action', onClick: async () => { try { await rpcCall('cancel_shop_order', { p_order_id: order.id, p_reason: 'Cancelled by purchasing parent in portal' }); await refreshAfterMutation(); } catch { setStatus(friendlyError(), true); } } }, 'Cancel unpaid order') : '—';
    return [order.order_reference, nameForStudent(order.student_id), lines, formatMoney(order.total_amount), titleCase(order.collection_method), badge(order.status), order.expected_ready_on ? formatDate(order.expected_ready_on) : 'After verification', cancel];
  });
  return h('div', {}, alertBox('info', 'Release and handover', 'After full verified payment, the office prepares the order for office collection or teacher handover to the linked pupil. Teachers see only the handover details for their class.'),
    table(['Order', 'Pupil', 'Items', 'Total', 'Method', 'Status', 'Expected', 'Action'], rows, 'Materials orders and collection') || emptyState('No materials orders', 'Orders appear after stock is successfully reserved.'));
}

function receiptsPanel() {
  const payments = state.data.manualPayments || [];
  const rows = (state.data.paymentReceipts || []).map((receipt) => {
    const payment = payments.find((item) => item.id === receipt.payment_id);
    return [receipt.receipt_reference, payment?.payment_reference || 'Payment record', payment ? titleCase(payment.method) : '—', payment ? formatMoney(payment.amount) : '—', formatDate(receipt.issued_at), receipt.reversed_at ? badge('reversed') : badge('official')];
  });
  return h('div', {}, alertBox('info', 'Official only after verification', 'A bank notification is not a receipt. Every receipt here was created only after an authorised administrator verified the bank transfer or separately verified an in-person physical POS record.'),
    table(['Receipt', 'Payment', 'Method', 'Amount', 'Issued', 'Status'], rows, 'Official payment receipts') || emptyState('No official receipts', 'Verified payments will create official receipts here.'));
}

function parentRequestsPanel() {
  const restocks = state.data.restockRequests || [];
  const eligibleLines = (state.data.shopOrderLines || []).map((line) => { const committed = (state.data.returnRequests || []).filter((item) => item.order_line_id === line.id && !['declined', 'cancelled'].includes(item.status)).reduce((sum, item) => sum + Number(item.requested_quantity), 0); return { ...line, returnable_quantity: Number(line.fulfilled_quantity) - committed }; }).filter((line) => line.returnable_quantity > 0);
  const returnMessage = formMessage();
  const returnForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!returnForm.reportValidity()) return;
    const submit = returnForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(returnForm);
    try {
      const reference = await rpcCall('request_return_exchange', {
        p_order_line_id: values.get('order_line_id'), p_kind: values.get('request_kind'),
        p_quantity: Number(values.get('quantity')), p_requested_variant_id: values.get('requested_variant_id') || null,
        p_reason: String(values.get('reason')).trim()
      });
      setFormMessage(returnMessage, `Request ${reference} was saved for office inspection.`);
      returnForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(returnMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('order_line_id', 'Fulfilled order item', eligibleLines.map((line) => ({ value: line.id, label: `${line.product_name_snapshot} — ${line.variant_snapshot} — up to ${line.returnable_quantity}` })), { placeholder: eligibleLines.length ? 'Choose an item' : 'No fulfilled item available' }),
    selectInput('request_kind', 'Request', [{ value: 'return', label: 'Return after inspection' }, { value: 'exchange', label: 'Exchange after inspection' }]),
    h('div', { class: 'form-grid' }, textInput('quantity', 'Quantity', { type: 'number', min: '1', max: '20', step: '1' }),
      selectInput('requested_variant_id', 'Requested exchange variant (optional)', (state.data.shopVariants || []).map((variant) => ({ value: variant.id, label: `${state.data.shopProducts.find((product) => product.id === variant.product_id)?.name || 'Item'} — ${variant.variant_label}${variant.size_label ? ` / ${variant.size_label}` : ''}` })), { placeholder: 'Not an exchange', required: false })),
    controlField('Reason', h('textarea', { name: 'reason', maxlength: '1000', rows: '4', required: true }), 'The office inspects the returned item before any stock or monetary adjustment.'),
    returnMessage, primaryButton('Submit return or exchange request', { type: 'submit', icon: 'inbox', disabled: !eligibleLines.length })
  );
  const restockRows = restocks.map((item) => {
    const actions = [];
    if (item.status === 'available') actions.push(h('button', { type: 'button', class: 'table-action', onClick: async () => { try { await rpcCall('confirm_restock_interest', { p_request_id: item.id }); await refreshAfterMutation(); } catch { setStatus(friendlyError(), true); } } }, 'Confirm interest'));
    if (['requested', 'reviewing', 'procurement_planned', 'available', 'parent_confirmed'].includes(item.status)) actions.push(h('button', { type: 'button', class: 'table-action', onClick: async () => { try { await rpcCall('cancel_parent_request', { p_request_type: 'restock', p_request_id: item.id }); await refreshAfterMutation(); } catch { setStatus(friendlyError(), true); } } }, 'Cancel'));
    return [state.data.shopProducts.find((product) => product.id === item.product_id)?.name || 'School item', item.variant_label || 'Any verified variant', item.requested_quantity, badge(item.status), item.admin_note || '—', actions.length ? h('div', { class: 'table-actions' }, actions) : '—'];
  });
  const returnRows = (state.data.returnRequests || []).map((item) => [item.request_reference, titleCase(item.request_kind), item.requested_quantity, badge(item.status), item.inspection_result ? titleCase(item.inspection_result) : 'Awaiting inspection', item.office_note || '—', item.status === 'requested' ? h('button', { type: 'button', class: 'table-action', onClick: async () => { try { await rpcCall('cancel_parent_request', { p_request_type: 'return_exchange', p_request_id: item.id }); await refreshAfterMutation(); } catch { setStatus(friendlyError(), true); } } }, 'Cancel request') : '—']);
  return h('div', {},
    h('h3', { text: 'Restock and procurement requests' }),
    table(['Product', 'Variant', 'Quantity', 'Status', 'Office note', 'Action'], restockRows, 'Restock requests') || emptyState('No restock requests', 'Unavailable-product interest appears here.'),
    h('details', { class: 'form-panel' }, h('summary', { text: 'Request a return or exchange' }), returnForm),
    table(['Reference', 'Type', 'Quantity', 'Status', 'Inspection', 'Office note', 'Action'], returnRows, 'Return and exchange requests') || emptyState('No return or exchange requests', 'Requests must reference a fulfilled order item.'));
}

function feesHubView() {
  const tabs = [
    ['term-bills', 'Term Bills'], ['materials', 'School Materials'], ['transport', 'Transport'],
    ['orders', 'Orders & Collection'], ['receipts', 'Receipts'], ['requests', 'Requests']
  ];
  const nav = h('div', { class: 'hub-tabs', role: 'tablist', 'aria-label': 'Fees, shop and transport sections' }, tabs.map(([key, label]) => h('button', {
    type: 'button', role: 'tab', 'aria-selected': String(state.hubTab === key), class: state.hubTab === key ? 'hub-tab hub-tab--active' : 'hub-tab',
    onClick: () => { state.hubTab = key; renderAuthenticated(); }
  }, label)));
  const panel = state.hubTab === 'materials' ? materialsPanel()
    : state.hubTab === 'transport' ? transportPanel()
      : state.hubTab === 'orders' ? ordersPanel()
        : state.hubTab === 'receipts' ? receiptsPanel()
          : state.hubTab === 'requests' ? parentRequestsPanel() : termBillsPanel();
  return section('Fees, Shop & Transport', 'Structured parent records for term services, physical materials, transport, manual payments and fulfilment.', nav, h('div', { class: 'hub-panel', role: 'tabpanel' }, panel));
}

function graduatesView() {
  const graduates = state.data.graduates || [];
  if (state.profile.role === 'parent') {
    const rows = graduates.map((item) => [nameForStudent(item.student_id), item.graduation_session, formatDate(item.graduated_on), item.completion_type === 'accelerated_secondary_transition' ? 'Accelerated secondary transition' : 'Standard Primary 6 graduation', badge(item.public_status)]);
    return section('Your Graduates', 'Private Graduate Hall records stay linked to your parent account. Standard Primary 6 completion and an approved accelerated secondary transition are labelled distinctly.',
      table(['Graduate', 'Session', 'Recorded', 'Completion label', 'Public consent status'], rows, 'Your private graduates') || emptyState('No graduates linked yet', 'A record appears only after an approved promotion batch is applied.'));
  }
  const message = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    const status = values.get('public_status');
    try {
      const payload = {
        public_status: status,
        public_name: status === 'approved' ? String(values.get('public_name')).trim() : null,
        public_message: status === 'approved' ? String(values.get('public_message') || '').trim() || null : null,
        consent_reference: status === 'approved' ? String(values.get('consent_reference')).trim() : null,
        approved_by: status === 'approved' ? state.profile.id : null,
        approved_at: status === 'approved' ? new Date().toISOString() : null,
        published_at: status === 'approved' ? new Date().toISOString() : null
      };
      const { error } = await state.supabase.from('graduates').update(payload).eq('student_id', values.get('student_id'));
      if (error) throw error;
      setFormMessage(message, status === 'approved' ? 'Consent-reviewed public projection approved.' : 'Public graduate status updated.');
      await refreshAfterMutation();
    } catch { setFormMessage(message, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('student_id', 'Graduate', graduates.map((item) => ({ value: item.student_id, label: `${nameForStudent(item.student_id)} — ${item.graduation_session}` })), { placeholder: graduates.length ? 'Choose a graduate' : 'Graduate Hall is empty' }),
    selectInput('public_status', 'Graduate Wall decision', ['pending', 'approved', 'declined', 'revoked'].map((value) => ({ value, label: titleCase(value) }))),
    textInput('public_name', 'Approved public name (required for approval)', { maxlength: '120', required: false }),
    textInput('consent_reference', 'Consent reference (required for approval)', { maxlength: '160', required: false, hint: 'Record the school-controlled consent reference, not private evidence text.' }),
    controlField('Approved public message (optional)', h('textarea', { name: 'public_message', maxlength: '500', rows: '3' })),
    alertBox('warning', 'Privacy boundary', 'The public projection never includes parent contacts, results, admission numbers, class history or finance. Revoke publication when consent is withdrawn.'),
    message, primaryButton('Record Graduate Wall decision', { type: 'submit', icon: 'publish', disabled: !graduates.length })
  );
  const rows = graduates.map((item) => [nameForStudent(item.student_id), item.graduation_session, formatDate(item.graduated_on), item.completion_type === 'accelerated_secondary_transition' ? 'Accelerated secondary transition' : 'Standard Primary 6 graduation', item.public_name || 'Private only', badge(item.public_status), item.published_at ? formatDate(item.published_at) : 'Not public']);
  return section('Graduate Hall', 'Graduation preserves the pupil identity and full enrolment history. Accelerated secondary transition is never presented as ordinary Primary 6 completion.',
    h('details', { class: 'form-panel' }, h('summary', { text: 'Review public Graduate Wall consent' }), form),
    table(['Graduate', 'Session', 'Recorded', 'Completion label', 'Public name', 'Consent status', 'Published'], rows, 'Graduate Hall') || emptyState('Graduate Hall is empty', 'Approved standard or accelerated completion records will appear here.'));
}

function teacherDistributionView() {
  const orders = (state.data.shopOrders || []).filter((item) => item.status === 'ready_for_teacher');
  const message = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      await rpcCall('advance_shop_order', { p_order_id: values.get('order_id'), p_action: 'fulfil', p_note: String(values.get('note')).trim() });
      setFormMessage(message, 'Handover to the linked pupil recorded and stock moved authoritatively.');
      await refreshAfterMutation();
    } catch { setFormMessage(message, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('order_id', 'Released pupil order', orders.map((order) => ({ value: order.id, label: `${order.order_reference} — ${nameForStudent(order.student_id)} — ${order.class_snapshot}` })), { placeholder: orders.length ? 'Choose an order' : 'No released orders for My Class' }),
    textInput('note', 'Handover note', { maxlength: '1000', hint: 'Confirm the item was physically handed to the named linked pupil.' }),
    alertBox('info', 'Limited handover view', 'Teachers see pupil, class, item, variant, quantity, order and handover only. Balances, payment references, bank details and unrelated pupils remain hidden.'),
    message, primaryButton('Record pupil handover', { type: 'submit', icon: 'inbox', disabled: !orders.length })
  );
  const rows = orders.map((order) => [order.order_reference, nameForStudent(order.student_id), order.class_snapshot,
    (state.data.shopOrderLines || []).filter((line) => line.order_id === order.id).map((line) => `${line.product_name_snapshot} · ${line.variant_snapshot} × ${line.quantity}`).join('; '), badge(order.status)]);
  return section('Pupil Handover', 'Released materials may be distributed by the assigned teacher at an appropriate time.', form,
    table(['Order', 'Pupil', 'Class', 'Items', 'Status'], rows, 'Teacher pupil handovers') || emptyState('No released orders', 'The office must verify payment and release an order to the teacher first.'));
}

function enrolmentAdminView() {
  const batches = state.data.promotionBatches || [];
  const prepareMessage = formMessage();
  const prepareForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!prepareForm.reportValidity()) return;
    const submit = prepareForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(prepareForm);
    try {
      await rpcCall('prepare_promotion_batch', { p_source_session: String(values.get('source_session')).trim(), p_target_session: String(values.get('target_session')).trim(), p_source_class: values.get('source_class'), p_note: String(values.get('note') || '').trim() || null });
      setFormMessage(prepareMessage, 'Promotion preview created. Review every pupil outcome before applying it.'); await refreshAfterMutation();
    } catch { setFormMessage(prepareMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    h('div', { class: 'form-grid' }, textInput('source_session', 'Source session', { maxlength: '40' }), textInput('target_session', 'Target session', { maxlength: '40' })),
    selectInput('source_class', 'Source class', SCHOOL_CLASSES, { placeholder: 'Choose a class' }),
    textInput('note', 'Batch note (optional)', { maxlength: '1000', required: false }),
    alertBox('info', 'Exact progression', 'Creche → Pre-Nursery → Nursery 1 → Nursery 2 → Primary 1 → Primary 2 → Primary 3 → Primary 4 → Primary 6 → Graduate Hall. There is no Primary 5.'),
    prepareMessage, primaryButton('Prepare promotion preview', { type: 'submit', icon: 'classes' })
  );
  const entryMessage = formMessage();
  const drafts = batches.filter((batch) => batch.status === 'draft');
  const entryForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!entryForm.reportValidity()) return;
    const submit = entryForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(entryForm); const [batchId, studentId] = String(values.get('entry')).split(':');
    try {
      await rpcCall('set_promotion_outcome', { p_batch_id: batchId, p_student_id: studentId, p_outcome: values.get('outcome'), p_note: String(values.get('note') || '').trim() || null });
      setFormMessage(entryMessage, 'Pupil outcome updated in the draft preview.'); await refreshAfterMutation();
    } catch { setFormMessage(entryMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('entry', 'Draft pupil entry', (state.data.promotionEntries || []).filter((entry) => drafts.some((batch) => batch.id === entry.batch_id)).map((entry) => ({ value: `${entry.batch_id}:${entry.student_id}`, label: `${nameForStudent(entry.student_id)} — currently ${titleCase(entry.proposed_outcome)}` })), { placeholder: 'Choose a pupil preview' }),
    selectInput('outcome', 'Outcome', ['promote', 'retain', 'graduate', 'withdraw', 'transfer_out', 'pending'].map((value) => ({ value, label: titleCase(value) }))),
    textInput('note', 'Outcome note (optional)', { maxlength: '1000', required: false }), entryMessage,
    primaryButton('Update preview outcome', { type: 'submit', icon: 'pupils', disabled: !drafts.length })
  );
  const exceptionalMessage = formMessage();
  const draftEntries = (state.data.promotionEntries || []).filter((entry) => drafts.some((batch) => batch.id === entry.batch_id));
  const exceptionalForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(event.currentTarget); const [batchId, studentId] = String(values.get('entry')).split(':');
    try {
      await rpcCall('recommend_exceptional_progression', {
        p_batch_id: batchId, p_student_id: studentId, p_outcome: values.get('outcome'),
        p_target_class: String(values.get('target_class') || '').trim() || null,
        p_reason: String(values.get('reason') || '').trim()
      });
      setFormMessage(exceptionalMessage, 'Exceptional progression recommended for independent Headmistress or full-authority approval.'); await refreshAfterMutation();
    } catch (error) { setFormMessage(exceptionalMessage, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('entry', 'Draft pupil entry', draftEntries.map((entry) => ({ value: `${entry.batch_id}:${entry.student_id}`, label: `${nameForStudent(entry.student_id)} — ${batches.find((item) => item.id === entry.batch_id)?.source_class || 'class'}` })), { placeholder: draftEntries.length ? 'Choose a pupil preview' : 'No draft pupil entries' }),
    selectInput('outcome', 'Exceptional outcome', [
      { value: 'accelerated_promote', label: 'Accelerated move to a later active class' },
      { value: 'early_secondary_transition', label: 'Primary 4 early secondary transition (not graduation)' },
      { value: 'accelerated_graduate', label: 'Primary 4 accelerated graduate label' }
    ], { placeholder: 'Choose the truthful exceptional outcome' }),
    selectInput('target_class', 'Accelerated target class (only for accelerated move)', SCHOOL_CLASSES, { placeholder: 'Not used for a Primary 4 exit label', required: false }),
    controlField('Recommendation and evidence summary', h('textarea', { name: 'reason', minlength: '3', maxlength: '1000', rows: '4', required: true })),
    alertBox('warning', 'No invented Primary 6 history', 'Common Entrance candidacy is recorded separately. A Primary 4 early leaver is labelled as an early secondary transition or an accelerated graduate only after independent full-leadership approval.'),
    exceptionalMessage, primaryButton('Recommend exceptional progression', { type: 'submit', icon: 'pupils', disabled: !draftEntries.length })
  );

  const recommendedExceptional = draftEntries.filter((entry) => entry.exceptional_status === 'recommended' && entry.recommended_by !== state.profile.id);
  const exceptionalDecisionMessage = formMessage();
  const exceptionalDecisionForm = state.profile.leadership_scope === 'headmistress' ? h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(event.currentTarget); const [batchId, studentId] = String(values.get('entry')).split(':');
    try {
      await rpcCall('decide_exceptional_progression', { p_batch_id: batchId, p_student_id: studentId, p_decision: values.get('decision'), p_note: String(values.get('note') || '').trim() || null });
      setFormMessage(exceptionalDecisionMessage, 'Exceptional progression decision recorded.'); await refreshAfterMutation();
    } catch (error) { setFormMessage(exceptionalDecisionMessage, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('entry', 'Independently recommended pupil', recommendedExceptional.map((entry) => ({ value: `${entry.batch_id}:${entry.student_id}`, label: `${nameForStudent(entry.student_id)} — ${titleCase(entry.exceptional_outcome)}${entry.exceptional_target_class ? ` → ${entry.exceptional_target_class}` : ''}` })), { placeholder: recommendedExceptional.length ? 'Choose a recommendation' : 'No independent recommendation awaiting you' }),
    selectInput('decision', 'Decision', [{ value: 'approve', label: 'Approve exceptional progression' }, { value: 'reject', label: 'Reject and leave pending' }], { placeholder: 'Choose a decision' }),
    textInput('note', 'Decision note (optional)', { maxlength: '1000', required: false }),
    exceptionalDecisionMessage, primaryButton('Record Headmistress decision', { type: 'submit', icon: 'shield', disabled: !recommendedExceptional.length })
  ) : null;

  const eligibleCandidates = state.data.students.filter((student) => student.active && ['Primary 4', 'Primary 6'].includes(student.class_code));
  const candidateMessage = formMessage();
  const candidateForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(event.currentTarget);
    try {
      await rpcCall('recommend_common_entrance_candidate', { p_student_id: values.get('student_id'), p_exam_session: String(values.get('exam_session')).trim(), p_reason: String(values.get('reason')).trim() });
      setFormMessage(candidateMessage, 'Common Entrance candidacy recommended independently from class enrolment.'); event.currentTarget.reset(); await refreshAfterMutation();
    } catch (error) { setFormMessage(candidateMessage, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('student_id', 'Primary 4 or Primary 6 pupil', eligibleCandidates.map((student) => ({ value: student.id, label: `${student.full_name} — ${student.class_code}` })), { placeholder: eligibleCandidates.length ? 'Choose a pupil' : 'No eligible verified roster record' }),
    textInput('exam_session', 'Common Entrance session', { maxlength: '40', placeholder: '2026/2027' }),
    controlField('Candidacy reason', h('textarea', { name: 'reason', minlength: '3', maxlength: '1000', rows: '3', required: true })),
    alertBox('info', 'Candidacy is not class placement', 'A Primary 4 candidate remains recorded in Primary 4 unless an independently approved progression decision changes the enrolment.'),
    candidateMessage, primaryButton('Recommend Common Entrance candidate', { type: 'submit', icon: 'audit', disabled: !eligibleCandidates.length })
  );
  const pendingCandidates = (state.data.commonEntranceCandidates || []).filter((item) => item.status === 'recommended' && item.recommended_by !== state.profile.id);
  const candidateDecisionMessage = formMessage();
  const candidateDecisionForm = state.profile.leadership_scope === 'headmistress' ? h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(event.currentTarget);
    try {
      await rpcCall('decide_common_entrance_candidate', { p_candidate_id: values.get('candidate_id'), p_decision: values.get('decision'), p_note: String(values.get('note') || '').trim() || null });
      setFormMessage(candidateDecisionMessage, 'Common Entrance candidacy decision recorded.'); await refreshAfterMutation();
    } catch (error) { setFormMessage(candidateDecisionMessage, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('candidate_id', 'Pending independent candidacy', pendingCandidates.map((item) => ({ value: item.id, label: `${nameForStudent(item.student_id)} — ${item.source_class} — ${item.exam_session}` })), { placeholder: pendingCandidates.length ? 'Choose a candidacy' : 'No independent candidacy awaiting you' }),
    selectInput('decision', 'Decision', [{ value: 'approve', label: 'Approve candidacy' }, { value: 'cancel', label: 'Decline / cancel candidacy' }], { placeholder: 'Choose a decision' }),
    textInput('note', 'Decision note (optional)', { maxlength: '1000', required: false }),
    candidateDecisionMessage, primaryButton('Record candidacy decision', { type: 'submit', icon: 'shield', disabled: !pendingCandidates.length })
  ) : null;

  const activeCandidateRecords = (state.data.commonEntranceCandidates || []).filter((item) => ['approved', 'sat'].includes(item.status));
  const candidateStatusMessage = formMessage();
  const candidateStatusForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return;
    const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(event.currentTarget);
    try {
      await rpcCall('set_common_entrance_candidate_status', { p_candidate_id: values.get('candidate_id'), p_status: values.get('status'), p_note: String(values.get('note') || '').trim() || null });
      setFormMessage(candidateStatusMessage, 'Common Entrance participation status updated without changing class placement.'); await refreshAfterMutation();
    } catch (error) { setFormMessage(candidateStatusMessage, error.message || friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('candidate_id', 'Approved or participating candidate', activeCandidateRecords.map((item) => ({ value: item.id, label: `${nameForStudent(item.student_id)} — ${item.source_class} — ${titleCase(item.status)}` })), { placeholder: activeCandidateRecords.length ? 'Choose a candidate' : 'No approved candidate record' }),
    selectInput('status', 'Next candidacy status', [{ value: 'sat', label: 'Sat the examination' }, { value: 'completed', label: 'Participation completed' }, { value: 'cancelled', label: 'Candidacy cancelled' }], { placeholder: 'Choose the next truthful status' }),
    textInput('note', 'Status note (optional)', { maxlength: '1000', required: false }),
    candidateStatusMessage, primaryButton('Update candidacy status', { type: 'submit', icon: 'audit', disabled: !activeCandidateRecords.length })
  );

  const applyMessage = formMessage();
  const applyForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!applyForm.reportValidity()) return;
    const submit = applyForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(applyForm);
    try {
      const result = await rpcCall('apply_promotion_batch', { p_batch_id: values.get('batch_id') });
      setFormMessage(applyMessage, `${result.applied_count} permanent pupil histories updated atomically. Parent notifications were created.`); await refreshAfterMutation();
    } catch { setFormMessage(applyMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('batch_id', 'Reviewed draft batch', drafts.map((batch) => ({ value: batch.id, label: `${batch.source_class} · ${batch.source_session} → ${batch.target_session}` })), { placeholder: drafts.length ? 'Choose a fully reviewed batch' : 'No draft batches' }),
    alertBox('warning', 'Confirm the full preview', 'Application is one database transaction. It closes the former enrolment and appends the next history row; it never replaces pupil identity. Primary 6 graduates move to private Graduate Hall.'),
    applyMessage, primaryButton('Confirm and apply batch', { type: 'submit', icon: 'shield', disabled: !drafts.length })
  );
  const cancelMessage = formMessage();
  const cancelForm = h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form); try { await rpcCall('cancel_promotion_batch', { p_batch_id: values.get('batch_id'), p_reason: String(values.get('reason')).trim() }); setFormMessage(cancelMessage, 'Draft promotion preview cancelled without changing any pupil history.'); await refreshAfterMutation(); } catch { setFormMessage(cancelMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, selectInput('batch_id', 'Draft batch to cancel', drafts.map((batch) => ({ value: batch.id, label: `${batch.source_class} · ${batch.source_session} → ${batch.target_session}` })), { placeholder: drafts.length ? 'Choose a draft batch' : 'No draft batches' }), textInput('reason', 'Cancellation reason', { maxlength: '1000' }), cancelMessage, primaryButton('Cancel draft batch', { type: 'submit', icon: 'shield', disabled: !drafts.length }));
  const historyRows = (state.data.studentEnrolments || []).map((item) => [nameForStudent(item.student_id), item.session_name, item.class_code, badge(item.status), formatDate(item.started_on), formatDate(item.ended_on), titleCase(item.source)]);
  const batchRows = batches.map((item) => [item.source_class, item.source_session, item.target_session, badge(item.status), formatDate(item.prepared_at), item.applied_at ? formatDate(item.applied_at) : 'Preview only']);
  const candidateRows = (state.data.commonEntranceCandidates || []).map((item) => [nameForStudent(item.student_id), item.source_class, item.exam_session, nameForProfile(item.recommended_by), badge(item.status), item.approved_by ? nameForProfile(item.approved_by) : 'Awaiting independent decision']);
  const exceptionalRows = draftEntries.filter((item) => item.exceptional_status !== 'none').map((item) => [nameForStudent(item.student_id), titleCase(item.exceptional_outcome), item.exceptional_target_class || 'No class claim', nameForProfile(item.recommended_by), badge(item.exceptional_status), item.approved_by ? nameForProfile(item.approved_by) : 'Awaiting independent decision']);
  return section('Enrolment & Promotion', 'Permanent pupil identity, session history, independent exceptional progression and separate Common Entrance candidacy.',
    h('div', { class: 'details-grid' },
      h('details', { class: 'form-panel' }, h('summary', { text: 'Prepare a promotion preview' }), prepareForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Change a normal individual outcome' }), entryForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Recommend exceptional progression' }), exceptionalForm),
      exceptionalDecisionForm ? h('details', { class: 'form-panel' }, h('summary', { text: 'Approve or reject exceptional progression' }), exceptionalDecisionForm) : null,
      h('details', { class: 'form-panel' }, h('summary', { text: 'Recommend Common Entrance candidacy' }), candidateForm),
      candidateDecisionForm ? h('details', { class: 'form-panel' }, h('summary', { text: 'Approve or cancel Common Entrance candidacy' }), candidateDecisionForm) : null,
      h('details', { class: 'form-panel' }, h('summary', { text: 'Update Common Entrance participation status' }), candidateStatusForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Confirm and apply a reviewed batch' }), applyForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Cancel a draft preview' }), cancelForm)
    ),
    h('h2', { class: 'subheading', text: 'Exceptional progression recommendations' }), table(['Pupil', 'Outcome', 'Target / label', 'Recommended by', 'Status', 'Decision by'], exceptionalRows, 'Exceptional progression recommendations') || emptyState('No exceptional progression recommendations', 'Use the recommendation form only when a pupil needs a truthful exception to the normal sequence.'),
    h('h2', { class: 'subheading', text: 'Common Entrance candidacy' }), table(['Pupil', 'Actual class', 'Exam session', 'Recommended by', 'Status', 'Decision by'], candidateRows, 'Common Entrance candidacy') || emptyState('No Common Entrance candidacy records', 'Candidacy remains separate from class placement.'),
    h('h2', { class: 'subheading', text: 'Promotion batches' }), table(['Class', 'From', 'To', 'Status', 'Prepared', 'Applied'], batchRows, 'Promotion batches') || emptyState('No promotion batches', 'Prepare one class at a time.'),
    h('h2', { class: 'subheading', text: 'Permanent enrolment history' }), table(['Pupil', 'Session', 'Class', 'Status', 'Started', 'Ended', 'Source'], historyRows, 'Permanent pupil enrolment history') || emptyState('No enrolment history', 'Initial cutover or admission creates the first history row.'));
}

function financeAdminView() {
  const schedules = state.data.feeSchedules || [];
  const scheduleMessage = formMessage();
  const scheduleForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!scheduleForm.reportValidity()) return;
    const submit = scheduleForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(scheduleForm);
    try {
      const { error } = await state.supabase.from('fee_schedules').insert({
        session_name: String(values.get('session_name')).trim(), term_name: String(values.get('term_name')).trim(),
        class_code: values.get('class_code'), title: String(values.get('title')).trim(), due_date: values.get('due_date') || null
      });
      if (error) throw error;
      setFormMessage(scheduleMessage, 'Draft fee schedule created. Add and reconcile every component before publication.'); scheduleForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(scheduleMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    h('div', { class: 'form-grid' }, textInput('session_name', 'Session', { maxlength: '40' }), textInput('term_name', 'Term', { maxlength: '40' })),
    selectInput('class_code', 'Class', SCHOOL_CLASSES, { placeholder: 'Choose a class' }), textInput('title', 'Invoice title', { maxlength: '160' }),
    textInput('due_date', 'Due date (optional)', { type: 'date', required: false }),
    scheduleMessage, primaryButton('Create draft schedule', { type: 'submit', icon: 'payments' })
  );
  const itemMessage = formMessage();
  const itemForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!itemForm.reportValidity()) return;
    const submit = itemForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(itemForm); const mode = values.get('billing_mode');
    try {
      const { error } = await state.supabase.from('fee_schedule_items').insert({
        schedule_id: values.get('schedule_id'), item_code: String(values.get('item_code')).trim().toUpperCase(),
        label: String(values.get('label')).trim(), charge_kind: values.get('charge_kind'), billing_mode: mode,
        amount: mode === 'separate' ? Number(values.get('amount')) : 0, required: values.get('required') === 'yes'
      });
      if (error) throw error;
      setFormMessage(itemMessage, mode === 'included' ? 'Included component recorded at zero separate charge.' : 'Separately billable component added.'); itemForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(itemMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('schedule_id', 'Draft schedule', schedules.filter((item) => item.publication_status === 'draft').map((item) => ({ value: item.id, label: `${item.class_code} · ${item.session_name} ${item.term_name}` })), { placeholder: 'Choose a draft schedule' }),
    h('div', { class: 'form-grid' }, textInput('item_code', 'Component code', { maxlength: '40', placeholder: 'TUITION' }), textInput('label', 'Component label', { maxlength: '160' })),
    selectInput('charge_kind', 'Charge kind', ['tuition', 'examination', 'materials', 'activity', 'meal', 'transport', 'other'].map((value) => ({ value, label: titleCase(value) }))),
    selectInput('billing_mode', 'Billing treatment', [{ value: 'included', label: 'Included in another charge — never bill again' }, { value: 'separate', label: 'Separate billable line' }, { value: 'not_applicable', label: 'Not applicable to this schedule' }]),
    textInput('amount', 'Separate amount (NGN; use 0 when included)', { type: 'number', min: '0', step: '0.01', inputmode: 'decimal' }),
    selectInput('required', 'Requirement', [{ value: 'yes', label: 'Required' }, { value: 'no', label: 'Optional' }]),
    alertBox('warning', 'Prevent double charging', 'Examination or materials described as included must use Included with amount 0. Only Separate items become invoice lines.'),
    itemMessage, primaryButton('Add schedule component', { type: 'submit', icon: 'payments', disabled: !schedules.some((item) => item.publication_status === 'draft') })
  );
  const feeItems = state.data.feeScheduleItems || [];
  const feeReconcileMessage = formMessage();
  const feeReconcileForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { const { error } = await state.supabase.from('legacy_fee_reconciliation').upsert({ source_id: String(values.get('source_id')).trim(), target_schedule_id: values.get('target_schedule_id') || null, target_item_id: values.get('target_item_id') || null, status: values.get('status'), note: String(values.get('note')).trim(), reviewed_by: state.profile.id, reviewed_at: new Date().toISOString() }, { onConflict: 'source_id' }); if (error) throw error; setFormMessage(feeReconcileMessage, values.get('status') === 'owner_verified' ? 'Preserved fee row mapped as owner verified. Review the schedule before publication.' : 'Preserved fee row reconciliation saved without publication.'); form.reset(); await refreshAfterMutation(); }
    catch { setFormMessage(feeReconcileMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, textInput('source_id', 'Preserved fee_structure row ID', { maxlength: '160' }), selectInput('target_schedule_id', 'Mapped schedule (optional)', schedules.map((item) => ({ value: item.id, label: `${item.class_code} · ${item.session_name} ${item.term_name}` })), { placeholder: 'No schedule selected', required: false }), selectInput('target_item_id', 'Mapped component (optional)', feeItems.map((item) => ({ value: item.id, label: `${item.item_code} — ${item.label}` })), { placeholder: 'No component selected', required: false }), selectInput('status', 'Reconciliation status', ['pending', 'mapped', 'owner_verified', 'excluded'].map((value) => ({ value, label: titleCase(value) }))), textInput('note', 'Required reconciliation note', { maxlength: '1000' }), alertBox('warning', 'Preserve all 10 former fee rows', 'A mapping records evidence only. It does not publish a former amount; the owner must verify inclusion treatment and every separate value first.'), feeReconcileMessage, primaryButton('Save preserved fee mapping', { type: 'submit', icon: 'audit' }));
  const issueMessage = formMessage();
  const issueForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!issueForm.reportValidity()) return;
    const submit = issueForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(issueForm); const schedule = schedules.find((item) => item.id === values.get('schedule_id'));
    try {
      const count = await rpcCall('create_invoices_for_fee_schedule', { p_schedule_id: schedule.id });
      setFormMessage(issueMessage, `${count} new pupil invoices issued. Existing invoices were not duplicated.`); await refreshAfterMutation();
    } catch { setFormMessage(issueMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('schedule_id', 'Reconciled schedule', schedules.filter((item) => item.publication_status !== 'retired').map((item) => ({ value: item.id, label: `${item.class_code} · ${item.session_name} ${item.term_name} · ${titleCase(item.publication_status)}` })), { placeholder: 'Choose a schedule' }),
    alertBox('warning', 'Publish and issue', 'Review all included/separate treatments first. This action issues service invoices with no cart quantity and never changes admission or access.'),
    issueMessage, primaryButton('Publish schedule and issue missing invoices', { type: 'submit', icon: 'publish', disabled: !schedules.length })
  );

  const cancellableInvoices = (state.data.pupilInvoices || []).filter((item) => ['draft', 'issued', 'part_paid'].includes(item.status) && Number(item.paid_amount) === 0 && !(state.data.pupilInvoiceItems || []).some((line) => line.invoice_id === item.id && line.source_type === 'transport'));
  const cancelInvoiceMessage = formMessage();
  const cancelInvoiceForm = h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form); try { await rpcCall('cancel_pupil_invoice', { p_invoice_id: values.get('invoice_id'), p_reason: String(values.get('reason')).trim() }); setFormMessage(cancelInvoiceMessage, 'Unpaid invoice cancelled with an immutable finance event.'); await refreshAfterMutation(); } catch { setFormMessage(cancelInvoiceMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, selectInput('invoice_id', 'Unpaid invoice', cancellableInvoices.map((item) => ({ value: item.id, label: `${item.invoice_reference} — ${nameForStudent(item.student_id)} — ${item.title}` })), { placeholder: cancellableInvoices.length ? 'Choose an invoice' : 'No cancellable invoices' }), textInput('reason', 'Cancellation reason', { maxlength: '1000' }), cancelInvoiceMessage, primaryButton('Cancel unpaid invoice', { type: 'submit', icon: 'shield', disabled: !cancellableInvoices.length }));
  const targetOptions = [
    ...(state.data.pupilInvoices || []).filter((item) => ['issued', 'part_paid'].includes(item.status)).map((item) => ({ value: `invoice:${item.id}`, label: `${item.invoice_reference} — ${nameForStudent(item.student_id)} — balance ${formatMoney(Number(item.total_amount) - Number(item.paid_amount))}` })),
    ...(state.data.shopOrders || []).filter((item) => ['awaiting_payment', 'payment_submitted'].includes(item.status)).map((item) => ({ value: `order:${item.id}`, label: `${item.order_reference} — ${nameForStudent(item.student_id)} — ${formatMoney(item.total_amount)}` }))
  ];
  const posMessage = formMessage();
  const posForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!posForm.reportValidity()) return;
    const submit = posForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(posForm); const [kind, id] = String(values.get('target')).split(':');
    try {
      const result = await rpcCall('record_physical_pos_payment', {
        p_invoice_id: kind === 'invoice' ? id : null, p_order_id: kind === 'order' ? id : null,
        p_amount: Number(values.get('amount')), p_payer_name: String(values.get('payer_name')).trim(),
        p_terminal_reference: String(values.get('terminal_reference')).trim(),
        p_paid_at: new Date(String(values.get('paid_at'))).toISOString(), p_note: String(values.get('note')).trim()
      });
      setFormMessage(posMessage, `Physical POS payment ${result.payment_reference} recorded for a separate office verification step. No receipt has been issued yet.`); posForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(posMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('target', 'Invoice or materials order', targetOptions, { placeholder: targetOptions.length ? 'Choose the office payment target' : 'No unpaid targets' }),
    h('div', { class: 'form-grid' }, textInput('amount', 'POS amount (NGN)', { type: 'number', min: '1', step: '0.01' }), textInput('paid_at', 'POS date and time', { type: 'datetime-local' })),
    textInput('payer_name', 'Payer name', { maxlength: '160' }), textInput('terminal_reference', 'Physical POS terminal reference', { maxlength: '160' }),
    textInput('note', 'POS recording note', { maxlength: '1000' }),
    alertBox('warning', 'Physical school POS only', 'Record only a transaction completed on the school’s physical office terminal. A separate authorised review issues the official receipt. The website never asks for card number, CVV, PIN or OTP.'),
    posMessage, primaryButton('Record office POS payment for review', { type: 'submit', icon: 'payments', disabled: !targetOptions.length })
  );

  const reviewable = (state.data.manualPayments || []).filter((item) => ['submitted', 'under_review'].includes(item.status));
  const reversiblePayments = (state.data.manualPayments || []).filter((item) => item.status === 'verified');
  const reviewMessage = formMessage();
  const reviewForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!reviewForm.reportValidity()) return;
    const submit = reviewForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(reviewForm);
    try {
      const receipt = await rpcCall('review_manual_payment', { p_payment_id: values.get('payment_id'), p_action: values.get('action'), p_note: String(values.get('note')).trim() });
      setFormMessage(reviewMessage, receipt ? `Payment verified. Official receipt ${receipt} issued.` : 'Payment review action recorded.'); await refreshAfterMutation();
    } catch { setFormMessage(reviewMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('payment_id', 'Manual payment record', reviewable.map((item) => ({ value: item.id, label: `${item.payment_reference} — ${titleCase(item.method)} — ${formatMoney(item.amount)} — ${titleCase(item.status)}` })), { placeholder: reviewable.length ? 'Choose a payment' : 'No payments awaiting action' }),
    selectInput('action', 'Review action', [
      { value: 'under_review', label: 'Mark under review' }, { value: 'verify', label: 'Verify against office evidence and issue receipt' }, { value: 'reject', label: 'Reject' }
    ], { placeholder: 'Choose an action' }),
    textInput('note', 'Review or reversal reason', { maxlength: '1000' }),
    alertBox('warning', 'Manual evidence check', 'Match the bank statement or physical POS record before verification. Only the Headmistress may reverse a verified payment.'),
    reviewMessage, primaryButton('Record payment decision', { type: 'submit', icon: 'shield', disabled: !reviewable.length })
  );

  const reversalMessage = formMessage();
  const reversalForm = state.profile.leadership_scope === 'headmistress' && (!state.profile.position_title || state.profile.position_title.toLowerCase() === 'headmistress') ? h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form); try { await rpcCall('review_manual_payment', { p_payment_id: values.get('payment_id'), p_action: 'reverse', p_note: String(values.get('reason')).trim() }); setFormMessage(reversalMessage, 'Verified payment and receipt reversed with the Headmistress audit reason.'); await refreshAfterMutation(); } catch { setFormMessage(reversalMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, selectInput('payment_id', 'Verified payment', reversiblePayments.map((item) => ({ value: item.id, label: `${item.payment_reference} — ${titleCase(item.method)} — ${formatMoney(item.amount)}` })), { placeholder: reversiblePayments.length ? 'Choose a verified payment' : 'No reversible payments' }), textInput('reason', 'Required reversal reason', { maxlength: '1000' }), alertBox('warning', 'Headmistress-only correction', 'Reversal marks the official receipt reversed and recalculates the invoice or materials-order state. It does not delete any finance event.'), reversalMessage, primaryButton('Reverse verified payment', { type: 'submit', icon: 'shield', disabled: !reversiblePayments.length })) : null;
  const bankMessage = formMessage();
  const bankForm = state.profile.leadership_scope === 'headmistress' ? h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      const { error } = await state.supabase.from('school_bank_accounts').insert({ bank_name: String(values.get('bank_name')).trim(), account_name: String(values.get('account_name')).trim(), account_number: String(values.get('account_number')).trim() });
      if (error) throw error; setFormMessage(bankMessage, 'Bank account saved inactive. Activate it only after owner verification.'); form.reset(); await refreshAfterMutation();
    } catch { setFormMessage(bankMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, textInput('bank_name', 'Bank name', { maxlength: '120' }), textInput('account_name', 'Account name', { maxlength: '160' }), textInput('account_number', '10-digit account number', { maxlength: '10', inputmode: 'numeric' }),
    bankMessage, primaryButton('Save inactive bank account', { type: 'submit', icon: 'shield' })) : null;
  const activateBankMessage = formMessage();
  const activateBankForm = state.profile.leadership_scope === 'headmistress' ? h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    try { await rpcCall('set_active_school_bank_account', { p_account_id: new FormData(form).get('account_id') }); setFormMessage(activateBankMessage, 'Approved parent-portal bank account changed.'); await refreshAfterMutation(); }
    catch { setFormMessage(activateBankMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('account_id', 'Owner-verified account', (state.data.bankAccounts || []).map((item) => ({ value: item.id, label: `${item.bank_name} · ${item.account_name} · ${item.account_number} ${item.active ? '(active)' : ''}` })), { placeholder: 'Choose an account' }),
    alertBox('warning', 'Portal and invoice only', 'Bank details are never published on the public website and must never be changed from a chat instruction alone.'), activateBankMessage, primaryButton('Make this the active bank account', { type: 'submit', icon: 'shield' })) : null;

  const disableBankMessage = formMessage();
  const disableBankForm = state.profile.leadership_scope === 'headmistress' && (state.data.bankAccounts || []).some((item) => item.active) ? h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; try { await rpcCall('disable_active_school_bank_account', { p_reason: String(new FormData(form).get('reason')).trim() }); setFormMessage(disableBankMessage, 'Active bank details disabled. Parents can no longer submit a new transfer notification until another account is approved.'); await refreshAfterMutation(); } catch { setFormMessage(disableBankMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, textInput('reason', 'Required deactivation reason', { maxlength: '1000' }), alertBox('warning', 'Fail closed', 'Use this when bank details must stop immediately. Existing payment and receipt audits remain unchanged.'), disableBankMessage, primaryButton('Disable active bank account', { type: 'submit', icon: 'shield' })) : null;

  const routeMessage = formMessage();
  const routeForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try {
      const verified = values.get('verification_status') === 'owner_verified';
      await rpcCall('reconcile_transport_service', { p_source_id: String(values.get('source_id')).trim(), p_route_code: String(values.get('route_code')).trim().toUpperCase(), p_route_name: String(values.get('route_name')).trim(), p_session_name: String(values.get('session_name')).trim(), p_term_name: String(values.get('term_name')).trim(), p_term_amount: values.get('term_amount') ? Number(values.get('term_amount')) : null, p_capacity: values.get('capacity') ? Number(values.get('capacity')) : null, p_status: values.get('verification_status'), p_note: String(values.get('note')).trim() });
      setFormMessage(routeMessage, verified ? 'Preserved transport route reconciled and activated atomically.' : 'Transport route saved inactive for owner review.'); form.reset(); await refreshAfterMutation();
    } catch { setFormMessage(routeMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } }, textInput('source_id', 'Preserved transport_routes row ID', { maxlength: '160' }), h('div', { class: 'form-grid' }, textInput('route_code', 'Route code', { maxlength: '60' }), textInput('route_name', 'Route name', { maxlength: '160' })),
    h('div', { class: 'form-grid' }, textInput('session_name', 'Session', { maxlength: '40' }), textInput('term_name', 'Term', { maxlength: '40' })), h('div', { class: 'form-grid' }, textInput('term_amount', 'Owner-verified term amount (required to activate)', { type: 'number', min: '1', step: '0.01', required: false }), textInput('capacity', 'Capacity (optional)', { type: 'number', min: '1', step: '1', required: false })),
    selectInput('verification_status', 'Reconciliation status', [{ value: 'pending', label: 'Pending owner review — keep inactive' }, { value: 'owner_verified', label: 'Owner verified — activate' }]), textInput('note', 'Reconciliation note', { maxlength: '1000' }), alertBox('warning', 'Preserve before publication', 'Reconcile each of the 3 former transport_routes rows. Do not publish an old fare or route until the owner verifies it.'), routeMessage, primaryButton('Save reconciled transport service', { type: 'submit', icon: 'audit' }));
  const transportOpen = (state.data.transportRequests || []).filter((item) => !['approved', 'declined', 'cancelled'].includes(item.status));
  const transportMessage = formMessage();
  const transportForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { const invoice = await rpcCall('review_transport_request', { p_request_id: values.get('request_id'), p_status: values.get('status'), p_service_id: values.get('service_id') || null, p_note: String(values.get('note')).trim() }); setFormMessage(transportMessage, invoice ? 'Transport approved within capacity and a non-stock service invoice was issued.' : 'Transport review recorded.'); await refreshAfterMutation(); }
    catch { setFormMessage(transportMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('request_id', 'Transport request', transportOpen.map((item) => ({ value: item.id, label: `${item.request_reference} — ${nameForStudent(item.student_id)} — ${item.general_area}` })), { placeholder: 'Choose an open request' }),
    selectInput('status', 'Decision', ['reviewing', 'approved', 'waitlisted', 'declined', 'cancelled'].map((value) => ({ value, label: titleCase(value) }))),
    selectInput('service_id', 'Verified route for approval', (state.data.transportServices || []).map((item) => ({ value: item.id, label: `${item.route_name} · ${item.session_name} ${item.term_name} · ${item.capacity == null ? 'capacity managed offline' : `${item.capacity - item.approved_count} places`}` })), { placeholder: 'Required only for approval', required: false }),
    textInput('note', 'Office decision note', { maxlength: '1000' }), transportMessage, primaryButton('Record transport decision', { type: 'submit', icon: 'inbox', disabled: !transportOpen.length }));

  const cancellableTransport = (state.data.transportRequests || []).filter((item) => item.status === 'approved' && (state.data.pupilInvoices || []).some((invoice) => invoice.id === item.invoice_id && Number(invoice.paid_amount) === 0));
  const cancelTransportMessage = formMessage();
  const cancelTransportForm = h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form); try { await rpcCall('cancel_transport_approval', { p_request_id: values.get('request_id'), p_reason: String(values.get('reason')).trim() }); setFormMessage(cancelTransportMessage, 'Unpaid transport approval cancelled, invoice cancelled and route capacity restored.'); await refreshAfterMutation(); } catch { setFormMessage(cancelTransportMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, selectInput('request_id', 'Approved unpaid transport request', cancellableTransport.map((item) => ({ value: item.id, label: `${item.request_reference} — ${nameForStudent(item.student_id)}` })), { placeholder: cancellableTransport.length ? 'Choose a request' : 'No cancellable approvals' }), textInput('reason', 'Cancellation reason', { maxlength: '1000' }), cancelTransportMessage, primaryButton('Cancel approval and restore capacity', { type: 'submit', icon: 'shield', disabled: !cancellableTransport.length }));

  const invoiceRows = (state.data.pupilInvoices || []).map((item) => [item.invoice_reference, nameForStudent(item.student_id), item.title, formatMoney(item.total_amount), formatMoney(item.paid_amount), badge(item.status)]);
  const paymentRows = (state.data.manualPayments || []).map((item) => [item.payment_reference, titleCase(item.method), formatMoney(item.amount), badge(item.status), item.external_reference || item.terminal_reference || '—', formatDate(item.created_at)]);
  const feeMappings = state.data.legacyFeeReconciliation || [];
  const routeMappings = state.data.legacyTransportReconciliation || [];
  const reconciliationRows = [
    ['fee_structure', 10, feeMappings.length, feeMappings.filter((item) => item.status === 'owner_verified').length, Math.max(10 - feeMappings.length, 0)],
    ['transport_routes', 3, routeMappings.length, routeMappings.filter((item) => item.status === 'owner_verified').length, Math.max(3 - routeMappings.length, 0)]
  ];
  return section('Bills & Payments', 'Service invoices, manual bank-transfer review and physical office POS records. No online card collection.',
    h('div', { class: 'details-grid' },
      h('details', { class: 'form-panel' }, h('summary', { text: 'Create a term fee schedule' }), scheduleForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Add included or separate charge components' }), itemForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Reconcile a preserved fee_structure row' }), feeReconcileForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Publish and issue term invoices' }), issueForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Cancel an unpaid invoice' }), cancelInvoiceForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Record a physical office POS payment' }), posForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Review a bank transfer or physical POS record' }), reviewForm),
      reversalForm ? h('details', { class: 'form-panel' }, h('summary', { text: 'Reverse a verified payment (Headmistress)' }), reversalForm) : null,
      h('details', { class: 'form-panel' }, h('summary', { text: 'Reconcile a preserved transport route' }), routeForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Review a transport request' }), transportForm),
      h('details', { class: 'form-panel' }, h('summary', { text: 'Cancel an unpaid transport approval' }), cancelTransportForm),
      bankForm ? h('details', { class: 'form-panel' }, h('summary', { text: 'Add owner-verified bank details' }), bankForm) : null,
      activateBankForm ? h('details', { class: 'form-panel' }, h('summary', { text: 'Activate approved bank details' }), activateBankForm) : null,
      disableBankForm ? h('details', { class: 'form-panel' }, h('summary', { text: 'Disable the active bank account' }), disableBankForm) : null
    ),
    h('h2', { class: 'subheading', text: 'Preserved finance and route reconciliation' }), table(['Former source', 'Expected', 'Mapped', 'Owner verified', 'Unmapped'], reconciliationRows, 'Preserved fee and transport reconciliation counts'),
    h('h2', { class: 'subheading', text: 'Issued invoices' }), table(['Invoice', 'Pupil', 'Title', 'Total', 'Paid', 'Status'], invoiceRows, 'Issued service invoices') || emptyState('No invoices', 'Publish a reconciled fee schedule or approve transport.'),
    h('h2', { class: 'subheading', text: 'Manual payment records' }), table(['Payment', 'Method', 'Amount', 'Status', 'External reference', 'Created'], paymentRows, 'Manual payment records') || emptyState('No manual payments', 'Bank notifications and office POS records appear here.'));
}

function inventoryAdminView() {
  const products = state.data.shopProducts || [];
  const variants = state.data.shopVariants || [];
  const productMessage = formMessage();
  const productForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { const { error } = await state.supabase.from('shop_products').insert({ product_code: String(values.get('product_code')).trim().toUpperCase(), name: String(values.get('name')).trim(), description: String(values.get('description') || '').trim() || null, category: values.get('category') }); if (error) throw error; setFormMessage(productMessage, 'Product created inactive for owner reconciliation.'); form.reset(); await refreshAfterMutation(); }
    catch { setFormMessage(productMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, textInput('product_code', 'Product code', { maxlength: '50' }), textInput('name', 'Product name', { maxlength: '160' }), selectInput('category', 'Category', ['uniform', 'books', 'stationery', 'bag', 'art', 'other'].map((value) => ({ value, label: titleCase(value) }))),
    controlField('Description (optional)', h('textarea', { name: 'description', maxlength: '1000', rows: '3' })), alertBox('info', 'Inactive until reconciled', 'Map preserved shop_items and uniform_items, verify the owner-approved value, then explicitly mark the product and its variant reconciled and active.'), productMessage, primaryButton('Create inactive product', { type: 'submit', icon: 'inbox' }));
  const variantMessage = formMessage();
  const variantForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { const classes = String(values.get('eligible_classes') || '').split(',').map((value) => value.trim()).filter(Boolean); if (classes.some((value) => !SCHOOL_CLASSES.includes(value))) throw new Error('class');
      const { error } = await state.supabase.from('shop_variants').insert({ product_id: values.get('product_id'), sku: String(values.get('sku')).trim().toUpperCase(), variant_label: String(values.get('variant_label')).trim(), size_label: String(values.get('size_label') || '').trim() || null, eligible_classes: classes, unit_price: values.get('unit_price') ? Number(values.get('unit_price')) : null, low_stock_threshold: Number(values.get('low_stock_threshold')) }); if (error) throw error; setFormMessage(variantMessage, 'Variant created with zero stock, inactive and unreconciled.'); form.reset(); await refreshAfterMutation(); }
    catch { setFormMessage(variantMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('product_id', 'Product', products.map((item) => ({ value: item.id, label: item.name })), { placeholder: 'Choose a product' }),
    h('div', { class: 'form-grid' }, textInput('sku', 'SKU', { maxlength: '60' }), textInput('variant_label', 'Variant label', { maxlength: '120' })),
    h('div', { class: 'form-grid' }, textInput('size_label', 'Size (optional)', { maxlength: '80', required: false }), textInput('unit_price', 'Verified unit price (optional)', { type: 'number', min: '1', step: '0.01', required: false })),
    textInput('eligible_classes', 'Eligible classes, comma separated (optional)', { maxlength: '500', required: false, hint: 'Use exact active class labels; never include Primary 5.' }), textInput('low_stock_threshold', 'Low-stock threshold', { type: 'number', min: '0', step: '1' }), variantMessage, primaryButton('Create inactive variant', { type: 'submit', icon: 'inbox', disabled: !products.length }));
  const verifyMessage = formMessage();
  const verifyForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try {
      const productId = values.get('product_id'); const variantId = values.get('variant_id');
      await rpcCall('verify_catalog_variant', { p_product_id: productId, p_variant_id: variantId, p_unit_price: Number(values.get('unit_price')), p_low_stock_threshold: Number(values.get('low_stock_threshold')) });
      setFormMessage(verifyMessage, 'Owner-verified product and variant activated. Price change was audit-recorded.'); await refreshAfterMutation();
    } catch { setFormMessage(verifyMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('product_id', 'Verified product', products.map((item) => ({ value: item.id, label: item.name })), { placeholder: 'Choose a product' }), selectInput('variant_id', 'Verified variant', variants.map((item) => ({ value: item.id, label: `${item.sku} — ${item.variant_label}` })), { placeholder: 'Choose its variant' }),
    textInput('unit_price', 'Owner-verified unit price', { type: 'number', min: '1', step: '0.01' }), textInput('low_stock_threshold', 'Low-stock threshold', { type: 'number', min: '0', step: '1' }),
    alertBox('warning', 'Verify before activation', 'Confirm the preserved source row, product identity, size/variant, class eligibility and current owner-approved price. Never copy an old price without review.'), verifyMessage, primaryButton('Verify and activate catalogue variant', { type: 'submit', icon: 'shield', disabled: !variants.length }));
  const catalogueStatusMessage = formMessage();
  const catalogueStatusForm = h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form); try { const activate = values.get('active') === 'yes'; await rpcCall('set_catalog_variant_active', { p_variant_id: values.get('variant_id'), p_active: activate, p_reason: String(values.get('reason')).trim() }); setFormMessage(catalogueStatusMessage, activate ? 'Reconciled variant activated with an audit event.' : 'Variant deactivated with an audit event.'); await refreshAfterMutation(); } catch { setFormMessage(catalogueStatusMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, selectInput('variant_id', 'Catalogue variant', variants.map((item) => ({ value: item.id, label: `${item.sku} — ${item.variant_label} — ${item.active ? 'active' : 'inactive'}` })), { placeholder: 'Choose a variant' }), selectInput('active', 'Availability status', [{ value: 'no', label: 'Inactive — hide from ordering' }, { value: 'yes', label: 'Active — only if reconciled and priced' }]), textInput('reason', 'Required status reason', { maxlength: '1000' }), catalogueStatusMessage, primaryButton('Save catalogue status', { type: 'submit', icon: 'shield', disabled: !variants.length }));
  const reconcileMessage = formMessage();
  const reconcileForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { const { error } = await state.supabase.from('legacy_catalog_reconciliation').upsert({ source_table: values.get('source_table'), source_id: String(values.get('source_id')).trim(), target_product_id: values.get('target_product_id') || null, target_variant_id: values.get('target_variant_id') || null, status: values.get('status'), note: String(values.get('note')).trim(), reviewed_by: state.profile.id, reviewed_at: new Date().toISOString() }, { onConflict: 'source_table,source_id' }); if (error) throw error; setFormMessage(reconcileMessage, 'Preserved catalogue mapping recorded without deleting the source record.'); form.reset(); await refreshAfterMutation(); }
    catch { setFormMessage(reconcileMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('source_table', 'Former source table', ['shop_items', 'uniform_items']), textInput('source_id', 'Preserved source row ID', { maxlength: '160' }), selectInput('target_product_id', 'Mapped product (optional)', products.map((item) => ({ value: item.id, label: item.name })), { placeholder: 'No product selected', required: false }), selectInput('target_variant_id', 'Mapped variant (optional)', variants.map((item) => ({ value: item.id, label: `${item.sku} — ${item.variant_label}` })), { placeholder: 'No variant selected', required: false }), selectInput('status', 'Reconciliation status', ['pending', 'mapped', 'owner_verified', 'excluded'].map((value) => ({ value, label: titleCase(value) }))), textInput('note', 'Required reconciliation note', { maxlength: '1000' }), reconcileMessage, primaryButton('Save preserved-row mapping', { type: 'submit', icon: 'audit' }));
  const adjustmentMessage = formMessage();
  const adjustmentForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { await rpcCall('record_inventory_adjustment', { p_variant_id: values.get('variant_id'), p_delta: Number(values.get('delta')), p_reason: String(values.get('reason')).trim(), p_kind: values.get('kind') }); setFormMessage(adjustmentMessage, 'Authoritative stock movement recorded with actor and reason.'); form.reset(); await refreshAfterMutation(); }
    catch { setFormMessage(adjustmentMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('variant_id', 'Variant', variants.map((item) => ({ value: item.id, label: `${products.find((product) => product.id === item.product_id)?.name || 'Item'} — ${item.variant_label} — ${item.on_hand} on hand / ${item.reserved} reserved` })), { placeholder: 'Choose a variant' }),
    selectInput('kind', 'Movement reason type', ['opening_balance', 'manual_adjustment'].map((value) => ({ value, label: titleCase(value) }))), textInput('delta', 'Quantity change (+ or −)', { type: 'number', step: '1' }), textInput('reason', 'Required audit reason', { maxlength: '1000' }),
    alertBox('warning', 'No browser stock edits', 'This audited function locks the variant and rejects any change that would put on-hand below reserved stock.'), adjustmentMessage, primaryButton('Record inventory movement', { type: 'submit', icon: 'shield', disabled: !variants.length }));
  const orders = state.data.shopOrders || [];
  const orderMessage = formMessage();
  const orderForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { await rpcCall('advance_shop_order', { p_order_id: values.get('order_id'), p_action: 'ready', p_note: String(values.get('note')).trim() }); setFormMessage(orderMessage, 'Paid order released to the selected handover route.'); await refreshAfterMutation(); }
    catch { setFormMessage(orderMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('order_id', 'Paid preparing order', orders.filter((item) => item.status === 'paid_preparing').map((item) => ({ value: item.id, label: `${item.order_reference} — ${nameForStudent(item.student_id)} — ${titleCase(item.collection_method)}` })), { placeholder: 'Choose a paid preparing order' }),
    textInput('note', 'Release note', { maxlength: '1000' }), orderMessage, primaryButton('Release paid order', { type: 'submit', icon: 'inbox', disabled: !orders.some((item) => item.status === 'paid_preparing') }));
  const fulfilOrderMessage = formMessage();
  const fulfilOrderForm = h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form); try { await rpcCall('advance_shop_order', { p_order_id: values.get('order_id'), p_action: 'fulfil', p_note: String(values.get('note')).trim() }); setFormMessage(fulfilOrderMessage, 'Parent or guardian office collection recorded and inventory fulfilled.'); await refreshAfterMutation(); } catch { setFormMessage(fulfilOrderMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, selectInput('order_id', 'Ready office-collection order', orders.filter((item) => item.status === 'ready_for_office').map((item) => ({ value: item.id, label: `${item.order_reference} — ${nameForStudent(item.student_id)}` })), { placeholder: 'Choose an office-collection order' }), textInput('note', 'Collection handover note', { maxlength: '1000' }), fulfilOrderMessage, primaryButton('Confirm office collection', { type: 'submit', icon: 'shield', disabled: !orders.some((item) => item.status === 'ready_for_office') }));
  const unpaidOrders = orders.filter((item) => ['awaiting_payment', 'payment_submitted', 'payment_reversed'].includes(item.status));
  const cancelOrderMessage = formMessage();
  const cancelOrderForm = h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form); try { await rpcCall('cancel_shop_order', { p_order_id: values.get('order_id'), p_reason: String(values.get('reason')).trim() }); setFormMessage(cancelOrderMessage, 'Unfulfilled order cancelled and all reservations released atomically.'); await refreshAfterMutation(); } catch { setFormMessage(cancelOrderMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, selectInput('order_id', 'Unfulfilled unpaid order', unpaidOrders.map((item) => ({ value: item.id, label: `${item.order_reference} — ${titleCase(item.status)}` })), { placeholder: unpaidOrders.length ? 'Choose an order' : 'No cancellable orders' }), textInput('reason', 'Cancellation reason', { maxlength: '1000' }), cancelOrderMessage, primaryButton('Cancel order and release stock', { type: 'submit', icon: 'shield', disabled: !unpaidOrders.length }));
  const expiryMessage = formMessage();
  const expiryForm = h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); const submit = event.currentTarget.querySelector('[type=submit]'); submit.disabled = true; try { const count = await rpcCall('release_expired_shop_reservations'); setFormMessage(expiryMessage, `${count} expired unpaid reservations released.`); await refreshAfterMutation(); } catch { setFormMessage(expiryMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, alertBox('info', 'Expired reservations only', 'This checks server timestamps and releases only unpaid orders whose reservation deadline has passed.'), expiryMessage, primaryButton('Release expired reservations', { type: 'submit', icon: 'audit' }));
  const restockOpen = (state.data.restockRequests || []).filter((item) => !['closed', 'cancelled', 'parent_confirmed'].includes(item.status));
  const restockMessage = formMessage();
  const restockForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { await rpcCall('review_restock_request', { p_request_id: values.get('request_id'), p_status: values.get('status'), p_note: String(values.get('note')).trim() }); setFormMessage(restockMessage, 'Procurement demand status recorded; parent notified when marked available.'); await refreshAfterMutation(); }
    catch { setFormMessage(restockMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('request_id', 'Restock request', restockOpen.map((item) => ({ value: item.id, label: `${products.find((product) => product.id === item.product_id)?.name || 'Item'} — ${item.variant_label || 'any variant'} × ${item.requested_quantity}` })), { placeholder: 'Choose a demand request' }),
    selectInput('status', 'Procurement status', ['reviewing', 'procurement_planned', 'available', 'closed', 'cancelled'].map((value) => ({ value, label: titleCase(value) }))), textInput('note', 'Office note', { maxlength: '1000' }), restockMessage, primaryButton('Update demand workflow', { type: 'submit', icon: 'inbox', disabled: !restockOpen.length }));
  const returnOpen = (state.data.returnRequests || []).filter((item) => !['completed', 'declined', 'cancelled'].includes(item.status));
  const returnMessage = formMessage();
  const returnForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { await rpcCall('complete_return_exchange', { p_request_id: values.get('request_id'), p_action: values.get('action'), p_inspection_result: values.get('inspection_result'), p_monetary_adjustment: Number(values.get('monetary_adjustment') || 0), p_note: String(values.get('note')).trim() }); setFormMessage(returnMessage, 'Inspection, stock movement and any authorised monetary adjustment were audit-recorded.'); await refreshAfterMutation(); }
    catch { setFormMessage(returnMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('request_id', 'Return or exchange request', returnOpen.map((item) => ({ value: item.id, label: `${item.request_reference} — ${titleCase(item.request_kind)} × ${item.requested_quantity}` })), { placeholder: 'Choose a request' }),
    selectInput('action', 'Decision', [{ value: 'complete', label: 'Complete after inspection' }, { value: 'decline', label: 'Decline with reason' }]), selectInput('inspection_result', 'Inspection result', ['resellable', 'damaged', 'not_returned', 'not_eligible'].map((value) => ({ value, label: titleCase(value) }))),
    textInput('monetary_adjustment', 'Price/refund adjustment (NGN; Headmistress only if non-zero)', { type: 'number', step: '0.01', required: false }), textInput('note', 'Inspection and decision note', { maxlength: '1000' }),
    alertBox('warning', 'Inspect first', 'Resellable items return to available stock; damaged items move to damaged stock. Exchange stock moves authoritatively. A non-zero monetary adjustment requires the Headmistress.'), returnMessage, primaryButton('Record inspected outcome', { type: 'submit', icon: 'shield', disabled: !returnOpen.length }));
  const procurementMessage = formMessage();
  const procurementForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { await rpcCall('create_procurement_batch', { p_reference: String(values.get('reference')).trim(), p_variant_id: values.get('variant_id'), p_ordered_quantity: Number(values.get('ordered_quantity')), p_unit_cost: values.get('unit_cost') ? Number(values.get('unit_cost')) : null, p_supplier_note: String(values.get('supplier_note') || '').trim() || null });
      setFormMessage(procurementMessage, 'Procurement batch and ordered variant recorded atomically.'); form.reset(); await refreshAfterMutation();
    } catch { setFormMessage(procurementMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, textInput('reference', 'Procurement reference', { maxlength: '160' }), selectInput('variant_id', 'Variant to procure', variants.map((item) => ({ value: item.id, label: `${item.sku} — ${item.variant_label}` })), { placeholder: 'Choose a variant' }), h('div', { class: 'form-grid' }, textInput('ordered_quantity', 'Ordered quantity', { type: 'number', min: '1', step: '1' }), textInput('unit_cost', 'Unit cost (optional)', { type: 'number', min: '0', step: '0.01', required: false })), textInput('supplier_note', 'Supplier note (optional)', { maxlength: '1000', required: false }), procurementMessage, primaryButton('Record procurement order', { type: 'submit', icon: 'inbox', disabled: !variants.length }));
  const openProcurementBatches = (state.data.procurementBatches || []).filter((batch) => ['draft', 'ordered'].includes(batch.status));
  const procurementLineMessage = formMessage();
  const procurementLineForm = h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form); try { await rpcCall('add_procurement_line', { p_batch_id: values.get('batch_id'), p_variant_id: values.get('variant_id'), p_ordered_quantity: Number(values.get('ordered_quantity')), p_unit_cost: values.get('unit_cost') ? Number(values.get('unit_cost')) : null }); setFormMessage(procurementLineMessage, 'Additional procurement line recorded.'); form.reset(); await refreshAfterMutation(); } catch { setFormMessage(procurementLineMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, selectInput('batch_id', 'Open procurement batch', openProcurementBatches.map((item) => ({ value: item.id, label: item.reference })), { placeholder: openProcurementBatches.length ? 'Choose a batch' : 'No open batches' }), selectInput('variant_id', 'Additional variant', variants.map((item) => ({ value: item.id, label: `${item.sku} — ${item.variant_label}` })), { placeholder: 'Choose a variant' }), h('div', { class: 'form-grid' }, textInput('ordered_quantity', 'Ordered quantity', { type: 'number', min: '1', step: '1' }), textInput('unit_cost', 'Unit cost (optional)', { type: 'number', min: '0', step: '0.01', required: false })), procurementLineMessage, primaryButton('Add procurement line', { type: 'submit', icon: 'inbox', disabled: !openProcurementBatches.length || !variants.length }));
  const cancelProcurementMessage = formMessage();
  const cancelProcurementForm = h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form); try { await rpcCall('cancel_procurement_batch', { p_batch_id: values.get('batch_id'), p_reason: String(values.get('reason')).trim() }); setFormMessage(cancelProcurementMessage, 'Unreceived procurement batch cancelled.'); await refreshAfterMutation(); } catch { setFormMessage(cancelProcurementMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, selectInput('batch_id', 'Unreceived procurement batch', openProcurementBatches.map((item) => ({ value: item.id, label: item.reference })), { placeholder: openProcurementBatches.length ? 'Choose a batch' : 'No cancellable batches' }), textInput('reason', 'Cancellation reason', { maxlength: '1000' }), cancelProcurementMessage, primaryButton('Cancel procurement batch', { type: 'submit', icon: 'shield', disabled: !openProcurementBatches.length }));
  const receivable = (state.data.procurementLines || []).filter((line) => Number(line.received_quantity) < Number(line.ordered_quantity) && (state.data.procurementBatches || []).some((batch) => batch.id === line.batch_id && ['ordered', 'part_received'].includes(batch.status)));
  const receiptMessage = formMessage();
  const receiptForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { await rpcCall('receive_procurement_line', { p_line_id: values.get('line_id'), p_quantity: Number(values.get('quantity')), p_note: String(values.get('note')).trim() }); setFormMessage(receiptMessage, 'Received stock moved authoritatively and matching demand requests were notified.'); await refreshAfterMutation(); }
    catch { setFormMessage(receiptMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('line_id', 'Outstanding procurement line', receivable.map((line) => ({ value: line.id, label: `${variants.find((variant) => variant.id === line.variant_id)?.sku || 'Variant'} — ${Number(line.ordered_quantity) - Number(line.received_quantity)} outstanding` })), { placeholder: 'Choose a line' }), textInput('quantity', 'Quantity received now', { type: 'number', min: '1', step: '1' }), textInput('note', 'Goods-received note', { maxlength: '1000' }), receiptMessage, primaryButton('Receive stock', { type: 'submit', icon: 'inbox', disabled: !receivable.length }));
  const stocktakeMessage = formMessage();
  const stocktakeForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form);
    try { const id = await rpcCall('open_stocktake', { p_reference: String(values.get('reference')).trim(), p_note: String(values.get('note') || '').trim() || null }); setFormMessage(stocktakeMessage, `Stocktake ${id} opened with expected balances for every active variant.`); form.reset(); await refreshAfterMutation(); }
    catch { setFormMessage(stocktakeMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, textInput('reference', 'Stocktake reference', { maxlength: '160' }), textInput('note', 'Scope note (optional)', { maxlength: '1000', required: false }), stocktakeMessage, primaryButton('Open full stocktake', { type: 'submit', icon: 'audit' }));
  const openStocktakes = state.data.stocktakes || [];
  const countMessage = formMessage();
  const countForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form); const [stocktakeId, variantId] = String(values.get('line')).split(':');
    try { const { error } = await state.supabase.from('stocktake_lines').update({ actual_on_hand: Number(values.get('actual_on_hand')), note: String(values.get('note') || '').trim() || null }).eq('stocktake_id', stocktakeId).eq('variant_id', variantId); if (error) throw error; setFormMessage(countMessage, 'Physical count saved.'); await refreshAfterMutation(); }
    catch { setFormMessage(countMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('line', 'Open stocktake line', (state.data.stocktakeLines || []).filter((line) => openStocktakes.some((item) => item.id === line.stocktake_id && item.status === 'open')).map((line) => ({ value: `${line.stocktake_id}:${line.variant_id}`, label: `${openStocktakes.find((item) => item.id === line.stocktake_id)?.reference || 'Stocktake'} — ${variants.find((item) => item.id === line.variant_id)?.sku || 'Variant'} — expected ${line.expected_on_hand}` })), { placeholder: 'Choose a line' }), textInput('actual_on_hand', 'Physical count', { type: 'number', min: '0', step: '1' }), textInput('note', 'Count note (optional)', { maxlength: '500', required: false }), countMessage, primaryButton('Save physical count', { type: 'submit', icon: 'audit' }));
  const closeMessage = formMessage();
  const closeForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    try { const count = await rpcCall('close_stocktake', { p_stocktake_id: new FormData(form).get('stocktake_id') }); setFormMessage(closeMessage, `${count} stock differences posted as immutable movements.`); await refreshAfterMutation(); }
    catch { setFormMessage(closeMessage, friendlyError(), true); } finally { submit.disabled = false; }
  } }, selectInput('stocktake_id', 'Completed open stocktake', openStocktakes.filter((item) => item.status === 'open').map((item) => ({ value: item.id, label: item.reference })), { placeholder: 'Choose a stocktake' }), alertBox('warning', 'Atomic close', 'Every line needs a physical count. Closing rejects counts below reserved stock and records each difference with actor and reason.'), closeMessage, primaryButton('Close stocktake and post differences', { type: 'submit', icon: 'shield' }));
  const cancelStocktakeMessage = formMessage();
  const cancelStocktakeForm = h('form', { class: 'data-form', onSubmit: async (event) => { event.preventDefault(); if (!event.currentTarget.reportValidity()) return; const form = event.currentTarget; const submit = form.querySelector('[type=submit]'); submit.disabled = true; const values = new FormData(form); try { await rpcCall('cancel_stocktake', { p_stocktake_id: values.get('stocktake_id'), p_reason: String(values.get('reason')).trim() }); setFormMessage(cancelStocktakeMessage, 'Open stocktake cancelled without posting stock movements.'); await refreshAfterMutation(); } catch { setFormMessage(cancelStocktakeMessage, friendlyError(), true); } finally { submit.disabled = false; } } }, selectInput('stocktake_id', 'Open stocktake', openStocktakes.filter((item) => item.status === 'open').map((item) => ({ value: item.id, label: item.reference })), { placeholder: 'Choose an open stocktake' }), textInput('reason', 'Cancellation reason', { maxlength: '1000' }), cancelStocktakeMessage, primaryButton('Cancel stocktake', { type: 'submit', icon: 'shield', disabled: !openStocktakes.some((item) => item.status === 'open') }));
  const movementRows = [...(state.data.inventoryMovements || [])].reverse().slice(0, 100).map((item) => [formatDate(item.created_at), variants.find((variant) => variant.id === item.variant_id)?.sku || 'Variant', titleCase(item.movement_kind), item.on_hand_delta, item.reserved_delta, item.damaged_delta, item.resulting_on_hand, item.reason]);
  const lowRows = (state.data.lowStock || []).map((item) => [item.product_name, item.variant_label, item.sku, item.on_hand, item.reserved, item.available, item.low_stock_threshold]);
  const catalogueStatusRows = [...(state.data.catalogStatusEvents || [])].reverse().slice(0, 100).map((item) => [formatDate(item.created_at), products.find((product) => product.id === item.product_id)?.name || 'Product', variants.find((variant) => variant.id === item.variant_id)?.sku || 'Variant', item.previous_active == null ? 'New' : item.previous_active ? 'Active' : 'Inactive', item.new_active ? 'Active' : 'Inactive', nameForProfile(item.actor_id), item.reason]);
  const expectedLegacyCounts = { shop_items: 25, uniform_items: 8 };
  const legacyCounts = ['shop_items', 'uniform_items'].map((source) => { const rows = (state.data.legacyReconciliation || []).filter((item) => item.source_table === source); const expected = expectedLegacyCounts[source]; return [source, expected, rows.length, rows.filter((item) => item.status === 'owner_verified').length, Math.max(expected - rows.length, 0), rows.length === expected ? 'Row count reconciled' : 'Incomplete — do not activate remaining values']; });
  const publicInventoryRows = variants.filter((variant) => variant.reconciled === true).flatMap((variant) => {
    const product = products.find((item) => item.id === variant.product_id);
    if (!product || product.reconciled !== true) return [];
    const available = Math.max(Number(variant.on_hand) - Number(variant.reserved) - Number(variant.damaged), 0);
    const coarseState = product.active !== true ? 'Not currently offered' : variant.active !== true ? 'Temporarily unavailable' : available === 0 ? 'Out of stock' : available <= Number(variant.low_stock_threshold) ? 'Low stock' : 'In stock';
    return [[product.name, variant.variant_label, variant.sku, coarseState, (variant.eligible_classes || []).join(', ') || 'General']];
  });
  return section('Inventory & Orders', 'Variant stock, immutable movements, demand, procurement, fulfilment, returns and exchanges.',
    alertBox(state.features.publicInventory ? 'info' : 'warning', state.features.publicInventory ? 'Public coarse availability is active' : 'Public inventory gate is closed', state.features.publicInventory ? 'Only both reconciled product/variant pairs appear publicly. The public service derives a coarse availability label from office-confirmed balances and never exposes quantity, movement, actor or price fields.' : 'No product is exposed by the Run 10 public inventory service. Reconcile records and balances here first; gate activation remains a separate accepted release decision.'),
    h('div', { class: 'details-grid' }, h('details', { class: 'form-panel' }, h('summary', { text: 'Create an inactive product' }), productForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Create an inactive size or variant' }), variantForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Map a preserved shop or uniform row' }), reconcileForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Verify and activate a product variant' }), verifyForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Activate or deactivate a catalogue variant' }), catalogueStatusForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Record a manual stock adjustment' }), adjustmentForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Release a paid order to its handover route' }), orderForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Confirm parent or guardian office collection' }), fulfilOrderForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Cancel an unpaid order and release stock' }), cancelOrderForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Release expired unpaid reservations' }), expiryForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Review out-of-stock demand' }), restockForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Inspect a return or exchange' }), returnForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Create a procurement batch' }), procurementForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Add a procurement line' }), procurementLineForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Receive procured stock' }), receiptForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Cancel an unreceived procurement batch' }), cancelProcurementForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Open a full stocktake' }), stocktakeForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Record a physical stocktake count' }), countForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Close a counted stocktake' }), closeForm), h('details', { class: 'form-panel' }, h('summary', { text: 'Cancel an open stocktake' }), cancelStocktakeForm)),
    h('h2', { class: 'subheading', text: 'Public coarse-availability preview' }), table(['Product', 'Variant', 'SKU', 'Public state', 'Eligible classes'], publicInventoryRows, 'Public coarse inventory availability preview') || emptyState('No reconciled public availability candidates', 'A product and its variant must both be office-reconciled before they can appear. The public gate is controlled separately.'),
    h('h2', { class: 'subheading', text: 'Low-stock alerts' }), table(['Product', 'Variant', 'SKU', 'On hand', 'Reserved', 'Available', 'Threshold'], lowRows, 'Low-stock inventory alerts') || emptyState('No low-stock alerts', 'Active reconciled variants appear here at or below their threshold.'),
    h('h2', { class: 'subheading', text: 'Preserved catalogue reconciliation' }), table(['Former source', 'Expected', 'Mapped', 'Owner verified', 'Unmapped', 'Control status'], legacyCounts, 'Legacy catalogue reconciliation counts'),
    h('h2', { class: 'subheading', text: 'Catalogue status audit' }), table(['Date', 'Product', 'Variant', 'From', 'To', 'Actor', 'Reason'], catalogueStatusRows, 'Catalogue activation audit') || emptyState('No catalogue status events', 'Verification, activation and deactivation events appear here.'),
    h('h2', { class: 'subheading', text: 'Recent immutable inventory movements' }), table(['Date', 'SKU', 'Movement', 'On hand Δ', 'Reserved Δ', 'Damaged Δ', 'On hand after', 'Reason'], movementRows, 'Immutable inventory movement ledger') || emptyState('No inventory movements', 'Opening balance, purchase, reservation, fulfilment, stocktake and return movements appear here.'));
}

function auditView() {
  const accountRows = [...state.data.accountAudit].reverse().map((item) => [formatDate(item.created_at), titleCase(item.action), nameForProfile(item.target_profile_id), nameForProfile(item.actor_id), titleCase(item.reason_code || 'not recorded')]);
  const admissionRows = [...state.data.admissionAudit].reverse().map((item) => [formatDate(item.created_at), nameForStudent(item.student_id), titleCase(item.previous_status || 'new'), titleCase(item.new_status), nameForProfile(item.actor_id)]);
  const paymentRows = [...state.data.paymentAudit].reverse().map((item) => [formatDate(item.created_at), item.action, titleCase(item.previous_status || 'new'), titleCase(item.new_status), nameForProfile(item.actor_id)]);
  const webhookRows = [...state.data.webhooks].reverse().map((item) => [formatDate(item.received_at), badge(item.outcome), item.reason ? titleCase(item.reason) : '—']);
  const resultRows = [...state.data.resultAudit].reverse().map((item) => {
    const grade = gradeForId(item.grade_id);
    return [formatDate(item.created_at), grade ? `${nameForStudent(grade.student_id)} — ${grade.subject}` : 'Former result', titleCase(item.previous_status || 'new'), titleCase(item.new_status), nameForProfile(item.actor_id)];
  });
  const requestRows = [...state.data.requestAudit].reverse().map((item) => [formatDate(item.created_at), state.data.websiteRequests.find((request) => request.id === item.request_id)?.request_reference || 'Restricted request', titleCase(item.action), titleCase(item.new_status || 'unchanged'), nameForProfile(item.actor_id)]);
  const publicationRows = [...state.data.publicInformationAudit].reverse().map((item) => [formatDate(item.created_at), item.revision, titleCase(item.previous_status || 'new'), titleCase(item.new_status), nameForProfile(item.actor_id)]);
  const leadershipRows = [...state.data.leadershipAudit].reverse().map((item) => [formatDate(item.created_at), titleCase(item.action), titleCase(item.previous_status || 'new'), titleCase(item.new_status), nameForProfile(item.actor_id)]);
  return section('Audit', 'Append-only records support review without exposing passwords, tracking codes, private verification evidence, webhook payloads or bank account details.',
    h('h2', { class: 'subheading', text: 'Result workflow' }),
    table(['Date', 'Result', 'From', 'To', 'Actor'], resultRows, 'Result workflow audit') || emptyState('No result workflow actions', 'Submission, review, return, approval and publication will be recorded here.'),
    h('h2', { class: 'subheading', text: 'Website requests' }),
    table(['Date', 'Reference', 'Action', 'Status', 'Actor'], requestRows, 'Website request audit') || emptyState('No request actions', 'Request creation and status changes will be recorded here.'),
    h('h2', { class: 'subheading', text: 'Public information' }),
    table(['Date', 'Revision', 'From', 'To', 'Actor'], publicationRows, 'Public information audit') || emptyState('No publication actions', 'Draft and publication decisions will be recorded here.'),
    state.profile.leadership_scope === 'headmistress' ? h('h2', { class: 'subheading', text: 'Protected leadership sections' }) : null,
    state.profile.leadership_scope === 'headmistress' ? (table(['Date', 'Action', 'From', 'To', 'Actor'], leadershipRows, 'Protected leadership audit') || emptyState('No leadership section actions', 'Headmistress-only section changes will appear here.')) : null,
    h('h2', { class: 'subheading', text: 'Account actions' }),
    table(['Date', 'Action', 'Account', 'Actor', 'Reason category'], accountRows, 'Account audit log') || emptyState('No account actions', 'Provisioning, password resets, status changes and caregiver links will be recorded here.'),
    h('h2', { class: 'subheading', text: 'Admission decisions' }),
    table(['Date', 'Pupil', 'From', 'To', 'Actor'], admissionRows, 'Admission audit log') || emptyState('No admission changes', 'Status changes will be recorded here.'),
    h('h2', { class: 'subheading', text: 'Payment status changes' }),
    table(['Date', 'Action', 'From', 'To', 'Actor'], paymentRows, 'Payment audit log') || emptyState('No payment changes', 'Verified status changes will be recorded here.'),
    state.features.office ? h('h2', { class: 'subheading', text: 'Manual finance events' }) : null,
    state.features.office ? (table(['Date', 'Event', 'Actor', 'Payment / invoice / order'], [...(state.data.financeEvents || [])].reverse().map((item) => [formatDate(item.created_at), titleCase(item.event_type), nameForProfile(item.actor_id), item.payment_id || item.invoice_id || item.order_id || '—']), 'Manual finance audit events') || emptyState('No finance events', 'Invoice, bank review, physical POS, receipt and reversal events will appear here.')) : null
  );
}

function currentView() {
  if (state.tab === 'overview') return roleOverview();
  if (state.tab === 'children') return childrenView();
  if (state.tab === 'add-child') return addChildView();
  if (state.tab === 'classes') return assignedClassesView();
  if (state.tab === 'attendance') return attendanceView();
  if (state.tab === 'homework') return homeworkView();
  if (state.tab === 'results') return resultsView();
  if (state.tab === 'payments') return paymentsView();
  if (state.tab === 'fees-hub' && state.features.office) return feesHubView();
  if (state.tab === 'graduates' && state.features.office) return graduatesView();
  if (state.tab === 'distributions' && state.features.office) return teacherDistributionView();
  if (state.tab === 'enrolment' && state.features.office) return enrolmentAdminView();
  if (state.tab === 'finance' && state.features.office) return financeAdminView();
  if (state.tab === 'inventory' && state.features.office) return inventoryAdminView();
  if (state.tab === 'students') return studentsAdminView();
  if (state.tab === 'people' && state.profile.leadership_scope === 'headmistress') return peopleView();
  if (state.tab === 'operations') return operationsView();
  if (state.tab === 'requests') return registerRequestView();
  if (state.tab === 'public-info') return publicInformationView();
  if (state.tab === 'staff') return staffInformationView();
  if (state.tab === 'leadership' && state.profile.leadership_scope === 'headmistress') return leadershipView();
  if (state.tab === 'audit') return auditView();
  if (state.tab === 'website-cms' && canUseCms(state.cms)) return cmsModule.renderCmsWorkspace({
    state,
    rpc: rpcCall,
    refresh: async (message) => { pendingMutationMessage = message; await refreshAfterMutation(); },
    rerender: renderAuthenticated,
    setStatus
  });
  return roleOverview();
}

function renderAuthenticated() {
  const workspace = h('div', { class: 'portal-shell' },
    h('aside', { class: 'portal-sidebar' },
      h('div', { class: 'profile-summary' }, h('div', { class: 'avatar', 'aria-hidden': 'true', text: state.profile.full_name.charAt(0).toUpperCase() }), h('div', {}, h('strong', { text: state.profile.full_name }), h('span', { text: state.profile.position_title || (state.profile.leadership_scope && state.profile.leadership_scope !== 'none' ? titleCase(state.profile.leadership_scope) : `${titleCase(state.profile.role)} account`) }))),
      portalNavigation(),
      h('button', { type: 'button', class: 'sign-out', onClick: async () => { await state.supabase.auth.signOut({ scope: 'local' }); } }, icon('lock'), h('span', { text: 'Sign out' }))
    ),
    h('main', { class: 'portal-workspace', 'aria-labelledby': 'workspace-title' },
      h('h1', { id: 'workspace-title', class: 'sr-only', tabindex: '-1', text: `${titleCase(state.tab)} workspace` }),
      currentView()
    )
  );
  replace(app, workspace);
}

async function refreshAfterMutation() {
  const successMessage = pendingMutationMessage;
  pendingMutationMessage = '';
  await loadPortalData();
  renderAuthenticated();
  setStatus(successMessage || 'Portal records refreshed.');
}

async function start() {
  configureTheme();
  try {
    const response = await fetch('/api/portal-config', { headers: { Accept: 'application/json' }, cache: 'no-store' });
    if (!response.ok) throw new Error('Config request failed');
    const config = await response.json();
    if (!config.enabled || !config.url || !config.publishableKey) {
      renderMaintenance();
      return;
    }
    state.features.registration = config.registrationEnabled === true;
    state.features.accountClaim = config.accountClaimEnabled === true;
    state.features.office = config.officeEnabled === true;
    state.features.cms = config.cmsEnabled === true;
    state.features.media = config.mediaEnabled === true;
    state.features.engagement = config.publicEngagementEnabled === true;
    state.features.comments = config.commentsEnabled === true;
    state.features.placements = config.placementsEnabled === true;
    state.features.publicSearch = config.publicSearchEnabled === true;
    state.features.coreSlots = config.coreSlotsEnabled === true;
    state.features.publicInventory = config.publicInventoryEnabled === true;
    if (state.features.cms) {
      try { await loadCmsBundle(); }
      catch { state.features.cms = false; }
    }

    state.supabase = createClient(config.url, config.publishableKey, {
      auth: {
        storage: window.sessionStorage,
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      },
      global: { headers: { 'X-Client-Info': 'treasure-academy-portal/1.0' } }
    });

    let authReady = false;
    let lastUserId = null;
    state.supabase.auth.onAuthStateChange((event, session) => {
      if (!authReady || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
      const userId = session?.user?.id || null;
      if (state.loading && userId === lastUserId) return;
      lastUserId = userId;
      queueMicrotask(() => establishSession(session));
    });
    const { data, error } = await state.supabase.auth.getSession();
    if (error) throw error;
    lastUserId = data.session?.user?.id || null;
    await establishSession(data.session);
    authReady = true;
  } catch {
    replace(app, h('section', { class: 'loading-card', 'aria-labelledby': 'portal-error-title' },
      h('h1', { id: 'portal-error-title', text: 'Portal temporarily unavailable' }),
      alertBox('error', 'Secure service not reached', 'No information was submitted. Try again later or contact the school.'),
      h('a', { class: 'button', href: '/contact', text: 'Open contact information' })
    ));
    setStatus('Portal temporarily unavailable.', true);
  }
}

start();
