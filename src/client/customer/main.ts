import { ApiError, api } from '../common/api.js';
import { $, decorate, logo, CATEGORY_LABEL, CONDITION_LABEL, ELEVATOR_LABEL, HANDLING_LABEL, PREFERENCE_LABEL, STATUS_LABEL, esc, fieldError, initTheme, themeButton, options, registerServiceWorker, showError, toast } from '../common/ui.js';
import type { ApplicationPayload, CustomerProfileDto, PublicApplicationDto, PublicConfig } from '../../shared/types.js';

import { privacy, terms } from './legal.js';

type Route = 'home' | 'apply' | 'complete' | 'lookup' | 'login' | 'signup' | 'my' | 'terms' | 'privacy';
const ROUTES: readonly string[] = ['apply', 'complete', 'lookup', 'login', 'signup', 'my', 'terms', 'privacy'];
const app = document.getElementById('app')!;
let config: PublicConfig | null = null;
let me: CustomerProfileDto | null = null;
let completedCode = '';

const route = (): Route => { const r = location.hash.slice(1); return ROUTES.includes(r) ? (r as Route) : 'home'; };
const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

const tbd = (s?: string) => (s && s !== '[TBD]' ? s : ''); // 미확정 값은 고객에게 보이지 않게 한다
const joinInfo = (...p: Array<[string, string | undefined]>) => p.filter(([, v]) => tbd(v)).map(([l, v]) => `${l}${esc(v)}`).join(' · ');

