# 개발 진행 현황 (`DEVELOPMENT_STATUS.md`)

- **프로젝트명**: 가구다방 (`GaguDabang`, 저장소명 `furni-resale`) — 중고가구 처분 및 판매 대행 서비스 MVP
- **작업 디렉터리**: `C:\Users\user\Desktop\RISK\furni-resale`
- **오케스트레이션 기준**: `CLAUDE_KO.md` / `CLAUDE_EN.md` (1순위 `Grok 4.7` → 2순위 `Gemini 4 Neon` → 3순위 `Claude 직접 구현`)
- **최종 갱신 시각**: `2026-11-26`

---

## 1. 단계별 작업 로드맵 및 현재 상태

| TASK ID | 작업 목표 | 우선 담당 모델 | 현재 파이프라인 단계 | 상태 | 산출물 경로 |
| --- | --- | --- | --- | --- | --- |
| `DOC-01` | 견적서 분석, 국내 7개 유사 플랫폼 벤치마킹, 시각 설계기획서 및 VoteLab 양식 상세 기술 기획서 작성 | Claude (설계 총괄) | 완료 | **완료** | `docs/국내_플랫폼_분석/*.pdf`, `docs/서비스_종합_설계기획서.pdf`, `docs/기술_상세_기획서.pdf` |
| `TASK-01` | `PCB (ICT 프로젝트)\demo.html` 동일 양식의 환경별 뷰어 내장 단일 파일 인터랙티브 프로토타입 데모 UI 구현 (`C-01~C-08`, `A-01~A-04s` 전 화면 + 실시간 양방향 연동) | Grok 4.7 → Gemini 4 Neon + Claude 통합검증 | 완료 | **완료** | `demo.html`, `docs/assets/brand/icon.svg` |
| `TASK-01-R1` | 앱 브랜드명 **「가구다방 (`GaguDabang`)」** 리브랜딩, 전용 심볼·가로형 로고 신규 제작 및 `PCB` 공구형 스타일 탈피 에디토리얼 리빙 디자인 전면 개편 | Grok 4.7 → **Gemini 4 Neon** + Claude 통합검증 | 완료 | **완료** | `demo.html`, `docs/assets/brand/icon.svg`, `docs/assets/brand/logo-horizontal.svg` |
| `TASK-02` | 실서버 백엔드(`Express + TypeScript + node:sqlite`) DB 스키마·인증·매직바이트/EXIF 제거·REST API 18종 구현 | Grok 4.7 (`grok-4.7-build-fast`) | 완료 | **완료** | `package.json`, `tsconfig*.json`, `src/shared/*`, `src/server/*` |
| `TASK-03` | 실서버 무번들러 프론트엔드(`순수 HTML/CSS/Vanilla TS`) 고객 포털·관리자 콘솔 및 PWA/Electron 래퍼 연동 | Grok 4.7 (`grok-4.7-build-fast`) | 부분 완료 | **진행중** | `public/*`, `src/client/*`, `desktop/main.cjs` |
| `TASK-04` | 통합 자동화 테스트(`node:test`) 및 브라우저 E2E·접근성 최종 검수 | Grok 4.7 + Claude 검증 | 자동화 테스트 완료 | **부분 완료** | `tests/*.test.ts` |

---

## 2. 현재 상태 상세 (2026-11-26)

### TASK-02 백엔드 — 완료
- Express 4 + TypeScript(strict) + `node:sqlite`, API 18종, 상태 전이 기계, 낙관적 락, 멱등성 키, 이미지 매직바이트 검증 및 EXIF 제거(JPEG/PNG. **WebP는 미제거**, `media.ts`의 `shortcut:` 주석 참고).
- 인증: scrypt, HMAC 서명 쿠키, Origin 기반 CSRF, 로그인/PIN 5회 실패 시 60초 잠금.

### TASK-03 프론트엔드 — 부분 완료
- 완료: 고객 홈(히어로+이사일 기준 일정, 가구 종류, 처리 방식, 자주 묻는 질문, 마무리 안내)·신청·완료·조회/취소·로그인·가입·마이페이지, 이용약관·개인정보 처리방침(초안, `[TBD]` 항목과 법률 검토 남음), 관리자 로그인·대시보드·상세·캘린더·설정, 테마 전환 버튼(FN-02), PWA(매니페스트·서비스 워커, Chrome 설치 가능 조건 통과), Electron 래퍼(`desktop/main.cjs`).
- 디자인 기준: 남색·흰색 팔레트(`public/styles/tokens.css` 1697행 이후 블록), 글꼴은 Pretendard 하나로 통일(자체 호스팅 `public/assets/fonts/`). 로고 글자는 HTML로 렌더(`ui.ts`의 `logo()`), 심볼만 `icon.svg`.
- 홈 시안은 Figma 「가구다방 프론트 진단」 파일에 있고(원본·개선안 프레임), 승인된 7개 항목을 코드에 반영함. 홈 문구는 실제 동작 기준이므로 검증 규칙(품목 1~20개, 취소 조건, 이사일 이전 제한)을 바꾸면 `src/client/customer/main.ts`의 `home()`도 같이 고친다.
- 접수 폼: 품목별 오류 표시와 첫 오류 칸 포커스, 가구 삭제, 사진 1~6장 필수(서버 검증)·미리 보기, 주소 검색(카카오 우편번호 서비스, 실패 시 직접 입력), 라벨-입력 연결(공용 `decorate()`).
- 미완료: 관리자 모바일 하단 4탭, 관리자 SMS 템플릿·전이 모달·사진 라이트박스.
- 미검증: PWA 실제 기기 설치, Electron 설치형 패키징.

### TASK-04 테스트 — 부분 완료
- `npm test`: 46개 통과(API 32, 보안·미디어 6, 시간 의존 8). `npm run perf`: 500/5천 건 모두 성능 목표 통과.
- 미진행: 접근성 정식 검수, rate limit 시간 경과 테스트(시계 미주입).

### 알려진 사항
- `demo.html`은 TASK-01 프로토타입으로 보존. 미확정 사업자 정보는 `[TBD]`.
- `is_demo` 시드 데이터 미생성.