import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app.js';
import { purgeExpiredIdempotency } from './db.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..'); // dist/server → 프로젝트 루트
const { app, db } = createApp({
  dataDir: path.join(root, 'data'),
  publicDir: path.join(root, 'public'),
  adminId: process.env.ADMIN_ID,
  adminPassword: process.env.ADMIN_PASSWORD,
  secret: process.env.SESSION_SECRET,
});

// FN-26: 24시간 지난 멱등성 키 정리 (1시간 주기)
const purge = () => { purgeExpiredIdempotency(db); };
purge();
const timer = setInterval(purge, 3600_000);
timer.unref();

const port = Number(process.env.PORT) || 3000;
const server = app.listen(port, () => console.log(`가구다방 서버 기동: http://127.0.0.1:${port}`));
for (const sig of ['SIGINT', 'SIGTERM'] as const) process.on(sig, () => server.close(() => { db.close(); process.exit(0); }));
