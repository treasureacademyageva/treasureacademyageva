(() => {
  const grid = document.getElementById('newsGrid');
  const eventBar = document.getElementById('calCount');
  if (!grid || !eventBar) return;

  function card(item) {
    const link = document.createElement('a');
    link.className = 'ne-card clip-up is-active';
    link.href = item.canonical_path;
    const body = document.createElement('div');
    body.className = 'body';
    const meta = document.createElement('div');
    meta.className = 'ne-meta';
    const badge = document.createElement('span');
    badge.className = 'badge b-sky';
    badge.textContent = item.content_type === 'event' ? 'EVENT' : 'NEWS';
    const reviewed = document.createElement('span');
    reviewed.textContent = 'Reviewed school update';
    meta.append(badge, reviewed);
    const title = document.createElement('h3');
    title.textContent = item.title;
    const summary = document.createElement('p');
    summary.textContent = item.summary;
    const action = document.createElement('b');
    action.textContent = item.content_type === 'event' ? 'Open event details →' : 'Read the update →';
    body.append(meta, title, summary, action);
    link.append(body);
    return link;
  }

  function empty(message) {
    const node = document.createElement('div');
    node.className = 'empty';
    node.textContent = message;
    return node;
  }

  function alertPlacement(item) {
    document.querySelector('[data-cms-home-alert]')?.remove();
    if (!item) return;
    const aside = document.createElement('aside');
    aside.dataset.cmsHomeAlert = '';
    aside.className = 'container';
    aside.setAttribute('aria-label', 'Current school alert');
    const link = document.createElement('a');
    link.className = 'count-bar';
    link.href = item.canonical_path;
    const copy = document.createElement('span');
    const title = document.createElement('b');
    title.textContent = item.title;
    copy.append(title, document.createTextNode(` ${item.summary}`));
    const arrow = document.createElement('span');
    arrow.style.marginLeft = 'auto';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '→';
    link.append(copy, arrow);
    aside.append(link);
    const section = document.getElementById('news');
    section?.parentNode?.insertBefore(aside, section);
  }

  fetch('/api/public/content/placements', { cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' } })
    .then(async (response) => {
      if (response.status === 404) return null;
      const data = await response.json().catch(() => ({}));
      if (!response.ok || data.available !== true) throw new Error('placements_unavailable');
      return data;
    })
    .then((data) => {
      if (!data) return;
      const news = Array.isArray(data.slots?.news) ? data.slots.news.slice(0, 3) : [];
      const events = Array.isArray(data.slots?.event) ? data.slots.event.slice(0, 3) : [];
      if (news.length) {
        grid.classList.remove('ne-track');
        grid.classList.add('cms-home-placements');
        grid.replaceChildren(...news.map(card));
      }
      const currentEvent = events[0];
      if (currentEvent) {
        const link = document.createElement('a');
        link.className = 'count-bar';
        link.href = currentEvent.canonical_path;
        const copy = document.createElement('span');
        const title = document.createElement('b');
        title.textContent = currentEvent.title;
        copy.append(title, document.createTextNode(` ${currentEvent.summary}`));
        const arrow = document.createElement('span');
        arrow.style.marginLeft = 'auto';
        arrow.setAttribute('aria-hidden', 'true');
        arrow.textContent = '→';
        link.append(copy, arrow);
        eventBar.replaceChildren(link);
      }
      alertPlacement(Array.isArray(data.slots?.alert) ? data.slots.alert[0] : null);
    })
    .catch(() => {
      // Optional current additions must not displace the reviewed static page.
    });
})();
