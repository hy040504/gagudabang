import express, { type NextFunction, type Request, type Response } from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import { ensureAdmin, ensureTestCustomer, openDb, type Db } from './db.js';
import { demoPhotoLoader, seedDemoData } from './demo.js';
import { AppError, Signer, type Clock } from './lib.js';
import { adminRouter } from './routes/admin.js';
import { publicRouter, type Ctx } from './routes/public.js';
import type { SmsConfig } from './services/sms.js';

export interface AppOptions { dataDir: string; publicDir: string; dbFile?: string; adminId?: string; adminPassword?: string; secret?: string; clock?: Clock; sms?: SmsConfig; testAccount?: boolean;
  /** 예시 접수 20건과 방문 기록을 한 번 넣는다. 사진을 파일로 못 읽으면 demoPhotoBase(배포 주소)에서 받는다 */
  demoData?: boolean; demoPhotoBase?: string }

function loadSecret(dataDir: string, given?: string): string {
  if (given) return given;
  const f = path.join(dataDir, '.session-secret');
  if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8');
  fs.mkdirSync(dataDir, { recursive: true });
  const s = crypto.randomBytes(32).toString('hex');
  fs.writeFileSync(f, s);
  return s;
}

export function createApp(opt: AppOptions): { app: express.Express; db: Db; ctx: Ctx; ready: Promise<void> } {
  const db = openDb(opt.dbFile ?? path.join(opt.dataDir, 'gagudabang.sqlite'));
  ensureAdmin(db, opt.adminId ?? 'admin', opt.adminPassword ?? 'admin1234!');
  if (opt.testAccount) ensureTestCustomer(db);
  const clock: Clock = opt.clock ?? Date.now;
  const secret = loadSecret(opt.dataDir, opt.secret);
  const ctx: Ctx = { db, clock, signer: new Signer(secret, clock), uploadDir: path.join(opt.dataDir, 'uploads'), sms: opt.sms, visitSalt: crypto.createHash('sha256').update(`visit:${secret}`).digest('hex') };
  const ready = opt.demoData
    ? seedDemoData(db, ctx.uploadDir, demoPhotoLoader(opt.publicDir, opt.demoPhotoBase), new Date(clock())).then(() => undefined, (e) => console.error('예시 데이터를 넣지 못했습니다:', e))
    : Promise.resolve();

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (req.path.startsWith('/api/admin') || req.path === '/admin' || req.path === '/admin.html') res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    next();
  });
  // FN-25: Origin/Referer 호스트가 서버 호스트와 다르면 차단. 헤더가 아예 없는 비브라우저 호출은 통과(쿠키 기반 CSRF는 브라우저에서만 성립).
  app.use('/api', (req, _res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const src = req.headers.origin ?? req.headers.referer;
    if (src) {
      let host = '';
      try { host = new URL(src).host; } catch { /* 잘못된 값은 불일치로 처리 */ }
      if (host !== req.headers.host) return next(new AppError(403, 'CSRF_REJECTED', '허용되지 않은 요청 출처입니다.'));
    }
    next();
  });
  app.use(express.json({ limit: '100kb' }));
  // 예시 데이터를 넣는 중에는 API 요청을 잠시 기다리게 한다 (첫 화면이 빈 목록으로 뜨지 않게)
  if (opt.demoData) app.use('/api', (_req, _res, next) => { void ready.then(() => next()); });
  app.get('/api/health', (_req, res) => res.json({ ok: true, data: { status: 'up' } }));
  app.use('/api', publicRouter(ctx), adminRouter(ctx));
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'NOT_FOUND', '존재하지 않는 API입니다.')));
  // 관리자 화면 주소는 /admin 이다. 예전 주소(/admin.html)로 오면 새 주소로 넘긴다.
  app.get('/admin.html', (_req, res) => res.redirect(301, '/admin'));
  app.get('/admin', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(path.join(opt.publicDir, 'admin.html')); });
  // no-cache = 매번 ETag로 재검증(변경 없으면 304). 배포 후 낡은 JS/CSS가 남아 화면이 어긋나는 것을 막는다.
  app.use(express.static(opt.publicDir, { setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') }));

  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    let e: AppError;
    if (err instanceof AppError) e = err;
    else if (err instanceof multer.MulterError) e = err.code === 'LIMIT_FILE_SIZE' ? new AppError(413, 'PAYLOAD_TOO_LARGE', '사진은 장당 10MB 이하여야 합니다.') : new AppError(400, 'BAD_REQUEST', '잘못된 업로드 요청입니다.');
    else if ((err as { type?: string })?.type === 'entity.parse.failed') e = new AppError(400, 'BAD_REQUEST', '잘못된 JSON 요청입니다.');
    else if ((err as { type?: string })?.type === 'entity.too.large') e = new AppError(413, 'PAYLOAD_TOO_LARGE', '요청이 너무 큽니다.');
    else { console.error(err); e = new AppError(500, 'INTERNAL', '서버 오류가 발생했습니다.'); }
    res.status(e.status).json({ ok: false, error: { code: e.code, message: e.message, ...(e.fieldErrors ? { fieldErrors: e.fieldErrors } : {}) } });
  });
  return { app, db, ctx, ready };
}
