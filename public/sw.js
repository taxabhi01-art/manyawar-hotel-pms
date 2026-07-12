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

// Real push notifications — these fire even if the app tab is closed,
// as long as the browser/device is on and the person subscribed once.
self.addEventListener("push", (event) => {
  let payload = { title: "MANYAWAR HOTEL", body: "You have a new notification." };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch (e) {}
  event.waitUntil(
    (async () => {
      await self.registration.showNotification(payload.title, {
        body: payload.body,
        icon: "/icons/icon-192.png",
        badge: "/icons/icon-192.png",
        data: { url: payload.url || "/" },
      });
      // Tell any open tabs a push just arrived, so they can play a bell
      // sound too — the OS notification itself only makes its own sound
      // when the tab/app isn't already focused.
      const clientsList = await self.clients.matchAll({ type: "window" });
      clientsList.forEach((client) => client.postMessage({ type: "PUSH_RECEIVED" }));
    })()
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow(event.notification.data?.url || "/"));
});
