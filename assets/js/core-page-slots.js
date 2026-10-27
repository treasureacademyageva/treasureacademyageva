(() => {
  'use strict';
  const allowed = new Set([
    '/about', '/academics', '/admissions', '/fees', '/contact', '/calendar',
    '/exams', '/transport', '/uniform', '/shop', '/pta', '/careers',
    '/privacy', '/safeguarding', '/credits', '/request-centre'
  ]);
  if (!allowed.has(location.pathname)) return;
  const main = document.querySelector('main');
  if (!main) return;

  function element(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = value;
      else node.setAttribute(key, String(value));
    });
    children.flat().forEach((child) => {
      if (child === null || child === undefined) return;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  }
  function localPath(value) {
    const path = String(value || '').trim();
    return /^\/(?!\/)[a-zA-Z0-9/_?#=&.%-]*$/.test(path) && !path.includes('//') && !/(^|\/)\.\.(\/|$)/.test(path) ? path : '';
  }
  function list(payload, ordered) {
    const node = document.createElement(ordered ? 'ol' : 'ul');
    (Array.isArray(payload.items) ? payload.items : []).slice(0, 50).forEach((item) => node.append(element('li', { text: String(item).slice(0, 500) })));
    return node;
  }
  function table(payload) {
    const headers = Array.isArray(payload.headers) ? payload.headers.slice(0, 12) : [];
    const rows = Array.isArray(payload.rows) ? payload.rows.slice(0, 100) : [];
    const wrapper = element('div', { class: 'table-wrap' });
    const node = document.createElement('table');
    if (headers.length) node.append(element('thead', {}, element('tr', {}, headers.map((value) => element('th', { scope: 'col', text: String(value).slice(0, 120) })))));
    const body = document.createElement('tbody');
    rows.forEach((row) => {
      const cells = (Array.isArray(row) ? row : []).slice(0, headers.length || 12)
        .map((value) => element('td', { text: String(value ?? '').slice(0, 500) }));
      body.append(element('tr', {}, cells));
    });
    node.append(body); wrapper.append(node); return wrapper;
  }
  function blockNode(block) {
    const payload = block && typeof block.payload === 'object' ? block.payload : {};
    if (block.type === 'heading') return element(['', '', 'h2', 'h3', 'h4'][Number(payload.level)] || 'h2', { text: String(payload.text || '').slice(0, 300) });
    if (block.type === 'paragraph') return element('p', { text: String(payload.text || '').slice(0, 5000) });
    if (block.type === 'quote') return element('blockquote', { text: String(payload.text || '').slice(0, 5000) });
    if (block.type === 'callout') return element('p', { class: `core-slot-callout core-slot-callout--${['info', 'warning', 'success'].includes(payload.style) ? payload.style : 'info'}`, text: String(payload.text || '').slice(0, 3000) });
    if (block.type === 'verified_fact') {
      const source = localPath(payload.source_path);
      return element('div', { class: 'core-slot-fact' }, element('p', { text: String(payload.text || '').slice(0, 3000) }), source ? element('a', { href: source, text: 'Supporting source' }) : null);
    }
    if (block.type === 'ordered_list') return list(payload, true);
    if (block.type === 'unordered_list') return list(payload, false);
    if (block.type === 'table') return table(payload);
    if (block.type === 'button') {
      const path = localPath(payload.path);
      return path ? element('p', {}, element('a', { class: 'btn btn-mint btn-sm', href: path, text: String(payload.label || 'Read more').slice(0, 80) })) : null;
    }
    return null;
  }
  function shell(state, title, body) {
    const section = element('section', { class: `core-page-slots core-page-slots--${state}`, 'data-core-slot-state': state, 'aria-labelledby': 'core-page-slots-title' });
    section.append(element('div', { class: 'container' }, element('p', { class: 'verified-information__label', text: 'Current verified information' }), element('h2', { id: 'core-page-slots-title', text: title }), body));
    return section;
  }
  function current(items) {
    const grid = element('div', { class: 'core-page-slots__grid' });
    items.forEach((item) => {
      const article = element('article', { class: `core-page-slot core-page-slot--${item.mount || 'notice'}` }, element('h3', { text: item.title }), element('p', { text: item.summary }));
      (Array.isArray(item.blocks) ? item.blocks : []).forEach((block) => { const node = blockNode(block); if (node) article.append(node); });
      if (item.nextReviewDate) article.append(element('small', { text: `Review due ${item.nextReviewDate}` }));
      grid.append(article);
    });
    return shell('current', items.length === 1 ? 'Current page update' : 'Current page updates', grid);
  }

  fetch(`/api/public/content/core-slots?path=${encodeURIComponent(location.pathname)}`, { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' })
    .then(async (response) => {
      if (response.status === 404) return null;
      const payload = await response.json().catch(() => null);
      if (!payload) throw new Error('Invalid core-slot response');
      if (!response.ok) throw new Error(payload.message || 'Unavailable');
      return payload;
    })
    .then((payload) => {
      if (!payload) return;
      if (payload.state === 'current' && Array.isArray(payload.items) && payload.items.length) main.prepend(current(payload.items));
      else main.prepend(shell('empty', 'No current supplemental update', element('p', { text: 'No reviewed supplemental update is published for this page. Use the page guidance or contact the school if you need a current operational fact.' })));
    })
    .catch(() => {
      const message = element('p', {},
        'The website will not guess. Use the verified contact page for time-sensitive information. ',
        element('a', { href: '/contact', text: 'Contact the school' })
      );
      main.prepend(shell('unavailable', 'Current updates are temporarily unavailable', message));
    });
})();
