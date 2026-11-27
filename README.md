<p align="center">
  <img src="docs/assets/readme/banner.png" alt="가구다방 (GaguDabang) 프로젝트 배너" width="100%">
</p>

<h1 align="center">가구다방 (GaguDabang)</h1>

<p align="center">
  <strong>이사 전 가구, 먼저 팔고 남은 건 비워 드립니다.</strong><br>
  이사일 역산 타임라인 기반 중고가구 위탁 판매 및 방문 수거(비움) 리빙 플랫폼 MVP
</p>

<p align="center">
  <a href="#1-서비스-동작-원리">동작 원리</a> &middot;
  <a href="#2-시스템-아키텍처">시스템 아키텍처</a> &middot;
  <a href="#3-보안--미디어-무결성-파이프라인">보안 파이프라인</a> &middot;
  <a href="#4-데이터베이스-er-다이어그램">ER 다이어그램</a> &middot;
  <a href="#5-rest-api-구성">REST API</a> &middot;
  <a href="#6-빠른-실행-가이드">빠른 실행</a>
</p>

---

이사 전 처치 곤란한 대형가구를 **이사일(D-Day) 기준으로 역산**하여 먼저 **위탁 판매 대행**을 연결하고, 마감일까지 미판매된 가구나 신속 정리가 필요한 가구는 희망 반출일에 **방문 수거(비움)**까지 한 번에 처리하는 무번들러 풀스택 웹 플랫폼입니다.

- **핵심 철학**: 회원가입 없는 비회원 1분 다품목 접수(4자리 PIN 조회) · 1건 신청 대비 1~20개 품목 독립 상태머신 · 서버 직렬화 단 비공개 메모 원천 격리
- **무충돌 순수 웹 표준**: 번들러(Webpack/Next.js)와 네이티브 C++ 빌드(`node-gyp`) 의존성 0개 — `tsc` + `Express 4` + Node 내장 `node:sqlite (WAL)`만으로 웹·PWA·Electron 동시 구동
- **디자인 시스템**: 남색(`#14284B`)·흰색(`#F5F7FB`) 베이스 팔레트 + 자체 호스팅 `Pretendard` 단일 글꼴(라이트/다크 모드 지원)

---

## 1. 서비스 동작 원리

### 이사일 역산 타임라인 & 1:N 품목 독립 처리

고객이 한 번의 신청서(`applications`)에 침대·소파·책상 등 최대 20개의 가구를 함께 접수하면, 운영자는 품목(`application_items`)마다 **위탁 판매(`RESALE`)** 또는 **단순 처분(`DISPOSE`)**을 독립적으로 판정합니다. 모든 판매 마감일과 희망 반출일은 서버와 클라이언트 양쪽에서 `이사일 이하` 가드레일로 통제됩니다.

![이사일 역산 타임라인 및 1:N 품목 독립 처리 원리](docs/assets/readme/reverse-timeline.png)

### 품목별 상태 전이 머신 (`src/shared/types.ts`)

신청 건의 실제 진행은 개별 가구 품목 단위로 동작하며, 정의된 전이표(`TRANSITIONS`) 외의 변경은 서버가 `409 TRANSITION_DENIED`로 차단합니다. 고객 자율 취소는 신청 내 **모든 품목이 `PENDING` 상태일 때만** 허용됩니다.

```mermaid
stateDiagram-v2
    direction LR
    [*] --> PENDING : 고객 다품목 접수 (POST /api/applications)

    PENDING --> IN_PROGRESS : 사진 검토 후 위탁 판매·처분 착수
    PENDING --> SCHEDULED : 단순 처분 확정 반출 일시 지정
    PENDING --> CANCELED : 전 품목 PENDING 고객 취소 / 운영 반려

    IN_PROGRESS --> SCHEDULED : 매수자 매칭 또는 마감 후 처분 반출 확정
    IN_PROGRESS --> COMPLETED : 현장 즉시 정산·종결
    IN_PROGRESS --> CANCELED : 수거 불가·진행 중단

    SCHEDULED --> IN_PROGRESS : 반출 일정 재조정
    SCHEDULED --> COMPLETED : 방문 반출 및 처리 종결
    SCHEDULED --> CANCELED : 현장 취소

    COMPLETED --> [*]
    CANCELED --> [*]
```

---

## 2. 시스템 아키텍처

