(() => {
  'use strict';
  if (location.pathname !== '/shop') return;
  const main = document.querySelector('main');
  if (!main) return;
  const labels = {
    in_stock: 'In stock', low_stock: 'Low stock', out_of_stock: 'Out of stock',
    temporarily_unavailable: 'Temporarily unavailable', not_currently_offered: 'Not currently offered'
  };
  function node(tag, attrs = {}, ...children) {
    const item = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === null || value === undefined || value === false) return;
      if (key === 'class') item.className = value;
      else if (key === 'text') item.textContent = value;
      else item.setAttribute(key, String(value));
    });
    children.flat().forEach((child) => { if (child !== null && child !== undefined) item.append(child instanceof Node ? child : document.createTextNode(String(child))); });
    return item;
  }
  function shell(title, description, state) {
    return node('section', { class: 'inventory-availability', 'data-inventory-state': state, 'aria-labelledby': 'inventory-availability-title' },
      node('div', { class: 'container' }, node('p', { class: 'verified-information__label', text: 'Office-confirmed availability' }), node('h2', { id: 'inventory-availability-title', text: title }), node('p', { text: description })));
  }
  function current(items) {
    const section = shell('Current school-material availability', 'These states come from reconciled office records. The public page does not reserve stock; linked parents use the secure portal.', 'current');
    const container = section.querySelector('.container');
    const grid = node('div', { class: 'inventory-availability__grid' });
    items.forEach((item) => {
      const classes = Array.isArray(item.eligibleClasses) && item.eligibleClasses.length ? `For ${item.eligibleClasses.join(', ')}` : '';
      grid.append(node('article', { class: 'inventory-item' },
        node('h3', { text: item.name }),
        node('p', { text: [item.variant, item.size, classes].filter(Boolean).join(' · ') || 'Standard item' }),
        item.description ? node('p', { text: item.description }) : null,
        node('span', { class: 'inventory-state', text: labels[item.availability] || 'Temporarily unavailable' })
      ));
    });
    container.append(grid); return section;
  }
  fetch('/api/public/inventory', { headers: { Accept: 'application/json' }, cache: 'no-store', credentials: 'same-origin' })
    .then(async (response) => {
      if (response.status === 404) return null;
      const payload = await response.json().catch(() => null);
      if (!payload) throw new Error('Invalid inventory response');
      if (!response.ok) throw new Error(payload.message || 'Unavailable');
      return payload;
    })
    .then((payload) => {
      if (!payload) return;
      main.prepend(payload.state === 'current' && Array.isArray(payload.items) && payload.items.length
        ? current(payload.items)
        : shell('No public catalogue is currently available', 'No office-reconciled item is currently published. Contact the school rather than relying on an old price or stock list.', 'empty'));
    })
    .catch(() => main.prepend(shell('Verified availability is temporarily unavailable', 'The website will not guess about products, prices or stock. Contact the school office for current guidance.', 'unavailable')));
})();
