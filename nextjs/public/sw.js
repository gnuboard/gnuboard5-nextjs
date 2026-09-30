/**
 * 서비스 워커 — 정적 자원 (JS/CSS/이미지/폰트) 네트워크-우선 + 폴백 캐시.
 *
 * CACHE_NAME 은 build-time 에 inject — scripts/inject-sw-version.mjs 가 빌드 직후
 * export 결과 해시 또는 G5_SW_CACHE_VERSION 값으로 치환.
 * Dev 모드에서는 자리표 그대로 동작해도 해 없음.
 */
const CACHE_VERSION = '__SW_CACHE_VERSION__'; // build-time replace
const CACHE_NAME = `gnuboard-${CACHE_VERSION}`;
const CACHEABLE_PUBLIC_ASSET_RE = /^\/(?:favicon\.ico|icon-[0-9]+\.png|og-default\.png|manifest\.json|manifest\.webmanifest|robots\.txt|sitemap(?:-posts)?\.xml|kcp-bridge\.html)$/;

function isCacheableStaticAsset(url) {
  if (url.origin !== self.location.origin) return false;
  if (url.pathname.startsWith('/_next/static/')) return true;
  return CACHEABLE_PUBLIC_ASSET_RE.test(url.pathname);
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  // API 호출은 캐싱하지 않음 — 항상 fresh 응답
  if (!isCacheableStaticAsset(url)) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // 200 OK 만 캐시. 4xx/5xx 가 캐시되어 offline 시 영구 노출되는 사고 차단.
        if (
          response.ok &&
          response.type === 'basic'
        ) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? Response.error()))
  );
});

function sameOriginNotificationPath(value) {
  if (typeof value !== 'string' || !value.trim()) return '/';

  try {
    const url = new URL(value, self.location.origin);
    if (url.origin !== self.location.origin) return '/';
    return `${url.pathname}${url.search}${url.hash}` || '/';
  } catch {
    return '/';
  }
}

/**
 * Web Push — 서버가 web-push 라이브러리로 발송한 payload 를 받아 노티 표시.
 *   payload (JSON): { title, body, url?, icon?, badge?, tag? }
 * 사용자가 알림 클릭 시 url 로 이동 (옵션).
 */
self.addEventListener('push', (event) => {
  if (!event.data) return;
  let payload;
  try {
    payload = event.data.json();
  } catch {
    payload = { title: '알림', body: event.data.text() };
  }
  const title = payload.title || '알림';
  const options = {
    body: payload.body || '',
    icon: payload.icon || '/icon-192.png',
    badge: payload.badge || '/icon-72.png',
    tag: payload.tag,
    data: { url: sameOriginNotificationPath(payload.url) },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = sameOriginNotificationPath(event.notification.data?.url);
  event.waitUntil(
    self.clients.matchAll({ type: 'window' }).then((clients) => {
      // 이미 열린 같은 origin 탭이 있으면 거기로 focus.
      for (const c of clients) {
        if (c.url.includes(self.location.origin) && 'focus' in c) {
          c.navigate(url);
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    })
  );
});
