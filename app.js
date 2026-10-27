// 예나의 앱 가게 화면.
// apps.json을 읽어 앱 카드를 그리고, "android-release" 앱(캘린더, 가족 앱, 새 앱 공장 앱)은 GitHub 릴리스에서 최신 설치 파일을 찾는다.
//
// GitHub 릴리스 읽기 (시간당 60번 한도)
// - 저장소마다 한 번만 묻는다: 여러 앱이 같은 저장소를 쓰면 같은 요청을 함께 쓴다 (store-core createRepoLoader).
// - 10분 안에 받은 저장소 목록이 있으면 GitHub에 다시 묻지 않고 localStorage 목록을 쓴다.
//
// 인터넷·API가 안 될 때
// - 페이지와 apps.json: sw.js가 마지막으로 받은 파일을 준다 (홈 화면에서 열어도 마지막 화면이 보인다).
// - GitHub가 안 되면(인터넷 끊김·한도 초과·8초 넘게 답 없음) 앱마다: 저장해 둔 목록에서 고른 결과 + "마지막 확인 ○시 ○분",
//   저장한 것도 없거나 그 앱 릴리스가 없으면 "GitHub에서 보기" 버튼(릴리스 페이지)으로 바꾼다.
// - localStorage가 막힌 브라우저(사생활 보호 창 등)에서는 저장 없이 화면을 열 때마다 묻는다.
import { cardView, createRepoLoader, releaseStateFor, validateApps } from './store-core.js';

const FETCH_TIMEOUT_MS = 8000;
const $ = (sel) => document.querySelector(sel);

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

// ── 저장소 (막혀 있어도 화면은 그대로 돈다) ─────────────

function storageGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function storageSet(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* 저장 못 하면 다음에 다시 물어보면 된다 */
  }
}

