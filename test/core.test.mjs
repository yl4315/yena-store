// store-core.js 순수 함수 검사: 릴리스 고르기, 버전·날짜·크기 글, 저장소 목록 읽기·저장, 카드 내용.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CACHE_MAX_AGE_MS,
  cardView,
  createRepoLoader,
  cleanNotes,
  formatDateKo,
  formatLastChecked,
  formatSize,
  formatTimeKo,
  isFresh,
  makeRepoCacheEntry,
  metaLine,
  normalizeVersion,
  parseRepoCacheEntry,
  pickRelease,
  releaseStateFor,
  releasesApiUrl,
  repoCacheKey,
  trimReleases,
  versionFromTag,
} from '../store-core.js';

const REPO = 'yl4315/yena-day';
const OPTS = { repo: REPO, tagPrefix: 'app-', asset: '.apk' };

function rel(tag, publishedAt, assets, extra = {}) {
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    published_at: publishedAt,
    html_url: `https://github.com/${REPO}/releases/tag/${tag}`,
    body: `${tag} 설명`,
    assets,
    ...extra,
  };
}
function apk(tag, size = 86310093, name = 'yena-day.apk') {
  return {
    name,
    size,
    state: 'uploaded',
    content_type: 'application/vnd.android.package-archive',
    browser_download_url: `https://github.com/${REPO}/releases/download/${tag}/${name}`,
  };
}
const gguf = (tag) => ({
  name: `yena-${tag}.gguf`,
  size: 291558720,
  state: 'uploaded',
  browser_download_url: `https://github.com/${REPO}/releases/download/${tag}/yena-${tag}.gguf`,
});

// 2026-10-25 실제 API 순서 그대로 (맨 앞이 음성 모델 = GitHub "Latest")
const REAL = [
  rel('voice-v3', '2026-10-22T21:22:46Z', [gguf('voice-v3')]),
  rel('voice-v2', '2026-10-18T01:27:43Z', [gguf('voice-v2')]),
  rel('app-202610251128', '2026-10-25T23:34:13Z', [apk('app-202610251128')], {
    body: '오늘 루틴 위젯, 일기·루틴 CSV 내보내기·가져오기. 기록은 그대로 남아요.',
  }),
  rel('app-202610222242', '2026-10-23T18:45:22Z', [apk('app-202610222242', 135439202)]),
];

test('releasesApiUrl: 목록 API를 쓰고 /releases/latest는 쓰지 않는다', () => {
  assert.equal(releasesApiUrl(REPO), 'https://api.github.com/repos/yl4315/yena-day/releases?per_page=100');
  assert.ok(!releasesApiUrl(REPO).includes('latest'));
  assert.throws(() => releasesApiUrl('yena-day'));
  assert.throws(() => releasesApiUrl('a/b?x=1'));
});

test('pickRelease: 실제 목록에서 음성 모델을 건너뛰고 최신 앱 릴리스를 고른다', () => {
  const r = pickRelease(REAL, OPTS);
  assert.equal(r.tag, 'app-202610251128');
  assert.equal(r.version, '2026.10.25 11:28');
  assert.equal(r.fileName, 'yena-day.apk');
  assert.equal(r.size, 86310093);
  assert.equal(r.fileUrl, 'https://github.com/yl4315/yena-day/releases/download/app-202610251128/yena-day.apk');
  assert.equal(r.pageUrl, 'https://github.com/yl4315/yena-day/releases/tag/app-202610251128');
  assert.equal(r.publishedAt, '2026-10-25T23:34:13.000Z');
  assert.match(r.notes, /오늘 루틴 위젯/);
});

test('pickRelease: 순서가 섞여 있어도 published_at이 가장 늦은 것', () => {
  const r = pickRelease([...REAL].reverse(), OPTS);
  assert.equal(r.tag, 'app-202610251128');
});

