// 예나의 앱 가게 — 화면 없는 순수 함수 모음.
// 브라우저(app.js)와 Node 테스트(test/)가 같이 쓴다. DOM을 쓰지 않고 fetch·localStorage는 넣어 준 함수로만 쓴다.
// 지금 시각(now)과 시간대(timeZone)도 인자로 받는다 (테스트에서 고정하려고).

/** GitHub API는 로그인 없이 IP마다 시간당 60번 → 10분 안에는 저장해 둔 결과를 다시 쓴다. */
export const CACHE_MAX_AGE_MS = 10 * 60 * 1000;
/** 한 저장소에 여러 앱(CR-038 새 앱 공장: yl4315/yena-store에 <id>-YYYYMMDDHHmm)이 올라와도 넉넉하게. API 최대값 */
export const RELEASES_PER_PAGE = 100;
/** 태그 = 앞머리 + 숫자 12자리 (YYYYMMDDHHmm). 예: app-202610251128 */
export const RELEASE_TAG_STAMP = /^\d{12}$/;
/**
 * 번호 태그 = 앞머리 + 숫자 1~9자리 (0으로 시작하지 않음). release.versionPrefix가 있는 앱만 쓴다.
 * 예: 가족 앱 app-60 (번호 = 커밋 수 = versionCode) → 화면에는 versionPrefix를 붙여 "0.1.60".
 * 12자리 도장은 9자리를 넘어서 두 방식이 섞이지 않는다.
 */
export const RELEASE_TAG_NUMBER = /^[1-9]\d{0,8}$/;
export const KINDS = ['android-release', 'web', 'private'];

// ── 주소 ──────────────────────────────────────────────

export function isRepo(s) {
  return typeof s === 'string' && /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(s);
}

