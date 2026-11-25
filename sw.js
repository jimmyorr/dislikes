importScripts("version.js?v=2.0.5");
const CACHE_NAME = `dislikes-v${APP_VERSION}`;
const ASSETS = [
  "./",
  "./index.html",
  "./privacy.html",
  "./styles.css",
  "./version.js",
  "./app.js",
  "./manifest.json",
  "./icon.png",
];

self.addEventListener("install", (event) => {
  // Force this SW to activate immediately
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)),
  );
});

self.addEventListener("activate", (event) => {
  // Take control of all open clients immediately
  event.waitUntil(clients.claim());

  // Delete old caches
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName.startsWith("dislikes-v")) {
            return caches.delete(cacheName);
          }
        }),
      );
    }),
  );
});

self.addEventListener("fetch", (event) => {
  // Only intercept same-origin GET requests for the app shell;
  // leave cross-origin requests (Google APIs, YouTube player/thumbnails, analytics, CDNs) untouched.
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    (async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      try {
        const response = await fetch(event.request, {
          signal: controller.signal,
          cache: "no-cache",
        });
        clearTimeout(timeoutId);
        if (response.ok && !url.pathname.endsWith("/likes.json")) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        }
        return response;
      } catch (err) {
        clearTimeout(timeoutId);
        const cached =
          (await caches.match(event.request)) ||
          (await caches.match(event.request, { ignoreSearch: true }));
        if (cached) return cached;
        throw err;
      }
    })(),
  );
});
