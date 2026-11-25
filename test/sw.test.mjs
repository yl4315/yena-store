// CR-255 6-3 KIT-11 느린 망: sw.js를 vm에 넣고 가짜 self·caches·fetch·시계로 돌린다 (설치 0, 진짜 네트워크 0).
import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// 타이머를 잘못 바꾸면 답이 영영 안 와서 시험이 멈출 수 있다 → 5초 넘으면 실패로
const test = (name, fn) => nodeTest(name, { timeout: 5000 }, fn);

const SRC = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const SCOPE = 'https://store.example.test/yena-store/';
const LIST = `${SCOPE}apps.json`;

class FakeResponse {
  constructor(body, { ok = true, type = 'basic' } = {}) {
    this.body = body;
    this.ok = ok;
    this.type = type;
  }
  clone() {
    return new FakeResponse(this.body, { ok: this.ok, type: this.type });
  }
  async text() {
    return this.body;
  }
  static error() {
    return new FakeResponse(null, { ok: false, type: 'error' });
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
}

const keyOf = (req, ignoreSearch) => {
  const u = new URL(typeof req === 'string' ? req : req.url, SCOPE);
  if (ignoreSearch) u.search = '';
  return u.href;
};

/** 가짜 서비스 워커 세상. net = 주소마다 { promise, resolve, reject } (테스트가 답할 때를 정함) */
function world({ cached = {}, oldCaches = [] } = {}) {
  const stores = new Map();
  const cacheOf = (name) => {
    if (!stores.has(name)) stores.set(name, new Map());
    const m = stores.get(name);
    return {
      match: async (req, o = {}) => m.get(keyOf(req, o.ignoreSearch)),
      put: async (req, res) => {
        m.set(keyOf(req, true), res);
      },
      add: async (url) => {
        m.set(keyOf(url, true), new FakeResponse(`설치 때 ${url}`));
      },
    };
  };
  for (const name of oldCaches) cacheOf(name);
  const w = {
    stores,
    handlers: {},
    timers: [],
    messages: [],
    fetches: [],
    net: new Map(),
  };
  const caches = {
    open: async (name) => cacheOf(name),
    match: async (req, o = {}) => {
      for (const m of stores.values()) {
        const hit = m.get(keyOf(req, o.ignoreSearch));
        if (hit) return hit;
      }
      return undefined;
    },
    keys: async () => [...stores.keys()],
    delete: async (name) => stores.delete(name),
  };
  const self = {
    location: { origin: new URL(SCOPE).origin },
    addEventListener: (type, fn) => {
      w.handlers[type] = fn;
    },
    skipWaiting: async () => {},
    clients: {
      claim: async () => {},
      matchAll: async () => [{ postMessage: (m) => w.messages.push(m) }],
    },
  };
  const ctx = {
    self,
    caches,
    URL,
    Response: FakeResponse,
    fetch: (req) => {
      w.fetches.push(req.url);
      const d = deferred();
      w.net.set(req.url, d);
      return d.promise;
    },
    setTimeout: (fn, ms) => {
      w.timers.push({ fn, ms, live: true });
      return w.timers.length;
    },
    clearTimeout: (id) => {
      if (w.timers[id - 1]) w.timers[id - 1].live = false;
    },
  };
  vm.runInNewContext(SRC, ctx, { filename: 'sw.js' });
  w.CACHE = vm.runInNewContext(`${SRC}\n;CACHE`, { ...ctx, self: { ...self, addEventListener() {} } });
  const mine = cacheOf(w.CACHE);
  for (const [url, body] of Object.entries(cached)) mine.put(url, new FakeResponse(body));
  /** 3.5초 같은 타이머를 지나가게 한다 */
  w.tick = (ms) => {
    for (const t of w.timers) {
      if (t.live && t.ms <= ms) {
        t.live = false;
        t.fn();
      }
    }
  };
  w.request = (url, { method = 'GET', mode = 'cors' } = {}) => {
    const ev = {
      request: { url, method, mode },
      responded: null,
      waits: [],
      respondWith(p) {
        this.responded = Promise.resolve(p);
      },
      waitUntil(p) {
        this.waits.push(Promise.resolve(p));
      },
    };
    w.handlers.fetch(ev);
    return ev;
  };
  w.event = (type) => {
    const ev = {
      waits: [],
      waitUntil(p) {
        this.waits.push(Promise.resolve(p));
      },
    };
    w.handlers[type](ev);
    return ev;
  };
  w.body = async (url) => {
    const hit = stores.get(w.CACHE).get(keyOf(url, true));
    return hit ? hit.body : undefined;
  };
  return w;
}

const flush = () => new Promise((r) => setImmediate(r));
/** waitUntil로 늘어난 일이 다 끝날 때까지 (중간에 더 붙는 것도) */
async function drain(ev) {
  for (let i = 0; i < ev.waits.length; i++) await ev.waits[i];
  await flush();
}
/** 답이 아직 안 나왔는지 */
async function pending(p) {
  let done = false;
  p.then(
    () => (done = true),
    () => (done = true),
  );
  await flush();
  await flush();
  return !done;
}

test('sw: 캐시 이름 v3 (CR-255 방식 바꿈), 3.5초 타이머', () => {
  const w = world();
  assert.equal(w.CACHE, 'yena-store-v3');
  assert.match(SRC, /const SLOW_MS = 3500;/);
});

test('sw ① 네트워크가 빨리 옴 → 네트워크 글, 저장분을 새로 바꿈, 알림 없음', async () => {
  const w = world({ cached: { [LIST]: '옛 목록' } });
  const ev = w.request(LIST);
  w.net.get(LIST).resolve(new FakeResponse('새 목록'));
  assert.equal((await ev.responded).body, '새 목록');
  await drain(ev);
  assert.equal(await w.body(LIST), '새 목록');
  assert.deepEqual(w.messages, [], '화면이 이미 새 목록을 받았다');
  assert.equal(w.timers.filter((t) => t.live).length, 0, '타이머는 치웠다');
});

test('sw ② 네트워크가 3.5초 넘게 걸림 + 저장분 있음 → 저장분이 먼저, 뒤에 새 글이 저장되고 알림 1번', async () => {
  const w = world({ cached: { [LIST]: '옛 목록' } });
  const ev = w.request(LIST);
  assert.equal(await pending(ev.responded), true, '3.5초 전에는 기다린다');
  assert.deepEqual(w.timers.map((t) => t.ms), [3500]);
  w.tick(3500);
  assert.equal((await ev.responded).body, '옛 목록');
  w.net.get(LIST).resolve(new FakeResponse('새 목록'));
  await drain(ev);
  assert.equal(await w.body(LIST), '새 목록');
  // (vm 안에서 만든 물건이라 모양만 비교)
  assert.deepEqual(JSON.parse(JSON.stringify(w.messages)), [{ type: 'yena-store-updated' }]);
});

test('sw ②-2 늦게 왔지만 같은 글이면 알리지 않고, apps.json이 아닌 파일은 바꾸기만 (알림 없음)', async () => {
  const w = world({ cached: { [LIST]: '같은 목록', [`${SCOPE}style.css`]: '옛 색' } });
  const ev = w.request(LIST);
  w.tick(3500);
  assert.equal((await ev.responded).body, '같은 목록');
  w.net.get(LIST).resolve(new FakeResponse('같은 목록'));
  await drain(ev);
  const css = w.request(`${SCOPE}style.css`);
  w.tick(3500);
  assert.equal((await css.responded).body, '옛 색');
  w.net.get(`${SCOPE}style.css`).resolve(new FakeResponse('새 색'));
  await drain(css);
  assert.equal(await w.body(`${SCOPE}style.css`), '새 색');
  assert.deepEqual(w.messages, []);
});

test('sw ③ 느리고 저장분 없음 → 네트워크를 계속 기다림 (지금처럼)', async () => {
  const w = world();
  const ev = w.request(LIST);
  w.tick(3500);
  assert.equal(await pending(ev.responded), true, '3.5초가 지나도 저장분이 없으면 그대로 기다린다');
  w.net.get(LIST).resolve(new FakeResponse('첫 목록'));
  assert.equal((await ev.responded).body, '첫 목록');
  await drain(ev);
  assert.equal(await w.body(LIST), '첫 목록');
  assert.deepEqual(w.messages, [], '저장분이 없었으니 알림 없음');
});

test('sw ④ 네트워크 실패 + 저장분 있음 → 저장분 (지금처럼). 페이지 열기는 첫 화면, 그 밖은 오류', async () => {
  const w = world({ cached: { [LIST]: '옛 목록', [`${SCOPE}index.html`]: '첫 화면' } });
  const ev = w.request(LIST);
  w.net.get(LIST).reject(new TypeError('끊김'));
  assert.equal((await ev.responded).body, '옛 목록');
  const nav = w.request(`${SCOPE}nowhere`, { mode: 'navigate' });
  w.net.get(`${SCOPE}nowhere`).reject(new TypeError('끊김'));
  assert.equal((await nav.responded).body, '첫 화면');
  const img = w.request(`${SCOPE}icons/none.png`);
  w.net.get(`${SCOPE}icons/none.png`).reject(new TypeError('끊김'));
  assert.equal((await img.responded).type, 'error');
  // 저장분을 먼저 준 뒤 네트워크가 실패해도 그대로 (저장분은 안 건드림)
  const late = w.request(LIST);
  w.tick(3500);
  assert.equal((await late.responded).body, '옛 목록');
  w.net.get(LIST).reject(new TypeError('끊김'));
  await drain(late);
  assert.equal(await w.body(LIST), '옛 목록');
  assert.deepEqual(w.messages, []);
});

test('sw: 오류 답(404 등)은 저장하지 않고 그대로 준다', async () => {
  const w = world({ cached: { [LIST]: '옛 목록' } });
  const ev = w.request(LIST);
  w.net.get(LIST).resolve(new FakeResponse('없음', { ok: false }));
  assert.equal((await ev.responded).body, '없음');
  await drain(ev);
  assert.equal(await w.body(LIST), '옛 목록');
});

test('sw: 다른 출처(api.github.com 등)·GET이 아닌 요청은 손대지 않는다', () => {
  const w = world();
  const other = w.request('https://other.example.test/repos/x/y/releases');
  assert.equal(other.responded, null);
  const post = w.request(LIST, { method: 'POST' });
  assert.equal(post.responded, null);
  assert.deepEqual(w.fetches, []);
});

test('sw: 설치 때 화면 파일을 v3에 저장, 켜질 때 옛 가게 저장분(v2)만 지우고 다른 이름은 그대로', async () => {
  const w = world({ oldCaches: ['yena-store-v2', 'other-cache'] });
  await drain(w.event('install'));
  assert.ok(await w.body(LIST), 'apps.json도 저장');
  await drain(w.event('activate'));
  assert.deepEqual([...w.stores.keys()].sort(), ['other-cache', 'yena-store-v3']);
});

test('app.js ⑤: 못 받으면 저장분 한 번 더 찾기 · 알림을 받으면 한 번만 다시 그리기 (글 검사)', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const load = app.slice(app.indexOf('async function loadApps()'), app.indexOf('// ── 테마'));
  const fail = load.indexOf('} catch {');
  assert.ok(fail > 0);
  const again = load.indexOf('data = await cachedAppsList();');
  const message = load.indexOf("showListMessage('앱 목록을 불러오지 못했어요.");
  assert.ok(again > fail && message > again, 'catch → 저장분 한 번 더 → 그것도 없을 때만 지금 글');
  assert.match(app, /async function cachedAppsList\(\) \{[\s\S]*?caches\.match\('apps\.json', \{ ignoreSearch: true \}\)[\s\S]*?catch \{\s*return null;/);
  assert.match(
    app,
    /if \(!e\.data \|\| e\.data\.type !== 'yena-store-updated' \|\| reloadedForUpdate\) return;\s*reloadedForUpdate = true;\s*loadApps\(\);/,
  );
  assert.equal((app.match(/let reloadedForUpdate = false;/g) || []).length, 1);
  assert.match(SRC, /const UPDATED = 'yena-store-updated';/, 'sw.js와 같은 이름');
  // 8초 한도는 그대로 (3.5초가 앞섬)
  assert.match(app, /const FETCH_TIMEOUT_MS = 8000;/);
});
