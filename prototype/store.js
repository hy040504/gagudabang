/* 고객 웹과 관리자 웹이 함께 쓰는 저장소. 데이터는 localStorage 한 곳에 있고, 다른 탭에서 바뀌면 storage 이벤트로 다시 그린다. */
(function () {
  const KEY = 'gd-proto-v1';
  const THEME = 'gd-proto-theme';
  const listeners = [];
  const clone = (o) => JSON.parse(JSON.stringify(o));

  function save(db, silent) {
    try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* 저장소를 못 쓰는 환경에서는 이번 화면에서만 유지 */ }
    if (!silent) listeners.forEach((fn) => fn(db));
  }
  function load() {
    try { const raw = localStorage.getItem(KEY); if (raw) return JSON.parse(raw); } catch { /* 깨진 값이면 샘플로 다시 시작 */ }
    const db = clone(window.GD_SAMPLE); save(db, true); return db;
  }
  const reset = () => { const db = clone(window.GD_SAMPLE); save(db); return db; };

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
  const fmtDate = (iso) => { const [y, m, d] = String(iso).slice(0, 10).split('-'); return y && m && d ? `${Number(m)}월 ${Number(d)}일` : ''; };
  const uid = (p) => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const nextCode = (db) => {
    const ymd = today().replaceAll('-', '');
    const n = db.applications.filter((a) => a.code.startsWith(`FR-${ymd}-`)).length + 1;
    return `FR-${ymd}-${String(n).padStart(3, '0')}`;
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
  }
  function toggleTheme() {
    try { localStorage.setItem(THEME, currentTheme() === 'dark' ? 'light' : 'dark'); } catch { /* 무시 */ }
    applyTheme();
  }
  document.addEventListener('click', (e) => { if (e.target.closest('[data-theme-toggle]')) toggleTheme(); });
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) { const db = load(); listeners.forEach((fn) => fn(db)); }
    if (e.key === THEME) applyTheme();
  });
  applyTheme();

  window.GD = { load, save, reset, on: (fn) => listeners.push(fn), STATUS, esc, today, dday, fmtDate, uid, nextCode, badge, sampleTag, categoryName, applyTheme };
})();
