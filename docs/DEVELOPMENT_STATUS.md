# 개발 진행 현황 (`DEVELOPMENT_STATUS.md`)

- **프로젝트명**: 가구다방 (`GaguDabang`, 폴더·패키지명 `furni-resale`, 저장소명 `gagudabang`) — 중고가구 처분 및 판매 대행 서비스 MVP
- **저장소**: https://github.com/hy040504/gagudabang (공개, 기본 브랜치 `main`)
- **오케스트레이션 기준**: `CLAUDE_KO.md` / `CLAUDE_EN.md` (1순위 `Grok 4.7` → 2순위 `Gemini 4 Neon` → 3순위 `Claude 직접 구현`)
- **최종 갱신 시각**: `2026-11-27`

---

## 1. 단계별 작업 로드맵 및 현재 상태

| TASK ID | 작업 목표 | 우선 담당 모델 | 현재 파이프라인 단계 | 상태 | 산출물 경로 |
| --- | --- | --- | --- | --- | --- |
| `DOC-01` | 견적서 분석, 국내 7개 유사 플랫폼 벤치마킹, 시각 설계기획서 및 VoteLab 양식 상세 기술 기획서 작성 | Claude (설계 총괄) | 완료 | **완료** | `docs/국내_플랫폼_분석/*.pdf`, `docs/서비스_종합_설계기획서.pdf`, `docs/기술_상세_기획서.pdf` |
| `TASK-01` | `PCB (ICT 프로젝트)\demo.html` 동일 양식의 환경별 뷰어 내장 단일 파일 인터랙티브 프로토타입 데모 UI 구현 (`C-01~C-08`, `A-01~A-04s` 전 화면 + 실시간 양방향 연동) | Grok 4.7 → Gemini 4 Neon + Claude 통합검증 | 완료 | **완료** | `demo.html`, `docs/assets/brand/icon.svg` |
| `TASK-01-R1` | 앱 브랜드명 **「가구다방 (`GaguDabang`)」** 리브랜딩, 전용 심볼·가로형 로고 신규 제작 및 `PCB` 공구형 스타일 탈피 에디토리얼 리빙 디자인 전면 개편 | Grok 4.7 → **Gemini 4 Neon** + Claude 통합검증 | 완료 | **완료** | `demo.html`, `docs/assets/brand/icon.svg`, `docs/assets/brand/logo-horizontal.svg` |
| `TASK-02` | 실서버 백엔드(`Express + TypeScript + node:sqlite`) DB 스키마·인증·매직바이트/EXIF 제거·REST API 18종 구현 | Grok 4.7 (`grok-4.7-build-fast`) | 완료 | **완료** | `package.json`, `tsconfig*.json`, `src/shared/*`, `src/server/*` |
| `TASK-03` | 실서버 무번들러 프론트엔드(`순수 HTML/CSS/Vanilla TS`) 고객 포털·관리자 콘솔 및 PWA/Electron 래퍼 연동 | Grok 4.7 (`grok-4.7-build-fast`) | 화면 기능 완료, 기기 확인 남음 | **부분 완료** | `public/*`, `src/client/*`, `desktop/main.cjs` |
| `TASK-04` | 통합 자동화 테스트(`node:test`) 및 브라우저 E2E·접근성 최종 검수 | Grok 4.7 + Claude 검증 | 자동화 테스트와 접근성 자동 검사 완료, 낭독 프로그램 확인 남음 | **부분 완료** | `tests/*.test.ts` |
| `PROTO-01` | `demo.html`을 고객 웹과 관리자 웹으로 나눈 정적 프로토타입 (6단계, 단계마다 확인) | Claude (hallmark) | 6단계와 추가 결정 3건, 사진 교체까지 완료 | **완료** | `prototype/*`, `docs/프로토타입_분리_기획안.md` |
| `BRAND-02` | 새 글자 로고 적용: 원본(남색 글자)의 바탕과 글자 색을 뒤집어 남색 바탕에 흰 글자로, 색은 화면의 남색(`#14284b`)과 흰색에 맞춤 | Claude | 완료 | **완료** | `public/assets/brand/{logo,icon}.svg`, `prototype/assets/{logo,icon}.svg`, `docs/assets/brand/icon.svg` |
| `DEMO-01` | 원본 `demo.html`(고객 화면 + 관리자 화면 + 기기 뷰어)을 고객 화면과 관리자 화면 두 파일로 분리 | Claude | 완료 | **완료** | `scripts/split-demo.mjs`, `demo/*` (저장소에는 올리지 않음) |
| `BRAND-03` | 로고의 '구'를 다시 그림(소파 그림이 든 네모가 '무'로 읽혀 ㄱ과 ㅜ 획으로 바꿈). 남아 있던 옛 임시 로고 교체(README 배너, 가로형 로고 파일, 설계 도식 02, 로컬 데모) | Claude | 완료 | **완료** | `public/assets/brand/*`, `prototype/assets/{logo,icon}.svg`, `docs/assets/brand/*`, `docs/assets/readme/banner.png`, `docs/assets/design/02_*.svg` |
| `HOME-02` | 홈의 가구 종류를 칸마다 가운데 정렬하고 아이콘과 글자를 키움. 처리 방식 구역에 가구를 옮기는 사진 배치 | Claude | 완료 | **완료** | `src/client/customer/main.ts`, `public/styles/customer.css`, `public/assets/photos/moving-sofa.jpg` |
| `AUTH-02` | 회원 아이디 추가: 가입할 때 아이디를 받고, 로그인은 휴대폰 번호 또는 아이디로 한다 | Claude | 완료 | **완료** | `src/server/db.ts`, `src/server/routes/public.ts`, `src/client/customer/main.ts`, `tests/api.test.ts` |
| `DEPLOY-01` | Vercel 무료 배포 구성 | Claude | 설정 완료, 실제 배포는 Vercel 계정에서 진행 | **부분 완료** | `vercel.json`, `src/index.ts`, `tsconfig.json` |