고객 포털(`public/index.html`)과 운영자 콘솔(`public/admin.html`)은 HTML 엔트리, 스타일시트, 스크립트, 서명 세션 쿠키(`fr_customer` / `fr_lookup` / `fr_admin`)가 물리적으로 분리되어 있으며 단일 Express 서버에서 서빙됩니다.

```mermaid
flowchart LR
    subgraph Channels["멀티 플랫폼 채널"]
        CWeb["고객 포털 웹 (index.html)"]
        CPWA["설치형 PWA (manifest + sw.js)"]
        AWeb["운영자 콘솔 웹 (admin.html / noindex)"]
        AElec["Electron 데스크탑 (desktop/main.cjs)"]
    end

    subgraph Gate["Express 보안 · 게이트웨이 계층 (app.ts · lib.ts)"]
        Headers["보안 헤더 (DENY · nosniff · Referrer)"]
        CSRF["Origin / Referer CSRF 검증 (403)"]
        Limit["Sliding Window Rate Limit · 5회 실패 60초 잠금 (429)"]
        Auth["HMAC-SHA256 3종 분리 쿠키 검증"]
    end

    subgraph Domain["도메인 라우터 · 서비스 계층"]
        PubR["Public Router (public.ts)"]
        AdmR["Admin Router (admin.ts)"]
        AppSvc["ApplicationService (트랜잭션 · 상태머신 · 낙관적 락)"]
        MediaSvc["MediaService (매직바이트 · EXIF GPS 제거)"]
    end

    subgraph Storage["로컬 저장소 계층"]
        SQLite[("node:sqlite WAL (data/gagudabang.sqlite)")]
        Uploads[("격리 미디어 저장소 (data/uploads/UUID.ext)")]
    end

    CWeb --> Headers
    CPWA --> Headers
    AWeb --> Headers
    AElec --> Headers

    Headers --> CSRF --> Limit --> Auth
    Auth --> PubR
    Auth --> AdmR

    PubR --> AppSvc
    PubR --> MediaSvc
    AdmR --> AppSvc

    AppSvc --> SQLite
    MediaSvc --> Uploads
    PubR -.->|"권한 검증 스트리밍 (미권한 404)"| Uploads
```

---

## 3. 보안 · 미디어 무결성 파이프라인

자택 실내에서 촬영한 가구 사진의 위치정보(EXIF GPS) 노출, 확장자 위장 악성 파일 업로드, 중복 접수, 동시 수정 충돌, 비공개 운영 메모 유출을 6단계 서버 파이프라인으로 방어합니다.

![6단계 보안·미디어 무결성·트랜잭션 파이프라인](docs/assets/readme/security-pipeline.png)

### 다품목 신청 · 사진 무결성 검증 · 고아 파일 롤백 시퀀스

```mermaid
sequenceDiagram
    autonumber
    participant Client as 고객 브라우저 (Canvas 압축)
    participant API as Express Public Router
    participant Media as MediaService (media.ts)
    participant DB as node:sqlite (WAL)
    participant Disk as data/uploads/

    Client->>Client: EXIF 회전 보정 · 최대 1440px JPEG 압축
    Client->>API: POST /api/applications (multipart + Idempotency-Key)
    API->>DB: idempotency_keys 조회
    alt 이미 처리된 멱등성 키
        DB-->>API: 캐시된 응답 반환
        API-->>Client: 기존 접수 결과 재반환 (중복 생성 차단)
    else 신규 요청
        API->>API: 일정 가드레일(<= moving_date) · 품목당 사진 1~6장 검증
        loop 첨부된 모든 사진 파일
            API->>Media: storeImage(buffer)
            Media->>Media: 매직바이트 검사 (JPG/PNG/WebP 외 415)
            Media->>Media: JPEG APP1 / PNG eXIf·tEXt 메타데이터 제거
            Media->>Disk: UUID.ext 저장 및 롤백 목록 추적
        end
        API->>DB: BEGIN IMMEDIATE 트랜잭션
        API->>DB: INSERT applications · application_items · item_photos · status_history · idempotency_keys
        alt 검증 실패 또는 트랜잭션 오류
            DB-->>API: ROLLBACK
            API->>Disk: removeFiles() 기저장 사진 즉시 삭제 (고아 파일 방지)
            API-->>Client: 415 / 422 / 500 오류 응답
        else 커밋 성공
            DB-->>API: COMMIT
            API-->>Client: 201 Created (PublicApplicationDto)
        end
    end
```