export function isHttpsUrl(s) {
  if (typeof s !== 'string' || /\s/.test(s)) return false;
  try {
    const u = new URL(s);
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** `/releases/latest`는 쓰지 않는다: 같은 저장소의 "Latest"는 음성 모델(voice-*) 릴리스다. */
export function releasesApiUrl(repo) {
  if (!isRepo(repo)) throw new Error(`repo 형식이 아니에요: ${repo}`);
  return `https://api.github.com/repos/${repo}/releases?per_page=${RELEASES_PER_PAGE}`;
}

// ── 릴리스 고르기 ─────────────────────────────────────

/**
 * 이 앱의 태그인지. 맞으면 앞머리 뒤 부분, 아니면 null.
 * - 날짜 도장 방식 (기본, versionPrefix 없음): 앞머리 + 숫자 12자리
 * - 번호 방식 (versionPrefix가 글자): 앞머리 + 숫자 1~9자리
 */
export function appTagRest(tag, tagPrefix, versionPrefix) {
  if (typeof tag !== 'string' || typeof tagPrefix !== 'string' || !tag.startsWith(tagPrefix)) return null;
  const rest = tag.slice(tagPrefix.length);
  const rule = typeof versionPrefix === 'string' ? RELEASE_TAG_NUMBER : RELEASE_TAG_STAMP;
  return rule.test(rest) ? rest : null;
}

/**
 * GitHub 릴리스 목록에서 설치 파일이 있는 가장 새 앱 릴리스를 고른다.
 * - 태그 = tagPrefix(예: "app-") + 숫자 12자리(YYYYMMDDHHmm)인 것만
 *   (voice-* 같은 다른 릴리스, 같은 저장소의 다른 앱 "app-store-…", "app-x"·"app-2026"은 무시)
 *   versionPrefix(예: "0.1.")가 있는 앱은 대신 tagPrefix + 번호(1~9자리)인 것만 (예: 가족 앱 "app-60")
 * - 초안(draft)·미리보기(prerelease, 가족 앱의 시험판) 제외
 * - asset 확장자(예: ".apk") 파일이 그 저장소의 다운로드 주소로 올라가 있는 것만
 * - 그중 날짜 도장 방식은 published_at이 가장 늦은 것 (API가 주는 순서를 믿지 않는다),
 *   번호 방식은 번호가 가장 큰 것 (번호 = versionCode라 안드로이드는 낮은 번호로 덮어 설치하지 못한다.
 *   옛 번호 릴리스를 나중에 다시 정식으로 바꿔도 더 큰 번호가 이긴다 — 가족 앱 안 업데이트 확인과 같은 기준)
 * 없으면 null.
 */
export function pickRelease(releases, { repo, tagPrefix = 'app-', asset = '.apk', versionPrefix } = {}) {
  if (!Array.isArray(releases)) return null;
  const numbered = typeof versionPrefix === 'string';
  const ext = String(asset).toLowerCase();
  const downloadBase = repo ? `https://github.com/${repo}/releases/download/` : 'https://github.com/';
  let best = null;
  let bestRank = -Infinity;
  for (const r of releases) {
    if (!r || typeof r !== 'object' || r.draft || r.prerelease) continue;
    const tag = r.tag_name;
    const rest = appTagRest(tag, tagPrefix, versionPrefix);
    if (rest === null) continue;
    const time = Date.parse(r.published_at);
    if (!Number.isFinite(time)) continue;
    const rank = numbered ? Number(rest) : time;
    const assets = Array.isArray(r.assets) ? r.assets : [];
    const file = assets.find(
      (a) =>
        a &&
        typeof a.name === 'string' &&
        a.name.toLowerCase().endsWith(ext) &&
        (a.state === undefined || a.state === 'uploaded') &&
        typeof a.browser_download_url === 'string' &&
        a.browser_download_url.startsWith(downloadBase) &&
        isHttpsUrl(a.browser_download_url),
    );
    if (!file || rank <= bestRank) continue;
    bestRank = rank;
    best = {
      tag,
      version: versionFromTag(tag, tagPrefix, versionPrefix),
      publishedAt: new Date(time).toISOString(),
      notes: cleanNotes(r.body),
      fileUrl: file.browser_download_url,
      fileName: file.name,
      size: Number.isFinite(file.size) ? file.size : null,
      pageUrl: isHttpsUrl(r.html_url) && r.html_url.startsWith('https://github.com/') ? r.html_url : null,
    };
  }
  return best;
}

/**
 * "app-202610251128" → "2026.10.25 11:28". 숫자 12자리 모양만 바꾸고, 그 밖은 앞머리만 뗀 그대로.
 * versionPrefix가 있으면 번호 태그에 붙인다: versionFromTag("app-60", "app-", "0.1.") → "0.1.60".
 */
export function versionFromTag(tag, prefix = '', versionPrefix) {
  if (typeof tag !== 'string') return '';
  const rest = prefix && tag.startsWith(prefix) ? tag.slice(prefix.length) : tag;
  if (typeof versionPrefix === 'string' && RELEASE_TAG_NUMBER.test(rest)) return `${versionPrefix}${rest}`;
  if (!RELEASE_TAG_STAMP.test(rest)) return rest;
  return `${rest.slice(0, 4)}.${rest.slice(4, 6)}.${rest.slice(6, 8)} ${rest.slice(8, 10)}:${rest.slice(10, 12)}`;
}

/** 릴리스 설명(마크다운)을 화면에 그대로 보여 줄 글로. 링크·HTML은 만들지 않는다 (글자로만 넣음). */
export function cleanNotes(body) {
  if (typeof body !== 'string') return '';
  return body
    .replace(/\r\n?/g, '\n')
    .replace(/<!--[\s\S]*?-->/g, '')
    .split('\n')
    .filter((line) => !/^\s*\**\s*Full Changelog\s*\**\s*:/i.test(line))
    .map((line) =>
      line
        .replace(/^\s{0,3}#{1,6}\s+/, '')
        .replace(/\*\*(.+?)\*\*/g, '$1')
        .replace(/^\s*[-*]\s+/, '· ')
        .trimEnd(),
    )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// ── 글로 바꾸기 (버전·날짜·크기) ─────────────────────

/** apps.json에 "2026-10-24"처럼 적은 버전은 캘린더 버전과 같은 모양 "2026.10.24"로 보여 준다. */
export function normalizeVersion(v) {
  if (typeof v !== 'string') return '';
  const s = v.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.replace(/-/g, '.') : s;
}

/** 버전 글에 이미 날짜가 들어 있으면(2026.10.25 …) 날짜를 따로 쓰지 않는다. */
export function versionHasDate(v) {
  return /^\d{4}\.\d{2}\.\d{2}/.test(normalizeVersion(v));
}

function isValidYmd(y, m, d) {
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

/** "2026-10-24" 같은 날짜만 있는 글인지 (시간대와 상관없이 그날). */
export function isYmd(s) {
  const m = typeof s === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  return !!m && isValidYmd(+m[1], +m[2], +m[3]);
}

function zonedParts(time, timeZone) {
  const f = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  });
  const p = {};
  for (const x of f.formatToParts(new Date(time))) p[x.type] = x.value;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour % 24, min: +p.minute };
}

function toTime(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string') return Date.parse(value);
  return NaN;
}

function dateParts(value, timeZone) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    if (!isYmd(value)) return null;
    const [y, m, d] = value.split('-').map(Number);
    return { y, m, d };
  }
  const t = toTime(value);
  return Number.isFinite(t) ? zonedParts(t, timeZone) : null;
}

