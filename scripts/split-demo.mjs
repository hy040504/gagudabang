// demo.html(고객 화면 + 관리자 화면 + 기기 뷰어가 한 파일)을 demo/customer.html 과 demo/admin.html 로 나눈다.
// 함수가 어느 화면에서 쓰이는지 이름 참조로 따라가 공용 / 고객 전용 / 관리자 전용 / 뷰어 전용으로 분류한다. 원본은 건드리지 않는다.
// 실행: node scripts/split-demo.mjs
import fs from 'node:fs'; import vm from 'node:vm'; import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '').replaceAll('\\', '/'), out = root + '/demo';
const L = fs.readFileSync(root + '/demo.html', 'utf8').split(/\r?\n/);
const find = (re, from = 0) => L.findIndex((s, i) => i >= from && re.test(s));
const iStyle = find(/^<style>/), iStyleEnd = find(/^<\/style>/), iScript = find(/^<script>/), iScriptEnd = find(/^<\/script>/, iScript);
const css = L.slice(iStyle + 1, iStyleEnd).join('\n');
const body = L.slice(find(/^<body>/) + 1, iScript).join('\n');
const S = L.slice(iScript + 1, iScriptEnd);

// 1. 최상위 함수 단위로 자른다. 끝은 "여기까지 붙이면 문법이 맞는" 첫 닫는 중괄호 줄 (문자열 안의 중괄호에 속지 않는다)
const compiles = (t) => { try { new vm.Script('(' + t + '\n)'); return true; } catch { return false; } };
const chunks = []; let buf = [];
for (let i = 0; i < S.length;) {
  const m = /^(?:async\s+)?function\s+([\w$]+)\s*\(/.exec(S[i]);
  if (!m) { buf.push(S[i++]); continue; }
  let end = -1;
  for (let j = i; j < S.length; j++) if ((j === i || S[j].startsWith('}')) && compiles(S.slice(i, j + 1).join('\n'))) { end = j; break; }
  if (end < 0) throw new Error('끝을 찾지 못함: ' + m[1]);
  if (buf.length) { chunks.push({ kind: 'stmt', text: buf.join('\n') }); buf = []; }
  chunks.push({ kind: 'fn', name: m[1], text: S.slice(i, end + 1).join('\n') }); i = end + 1;
}
if (buf.length) chunks.push({ kind: 'stmt', text: buf.join('\n') });

// 2. 이름 참조 그래프 (화면 조각 안의 onclick="함수()" 문자열도 이름으로 잡힌다)
const fns = new Map(chunks.filter((c) => c.kind === 'fn').map((c) => [c.name, c]));
const refs = (text) => new Set((text.match(/[A-Za-z_$][\w$]*/g) || []).filter((n) => fns.has(n)));
for (const c of fns.values()) { c.refs = refs(c.text); c.refs.delete(c.name); }
const CUST = ['customerShell', 'viewHome', 'viewApply', 'viewComplete', 'viewLookup', 'viewCustomerLogin', 'viewCustomerSignup', 'viewMyPage', 'viewPolicy'];
const ADM = ['adminShell', 'viewAdminLogin', 'viewAdminDashboard', 'viewAdminSchedule', 'viewAdminDetail', 'viewAdminSettings'];
const VIEWER = ['renderViewer', 'fitViewer', 'vwSetEnv', 'vwSetRole', 'vwJumpRoute', 'vwSetTheme', 'p3UpdateViewerBarState', 'p3BuildDeviceHtml', 'p3BroadcastToFrames', 'p3IframeSrc'];
const REPLACED = ['render', 'switchPortal']; // 화면별 파일에서 새로 쓴다
const reach = (roots, blocked) => { const seen = new Set(), stack = [...roots]; while (stack.length) { const n = stack.pop(); if (seen.has(n) || !fns.has(n)) continue; seen.add(n); for (const r of fns.get(n).refs) if (!blocked.has(r)) stack.push(r); } return seen; };
const block = (...lists) => new Set(lists.flat());
const RC = reach(CUST, block(ADM, VIEWER, REPLACED)), RA = reach(ADM, block(CUST, VIEWER, REPLACED)), RV = reach(VIEWER, block(CUST, ADM, REPLACED));
const stop = block(CUST, ADM, VIEWER, REPLACED);
const stmtRefs = [...new Set(chunks.filter((c) => c.kind === 'stmt').flatMap((c) => [...refs(c.text)]))].filter((n) => !stop.has(n));
const RS = reach([...stmtRefs, 'initBoot', 'go'], stop);
const where = (name) => {
  if (REPLACED.includes(name)) return 'replaced';
  const c = RC.has(name), a = RA.has(name), v = RV.has(name);
  if (RS.has(name) || [c, a, v].filter(Boolean).length !== 1) return 'shared';
  return c ? 'customer' : a ? 'admin' : 'viewer';
};
for (const c of fns.values()) c.where = where(c.name);

// 3. 화면별로 새로 쓰는 부분: 그리기, 다른 화면으로 넘어가기
const tail = (portal) => {
  const other = portal === 'customer' ? 'admin.html' : 'customer.html';
  const draw = portal === 'customer' ? `
  let body = '';
  switch (U.route) {
    case 'apply': body = viewApply(); break;
    case 'complete': body = viewComplete(); break;
    case 'lookup': body = viewLookup(); break;
    case 'login': case 'customer-login': body = viewCustomerLogin(); break;
    case 'signup': case 'customer-signup': body = viewCustomerSignup(); break;
    case 'mypage': case 'my': case 'my-page': body = viewMyPage(); break;
    case 'terms': case 'policy-terms': case 'policy': body = viewPolicy('terms'); break;
    case 'privacy': case 'policy-privacy': body = viewPolicy('privacy'); break;
    case 'home': default: U.route = 'home'; body = viewHome(); break;
  }
  const html = customerShell(body);` : `
  if (U.route !== 'admin-login') p3StopLockTimer();
  let html = '';
  if (U.route === 'admin-login') html = viewAdminLogin();
  else if (!U.adminLoggedIn) { p3NextAdminRoute = U.route || 'admin-dashboard'; html = viewAdminLogin(); }
  else {
    let body = '';
    switch (U.route) {
      case 'admin-schedule': body = viewAdminSchedule(); break;
      case 'admin-detail': body = viewAdminDetail(); break;
      case 'admin-settings': body = viewAdminSettings(); break;
      case 'admin-dashboard': default: U.route = 'admin-dashboard'; body = viewAdminDashboard(); break;
    }
    html = adminShell(body);
  }`;
  return `
/* ---------- ${portal === 'customer' ? '고객' : '관리자'} 화면 전용: 그리기와 화면 전환 (나눌 때 새로 쓴 부분) ---------- */
const GD_PORTAL = '${portal}';
const GD_OTHER_PAGE = '${other}';
const isOtherPortal = (route) => String(route || '').startsWith('admin') !== (GD_PORTAL === 'admin');

function render() {
  p3EnsureStyles();
  p3EnsureDefaults();
  // 이 파일이 맡지 않는 주소로 오면 다른 화면 파일로 넘긴다
  if (U.route && isOtherPortal(U.route)) { location.href = GD_OTHER_PAGE + '#' + encodeURIComponent(U.route); return; }
  U.portal = GD_PORTAL;${draw}
  const appEl = document.getElementById('app') || document.body;
  appEl.innerHTML = html;${portal === 'admin' ? `
  if (railPtr) { const side = appEl.querySelector('.side'); if (side) { side.classList.add('open'); side.classList.add('exp'); } }` : ''}
  if (typeof playEnter === 'function') playEnter(appEl);
  U.anim = false;
}

function switchPortal(portal, route) {
  const target = portal === 'admin' ? 'admin' : 'customer';
  if (target === GD_PORTAL) { go(route || (GD_PORTAL === 'admin' ? (U.adminLoggedIn ? 'admin-dashboard' : 'admin-login') : 'home')); return; }
  location.href = GD_OTHER_PAGE + '#' + encodeURIComponent(route || (target === 'admin' ? 'admin-login' : 'home'));
}

// 공용 go()는 주소만 보고 화면을 그린다. 다른 화면의 주소면 그 파일로 이동시킨다.
const goInPage = go;
go = function (route) {
  if (route && isOtherPortal(route)) { location.href = GD_OTHER_PAGE + '#' + encodeURIComponent(route); return; }
  goInPage(route);
};
`;
};

// 4. 내보내기
const head = (what) => `/* 가구다방 데모 ${what} — demo.html에서 나눈 파일. 다시 만들려면 나누는 스크립트(scripts/split-demo.mjs)를 실행한다. */\n`;
const pick = (w) => chunks.filter((c) => c.kind === 'fn' && c.where === w).map((c) => c.text).join('\n\n');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(out + '/shared.css', head('공용 스타일 (고객 화면과 관리자 화면이 함께 쓴다)') + css + '\n');
// 로고는 새 로고(남색 바탕, 흰 글자)로 바꾼다: 정사각형은 기존 심볼 자리(64px), 가로형은 기존 가로 로고 자리
const logoPaths = fs.readFileSync(root + '/prototype/assets/logo.svg', 'utf8').match(/<path[^>]*>/g).join('');
const logoSvg = (box, w, h, rx) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${box.join(' ')}" width="${w}" height="${h}" role="img" aria-label="가구다방"><rect x="${box[0]}" y="${box[1]}" width="${box[2]}" height="${box[3]}" rx="${rx}" fill="#14284b"/>${logoPaths}</svg>`;
let sharedJs = chunks.filter((c) => c.kind === 'stmt' || c.where === 'shared').map((c) => c.text).join('\n\n');
sharedJs = sharedJs.replace(/const BRAND_SVG = `[\s\S]*?<\/svg>`;/, () => 'const BRAND_SVG = `' + logoSvg([154, 98, 1766, 1766], 64, 64, 390) + '`;')
  .replace(/const BRAND_LOCKUP_SVG = `[\s\S]*?<\/svg>`;/, () => 'const BRAND_LOCKUP_SVG = `' + logoSvg([123, 638, 1827, 686], 149, 56, 200) + '`;');
fs.writeFileSync(out + '/shared.js', head('공용 스크립트: 상태 저장, 샘플 데이터, 공용 부품, 주소 처리, 시작 코드. 기기 뷰어 전용 함수는 뺐다.') + sharedJs + '\n');
for (const p of ['customer', 'admin']) fs.writeFileSync(`${out}/${p}.js`, head(p === 'customer' ? '고객 화면 전용 스크립트' : '관리자 화면 전용 스크립트') + "'use strict';\n\n" + pick(p) + '\n' + tail(p));
const page = (p, title, start) => `<!DOCTYPE html>
<html lang="ko" data-theme="light">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title}</title>
<link rel="icon" type="image/svg+xml" href="../docs/assets/brand/icon.svg">
<link rel="stylesheet" href="shared.css">
</head>
<body>
${body}
<script>if (!location.hash) location.hash = '#${start}'; /* 주소가 비어 있으면 원본의 기기 뷰어 대신 이 화면의 첫 화면으로 시작한다 */</script>
<script src="shared.js"></script>
<script src="${p}.js"></script>
</body>
</html>
`;
fs.writeFileSync(out + '/customer.html', page('customer', '가구다방 고객 화면 (데모)', 'home'));
fs.writeFileSync(out + '/admin.html', page('admin', '가구다방 관리자 화면 (데모)', 'admin-dashboard'));

const count = (w) => [...fns.values()].filter((c) => c.where === w).length;
const size = (f) => Math.round(fs.statSync(out + '/' + f).size / 1024) + 'KB';
console.log(JSON.stringify({ functions: fns.size, shared: count('shared'), customer: count('customer'), admin: count('admin'), viewerDropped: count('viewer'), replaced: count('replaced'), stmtChunks: chunks.filter((c) => c.kind === 'stmt').length,
  files: Object.fromEntries(['shared.css', 'shared.js', 'customer.js', 'admin.js', 'customer.html', 'admin.html'].map((f) => [f, size(f)])),
  relativeAssetRefs: S.filter((s) => /(src|href)=["'](\.\/|docs\/|assets\/)/.test(s)).length,
  viewerNames: [...fns.values()].filter((c) => c.where === 'viewer').map((c) => c.name).join(',') }));
// 각 화면이 싣지 않는 함수를 부르는 곳이 있는지 (있으면 그 길로 갔을 때 오류가 난다)
for (const p of ['customer', 'admin']) {
  const loaded = new Set([...fns.values()].filter((c) => c.where === 'shared' || c.where === p).map((c) => c.name).concat(REPLACED));
  const miss = {};
  for (const c of [...fns.values()].filter((x) => loaded.has(x.name) && !REPLACED.includes(x.name))) for (const r of c.refs) if (!loaded.has(r)) (miss[r] ??= []).push(c.name);
  for (const c of chunks.filter((x) => x.kind === 'stmt')) for (const r of refs(c.text)) if (!loaded.has(r)) (miss[r] ??= []).push('(최상위)');
  console.log(p, '에서 못 찾는 함수:', JSON.stringify(miss));
}
for (const f of ['shared.js', 'customer.js', 'admin.js']) { try { new vm.Script(fs.readFileSync(out + '/' + f, 'utf8'), { filename: f }); } catch (e) { console.log('문법 오류', f, String(e).slice(0, 200)); } }