---

## 4. 데이터베이스 ER 다이어그램

Node 내장 `node:sqlite` (`PRAGMA journal_mode = WAL`, `PRAGMA foreign_keys = ON`) 기반의 8개 테이블 구조입니다([src/server/db.ts](src/server/db.ts)).

```mermaid
erDiagram
    USERS ||--o{ APPLICATIONS : "회원 신청·승계 (user_id)"
    APPLICATIONS ||--|{ APPLICATION_ITEMS : "1:N 독립 품목 (1~20)"
    APPLICATION_ITEMS ||--o{ ITEM_PHOTOS : "품목별 첨부 사진 (1~6)"
    APPLICATIONS ||--o{ STATUS_HISTORY : "신청 감사 이력"
    APPLICATION_ITEMS |o--o{ STATUS_HISTORY : "품목 변경 이력"
    APPLICATIONS ||--o{ SMS_LOG : "문자 발송 기록"

    USERS {
        INTEGER id PK
        TEXT role "CUSTOMER | ADMIN"
        TEXT login_id UK "휴대폰번호 또는 관리자 ID"
        TEXT username UK "회원 아이디 (없을 수 있음)"
        TEXT password_hash "scrypt salt:hash"
        TEXT name
        TEXT phone
        TEXT default_zipcode
        TEXT default_address
        TEXT default_address_detail
        INTEGER is_active
        TEXT created_at
    }

    APPLICATIONS {
        INTEGER id PK
        TEXT request_code UK "FR-YYYYMMDD-NNN"
        INTEGER user_id FK "비회원 NULL"
        TEXT lookup_pin_hash "4자리 PIN scrypt 해시"
        TEXT applicant_name
        TEXT phone
        TEXT address
        TEXT elevator_info "YES | NO_STAIRS | FIRST_FLOOR"
        TEXT moving_date "YYYY-MM-DD"
        TEXT preferred_pickup_date "YYYY-MM-DD"
        TEXT customer_memo
        TEXT admin_memo "고객 DTO 비노출"
        INTEGER version "낙관적 락 버전"
        INTEGER is_demo
        TEXT created_at
    }

    APPLICATION_ITEMS {
        INTEGER id PK
        INTEGER application_id FK
        INTEGER sort_order
        TEXT category "BED | SOFA | DINING | CLOSET | DESK | ETC"
        TEXT item_name
        TEXT condition_grade "BEST | GOOD | FAIR | POOR_DISPOSE"
        TEXT customer_preference "RESALE | DISPOSE | CONSULT"
        TEXT handling_type "UNDECIDED | RESALE | DISPOSE"
        TEXT status "PENDING | IN_PROGRESS | SCHEDULED | COMPLETED | CANCELED"
        TEXT sale_deadline "YYYY-MM-DD"
        TEXT pickup_schedule "확정 반출 일시"
        TEXT public_notice "고객 공개 안내문"
        TEXT admin_item_memo "고객 DTO 비노출"
        INTEGER version "낙관적 락 버전"
        TEXT updated_at
    }

    ITEM_PHOTOS {
        INTEGER id PK
        INTEGER item_id FK
        TEXT stored_name UK "UUID.ext"
        TEXT original_name
        TEXT mime_type "image/jpeg | png | webp"
        INTEGER byte_size
        TEXT photo_tag "FULL | DETAIL"
        INTEGER sort_order
        TEXT created_at
    }

    STATUS_HISTORY {
        INTEGER id PK
        INTEGER application_id FK
        INTEGER item_id FK "NULL 가능"
        TEXT actor_role "CUSTOMER | ADMIN | SYSTEM"
        TEXT actor_name
        TEXT action_type "CREATED | ITEM_UPDATED | MEMO_UPDATED | CUSTOMER_CANCELED | CLAIMED"
        TEXT before_json
        TEXT after_json
        TEXT note
        TEXT created_at
    }

    SMS_LOG {
        INTEGER id PK
        INTEGER application_id FK
        INTEGER item_id FK "NULL 가능"
        TEXT actor_name "보낸 운영자"
        TEXT to_phone
        TEXT body "보낸 문구"
        TEXT created_at
    }

    IDEMPOTENCY_KEYS {
        TEXT key PK
        TEXT endpoint
        INTEGER status_code
        TEXT response_json
        TEXT created_at "24시간 후 자동 정리"
    }

    SITE_SETTINGS {
        TEXT key PK "companyName | ceoName | bizNo | phone | hours | address"
        TEXT value
        TEXT updated_at
    }
```

