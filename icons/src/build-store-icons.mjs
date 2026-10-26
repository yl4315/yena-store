#!/usr/bin/env node
// 예나 앱 스토어 아이콘 만들기·확인 (디자인실, 회사 아이콘 틀 2 = CEO 결정 N3)
//
//   node icons/src/build-store-icons.mjs
//
// 1. icons/src/store.svg(원본) → icons/store-192.png · store-512.png (둥근 네모, 모서리 투명)
//                                 icons/store-maskable-512.png (꽉 찬 네모, 그림은 가운데 80% 원 안)
//                                 icons/apple-touch-icon.png (180, 꽉 찬 네모, 투명 없음) · icons/favicon-32.png
// 2. icons/apps/*.png = 스토어 카드용 앱 아이콘 192. 각 앱의 지금 아이콘을 가져온다 (여기서 다시 그리지 않음).
//    캘린더는 1024를 192로 줄이고, 나머지는 192 그대로 복사.
// 3. 만든 파일의 크기·투명도·maskable 안전 구역을 확인한다. 문제가 있으면 끝 코드 1.
//
// 필요: Microsoft Edge, Node 22 이상. npm 패키지 없음.
// SVG를 PNG로 바꾸는 도구와 앱 아이콘 원본은 본사 저장소(디자인실)에 있다.
// 본사 저장소 위치 = 환경 변수 YENA_HQ, 없으면 이 저장소 옆 폴더 Yena_Inc_Project.
// 이 스크립트는 icons/ 안에만 쓴다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url)); // icons/src
const ICONS = path.resolve(HERE, '..');
const HQ = process.env.YENA_HQ || path.resolve(HERE, '..', '..', '..', 'Yena_Inc_Project');
const LIB = path.join(HQ, 'departments', 'design', 'icons', 'lib');
if (!fs.existsSync(path.join(LIB, 'edge.mjs'))) {
  console.error(`본사 디자인실 아이콘 도구를 못 찾음: ${LIB}\nYENA_HQ 환경 변수로 본사 저장소 위치를 알려 주세요.`);
  process.exit(1);
}
const { openEdge } = await import(pathToFileURL(path.join(LIB, 'edge.mjs')).href);
const { decodePng, encodePng, pngInfo, pixel } = await import(pathToFileURL(path.join(LIB, 'png.mjs')).href);

// ── 틀 (본사 icons/build-icons.mjs FRAME과 같은 값) ──
const S = 1024;
const OUTER_RADIUS = 230;   // 둥근 네모 모서리
const ADAPTIVE_SCALE = 0.82; // maskable: 그림을 가운데 기준 0.82배 (회사 노래방·가계부 maskable과 같음)
const MASK_SAFE = 0.8;       // PWA maskable 안전 구역 = 가운데 지름 80% 원

// ── 앱 아이콘 원본 (본사 저장소 안 경로) ──
const APP_ICONS = {
  calendar: 'portal/icons/calendar.png', // 1024 → 192로 줄임 (= 캘린더 assets/icon.png와 같은 파일)
  karaoke: 'portal/icons/karaoke.png',   // 192 그대로
  finance: 'portal/icons/finance.png',   // 192 그대로
  family: 'departments/design/icons/out/family/app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', // CR-021 가족 아이콘 192
};
const APP_SIZE = 192;

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
const problems = [];
const bad = (m) => { problems.push(m); console.log(`  실패  ${m}`); };
const ok = (m) => console.log(`  통과  ${m}`);
const write = (f, buf) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, buf); };
const rel = (f) => path.relative(ICONS, f).split(path.sep).join('/');

// ── 1. 원본 SVG → 모양별 SVG ──
const src = fs.readFileSync(path.join(HERE, 'store.svg'), 'utf8');
function swap(s, from, to, what) {
  const out = s.replace(from, to);
  if (out === s) throw new Error(`store.svg에서 ${what}을 못 찾음`);
  return out;
}
const full = swap(src, /(<rect id="back"[^>]*?)\s+rx="\d+"/, '$1', '배경 rx');
const maskable = swap(full, '<g id="art">', `<g id="art" transform="translate(512 512) scale(${ADAPTIVE_SCALE}) translate(-512 -512)">`, '<g id="art">');
const maskBack = swap(maskable, /<g id="art"[\s\S]*?<\/g>/, '', '그림 묶음');
const SVG = { any: src, full, maskable };

const OUT = [
  { file: 'store-192.png', kind: 'any', size: 192 },
  { file: 'store-512.png', kind: 'any', size: 512 },
  { file: 'store-maskable-512.png', kind: 'maskable', size: 512 },
  { file: 'apple-touch-icon.png', kind: 'full', size: 180 },
  { file: 'favicon-32.png', kind: 'any', size: 32 },
];

