const CACHE_NAME = "jesunutri-pwa-v44";
const STATIC_ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./script.js",
  "./browser-local-backend.js",
  "./vendor/zxing-browser.min.js",
  "./logo.png",
  "./icon-192.png",
  "./icon-512.png",
  "./manifest.json"
];
const STATIC_PATHS = new Set([
  "/",
  "/index.html",
  "/styles.css",
  "/script.js",
  "/browser-local-backend.js",
  "/vendor/zxing-browser.min.js",
  "/logo.png",
  "/icon-192.png",
  "/icon-512.png",
  "/manifest.json"
]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => Promise.allSettled(STATIC_ASSETS.map((asset) => cache.add(asset))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response.ok) cache.put(request, response.clone());
    return response;
  } catch (error) {
    return (await cache.match(request)) || cache.match("./index.html");
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.hostname.includes("supabase.co")) return;
  if (event.request.method !== "GET") return;
  if (requestUrl.origin === self.location.origin && (
    requestUrl.pathname.startsWith("/api/") ||
    requestUrl.pathname.startsWith("/label-images/")
  )) return;

  if (event.request.mode === "navigate") {
    event.respondWith(networkFirst(event.request));
    return;
  }

  if (requestUrl.origin === self.location.origin) {
    if (!STATIC_PATHS.has(requestUrl.pathname)) return;
    if (requestUrl.pathname.endsWith(".js") || requestUrl.pathname.endsWith(".css")) {
      event.respondWith(networkFirst(event.request));
      return;
    }
    event.respondWith(cacheFirst(event.request));
  }
});
