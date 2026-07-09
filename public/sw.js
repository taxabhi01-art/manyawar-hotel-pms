// Minimal service worker — mainly here so the browser treats this as an
// installable app. It caches nothing sensitive (no API calls, no images
// with guest data) and just passes network requests through as normal.
self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  // Pass-through — always use the network. This app relies on live,
  // real-time data (bookings, payments), so we deliberately don't cache
  // API responses. This just satisfies the "has a fetch handler" check
  // some browsers use to decide whether an app can be installed.
  event.respondWith(fetch(event.request));
});
