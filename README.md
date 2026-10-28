# 예나의 앱 가게

Yena Inc. 앱을 한곳에서 받고(안드로이드 설치 파일) 여는(웹앱) 페이지예요. CR-037 · 패밀리 허브.

- **주소**: https://yl4315.github.io/yena-store/ — 폰에서 열고 Chrome ⋮ → **홈 화면에 추가**
- **배포**: GitHub Pages, `main` 브랜치 맨 위 폴더. **`main`에 push하면 그게 배포**예요 (빌드 단계 없음).
  몇 분 뒤 바뀌고, 폰 브라우저는 길게는 10분 뒤에 새 목록을 봐요.
- 비용 0원. 집 PC가 꺼져 있어도 돼요.

## 앱 칸 고치기 (부서용)

앱 목록은 **`apps.json` 한 파일**이에요. 부서는 **자기 앱 칸만** 고쳐요.

1. `apps.json`에서 자기 앱 칸을 고친다
2. `npm test` (틀린 칸·공개하면 안 되는 글을 찾아 줘요)
3. 커밋 → `main` push = 배포 (회사 규칙: 검수와 CEO ③ 승인 뒤)

### 칸

| 칸 | 뜻 | 예 |
|---|---|---|
| `id` | 영어 이름 (바꾸지 않음) | `karaoke` |
| `name` | 앱 이름 | `YT 노래방` |
| `short` | 짧은 이름 (6자까지) | `노래방` |
| `dept` | 맡은 부서 | `크리에이티브 랩` |
| `icon` | 아이콘 그림 (192×192 png, 디자인실이 만듦) | `icons/apps/karaoke.png` |
| `color` | 부서 아이콘 색 (그림이 없을 때 이 색 칸이 보임) | `#FDDCCF` |
| `summary` | 한 줄 설명 (40자까지) | `유튜브 MR로 부르고 가사·녹음·점수까지` |
| `kind` | 아래 3가지 중 하나 | `web` |
| `notice` | 안내 한 줄 (없어도 됨, `private`는 꼭) | `허용된 구글 계정으로만 들어가요` |

### `kind`별로 다른 칸

**`android-release`** — 안드로이드 앱, 설치 파일은 GitHub 릴리스 (지금: 캘린더 "예나의 하루", 가족 앱 "예태 가족", 새 앱 공장 앱)

- 버전·바뀐 점·크기는 **페이지를 열 때 GitHub에서 자동으로** 읽어요. `apps.json`은 고칠 게 없어요.
- 새 버전 = **태그 앞머리 + 숫자 12자리**(`YYYYMMDDHHmm`) 태그로 릴리스를 만들고 `.apk`를 올리기.
  예: `app-202610251128` → 화면에는 "버전 2026.10.25 11:28". 릴리스 설명이 "바뀐 점"이 돼요.
- 건너뛰는 것: 초안·미리보기 릴리스, 앞머리 뒤가 숫자 12자리가 아닌 태그(`app-x`, `app-2026`, 음성 모델 `voice-*` 등),
  `.apk`가 없는 릴리스. GitHub의 "Latest" 표시와 상관없이 올린 시각이 가장 늦은 것을 골라요.
- 한 저장소에서 최근 릴리스 100개까지 봐요.

```json
"release": {
  "repo": "yl4315/yena-day",
  "tagPrefix": "app-",
  "asset": ".apk",
  "fallbackUrl": "https://github.com/yl4315/yena-day/releases"
}
```

**번호 태그** — `release.versionPrefix`가 있는 앱만 (지금: 가족 앱 "예태 가족", CR-049)

- 태그 = **앞머리 + 번호**(숫자 1~9자리, 0으로 시작하지 않음). 화면 버전은 `versionPrefix` + 번호.
  예: 가족 앱 `app-60` → "버전 0.1.60 · 10월 27일 · 8.5MB" (버전에 날짜가 없어서 올린 날을 붙여요).
