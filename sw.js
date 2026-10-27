/* Treasure Academy offline shell. Never cache private, operational or review routes. */
const CACHE = 'treasure-v20261027-run8';
const CORE = [
  '/', '/index.html', '/about.html', '/academics.html', '/admissions.html',
  '/contact.html', '/news.html', '/privacy.html', '/safeguarding.html', '/explore.html', '/search.html', '/404.html',
  '/assets/css/site.css?v=20261023-design1',
  '/assets/js/theme-init.js?v=20261023-design1', '/assets/js/visitor-insights.js?v=20261023-design1',
  '/assets/js/public-shell.js?v=20261023-design1',
  '/assets/img/icons.svg',
  '/assets/fonts/general-sans-400.woff2', '/assets/fonts/clash-display-600.woff2'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE)
      .then(cache => Promise.all(CORE.map(url => cache.add(url).catch(() => null))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => key !== CACHE).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

function isPrivate(pathname) {
  return pathname.startsWith('/portal/') ||
    pathname === '/developer.html' || pathname === '/developer-operations.html' ||
    pathname === '/developer-review' || pathname === '/developer-review.html' ||
    pathname === '/admission-form.html' || pathname === '/receipt.html' ||
    pathname === '/assets/js/developer-review.js' ||
    pathname === '/assets/js/developer-console.js' ||
    pathname === '/assets/css/developer-console.css' ||
    pathname === '/assets/js/portal-app.js' ||
    pathname === '/assets/js/cms-workspace-app.js' ||
    pathname === '/assets/js/cms-workspace.js' ||
    pathname === '/assets/js/cms-workspace-entry.js' ||
    pathname === '/assets/css/portal.css' ||
    pathname === '/assets/js/developer-experience.js' ||
    pathname === '/assets/js/experience-audit.js' ||
    pathname === '/assets/js/content-quality.js' ||
    pathname === '/assets/js/brand-assets.js' ||
    pathname === '/assets/data/review-gateway.enc.json';
}

function isDynamicPublicContent(pathname) {
  return /^\/(?:news|events|gallery)(?:\/|$)/.test(pathname) && pathname !== '/news.html';
}

async function cacheOk(request, response) {
  if (response && response.ok && response.type === 'basic') {
    const cache = await caches.open(CACHE);
    await cache.put(request, response.clone());
  }
  return response;
}

self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin || isPrivate(url.pathname) || url.pathname.startsWith('/_vercel/')) return;

  /* Public CMS responses are always network-only here. Their one-minute edge
     policy is controlled by the server so a service-worker cache cannot conceal
     an archive, consent withdrawal or emergency correction. */
  if (isDynamicPublicContent(url.pathname)) {
    event.respondWith(fetch(request).catch(() => new Response(
      request.mode === 'navigate'
        ? '<!doctype html><title>Temporarily unavailable</title><h1>Published information is temporarily unavailable</h1><p>Please reconnect or contact the school.</p>'
        : 'Published information is temporarily unavailable.',
      {status: 503, headers: {'Content-Type': request.mode === 'navigate' ? 'text/html; charset=utf-8' : 'text/plain; charset=utf-8', 'Cache-Control': 'no-store'}}
    )));
    return;
  }

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then(response => cacheOk(request, response))
        .catch(async () => (await caches.match(request, {ignoreSearch: true})) ||
          (await caches.match('/index.html')) ||
          new Response('<!doctype html><title>Offline</title><h1>You are offline</h1><p>Please reconnect to open this page.</p>', {
            status: 503, headers: {'Content-Type': 'text/html; charset=utf-8'}
          }))
    );
    return;
  }

  const isAsset = /\.(?:css|js|png|jpe?g|svg|webp|ico|woff2)$/i.test(url.pathname);
  if (!isAsset) return;

  /* Versioned requests are immutable by URL. Unversioned code uses network-first
     so a returning family receives safety fixes without clearing browser data. */
  if (url.search) {
    event.respondWith(
      caches.match(request).then(hit => hit || fetch(request).then(response => cacheOk(request, response)))
    );
  } else {
    event.respondWith(
      fetch(request)
        .then(response => cacheOk(request, response))
        .catch(() => caches.match(request))
    );
  }
});