test('pickRelease: 초안·미리보기·APK 없는 것·다른 곳 주소·올리는 중인 파일은 무시', () => {
  const newer = '2026-10-30T00:00:00Z';
  const list = [
    rel('app-202610300001', newer, [apk('app-202610300001')], { draft: true, published_at: null }),
    rel('app-202610300002', newer, [apk('app-202610300002')], { draft: true }),
    rel('app-202610300003', newer, [apk('app-202610300003')], { prerelease: true }),
    rel('app-202610300004', newer, [gguf('app-202610300004')]),
    rel('app-202610300005', newer, []),
    rel('app-202610300006', newer, [{ ...apk('app-202610300006'), browser_download_url: 'https://example.com/yena-day.apk' }]),
    rel('app-202610300007', newer, [{ ...apk('app-202610300007'), browser_download_url: 'http://github.com/yl4315/yena-day/releases/download/x/yena-day.apk' }]),
    rel('app-202610300008', newer, [{ ...apk('app-202610300008'), state: 'starter' }]),
    rel('app-202610300009', newer, [{ ...apk('app-202610300009'), browser_download_url: 'https://github.com/someone/else/releases/download/x/yena-day.apk' }]),
    rel('voice-v9', newer, [apk('voice-v9')]),
    rel('app-', newer, [apk('app-')]),
    ...REAL,
  ];
  assert.equal(pickRelease(list, OPTS).tag, 'app-202610251128');
});

test('pickRelease: 맞는 게 없거나 목록이 아니면 null', () => {
  assert.equal(pickRelease(REAL.slice(0, 2), OPTS), null);
  assert.equal(pickRelease([], OPTS), null);
  assert.equal(pickRelease({ message: 'API rate limit exceeded' }, OPTS), null);
  assert.equal(pickRelease(null, OPTS), null);
  assert.equal(pickRelease([null, 1, 'x'], OPTS), null);
});

test('pickRelease: 확장자는 대소문자 상관없이, 크기가 없으면 null', () => {
  const r = pickRelease([rel('app-202611010930', '2026-11-01T00:00:00Z', [{ ...apk('app-202611010930', undefined, 'YENA.APK'), size: undefined }])], OPTS);
  assert.equal(r.fileName, 'YENA.APK');
  assert.equal(r.size, null);
  assert.equal(r.version, '2026.11.01 09:30');
});

test('pickRelease: 태그는 앞머리 + 숫자 12자리만 (app-x·app-2026·appx-…는 뺀다)', () => {
  const newer = '2026-11-02T00:00:00Z';
  const only = (tag, opts = OPTS) => pickRelease([rel(tag, newer, [apk(tag)])], opts)?.tag ?? null;
  assert.equal(only('app-202610251128'), 'app-202610251128');
  for (const tag of ['app-x', 'app-2026', 'app-20261025', 'app-2026102511280', 'app-20261025112a', 'app-v202610251128', 'appx-202610251128', 'app-store-202610251128', 'APP-202610251128']) {
    assert.equal(only(tag), null, tag);
  }
  // 새 앱 공장: 같은 저장소의 다른 앱은 자기 앞머리로만 고른다
  const store = { repo: REPO, tagPrefix: 'app-store-', asset: '.apk' };
  assert.equal(only('app-store-202610251128', store), 'app-store-202610251128');
  assert.equal(only('app-202610251128', store), null);
  // 섞여 있어도 앞머리 규칙에 맞는 최신 것만
  const list = [
    rel('app-2026', '2026-12-01T00:00:00Z', [apk('app-2026')]),
    rel('appx-202612010000', '2026-12-01T00:00:00Z', [apk('appx-202612010000')]),
    ...REAL,
  ];
  assert.equal(pickRelease(list, OPTS).tag, 'app-202610251128');
});

test('versionFromTag: 숫자 12자리만 "YYYY.MM.DD HH:mm"으로', () => {
  assert.equal(versionFromTag('app-202610251128', 'app-'), '2026.10.25 11:28');
  assert.equal(versionFromTag('app-store-202611010930', 'app-store-'), '2026.11.01 09:30');
  assert.equal(versionFromTag('app-20261025', 'app-'), '20261025');
  assert.equal(versionFromTag('app-2026102511280', 'app-'), '2026102511280');
  assert.equal(versionFromTag('app-beta', 'app-'), 'beta');
  assert.equal(versionFromTag(undefined, 'app-'), '');
});

