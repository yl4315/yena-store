// 예나의 앱 가게 서비스 워커: 홈 화면에서 열 때 인터넷이 없어도 마지막으로 받은 화면이 보이게 한다.
// - 이 페이지와 같은 출처(yl4315.github.io/yena-store/) 파일만 다룬다.
// - 네트워크와 3.5초를 겨룬다 (CR-255 KIT-11 느린 망): 3.5초 안에 오면 그것을 주고 저장분을 새로 바꾼다.
//   3.5초가 지나도 안 오면 저장분이 있을 때 그것을 먼저 주고, 네트워크는 끝까지 받아 저장분만 새로 바꾼다.
//   저장분이 없으면 네트워크를 계속 기다린다. 네트워크가 끊기면 저장분 (없으면 첫 화면).
// - 저장분을 먼저 준 apps.json이 늦게 와서 달라졌으면 열린 화면에 'yena-store-updated'를 한 번 알린다 → app.js가 한 번 다시 그린다.
// - api.github.com(캘린더 버전)·설치 파일(APK)·글꼴처럼 다른 출처는 건드리지 않는다 (브라우저가 그대로 받음).
// - 파일 목록이나 방식을 바꾸면 CACHE 숫자를 올린다 → 옛 저장분은 activate에서 지운다 (v3: CR-255 3.5초 방식).
const CACHE = 'yena-store-v3';
const SLOW_MS = 3500;
const UPDATED = 'yena-store-updated';
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

function fromCache(req) {
  return caches.match(req, { ignoreSearch: true });
}

// 네트워크가 끊겼을 때: 저장분 → (페이지 열기면) 첫 화면 → 오류
function offline(req) {
  return fromCache(req).then((hit) => hit || (req.mode === 'navigate' ? caches.match('./index.html') : Response.error()));
}

async function readText(res) {
  try {
    return res ? await res.text() : null;
  } catch {
    return null;
  }
}

// 받은 것을 저장분에 넣는다. 저장분을 먼저 준 apps.json이 달라졌으면 열린 화면에 한 번 알린다.
async function save(req, url, copy, cacheWentFirst) {
  const cache = await caches.open(CACHE);
  const isList = url.pathname.endsWith('/apps.json');
  const before = isList ? await readText(await cache.match(req, { ignoreSearch: true })) : null;
  const after = isList ? await readText(copy.clone()) : null;
  await cache.put(req, copy);
  if (!isList || !cacheWentFirst() || before === null || before === after) return;
  const windows = await self.clients.matchAll({ type: 'window' });
  for (const w of windows) w.postMessage({ type: UPDATED });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  let cacheFirst = false; // 3.5초가 지나 저장분을 먼저 줬는지
  const network = fetch(req).then((res) => {
    if (res.ok && res.type === 'basic') e.waitUntil(save(req, url, res.clone(), () => cacheFirst).catch(() => {}));
    return res;
  });
  // 저장분을 먼저 줘도 네트워크가 끝날 때까지 워커를 살려 둔다 (끝나면 저장분을 새로 바꿈)
  e.waitUntil(network.then(() => {}, () => {}));

  e.respondWith(
    new Promise((resolve) => {
      let done = false;
      const give = (res) => {
        if (done) return;
        done = true;
        resolve(res);
      };
      const timer = setTimeout(() => {
        fromCache(req).then(
          (hit) => {
            if (!hit || done) return; // 저장분이 없으면 네트워크를 계속 기다린다
            cacheFirst = true;
            give(hit);
          },
          () => {},
        );
      }, SLOW_MS);
      network.then(
        (res) => {
          clearTimeout(timer);
          give(res);
        },
        () => {
          clearTimeout(timer);
          offline(req).then(give, () => give(Response.error()));
        },
      );
    }),
  );
});
