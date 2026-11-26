/* 관리자 웹: 해시로 화면을 바꾸고, 데이터는 store.js(GD)로 읽고 쓴다. 저장하면 다른 탭의 고객 웹에 바로 반영된다.
 * 주소 예: #today, #apps?f=PENDING&q=김, #apps/new, #apps/a1, #apps/a1/edit, #schedule?m=2026-11&d=2026-11-28, #content/notice, #settings */
(function () {
  const { esc } = GD;
  const view = document.getElementById('view');
  let db = GD.load();
  const ui = { edit: null }; // 주소에 담지 않는 상태: 안내 관리에서 고치는 행
  let dirty = false; // 저장하지 않은 입력이 있는 동안에는 다른 탭의 변경으로 화면을 다시 그리지 않고, 화면을 떠나기 전에 묻는다
  const LEAVE = '저장하지 않은 변경이 있습니다. 이 화면을 떠날까요?';
  const toast = (msg) => { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.getElementById('toasts').append(t); setTimeout(() => t.remove(), 3200); };

  // ---------- 규칙과 계산 ----------
  // 상태 변경 규칙은 실제 앱(src/shared/types.ts의 TRANSITIONS)과 같다
  const NEXT = { PENDING: ['IN_PROGRESS', 'SCHEDULED', 'CANCELED'], IN_PROGRESS: ['SCHEDULED', 'COMPLETED', 'CANCELED'], SCHEDULED: ['IN_PROGRESS', 'COMPLETED', 'CANCELED'], COMPLETED: [], CANCELED: [] };
  const NOTICE = { PENDING: '신청이 접수되었습니다. 담당자가 사진과 일정을 확인하고 있습니다.', IN_PROGRESS: '위탁 판매를 진행하고 있습니다. 판매 마감일까지 팔리지 않으면 반출일에 수거합니다.', SCHEDULED: '반출 일정이 확정되었습니다. 당일 방문 전에 연락드립니다.', COMPLETED: '수거를 마쳤습니다. 이용해 주셔서 감사합니다.', CANCELED: '' };
  const CONDITIONS = ['상', '중상', '중', '하(처분 희망)'], PREFERENCES = ['위탁 판매', '단순 처분', '상담 후 결정'], ELEVATORS = [['', '확인 전'], '있음', '없음(계단)', '1층'];
  const SITE_FIELDS = [['company', '상호'], ['tagline', '소개 문구'], ['ceo', '대표자'], ['bizNo', '사업자등록번호'], ['phone', '고객센터 전화'], ['hours', '운영 시간']];
  const KIND = {
    faq: { label: '자주 묻는 질문', list: 'faqs', add: '질문 추가', ask: '이 질문을 삭제할까요?', none: '등록된 질문이 없습니다. 추가하면 고객 화면 홈에 나옵니다.' },
    notice: { label: '공지사항', list: 'notices', add: '공지 추가', ask: '이 공지를 삭제할까요?', none: '등록된 공지가 없습니다. 추가하면 고객 화면의 공지사항에 나옵니다.' },
  };
  const find = (id) => db.applications.find((a) => a.id === id);
  const isOpen = (a) => a.items.some((it) => NEXT[it.status].length > 0);
  const ddayText = (date) => { const n = GD.dday(date); return n === 0 ? 'D-day' : n > 0 ? `D-${n}` : `D+${-n}`; };
  const dueSoon = (it) => it.status === 'IN_PROGRESS' && !!it.saleDeadline && GD.dday(it.saleDeadline) <= 2;
  const pickupSoon = (it) => { if (it.status !== 'SCHEDULED' || !it.pickupSchedule) return false; const n = GD.dday(it.pickupSchedule.slice(0, 10)); return n >= 0 && n <= 7; };
  const byMoving = (a, b) => (isOpen(b) - isOpen(a)) || a.movingDate.localeCompare(b.movingDate); // 처리할 접수가 먼저, 그 안에서는 이사일이 가까운 순
  const FILTERS = {
    '': ['전체', () => true],
    ...Object.fromEntries(Object.entries(GD.STATUS).map(([k, v]) => [k, [v.label, (a) => a.items.some((it) => it.status === k)]])),
    moving3: ['이사일 3일 이내', (a) => isOpen(a) && GD.dday(a.movingDate) <= 3],
    deadline: ['판매 마감 임박', (a) => a.items.some(dueSoon)],
    pickup7: ['7일 내 반출 예정', (a) => a.items.some(pickupSoon)],
  };
  const parse = () => { const [path, qs = ''] = location.hash.slice(1).split('?'); const [name, a, b] = path.split('/'); return { name: VIEWS[name] ? name : 'today', a, b, q: new URLSearchParams(qs) }; };

  // ---------- 공통 조각 ----------
  let seq = 0;
  // 관리자가 넣는 값은 남의 정보라 브라우저 자동 완성을 끈다 (칸마다 명시해야 브라우저가 알아듣는다)
  const field = (label, control, hint = '') => { const id = `f${++seq}`; return `<div class="field"><label for="${id}">${label}</label>${control.replace('class="input"', `class="input" id="${id}"${control.includes('autocomplete=') ? '' : ' autocomplete="off"'}`)}${hint ? `<span class="field-hint">${hint}</span>` : ''}</div>`; };
  const sel = (name, opts, cur) => `<select class="input" name="${name}">${opts.map((o) => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
  // 오류 문구를 입력칸과 연결한다: 화면 낭독기가 칸에 들어갈 때 문구를 함께 읽는다
  const setError = (el, msg) => { const m = document.createElement('p'); m.className = 'field-error'; m.id = `e${++seq}`; m.textContent = msg; el.setAttribute('aria-invalid', 'true'); el.setAttribute('aria-describedby', m.id); el.after(m); };
  const clearErrors = (form) => { form.querySelectorAll('.field-error').forEach((n) => n.remove()); form.querySelectorAll('[aria-invalid]').forEach((n) => { n.removeAttribute('aria-invalid'); n.removeAttribute('aria-describedby'); }); };
  const invalid = (form) => { const bad = form.querySelector('[aria-invalid="true"]'); if (bad) { bad.focus(); toast('입력한 내용을 확인해 주세요.'); } return !!bad; };
  const empty = (msg, action = '') => `<div class="empty"><p>${msg}</p>${action}</div>`;
  const pageHead = (title, right = '', sub = '') => `<div class="page-head"><div><h1>${title}</h1>${sub ? `<p class="sub">${sub}</p>` : ''}</div>${right}</div>`;
  // 삭제는 한 번 더 묻는다: 버튼 자리에 확인 줄이 대신 나온다. 화면을 다시 그리지 않고 바꿔서 쓰던 내용이 남는다. 빨간 글자는 확정 버튼에만 쓴다.
  const del = (key, label, question, yes = '삭제 확정') => `<span class="confirm" data-confirm><button type="button" class="btn btn-secondary" data-ask>${label}</button><span class="confirm" role="group" aria-label="${question}" hidden><span>${question}</span><button type="button" class="btn btn-secondary is-danger" data-del="${key}">${yes}</button><button type="button" class="btn btn-secondary" data-back>돌아가기</button></span></span>`;
  const num = (n) => n.toLocaleString('ko-KR'); // 1284 → 1,284
  const QUEUE_MAX = 10, PAGE = 50; // 오늘 화면의 접수 줄은 가장 급한 10건, 접수 목록은 50건씩 그린다 (접수가 천 건을 넘어도 화면이 느려지지 않게)
  const statusSummary = (a) => Object.entries(GD.STATUS).map(([k, s]) => { const n = a.items.filter((it) => it.status === k).length; return n ? `<span class="badge is-${s.key}">${s.label}${n > 1 ? ` ${n}` : ''}</span>` : ''; }).join('');

  // ---------- 오늘 ----------
  function today() {
    const items = db.applications.flatMap((a) => a.items);
    const stats = [
      ['PENDING', '접수대기 품목', items.filter((it) => it.status === 'PENDING').length],
      ['moving3', '이사일 3일 이내 접수', db.applications.filter(FILTERS.moving3[1]).length],
      ['deadline', '판매 마감 임박 품목', items.filter(dueSoon).length],
      ['pickup7', '7일 내 반출 품목', items.filter(pickupSoon).length],
    ];
    const queue = db.applications.filter(isOpen).sort(byMoving);
    return `<div class="page">
      ${pageHead('오늘', '', new Intl.DateTimeFormat('ko-KR', { dateStyle: 'full', timeZone: 'Asia/Seoul' }).format(new Date()))}
      <ul class="stats">${stats.map(([f, label, n]) => `<li><a href="#apps?f=${f}"><b>${num(n)}</b><span>${label}</span></a></li>`).join('')}</ul>
      <section class="block">
        <h2>이사일이 가까운 접수</h2>
        ${queue.length ? `<ol class="queue">${queue.slice(0, QUEUE_MAX).map((a) => `<li><a href="#apps/${a.id}">
          <span class="dday${GD.dday(a.movingDate) < 0 ? ' is-late' : ''}">${ddayText(a.movingDate)}</span>
          <span><b>${esc(a.name)}</b>${GD.sampleTag(a)}<span class="sub">${esc(a.code)}</span></span>
          <span class="badges">${statusSummary(a)}</span>
          <span class="sub">이사일 ${GD.fmtDate(a.movingDate)}</span></a></li>`).join('')}</ol>${queue.length > QUEUE_MAX ? `<p class="more"><a class="btn btn-secondary" href="#apps">처리할 접수 ${num(queue.length)}건 모두 보기</a></p>` : ''}`
        : empty('처리할 접수가 없습니다. 새 접수가 들어오면 이사일이 가까운 순서로 여기에 나옵니다.', '<a class="btn btn-secondary" href="#apps/new">접수 추가</a>')}
      </section></div>`;
  }

  // ---------- 접수 목록 ----------
  function appsList(r) {
    const f = FILTERS[r.q.get('f') ?? ''] ?? FILTERS[''], q = (r.q.get('q') ?? '').trim().toLowerCase();
    if (!db.applications.length) return empty('아직 접수가 없습니다. 전화로 받은 접수는 직접 추가할 수 있습니다.', '<a class="btn btn-secondary" href="#apps/new">접수 추가</a>');
    const rows = db.applications.filter(f[1]).filter((a) => !q || [a.name, a.code, a.phone, ...a.items.map((it) => it.name)].join(' ').toLowerCase().includes(q)).sort(byMoving);
    if (!rows.length) return empty('조건에 맞는 접수가 없습니다.', '<a class="btn btn-secondary" href="#apps">조건 지우기</a>');
    const n = Math.max(PAGE, Number(r.q.get('n')) || PAGE), next = new URLSearchParams(r.q); next.set('n', n + PAGE);
    const more = rows.length > n ? `<p class="more"><a class="btn btn-secondary" href="#apps?${next}">${num(Math.min(PAGE, rows.length - n))}건 더 보기</a><span class="sub">${num(rows.length)}건 가운데 ${num(n)}건을 보고 있습니다.</span></p>` : '';
    return `<table class="table"><thead><tr><th scope="col">이사일</th><th scope="col">신청자</th><th scope="col">접수번호</th><th scope="col">품목</th><th scope="col">접수일</th></tr></thead><tbody>${rows.slice(0, n).map((a) => `
      <tr data-href="#apps/${a.id}">
        <td>${isOpen(a) ? `<b>${ddayText(a.movingDate)}</b> ` : ''}${GD.fmtDate(a.movingDate)}</td>
        <td><a href="#apps/${a.id}">${esc(a.name)}</a>${GD.sampleTag(a)}<br><span class="nowrap">${esc(a.phone)}</span></td>
        <td>${esc(a.code)}</td>
        <td><span class="badges">${statusSummary(a)}</span></td>
        <td>${GD.fmtDate(a.createdAt)}</td>
      </tr>`).join('')}</tbody></table>${more}`;
  }
  const apps = (r) => `<div class="page">
      ${pageHead('접수', '<a class="btn btn-primary" href="#apps/new">접수 추가</a>')}
      <form class="filter" id="filter" role="search" autocomplete="off">
        <select class="input" name="f" aria-label="조건" autocomplete="off">${Object.entries(FILTERS).map(([k, [label]]) => `<option value="${k}"${(r.q.get('f') ?? '') === k ? ' selected' : ''}>${label}</option>`).join('')}</select>
        <input class="input" type="search" name="q" value="${esc(r.q.get('q') ?? '')}" placeholder="이름, 접수번호, 연락처, 품목명…" aria-label="검색" autocomplete="off">
      </form>
      <div id="list">${appsList(r)}</div></div>`;

  // ---------- 접수 상세: 품목 처리 ----------
  const fmtAt = (iso) => new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Asia/Seoul' }).format(new Date(iso));
  const itemWork = (it) => {
    const closed = !NEXT[it.status].length;
    return `<li class="it" data-item="${it.id}">
      <div class="it-head"><img src="${esc(it.photo)}" alt="" width="72" height="54" loading="lazy"><div><p class="it-title"><b>${esc(it.name)}</b>${GD.badge(it.status)}</p><p class="sub">${esc(GD.categoryName(db, it.category))}, 상태 ${esc(it.condition)}, ${esc(it.preference)}</p></div></div>
      <div class="grid3">
        ${field('상태', `<select class="input" name="status"${closed ? ' disabled' : ''}>${[it.status, ...NEXT[it.status]].map((s) => `<option value="${s}">${GD.STATUS[s].label}</option>`).join('')}</select>`, closed ? '끝난 품목은 상태를 바꿀 수 없습니다.' : '')}
        ${field('판매 마감일', `<input class="input" type="date" name="saleDeadline" value="${esc(it.saleDeadline)}">`)}
        ${field('확정 반출 일시', `<input class="input" type="datetime-local" name="pickupSchedule" value="${esc(it.pickupSchedule.replace(' ', 'T'))}">`)}
      </div>
      ${field('고객에게 보이는 안내문', `<textarea class="input" name="notice" maxlength="500">${esc(it.notice)}</textarea>`)}
    </li>`;
  };
  function detail(a) {
    const info = [['이름', esc(a.name)], ['연락처', `<a href="tel:${esc(a.phone)}">${esc(a.phone)}</a>`], ['주소', esc([a.address, a.addressDetail].filter(Boolean).join(' '))], ['엘리베이터', esc(a.elevator || '확인 전')], ['이사일', GD.fmtDate(a.movingDate)], ['희망 반출일', GD.fmtDate(a.pickupDate)], ['고객 메모', esc(a.memo || '없음')]];
    return `<div class="page">
      <a class="back" href="#apps">접수 목록</a>
      ${pageHead(`${isOpen(a) ? `<span class="dday${GD.dday(a.movingDate) < 0 ? ' is-late' : ''}">${ddayText(a.movingDate)}</span> ` : ''}${esc(a.name)}${GD.sampleTag(a)}`, `<div class="row-actions"><a class="btn btn-secondary" href="#apps/${a.id}/edit">접수 정보 수정</a>${del(`app:${a.id}`, '접수 삭제', '이 접수를 삭제할까요?')}</div>`, `${esc(a.code)}, 접수일 ${GD.fmtDate(a.createdAt)}, 이사일 ${GD.fmtDate(a.movingDate)}, <a href="tel:${esc(a.phone)}">${esc(a.phone)}</a>`)}
      <form class="detail" id="work" novalidate autocomplete="off">
        <section><h2>품목 ${a.items.length}개</h2><ul class="its">${a.items.map(itemWork).join('')}</ul></section>
        <div>
          <section><h2>신청자</h2><dl class="info">${info.map(([k, v]) => `<dt>${k}</dt><dd class="multiline">${v}</dd>`).join('')}</dl></section>
          <section class="block">${field('내부 메모', `<textarea class="input" name="adminMemo" maxlength="1000">${esc(a.adminMemo)}</textarea>`, '고객에게는 보이지 않습니다.')}</section>
          <section class="block"><h2>변경 이력</h2>${(a.history ?? []).length ? `<ol class="history">${a.history.map((h) => `<li><time datetime="${esc(h.at)}">${fmtAt(h.at)}</time>${esc(h.text)}</li>`).join('')}</ol>` : '<p class="sub">아직 변경 이력이 없습니다. 품목 상태를 바꾸면 여기에 남습니다.</p>'}</section>
        </div>
        <div class="detail-foot"><button class="btn btn-primary">변경 저장</button><span class="sub" id="dirtyNote" hidden>저장하지 않은 변경이 있습니다.</span></div>
      </form></div>`;
  }

  // ---------- 접수 추가·수정 ----------
  const itemRow = (it, i) => `<fieldset class="item" data-item data-id="${it?.id ?? ''}"><legend>품목 ${i + 1}</legend>
      <div class="grid2">
        ${field('종류', sel('category', db.categories.map((c) => [c.id, c.name]), it?.category))}
        ${field('품목명', `<input class="input" name="itemName" maxlength="60" value="${esc(it?.name ?? '')}">`)}
        ${field('상태', sel('condition', CONDITIONS, it?.condition ?? '중상'))}
        ${field('희망 처리', sel('preference', PREFERENCES, it?.preference ?? '상담 후 결정'))}
      </div>
      <div class="item-foot"><span class="field-hint">${it ? `지금 ${GD.STATUS[it.status].label} 상태입니다.` : '저장하면 접수대기로 시작합니다.'}</span><button type="button" class="btn btn-secondary" data-remove>이 품목 삭제</button></div>
    </fieldset>`;
  function appForm(a) {
    const v = (k) => esc(a?.[k] ?? '');
    return `<div class="page">
      <a class="back" href="#apps${a ? `/${a.id}` : ''}">${a ? '접수 상세' : '접수 목록'}</a>
      ${pageHead(a ? `${esc(a.code)} 정보 수정` : '접수 추가', '', a ? '' : '전화나 방문으로 받은 접수를 직접 넣습니다. 접수번호는 저장할 때 만들어집니다.')}
      <form class="form" id="appForm" novalidate autocomplete="off">
        <section class="fsec"><h2>신청자</h2><div class="grid2">
          ${field('이름', `<input class="input" name="name" maxlength="50" value="${v('name')}">`)}
          ${field('연락처', `<input class="input" type="tel" name="phone" inputmode="tel" placeholder="010-0000-0000" value="${v('phone')}">`)}
          ${field(a ? '조회용 PIN 변경 (선택)' : '조회용 PIN', '<input class="input" name="pin" inputmode="numeric" maxlength="4" autocomplete="off">', a ? '비워 두면 바꾸지 않습니다.' : '숫자 4자리. 고객이 진행 조회에 씁니다.')}
        </div></section>
        <section class="fsec"><h2>수거 장소와 일정</h2><div class="grid2">
          ${field('수거 주소', `<input class="input" name="address" maxlength="200" value="${v('address')}">`)}
          ${field('상세 주소 (선택)', `<input class="input" name="addressDetail" maxlength="100" value="${v('addressDetail')}">`)}
          ${field('이사일', `<input class="input" type="date" name="movingDate" value="${v('movingDate')}">`)}
          ${field('희망 반출일', `<input class="input" type="date" name="pickupDate" value="${v('pickupDate')}">`, '이사일과 같거나 그보다 앞선 날')}
          ${field('엘리베이터', sel('elevator', ELEVATORS, a?.elevator ?? ''))}
        </div>
        ${field('고객 메모 (선택)', `<textarea class="input" name="memo" maxlength="500">${v('memo')}</textarea>`)}</section>
        <section class="fsec"><h2>품목</h2><div id="items">${(a?.items.length ? a.items : [null]).map(itemRow).join('')}</div><div><button type="button" class="btn btn-secondary" id="addItem">품목 추가</button></div></section>
        <div class="form-actions"><button class="btn btn-primary">${a ? '접수 정보 저장' : '접수 추가'}</button><a class="btn btn-secondary" href="#apps${a ? `/${a.id}` : ''}">취소</a></div>
      </form></div>`;
  }

  // ---------- 일정 ----------
  const TYPE = { move: ['이사일', '이사'], sale: ['판매 마감', '마감'], pickup: ['반출', '반출'] };
  const events = () => db.applications.flatMap((a) => [
    ...(isOpen(a) && a.movingDate ? [{ date: a.movingDate, time: '', type: 'move', id: a.id, text: a.name }] : []),
    ...a.items.flatMap((it) => (it.status === 'IN_PROGRESS' && it.saleDeadline ? [{ date: it.saleDeadline, time: '', type: 'sale', id: a.id, text: `${a.name}, ${it.name}` }]
      : it.status === 'SCHEDULED' && it.pickupSchedule ? [{ date: it.pickupSchedule.slice(0, 10), time: it.pickupSchedule.slice(11), type: 'pickup', id: a.id, text: `${a.name}, ${it.name}` }] : [])),
  ]);
  function schedule(r) {
    const t = GD.today(), m = /^\d{4}-\d{2}$/.test(r.q.get('m') ?? '') ? r.q.get('m') : t.slice(0, 7), d = r.q.get('d');
    const [y, mo] = m.split('-').map(Number), lead = new Date(y, mo - 1, 1).getDay(), days = new Date(y, mo, 0).getDate();
    const shift = (n) => { const x = new Date(y, mo - 1 + n, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
    const evs = events().filter((e) => e.date.startsWith(m)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    const mark = (type, n, long) => `<span class="mark is-${type}">${TYPE[type][long ? 0 : 1]}${n > 1 ? ` ${n}` : ''}</span>`;
    const cell = (n) => {
      if (!n) return '<td></td>';
      const iso = `${m}-${String(n).padStart(2, '0')}`, list = evs.filter((e) => e.date === iso);
      return `<td><a href="#schedule?m=${m}&d=${iso}"${iso === d ? ' aria-current="date"' : ''}${iso === t ? ' class="is-today"' : ''}<span class="day">${n}</span><span class="visually-hidden">일${iso === t ? ' 오늘' : ''}, 일정 ${list.length}건 </span>${Object.keys(TYPE).map((k) => { const c = list.filter((e) => e.type === k).length; return c ? mark(k, c) : ''; }).join('')}</a></td>`;
    };
    const cells = [...Array(lead).fill(0), ...Array.from({ length: days }, (_, i) => i + 1)];
    while (cells.length % 7) cells.push(0);
    const rows = []; for (let i = 0; i < cells.length; i += 7) rows.push(`<tr>${cells.slice(i, i + 7).map(cell).join('')}</tr>`);
    const shown = d ? evs.filter((e) => e.date === d) : evs;
    return `<div class="page">
      ${pageHead('일정', '', '이사일, 판매 마감, 반출을 날짜별로 봅니다. 끝난 품목은 나오지 않습니다.')}
      <div class="cal-head cal-nav"><h2>${y}년 ${mo}월</h2><a class="btn btn-secondary" href="#schedule?m=${shift(-1)}">이전 달</a><a class="btn btn-secondary" href="#schedule">이번 달</a><a class="btn btn-secondary" href="#schedule?m=${shift(1)}">다음 달</a></div>
      <table class="cal"><thead><tr>${['일', '월', '화', '수', '목', '금', '토'].map((w) => `<th scope="col">${w}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>
      <section class="block" aria-live="polite">
        <div class="cal-head"><h2>${d ? `${GD.fmtDate(d)} 일정` : `${mo}월 일정`} ${num(shown.length)}건</h2>${d ? `<a class="btn btn-secondary" href="#schedule?m=${m}">${mo}월 전체 보기</a>` : ''}</div>
        ${shown.length ? `<ul class="events">${shown.map((e) => `<li><span>${GD.fmtDate(e.date)}${e.time ? ` ${esc(e.time)}` : ''}</span>${mark(e.type, 1, true)}<a href="#apps/${e.id}">${esc(e.text)}</a></li>`).join('')}</ul>`
        : empty(d ? '이 날짜에는 일정이 없습니다.' : '이 달에는 일정이 없습니다. 접수 상세에서 판매 마감일이나 반출 일시를 넣으면 여기에 나옵니다.')}
      </section></div>`;
  }

  // ---------- 안내 관리: 자주 묻는 질문과 공지사항 ----------
  const contentForm = (kind, x) => `<form class="inline-form" id="contentForm" data-kind="${kind}" data-id="${x?.id ?? ''}" novalidate autocomplete="off">
      ${kind === 'faq'
        ? field('질문', `<input class="input" name="subject" maxlength="80" value="${esc(x?.q ?? '')}">`) + field('답변', `<textarea class="input" name="body" maxlength="400">${esc(x?.a ?? '')}</textarea>`)
        : `<div class="grid2">${field('제목', `<input class="input" name="subject" maxlength="80" value="${esc(x?.title ?? '')}">`)}${field('게시일', `<input class="input" type="date" name="date" value="${esc(x?.date ?? GD.today())}">`)}</div>${field('내용', `<textarea class="input" name="body" maxlength="600">${esc(x?.body ?? '')}</textarea>`)}`}
      <div class="row-actions"><button class="btn btn-primary">${kind === 'faq' ? '질문 저장' : '공지 저장'}</button><button type="button" class="btn btn-secondary" data-edit="">취소</button></div>
    </form>`;
  function content(r) {
    const kind = KIND[r.a] ? r.a : 'faq', k = KIND[kind];
    const list = kind === 'notice' ? [...db.notices].sort((a, b) => b.date.localeCompare(a.date)) : db.faqs;
    const shown = Math.max(20, Number(r.q.get('n')) || 20); // 20건씩 보인다 (주소의 n)
    const add = `<button type="button" class="btn btn-primary" data-edit="new">${k.add}</button>`;
    const row = (x) => (ui.edit === x.id ? `<li>${contentForm(kind, x)}</li>` : `<li>
        <div><b>${esc(x.q ?? x.title)}</b>${GD.sampleTag(x)}${x.date ? ` <time class="sub" datetime="${esc(x.date)}">${GD.fmtDate(x.date)}</time>${x.date > GD.today() ? ' <span class="badge is-pending">게시 예정</span>' : ''}` : ''}<p class="multiline">${esc(x.a ?? x.body)}</p></div>
        <div class="row-actions"><button type="button" class="btn btn-secondary" data-edit="${x.id}">수정</button>${del(`${kind}:${x.id}`, '삭제', k.ask)}</div></li>`);
    return `<div class="page">
      ${pageHead('안내 관리', ui.edit ? '' : add, '저장하면 고객 화면에 반영됩니다. 게시일이 미래인 공지는 그날부터 보입니다.')}
      <nav class="tabs" aria-label="안내 종류">${Object.entries(KIND).map(([id, v]) => `<a href="#content/${id}"${id === kind ? ' aria-current="page"' : ''}>${v.label} ${num(db[v.list].length)}</a>`).join('')}</nav>
      ${ui.edit === 'new' ? contentForm(kind, null) : ''}
      ${list.length ? `<ul class="crud">${list.slice(0, shown).map(row).join('')}</ul>${list.length > shown ? `<p class="more"><a class="btn btn-secondary" href="#content/${kind}?n=${shown + 20}">${num(Math.min(20, list.length - shown))}건 더 보기</a><span class="sub">${num(list.length)}건 가운데 ${num(shown)}건을 보고 있습니다.</span></p>` : ''}` : ui.edit === 'new' ? '' : empty(k.none)}
    </div>`;
  }

  // ---------- 설정 ----------
  const settings = () => `<div class="page">
      ${pageHead('설정')}
      <form class="form" id="siteForm" novalidate autocomplete="off">
        <h2>사업자 정보</h2>
        <p class="sub">고객 화면 아래쪽에 나옵니다. 비워 둔 항목은 나오지 않습니다.</p>
        <div class="fsec"><div class="grid2">${SITE_FIELDS.map(([k, label]) => field(label, `<input class="input" name="${k}" maxlength="80" value="${esc(db.site[k])}">`)).join('')}</div>
        ${field('주소', `<input class="input" name="address" maxlength="200" value="${esc(db.site.address)}">`)}</div>
        <div class="form-actions"><button class="btn btn-primary">사업자 정보 저장</button></div>
      </form>
      <section class="block form">
        <h2>샘플 데이터</h2>
        <p class="sub">추가하고 고친 내용을 모두 지우고 처음의 샘플 데이터로 되돌립니다. 접수, 공지, 질문, 사업자 정보가 모두 처음 상태가 됩니다.</p>
        <div class="form-actions">${del('reset', '샘플 데이터로 되돌리기', '지금까지 바꾼 내용이 모두 사라집니다.', '되돌리기 확정')}</div>
      </section></div>`;

  const notFound = () => `<div class="page">${empty('찾는 접수가 없습니다. 삭제되었거나 주소가 잘못되었습니다.', '<a class="btn btn-secondary" href="#apps">접수 목록</a>')}</div>`;
  const VIEWS = {
    today, schedule, content, settings,
    apps: (r) => { if (!r.a) return apps(r); if (r.a === 'new') return appForm(null); const a = find(r.a); return !a ? notFound() : r.b === 'edit' ? appForm(a) : detail(a); },
  };

  // ---------- 동작: 화면에 있는 폼의 id로 연결한다 ----------
  const wire = {
    filter(form) {
      const sync = () => {
        const p = new URLSearchParams(); if (form.elements.f.value) p.set('f', form.elements.f.value); if (form.elements.q.value.trim()) p.set('q', form.elements.q.value.trim());
        const qs = p.toString(); history.replaceState(null, '', `#apps${qs ? `?${qs}` : ''}`); // 조건은 주소에 남기고 목록만 새로 그린다
        document.getElementById('list').innerHTML = appsList(parse());
      };
      form.addEventListener('input', sync); form.addEventListener('submit', (e) => e.preventDefault());
    },
    work(form) {
      const get = (li, n) => li.querySelector(`[name="${n}"]`);
      // 안내문을 직접 고치지 않았다면 새 상태의 기본 문구로 바꾼다 (취소는 사유를 직접 쓰도록 비운다)
      form.addEventListener('change', (e) => { if (e.target.name !== 'status') return; const n = get(e.target.closest('[data-item]'), 'notice'); if (!n.value.trim() || Object.values(NOTICE).includes(n.value.trim())) n.value = NOTICE[e.target.value]; });
      form.addEventListener('submit', (e) => {
        e.preventDefault(); clearErrors(form);
        const a = find(parse().a); if (!a) return render();
        const changes = a.items.map((it) => {
          const li = form.querySelector(`[data-item="${it.id}"]`);
          const next = { status: get(li, 'status').value, saleDeadline: get(li, 'saleDeadline').value, pickupSchedule: get(li, 'pickupSchedule').value.replace('T', ' '), notice: get(li, 'notice').value.trim() };
          if (next.status === 'SCHEDULED' && !next.pickupSchedule) setError(get(li, 'pickupSchedule'), '반출예정으로 바꾸려면 확정 반출 일시가 필요합니다.');
          if (next.status === 'CANCELED' && it.status !== 'CANCELED' && !next.notice) setError(get(li, 'notice'), '취소 사유를 안내문에 적어 주세요.');
          if (next.saleDeadline && next.saleDeadline > a.movingDate) setError(get(li, 'saleDeadline'), '판매 마감일은 이사일보다 늦을 수 없습니다.');
          return [it, next];
        });
        if (invalid(form)) return;
        changes.forEach(([it, next]) => {
          if (next.status !== it.status) (a.history ??= []).unshift({ at: new Date().toISOString(), text: `${it.name}: ${GD.STATUS[it.status].label}에서 ${GD.STATUS[next.status].label} 상태로 변경` });
          Object.assign(it, next);
        });
        a.adminMemo = form.elements.adminMemo.value.trim();
        GD.save(db); toast('변경 내용을 저장했습니다.');
      });
    },
    appForm(form) {
      const items = document.getElementById('items');
      document.getElementById('addItem').addEventListener('click', () => {
        if (items.children.length >= 20) return toast('품목은 한 접수에 20개까지 넣을 수 있습니다.');
        items.insertAdjacentHTML('beforeend', itemRow(null, items.children.length));
        items.lastElementChild.querySelector('[name="itemName"]').focus();
      });
      items.addEventListener('click', (e) => {
        const b = e.target.closest('[data-remove]'); if (!b) return;
        b.closest('[data-item]').remove();
        [...items.children].forEach((el, i) => { el.querySelector('legend').textContent = `품목 ${i + 1}`; });
      });
      form.addEventListener('submit', (e) => {
        e.preventDefault(); clearErrors(form);
        const r = parse(), a = r.a === 'new' ? null : find(r.a), el = form.elements, v = (n) => el[n].value.trim();
        if (r.a !== 'new' && !a) return render();
        if (!v('name')) setError(el.name, '이름을 입력해 주세요.');
        if (!/^0\d{8,10}$/.test(v('phone').replace(/\D/g, ''))) setError(el.phone, '연락처를 확인해 주세요.');
        if (!(a && !v('pin')) && !/^\d{4}$/.test(v('pin'))) setError(el.pin, 'PIN은 숫자 4자리입니다.');
        if (!v('address')) setError(el.address, '수거 주소를 입력해 주세요.');
        if (!v('movingDate')) setError(el.movingDate, '이사일을 골라 주세요.');
        if (!v('pickupDate')) setError(el.pickupDate, '희망 반출일을 골라 주세요.');
        else if (v('movingDate') && v('pickupDate') > v('movingDate')) setError(el.pickupDate, '희망 반출일은 이사일보다 늦을 수 없습니다.');
        const blocks = [...items.children];
        blocks.forEach((b) => { const n = b.querySelector('[name="itemName"]'); if (!n.value.trim()) setError(n, '품목명을 입력해 주세요.'); });
        if (invalid(form)) return;
        const catPhoto = (id) => db.categories.find((c) => c.id === id).photo;
        const list = blocks.map((b) => {
          const g = (n) => b.querySelector(`[name="${n}"]`).value, old = a?.items.find((it) => it.id === b.dataset.id), category = g('category');
          const base = old ?? { id: GD.uid('i'), status: 'PENDING', saleDeadline: '', pickupSchedule: '', notice: NOTICE.PENDING, photo: '' };
          // 고객이 올린 사진은 그대로 두고, 종류별 대체 사진만 종류를 따라 바꾼다
          return { ...base, category, name: g('itemName').trim(), condition: g('condition'), preference: g('preference'), photo: base.photo && !base.photo.startsWith('assets/photos/') ? base.photo : catPhoto(category) };
        });
        const fields = { name: v('name'), phone: v('phone'), address: v('address'), addressDetail: v('addressDetail'), elevator: v('elevator'), movingDate: v('movingDate'), pickupDate: v('pickupDate'), memo: v('memo'), items: list };
        if (v('pin')) fields.pin = v('pin');
        let id = a?.id;
        if (a) Object.assign(a, fields);
        else { id = GD.uid('a'); db.applications.unshift({ id, code: GD.nextCode(db), createdAt: GD.today(), adminMemo: '', ...fields }); }
        location.hash = `#apps/${id}`; // 주소를 먼저 바꾸고 저장하면 상세 화면이 바로 그려진다
        GD.save(db); toast(a ? '접수 정보를 저장했습니다.' : '접수를 추가했습니다.');
      });
    },
    contentForm(form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault(); clearErrors(form);
        const kind = form.dataset.kind, el = form.elements, subject = el.subject.value.trim(), body = el.body.value.trim();
        if (!subject) setError(el.subject, kind === 'faq' ? '질문을 입력해 주세요.' : '제목을 입력해 주세요.');
        if (!body) setError(el.body, kind === 'faq' ? '답변을 입력해 주세요.' : '내용을 입력해 주세요.');
        if (kind === 'notice' && !el.date.value) setError(el.date, '게시일을 골라 주세요.');
        if (invalid(form)) return;
        const rec = kind === 'faq' ? { q: subject, a: body } : { title: subject, body, date: el.date.value };
        const list = db[KIND[kind].list], old = list.find((x) => x.id === form.dataset.id);
        if (old) Object.assign(old, rec); else list.push({ id: GD.uid(kind === 'faq' ? 'f' : 'n'), ...rec });
        ui.edit = null; GD.save(db); toast('저장했습니다. 고객 화면에 반영됩니다.');
      });
    },
    siteForm(form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault(); clearErrors(form);
        if (!form.elements.company.value.trim()) setError(form.elements.company, '상호를 입력해 주세요.');
        if (invalid(form)) return;
        [...SITE_FIELDS, ['address']].forEach(([k]) => { db.site[k] = form.elements[k].value.trim(); });
        GD.save(db); toast('저장했습니다. 고객 화면 아래쪽에 반영됩니다.');
      });
    },
  };
  function remove(key) {
    const [kind, id] = key.split(':');
    if (kind === 'reset') { GD.reset(); return toast('샘플 데이터로 되돌렸습니다.'); }
    if (kind === 'app') { db.applications = db.applications.filter((a) => a.id !== id); location.hash = '#apps'; }
    else db[KIND[kind].list] = db[KIND[kind].list].filter((x) => x.id !== id);
    GD.save(db);
  }
  view.addEventListener('click', (e) => {
    const ask = e.target.closest('[data-ask]'), back = e.target.closest('[data-back]'), yes = e.target.closest('[data-del]'), edit = e.target.closest('[data-edit]'), tr = e.target.closest('tr[data-href]');
    if (ask || back) { // 확인 줄을 보이거나 숨기기만 한다. 초점은 안전한 쪽(돌아가기)에 둔다.
      const [button, strip] = (ask ?? back).closest('[data-confirm]').children;
      button.hidden = !!ask; strip.hidden = !ask;
      (ask ? strip.querySelector('[data-back]') : button).focus();
    } else if (yes) remove(yes.dataset.del);
    else if (edit) {
      if (edit.dataset.edit && dirty && !confirm(LEAVE)) return; // 다른 행을 고치러 가기 전에 쓰던 내용을 묻는다 (취소 버튼은 묻지 않는다)
      ui.edit = edit.dataset.edit || null; render(); (view.querySelector('#contentForm .input') ?? view.querySelector('[data-edit]'))?.focus();
    }
    else if (tr && !e.target.closest('a, button')) location.hash = tr.dataset.href;
  });
  view.addEventListener('input', (e) => {
    if (!e.target.closest('form') || e.target.closest('#filter')) return;
    dirty = true; const note = document.getElementById('dirtyNote'); if (note) note.hidden = false;
  });

  function render() {
    const r = parse();
    dirty = false;
    view.innerHTML = VIEWS[r.name](r);
    document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === r.name ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    Object.keys(wire).forEach((id) => { const form = document.getElementById(id); if (form) wire[id](form); });
  }
  let lastPath = location.hash.split('?')[0], restoring = false;
  window.addEventListener('hashchange', (e) => {
    if (restoring) { restoring = false; return; }
    const path = location.hash.split('?')[0], moved = path !== lastPath;
    // 저장하지 않은 입력이 있으면 떠나기 전에 묻는다. 남기로 하면 주소만 되돌리고 화면은 그대로 둔다.
    if (moved && dirty && !confirm(LEAVE)) { restoring = true; location.replace(e.oldURL); return; }
    lastPath = path;
    if (moved) ui.edit = null;
    const rowsBefore = view.querySelectorAll('.table tbody tr, .crud > li').length;
    render();
    // 화면이 바뀌면 맨 위로, 같은 화면에서 조건만 바뀌면(달력 날짜 선택) 자리를 지킨다
    if (moved) { window.scrollTo(0, 0); view.focus({ preventScroll: true }); } else { const rows = view.querySelectorAll('.table tbody tr, .crud > li'); (rows.length > rowsBefore ? rows[rowsBefore].querySelector('a, button') : view.querySelector('[aria-current="date"]'))?.focus({ preventScroll: true }); } // "더 보기" 뒤에는 새로 나온 첫 줄로
  });
  GD.on((next, remote) => {
    db = next;
    // 다른 탭(고객 웹)에서 바뀌었을 때 저장하지 않은 입력이 있거나 검색 중이면 쓰던 내용을 지키고 접수 목록만 새로 고친다
    if (remote && (dirty || document.activeElement?.closest?.('#filter'))) { const l = document.getElementById('list'); if (l) l.innerHTML = appsList(parse()); return; }
    render();
  });
  window.addEventListener('beforeunload', (e) => { if (dirty) e.preventDefault(); }); // 탭을 닫거나 새로 고칠 때도 묻는다
  GD.applyTheme();
  render();
})();
