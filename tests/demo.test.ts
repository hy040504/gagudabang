import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { ADMIN_PW, client, startServer } from './helpers.js';
import { DEMO_COUNT, DEMO_PIN, clearDemoData, demoPhotoLoader, seedDemoData } from '../src/server/demo.js';

test('예시 데이터: 접수 목록·진행 조회·사진·통계에 나오고, 한 번만 들어간다', async () => {
  const s = startServer(undefined, { demoData: true, publicDir: path.join(process.cwd(), 'public'), testAccount: true });
  try {
    const admin = client(s.base);
    await admin.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW });
    const list = (await admin.call('GET', '/api/admin/applications?page=1')).json.data;
    assert.equal(list.total, DEMO_COUNT);
    assert.ok(list.kpis.movingSoonApplications >= 1 && list.kpis.deadlineAlertItems >= 1 && list.kpis.pendingItems >= 1, '목록 위 경보 숫자가 0이 아니다');

    // 고객은 연락처와 PIN으로 조회하고 자기 사진을 본다
    const guest = client(s.base);
    const found = await guest.call('POST', '/api/applications/lookup', { identifier: '010-2965-3174', pin: DEMO_PIN });
    assert.equal(found.status, 200);
    const photo = found.json.data.applications[0].items[0].photos[0].url as string;
    const img = await guest.call('GET', photo);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/jpeg');

    // 테스트 회원(abcd)의 마이페이지에 연결된 예시 접수가 있다
    const member = client(s.base);
    await member.call('POST', '/api/auth/login', { identifier: 'abcd', password: '1234' });
    assert.equal((await member.call('GET', '/api/my/applications')).json.data.applications.length, 2);

    const st = (await admin.call('GET', '/api/admin/stats?period=12m')).json.data;
    assert.ok(st.current.visitors > 1000 && st.current.pageviews > st.current.visitors, '방문 기록');
    assert.ok(Object.values(st.byStatus as Record<string, number>).reduce((a, b) => a + b, 0) > 0);

    assert.equal(await seedDemoData(s.db, path.join(s.dir, 'uploads'), demoPhotoLoader(path.join(process.cwd(), 'public'))), false, '두 번째는 넣지 않는다');
    assert.equal((s.db.prepare('SELECT COUNT(*) AS c FROM applications').get() as { c: number }).c, DEMO_COUNT);

    // 지우기: 실제 접수는 남기고 예시만 지운다. 지운 뒤에는 다시 넣지 않는다.
    await guest.call('POST', '/api/visit', { path: 'home' });
    s.db.prepare("UPDATE applications SET is_demo = 0 WHERE phone = '01029653174'").run(); // 실제 고객의 접수라고 치고 남는지 본다
    const uploads = path.join(s.dir, 'uploads');
    const r = clearDemoData(s.db, uploads);
    assert.deepEqual([r.applications, r.events], [DEMO_COUNT - 1, 3]);
    assert.ok(r.files > 0 && r.visits > 1000);
    const left = s.db.prepare('SELECT COUNT(*) AS c FROM applications').get() as { c: number };
    assert.equal(left.c, 1, '실제 접수는 남는다');
    assert.equal((s.db.prepare('SELECT COUNT(*) AS c FROM visits').get() as { c: number }).c, 1, '실제 방문 기록은 남는다');
    assert.equal((s.db.prepare('SELECT COUNT(*) AS c FROM custom_events').get() as { c: number }).c, 0);
    assert.equal((await guest.call('GET', photo)).status, 200, '남은 접수의 사진은 그대로');
    assert.equal(await seedDemoData(s.db, uploads, demoPhotoLoader(path.join(process.cwd(), 'public'))), false, '지운 뒤에도 다시 넣지 않는다');
  } finally { s.close(); }
});
