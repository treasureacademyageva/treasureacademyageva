import { createClient } from '@supabase/supabase-js';

const panel = document.querySelector('[data-public-engagement]');

function text(node, value) {
  if (node) node.textContent = String(value ?? '');
}

function status(message, error = false) {
  const node = panel?.querySelector('[data-engagement-status]');
  if (!node) return;
  node.textContent = message;
  node.classList.toggle('content-engagement-status--error', error);
  node.setAttribute('role', error ? 'alert' : 'status');
}

async function responseJson(response) {
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(result.error || 'Request failed.'), { status: response.status });
  return result;
}

async function getSummary(path, token = '') {
  return responseJson(await fetch(`/api/public/content/engagement?path=${encodeURIComponent(path)}`, {
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }
  }));
}

async function mutate(path, operation, body = {}, token = '') {
  return responseJson(await fetch('/api/public/content/engagement', {
    method: 'POST',
    cache: 'no-store',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ operation, path, ...body })
  }));
}

function button(label, attributes = {}) {
  const node = document.createElement('button');
  node.type = attributes.type || 'button';
  node.className = attributes.className || 'content-comment-action';
  node.textContent = label;
  return node;
}

function renderCounts(data) {
  const counts = data?.counts || {};
  text(panel.querySelector('[data-view-count]'), Math.max(0, Number(counts.views) || 0));
  text(panel.querySelector('[data-like-count]'), Math.max(0, Number(counts.likes) || 0));
  text(panel.querySelector('[data-comment-count]'), Math.max(0, Number(counts.comments) || 0));
  const like = panel.querySelector('[data-like-button]');
  if (like) {
    like.setAttribute('aria-pressed', counts.liked ? 'true' : 'false');
    like.textContent = counts.liked ? 'Remove your like' : 'Like this update';
  }
}

function reportForm(item, comment, context) {
  const form = document.createElement('form');
  form.className = 'content-report-form';
  const label = document.createElement('label');
  const id = `report-${comment.id}`;
  label.htmlFor = id;
  label.textContent = 'Brief reason for leadership review';
  const reason = document.createElement('textarea');
  reason.id = id;
  reason.name = 'reason';
  reason.required = true;
  reason.minLength = 3;
  reason.maxLength = 500;
  reason.rows = 3;
  const send = button('Send concern', { type: 'submit' });
  const cancel = button('Cancel');
  cancel.addEventListener('click', () => form.remove());
  form.append(label, reason, send, cancel);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    send.disabled = true;
    try {
      await mutate(context.path, 'report_comment', { commentId: comment.id, reason: reason.value }, context.token);
      status('Concern sent privately for leadership review.');
      form.remove();
      await context.refresh();
    } catch (error) {
      status(error.message, true);
      send.disabled = false;
    }
  });
  item.append(form);
  reason.focus();
}

function renderApproved(comments, context) {
  const host = panel.querySelector('[data-approved-comments]');
  if (!host) return;
  host.replaceChildren();
  if (!comments.length) {
    const empty = document.createElement('p');
    empty.className = 'content-comments-empty';
    empty.textContent = 'No approved comments yet.';
    host.append(empty);
    return;
  }
  const ownIds = new Set((context.myComments || []).map((comment) => comment.id));
  const list = document.createElement('ol');
  list.className = 'content-comments-list';
  list.dataset.commentsList = '';
  comments.forEach((comment) => {
    const item = document.createElement('li');
    item.className = 'content-comment';
    item.dataset.commentId = comment.id;
    const head = document.createElement('div');
    const author = document.createElement('strong');
    author.textContent = comment.author_label || 'School community';
    const time = document.createElement('time');
    time.dateTime = comment.created_at;
    const parsed = new Date(comment.created_at);
    time.textContent = Number.isNaN(parsed.valueOf()) ? '' : new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Lagos' }).format(parsed);
    head.append(author, time);
    const body = document.createElement('p');
    body.textContent = comment.body;
    item.append(head, body);
    if (context.token && !ownIds.has(comment.id)) {
      const report = button('Report concern');
      report.className = 'content-report';
      report.addEventListener('click', () => {
        if (!item.querySelector('form')) reportForm(item, comment, context);
      });
      item.append(report);
    }
    list.append(item);
  });
  host.append(list);
}

