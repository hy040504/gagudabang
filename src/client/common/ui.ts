import { ApiError } from './api.js';

export const esc = (s: unknown): string =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);

export const STATUS_LABEL = { PENDING: '접수대기', IN_PROGRESS: '진행중', SCHEDULED: '반출예정', COMPLETED: '처리완료', CANCELED: '취소·반려' } as const;
export const CATEGORY_LABEL = { BED: '침대', SOFA: '소파', DINING: '식탁', CLOSET: '옷장·수납', DESK: '책상', ETC: '기타' } as const;
export const CONDITION_LABEL = { BEST: '상', GOOD: '중상', FAIR: '중', POOR_DISPOSE: '하(처분 희망)' } as const;
export const PREFERENCE_LABEL = { RESALE: '위탁 판매', DISPOSE: '단순 처분', CONSULT: '상담 후 결정' } as const;
export const HANDLING_LABEL = { UNDECIDED: '미정', RESALE: '위탁 판매', DISPOSE: '단순 처분' } as const;
export const ELEVATOR_LABEL = { YES: '엘리베이터 있음', NO_STAIRS: '엘리베이터 없음(계단)', FIRST_FLOOR: '1층' } as const;

export const options = (map: Record<string, string>, selected = '') =>
  Object.entries(map).map(([v, l]) => `<option value="${v}"${v === selected ? ' selected' : ''}>${esc(l)}</option>`).join('');

export function toast(msg: string, kind: 'ok' | 'bad' | 'info' = 'info') {
  const host = document.getElementById('toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.setAttribute('role', 'status');
  el.textContent = msg;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

/** 입력칸 하나에 오류 문구를 붙인다. 체크박스·파일처럼 라벨 안에 든 입력은 라벨 뒤에 붙인다. */
export function fieldError(input: HTMLElement, msg: string) {
  input.setAttribute('aria-invalid', 'true');
  (input.closest('label') ?? input).insertAdjacentHTML('afterend', `<div class="err-msg" role="alert">${esc(msg)}</div>`);
}

/** API 오류를 토스트로 알리고 fieldErrors는 각 입력 아래에 표시한 뒤, 화면에서 가장 위의 오류 칸으로 포커스를 옮긴다. */
export function showError(err: unknown, form?: HTMLElement) {
  if (!(err instanceof ApiError)) { toast('알 수 없는 오류가 발생했습니다.', 'bad'); return; }
  toast(err.message, 'bad');
  if (!form) return;
  form.querySelectorAll('.err-msg').forEach((e) => e.remove());
  form.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
  for (const [name, msg] of Object.entries(err.fieldErrors ?? {})) {
    const input = form.querySelector<HTMLElement>(`[name="${CSS.escape(name)}"]`);
    if (input) fieldError(input, msg);
  }
  form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
}

let fieldSeq = 0;
/** 렌더된 폼 컨트롤에 .inp 클래스를 붙이고(체크박스·파일 입력 제외), .field 안의 라벨을 입력칸과 연결한다. */
export function decorate(root: ParentNode = document) {
  root.querySelectorAll('input:not([type=checkbox]):not([type=file]), select, textarea').forEach((el) => el.classList.add('inp'));
  root.querySelectorAll<HTMLLabelElement>('.field > label:not([for])').forEach((label) => {
    const control = label.parentElement!.querySelector<HTMLElement>('input, select, textarea');
    if (!control || label.contains(control)) return; // 입력을 감싼 라벨은 이미 연결돼 있다
    control.id ||= `f${++fieldSeq}`;
    label.htmlFor = control.id;
  });
}

// 테마: 고르지 않았으면 기기 설정을 따른다(색은 CSS의 light-dark()가 고른다). 버튼으로 고른 값만 저장한다.
const systemTheme = () => (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
const storedTheme = () => { try { const t = localStorage.getItem('gd_theme'); return t === 'dark' || t === 'light' ? t : null; } catch { return null; } };
export function applyTheme(theme: 'light' | 'dark') {
  document.documentElement.dataset.theme = theme;
  // 기기 설정과 같은 쪽으로 돌아가면 저장을 지운다. 그래야 기기 설정이 바뀔 때 다시 따라간다.
  try { if (theme === systemTheme()) localStorage.removeItem('gd_theme'); else localStorage.setItem('gd_theme', theme); } catch { /* 저장소 차단 환경 */ }
}
const themeLabel = () => (document.documentElement.dataset.theme === 'dark' ? '라이트 모드' : '다크 모드');
const ICON_ATTRS = 'viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';
const THEME_ICONS = `<svg class="i-moon" ${ICON_ATTRS}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/></svg>`
  + `<svg class="i-sun" ${ICON_ATTRS}><circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4"/></svg>`;
/**
 * 헤더에 넣는 테마 전환 버튼. 클릭은 initTheme()이 문서 단위로 처리하므로 뷰마다 연결할 필요가 없다.
 * icon=true면 글자 대신 달/해 아이콘을 넣고, CSS가 현재 테마에 맞는 쪽만 보인다.
 */
export const themeButton = (icon = false) => {
  const label = `${themeLabel()}로 전환`;
  return icon
    ? `<button type="button" class="btn ghost sm gd-theme-icon" data-theme-toggle data-icon aria-label="${label}" title="${label}">${THEME_ICONS}</button>`
    : `<button type="button" class="btn ghost sm" data-theme-toggle>${themeLabel()}</button>`;
};

export function initTheme() {
  const relabel = () => {
    const label = `${themeLabel()}로 전환`;
    document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
      if (b.hasAttribute('data-icon')) { b.setAttribute('aria-label', label); b.setAttribute('title', label); } else b.textContent = themeLabel(); // 글자 버튼은 보이는 글자가 곧 이름이다
    });
  };
  const show = () => { document.documentElement.dataset.theme = storedTheme() ?? systemTheme(); relabel(); };
  show();
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', show);
  document.addEventListener('click', (e) => {
    if (!(e.target as Element).closest('[data-theme-toggle]')) return;
    applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    relabel();
  });
}

export function registerServiceWorker() {
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => { /* HTTPS/localhost 외 환경 */ });
}

/** 가로형 로고. 글자는 HTML로 그려서 화면과 같은 글꼴·테마 색을 쓴다 (<img> SVG 안의 글자는 웹 글꼴을 못 쓴다). */
export const logo = (height = 40) =>
  `<span class="gd-logo"><img src="/assets/brand/logo.svg" alt="가구다방" width="${Math.round(height * 2.66)}" height="${height}"></span>`; // 글자 로고 그림(남색 바탕, 흰 글자). 가로세로 비는 2.66:1
