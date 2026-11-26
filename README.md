# 가구다방 (`GaguDabang`) — 중고가구 위탁 판매 및 방문 비움 리빙 플랫폼 MVP

> **브랜드명**: **가구다방** (`GaguDabang`)  
> **GitHub 저장소**: `gagudabang`  
> **프로젝트 유형**: 중고가구 처분 및 판매 대행 서비스 MVP

이사 전 처치 곤란한 대형가구를 이사일 기준으로 역산하여 먼저 **위탁 판매 대행**을 연결하고, 마감일까지 미판매된 가구나 신속 정리가 필요한 가구는 희망 반출일에 **방문 수거(비움)**까지 한 번에 처리하는 리빙 컨시어지 웹 플랫폼 MVP 프로젝트입니다.

---

## 1. 프로젝트 개요 및 진행 현황

| 구분 | 내용 |
| --- | --- |
| **핵심 기능 범위** | ① 서비스 소개·이용절차 안내 ② 다품목 가구 신청·사진 첨부 ③ 운영자 접수·상태·일정 통합 관리 ④ 모바일 동작 점검 |
| **디자인 기준** | 남색·흰색 베이스 팔레트 + 자체 호스팅 `Pretendard` 단일 고딕(라이트/다크 모드 지원) |
| **공개 저장소 보안 정책** | 계약·견적 문서, 사업자/개인정보가 포함된 시안·파일, 로컬 환경변수 및 DB 파일은 `.gitignore`로 제외 |

### 단계별 진행 현황

상세 이력과 잔여 항목은 [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md)와 [docs/프로토타입_분리_기획안.md](docs/프로토타입_분리_기획안.md)에서 관리합니다.

| 단계 / TASK | 내용 | 상태 | 주요 산출물 |
| --- | --- | :---: | --- |
| `DOC-01` | 국내 7개 플랫폼 벤치마킹, 서비스 종합 설계기획서·상세 기술 기획서 작성 | **완료** | `docs/*.md`, `docs/*.pdf`, `docs/assets/design/*.svg` |
| `TASK-01` / `R1` | 「가구다방」 리브랜딩 및 인터랙티브 프로토타입 제작 | **완료** | `docs/assets/brand/*.svg` (내부 데모본 별도 보관) |
| `TASK-02` | 실서버 백엔드(`Express + TypeScript + node:sqlite`) DB·인증·보안·REST API 18종 | **완료** | `src/shared/*`, `src/server/*` |
| `TASK-03` | 실서버 무번들러 프론트엔드(고객 포털·관리자 콘솔)·PWA·Electron 연동 | **진행중 (부분 완료)** | `public/*`, `src/client/*`, `desktop/main.cjs` |
| `TASK-04` | 자동화 테스트(`node:test` 46개)·성능 측정(`500`/`5,000`건) 및 품질 검수 | **부분 완료** | `tests/*.test.ts`, `scripts/perf.ts` |
| **프로토타입 분리** | 고객 웹(`customer.html`)·관리자 웹(`admin.html`) 6단계 정적 프로토타입 분리 | **진행중 (4단계 착수)** | `prototype/*`, [docs/프로토타입_분리_기획안.md](docs/프로토타입_분리_기획안.md) |

---

## 2. 빠른 실행 가이드

### 2.1 실서버 웹앱 실행 (`Express + TypeScript + node:sqlite`)

Node.js 내장 `node:sqlite` 모듈을 사용하므로 별도 네이티브 빌드(`node-gyp`) 없이 바로 실행할 수 있습니다.

```bash
# 1. 의존성 설치
npm install

# 2. 서버 + 클라이언트 빌드 및 실행
npm start
```

- **고객 포털**: `http://localhost:<PORT>/` (`public/index.html`)
- **운영자 콘솔**: `http://localhost:<PORT>/admin.html` (`public/admin.html`, `noindex`)
- **Electron 데스크탑 실행**: `npm run desktop` (`desktop/main.cjs`)
- **필수 환경변수 (배포 시 반드시 지정)**:
  - `PORT`: 서버 포트 (기본 `3000`)
  - `ADMIN_ID` / `ADMIN_PASSWORD`: 운영자 초기 계정·비밀번호 (**실배포 전 반드시 환경변수로 변경**)
  - `SESSION_SECRET`: HMAC 세션 쿠키 서명 비밀키 (**실배포 전 무작위 비밀키 지정**)

### 2.2 타입 검사 · 자동화 테스트 · 성능 측정

```bash
# 서버 · 클라이언트 · 테스트 전체 strict 타입 검사
npm run check

# 자동화 테스트 (46개: API 32 + 보안·미디어 6 + 시간 의존 8)
npm test

# 성능 벤치마크 (500건 · 5,000건 기준)
npm run perf
```

### 2.3 분리형 정적 프로토타입 (`prototype/`, 진행중)

고객 웹([prototype/customer.html](prototype/customer.html))과 관리자 웹(`prototype/admin.html`, 예정)을 분리하는 6단계 작업을 진행 중입니다. 현재 1~3단계(벤치마킹 분석·관리자 구성요소 기획·`prototype/tokens.css` 기준안 확정 및 CC 라이선스 가구 사진 7종 배치)를 마치고 4단계(고객 웹) 구현 중입니다.

---

## 3. 주요 구현 기능 요약