test('cleanNotes: 마크다운 기호를 덜어 내고 글로만', () => {
  const body = '## 바뀐 점\r\n\r\n- **위젯** 추가\r\n* 오류 수정\r\n\r\n\r\n\r\n<!-- 숨은 글 -->\r\n**Full Changelog**: https://github.com/x/y/compare/a...b';
  assert.equal(cleanNotes(body), '바뀐 점\n\n· 위젯 추가\n· 오류 수정');
  assert.equal(cleanNotes(null), '');
  assert.equal(cleanNotes('<b>그대로</b>'), '<b>그대로</b>'); // 화면에는 textContent로 넣으니 글자로만 보인다
});

test('formatSize: MB는 1,000,000바이트', () => {
  assert.equal(formatSize(86310093), '86.3MB');
  assert.equal(formatSize(135439202), '135MB');
  assert.equal(formatSize(50000000), '50MB');
  assert.equal(formatSize(1234567), '1.2MB');
  assert.equal(formatSize(512000), '512KB');
  assert.equal(formatSize(10), '1KB');
  assert.equal(formatSize(0), '');
  assert.equal(formatSize(null), '');
  assert.equal(formatSize(NaN), '');
});

// 시간대는 도시 이름 없는 고정 시차로 쓴다: Etc/GMT-9 = UTC+9, Etc/GMT+5 = UTC-5 (부호가 거꾸로인 게 맞다)
test('formatDateKo: 올해는 월·일, 다른 해는 연도까지. 날짜만 있으면 시간대와 상관없이 그날', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  assert.equal(formatDateKo('2026-10-24', { now, timeZone: 'Etc/GMT+5' }), '10월 24일');
  assert.equal(formatDateKo('2026-10-24', { now, timeZone: 'Etc/GMT-9' }), '10월 24일');
  assert.equal(formatDateKo('2025-12-31', { now, timeZone: 'Etc/GMT-9' }), '2025년 12월 31일');
  // 시각이 있으면 보는 사람 시간대의 날짜
  assert.equal(formatDateKo('2026-10-25T23:34:13Z', { now, timeZone: 'Etc/GMT-9' }), '10월 26일');
  assert.equal(formatDateKo('2026-10-25T23:34:13Z', { now, timeZone: 'Etc/GMT+5' }), '10월 25일');
  assert.equal(formatDateKo('2026-02-30', { now }), '');
  assert.equal(formatDateKo('어제', { now }), '');
});

test('formatTimeKo / formatLastChecked', () => {
  const tz = 'Etc/GMT-9';
  const t = Date.parse('2026-10-25T06:05:00Z'); // 서울 오후 3시 5분
  assert.equal(formatTimeKo(t, { timeZone: tz }), '오후 3시 5분');
  assert.equal(formatTimeKo(Date.parse('2026-10-25T03:00:00Z'), { timeZone: tz }), '오후 12시');
  assert.equal(formatTimeKo(Date.parse('2026-10-24T15:30:00Z'), { timeZone: tz }), '오전 12시 30분');
  assert.equal(formatTimeKo(Date.parse('2026-10-24T23:09:00Z'), { timeZone: tz }), '오전 8시 9분');
  assert.equal(formatLastChecked(t, { now: t + 60_000, timeZone: tz }), '마지막 확인 오후 3시 5분');
  assert.equal(formatLastChecked(t, { now: t + 86_400_000, timeZone: tz }), '마지막 확인 10월 25일 오후 3시 5분');
  assert.equal(formatLastChecked(undefined, { now: t }), '');
});

test('metaLine: 버전 · 날짜 · 크기, 버전에 날짜가 있으면 날짜는 한 번만', () => {
  const opts = { now: Date.parse('2026-10-25T12:00:00Z'), timeZone: 'Etc/GMT-9' };
  assert.equal(metaLine({ version: '2026.10.25 11:28', size: 86310093 }, opts), '버전 2026.10.25 11:28 · 86.3MB');
  assert.equal(metaLine({ version: '2026-10-24', date: '2026-10-24' }, opts), '버전 2026.10.24');
  assert.equal(metaLine({ version: '1.4', date: '2026-10-24' }, opts), '버전 1.4 · 10월 24일');
  assert.equal(metaLine({}, opts), '');
  assert.equal(normalizeVersion(' 2026-09-24 '), '2026.09.24');
});

