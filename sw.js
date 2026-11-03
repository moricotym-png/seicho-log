// 画面のファイルをスマホに保存して、電波がなくても開けるようにする
const CACHE = 'seicho-log-v33';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'vendor/anthropic-sdk-0.135.0.mjs'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))));
  self.clients.claim();
});

// ネットにつながるときは最新版、つながらないときは保存版
// （スマホの一時保存を通さずに、毎回サーバーに新しい版があるか確かめる）
self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const sameSite = new URL(e.request.url).origin === self.location.origin;
  e.respondWith(
    fetch(sameSite ? new Request(e.request.url, { cache: 'no-cache', credentials: 'same-origin' }) : e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
