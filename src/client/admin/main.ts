import { api, ApiError } from '../common/api.js';
import { $, decorate, logo, CATEGORY_LABEL, CONDITION_LABEL, HANDLING_LABEL, PREFERENCE_LABEL, STATUS_LABEL, esc, initTheme, themeButton, options, registerServiceWorker, showError, toast } from '../common/ui.js';
import { BRAND_NAME, DEFAULT_PUBLIC_NOTICE, TRANSITIONS } from '../../shared/types.js';
import type { AdminApplicationDetailDto, AdminApplicationSummaryDto, AdminItemDto, AdminKpis, AdminStatsDto, ItemStatus, PublicConfig, ScheduleCalendarEventDto, StatsPeriod, StatusHistoryDto } from '../../shared/types.js';
import { donut, hbars, stack, xyChart, type Part } from './charts.js';

const app = document.getElementById('app')!;
let loggedIn = false;
const wire: { fn: (() => void) | null } = { fn: null };
const resetWire = () => { wire.fn = null; }; // 함수 호출로 감싸 TS의 대입 후 타입 좁힘을 피한다 // 뷰가 등록하고 render()가 innerHTML 설정 뒤에 실행
const filter = { status: '', handling: '', q: '', page: 1 };

const TABS = [['dashboard', '접수 목록'], ['schedule', '일정'], ['stats', '통계'], ['settings', '설정']] as const;
// 같은 목적지를 넓은 화면에서는 상단 링크로, 640px 이하에서는 하단 탭으로 보여 준다 (전환은 admin.css)
const nav = () => {
  const hash = location.hash.slice(1);
  const cur = TABS.some(([h]) => h === hash) ? hash : 'dashboard'; // 상세 화면은 접수 목록에 속한다
  const links = (cls: string) => TABS.map(([h, l]) => `<a class="${cls}" href="#${h}"${h === cur ? ' aria-current="page"' : ''}>${l}</a>`).join('');
  return `<header class="gd-admin-bar"><div class="gd-admin-bar-in">
  <img src="/assets/brand/logo.svg" alt="가구다방" width="85" height="32"><strong>파트너스 스튜디오</strong>
  <span class="sp"></span>${links('btn ghost sm gd-top-link')}
  <div class="gd-admin-tools"><a class="btn ghost sm" href="/api/admin/export/csv">CSV</a>
  ${themeButton(true)}<button class="btn ghost sm" id="logout">로그아웃</button></div></div></header>
  <nav class="gd-tabbar" aria-label="주요 메뉴">${links('')}</nav>`;
};
function loginView() {
  wire.fn = () => {
    const form = $<HTMLFormElement>('#loginForm')!;
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value;
      try { await api.post('/api/admin/login', { loginId: v('loginId').trim(), password: v('password') }); loggedIn = true; location.hash = '#dashboard'; render(); }
      catch (e) { showError(e, form); }
    });
  };
  return `<main class="main gd-login-page"><div class="main-inner narrow"><form id="loginForm" class="card gd-login" novalidate>
    ${logo(40)}<h1 class="page-title">운영자 로그인</h1>
    <div class="field"><label>아이디</label><input name="loginId" autocomplete="username" required></div>
    <div class="field"><label>비밀번호</label><input name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn primary block">로그인</button></form></div></main>`;
}

const ddayBadge = (d: number | null, label = '') => (d === null ? '' : `<b class="dday${d <= 3 ? ' soon' : ''}">${label}D${d >= 0 ? '-' + d : '+' + -d}</b>`);

