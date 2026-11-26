import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(public status: number, public code: string, message: string, public fieldErrors?: Record<string, string>) {
    super(message);
  }
}

// ---- 비밀번호/PIN 해시 (scrypt + timingSafeEqual) ----
export function hashSecret(secret: string): string {
  const salt = crypto.randomBytes(16);
  return `${salt.toString('hex')}:${crypto.scryptSync(secret, salt, 32).toString('hex')}`;
}
export function verifySecret(secret: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const expected = Buffer.from(hashHex, 'hex');
  const actual = crypto.scryptSync(secret, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// ---- 서명 쿠키 (stateless: base64url(payload).hmac) ----
export const COOKIES = { customer: 'fr_customer', lookup: 'fr_lookup', admin: 'fr_admin' } as const;
export type CookieName = (typeof COOKIES)[keyof typeof COOKIES];

/** 현재 시각(ms). 테스트에서 주입해 시간 의존 로직을 결정적으로 검증한다. */
export type Clock = () => number;

export class Signer {
  constructor(private secret: string, private clock: Clock = Date.now) {}
  sign(payload: object, ttlSec: number): string {
    const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(this.clock() / 1000) + ttlSec })).toString('base64url');
    return `${body}.${this.mac(body)}`;
  }
  verify<T extends object>(token: string | undefined): (T & { exp: number }) | null {
    if (!token) return null;
    const [body, sig] = token.split('.');
    if (!body || !sig) return null;
    const expected = Buffer.from(this.mac(body));
    const given = Buffer.from(sig);
    if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
    try {
      const data = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T & { exp: number };
      return data.exp > this.clock() / 1000 ? data : null;
    } catch { return null; }
  }
  private mac(body: string) { return crypto.createHmac('sha256', this.secret).update(body).digest('base64url'); }
}

export function readCookies(req: Request): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
export function setCookie(res: Response, name: CookieName, value: string, maxAgeSec: number) {
  res.append('Set-Cookie', `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}`);
}
export function clearCookie(res: Response, name: CookieName) { setCookie(res, name, '', 0); }

// ---- 슬라이딩 윈도우 Rate Limiter ----
export function rateLimiter(max: number, windowMs: number, clock: Clock = Date.now) {
  const hits = new Map<string, number[]>();
  return (req: Request, _res: Response, next: NextFunction) => {
    const now = clock();
    const key = req.ip ?? 'unknown';
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    hits.set(key, recent);
    if (recent.length > max) return next(new AppError(429, 'RATE_LIMITED', '요청이 너무 많습니다. 잠시 후 다시 시도해 주세요.'));
    next();
  };
}

/** N회 연속 실패 시 lockMs 동안 잠금 (FN-16, PIN 무차별 대입 방어 공용). */
export class FailureLock {
  private m = new Map<string, { fails: number; until: number }>();
  constructor(private max = 5, private lockMs = 60_000, private clock: Clock = Date.now) {}
  check(key: string) {
    const e = this.m.get(key);
    if (e && e.until > this.clock()) throw new AppError(429, 'AUTH_LOCKED', `시도 횟수를 초과했습니다. ${Math.ceil((e.until - this.clock()) / 1000)}초 후 다시 시도해 주세요.`);
  }
  fail(key: string) {
    const e = this.m.get(key) ?? { fails: 0, until: 0 };
    e.fails = e.until && e.until <= this.clock() ? 1 : e.fails + 1;
    e.until = e.fails >= this.max ? this.clock() + this.lockMs : 0;
    this.m.set(key, e);
  }
  reset(key: string) { this.m.delete(key); }
}

// ---- 날짜 (Asia/Seoul) ----
export function todayKst(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(now); // YYYY-MM-DD
}
export function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));
}
export function dayDiff(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86400000);
}
export const normalizePhone = (v: unknown) => String(v ?? '').replace(/\D/g, '');
export const wrap = (fn: (req: Request, res: Response) => unknown) =>
  (req: Request, res: Response, next: NextFunction) => { try { Promise.resolve(fn(req, res)).catch(next); } catch (e) { next(e); } };
export const ok = <T>(res: Response, data: T, status = 200) => res.status(status).json({ ok: true, data });
