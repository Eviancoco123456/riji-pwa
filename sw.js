// Service Worker：离线缓存版（装好后纯本地运行，平时不连托管服务器）
// 设计要点：
// 1. 预缓存全部网页资源（HTML/JS/CSS/图标），同源 GET 走 cache-first → 装好后断网也能打开。
// 2. 千问识别请求(dashscope) 直连、不缓存、不转发 → 保证实时识别，也避免此前 "FetchEvent Load failed"。
// 3. 缓存名带版本号(VERSION)，部署新版本时改 VERSION 即可整体刷新，不会卡在旧代码。
const VERSION = 'riji-v1';
const PRECACHE = [
  './',
  'index.html',
  'manifest.json',
  'css/style.css',
  'js/config.js',
  'js/store.js',
  'js/homework.js',
  'js/grading.js',
  'js/wrongbook.js',
  'js/weakpoints.js',
  'js/app.js',
  'assets/icon-192.png',
  'assets/icon-512.png',
  'assets/icon-maskable-512.png',
  'assets/apple-touch-icon.png'
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION)
      .then((c) => c.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // 千问视觉识别（跨域）直连，不缓存、不拦截
  if (url.hostname.includes('dashscope')) return;
  // 同源静态资源：cache-first，命中即本地返回（离线可用）；未命中则联网取并缓存
  if (url.origin === self.location.origin) {
    e.respondWith(
      caches.match(req).then((cached) => {
        if (cached) return cached;
        return fetch(req)
          .then((res) => {
            if (res && res.status === 200 && res.type === 'basic') {
              const cp = res.clone();
              caches.open(VERSION).then((c) => c.put(req, cp));
            }
            return res;
          })
          .catch(() => cached);
      })
    );
  }
  // 其他跨域请求：直连
});
