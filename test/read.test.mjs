// CR-255 읽기 튼튼하게 (사양서 6장): 6-1 꽉 찼고 못 찾을 때만 2쪽 · 6-2 저장해 둔 그 앱 릴리스 페이지 · 6-4 릴리스를 지우는 코드 0.
// 모두 가짜 GitHub 답(fetchList)·가짜 저장소로 돈다 → 진짜 GitHub 호출 0.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  CACHE_MAX_AGE_MS,
  RELEASES_PER_PAGE,
  appPageKey,
  cardView,
  createRepoLoader,
  mergeReleasePages,
  needsSecondPage,
  parseRepoCacheEntry,
  releaseStateFor,
  releasesApiUrl,
  rememberReleasePage,
  repoCacheKey,
  savedReleasePage,
  trustedPageUrl,
  wantedReleases,
} from '../store-core.js';

const DAY = 'yl4315/yena-day';
const STORE = 'yl4315/yena-store';

const fileOf = (repo, tag) => ({
  name: 'app.apk',
  size: 1234567,
  state: 'uploaded',
  browser_download_url: `https://github.com/${repo}/releases/download/${tag}/app.apk`,
});
const rel = (repo, tag, publishedAt, withFile = true) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  published_at: publishedAt,
  html_url: `https://github.com/${repo}/releases/tag/${tag}`,
  body: `${tag} 설명`,
  assets: withFile ? [fileOf(repo, tag)] : [],
});
const pad = (n) => String(n).padStart(2, '0');
/** 같은 저장소의 다른 앱 릴리스 n개 (태그 = 앞머리 + 날짜 도장 12자리, 모두 설치 파일 있음) */
const others = (repo, prefix, n, day = '01') =>
  Array.from({ length: n }, (_, i) => {
    const hh = pad(Math.floor(i / 60));
    const mm = pad(i % 60);
    return rel(repo, `${prefix}202610${day}${hh}${mm}`, `2026-10-${day}T${hh}:${mm}:00Z`);
  });
/** 음성 모델처럼 설치 파일이 없는 릴리스 n개 */
const voices = (repo, n) => Array.from({ length: n }, (_, i) => rel(repo, `voice-v${i + 1}`, '2026-10-20T00:00:00Z', false));

const androidApp = (id, repo, tagPrefix) => ({
  id,
  name: id,
  kind: 'android-release',
  release: { repo, tagPrefix, asset: '.apk', fallbackUrl: `https://github.com/${repo}/releases` },
});
const CAL = androidApp('calendar', DAY, 'app-');
const FRIDGE = androidApp('fridge', STORE, 'fridge-');
const RECEIPT = androidApp('receipt', STORE, 'receipt-');
const CAL_REL = rel(DAY, 'app-202611201000', '2026-11-20T10:00:00Z');
const RECEIPT_REL = rel(STORE, 'receipt-202611011200', '2026-11-01T12:00:00Z');

/** 가짜 GitHub: 주소(1쪽·2쪽)마다 답. Error면 그 주소는 실패. calls = 물은 주소 목록 */
function fakeGitHub(pages) {
  const env = { calls: [], store: new Map(), time: Date.parse('2026-11-24T10:00:00Z') };
  env.loader = createRepoLoader({
    fetchList: async (url) => {
      env.calls.push(url);
      await new Promise((r) => setTimeout(r, 5));
      const v = pages[url];
      if (v === undefined || v instanceof Error) throw v || new Error(`가짜에 없는 주소 ${url}`);
      return v;
    },
    getItem: (k) => (env.store.has(k) ? env.store.get(k) : null),
    setItem: (k, v) => env.store.set(k, v),
    now: () => env.time,
  });
  return env;
}
const p1 = (repo) => releasesApiUrl(repo);
const p2 = (repo) => releasesApiUrl(repo, 2);
const stateOf = async (env, app, apps = [app]) =>
  releaseStateFor(app, await env.loader.load(app.release.repo, wantedReleases(apps).get(app.release.repo)));

// ── 6-1 KIT-09 ───────────────────────────────────────