async function fetchJson(url, { timeout = FETCH_TIMEOUT_MS, ...init } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ── GitHub 릴리스 (저장소마다 한 번) ───────────────────

const repos = createRepoLoader({
  fetchList: (url) => fetchJson(url, { headers: { Accept: 'application/vnd.github+json' } }),
  getItem: storageGet,
  setItem: storageSet,
});

async function loadRelease(app) {
  return releaseStateFor(app, await repos.load(app.release.repo));
}

// ── 카드 그리기 (글은 모두 textContent로 넣는다: 릴리스 설명에 HTML이 있어도 글자로만 보인다) ──

function renderCard(app) {
  const card = el('article', 'card app');
  card.dataset.app = app.id;
  card.style.setProperty('--app-color', app.color);

  const icon = el('div', 'app-icon');
  const img = document.createElement('img');
  img.alt = '';
  img.width = 56;
  img.height = 56;
  img.decoding = 'async';
  // 아이콘 파일이 없거나 깨지면 그림만 치우고 부서 색 둥근 칸을 남긴다
  img.addEventListener('error', () => img.remove(), { once: true });
  img.src = app.icon;
  icon.append(img);

  const titles = el('div', 'app-titles');
  const meta = el('div', 'app-meta');
  titles.append(el('h2', 'app-name', app.name), el('p', 'app-summary', app.summary), meta);

  const head = el('div', 'app-head');
  head.append(icon, titles);
  const body = el('div', 'app-body');
  card.append(head, body);
  return { app, card, meta, body, key: '' };
}

function notesBlock(text) {
  const wrap = el('div', 'notes');
  const textEl = el('p', 'notes-text clamp', text);
  const more = el('button', 'more', '더 보기');
  more.type = 'button';
  more.hidden = true;
  more.setAttribute('aria-expanded', 'false');
  more.addEventListener('click', () => {
    const open = !textEl.classList.toggle('clamp');
    more.textContent = open ? '접기' : '더 보기';
    more.setAttribute('aria-expanded', String(open));
  });
  wrap.append(el('p', 'notes-label', '바뀐 점'), textEl, more);
  return wrap;
}

function actionNode(action, appName) {
  if (action.type === 'locked') {
    const box = el('p', 'locked');
    const lock = el('span', '', '🔒');
    lock.setAttribute('aria-hidden', 'true');
    box.append(lock, el('span', '', action.label));
    return box;
  }
  if (action.type === 'loading') {
    const wait = el('span', 'btn', action.label);
    wait.setAttribute('aria-disabled', 'true');
    return wait;
  }
  const link = el('a', 'btn', action.label);
  link.href = action.href;
  link.setAttribute('aria-label', `${appName} ${action.label}`);
  if (action.type === 'install') link.type = 'application/vnd.android.package-archive';
  if (action.newTab) {
    link.target = '_blank';
    link.rel = 'noopener';
  }
  return link;
}

function fill(parts, view) {
  const { meta, body, app } = parts;
  meta.replaceChildren();
  body.replaceChildren();
  if (view.loading) {
    meta.append(el('span', 'skeleton short'));
    meta.setAttribute('aria-label', '버전을 확인하는 중이에요');
    const lines = el('div', 'notes');
    lines.append(el('span', 'skeleton long'), el('span', 'skeleton short'));
    body.append(lines);
  } else meta.removeAttribute('aria-label');
  if (view.meta) meta.append(el('p', 'meta', view.meta));
  if (view.status) meta.append(el('p', 'status', view.status));
  if (view.notes) body.append(notesBlock(view.notes));
  if (view.notice) body.append(el('p', 'notice', view.notice));
  body.append(actionNode(view.action, app.name));
  requestAnimationFrame(() => updateClamps(body));
}

// "더 보기"는 바뀐 점이 3줄을 넘을 때만 보인다 (글꼴이 늦게 오거나 화면을 돌리면 다시 잰다)
function updateClamps(root = document) {
  for (const t of root.querySelectorAll('.notes-text.clamp')) {
    const more = t.parentElement.querySelector('.more');
    if (more) more.hidden = t.scrollHeight <= t.clientHeight + 1;
  }
}

const releaseCards = [];

async function refreshRelease(parts, { showLoading }) {
  if (showLoading) fill(parts, cardView(parts.app, { status: 'loading' }));
  const state = await loadRelease(parts.app);
  const key = `${state.status}|${state.release ? state.release.tag : ''}|${state.checkedAt || ''}`;
  if (!showLoading && key === parts.key) return; // 같은 내용이면 다시 그리지 않는다 ("더 보기" 펼친 것 유지)
  parts.key = key;
  fill(parts, cardView(parts.app, state));
}

function showListMessage(message, retry) {
  const box = $('#apps');
  box.replaceChildren();
  const card = el('div', 'card app');
  card.append(el('p', 'notice', message));
  if (retry) {
    const again = el('button', 'btn', '다시 불러오기');
    again.type = 'button';
    again.addEventListener('click', () => {
      box.replaceChildren(el('p', 'state', '앱 목록을 불러오는 중이에요'));
      loadApps();
    });
    card.append(again);
  }
  box.append(card);
  box.removeAttribute('aria-busy');
}

async function loadApps() {
  let data;
  try {
    data = await fetchJson('apps.json', { cache: 'no-cache' });
  } catch {
    showListMessage('앱 목록을 불러오지 못했어요. 인터넷 연결을 확인하고 다시 해 봐요.', true);
    return;
  }
  const { apps, errors } = validateApps(data);
  if (errors.length) console.warn('apps.json에서 고칠 점 (이 앱은 화면에서 뺐어요):', errors);
  if (!apps.length) {
    showListMessage('보여 줄 앱이 없어요.', false);
    return;
  }
  const box = $('#apps');
  box.replaceChildren();
  releaseCards.length = 0;
  repos.reset(); // 이번에 그리는 카드들은 저장소마다 요청 한 번을 함께 쓴다
  for (const app of apps) {
    const parts = renderCard(app);
    box.append(parts.card);
    if (app.kind === 'android-release') {
      releaseCards.push(parts);
      refreshRelease(parts, { showLoading: true });
    } else fill(parts, cardView(app));
  }
  box.removeAttribute('aria-busy');
}

// ── 테마 ──────────────────────────────────────────────

function initTheme() {
  const boot = window.YenaStoreBoot;
  const picker = $('#theme-picker');
  if (!boot || !picker) return;
  const buttons = [...picker.querySelectorAll('button[data-theme-value]')];
  const sync = (value) => buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeValue === value)));
  sync(document.documentElement.getAttribute('data-theme'));
  picker.addEventListener('click', (e) => {
    const b = e.target.closest('button[data-theme-value]');
    if (b) sync(boot.saveTheme(b.dataset.themeValue));
  });
}

// ── 홈 화면에 추가 ────────────────────────────────────

function initInstall() {
  const card = $('#install-card');
  const button = $('#install-button');
  const boot = window.YenaStoreBoot;
  if (!card || !button || !boot) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const update = () => {
    card.hidden = standalone || !boot.installPrompt;
  };
  document.addEventListener('yena-install-ready', update);
  window.addEventListener('appinstalled', () => {
    boot.installPrompt = null;
    update();
  });
  button.addEventListener('click', async () => {
    const prompt = boot.installPrompt;
    if (!prompt) return;
    boot.installPrompt = null; // 한 번만 쓸 수 있다
    try {
      prompt.prompt();
      await prompt.userChoice;
    } catch {
      /* 사용자가 닫았거나 브라우저가 거절 */
    }
    update();
  });
  update();
}

// ── 진동: 누를 수 있는 것을 누르면 haptic.tap ──────────

document.addEventListener('click', (e) => {
  if (e.target.closest('a[href], button, summary')) window.YenaHaptics?.play('tap');
});

let resizeTimer = 0;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => updateClamps(), 150);
});
document.fonts?.ready.then(() => updateClamps());

// 다른 앱에 갔다가 돌아오면: 10분이 지났을 때만 GitHub에 다시 묻는다
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  repos.reset(); // 다시 확인하되, 저장소마다 한 번만 (10분 안이면 GitHub에 묻지 않음)
  releaseCards.forEach((p) => refreshRelease(p, { showLoading: false }));
});

// 서비스 워커는 https(또는 이 PC 미리보기)에서만 된다 → isSecureContext로 판단
if ('serviceWorker' in navigator && window.isSecureContext) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

initTheme();
initInstall();
loadApps();
