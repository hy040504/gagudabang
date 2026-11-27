import test, { after, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { ADMIN_PW, GPS_MARK, applicationForm, client, jpegWithGps, startServer, validPayload } from './helpers.js';

const srv = startServer();
const guest = client(srv.base); // 비회원 신청자
const admin = client(srv.base);
let code = '';

const createApp = (payload = validPayload(), idem?: string, files?: Parameters<typeof applicationForm>[1]) =>
  guest.call('POST', '/api/applications', undefined, { form: applicationForm(payload, files), headers: idem ? { 'Idempotency-Key': idem } : {} });
const count = (t: string) => (srv.db.prepare(`SELECT COUNT(*) AS c FROM ${t}`).get() as { c: number }).c;
const uploads = () => { try { return fs.readdirSync(path.join(srv.dir, 'uploads')).length; } catch { return 0; } };

after(() => srv.close());

describe('신청 접수 (FN-06~10)', () => {
  test('다품목+사진 신청이 단일 트랜잭션으로 저장되고 접수번호가 발급된다', async () => {
    const r = await createApp(validPayload(), 'idem-1');
    assert.equal(r.status, 201);
    code = r.json.data.requestCode;
    assert.match(code, /^FR-\d{8}-001$/);
    assert.equal(r.json.data.itemCount, 2);
    assert.equal(count('application_items'), 2);
    assert.equal(count('item_photos'), 2);
    assert.equal(count('status_history'), 1);
  });

  test('같은 Idempotency-Key 재전송은 신청을 만들지 않고 같은 접수번호를 돌려준다', async () => {
    const r = await createApp(validPayload(), 'idem-1');
    assert.equal(r.status, 201);
    assert.equal(r.json.data.requestCode, code);
    assert.equal(count('applications'), 1);
    assert.equal(uploads(), 2, '재전송 시 사진이 추가 저장되면 안 된다');
  });

  test('희망 반출일이 이사일보다 늦으면 422 + fieldErrors', async () => {
    const r = await createApp(validPayload({ movingDate: '2099-12-30', preferredPickupDate: '2099-12-31' }));
    assert.equal(r.status, 422);
    assert.equal(r.json.error.code, 'VALIDATION_ERROR');
    assert.ok(r.json.error.fieldErrors.preferredPickupDate);
  });

  test('과거 이사일·필수값 누락·잘못된 PIN·미동의는 422', async () => {
    for (const bad of [{ movingDate: '2000-01-01' }, { applicantName: '' }, { pin: '12' }, { privacyConsented: false }, { items: [] }]) {
      assert.equal((await createApp(validPayload(bad))).status, 422, JSON.stringify(bad));
    }
    assert.equal(count('applications'), 1);
  });

  test('사진이 없는 품목이 있으면 422로 거부하고 어느 품목인지 알려 준다', async () => {
    const r = await createApp(validPayload(), undefined, [['photos_0', jpegWithGps(), 'only-first.jpg']]);
    assert.equal(r.status, 422);
    assert.deepEqual(Object.keys(r.json.error.fieldErrors), ['items.1.photos']);
    assert.equal(count('applications'), 1);
    assert.equal(uploads(), 2, '거부된 접수의 사진은 저장되지 않아야 한다');
  });
  test('위장 파일은 415로 거부되고 DB·디스크에 아무것도 남지 않는다 (FN-09 롤백)', async () => {
    const r = await createApp(validPayload(), undefined, [['photos_0', jpegWithGps(), 'ok.jpg'], ['photos_1', Buffer.from('<html>'), 'fake.jpg']]);
    assert.equal(r.status, 415);
    assert.equal(r.json.error.code, 'UNSUPPORTED_MEDIA');
    assert.equal(count('applications'), 1);
    assert.equal(uploads(), 2, '먼저 저장된 정상 파일도 롤백되어야 한다');
  });

  test('저장된 JPEG에는 GPS가 없다', () => {
    const name = (srv.db.prepare('SELECT stored_name FROM item_photos').get() as { stored_name: string }).stored_name;
    assert.match(name, /^[0-9a-f-]{36}\.jpg$/);
    assert.ok(!fs.readFileSync(path.join(srv.dir, 'uploads', name)).includes(GPS_MARK));
  });

  test('payload가 JSON이 아니면 400, 사진이 10MB를 넘으면 413', async () => {
    const bad = new FormData(); bad.set('payload', '{not json');
    assert.equal((await guest.call('POST', '/api/applications', undefined, { form: bad })).status, 400);
    const big = Buffer.concat([jpegWithGps(), Buffer.alloc(10 * 1024 * 1024 + 1)]);
    assert.equal((await createApp(validPayload(), undefined, [['photos_0', big, 'big.jpg']])).status, 413);
  });
});

describe('비회원 PIN 조회와 격리 (FN-10/11/15)', () => {
  test('틀린 PIN·없는 번호는 모두 같은 404', async () => {
    const a = await guest.call('POST', '/api/applications/lookup', { identifier: code, pin: '0000' });
    const b = await guest.call('POST', '/api/applications/lookup', { identifier: 'FR-20000101-999', pin: '4321' });
    assert.equal(a.status, 404); assert.equal(b.status, 404);
    assert.equal(a.json.error.message, b.json.error.message, '존재 여부 추측이 가능하면 안 된다');
  });

  test('올바른 연락처+PIN 조회 응답에는 내부 메모·PIN 해시가 어디에도 없다', async () => {
    srv.db.prepare("UPDATE applications SET admin_memo = 'SECRET-APP-MEMO'").run();
    srv.db.prepare("UPDATE application_items SET admin_item_memo = 'SECRET-ITEM-MEMO'").run();
    const r = await guest.call('POST', '/api/applications/lookup', { identifier: '01012345678', pin: '4321' });
    assert.equal(r.status, 200);
    assert.ok(r.headers.getSetCookie().some((c) => c.startsWith('fr_lookup=')));
    const body = r.text;
    for (const leak of ['SECRET-APP-MEMO', 'SECRET-ITEM-MEMO', 'adminMemo', 'adminItemMemo', 'admin_memo', 'pin_hash', 'pinHash', 'lookup_pin', 'password']) {
      assert.ok(!body.toLowerCase().includes(leak.toLowerCase()), `노출: ${leak}`);
    }
    assert.equal(r.json.data.applications[0].items.length, 2);
  });

  test('사진은 본인(lookup 쿠키)만 열람, 타인·비로그인은 404, 헤더는 nosniff', async () => {
    const lk = await guest.call('POST', '/api/applications/lookup', { identifier: code, pin: '4321' });
    const url: string = lk.json.data.applications[0].items[0].photos[0].url;
    const own = await guest.call('GET', url);
    assert.equal(own.status, 200);
    assert.equal(own.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(own.headers.get('content-type'), 'image/jpeg');
    assert.equal((await client(srv.base).call('GET', url)).status, 404);
    assert.equal((await client(srv.base).call('GET', '/api/uploads/00000000-0000-0000-0000-000000000000.jpg')).status, 404);
    assert.equal((await client(srv.base).call('GET', '/api/uploads/..%2f..%2fsecret.jpg')).status, 404);
  });

  test('PIN 5회 연속 실패 시 올바른 PIN도 잠금(429)', async () => {
    const attacker = client(srv.base);
    for (let i = 0; i < 5; i++) assert.equal((await attacker.call('POST', '/api/applications/lookup', { identifier: code, pin: '999' + i })).status, 404);
    assert.equal((await attacker.call('POST', '/api/applications/lookup', { identifier: code, pin: '4321' })).status, 429);
  });
});

describe('관리자 처리·상태 전이·동시성 (FN-16/20/22)', () => {
  let items: { id: number; version: number }[] = [];
  const patch = (it: { id: number; version: number }, over: Record<string, unknown> = {}) =>
    admin.call('PATCH', `/api/admin/items/${it.id}`, { handlingType: 'RESALE', status: 'IN_PROGRESS', saleDeadline: '2099-12-10', pickupSchedule: '', publicNotice: '', adminItemMemo: '', version: it.version, ...over });

  before(async () => {
    assert.equal((await admin.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW })).status, 200);
  });

  test('관리자 API는 로그인 없이 401', async () => {
    for (const u of ['/api/admin/applications', '/api/admin/schedule', '/api/admin/applications/1', '/api/admin/export/csv']) {
      assert.equal((await client(srv.base).call('GET', u)).status, 401, u);
    }
  });

  test('관리자 상세에는 내부 메모가 포함된다', async () => {
    const d = await admin.call('GET', '/api/admin/applications/1');
    assert.equal(d.json.data.application.adminMemo, 'SECRET-APP-MEMO');
    items = d.json.data.application.items;
    assert.equal(items.length, 2);
    assert.ok(d.json.data.history.length >= 1);
  });

  test('SCHEDULED는 확정 반출일 필수, 판매 마감일은 이사일 이전, 취소는 사유 필수 → 422', async () => {
    assert.equal((await patch(items[1]!, { status: 'SCHEDULED' })).status, 422);
    assert.equal((await patch(items[0]!, { saleDeadline: '2100-01-01' })).status, 422);
    assert.equal((await patch(items[0]!, { status: 'CANCELED' })).status, 422);
  });

  test('저장하면 version이 오르고 이력이 남으며, 구 version 저장은 409 VERSION_CONFLICT', async () => {
    const ok = await patch(items[0]!);
    assert.equal(ok.status, 200);
    assert.equal(ok.json.data.item.version, items[0]!.version + 1);
    assert.equal(ok.json.data.historyEntry.actionType, 'ITEM_UPDATED');
    const stale = await patch(items[0]!);
    assert.equal(stale.status, 409);
    assert.equal(stale.json.error.code, 'VERSION_CONFLICT');
  });

  test('종결 상태에서 되돌릴 수 없다 (TRANSITION_DENIED)', async () => {
    const done = await patch(items[1]!, { handlingType: 'DISPOSE', status: 'SCHEDULED', saleDeadline: '', pickupSchedule: '2099-12-15 10:00' });
    assert.equal(done.status, 200);
    const complete = await patch({ id: items[1]!.id, version: done.json.data.item.version }, { handlingType: 'DISPOSE', status: 'COMPLETED', saleDeadline: '' });
    assert.equal(complete.status, 200);
    const back = await patch({ id: items[1]!.id, version: complete.json.data.item.version }, { status: 'IN_PROGRESS' });
    assert.equal(back.status, 409);
    assert.equal(back.json.error.code, 'TRANSITION_DENIED');
  });

  test('캘린더에 이사일·판매마감이 반영된다', async () => {
    const c = await admin.call('GET', '/api/admin/schedule?month=2099-12');
    assert.deepEqual(c.json.data.events.map((e: { kind: string }) => e.kind).sort(), ['DEADLINE', 'MOVING']);
    assert.equal((await admin.call('GET', '/api/admin/schedule?month=bad')).status, 422);
  });

  test('진행 중인 신청은 고객이 취소할 수 없다 (409 TRANSITION_DENIED)', async () => {
    const r = await guest.call('POST', `/api/applications/${code}/cancel`, {});
    assert.equal(r.status, 409);
    assert.equal(r.json.error.code, 'TRANSITION_DENIED');
  });

  test('전 품목 PENDING이면 PIN만으로 취소되고, PIN이 틀리면 404', async () => {
    const other = client(srv.base);
    const c2 = (await createApp(validPayload({ phone: '010-7777-0000' }))).json.data.requestCode as string;
    assert.equal((await other.call('POST', `/api/applications/${c2}/cancel`, { pin: '0000' })).status, 404);
    assert.equal((await other.call('POST', `/api/applications/${c2}/cancel`, { pin: '4321', reason: '일정 변경' })).status, 200);
    const rows = srv.db.prepare('SELECT status FROM application_items WHERE application_id = (SELECT id FROM applications WHERE request_code = ?)').all(c2) as { status: string }[];
    assert.ok(rows.every((x) => x.status === 'CANCELED'));
    assert.equal(srv.db.prepare("SELECT COUNT(*) AS c FROM status_history WHERE action_type = 'CUSTOMER_CANCELED'").get()!['c'], 2);
  });

  test('KPI와 목록 필터·시연 데이터 제외', async () => {
    srv.db.prepare('UPDATE applications SET is_demo = 1 WHERE id = 1').run();
    const all = await admin.call('GET', '/api/admin/applications');
    const hidden = await admin.call('GET', '/api/admin/applications?hideDemo=1');
    assert.ok(all.json.data.total > hidden.json.data.total);
    assert.equal((await admin.call('GET', '/api/admin/applications?q=소파')).json.data.total >= 1, true);
    srv.db.prepare('UPDATE applications SET is_demo = 0 WHERE id = 1').run();
  });

  test('CSV: UTF-8 BOM + 수식 인젝션 방어(=,+,-,@ 앞에 \')', async () => {
    srv.db.prepare("UPDATE applications SET applicant_name = '=cmd|calc' WHERE id = 1").run();
    srv.db.prepare("UPDATE application_items SET item_name = '+SUM(A1)' WHERE id = ?").run(items[0]!.id);
    srv.db.prepare("UPDATE applications SET address = '@evil' WHERE id = 1").run();
    const r = await admin.call('GET', '/api/admin/export/csv');
    assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8');
    assert.deepEqual([...r.bytes.slice(0, 3)], [0xef, 0xbb, 0xbf]);
    for (const v of ["\"'=cmd|calc\"", "\"'+SUM(A1)\"", "\"'@evil\""]) assert.ok(r.text.includes(v), v);
    assert.ok(!/(^|,)"[=+@-]/m.test(r.text.split('\r\n').slice(1).join('\n')), '이스케이프 안 된 수식 셀');
  });
});

describe('회원·쿠키 분리·CSRF·설정', () => {
  const member = client(srv.base);

  test('가입 검증(짧은 비밀번호·중복 번호·아이디 규칙)과 로그인', async () => {
    assert.equal((await member.call('POST', '/api/auth/signup', { username: 'minseo1', phone: '01099998888', password: 'short', name: 'A' })).status, 422);
    for (const bad of [undefined, 'abc', '1minseo', 'min-seo']) { // 가입 요청은 분당 10회 제한이라 경우를 줄였다
      const r = await member.call('POST', '/api/auth/signup', { username: bad, phone: '01099998888', password: 'password1', name: 'A' });
      assert.equal(r.status, 422, `아이디 ${bad}`);
      assert.ok(r.json.error.fieldErrors.username);
    }
    assert.equal((await member.call('POST', '/api/auth/signup', { username: 'MinSeo1', phone: '010-9999-8888', password: 'password1', name: '민서', defaultAddress: '서울' })).status, 201);
    assert.equal((await client(srv.base).call('POST', '/api/auth/signup', { username: 'other1', phone: '01099998888', password: 'password1', name: 'B' })).status, 422, '중복 번호');
    const dup = await client(srv.base).call('POST', '/api/auth/signup', { username: 'minseo1', phone: '01011112222', password: 'password1', name: 'B' });
    assert.equal(dup.status, 422, '중복 아이디');
    assert.ok(dup.json.error.fieldErrors.username);
    assert.equal((await client(srv.base).call('POST', '/api/auth/login', { phone: '01099998888', password: 'wrong-pass' })).status, 401);
    const me = await member.call('GET', '/api/auth/me');
    assert.equal(me.json.data.user.username, 'minseo1', '아이디는 소문자로 저장');
    assert.equal(me.json.data.user.defaultAddress, '서울');
    assert.ok(!JSON.stringify(me.json).includes('password'));
  });

  test('아이디 또는 휴대폰 번호로 로그인한다', async () => {
    const ok = async (body: Record<string, string>) => (await client(srv.base).call('POST', '/api/auth/login', { password: 'password1', ...body }));
    for (const identifier of ['minseo1', 'MINSEO1', ' minseo1 ', '01099998888', '010-9999-8888']) {
      const r = await ok({ identifier });
      assert.equal(r.status, 200, identifier);
      assert.equal(r.json.data.user.username, 'minseo1');
    }
    assert.equal((await ok({ phone: '01099998888' })).status, 200, '이전 요청 형식(phone)');
    assert.equal((await ok({ identifier: 'minseo2' })).status, 401, '없는 아이디');
    assert.equal((await ok({ identifier: 'minseo1', password: 'wrong-pass' })).status, 401);
    assert.equal((await ok({ identifier: 'admin', password: ADMIN_PW })).status, 401, '관리자 계정은 고객 로그인으로 들어올 수 없다');
  });

  test('테스트 계정(abcd / 1234)은 켰을 때만 생기고 그 계정으로 로그인된다', async () => {
    assert.equal((await client(srv.base).call('POST', '/api/auth/login', { identifier: 'abcd', password: '1234' })).status, 401, '기본 서버에는 없다');
    const s = startServer(undefined, { testAccount: true });
    try {
      const r = await client(s.base).call('POST', '/api/auth/login', { identifier: 'abcd', password: '1234' });
      assert.equal(r.status, 200);
      assert.equal(r.json.data.user.name, '김하늘');
      assert.ok(r.json.data.user.defaultAddress);
    } finally { s.close(); }
  });

  test('비회원 신청 건 승계: 틀린 PIN 404, 맞으면 내 목록·사진 열람 가능', async () => {
    assert.equal((await member.call('POST', '/api/my/claim', { requestCode: code, pin: '0000' })).status, 404);
    assert.equal((await member.call('POST', '/api/my/claim', { requestCode: code, pin: '4321' })).status, 200);
    const mine = await member.call('GET', '/api/my/applications');
    assert.equal(mine.json.data.applications.length, 1);
    assert.ok(!mine.text.includes('SECRET-APP-MEMO'));
    const url: string = mine.json.data.applications[0].items[0].photos[0].url;
    assert.equal((await member.call('GET', url)).status, 200);
    assert.equal(srv.db.prepare("SELECT COUNT(*) AS c FROM status_history WHERE action_type = 'CLAIMED'").get()!['c'], 1);
  });

  test('다른 회원은 이미 승계된 건을 가로챌 수 없다', async () => {
    const thief = client(srv.base);
    assert.equal((await thief.call('POST', '/api/auth/signup', { username: 'thief01', phone: '01055556666', password: 'password1', name: '도둑' })).status, 201);
    assert.equal((await thief.call('POST', '/api/my/claim', { requestCode: code, pin: '4321' })).status, 404);
  });

  test('고객 로그아웃은 관리자 세션을 끊지 않고, 고객 쿠키로 관리자 API는 못 연다', async () => {
    const both = client(srv.base);
    await both.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW });
    await both.call('POST', '/api/auth/login', { phone: '01099998888', password: 'password1' });
    await both.call('POST', '/api/auth/logout', {});
    assert.equal((await both.call('GET', '/api/admin/applications')).status, 200);
    assert.equal((await member.call('GET', '/api/admin/applications')).status, 401);
    assert.equal((await both.call('GET', '/api/my/applications')).status, 401);
  });

  test('위조·변조 쿠키는 거부된다', async () => {
    const forged = client(srv.base);
    forged.jar.set('fr_admin', Buffer.from(JSON.stringify({ aid: 1, exp: 9999999999 })).toString('base64url') + '.AAAA');
    assert.equal((await forged.call('GET', '/api/admin/applications')).status, 401);
  });

  test('CSRF: 다른 Origin의 쓰기 요청은 403, 같은 Origin은 통과', async () => {
    const bad = await member.call('POST', '/api/auth/logout', {}, { headers: { Origin: 'http://evil.example' } });
    assert.equal(bad.status, 403);
    assert.equal(bad.json.error.code, 'CSRF_REJECTED');
    assert.equal((await member.call('POST', '/api/auth/logout', {}, { headers: { Origin: srv.base } })).status, 200);
  });

  test('설정: 사업자 정보 저장, 현재 비밀번호 검증 후 변경', async () => {
    assert.equal((await client(srv.base).call('PATCH', '/api/admin/settings', { siteConfig: { phone: '1' } })).status, 401);
    assert.equal((await admin.call('PATCH', '/api/admin/settings', { siteConfig: { phone: '043-000-0000', hacker: 'x' } })).status, 200);
    const cfg = (await client(srv.base).call('GET', '/api/public/config')).json.data;
    assert.equal(cfg.phone, '043-000-0000');
    assert.equal(cfg.companyName, '가구다방');
    assert.equal('hacker' in cfg, false);
    assert.equal((await admin.call('PATCH', '/api/admin/settings', { currentPassword: 'wrong', newPassword: 'newpassw0rd' })).status, 422);
    assert.equal((await admin.call('PATCH', '/api/admin/settings', { currentPassword: ADMIN_PW, newPassword: 'short' })).status, 422);
    assert.equal((await admin.call('PATCH', '/api/admin/settings', { currentPassword: ADMIN_PW, newPassword: 'newpassw0rd' })).status, 200);
    assert.equal((await client(srv.base).call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW })).status, 401);
    assert.equal((await client(srv.base).call('POST', '/api/admin/login', { loginId: 'admin', password: 'newpassw0rd' })).status, 200);
  });

  test('없는 API는 JSON 404, 보안 헤더와 admin noindex', async () => {
    const r = await client(srv.base).call('GET', '/api/nope');
    assert.equal(r.status, 404);
    assert.equal(r.json.ok, false);
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(r.headers.get('x-powered-by'), null);
    assert.equal((await client(srv.base).call('GET', '/api/admin/applications')).headers.get('x-robots-tag'), 'noindex, nofollow');
  });
});

describe('관리자 로그인 잠금 (FN-16)', () => {
  test('5회 연속 실패 시 429 AUTH_LOCKED, 올바른 비밀번호도 잠금 중에는 거부', async () => {
    const s = startServer();
    try {
      const c = client(s.base);
      for (let i = 0; i < 5; i++) assert.equal((await c.call('POST', '/api/admin/login', { loginId: 'admin', password: 'bad' + i })).status, 401);
      const locked = await c.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW });
      assert.equal(locked.status, 429);
      assert.equal(locked.json.error.code, 'AUTH_LOCKED');
      assert.equal((await c.call('GET', '/api/admin/applications')).status, 401);
    } finally { s.close(); }
  });

  test('실패 카운터는 성공 시 초기화된다', async () => {
    const s = startServer();
    try {
      const c = client(s.base);
      for (let i = 0; i < 4; i++) await c.call('POST', '/api/admin/login', { loginId: 'admin', password: 'bad' });
      assert.equal((await c.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW })).status, 200);
      for (let i = 0; i < 4; i++) assert.equal((await c.call('POST', '/api/admin/login', { loginId: 'admin', password: 'bad' })).status, 401);
    } finally { s.close(); }
  });
});
