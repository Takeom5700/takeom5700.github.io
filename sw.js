const CACHE_NAME = "takeom5700-portal-v36";
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

/* オフライン用に取っておく価値があるものだけをキャッシュする。

   以前は「成功したGETは全部 cache.put する」実装だったが、それだと
   占いダッシュボードのチャットが叩く chat-status/<jobId> のように
   毎回URLが変わるAPIの応答まで溜め込んでしまい、二度と使われない
   エントリがCACHE_NAMEを上げるまで際限なく残り続けていた。
   同一オリジンの、APIではないGETだけを保存する。 */
function isCacheable(request) {
  if (request.method !== "GET") return false;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return false;  // フォント等の外部リソースは除く
  if (/^\/api\//.test(url.pathname)) return false;
  return true;
}

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
        if (response.ok && isCacheable(event.request)) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