function shell(body: string) {
  const biz = joinInfo(['대표 ', config?.ceoName], ['사업자번호 ', config?.bizNo]);
  const contact = joinInfo(['고객센터 ', config?.phone], ['', config?.hours], ['', config?.address]);
  return `<header class="gd-site"><div class="gd-hd-inner">
      <a href="#home" class="gd-brand" aria-label="가구다방 홈">${logo(40)}</a>
      <nav aria-label="주 메뉴"><a class="btn ghost sm" href="#lookup">진행 조회</a>${me
        ? `<a class="btn ghost sm" href="#my">${esc(me.name)}님</a><button class="btn ghost sm" id="logoutBtn">로그아웃</button>`
        : '<a class="btn ghost sm" href="#login">로그인</a>'}${themeButton(true)}<a class="btn primary sm" href="#apply">가구 접수</a></nav>
    </div></header>
    <main class="main"><div class="main-inner">${body}</div></main>
    <footer class="gd-footer"><div class="gd-footer-in">
      <div><b>${esc(config?.companyName ?? '가구다방')}</b><p>이사 전 가구 위탁 판매 · 방문 수거</p>${biz ? `<p>${biz}</p>` : ''}${contact ? `<p>${contact}</p>` : ''}</div>
      <nav aria-label="약관"><a href="#terms">이용약관</a><a class="strong" href="#privacy">개인정보 처리방침</a></nav>
    </div></footer>`;
}
// 홈의 가구 종류 아이콘 (24 격자, 선 굵기 1.5, 색은 글자색을 따른다)
const KIND_ICON: Record<keyof typeof CATEGORY_LABEL, string> = {
  BED: '<path d="M3 18.5v-6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6M3 15.5h18M5.5 10.5V7.5A1.5 1.5 0 0 1 7 6h10a1.5 1.5 0 0 1 1.5 1.5v3M3 18.5V20M21 18.5V20"/>',
  SOFA: '<path d="M5.5 11V8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v3M6 18v1.5M18 18v1.5"/><path d="M3 13.2a1.7 1.7 0 0 1 3.4 0V15h11.2v-1.8a1.7 1.7 0 0 1 3.4 0V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-3.8Z"/>',
  DINING: '<rect x="2.5" y="7" width="19" height="3" rx="1"/><path d="M6 10v9.5M18 10v9.5"/>',
  CLOSET: '<rect x="5" y="3.5" width="14" height="15.5" rx="1.5"/><path d="M12 3.5V19M10 10.5v2M14 10.5v2M7.5 19v1.5M16.5 19v1.5"/>',
  DESK: '<rect x="2.5" y="6.5" width="19" height="3" rx="1"/><rect x="12" y="9.5" width="7" height="5"/><path d="M5 9.5v10M19 9.5v10M14.7 12h1.6"/>',
  ETC: '<rect x="6" y="13" width="12" height="2.5" rx=".8"/><path d="M8 3.5V13M16 3.5V13M8 6.5h8M8 9.5h8M7.5 15.5V20M16.5 15.5V20"/>',
};
const KINDS = Object.keys(KIND_ICON) as Array<keyof typeof KIND_ICON>;
const kindIcon = (paths: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

const home = () => `
  <section class="gd-hero">
    <div class="gd-hero-copy">
      <h1>이사 전 가구, <span>먼저 팔고 <span>남은 건 비워 드립니다</span></span></h1>
      <p>가구 사진과 이사일만 남기면 접수가 끝납니다. 팔 수 있는 가구는 이사 전까지 위탁 판매하고, 남은 가구는 약속한 날 방문해 수거합니다.</p>
      <div class="gd-hero-actions"><a class="btn primary lg" href="#apply">가구 접수하기</a><a class="btn outline lg" href="#lookup">진행 조회</a></div>
      <p class="gd-facts"><span>회원가입 없이 접수</span> · <span>한 번에 최대 20개 품목</span> · <span>PIN 4자리로 진행 조회</span></p>
    </div>
    <div class="gd-timeline-box">
      <h2>이사일에서 거꾸로 잡는 일정</h2>
      <p>판매 마감일과 희망 반출일은 모두 이사일 이전으로 잡습니다.</p>
      <ol class="gd-timeline">
        <li><div><b>접수</b><span>가구 사진, 상태, 이사일을 남깁니다.</span></div></li>
        <li><div><b>위탁 판매</b><span>판매 마감일까지 대신 판매합니다.</span></div></li>
        <li><div><b>방문 수거</b><span>팔리지 않은 가구는 약속한 반출일에 가져갑니다.</span></div></li>
        <li><div><b>이사일 <em>기준일</em></b><span>가구 걱정 없이 이사합니다.</span></div></li>
      </ol>
    </div>
  </section>
  <section class="gd-hsec">
    <div class="gd-hsec-head">
      <h2>침대부터 책상까지<br>접수할 수 있습니다</h2>
      <p class="gd-hsec-lead">한 번에 최대 20개까지 접수할 수 있습니다. 상태와 원하는 방식에 따라 위탁 판매 또는 처분으로 진행합니다.</p>
    </div>
    <ul class="gd-kinds">${KINDS.map((k) => `<li>${kindIcon(KIND_ICON[k])}${CATEGORY_LABEL[k]}${k === 'ETC' ? ' 가구' : ''}</li>`).join('')}</ul>
  </section>
  <section class="gd-hsec gd-waysec">
    <div class="gd-waysec-head">
      <h2>품목마다 처리 방식을<br>고를 수 있습니다</h2>
      <p class="gd-hsec-lead">접수할 때 가구별로 하나를 고릅니다.</p>
    </div>
    <figure class="gd-waysec-photo"><img src="/assets/photos/moving-sofa.jpg" alt="두 사람이 소파를 들어 옮기고 있다" width="1120" height="840" loading="lazy" decoding="async"></figure>
    <dl class="gd-ways">
      <div><dt>${PREFERENCE_LABEL.RESALE}</dt><dd>판매 마감일까지 대신 판매합니다. 마감일은 이사일 이전으로 정합니다.</dd></div>
      <div><dt>${PREFERENCE_LABEL.DISPOSE}</dt><dd>판매하지 않고, 약속한 반출일에 방문해 수거합니다.</dd></div>
      <div><dt>${PREFERENCE_LABEL.CONSULT}</dt><dd>사진과 상태를 확인한 담당자와 상의해 정합니다.</dd></div>
    </dl>
  </section>
  <section class="gd-hsec">
    <h2>자주 묻는 질문</h2>
    <dl class="gd-qa">
      <div><dt>회원가입을 해야 하나요?</dt><dd>아니요. 접수할 때 정한 PIN 4자리와 접수번호(또는 연락처)로 진행 상황을 조회합니다. 회원으로 가입하면 접수 내역을 한곳에서 볼 수 있습니다.</dd></div>
      <div><dt>접수한 뒤에 취소할 수 있나요?</dt><dd>모든 품목이 ‘${STATUS_LABEL.PENDING}’ 상태일 때는 진행 조회 화면에서 직접 취소할 수 있습니다. 그 뒤에는 고객센터로 문의해 주세요.</dd></div>
      <div><dt>판매 마감일은 누가 정하나요?</dt><dd>이사일과 희망 반출일을 보고 담당자가 품목별로 정합니다. 정해진 날짜는 진행 조회 화면에서 확인할 수 있습니다.</dd></div>
      <div><dt>한 번에 몇 개까지 접수할 수 있나요?</dt><dd>1개부터 20개까지 접수할 수 있습니다. 품목마다 사진을 올리고 처리 방식을 따로 고를 수 있습니다.</dd></div>
    </dl>
  </section>
  <section class="gd-closing">
    <div>
      <h2>이사 날짜가 정해졌다면 지금 접수해 두세요</h2>
      <p>가구 사진과 이사일만 있으면 됩니다.</p>
    </div>
    <a class="btn lg" href="#apply">가구 접수하기</a>
  </section>`;

// ---- FN-05: 회전 보정 + 장변 1440px JPEG 압축 ----
async function compress(file: File): Promise<File> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const s = Math.min(1, 1440 / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * s); c.height = Math.round(bmp.height * s);
    c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise<Blob | null>((r) => c.toBlob(r, 'image/jpeg', 0.85));
    return blob ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; } // 디코딩 실패 시 원본 → 서버가 매직바이트로 판정
}

