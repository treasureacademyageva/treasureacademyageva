(function () {
  'use strict';
  var root = document.getElementById('graduate-wall-list');
  if (!root) return;

  function card(item) {
    var article = document.createElement('article');
    article.className = 'mv-card graduate-wall-card';
    var title = document.createElement('h3');
    title.textContent = item.public_name;
    var session = document.createElement('p');
    var strong = document.createElement('strong');
    strong.textContent = 'Graduation session: ';
    session.append(strong, document.createTextNode(item.graduation_session));
    article.append(title, session);
    if (item.public_message) {
      var message = document.createElement('p');
      message.textContent = item.public_message;
      article.append(message);
    }
    return article;
  }

  fetch('/api/public/graduates', {
    method: 'GET', headers: { Accept: 'application/json' }, cache: 'no-store'
  }).then(function (response) {
    if (response.status === 404) return { graduates: [] };
    if (!response.ok) throw new Error('unavailable');
    return response.json();
  }).then(function (payload) {
    var graduates = Array.isArray(payload.graduates) ? payload.graduates : [];
    if (!graduates.length) return;
    root.replaceChildren();
    graduates.forEach(function (item) {
      if (item && item.public_name && item.graduation_session) root.append(card(item));
    });
  }).catch(function () {
    /* Keep the truthful static fallback. Never replace it with unverified data. */
  });
})();
