(() => {
  'use strict';

  const main = document.querySelector('main#main, main');
  const canonical = document.querySelector('link[rel="canonical"]');
  if (!main || !canonical) return;

  let path = '';
  try {
    const url = new URL(canonical.href, location.href);
    if (url.origin !== location.origin && url.hostname !== 'www.treasureacademyageva.com') return;
    path = url.pathname.replace(/\/$/, '') || '/';
  } catch { return; }

  function element(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') node.className = value;
      else if (key === 'text') node.textContent = String(value);
      else if (key === 'controls') node.controls = true;
      else node.setAttribute(key, String(value));
    });
    children.flat(Infinity).forEach((child) => {
      if (child === null || child === undefined || child === false) return;
      node.append(child instanceof Node ? child : document.createTextNode(String(child)));
    });
    return node;
  }

  function safePath(value) {
    const candidate = String(value || '').trim();
    return /^\/(?!\/)[a-zA-Z0-9/_?#=&.%-]*$/.test(candidate)
      && !candidate.includes('//') && !/(^|\/)\.\.(\/|$)/.test(candidate) ? candidate : '';
  }

  function list(payload, ordered) {
    const node = document.createElement(ordered ? 'ol' : 'ul');
    (Array.isArray(payload.items) ? payload.items : []).slice(0, 50)
      .forEach((item) => node.append(element('li', { text: String(item).slice(0, 500) })));
    return node;
  }

  function table(payload) {
    const headers = (Array.isArray(payload.headers) ? payload.headers : []).slice(0, 12);
    const rows = (Array.isArray(payload.rows) ? payload.rows : []).slice(0, 100);
    const wrapper = element('div', { class: 'table-wrap dynamic-page-table', role: 'region', tabindex: '0', 'aria-label': 'Published school information table' });
    const node = document.createElement('table');
    if (headers.length) {
      const headingRow = element('tr', {}, headers.map((value) =>
        element('th', { scope: 'col', text: String(value).slice(0, 120) })
      ));
      node.append(element('thead', {}, headingRow));
    }
    const body = document.createElement('tbody');
    rows.forEach((row) => {
      const cells = (Array.isArray(row) ? row : []).slice(0, headers.length || 12)
        .map((value) => element('td', { text: String(value ?? '').slice(0, 500) }));
      body.append(element('tr', {}, cells));
    });
    node.append(body); wrapper.append(node); return wrapper;
  }

  function mediaFigure(media, compact = false) {
    if (!media || !safePath(media.assetPath)) return null;
    let visual;
    if (media.type === 'video') {
      visual = element('video', {
        controls: true, preload: 'metadata', width: media.width || 1280, height: media.height || 720,
        poster: safePath(media.posterPath) || null
      }, element('source', { src: media.assetPath, type: 'video/mp4' }));
    } else {
      visual = element('img', {
        src: media.assetPath, alt: String(media.alt || '').slice(0, 500),
        width: media.width || 1200, height: media.height || 675,
        loading: compact ? 'lazy' : 'eager', decoding: 'async'
      });
    }
    return element('figure', { class: compact ? 'dynamic-page-media dynamic-page-media--compact' : 'dynamic-page-media' },
      visual,
      media.caption || media.attribution
        ? element('figcaption', { text: [media.caption, media.attribution ? `Credit: ${media.attribution}` : ''].filter(Boolean).join(' · ') })
        : null
    );
  }

  function blockNode(block, mediaById) {
    const payload = block && typeof block.payload === 'object' ? block.payload : {};
    if (block.type === 'heading') return element([null, null, 'h2', 'h3', 'h4'][Number(payload.level)] || 'h2', { text: String(payload.text || '').slice(0, 300) });
    if (block.type === 'paragraph') return element('p', { text: String(payload.text || '').slice(0, 5000) });
    if (block.type === 'quote') return element('blockquote', { text: String(payload.text || '').slice(0, 5000) });
    if (block.type === 'callout') return element('aside', { class: `dynamic-page-callout dynamic-page-callout--${['info', 'warning', 'success'].includes(payload.style) ? payload.style : 'info'}` }, element('p', { text: String(payload.text || '').slice(0, 3000) }));
    if (block.type === 'verified_fact') {
      const source = safePath(payload.source_path);
      return element('aside', { class: 'dynamic-page-fact' }, element('p', { text: String(payload.text || '').slice(0, 3000) }), source ? element('a', { href: source, text: 'Supporting source' }) : null);
    }
    if (block.type === 'ordered_list') return list(payload, true);
    if (block.type === 'unordered_list') return list(payload, false);
    if (block.type === 'table') return table(payload);
    if (block.type === 'button') {
      const href = safePath(payload.path);
      return href ? element('p', {}, element('a', { class: 'btn btn-mint', href, text: String(payload.label || 'Read more').slice(0, 80) })) : null;
    }
    if (block.type === 'image' || block.type === 'video') return mediaFigure(mediaById.get(payload.asset_id));
    if (block.type === 'gallery') {
      const figures = (Array.isArray(payload.asset_ids) ? payload.asset_ids : []).slice(0, 24)
        .map((id) => mediaFigure(mediaById.get(id), true)).filter(Boolean);
      return figures.length ? element('div', { class: 'dynamic-page-gallery' }, figures) : null;
    }
    return null;
  }

  function updateMeta(page) {
    const title = String(page.seoTitle || page.title || '').trim().slice(0, 180);
    const description = String(page.seoDescription || page.summary || '').trim().slice(0, 500);
    if (title) document.title = title;
    const set = (selector, value) => {
      const node = document.querySelector(selector);
      if (node && value) node.setAttribute('content', value);
    };
    set('meta[name="description"]', description);
    set('meta[property="og:title"]', title);
    set('meta[property="og:description"]', description);
    set('meta[name="twitter:title"]', title);
    set('meta[name="twitter:description"]', description);
  }

  function render(payload) {
    const page = payload.page;
    const mediaById = new Map((Array.isArray(page.media) ? page.media : []).map((item) => [item.id, item]));
    const content = element('div', { class: `dynamic-page dynamic-page--${payload.mode}`, 'data-dynamic-page-state': 'current' });
    const container = element('div', { class: 'container dynamic-page__container' });
    if (payload.mode === 'replace') {
      const existingH1 = document.querySelector('h1');
      const title = String(page.title || '').slice(0, 180);
      const summary = String(page.summary || '').slice(0, 600);
      if (existingH1) {
        existingH1.textContent = title;
        const hero = existingH1.closest('.page-hero, header');
        const heroSummary = hero?.querySelector('p:not(.sec-tag)');
        const heroCategory = hero?.querySelector('.sec-tag');
        if (heroSummary) heroSummary.textContent = summary;
        if (heroCategory && page.category) heroCategory.textContent = page.category;
      } else {
        container.append(element('header', { class: 'dynamic-page__header' },
          page.category ? element('p', { class: 'sec-tag', text: page.category }) : null,
          element('h1', { text: title }),
          element('p', { class: 'dynamic-page__summary', text: summary })
        ));
      }
    } else {
      container.append(element('header', { class: 'dynamic-page__header dynamic-page__header--supplement' },
        element('p', { class: 'verified-information__label', text: 'Current school information' }),
        element('h2', { text: String(page.title || '').slice(0, 180) }),
        element('p', { class: 'dynamic-page__summary', text: String(page.summary || '').slice(0, 600) })
      ));
    }
    const body = element('div', { class: 'dynamic-page__body' });
    (Array.isArray(page.blocks) ? page.blocks : []).forEach((block) => {
      const node = blockNode(block, mediaById); if (node) body.append(node);
    });
    container.append(body);
    if (page.nextReviewDate) container.append(element('p', { class: 'dynamic-page__review', text: `School review due ${page.nextReviewDate}` }));
    content.append(container);
    if (payload.mode === 'replace') main.replaceChildren(content);
    else main.prepend(content);
    document.documentElement.setAttribute('data-dynamic-page-state', 'current');
    updateMeta(page);
  }

  fetch(`/api/public/content/page-surface?path=${encodeURIComponent(path)}`, {
    method: 'GET', headers: { Accept: 'application/json' }, credentials: 'same-origin', cache: 'no-store'
  }).then(async (response) => {
    if (response.status === 404) return null;
    const body = await response.json().catch(() => null);
    if (!body || !response.ok) throw new Error('Dynamic page unavailable');
    return body;
  }).then((payload) => {
    if (!payload || payload.state !== 'current' || !payload.page || !['replace', 'supplement'].includes(payload.mode)) return;
    render(payload);
  }).catch(() => {
    // The complete reviewed static page is the fail-safe fallback. Publishing
    // system state is never shown to families.
  });
})();
