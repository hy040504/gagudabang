/* 고객 웹: 해시로 화면을 바꾸고, 데이터는 store.js(GD)에서 읽는다. 관리자 웹에서 바꾼 내용은 storage 이벤트로 바로 반영된다. */
(function () {
  const { esc } = GD;
  const view = document.getElementById('view');
  const ROUTES = ['home', 'apply', 'lookup', 'notices'];
  let db = GD.load();
  const route = () => { const r = location.hash.slice(1).split('/')[0]; return ROUTES.includes(r) ? r : 'home'; };
  const toast = (msg) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.getElementById('toasts').append(t); setTimeout(() => t.remove(), 3200); };

  // ---------- 홈 ----------
  const hero = () => `
    <section class="hero">
      <div>
        <h1>이사 전 가구, <span>대신 비워 드립니다</span></h1>
        <p>사진과 이사일만 남기면 판매와 수거를 맡습니다.</p>
        <div class="actions"><a class="btn btn-primary" href="#apply">가구 접수하기</a><a class="btn btn-secondary" href="#lookup">진행 조회</a></div>
      </div>
      <div class="hero-photo"><img src="assets/photos/hero.jpg" alt="햇빛이 드는 거실에 회색 소파 두 개와 낮은 탁자가 놓인 모습" width="960" height="720" fetchpriority="high"></div>
    </section>`;
  // 일정 줄: 왼쪽이 오늘, 오른쪽 끝의 큰 점이 이사일. 날짜는 모두 이사일에서 거꾸로 정해진다.
  const STEPS = [['접수', '오늘 사진과 이사일을 남깁니다.'], ['위탁 판매', '담당자가 정한 마감일까지 대신 팝니다.'], ['방문 수거', '이사 전 약속한 날 남은 가구를 가져갑니다.'], ['이사일', '모든 날짜를 이날에서 거꾸로 잡습니다.']];
  const steps = () => `
    <section class="sec band">
      <h2>이사일에서 거꾸로 잡는 일정</h2>
      <ol class="steps">${STEPS.map(([t, d]) => `<li><b>${t}</b><p>${d}</p></li>`).join('')}</ol>
    </section>`;
  const kinds = () => `
    <section class="sec">
      <div class="sec-head"><h2>접수할 때 고르는 가구 종류</h2></div>
      <ul class="kinds">${db.categories.map((c) => `<li><a href="#apply/${esc(c.id)}"><img src="${esc(c.photo)}" alt="" loading="lazy" width="480" height="360"><b>${esc(c.name)}</b></a></li>`).join('')}</ul>
    </section>`;
  // 게시일이 된 공지만, 새 것부터 (게시일이 미래인 공지는 그날부터 보인다)
  const latestNotices = () => db.notices.filter((n) => n.date <= GD.today()).sort((a, b) => b.date.localeCompare(a.date));
  const FAQ_MAX = 5, NOTICE_PAGE = 20; // 홈의 질문은 5개까지 보이고 나머지는 접는다. 공지사항은 20건씩 보인다.
  const faqRow = (f) => `<details><summary>${esc(f.q)}${GD.sampleTag(f)}</summary><p class="multiline">${esc(f.a)}</p></details>`;
  const info = () => `
    <section class="sec two">
      <div>
        <div class="sec-head"><h2>공지사항</h2><a href="#notices">모두 보기</a></div>
        ${latestNotices().length ? `<ul class="rows">${latestNotices().slice(0, 3).map((n) => `<li><a href="#notices"><span>${esc(n.title)}${GD.sampleTag(n)}</span><time datetime="${esc(n.date)}">${GD.fmtDate(n.date)}</time></a></li>`).join('')}</ul>` : '<p class="empty">등록된 공지가 없습니다.</p>'}
      </div>
      <div>
        <div class="sec-head"><h2>자주 묻는 질문</h2></div>
        ${db.faqs.length ? `<div class="rows">${db.faqs.slice(0, FAQ_MAX).map(faqRow).join('')}${db.faqs.length > FAQ_MAX ? `<details class="fold"><summary>질문 ${db.faqs.length - FAQ_MAX}개 더 보기</summary>${db.faqs.slice(FAQ_MAX).map(faqRow).join('')}</details>` : ''}</div>` : '<p class="empty">등록된 질문이 없습니다.</p>'}
      </div>
    </section>`;
  const closing = () => `<section class="closing"><h2>이사 날짜가 정해졌다면 지금 접수해 두세요</h2><a class="btn btn-secondary" href="#apply">가구 접수하기</a></section>`;
  const home = () => hero() + steps() + kinds() + info() + closing();

  // ---------- 접수 ----------
  const state = { done: null, code: '', pin: '', confirm: false };
  let seq = 0;
  const field = (label, control, hint = '') => { const id = `f${++seq}`; return `<div class="field"><label for="${id}">${label}</label>${control.replace('class="input"', `class="input" id="${id}"`)}${hint ? `<span class="field-hint">${hint}</span>` : ''}</div>`; };
  const itemRow = (i) => `
    <fieldset class="item" data-item>
      <legend>가구 ${i + 1}</legend>
      <div class="grid2">
        ${field('종류', `<select class="input" name="category">${db.categories.map((c) => `<option value="${c.id}"${i === 0 && c.id === location.hash.split('/')[1] ? ' selected' : ''}>${esc(c.name)}</option>`).join('')}</select>`)}
        ${field('품목명', '<input class="input" name="itemName" maxlength="60" placeholder="예: 3인용 패브릭 소파…" autocomplete="off">')}
        ${field('상태', '<select class="input" name="condition"><option>상</option><option selected>중상</option><option>중</option><option>하(처분 희망)</option></select>')}
        ${field('희망 처리', '<select class="input" name="preference"><option>위탁 판매</option><option>단순 처분</option><option selected>상담 후 결정</option></select>')}
      </div>
      <div class="item-foot">
        <span class="file-row"><label class="btn btn-secondary btn-sm file"><input type="file" accept="image/*" multiple>사진 고르기</label><span class="field-hint" data-count>사진 없음</span></span>
        <button type="button" class="btn btn-secondary btn-sm" data-remove>이 가구 삭제</button>
      </div>
    </fieldset>`;
  const apply = () => (state.done ? `
    <div class="form done">
      <h1>접수가 완료되었습니다</h1>
      <p>접수번호</p><strong>${esc(state.done.code)}</strong>
      <p class="muted">이 번호와 직접 정한 PIN 4자리로 진행 상황을 조회합니다.</p>
      <div class="actions"><a class="btn btn-primary" href="#lookup">진행 조회</a><button type="button" class="btn btn-secondary" data-again>하나 더 접수</button></div>
    </div>` : `
    <form class="form" id="applyForm" novalidate>
      <h1>가구 접수</h1>
      <p class="lead">‘(선택)’ 표시가 없는 칸은 꼭 입력해 주세요.</p>
      <section class="fsec"><h2>신청자</h2><div class="grid2">
        ${field('이름', '<input class="input" name="name" maxlength="50" autocomplete="name">')}
        ${field('휴대폰 번호', '<input class="input" type="tel" name="phone" inputmode="tel" placeholder="010-0000-0000" autocomplete="tel">')}
        ${field('조회용 PIN', '<input class="input" name="pin" inputmode="numeric" maxlength="4" autocomplete="off">', '숫자 4자리. 진행 조회에 씁니다.')}
      </div></section>
      <section class="fsec"><h2>수거 장소와 일정</h2><div class="grid2">
        ${field('수거 주소', '<input class="input" name="address" maxlength="200" autocomplete="street-address">')}
        ${field('상세 주소 (선택)', '<input class="input" name="addressDetail" maxlength="100" autocomplete="address-line2">')}
        ${field('이사일', `<input class="input" type="date" name="movingDate" min="${GD.today()}">`)}
        ${field('희망 반출일', `<input class="input" type="date" name="pickupDate" min="${GD.today()}">`, '이사일과 같거나 그보다 앞선 날')}
      </div></section>
      <section class="fsec"><h2>맡길 가구</h2><div id="items">${itemRow(0)}</div><div><button type="button" class="btn btn-secondary" id="addItem">가구 추가</button></div></section>
      <section class="fsec"><label class="check"><input type="checkbox" name="agree"><span>접수에 필요한 이름, 연락처, 주소를 수집하고 이용하는 데 동의합니다.</span></label></section>
      <button class="btn btn-primary btn-block">접수하기</button>
    </form>`);

  // ---------- 진행 조회 ----------
  const found = () => db.applications.find((a) => a.code.toUpperCase() === state.code && a.pin === state.pin);
  const result = () => {
    if (!state.code && !state.pin) return '';
    const a = found();
    if (!a) return '<p class="empty">일치하는 접수가 없습니다. 접수번호와 PIN을 확인해 주세요.</p>';
    const allPending = a.items.every((it) => it.status === 'PENDING');
    return `
      <article class="card result">
        <h2><span class="nowrap" translate="no">${esc(a.code)}</span>${GD.sampleTag(a)}</h2>
        <p class="muted">이사일 ${GD.fmtDate(a.movingDate)}, 희망 반출일 ${GD.fmtDate(a.pickupDate)}</p>
        <ul class="items">${a.items.map((it) => `
          <li><img src="${esc(it.photo)}" alt="" width="96" height="72" loading="lazy">
            <div><p class="item-title"><b>${esc(it.name)}</b>${GD.badge(it.status)}</p>
              <p class="muted">${esc(GD.categoryName(db, it.category))}, ${esc(it.preference)}</p>
              ${it.saleDeadline ? `<p>판매 마감 ${GD.fmtDate(it.saleDeadline)}</p>` : ''}${it.pickupSchedule ? `<p>반출 ${GD.fmtDate(it.pickupSchedule)} ${esc(it.pickupSchedule.slice(11))}</p>` : ''}
              <p class="multiline">${esc(it.notice)}</p></div></li>`).join('')}</ul>
        ${!allPending ? '' : state.confirm
          ? '<div class="actions"><span>이 접수를 취소할까요?</span><button type="button" class="btn btn-secondary btn-sm is-danger" data-cancel-yes>취소 확정</button><button type="button" class="btn btn-secondary btn-sm" data-cancel-no>돌아가기</button></div>'
          : '<div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-cancel>접수 취소</button></div>'}
      </article>`;
  };
  const lookup = () => `
    <div class="form">
      <h1>진행 조회</h1>
      <form id="lookupForm" class="lookup-form" novalidate>
        ${field('접수번호', `<input class="input" name="code" placeholder="FR-00000000-000" value="${esc(state.code)}" autocapitalize="characters" autocomplete="off" spellcheck="false">`)}
        ${field('PIN', `<input class="input" name="pin" inputmode="numeric" maxlength="4" value="${esc(state.pin)}" autocomplete="off">`)}
        <button class="btn btn-primary">조회</button>
      </form>
      ${db.applications.some((a) => a.sample) ? `<p class="field-hint">샘플 접수번호 ${esc(db.applications.find((a) => a.sample).code)}, PIN 1234로 조회해 볼 수 있습니다.</p>` : ''}
      <div id="result" aria-live="polite">${result()}</div>
    </div>`;

  // ---------- 공지사항 ----------
  // 주소 #notices/40 은 40건까지 보인다는 뜻
  const notices = () => {
    const all = latestNotices(), n = Math.max(NOTICE_PAGE, Number(location.hash.split('/')[1]) || NOTICE_PAGE);
    return `
    <div class="form">
      <h1>공지사항</h1>
      ${all.length ? `<div class="rows notice-list">${all.slice(0, n).map((x) => `<details><summary>${esc(x.title)}${GD.sampleTag(x)} <time datetime="${esc(x.date)}">${GD.fmtDate(x.date)}</time></summary><p class="multiline">${esc(x.body)}</p></details>`).join('')}</div>
      ${all.length > n ? `<p class="more"><a class="btn btn-secondary" href="#notices/${n + NOTICE_PAGE}">${Math.min(NOTICE_PAGE, all.length - n)}건 더 보기</a><span class="muted">${all.length}건 가운데 ${n}건을 보고 있습니다.</span></p>` : ''}` : '<p class="empty">등록된 공지가 없습니다.</p>'}
    </div>`;
  };

  const views = { home, apply, lookup, notices };

  // ---------- 푸터 ----------
  const credits = window.GD_CREDITS ?? []; // assets/photos/credits.js
  function renderFoot() {
    const s = db.site;
    const biz = [s.ceo && `대표 ${esc(s.ceo)}`, s.bizNo && `사업자등록번호 ${esc(s.bizNo)}`].filter(Boolean).join(', ');
    const contact = [s.phone && `고객센터 ${esc(s.phone)}`, s.hours && esc(s.hours), s.address && esc(s.address)].filter(Boolean).join(', ');
    document.getElementById('foot').innerHTML = `
      <div><strong>${esc(s.company)}</strong><p>${esc(s.tagline)}</p>${biz ? `<p>${biz}</p>` : ''}${contact ? `<p>${contact}</p>` : ''}</div>
      <p>이 화면은 프로토타입입니다. ‘샘플’ 표시가 붙은 접수, 공지, 질문은 예시 데이터입니다. <a href="admin.html">관리자 화면 열기</a></p>
      ${credits.length ? `<details><summary>사진 출처 ${credits.length}건</summary><ul>${credits.map((c) => `<li>${esc(c.title)}, ${esc(c.artist)}, ${esc(c.license)}, <a href="${esc(c.page)}" rel="noopener" aria-label="${esc(c.title)} 원본 보기">원본</a></li>`).join('')}</ul></details>` : ''}`;
  }

  function render() {
    const r = route();
    dirty = false;
    view.innerHTML = views[r]();
    document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    renderFoot();
    wire[r]?.();
  }
  // 오류 문구를 입력칸과 연결한다: 화면 낭독기가 칸에 들어갈 때 문구를 함께 읽는다
  const setError = (el, msg) => { const m = document.createElement('p'); m.className = 'field-error'; m.id = `e${++seq}`; m.textContent = msg; el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', m.id); (el.closest('label.check') ?? el).after(m); };
  // 사진은 저장 공간을 아끼려고 긴 변 320px 썸네일 한 장만 남긴다
  const thumb = (file) => new Promise((ok) => {
    const im = new Image();
    im.onload = () => { const s = Math.min(1, 320 / Math.max(im.width, im.height)); const c = document.createElement('canvas'); c.width = im.width * s; c.height = im.height * s; c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); URL.revokeObjectURL(im.src); ok(c.toDataURL('image/jpeg', 0.7)); };
    im.onerror = () => ok('');
    im.src = URL.createObjectURL(file);
  });
  const wire = {
    apply() {
      view.querySelector('[data-again]')?.addEventListener('click', () => { state.done = null; render(); });
      const form = document.getElementById('applyForm');
      if (!form) return;
      const items = document.getElementById('items');
      document.getElementById('addItem').addEventListener('click', () => {
        if (items.children.length >= 20) return toast('가구는 한 번에 20개까지 접수할 수 있습니다.');
        items.insertAdjacentHTML('beforeend', itemRow(items.children.length));
        items.lastElementChild.querySelector('[name="itemName"]').focus();
      });
      items.addEventListener('click', (e) => {
        const b = e.target.closest('[data-remove]');
        if (!b) return;
        b.closest('[data-item]').remove();
        [...items.children].forEach((el, i) => { el.querySelector('legend').textContent = `가구 ${i + 1}`; });
      });
      items.addEventListener('change', (e) => { if (e.target.type === 'file') e.target.closest('.file-row').querySelector('[data-count]').textContent = e.target.files.length ? `사진 ${e.target.files.length}장 선택` : '사진 없음'; });
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        form.querySelectorAll('.field-error').forEach((n) => n.remove());
        form.querySelectorAll('[aria-invalid]').forEach((n) => { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); });
        const el = form.elements, v = (n) => el[n].value.trim(), t = GD.today(), mv = v('movingDate'), pk = v('pickupDate');
        if (!v('name')) setError(el.name, '이름을 입력해 주세요.');
        if (!/^01\d{8,9}$/.test(v('phone').replace(/\D/g, ''))) setError(el.phone, '휴대폰 번호를 확인해 주세요.');
        if (!/^\d{4}$/.test(v('pin'))) setError(el.pin, 'PIN은 숫자 4자리입니다.');
        if (!v('address')) setError(el.address, '수거 주소를 입력해 주세요.');
        if (!mv || mv < t) setError(el.movingDate, '이사일은 오늘 이후로 골라 주세요.');
        if (!pk || pk < t) setError(el.pickupDate, '희망 반출일은 오늘 이후로 골라 주세요.');
        else if (mv && pk > mv) setError(el.pickupDate, '희망 반출일은 이사일보다 늦을 수 없습니다.');
        const blocks = [...items.children];
        blocks.forEach((b) => { const n = b.querySelector('[name="itemName"]'); if (!n.value.trim()) setError(n, '품목명을 입력해 주세요.'); });
        if (!el.agree.checked) setError(el.agree, '동의가 필요합니다.');
        const bad = form.querySelector('[aria-invalid="true"]');
        if (bad) { bad.focus(); return toast('입력한 내용을 확인해 주세요.'); }
        const itemsData = await Promise.all(blocks.map(async (b) => {
          const g = (n) => b.querySelector(`[name="${n}"]`).value, f = b.querySelector('input[type="file"]').files[0], cat = g('category');
          return { id: GD.uid('i'), category: cat, name: g('itemName').trim(), condition: g('condition'), preference: g('preference'), status: 'PENDING', saleDeadline: '', pickupSchedule: '', notice: '신청이 접수되었습니다. 담당자가 사진과 일정을 확인하고 있습니다.', photo: (f && await thumb(f)) || db.categories.find((c) => c.id === cat).photo };
        }));
        const app = { id: GD.uid('a'), code: GD.nextCode(db), pin: v('pin'), name: v('name'), phone: v('phone'), address: v('address'), addressDetail: v('addressDetail'), elevator: '', movingDate: mv, pickupDate: pk, memo: '', createdAt: t, adminMemo: '', items: itemsData };
        db.applications.unshift(app);
        Object.assign(state, { done: { code: app.code }, code: app.code, pin: app.pin, confirm: false });
        GD.save(db); // 저장하면 화면이 다시 그려지고 완료 안내가 나온다
        window.scrollTo(0, 0);
      });
    },
    lookup() {
      const form = document.getElementById('lookupForm');
      form.addEventListener('submit', (e) => { e.preventDefault(); Object.assign(state, { code: form.elements.code.value.trim().toUpperCase(), pin: form.elements.pin.value.trim(), confirm: false }); render(); });
      view.querySelector('[data-cancel]')?.addEventListener('click', () => { state.confirm = true; render(); });
      view.querySelector('[data-cancel-no]')?.addEventListener('click', () => { state.confirm = false; render(); });
      view.querySelector('[data-cancel-yes]')?.addEventListener('click', () => {
        found().items.forEach((it) => { it.status = 'CANCELED'; it.notice = '고객 요청으로 취소되었습니다.'; });
        state.confirm = false; GD.save(db); toast('접수를 취소했습니다.');
      });
    },
  };

  // 쓰던 내용 지키기: 접수 폼에 입력이 있으면 다른 화면으로 가기 전에 묻고, 다른 탭(관리자)에서 데이터가 바뀌어도 다시 그리지 않는다
  let dirty = false, lastRoute = route(), restoring = false;
  const typing = () => dirty && !!document.getElementById('applyForm');
  view.addEventListener('input', () => { dirty = true; });
  window.addEventListener('hashchange', (e) => {
    if (restoring) { restoring = false; return; }
    const r = route();
    if (typing() && r === lastRoute) return; // 같은 접수 화면 안에서 주소만 바뀐 경우
    if (typing() && !confirm('작성 중인 접수 내용이 있습니다. 이 화면을 떠날까요?')) { restoring = true; location.replace(e.oldURL); return; }
    const moved = r !== lastRoute;
    lastRoute = r;
    if (r !== 'apply') state.done = null;
    render();
    if (moved) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); } // 같은 화면에서 "더 보기"를 누르면 보던 자리를 지킨다
  });
  window.addEventListener('beforeunload', (e) => { if (typing()) e.preventDefault(); });
  GD.on((next, remote) => { db = next; if (remote && dirty) return; render(); });
  GD.applyTheme();
  render();
})();
