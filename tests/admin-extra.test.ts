import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_PW, applicationForm, client, startServer, validPayload } from './helpers.js';

describe('관리자: 직접 추가하는 일정과 통계', () => {
  test('일정을 추가하면 그 달 일정에 나오고, 지우면 사라진다', async () => {
    const s = startServer();
    try {
      const admin = client(s.base);
      assert.equal((await admin.call('POST', '/api/admin/events', { date: '2099-12-10', title: '차량 점검' })).status, 401, '로그인 전');
      await admin.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW });
      for (const bad of [{ date: '2099-13-40', title: '점검' }, { date: '2099-12-10', title: '  ' }, { date: '2099-12-10', title: 'a'.repeat(101) }]) {
        assert.equal((await admin.call('POST', '/api/admin/events', bad)).status, 422, JSON.stringify(bad).slice(0, 40));
      }
      const made = await admin.call('POST', '/api/admin/events', { date: '2099-12-10', title: ' 차량 점검 ' });
      assert.equal(made.status, 201);
      const id: number = made.json.data.event.id;
      const month = async (m: string) => (await admin.call('GET', `/api/admin/schedule?month=${m}`)).json.data.events as { kind: string; label: string; date: string; eventId?: number }[];
      assert.deepEqual((await month('2099-12')).filter((e) => e.kind === 'CUSTOM').map((e) => [e.date, e.label, e.eventId]), [['2099-12-10', '차량 점검', id]]);
      assert.equal((await month('2099-11')).length, 0, '다른 달에는 나오지 않는다');
      assert.equal((await admin.call('DELETE', `/api/admin/events/${id}`)).status, 200);
      assert.equal((await admin.call('DELETE', `/api/admin/events/${id}`)).status, 404, '이미 지운 일정');
      assert.equal((await month('2099-12')).length, 0);
      // 점 색: #rrggbb만 받고, 일정에 그대로 돌려준다. 고르지 않으면 빈 값(기본 회색)
      for (const color of ['red', '#12345', '#12345g', 'url(x)']) assert.equal((await admin.call('POST', '/api/admin/events', { date: '2099-12-11', title: '색', color })).status, 422, color);
      assert.equal((await admin.call('POST', '/api/admin/events', { date: '2099-12-11', title: '파란 일정', color: '#2563EB' })).status, 201);
      assert.equal((await admin.call('POST', '/api/admin/events', { date: '2099-12-12', title: '기본 일정' })).status, 201);
      assert.deepEqual((await month('2099-12')).map((e: { label: string; color?: string }) => [e.label, e.color]), [['파란 일정', '#2563eb'], ['기본 일정', '']]);
    } finally { s.close(); }
  });

  test('통계는 고른 기간의 접수와 방문을 날짜별로 센다', async () => {
    const s = startServer();
    try {
      const guest = client(s.base), admin = client(s.base);
      assert.equal((await admin.call('GET', '/api/admin/stats')).status, 401, '로그인 전');
      await guest.call('POST', '/api/applications', undefined, { form: applicationForm(validPayload()) });
      await guest.call('POST', '/api/applications', undefined, { form: applicationForm(validPayload({ items: [{ category: 'BED', itemName: '침대', conditionGrade: 'GOOD', customerPreference: 'CONSULT' }] })) });
      for (const path of ['home', 'apply', 'Bad Path!']) assert.equal((await guest.call('POST', '/api/visit', { path })).status, 204);
      await client(s.base).call('POST', '/api/visit', { path: 'home' }, { headers: { 'User-Agent': 'other-browser' } });
      await admin.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW });
      const st = (await admin.call('GET', '/api/admin/stats?period=7d')).json.data;
      assert.equal(st.unit, 'day');
      assert.equal(st.series.length, 7, '빈 날도 빠짐없이');
      assert.deepEqual([st.totals.applications, st.totals.items, st.totals.smsSent], [2, 3, 0]);
      assert.deepEqual([st.current.applications, st.current.items, st.current.visitors, st.current.pageviews], [2, 3, 2, 4]);
      assert.deepEqual(st.today, { visitors: 2, pageviews: 4 });
      assert.deepEqual(st.previous, { applications: 0, items: 0, visitors: 0, pageviews: 0 });
      assert.deepEqual(st.byStatus, { PENDING: 3 });
      // 접수 목록의 품목마다 사진 주소가 따라온다 (목록의 작은 사진)
      const list = (await admin.call('GET', '/api/admin/applications?page=1')).json.data.items as { items: { photos: string[] }[] }[];
      assert.deepEqual(list.flatMap((a) => a.items.map((i) => i.photos.length)), [1, 1, 1]);
      assert.match(list[0]!.items[0]!.photos[0]!, /^\/api\/uploads\/[0-9a-f-]{36}\.jpg$/);
      assert.deepEqual(st.byCategory, { BED: 1, DINING: 1, SOFA: 1 });
      assert.equal(st.byHandling.UNDECIDED, 3);
      const last = st.series.at(-1);
      assert.deepEqual([last.applications, last.visitors, last.pageviews], [2, 2, 4], '오늘 칸');
      const months = (await admin.call('GET', '/api/admin/stats?period=12m')).json.data;
      assert.deepEqual([months.unit, months.series.length], ['month', 12]);
      const all = (await admin.call('GET', '/api/admin/stats?period=all')).json.data;
      assert.deepEqual([all.unit, all.previous, all.series.length], ['year', null, 1]);
      assert.equal((await admin.call('GET', '/api/admin/stats?period=zzz')).json.data.period, '30d', '모르는 기간은 30일');
    } finally { s.close(); }
  });
});
