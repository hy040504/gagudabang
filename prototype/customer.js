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
      <div class="hero-photo"><img src="assets/photos/hero.jpg" alt="밝은 거실에 흰 소파 두 개와 낮은 탁자가 놓인 모습" width="960" height="640"></div>
    </section>`;
  const home = () => hero() /* AREA:home */;

  const views = { home /* AREA:views */ };

  // ---------- 푸터 ----------
  let credits = [];
  function renderFoot() {
    const s = db.site;
    const biz = [s.ceo && `대표 ${esc(s.ceo)}`, s.bizNo && `사업자등록번호 ${esc(s.bizNo)}`].filter(Boolean).join(', ');
    const contact = [s.phone && `고객센터 ${esc(s.phone)}`, s.hours && esc(s.hours), s.address && esc(s.address)].filter(Boolean).join(', ');
    document.getElementById('foot').innerHTML = `
      <div><strong>${esc(s.company)}</strong><p>${esc(s.tagline)}</p>${biz ? `<p>${biz}</p>` : ''}${contact ? `<p>${contact}</p>` : ''}</div>
      <p>이 화면은 프로토타입입니다. '샘플' 표시가 붙은 접수, 공지, 질문은 예시 데이터입니다. <a href="admin.html">관리자 화면 열기</a></p>
      ${credits.length ? `<details><summary>사진 출처 ${credits.length}건</summary><ul>${credits.map((c) => `<li><a href="${esc(c.page)}" rel="noopener">${esc(c.title)}</a>, ${esc(c.artist)}, ${esc(c.license)}</li>`).join('')}</ul></details>` : ''}`;
  }

  function render() {
    const r = route();
    view.innerHTML = views[r]();
    document.querySelectorAll('[data-nav]').forEach((a) => (a.dataset.nav === r ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current')));
    renderFoot();
    wire[r]?.();
  }
  const wire = { /* AREA:wire */ };

  window.addEventListener('hashchange', () => { render(); window.scrollTo(0, 0); view.focus({ preventScroll: true }); });
  GD.on((next) => { db = next; render(); });
  fetch('assets/photos/CREDITS.json').then((r) => r.json()).then((c) => { credits = c; renderFoot(); }).catch(() => { /* 출처 파일이 없어도 화면은 동작한다 */ });
  GD.applyTheme();
  render();
})();