test('저장소 목록 저장: 고르기에 쓰는 칸만, 10분, 고장 난 값은 버린다', () => {
  const now = Date.parse('2026-10-25T12:00:00Z');
  const raw = [rel('app-202610300000', '2026-10-30T00:00:00Z', [apk('app-202610300000')], { draft: true }), ...REAL];
  const trimmed = trimReleases(raw);
  assert.deepEqual(trimmed.map((r) => r.tag_name), ['voice-v3', 'voice-v2', 'app-202610251128', 'app-202610222242']);
  assert.deepEqual(Object.keys(trimmed[2]).sort(), ['assets', 'body', 'html_url', 'published_at', 'tag_name']);
  assert.deepEqual(pickRelease(trimmed, OPTS), pickRelease(raw, OPTS)); // 줄여 저장해도 고르는 결과는 같다

  const entry = makeRepoCacheEntry(raw, now);
  const back = parseRepoCacheEntry(JSON.stringify(entry));
  assert.deepEqual(back, entry);
  assert.equal(CACHE_MAX_AGE_MS, 600_000);
  assert.equal(isFresh(back, now + 9 * 60_000), true);
  assert.equal(isFresh(back, now + 10 * 60_000), false);
  assert.equal(isFresh(back, now - 1000), false); // 시계가 뒤로 가면 다시 묻는다
  assert.equal(isFresh(null, now), false);
  for (const bad of ['', '{', 'null', '[]', '{"v":1,"checkedAt":1,"release":null}', '{"v":2,"checkedAt":1}', '{"v":2,"releases":[]}']) {
    assert.equal(parseRepoCacheEntry(bad), null, bad);
  }
  assert.equal(parseRepoCacheEntry(null), null);
  // 저장분이 고쳐져 이상한 주소가 들어 있어도 설치 버튼으로는 안 나간다
  const tampered = JSON.parse(JSON.stringify(entry));
  for (const r of tampered.releases) for (const a of r.assets) a.browser_download_url = 'javascript:alert(1)';
  assert.equal(pickRelease(parseRepoCacheEntry(JSON.stringify(tampered)).releases, OPTS), null);
  assert.equal(repoCacheKey(REPO), 'yena-store.releases.yl4315/yena-day');
});

// ── 저장소마다 한 번만 읽기 (CR-038 새 앱 공장: 여러 앱이 yl4315/yena-store 릴리스를 같이 씀) ──

const STORE = 'yl4315/yena-store';
const relIn = (repo, tag, publishedAt) => ({
  tag_name: tag,
  draft: false,
  prerelease: false,
  published_at: publishedAt,
  html_url: `https://github.com/${repo}/releases/tag/${tag}`,
  body: `${tag} 설명`,
  assets: [{ name: 'app.apk', size: 1234567, state: 'uploaded', browser_download_url: `https://github.com/${repo}/releases/download/${tag}/app.apk` }],
});
const androidApp = (id, repo, tagPrefix) => ({
  id,
  kind: 'android-release',
  release: { repo, tagPrefix, asset: '.apk', fallbackUrl: `https://github.com/${repo}/releases` },
});
const CAL = androidApp('calendar', REPO, 'app-');
const FRIDGE = androidApp('fridge', STORE, 'fridge-');
const RECEIPT = androidApp('receipt', STORE, 'receipt-');
const STORE_LIST = [
  relIn(STORE, 'fridge-202611020900', '2026-11-02T09:00:00Z'),
  relIn(STORE, 'receipt-202611011200', '2026-11-01T12:00:00Z'),
  relIn(STORE, 'fridge-202611010800', '2026-11-01T08:00:00Z'),
];

