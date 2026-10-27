(() => {
  'use strict';
  const topicsByPath = {
    '/admissions': ['admission_procedure', 'admissions', 'class_availability'],
    '/admission-form': ['admission_procedure', 'admissions', 'class_availability'],
    '/academics': ['class_progression'],
    '/contact': ['school_hours', 'address'],
    '/privacy': ['public_policy'],
    '/safeguarding': ['public_policy'],
    '/fees': ['fees'],
    '/calendar': ['calendar'],
    '/exams': ['exam_timetable'],
    '/transport': ['transport'],
    '/uniform': ['uniform'],
    '/poster': ['uniform', 'supplies'],
    '/shop': ['supplies'],
    '/pta': ['pta'],
    '/news': ['events', 'general_notice'],
    '/board': ['general_notice'],
    '/request-centre': ['general_notice']
  };
  const topics = topicsByPath[location.pathname];
  if (!topics) return;

  fetch('/api/public-information', { headers: { Accept: 'application/json' }, cache: 'no-store' })
    .then((response) => response.ok ? response.json() : null)
    .then((payload) => {
      const items = Array.isArray(payload?.items) ? payload.items.filter((item) => topics.includes(item.topic)) : [];
      if (!items.length) return;
      const main = document.querySelector('main');
      if (!main) return;
      const section = document.createElement('section');
      section.className = 'verified-information';
      section.setAttribute('aria-labelledby', 'verified-information-title');
      const container = document.createElement('div');
      container.className = 'container';
      const label = document.createElement('p');
      label.className = 'verified-information__label';
      label.textContent = 'Verified school information';
      const heading = document.createElement('h2');
      heading.id = 'verified-information-title';
      heading.textContent = items.length === 1 ? 'Current school update' : 'Current school updates';
      const cards = document.createElement('div');
      cards.className = 'verified-information__grid';
      items.slice(0, 4).forEach((item) => {
        const article = document.createElement('article');
        const title = document.createElement('h3');
        title.textContent = item.title;
        const summary = document.createElement('p');
        summary.textContent = item.summary;
        const meta = document.createElement('small');
        meta.textContent = `Revision ${item.revision}${item.effective_until ? ` · valid until ${item.effective_until}` : ''}`;
        article.append(title, summary, meta);
        cards.append(article);
      });
      container.append(label, heading, cards);
      section.append(container);
      main.prepend(section);
    })
    .catch(() => {});
})();