function ownCommentCard(comment, context) {
  const card = document.createElement('article');
  card.className = 'content-own-comment';
  const heading = document.createElement('h4');
  heading.textContent = `Status: ${String(comment.status || '').replaceAll('_', ' ')}`;
  const body = document.createElement('p');
  body.textContent = comment.body;
  const actions = document.createElement('div');
  actions.className = 'content-own-comment-actions';
  if (comment.status !== 'deleted_by_author') {
    const edit = button('Edit');
    const remove = button('Delete');
    edit.addEventListener('click', () => {
      if (card.querySelector('form')) return;
      const form = document.createElement('form');
      form.className = 'content-own-comment-edit';
      const label = document.createElement('label');
      const id = `edit-${comment.id}`;
      label.htmlFor = id;
      label.textContent = 'Edit your comment';
      const value = document.createElement('textarea');
      value.id = id;
      value.required = true;
      value.minLength = 2;
      value.maxLength = 2000;
      value.rows = 4;
      value.value = comment.body;
      const save = button('Save and return to review', { type: 'submit' });
      const cancel = button('Cancel');
      cancel.addEventListener('click', () => form.remove());
      form.append(label, value, save, cancel);
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        save.disabled = true;
        try {
          await mutate(context.path, 'edit_comment', { commentId: comment.id, body: value.value }, context.token);
          status('Comment updated and returned to leadership review.');
          await context.refresh();
        } catch (error) {
          status(error.message, true);
          save.disabled = false;
        }
      });
      card.append(form);
      value.focus();
    });
    remove.addEventListener('click', async () => {
      if (!window.confirm('Delete your comment? It will be removed from public view but its governed audit record is retained.')) return;
      remove.disabled = true;
      try {
        await mutate(context.path, 'delete_comment', { commentId: comment.id }, context.token);
        status('Comment removed from publication.');
        await context.refresh();
      } catch (error) {
        status(error.message, true);
        remove.disabled = false;
      }
    });
    actions.append(edit, remove);
  }
  card.append(heading, body, actions);
  return card;
}

function renderOwn(comments, context) {
  const section = panel.querySelector('[data-own-comments]');
  const host = panel.querySelector('[data-own-comments-list]');
  if (!section || !host) return;
  section.hidden = !comments.length;
  host.replaceChildren(...comments.map((comment) => ownCommentCard(comment, context)));
}

async function initialise() {
  if (!panel) return;
  const path = panel.dataset.contentPath || '';
  const commentsEnabled = panel.dataset.commentsEnabled === 'true';
  const context = { path, token: '', myComments: [], refresh: null };

  context.refresh = async () => {
    const data = await getSummary(path, context.token);
    renderCounts(data);
    context.myComments = Array.isArray(data.myComments) ? data.myComments : [];
    if (commentsEnabled) {
      renderApproved(Array.isArray(data.comments) ? data.comments : [], context);
      renderOwn(context.myComments, context);
    }
    return data;
  };

  try { await context.refresh(); } catch { status('Live engagement totals are temporarily unavailable.', true); }

  let recorded = false;
  const recordView = async () => {
    if (recorded || document.visibilityState !== 'visible') return;
    recorded = true;
    try {
      const result = await mutate(path, 'view');
      renderCounts(result);
    } catch { /* The article remains usable when aggregate counting is unavailable. */ }
  };
  window.setTimeout(recordView, 4000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recordView(); }, { once: true });

  try {
    const config = await responseJson(await fetch('/api/portal-config', { cache: 'no-store', headers: { Accept: 'application/json' } }));
    if (!config.enabled || !config.url || !config.publishableKey) return;
    const supabase = createClient(config.url, config.publishableKey, {
      auth: { storage: window.sessionStorage, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
      global: { headers: { 'X-Client-Info': 'treasure-academy-public-engagement/1.0' } }
    });
    const { data } = await supabase.auth.getSession();
    context.token = data.session?.access_token || '';
    if (!context.token) return;
    const signedInData = await context.refresh();
    if (!signedInData.signedIn) {
      context.token = '';
      return;
    }

    const like = panel.querySelector('[data-like-button]');
    if (like) {
      like.disabled = false;
      like.addEventListener('click', async () => {
        like.disabled = true;
        try {
          const result = await mutate(path, 'like', { liked: like.getAttribute('aria-pressed') !== 'true' }, context.token);
          renderCounts(result);
          status(result.counts.liked ? 'Your like was added.' : 'Your like was removed.');
        } catch (error) {
          status(error.message, true);
        } finally {
          like.disabled = false;
        }
      });
    }
    status('Signed in. You can like this update.' + (commentsEnabled ? ' Comments are reviewed before publication.' : ''));

    if (commentsEnabled) {
      const authNote = panel.querySelector('[data-comment-auth]');
      if (authNote) authNote.hidden = true;
      const form = panel.querySelector('[data-comment-form]');
      if (form) {
        form.hidden = false;
        form.addEventListener('submit', async (event) => {
          event.preventDefault();
          const submit = form.querySelector('button[type="submit"]');
          const body = form.elements.body.value;
          submit.disabled = true;
          try {
            const result = await mutate(path, 'comment', { body }, context.token);
            form.reset();
            status(result.message || 'Comment submitted for leadership review.');
            await context.refresh();
          } catch (error) {
            status(error.message, true);
          } finally {
            submit.disabled = false;
          }
        });
      }
    }
  } catch { /* Keep the public read-only state and sign-in guidance. */ }
}

initialise();