const MAX_PHOTOS = 6; // 가구 하나에 올리는 사진 수
const itemBlock = (i: number) => `
  <fieldset class="gd-item" data-item="${i}">
    <legend>가구 ${i + 1}</legend>
    <div class="grid2">
      <div class="field"><label>종류</label><select name="category">${options(CATEGORY_LABEL)}</select></div>
      <div class="field"><label>품목명</label><input name="itemName" maxlength="60" required placeholder="예: 3인용 패브릭 소파"></div>
      <div class="field"><label>상태</label><select name="conditionGrade">${options(CONDITION_LABEL, 'GOOD')}</select></div>
      <div class="field"><label>희망 처리</label><select name="customerPreference">${options(PREFERENCE_LABEL, 'CONSULT')}</select></div>
    </div>
    <div class="field"><label>메모(선택)</label><input name="itemNote" maxlength="500"></div>
    <div class="field">
      <span class="gd-photos-label">사진 <small>1~${MAX_PHOTOS}장 · 첫 장은 가구 전체가 보이게 찍어 주세요</small></span>
      <label class="btn outline sm gd-file"><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple>사진 고르기</label>
      <div class="gd-thumbs gd-photo-row" aria-live="polite"></div>
    </div>
    <div class="gd-item-foot"><button type="button" class="btn ghost sm" data-remove aria-label="가구 ${i + 1} 삭제">이 가구 삭제</button></div>
  </fieldset>`;

