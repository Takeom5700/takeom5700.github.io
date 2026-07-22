const CACHE_NAME = "takeom5700-portal-v22";
const PRECACHE_URLS = [
  "/",
  "/index.html",
  "/manifest.json",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

/* ネットワーク優先＋ブラウザのHTTPキャッシュも明示的にバイパス。
   前回「network-firstにした」だけでは不十分だった: fetch()に
   cacheオプションを指定しないと、GitHub PagesのCache-Control
   (max-age=600)により、SW自身のfetchがブラウザのHTTPキャッシュから
   古い応答を受け取ってしまうことがある。no-storeで確実にネットワーク
   まで到達させる。オフライン時のみCache Storageにフォールバック */
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request, { cache: "no-store" })
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
