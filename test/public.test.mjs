// 공개 페이지 검사: 이 저장소는 공개이고 GitHub Pages가 저장소 전체를 그대로 보여 준다.
// 개인 정보·비공개 링크·키가 어느 파일에도 들어가지 않았는지, 페이지가 안전하게 짜였는지 본다.
//
// - 검사하는 파일: 저장소의 모든 파일 (README·CLAUDE.md·test/ 포함). .git, node_modules만 뺀다.
// - 이 파일도 검사를 받는다. 그래서
//   · 규칙은 /app[d]istribution/ 처럼 [ ]를 끼워 써서, 규칙 글자 자체가 규칙에 걸리지 않게 한다.
//   · 걸러야 할 가짜 예시는 실행할 때 조각을 이어 붙여 만든다 (예: j('gh', 'p_', 'x'.repeat(36))).
//     GitHub가 비밀값처럼 보이는 글이 든 push를 막을 수도 있어서 이게 더 안전하다.
// - 학교·사는 곳 같은 개인 낱말은 이 공개 저장소에 적지 않는다 (해시로도 넣지 않는다 — 사전으로 되돌릴 수 있다).
//   비공개 본사의 목록 파일을 읽어서 찾는다: 환경 변수 YENA_PRIVATE_WORDS(파일 경로), 없으면 이 저장소 옆
//   본사 폴더의 departments/family-hub/store-private-words.txt. 목록이 없는 PC에서는 그 검사만 건너뛴다.
// - png는 그림 안의 글 칸(tEXt·zTXt·iTXt·eXIf, 만든 사람·프로그램 정보가 들어가는 곳)만 본다.
// - 꼭 필요한 예외는 ALLOW에 파일·규칙·줄 모양을 적는다 (지금: CLAUDE.md의 커밋 끝줄 하나).
//   서비스 워커 등록은 이 PC 주소 이름 대신 window.isSecureContext로 판단해서 예외가 필요 없다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP_DIRS = new Set(['.git', 'node_modules']);
const TEXT_EXT = new Set(['.html', '.css', '.js', '.mjs', '.json', '.webmanifest', '.txt', '.md', '.svg', '.xml', '']);
const TEXT_NAMES = new Set(['.gitignore', '.gitattributes', '.nojekyll']);

/** 조각을 이어 붙여 글을 만든다 (소스에는 걸러야 할 글이 통째로 나타나지 않게). */
const j = (...parts) => parts.join('');

// 공개 저장소만 링크해도 된다 (비공개 저장소 링크 금지). 새 공개 저장소를 링크하려면 여기에 더한다.
// yetae-world = 가족 앱 설치 파일만 올리는 공개 저장소 (CR-049, 앱 코드 저장소는 비공개라 링크하지 않음)
const PUBLIC_REPOS = new Set(['yena-day', 'yt-noraebang', 'yena-store', 'yetae-world']);

const RULES = [
  { name: 'App Distribution 초대 링크', re: /app[d]istribution/i },
  { name: 'Firebase 링크', re: /firebase[a-z]*\.(?:google\.)?(?:com|dev|app)\b|\.web\.app\b/i },
  { name: 'Tailscale 주소', re: /ts\.net\b/i },
  { name: 'Tailscale IP', re: /\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b/ },
  { name: '집 안 IP', re: /\b(?:192\.168|10\.\d{1,3}|172\.(?:1[6-9]|2\d|3[01]))\.\d{1,3}\.\d{1,3}\b/ },
  { name: '이 PC 주소 이름', re: /local[h]ost/i },
  { name: '포털·직원 맵 주소', re: /:(?:48[0]0|47[7]7)\b/ },
  { name: 'Claude 세션 링크', re: /claude:\/\/|epitax[y]/i },
  { name: '이메일 주소', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/ },
  { name: '전화번호', re: /\b01[016789][-. ]?\d{3,4}[-. ]?\d{4}\b|\(?\b\d{3}\)?[-. ]\d{3}[-. ]\d{4}\b/ },
  { name: 'PC 사용자 폴더', re: /[A-Za-z]:\\Users\\|\/Users\/[A-Za-z]/ },
  { name: '가족 관계', re: /엄[마]|아[빠]|어머[니]|아버[지]|부모[님]|할머[니]|할아버[지]|남[편]|아[내]|와이[프]|언[니]|오[빠]|누[나]|남동[생]|여동[생]/ },
  { name: 'Google API 키', re: /A[I]za/ },
  { name: 'GitHub 토큰', re: /\bgh[pousr]_[A-Za-z0-9]|github_pa[t]_/ },
  { name: '비밀 키 파일', re: /-----BEGI[N]/ },
  { name: '클라이언트 비밀값', re: /client[_-]?secre[t]/i },
  { name: 'API 키 모양', re: /\bsk-[A-Za-z0-9-]{16,}|\bxox[abprs]-|\bAKIA[0-9A-Z]{16}\b/ },
  { name: 'Firebase 설정 파일', re: /google-services\.json|mobilesdk_app_i[d]|oauth_clien[t]/i },
];

