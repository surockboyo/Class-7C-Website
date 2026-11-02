/* PROTECTED */
const CACHE_NAME = "ruang-kelas-shell-v17";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./assets/css/styles.css",
  "./assets/fonts/source-serif-4-latin.woff2",
  "./assets/js/app.js",
  "./assets/js/storage.js",
  "./assets/js/shared-storage.js",
  "./assets/js/supabase-client.js",
  "./assets/js/config.js",
  "./assets/vendor/supabase-js-2.118.0.js",
  "./assets/js/schedule.js",
  "./assets/js/owner-auth.js",
  "./assets/js/utils.js",
  "./assets/js/reports.js",
  "./assets/js/wheel.js",
  "./assets/js/gallery.js",
  "./assets/js/disc-math.js",
  "./assets/js/icons.js",
  "./data/default-data.json",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((name) => name.startsWith("ruang-kelas-shell-") && name !== CACHE_NAME).map((name) => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const requestedUrl = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);
  if (requestedUrl.origin !== scopeUrl.origin || !requestedUrl.href.startsWith(scopeUrl.href)) return;
  const isDocument = request.mode === "navigate" || requestedUrl.pathname.endsWith("/index.html") || requestedUrl.pathname === scopeUrl.pathname;
  const isPublishedData = requestedUrl.pathname.endsWith("/data/default-data.json");
  if (isDocument || isPublishedData) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(request);
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, fresh.clone());
        return fresh;
      } catch {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (isDocument) {
          const fallback = await caches.match(new URL("./index.html", scopeUrl).href);
          if (fallback) return fallback;
        }
        return new Response("Kamu sedang offline dan data ini belum tersimpan di perangkat.", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })());
    return;
  }
  event.respondWith((async () => {
    const cached = await caches.match(request);
    if (cached) return cached;
    try {
      const fresh = await fetch(request);
      if (fresh.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, fresh.clone());
      }
      return fresh;
    } catch (error) {
      throw error;
    }
  })());
});
/* END PROTECTED */