async function dashboardView() {
  const qs = new URLSearchParams({ sort: 'moving_asc', page: String(filter.page) });
  if (filter.status) qs.set('status', filter.status);
  if (filter.handling) qs.set('handling', filter.handling);
  if (filter.q) qs.set('q', filter.q);
  const d = await api.get<{ kpis: AdminKpis; items: AdminApplicationSummaryDto[]; total: number; page: number }>(`/api/admin/applications?${qs}`);
  wire.fn = () => {
    const form = $<HTMLFormElement>('#filterForm')!;
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value;
      Object.assign(filter, { status: v('status'), handling: v('handling'), q: v('q').trim(), page: 1 });
      render();
    });
    document.querySelectorAll<HTMLElement>('[data-page]').forEach((b) => b.addEventListener('click', () => { filter.page = Number(b.dataset.page); render(); }));
  };
  const k = d.kpis;
  const pages = Math.max(1, Math.ceil(d.total / 20));
  return `<main class="main"><div class="main-inner"><h1 class="vh">접수 목록</h1>
    <ul class="gd-stats" aria-label="오늘 확인할 항목">
      <li>접수대기 품목 <b>${k.pendingItems}</b></li>
      <li${k.movingSoonApplications ? ' class="alert"' : ''}>이사일 D-3 이내 <b>${k.movingSoonApplications}</b></li>
      <li${k.deadlineAlertItems ? ' class="alert"' : ''}>판매마감 임박·경과 <b>${k.deadlineAlertItems}</b></li>
      <li>7일 내 반출예정 <b>${k.pickupIn7DaysItems}</b></li></ul>
    <form id="filterForm" class="gd-filter">
      <select name="status" aria-label="상태"><option value="">전체 상태</option>${options(STATUS_LABEL, filter.status)}</select>
      <select name="handling" aria-label="처리구분"><option value="">전체 처리구분</option>${options({ RESALE: HANDLING_LABEL.RESALE, DISPOSE: HANDLING_LABEL.DISPOSE, UNDECIDED: HANDLING_LABEL.UNDECIDED }, filter.handling)}</select>
      <input name="q" value="${esc(filter.q)}" placeholder="이름·연락처·접수번호·주소·품목">
      <button class="btn primary">검색</button></form>
    <div class="tbl-wrap"><table class="tbl gd-list"><thead><tr><th>접수번호</th><th>신청자</th><th>이사일</th><th>품목 상태</th></tr></thead><tbody>
      ${d.items.map((a) => `<tr><td><a href="#detail/${a.id}" class="tabular">${esc(a.requestCode)}</a></td><td>${esc(a.applicantName)}<div class="muted small">${esc(a.phone)}</div></td>
        <td>${esc(a.movingDate)} ${ddayBadge(a.movingDday)}</td>
        <td>${a.items.map((i) => `${esc(i.itemName)} <b>${STATUS_LABEL[i.status]}</b> ${ddayBadge(i.deadlineDday, '마감 ')}`).join('<br>')}</td></tr>`).join('') || '<tr><td colspan="4" class="empty">접수 내역이 없습니다.</td></tr>'}
    </tbody></table></div>
    <div class="pager">${d.page > 1 ? `<button class="btn outline sm" data-page="${d.page - 1}">이전</button>` : ''}
      <span class="muted small">${d.page} / ${pages} · 총 ${d.total}건</span>${d.page < pages ? `<button class="btn outline sm" data-page="${d.page + 1}">다음</button>` : ''}</div>
  </div></main>`;
}

const itemForm = (it: AdminItemDto, smsOn: boolean) => `<form class="card gd-item-card" data-item="${it.id}" data-version="${it.version}" novalidate>
  <h2 class="card-title">${esc(it.itemName)} <span class="muted small">${esc(CATEGORY_LABEL[it.category])} · 고객 희망 ${esc(PREFERENCE_LABEL[it.customerPreference])} · 상태 ${esc(CONDITION_LABEL[it.conditionGrade])}</span></h2>
  <div class="gd-photo-row">${it.photos.map((p) => `<a class="gd-thumb" data-photo href="${esc(p.url)}" target="_blank" rel="noopener"><img src="${esc(p.url)}" alt="${esc(it.itemName)} ${p.photoTag === 'DETAIL' ? '디테일' : '전체'}" width="96" height="96"></a>`).join('')}</div>
  <div class="grid2">
    <div class="field"><label>처리 구분</label><select name="handlingType">${options(HANDLING_LABEL, it.handlingType)}</select></div>
    <div class="field"><label>상태</label><select name="status">${options(Object.fromEntries([it.status, ...TRANSITIONS[it.status]].map((s) => [s, STATUS_LABEL[s]])), it.status)}</select></div>
    <div class="field"><label>판매 마감일</label><input name="saleDeadline" type="date" value="${esc(it.saleDeadline)}"></div>
    <div class="field"><label>확정 반출 일정 (예: 2026-12-15 10:00)</label><input name="pickupSchedule" value="${esc(it.pickupSchedule)}"></div>
  </div>
  <div class="field"><label>고객 공개 안내문</label><input name="publicNotice" value="${esc(it.publicNotice)}" maxlength="500"></div>
  <div class="field"><label>내부 메모 (고객 비공개)</label><input name="adminItemMemo" value="${esc(it.adminItemMemo)}" maxlength="1000"></div>
  <div class="gd-confirm" role="group" aria-label="상태 변경 확인" hidden></div>
  <button class="btn primary sm" data-save>변경사항 저장</button>
  <details class="gd-sms"><summary>문자 문구</summary>
    <p class="muted small">저장된 내용으로 문구를 채웁니다. ${smsOn ? '보내기를 누르면 신청자 번호로 문자가 나갑니다.' : '문자 발송이 설정되지 않아 복사해서 직접 보내야 합니다.'}</p>
    <div class="field"><label>상황</label><select data-sms-kind>${options(SMS_LABEL, it.status)}</select></div>
    <div class="field"><label>문구</label><textarea data-sms-text rows="5"></textarea></div>
    <div class="row"><button type="button" class="btn outline sm" data-sms-copy>복사</button>${smsOn ? '<button type="button" class="btn primary sm" data-sms-send>문자 보내기</button>' : ''}</div></details></form>`;