function apply() {
  const min = today();
  queueMicrotask(wireApply);
  return `<form id="applyForm" class="gd-form" novalidate>
    <h1>가구 접수</h1>
    <p class="muted">사진과 이사일만 있으면 됩니다. 접수 후 조회용 PIN으로 진행 상황을 확인할 수 있어요. ‘(선택)’ 표시가 없는 칸은 꼭 입력해 주세요.</p>
    <section class="gd-sec"><h2>신청자</h2>
      <div class="grid2">
        <div class="field"><label>이름</label><input name="applicantName" value="${esc(me?.name)}" maxlength="50" required></div>
        <div class="field"><label>휴대폰 번호</label><input name="phone" value="${esc(me?.phone)}" inputmode="tel" placeholder="010-0000-0000" required></div>
        <div class="field"><label>조회용 PIN (숫자 4자리)</label><input name="pin" inputmode="numeric" maxlength="4" pattern="\\d{4}" autocomplete="off" aria-describedby="pinHint" required><p id="pinHint">접수 내역을 조회할 때 씁니다. 잊지 않게 기억해 두세요.</p></div>
      </div></section>
    <section class="gd-sec"><h2>수거 장소</h2>
      <div class="grid2">
        <div class="field"><label>수거 주소</label><div class="gd-addr-row"><input name="address" value="${esc(me?.defaultAddress)}" maxlength="200" required><button type="button" class="btn outline" id="addrSearch" aria-expanded="false" aria-controls="addrLayer">주소 검색</button></div></div>
        <div class="field"><label>상세 주소(선택)</label><input name="addressDetail" value="${esc(me?.defaultAddressDetail)}" maxlength="100"></div>
        <div class="field"><label>우편번호(선택)</label><input name="zipcode" value="${esc(me?.defaultZipcode)}" maxlength="10"></div>
        <div class="field"><label>엘리베이터</label><select name="elevatorInfo">${options(ELEVATOR_LABEL)}</select></div>
      </div>
      <div id="addrLayer" class="gd-addr-layer" hidden></div></section>
    <section class="gd-sec"><h2>일정</h2>
      <div class="grid2">
        <div class="field"><label>이사일</label><input name="movingDate" type="date" min="${min}" required></div>
        <div class="field"><label>희망 반출일 (이사일 이전)</label><input name="preferredPickupDate" type="date" min="${min}" required></div>
      </div></section>
    <section class="gd-sec"><h2>맡길 가구</h2>    <div id="items">${itemBlock(0)}</div>
    <button type="button" class="btn outline" id="addItem">가구 추가</button></section>
    <section class="gd-sec"><h2>요청과 동의</h2>
    <div class="field"><label>요청 사항(선택)</label><input name="customerMemo" maxlength="1000"></div>
    <div class="field"><label class="check"><input type="checkbox" name="privacyConsented"> <span><a href="#privacy" target="_blank" rel="noopener">개인정보 수집·이용</a>에 동의합니다 (필수)</span></label></div>
    <div class="field"><label class="check"><input type="checkbox" name="marketingConsented"> 이벤트·혜택 안내 수신에 동의합니다 (선택)</label></div></section>
    <button class="btn primary lg block" id="submitBtn">접수하기</button>
  </form>`;
}

// 주소 검색: 카카오(다음) 우편번호 서비스를 누를 때만 불러온다. 불러오지 못하면 직접 입력으로 계속할 수 있다.
declare const daum: { Postcode: new (o: { width: string; height: string; oncomplete: (d: { zonecode: string; roadAddress: string; jibunAddress: string }) => void }) => { embed: (el: HTMLElement) => void } };
const loadPostcode = () => new Promise<void>((ok, fail) => {
  if ('daum' in window) return ok();
  const s = document.createElement('script');
  s.src = 'https://t1.kakaocdn.net/mapjsapi/bundle/postcode/prod/postcode.v2.js'; // t1.daumcdn.net은 2026-11-30 종료 안내가 있어 새 주소를 쓴다
  s.onload = () => ok();
  s.onerror = () => { s.remove(); fail(new Error('postcode script failed')); };
  document.head.appendChild(s);
});