/** "10월 24일" (올해), "2025년 10월 24일" (다른 해). 날짜만 있는 글은 시간대와 상관없이 그날. */
export function formatDateKo(value, { now = Date.now(), timeZone } = {}) {
  const p = dateParts(value, timeZone);
  if (!p) return '';
  const n = dateParts(now, timeZone);
  return n && n.y === p.y ? `${p.m}월 ${p.d}일` : `${p.y}년 ${p.m}월 ${p.d}일`;
}

/** "오후 3시 5분", 정각은 "오후 3시". */
export function formatTimeKo(value, { timeZone } = {}) {
  const t = toTime(value);
  if (!Number.isFinite(t)) return '';
  const p = zonedParts(t, timeZone);
  const half = p.h < 12 ? '오전' : '오후';
  const h12 = p.h % 12 === 0 ? 12 : p.h % 12;
  return p.min ? `${half} ${h12}시 ${p.min}분` : `${half} ${h12}시`;
}

/** "마지막 확인 오후 3시 5분" (오늘), 다른 날이면 날짜도 붙인다. */
export function formatLastChecked(checkedAt, { now = Date.now(), timeZone } = {}) {
  const t = toTime(checkedAt);
  if (!Number.isFinite(t)) return '';
  const a = zonedParts(t, timeZone);
  const b = zonedParts(toTime(now), timeZone);
  const sameDay = a.y === b.y && a.m === b.m && a.d === b.d;
  const time = formatTimeKo(t, { timeZone });
  return sameDay ? `마지막 확인 ${time}` : `마지막 확인 ${formatDateKo(t, { now, timeZone })} ${time}`;
}

/** 86,310,093 → "86.3MB". 1MB = 1,000,000바이트 (안드로이드 파일 앱·다운로드 화면과 같은 셈). */
export function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '';
  const mb = bytes / 1e6;
  if (mb >= 100) return `${Math.round(mb)}MB`;
  if (mb >= 1) return `${String(Math.round(mb * 10) / 10)}MB`;
  return `${Math.max(1, Math.round(bytes / 1e3))}KB`;
}

/** 카드의 "버전 · 날짜 · 크기" 한 줄. 버전에 날짜가 들어 있으면 날짜는 빼서 같은 말을 두 번 하지 않는다. */
export function metaLine({ version, date, size } = {}, opts = {}) {
  const v = normalizeVersion(version);
  const parts = [];
  if (v) parts.push(`버전 ${v}`);
  if (date && !versionHasDate(v)) {
    const d = formatDateKo(date, opts);
    if (d) parts.push(d);
  }
  const s = formatSize(size);
  if (s) parts.push(s);
  return parts.join(' · ');
}

// ── 저장소 릴리스 목록: 저장소마다 한 번만 읽고, 저장도 저장소 단위 ─────
// 여러 앱이 같은 저장소(예: 새 앱 공장의 yl4315/yena-store)를 써도 GitHub에는 화면을 열 때 한 번만 묻는다.
// 각 앱은 그 목록에서 pickRelease로 자기 태그 앞머리 릴리스를 고른다.

export function repoCacheKey(repo) {
  return `yena-store.releases.${repo}`;
}

const NOTES_MAX = 4000;