// 상황은 품목 상태와 하나씩 대응한다. 비어 있는 값은 지어내지 않고 대괄호로 남겨 운영자가 채우게 한다.
const SMS_LABEL: Record<ItemStatus, string> = { PENDING: '접수 확인', IN_PROGRESS: '판매 진행', SCHEDULED: '반출 일정 확정', COMPLETED: '처리 완료', CANCELED: '취소' };
function smsText(a: AdminApplicationDetailDto, it: AdminItemDto, kind: ItemStatus) {
  const body: Record<ItemStatus, string> = {
    PENDING: '신청이 접수되었습니다. 담당자가 사진과 일정을 확인한 뒤 안내드리겠습니다.',
    IN_PROGRESS: `판매를 진행합니다. 판매 마감일: ${it.saleDeadline || '[판매 마감일]'}. 진행 상황은 접수 조회에서 확인하실 수 있습니다.`,
    SCHEDULED: `반출 일정이 확정되었습니다. 일정: ${it.pickupSchedule || '[반출 일정]'}`,
    COMPLETED: '반출과 처리가 모두 끝났습니다. 이용해 주셔서 감사합니다.',
    CANCELED: '신청이 취소되었습니다. 자세한 내용은 접수 조회에서 확인하실 수 있습니다.',
  };
  return `[${BRAND_NAME}] ${a.applicantName}님, 접수번호 ${a.requestCode} '${it.itemName}' ${body[kind]}`;
}

async function copyText(ta: HTMLTextAreaElement) {
  try { await navigator.clipboard.writeText(ta.value); }
  catch { ta.select(); if (!document.execCommand('copy')) { toast('복사하지 못했습니다. 문구를 직접 선택해 복사해 주세요.', 'bad'); return; } } // HTTP 접속이나 권한 거부 환경
  toast('문구를 복사했습니다.', 'ok');
}

// 변경 이력의 종류를 화면에서는 한글로 보여 준다
const HISTORY_LABEL: Record<string, string> = { CREATED: '접수', ITEM_UPDATED: '품목 변경', MEMO_UPDATED: '운영 메모 변경', CUSTOMER_CANCELED: '고객 취소', CLAIMED: '회원 계정에 연결', SMS_SENT: '' };