// 예외: { file: '경로', rule: '규칙 이름', line: /그 줄 모양/ }
const ALLOW = [
  // 커밋 끝줄 규칙. 개인 메일이 아니라 Claude 공용 noreply 주소다.
  { file: 'CLAUDE.md', rule: '이메일 주소', line: /`Co-Authored-By: Claude Opus [\d.]+ <noreply@anthropic\.com>`/ },
];

// ── 개인 낱말 목록 (비공개 본사에만 있음) ─────────────

const WORDS_ENV = process.env.YENA_PRIVATE_WORDS;
const WORDS_FILE = WORDS_ENV || join(ROOT, '..', 'Yena_Inc_Project', 'departments', 'family-hub', 'store-private-words.txt');
const NO_WORDS = '개인 낱말 목록 없음 — 이 PC 밖에서 돌림';

/** 한 줄에 낱말 하나, # 줄은 설명. 대소문자 무시. 파일이 없으면 null. */
function readWords(file) {
  if (!existsSync(file)) return null;
  return readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.toLowerCase());
}
const WORDS = readWords(WORDS_FILE);
// 환경 변수로 일부러 가리켰는데 없으면 건너뛰지 않고 실패로 알린다
const WORDS_SKIP = WORDS === null && !WORDS_ENV ? NO_WORDS : false;

/** 글에서 낱말을 찾아 "줄 번호 낱말 #번호" 목록 (낱말 자체는 결과에 쓰지 않는다). */
function findWords(text, words) {
  const found = [];
  text
    .toLowerCase()
    .split('\n')
    .forEach((line, i) => {
      words.forEach((w, k) => {
        if (line.includes(w)) found.push(`${i + 1}줄 낱말 #${k + 1}`);
      });
    });
  return found;
}

// ── git ───────────────────────────────────────────────

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'ignore'] });
}
/** 이 폴더가 git 저장소의 맨 위인지 (다른 저장소 안에 풀어 놓은 복사본이면 아니다). */
function isOwnGitRepo() {
  try {
    const top = git(['rev-parse', '--show-toplevel']).trim();
    return resolve(top).toLowerCase() === resolve(ROOT).toLowerCase();
  } catch {
    return false;
  }
}
const GIT_SKIP = isOwnGitRepo() ? false : 'git 저장소가 아님';
const GITHUB_NOREPLY = '@users.noreply.github.com';
const ANTHROPIC_NOREPLY = j('noreply', '@', 'anthropic.com');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (!SKIP_DIRS.has(name)) walk(full, out);
    } else out.push(relative(ROOT, full).split(sep).join('/'));
  }
  return out;
}

