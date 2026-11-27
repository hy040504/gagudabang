import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { ADMIN_PW, applicationForm, client, startServer, validPayload } from './helpers.js';

/** 솔라피를 흉내 내는 가짜 발송 서버. 받은 요청을 모아 두고, reply를 바꿔 실패 응답도 낸다. */
function fakeProvider() {
  const got: { auth: string; body: any }[] = [];
  const state = { status: 200, reply: { failedMessageList: [], groupInfo: {} } as unknown };
  const srv = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      got.push({ auth: String(req.headers.authorization), body: JSON.parse(raw) });
      res.writeHead(state.status, { 'Content-Type': 'application/json' }).end(JSON.stringify(state.reply));
    });
  }).listen(0);
  return { got, state, url: `http://127.0.0.1:${(srv.address() as AddressInfo).port}/send`, close: () => srv.close() };
}

describe('문자 발송', () => {
  test('관리자가 보낸 문구가 신청자 번호로 나가고 이력에 남는다', async () => {
    const sp = fakeProvider();
    const s = startServer(undefined, { sms: { apiKey: 'KEY', apiSecret: 'SECRET', sender: '0212345678', endpoint: sp.url } });
    try {
      const guest = client(s.base), admin = client(s.base);
      assert.equal((await guest.call('POST', '/api/applications', undefined, { form: applicationForm(validPayload()) })).status, 201);
      const send = (c: ReturnType<typeof client>, itemId: number, text: unknown) => c.call('POST', `/api/admin/items/${itemId}/sms`, { text });
      assert.equal((await send(admin, 1, '안내')).status, 401, '로그인 전에는 보낼 수 없다');
      await admin.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW });
      const detail = (await admin.call('GET', '/api/admin/applications/1')).json.data;
      assert.equal(detail.smsEnabled, true);
      const itemId: number = detail.application.items[0].id;

      assert.equal((await send(admin, itemId, '  ')).status, 422, '빈 문구');
      assert.equal((await send(admin, itemId, 'a'.repeat(1001))).status, 422, '너무 긴 문구');
      assert.equal((await send(admin, 9999, '안내')).status, 404, '없는 품목');
      assert.equal(sp.got.length, 0, '검증에 걸린 요청은 발송 서버로 가지 않는다');

      assert.equal((await send(admin, itemId, '[가구다방] 접수되었습니다.')).status, 200);
      const { auth, body } = sp.got[0]!;
      assert.deepEqual(body, { messages: [{ to: '01012345678', from: '0212345678', text: '[가구다방] 접수되었습니다.' }] });
      const m = /^HMAC-SHA256 apiKey=KEY, date=(\S+), salt=(\w+), signature=(\w+)$/.exec(auth);
      assert.ok(m, auth);
      assert.equal(m[3], crypto.createHmac('sha256', 'SECRET').update(m[1]! + m[2]!).digest('hex'), '서명은 날짜와 소금값으로 만든다');

      // 발송 서버가 거절하면 502이고 이력에 남기지 않는다
      sp.state.reply = { failedMessageList: [{ statusMessage: '발신번호 미등록' }] };
      const failed = await send(admin, itemId, '두 번째');
      assert.equal(failed.status, 502);
      assert.match(failed.json.error.message, /발신번호 미등록/);
      sp.state.status = 401; sp.state.reply = { errorMessage: '인증 실패' };
      assert.equal((await send(admin, itemId, '세 번째')).status, 502);

      const history = (await admin.call('GET', '/api/admin/applications/1')).json.data.history as { actionType: string; note: string }[];
      const sent = history.filter((h) => h.actionType === 'SMS_SENT');
      assert.equal(sent.length, 1);
      assert.match(sent[0]!.note, /01012345678.*접수되었습니다/);
      assert.ok(history.some((h) => h.actionType === 'CREATED'), '기존 이력도 그대로 보인다');
    } finally { s.close(); sp.close(); }
  });

  test('발송 설정이 없으면 503이고 화면에는 꺼짐으로 알린다', async () => {
    const s = startServer();
    try {
      const guest = client(s.base), admin = client(s.base);
      await guest.call('POST', '/api/applications', undefined, { form: applicationForm(validPayload()) });
      await admin.call('POST', '/api/admin/login', { loginId: 'admin', password: ADMIN_PW });
      assert.equal((await admin.call('GET', '/api/admin/applications/1')).json.data.smsEnabled, false);
      const r = await admin.call('POST', '/api/admin/items/1/sms', { text: '안내' });
      assert.equal(r.status, 503);
      assert.equal(r.json.error.code, 'SMS_NOT_CONFIGURED');
    } finally { s.close(); }
  });
});