test('6-1 releasesApiUrl: 1쪽은 지금과 글자까지 같고, 2쪽만 끝에 &page=2', () => {
  assert.equal(RELEASES_PER_PAGE, 100);
  assert.equal(releasesApiUrl(DAY), 'https://api.github.com/repos/yl4315/yena-day/releases?per_page=100');
  assert.equal(releasesApiUrl(DAY, 1), releasesApiUrl(DAY));
  assert.equal(releasesApiUrl(DAY, 2), 'https://api.github.com/repos/yl4315/yena-day/releases?per_page=100&page=2');
  for (const bad of [0, -1, 1.5, '2', null]) assert.throws(() => releasesApiUrl(DAY, bad), String(bad));
});

test('6-1 wantedReleases: 보이는 android-release 앱만, 저장소마다 묶음 (웹·잠금 앱은 안 찾음)', () => {
  const web = { id: 'karaoke', kind: 'web', url: 'https://example.test/' };
  const priv = { id: 'x', kind: 'private' };
  const fam = { ...androidApp('family', 'yl4315/yetae-world', 'app-'), release: { ...androidApp('family', 'yl4315/yetae-world', 'app-').release, versionPrefix: '0.1.' } };
  const w = wantedReleases([CAL, web, FRIDGE, priv, RECEIPT, fam]);
  assert.deepEqual([...w.keys()], [DAY, STORE, 'yl4315/yetae-world']);
  assert.deepEqual(w.get(STORE), [
    { tagPrefix: 'fridge-', asset: '.apk', versionPrefix: undefined },
    { tagPrefix: 'receipt-', asset: '.apk', versionPrefix: undefined },
  ]);
  assert.equal(w.get('yl4315/yetae-world')[0].versionPrefix, '0.1.');
  assert.equal(wantedReleases(null).size, 0);
});

test('6-1 ① 1쪽 100개 + 찾는 앱 있음 → 호출 1번', async () => {
  const env = fakeGitHub({ [p1(DAY)]: [...voices(DAY, 99), CAL_REL] });
  const s = await stateOf(env, CAL);
  assert.deepEqual(env.calls, [p1(DAY)]);
  assert.equal(s.status, 'ok');
  assert.equal(s.release.tag, CAL_REL.tag_name);
});

test('6-1 ② 1쪽 100개 + 찾는 앱 없음, 2쪽에 있음 → 호출 2번 (&page=2), 앱이 골라지고 합친 목록을 저장', async () => {
  const env = fakeGitHub({ [p1(DAY)]: voices(DAY, 100), [p2(DAY)]: [voices(DAY, 1)[0], CAL_REL] });
  const s = await stateOf(env, CAL);
  assert.deepEqual(env.calls, [p1(DAY), p2(DAY)]);
  assert.ok(env.calls[1].endsWith('&page=2'));
  assert.equal(s.status, 'ok');
  assert.equal(s.release.tag, CAL_REL.tag_name);
  const saved = parseRepoCacheEntry(env.store.get(repoCacheKey(DAY)));
  assert.ok(saved.releases.some((r) => r.tag_name === CAL_REL.tag_name), '2쪽 릴리스도 저장 (저장소 단위 그대로)');
});

test('6-1 ③ 1쪽 99개 + 찾는 앱 없음 → 호출 1번 (꽉 차지 않음)', async () => {
  const env = fakeGitHub({ [p1(DAY)]: voices(DAY, 99) });
  const s = await stateOf(env, CAL);
  assert.deepEqual(env.calls, [p1(DAY)]);
  assert.deepEqual([s.status, s.release], ['ok', null]);
});

test('6-1 ④ 1쪽 100개 + 없음, 2쪽 실패 → 1쪽 결과 그대로 ok, 호출 2번', async () => {
  const env = fakeGitHub({ [p1(DAY)]: voices(DAY, 100), [p2(DAY)]: new Error('API rate limit exceeded') });
  const s = await stateOf(env, CAL);
  assert.deepEqual(env.calls, [p1(DAY), p2(DAY)]);
  assert.deepEqual([s.status, s.release], ['ok', null]);
  // 2쪽이 목록이 아닌 답(한도 초과 글)이어도 같다
  const env2 = fakeGitHub({ [p1(DAY)]: voices(DAY, 100), [p2(DAY)]: { message: 'API rate limit exceeded' } });
  assert.equal((await stateOf(env2, CAL)).status, 'ok');
  assert.equal(env2.calls.length, 2);
});