---

## 2. 현재 상태 상세 (2026-11-27)

### TASK-02 백엔드 — 완료
- Express 4 + TypeScript(strict) + `node:sqlite`, API 18종, 상태 전이 기계, 낙관적 락, 멱등성 키, 이미지 매직바이트 검증 및 EXIF 제거(JPEG/PNG. **WebP는 미제거**, `media.ts`의 `shortcut:` 주석 참고).
- 인증: scrypt, HMAC 서명 쿠키, Origin 기반 CSRF, 로그인/PIN 5회 실패 시 60초 잠금.

### TASK-03 프론트엔드 — 부분 완료
- 완료: 고객 홈(히어로+이사일 기준 일정, 가구 종류, 처리 방식, 자주 묻는 질문, 마무리 안내)·신청·완료·조회/취소·로그인·가입·마이페이지, 이용약관·개인정보 처리방침(초안, `[TBD]` 항목과 법률 검토 남음), 관리자 로그인·대시보드·상세·캘린더·설정, 테마 전환 버튼(FN-02), PWA(매니페스트·서비스 워커, Chrome 설치 가능 조건 통과), Electron 래퍼(`desktop/main.cjs`).
- 디자인 기준: 남색·흰색 팔레트(`public/styles/tokens.css` 1697행 이후 블록), 글꼴은 Pretendard 하나로 통일(자체 호스팅 `public/assets/fonts/`).
- 로고: '구'를 ㄱ과 ㅜ 획으로 다시 그린 글자 로고 그림 `logo.svg`(남색 바탕, 흰 글자)를 `ui.ts`의 `logo()`와 관리자 `main.ts`가 쓴다. 정사각 `icon.svg`는 탭 아이콘과 PWA 아이콘이다. 로고에 이름이 들어 있어 옆에 쓰던 "가구다방" 글자는 뺐다. 
- 홈 시안은 Figma 「가구다방 프론트 진단」 파일에 있고(원본·개선안 프레임), 승인된 7개 항목을 코드에 반영함. 홈 문구는 실제 동작 기준이므로 검증 규칙(품목 1~20개, 취소 조건, 이사일 이전 제한)을 바꾸면 `src/client/customer/main.ts`의 `home()`도 같이 고친다.
- 접수 폼: 품목별 오류 표시와 첫 오류 칸 포커스, 가구 삭제, 사진 1~6장 필수(서버 검증)·미리 보기, 주소 검색(카카오 우편번호 서비스, 실패 시 직접 입력), 라벨-입력 연결(공용 `decorate()`).
- 관리자 추가분(2026-11-27): 640px 이하에서 하단 탭 3개(접수 목록, 일정, 설정. 목적지가 세 개라 네 개가 아니다), 품목별 문자 문구 5종과 복사, 상태 변경 전 확인 줄(바꾸기 전·후 상태와 고객에게 보이는 내용), 사진 크게 보기(이전·다음, Esc). 서비스 워커 캐시는 `gagudabang-shell-v9`.
- 확인(2026-11-27): 임시 데이터로 서버를 띄워 Chromium 계열(Edge 120), Firefox 159, WebKit 27.2(Safari와 같은 엔진)에서 390px과 1440px로 고객 화면 7개와 조회, 관리자 로그인·목록·일정·설정·상세, 하단 탭, 문자 문구와 복사(클립보드 권한이 없을 때의 대체 경로와 실패 안내 포함), 상태 변경 확인, 사진 크게 보기를 눌러 봤다. 실패, 가로 넘침, 콘솔 오류 모두 0건. Electron 래퍼(`npm run desktop`)는 창이 떠서 관리자 로그인까지 된다(Electron 45.5).
- 홈 추가분(2026-11-27): 가구 종류 여섯 칸은 아이콘과 이름을 칸 가운데에 두고 키웠다(아이콘 56px, 글자 21px. 좁은 화면은 48px, 19px). 처리 방식 구역은 왼쪽에 가구를 옮기는 사진(Pexels 무료 이용 사진, 출처는 푸터), 오른쪽에 제목과 세 가지 방식을 둔다. 1000px 이하에서는 제목, 사진, 목록 순서로 쌓인다.
- 회원(2026-11-27): 가입할 때 아이디(영문 소문자로 시작하는 영문 소문자·숫자 4~20자)를 받는다. 로그인 칸 하나에 휴대폰 번호나 아이디를 넣는다. 아이디가 없는 기존 회원은 휴대폰 번호로 로그인한다. 세 브라우저 엔진에서 가입, 마이페이지, 아이디 로그인, 휴대폰 번호 로그인을 눌러 확인했다.
- 미검증: 실제 휴대폰(노치 여백, 홈 화면 설치), macOS·iOS의 실제 Safari. 설치 파일을 만드는 구성(electron-builder 등)은 없다.

