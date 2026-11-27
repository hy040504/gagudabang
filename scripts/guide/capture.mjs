// 이용 가이드의 화면 그림을 다시 찍는다. 실제 앱을 임시 데이터로 띄우고, 고객과 관리자의 흐름을 처음부터 끝까지 직접 눌러 보면서
// 번호 표시를 붙여 docs/assets/guide/ 에 저장한다. 한 단계라도 기대와 다르면 끝에 실패로 알린다.
// 실행: npm run build 뒤에, playwright-core가 없으면 `npm i --no-save playwright-core`, 그다음 `node scripts/guide/capture.mjs`
// (Edge가 설치돼 있어야 한다. 그림 속 이름·주소·전화번호는 설명용 예시다.)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const OUT = path.join(ROOT, 'docs', 'assets', 'guide');
const PHOTO = (n) => path.join(ROOT, 'prototype', 'assets', 'photos', n);
const { createApp } = await import(pathToFileURL(path.join(ROOT, 'dist', 'server', 'app.js')).href);

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gd-guide-'));
const ADMIN_PW = 'guide-admin-pw';
const { app, db } = createApp({ dataDir: dir, publicDir: path.join(ROOT, 'public'), secret: 'guide', adminPassword: ADMIN_PW });
const srv = app.listen(0, '127.0.0.1');
await new Promise((r) => srv.once('listening', r));
const base = `http://127.0.0.1:${srv.address().port}`;
fs.mkdirSync(OUT, { recursive: true });

const day = (n) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date(Date.now() + n * 86400000));
const MOVING = day(21), PICKUP = day(14), DEADLINE = day(10);
const fails = [];
const need = (cond, label) => { if (!cond) fails.push(label); };

// 설명용 예시 접수 두 건 (목록이 비어 보이지 않게). 화면으로 넣는 접수는 아래 흐름에서 따로 만든다.
const seed = async (name, phone, items) => {
  const f = new FormData();
  f.set('payload', JSON.stringify({ applicantName: name, phone, pin: '1234', address: '서울특별시 예시구 예시로 12', addressDetail: '101동 1001호', elevatorInfo: 'YES', movingDate: day(30), preferredPickupDate: day(25), privacyConsented: true, items: items.map(([category, itemName]) => ({ category, itemName, conditionGrade: 'GOOD', customerPreference: 'CONSULT' })) }));
  items.forEach(([, , photo], i) => f.append(`photos_${i}`, new Blob([fs.readFileSync(PHOTO(photo))], { type: 'image/jpeg' }), photo));
  return (await (await fetch(base + '/api/applications', { method: 'POST', body: f })).json()).data.requestCode;
};
const seeded = [await seed('김영희', '010-2345-6789', [['BED', '퀸 사이즈 침대', 'bed.jpg']]), await seed('이철수', '010-3456-7890', [['DESK', '원목 책상', 'desk.jpg'], ['CLOSET', '3단 서랍장', 'closet.jpg']])];

const browser = await chromium.launch({ channel: 'msedge' });

