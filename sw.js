/* ============================================================
   Pulse — Service Worker
   Self-healing: when a new version activates it wipes every cache
   and force-reloads any open tab from the network, so a stale
   cached index.html can never keep serving old code.
   ============================================================ */

const SW_VERSION = '20260604c';

// Install: activate immediately, don't wait for old tabs to close
self.addEventListener('install', () => self.skipWaiting());

// Activate: nuke ALL caches, take control, then force a fresh reload of every open tab
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // 1. Delete every cache (not just old ones) — clears any stale stored responses
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));

    // 2. Take control of all open pages right away
    await self.clients.claim();

    // 3. Force every open tab to reload from the network with a cache-busting query,
    //    preserving the current route hash (e.g. #deal/abc/documents).
    //    This runs only once per SW version, so it cannot cause a reload loop.
    const clients = await self.clients.matchAll({ type: 'window' });
    for (const client of clients) {
      try {
        const u = new URL(client.url);
        u.searchParams.set('_swfresh', Date.now().toString());
        await client.navigate(u.href);
      } catch (_) { /* ignore tabs that can't be navigated */ }
    }
  })());
});

// Fetch: always pull HTML page navigations straight from the network, never a cache
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isHtmlPage =
    event.request.mode === 'navigate' ||
    path === '/' ||
    path.endsWith('/') ||
    path.endsWith('/index.html');

  if (isHtmlPage) {
    // Bypass every cache layer for the page shell so updates always land
    event.respondWith(
      fetch(event.request, { cache: 'no-store' })
        .catch(() => fetch(event.request)) // offline fallback
    );
  }
  // All other requests (JS, CSS, images, Firebase) flow through normally.
  // JS freshness is handled by the ?v= query strings in index.html.
});
