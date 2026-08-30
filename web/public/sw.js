/* RANDI web — service worker.
   - El propio /sw.js SIEMPRE va por red (network-first): garantiza que los
     cambios del app lleguen sin depender de una caché vieja.
   - Navegacion: network-first con fallback a index (offline).
   - Assets estaticos (/_astro/*.js/css): cache-first tras la primera carga.
   El cambio de CACHE fuerza la activacion de un nuevo SW y limpieza de viejos. */
const CACHE = 'randi-web-v2.0.6';
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

async function networkFirstNav(req) {
  try {
    const res = await fetch(req);
    if (res.ok) {
      const copy = res.clone();
      caches.open(CACHE).then((c) => c.put(req, copy));
    }
    return res;
  } catch {
    const hit = await caches.match(req);
    return hit || caches.match('/index.html');
  }
}

self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // El propio SW y las navegaciones SIEMPRE van a red (evita versiones viejas).
  if (url.pathname.endsWith('/sw.js') || request.mode === 'navigate' || url.pathname.startsWith('/model/')) {
    e.respondWith(networkFirstNav(request));
    return;
  }

  e.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit;
      return fetch(request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(request, copy));
        }
        return res;
      });
    }),
  );
});