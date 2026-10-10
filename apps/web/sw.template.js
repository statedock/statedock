const CACHE_NAME = "statedock-shell-__BUILD_ID__";
const PRECACHE_URLS = __PRECACHE_URLS__;

self.addEventListener("install", event => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches
      .keys()
      .then(keys =>
        Promise.all(
          keys
            .filter(key => key.startsWith("statedock-shell-") && key !== CACHE_NAME)
            .map(key => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", event => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/") ||
    url.pathname === "/mcp" ||
    url.pathname.startsWith("/auth/") ||
    url.pathname.startsWith("/oauth") ||
    url.pathname.startsWith("/.well-known/")
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/offline.html")));
    return;
  }

  if (
    url.pathname.startsWith("/assets/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(request).then(
        cached =>
          cached ||
          fetch(request).then(response => {
            if (response.ok)
              caches.open(CACHE_NAME).then(cache => cache.put(request, response.clone()));
            return response;
          })
      )
    );
  }
});

// OS Notification click handler: focus or open the StateDock window
self.addEventListener("notificationclick", event => {
  event.notification.close();
  const data = event.notification.data;
  const targetUrl = data?.projectId ? `/?project=${encodeURIComponent(data.projectId)}&task=${encodeURIComponent(data.reference)}` : "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clientList => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.postMessage({ type: "NAVIGATE_TO_PLAN", data });
          return client.focus();
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