/** png 안의 글 칸만 꺼낸다 (그림 데이터는 압축된 바이트라 글처럼 검사하면 우연히 걸릴 수 있다). */
function pngText(buf) {
  if (buf.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') return null;
  const out = [];
  let off = 8;
  while (off + 12 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('latin1', off + 4, off + 8);
    const data = buf.subarray(off + 8, off + 8 + len);
    try {
      if (type === 'tEXt') out.push(data.toString('latin1'));
      else if (type === 'zTXt') {
        const k = data.indexOf(0);
        out.push(data.toString('latin1', 0, k), inflateSync(data.subarray(k + 2)).toString('latin1'));
      } else if (type === 'iTXt') {
        const k = data.indexOf(0);
        const compressed = data[k + 1] === 1;
        let p = k + 3;
        const lang = data.indexOf(0, p);
        const trans = data.indexOf(0, lang + 1);
        p = trans + 1;
        const body = compressed ? inflateSync(data.subarray(p)) : data.subarray(p);
        out.push(data.toString('latin1', 0, k), data.toString('utf8', lang + 1, trans), body.toString('utf8'));
      } else if (type === 'eXIf') out.push(data.toString('latin1'));
    } catch {
      out.push(`(${type} 칸을 읽지 못함)`);
    }
    if (type === 'IEND') break;
    off += 12 + len;
  }
  return out.join('\n');
}

function contentOf(file) {
  const buf = readFileSync(join(ROOT, file));
  const name = file.split('/').pop();
  const ext = extname(name).toLowerCase();
  if (TEXT_NAMES.has(name) || TEXT_EXT.has(ext)) return { kind: 'text', text: buf.toString('utf8') };
  if (ext === '.png') {
    const text = pngText(buf);
    return text === null ? { kind: 'bad', why: 'png 파일이 아니에요' } : { kind: 'png', text };
  }
  return { kind: 'bad', why: `검사하지 못하는 종류(${ext || '확장자 없음'}) — png로 넣거나 이 검사를 늘려요` };
}

const FILES = walk(ROOT);

test('공개 검사 규칙: 걸러야 할 것은 걸고, 보통 글은 지나간다', () => {
  // 가짜 예시. 실제 지역·학교·이름·서비스 이름은 쓰지 않는다 (전화는 555 가상 번호)
  const bad = [
    j('https://app', 'distribution.fire', 'base.dev/i/abc123'),
    j('https://example-app.web', '.app'),
    j('http://my-pc.tail1234.ts', '.net', ':48', '00/portal/'),
    j('100.101', '.102.103'),
    j('192.168', '.0.12'),
    j('http://local', 'host:3000'),
    j('mail me: someone', '@', 'example.com'),
    j('010-', '1234-5678'),
    j('(555) ', '555-0100'),
    j('C:', '\\Users\\someone\\Desktop'),
    j('claude:', '//claude.ai/epi', 'taxy/local_abc'),
    j('AI', 'zaSyD-example'),
    j('gh', 'p_', 'x'.repeat(36)),
    j('github', '_pat_11ABC'),
    j('-----BEG', 'IN PRIVATE KEY-----'),
    j('"client', '_secret": "x"'),
    j('sk-', 'ant-api03-', 'a'.repeat(16)),
    j('엄', '마랑 같이 불러요'),
    j('google-services', '.json'),
  ];
  const ok = [
    '@media (prefers-color-scheme: light) {',
    'family=Noto+Sans+KR:wght@300;400;500;600;700;800;900',
    '버전 2026.10.25 11:28 · 86.3MB',
    '86,310,093바이트',
    '가족 전용 — 관리자에게 초대를 받아요',
    '--space-xs: 4px; /* 이모지와 이름 사이 */',
    '안내 문구',
    'https://yl4315.github.io/yt-noraebang/',
    'python -m http.server 4810 --bind 127.0.0.1',
    'App Distribution 초대 링크는 넣지 않아요',
  ];
  const hit = (s) => RULES.filter((r) => r.re.test(s)).map((r) => r.name);
  for (const s of bad) assert.ok(hit(s).length > 0, `걸러야 함: ${s}`);
  for (const s of ok) assert.deepEqual(hit(s), [], `지나가야 함: ${s}`);
  // 개인 낱말 찾기 (가짜 낱말로)
  assert.deepEqual(findWords('첫 줄\n둘째 줄 가짜동네 ABC\n', ['가짜동네', 'abc']), ['2줄 낱말 #1', '2줄 낱말 #2']);
  assert.deepEqual(findWords('아무것도 없음', ['가짜동네']), []);
});

test('공개 검사: 검사할 파일이 있다 (test/ 포함)', () => {
  for (const f of ['index.html', 'app.js', 'store-core.js', 'apps.json', 'style.css', 'sw.js', 'README.md', 'test/public.test.mjs', 'test/core.test.mjs']) {
    assert.ok(FILES.includes(f), f);
  }
});

test('공개 검사: 개인 정보·비공개 링크·키가 없다', () => {
  const found = [];
  for (const file of FILES) {
    const c = contentOf(file);
    if (c.kind === 'bad') {
      found.push(`${file}: ${c.why}`);
      continue;
    }
    c.text.split('\n').forEach((line, i) => {
      for (const rule of RULES) {
        if (!rule.re.test(line)) continue;
        if (ALLOW.some((a) => a.file === file && a.rule === rule.name && a.line.test(line))) continue;
        found.push(`${file}:${i + 1} ${rule.name} → ${line.trim().slice(0, 120)}`);
      }
    });
  }
  assert.deepEqual(found, []);
});

test('공개 검사: 개인 낱말(비공개 목록)이 어느 파일에도 없다', { skip: WORDS_SKIP }, () => {
  assert.ok(WORDS, `YENA_PRIVATE_WORDS 파일이 없어요: ${WORDS_FILE}`);
  assert.ok(WORDS.length > 0, '개인 낱말 목록이 비었어요');
  const found = [];
  for (const file of FILES) {
    const c = contentOf(file);
    if (c.kind === 'bad') continue;
    for (const f of findWords(c.text, WORDS)) found.push(`${file} ${f}`);
  }
  assert.deepEqual(found, []);
});

test('공개 검사: 개인 낱말이 git 기록(모든 커밋의 내용·메시지·작성자)에도 없다', { skip: WORDS_SKIP || GIT_SKIP }, () => {
  assert.ok(WORDS && WORDS.length > 0, `개인 낱말 목록이 없거나 비었어요: ${WORDS_FILE}`);
  const log = git(['log', '-p', '--all', '--format=%H%n%an%n%ae%n%cn%n%ce%n%B']);
  const found = new Set(findWords(log, WORDS).map((f) => f.replace(/^\d+줄 /, '')));
  assert.deepEqual([...found], [], '옛 커밋에 남아 있으면 첫 push 전에 기록을 다시 쌓아요');
});

test('커밋 메일: 모든 커밋의 작성자·커미터가 GitHub noreply (또는 Anthropic noreply)', { skip: GIT_SKIP }, () => {
  const mails = new Set(git(['log', '--all', '--format=%ae%n%ce']).split('\n').filter(Boolean));
  const bad = [...mails].filter((m) => !m.endsWith(GITHUB_NOREPLY) && m !== ANTHROPIC_NOREPLY);
  assert.deepEqual(bad, [], '이 폴더에서만, 저장소 로컬 메일(noreply)로 커밋해요');
});

test('커밋 메일 설정: 이 저장소에서 커밋하면 noreply로 남는다', { skip: GIT_SKIP }, () => {
  let mail = '';
  try {
    mail = git(['config', 'user.email']).trim();
  } catch {
    /* 설정 없음 */
  }
  assert.ok(mail.endsWith(GITHUB_NOREPLY), `git config user.email이 GitHub noreply가 아니에요 — 저장소 로컬 설정을 noreply로 (지금: ${mail ? '다른 메일' : '없음'})`);
});

test('공개 검사: GitHub 링크는 공개 저장소만', () => {
  const found = [];
  const patterns = [/\byl4315\/([A-Za-z0-9._-]+)/g, /yl4315\.github\.io\/([A-Za-z0-9._-]+)/g];
  for (const file of FILES) {
    const c = contentOf(file);
    if (c.kind === 'bad') continue;
    for (const re of patterns) {
      for (const m of c.text.matchAll(re)) {
        const repo = m[1].replace(/\.git$/, '');
        if (!PUBLIC_REPOS.has(repo)) found.push(`${file}: ${m[0]}`);
      }
    }
  }
  assert.deepEqual(found, []);
});

// ── 페이지 짜임 ───────────────────────────────────────

const html = readFileSync(join(ROOT, 'index.html'), 'utf8');

test('페이지: 검색 로봇 막기 (meta robots + robots.txt)', () => {
  assert.match(html, /<meta name="robots" content="noindex, nofollow">/);
  assert.match(readFileSync(join(ROOT, 'robots.txt'), 'utf8'), /^User-agent: \*\nDisallow: \/\n?$/);
  assert.ok(existsSync(join(ROOT, '.nojekyll')));
});

test('페이지: CSP가 있고 인라인 스크립트·스타일을 쓰지 않는다', () => {
  const csp = /<meta http-equiv="Content-Security-Policy" content="([^"]+)">/.exec(html);
  assert.ok(csp, 'CSP meta가 없어요');
  const policy = csp[1];
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|\*/);
  assert.match(policy, /default-src 'self'/);
  assert.match(policy, /connect-src 'self' https:\/\/api\.github\.com(;|$)/);
  assert.match(policy, /img-src 'self' data:(;|$)/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/i, '인라인 <script>');
  assert.doesNotMatch(html, /<style[\s>]/i, '<style> 태그');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'style= 속성');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'onclick= 같은 인라인 처리');
});