// ── 줄이기: 면적 평균 (투명 가장자리가 어두워지지 않게 알파를 곱해서 계산) ──
function resizeArea(img, W, H) {
  const { width: w, height: h, data } = img;
  const pre = new Float64Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const a = data[i * 4 + 3] / 255;
    pre[i * 4] = data[i * 4] * a; pre[i * 4 + 1] = data[i * 4 + 1] * a; pre[i * 4 + 2] = data[i * 4 + 2] * a; pre[i * 4 + 3] = data[i * 4 + 3];
  }
  const weights = (n, N) => {
    const k = n / N;
    return Array.from({ length: N }, (_, o) => {
      const a = o * k, b = (o + 1) * k, list = [];
      for (let s = Math.floor(a); s < Math.ceil(b); s++) list.push([s, (Math.min(b, s + 1) - Math.max(a, s)) / k]);
      return list;
    });
  };
  const wx = weights(w, W), wy = weights(h, H);
  const tmp = new Float64Array(W * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < W; x++) for (const [s, f] of wx[x]) for (let c = 0; c < 4; c++) tmp[(y * W + x) * 4 + c] += pre[(y * w + s) * 4 + c] * f;
  const out = new Uint8Array(W * H * 4);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const v = [0, 0, 0, 0];
    for (const [s, f] of wy[y]) for (let c = 0; c < 4; c++) v[c] += tmp[(s * W + x) * 4 + c] * f;
    const o = (y * W + x) * 4, a = v[3];
    out[o + 3] = Math.round(a);
    for (let c = 0; c < 3; c++) out[o + c] = a > 0 ? Math.min(255, Math.round((v[c] / a) * 255)) : 0;
  }
  return { width: W, height: H, data: out };
}

function alphaStats(img) {
  let transparent = 0, opaque = 0;
  const n = img.width * img.height;
  for (let i = 0; i < n; i++) { const a = img.data[i * 4 + 3]; if (a === 0) transparent++; if (a === 255) opaque++; }
  return { transparent: transparent / n, opaque: opaque / n };
}

const edge = await openEdge();
try {
  console.log('[1] 앱 스토어 아이콘 (store.svg → PNG)');
  const EXPECT_ANY = (4 - Math.PI) * (OUTER_RADIUS / S) ** 2;
  for (const o of OUT) {
    const buf = await edge.renderSvg(SVG[o.kind], o.size);
    const f = path.join(ICONS, o.file);
    write(f, buf);
    const hdr = pngInfo(buf), img = decodePng(buf), st = alphaStats(img);
    const p = [];
    if (hdr.width !== o.size || hdr.height !== o.size) p.push(`크기 ${hdr.width}x${hdr.height}`);
    if (o.kind === 'any') {
      const corner = pixel(img, 0, 0).a, center = pixel(img, o.size >> 1, o.size >> 1).a;
      if (corner !== 0 || center !== 255) p.push(`모서리 알파 ${corner}, 가운데 ${center}`);
      if (o.size >= 64 && Math.abs(st.transparent - EXPECT_ANY) > 0.012) p.push(`투명 ${(st.transparent * 100).toFixed(1)}% (예상 ${(EXPECT_ANY * 100).toFixed(1)}%)`);
    } else if (st.opaque !== 1) p.push(`투명한 곳 ${((1 - st.opaque) * 100).toFixed(2)}% (꽉 찬 네모여야 함)`);
    if (p.length) bad(`${o.file}: ${p.join(' · ')}`);
    else ok(`${o.file} ${o.size}x${o.size} ${o.kind === 'any' ? `둥근 네모(모서리 투명 ${(st.transparent * 100).toFixed(1)}%)` : '꽉 찬 네모(투명 0)'} ${kb(buf.length)}`);
  }

  console.log('[2] maskable 안전 구역 (그림이 가운데 80% 원 안에 있는지)');
  {
    const M = 512;
    const withArt = decodePng(await edge.renderSvg(maskable, M));
    const backOnly = decodePng(await edge.renderSvg(maskBack, M));
    let maxR = 0;
    for (let y = 0; y < M; y++) for (let x = 0; x < M; x++) {
      const o = (y * M + x) * 4;
      let d = 0;
      for (let c = 0; c < 4; c++) d = Math.max(d, Math.abs(withArt.data[o + c] - backOnly.data[o + c]));
      if (d > 2) maxR = Math.max(maxR, Math.hypot(x + 0.5 - M / 2, y + 0.5 - M / 2));
    }
    const frac = (2 * maxR) / M;
    if (frac > MASK_SAFE) bad(`그림이 안전 구역 밖까지 나감: 지름 ${(frac * 100).toFixed(1)}% (80% 이하여야 함)`);
    else ok(`그림(흰 카드 포함)이 가운데 지름 ${(frac * 100).toFixed(1)}% 원 안 (안전 구역 80%)`);
  }

  console.log('[3] 스토어 카드용 앱 아이콘 (icons/apps, 192)');
  for (const [app, from] of Object.entries(APP_ICONS)) {
    const f = path.join(HQ, ...from.split('/'));
    if (!fs.existsSync(f)) { bad(`${app}: 원본 없음 (${from})`); continue; }
    const srcBuf = fs.readFileSync(f);
    const hdr = pngInfo(srcBuf);
    let buf = srcBuf, how = '그대로 복사';
    if (hdr.width !== APP_SIZE || hdr.height !== APP_SIZE) {
      if (hdr.width !== hdr.height) { bad(`${app}: 정사각형이 아님 ${hdr.width}x${hdr.height}`); continue; }
      buf = encodePng(resizeArea(decodePng(srcBuf), APP_SIZE, APP_SIZE));
      how = `${hdr.width} → ${APP_SIZE} 줄임`;
    }
    const out = path.join(ICONS, 'apps', `${app}.png`);
    write(out, buf);
    const img = decodePng(buf);
    if (img.width !== APP_SIZE || img.height !== APP_SIZE) bad(`${rel(out)}: 크기 ${img.width}x${img.height}`);
    else ok(`${rel(out)} ${APP_SIZE}x${APP_SIZE} (${how}, 원본 ${from}) ${kb(buf.length)}`);
  }
} finally {
  await edge.close();
}

if (problems.length) { console.log(`\n실패 ${problems.length}건`); process.exit(1); }
console.log('\n모두 통과');