### TASK-04 테스트 — 부분 완료
- `npm run check`와 `npm test`(49개: API 33, 보안·미디어 6, 시간 의존 10)가 통과한다(2026-11-27). `npm run perf`: 500/5천 건 모두 성능 목표 통과.
- 요청 횟수 제한에 시계를 주입해 "60초 뒤 풀림" 테스트를 추가했다.
- 접근성 자동 검사(axe-core)를 실제 앱의 고객·관리자 화면 20여 개 상태(390px·1440px, 어두운 화면 포함)에 돌려 나온 지적을 고쳤고 지금은 0건이다: 문장 속 링크 밑줄, 테마 버튼과 달력 날짜의 이름 불일치, 관리자 목록의 제목 누락, 상세의 제목 순서. 가입 오류 화면과 마이페이지도 0건이다.
- 미진행: 화면 낭독 프로그램으로 직접 들어 보는 확인.

### PROTO-01 분리형 프로토타입 — 완료
- `prototype/customer.html`(고객 웹)과 `prototype/admin.html`(관리자 웹). 서버 없이 열리고 데이터는 `localStorage`에 있다. 공용 값은 `tokens.css`, 샘플 데이터는 `data.js` 한 파일. Chrome 계열 브라우저와 Firefox에서 파일을 직접 열어도 두 화면의 데이터가 이어진다.
- 관리자 웹: 오늘(지표와 이사일 순서 접수 줄), 접수(목록·상세·추가·수정·삭제), 일정, 안내 관리(자주 묻는 질문·공지사항), 설정. 저장하면 고객 웹에 바로 반영된다. 상태 변경 규칙은 실서버의 `TRANSITIONS`와 같다.
- 6단계 마무리 점검: 긴 이름·빈 목록·접수 1,284건으로 깨짐을 점검해 고쳤고(목록 50건씩, 긴 글 줄바꿈, 접수번호 중복 방지, 저장 실패 알림), 접근성 점검과 콘솔 오류 점검을 마쳤다. 점검용 데이터는 주소 끝에 `?data=worst|empty|one|huge`를 붙이면 열린다.
- 사용자 결정 3건 반영: 홈의 질문은 5개까지 보이고 나머지는 접는다, 공지사항은 20건씩 보인다, 게시일이 미래인 공지는 그날부터 고객 화면에 보인다.
- 사진: Pexels의 무료 이용 사진 7장(960x720, 촬영 정보 없음). 출처는 `prototype/assets/photos/credits.js`와 고객 화면 푸터에 있다.
- 확인한 것: 전체 흐름 자동 점검(57개와 35개) 통과, Hallmark 점검 실패·경고 0건, 접근성 자동 검사(axe-core) 48개 화면 상태, Firefox 159, 별도 검토 세 번(고객 7건, 관리자 8건, 6단계 변경분 6건)의 지적 반영.
- 남은 것: 사업자 정보(상호 외 항목은 비어 있다). 자세한 내용은 `docs/프로토타입_분리_기획안.md`.

