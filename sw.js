// Service Worker：版本化预缓存 + 缓存优先
// ⚠️ 每次发布新版本时，把 CACHE_VERSION 加一
const CACHE_VERSION = 'fitness-v1.0.0';
const CACHE_NAME = `${CACHE_VERSION}-static`;

// 预缓存资源（相对路径，兼容 GitHub Pages 子路径）
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './js/app.js',
  './js/router.js',
  './js/utils.js',
  './js/storage.js',
  './js/exercises.js',
  './js/workout.js',
  './js/timer.js',
  './js/charts.js',
  './js/plans.js',
  './js/export.js',
  './js/ui/views.js',
  './js/ui/views2.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-512.png',
  // CDN 依赖（Chart.js）：缓存后离线可用
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.9/dist/chart.umd.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(PRECACHE))
      .catch(err => console.warn('[SW] 预缓存部分失败（CDN 可能不可达）', err))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);

  // 导航请求：网络优先（拿新版本），失败回退缓存
  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put('./index.html', copy));
          return res;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }

  // 静态资源：缓存优先
  if (url.origin === location.origin || url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then(c => c.put(req, copy));
        }
        return res;
      }))
    );
  }
});
