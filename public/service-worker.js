const CACHE_NAME = "meu-cartaozinho-static-v2";
const STATIC_ASSETS = ["/", "/manifest.webmanifest", "/icons/icon-192x192.png", "/icons/icon-512x512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) return caches.delete(key);
          return Promise.resolve();
        }),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (!["http:", "https:"].includes(requestUrl.protocol)) return;

  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put("/", copy).catch(() => {
              // Ignore unsupported schemes/non-cacheable requests.
            });
          });
          return response;
        })
        .catch(async () => {
          return (await caches.match(event.request)) || (await caches.match("/"));
        }),
    );
    return;
  }

  if (requestUrl.origin !== self.location.origin) return;

  const isStaticAsset = ["script", "style", "image", "font"].includes(event.request.destination);
  if (!isStaticAsset) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      const network = fetch(event.request)
        .then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, copy).catch(() => {
                // Ignore unsupported schemes/non-cacheable requests.
              });
            });
          }
          return response;
        })
        .catch(() => cached);
      return cached || network;
    }),
  );
});