/** API 목록 → 저장할 만큼만 (초안·미리보기·파일 없는 것 빼고, 고르기에 쓰는 칸만). 모양이 이상한 것은 버린다. */
export function trimReleases(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const r of list) {
    if (!r || typeof r !== 'object' || r.draft || r.prerelease) continue;
    if (typeof r.tag_name !== 'string' || typeof r.published_at !== 'string' || !Number.isFinite(Date.parse(r.published_at))) continue;
    const assets = (Array.isArray(r.assets) ? r.assets : [])
      .filter((a) => a && typeof a.name === 'string' && typeof a.browser_download_url === 'string')
      .map((a) => {
        const x = { name: a.name, size: Number.isFinite(a.size) ? a.size : null, browser_download_url: a.browser_download_url };
        if (typeof a.state === 'string') x.state = a.state;
        return x;
      });
    if (!assets.length) continue;
    out.push({
      tag_name: r.tag_name,
      published_at: r.published_at,
      html_url: typeof r.html_url === 'string' ? r.html_url : null,
      body: typeof r.body === 'string' ? r.body.slice(0, NOTES_MAX) : '',
      assets,
    });
  }
  return out;
}

export function makeRepoCacheEntry(releases, checkedAt) {
  return { v: 2, checkedAt, releases: trimReleases(releases) };
}

/** localStorage 글 → 저장 항목. 모양이 틀리면 null (고장 난 값 때문에 화면이 깨지지 않게). */
export function parseRepoCacheEntry(text) {
  if (typeof text !== 'string' || !text) return null;
  let e;
  try {
    e = JSON.parse(text);
  } catch {
    return null;
  }
  if (!e || typeof e !== 'object' || e.v !== 2 || !Number.isFinite(e.checkedAt) || !Array.isArray(e.releases)) return null;
  return { v: 2, checkedAt: e.checkedAt, releases: trimReleases(e.releases) };
}

export function isFresh(entry, now, maxAgeMs = CACHE_MAX_AGE_MS) {
  if (!entry || !Number.isFinite(entry.checkedAt)) return false;
  const age = now - entry.checkedAt;
  return age >= 0 && age < maxAgeMs;
}

/**
 * 저장소 목록 읽기 (브라우저에서는 fetch·localStorage를 넣어 쓰고, 테스트에서는 가짜를 넣는다).
 * - 같은 저장소는 같은 Promise를 함께 쓴다 → 화면 한 번에 GitHub 요청 한 번
 * - 10분 안에 받은 목록이 있으면 GitHub에 묻지 않는다
 * - 실패하면 저장해 둔 목록(오래돼도) → status 'stale', 그것도 없으면 'error'
 * - reset(): 다른 앱에 갔다 돌아왔을 때처럼 다시 확인할 때 (10분 규칙은 그대로)
 * 돌려주는 값: { status: 'ok' | 'stale' | 'error', releases, checkedAt }
 */
export function createRepoLoader({ fetchList, getItem, setItem, now = () => Date.now() }) {
  const shared = new Map();
  const read = (key) => {
    try {
      return getItem(key);
    } catch {
      return null;
    }
  };
  async function run(repo) {
    const key = repoCacheKey(repo);
    const cached = parseRepoCacheEntry(read(key));
    if (isFresh(cached, now())) return { status: 'ok', releases: cached.releases, checkedAt: cached.checkedAt };
    try {
      const list = await fetchList(releasesApiUrl(repo));
      if (!Array.isArray(list)) throw new Error('릴리스 목록이 아니에요');
      const entry = makeRepoCacheEntry(list, now());
      try {
        setItem(key, JSON.stringify(entry));
      } catch {
        /* 저장 못 하면 다음에 다시 물어보면 된다 */
      }
      return { status: 'ok', releases: entry.releases, checkedAt: entry.checkedAt };
    } catch {
      if (cached) return { status: 'stale', releases: cached.releases, checkedAt: cached.checkedAt };
      return { status: 'error', releases: [], checkedAt: null };
    }
  }
  return {
    load(repo) {
      if (!shared.has(repo)) shared.set(repo, run(repo));
      return shared.get(repo);
    },
    reset() {
      shared.clear();
    },
  };
}

/** 저장소 목록 상태 → 이 앱의 카드 상태 (cardView에 넣는 값). 실패 표시는 앱마다 따로. */
export function releaseStateFor(app, repoState) {
  if (!repoState || repoState.status === 'error') return { status: 'error' };
  const { repo, tagPrefix, asset, versionPrefix } = app.release;
  const release = pickRelease(repoState.releases, { repo, tagPrefix, asset, versionPrefix });
  if (repoState.status === 'stale') {
    return release ? { status: 'stale', release, checkedAt: repoState.checkedAt } : { status: 'error' };
  }
  return { status: 'ok', release, checkedAt: repoState.checkedAt };
}