---

## 5. REST API 구성

실제 구현된 API 라우트([src/server/routes/public.ts](src/server/routes/public.ts), [src/server/routes/admin.ts](src/server/routes/admin.ts)) 목록입니다.

| 영역 | Method · Path | 인증 / 쿠키 | 핵심 기능 및 보호 규칙 |
| --- | --- | --- | --- |
| **시스템** | `GET /api/health` | 공개 | 서버 헬스체크 |
| **공개 설정** | `GET /api/public/config` | 공개 | 푸터 사업자·고객센터 정보 조회 |
| **접수** | `POST /api/applications` | 공개 / 회원 | `Idempotency-Key` 중복 차단, 사진 1~6장/품목 매직바이트·EXIF 제거, 원자적 생성 |
| **조회/취소** | `POST /api/applications/lookup` | PIN (5회 잠금) | 접수번호/연락처 + 4자리 PIN 검증 후 `fr_lookup`(30분) 발급, 비공개 메모 제외 반환 |
| **조회/취소** | `POST /api/applications/:code/cancel` | 본인(회원/PIN) | 전 품목 `PENDING` 시에만 취소 허용(진행 중 `409 TRANSITION_DENIED`) |
| **미디어** | `GET /api/uploads/:storedName` | 관리자 / 본인 | UUID 패턴 검증 + 권한 확인 후 스트리밍(미권한·경로탈출 무조건 `404`) |
| **고객 회원** | `GET /api/auth/me` · `POST /api/auth/{signup,login,logout}` | `fr_customer` (7일) | 아이디 또는 휴대폰 번호 + 비밀번호(`scrypt`) 인증, 회원 쿠키 발급/해제(관리자 쿠키 독립 유지) |
| **마이페이지** | `GET /api/my/applications` · `PATCH /api/my/profile` · `POST /api/my/claim` | `fr_customer` | 내 이력 조회, 기본 수거지 수정, 비회원 신청 건(접수번호+PIN) 계정 승계 |
| **관리자 인증** | `POST /api/admin/login` · `POST /api/admin/logout` | `fr_admin` (12시간) | 타이밍 공격 완화 `scrypt` 검증, 5회 실패 60초 잠금(`429 AUTH_LOCKED`) |
| **운영 대시보드** | `GET /api/admin/applications` · `GET /api/admin/schedule` | `fr_admin` | 4대 실시간 KPI, 필터·검색·정렬·페이징, 월간 3색 일정 캘린더 집계 |
| **상세/처리** | `GET / PATCH /api/admin/applications/:id` · `PATCH /api/admin/items/:itemId` | `fr_admin` | 내부 메모 및 품목 상태·마감일·반출일 갱신(`version` `409` 낙관적 락 + 감사 로그) |
| **직접 추가 일정** | `POST /api/admin/events` · `DELETE /api/admin/events/:id` | `fr_admin` | 접수와 상관없는 일정을 달력에 추가·삭제 |
| **통계** | `GET /api/admin/stats` | `fr_admin` | 접수·품목·회원·문자 합계, 상태·처리 구분·종류별 수, 최근 6개월 월별 접수 |
| **문자 발송** | `POST /api/admin/items/:itemId/sms` | `fr_admin` | 운영자가 확인한 문구를 신청자 번호로 발송(솔라피), 발송 기록 저장. 발송 설정이 없으면 `503 SMS_NOT_CONFIGURED` |
| **내보내기/설정** | `GET /api/admin/export/csv` · `PATCH /api/admin/settings` | `fr_admin` | UTF-8 BOM + 수식 인젝션 방어 CSV 다운로드, 비밀번호 및 공개 사업자 정보 변경 |

---

## 6. 빠른 실행 가이드

### 실서버 웹앱 실행 (`Node.js` + 내장 `node:sqlite`)

```bash
# 1. 의존성 설치
npm install

# 2. 서버 + 클라이언트 빌드 및 실행
npm start
```