test('페이지: 우리 스크립트는 HTML 글을 끼워 넣지 않는다 (릴리스 설명은 글자로만)', () => {
  for (const file of ['app.js', 'store-core.js', 'boot.js', 'sw.js']) {
    const src = readFileSync(join(ROOT, file), 'utf8');
    assert.doesNotMatch(src, /\.innerHTML\s*=|outerHTML\s*=|insertAdjacentHTML|document\.write|\beval\(|new Function/, file);
  }
});

test('페이지: 새 탭으로 여는 링크는 rel=noopener', () => {
  const app = readFileSync(join(ROOT, 'app.js'), 'utf8');
  assert.match(app, /link\.target = '_blank';\s*link\.rel = 'noopener';/);
  for (const m of html.matchAll(/<a\s[^>]*target="_blank"[^>]*>/g)) assert.match(m[0], /rel="[^"]*noopener/);
});

test('페이지: 가리키는 파일이 있다 (icons/는 디자인실이 넣어서 빼고 봄)', () => {
  const missing = [];
  const refs = [...html.matchAll(/\s(?:src|href)="([^"]+)"/g)].map((m) => m[1]);
  const manifest = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const shell = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
  for (const ref of [...refs, ...manifest.icons.map((i) => i.src), ...shell]) {
    if (/^(https?:|#|data:)/.test(ref)) continue;
    if (ref.startsWith('icons/')) continue;
    if (!existsSync(join(ROOT, ref))) missing.push(ref);
  }
  assert.deepEqual(missing, []);
});

test('manifest: 이름·범위·아이콘', () => {
  const m = JSON.parse(readFileSync(join(ROOT, 'manifest.webmanifest'), 'utf8'));
  assert.equal(m.name, '예나의 앱 가게');
  assert.equal(m.short_name, '앱 가게');
  assert.equal(m.start_url, './');
  assert.equal(m.scope, './');
  assert.equal(m.display, 'standalone');
  assert.deepEqual(
    m.icons.map((i) => [i.src, i.sizes, i.purpose || 'any']),
    [
      ['icons/store-192.png', '192x192', 'any'],
      ['icons/store-512.png', '512x512', 'any'],
      ['icons/store-maskable-512.png', '512x512', 'maskable'],
    ],
  );
});

test('이름: 정식 "예나의 앱 가게", 홈 화면·제목 "앱 가게" (CEO 시안 ②)', () => {
  assert.match(html, /<title>예나의 앱 가게<\/title>/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="앱 가게">/);
  assert.match(html, /<h1 class="title">앱 가게<\/h1>/);
  assert.doesNotMatch(html, /앱 스토어/);
});

test('서비스 워커: 같은 출처만 다루고 api.github.com·APK는 건드리지 않는다', () => {
  const sw = readFileSync(join(ROOT, 'sw.js'), 'utf8');
  const code = sw.replace(/^\s*\/\/.*$/gm, ''); // 설명 주석은 빼고 코드만
  assert.match(code, /if \(url\.origin !== self\.location\.origin\) return;/);
  assert.match(code, /const CACHE = 'yena-store-v\d+';/);
  assert.doesNotMatch(code, /api\.github\.com|\.apk/i);
  const app = readFileSync(join(ROOT, 'app.js'), 'utf8');
  assert.match(app, /'serviceWorker' in navigator && window\.isSecureContext/);
});

test('토큰 파일은 디자인실 원본 그대로 (맨 위 자동 생성 주석)', () => {
  assert.match(readFileSync(join(ROOT, 'tokens.css'), 'utf8'), /^\/\*\n \* 자동 생성, 직접 고치지 말 것 — 원본 departments\/design\/tokens\/tokens\.json/);
  assert.match(readFileSync(join(ROOT, 'haptics.js'), 'utf8'), /^\/\/ 자동 생성, 직접 고치지 말 것 — 원본 departments\/design\/tokens\/tokens\.json/);
});
