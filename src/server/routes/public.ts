import { Router, type Request } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import multer from 'multer';
import type { Db } from '../db.js';
import {
  AppError, COOKIES, FailureLock, Signer, type Clock, clearCookie, hashSecret, normalizePhone, ok, rateLimiter, readCookies, setCookie, verifySecret, wrap,
} from '../lib.js';
import {
  cancelByCustomer, claimApplication, createApplication, getApplicationByCode, toPublicApplicationDto, type UploadedFile,
} from '../services/applications.js';
import type { ApplicationPayload, CustomerProfileDto } from '../../shared/types.js';

type Row = Record<string, any>;
export interface Ctx { db: Db; signer: Signer; uploadDir: string; clock: Clock }

const CUSTOMER_TTL = 7 * 86400;
const LOOKUP_TTL = 30 * 60;

/** 요청의 인증 맥락. 쿠키는 포털별로 분리되어 서로 영향을 주지 않는다. */
export function authOf(ctx: Ctx, req: Request) {
  const c = readCookies(req);
  const cust = ctx.signer.verify<{ uid: number }>(c[COOKIES.customer]);
  const look = ctx.signer.verify<{ ids: number[] }>(c[COOKIES.lookup]);
  const adm = ctx.signer.verify<{ aid: number }>(c[COOKIES.admin]);
  return { customerId: cust?.uid ?? null, lookupIds: look?.ids ?? [], adminId: adm?.aid ?? null };
}

/** 회원 아이디: 영문 소문자로 시작하는 영문 소문자·숫자 4~20자. 영문자로 시작하므로 숫자뿐인 휴대폰 번호와 겹치지 않는다. */
const USERNAME_RE = /^[a-z][a-z0-9]{3,19}$/;
const profile = (u: Row): CustomerProfileDto => ({
  id: u.id, username: u.username ?? '', name: u.name, phone: u.phone, defaultZipcode: u.default_zipcode, defaultAddress: u.default_address, defaultAddressDetail: u.default_address_detail,
});

const notFoundApp = () => new AppError(404, 'NOT_FOUND', '일치하는 신청 내역을 찾을 수 없습니다.');