async function detailView(id: number) {
  const d = await api.get<{ application: AdminApplicationDetailDto; history: StatusHistoryDto[]; smsEnabled: boolean }>(`/api/admin/applications/${id}`);
  const a = d.application;
  wire.fn = () => {
    document.querySelectorAll<HTMLFormElement>('form[data-item]').forEach((f) => {
      const it = a.items.find((i) => i.id === Number(f.dataset.item))!;
      const v = (n: string) => (f.elements.namedItem(n) as HTMLInputElement).value;
      const box = $('.gd-confirm', f)!;
      const save = $('[data-save]', f)!;
      const closeConfirm = () => { box.hidden = true; save.hidden = false; };
      // 확인 문구를 본 뒤 값을 바꾸면 문구가 틀려지므로 확인 단계를 닫는다 (문자 문구 칸은 name이 없어 제외)
      f.addEventListener('input', (ev) => { if ((ev.target as HTMLInputElement).name) closeConfirm(); });
      f.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const next = v('status') as ItemStatus;
        const pickup = v('pickupSchedule').trim();
        // 안내문 칸에는 현재 상태의 기본 문구가 채워져 온다. 손대지 않았으면 비워 보내야 새 상태의 기본 문구가 나가고, 취소 사유 검사도 동작한다.
        const notice = v('publicNotice').trim() === DEFAULT_PUBLIC_NOTICE[it.status] ? '' : v('publicNotice').trim();
        if (next !== it.status && box.hidden) {
          // 서버와 같은 조건을 먼저 확인해, 확정을 누른 뒤에야 거절되는 일을 막는다
          if (next === 'SCHEDULED' && !pickup) { showError(new ApiError(422, 'VALIDATION_ERROR', '반출예정 상태로 변경하려면 확정 반출 일정을 입력해야 합니다.', { pickupSchedule: '확정 반출 일정이 필요합니다.' }), f); return; }
          if (next === 'CANCELED' && !notice) { showError(new ApiError(422, 'VALIDATION_ERROR', '취소·반려 사유를 고객 안내문에 입력해야 합니다.', { publicNotice: '사유가 필요합니다.' }), f); return; }
          const shown = [STATUS_LABEL[next], v('saleDeadline') && `판매 마감 ${v('saleDeadline')}`, pickup && `반출 ${pickup}`].filter(Boolean).join(' · ');
          box.innerHTML = `<p>상태를 <b>${STATUS_LABEL[it.status]}</b>에서 <b>${STATUS_LABEL[next]}</b> 상태로 바꿉니다.${TRANSITIONS[next].length ? '' : ' 바꾼 뒤에는 다른 상태로 되돌릴 수 없습니다.'}</p>
            <p class="small">고객 조회 화면에 보이는 내용: ${esc(shown)}<br>${esc(notice || DEFAULT_PUBLIC_NOTICE[next])}</p>
            <div class="row"><button class="btn primary sm">변경 확정</button><button type="button" class="btn outline sm" data-back>돌아가기</button></div>`;
          $('[data-back]', box)!.addEventListener('click', () => { closeConfirm(); save.focus(); });
          f.querySelectorAll('.err-msg').forEach((e) => e.remove()); // 앞선 시도에서 남은 오류 표시를 지운다
          f.querySelectorAll('[aria-invalid]').forEach((e) => e.removeAttribute('aria-invalid'));
          box.hidden = false;
          save.hidden = true;
          $('button', box)!.focus();
          return;
        }
        try {
          await api.patch(`/api/admin/items/${f.dataset.item}`, {
            handlingType: v('handlingType'), status: next, saleDeadline: v('saleDeadline'), pickupSchedule: pickup,
            publicNotice: notice, adminItemMemo: v('adminItemMemo').trim(), version: Number(f.dataset.version),
          });
          toast('저장되었습니다.', 'ok');
        } catch (e) { showError(e, f); }
        render(); // 성공·VERSION_CONFLICT 모두 최신 상태로 다시 불러온다
      });

      const kind = $<HTMLSelectElement>('[data-sms-kind]', f)!;
      const text = $<HTMLTextAreaElement>('[data-sms-text]', f)!;
      const fill = () => { text.value = smsText(a, it, kind.value as ItemStatus); };
      kind.addEventListener('change', fill);
      fill();
      $('[data-sms-copy]', f)!.addEventListener('click', () => void copyText(text));
      $<HTMLButtonElement>('[data-sms-send]', f)?.addEventListener('click', async (ev) => {
        const btn = ev.currentTarget as HTMLButtonElement;
        if (!confirm(`${a.phone} 번호로 이 문구를 보낼까요?`)) return;
        btn.disabled = true; // 두 번 눌러 같은 문자가 두 번 나가지 않게 한다
        try { await api.post(`/api/admin/items/${it.id}/sms`, { text: text.value }); toast('문자를 보냈습니다.', 'ok'); render(); }
        catch (e) { showError(e); btn.disabled = false; }
      });
    });

    const dlg = $<HTMLDialogElement>('#photoDlg')!;
    const big = $<HTMLImageElement>('img', dlg)!;
    let group: HTMLAnchorElement[] = [], at = 0, opener: HTMLElement | null = null;
    const show = (i: number) => {
      at = (i + group.length) % group.length;
      big.src = group[at]!.href;
      big.alt = group[at]!.querySelector('img')!.alt;
      $('#photoCap', dlg)!.textContent = `${big.alt} · ${at + 1} / ${group.length}`;
    };
    document.querySelectorAll<HTMLAnchorElement>('a[data-photo]').forEach((link) => link.addEventListener('click', (ev) => {
      if (ev.ctrlKey || ev.metaKey || ev.shiftKey) return; // 새 탭으로 열려는 클릭은 그대로 둔다
      ev.preventDefault();
      opener = link;
      group = [...link.parentElement!.querySelectorAll<HTMLAnchorElement>('a[data-photo]')];
      dlg.querySelectorAll<HTMLElement>('[data-step]').forEach((b) => { b.hidden = group.length < 2; });
      show(group.indexOf(link));
      dlg.showModal();
    }));
    dlg.addEventListener('click', (ev) => {
      const t = ev.target as HTMLElement;
      if (t === dlg || t.closest('[data-close]')) dlg.close(); // 대화상자 바깥(배경)을 눌러도 닫는다
      else if (t.closest<HTMLElement>('[data-step]')) show(at + Number(t.closest<HTMLElement>('[data-step]')!.dataset.step));
    });
    dlg.addEventListener('keydown', (ev) => { if (group.length > 1 && (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight')) show(at + (ev.key === 'ArrowLeft' ? -1 : 1)); });
    dlg.addEventListener('close', () => opener?.focus()); // Safari는 링크에 포커스를 주지 않아 직접 돌려준다
    const m = $<HTMLFormElement>('#memoForm')!;
    m.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { await api.patch(`/api/admin/applications/${id}`, { adminMemo: (m.elements.namedItem('adminMemo') as HTMLInputElement).value, version: a.version }); toast('메모가 저장되었습니다.', 'ok'); }
      catch (e) { showError(e, m); }
      render();
    });
  };
  return `<main class="main"><div class="main-inner">
    <a href="#dashboard" class="btn ghost sm">← 목록</a>
    <div class="gd-cards"><section class="card"><h1 class="page-title tabular">${esc(a.requestCode)}</h1>
      <p>${esc(a.applicantName)} · <a href="tel:${esc(a.phone)}">${esc(a.phone)}</a><br>${esc(a.zipcode)} ${esc(a.address)} ${esc(a.addressDetail)}<br>
      이사일 ${esc(a.movingDate)} · 희망 반출일 ${esc(a.preferredPickupDate)}</p>
      <p class="muted">고객 요청: ${esc(a.customerMemo) || '없음'}</p>
      <form id="memoForm" novalidate><div class="field"><label>운영 메모 (고객 비공개)</label><input name="adminMemo" value="${esc(a.adminMemo)}" maxlength="2000"></div><button class="btn outline sm">메모 저장</button></form></section>
    ${a.items.map((it) => itemForm(it, d.smsEnabled)).join('')}
    <section class="card gd-history"><h2 class="card-title">변경 이력</h2>
      ${d.history.map((h) => `<div>${esc(h.createdAt)} · ${esc(h.actorName)} · ${esc(HISTORY_LABEL[h.actionType] ?? h.actionType)} ${esc(h.note)}</div>`).join('')}</section></div>
    <dialog id="photoDlg" class="gd-lightbox" aria-label="사진 크게 보기"><div class="gd-lightbox-in">
      <img alt="">
      <div class="row"><button type="button" class="btn outline" data-step="-1">이전</button><button type="button" class="btn outline" data-step="1">다음</button>
        <span id="photoCap" class="small sp" aria-live="polite"></span><button type="button" class="btn primary" data-close autofocus>닫기</button></div>
    </div></dialog>
  </div></main>`;
}