function wireApply() {
  const form = $<HTMLFormElement>('#applyForm');
  if (!form) return;
  const items = $('#items')!;
  $('#addItem')!.addEventListener('click', () => {
    if (items.children.length >= 20) return toast('품목은 최대 20개입니다.', 'bad');
    items.insertAdjacentHTML('beforeend', itemBlock(items.children.length));
    decorate(items);
    items.lastElementChild!.querySelector<HTMLElement>('[name="itemName"]')!.focus();
  });
  items.addEventListener('click', (ev) => {
    const btn = (ev.target as Element).closest('[data-remove]');
    if (!btn) return;
    btn.closest('[data-item]')!.remove();
    [...items.children].forEach((b, i) => { // 남은 가구 번호를 다시 매긴다
      (b as HTMLElement).dataset.item = String(i);
      b.querySelector('legend')!.textContent = `가구 ${i + 1}`;
      b.querySelector('[data-remove]')!.setAttribute('aria-label', `가구 ${i + 1} 삭제`);
    });
  });
  items.addEventListener('change', (ev) => {
    const input = ev.target as HTMLInputElement;
    if (input.type !== 'file') return;
    const files = [...(input.files ?? [])];
    const box = input.closest('.field')!.querySelector<HTMLElement>('.gd-thumbs')!;
    box.querySelectorAll('img').forEach((im) => URL.revokeObjectURL(im.src));
    box.innerHTML = files.slice(0, MAX_PHOTOS).map((f) => `<img src="${URL.createObjectURL(f)}" alt="${esc(f.name)}" width="72" height="72">`).join('')
      + (files.length ? `<span>${Math.min(files.length, MAX_PHOTOS)}장 선택${files.length > MAX_PHOTOS ? ` · 앞의 ${MAX_PHOTOS}장만 접수됩니다` : ''}</span>` : '');
    if (files.length > MAX_PHOTOS) toast(`사진은 가구 하나에 ${MAX_PHOTOS}장까지 올릴 수 있습니다.`, 'info');
  });
  const layer = $('#addrLayer')!;
  const searchBtn = $('#addrSearch')!;
  const closeLayer = () => { layer.hidden = true; layer.replaceChildren(); searchBtn.setAttribute('aria-expanded', 'false'); };
  searchBtn.addEventListener('click', async () => {
    if (!layer.hidden) return closeLayer(); // 다시 누르면 닫는다
    try { await loadPostcode(); } catch { return toast('주소 검색을 불러오지 못했습니다. 주소를 직접 입력해 주세요.', 'bad'); }
    layer.hidden = false; searchBtn.setAttribute('aria-expanded', 'true');
    new daum.Postcode({ width: '100%', height: '100%', oncomplete: (d) => {
      (form.elements.namedItem('zipcode') as HTMLInputElement).value = d.zonecode;
      (form.elements.namedItem('address') as HTMLInputElement).value = d.roadAddress || d.jibunAddress;
      closeLayer();
      (form.elements.namedItem('addressDetail') as HTMLInputElement).focus();
    } }).embed(layer);
    layer.scrollIntoView({ block: 'nearest' }); // 좁은 화면에서는 검색창이 버튼보다 아래에 열리므로 보이게 옮긴다
  });
  const idemKey = crypto.randomUUID(); // 더블클릭·재시도에도 동일 키 → 서버가 1건만 생성
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = $<HTMLButtonElement>('#submitBtn')!;
    const val = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value.trim();
    const blocks = [...items.querySelectorAll<HTMLElement>('[data-item]')];
    const payload: ApplicationPayload = {
      applicantName: val('applicantName'), phone: val('phone'), pin: val('pin'), zipcode: val('zipcode'), address: val('address'),
      addressDetail: val('addressDetail'), elevatorInfo: val('elevatorInfo') as ApplicationPayload['elevatorInfo'], movingDate: val('movingDate'),
      preferredPickupDate: val('preferredPickupDate'), customerMemo: val('customerMemo'),
      privacyConsented: (form.elements.namedItem('privacyConsented') as HTMLInputElement).checked,
      marketingConsented: (form.elements.namedItem('marketingConsented') as HTMLInputElement).checked,
      items: blocks.map((b) => {
        const g = (n: string) => (b.querySelector(`[name="${n}"]`) as HTMLInputElement).value.trim();
        return { category: g('category'), itemName: g('itemName'), conditionGrade: g('conditionGrade'), customerPreference: g('customerPreference'), itemNote: g('itemNote') } as ApplicationPayload['items'][number];
      }),
    };
    btn.disabled = true;
    try {
      const fd = new FormData();
      for (const [i, b] of blocks.entries()) {
        const files = [...(b.querySelector<HTMLInputElement>('input[type=file]')!.files ?? [])].slice(0, MAX_PHOTOS);
        const tags: ('FULL' | 'DETAIL')[] = [];
        for (const [j, f] of files.entries()) { fd.append(`photos_${i}`, await compress(f)); tags.push(j === 0 ? 'FULL' : 'DETAIL'); }
        payload.items[i]!.photoTags = tags;
      }
      fd.set('payload', JSON.stringify(payload));
      const out = await api.post<{ requestCode: string }>('/api/applications', fd, { headers: { 'Idempotency-Key': idemKey } });
      completedCode = out.requestCode;
      location.hash = '#complete';
    } catch (e) {
      showError(e, form);
      // 품목 오류(items.N, items.N.photos)는 같은 이름의 입력칸이 없으므로 해당 가구 칸에 직접 붙인다.
      if (e instanceof ApiError) for (const [k, msg] of Object.entries(e.fieldErrors ?? {})) {
        const m = /^items\.(\d+)(\.photos)?$/.exec(k);
        const target = m && blocks[Number(m[1])]?.querySelector<HTMLInputElement>(m[2] ? 'input[type=file]' : '[name="itemName"]');
        if (m && target) fieldError(target, m[2] || target.value.trim() ? msg : '품목명을 입력해 주세요.');
      }
      form.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      btn.disabled = false;
    }
  });
}

