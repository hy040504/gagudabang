// 정적 셸만 캐시. /api(개인정보·사진 포함)는 절대 캐시하지 않는다.
const CACHE = 'gagudabang-shell-v6';
const SHELL = ['/', '/admin.html', '/styles/tokens.css', '/styles/customer.css', '/styles/admin.css', '/styles/responsive.css', '/assets/brand/icon.svg', '/assets/brand/logo.svg', '/assets/fonts/PretendardVariable.woff2'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // 네트워크 우선, 실패 시 캐시 (오프라인이면 마지막 셸 표시)
  e.respondWith(fetch(e.request).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