// ── 카드에 보일 내용 ──────────────────────────────────

/**
 * 앱 하나 + (android-release면) 릴리스 상태 → 카드에 보일 글과 버튼.
 * state.status: 'loading' | 'ok' | 'stale'(인터넷·API 실패, 저장해 둔 결과) | 'error'(실패, 저장한 것도 없음)
 * action.type: 'install' | 'open' | 'link' | 'loading' | 'locked'
 */
export function cardView(app, state = {}, opts = {}) {
  const view = { meta: '', notes: '', notice: '', status: '', loading: false, action: null };
  if (app.kind === 'private') {
    view.action = { type: 'locked', label: app.notice || '' };
    return view;
  }
  view.notice = app.notice || '';
  if (app.kind === 'web') {
    view.meta = metaLine({ version: app.version, date: app.date }, opts);
    view.notes = app.notes || '';
    view.action = { type: 'open', label: '열기', href: app.url, newTab: true };
    return view;
  }
  // android-release
  const fallback = { type: 'link', label: 'GitHub에서 보기', href: app.release.fallbackUrl, newTab: true };
  if (state.status === 'loading') {
    view.loading = true;
    view.action = { type: 'loading', label: '확인하는 중' };
    return view;
  }
  const r = state.release;
  if ((state.status === 'ok' || state.status === 'stale') && r) {
    // 날짜는 버전에 날짜가 없을 때만 보인다 (가족 앱 "버전 0.1.60 · 10월 27일 · 8.5MB", 캘린더는 버전이 날짜라 그대로)
    view.meta = metaLine({ version: r.version, date: r.publishedAt, size: r.size }, opts);
    view.notes = r.notes || '';
    view.action = { type: 'install', label: '설치', href: r.fileUrl, newTab: false };
    if (state.status === 'stale') view.status = formatLastChecked(state.checkedAt, opts);
    return view;
  }
  view.status = state.status === 'ok' ? '아직 올라온 설치 파일이 없어요' : '지금은 버전을 확인하지 못했어요';
  view.action = fallback;
  return view;
}

// ── apps.json 검사 ────────────────────────────────────

const COMMON_KEYS = ['id', 'name', 'short', 'dept', 'icon', 'color', 'summary', 'kind', 'notice'];
const KIND_KEYS = {
  'android-release': ['release'],
  web: ['url', 'version', 'date', 'notes'],
  private: [],
};
const RELEASE_KEYS = ['repo', 'tagPrefix', 'asset', 'fallbackUrl', 'versionPrefix'];

function text(v, max) {
  return typeof v === 'string' && v.trim().length > 0 && v.length <= max && !/[\r\n]/.test(v);
}

function allStrings(v, out = []) {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => allStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => allStrings(x, out));
  return out;
}