- **고객 포털**: `http://localhost:<PORT>/` (`public/index.html`)
- **운영자 콘솔**: `http://localhost:<PORT>/admin.html` (`public/admin.html`, `noindex`)
- **Electron 데스크탑 실행**: `npm run desktop` (`desktop/main.cjs`, 로컬 서버를 연다)
- **Windows 설치 파일 만들기**: `npm run dist:desktop` → `release/gagudabang-partners-setup-<버전>.exe` (설치한 앱은 배포된 서버의 관리자 화면을 연다. 서명하지 않은 설치 파일이라 처음 실행할 때 Windows 경고가 뜬다)
- **실배포 필수 환경변수**:
  - `PORT`: 서버 포트 (기본 `3000`)
  - `ADMIN_ID` / `ADMIN_PASSWORD`: 운영자 초기 계정·비밀번호 (**실배포 전 반드시 환경변수로 지정**)
  - `SESSION_SECRET`: HMAC 세션 쿠키 서명 비밀키 (**실배포 전 무작위 비밀키 지정**)
  - `SOLAPI_API_KEY` / `SOLAPI_API_SECRET` / `SMS_SENDER`: 문자 발송용(선택). 솔라피 API 키와 솔라피에 등록한 발신번호. 세 값이 모두 있어야 관리자 화면에 "문자 보내기"가 나온다

### Vercel 무료 배포 (`vercel.json`, `src/index.ts`)

