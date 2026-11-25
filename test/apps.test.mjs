// apps.json 검사: 지금 파일이 규칙에 맞는지 + 규칙 자체가 틀린 칸을 잡는지.
// 부서가 자기 앱 칸을 고친 뒤 npm test 한 번이면 여기서 걸린다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { validateApp, validateApps, visibleApps } from '../store-core.js';

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
  assert.equal(byId.family.name, '예태 가족'); // 앱 안 이름 (CR-022), 홈 화면 아이콘 이름은 short "가족"
  assert.equal(byId.finance.name, '예태 가계부');
});

test('가계부 (CR-059): 앱 가게 저장소 릴리스의 finance- 태그 APK, 웹 주소는 안내에만', () => {
  const f = byId.finance;
  assert.equal(f.kind, 'android-release');
  assert.equal(f.short, '가계부');
  assert.deepEqual(f.release, {
    repo: 'yl4315/yena-store',
    tagPrefix: 'finance-',
    asset: '.apk',
    fallbackUrl: 'https://github.com/yl4315/yena-store/releases',
  });
  for (const k of ['url', 'version', 'date', 'notes']) assert.equal(f[k], undefined, `${k}: 버전은 GitHub에서 자동으로 읽는다`);
  assert.match(f.notice, /https:\/\/yetae-fi\.vercel\.app/);
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

test('가족 앱 (CR-049): 공개 저장소 yetae-world 릴리스의 번호 태그 app-N APK, 버전 0.1.N', () => {
  const f = byId.family;
  assert.equal(f.kind, 'android-release');
  assert.equal(f.short, '가족');
  assert.deepEqual(f.release, {
    repo: 'yl4315/yetae-world',
    tagPrefix: 'app-',
    asset: '.apk',
    fallbackUrl: 'https://github.com/yl4315/yetae-world/releases',
    versionPrefix: '0.1.',
  });
  for (const k of ['url', 'version', 'date', 'notes']) assert.equal(f[k], undefined, `${k}: 버전은 GitHub에서 자동으로 읽는다`);
  // 안내: 로그인은 여전히 초대된 가족만 + 처음 설치 안내. 초대 링크·주소는 넣지 않는다
  assert.match(f.notice, /초대받은 가족만 로그인돼요/);
  assert.match(f.notice, /처음 설치할 때/);
  // 한국 방문 준비 (CR-117): 아이폰은 안 되고, 카톡에서 안 열리면 아래 안내로
  assert.match(f.notice, /아이폰은 안 돼요/);
  assert.match(f.notice, /카톡에서 안 열리/);
  assert.ok(f.notice.length <= 80);
  assert.doesNotMatch(f.notice, /https?:|www\./);
  // 주소는 공개 릴리스 페이지·저장소뿐
  const urls = JSON.stringify(f).match(/https?:\/\/[^"]+/g);
  assert.deepEqual(urls, ['https://github.com/yl4315/yetae-world/releases']);
});

test('웹앱: 주소는 https만', () => {
  for (const a of data.apps.filter((x) => x.kind === 'web')) {
    assert.match(a.url, /^https:\/\//, a.id);
  }
  assert.doesNotMatch(JSON.stringify(data), /http:\/\//);
});

test('아이콘 색 (CR-255 KIT-32: 그 앱 아이콘 팔레트 icon.app.<색>.top, 가계부는 CR-060부터 바질 top 그대로)', () => {
  assert.equal(byId.calendar.color, '#FDE1EA');
  assert.equal(byId.karaoke.color, '#F5E6FF');
  assert.equal(byId.family.color, '#FFE6E9');
  assert.equal(byId.finance.color, '#DBF5DF');
});

// 카드 대신 색 (아이콘이 안 뜰 때 보이는 둥근 칸) = 그 앱 아이콘 바탕 그라데이션 첫 색.
// 값은 회사 토큰 v1.5.0 icon.app.<팔레트>.top (디자인실 CR-255 보기 3장 표). 아이콘 팔레트가 바뀌면 이 표도 같이.
const ICON_TOP = {
  calendar: ['haru', '#FDE1EA'],
  karaoke: ['grape', '#F5E6FF'],
  family: ['flamingo', '#FFE6E9'],
  finance: ['basil', '#DBF5DF'],
  packing: ['peacock', '#D6F2FE'],
  tip: ['tangerine', '#FEE8D6'],
  memo: ['banana', '#FBF1C7'],
  focus: ['tomato', '#FEE7E2'],
  briefing: ['blue', '#E2EEFF'],
  worklog: ['blueberry', '#EAEBFE'],
  fridge: ['mint', '#D0F6F2'],
  vanity: ['plum', '#FFE4F4'],
  supplies: ['blue', '#E2EEFF'],
  receipt: ['tomato', '#FEE7E2'],
  desk: ['grape', '#F5E6FF'],
  photoclean: ['mint', '#D0F6F2'],
  greencard: ['tangerine', '#FEE8D6'],
  piano: ['graphite', '#EFF0F3'],
  assistant: ['peacock', '#D6F2FE'],
  couple: ['banana', '#FBF1C7'],
};

test('아이콘 색 (CR-255 KIT-32): 20칸 모두 그 앱 아이콘 팔레트 top 색 (숨긴 앱도 다시 보일 때 맞게)', () => {
  assert.deepEqual(Object.keys(ICON_TOP).sort(), data.apps.map((a) => a.id).sort(), '표와 apps.json의 앱이 같다');
  for (const a of data.apps) {
    const [palette, top] = ICON_TOP[a.id];
    assert.equal(a.color, top, `${a.id}: icon.app.${palette}.top`);
  }
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

test('검사: 번호 태그 앱의 versionPrefix ("0.1."처럼 숫자와 점, 점으로 끝)', () => {
  const NUM = { ...AND, release: { ...AND.release, repo: 'yl4315/yetae-world', fallbackUrl: 'https://github.com/yl4315/yetae-world/releases', versionPrefix: '0.1.' } };
  assert.deepEqual(validateApp(NUM), []);
  for (const versionPrefix of ['1.', '2.0.', '10.20.30.']) {
    assert.deepEqual(validateApp({ ...NUM, release: { ...NUM.release, versionPrefix } }), [], versionPrefix);
  }
  for (const versionPrefix of ['', '0.1', 'v0.1.', '.', '0..', 'a.', '0.1.2.3.', ' 0.1.', 1, null, true]) {
    assert.ok(has(validateApp({ ...NUM, release: { ...NUM.release, versionPrefix } }), /versionPrefix/), String(versionPrefix));
  }
  // web·private에는 release 자체가 없다
  assert.ok(has(validateApp({ ...WEB, release: NUM.release }), /모르는 칸 "release"/));
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

// ── 쉬는 앱 숨기기 (CR-178) ──────────────────────────

const HIDDEN_IDS = ['tip', 'briefing', 'desk', 'greencard', 'packing', 'focus', 'photoclean', 'piano']; // greencard: CEO 11-12 밤 무기한 홀드 · 나머지 4개: CEO 11-12 밤 4+1 체제 (CR-192) · 노래방은 CR-255에서 다시 보임

test('검사: hidden은 true나 false만 (있으면), 아니면 틀린 칸', () => {
  for (const hidden of [true, false]) {
    assert.deepEqual(validateApp({ ...AND, hidden }), [], String(hidden));
    assert.deepEqual(validateApp({ ...WEB, hidden }), [], String(hidden));
    assert.deepEqual(validateApp({ ...PRIV, hidden }), [], String(hidden));
  }
  for (const hidden of ['yes', 'true', 'false', 0, 1, null, [], {}]) {
    assert.ok(has(validateApp({ ...AND, hidden }), /hidden/), JSON.stringify(hidden));
  }
  // 틀린 hidden 칸이 있는 앱은 validateApps에서 빠진다 (다른 앱은 그대로)
  const { errors, apps } = validateApps({ apps: [WEB, { ...AND, id: 'x', hidden: 'yes' }] });
  assert.deepEqual(apps.map((a) => a.id), ['demo']);
  assert.ok(errors.some((e) => /^x: hidden/.test(e)));
});

test('visibleApps: hidden: true인 앱만 빼고 순서는 그대로', () => {
  const list = [
    { ...WEB, id: 'a' },
    { ...AND, id: 'b', hidden: true },
    { ...PRIV, id: 'c' },
    { ...AND, id: 'd', hidden: true },
    { ...AND, id: 'e' },
  ];
  assert.deepEqual(visibleApps(list).map((a) => a.id), ['a', 'c', 'e']);
  assert.equal(list.length, 5, '원래 목록은 그대로');
  assert.deepEqual(visibleApps([]), []);
  assert.deepEqual(visibleApps(null), []);
  assert.deepEqual(visibleApps(undefined), []);
});

test('hidden: false는 보이는 앱 (검사 통과, validateApps·visibleApps에 남는다)', () => {
  const list = { apps: [{ ...WEB, id: 'a', hidden: false }, { ...AND, id: 'b', hidden: true }, { ...PRIV, id: 'c', hidden: false }] };
  const { errors, apps } = validateApps(list);
  assert.deepEqual(errors, []);
  assert.deepEqual(apps.map((a) => a.id), ['a', 'b', 'c']);
  assert.deepEqual(visibleApps(apps).map((a) => a.id), ['a', 'c']);
});

test('apps.json: 쉬는 앱 8개(desk·briefing·tip·greencard + 4+1 밖 4개)만 숨기고, 보이는 앱은 20 − 8 = 12 (노래방은 CR-255에서 다시 보임)', () => {
  assert.equal(data.apps.length, 20);
  assert.deepEqual(data.apps.filter((a) => 'hidden' in a).map((a) => a.id).sort(), [...HIDDEN_IDS].sort());
  const { apps } = validateApps(data);
  const shown = visibleApps(apps).map((a) => a.id);
  assert.equal(shown.length, 12);
  for (const id of HIDDEN_IDS) assert.ok(!shown.includes(id), `${id}는 가게에 안 보인다`);
  // 나머지 12개는 apps.json 순서 그대로
  assert.deepEqual(shown, data.apps.map((a) => a.id).filter((id) => !HIDDEN_IDS.includes(id)));
});

test('apps.json: 숨긴 앱도 칸은 망가지지 않았다 (검사 통과, 릴리스·아이콘 그대로 → hidden만 빼면 다시 보임)', () => {
  for (const id of HIDDEN_IDS) {
    const a = byId[id];
    assert.equal(a.hidden, true, id);
    assert.deepEqual(validateApp(a), [], id);
    assert.equal(a.kind, 'android-release', id);
    assert.deepEqual(a.release, {
      repo: 'yl4315/yena-store',
      tagPrefix: `${id}-`,
      asset: '.apk',
      fallbackUrl: 'https://github.com/yl4315/yena-store/releases',
    });
    assert.equal(a.icon, `icons/apps/${id}.png`, id);
    const { hidden: _h, ...shownAgain } = a;
    assert.deepEqual(validateApp(shownAgain), [], `${id}: hidden을 빼도 통과`);
    assert.deepEqual(visibleApps([shownAgain]).map((x) => x.id), [id]);
  }
});

test('화면 (app.js): 보이는 앱만 카드를 그리고, 그 앱만 릴리스를 묻는다', () => {
  const src = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  assert.match(src, /import \{[^}]*\bvisibleApps\b[^}]*\} from '\.\/store-core\.js';/);
  const load = src.slice(src.indexOf('async function loadApps()'), src.indexOf('// ── 테마'));
  const filtered = load.indexOf('const apps = visibleApps(valid);');
  assert.ok(filtered > 0, 'validateApps 결과를 visibleApps로 거른다');
  assert.ok(load.indexOf('for (const app of apps)') > filtered, '카드 그리기·릴리스 묻기는 거른 목록으로');
  // 릴리스는 그린 카드(releaseCards)에서만 묻는다
  assert.equal((src.match(/refreshRelease\(/g) || []).length, 3, 'refreshRelease: 정의 + loadApps + 돌아왔을 때');
  assert.match(src, /releaseCards\.forEach\(\(p\) => refreshRelease\(p, \{ showLoading: false \}\)\)/);
});

// ── CR-255 가게 글 (KIT-12 옛 앱 · X-11 노래방) ──────────

// 옛 앱 7개: 숨기지 않고 "옛 앱이에요. 지우지 말고 …" 꼴 (팀장 앱 검토 G-11 · 디자인실 1장). 새 앱 이름은 가게 카드 이름 그대로
const OLD_APPS = {
  // '할 일' 안 빈칸은 줄이 안 바뀌는 빈칸 U+00A0 (412 너비에서 '할'·'일'이 두 줄로 갈려서, 디자인실 CR-255 검토)
  // '안에서 써요' 사이도 U+00A0 ('써요'만 다음 줄로 가지 않게, 디자인실 CR-255 사진 보기 권함)
  memo: "옛 앱이에요. 지우지 말고 '예나의 하루' 안 '할 일'을 써요",
  worklog: "옛 앱이에요. 지우지 말고 '예나의 하루' 안 '일기'를 써요",
  assistant: "옛 앱이에요. 지우지 말고 '예나의 하루' 안 '비서'를 써요",
  couple: "옛 앱이에요. 지우지 말고 '예나의 하루' 안 '부부회의'를 써요",
  vanity: "옛 앱이에요. 지우지 말고 '스마트 살림' 안에서 써요",
  supplies: "옛 앱이에요. 지우지 말고 '스마트 살림' 안에서 써요",
  receipt: "옛 앱이에요. 지우지 말고 '예태 가계부' 안에서 써요",
};

test('옛 앱 7개 (CR-255 KIT-12): "옛 앱이에요."로 시작 + "지우지 말고" + 40자 안, 숨기지 않고 설치 칸 그대로', () => {
  const { apps } = validateApps(data);
  const shown = visibleApps(apps).map((a) => a.id);
  const names = new Set(data.apps.map((a) => a.name));
  for (const [id, summary] of Object.entries(OLD_APPS)) {
    const a = byId[id];
    assert.equal(a.summary, summary, id);
    assert.ok(a.summary.startsWith('옛 앱이에요.'), id);
    assert.ok(a.summary.includes('지우지 말고'), id);
    assert.ok(a.summary.length <= 40, `${id}: ${a.summary.length}자`);
    assert.equal('hidden' in a, false, `${id}: 숨기지 않는다`);
    assert.deepEqual(validateApp(a), [], id);
    assert.ok(shown.includes(id), `${id}는 가게에 보인다`);
    // 지금처럼 받아서 깔 수 있다: 이 저장소 릴리스의 자기 앞머리 APK
    assert.equal(a.kind, 'android-release', id);
    assert.equal(a.release.tagPrefix, `${id}-`, id);
    // 가리키는 새 앱 이름은 가게 카드 이름 그대로
    const target = /'([^']+)' 안/.exec(a.summary)[1];
    assert.ok(names.has(target), `${id}: '${target}' 카드가 있다`);
  }
  // '안전망'은 회사 안 말이라 가게 글에 안 쓴다
  assert.doesNotMatch(JSON.stringify(data), /안전망/);
});

test('캘린더 "예나의 하루" 소개 (CR-255): 할 일·일기·비서·부부회의가 한 앱에', () => {
  const s = byId.calendar.summary;
  // '한 앱에서' 사이는 U+00A0 ('앱에서'만 다음 줄로 가지 않게, 디자인실 CR-255 사진 보기 권함)
  assert.equal(s, '일정·루틴·할 일·일기·비서·부부회의를 한 앱에서');
  for (const w of ['비서', '할 일', '일기', '부부회의']) assert.ok(s.includes(w), w);
});

test('노래방 (CR-255 X-11·KIT-13): 다시 보이고, 11-24 판 글 (~해요 5줄)', () => {
  const k = byId.karaoke;
  assert.equal('hidden' in k, false, 'hidden 줄은 지운다 (false로 남기지 않음)');
  assert.deepEqual(validateApp(k), []);
  assert.ok(visibleApps(validateApps(data).apps).some((a) => a.id === 'karaoke'));
  assert.equal(k.kind, 'web');
  assert.equal(k.url, 'https://yl4315.github.io/yt-noraebang/');
  assert.equal(k.version, '2026-11-24');
  assert.equal(k.date, '2026-11-24');
  assert.ok(k.notes.length <= 300, `notes ${k.notes.length}자`);
  assert.ok(k.notice.length <= 80, `notice ${k.notice.length}자`);
  const lines = k.notes.split('\n');
  assert.equal(lines.length, 5, '한 줄에 하나씩 5줄');
  for (const line of lines) assert.match(line, /요( \([^)]*\))?$/, `"~해요"로 끝: ${line}`);
  assert.ok(k.notes.includes('유튜브'));
  assert.ok(k.notes.includes('리모컨'));
  assert.ok(k.notice.includes('리모컨'));
  // 크리에이티브 랩이 세는 판 이름·멈춘 기능(재생목록 넣기)은 글에 없다
  assert.doesNotMatch(k.notes, /차 판|재생목록/);
});