/** 앱 칸 하나를 검사해서 틀린 점(한국어) 목록을 돌려준다. 비어 있으면 통과. */
export function validateApp(app) {
  if (!app || typeof app !== 'object' || Array.isArray(app)) return ['앱 칸이 { } 모양이 아니에요'];
  const errs = [];
  if (!KINDS.includes(app.kind)) return [`kind는 ${KINDS.join(' / ')} 중 하나예요 (지금 "${app.kind}")`];
  const allowed = [...COMMON_KEYS, ...KIND_KEYS[app.kind]];
  for (const k of Object.keys(app)) {
    if (allowed.includes(k)) continue;
    if (app.kind === 'private' && ['url', 'version', 'date', 'notes', 'release'].includes(k)) {
      errs.push(`private에는 주소·버전을 넣지 않아요 ("${k}")`);
    } else errs.push(`모르는 칸 "${k}" (${app.kind}에는 없는 칸이에요)`);
  }
  if (typeof app.id !== 'string' || !/^[a-z][a-z0-9-]{0,30}$/.test(app.id)) errs.push('id는 영어 소문자·숫자·- 로 써요');
  if (!text(app.name, 24)) errs.push('name(앱 이름)은 한 줄, 24자까지');
  if (!text(app.short, 6)) errs.push('short(짧은 이름)는 한 줄, 6자까지');
  if (!text(app.dept, 20)) errs.push('dept(부서 이름)가 비었어요');
  if (!text(app.summary, 40)) errs.push('summary(한 줄 설명)는 한 줄, 40자까지');
  if (typeof app.icon !== 'string' || !/^icons\/[a-z0-9][a-z0-9_/-]*\.(png|webp)$/.test(app.icon) || app.icon.includes('..')) {
    errs.push('icon은 icons/ 안의 png·webp 경로예요 (예: icons/apps/calendar.png)');
  }
  if (typeof app.color !== 'string' || !/^#[0-9A-Fa-f]{6}$/.test(app.color)) errs.push('color는 #RRGGBB 모양이에요');
  if (app.notice !== undefined && !text(app.notice, 80)) errs.push('notice(안내)는 한 줄, 80자까지');

  if (app.kind === 'android-release') {
    const r = app.release;
    if (!r || typeof r !== 'object' || Array.isArray(r)) errs.push('release 칸이 필요해요');
    else {
      for (const k of Object.keys(r)) if (!RELEASE_KEYS.includes(k)) errs.push(`release 안에 모르는 칸 "${k}"`);
      if (!isRepo(r.repo)) errs.push('release.repo는 "주인/저장소" 모양이에요');
      if (typeof r.tagPrefix !== 'string' || !/^[a-z0-9][a-z0-9-]{0,30}-$/.test(r.tagPrefix)) {
        errs.push('release.tagPrefix(태그 앞머리)는 "app-"처럼 영어 소문자·숫자로 쓰고 -로 끝나요');
      }
      if (typeof r.asset !== 'string' || !/^\.[a-z0-9]+$/.test(r.asset)) errs.push('release.asset은 ".apk" 같은 확장자예요');
      if (!isHttpsUrl(r.fallbackUrl)) errs.push('release.fallbackUrl은 https 주소예요');
      if (r.versionPrefix !== undefined && (typeof r.versionPrefix !== 'string' || !/^(?:\d{1,4}\.){1,3}$/.test(r.versionPrefix))) {
        errs.push('release.versionPrefix(번호 태그 앞 버전)는 "0.1."처럼 숫자와 점으로 쓰고 점으로 끝나요');
      }
    }
  }
  if (app.kind === 'web') {
    if (!isHttpsUrl(app.url)) errs.push('url(열기 주소)은 https 주소예요');
    if (!text(app.version, 20)) errs.push('version이 비었어요');
    if (!isYmd(app.date)) errs.push('date는 "2026-10-24" 모양이에요');
    if (typeof app.notes !== 'string' || !app.notes.trim() || app.notes.length > 300) errs.push('notes(바뀐 점)는 300자까지, 비우지 않아요');
  }
  if (app.kind === 'private') {
    if (!text(app.notice, 80)) errs.push('private에는 notice(안내 문구)가 꼭 있어야 해요');
    if (typeof app.notice === 'string' && /(https?:\/\/|www\.)/i.test(app.notice)) errs.push('private 안내에 주소(링크)를 넣지 않아요');
  }
  for (const s of allStrings(app)) {
    if (/http:\/\//i.test(s)) {
      errs.push(`주소는 https만 써요 (${s})`);
      break;
    }
  }
  return errs;
}

/** apps.json 전체 검사. apps = 통과한 앱만 (화면은 이것만 그린다), errors = 틀린 점. */
export function validateApps(data) {
  const errors = [];
  const apps = [];
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { errors: ['apps.json 맨 위는 { } 모양이에요'], apps };
  }
  for (const k of Object.keys(data)) if (!['about', 'apps'].includes(k)) errors.push(`맨 위에 모르는 칸 "${k}"`);
  if (!Array.isArray(data.apps) || data.apps.length === 0) {
    errors.push('"apps" 목록이 비었어요');
    return { errors, apps };
  }
  const seen = new Set();
  data.apps.forEach((app, i) => {
    const errs = validateApp(app);
    const hasId = app && typeof app.id === 'string';
    if (hasId) {
      if (seen.has(app.id)) errs.push('id가 다른 앱과 겹쳐요');
      seen.add(app.id);
    }
    const label = hasId ? app.id : `${i + 1}번째 앱`;
    if (errs.length) errors.push(...errs.map((e) => `${label}: ${e}`));
    else apps.push(app);
  });
  return { errors, apps };
}