test('6-1 ⑤ 2쪽에도 100개(못 찾음) → 3쪽은 부르지 않는다', async () => {
  const env = fakeGitHub({ [p1(DAY)]: voices(DAY, 100), [p2(DAY)]: others(DAY, 'zz-', 100) });
  const s = await stateOf(env, CAL);
  assert.deepEqual(env.calls, [p1(DAY), p2(DAY)]);
  assert.ok(!env.calls.some((u) => u.includes('page=3')));
  assert.deepEqual([s.status, s.release], ['ok', null]);
});

test('6-1 ⑥ 같은 저장소 앱 여러 개라도 호출은 저장소당 최대 2번 (같은 Promise 공유), 앱마다 자기 릴리스', async () => {
  const env = fakeGitHub({ [p1(STORE)]: others(STORE, 'fridge-', 100), [p2(STORE)]: [RECEIPT_REL] });
  const apps = [FRIDGE, RECEIPT, FRIDGE, RECEIPT];
  const states = await Promise.all(apps.map((a) => stateOf(env, a, [FRIDGE, RECEIPT])));
  assert.deepEqual(env.calls, [p1(STORE), p2(STORE)]);
  assert.match(states[0].release.tag, /^fridge-/);
  assert.equal(states[1].release.tag, RECEIPT_REL.tag_name);
  // 다 찾으면 1쪽만 (지금처럼)
  const env2 = fakeGitHub({ [p1(STORE)]: [...others(STORE, 'fridge-', 99), RECEIPT_REL] });
  await Promise.all([FRIDGE, RECEIPT].map((a) => stateOf(env2, a, [FRIDGE, RECEIPT])));
  assert.deepEqual(env2.calls, [p1(STORE)]);
});

test('6-1 ⑦ 10분 저장 안에서는 호출 0번, 10분이 지나면 다시 (그때도 최대 2번)', async () => {
  const env = fakeGitHub({ [p1(DAY)]: voices(DAY, 100), [p2(DAY)]: [CAL_REL] });
  await stateOf(env, CAL);
  assert.equal(env.calls.length, 2);
  env.loader.reset();
  env.time += CACHE_MAX_AGE_MS - 1;
  const again = await stateOf(env, CAL);
  assert.equal(env.calls.length, 2, '10분 안: 호출 0번');
  assert.equal(again.release.tag, CAL_REL.tag_name, '저장분(합친 목록)에서 고른다');
  env.loader.reset();
  env.time += 2;
  await stateOf(env, CAL);
  assert.deepEqual(env.calls.slice(2), [p1(DAY), p2(DAY)], '10분 뒤: 새 1쪽 기준으로 다시 (이번에도 2쪽 필요 → 2번)');
});

test('6-1 wanted 없이 부르면 지금처럼 1쪽만, 길이는 원본(초안·파일 없는 것 빼기 전)으로 센다', async () => {
  const env = fakeGitHub({ [p1(DAY)]: voices(DAY, 100) });
  await env.loader.load(DAY);
  assert.deepEqual(env.calls, [p1(DAY)]);
  // 원본 100개 중 파일 있는 것 0개여도 "꽉 참"
  assert.equal(needsSecondPage(voices(DAY, 100), DAY, wantedReleases([CAL]).get(DAY)), true);
  assert.equal(needsSecondPage(voices(DAY, 100), DAY, []), false);
  assert.equal(needsSecondPage(voices(DAY, 99), DAY, wantedReleases([CAL]).get(DAY)), false);
  assert.equal(needsSecondPage({ message: 'x' }, DAY, wantedReleases([CAL]).get(DAY)), false);
});

test('6-1 mergeReleasePages: 2쪽을 뒤에 붙이고 같은 tag_name은 1쪽 것 한 번만', () => {
  const a = rel(DAY, 'app-202611010000', '2026-11-01T00:00:00Z');
  const b = rel(DAY, 'app-202611020000', '2026-11-02T00:00:00Z');
  const merged = mergeReleasePages([a, b], [{ ...b, body: '2쪽 판' }, CAL_REL, null]);
  assert.deepEqual(merged.map((r) => r.tag_name), [a.tag_name, b.tag_name, CAL_REL.tag_name]);
  assert.equal(merged[1].body, b.body);
  assert.deepEqual(mergeReleasePages([a], 'x').map((r) => r.tag_name), [a.tag_name]);
});