/** 가짜 GitHub·localStorage·시계. calls = GitHub에 물은 주소 목록 */
function fakeEnv(lists) {
  const store = new Map();
  const env = {
    calls: [],
    store,
    time: Date.parse('2026-11-02T10:00:00Z'),
    fail: false,
  };
  env.loader = createRepoLoader({
    fetchList: async (url) => {
      env.calls.push(url);
      await new Promise((r) => setTimeout(r, 5));
      if (env.fail) throw new Error('인터넷 끊김');
      const repo = /repos\/([^/]+\/[^/]+)\/releases/.exec(url)[1];
      return lists[repo] ?? { message: 'API rate limit exceeded' };
    },
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    now: () => env.time,
  });
  return env;
}
const statesFor = (env, apps) => Promise.all(apps.map(async (a) => releaseStateFor(a, await env.loader.load(a.release.repo))));

test('저장소마다 한 번만: 같은 저장소 앱 둘 + 캘린더 → GitHub 요청 두 번, 앱마다 자기 릴리스', async () => {
  const env = fakeEnv({ [REPO]: REAL, [STORE]: STORE_LIST });
  assert.equal(env.loader.load(STORE), env.loader.load(STORE), '같은 Promise를 함께 쓴다');
  const [cal, fridge, receipt] = await statesFor(env, [CAL, FRIDGE, RECEIPT]);
  assert.deepEqual([...env.calls].sort(), [releasesApiUrl(REPO), releasesApiUrl(STORE)].sort());
  assert.equal(cal.release.tag, 'app-202610251128');
  assert.equal(fridge.release.tag, 'fridge-202611020900');
  assert.equal(fridge.release.version, '2026.11.02 09:00');
  assert.equal(receipt.release.tag, 'receipt-202611011200');
  for (const st of [cal, fridge, receipt]) assert.equal(st.status, 'ok');
  // 저장도 저장소 단위로 두 칸
  assert.deepEqual([...env.store.keys()].sort(), [repoCacheKey(REPO), repoCacheKey(STORE)].sort());

  // 다시 확인해도(reset) 10분 안이면 GitHub에 묻지 않는다
  env.loader.reset();
  env.time += 9 * 60_000;
  await statesFor(env, [CAL, FRIDGE, RECEIPT]);
  assert.equal(env.calls.length, 2);

  // 10분이 지나면 저장소마다 한 번씩만 다시
  env.loader.reset();
  env.time += 2 * 60_000;
  await statesFor(env, [FRIDGE, RECEIPT, CAL, FRIDGE]);
  assert.equal(env.calls.length, 4);
});

test('저장소마다 한 번만: 실패하면 앱마다 "마지막 확인" 또는 "GitHub에서 보기"', async () => {
  const env = fakeEnv({ [STORE]: STORE_LIST.filter((r) => r.tag_name.startsWith('fridge-')) });
  const checkedAt = env.time;
  await statesFor(env, [FRIDGE]); // 목록 저장 (receipt 릴리스는 아직 없을 때)
  env.loader.reset();
  env.time += 60 * 60_000;
  env.fail = true;
  const [fridge, receipt, cal] = await statesFor(env, [FRIDGE, RECEIPT, CAL]);
  assert.equal(env.calls.length, 3); // 처음 yena-store 한 번 + 이번 yena-store 한 번 + yena-day 한 번
  assert.equal(fridge.status, 'stale');
  assert.equal(fridge.checkedAt, checkedAt);
  assert.equal(fridge.release.tag, 'fridge-202611020900');
  assert.deepEqual(receipt, { status: 'error' }); // 저장분에 이 앱 것이 없다
  assert.deepEqual(cal, { status: 'error' }); // 저장분 자체가 없다

  const opts = { now: env.time, timeZone: 'Etc/GMT-9' };
  assert.match(cardView(FRIDGE, fridge, opts).status, /^마지막 확인 /);
  assert.equal(cardView(FRIDGE, fridge, opts).action.type, 'install');
  assert.equal(cardView(RECEIPT, receipt, opts).action.label, 'GitHub에서 보기');
  assert.equal(cardView(RECEIPT, receipt, opts).action.href, 'https://github.com/yl4315/yena-store/releases');
  assert.equal(cardView(CAL, cal, opts).action.href, 'https://github.com/yl4315/yena-day/releases');
});

