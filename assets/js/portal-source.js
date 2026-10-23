import { createClient } from '@supabase/supabase-js';

const WHATSAPP_NUMBER = '2349063932487';
const app = document.querySelector('#portal-app');
const bootStatus = document.querySelector('#portal-status');
const themeToggle = document.querySelector('#theme-toggle');

const state = {
  supabase: null,
  user: null,
  profile: null,
  data: {},
  tab: 'overview',
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

function formMessage() {
  return h('div', { class: 'form-message', 'aria-live': 'polite' });
}

function setFormMessage(node, message, error = false) {
  node.textContent = message;
  node.className = `form-message ${error ? 'form-message--error' : 'form-message--success'}`;
  node.setAttribute('role', error ? 'alert' : 'status');
  if (error) node.focus?.();
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
          h('a', { class: 'button', href: '/index.html' }, h('span', { text: 'Return to website' })),
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
    h('p', { class: 'field__hint', text: 'Use only the account issued by Treasure Academy. There is no public sign-up and no pupil login.' }),
    message,
    submit
  );

  replace(app,
    h('div', { class: 'auth-layout' },
      h('section', { class: 'auth-card', 'aria-labelledby': 'login-title' },
        h('p', { class: 'eyebrow', text: 'Parent & staff portal' }),
        h('h1', { id: 'login-title', text: 'Welcome back' }),
        h('p', { text: 'Parents can view linked children. Teachers see only assigned classes. Administrators manage authorised records.' }),
        alertBox('info', 'Returning family or staff member?', 'Your former portal history is being preserved. Do not create a second account or send an old PIN in chat; the school will reconnect verified access.'),
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
          h('li', {}, icon('payments'), h('span', { text: 'Bank transfer remains the active payment method.' })),
          h('li', {}, icon('shield'), h('span', { text: 'A payment can never approve an admission.' }))
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

async function loadPortalData() {
  const role = state.profile.role;
  const studentColumns = role === 'admin'
    ? 'id,admission_number,full_name,class_code,parent_id,admission_status,active'
    : 'id,admission_number,full_name,class_code,admission_status,active';
  const base = [
    fetchRows('students', studentColumns, 'full_name'),
    fetchRows('grades', 'id,student_id,subject,session_name,term,continuous_assessment,exam_score,published_at', 'subject'),
    fetchRows('payments', 'id,student_id,session_name,term,description,amount,currency,method,status,paid_at,created_at', 'created_at')
  ];

  if (role === 'teacher' || role === 'admin') {
    base.push(fetchRows('teacher_class_assignments', 'id,teacher_id,class_code,subject,active', 'class_code'));
  } else base.push(Promise.resolve([]));

  if (role === 'admin') {
    base.push(fetchRows('profiles', 'id,role,full_name,phone_e164,account_status,must_change_password,active,legacy_account_no,created_at', 'full_name'));
    base.push(fetchRows('admission_audit_log', 'id,student_id,actor_id,previous_status,new_status,created_at', 'created_at'));
    base.push(fetchRows('payment_audit_log', 'id,payment_id,actor_id,action,previous_status,new_status,created_at', 'created_at'));
    base.push(fetchRows('webhook_events', 'id,event_key,outcome,reason,received_at,processed_at', 'received_at'));
    base.push(fetchRows('student_guardians', 'student_id,parent_id,relationship,active,verified_at,created_at', 'created_at'));
    base.push(fetchRows('account_audit_log', 'id,actor_id,target_profile_id,action,reason_code,detail,created_at', 'created_at'));
  } else {
    base.push(Promise.resolve([]), Promise.resolve([]), Promise.resolve([]), Promise.resolve([]), Promise.resolve([]), Promise.resolve([]));
  }

  const [students, grades, payments, assignments, profiles, admissionAudit, paymentAudit, webhooks, guardians, accountAudit] = await Promise.all(base);
  state.data = { students, grades, payments, assignments, profiles, admissionAudit, paymentAudit, webhooks, guardians, accountAudit };
}

async function establishSession(session) {
  if (!session?.user) {
    state.user = null;
    state.profile = null;
    state.data = {};
    renderLogin();
    return;
  }
  state.user = session.user;
  state.loading = true;
  setStatus('Loading your authorised records…');
  replace(app, h('div', { class: 'loading-card', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { text: 'Loading your secure portal…' })));

  try {
    const { data: profile, error } = await state.supabase
      .from('profiles')
      .select('id,role,full_name,active,account_status,must_change_password,phone_e164')
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
    state.tab = 'overview';
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
  if (role === 'parent') return [
    ['overview', 'Home', 'shield'], ['children', 'My Children', 'pupils'], ['results', 'My Results', 'results'], ['payments', 'School Fees', 'payments']
  ];
  if (role === 'teacher') return [
    ['overview', 'Home', 'shield'], ['classes', 'My Class', 'classes'], ['results', 'Input Results', 'results']
  ];
  return [
    ['overview', 'Overview', 'shield'], ['students', 'Pupils', 'pupils'], ['people', 'Accounts & Classes', 'classes'],
    ['results', 'Results', 'results'], ['payments', 'School Fees', 'payments'], ['audit', 'Audit', 'audit']
  ];
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

function roleOverview() {
  const { students, grades, payments, assignments } = state.data;
  const pendingPayments = payments.filter((item) => item.status === 'pending').length;
  const unpublished = grades.filter((item) => !item.published_at).length;
  const role = state.profile.role;

  const cards = role === 'parent'
    ? [statCard('Linked children', students.length, 'Only children connected to this parent account', 'pupils'), statCard('Published results', grades.length, 'Available results across terms and subjects', 'results'), statCard('Pending records', pendingPayments, 'Payment records awaiting office verification', 'payments')]
    : role === 'teacher'
      ? [statCard('Assigned classes', assignments.length, 'Active class or subject assignments', 'classes'), statCard('Visible pupils', students.length, 'Limited by your active assignments', 'pupils'), statCard('Draft results', unpublished, 'Save and review before publishing', 'results')]
      : [statCard('Active pupils', students.filter((item) => item.active).length, 'Authorised pupil records', 'pupils'), statCard('Portal people', state.data.profiles.length, 'Parent, teacher and admin profiles', 'user'), statCard('Pending payments', pendingPayments, 'Require evidence and an admin decision', 'payments')];

  return section(`Good day, ${state.profile.full_name.split(' ')[0]}`, `This is your ${role} workspace. Access is limited by database policies, not just by what is visible on this screen.`,
    h('div', { class: 'stats-grid' }, cards),
    alertBox('info', 'Admission decisions stay separate', 'Payment status never changes a pupil’s admission status. Only an authorised administrator can record an admission decision.'),
    role === 'parent' ? h('div', { class: 'quick-links' },
      h('a', { href: '/admissions.html' }, icon('pupils'), h('span', {}, h('strong', { text: 'Admissions' }), h('small', { text: 'Requirements and next steps' }))),
      h('a', { href: '/fees.html' }, icon('payments'), h('span', {}, h('strong', { text: 'Fees' }), h('small', { text: 'See published fee guidance' }))),
      h('a', { href: '/contact.html' }, icon('user'), h('span', {}, h('strong', { text: 'Contact' }), h('small', { text: 'Reach the verified school channels' })))
    ) : null
  );
}

function childrenView() {
  if (!state.data.students.length) return section('My children', 'Only children linked by the school appear here.', emptyState('No linked child yet', 'Ask the school office to verify and link the correct parent account.'));
  return section('My children', 'Core details are read-only. Contact the school if a name, class or admission status is wrong.',
    h('div', { class: 'card-grid' }, state.data.students.map((student) => h('article', { class: 'record-card' },
      h('div', { class: 'record-card__top' }, h('div', { class: 'avatar', 'aria-hidden': 'true', text: student.full_name.charAt(0).toUpperCase() }), h('div', {}, h('h3', { text: student.full_name }), h('p', { text: student.class_code }))),
      h('dl', {}, h('div', {}, h('dt', { text: 'Admission number' }), h('dd', { text: student.admission_number })), h('div', {}, h('dt', { text: 'Admission status' }), h('dd', {}, badge(student.admission_status))))
    )))
  );
}

function resultsTable() {
  return table(['Pupil', 'Subject', 'Session / term', 'CA', 'Exam', 'Total', 'Published'], state.data.grades.map((grade) => [
    nameForStudent(grade.student_id), grade.subject, `${grade.session_name} · ${grade.term}`,
    String(grade.continuous_assessment), String(grade.exam_score), `${Number(grade.continuous_assessment) + Number(grade.exam_score)}/100`,
    grade.published_at ? formatDate(grade.published_at) : badge('draft')
  ]), 'Results. Scroll horizontally if needed.');
}

function gradeForm() {
  if (!state.data.students.length) return emptyState('No authorised pupils', 'An administrator must assign a class before results can be entered.');
  const message = formMessage();
  const publish = h('input', { type: 'checkbox', name: 'publish', value: 'yes' });
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]');
    submit.disabled = true;
    const values = new FormData(form);
    try {
      const payload = {
        student_id: values.get('student_id'),
        subject: String(values.get('subject') || '').trim(),
        session_name: String(values.get('session_name') || '').trim(),
        term: values.get('term'),
        continuous_assessment: Number(values.get('continuous_assessment')),
        exam_score: Number(values.get('exam_score')),
        teacher_comment: String(values.get('teacher_comment') || '').trim() || null,
        recorded_by: state.profile.id,
        published_at: values.get('publish') ? new Date().toISOString() : null
      };
      const { error } = await state.supabase.from('grades').upsert(payload, { onConflict: 'student_id,subject,session_name,term' });
      if (error) throw error;
      setFormMessage(message, 'Result saved successfully.');
      form.reset();
      await refreshAfterMutation();
    } catch {
      setFormMessage(message, friendlyError(), true);
    } finally { submit.disabled = false; }
  } },
    selectInput('student_id', 'Pupil', state.data.students.map((student) => ({ value: student.id, label: `${student.full_name} — ${student.class_code}` })), { placeholder: 'Choose a pupil' }),
    textInput('subject', 'Subject', { maxlength: '80' }),
    textInput('session_name', 'Academic session', { placeholder: '2026/2027', maxlength: '20' }),
    selectInput('term', 'Term', ['First', 'Second', 'Third'], { placeholder: 'Choose a term' }),
    h('div', { class: 'form-grid' },
      textInput('continuous_assessment', 'Continuous assessment (0–40)', { type: 'number', min: '0', max: '40', step: '0.01', inputmode: 'decimal' }),
      textInput('exam_score', 'Exam score (0–60)', { type: 'number', min: '0', max: '60', step: '0.01', inputmode: 'decimal' })
    ),
    controlField('Teacher comment (optional)', h('textarea', { name: 'teacher_comment', maxlength: '500', rows: '4' }), 'Do not include diagnoses or unrelated private family information.'),
    h('label', { class: 'check-row' }, publish, h('span', {}, h('strong', { text: 'Publish to the linked parent' }), h('small', { text: 'Leave unticked to save a staff-only draft.' }))),
    message,
    primaryButton('Save result', { type: 'submit', icon: 'results' })
  );
  return h('details', { class: 'form-panel' }, h('summary', { text: 'Add or update a result' }), form);
}

function resultsView() {
  const canEdit = state.profile.role === 'teacher' || state.profile.role === 'admin';
  return section('Results', canEdit ? 'Scores are constrained to CA 40 and exam 60. Teacher access is checked against active class assignments.' : 'Only results published by authorised staff are visible here.',
    canEdit ? gradeForm() : null,
    resultsTable() || emptyState('No results available', canEdit ? 'Use the form above when results are ready.' : 'Published results will appear here after school review.')
  );
}

function paymentsView() {
  const body = table(['Pupil', 'Description', 'Session / term', 'Amount', 'Method', 'Status', 'Paid'], state.data.payments.map((payment) => [
    nameForStudent(payment.student_id), payment.description, `${payment.session_name} · ${payment.term}`, formatMoney(payment.amount), titleCase(payment.method), badge(payment.status), formatDate(payment.paid_at)
  ]), 'Payment records. Scroll horizontally if needed.');
  return section('Payments', 'Bank transfer is the only active payment route. A listed payment is not an admission decision.',
    alertBox('info', 'Verify before transferring', 'Use only bank details confirmed by the school office. Monnify checkout is not active and this portal will not ask for card details.'),
    state.profile.role === 'admin' ? adminPaymentForms() : null,
    body || emptyState('No payment records', 'Payment records linked to the selected pupil will appear here after office entry.'),
    state.profile.role === 'parent' ? h('p', { class: 'support-line' }, 'Need a correction? ', h('a', { href: `https://wa.me/${WHATSAPP_NUMBER}`, text: 'Message the verified school WhatsApp' }), '.') : null
  );
}

function assignedClassesView() {
  const rows = state.data.assignments.map((assignment) => [assignment.class_code, assignment.subject === '*' ? 'All assigned subjects' : assignment.subject, assignment.active ? badge('active') : badge('inactive')]);
  return section('Assigned classes', 'These database assignments determine which pupils and results you can access.',
    table(['Class', 'Subject scope', 'Status'], rows, 'Teacher class assignments') || emptyState('No active assignment', 'Ask an administrator to assign the correct class and subject before entering results.'),
    h('h2', { class: 'subheading', text: 'Authorised pupils' }),
    table(['Pupil', 'Class', 'Admission number'], state.data.students.map((student) => [student.full_name, student.class_code, student.admission_number]), 'Authorised pupils') || emptyState('No pupils visible', 'Pupils appear after a matching class assignment is active.')
  );
}

function studentAdminForms() {
  const parents = state.data.profiles.filter((profile) => profile.role === 'parent' && profile.active);
  const addMessage = formMessage();
  const addForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault();
    if (!addForm.reportValidity()) return;
    const submit = addForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(addForm);
    try {
      const { error } = await state.supabase.from('students').insert({
        full_name: String(values.get('full_name')).trim(), admission_number: String(values.get('admission_number')).trim(),
        class_code: String(values.get('class_code')).trim(), parent_id: values.get('parent_id'), admission_status: 'pending'
      });
      if (error) throw error;
      setFormMessage(addMessage, 'Pupil record created with pending admission status.'); addForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(addMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    textInput('full_name', 'Pupil full name', { maxlength: '120' }),
    textInput('admission_number', 'Admission number', { maxlength: '40' }),
    textInput('class_code', 'Class', { placeholder: 'Primary 4', maxlength: '40' }),
    selectInput('parent_id', 'Linked parent', parents.map((parent) => ({ value: parent.id, label: parent.full_name })), { placeholder: parents.length ? 'Choose a verified parent' : 'No parent profiles available' }),
    addMessage, primaryButton('Create pending pupil record', { type: 'submit', icon: 'pupils', disabled: !parents.length })
  );

  const admissionMessage = formMessage();
  const admissionForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!admissionForm.reportValidity()) return;
    const submit = admissionForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(admissionForm);
    try {
      const { error } = await state.supabase.from('students').update({ admission_status: values.get('admission_status') }).eq('id', values.get('student_id'));
      if (error) throw error;
      setFormMessage(admissionMessage, 'Admission status updated and audit-recorded.'); await refreshAfterMutation();
    } catch { setFormMessage(admissionMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('student_id', 'Pupil', state.data.students.map((student) => ({ value: student.id, label: `${student.full_name} — ${titleCase(student.admission_status)}` })), { placeholder: 'Choose a pupil' }),
    selectInput('admission_status', 'New admission status', ['pending', 'under_review', 'offered', 'admitted', 'declined', 'withdrawn'].map((value) => ({ value, label: titleCase(value) })), { placeholder: 'Choose a status' }),
    alertBox('warning', 'Admin decision required', 'Confirm the full admissions review. A paid fee must not be used as automatic approval.'),
    admissionMessage, primaryButton('Record admission decision', { type: 'submit', icon: 'shield' })
  );

  return h('div', { class: 'details-grid' },
    h('details', { class: 'form-panel' }, h('summary', { text: 'Add a pupil record' }), addForm),
    h('details', { class: 'form-panel' }, h('summary', { text: 'Record an admission decision' }), admissionForm)
  );
}

function studentsAdminView() {
  return section('Pupils', 'Pupil creation and admission decisions are restricted to administrators and recorded separately from payments.',
    studentAdminForms(),
    table(['Pupil', 'Admission number', 'Class', 'Linked parent', 'Admission status'], state.data.students.map((student) => [student.full_name, student.admission_number, student.class_code, nameForProfile(student.parent_id), badge(student.admission_status)]), 'Pupil records') || emptyState('No pupil records', 'Create a verified parent account before adding a linked pupil.')
  );
}

function assignmentForm() {
  const teachers = state.data.profiles.filter((profile) => profile.role === 'teacher' && profile.active);
  const message = formMessage();
  const form = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!form.reportValidity()) return;
    const submit = form.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(form);
    try {
      const { error } = await state.supabase.from('teacher_class_assignments').upsert({
        teacher_id: values.get('teacher_id'), class_code: String(values.get('class_code')).trim(), subject: String(values.get('subject') || '*').trim() || '*', active: true
      }, { onConflict: 'teacher_id,class_code,subject' });
      if (error) throw error;
      setFormMessage(message, 'Teacher assignment saved.'); form.reset(); await refreshAfterMutation();
    } catch { setFormMessage(message, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('teacher_id', 'Teacher', teachers.map((teacher) => ({ value: teacher.id, label: teacher.full_name })), { placeholder: teachers.length ? 'Choose a teacher' : 'No teacher profiles available' }),
    textInput('class_code', 'Class', { placeholder: 'Primary 4', maxlength: '40' }),
    textInput('subject', 'Subject scope', { placeholder: '* for all subjects', maxlength: '80', required: false, hint: 'Use * only for a class teacher who should manage every subject in that class.' }),
    message, primaryButton('Save assignment', { type: 'submit', icon: 'classes', disabled: !teachers.length })
  );
  return h('details', { class: 'form-panel' }, h('summary', { text: 'Assign a teacher' }), form);
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
      const initialStudent = values.get('student_id');
      const result = await postAccountApi('/api/admin/accounts', {
        fullName: String(values.get('full_name') || '').trim(),
        phone: String(values.get('phone') || ''),
        role: values.get('role'),
        legacySource: String(values.get('legacy_source') || '').trim() || null,
        legacyAccountNo: String(values.get('legacy_account_no') || '').trim() || null,
        studentIds: initialStudent ? [initialStudent] : []
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
    selectInput('role', 'Account role', [{ value: 'parent', label: 'Parent' }, { value: 'teacher', label: 'Teacher' }], { placeholder: 'Choose parent or teacher' }),
    selectInput('student_id', 'Initial linked child (parent only, optional)', state.data.students.map((student) => ({ value: student.id, label: `${student.full_name} — ${student.class_code}` })), { placeholder: 'No child selected', required: false, hint: 'Use only after the caregiver relationship is verified. Additional children can be linked below.' }),
    h('div', { class: 'form-grid' },
      textInput('legacy_source', 'Legacy source (optional)', { maxlength: '80', required: false, hint: 'For example: school_data or parent_accounts. Never enter a former PIN.' }),
      textInput('legacy_account_no', 'Former account number (optional)', { maxlength: '120', required: false })
    ),
    alertBox('warning', 'No public registration', 'Only create an account after office verification. This workflow cannot create another administrator.'),
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
    alertBox('info', 'Verified relationships only', 'Never link families by a public phone search. One parent may have several children and one child may have multiple verified caregivers.'),
    linkMessage,
    primaryButton('Save caregiver access', { type: 'submit', icon: 'pupils', disabled: !parentAccounts.length || !state.data.students.length })
  );

  return h('div', { class: 'details-grid account-actions' },
    h('details', { class: 'form-panel' }, h('summary', { text: 'Create a parent or teacher account' }), createForm),
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
      badge(profile.role),
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
    h('h2', { class: 'subheading', text: 'Teacher class scope' }),
    assignmentForm(),
    table(['Teacher', 'Class', 'Subject', 'Status'], state.data.assignments.map((assignment) => [nameForProfile(assignment.teacher_id), assignment.class_code, assignment.subject === '*' ? 'All subjects' : assignment.subject, assignment.active ? badge('active') : badge('inactive')]), 'Teacher assignments') || emptyState('No assignments', 'Add an assignment before teachers enter results.')
  );
}

function adminPaymentForms() {
  const createMessage = formMessage();
  const createForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!createForm.reportValidity()) return;
    const submit = createForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(createForm);
    try {
      const { error } = await state.supabase.from('payments').insert({
        student_id: values.get('student_id'), session_name: String(values.get('session_name')).trim(), term: values.get('term'),
        description: String(values.get('description')).trim(), amount: Number(values.get('amount')), method: 'bank_transfer', status: 'pending'
      });
      if (error) throw error;
      setFormMessage(createMessage, 'Pending bank-transfer record created.'); createForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(createMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('student_id', 'Pupil', state.data.students.map((student) => ({ value: student.id, label: student.full_name })), { placeholder: 'Choose a pupil' }),
    textInput('description', 'Payment description', { maxlength: '160' }),
    h('div', { class: 'form-grid' }, textInput('session_name', 'Session', { placeholder: '2026/2027', maxlength: '20' }), selectInput('term', 'Term', ['First', 'Second', 'Third'], { placeholder: 'Choose a term' })),
    textInput('amount', 'Expected amount (NGN)', { type: 'number', min: '1', max: '9999999999.99', step: '0.01', inputmode: 'decimal' }),
    createMessage, primaryButton('Create pending payment', { type: 'submit', icon: 'payments', disabled: !state.data.students.length })
  );

  const pending = state.data.payments.filter((payment) => payment.status === 'pending' && payment.method === 'bank_transfer');
  const verifyMessage = formMessage();
  const verifyForm = h('form', { class: 'data-form', onSubmit: async (event) => {
    event.preventDefault(); if (!verifyForm.reportValidity()) return;
    const submit = verifyForm.querySelector('[type=submit]'); submit.disabled = true;
    const values = new FormData(verifyForm);
    try {
      const { error } = await state.supabase.from('payments').update({
        status: 'paid', bank_reference: String(values.get('bank_reference')).trim(), paid_at: new Date().toISOString(), verified_by: state.profile.id
      }).eq('id', values.get('payment_id')).eq('status', 'pending').eq('method', 'bank_transfer');
      if (error) throw error;
      setFormMessage(verifyMessage, 'Bank transfer marked paid. Admission status was not changed.'); verifyForm.reset(); await refreshAfterMutation();
    } catch { setFormMessage(verifyMessage, friendlyError(), true); }
    finally { submit.disabled = false; }
  } },
    selectInput('payment_id', 'Pending payment', pending.map((payment) => ({ value: payment.id, label: `${nameForStudent(payment.student_id)} — ${formatMoney(payment.amount)} — ${payment.description}` })), { placeholder: pending.length ? 'Choose a verified transfer' : 'No pending bank transfers' }),
    textInput('bank_reference', 'Bank transaction reference', { maxlength: '120', hint: 'Check the school bank statement before entering this reference.' }),
    alertBox('warning', 'Evidence first', 'Only mark paid after matching amount, pupil and bank evidence. This action does not approve admission.'),
    verifyMessage, primaryButton('Confirm verified bank transfer', { type: 'submit', icon: 'shield', disabled: !pending.length })
  );

  return h('div', { class: 'details-grid' },
    h('details', { class: 'form-panel' }, h('summary', { text: 'Create a payment record' }), createForm),
    h('details', { class: 'form-panel' }, h('summary', { text: 'Verify a bank transfer' }), verifyForm)
  );
}

function auditView() {
  const accountRows = [...state.data.accountAudit].reverse().map((item) => [formatDate(item.created_at), titleCase(item.action), nameForProfile(item.target_profile_id), nameForProfile(item.actor_id), titleCase(item.reason_code || 'not recorded')]);
  const admissionRows = [...state.data.admissionAudit].reverse().map((item) => [formatDate(item.created_at), nameForStudent(item.student_id), titleCase(item.previous_status || 'new'), titleCase(item.new_status), nameForProfile(item.actor_id)]);
  const paymentRows = [...state.data.paymentAudit].reverse().map((item) => [formatDate(item.created_at), item.action, titleCase(item.previous_status || 'new'), titleCase(item.new_status), nameForProfile(item.actor_id)]);
  const webhookRows = [...state.data.webhooks].reverse().map((item) => [formatDate(item.received_at), badge(item.outcome), item.reason ? titleCase(item.reason) : '—']);
  return section('Audit', 'Append-only records support review without exposing passwords, private verification evidence, webhook payloads or bank account details.',
    h('h2', { class: 'subheading', text: 'Account actions' }),
    table(['Date', 'Action', 'Account', 'Actor', 'Reason category'], accountRows, 'Account audit log') || emptyState('No account actions', 'Provisioning, password resets, status changes and caregiver links will be recorded here.'),
    h('h2', { class: 'subheading', text: 'Admission decisions' }),
    table(['Date', 'Pupil', 'From', 'To', 'Actor'], admissionRows, 'Admission audit log') || emptyState('No admission changes', 'Status changes will be recorded here.'),
    h('h2', { class: 'subheading', text: 'Payment status changes' }),
    table(['Date', 'Action', 'From', 'To', 'Actor'], paymentRows, 'Payment audit log') || emptyState('No payment changes', 'Verified status changes will be recorded here.'),
    h('h2', { class: 'subheading', text: 'Monnify webhook receipts' }),
    alertBox('info', 'Disabled by default', 'No checkout is exposed. Webhook processing requires separate owner verification and server environment activation.'),
    table(['Received', 'Outcome', 'Reason'], webhookRows, 'Webhook audit log') || emptyState('No webhook receipts', 'This is expected while the Monnify scaffold is disabled.')
  );
}

function currentView() {
  if (state.tab === 'overview') return roleOverview();
  if (state.tab === 'children') return childrenView();
  if (state.tab === 'classes') return assignedClassesView();
  if (state.tab === 'results') return resultsView();
  if (state.tab === 'payments') return paymentsView();
  if (state.tab === 'students') return studentsAdminView();
  if (state.tab === 'people') return peopleView();
  if (state.tab === 'audit') return auditView();
  return roleOverview();
}

function renderAuthenticated() {
  const workspace = h('div', { class: 'portal-shell' },
    h('aside', { class: 'portal-sidebar' },
      h('div', { class: 'profile-summary' }, h('div', { class: 'avatar', 'aria-hidden': 'true', text: state.profile.full_name.charAt(0).toUpperCase() }), h('div', {}, h('strong', { text: state.profile.full_name }), h('span', { text: `${titleCase(state.profile.role)} account` }))),
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
  await loadPortalData();
  renderAuthenticated();
  setStatus('Portal records refreshed.');
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
      h('a', { class: 'button', href: '/contact.html', text: 'Open contact information' })
    ));
    setStatus('Portal temporarily unavailable.', true);
  }
}

start();