export function publicRouter(ctx: Ctx) {
  const { db, signer } = ctx;
  const r = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 60, fields: 10 } });
  const lookupLimit = rateLimiter(20, 60_000, ctx.clock);
  const pinLock = new FailureLock(5, 60_000, ctx.clock);
  const customerUser = (req: Request) => {
    const id = authOf(ctx, req).customerId;
    const u = id ? (db.prepare('SELECT * FROM users WHERE id = ? AND role = ? AND is_active = 1').get(id, 'CUSTOMER') as Row | undefined) : undefined;
    return u ?? null;
  };
  const requireCustomer = (req: Request) => {
    const u = customerUser(req);
    if (!u) throw new AppError(401, 'UNAUTHORIZED', '로그인이 필요합니다.');
    return u;
  };

  r.get('/public/config', wrap((_req, res) => {
    const rows = db.prepare('SELECT key, value FROM site_settings').all() as Row[];
    ok(res, Object.fromEntries(rows.map((x) => [x.key, x.value])));
  }));

  // FN-06/08: 신청 생성 (multipart: payload + photos_{품목index})
  r.post('/applications', rateLimiter(30, 60_000, ctx.clock), upload.any(), wrap((req, res) => {
    let payload: ApplicationPayload;
    try { payload = JSON.parse(String(req.body?.payload ?? '')) as ApplicationPayload; }
    catch { throw new AppError(400, 'BAD_REQUEST', '신청 데이터(payload)가 올바른 JSON이 아닙니다.'); }
    const files: UploadedFile[] = ((req.files as Express.Multer.File[] | undefined) ?? [])
      .map((f) => ({ field: f.fieldname, buffer: f.buffer, originalname: f.originalname }));
    const key = req.header('Idempotency-Key')?.slice(0, 100) || undefined;
    const out = createApplication(db, ctx.uploadDir, payload, files, key, authOf(ctx, req).customerId, new Date(ctx.clock()));
    res.status(out.status).json(out.body);
  }));

  // FN-10: 비회원 PIN 조회. 존재 여부 추측 방지를 위해 실패는 모두 404.
  r.post('/applications/lookup', lookupLimit, wrap((req, res) => {
    const identifier = String(req.body?.identifier ?? '').trim();
    const pin = String(req.body?.pin ?? '');
    const rows = (/^FR-\d{8}-\d{3}$/i.test(identifier)
      ? db.prepare('SELECT * FROM applications WHERE request_code = ?').all(identifier.toUpperCase())
      : db.prepare('SELECT * FROM applications WHERE phone = ? ORDER BY id DESC').all(normalizePhone(identifier))) as Row[];
    const lockKey = `${req.ip}|${identifier.toUpperCase()}`;
    pinLock.check(lockKey);
    const mine = /^\d{4}$/.test(pin) ? rows.filter((a) => verifySecret(pin, a.lookup_pin_hash)) : [];
    if (!mine.length) { pinLock.fail(lockKey); throw notFoundApp(); }
    pinLock.reset(lockKey);
    setCookie(res, COOKIES.lookup, signer.sign({ ids: mine.map((a) => a.id) }, LOOKUP_TTL), LOOKUP_TTL);
    ok(res, { applications: mine.map((a) => toPublicApplicationDto(db, a)) });
  }));

  r.post('/applications/:code/cancel', wrap((req, res) => {
    const app = getApplicationByCode(db, String(req.params.code));
    if (!app) throw notFoundApp();
    const auth = authOf(ctx, req);
    const pin = String(req.body?.pin ?? '');
    const allowed = (auth.customerId !== null && app.user_id === auth.customerId) || auth.lookupIds.includes(app.id) ||
      (/^\d{4}$/.test(pin) && verifySecret(pin, app.lookup_pin_hash));
    if (!allowed) throw notFoundApp();
    cancelByCustomer(db, app, app.applicant_name, String(req.body?.reason ?? '').trim().slice(0, 200));
    ok(res, { requestCode: app.request_code, status: 'CANCELED' });
  }));

  // FN-15: 권한 검증 이미지 스트리밍 — 권한 없으면 존재 여부와 무관하게 404
  r.get('/uploads/:storedName', wrap((req, res) => {
    const name = String(req.params.storedName);
    if (!/^[0-9a-f-]{36}\.(jpg|png|webp)$/.test(name)) throw new AppError(404, 'NOT_FOUND', '파일을 찾을 수 없습니다.');
    const row = db.prepare(`SELECT p.mime_type, a.id AS app_id, a.user_id FROM item_photos p JOIN application_items i ON i.id = p.item_id
      JOIN applications a ON a.id = i.application_id WHERE p.stored_name = ?`).get(name) as Row | undefined;
    const auth = authOf(ctx, req);
    const adminOk = auth.adminId !== null && !!db.prepare("SELECT 1 FROM users WHERE id = ? AND role = 'ADMIN' AND is_active = 1").get(auth.adminId);
    const allowed = !!row && (adminOk || (auth.customerId !== null && row.user_id === auth.customerId) || auth.lookupIds.includes(row.app_id));
    const file = path.join(ctx.uploadDir, name);
    if (!allowed || !fs.existsSync(file)) throw new AppError(404, 'NOT_FOUND', '파일을 찾을 수 없습니다.');
    res.setHeader('Content-Type', row!.mime_type);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    fs.createReadStream(file).pipe(res);
  }));

  // ---- 회원 ----
  r.get('/auth/me', wrap((req, res) => { const u = customerUser(req); ok(res, { user: u ? profile(u) : null }); }));

  r.post('/auth/signup', rateLimiter(10, 60_000, ctx.clock), wrap((req, res) => {
    const phone = normalizePhone(req.body?.phone);
    const username = String(req.body?.username ?? '').trim().toLowerCase();
    const password = String(req.body?.password ?? '');
    const name = String(req.body?.name ?? '').trim().slice(0, 50);
    const f: Record<string, string> = {};
    if (!USERNAME_RE.test(username)) f.username = '아이디는 영문 소문자로 시작하는 영문 소문자·숫자 4~20자로 입력해 주세요.';
    else if (db.prepare('SELECT 1 FROM users WHERE username = ?').get(username)) f.username = '이미 사용 중인 아이디입니다.';
    if (!/^01\d{8,9}$/.test(phone)) f.phone = '올바른 휴대폰 번호를 입력해 주세요.';
    if (password.length < 8) f.password = '비밀번호는 8자 이상이어야 합니다.';
    if (!name) f.name = '이름을 입력해 주세요.';
    if (!f.phone && db.prepare('SELECT 1 FROM users WHERE login_id = ?').get(phone)) f.phone = '이미 가입된 번호입니다.';
    if (Object.keys(f).length) throw new AppError(422, 'VALIDATION_ERROR', '입력값을 확인해 주세요.', f);
    const s = (k: string, n: number) => String(req.body?.[k] ?? '').trim().slice(0, n);
    const id = Number(db.prepare(`INSERT INTO users (role, login_id, username, password_hash, name, phone, default_zipcode, default_address, default_address_detail)
      VALUES ('CUSTOMER', ?, ?, ?, ?, ?, ?, ?, ?)`).run(phone, username, hashSecret(password), name, phone, s('defaultZipcode', 10), s('defaultAddress', 200), s('defaultAddressDetail', 100)).lastInsertRowid);
    setCookie(res, COOKIES.customer, signer.sign({ uid: id }, CUSTOMER_TTL), CUSTOMER_TTL);
    ok(res, { user: profile(db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Row) }, 201);
  }));

  r.post('/auth/login', rateLimiter(20, 60_000, ctx.clock), wrap((req, res) => {
    // identifier에는 아이디나 휴대폰 번호가 온다. phone은 이전 요청 형식이라 그대로 받는다.
    const idf = String(req.body?.identifier ?? req.body?.phone ?? '').trim().toLowerCase();
    const u = (USERNAME_RE.test(idf)
      ? db.prepare("SELECT * FROM users WHERE username = ? AND role = 'CUSTOMER' AND is_active = 1").get(idf)
      : db.prepare("SELECT * FROM users WHERE login_id = ? AND role = 'CUSTOMER' AND is_active = 1").get(normalizePhone(idf))) as Row | undefined;
    if (!u || !verifySecret(String(req.body?.password ?? ''), u.password_hash)) throw new AppError(401, 'UNAUTHORIZED', '아이디(또는 휴대폰 번호)나 비밀번호가 올바르지 않습니다.');
    setCookie(res, COOKIES.customer, signer.sign({ uid: u.id }, CUSTOMER_TTL), CUSTOMER_TTL);
    ok(res, { user: profile(u) });
  }));

  r.post('/auth/logout', wrap((_req, res) => { clearCookie(res, COOKIES.customer); ok(res, { loggedOut: true }); }));

  r.get('/my/applications', wrap((req, res) => {
    const u = requireCustomer(req);
    const rows = db.prepare('SELECT * FROM applications WHERE user_id = ? ORDER BY id DESC').all(u.id) as Row[];
    ok(res, { applications: rows.map((a) => toPublicApplicationDto(db, a)) });
  }));

  r.patch('/my/profile', wrap((req, res) => {
    const u = requireCustomer(req);
    const name = String(req.body?.name ?? '').trim().slice(0, 50);
    if (!name) throw new AppError(422, 'VALIDATION_ERROR', '이름을 입력해 주세요.', { name: '이름을 입력해 주세요.' });
    const s = (k: string, n: number) => String(req.body?.[k] ?? '').trim().slice(0, n);
    db.prepare('UPDATE users SET name = ?, default_zipcode = ?, default_address = ?, default_address_detail = ? WHERE id = ?')
      .run(name, s('defaultZipcode', 10), s('defaultAddress', 200), s('defaultAddressDetail', 100), u.id);
    ok(res, { user: profile(db.prepare('SELECT * FROM users WHERE id = ?').get(u.id) as Row) });
  }));

  // FN-14: 비회원 신청 건 승계
  r.post('/my/claim', rateLimiter(20, 60_000, ctx.clock), wrap((req, res) => {
    const u = requireCustomer(req);
    const app = getApplicationByCode(db, String(req.body?.requestCode ?? '').trim().toUpperCase());
    const pin = String(req.body?.pin ?? '');
    if (!app || !/^\d{4}$/.test(pin) || !verifySecret(pin, app.lookup_pin_hash) || (app.user_id !== null && app.user_id !== u.id)) throw notFoundApp();
    if (app.user_id !== u.id) claimApplication(db, app.id, u.id, u.name);
    ok(res, { claimedRequestCode: app.request_code });
  }));

  return r;
}