const complete = () => `<section class="card gd-page gd-done">
  <h1 class="page-title">접수가 완료되었습니다</h1>
  ${completedCode ? `<p>접수번호 <strong class="tabular gd-code">${esc(completedCode)}</strong></p>` : ''}
  <p class="muted">접수번호(또는 연락처)와 설정하신 PIN 4자리로 진행 상황을 조회할 수 있습니다.</p>
  <a class="btn primary" href="#lookup">진행 조회하기</a></section>`;

function renderLookupResult(a: PublicApplicationDto) {
  const allPending = a.items.every((i) => i.status === 'PENDING');
  return `<article class="card gd-result">
    <h2 class="card-title tabular">${esc(a.requestCode)}</h2>
    <p class="muted small">이사일 ${esc(a.movingDate)} · 희망 반출일 ${esc(a.preferredPickupDate)}</p>
    ${a.items.map((i) => `<div class="gd-result-item">
      <strong>${esc(i.itemName)}</strong> <span class="muted small">${esc(CATEGORY_LABEL[i.category])} · ${esc(HANDLING_LABEL[i.handlingType])}</span>
      <div><b>${STATUS_LABEL[i.status]}</b>${i.saleDeadline ? ` · 판매 마감 ${esc(i.saleDeadline)}` : ''}${i.pickupSchedule ? ` · 반출 ${esc(i.pickupSchedule)}` : ''}</div>
      <div class="muted small">${esc(i.publicNotice)}</div>
      <div class="gd-photo-row">${i.photos.map((p) => `<img src="${esc(p.url)}" alt="${esc(i.itemName)} 사진" width="72" height="72" loading="lazy">`).join('')}</div>
    </div>`).join('')}
    ${allPending ? `<button class="btn danger sm" data-cancel="${esc(a.requestCode)}">신청 취소</button>` : ''}
  </article>`;
}

function lookup() {
  queueMicrotask(() => {
    const form = $<HTMLFormElement>('#lookupForm')!;
    const out = $('#lookupOut')!;
    const load = async (identifier: string, pin: string) => {
      try {
        const r = await api.post<{ applications: PublicApplicationDto[] }>('/api/applications/lookup', { identifier, pin });
        out.innerHTML = r.applications.map(renderLookupResult).join('');
        out.querySelectorAll<HTMLButtonElement>('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
          if (!confirm('이 신청을 취소할까요?')) return;
          try { await api.post(`/api/applications/${b.dataset.cancel}/cancel`, { pin }); toast('신청이 취소되었습니다.', 'ok'); await load(identifier, pin); }
          catch (e) { showError(e); await load(identifier, pin); }
        }));
      } catch (e) { out.innerHTML = ''; showError(e, form); }
    };
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const v = (n: string) => (form.elements.namedItem(n) as HTMLInputElement).value.trim();
      void load(v('identifier'), v('pin'));
    });
  });
  return `<div class="gd-page"><form id="lookupForm" class="card" novalidate><h1 class="page-title">진행 조회</h1>
    <div class="grid2">
      <div class="field"><label>접수번호 또는 연락처</label><input name="identifier" placeholder="FR-20261126-001 또는 010…" required></div>
      <div class="field"><label>PIN 4자리</label><input name="pin" inputmode="numeric" maxlength="4" autocomplete="off" required></div>
    </div><button class="btn primary">조회</button></form><div id="lookupOut" aria-live="polite"></div></div>`;
}

// ---------- 회원: 로그인 · 가입 · 마이페이지 ----------
const formVal = (f: HTMLFormElement, n: string) => (f.elements.namedItem(n) as HTMLInputElement).value.trim();

async function afterAuth(user: CustomerProfileDto) { me = user; location.hash = '#my'; render(); }