// ---------- A-03 일정 캘린더 ----------
const KIND = {
  MOVING: { label: '이사일' },
  DEADLINE: { label: '판매 마감' },
  PICKUP: { label: '확정 반출' },
  CUSTOM: { label: '직접 추가' },
} as const;
const todayKst = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
const cal = { month: todayKst().slice(0, 7), selected: todayKst() };

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

async function scheduleView() {
  const { events } = await api.get<{ month: string; events: ScheduleCalendarEventDto[] }>(`/api/admin/schedule?month=${cal.month}`);
  const byDate = new Map<string, ScheduleCalendarEventDto[]>();
  for (const e of events) (byDate.get(e.date) ?? byDate.set(e.date, []).get(e.date)!).push(e);
  const [y, m] = cal.month.split('-').map(Number) as [number, number];
  const lead = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const today = todayKst();
  if (!cal.selected.startsWith(cal.month)) cal.selected = byDate.keys().next().value ?? `${cal.month}-01`;

  const cells = [
    ...Array.from({ length: lead }, () => '<div class="cal-cell cal-blank" aria-hidden="true"></div>'),
    ...Array.from({ length: days }, (_, i) => {
      const date = `${cal.month}-${String(i + 1).padStart(2, '0')}`;
      const evs = byDate.get(date) ?? [];
      const kinds = [...new Set(evs.map((e) => e.kind))];
      return `<button type="button" class="cal-cell${date === cal.selected ? ' sel' : ''}${date === today ? ' today' : ''}" data-date="${date}"
        aria-pressed="${date === cal.selected}">
        <span class="vh">${m}월 </span><span class="cal-n">${i + 1}</span><span class="vh">일${evs.length ? `, 일정 ${evs.length}건` : ''}</span>
        <span class="cal-dots" aria-hidden="true">${kinds.map((k) => `<i class="dot k-${k}"></i>`).join('')}${evs.length > 1 ? `<small>${evs.length}</small>` : ''}</span></button>`;
    }),
  ].join('');

  wire.fn = () => {
    document.querySelectorAll<HTMLElement>('[data-shift]').forEach((b) => b.addEventListener('click', () => { cal.month = shiftMonth(cal.month, Number(b.dataset.shift)); void render(); }));
    document.querySelectorAll<HTMLElement>('[data-date]').forEach((b) => b.addEventListener('click', () => { cal.selected = b.dataset.date!; void render(); }));
    $('#calToday')?.addEventListener('click', () => { cal.month = today.slice(0, 7); cal.selected = today; void render(); });
    const evForm = $<HTMLFormElement>('#evForm')!;
    evForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { await api.post('/api/admin/events', { date: cal.selected, title: (evForm.elements.namedItem('title') as HTMLInputElement).value }); toast('일정을 추가했습니다.', 'ok'); void render(); }
      catch (e) { showError(e, evForm); }
    });
    document.querySelectorAll<HTMLElement>('[data-ev-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm(`'${b.dataset.evTitle}' 일정을 지울까요?`)) return;
      try { await api.delete(`/api/admin/events/${b.dataset.evDel}`); toast('일정을 지웠습니다.', 'ok'); } catch (e) { showError(e); }
      void render();
    }));
  };

  const sel = byDate.get(cal.selected) ?? [];
  return `<main class="main"><div class="main-inner">
    <div class="cal-head">
      <button class="btn outline sm" data-shift="-1" aria-label="이전 달">←</button>
      <h1>${y}년 ${m}월</h1>
      <button class="btn outline sm" data-shift="1" aria-label="다음 달">→</button>
      <button class="btn ghost sm" id="calToday">오늘</button>
      <span class="sp"></span>
      <div class="cal-legend">${Object.entries(KIND).map(([k, v]) => `<span><i class="dot k-${k}"></i>${v.label}</span>`).join('')}</div>
    </div>
    <div class="cal-wrap">
      <section class="card"><div class="cal-grid" role="group" aria-label="${y}년 ${m}월 달력">
        ${['일', '월', '화', '수', '목', '금', '토'].map((d) => `<div class="cal-dow">${d}</div>`).join('')}${cells}</div></section>
      <aside class="card" aria-live="polite"><h2 class="card-title">${esc(cal.selected)}</h2>
        ${sel.length ? sel.map((e) => `<div class="cal-ev"><i class="dot k-${e.kind}"></i><div>
          <div class="small muted">${KIND[e.kind].label}</div>${e.kind === 'CUSTOM' ? `<span>${esc(e.label)}</span>` : `<a href="#detail/${e.applicationId}">${esc(e.label)}</a>
          <div class="small muted tabular">${esc(e.requestCode)}</div>`}</div>${e.kind === 'CUSTOM' ? `<button type="button" class="btn ghost sm" data-ev-del="${e.eventId}" data-ev-title="${esc(e.label)}">삭제</button>` : ''}</div>`).join('') : '<p class="muted small">이 날의 일정이 없습니다.</p>'}
        <form id="evForm" novalidate>
          <div class="field"><label>이 날에 일정 추가</label><input name="title" maxlength="100" required></div>
          <button class="btn outline sm">일정 추가</button></form>
      </aside>
    </div></div></main>`;
}

