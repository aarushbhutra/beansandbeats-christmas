/* Generated from this template by pnpm build. Cache executable shells only. */
const CACHE_NAME = 'beansandbeats-shell-' + __BUILD_VERSION__;
const ASSETS = __BUILD_ASSETS__;
const PAGES = ['/', '/orders', '/barista', '/guest', '/ready', '/lead/menu', '/lead/reports'];
const FALLBACK = '/offline.html';
self.addEventListener('install', event => {
  // A failed warmup leaves the previous worker active. Do not interrupt in-flight work.
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll([...ASSETS, ...PAGES, FALLBACK])));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key.startsWith('beansandbeats-shell-') && key !== CACHE_NAME) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // API responses, credentials, Supabase traffic, query/RSC requests and mutations
  // always use the network. Fragments are never sent to this worker.
  if (request.method !== 'GET' || url.origin !== self.location.origin || url.search || request.headers.has('Authorization')) return;
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      const response = await fetch(request);
      if (response.ok) await cache.put(request, response.clone());
      return response;
    })());
  } else if (request.mode === 'navigate' && PAGES.includes(url.pathname)) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);
        let response;
        try { response = await fetch(request, {signal: controller.signal}); } finally { clearTimeout(timeout); }
        if (response.ok && response.headers.get('Content-Type')?.includes('text/html')) await cache.put(url.pathname, response.clone());
        if (response.ok) return response;
      } catch { /* Reopen the initialized application shell during a Wi-Fi drop. */ }
      return await cache.match(url.pathname) || await cache.match(FALLBACK) || Response.error();
    })());
  }
});