function login() {
  queueMicrotask(() => {
    const f = $<HTMLFormElement>('#loginForm')!;
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try { await afterAuth((await api.post<{ user: CustomerProfileDto }>('/api/auth/login', { identifier: formVal(f, 'identifier'), password: (f.elements.namedItem('password') as HTMLInputElement).value })).user); }
      catch (e) { showError(e, f); }
    });
  });
  return `<form id="loginForm" class="card gd-auth" novalidate><h1 class="page-title">회원 로그인</h1>
    <div class="field"><label>휴대폰 번호 또는 아이디</label><input name="identifier" autocomplete="username" autocapitalize="none" spellcheck="false" required></div>
    <div class="field"><label>비밀번호</label><input name="password" type="password" autocomplete="current-password" required></div>
    <button class="btn primary block">로그인</button>
    <a class="btn outline block" href="#signup">회원가입</a>
    <p class="muted small">회원이 아니어도 <a href="#apply">바로 접수</a>할 수 있습니다.</p></form>`;
}

function signup() {
  queueMicrotask(() => {
    const f = $<HTMLFormElement>('#signupForm')!;
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      f.querySelectorAll('.err-msg').forEach((e) => e.remove());
      const pw = (f.elements.namedItem('password') as HTMLInputElement).value;
      if (pw !== (f.elements.namedItem('confirm') as HTMLInputElement).value) {
        (f.elements.namedItem('confirm') as HTMLElement).insertAdjacentHTML('afterend', '<div class="err-msg" role="alert">비밀번호가 일치하지 않습니다.</div>');
        return;
      }
      try {
        const out = await api.post<{ user: CustomerProfileDto }>('/api/auth/signup', {
          username: formVal(f, 'username'), name: formVal(f, 'name'), phone: formVal(f, 'phone'), password: pw,
          defaultZipcode: formVal(f, 'defaultZipcode'), defaultAddress: formVal(f, 'defaultAddress'), defaultAddressDetail: formVal(f, 'defaultAddressDetail'),
        });
        toast('가입되었습니다.', 'ok');
        await afterAuth(out.user);
      } catch (e) { showError(e, f); }
    });
  });
  return `<form id="signupForm" class="card gd-auth wide" novalidate><h1 class="page-title">회원가입</h1>
    <p class="muted small">가입하면 접수할 때 이름과 기본 수거지가 자동으로 채워지고, 접수 내역을 한곳에서 볼 수 있습니다.</p>
    <div class="field"><label>아이디</label><input name="username" autocomplete="username" autocapitalize="none" spellcheck="false" minlength="4" maxlength="20" aria-describedby="usernameHint" required>
      <p class="muted small" id="usernameHint">영문 소문자로 시작하는 영문 소문자·숫자 4~20자. 로그인할 때 휴대폰 번호 대신 쓸 수 있습니다.</p></div>
    <div class="grid2"><div class="field"><label>비밀번호 (8자 이상)</label><input name="password" type="password" autocomplete="new-password" minlength="8" required></div>
    <div class="field"><label>비밀번호 확인</label><input name="confirm" type="password" autocomplete="new-password" required></div>
    <div class="field"><label>이름</label><input name="name" autocomplete="name" maxlength="50" required></div>
    <div class="field"><label>휴대폰 번호</label><input name="phone" inputmode="tel" autocomplete="tel" placeholder="010-0000-0000" required></div></div>
    <h2 class="card-title">기본 수거지 (선택)</h2>
    <div class="grid2"><div class="field"><label>우편번호</label><input name="defaultZipcode" maxlength="10"></div>
    <div class="field"><label>주소</label><input name="defaultAddress" maxlength="200"></div></div>
    <div class="field"><label>상세 주소</label><input name="defaultAddressDetail" maxlength="100"></div>
    <button class="btn primary block">가입하기</button>
    <p class="muted small">이미 회원이라면 <a href="#login">로그인</a>해 주세요.</p></form>`;
}

