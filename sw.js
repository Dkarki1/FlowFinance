/**
 * Service worker.
 *
 * The whole app is one file, so how index.html is cached decides whether an
 * update ever reaches you. It used to be served cache-first from a cache whose
 * name only changed by hand — which meant every deploy was invisible on an
 * installed copy until someone remembered to bump a constant. Several updates
 * shipped and were never seen.
 *
 * The app shell is now network-first with a cache fallback: you always get the
 * current version when online, and the last good copy when not. Static assets
 * that don't change (icons, manifest) stay cache-first, which is what
 * cache-first is actually for.
 *
 * Bump CACHE_VERSION only to force old caches out; correctness no longer
 * depends on remembering to.
 */

const CACHE_VERSION = 'v5';
const CACHE_NAME = `flowfinance-${CACHE_VERSION}`;

// Only genuinely static things belong here. index.html deliberately does not:
// pre-caching it would put a copy in front of the network again.
const ASSETS = ['/icon-192.png', '/icon-512.png', '/manifest.json'];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

/** The app shell — anything that should reflect the latest deploy. */
function isAppShell(request, url) {
  return (
    request.mode === 'navigate' ||
    url.pathname === '/' ||
    url.pathname.endsWith('/index.html') ||
    url.pathname.endsWith('/sw.js')
  );
}

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Firebase: never serve auth or database traffic from a cache.
  if (url.hostname.includes('firebase') || url.hostname.includes('google')) {
    event.respondWith(
      fetch(event.request).catch(() => caches.match(event.request))
    );
    return;
  }

  // App shell: network first, so a deploy lands on the next load. The cached
  // copy is kept up to date behind it and is what you get offline.
  if (isAppShell(event.request, url)) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(hit => hit || caches.match('/index.html'))
        )
    );
    return;
  }

  // Everything else: cache first, since it doesn't change between deploys.
  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) return cached;
      return fetch(event.request).then(response => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
