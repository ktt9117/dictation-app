const CACHE_NAME = "dictation-v1";
const ASSETS_TO_CACHE = ["/", "/index.html", "/manifest.json"];

// 설치: 필수 자산 캐싱
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log("[SW] 자산 캐싱 중…");
      return cache.addAll(ASSETS_TO_CACHE).catch(() => {
        // 일부 자산 실패 무시 (네트워크 먼저 시도)
      });
    })
  );
  self.skipWaiting(); // 즉시 활성화
});

// 활성화: 이전 캐시 정리
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((names) => {
      return Promise.all(
        names.map((name) => {
          if (name !== CACHE_NAME) {
            console.log("[SW] 이전 캐시 삭제:", name);
            return caches.delete(name);
          }
        })
      );
    })
  );
  self.clients.claim(); // 즉시 제어
});

// Fetch: 네트워크 우선, 실패 시 캐시
self.addEventListener("fetch", (e) => {
  // 범위 외 요청 무시
  if (!e.request.url.startsWith(self.location.origin)) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        // 성공한 응답을 캐시에 업데이트 (최신 유지)
        if (res && res.status === 200) {
          const cache = caches.open(CACHE_NAME);
          cache.then((c) => c.put(e.request, res.clone()));
        }
        return res;
      })
      .catch(() => {
        // 네트워크 실패 시 캐시에서 응답
        return caches.match(e.request);
      })
  );
});