### DEMO-01 원본 데모 분리 — 완료
- `node scripts/split-demo.mjs`가 `demo.html`을 읽어 `demo/customer.html`, `demo/admin.html`, 공용 `shared.css`·`shared.js`, 화면별 `customer.js`·`admin.js`를 만든다. 함수 217개를 공용 41, 고객 전용 91, 관리자 전용 73으로 나누고 기기 뷰어 전용 10개는 뺐다. 원본 `demo.html`은 그대로다.
- 접수, 조회, 취소, 회원 로그인, 관리자 저장, 일정, 설정, 사진 올리기, CSV 내보내기, 문자 템플릿이 원본과 같은 결과로 동작한다. 두 파일은 같은 저장 칸을 써서 데이터가 이어진다.
- `demo/`와 `demo.html`은 시연 데이터에 실제 상호가 들어 있어 저장소에 올리지 않는다(`.gitignore`).

### DEPLOY-01 Vercel 배포 — 설정 완료, 실제 배포는 계정에서
- `src/index.ts`가 Express 앱을 내보내고 Vercel이 함수 하나로 실행한다. 화면 파일은 `public/`에서 Vercel이 직접 내보낸다. `vercel.json`에 설치·빌드 명령(`npm run build:client`), 서울 리전(`icn1`), 보안 헤더가 있다.
- 환경 변수 `ADMIN_PASSWORD`와 `SESSION_SECRET`이 없으면 시작하지 않는다. 프록시 뒤라 접속자 IP와 HTTPS 여부를 전달 헤더에서 읽고, HTTPS 요청에는 쿠키에 `Secure`를 붙인다.
- 제한: 함수는 임시 폴더에만 쓸 수 있어 접수 데이터와 사진이 인스턴스가 바뀌면 지워진다(시연용). 실제 접수를 받으려면 외부 DB와 파일 저장소가 필요하다. 요청 하나는 4.5MB까지다.
- 확인한 것: 진입점을 로컬에서 띄워 환경 변수 검사, 첫 화면, 가입과 로그인, 쿠키 `Secure`, IP별 요청 횟수 제한을 점검했다. Vercel에 실제로 올려 보지는 않았다(계정 필요).

### 알려진 사항
- 미확정 사업자 정보는 실서버에서는 `[TBD]`, 프로토타입에서는 빈칸이다.
- `is_demo` 시드 데이터 미생성.
- 저장소에 올리기 전에는 추가된 내용을 검사한다(이메일, 전화번호, 사업자번호, 실명, 비밀값, 로컬 경로). 올리지 않는 것: 견적서, 일부 설계 SVG와 PDF, `demo.html`, `demo/`, `CLAUDE_KO.md`, `CLAUDE_EN.md`, `.env*`, `data/`.
- 프로젝트 전체에 소리를 내거나 글을 읽어 주는 기능은 없다.
- 운영 환경(NODE_ENV=production)에서는 ADMIN_PASSWORD와 SESSION_SECRET이 없으면 서버가 뜨지 않는다. 로컬 개발에서는 기본값으로 동작한다.