test('저장소마다 한 번만: 목록이 아닌 답(한도 초과 등)은 실패, localStorage가 막혀도 화면은 돈다', async () => {
  const env = fakeEnv({});
  const [cal] = await statesFor(env, [CAL]);
  assert.deepEqual(cal, { status: 'error' });
  assert.equal(env.store.size, 0, '실패한 답은 저장하지 않는다');

  const blocked = createRepoLoader({
    fetchList: async () => REAL,
    getItem: () => {
      throw new Error('막힘');
    },
    setItem: () => {
      throw new Error('막힘');
    },
  });
  const st = releaseStateFor(CAL, await blocked.load(REPO));
  assert.equal(st.status, 'ok');
  assert.equal(st.release.tag, 'app-202610251128');

  // 목록은 받았는데 이 앱 릴리스가 없으면 "아직 올라온 설치 파일이 없어요"
  const fresh = androidApp('fresh', STORE, 'fresh-');
  const none = releaseStateFor(fresh, { status: 'ok', releases: STORE_LIST, checkedAt: 1 });
  assert.deepEqual(none, { status: 'ok', release: null, checkedAt: 1 });
  assert.match(cardView(fresh, none).status, /설치 파일이 없어요/);
});

test('cardView: 캘린더 — 불러오는 중 / 성공 / 실패 후 저장분 / 실패하고 저장분도 없음 / 파일 없음', () => {
  const app = {
    id: 'calendar',
    name: '예나의 하루',
    kind: 'android-release',
    notice: '안드로이드 폰 전용이에요',
    release: { repo: REPO, tagPrefix: 'app-', asset: '.apk', fallbackUrl: 'https://github.com/yl4315/yena-day/releases' },
  };
  const opts = { now: Date.parse('2026-10-25T06:30:00Z'), timeZone: 'Etc/GMT-9' };
  const release = pickRelease(REAL, OPTS);

  const loading = cardView(app, { status: 'loading' }, opts);
  assert.equal(loading.loading, true);
  assert.equal(loading.action.type, 'loading');

  const ok = cardView(app, { status: 'ok', release, checkedAt: opts.now }, opts);
  assert.equal(ok.meta, '버전 2026.10.25 11:28 · 86.3MB');
  assert.equal(ok.action.type, 'install');
  assert.equal(ok.action.label, '설치');
  assert.equal(ok.action.href, release.fileUrl);
  assert.equal(ok.status, '');
  assert.equal(ok.notice, '안드로이드 폰 전용이에요');

  const stale = cardView(app, { status: 'stale', release, checkedAt: Date.parse('2026-10-25T06:05:00Z') }, opts);
  assert.equal(stale.action.type, 'install');
  assert.equal(stale.status, '마지막 확인 오후 3시 5분');

  const error = cardView(app, { status: 'error' }, opts);
  assert.equal(error.action.type, 'link');
  assert.equal(error.action.label, 'GitHub에서 보기');
  assert.equal(error.action.href, 'https://github.com/yl4315/yena-day/releases');
  assert.equal(error.action.newTab, true);
  assert.match(error.status, /확인하지 못했어요/);

  const none = cardView(app, { status: 'ok', release: null, checkedAt: opts.now }, opts);
  assert.equal(none.action.type, 'link');
  assert.match(none.status, /설치 파일이 없어요/);
});

test('cardView: 웹앱은 "열기" 새 탭, 가족 앱은 버튼 없이 잠금 안내', () => {
  const web = cardView(
    { kind: 'web', url: 'https://yl4315.github.io/yt-noraebang/', version: '2026-10-24', date: '2026-10-24', notes: '바뀐 점', notice: '안내' },
    {},
    { now: Date.parse('2026-10-25T00:00:00Z') },
  );
  assert.deepEqual(web.action, { type: 'open', label: '열기', href: 'https://yl4315.github.io/yt-noraebang/', newTab: true });
  assert.equal(web.meta, '버전 2026.10.24');
  assert.equal(web.notes, '바뀐 점');

  const priv = cardView({ kind: 'private', notice: '가족 전용 — 관리자에게 초대를 받아요' });
  assert.deepEqual(priv.action, { type: 'locked', label: '가족 전용 — 관리자에게 초대를 받아요' });
  assert.equal(priv.meta, '');
  assert.equal(priv.notice, '');
});
