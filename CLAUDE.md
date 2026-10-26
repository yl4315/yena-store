# 예나의 앱 가게 (yena-store)

Yena Inc. 앱을 받고 여는 정적 웹앱. GitHub Pages(`main` 맨 위 폴더)로 나간다. 사용법·칸 설명은 `README.md`.

## 누가 무엇을

- **패밀리 허브 저장소** (CR-037). 코드·화면·테스트는 패밀리 허브가 고친다.
- 다른 부서는 **`apps.json`의 자기 앱 칸만** 고친다 (노래방 = 크리에이티브 랩, 가계부 = 재무회계팀, 캘린더는 고칠 게 없음 — GitHub 릴리스에서 자동).
- `icons/`는 디자인실이 만든다. `tokens.css`·`haptics.js`는 디자인실 토큰 복사본 (본사 `departments/design/tokens/out/karaoke/`) — 직접 고치지 않고 새로 복사한다.

## 꼭 지킬 것

- **공개 저장소다.** 개인 정보, 가족 이름·관계·사는 곳, 비공개 링크(App Distribution 초대, 비공개 저장소, Tailscale, 포털), 키·토큰, PC 경로를 어느 파일에도 넣지 않는다. 가족 앱은 `private` — 초대 링크를 넣지 않는다.
- **`main` push = 배포.** 작업은 `cr-###-이름` 브랜치에서, `main` 합치기·push는 검수와 CEO ③ 승인 뒤 팀장이 한다.
- 커밋 메일은 저장소 로컬 설정의 GitHub noreply 주소. **바꾸지 않는다.** **이 폴더에서만 커밋하고, 커밋 전에 `git config user.email`이 noreply인지 확인한다** (PC 전역 메일은 개인 메일). `npm test`가 모든 커밋 메일을 검사한다.
- 개인 낱말(학교·사는 곳 등)은 이 저장소 어디에도, 검사 규칙에도 적지 않는다. 목록은 비공개 본사 `departments/family-hub/store-private-words.txt`(또는 `YENA_PRIVATE_WORDS`)에만 있고 `test/public.test.mjs`가 읽는다. 테스트의 가짜 비밀값은 조각을 이어 붙여 만든다.
- 커밋 메시지는 한국어, 끝에 빈 줄 + `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- 빌드·npm 패키지 없이 간다. 화면은 `tokens.css` 변수만 쓰고 회사 디자인 기준(캘린더 "예나의 하루")을 따른다.
- CSP 때문에 인라인 스크립트·스타일·`onclick=`을 쓰지 않는다. 바깥에서 온 글(릴리스 설명 등)은 `textContent`로만 넣는다.
- GitHub 릴리스는 `/releases/latest`를 쓰지 않는다 (같은 저장소의 "Latest"는 음성 모델). 태그는 앞머리 + 숫자 12자리만 (`store-core.js`의 `pickRelease`).
- GitHub API는 저장소마다 한 번만 묻는다 (`createRepoLoader`: 같은 Promise를 함께 쓰고, 10분 저장도 저장소 목록 단위). 앱마다 따로 읽게 바꾸지 않는다 — 시간당 60번 한도.
- 서비스 워커 캐시 파일 목록이나 방식을 바꾸면 `sw.js`의 `CACHE` 숫자를 올린다.

## 확인

- `npm test` — `store-core.js` 함수, `apps.json` 검사, 공개 페이지 검사(모든 파일에서 개인 정보·키·비공개 링크 모양 찾기).
- 미리보기: 이 폴더에서 `python -m http.server 4810 --bind 127.0.0.1` → `http://127.0.0.1:4810/`, 412×915로 라이트·다크.
- 진동·APK 설치·홈 화면 추가는 실제 안드로이드 폰에서만 확인된다.