### 백엔드 (`src/server/`)
- **도메인·상태관리**: 1건 신청 대비 N개 품목(`1~20개`) 독립 상태머신(`PENDING → IN_PROGRESS → SCHEDULED → COMPLETED / CANCELED`), 낙관적 락(`version` → `409 VERSION_CONFLICT`), `Idempotency-Key` 중복 접수 방지, 감사 이력(`status_history`)
- **인증·보안**: `scrypt` 비밀번호 해싱, 포털 분리 HMAC 서명 쿠키 3종(`fr_customer`, `fr_admin`, `fr_lookup`), `Origin` 기반 CSRF 검증, 로그인/PIN 5회 실패 시 60초 잠금, 비공개 메모(`admin_memo`, `admin_item_memo`) 고객 DTO 직렬화 원천 차단
- **미디어·내보내기**: 이미지 매직바이트 검증(`415`), JPEG/PNG EXIF(GPS 등) 메타데이터 제거 및 업로드 실패 시 고아 파일 즉시 롤백, 가구당 사진 1장 이상 필수 검증, UTF-8 BOM + 수식 인젝션 방어 CSV 다운로드

### 프론트엔드 (`public/`, `src/client/`)
- **고객 포털**: 홈(히어로·이사일 기준 4단계 일정 축·가구 6종·처리 방식 표·FAQ·마무리 안내), 다품목 신청 폼(카카오 우편번호 검색 + 수동 입력 폴백, 사진 1~6장 압축·미리보기, 품목별 오류 포커스), 접수 완료, 비회원 PIN 진행 조회·취소, 회원 로그인/가입/마이페이지(계정 승계·기본 수거지 자동채움), 이용약관·개인정보 처리방침 초안(`[TBD]` 항목 포함)
- **운영자 콘솔**: 로그인, 대시보드(4대 KPI·필터·검색·페이징·CSV), 접수 상세(품목별 상태·마감일·반출 일정·공개 안내문·내부 메모·변경 이력), 3색 일정 캘린더(이사일·판매 마감·확정 반출), 설정(사업자 정보·비밀번호 변경)
- **멀티 플랫폼**: 라이트/다크 테마 전환, PWA(`manifest.webmanifest` + `sw.js` 오프라인 셸), Electron 데스크탑 래퍼(`desktop/main.cjs`)

---

## 4. 확정 기술 스택

| 계층 | 확정 기술 | 핵심 선정 사유 |
| --- | --- | --- |
| **프론트엔드** | `HTML5` + `CSS3 (디자인 토큰)` + `Vanilla TypeScript (ES2022 Modules)` | 무거운 번들러 의존성 0개, 공식 `tsc`만으로 표준 브라우저 모듈 컴파일 |
| **백엔드** | `Node.js` + `Express 4` + `TypeScript (strict)` + `multer 2.5` | 단일 서버에서 REST API 18종 및 고객(`index.html`)·운영자(`admin.html`) 물리 격리 서빙 |
| **데이터베이스** | Node 내장 `node:sqlite` (`DatabaseSync`, WAL 모드) | C++ 빌드(`node-gyp`) 없이 Windows/Linux 환경에서 즉시 구동 |
| **보안·미디어** | `node:crypto (scrypt)`, 매직바이트 검증, 버퍼 단위 EXIF 제거 | 자택 촬영 사진 위치정보 자동 삭제, 비공개 운영 메모 서버 단 차단 |
| **멀티 플랫폼** | `PWA (manifest.webmanifest + Service Worker)` + `Electron 45` | 동일 웹 코드로 모바일/PC 설치형 웹앱 및 운영자 데스크탑 앱 동시 지원 |

---

## 5. 디렉터리 구조

```text
gagudabang/
├── README.md                              # 프로젝트 안내 및 실행 가이드
├── package.json                           # 빌드·실행·테스트·성능 스크립트 및 의존성
├── tsconfig.{base,server,client,test}.json
├── src/
│   ├── shared/types.ts                    # 프론트·백엔드 공용 타입 및 상태 전이 계약
│   ├── server/                            # Express + node:sqlite 백엔드 (API 18종)
│   │   ├── index.ts / app.ts / db.ts / lib.ts
│   │   ├── routes/{public.ts, admin.ts}
│   │   └── services/{applications.ts, media.ts}
│   └── client/                            # Vanilla TypeScript 프론트엔드
│       ├── common/{api.ts, ui.ts}
│       ├── customer/{main.ts, legal.ts}
│       └── admin/main.ts
├── public/                                # 실서버 정적 엔트리·스타일·PWA·자체 호스팅 폰트
│   ├── index.html / admin.html / manifest.webmanifest / sw.js
│   ├── styles/{tokens.css, customer.css, admin.css, responsive.css}
│   └── assets/{brand/icon.svg, fonts/PretendardVariable.woff2}
├── prototype/                             # 분리형 정적 프로토타입 (4단계 고객 웹 진행중)
│   ├── customer.{html,css,js} / tokens.css / base.css / ui.css / data.js / store.js
│   └── assets/{icon.svg, fonts/, photos/}
├── desktop/main.cjs                       # Electron 운영자 데스크탑 래퍼
├── tests/                                 # node:test 자동화 테스트 스위트 (46개)
│   └── {api.test.ts, security-media.test.ts, time.test.ts, helpers.ts}
├── scripts/perf.ts                        # 500건 / 5,000건 성능 벤치마크 스크립트
└── docs/                                  # 기획서·벤치마킹·진행 현황 문서
    ├── DEVELOPMENT_STATUS.md              # 단계별 개발 진행 현황 및 잔여 항목
    ├── 프로토타입_분리_기획안.md              # 고객/관리자 분리 프로토타입 기획안 및 기준안
    ├── 기술_상세_기획서.{md,pdf}            # 화면·기능·SQL DDL·API 18종 상세 기술 기획서
    ├── 서비스_종합_설계기획서.md              # 서비스 종합 설계기획서 마크다운
    ├── 국내_플랫폼_분석/                    # 국내 7개 유사 플랫폼 벤치마킹 분석서 (MD/PDF)
    └── assets/{brand/, design/}           # 브랜드 로고·아이콘 및 공개용 설계 SVG
```