/** 화면 하나를 다루는 도구: 번호 표시 붙이기, 찍기 */
function tools(p) {
  // marks: [선택자, 번호] 또는 [[선택자, 몇 번째], 번호]. 요소를 빨간 테두리로 두르고 왼쪽 위에 번호를 붙인다.
  const mark = (marks) => p.evaluate((marks) => {
    const dlg = document.querySelector('dialog[open]');
    const host = dlg ?? document.body;
    for (const [target, n] of marks) {
      const [sel, idx] = Array.isArray(target) ? target : [target, 0];
      const el = document.querySelectorAll(sel)[idx];
      if (!el) { (window.__missing ??= []).push(sel); continue; }
      const r = el.getBoundingClientRect(), pad = 5;
      const box = document.createElement('div');
      box.className = '__gmark';
      const x = r.left - pad + (dlg ? 0 : scrollX), y = r.top - pad + (dlg ? 0 : scrollY);
      box.style.cssText = `position:${dlg ? 'fixed' : 'absolute'};left:${x}px;top:${y}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border:2.5px solid #e0362c;border-radius:10px;background:rgba(224,54,44,.07);z-index:2147483647;pointer-events:none;box-sizing:border-box`;
      const b = document.createElement('span');
      b.textContent = n;
      b.style.cssText = 'position:absolute;left:-13px;top:-13px;width:26px;height:26px;border-radius:50%;background:#e0362c;color:#fff;font:700 14px/26px Pretendard,sans-serif;text-align:center;box-shadow:0 0 0 2px #fff';
      box.append(b); host.append(box);
    }
    const m = window.__missing ?? []; window.__missing = []; return m;
  }, marks);
  const unmark = () => p.evaluate(() => document.querySelectorAll('.__gmark').forEach((e) => e.remove()));
  /** name으로 저장. from/to를 주면 그 두 요소를 포함하는 구역만, 없으면 지금 보이는 화면을 찍는다. */
  const shot = async (name, marks, { from, to = from, view = false } = {}) => {
    await p.waitForTimeout(250);
    // 구역을 찍을 때: 한 번 보이게 해서 그림을 불러온 뒤 맨 위로 돌아간다 (위에 붙는 머리글이 구역 한가운데에 찍히지 않게). 알림 띠는 숨긴다.
    if (from && !view) { await p.locator(from).first().scrollIntoViewIfNeeded(); await p.waitForTimeout(200); await p.evaluate(() => scrollTo(0, 0)); }
    await p.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.style.visibility = 'hidden'; });
    const missing = await mark(marks);
    need(missing.length === 0, `${name}: 표시할 요소 없음 ${missing.join(', ')}`);
    let clip;
    if (from) clip = await p.evaluate(([a, b]) => {
      const A = document.querySelector(a).getBoundingClientRect(), B = (b === a ? document.querySelector(a) : [...document.querySelectorAll(b)].pop()).getBoundingClientRect(), m = 22;
      const x = Math.max(0, Math.min(A.left, B.left) - m), y = Math.max(0, Math.min(A.top, B.top) + scrollY - m);
      return { x, y, width: Math.min(innerWidth, Math.max(A.right, B.right) + m) - x, height: Math.max(A.bottom, B.bottom) + scrollY + m - y };
    }, [from, to]);
    await p.screenshot({ path: path.join(OUT, name + '.png'), ...(clip ? { clip, fullPage: true } : {}) });
    await unmark();
    await p.evaluate(() => { const t = document.getElementById('toasts'); if (t) t.style.visibility = ''; });
  };
  const has = (t) => p.evaluate((s) => document.body.innerText.includes(s), t);
  return { shot, has };
}

async function open(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height }, serviceWorkers: 'block', locale: 'ko-KR' });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => fails.push('화면 오류: ' + String(e).slice(0, 120)));
  p.on('dialog', (d) => d.accept());
  return { ctx, p, ...tools(p) };
}
const go = async (p, url) => { await p.goto(base + url); await p.waitForTimeout(500); };