1. [vercel.com/new](https://vercel.com/new)에서 이 저장소를 가져옵니다. Express 프로젝트로 자동 인식되고, 설치·빌드 명령과 서울 리전(`icn1`)은 `vercel.json`에 들어 있습니다.
2. 프로젝트의 Settings → Environment Variables에 아래 값을 넣고 배포합니다. 두 값이 없으면 서버가 시작되지 않습니다.
   - `ADMIN_PASSWORD`: 운영자 비밀번호 (`ADMIN_ID`는 선택, 기본 `admin`)
   - `SESSION_SECRET`: 무작위 긴 문자열. 예: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`
3. 화면 파일(`public/`)은 Vercel이 직접 내보내고, `/api` 요청은 `src/index.ts`가 내보낸 Express 앱이 함수 하나로 처리합니다. 첫 화면(`/`)은 `vercel.json`의 `routes`가 `public/index.html`로 이어 줍니다.
4. 명령줄로 올릴 때는 `npx vercel login` 뒤에 `npx vercel deploy --prod`를 실행합니다.

- 배포 주소: `https://gagudabang.vercel.app` (관리자 화면은 주소 끝에 `/admin.html`)
- 테스트용 회원 계정 `abcd` / `1234`가 서버가 뜰 때 자동으로 만들어집니다. 실제 고객을 받기 전에 `src/index.ts`와 `src/server/index.ts`의 `testAccount: true`를 빼세요.
- 올릴 파일은 `.vercelignore`가 `src`, `public`, 설정 파일로 한정합니다.

> **알아 둘 제한**: Vercel 함수는 임시 폴더에만 쓸 수 있어, 접수 데이터(SQLite)와 사진이 인스턴스가 바뀌면 지워집니다. 지금 구성은 화면과 흐름을 보여 주는 시연용입니다. 실제 접수를 받으려면 외부 DB와 파일 저장소로 바꿔야 합니다. 한 번에 보내는 요청은 4.5MB까지라 사진이 많으면 접수가 거절될 수 있습니다.

### 타입 검사 · 자동화 테스트 · 성능 측정

```bash
# 서버 · 클라이언트 · 테스트 전체 strict 타입 검사
npm run check

# 자동화 테스트 (54개 통과: API 34 + 보안·미디어 6 + 시간 의존 10 + 문자 발송 2 + 일정·통계 2)
npm test

# 성능 벤치마크 (500건 · 5,000건 기준 p95 측정)
npm run perf
```

### 분리형 정적 프로토타입 (`prototype/`, 6단계 완료)

고객 웹([prototype/customer.html](prototype/customer.html))과 관리자 웹([prototype/admin.html](prototype/admin.html))을 6단계로 나눠 만들었습니다. 서버 없이 열리고 데이터는 브라우저(`localStorage`)에 있습니다. 관리자 웹에서 접수, 자주 묻는 질문, 공지사항을 추가·수정·삭제하면 고객 웹에 바로 반영됩니다. 공용 값은 `tokens.css`, 샘플 데이터는 `data.js` 한 파일에 있습니다. 주소 끝에 `?data=worst`, `?data=empty`, `?data=one`, `?data=huge`를 붙이면 깨짐 점검용 데이터로 열립니다. 자세한 내용은 [docs/프로토타입_분리_기획안.md](docs/프로토타입_분리_기획안.md). 가구 사진은 Pexels의 무료 이용 사진이고 출처는 고객 화면 푸터에 있습니다. 로고는 남색 바탕에 흰 글자인 글자 로고(`assets/logo.svg`)입니다. 실제 앱 홈의 사진(`public/assets/photos/moving-sofa.jpg`)도 Pexels의 무료 이용 사진입니다.

---

## 7. 진행 현황 · 기술 스택 · 디렉터리 구조

### 단계별 진행 현황

처음 쓰는 분을 위한 안내는 [docs/guides/](docs/guides/README.md)에 있습니다(고객 이용 가이드, 관리자 이용 가이드. 컴퓨터와 휴대폰 화면 그림 포함).

상세 이력과 잔여 항목은 [docs/DEVELOPMENT_STATUS.md](docs/DEVELOPMENT_STATUS.md)와 [docs/프로토타입_분리_기획안.md](docs/프로토타입_분리_기획안.md)에서 관리합니다.

| 단계 / TASK | 내용 | 상태 | 주요 산출물 |
| --- | --- | :---: | --- |
| `DOC-01` | 국내 7개 플랫폼 벤치마킹, 서비스 종합 설계기획서·상세 기술 기획서 작성 | **완료** | `docs/*.md`, `docs/*.pdf`, `docs/assets/design/*.svg` |
| `TASK-01` / `R1` | 「가구다방」 리브랜딩 및 인터랙티브 프로토타입 제작 | **완료** | `docs/assets/brand/*.svg` (내부 데모본 별도 보관) |
| `TASK-02` | 실서버 백엔드(`Express + TypeScript + node:sqlite`) DB·인증·보안·REST API 22종 | **완료** | `src/shared/*`, `src/server/*` |
| `TASK-03` | 실서버 무번들러 프론트엔드(고객 포털·관리자 콘솔)·PWA·Electron 연동 | **부분 완료** (화면 기능 완료, 실제 기기 확인 남음) | `public/*`, `src/client/*`, `desktop/main.cjs` |
| `TASK-04` | 자동화 테스트(`node:test` 54개)·접근성 자동 검사(axe-core)·성능 측정(`500`/`5,000`건) 및 품질 검수 | **부분 완료** | `tests/*.test.ts`, `scripts/perf.ts` |
| **프로토타입 분리** | 고객 웹(`customer.html`)·관리자 웹(`admin.html`) 6단계 정적 프로토타입 분리 | **완료 (6단계 마무리 점검까지)** | `prototype/*`, [docs/프로토타입_분리_기획안.md](docs/프로토타입_분리_기획안.md) |

### 확정 기술 스택

| 계층 | 확정 기술 | 핵심 선정 사유 |
| --- | --- | --- |
| **프론트엔드** | `HTML5` + `CSS3 (디자인 토큰)` + `Vanilla TypeScript (ES2022 Modules)` | 무거운 번들러 의존성 0개, 공식 `tsc`만으로 표준 브라우저 모듈 컴파일 |
| **백엔드** | `Node.js` + `Express 4` + `TypeScript (strict)` + `multer 2.5` | 단일 서버에서 REST API 22종 및 고객(`index.html`)·운영자(`admin.html`) 물리 격리 서빙 |
| **데이터베이스** | Node 내장 `node:sqlite` (`DatabaseSync`, WAL 모드) | C++ 빌드(`node-gyp`) 없이 Windows/Linux 환경에서 즉시 구동 |
| **보안·미디어** | `node:crypto (scrypt)`, 매직바이트 검증, 버퍼 단위 EXIF 제거 | 자택 촬영 사진 위치정보 자동 삭제, 비공개 운영 메모 서버 단 차단 |
| **멀티 플랫폼** | `PWA (manifest.webmanifest + Service Worker)` + `Electron 45` | 동일 웹 코드로 모바일/PC 설치형 웹앱 및 운영자 데스크탑 앱 동시 지원 |

### 디렉터리 구조

```text
gagudabang/
├── README.md                              # 프로젝트 안내·아키텍처·파이프라인·ERD 문서
├── package.json                           # 빌드·실행·테스트·성능 스크립트 및 의존성
├── tsconfig.{base,server,client,test}.json   # tsconfig.json은 서버 설정을 그대로 잇는다 (편집기와 Vercel용)
├── vercel.json / .vercelignore            # Vercel 배포 설정 (설치·빌드 명령, 서울 리전, 첫 화면 경로, 보안 헤더)과 올릴 파일 목록
├── DESIGN_AUDIT.md                        # 디자인 점검 보고서 (측정 지표, 고친 것, 제안)
├── src/
│   ├── shared/types.ts                    # 프론트·백엔드 공용 타입 및 상태 전이 계약
│   ├── index.ts                           # Vercel 배포용 진입점 (Express 앱을 내보낸다)
│   ├── server/                            # Express + node:sqlite 백엔드 (API 22종)
│   │   ├── index.ts / app.ts / db.ts / lib.ts
│   │   ├── routes/{public.ts, admin.ts}
│   │   └── services/{applications.ts, media.ts, sms.ts}
│   └── client/                            # Vanilla TypeScript 프론트엔드
│       ├── common/{api.ts, ui.ts}
│       ├── customer/{main.ts, legal.ts}
│       └── admin/main.ts
├── public/                                # 실서버 정적 엔트리·스타일·PWA·자체 호스팅 폰트
│   ├── index.html / admin.html / manifest.webmanifest / sw.js
│   ├── styles/{tokens.css, customer.css, admin.css, responsive.css}
│   └── assets/{brand/logo.svg, brand/icon.svg, brand/og-image.jpg, photos/moving-sofa.jpg, fonts/PretendardVariable.woff2}
├── prototype/                             # 분리형 정적 프로토타입 (고객 웹 + 관리자 웹, 6단계 완료)
│   ├── customer.{html,css,js} / admin.{html,css,js} / tokens.css / base.css / ui.css / data.js / store.js
│   └── assets/{logo.svg, icon.svg, fonts/, photos/}
├── desktop/                               # Electron 운영자 데스크탑 래퍼(main.cjs)와 설치 파일 설정(electron-builder.json, icon.png)
├── tests/                                 # node:test 자동화 테스트 스위트 (54개)
│   └── {api.test.ts, security-media.test.ts, time.test.ts, sms.test.ts, helpers.ts}
├── scripts/guide/{capture.mjs, build-pdf.mjs} # 이용 가이드의 화면 그림과 PDF를 다시 만드는 스크립트
├── scripts/perf.ts                        # 500건 / 5,000건 성능 벤치마크 스크립트
├── scripts/split-demo.mjs                 # 로컬 demo.html을 고객 화면과 관리자 화면 파일로 나눔 (결과물 demo/는 저장소에 올리지 않음)
└── docs/                                  # 기획서·벤치마킹·진행 현황 및 README 시각 자산
    ├── DEVELOPMENT_STATUS.md              # 단계별 개발 진행 현황 및 잔여 항목
    ├── guides/                            # 고객·관리자 이용 가이드 (md, PDF). 그림은 assets/guide/, 다시 만드는 스크립트는 scripts/guide/
    ├── 프로토타입_분리_기획안.md              # 고객/관리자 분리 프로토타입 기획안 및 기준안
    ├── 기술_상세_기획서.{md,pdf}            # 화면·기능·SQL DDL·API 상세 기술 기획서
    ├── 서비스_종합_설계기획서.md              # 서비스 종합 설계기획서 마크다운
    ├── 국내_플랫폼_분석/                    # 국내 7개 유사 플랫폼 벤치마킹 분석서 (MD/PDF)
    └── assets/
        ├── brand/                         # 브랜드 아이콘·가로형 로고 SVG
        ├── design/                        # 공개용 설계 도식 SVG
        └── readme/                        # README 배너·역산 원리·보안 파이프라인 고해상도 PNG
```

> **공개 저장소 보안 정책**: 계약·견적 문서, 사업자/개인정보가 포함된 원본 시안·파일, 로컬 `.env` 및 SQLite DB 파일은 [.gitignore](.gitignore)로 제외되어 있습니다.
