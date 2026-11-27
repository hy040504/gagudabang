import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { purgeExpiredIdempotency } from './db.js';
import { smsFromEnv } from './services/sms.js';

// 운영 환경에서는 기본 관리자 비밀번호와 임시 서명 키로 뜨지 않게 막는다 (로컬 개발과 테스트는 그대로 동작)
if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_PASSWORD || !process.env.SESSION_SECRET)) {
  console.error('운영 환경에서는 ADMIN_PASSWORD와 SESSION_SECRET 환경 변수를 반드시 지정해야 합니다.');
  process.exit(1);
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); // dist/server → 프로젝트 루트
const { app, db } = createApp({
  dataDir: path.join(root, 'data'),
  publicDir: path.join(root, 'public'),
  adminId: process.env.ADMIN_ID,
  adminPassword: process.env.ADMIN_PASSWORD,
  secret: process.env.SESSION_SECRET,
  sms: smsFromEnv(),
});

// FN-26: 24시간 지난 멱등성 키 정리 (1시간 주기)
const purge = () => { purgeExpiredIdempotency(db); };
purge();
const timer = setInterval(purge, 3600_000);
timer.unref();

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => console.log(`가구다방 서버 기동: http://127.0.0.1:${port}`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