// ── 6-2 KIT-21 ───────────────────────────────────────

const CAL_PAGE = `https://github.com/${DAY}/releases/tag/app-202611201000`;

test('6-2 ① 확인 못 함(오류) + 저장 칸 있음 → "GitHub에서 보기"가 저장한 그 앱 페이지, 글은 그대로', () => {
  const v = cardView(CAL, { status: 'error' }, { savedPageUrl: CAL_PAGE });
  assert.equal(v.action.type, 'link');
  assert.equal(v.action.label, 'GitHub에서 보기');
  assert.equal(v.action.href, CAL_PAGE);
  assert.equal(v.action.newTab, true);
  assert.equal(v.status, '지금은 버전을 확인하지 못했어요');
});

test('6-2 ② 저장 칸 없음 → 지금처럼 fallbackUrl. 목록을 읽었는데 파일이 없으면 저장 칸이 있어도 fallbackUrl', () => {
  assert.equal(cardView(CAL, { status: 'error' }).action.href, CAL.release.fallbackUrl);
  assert.equal(cardView(CAL, { status: 'error' }, { savedPageUrl: null }).action.href, CAL.release.fallbackUrl);
  const none = cardView(CAL, { status: 'ok', release: null, checkedAt: 1 }, { savedPageUrl: CAL_PAGE });
  assert.equal(none.action.href, CAL.release.fallbackUrl);
  assert.equal(none.status, '아직 올라온 설치 파일이 없어요');
});

test('6-2 ③ 저장 칸에 엉뚱한 글 → 버리고 fallbackUrl (https://github.com/<그 앱 저장소>/releases/tag/<그 앱 앞머리>만 믿음)', () => {
  const bad = [
    'javascript:alert(1)',
    'http://github.com/yl4315/yena-day/releases/tag/app-202611201000',
    'https://github.com.example.test/yl4315/yena-day/releases/tag/app-202611201000',
    'https://github.com/yl4315/yena-store/releases/tag/app-202611201000',
    'https://github.com/yl4315/yena-day/releases/tag/voice-v3',
    'https://github.com/yl4315/yena-day/releases/tag/app-1/../../../../other/x',
    'https://github.com/yl4315/yena-day/releases/tag/app-202611201000?x=1',
    'https://github.com/yl4315/yena-day/releases/tag/app-202611201000#x',
    'https://github.com/yl4315/yena-day/releases',
    ' https://github.com/yl4315/yena-day/releases/tag/app-1',
    '{"a":1}',
    '',
  ];
  for (const s of bad) {
    assert.equal(trustedPageUrl(CAL, s), null, s);
    assert.equal(cardView(CAL, { status: 'error' }, { savedPageUrl: s }).action.href, CAL.release.fallbackUrl, s);
  }
  // 다른 앱(같은 저장소) 페이지도 버린다
  assert.equal(trustedPageUrl(RECEIPT, `https://github.com/${STORE}/releases/tag/fridge-202611020900`), null);
  assert.equal(trustedPageUrl(RECEIPT, RECEIPT_REL.html_url), RECEIPT_REL.html_url);
  assert.equal(trustedPageUrl({ id: 'web', kind: 'web' }, CAL_PAGE), null);
});

