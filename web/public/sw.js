/* RANDI web — service worker (caché runtime del SPA estático). */
const CACHE = 'randi-web-v2.0.0';
const SHELL = ['/', '/index.html', '/models', '/tier', '/compare', '/chat'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('randi-') && k !== CACHE).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  // /api/* y /__astro/* deben ir siempre a red
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(request, copy));
          }
          return res;
        })
        .catch(() => {
          // offline: navegacion -> index
          if (request.mode === 'navigate') return caches.match('/index.html');
          if (url.pathname.startsWith('/model/')) return caches.match('/index.html');
          return Response.error();
        });
    }),
  );
});