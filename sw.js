/* ============================================================
   Pulse — Service Worker
   Forces index.html to always be fetched fresh from the network
   so the app never runs stale cached code after a deployment.
   ============================================================ */

const SW_VERSION = '20260428t';

// Install: activate immediately, don't wait for old tabs to close
self.addEventListener('install', () => self.skipWaiting());

// Activate: claim all open tabs right away + delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== SW_VERSION).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

// Fetch: intercept HTML page requests and always go to the network
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);

  // Only intercept same-origin requests
  if (url.origin !== self.location.origin) return;

  const path = url.pathname;
  const isHtmlPage =
    path.endsWith('/') ||
    path.endsWith('/index.html') ||
    path === self.registration.scope.replace(self.location.origin, '').replace(/\/$/, '');

  if (isHtmlPage) {
    // Always fetch the page from the network, bypassing every cache layer
    event.respondWith(
      fetch(event.request, { cache: 'no-cache' })
        .catch(() => fetch(event.request))   // offline fallback
    );
  }
  // All other requests (JS, CSS, images, Firebase) flow through normally
});
