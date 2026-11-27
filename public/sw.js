// 정적 셸만 캐시. /api(개인정보·사진 포함)는 절대 캐시하지 않는다.
const CACHE = 'gagudabang-shell-v18';
const SHELL = ['/', '/admin', '/styles/tokens.css', '/styles/base.css', '/styles/customer.css', '/styles/admin.css', '/assets/brand/icon.svg', '/assets/brand/logo.svg', '/assets/fonts/PretendardVariable.woff2'];
self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())));
self.addEventListener('activate', (e) => e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin || url.pathname.startsWith('/api/')) return;
  // 네트워크 우선, 실패 시 캐시 (오프라인이면 마지막 셸 표시).
  // cache: 'no-cache' = 브라우저 저장본이 있어도 서버에 최신인지 묻는다. 배포 직후 예전 화면 코드와 새 API가 섞이지 않게 한다.
  // 페이지 이동(navigate) 요청은 옵션을 붙여 다시 만들 수 없어 그대로 보낸다 (HTML은 서버가 원래 no-cache로 보낸다).
  e.respondWith((e.request.mode === 'navigate' ? fetch(e.request) : fetch(e.request, { cache: 'no-cache' })).then((r) => { if (r.ok) { const copy = r.clone(); caches.open(CACHE).then((c) => c.put(e.request, copy)); } return r; }).catch(() => caches.match(e.request)));
});