let code = '';
try {
  // ================= 고객 · 컴퓨터 =================
  const C = await open(1280, 800);
  await go(C.p, '/#home');
  await C.shot('c01-home', [['.gd-site nav a[href="#lookup"]', 1], ['.gd-site nav a[href="#login"]', 2], ['.gd-site nav [data-theme-toggle]', 3], ['.gd-site nav .btn.primary', 4], ['.gd-hero-copy .btn.primary', 5], ['.gd-timeline-box', 6]]);

  await go(C.p, '/#apply');
  const fill = (n, v) => C.p.fill(`#applyForm [name="${n}"]`, v);
  await fill('applicantName', '홍길동'); await fill('phone', '010-1234-5678'); await fill('pin', '1234');
  await fill('address', '서울특별시 예시구 예시로 12'); await fill('addressDetail', '101동 1001호');
  await C.p.selectOption('#applyForm [name="elevatorInfo"]', 'YES');
  await fill('movingDate', MOVING); await fill('preferredPickupDate', PICKUP);
  const item = (i) => C.p.locator('#items [data-item]').nth(i);
  await item(0).locator('[name=category]').selectOption('SOFA'); await item(0).locator('[name=itemName]').fill('3인용 패브릭 소파');
  await item(0).locator('[name=conditionGrade]').selectOption('GOOD'); await item(0).locator('[name=customerPreference]').selectOption('RESALE');
  await item(0).locator('input[type=file]').setInputFiles([PHOTO('sofa.jpg'), PHOTO('hero.jpg')]);
  await C.p.click('#addItem');
  await item(1).locator('[name=category]').selectOption('DINING'); await item(1).locator('[name=itemName]').fill('4인용 식탁');
  await item(1).locator('[name=customerPreference]').selectOption('DISPOSE');
  await item(1).locator('input[type=file]').setInputFiles([PHOTO('dining.jpg')]);
  await fill('customerMemo', '평일 오전 방문을 희망합니다.');
  await C.p.check('#applyForm [name="privacyConsented"]');
  await C.shot('c02-apply-info', [['[name="applicantName"]', 1], ['[name="phone"]', 2], ['[name="pin"]', 3], ['.gd-addr-row', 4], ['[name="elevatorInfo"]', 5], ['[name="movingDate"]', 6], ['[name="preferredPickupDate"]', 7]], { from: '#applyForm h1', to: '#applyForm .gd-sec:nth-of-type(3)' });
  await C.shot('c03-apply-items', [['#items [name="category"]', 1], ['#items [name="itemName"]', 2], ['#items [name="conditionGrade"]', 3], ['#items [name="customerPreference"]', 4], ['#items .gd-file', 5], ['#items .gd-thumbs', 6], ['#items [data-remove]', 7], ['#addItem', 8]], { from: '#applyForm .gd-sec:nth-of-type(4)' });
  await C.shot('c04-apply-submit', [['[name="customerMemo"]', 1], [['#applyForm .gd-sec:nth-of-type(5) label', 1], 2], [['#applyForm .gd-sec:nth-of-type(5) label', 2], 3], ['#submitBtn', 4]], { from: '#applyForm .gd-sec:nth-of-type(5)', to: '#submitBtn' });
  await C.p.click('#submitBtn'); await C.p.waitForFunction(() => location.hash === '#complete', null, { timeout: 15000 });
  code = (await C.p.locator('main strong.tabular').innerText()).trim();
  need(/^FR-\d{8}-\d{3}$/.test(code), '접수번호 형식: ' + code);
  await C.shot('c05-complete', [['main strong.tabular', 1], ['main a[href="#lookup"]', 2]], { from: 'main section.card' });

  await go(C.p, '/#lookup');
  await C.p.fill('#lookupForm [name=identifier]', code); await C.p.fill('#lookupForm [name=pin]', '1234'); await C.p.click('#lookupForm button'); await C.p.waitForSelector('#lookupOut article');
  need(await C.has('3인용 패브릭 소파') && await C.has('접수대기'), '조회 결과에 품목과 접수대기');
  await C.shot('c06-lookup', [['#lookupForm [name=identifier]', 1], ['#lookupForm [name=pin]', 2], ['#lookupForm button', 3], ['#lookupOut h2', 4], ['#lookupOut article b', 5], ['#lookupOut [data-cancel]', 6]], { from: '#lookupForm', to: '#lookupOut article' });

  // 취소는 예시 접수로 직접 해 본다 (가이드 그림에는 쓰지 않고, 설명이 맞는지만 확인)
  await C.p.fill('#lookupForm [name=identifier]', seeded[0]); await C.p.fill('#lookupForm [name=pin]', '1234'); await C.p.click('#lookupForm button'); await C.p.waitForSelector('#lookupOut [data-cancel]');
  await C.p.click('#lookupOut [data-cancel]'); await C.p.waitForTimeout(900);
  need(await C.has('취소') && await C.p.locator('#lookupOut [data-cancel]').count() === 0, '고객 취소 뒤 취소 버튼이 사라짐');

  // 회원가입 → 마이페이지 → 비회원 접수 연결
  await go(C.p, '/#signup');
  const sf = (n, v) => C.p.fill(`#signupForm [name="${n}"]`, v);
  await sf('username', 'gildong01'); await sf('password', 'guide-pass-1'); await sf('confirm', 'guide-pass-1'); await sf('name', '홍길동'); await sf('phone', '010-1234-5678');
  await sf('defaultAddress', '서울특별시 예시구 예시로 12'); await sf('defaultAddressDetail', '101동 1001호');
  await C.shot('c07-signup', [['#signupForm [name=username]', 1], ['#signupForm [name=password]', 2], ['#signupForm [name=confirm]', 3], ['#signupForm [name=name]', 4], ['#signupForm [name=phone]', 5], ['#signupForm [name=defaultAddress]', 6], ['#signupForm button.primary', 7]], { from: '#signupForm' });
  await C.p.click('#signupForm button.primary'); await C.p.waitForFunction(() => location.hash === '#my', null, { timeout: 10000 });
  await C.p.fill('#claimForm [name=requestCode]', code); await C.p.fill('#claimForm [name=pin]', '1234'); await C.p.click('#claimForm button'); await C.p.waitForSelector('#myList article');
  need(await C.has(code), '마이페이지에 연결한 접수가 보임');
  await C.shot('c09-my', [['#myList', 1], ['#claimForm', 2], ['#profileForm', 3], ['#logoutBtn', 4]], { from: 'main .main-inner' });
  await C.p.click('#logoutBtn'); await C.p.waitForTimeout(600);
  await go(C.p, '/#login');
  await C.p.fill('#loginForm [name=identifier]', 'gildong01'); await C.p.fill('#loginForm [name=password]', 'guide-pass-1');
  await C.shot('c08-login', [['#loginForm [name=identifier]', 1], ['#loginForm [name=password]', 2], ['#loginForm button.primary', 3], ['#loginForm a[href="#signup"]', 4]], { from: '#loginForm' });
  await C.p.click('#loginForm button.primary'); await C.p.waitForFunction(() => location.hash === '#my', null, { timeout: 10000 });
  await C.p.click('#logoutBtn'); await C.p.waitForTimeout(500);
  await go(C.p, '/#login'); await C.p.fill('#loginForm [name=identifier]', '010-1234-5678'); await C.p.fill('#loginForm [name=password]', 'guide-pass-1'); await C.p.click('#loginForm button.primary');
  await C.p.waitForFunction(() => location.hash === '#my', null, { timeout: 10000 }).catch(() => fails.push('휴대폰 번호 로그인'));

  // ================= 관리자 · 컴퓨터 =================
  const A = await open(1280, 800);
  await go(A.p, '/admin.html');
  await A.p.fill('[name=loginId]', 'admin'); await A.p.fill('[name=password]', ADMIN_PW);
  await A.shot('a01-login', [['[name=loginId]', 1], ['[name=password]', 2], ['#loginForm button', 3]], { from: '#loginForm' });
  await A.p.click('#loginForm button'); await A.p.waitForSelector('.tbl tbody a');
  need(await A.p.locator('.tbl tbody tr').count() === 3, '관리자 목록 3건');
  await A.shot('a02-dashboard', [['.gd-stats', 1], ['#filterForm', 2], ['.tbl tbody tr', 3], [['.gd-top-link', 1], 4], [['.gd-top-link', 2], 5], [['.gd-top-link', 3], 6], ['.gd-admin-bar a[href^="/api/admin/export"]', 7], ['.gd-admin-bar [data-theme-toggle]', 8], ['#logout', 9]]);
  await A.p.locator('.tbl tbody a', { hasText: code }).click(); await A.p.waitForSelector('form[data-item]');
  await A.p.fill('#memoForm [name=adminMemo]', '오전 10시 이후 통화 가능');
  await A.shot('a03-detail-top', [['main h1', 1], ['main a[href^="tel:"]', 2], [['main section.card p', 1], 3], ['#memoForm', 4]], { from: 'main a[href="#dashboard"]', to: '#memoForm' });
  await A.p.click('#memoForm button'); await A.p.waitForTimeout(800);
  need(await A.p.inputValue('#memoForm [name=adminMemo]') === '오전 10시 이후 통화 가능', '운영 메모 저장');

  const F = (i) => A.p.locator('form[data-item]').nth(i);
  await F(0).locator('[name=handlingType]').selectOption('RESALE'); await F(0).locator('[name=status]').selectOption('IN_PROGRESS');
  await F(0).locator('[name=saleDeadline]').fill(DEADLINE); await F(0).locator('[name=publicNotice]').fill('사진 확인을 마쳤습니다. 판매를 시작합니다.');
  await A.shot('a04-item', [['form[data-item] .gd-thumb', 1], ['form[data-item] [name=handlingType]', 2], ['form[data-item] [name=status]', 3], ['form[data-item] [name=saleDeadline]', 4], ['form[data-item] [name=pickupSchedule]', 5], ['form[data-item] [name=publicNotice]', 6], ['form[data-item] [name=adminItemMemo]', 7], ['form[data-item] [data-save]', 8]], { from: 'form[data-item]' });
  await F(0).locator('[data-save]').click(); await A.p.waitForTimeout(300);
  need(await F(0).locator('.gd-confirm').isVisible(), '상태 변경 확인 줄');
  await A.shot('a05-confirm', [['form[data-item] .gd-confirm p', 1], ['form[data-item] .gd-confirm .small', 2], ['form[data-item] .gd-confirm .btn.primary', 3], ['form[data-item] .gd-confirm [data-back]', 4]], { from: 'form[data-item] .gd-confirm' });
  await F(0).locator('.gd-confirm .btn.primary').click(); await A.p.waitForTimeout(900);
  need(await F(0).locator('[name=status]').inputValue() === 'IN_PROGRESS', '진행중으로 저장');
  await F(0).locator('summary').click();
  await A.shot('a06-sms', [['form[data-item] [data-sms-kind]', 1], ['form[data-item] [data-sms-text]', 2], ['form[data-item] [data-sms-copy]', 3]], { from: 'form[data-item] .gd-sms' });
  await F(0).locator('a[data-photo]').first().click(); await A.p.waitForTimeout(500);
  need(await A.p.locator('#photoDlg').evaluate((d) => d.open), '사진 크게 보기 열림');
  await A.shot('a07-photo', [['#photoDlg img', 1], ['#photoDlg [data-step="-1"]', 2], ['#photoDlg [data-step="1"]', 3], ['#photoDlg [data-close]', 4]]);
  await A.p.keyboard.press('Escape');
  // 두 번째 가구는 단순 처분으로 반출 일정을 잡는다 (일정 화면에 표시된다)
  await F(1).locator('[name=handlingType]').selectOption('DISPOSE'); await F(1).locator('[name=status]').selectOption('SCHEDULED');
  await F(1).locator('[name=pickupSchedule]').fill(`${PICKUP} 10:00`);
  await F(1).locator('[data-save]').click(); await A.p.waitForTimeout(300); await F(1).locator('.gd-confirm .btn.primary').click(); await A.p.waitForTimeout(900);
  need(await F(1).locator('[name=status]').inputValue() === 'SCHEDULED', '반출예정으로 저장');
  await A.shot('a08-history', [['main section.card:last-of-type', 1]], { from: 'main section.card:last-of-type' });

  await go(A.p, '/admin.html#schedule');
  for (let i = 0; i < 3 && !(await A.p.locator(`.cal-cell[data-date="${PICKUP}"]`).count()); i++) { await A.p.click('[data-shift="1"]'); await A.p.waitForTimeout(500); }
  await A.p.click(`.cal-cell[data-date="${PICKUP}"]`); await A.p.waitForTimeout(500);
  need(await A.has('4인용 식탁 반출'), '일정 화면에 반출 일정');
  // 직접 추가하는 일정: 넣고, 보이는지 확인하고, 그림을 찍은 뒤 지워 본다
  await A.p.fill('#evForm [name=title]', '수거 차량 정기 점검'); await A.p.click('#evForm button'); await A.p.waitForSelector('[data-ev-del]');
  need(await A.has('수거 차량 정기 점검'), '직접 추가한 일정이 보임');
  await A.shot('a09-schedule', [['[data-shift="-1"]', 1], ['[data-shift="1"]', 2], ['#calToday', 3], ['.cal-cell.sel', 4], ['.cal-wrap aside', 5], ['#evForm', 6], ['[data-ev-del]', 7]]);
  await A.p.click('[data-ev-del]'); await A.p.waitForTimeout(700);
  need(!(await A.has('수거 차량 정기 점검')), '직접 추가한 일정을 지움');
  await go(A.p, '/admin.html#stats');
  need(await A.has('상태별') && await A.has('월별 접수'), '통계 화면');
  await A.shot('a13-stats', [['.gd-stats', 1], ['.gd-stat-card', 2], [['.gd-stat-card', 1], 3], [['.gd-stat-card', 2], 4], [['.gd-stat-card', 3], 5]]);
  await go(A.p, '/admin.html#settings');
  await A.shot('a10-settings', [['#siteForm', 1], ['#pwForm', 2]], { from: '#siteForm', to: '#pwForm' });

  // 관리자가 바꾼 내용이 고객 조회 화면에 보이는지
  await go(C.p, '/#lookup');
  await C.p.fill('#lookupForm [name=identifier]', code); await C.p.fill('#lookupForm [name=pin]', '1234'); await C.p.click('#lookupForm button'); await C.p.waitForSelector('#lookupOut article');
  need(await C.has('진행중') && await C.has('판매를 시작합니다') && await C.has('반출예정'), '고객 조회에 진행 상태와 안내문');
  need(!(await C.has('오전 10시 이후 통화 가능')), '운영 메모는 고객에게 보이지 않음');
  need(await C.p.locator('#lookupOut [data-cancel]').count() === 0, '진행이 시작되면 취소 버튼이 없음');
  await C.shot('c10-lookup-progress', [['#lookupOut article b', 1], ['#lookupOut article div.muted.small', 2], [['#lookupOut article b', 1], 3]], { from: '#lookupOut article' });
  await C.ctx.close(); await A.ctx.close();

  // ================= 휴대폰 =================
  const M = await open(390, 844);
  await go(M.p, '/#home');
  await M.shot('c11-mobile-home', [['.gd-site .gd-brand', 1], ['.gd-site nav a[href="#lookup"]', 2], ['.gd-site nav a[href="#login"]', 3], ['.gd-site nav [data-theme-toggle]', 4], ['.gd-site nav .btn.primary', 5], ['.gd-hero-copy .btn.primary', 6]]);
  await go(M.p, '/#apply');
  await M.p.locator('#items input[type=file]').setInputFiles([PHOTO('sofa.jpg')]);
  await M.p.locator('#items [name=itemName]').fill('3인용 패브릭 소파');
  await M.shot('c12-mobile-apply', [['#items [name="category"]', 1], ['#items [name="itemName"]', 2], ['#items .gd-file', 3], ['#items .gd-thumbs', 4], ['#addItem', 5]], { from: '#applyForm .gd-sec:nth-of-type(4)' });
  await go(M.p, '/#lookup');
  await M.p.fill('#lookupForm [name=identifier]', '010-1234-5678'); await M.p.fill('#lookupForm [name=pin]', '1234'); await M.p.click('#lookupForm button'); await M.p.waitForSelector('#lookupOut article');
  need(await M.has(code), '연락처로 조회');
  await M.shot('c13-mobile-lookup', [['#lookupForm [name=identifier]', 1], ['#lookupForm button', 2], ['#lookupOut article b', 3]], { from: '#lookupForm', to: '#lookupOut article' });

  await go(M.p, '/admin.html');
  await M.p.fill('[name=loginId]', 'admin'); await M.p.fill('[name=password]', ADMIN_PW); await M.p.click('#loginForm button'); await M.p.waitForSelector('.tbl tbody a');
  need(await M.p.evaluate(() => getComputedStyle(document.querySelector('.gd-tabbar')).display !== 'none'), '휴대폰 하단 탭');
  await M.shot('a11-mobile-dashboard', [['.gd-stats', 1], ['#filterForm', 2], ['.tbl tbody tr', 3], ['.gd-tabbar', 4], ['.gd-admin-tools', 5]]);
  await M.p.locator('.tbl tbody a', { hasText: code }).click(); await M.p.waitForSelector('form[data-item]');
  await M.shot('a12-mobile-detail', [['form[data-item] [name=status]', 1], ['form[data-item] [name=publicNotice]', 2], ['form[data-item] [data-save]', 3], ['form[data-item] summary', 4]], { from: 'form[data-item]' });
  await M.ctx.close();
} catch (e) { fails.push('중단: ' + String(e).slice(0, 300)); }

await browser.close(); srv.close(); db.close(); fs.rmSync(dir, { recursive: true, force: true });
console.log(JSON.stringify({ code, images: fs.readdirSync(OUT).length, fails }, null, 1));
process.exit(fails.length ? 1 : 0);
