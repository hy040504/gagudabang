/* 고객 웹과 관리자 웹이 함께 쓰는 저장소. 데이터는 localStorage 한 곳에 있고, 다른 탭에서 바뀌면 storage 이벤트로 다시 그린다. */
(function () {
  // 깨짐 점검용(개발 전용): 주소에 ?data=worst|empty|one|huge 가 있으면 data.js의 점검용 데이터를 쓴다. 저장 칸이 달라 평소 데이터는 그대로 남는다.
  const mode = new URLSearchParams(location.search).get('data');
  const fixture = mode && window.GD_FIXTURES?.[mode];
  const KEY = fixture ? `gd-proto-v1-${mode}` : 'gd-proto-v1';
  const THEME = 'gd-proto-theme';
  const listeners = [];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const seed = () => clone(fixture ? fixture() : window.GD_SAMPLE);

  function save(db, silent) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch {
      // 저장 공간이 가득 찼거나 저장소를 못 쓰는 환경: 조용히 넘어가면 새로 고칠 때 사라지므로 화면에 알린다
      const box = document.getElementById('toasts');
      if (box && !box.querySelector('[data-full]')) { const t = document.createElement('div'); t.className = 'toast'; t.dataset.full = ''; t.textContent = '브라우저 저장 공간에 저장하지 못했습니다. 이 변경은 새로 고치면 사라집니다. 사진이 많은 접수를 지우면 공간이 생깁니다.'; box.append(t); }
    }
    if (!silent) listeners.forEach((fn) => fn(db));
  }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* 깨진 값이면 샘플로 다시 시작 */ }
    const db = seed(); save(db, true); return db;
  }
  const reset = () => { const db = seed(); save(db); return db; };

  const STATUS = {
    PENDING: { label: '접수대기', key: 'pending' },
    IN_PROGRESS: { label: '진행중', key: 'progress' },
    SCHEDULED: { label: '반출예정', key: 'scheduled' },
    COMPLETED: { label: '처리완료', key: 'done' },
    CANCELED: { label: '취소', key: 'canceled' },
  };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const today = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
  const dday = (date) => Math.round((new Date(date + 'T00:00:00') - new Date(today() + 'T00:00:00')) / 86400000);
  // 올해 날짜는 "11월 28일", 다른 해 날짜는 "2027년 1월 5일": 연도가 없으면 작년 공지나 내년 이사일이 올해처럼 읽힌다
  const fmtDate = (iso) => {
    const [y, m, d] = String(iso).slice(0, 10).split('-').map(Number);
    if (!(y && m && d)) return '';
    return new Intl.DateTimeFormat('ko-KR', { month: 'long', day: 'numeric', ...(y === Number(today().slice(0, 4)) ? {} : { year: 'numeric' }) }).format(new Date(y, m - 1, d));
  };
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nextCode = (db) => {
    const prefix = `FR-${today().replaceAll('-', '')}-`;
    // 오늘 번호 가운데 가장 큰 것 다음 번호: 개수로 세면 접수를 지운 뒤에 같은 번호가 다시 나온다
    const n = Math.max(0, ...db.applications.filter((a) => a.code.startsWith(prefix)).map((a) => Number(a.code.slice(prefix.length)) || 0)) + 1;
    return `${prefix}${String(n).padStart(3, '0')}`;
  };
  const badge = (status) => { const s = STATUS[status] ?? STATUS.PENDING; return `<span class="badge is-${s.key}">${s.label}</span>`; };
  const sampleTag = (rec) => (rec && rec.sample ? ' <span class="badge is-sample">샘플</span>' : '');
  const categoryName = (db, id) => (db.categories.find((c) => c.id === id) ?? { name: '기타 가구' }).name;

  // 테마: 저장된 선택이 없으면 기기 설정을 따른다
  const currentTheme = () => document.documentElement.dataset.theme;
  function applyTheme() {
    let t = null; try { t = localStorage.getItem(THEME); } catch { /* 무시 */ }
    document.documentElement.dataset.theme = t === 'dark' || t === 'light' ? t : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.querySelectorAll('[data-theme-toggle]').forEach((b) => {
      const label = currentTheme() === 'dark' ? '밝은 화면으로 바꾸기' : '어두운 화면으로 바꾸기';
      b.setAttribute('aria-label', label); b.title = label;
    });
    // 브라우저 주소창 색을 화면 바탕색에 맞춘다. 색 값은 tokens.css에서 읽어 온다(브라우저가 알아듣는 rgb로 바꿔서 넣는다).
    const px = document.createElement('canvas').getContext('2d');
    if (px) {
      px.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-paper'); px.fillRect(0, 0, 1, 1);
      const [r, g, b] = px.getImageData(0, 0, 1, 1).data;
      const meta = document.querySelector('meta[name="theme-color"]') ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'theme-color' }));
      meta.content = `rgb(${r}, ${g}, ${b})`;
    }
  }
  function toggleTheme() {
    try { localStorage.setItem(THEME, currentTheme() === 'dark' ? 'light' : 'dark'); } catch { /* 무시 */ }
    applyTheme();
  }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-theme-toggle]')) toggleTheme();
    // 건너뛰기 링크는 주소(해시)를 바꾸지 않고 본문으로 초점만 옮긴다: 해시가 화면 주소라서 바꾸면 첫 화면으로 가 버린다
    if (e.target.closest('.skip')) { e.preventDefault(); document.getElementById('view')?.focus(); }
  });
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { const db = load(); listeners.forEach((fn) => fn(db, true)); } // 두 번째 값 true: 다른 탭에서 바뀜
    if (e.key === THEME) applyTheme();
  });
  applyTheme();

  // 점검용 데이터 전환 막대: 주소에 ?data= 가 있을 때만 화면 아래에 나온다. 화면 디자인의 일부가 아니다.
  if (mode !== null) {
    const bar = document.createElement('nav'); bar.className = 'dev-data'; bar.setAttribute('aria-label', '점검용 데이터 전환');
    bar.innerHTML = Object.entries({ demo: '샘플', worst: '최악', empty: '빈 목록', one: '하나', huge: '1,284건' }).map(([k, label]) => `<a href="?data=${k}" data-k="${k}"${k === (fixture ? mode : 'demo') ? ' aria-current="true"' : ''}>${label}</a>`).join('');
    document.addEventListener('DOMContentLoaded', () => document.body.append(bar));
    document.addEventListener('click', (e) => {
      const seg = e.target.closest('.dev-data a'), page = e.target.closest('a[href$="admin.html"], a[href$="customer.html"]');
      if (seg) { e.preventDefault(); location.href = `${location.pathname}?data=${seg.dataset.k}${location.hash}`; } // 보던 화면을 그대로 두고 데이터만 바꾼다
      else if (page) { e.preventDefault(); location.href = page.getAttribute('href') + location.search; } // 고객 화면과 관리자 화면을 오가도 같은 데이터
    });
  }

  window.GD = { load, save, reset, on: (fn) => listeners.push(fn), STATUS, esc, today, dday, fmtDate, uid, nextCode, badge, sampleTag, categoryName, applyTheme };
})();
