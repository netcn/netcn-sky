/* 火烧云 service worker：页面离线可开，静态资源 cache-first，导航 network-first。 */
const VERSION = "sky-20261119f1";
const OFFLINE = "/offline.html";
const CORE = [
  "/",
  "/city/",
  "/events/",
  OFFLINE,
  "/manifest.webmanifest",
  "/assets/css/sky.css?v=20",
  "/assets/css/city.css?v=10",
  "/assets/css/events.css?v=5",
  "/assets/js/app.js?v=39",
  "/assets/js/sources.js?v=25",
  "/assets/js/scoring.js?v=27",
  "/assets/js/forecast.js?v=6",
  "/assets/js/cities.js?v=23",
  "/assets/js/astro.js?v=24",
  "/assets/js/live-map.js?v=25",
  "/assets/js/share-card.js?v=6",
  "/assets/js/city-page.js?v=17",
  "/assets/js/events-page.js?v=18",
  "/assets/js/events-feed.js?v=20261119c1",
  "/assets/vendor/leaflet/leaflet.js?v=1.9.4",
  "/assets/icon-192.png",
  "/assets/icon-512.png",
  "/shell/shell.js?v=20261119c5"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(VERSION).then((cache) =>
      Promise.allSettled(CORE.map((url) =>
        fetch(url, { cache: "reload" }).then((res) => {
          if (res && res.ok) return cache.put(url, res);
          return null;
        }).catch(() => null)
      ))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  // 只处理本站资源；天气/天文 API 请求保持直连，不写入缓存。
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/data/")) return;

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
        return res;
      }).catch(() => caches.match(req).then((hit) => hit || caches.match(OFFLINE)))
    );
    return;
  }

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/shell/") ||
      url.pathname === "/manifest.webmanifest" || url.pathname === "/favicon.ico") {
    event.respondWith(
      caches.match(req).then((hit) => {
        if (hit) return hit;
        return fetch(req).then((res) => {
          if (res && res.ok) {
            const copy = res.clone();
            caches.open(VERSION).then((cache) => cache.put(req, copy)).catch(() => {});
          }
          return res;
        }).catch(() => new Response("", {
          status: 504,
          statusText: "Gateway Timeout",
          headers: { "Content-Type": "text/plain; charset=utf-8" }
        }));
      })
    );
  }
});


