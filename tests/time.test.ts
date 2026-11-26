import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { purgeExpiredIdempotency } from '../src/server/db.js';
import { ADMIN_PW, applicationForm, client, startServer, validPayload } from './helpers.js';

/** 주입 가능한 가짜 시계. 초기값은 UTC 기준이며 KST = UTC+9. */
const fakeClock = (iso: string) => {
  let t = Date.parse(iso);
  return { now: () => t, advance: (ms: number) => { t += ms; } };
};
const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN;

const post = (c: ReturnType<typeof client>, payload: unknown, idem?: string) =>
  c.call('POST', '/api/applications', undefined, { form: applicationForm(payload), headers: idem ? { 'Idempotency-Key': idem } : {} });
const dd = (s: string) => ({ movingDate: s, preferredPickupDate: s });

describe('잠금·쿠키 만료 (FN-16, FN-10)', () => {
  test('관리자 로그인 잠금은 60초 뒤 풀린다', async () => {
    const clk = fakeClock('2099-12-20T03:00:00Z');
    const s = startServer(clk.now);
    try {
      const c = client(s.base);
      for (let i = 0; i < 5; i++) await c.call('POST', '/api/admin/login', { loginId: 'admin', password: 'bad' });
      assert.equal((await c.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW })).status, 429);
      clk.advance(59 * SEC);
      assert.equal((await c.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW })).status, 429, '59초: 아직 잠금');
      clk.advance(2 * SEC);
      assert.equal((await c.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW })).status, 200, '61초: 해제');
    } finally { s.close(); }
  });

  test('잠금 해제 직후 1회 실패로 곧바로 재잠금되지 않는다 (카운터 재시작)', async () => {
    const clk = fakeClock('2099-12-20T03:00:00Z');
    const s = startServer(clk.now);
    try {
      const c = client(s.base);
      for (let i = 0; i < 5; i++) await c.call('POST', '/api/admin/login', { loginId: 'admin', password: 'bad' });
      clk.advance(61 * SEC);
      assert.equal((await c.call('POST', '/api/admin/login', { loginId: 'admin', password: 'bad' })).status, 401);
      assert.equal((await c.call('POST', '/api/admin/login', { loginId: 'admin', password: 'bad' })).status, 401);
    } finally { s.close(); }
  });

  test('조회 쿠키(fr_lookup)는 30분, 관리자 쿠키는 12시간 뒤 만료된다', async () => {
    const clk = fakeClock('2099-12-20T03:00:00Z');
    const s = startServer(clk.now);
    try {
      const guest = client(s.base);
      const created = await post(guest, validPayload());
      assert.equal(created.status, 201);
      const lk = await guest.call('POST', '/api/applications/lookup', { identifier: created.json.data.requestCode, pin: '4321' });
      assert.equal(lk.status, 200);
      const admin = client(s.base);
      await admin.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW });
      s.db.prepare("INSERT INTO item_photos (item_id, stored_name, original_name, mime_type, byte_size) VALUES (1, '00000000-0000-0000-0000-000000000001.jpg', 'a.jpg', 'image/jpeg', 1)").run();
      const url = '/api/uploads/00000000-0000-0000-0000-000000000001.jpg';
      // 파일이 없어도 권한 판정은 먼저이므로 404/404를 구분하려면 파일을 만든다
      const fs = await import('node:fs'); const path = await import('node:path');
      fs.mkdirSync(path.join(s.dir, 'uploads'), { recursive: true });
      fs.writeFileSync(path.join(s.dir, 'uploads', '00000000-0000-0000-0000-000000000001.jpg'), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));

      clk.advance(29 * MIN);
      assert.equal((await guest.call('GET', url)).status, 200, '29분: 조회 쿠키 유효');
      assert.equal((await admin.call('GET', '/api/admin/applications')).status, 200);
      clk.advance(2 * MIN);
      assert.equal((await guest.call('GET', url)).status, 404, '31분: 조회 쿠키 만료');
      assert.equal((await admin.call('GET', url)).status, 200, '31분: 관리자는 유효');
      clk.advance(11 * HOUR + 30 * MIN);
      assert.equal((await admin.call('GET', '/api/admin/applications')).status, 401, '12시간 초과: 관리자 쿠키 만료');
    } finally { s.close(); }
  });
});

describe('Asia/Seoul 날짜 경계 (FN-07/08)', () => {
  test('KST 자정 직전엔 오늘 이사일이 허용되고, 자정이 지나면 422', async () => {
    const clk = fakeClock('2099-12-28T14:59:00Z'); // 2099-12-28 23:59 KST
    const s = startServer(clk.now);
    try {
      const c = client(s.base);
      assert.equal((await post(c, validPayload(dd('2099-12-28')))).status, 201);
      clk.advance(2 * MIN); // 2099-12-29 00:01 KST
      const late = await post(c, validPayload(dd('2099-12-28')));
      assert.equal(late.status, 422);
      assert.ok(late.json.error.fieldErrors.movingDate);
      assert.equal((await post(c, validPayload(dd('2099-12-29')))).status, 201);
    } finally { s.close(); }
  });

  test('접수번호의 날짜는 UTC가 아니라 KST 기준이고 일련번호는 날짜별로 다시 시작한다', async () => {
    const clk = fakeClock('2099-12-28T14:30:00Z'); // KST 12-28 23:30
    const s = startServer(clk.now);
    try {
      const c = client(s.base);
      const p = validPayload(dd('2099-12-31'));
      assert.equal((await post(c, p)).json.data.requestCode, 'FR-20991228-001');
      assert.equal((await post(c, p)).json.data.requestCode, 'FR-20991228-002');
      clk.advance(HOUR); // KST 12-29 00:30 (UTC로는 15:30 → 같은 UTC 날짜 28일)
      assert.equal((await post(c, p)).json.data.requestCode, 'FR-20991229-001');
    } finally { s.close(); }
  });
});

