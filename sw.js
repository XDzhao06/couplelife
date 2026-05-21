// Service Worker — 我们的小窝
// 缓存策略：App Shell Cache First + CDN 长期缓存 + Firebase 不缓存
const CACHE_APP = 'app-shell-v4';
const CACHE_CDN = 'cdn-lib-v1';

const APP_SHELL = [
  '/',
  '/index.html'
];

const CDN_PATTERNS = [
  /cdn\.tailwindcss\.com/,
  /cdnjs\.cloudflare\.com/,
  /cdn\.sheetjs\.com/,
  /www\.gstatic\.com\/firebasejs/
];

// ===== Install: 预缓存 App Shell =====
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_APP).then(cache => cache.addAll(APP_SHELL).catch(e => console.warn('SW预缓存失败:', e)))
  );
  self.skipWaiting();
});

// ===== Activate: 清理旧缓存 =====
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => {
      return Promise.all(
        keys.filter(k => k !== CACHE_APP && k !== CACHE_CDN).map(k => caches.delete(k))
      );
    })
  );
  self.clients.claim();
});

// ===== Fetch: 分策略响应 =====
self.addEventListener('fetch', event => {
  const url = event.request.url;

  // 跳过 Firebase / firebaseio 请求（走网络，不缓存）
  if (/firebaseio\.com|firebasedatabase\.app/.test(url)) return;

  // 跳过 chrome-extension 等非 http 请求
  if (!url.startsWith('http')) return;

  // CDN 资源：Cache First
  const isCDN = CDN_PATTERNS.some(p => p.test(url));
  if (isCDN) {
    event.respondWith(
      caches.open(CACHE_CDN).then(cache => {
        return cache.match(event.request).then(cached => {
          const fetchPromise = fetch(event.request).then(response => {
            if (response && response.status === 200) {
              cache.put(event.request, response.clone());
            }
            return response;
          }).catch(() => cached);
          return cached || fetchPromise;
        });
      })
    );
    return;
  }

  // App Shell (HTML)：Network First 然后回退到缓存
  // 确保用户始终获得最新版本，离线时用缓存
  event.respondWith(
    fetch(event.request).then(response => {
      if (response && response.status === 200) {
        const clone = response.clone();
        caches.open(CACHE_APP).then(cache => cache.put(event.request, clone));
        return response;
      }
      return caches.match(event.request);
    }).catch(() => caches.match(event.request))
  );
});