function myPage() {
  if (!me) { queueMicrotask(() => { location.hash = '#login'; }); return ''; }
  const user = me;
  queueMicrotask(() => {
    const list = $('#myList')!;
    const loadList = async () => {
      try {
        const r = await api.get<{ applications: PublicApplicationDto[] }>('/api/my/applications');
        list.innerHTML = r.applications.map(renderLookupResult).join('') || '<p class="muted">연결된 신청 내역이 없습니다. 비회원으로 접수한 건은 아래에서 연결할 수 있습니다.</p>';
        decorate(list);
        list.querySelectorAll<HTMLButtonElement>('[data-cancel]').forEach((b) => b.addEventListener('click', async () => {
          if (!confirm('이 신청을 취소할까요?')) return;
          try { await api.post(`/api/applications/${b.dataset.cancel}/cancel`, {}); toast('신청이 취소되었습니다.', 'ok'); }
          catch (e) { showError(e); }
          await loadList(); // 성공·TRANSITION_DENIED 모두 최신 상태로 갱신
        }));
      } catch (e) { showError(e); }
    };
    void loadList();

    const pf = $<HTMLFormElement>('#profileForm')!;
    pf.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        me = (await api.patch<{ user: CustomerProfileDto }>('/api/my/profile', {
          name: formVal(pf, 'name'), defaultZipcode: formVal(pf, 'defaultZipcode'), defaultAddress: formVal(pf, 'defaultAddress'), defaultAddressDetail: formVal(pf, 'defaultAddressDetail'),
        })).user;
        toast('내 정보가 저장되었습니다.', 'ok');
      } catch (e) { showError(e, pf); }
    });

    const cf = $<HTMLFormElement>('#claimForm')!;
    cf.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      try {
        const r = await api.post<{ claimedRequestCode: string }>('/api/my/claim', { requestCode: formVal(cf, 'requestCode'), pin: formVal(cf, 'pin') });
        toast(`${r.claimedRequestCode} 신청 건을 내 계정에 연결했습니다.`, 'ok');
        cf.reset();
        await loadList();
      } catch (e) { showError(e, cf); }
    });
  });
  return `<div class="gd-page wide"><h1 class="page-title">마이페이지</h1>
    <section><h2 class="card-title">내 신청 내역</h2><div id="myList" aria-live="polite"><p class="muted">불러오는 중…</p></div></section>
    <div class="gd-my-forms">
    <form id="claimForm" class="card" novalidate><h2 class="card-title">비회원 신청 건 연결</h2>
      <p class="muted small">로그인 전에 접수한 건의 접수번호와 PIN을 입력하면 내 계정에서 함께 볼 수 있습니다.</p>
      <div class="field"><label>접수번호</label><input name="requestCode" placeholder="FR-20261126-001" required></div>
      <div class="field"><label>PIN 4자리</label><input name="pin" inputmode="numeric" maxlength="4" autocomplete="off" required></div>
      <button class="btn outline">연결하기</button></form>
    <form id="profileForm" class="card" novalidate><h2 class="card-title">내 정보 · 기본 수거지</h2>
      <p class="muted small tabular">${user.username ? `아이디 ${esc(user.username)} · ` : ''}${esc(user.phone)}</p>
      <div class="field"><label>이름</label><input name="name" value="${esc(user.name)}" maxlength="50" required></div>
      <div class="grid2"><div class="field"><label>우편번호</label><input name="defaultZipcode" value="${esc(user.defaultZipcode)}" maxlength="10"></div>
      <div class="field"><label>주소</label><input name="defaultAddress" value="${esc(user.defaultAddress)}" maxlength="200"></div></div>
      <div class="field"><label>상세 주소</label><input name="defaultAddressDetail" value="${esc(user.defaultAddressDetail)}" maxlength="100"></div>
      <button class="btn primary">저장</button></form></div></div>`;
}

function render() {
  const views: Record<Route, () => string> = { home, apply, complete, lookup, login, signup, my: myPage, terms: () => terms(config), privacy: () => privacy(config) };
  app.innerHTML = shell(views[route()]());
  decorate(app);
  $('#logoutBtn')?.addEventListener('click', async () => {
    try { await api.post('/api/auth/logout'); } catch { /* 이미 만료 */ }
    me = null; location.hash = '#home'; render();
  });
  window.scrollTo(0, 0);
}

async function boot() {
  initTheme();
  registerServiceWorker();
  try { config = await api.get<PublicConfig>('/api/public/config'); } catch { /* 푸터 정보 없이 진행 */ }
  try { me = (await api.get<{ user: CustomerProfileDto | null }>('/api/auth/me')).user; } catch { /* 비회원 */ }
  window.addEventListener('hashchange', render);
  render();
}
void boot();