// ---------- 통계 ----------
// 위에서 아래로: 기간 → 핵심 숫자 → 방문 추이 → 접수 추이와 상태 → 종류와 처리 구분. 차트마다 아래에 같은 값의 표가 있다.
let statsPeriod: StatsPeriod = '30d';
const PERIODS: [StatsPeriod, string][] = [['7d', '7일'], ['30d', '30일'], ['12m', '12개월'], ['all', '전체']];
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];
const keyTitle = (k: string) => {
  const [y, m, d] = k.split('-');
  if (d) return `${y}년 ${Number(m)}월 ${Number(d)}일 (${WEEK[new Date(`${k}T00:00:00Z`).getUTCDay()]})`;
  return m ? `${y}년 ${Number(m)}월` : `${y}년`;
};
const keyTick = (k: string) => { const [y, m, d] = k.split('-'); return d ? `${Number(m)}/${Number(d)}` : m ? `${Number(m)}월` : `${y}`; };
const UNIT_WORD = { day: '일별', month: '월별', year: '연도별' } as const;
const STATUS_CLS: Record<ItemStatus, string> = { PENDING: 'o-1', IN_PROGRESS: 'o-2', SCHEDULED: 'o-3', COMPLETED: 'o-4', CANCELED: 'c-muted' };

/** 앞 기간과 비교한 변화. 색과 함께 글자로도 늘었는지 줄었는지 적는다 */
function delta(cur: number, prev: number | undefined) {
  if (prev === undefined) return '';
  if (!prev) return cur ? '<span class="delta">앞 기간 기록 없음</span>' : '<span class="delta">앞 기간과 같음</span>';
  const p = Math.round(((cur - prev) / prev) * 100);
  if (!p) return '<span class="delta">앞 기간과 같음</span>';
  return `<span class="delta ${p > 0 ? 'up' : 'down'}">${p > 0 ? '▲' : '▼'} ${Math.abs(p)}% <span class="vh">${p > 0 ? '늘었습니다' : '줄었습니다'}</span></span>`;
}

const statsHead = (busy = false) => `<div class="stats-head"><h1>통계</h1>
  <div class="seg" role="group" aria-label="기간">${PERIODS.map(([p, l]) => `<button type="button" class="btn sm${p === statsPeriod ? ' primary' : ' ghost'}" data-period="${p}" aria-pressed="${p === statsPeriod}"${busy ? ' disabled' : ''}>${l}</button>`).join('')}</div></div>`;

/** 불러오는 동안 같은 자리에 회색 틀을 보여 준다 */
const statsSkeleton = () => `<main class="main"><div class="main-inner" aria-busy="true">${statsHead(true)}
  <div class="kpis">${'<div class="card kpi"><i class="skel w40"></i><i class="skel big"></i><i class="skel w60"></i></div>'.repeat(4)}</div>
  <div class="card chart-card"><i class="skel w30"></i><i class="skel block"></i></div>
  <div class="gd-stat-grid">${'<div class="card chart-card"><i class="skel w40"></i><i class="skel block"></i></div>'.repeat(2)}</div>
  <span class="vh">통계를 불러오는 중입니다.</span></div></main>`;

