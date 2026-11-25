const SW_VERSION = "2.1.0";
const CACHE_NAME = `dislikes-v${SW_VERSION}`;
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
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        ASSETS.map((url) =>
          fetch(new Request(url, { cache: "reload" })).then((res) => {
            if (res.ok) return cache.put(url, res);
          }),
        ),
      );
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name.startsWith("dislikes-v"))
          .map((name) => caches.delete(name)),
      );
      await self.clients.claim();
      const allClients = await self.clients.matchAll({ type: "window" });
      for (const client of allClients) {
        client.postMessage({ type: "SW_ACTIVATED", version: SW_VERSION });
      }
    })(),
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