- 번호가 **가장 큰** 정식 릴리스를 골라요 (번호 = versionCode라 안드로이드는 낮은 번호로 덮어 설치하지 못해요.
  옛 번호를 나중에 다시 정식으로 바꿔도 큰 번호가 이겨요 — 가족 앱 안 업데이트 확인과 같은 기준).
- 시험판(GitHub "Pre-release", 가족 앱은 예나 폰만)·초안은 지금처럼 빼요 → **정식이 되면 그때 가게에 보여요.**
- 숫자 12자리 날짜 도장 태그는 고르지 않아요 (반대로 `versionPrefix`가 없는 앱은 번호 태그를 고르지 않아요).
- `versionPrefix`는 `"0.1."`처럼 숫자와 점으로 쓰고 점으로 끝나요.

```json
"release": {
  "repo": "yl4315/yetae-world",
  "tagPrefix": "app-",
  "asset": ".apk",
  "fallbackUrl": "https://github.com/yl4315/yetae-world/releases",
  "versionPrefix": "0.1."
}
```

**`web`** — 웹앱, "열기"를 누르면 새 탭 (지금: 노래방, 가계부). **배포할 때마다 세 칸을 고쳐요.**

| 칸 | 뜻 | 예 |
|---|---|---|
| `url` | 열 주소 (https만) | `https://yl4315.github.io/yt-noraebang/` |
| `version` | 버전. 날짜를 써도 됨 | `2026-10-24` |
| `date` | 배포한 날 (`YYYY-MM-DD`) | `2026-10-24` |
| `notes` | 바뀐 점 (300자까지, 3줄 넘으면 "더 보기") | `Drive 폴더에 직접 넣은 MR을 곡 목록으로 가져와요` |

**`private`** — 버튼 없이 🔒 안내만 (지금 쓰는 앱 없음. 가족 앱은 CR-049부터 `android-release`)

- `url`·`version`·`date`·`notes`·`release`를 넣지 않아요. **초대 링크도 넣지 않아요** (받은 사람 누구나 들어올 수 있어서).

### 새 앱 더하기

1. `apps.json`의 `apps` 끝에 칸을 하나 더한다 (`id`는 겹치지 않게)
2. 아이콘은 디자인실에 부탁 → `icons/apps/<id>.png`
3. 공개 GitHub 저장소를 새로 가리키면 `test/public.test.mjs`의 `PUBLIC_REPOS`에 이름을 더한다 (비공개 저장소는 링크하지 않음)
4. `npm test`

### 새 Android 앱 더하기 (CR-038 새 앱 공장)

공장에서 만든 앱은 설치 파일을 **이 저장소(`yl4315/yena-store`)의 릴리스**에 올려요. 앱마다 태그 앞머리가 달라요.

| 칸 | 값 | 예 (`id`가 `fridge`일 때) |
|---|---|---|
| `kind` | `android-release` | |
| `release.repo` | `yl4315/yena-store` | |
| `release.tagPrefix` | `<id>-` | `fridge-` |
| `release.asset` | `.apk` | |
| `release.fallbackUrl` | `https://github.com/yl4315/yena-store/releases` | |
| `icon` | `icons/apps/<id>.png` | `icons/apps/fridge.png` |

- 릴리스 태그는 `<id>-YYYYMMDDHHmm` (숫자 12자리). 예: `fridge-202611020900`.
- **저장소마다 한 번만 읽어요.** 여러 앱이 같은 저장소를 써도 페이지를 열 때 GitHub에는 그 저장소 목록을 한 번만 묻고,
  10분 저장도 저장소 목록 단위예요 (로그인 없이 시간당 60번 한도). 각 앱은 그 목록에서 자기 앞머리 릴리스를 골라요.
- GitHub에 못 물으면 앱마다 따로: 저장해 둔 목록에 그 앱 릴리스가 있으면 "마지막 확인 ○시 ○분", 없으면 "GitHub에서 보기".
- 앞머리가 다른 앱의 앞머리로 시작하지 않게 지어요. 숫자 12자리 규칙 덕분에 `app-`와 `app-store-`처럼 겹쳐도 섞이지는 않아요.