async function statsView() {
  const s = await api.get<AdminStatsDto>(`/api/admin/stats?period=${statsPeriod}`);
  const unit = UNIT_WORD[s.unit];
  const cur = s.current, prev = s.previous ?? undefined;
  const kpi = (label: string, value: number, before: number | undefined, sub: string) => `<div class="card kpi"><span>${label}</span><b class="tabular">${value.toLocaleString('ko-KR')}</b>${delta(value, before)}<small>${sub}</small></div>`;
  const periodName = PERIODS.find(([p]) => p === s.period)![1];
  const range = s.period === 'all' ? '전체 기간' : `최근 ${periodName}`;
  // 표 보기: 차트와 같은 값
  const table = (head: string[], rows: (string | number)[][]) => `<details class="chart-table"><summary>표로 보기</summary><div class="tbl-wrap"><table class="tbl">
    <thead><tr>${head.map((h, i) => `<th${i ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead>
    <tbody>${rows.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="num tabular"' : ''}>${typeof c === 'number' ? c.toLocaleString('ko-KR') : esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
  const parts = (labels: Record<string, string>, data: Record<string, number>, cls: (k: string, i: number) => string): Part[] =>
    Object.entries(labels).map(([k, l], i) => ({ label: l, value: data[k] ?? 0, cls: cls(k, i) }));
  const statusParts = parts(STATUS_LABEL, s.byStatus, (k) => STATUS_CLS[k as ItemStatus]);
  const handlingParts = parts({ RESALE: HANDLING_LABEL.RESALE, DISPOSE: HANDLING_LABEL.DISPOSE, UNDECIDED: HANDLING_LABEL.UNDECIDED }, s.byHandling, (k) => ({ RESALE: 'c-1', DISPOSE: 'c-2', UNDECIDED: 'c-muted' })[k]!);
  const categoryParts = parts(CATEGORY_LABEL, s.byCategory, () => 'c-1');

  wire.fn = () => {
    document.querySelectorAll<HTMLElement>('[data-period]').forEach((b) => b.addEventListener('click', () => { statsPeriod = b.dataset.period as StatsPeriod; void render(); }));
    const keys = s.series.map((r) => r.key);
    xyChart($('#trafficChart')!, { kind: 'line', keys, tick: keyTick, title: keyTitle, label: `${unit} 방문자와 페이지뷰`,
      series: [{ name: '방문자', cls: 'c-1', values: s.series.map((r) => r.visitors) }, { name: '페이지뷰', cls: 'c-2', values: s.series.map((r) => r.pageviews) }] });
    xyChart($('#applyChart')!, { kind: 'bar', keys, tick: keyTick, title: keyTitle, label: `${unit} 접수 건수`,
      series: [{ name: '접수', cls: 'c-1', values: s.series.map((r) => r.applications) }] });
    donut($('#statusChart')!, statusParts, '품목');
    hbars($('#categoryChart')!, categoryParts);
    stack($('#handlingChart')!, handlingParts);
  };
  const seriesRows = [...s.series].reverse();
  return `<main class="main"><div class="main-inner">${statsHead()}
    <div class="kpis">
      ${kpi('방문자', cur.visitors, prev?.visitors, `${range} · 오늘 ${s.today.visitors.toLocaleString('ko-KR')}명`)}
      ${kpi('페이지뷰', cur.pageviews, prev?.pageviews, `${range} · 오늘 ${s.today.pageviews.toLocaleString('ko-KR')}회`)}
      ${kpi('접수', cur.applications, prev?.applications, `${range} · 누적 ${s.totals.applications.toLocaleString('ko-KR')}건`)}
      ${kpi('가구(품목)', cur.items, prev?.items, `${range} · 누적 ${s.totals.items.toLocaleString('ko-KR')}개`)}
    </div>
    <p class="stats-note muted small">${s.previous ? '▲▼는 바로 앞 같은 길이의 기간과 비교한 값입니다. ' : ''}회원 ${s.totals.members.toLocaleString('ko-KR')}명 · 보낸 문자 ${s.totals.smsSent.toLocaleString('ko-KR')}건 (누적)</p>

    <section class="card chart-card"><div class="chart-head"><h2>${unit} 방문 추이</h2>
      <ul class="chart-legend line"><li><i class="key line c-1"></i><span>방문자</span></li><li><i class="key line c-2"></i><span>페이지뷰</span></li></ul></div>
      <div id="trafficChart" class="chart"></div>
      <p class="muted small">방문자는 하루에 한 번만 셉니다(같은 기기·브라우저 기준). 여러 날을 묶으면 날마다 센 수를 더한 값입니다. 페이지뷰는 고객 화면을 연 횟수입니다.</p>
      ${table([s.unit === 'day' ? '날짜' : s.unit === 'month' ? '달' : '연도', '방문자', '페이지뷰'], seriesRows.map((r) => [keyTitle(r.key), r.visitors, r.pageviews]))}</section>

    <div class="gd-stat-grid">
      <section class="card chart-card"><div class="chart-head"><h2>${unit} 접수</h2></div>
        <div id="applyChart" class="chart"></div>
        ${table([s.unit === 'day' ? '날짜' : s.unit === 'month' ? '달' : '연도', '접수', '품목'], seriesRows.map((r) => [keyTitle(r.key), r.applications, r.items]))}</section>
      <section class="card chart-card"><div class="chart-head"><h2>품목 상태</h2><span class="muted small">${range} 접수분</span></div>
        <div id="statusChart" class="chart donut-wrap"></div>
        ${table(['상태', '품목 수'], statusParts.map((p) => [p.label, p.value]))}</section>
      <section class="card chart-card"><div class="chart-head"><h2>가구 종류</h2><span class="muted small">${range} 접수분</span></div>
        <div id="categoryChart" class="chart"></div>
        ${table(['종류', '품목 수'], categoryParts.map((p) => [p.label, p.value]))}</section>
      <section class="card chart-card"><div class="chart-head"><h2>처리 구분</h2><span class="muted small">${range} 접수분</span></div>
        <div id="handlingChart" class="chart"></div>
        ${table(['처리 구분', '품목 수'], handlingParts.map((p) => [p.label, p.value]))}</section>
    </div>
  </div></main>`;
}

// ---------- A-04s 설정 ----------
async function settingsView() {
  const c = await api.get<PublicConfig>('/api/public/config');
  wire.fn = () => {
    const siteForm = $<HTMLFormElement>('#siteForm')!;
    siteForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = (n: string) => (siteForm.elements.namedItem(n) as HTMLInputElement).value.trim();
      try { await api.patch('/api/admin/settings', { siteConfig: Object.fromEntries(SITE_FIELDS.map(([k]) => [k, v(k)])) }); toast('고객 화면 사업자 정보가 저장되었습니다.', 'ok'); }
      catch (e) { showError(e, siteForm); }
    });
    const pwForm = $<HTMLFormElement>('#pwForm')!;
    pwForm.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const v = (n: string) => (pwForm.elements.namedItem(n) as HTMLInputElement).value;
      pwForm.querySelectorAll('.err-msg').forEach((e) => e.remove());
      if (v('newPassword') !== v('confirmPassword')) {
        (pwForm.elements.namedItem('confirmPassword') as HTMLElement).insertAdjacentHTML('afterend', '<div class="err-msg" role="alert">새 비밀번호가 일치하지 않습니다.</div>');
        return;
      }
      try { await api.patch('/api/admin/settings', { currentPassword: v('currentPassword'), newPassword: v('newPassword') }); pwForm.reset(); toast('비밀번호가 변경되었습니다.', 'ok'); }
      catch (e) { showError(e, pwForm); }
    });
  };
  return `<main class="main"><div class="main-inner mid gd-cards">
    <form id="siteForm" class="card" novalidate><h1 class="page-title">고객 화면 사업자 정보</h1>
      <p class="muted small">고객 화면 아래쪽에 표시됩니다. 비워 둔 항목은 표시되지 않습니다.</p>
      <div class="grid2">${SITE_FIELDS.map(([k, l]) => `<div class="field"><label>${l}</label><input name="${k}" value="${esc(c[k])}" maxlength="200"></div>`).join('')}</div>
      <button class="btn primary">저장</button></form>
    <form id="pwForm" class="card" novalidate><h2 class="card-title">관리자 비밀번호 변경</h2>
      <div class="field"><label>현재 비밀번호</label><input name="currentPassword" type="password" autocomplete="current-password" required></div>
      <div class="grid2"><div class="field"><label>새 비밀번호 (8자 이상)</label><input name="newPassword" type="password" autocomplete="new-password" minlength="8" required></div>
      <div class="field"><label>새 비밀번호 확인</label><input name="confirmPassword" type="password" autocomplete="new-password" required></div></div>
      <button class="btn primary">비밀번호 변경</button></form>
  </div></main>`;
}
const SITE_FIELDS = [['companyName', '상호'], ['ceoName', '대표자'], ['bizNo', '사업자등록번호'], ['phone', '고객센터 전화'], ['hours', '운영 시간'], ['address', '사업장 주소']] as const;

async function render() {
  const hash = location.hash.slice(1);
  resetWire();
  try {
    let body: string;
    if (!loggedIn) body = loginView();
    else if (hash === 'schedule') body = nav() + (await scheduleView());
    else if (hash === 'settings') body = nav() + (await settingsView());
    else if (hash === 'stats') { app.innerHTML = nav() + statsSkeleton(); body = nav() + (await statsView()); }
    else if (hash.startsWith('detail/')) body = nav() + (await detailView(Number(hash.slice(7))));
    else body = nav() + (await dashboardView());
    app.innerHTML = body;
    decorate(app);
    wire.fn?.();
    $('#logout')?.addEventListener('click', async () => { await api.post('/api/admin/logout'); loggedIn = false; render(); });
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) { loggedIn = false; app.innerHTML = loginView(); decorate(app); wire.fn?.(); return; }
    showError(e);
  }
}

async function boot() {
  initTheme();
  registerServiceWorker();
  try { await api.get('/api/admin/applications?page=1'); loggedIn = true; } catch { loggedIn = false; } // 기존 세션 복원
  window.addEventListener('hashchange', render);
  void render();
}
void boot();




