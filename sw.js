// 예나의 앱 가게 서비스 워커: 홈 화면에서 열 때 인터넷이 없어도 마지막으로 받은 화면이 보이게 한다.
// - 이 페이지와 같은 출처(yl4315.github.io/yena-store/) 파일만 다룬다: 네트워크 먼저 → 안 되면 저장해 둔 것.
// - api.github.com(캘린더 버전)·설치 파일(APK)·글꼴처럼 다른 출처는 건드리지 않는다 (브라우저가 그대로 받음).
// - 파일 목록이나 방식을 바꾸면 CACHE 숫자를 올린다 → 옛 저장분은 activate에서 지운다.
const CACHE = 'yena-store-v2';
const SHELL = [
  './',
  './index.html',
  './style.css',
  './tokens.css',
  './boot.js',
  './haptics.js',
  './app.js',
  './store-core.js',
  './apps.json',
  './manifest.webmanifest',
];

self.addEventListener('install', (e) => {
  // 하나가 없어도(예: 아이콘을 아직 안 넣음) 나머지는 저장한다
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => Promise.allSettled(SHELL.map((url) => c.add(url))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('yena-store-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          e.waitUntil(caches.open(CACHE).then((c) => c.put(req, copy)));
        }
        return res;
      })
      .catch(() =>
        caches
          .match(req, { ignoreSearch: true })
          .then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error())),
      ),
  );
});