describe('D-day 경보·KPI (1.5절, FN-17)', () => {
  test('이사일 D-3 이내·판매마감 D-1 이내/경과·7일 내 반출예정이 정확한 경계에서 집계된다', async () => {
    const clk = fakeClock('2099-12-28T15:10:00Z'); // KST 2099-12-29
    const s = startServer(clk.now);
    try {
      const guest = client(s.base), admin = client(s.base);
      await admin.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW });
      const mk = async (moving: string, items: number) => (await post(guest, validPayload({ ...dd('2099-12-29'), movingDate: moving, items: Array.from({ length: items }, (_, i) => ({ category: 'ETC', itemName: `품목${i}`, conditionGrade: 'GOOD', customerPreference: 'RESALE' })) }))).status;
      assert.equal(await mk('2100-01-01', 4), 201); // 앱1: D-3 → 임박. 품목1~4: 마감 경계 검증
      assert.equal(await mk('2100-01-05', 3), 201); // 앱2: D-7 → 임박 아님. 품목5~7: 반출 경계 검증
      assert.equal(await mk('2099-12-30', 1), 201); // 앱3: D-1 이지만 곧 전부 종결 → 제외
      const set = (id: number, status: string, handling: string, deadline: string, pickup: string) =>
        s.db.prepare('UPDATE application_items SET status = ?, handling_type = ?, sale_deadline = ?, pickup_schedule = ? WHERE id = ?').run(status, handling, deadline, pickup, id);
      set(1, 'IN_PROGRESS', 'RESALE', '2099-12-30', '');  // D+1 → 알림
      set(2, 'IN_PROGRESS', 'RESALE', '2099-12-29', '');  // D+0 → 알림
      set(3, 'IN_PROGRESS', 'RESALE', '2099-12-28', '');  // 경과 → 알림
      set(4, 'IN_PROGRESS', 'RESALE', '2100-01-01', '');  // D+3 → 알림 아님
      set(5, 'SCHEDULED', 'DISPOSE', '', '2100-01-05 10:00'); // D+7 → 포함
      set(6, 'SCHEDULED', 'DISPOSE', '', '2100-01-06 10:00'); // D+8 → 제외
      set(7, 'SCHEDULED', 'DISPOSE', '', '2099-12-28 10:00'); // 과거 → 제외
      set(8, 'COMPLETED', 'DISPOSE', '', '');
      set(8 + 0, 'COMPLETED', 'DISPOSE', '', ''); // 앱3(품목8) 종결 → 이사일 임박 집계에서 제외

      const r = await admin.call('GET', '/api/admin/applications');
      assert.equal(r.status, 200);
      assert.deepEqual(r.json.data.kpis, { pendingItems: 0, movingSoonApplications: 1, deadlineAlertItems: 3, pickupIn7DaysItems: 1 });
      const byCode = new Map<string, any>(r.json.data.items.map((a: any) => [a.requestCode, a]));
      const [a1, a2, a3] = [...byCode.values()].sort((x, y) => x.id - y.id);
      assert.equal(a1.movingDday, 3);
      assert.equal(a2.movingDday, 7);
      assert.equal(a3.movingDday, null, '전 품목 종결이면 D-day 없음');
      assert.deepEqual(a1.items.map((i: any) => i.deadlineDday), [1, 0, -1, 3]);
    } finally { s.close(); }
  });

  test('시연 데이터 제외 시 KPI에서도 빠진다', async () => {
    const clk = fakeClock('2099-12-28T15:10:00Z');
    const s = startServer(clk.now);
    try {
      const admin = client(s.base);
      await admin.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW });
      await post(client(s.base), validPayload({ ...dd('2099-12-30') }));
      assert.equal((await admin.call('GET', '/api/admin/applications')).json.data.kpis.movingSoonApplications, 1);
      s.db.prepare('UPDATE applications SET is_demo = 1').run();
      const hidden = await admin.call('GET', '/api/admin/applications?hideDemo=1');
      assert.equal(hidden.json.data.kpis.movingSoonApplications, 0);
      assert.equal(hidden.json.data.kpis.pendingItems, 0);
    } finally { s.close(); }
  });
});

describe('멱등성 키 정리 (FN-26)', () => {
  test('24시간이 지난 키만 삭제되고, 삭제 뒤 같은 키는 새 신청으로 처리된다', async () => {
    const s = startServer();
    try {
      const c = client(s.base);
      const first = await post(c, validPayload(), 'purge-key');
      assert.equal(first.status, 201);
      const keyCount = () => (s.db.prepare('SELECT COUNT(*) AS c FROM idempotency_keys').get() as { c: number }).c;
      assert.equal(purgeExpiredIdempotency(s.db, Date.now() + 23 * HOUR), 0, '23시간: 보존');
      assert.equal(keyCount(), 1);
      assert.equal((await post(c, validPayload(), 'purge-key')).json.data.requestCode, first.json.data.requestCode, '정리 전: 같은 접수번호');
      assert.equal(purgeExpiredIdempotency(s.db, Date.now() + 25 * HOUR), 1, '25시간: 삭제');
      assert.equal(keyCount(), 0);
      const again = await post(c, validPayload(), 'purge-key');
      assert.notEqual(again.json.data.requestCode, first.json.data.requestCode, '정리 후: 새 신청');
    } finally { s.close(); }
  });
});