## 공개 페이지 규칙

**이 저장소는 공개예요.** GitHub Pages가 저장소 안 파일을 누구나 볼 수 있게 내보내요.

- 넣지 않는 것: 개인 정보(이메일·전화·주소), 가족 이름·관계·사는 곳, 비공개 링크(App Distribution 초대, 비공개 저장소,
  Tailscale 주소, 포털·직원 맵, Claude 세션), 키·토큰·클라이언트 ID·비밀 키, PC 사용자 폴더 경로.
- `npm test`가 모든 파일(`test/`와 그림 안의 글 칸까지)에서 이런 모양을 찾아요. 걸리면 고쳐서 다시.
- 학교·사는 곳 같은 **개인 낱말은 이 저장소에 적지 않아요** (검사 규칙에도). 비공개 본사의 목록
  (`departments/family-hub/store-private-words.txt`, 또는 환경 변수 `YENA_PRIVATE_WORDS`)을 읽어 파일과 git 기록을 검사해요.
  목록이 없는 PC에서는 그 검사만 건너뛰어요 ("개인 낱말 목록 없음").
- 테스트 안의 가짜 비밀값·가짜 예시는 조각을 이어 붙여 만들어요 (소스에 통째로 두지 않음).
- 검색에 덜 걸리게 `<meta name="robots" content="noindex, nofollow">`와 `robots.txt`를 둬요.
  (`robots.txt`는 도메인 맨 위에 있어야 읽혀서 실제로 듣는 건 meta 쪽이에요. 둘 다 보안은 아니에요 — 주소를 아는 사람은 다 봐요.)
- 커밋 메일은 GitHub noreply 주소예요 (저장소 로컬 설정). 바꾸지 않아요.
- **이 저장소 폴더에서만 커밋하고, 커밋 전에 `git config user.email`이 noreply인지 확인해요.**
  다른 폴더에 새로 받으면 PC 전역 메일로 커밋될 수 있어요. `npm test`가 모든 커밋의 메일과 이 설정도 검사해요.

## 이 PC에서 미리보기

```
python -m http.server 4810 --bind 127.0.0.1
```

브라우저로 `http://127.0.0.1:4810/`. 폰 화면은 개발자 도구의 기기 보기 412×915.
Android 앱 버전은 실제 GitHub에서 읽어요 (로그인 없이 시간당 60번 → 저장소마다 한 번, 10분 동안은 저장해 둔 목록을 다시 써요).

테스트: `npm test` (Node 20 이상, 설치할 패키지 없음).

## 인터넷이 안 될 때

- 홈 화면에서 열면 서비스 워커(`sw.js`)가 마지막으로 받은 페이지와 `apps.json`을 보여 줘요.
- 안드로이드 앱 버전을 못 읽으면 저장해 둔 마지막 결과 + "마지막 확인 ○시 ○분". 그것도 없으면 "GitHub에서 보기" 버튼.
- 설치 파일 내려받기와 웹앱 열기는 인터넷이 있어야 돼요.

## 파일

| 파일 | 무엇 |
|---|---|
| `apps.json` | 앱 목록 (부서가 자기 칸만 고침) |
| `index.html` · `style.css` · `app.js` | 화면 하나 |
| `store-core.js` | 릴리스 고르기·버전/날짜/크기 글·`apps.json` 검사 (화면 없는 함수, 테스트와 같이 씀) |
| `boot.js` | 그리기 전에 테마 정하기, "홈 화면에 추가" 신호 받아 두기 |
| `tokens.css` · `haptics.js` | 회사 디자인 토큰 복사본 (본사 저장소 `departments/design/tokens/out/karaoke/`, **직접 고치지 않음**) |
| `manifest.webmanifest` · `sw.js` · `icons/` | 홈 화면 아이콘, 인터넷 없이 마지막 화면 |
| `robots.txt` · `.nojekyll` | 검색 로봇 막기, GitHub Pages가 파일을 그대로 내보내게 |
| `test/` | `node --test` |