test('6-2 ④ 릴리스를 고르면 그 앱 저장 칸이 갱신되고, 다음 오류 때 그 페이지로', async () => {
  const env = fakeGitHub({ [p1(DAY)]: [CAL_REL] });
  const s = await stateOf(env, CAL);
  assert.equal(rememberReleasePage(CAL, s, (k, v) => env.store.set(k, v)), CAL_PAGE);
  assert.equal(env.store.get(appPageKey('calendar')), CAL_PAGE);
  assert.equal(appPageKey('calendar'), 'yena-store.appPage.calendar');
  // 새 릴리스가 나오면 바뀐다
  const newer = rel(DAY, 'app-202611231500', '2026-11-23T15:00:00Z');
  const s2 = releaseStateFor(CAL, { status: 'ok', releases: [CAL_REL, newer], checkedAt: 2 });
  rememberReleasePage(CAL, s2, (k, v) => env.store.set(k, v));
  assert.equal(env.store.get(appPageKey('calendar')), newer.html_url);
  const get = (k) => (env.store.has(k) ? env.store.get(k) : null);
  assert.equal(savedReleasePage(CAL, get), newer.html_url);
  assert.equal(cardView(CAL, { status: 'error' }, { savedPageUrl: savedReleasePage(CAL, get) }).action.href, newer.html_url);
  // 고른 게 없거나 오류면 저장 칸은 그대로
  assert.equal(rememberReleasePage(CAL, { status: 'error' }, (k, v) => env.store.set(k, v)), null);
  assert.equal(rememberReleasePage(CAL, { status: 'ok', release: null }, (k, v) => env.store.set(k, v)), null);
  assert.equal(env.store.get(appPageKey('calendar')), newer.html_url);
  // 저장 칸에 엉뚱한 글이 들어 있으면 읽을 때 버린다
  env.store.set(appPageKey('calendar'), 'javascript:alert(1)');
  assert.equal(savedReleasePage(CAL, get), null);
});

test('6-2 ⑤ 저장이 막힌 브라우저(setItem·getItem이 던짐)에서도 화면이 깨지지 않는다', () => {
  const s = releaseStateFor(CAL, { status: 'ok', releases: [CAL_REL], checkedAt: 1 });
  const throws = () => {
    throw new Error('SecurityError');
  };
  assert.doesNotThrow(() => rememberReleasePage(CAL, s, throws));
  assert.equal(rememberReleasePage(CAL, s, throws), CAL_PAGE);
  assert.equal(savedReleasePage(CAL, throws), null);
  assert.equal(cardView(CAL, { status: 'error' }, { savedPageUrl: savedReleasePage(CAL, throws) }).action.href, CAL.release.fallbackUrl);
});

// ── 6-4 옛 릴리스는 지우지 않음 ───────────────────────

const codeOf = (file) =>
  readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

test('6-4 가게 코드에 릴리스를 지우는 요청·저장분을 지우는 줄이 0 (예외: sw.js activate의 옛 가게 캐시 정리 caches.delete 한 곳)', () => {
  for (const file of ['store-core.js', 'app.js', 'sw.js']) {
    const code = codeOf(file);
    assert.doesNotMatch(code, /\bDELETE\b/, `${file}: DELETE`);
    assert.doesNotMatch(code, /['"`]delete['"`]/i, `${file}: 'delete' 요청 방식 글`);
    assert.doesNotMatch(code, /method\s*:/, `${file}: method: (요청은 모두 읽기 GET)`);
    // (store-core의 shared.clear()는 화면 한 번 동안 같은 요청을 나눠 쓰는 메모리 Map이라 저장분이 아님)
    assert.doesNotMatch(code, /\bremoveItem\s*\(|(?:local|session)Storage\.clear\s*\(|deleteDatabase/, `${file}: 저장분 지우기`);
    assert.doesNotMatch(code, /\.delete\s*\(\s*[^k)]/, `${file}: caches.delete(k) 말고 지우기`);
  }
  for (const file of ['store-core.js', 'app.js']) assert.doesNotMatch(codeOf(file), /caches\.delete|\.delete\s*\(/, file);
  const sw = codeOf('sw.js');
  assert.equal((sw.match(/caches\.delete\(/g) || []).length, 1);
  const activate = sw.slice(sw.indexOf("addEventListener('activate'"), sw.indexOf('function fromCache'));
  assert.match(activate, /k\.startsWith\('yena-store-'\) && k !== CACHE\)\.map\(\(k\) => caches\.delete\(k\)\)/);
  // 저장 칸 이름은 읽기용 두 가지뿐 (릴리스 목록·앱 페이지)
  const core = codeOf('store-core.js');
  assert.deepEqual([...core.matchAll(/`yena-store\.([a-zA-Z]+)\./g)].map((m) => m[1]).sort(), ['appPage', 'releases']);
});
