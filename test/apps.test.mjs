// apps.json 검사: 지금 파일이 규칙에 맞는지 + 규칙 자체가 틀린 칸을 잡는지.
// 부서가 자기 앱 칸을 고친 뒤 npm test 한 번이면 여기서 걸린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateApp, validateApps } from '../store-core.js';

const data = JSON.parse(readFileSync(new URL('../apps.json', import.meta.url), 'utf8'));
const byId = Object.fromEntries(data.apps.map((a) => [a.id, a]));

test('apps.json: 틀린 칸이 하나도 없다', () => {
  const { errors, apps } = validateApps(data);
  assert.deepEqual(errors, []);
  assert.equal(apps.length, data.apps.length);
});

test('apps.json: id가 겹치지 않는다', () => {
  const ids = data.apps.map((a) => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('apps.json: 처음 네 칸은 기존 앱 (CR-037), 새 앱은 그 뒤에 (CR-038 새 앱 공장)', () => {
  assert.deepEqual(Object.keys(byId).slice(0, 4), ['calendar', 'karaoke', 'family', 'finance']);
  assert.equal(byId.calendar.name, '예나의 하루');
  assert.equal(byId.karaoke.name, 'YT 노래방');
  assert.equal(byId.family.name, 'YeTae-World');
  assert.equal(byId.finance.name, 'YeTae-Fi 가계부');
});

test('캘린더: GitHub 릴리스의 app- 태그 APK', () => {
  const c = byId.calendar;
  assert.equal(c.kind, 'android-release');
  assert.deepEqual(c.release, {
    repo: 'yl4315/yena-day',
    tagPrefix: 'app-',
    asset: '.apk',
    fallbackUrl: 'https://github.com/yl4315/yena-day/releases',
  });
  assert.equal(c.version, undefined, '버전은 GitHub에서 자동으로 읽는다');
});

test('가족 앱: 버튼·주소·버전 없이 안내만', () => {
  const f = byId.family;
  assert.equal(f.kind, 'private');
  for (const k of ['url', 'version', 'date', 'notes', 'release']) assert.equal(f[k], undefined, k);
  assert.equal(f.notice, '가족 전용 — 관리자에게 초대를 받아요');
  assert.doesNotMatch(JSON.stringify(f), /https?:|www\./);
});

test('웹앱: 주소는 https만', () => {
  for (const a of data.apps.filter((x) => x.kind === 'web')) {
    assert.match(a.url, /^https:\/\//, a.id);
  }
  assert.doesNotMatch(JSON.stringify(data), /http:\/\//);
});

test('부서 아이콘 색 (디자인 언어 3-8 icon.dept.*)', () => {
  assert.equal(byId.calendar.color, '#FDE8EE');
  assert.equal(byId.karaoke.color, '#FDDCCF');
  assert.equal(byId.family.color, '#CDEEDD');
  assert.equal(byId.finance.color, '#FDF0C4');
});

// ── 규칙이 틀린 칸을 잡는지 ──────────────────────────

const base = {
  id: 'demo',
  name: '데모',
  short: '데모',
  dept: '패밀리 허브',
  icon: 'icons/apps/demo.png',
  color: '#CDEEDD',
  summary: '한 줄 설명',
};
const WEB = { ...base, kind: 'web', url: 'https://example.github.io/demo/', version: '2026-10-24', date: '2026-10-24', notes: '바뀐 점' };
const AND = {
  ...base,
  kind: 'android-release',
  release: { repo: 'yl4315/yena-day', tagPrefix: 'app-', asset: '.apk', fallbackUrl: 'https://github.com/yl4315/yena-day/releases' },
};
const PRIV = { ...base, kind: 'private', notice: '가족 전용' };

const has = (errs, re) => errs.some((e) => re.test(e));

test('검사: 맞는 칸은 통과', () => {
  assert.deepEqual(validateApp(WEB), []);
  assert.deepEqual(validateApp(AND), []);
  assert.deepEqual(validateApp(PRIV), []);
});

test('검사: kind별 필수 칸', () => {
  for (const k of ['url', 'version', 'date', 'notes']) {
    const { [k]: _, ...rest } = WEB;
    assert.ok(validateApp(rest).length > 0, `web에 ${k}가 없으면 실패`);
  }
  const { release: _r, ...noRelease } = AND;
  assert.ok(has(validateApp(noRelease), /release 칸이 필요/));
  for (const k of ['repo', 'tagPrefix', 'asset', 'fallbackUrl']) {
    const { [k]: _, ...rest } = AND.release;
    assert.ok(validateApp({ ...AND, release: rest }).length > 0, `release.${k}가 없으면 실패`);
  }
  const { notice: _n, ...noNotice } = PRIV;
  assert.ok(has(validateApp(noNotice), /notice/));
  assert.ok(has(validateApp({ ...WEB, kind: 'apk' }), /kind는/));
  assert.ok(has(validateApp({ ...WEB, name: '' }), /name/));
  assert.ok(has(validateApp({ ...WEB, summary: '가'.repeat(41) }), /summary/));
  assert.ok(has(validateApp({ ...WEB, summary: '두\n줄' }), /summary/));
  assert.ok(has(validateApp({ ...WEB, color: 'pink' }), /color/));
  assert.ok(has(validateApp({ ...WEB, icon: 'https://example.com/a.png' }), /icon/));
  assert.ok(has(validateApp({ ...WEB, icon: 'icons/../secret.png' }), /icon/));
  assert.ok(has(validateApp({ ...WEB, date: '2026-13-01' }), /date/));
  assert.ok(has(validateApp({ ...WEB, id: 'Has Space' }), /id/));
  assert.ok(has(validateApp({ ...AND, release: { ...AND.release, repo: 'yena-day' } }), /repo/));
  assert.ok(has(validateApp({ ...AND, release: { ...AND.release, asset: 'apk' } }), /asset/));
  for (const tagPrefix of ['app', 'App-', '', '-']) {
    assert.ok(has(validateApp({ ...AND, release: { ...AND.release, tagPrefix } }), /tagPrefix/), tagPrefix);
  }
  assert.deepEqual(validateApp({ ...AND, release: { ...AND.release, repo: 'yl4315/yena-store', tagPrefix: 'fridge-' } }), []);
});

test('검사: 주소는 https만', () => {
  assert.ok(has(validateApp({ ...WEB, url: 'http://example.com/' }), /url/));
  assert.ok(has(validateApp({ ...WEB, url: 'javascript:alert(1)' }), /url/));
  assert.ok(has(validateApp({ ...WEB, url: ['https://user:pw', '@', 'example.com/'].join('') }), /url/));
  assert.ok(has(validateApp({ ...AND, release: { ...AND.release, fallbackUrl: 'http://github.com/x' } }), /fallbackUrl/));
  assert.ok(has(validateApp({ ...WEB, notes: '자세히는 http://example.com 에서' }), /https만/));
});

test('검사: private에는 주소·버전·링크를 넣지 않는다', () => {
  assert.ok(has(validateApp({ ...PRIV, url: 'https://example.com/' }), /private에는 주소/));
  assert.ok(has(validateApp({ ...PRIV, version: '1.0' }), /private에는 주소/));
  assert.ok(has(validateApp({ ...PRIV, release: AND.release }), /private에는 주소/));
  assert.ok(has(validateApp({ ...PRIV, notice: '초대 링크 https://example.com/i/abc' }), /링크/));
});

test('검사: 모르는 칸(오타)을 잡는다', () => {
  assert.ok(has(validateApp({ ...WEB, verison: '1' }), /모르는 칸 "verison"/));
  assert.ok(has(validateApp({ ...AND, url: 'https://example.com/' }), /모르는 칸 "url"/));
  assert.ok(has(validateApp({ ...AND, release: { ...AND.release, tag: 'x' } }), /release 안에 모르는 칸/));
  assert.ok(validateApps({ apps: [WEB], extra: 1 }).errors.some((e) => /맨 위에 모르는 칸/.test(e)));
});

test('검사: id가 겹치면 뒤의 것은 화면에서 뺀다', () => {
  const { errors, apps } = validateApps({ apps: [WEB, { ...WEB, name: '둘째' }] });
  assert.equal(apps.length, 1);
  assert.ok(errors.some((e) => /겹쳐요/.test(e)));
});

test('검사: 틀린 앱만 빼고 나머지는 그린다', () => {
  const { errors, apps } = validateApps({ apps: [WEB, { ...PRIV, id: 'p', url: 'https://x.y/' }, null] });
  assert.deepEqual(apps.map((a) => a.id), ['demo']);
  assert.ok(errors.length >= 2);
  assert.ok(validateApps(null).errors.length > 0);
  assert.ok(validateApps({ apps: [] }).errors.length > 0);
});
